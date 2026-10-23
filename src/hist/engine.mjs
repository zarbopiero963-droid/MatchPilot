// HIST-01a (#34, #99; MP-STA-001, MP-STA-011, MP-MKT-001..003, MP-RPL-003, MP-MTH-003; MP-OWNER-HIST-01A-01): the
// offline deterministic backtest engine. Two phases that never mix:
//   1. decision: for each event, at kickoff minus the lead, the strategy sees only the observations the PIT policy
//      admits (acquired by the decision time) and no outcome;
//   2. settlement: after every decision is fixed, each bet is settled with the result versions of the same provider
//      (DEC-002: the latest validated FINAL available at the outcomes cutoff, its version and provenance recorded) under
//      the MATCH_ODDS rule of the Market Rules Registry (#100). A match with no validated FINAL stays unsettled; no VOID
//      is ever applied (DEC-015, HIST-LINK-01). Every bet is a position of a paper ledger (#99, HIST-LEDGER-01): opened
//      at its decision time with the commission fixed at the fill (DEC-013), settled by settleFromResult; the bet P/L,
//      the metrics and the ledger state in the report all come from the ledger entries, the only P/L path.
// Without any admissible observation the report is INSUFFICIENT_PIT_DATA and carries no bet, P/L, ROI or drawdown.
// The report is canonical JSON with its own SHA-256: the same input, configuration and code give the same bytes.
// Pure module: no database, no network, no clock, no environment.
import {Decimal, ROUNDING, sum} from '../math/decimal.mjs';
import {MATH_CORE_VERSION, ROUNDING_POLICY_VERSION, commissionRate, nonNegative, MathInputError} from '../math/core.mjs';
import {MONEY_STEP} from '../math/money.mjs';
import {LEDGER_VERSION, accountState, createLedger, exposureOf, openPosition} from '../ledger/paper-ledger.mjs';
import {settleFromResult} from '../ledger/settlement.mjs';
import {PIT_POLICY_VERSION} from '../pit/policy.mjs';
import {ADMISSION_VERSION, admitObservation, decisionTimeOf} from './admission.mjs';
import {HistInputError, INPUT_VERSION, SELECTIONS_1X2, canonicalJson, sha256, validateInput} from './contract.mjs';
import {STRATEGIES} from './strategies.mjs';
import {getMarketRule} from '../markets/rules.mjs';
import {resolveVersioned, resultVersion} from '../markets/outcomes.mjs';

export const ENGINE_VERSION = 'mp-hist-engine-3';
export const REPORT_VERSION = 'mp-hist-report-3';
// The 1X2 outcome rule is the registry's MATCH_ODDS rule (DEC-006: no duplicate resolver); the report records its id.
export const OUTCOME_RULE_VERSION = getMarketRule('MATCH_ODDS').market_rule_id;
// `status` is the technical result of the run; it never says anything about the data. Whether the data are certified
// is the separate `certification` block (owner decision on PR #178 NB-2): a technically OK run is not VERIFIED data.
export const STATUS = Object.freeze({OK: 'OK', INSUFFICIENT_PIT_DATA: 'INSUFFICIENT_PIT_DATA', INSUFFICIENT_OUTCOMES: 'INSUFFICIENT_OUTCOMES'});
export const REAL_DATA_VERDICT = Object.freeze({NOT_APPLICABLE: 'NOT_APPLICABLE', NOT_VERIFIED: 'NOT_VERIFIED'});

// HIST-01a has no certification path: a fixture can never certify real data, and a real dataset stays NOT_VERIFIED
// until a certification exists. No input or configuration can change this block.
function certificationOf(kind) {
  return kind === 'FIXTURE'
    ? {data_scope: 'FIXTURE', real_data_verdict: REAL_DATA_VERDICT.NOT_APPLICABLE, certified: false,
      notice: 'Synthetic fixture: the figures test the engine and are not a real return.'}
    : {data_scope: 'REAL', real_data_verdict: REAL_DATA_VERDICT.NOT_VERIFIED, certified: false,
      notice: 'Real data, not verified: a technically OK run is not a certification and makes no claim of return.'};
}
const ROI_PLACES = 4;

