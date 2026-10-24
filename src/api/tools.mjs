// WEB-TOOLS-01 (#94, #96, #100): the trading calculators, the Money Management registry and stake calculator, and the
// market rules registry, as read-only v1 endpoints. Every value is computed here in fixed-precision Decimal (Math Core):
// the web page only shows what these endpoints return (MP-WEB-011). Each answer keeps the exact values (`result`) and
// the values for display (`display`: money to the cent, percentages to two decimals, odds to three, HALF_EVEN).
// Pure computation: no database, no provider, no clock, no write. Simulated money only: nothing here places a bet.
import {Decimal, DecimalError, ROUNDING, sum} from '../math/decimal.mjs';
import {MATH_CORE_VERSION, MathInputError, decimalOdds} from '../math/core.mjs';
import {listMoneyManagementTypes} from '../mm/registry.mjs';
import {MMError, createProfile, evaluate, initialOperationalState} from '../mm/money-management.mjs';
import {MARKET_RULES, MARKET_RULES_VERSION} from '../markets/rules.mjs';

export const TOOLS_VERSION = 'mp-tools-1';
const ZERO = Decimal.zero();
const ONE = Decimal.one();
const HUNDRED = Decimal.from(100);

// ---- Display rounding (the exact value stays in `result`) ----

const money = d => d.round(2, ROUNDING.HALF_EVEN).toString(2);
const pct = d => d.mul(HUNDRED).round(2, ROUNDING.HALF_EVEN).toString(2);
const odds3 = d => d.round(3, ROUNDING.HALF_EVEN).toString(3);
const exact = d => d.toString();

// ---- Input parsing: every refusal names the parameter ----

class ToolInputError extends Error {
  constructor(field, message) { super(`${field}: ${message}`); this.field = field; }
}
function decimalOf(field, value) {
  try { return Decimal.from(String(value).trim().replace(',', '.')); }
  catch (error) {
    if (error instanceof DecimalError) throw new ToolInputError(field, 'must be a plain decimal number');
    throw error;
  }
}
function between(field, value, lo, hi, {openLo = false, openHi = false} = {}) {
  const d = decimalOf(field, value);
  if (openLo ? !d.gt(lo) : d.lt(lo)) throw new ToolInputError(field, `must be ${openLo ? 'greater than' : 'at least'} ${lo}`);
  if (openHi ? !d.lt(hi) : d.gt(hi)) throw new ToolInputError(field, `must be ${openHi ? 'below' : 'at most'} ${hi}`);
  return d;
}
const oddsOf = (field, value) => {
  try { return decimalOdds(field, decimalOf(field, value)); }
  catch (error) { if (error instanceof MathInputError) throw new ToolInputError(field, 'decimal odds must be greater than 1'); throw error; }
};
const amount = (field, value) => between(field, value, '0', '1000000000', {openLo: true});
// A probability typed as a percentage (45 = 45%), strictly between 0 and 100.
const percentProbability = (field, value) => between(field, value, '0', '100', {openLo: true, openHi: true}).div(HUNDRED);
// Exchange commission typed as a percentage (5 = 5%), 0 <= c < 100.
const commissionOf = value => value === undefined ? ZERO : between('commission', value, '0', '100', {openHi: true}).div(HUNDRED);
const sideOf = value => {
  if (value !== 'BACK' && value !== 'LAY') throw new ToolInputError('side', 'must be BACK or LAY');
  return value;
};
const listOf = (field, value, {min, max}) => {
  const parts = String(value).split(/[;\s]+/).filter(Boolean);
  if (parts.length < min || parts.length > max) throw new ToolInputError(field, `between ${min} and ${max} values separated by spaces or semicolons`);
  return parts;
};

// Net of commission: commission is charged on a positive result only.
const net = (gross, c) => gross.gt(0) ? gross.mul(ONE.sub(c)) : gross;

const answer = (tool, {inputs, result, display, notes = []}) => ({tool, tools_version: TOOLS_VERSION, formula_version: MATH_CORE_VERSION,
  inputs, result, display, notes, rounding: {mode: 'HALF_EVEN', money_places: 2, percent_places: 2, odds_places: 3}});

// ---- Tools (#94) ----

