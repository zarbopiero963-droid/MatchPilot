// STRAT-CFG-01 (#34, MP-STA-001): configurable strategies as data. A definition is a closed JSON object, validated
// field by field and interpreted by the fixed code below: no expression, no user code, nothing evaluated. Its identity
// is the SHA-256 of its canonical form, so the same rules always give the same strategy id (`def:<16 hex>`), and the
// report records both the id and the definition. Like every strategy, a compiled definition sees only the engine's
// decision view of one event (teams, kickoff, decision time, the admitted 1X2 prices): no outcome and no price outside
// what the PIT policy admitted at the decision time (NON_PIT_RESEARCH admits more, and labels the run).
import {Decimal} from '../math/decimal.mjs';
import {HistInputError, SELECTIONS_1X2, canonicalJson, sha256} from './contract.mjs';

export const STRATEGY_DEF_VERSION = 'mp-strategy-def-1';
// The markets a definition may name. The archive carries 1X2 prices only (FPT Odd_1/X/2), so MATCH_ODDS is the only
// market a backtest can price; any other market is refused with a reason rather than simulated on invented prices.
export const DEF_MARKETS = Object.freeze(['MATCH_ODDS']);
export const DEF_SELECTIONS = Object.freeze(['FAVOURITE', 'UNDERDOG', 'HOME', 'DRAW', 'AWAY']);
export const DEF_SIDES = Object.freeze(['BACK', 'LAY']);
export const DEF_VENUES = Object.freeze(['ANY', 'HOME', 'AWAY']);
// Price bounds: on the chosen selection (odds_*) and on each 1X2 price (home_*, draw_*, away_*).
export const PRICE_CONDITIONS = Object.freeze(['odds_min', 'odds_max', 'home_min', 'home_max', 'draw_min', 'draw_max', 'away_min', 'away_max']);
const FIELDS = ['version', 'market', 'selection', 'side', 'conditions'];
const CONDITION_FIELDS = [...PRICE_CONDITIONS, 'teams', 'venue'];
const PRICE = /^\d{1,4}(\.\d{1,3})?$/;
const MAX_TEAMS = 20;
const bad = (field, message) => new HistInputError(`config.strategy_definition${field ? `.${field}` : ''}`, message);
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function price(field, value) {
  if (typeof value !== 'string' || !PRICE.test(value)) throw bad(`conditions.${field}`, 'must be a decimal price as text, e.g. "1.85"');
  const d = Decimal.from(value);
  if (!d.gt(Decimal.from('1')) || d.gt(Decimal.from('1000'))) throw bad(`conditions.${field}`, 'must be above 1 and at most 1000');
  return d;
}

// Validates a definition and returns its canonical form: defaults filled in, prices normalized ("1.50" → "1.5"), teams
// trimmed, deduplicated and sorted. The same rules written differently therefore get the same id.
export function normalizeDefinition(def) {
  if (!plainObject(def)) throw bad('', 'must be an object');
  for (const name of Object.keys(def)) if (!FIELDS.includes(name)) throw bad(name, 'unknown field');
  const version = def.version ?? STRATEGY_DEF_VERSION;
  if (version !== STRATEGY_DEF_VERSION) throw bad('version', `must be ${STRATEGY_DEF_VERSION}`);
  const market = def.market ?? 'MATCH_ODDS';
  if (!DEF_MARKETS.includes(market)) throw bad('market', `MARKET_UNSUPPORTED: the archive carries 1X2 prices only (${DEF_MARKETS.join(', ')})`);
  if (!DEF_SELECTIONS.includes(def.selection)) throw bad('selection', `must be one of ${DEF_SELECTIONS.join(', ')}`);
  if (!DEF_SIDES.includes(def.side)) throw bad('side', `must be one of ${DEF_SIDES.join(', ')}`);
  const raw = def.conditions ?? {};
  if (!plainObject(raw)) throw bad('conditions', 'must be an object');
  for (const name of Object.keys(raw)) if (!CONDITION_FIELDS.includes(name)) throw bad(`conditions.${name}`, 'unknown condition');
  const conditions = {};
  for (const name of PRICE_CONDITIONS) if (Object.hasOwn(raw, name)) conditions[name] = price(name, raw[name]).toString();
  for (const prefix of ['odds', 'home', 'draw', 'away']) {
    const lo = conditions[`${prefix}_min`], hi = conditions[`${prefix}_max`];
    if (lo !== undefined && hi !== undefined && Decimal.from(lo).gt(Decimal.from(hi))) throw bad(`conditions.${prefix}_min`, `must not exceed ${prefix}_max`);
  }
  if (Object.hasOwn(raw, 'teams')) {
    if (!Array.isArray(raw.teams) || raw.teams.length === 0 || raw.teams.length > MAX_TEAMS) throw bad('conditions.teams', `must be a list of 1 to ${MAX_TEAMS} team names`);
    const teams = raw.teams.map(name => {
      if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) throw bad('conditions.teams', 'each team must be a name of 1 to 100 characters');
      return name.trim();
    });
    conditions.teams = [...new Set(teams)].sort();
  }
  const venue = raw.venue ?? 'ANY';
  if (!DEF_VENUES.includes(venue)) throw bad('conditions.venue', `must be one of ${DEF_VENUES.join(', ')}`);
  if (venue !== 'ANY' && !conditions.teams) throw bad('conditions.venue', 'needs conditions.teams');
  if (venue !== 'ANY') conditions.venue = venue;
  return {version, market, selection: def.selection, side: def.side, conditions};
}