export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const byte = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const key = (provider, eventId) => `${provider}\u0000${eventId}`;
// Counters keyed by reason: prototype-free, so a reason such as __proto__ is counted like any other.
const counter = () => Object.create(null);
const count = (map, name) => { map[name] = (map[name] ?? 0) + 1; };
const sorted = map => Object.fromEntries(Object.keys(map).sort().map(name => [name, map[name]]));
const cents = value => value.roundToStep(MONEY_STEP, ROUNDING.HALF_EVEN);

export function validateConfig(config, strategies = STRATEGIES) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new HistInputError('config', 'must be an object');
  const required = ['strategy', 'bookmaker', 'lead_minutes', 'stake', 'commission'];
  // outcomes_as_of (optional): the cutoff of the result versions used to settle (DEC-002 asOf). Without it, every
  // version in the input is available.
  const allowed = [...required, 'outcomes_as_of'];
  for (const name of Object.keys(config)) if (!allowed.includes(name)) throw new HistInputError(`config.${name}`, 'unknown field');
  for (const name of required) if (!Object.hasOwn(config, name)) throw new HistInputError(`config.${name}`, 'is required');
  let outcomesAsOf = null;
  if (Object.hasOwn(config, 'outcomes_as_of')) {
    const t = typeof config.outcomes_as_of === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(config.outcomes_as_of) ? Date.parse(config.outcomes_as_of) : NaN;
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 19) !== config.outcomes_as_of.slice(0, 19)) throw new HistInputError('config.outcomes_as_of', 'must be a UTC instant (YYYY-MM-DDTHH:MM:SS[.mmm]Z)');
    outcomesAsOf = new Date(t).toISOString();
  }
  if (typeof config.strategy !== 'string' || !Object.hasOwn(strategies, config.strategy)) throw new HistInputError('config.strategy', 'unknown strategy');
  if (typeof config.bookmaker !== 'string' || !/^[\w.:\-/]{1,200}$/.test(config.bookmaker)) throw new HistInputError('config.bookmaker', 'must be an identifier');
  if (!Number.isSafeInteger(config.lead_minutes) || config.lead_minutes < 1 || config.lead_minutes > 1440) throw new HistInputError('config.lead_minutes', 'must be an integer from 1 to 1440');
  let stake, commission;
  try {
    stake = nonNegative('config.stake', config.stake);
    if (stake.isZero()) throw new MathInputError('config.stake', 'must be positive');
    commission = commissionRate('config.commission', config.commission);
  } catch (error) {
    if (error instanceof MathInputError) throw new HistInputError(error.field, error.message.replace(/^[^:]*: /, ''));
    throw error;
  }
  const normalized = {strategy: config.strategy, bookmaker: config.bookmaker, lead_minutes: config.lead_minutes,
    stake: stake.toString(), commission: commission.toString(), ...(outcomesAsOf ? {outcomes_as_of: outcomesAsOf} : {})};
  return {...normalized, settings_snapshot_id: sha256(canonicalJson(normalized)), commission_rate_used: commission.toString()};
}

const VIEW_FIELDS = ['provider', 'event_id', 'home', 'away', 'kickoff_utc', 'decision_time', 'odds'];
// Read by JSON.stringify and by promise checks; they are absent and read as undefined.
const PROTOCOL_FIELDS = ['toJSON', 'then'];

