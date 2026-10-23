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
import {MMError, createProfile, evaluate} from '../mm/money-management.mjs';
import {PIT_POLICY_VERSION} from '../pit/policy.mjs';
import {ADMISSION_VERSION, admitObservation, decisionTimeOf} from './admission.mjs';
import {HistInputError, INPUT_VERSION, SELECTIONS_1X2, canonicalJson, sha256, validateInput} from './contract.mjs';
import {STRATEGIES} from './strategies.mjs';
import {STRATEGY_DEF_VERSION, compileDefinition, definitionId, normalizeDefinition} from './strategy-def.mjs';
import {getMarketRule} from '../markets/rules.mjs';
import {resolveVersioned, resultVersion} from '../markets/outcomes.mjs';

export const ENGINE_VERSION = 'mp-hist-engine-6';
export const REPORT_VERSION = 'mp-hist-report-6';
// HIST-PG-01 (owner mandate MP-AUTONOMOUS-AUTOMERGE-20261023): PIT is the default; NON_PIT_RESEARCH is an explicitly
// labelled research and testing mode that also uses prices acquired after the decision time. It is never a PIT backtest
// and never evidence of real profitability; the certification block and the limits say so on every report.
export const PIT_MODES = Object.freeze(['PIT', 'NON_PIT_RESEARCH']);
// HIST-LAY-01: a strategy may BACK or LAY the selection it picks; the engine takes the price from the view either way.
export const SIDES = Object.freeze(['BACK', 'LAY']);
// The 1X2 outcome rule is the registry's MATCH_ODDS rule (DEC-006: no duplicate resolver); the report records its id.
export const OUTCOME_RULE_VERSION = getMarketRule('MATCH_ODDS').market_rule_id;
// `status` is the technical result of the run; it never says anything about the data. Whether the data are certified
// is the separate `certification` block (owner decision on PR #178 NB-2): a technically OK run is not VERIFIED data.
export const STATUS = Object.freeze({OK: 'OK', INSUFFICIENT_PIT_DATA: 'INSUFFICIENT_PIT_DATA', INSUFFICIENT_OUTCOMES: 'INSUFFICIENT_OUTCOMES'});
export const REAL_DATA_VERDICT = Object.freeze({NOT_APPLICABLE: 'NOT_APPLICABLE', NOT_VERIFIED: 'NOT_VERIFIED'});