// Implied probabilities, book and overround, margin-free probabilities and fair odds of one market.
export function oddsTool({odds}) {
  const list = listOf('odds', odds, {min: 1, max: 20}).map((value, i) => oddsOf(`odds[${i}]`, value));
  const implied = list.map(o => ONE.div(o));
  const book = sum(implied);
  const normalized = list.length > 1 ? implied.map(p => p.div(book)) : null;
  return answer('odds', {
    inputs: {odds: list.map(exact)},
    result: {selections: list.map((o, i) => ({odds: exact(o), implied_probability: exact(implied[i]),
      fair_probability: normalized ? exact(normalized[i]) : null, fair_odds: normalized ? exact(ONE.div(normalized[i])) : null})),
    book: exact(book), overround: list.length > 1 ? exact(book.sub(1)) : null},
    display: {selections: list.map((o, i) => ({odds: odds3(o), implied_percent: pct(implied[i]),
      fair_percent: normalized ? pct(normalized[i]) : null, fair_odds: normalized ? odds3(ONE.div(normalized[i])) : null})),
    book_percent: pct(book), overround_percent: list.length > 1 ? pct(book.sub(1)) : null},
    notes: [list.length > 1 ? 'MARGIN_NORMALIZED_PROPORTIONAL' : 'SINGLE_SELECTION_NO_MARGIN', ...(list.length > 1 && book.lt(1) ? ['BOOK_BELOW_ONE'] : [])],
  });
}

// Profit and loss of one position, both outcomes, net of commission; the liability is what the position can lose.
function positionOf(side, odds, stake, c) {
  const winGross = side === 'BACK' ? stake.mul(odds.sub(1)) : stake.mul(odds.sub(1)).neg();
  const loseGross = side === 'BACK' ? stake.neg() : stake;
  return {liability: side === 'BACK' ? stake : stake.mul(odds.sub(1)), if_wins: net(winGross, c), if_loses: net(loseGross, c)};
}

// Expected value of one position at a probability the user estimates; the edge compares it with the price.
export function evTool({odds, probability, stake, side = 'BACK', commission}) {
  const o = oddsOf('odds', odds), p = percentProbability('probability', probability), s = amount('stake', stake);
  const k = sideOf(side), c = commissionOf(commission);
  const pos = positionOf(k, o, s, c);
  const ev = p.mul(pos.if_wins).add(ONE.sub(p).mul(pos.if_loses));
  const fair = ONE.div(p);
  // Edge of the price over the estimate: BACK p·O − 1; LAY (1 − p) / (1 − 1/O) − 1, the lay of a price above fair loses.
  const edge = k === 'BACK' ? p.mul(o).sub(1) : ONE.sub(p).div(ONE.sub(ONE.div(o))).sub(1);
  return answer('ev', {
    inputs: {odds, probability, stake, side: k, commission: commission ?? '0'},
    result: {expected_value: exact(ev), roi_on_risk: exact(ev.div(pos.liability)), edge: exact(edge), fair_odds: exact(fair),
      liability: exact(pos.liability), if_wins: exact(pos.if_wins), if_loses: exact(pos.if_loses)},
    display: {expected_value: money(ev), roi_percent: pct(ev.div(pos.liability)), edge_percent: pct(edge), fair_odds: odds3(fair),
      liability: money(pos.liability), if_wins: money(pos.if_wins), if_loses: money(pos.if_loses)},
    notes: [ev.gt(0) ? 'POSITIVE_EV' : ev.isZero() ? 'ZERO_EV' : 'NEGATIVE_EV', 'PROBABILITY_IS_USER_ESTIMATE'],
  });
}

// Kelly criterion for a BACK bet: f* = (b·p − q) / b with b = O − 1, scaled by a fraction; no edge, no stake.
export function kellyTool({odds, probability, bankroll, fraction = '100'}) {
  const o = oddsOf('odds', odds), p = percentProbability('probability', probability), bank = amount('bankroll', bankroll);
  const f = between('fraction', fraction, '0', '100', {openLo: true}).div(HUNDRED);
  const b = o.sub(1), q = ONE.sub(p);
  const full = b.mul(p).sub(q).div(b);
  const applied = full.gt(0) ? full.mul(f) : ZERO;
  const stake = bank.mul(applied).roundToStep('0.01', ROUNDING.DOWN);
  return answer('kelly', {
    inputs: {odds, probability, bankroll, fraction},
    result: {kelly_fraction: exact(full), applied_fraction: exact(applied), stake: exact(stake), edge: exact(p.mul(o).sub(1))},
    display: {kelly_percent: pct(full), applied_percent: pct(applied), stake: money(stake), edge_percent: pct(p.mul(o).sub(1))},
    notes: [full.gt(0) ? 'EDGE' : 'NO_EDGE_NO_STAKE', 'BACK_ONLY', 'STAKE_ROUNDED_DOWN_TO_CENT', 'PROBABILITY_IS_USER_ESTIMATE'],
  });
}