// The decision view: frozen, and any field it does not carry (an outcome, a score) throws instead of reading undefined,
// so a strategy that tries to look at the result fails loudly.
function decisionView(event, decisionTime, odds) {
  const view = Object.freeze({provider: event.provider, event_id: event.event_id, home: event.home, away: event.away,
    kickoff_utc: event.kickoff_utc, decision_time: decisionTime, odds: Object.freeze(Object.fromEntries(Object.entries(odds).map(([s, o]) => [s, Object.freeze({...o})])))});
  return new Proxy(view, {
    get(target, property, receiver) {
      if (typeof property === 'string' && !VIEW_FIELDS.includes(property) && !PROTOCOL_FIELDS.includes(property)) {
        throw new EngineError('VIEW_FIELD_NOT_AVAILABLE', `the decision view has no ${property}: outcomes are not visible before settlement`);
      }
      return Reflect.get(target, property, receiver);
    },
  });
}

// The result versions of a bet's event are resolved by the registry's MATCH_ODDS rule through resolveVersioned (DEC-002):
// the latest validated FINAL acquired by the cutoff, flagged when it corrects an earlier FINAL. Only versions of the same
// provider and event as the odds are read, and only those acquired at or after the kickoff (a final result cannot be
// known before the match). Otherwise the bet stays unsettled (N/D) with the reason; a VOID is never applied (DEC-015).
const OUTCOME_PROVIDERS = new Set(['futpythontrader', 'totalcorner']);
function resolveOutcome(versions, event, selection, asOf) {
  if (!versions?.length) return {result: null, reason: 'OUTCOME_MISSING'};
  if (!OUTCOME_PROVIDERS.has(event.provider)) return {result: null, reason: 'OUTCOME_PROVIDER_UNSUPPORTED'};
  const known = versions.filter(v => Date.parse(v.acquired_at) >= Date.parse(event.kickoff_utc));
  const ignored = versions.length - known.length;
  // A void declared before the match (a cancellation announced in advance) keeps its own reason.
  if (!known.length) return {result: null, reason: versions.some(v => v.void_declared) ? 'VOID_NO_APPROVED_RULE' : 'OUTCOME_ACQUIRED_BEFORE_KICKOFF', ignored};
  const resultVersions = known.map(v => resultVersion({provider: v.provider, version: v.version, acquired_at: v.acquired_at,
    provenance: v.provenance, final: v.status === 'FINAL', home: v.home_score, away: v.away_score, providerStatus: v.void_declared ? 'VOID' : v.status}));
  const res = resolveVersioned({marketType: 'MATCH_ODDS', selection, asOf, versions: resultVersions});
  if (res.status !== 'RESOLVED') {
    const latest = known.filter(v => Date.parse(v.acquired_at) <= Date.parse(asOf)).at(-1);
    return {result: null, reason: latest?.void_declared ? 'VOID_NO_APPROVED_RULE' : res.reason, ignored};
  }
  return {result: res.winning_selection, outcome: res.outcome, reason: null, ignored, resultVersions,
    resolution: {market_rule_id: res.market_rule_id, outcome_version: res.outcome_version, provenance: res.provenance, recorded_at: res.recorded_at,
      corrected: res.corrected, ...(res.corrected ? {first_final_version: res.first_final_version, first_final_outcome: res.first_final_outcome} : {})}};
}

const LIMITS = [
  'Offline engine test: no liquidity, matching, slippage or execution is modelled.',
  'Each bet is a paper-ledger position (#99) funded by a notional allocation equal to the sum of the bets exposures: it is not a bankroll, and no money management is applied.',
  'Commission is charged by the ledger on each position positive net winnings at the rate fixed at the fill, rounded to the cent (DEC-013).',
  'Decisions use only observations acquired by the decision time (captured knowledge, mp-pit-v1).',
  'Settlement uses only result versions of the same provider as the odds; cross-provider mappings are not used.',
  'Results: the latest validated FINAL acquired by the outcomes cutoff (DEC-002); a corrected result is flagged on the bet. Results are read after the decisions and are not point-in-time features.',
  'No VOID rule is approved (DEC-015): void, postponed or unfinished matches stay unsettled.',
  'Metrics cover settled bets only; unsettled bets (missing or non-final result, result acquired before kickoff) are counted in counts.unsettled_by_reason and excluded, which can bias the metrics.',
  'No claim of profitability or reliability (MP-STA-012); the data verdict is in the certification block.',
];

