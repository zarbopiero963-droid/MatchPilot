// MP-UI-PR-005 / MATH-CORE-08 (#94): the Trading Tools as read-only v1 endpoints over the Math Core formulas
// (src/math/core.mjs, src/math/trading.mjs). The page sends what the user typed; this layer reads it (decimal comma
// accepted, percentages turned into fractions in Decimal), calls the formula and adds the values for display: money to
// the cent, percentages to two decimals, odds to three (half-even). The exact values stay in `result` (MP-WEB-011: the
// browser computes nothing). Manual input only: no match, no feed, no liquidity, no order (#94 CALCULATE level).
// Ported from the prototype claude/matchpilot-web-app-wygcsn (MP-UI-PROTOTYPE-INTEGRATION-01), with the formulas
// aligned to #94 and no upper limit on amounts beyond the parameter length.
import {Decimal, DecimalError, ROUNDING} from '../math/decimal.mjs';
import {MATH_CORE_VERSION, MathInputError, impliedProbability, normalizedProbabilities, overround} from '../math/core.mjs';
import {dutchingBack, expectedValue, hedge, kelly, layLiability, poisson} from '../math/trading.mjs';

export const TOOLS_VERSION = 'mp-tools-1';
const HUNDRED = Decimal.from(100);

// ---- Reading the user's input: every refusal names the parameter first ----

class ToolInputError extends Error {
  constructor(field, message) { super(`${field}: ${message}`); this.field = field; }
}
// "2,10" and "2.10" are the same number; anything else Decimal does not read is refused.
function decimalText(field, value) {
  const text = String(value).trim();
  const normalized = /^-?\d+,\d+$/.test(text) ? text.replace(',', '.') : text;
  try { Decimal.from(normalized); }
  catch (error) {
    if (error instanceof DecimalError) throw new ToolInputError(field, 'must be a plain decimal number');
    throw error;
  }
  return normalized;
}
// A percentage typed by the user (5 = 5%) as the fraction the formula takes.
const percent = (field, value) => Decimal.from(decimalText(field, value)).div(HUNDRED).toString();
const optionalPercent = (field, value) => (value === undefined ? undefined : percent(field, value));
const listOf = (field, value, {min, max}) => {
  const parts = String(value).split(/[;\s]+/).filter(Boolean);
  if (parts.length < min || parts.length > max) throw new ToolInputError(field, `between ${min} and ${max} values separated by spaces or semicolons`);
  return parts.map((part, i) => decimalText(`${field}[${i}]`, part));
};

// ---- Display: rounding of what the page shows ----

const money = text => Decimal.from(text).round(2, ROUNDING.HALF_EVEN).toString(2);
const pct = text => Decimal.from(text).mul(HUNDRED).round(2, ROUNDING.HALF_EVEN).toString(2);
const odds3 = text => Decimal.from(text).round(3, ROUNDING.HALF_EVEN).toString(3);
// No fair odds for a probability shown as 0.00%: a price of 1e18 means nothing to the user (review of PR #244, N4).
const fairOdds = text => (Decimal.from(pct(text)).gt(0) ? odds3(Decimal.one().div(Decimal.from(text)).toString()) : null);
const ROUNDING_POLICY = {mode: 'HALF_EVEN', money_places: 2, percent_places: 2, odds_places: 3};

const answer = (tool, math, display) => ({tool, tools_version: TOOLS_VERSION, formula: math.formula, formula_version: math.formula_version,
  mode: 'MANUAL', inputs: math.inputs, normalized_inputs: math.normalized_inputs, result: math.result, rounded: math.rounded,
  display, warnings: math.warnings, display_rounding: ROUNDING_POLICY});

// ---- Tools ----

// Implied probabilities, book, overround and margin-free (fair) probabilities and odds of one market (#94 base rules).
export function oddsTool({odds}) {
  const list = listOf('odds', odds, {min: 1, max: 20});
  if (list.length === 1) {
    const one = impliedProbability({odds: list[0]});
    return answer('odds', {...one, warnings: [...one.warnings, 'SINGLE_SELECTION_NO_MARGIN']},
      {selections: [{odds: odds3(list[0]), implied_percent: pct(one.result.probability), fair_percent: null, fair_odds: null}], book_percent: pct(one.result.probability), overround_percent: null});
  }
  const book = overround({odds: list}), norm = normalizedProbabilities({odds: list});
  const implied = list.map(o => Decimal.one().div(Decimal.from(o)).toString());
  const math = {formula: 'odds_margin', formula_version: MATH_CORE_VERSION, inputs: {odds}, normalized_inputs: norm.normalized_inputs,
    result: {implied_probabilities: implied, book: book.result.book, overround: book.result.overround, fair_probabilities: norm.result.probabilities,
      fair_odds: norm.result.probabilities.map(p => Decimal.one().div(Decimal.from(p)).toString())},
    rounded: null, warnings: [...new Set([...book.warnings, ...norm.warnings, 'RAW_IMPLIED_PROBABILITY'])]};
  return answer('odds', math, {
    selections: list.map((o, i) => ({odds: odds3(o), implied_percent: pct(implied[i]), fair_percent: pct(norm.result.probabilities[i]), fair_odds: odds3(math.result.fair_odds[i])})),
    book_percent: pct(book.result.book), overround_percent: pct(book.result.overround)});
}