// One position: from the stake, or (LAY) from the liability the user accepts.
export function positionTool({side = 'BACK', odds, stake, liability, commission}) {
  const k = sideOf(side), o = oddsOf('odds', odds), c = commissionOf(commission);
  if ((stake === undefined) === (liability === undefined)) throw new ToolInputError('stake', 'give either stake or liability');
  let s;
  if (stake !== undefined) s = amount('stake', stake);
  else s = k === 'LAY' ? amount('liability', liability).div(o.sub(1)).roundToStep('0.01', ROUNDING.DOWN) : amount('liability', liability);
  if (!s.gt(0)) throw new ToolInputError('liability', 'too small for these odds');
  const pos = positionOf(k, o, s, c);
  // The selection's probability at which the position breaks even before commission: 1 / O for both sides.
  const breakEven = ONE.div(o);
  return answer('position', {
    inputs: {side: k, odds, stake: stake ?? null, liability: liability ?? null, commission: commission ?? '0'},
    result: {stake: exact(s), liability: exact(pos.liability), if_wins: exact(pos.if_wins), if_loses: exact(pos.if_loses), break_even_probability: exact(breakEven)},
    display: {stake: money(s), liability: money(pos.liability), if_wins: money(pos.if_wins), if_loses: money(pos.if_loses), break_even_percent: pct(breakEven)},
    notes: [stake === undefined && k === 'LAY' ? 'STAKE_FROM_LIABILITY_ROUNDED_DOWN' : 'STAKE_GIVEN', 'COMMISSION_ON_POSITIVE_RESULT'],
  });
}

// Hedge (green-up / cash-out) of an open position at the current price: the opposite trade that equalises the result.
// share (percent) hedges part of it; 100 is a full green-up.
export function hedgeTool({side = 'BACK', odds, stake, current_odds: currentOdds, share = '100', commission}) {
  const k = sideOf(side), o1 = oddsOf('odds', odds), s1 = amount('stake', stake), o2 = oddsOf('current_odds', currentOdds);
  const part = between('share', share, '0', '100', {openLo: true}).div(HUNDRED);
  const c = commissionOf(commission);
  const hedgeSide = k === 'BACK' ? 'LAY' : 'BACK';
  const s2 = s1.mul(o1).div(o2).mul(part).round(2, ROUNDING.HALF_EVEN);
  if (!s2.gt(0)) throw new ToolInputError('stake', 'too small to hedge');
  const sign = k === 'BACK' ? ONE : ONE.neg();
  // Gross results of the open trade and of the hedge in the two outcomes of the selection.
  const openWin = s1.mul(o1.sub(1)).mul(sign), openLose = s1.mul(sign).neg();
  const hedgeWin = s2.mul(o2.sub(1)).mul(sign).neg(), hedgeLose = s2.mul(sign);
  const before = {if_wins: net(openWin, c), if_loses: net(openLose, c)};
  const after = {if_wins: net(openWin.add(hedgeWin), c), if_loses: net(openLose.add(hedgeLose), c)};
  const hedgeLiability = hedgeSide === 'BACK' ? s2 : s2.mul(o2.sub(1));
  return answer('hedge', {
    inputs: {side: k, odds, stake, current_odds: currentOdds, share, commission: commission ?? '0'},
    result: {hedge_side: hedgeSide, hedge_stake: exact(s2), hedge_liability: exact(hedgeLiability),
      before: {if_wins: exact(before.if_wins), if_loses: exact(before.if_loses)}, after: {if_wins: exact(after.if_wins), if_loses: exact(after.if_loses)}},
    display: {hedge_side: hedgeSide, hedge_stake: money(s2), hedge_liability: money(hedgeLiability),
      before: {if_wins: money(before.if_wins), if_loses: money(before.if_loses)}, after: {if_wins: money(after.if_wins), if_loses: money(after.if_loses)}},
    notes: ['HEDGE_STAKE_ROUNDED_TO_CENT', part.eq(1) ? 'FULL_GREEN_UP' : 'PARTIAL_HEDGE', 'COMMISSION_ON_POSITIVE_RESULT', 'LIQUIDITY_NOT_CHECKED'],
  });
}