export function runBacktest(rawInput, rawConfig, {strategies = STRATEGIES, codeVersion = null} = {}) {
  const input = validateInput(rawInput);
  const config = validateConfig(rawConfig, strategies);
  const strategy = strategies[config.strategy];
  const inputSha256 = sha256(canonicalJson(input));

  // ---- Admission ----
  const events = new Map(input.events.map(event => [key(event.provider, event.event_id), event]));
  const excluded = counter();
  const usable = new Map();
  let admitted = 0, usableCount = 0;
  for (const observation of input.observations) {
    const event = events.get(key(observation.provider, observation.event_id));
    const verdict = admitObservation(observation, event, config.lead_minutes);
    if (!verdict.admitted) {
      for (const reason of verdict.reasons.length ? verdict.reasons : [verdict.pit?.status ?? 'NOT_ADMITTED']) count(excluded, reason);
      continue;
    }
    admitted++;
    if (observation.bookmaker !== config.bookmaker) continue;
    usableCount++;
    const eventKey = key(observation.provider, observation.event_id);
    if (!usable.has(eventKey)) usable.set(eventKey, []);
    usable.get(eventKey).push(observation);
  }

  // ---- Decision phase (no outcome is read here) ----
  const ordered = input.events.map(event => ({event, decisionTime: decisionTimeOf(event.kickoff_utc, config.lead_minutes)}))
    .sort((a, b) => byte(a.decisionTime ?? '~', b.decisionTime ?? '~') || byte(a.event.provider, b.event.provider) || byte(a.event.event_id, b.event.event_id));
  const decisions = {BACK: 0, NO_TRADE: 0};
  const noTrade = counter();
  const bets = [];
  for (const {event, decisionTime} of ordered) {
    if (!decisionTime) { decisions.NO_TRADE++; count(noTrade, 'KICKOFF_UNKNOWN'); continue; }
    // The latest admitted price of each selection: by acquisition time, then observation id (byte order).
    // Prototype-free, so nothing planted on Object.prototype can stand in for a missing or older price.
    const latest = Object.create(null);
    for (const observation of usable.get(key(event.provider, event.event_id)) ?? []) {
      const current = latest[observation.selection];
      if (!current || byte(current.acquired_at, observation.acquired_at) < 0
        || (current.acquired_at === observation.acquired_at && byte(current.observation_id, observation.observation_id) < 0)) {
        latest[observation.selection] = observation;
      }
    }
    const odds = Object.fromEntries(SELECTIONS_1X2.filter(selection => latest[selection]).map(selection => [selection,
      {odds: latest[selection].odds, observation_id: latest[selection].observation_id, acquired_at: latest[selection].acquired_at}]));
    // Each field of the decision is read once, so a getter cannot pass the check with one value and bet with another.
    const decision = strategy(decisionView(event, decisionTime, odds));
    const action = decision?.action;
    const reason = decision?.reason;
    const selection = decision?.selection;
    if (action === 'NO_TRADE' && typeof reason === 'string' && reason) {
      decisions.NO_TRADE++;
      count(noTrade, reason);
      continue;
    }
    if (action !== 'BACK' || typeof selection !== 'string' || !Object.hasOwn(odds, selection)) {
      throw new EngineError('BAD_STRATEGY_DECISION', `strategy ${config.strategy} returned an invalid decision for ${event.event_id}`);
    }
    decisions.BACK++;
    bets.push({provider: event.provider, event_id: event.event_id, decision_time: decisionTime, side: 'BACK', selection,
      odds: odds[selection].odds, observation_id: odds[selection].observation_id, acquired_at: odds[selection].acquired_at, stake: config.stake});
  }

  const report = {
    report_version: REPORT_VERSION,
    certification: certificationOf(input.dataset.kind),
    dataset: {...input.dataset, input_sha256: inputSha256},
    code_version: codeVersion,
    config,
    versions: {engine: ENGINE_VERSION, input: INPUT_VERSION, admission: ADMISSION_VERSION, pit_policy: PIT_POLICY_VERSION,
      strategy: config.strategy, outcome_rule: OUTCOME_RULE_VERSION, math_core: MATH_CORE_VERSION, rounding: ROUNDING_POLICY_VERSION},
    counts: {events: input.events.length, observations: input.observations.length, admitted, usable: usableCount,
      excluded_by_reason: sorted(excluded), decisions, no_trade_by_reason: sorted(noTrade)},
    limits: LIMITS,
  };

  if (usableCount === 0) {
    // No admissible observation for the configured bookmaker: nothing was decided on data, so nothing is simulated.
    return seal({...report, status: STATUS.INSUFFICIENT_PIT_DATA, counts: {...report.counts, decisions: {BACK: 0, NO_TRADE: report.counts.decisions.NO_TRADE}},
      bets: [], metrics: null});
  }

  // ---- Settlement phase: decisions are fixed; outcomes are read only now ----
  const outcomes = new Map();
  for (const version of input.outcomes) {
    const k = key(version.provider, version.event_id);
    if (!outcomes.has(k)) outcomes.set(k, []);
    outcomes.get(k).push(version);
  }
  // DEC-002 asOf: the configured cutoff, else the latest acquisition in the input (every version available); none when
  // the input has no result at all (every bet is then OUTCOME_MISSING and nothing is resolved).
  const asOf = config.outcomes_as_of ?? input.outcomes.reduce((latest, v) => (latest === null || byte(latest, v.acquired_at) < 0 ? v.acquired_at : latest), null);
  report.settlement_policy = {outcomes_as_of: asOf, outcomes_as_of_source: config.outcomes_as_of ? 'CONFIG' : asOf ? 'LATEST_IN_INPUT' : 'NO_OUTCOMES',
    void_policy: 'NONE_APPROVED (DEC-015)'};
  const unsettled = counter();
  let ignoredBeforeKickoff = 0;
  // The paper ledger of the run: one position per bet, opened in decision order at its decision time.
  const legOf = bet => ({side: bet.side, odds: Decimal.from(bet.odds), stake: Decimal.from(bet.stake)});
  const allocation = sum(bets.map(bet => exposureOf([legOf(bet)])));
  const ledger = bets.length ? createLedger({accountId: `hist:${config.settings_snapshot_id}`, initialAllocation: allocation.toString(), at: bets[0].decision_time}) : null;
  // Position id: the provider's length prefix makes it unambiguous although ids may contain ':' (review B-1).
  const positionOf = bet => `hist:${bet.provider.length}:${bet.provider}:${bet.event_id}`;
  for (const bet of bets) {
    openPosition(ledger, {mode: 'ACTIVE_OPERATIONAL', positionId: positionOf(bet), side: bet.side, odds: bet.odds, stake: bet.stake,
      commissionRate: config.commission, settingsSnapshotId: config.settings_snapshot_id, idempotencyKey: `open:${positionOf(bet)}`,
      at: bet.decision_time, market: {marketType: 'MATCH_ODDS', selection: bet.selection}});
  }
  const entry = seq => ledger.entries[seq - 1];
  const settledBets = bets.map(bet => {
    const event = events.get(key(bet.provider, bet.event_id));
    const {result, outcome, reason, resolution, resultVersions, ignored = 0} = resolveOutcome(outcomes.get(key(bet.provider, bet.event_id)), event, bet.selection, asOf);
    ignoredBeforeKickoff += ignored;
    if (!result) { count(unsettled, reason); return {...bet, position_id: positionOf(bet), settlement: null}; }
    const done = settleFromResult(ledger, {positionId: positionOf(bet), versions: resultVersions, asOf, at: resolution.recorded_at});
    // The ledger resolves the same versions with the same rule: any disagreement is a defect, never a silent choice.
    if (done.status !== 'SETTLED' || done.outcome !== outcome || done.resolution.outcome_version !== resolution.outcome_version)
      throw new EngineError('LEDGER_MISMATCH', `${positionOf(bet)}: engine ${outcome} v${resolution.outcome_version}, ledger ${done.status} ${done.outcome}`);
    const [gross, commission, net] = done.entries.map(entry);
    return {...bet, position_id: positionOf(bet), settlement: {result, outcome, gross: gross.amount, commission: commission.amount, net: net.net,
      ledger_entries: done.entries, resolution}};
  });
  if (ledger) {
    const state = accountState(ledger);
    report.ledger = {ledger_version: LEDGER_VERSION, account_id: ledger.account_id, notional_allocation: allocation.toString(),
      entries: ledger.entries.length, entries_sha256: sha256(canonicalJson(ledger.entries)),
      state: {cash_balance: state.cash_balance, realized_pnl: state.realized_pnl, settled_commission: state.settled_commission,
        reserved_funds: state.reserved_funds, open_position_count: state.open_position_count, reconciled: state.reconciled}};
  }
  const settled = settledBets.filter(bet => bet.settlement);
  // Result versions of the bets' events acquired before the kickoff: a final cannot be known then, so they are ignored,
  // and counted (an ignored version can hide a correction of the first final).
  const base = {...report, bets: settledBets, counts: {...report.counts, settled: settled.length, unsettled_by_reason: sorted(unsettled),
    result_versions_ignored_before_kickoff: ignoredBeforeKickoff}};
  if (bets.length > 0 && settled.length === 0) return seal({...base, status: STATUS.INSUFFICIENT_OUTCOMES, metrics: null});
  // No bet at all (every event NO_TRADE): a valid outcome (MP-STA-011), with no metric rather than a row of zeros.
  return seal({...base, status: STATUS.OK, metrics: settled.length ? metricsOf(settled) : null});
}