// HIST-01a has no certification path: a fixture can never certify real data, and a real dataset stays NOT_VERIFIED
// until a certification exists. No input or configuration can change this block.
const NON_PIT_NOTICE = 'NON_PIT research run: prices acquired after the decision time (and decisions by match date when the kickoff is unknown) are used, so the figures are not point-in-time and are no evidence of real profitability.';
function certificationOf(kind, pitMode) {
  const base = certificationOfKind(kind);
  return pitMode === 'PIT' ? {...base, pit_mode: pitMode} : {...base, pit_mode: pitMode, notice: `${base.notice} ${NON_PIT_NOTICE}`};
}
function certificationOfKind(kind) {
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

// The #96 profile of a backtest: an immutable profile id derived from its content.
const mmProfileOf = m => createProfile({profileId: `hist-mm:${sha256(canonicalJson({model: m.model, params: m.params ?? {}, caps: m.caps ?? {}})).slice(0, 16)}`,
  model: m.model, params: m.params ?? {}, caps: m.caps ?? {}});

export function validateConfig(config, strategies = STRATEGIES) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new HistInputError('config', 'must be an object');
  // HIST-MM-01: with money_management the stake comes from the profile, so config.stake is not used and not required.
  // STRAT-CFG-01: a configurable strategy (strategy_definition) takes the place of a registered strategy id.
  const byDefinition = Object.hasOwn(config, 'strategy_definition');
  const required = [...(byDefinition ? [] : ['strategy']), 'bookmaker', 'lead_minutes', 'commission', ...(config.money_management ? [] : ['stake'])];
  // outcomes_as_of (optional): the cutoff of the result versions used to settle (DEC-002 asOf). Without it, every
  // version in the input is available.
  // bankroll (optional): a real starting bankroll for a chronological simulation; money_management (optional, needs
  // bankroll): {model, params, caps} of an IMPLEMENTED #96 model.
  const allowed = [...required, 'stake', 'outcomes_as_of', 'pit_mode', 'bankroll', 'money_management', 'strategy_definition'];
  for (const name of Object.keys(config)) if (!allowed.includes(name)) throw new HistInputError(`config.${name}`, 'unknown field');
  for (const name of required) if (!Object.hasOwn(config, name)) throw new HistInputError(`config.${name}`, 'is required');
  let outcomesAsOf = null;
  if (Object.hasOwn(config, 'outcomes_as_of')) {
    const t = typeof config.outcomes_as_of === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(config.outcomes_as_of) ? Date.parse(config.outcomes_as_of) : NaN;
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 19) !== config.outcomes_as_of.slice(0, 19)) throw new HistInputError('config.outcomes_as_of', 'must be a UTC instant (YYYY-MM-DDTHH:MM:SS[.mmm]Z)');
    outcomesAsOf = new Date(t).toISOString();
  }
  const pitMode = Object.hasOwn(config, 'pit_mode') ? config.pit_mode : 'PIT';
  if (!PIT_MODES.includes(pitMode)) throw new HistInputError('config.pit_mode', `must be one of ${PIT_MODES.join(', ')}`);
  let definition = null;
  if (byDefinition) {
    if (Object.hasOwn(config, 'strategy')) throw new HistInputError('config.strategy', 'is not used with strategy_definition (the definition is the strategy)');
    definition = normalizeDefinition(config.strategy_definition);
  } else if (typeof config.strategy !== 'string' || !Object.hasOwn(strategies, config.strategy)) throw new HistInputError('config.strategy', 'unknown strategy');
  if (typeof config.bookmaker !== 'string' || !/^[\w.:\-/]{1,200}$/.test(config.bookmaker)) throw new HistInputError('config.bookmaker', 'must be an identifier');
  if (!Number.isSafeInteger(config.lead_minutes) || config.lead_minutes < 1 || config.lead_minutes > 1440) throw new HistInputError('config.lead_minutes', 'must be an integer from 1 to 1440');
  let stake = null, commission, bankroll = null;
  try {
    if (Object.hasOwn(config, 'stake')) {
      stake = nonNegative('config.stake', config.stake);
      if (stake.isZero()) throw new MathInputError('config.stake', 'must be positive');
    }
    commission = commissionRate('config.commission', config.commission);
    if (Object.hasOwn(config, 'bankroll')) {
      bankroll = nonNegative('config.bankroll', config.bankroll);
      if (bankroll.isZero()) throw new MathInputError('config.bankroll', 'must be positive');
    }
  } catch (error) {
    if (error instanceof MathInputError) throw new HistInputError(error.field, error.message.replace(/^[^:]*: /, ''));
    throw error;
  }
  let mm = null;
  if (Object.hasOwn(config, 'money_management')) {
    if (!bankroll) throw new HistInputError('config.money_management', 'needs config.bankroll');
    // The stake comes from the profile: a config.stake would be ignored, so it is refused rather than snapshotted.
    if (Object.hasOwn(config, 'stake')) throw new HistInputError('config.stake', 'is not used with money_management (the profile sizes the stake)');
    const m = config.money_management;
    if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).some(k => !['model', 'params', 'caps'].includes(k)))
      throw new HistInputError('config.money_management', 'must be {model, params, caps}');
    try { mmProfileOf(m); } catch (error) {
      if (error instanceof MMError) throw new HistInputError('config.money_management', `${error.code}: ${error.message}`);
      throw error;
    }
    // Per-scope caps need scope ids the backtest does not assign, so evaluate() would BLOCK every bet: refused here.
    const scoped = Object.keys(m.caps ?? {}).filter(k => k.startsWith('max_exposure_per_'));
    if (scoped.length) throw new HistInputError('config.money_management', `caps ${scoped.join(', ')} need scope ids the backtest does not assign`);
    mm = JSON.parse(canonicalJson({model: m.model, params: m.params ?? {}, caps: m.caps ?? {}}));
  }
  const normalized = {strategy: definition ? definitionId(definition) : config.strategy, ...(definition ? {strategy_definition: definition} : {}), bookmaker: config.bookmaker, lead_minutes: config.lead_minutes,
    ...(stake ? {stake: stake.toString()} : {}), commission: commission.toString(), ...(bankroll ? {bankroll: bankroll.toString()} : {}), ...(mm ? {money_management: mm} : {}), ...(outcomesAsOf ? {outcomes_as_of: outcomesAsOf} : {}),
    ...(pitMode === 'PIT' ? {} : {pit_mode: pitMode})};
  return {...normalized, pit_mode: pitMode, settings_snapshot_id: sha256(canonicalJson(normalized)), commission_rate_used: commission.toString()};
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
  // Without a kickoff (reachable only in NON_PIT_RESEARCH) no version can be placed before the match: none is dropped,
  // and the bet records that the kickoff filter was not applied.
  const known = event.kickoff_utc ? versions.filter(v => Date.parse(v.acquired_at) >= Date.parse(event.kickoff_utc)) : versions;
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
  'Each bet is a paper-ledger position (#99). Without a configured bankroll the ledger is funded by a notional allocation equal to the sum of the bets exposures (not a bankroll, no money management); with one, the run is chronological and bets are settled when their result is known.',
  'Commission is charged by the ledger on each position positive net winnings at the rate fixed at the fill, rounded to the cent (DEC-013).',
  'PIT_LIMIT',
  'Settlement uses only result versions of the same provider as the odds; cross-provider mappings are not used.',
  'Results: the latest validated FINAL acquired by the outcomes cutoff (DEC-002); a corrected result is flagged on the bet. Results are read after the decisions and are not point-in-time features.',
  'No VOID rule is approved (DEC-015): void, postponed or unfinished matches stay unsettled.',
  'Metrics cover settled bets only; unsettled bets (missing or non-final result, result acquired before kickoff) are counted in counts.unsettled_by_reason and excluded, which can bias the metrics.',
  'No claim of profitability or reliability (MP-STA-012); the data verdict is in the certification block.',
];