export function kellyTool({bankroll, odds, probability, fraction = '100', max_stake: maxStake, max_bankroll: maxBankroll}) {
  const math = kelly({bankroll: decimalText('bankroll', bankroll), odds: decimalText('odds', odds), probability: percent('probability', probability),
    fraction: percent('fraction', fraction), maxStake: maxStake === undefined ? null : decimalText('max_stake', maxStake),
    maxBankroll: maxBankroll === undefined ? null : optionalPercent('max_bankroll', maxBankroll)});
  const r = math.result, d = math.rounded;
  return answer('kelly', math, {stake: money(d.stake), implied_percent: pct(r.implied_probability), model_percent: pct(r.model_probability),
    edge_percent: pct(r.edge), kelly_full_percent: pct(r.kelly_full), kelly_fractional_percent: pct(r.kelly_fractional), governing_limit: r.governing_limit,
    worst_case_loss: money(d.worst_case_loss), bankroll_after_loss: money(d.bankroll_after_loss), bankroll_after_win: money(d.bankroll_after_win)});
}

export function evTool({stake, odds, probability, commission = '0'}) {
  const math = expectedValue({stake: decimalText('stake', stake), odds: decimalText('odds', odds), probability: percent('probability', probability),
    commission: percent('commission', commission)});
  const r = math.result;
  return answer('ev', math, {expected_value: money(r.expected_value), roi_percent: pct(r.roi), fair_odds: odds3(r.fair_odds), market_odds: odds3(r.market_odds),
    edge_percent: pct(r.edge), break_even_percent: pct(r.break_even_probability), profit_if_wins: money(r.profit_if_wins), loss_if_loses: money(Decimal.from(r.loss_if_loses).neg().toString()),
    commission_percent: pct(math.normalized_inputs.commission)});
}

export function liabilityTool({stake, odds, commission = '0', bankroll}) {
  const math = layLiability({stake: decimalText('stake', stake), odds: decimalText('odds', odds), commission: percent('commission', commission),
    bankroll: bankroll === undefined ? null : decimalText('bankroll', bankroll)});
  const r = math.result;
  return answer('liability', math, {liability: money(r.liability), liability_percent_of_bankroll: r.liability_share_of_bankroll === null ? null : pct(r.liability_share_of_bankroll),
    if_selection_loses: money(r.net_profit_if_selection_loses), if_selection_wins: money(Decimal.from(r.loss_if_selection_wins).neg().toString()),
    break_even_percent: pct(r.break_even_probability)});
}

export function hedgeTool({side = 'BACK', stake, odds, exit_odds: exitOdds, commission = '0'}) {
  const math = hedge({side, stake: decimalText('stake', stake), odds: decimalText('odds', odds), exitOdds: decimalText('exit_odds', exitOdds),
    commission: percent('commission', commission)});
  const r = math.result;
  return answer('hedge', math, {hedge_side: r.hedge_side, hedge_stake: money(r.hedge_stake), hedge_liability: money(r.hedge_liability),
    before: {if_wins: money(r.before.if_wins), if_loses: money(r.before.if_loses)}, after: {if_wins: money(r.after.if_wins), if_loses: money(r.after.if_loses)},
    residual_imbalance: money(r.residual_imbalance), liquidity: r.liquidity});
}

export function dutchingTool({total, odds, commission = '0'}) {
  const list = listOf('odds', odds, {min: 2, max: 20});
  const math = dutchingBack({total: decimalText('total', total), odds: list, commission: percent('commission', commission)});
  const r = math.result;
  return answer('dutching', math, {selections: list.map((o, i) => ({odds: odds3(o), stake: money(r.stakes[i]), if_wins: money(r.if_wins[i])})),
    placed: money(r.placed), if_none_wins: money(r.if_none_wins), book_percent: pct(r.book), liquidity: r.liquidity});
}