// Totals of the settled bets in decision order: P/L, ROI on the stake at risk, maximum drawdown of the cumulative net.
function metricsOf(settled) {
  const gross = sum(settled.map(bet => Decimal.from(bet.settlement.gross)));
  const commission = sum(settled.map(bet => Decimal.from(bet.settlement.commission)));
  const net = gross.sub(commission);
  const staked = sum(settled.map(bet => Decimal.from(bet.stake)));
  let cumulative = Decimal.zero(), peak = Decimal.zero(), drawdown = Decimal.zero();
  for (const bet of settled) {
    cumulative = cumulative.add(Decimal.from(bet.settlement.net));
    if (cumulative.gt(peak)) peak = cumulative;
    if (peak.sub(cumulative).gt(drawdown)) drawdown = peak.sub(cumulative);
  }
  const outcomes = name => settled.filter(bet => bet.settlement.outcome === name).length;
  const roi = staked.isZero() ? null : net.div(staked);
  return {
    unit: 'stake units',
    bets: settled.length, won: outcomes('WIN'), lost: outcomes('LOSE'), corrected_results: settled.filter(bet => bet.settlement.resolution.corrected).length,
    staked: staked.toString(), pl_gross: gross.toString(), commission: commission.toString(), pl_net: net.toString(),
    roi: roi ? roi.toString() : null, max_drawdown: drawdown.toString(),
    rounded: {pl_gross: cents(gross).toString(2), commission: cents(commission).toString(2), pl_net: cents(gross).sub(cents(commission)).toString(2),
      roi: roi ? roi.round(ROI_PLACES, ROUNDING.HALF_EVEN).toString(ROI_PLACES) : null, max_drawdown: cents(drawdown).toString(2),
      step: MONEY_STEP, mode: ROUNDING.HALF_EVEN, roi_places: ROI_PLACES},
  };
}

// The report's SHA-256 over its canonical JSON without the hash itself.
function seal(report) {
  const body = JSON.parse(JSON.stringify(report));
  return {...body, report_sha256: sha256(canonicalJson(body))};
}