// The strategy id of a normalized definition: its content hash.
export const definitionId = normalized => `def:${sha256(canonicalJson(normalized)).slice(0, 16)}`;

// The decision function of a normalized definition. Every refusal is a reasoned NO_TRADE (MP-STA-011), in this order:
// teams, prices present, price conditions, selection, odds range.
export function compileDefinition(normalized) {
  const c = normalized.conditions;
  const bounds = Object.fromEntries(PRICE_CONDITIONS.filter(name => c[name] !== undefined).map(name => [name, Decimal.from(c[name])]));
  const priceCondition = SELECTIONS_1X2.filter(s => bounds[`${s.toLowerCase()}_min`] || bounds[`${s.toLowerCase()}_max`]);
  // FAVOURITE and UNDERDOG compare the three prices, and a condition on a price needs that price.
  const compares = ['FAVOURITE', 'UNDERDOG'].includes(normalized.selection);
  const needed = new Set(compares ? SELECTIONS_1X2 : [normalized.selection, ...priceCondition]);
  const teams = c.teams ? new Set(c.teams) : null;
  const venue = c.venue ?? 'ANY';
  const within = (value, lo, hi) => (!lo || !value.lt(lo)) && (!hi || !value.gt(hi));
  return view => {
    if (teams) {
      const home = teams.has(String(view.home).trim()), away = teams.has(String(view.away).trim());
      if (!(venue === 'HOME' ? home : venue === 'AWAY' ? away : home || away)) return {action: 'NO_TRADE', reason: 'TEAM_FILTER'};
    }
    const present = SELECTIONS_1X2.filter(s => Object.hasOwn(view.odds, s));
    if (present.length === 0) return {action: 'NO_TRADE', reason: 'NO_ADMISSIBLE_ODDS'};
    if ([...needed].some(s => !present.includes(s))) return {action: 'NO_TRADE', reason: compares ? 'INCOMPLETE_1X2' : 'PRICE_MISSING'};
    const prices = Object.fromEntries(present.map(s => [s, Decimal.from(view.odds[s].odds)]));
    for (const s of priceCondition) {
      const k = s.toLowerCase();
      if (!within(prices[s], bounds[`${k}_min`], bounds[`${k}_max`])) return {action: 'NO_TRADE', reason: `${s}_PRICE_OUT_OF_RANGE`};
    }
    let selection = normalized.selection;
    if (selection === 'FAVOURITE' || selection === 'UNDERDOG') {
      const pick = selection === 'FAVOURITE' ? (a, b) => b.lt(a) : (a, b) => b.gt(a);
      const best = SELECTIONS_1X2.reduce((a, b) => (pick(prices[a], prices[b]) ? b : a));
      if (SELECTIONS_1X2.filter(s => prices[s].eq(prices[best])).length > 1) return {action: 'NO_TRADE', reason: `${selection}_TIE`};
      selection = best;
    }
    if (!within(prices[selection], bounds.odds_min, bounds.odds_max)) return {action: 'NO_TRADE', reason: 'ODDS_OUT_OF_RANGE'};
    return {action: normalized.side, selection};
  };
}