export function poissonTool({xg_home: xgHome, xg_away: xgAway, max_goals: maxGoals = '5'}) {
  if (!/^[1-8]$/.test(String(maxGoals))) throw new ToolInputError('max_goals', 'must be an integer between 1 and 8');
  let math;
  try { math = poisson({lambdaHome: decimalText('xg_home', xgHome), lambdaAway: decimalText('xg_away', xgAway)}); }
  catch (error) {
    // The formula's λ is the user's expected goals: the refusal names the field the user typed.
    const field = {lambda_home: 'xg_home', lambda_away: 'xg_away'}[error?.field];
    if (error instanceof MathInputError && field) throw new ToolInputError(field, error.message.slice(error.field.length + 2));
    throw error;
  }
  const r = math.result, shown = Number(maxGoals);
  // The page shows the scores up to max_goals per side; the full grid stays out of the answer.
  const cells = r.grid.slice(0, shown + 1).flatMap((row, h) => row.slice(0, shown + 1).map((p, a) => ({home: h, away: a, probability: p})));
  const top = [...cells].sort((x, y) => Decimal.from(y.probability).cmp(x.probability) || x.home - y.home || x.away - y.away).slice(0, 5);
  const {grid: _, ...result} = r;
  return answer('poisson', {...math, result: {...result, shown_grid: cells}}, {
    match_odds: [['HOME', r.home], ['DRAW', r.draw], ['AWAY', r.away]].map(([selection, p]) => ({selection, percent: pct(p), fair_odds: fairOdds(p)})),
    btts: {yes_percent: pct(r.btts_yes), yes_fair_odds: fairOdds(r.btts_yes), no_percent: pct(Decimal.one().sub(Decimal.from(r.btts_yes)).toString()),
      no_fair_odds: fairOdds(Decimal.one().sub(Decimal.from(r.btts_yes)).toString())},
    lines: r.lines.map(l => ({line: l.line, over_percent: pct(l.over), over_fair_odds: fairOdds(l.over), under_percent: pct(l.under), under_fair_odds: fairOdds(l.under)})),
    grid: {max_goals: shown, cells: cells.map(c => ({home: c.home, away: c.away, percent: pct(c.probability)}))},
    top_scores: top.map(c => ({score: `${c.home}-${c.away}`, percent: pct(c.probability), fair_odds: fairOdds(c.probability)})),
    expected_goals: {home: r.expected_goals.home, away: r.expected_goals.away, total: r.expected_goals.total},
    grid_coverage_percent: pct(r.grid_coverage)});
}

export const TOOLS = Object.freeze({odds: oddsTool, kelly: kellyTool, ev: evTool, liability: liabilityTool, hedge: hedgeTool, dutching: dutchingTool, poisson: poissonTool});

// ---- v1 endpoints ----

export function toolEndpoints({param, oneOf, ApiError}) {
  // A refusal is the caller's input: 400, the parameter named first.
  const guarded = fn => (_client, input) => {
    try { return fn(input); }
    catch (error) {
      if (error instanceof ToolInputError || error instanceof MathInputError) throw new ApiError('BAD_REQUEST', error.message);
      throw error;
    }
  };
  const p = (description, required = false, check = undefined) => param(description, required, check, 300);
  const commission = p('commissione exchange in percento sulle vincite nette (5 = 5%), predefinita 0');
  const tool = (name, summary, params) => ({path: `/api/v1/tools/${name}`, source: 'MatchPilot', summary, params, db: false,
    read: guarded(TOOLS[name]), provenance: () => ({source: 'computation', mode: 'MANUAL', engine: TOOLS_VERSION, math: MATH_CORE_VERSION, upstream_calls: 0})});
  return [
    tool('odds', 'Probabilità implicite, margine, probabilità e quote eque di un mercato (#94)', {odds: p('quote decimali separate da spazi o punto e virgola (1–20)', true)}),
    tool('kelly', 'Stake & Kelly (#94 TOOL 1): Kelly pieno e frazionario, limiti, scenari', {bankroll: p('capitale', true), odds: p('quota decimale', true),
      probability: p('probabilità stimata in percento (0–100)', true), fraction: p('frazione di Kelly in percento, predefinita 100'),
      max_stake: p('tetto alla puntata'), max_bankroll: p('tetto in percento del capitale')}),
    tool('ev', 'Value / EV (#94 TOOL 2) di una puntata Punta', {stake: p('puntata', true), odds: p('quota decimale', true),
      probability: p('probabilità stimata in percento (0–100)', true), commission}),
    tool('liability', 'Liability (#94 TOOL 3) di una bancata', {stake: p('puntata di banca', true), odds: p('quota di banca', true), commission, bankroll: p('capitale')}),
    tool('hedge', 'Copertura BACK → LAY e LAY → BACK (#94 TOOL 4 e 5)', {side: p('lato della posizione aperta: BACK | LAY', true, oneOf('side', ['BACK', 'LAY'])),
      stake: p('puntata aperta', true), odds: p('quota di apertura', true), exit_odds: p('quota di uscita', true), commission}),
    tool('dutching', 'Dutching BACK (#94 TOOL 7): puntata totale ripartita su più selezioni', {total: p('puntata totale', true), odds: p('quote decimali (2–20)', true), commission}),
    tool('poisson', 'Poisson (#94 TOOL 12): 1X2, linee gol, entrambe segnano, risultati esatti', {xg_home: p('gol attesi casa (0–10)', true),
      xg_away: p('gol attesi ospite (0–10)', true), max_goals: p('gol per squadra nella griglia mostrata (1–8), predefinito 5')}),
  ];
}