const PIT_LIMITS = {PIT: 'Decisions use only observations acquired by the decision time (captured knowledge, mp-pit-v1).',
  NON_PIT_RESEARCH: 'NON_PIT research: decisions also use prices acquired after the decision time, and events without a kickoff are decided by match date; the figures are exploratory, not point-in-time.'};
const limitsOf = pitMode => LIMITS.map(limit => (limit === 'PIT_LIMIT' ? PIT_LIMITS[pitMode] : limit));

export function runBacktest(rawInput, rawConfig, {strategies = STRATEGIES, codeVersion = null} = {}) {
  const input = validateInput(rawInput);
  const config = validateConfig(rawConfig, strategies);
  const nonPit = config.pit_mode === 'NON_PIT_RESEARCH';
  const strategy = config.strategy_definition ? compileDefinition(config.strategy_definition) : strategies[config.strategy];
  const inputSha256 = sha256(canonicalJson(input));

  // ---- Admission ----
  const events = new Map(input.events.map(event => [key(event.provider, event.event_id), event]));
  const excluded = counter();
  const usable = new Map();
  let admitted = 0, usableCount = 0;
  // NON_PIT_RESEARCH admits what PIT refuses, and counts each PIT reason it overrode.
  const overridden = counter();
  for (const observation of input.observations) {
    const event = events.get(key(observation.provider, observation.event_id));
    const verdict = admitObservation(observation, event, config.lead_minutes);
    if (!verdict.admitted && nonPit) {
      for (const reason of verdict.reasons.length ? verdict.reasons : [verdict.pit?.status ?? 'NOT_ADMITTED']) count(overridden, reason);
    } else if (!verdict.admitted) {
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
  // Order of the decisions: the decision time; in NON_PIT_RESEARCH an event without a kickoff is decided on its match
  // date, ordered at the start of that date (an ordering key only, never reported as an instant).
  const ordered = input.events.map(event => {
    const decisionTime = decisionTimeOf(event.kickoff_utc, config.lead_minutes);
    const byDate = !decisionTime && nonPit && event.match_date;
    return {event, decisionTime, basis: decisionTime ? 'KICKOFF_MINUS_LEAD' : byDate ? 'MATCH_DATE_NON_PIT' : null,
      order: decisionTime ?? (byDate ? `${event.match_date}T00:00:00.000Z` : null)};
  }).sort((a, b) => byte(a.order ?? '~', b.order ?? '~') || byte(a.event.provider, b.event.provider) || byte(a.event.event_id, b.event.event_id));
  const decisions = {BACK: 0, LAY: 0, NO_TRADE: 0};
  const noTrade = counter();
  const bets = [];
  for (const {event, decisionTime, basis} of ordered) {
    if (!basis) { decisions.NO_TRADE++; count(noTrade, 'KICKOFF_UNKNOWN'); continue; }
    // The latest admitted price of each selection: by acquisition time, then observation id (byte order).
    // Prototype-free, so nothing planted on Object.prototype can stand in for a missing or older price.
    const latest = Object.create(null);
    for (const observation of usable.get(key(event.provider, event.event_id)) ?? []) {
      const current = latest[observation.selection];
      if (!current || byte(current.acquired_at ?? '', observation.acquired_at ?? '') < 0
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
    if (!SIDES.includes(action) || typeof selection !== 'string' || !Object.hasOwn(odds, selection)) {
      throw new EngineError('BAD_STRATEGY_DECISION', `strategy ${config.strategy} returned an invalid decision for ${event.event_id}`);
    }
    decisions[action]++;
    bets.push({provider: event.provider, event_id: event.event_id, decision_time: decisionTime, decision_basis: basis,
      ...(basis === 'MATCH_DATE_NON_PIT' ? {match_date: event.match_date} : {}), side: action, selection,
      odds: odds[selection].odds, observation_id: odds[selection].observation_id, acquired_at: odds[selection].acquired_at, stake: config.stake});
  }

  const report = {
    report_version: REPORT_VERSION,
    certification: certificationOf(input.dataset.kind, config.pit_mode),
    dataset: {...input.dataset, input_sha256: inputSha256},
    code_version: codeVersion,
    config,
    versions: {engine: ENGINE_VERSION, input: INPUT_VERSION, admission: ADMISSION_VERSION, pit_policy: PIT_POLICY_VERSION,
      strategy: config.strategy, ...(config.strategy_definition ? {strategy_definition: STRATEGY_DEF_VERSION} : {}), outcome_rule: OUTCOME_RULE_VERSION, math_core: MATH_CORE_VERSION, rounding: ROUNDING_POLICY_VERSION},
    counts: {events: input.events.length, observations: input.observations.length, admitted, usable: usableCount,
      excluded_by_reason: sorted(excluded), ...(nonPit ? {pit_exclusions_overridden: sorted(overridden)} : {}), decisions, no_trade_by_reason: sorted(noTrade)},
    limits: limitsOf(config.pit_mode),
  };

  if (usableCount === 0) {
    // No admissible observation for the configured bookmaker: nothing was decided on data, so nothing is simulated.
    return seal({...report, status: STATUS.INSUFFICIENT_PIT_DATA, counts: {...report.counts, decisions: {BACK: 0, LAY: 0, NO_TRADE: report.counts.decisions.NO_TRADE}},
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
  // Position id: the provider's length prefix makes it unambiguous although ids may contain ':' (review B-1).
  const positionOf = bet => `hist:${bet.provider.length}:${bet.provider}:${bet.event_id}`;
  const legOf = bet => ({side: bet.side, odds: Decimal.from(bet.odds), stake: Decimal.from(bet.stake)});
  const orderOf = bet => bet.decision_time ?? `${bet.match_date}T00:00:00.000Z`;
  // Each bet is resolved once (its decision is already fixed). knownAt is when its result is known: the acquisition of
  // the settling version; in NON_PIT_RESEARCH a match without kickoff is taken as known at the end of its match date.
  const plans = bets.map(bet => {
    const event = events.get(key(bet.provider, bet.event_id));
    const r = resolveOutcome(outcomes.get(key(bet.provider, bet.event_id)), event, bet.selection, asOf);
    ignoredBeforeKickoff += r.ignored ?? 0;
    const knownAt = !r.result ? null : event.kickoff_utc ? r.resolution.recorded_at : `${bet.match_date}T23:59:59.999Z`;
    return {bet, event, r, knownAt};
  });
  let ledger = null;
  const entry = seq => ledger.entries[seq - 1];
  const open = bet => openPosition(ledger, {mode: 'ACTIVE_OPERATIONAL', positionId: positionOf(bet), side: bet.side, odds: bet.odds, stake: bet.stake,
    commissionRate: config.commission, settingsSnapshotId: config.settings_snapshot_id, idempotencyKey: `open:${positionOf(bet)}`,
    at: bet.decision_time ?? bet.match_date, market: {marketType: 'MATCH_ODDS', selection: bet.selection}});
  const settle = ({bet, event, r: {result, outcome, reason, resolution, resultVersions}}) => {
    if (!result) { count(unsettled, reason); return {...bet, position_id: positionOf(bet), settlement: null}; }
    const done = settleFromResult(ledger, {positionId: positionOf(bet), versions: resultVersions, asOf, at: resolution.recorded_at});
    // The ledger resolves the same versions with the same rule: any disagreement is a defect, never a silent choice.
    if (done.status !== 'SETTLED' || done.outcome !== outcome || done.resolution.outcome_version !== resolution.outcome_version)
      throw new EngineError('LEDGER_MISMATCH', `${positionOf(bet)}: engine ${outcome} v${resolution.outcome_version}, ledger ${done.status} ${done.outcome}`);
    const [gross, commission, net] = done.entries.map(entry);
    // outcome is the selection's (WIN when it won); bet_result is the bettor's, which a LAY inverts.
    const betResult = Decimal.from(gross.amount).gt(0) ? 'WON' : Decimal.from(gross.amount).isNegative() ? 'LOST' : 'EVEN';
    return {...bet, position_id: positionOf(bet), settlement: {result, outcome, bet_result: betResult,
      ...(event.kickoff_utc ? {} : {kickoff_filter: 'NOT_APPLIED_KICKOFF_UNKNOWN'}), gross: gross.amount, commission: commission.amount, net: net.net,
      ledger_entries: done.entries, resolution}};
  };
  let settledBets;
  if (!config.bankroll) {
    // Notional mode: one position per bet, all opened in decision order, then settled.
    const allocation = sum(bets.map(bet => exposureOf([legOf(bet)])));
    if (bets.length) ledger = createLedger({accountId: `hist:${config.settings_snapshot_id}`, initialAllocation: allocation.toString(), at: bets[0].decision_time ?? bets[0].match_date});
    for (const bet of bets) open(bet);
    settledBets = plans.map(settle);
    report.ledger = ledger && {notional_allocation: allocation.toString()};
  } else {
    // Bankroll mode (HIST-MM-01): a chronological simulation on a real starting bankroll. Before each decision the bets
    // whose result is known by then are settled, so the stake (fixed, or from the Money Management profile on the
    // ledger's account state) sees exactly the bankroll of that moment and no later result.
    ledger = bets.length ? createLedger({accountId: `hist:${config.settings_snapshot_id}`, initialAllocation: config.bankroll, at: bets[0].decision_time ?? bets[0].match_date}) : null;
    const mmProfile = config.money_management ? mmProfileOf(config.money_management) : null;
    const pending = [], placed = [], mm = {placed: 0, reduced: 0, skipped_by_reason: counter()};
    let peak = Decimal.from(config.bankroll), drawdown = Decimal.zero(), cash = Decimal.from(config.bankroll);
    const settleKnown = until => {
      pending.sort((a, b) => byte(a.knownAt, b.knownAt) || byte(positionOf(a.bet), positionOf(b.bet)));
      while (pending.length && (until === null || byte(pending[0].knownAt, until) <= 0)) {
        const plan = pending.shift();
        plan.settled = settle(plan);
        cash = Decimal.from(accountState(ledger).cash_balance);
        if (cash.gt(peak)) peak = cash;
        if (peak.sub(cash).gt(drawdown)) drawdown = peak.sub(cash);
      }
    };
    for (const plan of plans) {
      settleKnown(orderOf(plan.bet));
      const account = accountState(ledger);
      let stake = Decimal.from(plan.bet.stake ?? '0'), mmDecision = null;
      if (config.money_management) {
        mmDecision = evaluate({profile: mmProfile, operational: {mode: 'ACTIVE_OPERATIONAL'}, account,
          proposal: {side: plan.bet.side, odds: plan.bet.odds}, commissionRate: config.commission, settingsVersion: config.settings_snapshot_id, at: orderOf(plan.bet)});
        if (!mmDecision.execution_permission) { count(mm.skipped_by_reason, `MM_${mmDecision.decision}:${mmDecision.structured_reasons.join('+') || 'NONE'}`); continue; }
        stake = Decimal.from(mmDecision.adjusted_stake);
      }
      const need = exposureOf([{...legOf({...plan.bet, stake: '1'}), stake}]);
      if (!stake.gt(0) || need.gt(Decimal.from(account.available_bankroll))) { count(mm.skipped_by_reason, 'INSUFFICIENT_AVAILABLE_BANKROLL'); continue; }
      plan.bet = {...plan.bet, stake: stake.toString(), ...(mmDecision ? {money_management: {decision: mmDecision.decision, original_stake: mmDecision.original_stake,
        hard_caps_triggered: mmDecision.hard_caps_triggered, bankroll_snapshot_ref: mmDecision.bankroll_snapshot_ref}} : {})};
      if (mmDecision?.decision === 'REDUCE') mm.reduced++;
      mm.placed++;
      open(plan.bet);
      placed.push(plan);
      if (plan.knownAt) pending.push(plan); else plan.settled = settle(plan);
    }
    settleKnown(null);
    settledBets = placed.map(plan => plan.settled);
    bets.length = 0;
    bets.push(...placed.map(plan => plan.bet));
    const state = ledger && accountState(ledger);
    report.bankroll = {initial: config.bankroll, final_cash: state ? state.cash_balance : config.bankroll, available: state ? state.available_bankroll : config.bankroll,
      realized_pnl: state ? state.realized_pnl : '0', return_on_bankroll: state ? Decimal.from(state.realized_pnl).div(Decimal.from(config.bankroll)).toString() : '0',
      max_drawdown: drawdown.toString(), drawdown_order: 'SETTLEMENT',
      settlement_timing: plans.some(p => p.knownAt && !p.event.kickoff_utc) ? 'RESULT_ACQUISITION; END_OF_MATCH_DATE_NON_PIT for matches without kickoff' : 'RESULT_ACQUISITION',
      money_management: config.money_management ?? null, placed: mm.placed, reduced: mm.reduced, skipped_by_reason: sorted(mm.skipped_by_reason)};
  }
  if (ledger) {
    const state = accountState(ledger);
    report.ledger = {ledger_version: LEDGER_VERSION, account_id: ledger.account_id, ...(report.ledger ?? {}),
      ...(config.bankroll ? {initial_bankroll: config.bankroll} : {}),
      entries: ledger.entries.length, entries_sha256: sha256(canonicalJson(ledger.entries)),
      state: {cash_balance: state.cash_balance, realized_pnl: state.realized_pnl, settled_commission: state.settled_commission,
        reserved_funds: state.reserved_funds, open_position_count: state.open_position_count, reconciled: state.reconciled}};
  } else delete report.ledger;
  const settled = settledBets.filter(bet => bet.settlement);
  // Result versions of the bets' events acquired before the kickoff: a final cannot be known then, so they are ignored,
  // and counted (an ignored version can hide a correction of the first final).
  const base = {...report, bets: settledBets, counts: {...report.counts, settled: settled.length, unsettled_by_reason: sorted(unsettled),
    result_versions_ignored_before_kickoff: ignoredBeforeKickoff}};
  if (bets.length > 0 && settled.length === 0) return seal({...base, status: STATUS.INSUFFICIENT_OUTCOMES, metrics: null});
  // No bet at all (every event NO_TRADE): a valid outcome (MP-STA-011), with no metric rather than a row of zeros.
  const metrics = settled.length ? metricsOf(settled) : null;
  if (metrics && config.bankroll) metrics.unit = 'bankroll currency units';
  return seal({...base, status: STATUS.OK, metrics});
}

// Totals of the settled bets in decision order: P/L, ROI on the capital at risk (the exposure: a BACK's stake, a LAY's
// liability), maximum drawdown of the cumulative net.
function metricsOf(settled) {
  const exposureOfBet = bet => exposureOf([{side: bet.side, odds: Decimal.from(bet.odds), stake: Decimal.from(bet.stake)}]);
  const gross = sum(settled.map(bet => Decimal.from(bet.settlement.gross)));
  const commission = sum(settled.map(bet => Decimal.from(bet.settlement.commission)));
  const net = gross.sub(commission);
  const staked = sum(settled.map(bet => Decimal.from(bet.stake)));
  const exposure = sum(settled.map(exposureOfBet));
  let cumulative = Decimal.zero(), peak = Decimal.zero(), drawdown = Decimal.zero();
  for (const bet of settled) {
    cumulative = cumulative.add(Decimal.from(bet.settlement.net));
    if (cumulative.gt(peak)) peak = cumulative;
    if (peak.sub(cumulative).gt(drawdown)) drawdown = peak.sub(cumulative);
  }
  const results = name => settled.filter(bet => bet.settlement.bet_result === name).length;
  const roi = exposure.isZero() ? null : net.div(exposure);
  const bySide = Object.fromEntries(SIDES.map(side => {
    const own = settled.filter(bet => bet.side === side);
    return [side, {bets: own.length, pl_net: sum(own.map(bet => Decimal.from(bet.settlement.net))).toString()}];
  }));
  return {
    unit: 'stake units',
    bets: settled.length, won: results('WON'), lost: results('LOST'), corrected_results: settled.filter(bet => bet.settlement.resolution.corrected).length,
    staked: staked.toString(), exposure: exposure.toString(), pl_gross: gross.toString(), commission: commission.toString(), pl_net: net.toString(),
    roi: roi ? roi.toString() : null, max_drawdown: drawdown.toString(), by_side: bySide,
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