// Dutching: one total stake split over several selections so that any of them returns the same amount.
export function dutchingTool({odds, total, commission}) {
  const list = listOf('odds', odds, {min: 2, max: 10}).map((value, i) => oddsOf(`odds[${i}]`, value));
  const t = amount('total', total), c = commissionOf(commission);
  const inv = list.map(o => ONE.div(o));
  const book = sum(inv);
  const stakes = inv.map(p => t.mul(p).div(book).round(2, ROUNDING.HALF_EVEN));
  const placed = sum(stakes);
  const outcomes = list.map((o, i) => net(stakes[i].mul(o).sub(placed), c));
  return answer('dutching', {
    inputs: {odds: list.map(exact), total, commission: commission ?? '0'},
    result: {stakes: stakes.map(exact), placed: exact(placed), if_wins: outcomes.map(exact), book: exact(book)},
    display: {selections: list.map((o, i) => ({odds: odds3(o), stake: money(stakes[i]), if_wins: money(outcomes[i])})), placed: money(placed), book_percent: pct(book)},
    notes: [book.lt(1) ? 'BOOK_BELOW_ONE_PROFIT_EVERY_SELECTION' : 'BOOK_AT_LEAST_ONE_LOSS_EVERY_SELECTION', 'STAKES_ROUNDED_TO_CENT', 'LOSES_PLACED_IF_NONE_WINS'],
  });
}

// e^x for 0 <= x <= 20 by its Taylor series, in Decimal (terms below 1e-18 stop it).
function exp(x) {
  let term = ONE, total = ONE;
  for (let n = 1; n < 200; n++) {
    term = term.mul(x).div(n);
    if (term.isZero()) break;
    total = total.add(term);
  }
  return total;
}
const poissonPmf = (lambda, max) => {
  const out = [ONE.div(exp(lambda))];
  for (let k = 1; k <= max; k++) out.push(out[k - 1].mul(lambda).div(k));
  return out;
};

// Independent Poisson goals from the two expected-goals values: the score grid, 1X2, goal lines and both teams scoring.
// Goal lines and BTTS are exact (the sum of two Poisson variables is Poisson); 1X2 is summed on a 0–15 grid whose
// coverage is reported.
export function poissonTool({xg_home: xgHome, xg_away: xgAway, max_goals: maxGoals = '5'}) {
  const lh = between('xg_home', xgHome, '0', '10'), la = between('xg_away', xgAway, '0', '10');
  if (!/^\d+$/.test(String(maxGoals)) || Number(maxGoals) < 1 || Number(maxGoals) > 8) throw new ToolInputError('max_goals', 'must be an integer between 1 and 8');
  const shown = Number(maxGoals), GRID = 15;
  const ph = poissonPmf(lh, GRID), pa = poissonPmf(la, GRID);
  let home = ZERO, draw = ZERO, away = ZERO, covered = ZERO;
  const scores = [];
  for (let h = 0; h <= GRID; h++) for (let a = 0; a <= GRID; a++) {
    const p = ph[h].mul(pa[a]);
    covered = covered.add(p);
    if (h > a) home = home.add(p); else if (h === a) draw = draw.add(p); else away = away.add(p);
    if (h <= shown && a <= shown) scores.push({home: h, away: a, p});
  }
  const total = poissonPmf(lh.add(la), 5);
  const under = n => sum(total.slice(0, n + 1));
  const lines = ['0.5', '1.5', '2.5', '3.5', '4.5'].map((line, n) => ({line, over: ONE.sub(under(n)), under: under(n)}));
  const btts = ONE.sub(ph[0]).mul(ONE.sub(pa[0]));
  const fair = p => p.gt(0) ? odds3(ONE.div(p)) : null;
  const top = [...scores].sort((x, y) => y.p.cmp(x.p) || x.home - y.home || x.away - y.away).slice(0, 5);
  return answer('poisson', {
    inputs: {xg_home: xgHome, xg_away: xgAway, max_goals: String(shown)},
    result: {home: exact(home), draw: exact(draw), away: exact(away), grid_coverage: exact(covered), btts_yes: exact(btts),
      lines: lines.map(l => ({line: l.line, over: exact(l.over), under: exact(l.under)})),
      grid: scores.map(s => ({home: s.home, away: s.away, probability: exact(s.p)}))},
    display: {
      match_odds: [['HOME', home], ['DRAW', draw], ['AWAY', away]].map(([selection, p]) => ({selection, percent: pct(p), fair_odds: fair(p)})),
      btts: {yes_percent: pct(btts), yes_fair_odds: fair(btts), no_percent: pct(ONE.sub(btts)), no_fair_odds: fair(ONE.sub(btts))},
      lines: lines.map(l => ({line: l.line, over_percent: pct(l.over), over_fair_odds: fair(l.over), under_percent: pct(l.under), under_fair_odds: fair(l.under)})),
      grid: {max_goals: shown, cells: scores.map(s => ({home: s.home, away: s.away, percent: pct(s.p)}))},
      top_scores: top.map(s => ({score: `${s.home}-${s.away}`, percent: pct(s.p), fair_odds: fair(s.p)})),
      grid_coverage_percent: pct(covered)},
    notes: ['INDEPENDENT_POISSON_MODEL', 'MODEL_NOT_A_FORECAST'],
  });
}

