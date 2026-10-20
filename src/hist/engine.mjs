// HIST-01a (#34, #99; MP-STA-001, MP-STA-011, MP-MKT-001..003, MP-RPL-003, MP-MTH-003; MP-OWNER-HIST-01A-01): the
// offline deterministic backtest engine. Two phases that never mix:
//   1. decision: for each event, at kickoff minus the lead, the strategy sees only the observations the PIT policy
//      admits (acquired by the decision time) and no outcome;
//   2. settlement: after every decision is fixed, each bet is settled with the outcome of the same provider under the
//      versioned 1X2 rule, in Decimal, with the configured commission.
// Without any admissible observation the report is INSUFFICIENT_PIT_DATA and carries no bet, P/L, ROI or drawdown.
// The report is canonical JSON with its own SHA-256: the same input, configuration and code give the same bytes.
// Pure module: no database, no network, no clock, no environment.
import {Decimal, ROUNDING, sum} from '../math/decimal.mjs';
import {MATH_CORE_VERSION, ROUNDING_POLICY_VERSION, commissionRate, nonNegative, MathInputError} from '../math/core.mjs';
import {MONEY_STEP, settleMarket} from '../math/money.mjs';
import {PIT_POLICY_VERSION} from '../pit/policy.mjs';
import {ADMISSION_VERSION, admitObservation, decisionTimeOf} from './admission.mjs';
import {HistInputError, INPUT_VERSION, SELECTIONS_1X2, canonicalJson, sha256, validateInput} from './contract.mjs';
import {STRATEGIES} from './strategies.mjs';

export const ENGINE_VERSION = 'mp-hist-engine-1';
export const REPORT_VERSION = 'mp-hist-report-1';
export const OUTCOME_RULE_VERSION = 'mp-outcome-1x2-1';
export const STATUS = Object.freeze({OK: 'OK', INSUFFICIENT_PIT_DATA: 'INSUFFICIENT_PIT_DATA', INSUFFICIENT_OUTCOMES: 'INSUFFICIENT_OUTCOMES'});
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
  const allowed = ['strategy', 'bookmaker', 'lead_minutes', 'stake', 'commission'];
  for (const name of Object.keys(config)) if (!allowed.includes(name)) throw new HistInputError(`config.${name}`, 'unknown field');
  for (const name of allowed) if (!Object.hasOwn(config, name)) throw new HistInputError(`config.${name}`, 'is required');
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
    stake: stake.toString(), commission: commission.toString()};
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

// mp-outcome-1x2-1: a FINAL outcome gives HOME, DRAW or AWAY from the scores; a VOID outcome voids the bet. An outcome
// is used only when it belongs to the same provider and event as the odds and was acquired at or after the kickoff (a
// final result cannot be known before the match); otherwise the bet stays unsettled (N/D).
function resolveOutcome(outcome, event) {
  if (!outcome) return {result: null, reason: 'OUTCOME_MISSING'};
  if (Date.parse(outcome.acquired_at) < Date.parse(event.kickoff_utc)) return {result: null, reason: 'OUTCOME_ACQUIRED_BEFORE_KICKOFF'};
  if (outcome.status === 'VOID') return {result: 'VOID', reason: null};
  const result = outcome.home_score > outcome.away_score ? 'HOME' : outcome.home_score < outcome.away_score ? 'AWAY' : 'DRAW';
  return {result, reason: null};
}

const LIMITS = [
  'Offline engine test: no liquidity, matching, slippage or execution is modelled.',
  'Decisions use only observations acquired by the decision time (captured knowledge, mp-pit-v1).',
  'Settlement uses only outcomes of the same provider as the odds; cross-provider mappings are not used.',
  'Metrics cover settled bets only; unsettled bets (missing outcome, outcome acquired before kickoff) are counted in counts.unsettled_by_reason and excluded, which can bias the metrics.',
  'No claim of profitability or reliability (MP-STA-012); real-data verdict: NOT VERIFIED.',
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
    const latest = {};
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
    scope: input.dataset.kind,
    real_data_verdict: 'NOT VERIFIED',
    notice: input.dataset.kind === 'FIXTURE'
      ? 'Synthetic fixture: the figures test the engine and are not a real return.'
      : 'Real data, not verified by HIST-01a: no certification and no claim of return.',
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
  const outcomes = new Map(input.outcomes.map(outcome => [key(outcome.provider, outcome.event_id), outcome]));
  const unsettled = counter();
  const settledBets = bets.map(bet => {
    const event = events.get(key(bet.provider, bet.event_id));
    const {result, reason} = resolveOutcome(outcomes.get(key(bet.provider, bet.event_id)), event);
    if (!result) { count(unsettled, reason); return {...bet, settlement: null}; }
    const outcome = result === 'VOID' ? 'VOID' : result === bet.selection ? 'WIN' : 'LOSE';
    const market = settleMarket({bets: [{side: bet.side, stake: bet.stake, odds: bet.odds, outcome}], commission: config.commission});
    return {...bet, settlement: {result, outcome, gross: market.result.gross, commission: market.result.commission, net: market.result.net}};
  });
  const settled = settledBets.filter(bet => bet.settlement);
  const base = {...report, bets: settledBets, counts: {...report.counts, settled: settled.length, unsettled_by_reason: sorted(unsettled)}};
  if (bets.length > 0 && settled.length === 0) return seal({...base, status: STATUS.INSUFFICIENT_OUTCOMES, metrics: null});
  // No bet at all (every event NO_TRADE): a valid outcome (MP-STA-011), with no metric rather than a row of zeros.
  return seal({...base, status: STATUS.OK, metrics: settled.length ? metricsOf(settled) : null});
}

// Totals of the settled bets in decision order: P/L, ROI on the stake at risk, maximum drawdown of the cumulative net.
function metricsOf(settled) {
  const gross = sum(settled.map(bet => Decimal.from(bet.settlement.gross)));
  const commission = sum(settled.map(bet => Decimal.from(bet.settlement.commission)));
  const net = gross.sub(commission);
  const staked = sum(settled.filter(bet => bet.settlement.outcome !== 'VOID').map(bet => Decimal.from(bet.stake)));
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
    bets: settled.length, won: outcomes('WIN'), lost: outcomes('LOSE'), void: outcomes('VOID'),
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