// ---- Money Management (#96) ----

const MM_VALUE = {FIXED_STAKE: 'stake', FIXED_LIABILITY: 'liability', PERCENT_BANKROLL: 'percent', LIABILITY_PERCENT_BANKROLL: 'percent'};

export function mmModels() {
  const models = listMoneyManagementTypes().map(t => ({type_id: t.type_id, name: t.name, category: t.category, description: t.description,
    certification_status: t.certification_status, formula: t.formula, value_parameter: MM_VALUE[t.type_id] ?? null,
    requires_bankroll: t.capabilities?.requires_bankroll ?? null, requires_sequence_state: t.capabilities?.requires_sequence_state ?? null,
    blocked_by: t.blocked_by ?? null}));
  return {models, implemented: models.filter(m => m.certification_status === 'IMPLEMENTED').length, total: models.length};
}

// The stake the profile would allow for one proposal on a simulated account holding `bankroll`, with no open position.
// The account and the profile exist only for this answer: nothing is recorded.
export function mmStake({model, value, bankroll, side = 'BACK', odds, max_stake: maxStake, max_liability: maxLiability, commission}) {
  if (!Object.hasOwn(MM_VALUE, model)) throw new ToolInputError('model', `must be one of ${Object.keys(MM_VALUE).join(', ')}`);
  const v = amount('value', value), bank = amount('bankroll', bankroll), o = oddsOf('odds', odds), k = sideOf(side), c = commissionOf(commission);
  const caps = {};
  if (maxStake !== undefined) caps.max_stake = amount('max_stake', maxStake).toString();
  if (maxLiability !== undefined) caps.max_liability = amount('max_liability', maxLiability).toString();
  const profile = createProfile({profileId: 'calculator', model, params: {[MM_VALUE[model]]: v.toString()}, caps});
  const account = {account_id: 'calculator', entries: 0, available_bankroll: bank.toString(), open_liability: '0', open_position_count: 0, open_exposure_by_scope: {}};
  const decision = evaluate({profile, operational: initialOperationalState(), account, proposal: {side: k, odds: o.toString()}, commissionRate: c.toString()});
  const stake = Decimal.from(decision.adjusted_stake);
  const pos = positionOf(k, o, stake, c);
  return {...answer('mm_stake', {
    inputs: {model, value, bankroll, side: k, odds, max_stake: maxStake ?? null, max_liability: maxLiability ?? null, commission: commission ?? '0'},
    result: {decision: decision.decision, original_stake: decision.original_stake, adjusted_stake: decision.adjusted_stake,
      original_liability: decision.original_liability, adjusted_liability: decision.adjusted_liability, caps_triggered: decision.hard_caps_triggered,
      reasons: decision.structured_reasons, if_wins: exact(pos.if_wins), if_loses: exact(pos.if_loses)},
    display: {original_stake: money(Decimal.from(decision.original_stake)), adjusted_stake: money(stake),
      adjusted_liability: money(Decimal.from(decision.adjusted_liability)), if_wins: money(pos.if_wins), if_loses: money(pos.if_loses)},
    notes: ['SIMULATED_ACCOUNT_NO_OPEN_POSITIONS', 'NOTHING_RECORDED'],
  }), engine_version: decision.engine_version};
}

// ---- Market rules (#100) ----

export const marketRules = () => ({version: MARKET_RULES_VERSION, rules: MARKET_RULES});

// ---- v1 endpoints ----

const TOOLS = {odds: oddsTool, ev: evTool, kelly: kellyTool, position: positionTool, hedge: hedgeTool, dutching: dutchingTool, poisson: poissonTool};

export function toolEndpoints({param, ApiError}) {
  // A refusal of the calculators is the caller's input: 400 with the parameter named first.
  const guarded = fn => (_client, input) => {
    try { return fn(input); }
    catch (error) {
      if (error instanceof ToolInputError || error instanceof MathInputError) throw new ApiError('BAD_REQUEST', error.message);
      if (error instanceof MMError) throw new ApiError('BAD_REQUEST', error.message);
      throw error;
    }
  };
  const p = (description, required = false) => param(description, required, undefined, 300);
  const commission = p('commissione exchange in percento (5 = 5%), predefinita 0');
  const side = p('BACK | LAY, predefinito BACK');
  const tool = (name, summary, params) => ({path: `/api/v1/tools/${name}`, source: 'MatchPilot', summary, params, db: false,
    read: guarded(TOOLS[name]), provenance: () => ({source: 'computation', engine: TOOLS_VERSION, math: MATH_CORE_VERSION, upstream_calls: 0})});
  return [
    tool('odds', 'Probabilità implicite, margine e quote eque di un mercato', {odds: p('quote decimali separate da spazi o punto e virgola (1–20)', true)}),
    tool('ev', 'Valore atteso e vantaggio di una posizione a una probabilità stimata', {odds: p('quota decimale', true),
      probability: p('probabilità stimata in percento (0–100)', true), stake: p('puntata', true), side, commission}),
    tool('kelly', 'Criterio di Kelly (frazionario) per una puntata', {odds: p('quota decimale', true), probability: p('probabilità stimata in percento', true),
      bankroll: p('capitale', true), fraction: p('frazione di Kelly in percento, predefinita 100')}),
    tool('position', 'Responsabilità e risultato di una posizione Punta o Banca', {side, odds: p('quota decimale', true),
      stake: p('puntata (oppure liability)'), liability: p('responsabilità massima (oppure stake)'), commission}),
    tool('hedge', 'Copertura (green-up, cash-out) di una posizione aperta', {side, odds: p('quota di apertura', true), stake: p('puntata di apertura', true),
      current_odds: p('quota attuale per la copertura', true), share: p('quota da coprire in percento, predefinita 100'), commission}),
    tool('dutching', 'Dutching: puntata totale ripartita su più selezioni', {odds: p('quote decimali (2–10)', true), total: p('puntata totale', true), commission}),
    tool('poisson', 'Modello di Poisson dai gol attesi: risultati esatti, 1X2, linee gol, entrambe segnano', {xg_home: p('gol attesi casa (0–10)', true),
      xg_away: p('gol attesi ospite (0–10)', true), max_goals: p('gol per squadra nella griglia (1–8), predefinito 5')}),
    {path: '/api/v1/mm/models', source: 'MatchPilot', summary: 'Registro dei modelli di Money Management con stato di certificazione', params: {}, db: false,
      read: () => mmModels(), provenance: () => ({source: 'registry', upstream_calls: 0})},
    {path: '/api/v1/mm/stake', source: 'MatchPilot', summary: 'Puntata consentita da un modello di Money Management su un conto simulato', db: false,
      params: {model: p('FIXED_STAKE | FIXED_LIABILITY | PERCENT_BANKROLL | LIABILITY_PERCENT_BANKROLL', true), value: p('puntata, responsabilità o percentuale del modello', true),
        bankroll: p('capitale disponibile', true), side, odds: p('quota decimale', true), max_stake: p('tetto alla puntata'), max_liability: p('tetto alla responsabilità'), commission},
      read: guarded(mmStake), provenance: () => ({source: 'computation', upstream_calls: 0})},
    {path: '/api/v1/markets/rules', source: 'MatchPilot', summary: 'Registro versionato delle regole di regolamento dei mercati', params: {}, db: false,
      read: () => marketRules(), provenance: () => ({source: 'registry', upstream_calls: 0})},
  ];
}
