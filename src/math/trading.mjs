// MATH-CORE-02..04, 06, 07 (#94, R-12): the trading calculators of #94, as pure Math Core formulas. Each one follows the
// formula #94 states (TOOL 1 Stake & Kelly, TOOL 2 Value/EV, TOOL 3 Liability, TOOL 4/5 hedge, TOOL 7 Dutching BACK,
// TOOL 12 Poisson), validates its inputs, computes in fixed-precision Decimal and returns the common envelope
// (src/math/core.mjs). Probabilities, commissions and fractions are fractions here (0.05 = 5%); money is unrounded in
// `result`, rounded to the cent in `rounded` with the rule each formula names. Commission is charged on a positive
// net result only (#94). Pure module: no database, no network, no clock. Nothing here places or prepares an order.
import {Decimal, ROUNDING, sum} from './decimal.mjs';
import {MathInputError, commissionRate, decimalOdds, envelope, nonNegative, oddsList, probability} from './core.mjs';

const ZERO = Decimal.zero();
const ONE = Decimal.one();
const CENT = '0.01';

// Net of commission: the commission is charged on a positive net result only.
const net = (gross, c) => (gross.gt(0) ? gross.mul(ONE.sub(c)) : gross);
const positive = (field, value) => {
  const v = nonNegative(field, value);
  if (v.isZero()) throw new MathInputError(field, 'must be greater than 0');
  return v;
};
// A share in (0, 1] (0 allowed when `zero`): Kelly fraction, share of the bankroll. The message names a share, not a
// probability (review of PR #244, N3).
const shareOf = (field, value, {zero = false} = {}) => {
  const f = nonNegative(field, value);
  if ((!zero && f.isZero()) || f.gt(1)) throw new MathInputError(field, `must be ${zero ? 'at least' : 'greater than'} 0 and at most 1 (100%)`);
  return f;
};
const optional = (value, parse) => (value === undefined || value === null ? null : parse(value));

// ---- TOOL 1: Stake & Kelly (BACK) ----
// b = O − 1, q = 1 − p, f* = (b·p − q) / b; stake = max(0, B·f*·α); stake_final = min(stake, max_stake, B·max_bankroll).
// f* ≤ 0 is NO BET (stake 0). The stake is rounded down to the cent, so the rounded stake never exceeds Kelly or a cap.
export function kelly({bankroll, odds, probability: p, fraction = '1', maxStake = null, maxBankroll = null}) {
  const B = positive('bankroll', bankroll), O = decimalOdds('odds', odds), P = probability('probability', p, {open: true});
  const alpha = shareOf('fraction', fraction);
  const capStake = optional(maxStake, v => nonNegative('max_stake', v));
  const capShare = optional(maxBankroll, v => shareOf('max_bankroll', v, {zero: true}));
  const b = O.sub(1), q = ONE.sub(P);
  const full = b.mul(P).sub(q).div(b);
  const raw = full.gt(0) ? B.mul(full).mul(alpha) : ZERO;
  const caps = [['KELLY', raw], ['MAX_STAKE', capStake], ['MAX_BANKROLL', capShare === null ? null : B.mul(capShare)]].filter(([, v]) => v !== null);
  const [governing, stake] = caps.reduce((low, cap) => (cap[1].lt(low[1]) ? cap : low));
  const rounded = stake.roundToStep(CENT, ROUNDING.DOWN);
  const warnings = [full.gt(0) ? 'EDGE' : 'NO_BET', 'PROBABILITY_IS_USER_ESTIMATE', 'STAKE_ROUNDED_DOWN_TO_CENT'];
  if (full.gt(0) && governing !== 'KELLY') warnings.push(`CAPPED_BY_${governing}`);
  return envelope('kelly', {
    inputs: {bankroll, odds, probability: p, fraction, max_stake: maxStake, max_bankroll: maxBankroll},
    normalized: {bankroll: B, odds: O, probability: P, fraction: alpha, max_stake: capStake, max_bankroll: capShare},
    result: {implied_probability: ONE.div(O), model_probability: P, edge: P.mul(O).sub(1), kelly_full: full,
      kelly_fractional: full.gt(0) ? full.mul(alpha) : ZERO, stake, governing_limit: governing,
      worst_case_loss: stake, bankroll_after_loss: B.sub(stake), bankroll_after_win: B.add(stake.mul(b))},
    rounded: {stake: rounded, worst_case_loss: rounded, bankroll_after_loss: B.sub(rounded), bankroll_after_win: B.add(rounded.mul(b)).round(2)},
    warnings,
  });
}

// ---- TOOL 2: Value / EV (BACK) ----
// EV_net = p·S·(O − 1)·(1 − c) − (1 − p)·S; EV_ROI = EV / S; O_fair = 1 / p; edge = O / O_fair − 1 (= p·O − 1).
// Break-even probability: the p where EV_net = 0, 1 / ((O − 1)·(1 − c) + 1) (1 / O without commission).
export function expectedValue({stake, odds, probability: p, commission = '0'}) {
  const S = positive('stake', stake), O = decimalOdds('odds', odds), P = probability('probability', p, {open: true});
  const c = commissionRate('commission', commission);
  const win = S.mul(O.sub(1)).mul(ONE.sub(c));
  const ev = P.mul(win).sub(ONE.sub(P).mul(S));
  const fair = ONE.div(P);
  const edge = O.div(fair).sub(1);
  return envelope('expected_value', {
    inputs: {stake, odds, probability: p, commission},
    normalized: {stake: S, odds: O, probability: P, commission: c},
    result: {expected_value: ev, roi: ev.div(S), fair_odds: fair, market_odds: O, edge,
      break_even_probability: ONE.div(O.sub(1).mul(ONE.sub(c)).add(1)), profit_if_wins: win, loss_if_loses: S},
    rounded: {expected_value: ev.round(2), profit_if_wins: win.round(2), loss_if_loses: S.round(2)},
    warnings: [ev.gt(0) ? 'POSITIVE_EV' : ev.isZero() ? 'ZERO_EV' : 'NEGATIVE_EV', 'PROBABILITY_IS_USER_ESTIMATE',
      c.isZero() ? 'NO_COMMISSION' : 'COMMISSION_ON_NET_WINNINGS'],
  });
}

// ---- TOOL 3: Liability (LAY) ----
// liability = L·(O − 1); selection loses: +L, net L·(1 − c); selection wins: −liability;
// break-even probability of the selection p = (1 − c) / (O − c). A liability above the bankroll is a warning.
export function layLiability({stake, odds, commission = '0', bankroll = null}) {
  const L = positive('stake', stake), O = decimalOdds('odds', odds), c = commissionRate('commission', commission);
  const B = optional(bankroll, v => positive('bankroll', v));
  const liability = L.mul(O.sub(1));
  const warnings = [c.isZero() ? 'NO_COMMISSION' : 'COMMISSION_ON_NET_WINNINGS'];
  if (B !== null && liability.gt(B)) warnings.push('LIABILITY_ABOVE_BANKROLL');
  return envelope('lay_liability', {
    inputs: {stake, odds, commission, bankroll},
    normalized: {stake: L, odds: O, commission: c, bankroll: B},
    result: {liability, liability_share_of_bankroll: B === null ? null : liability.div(B), profit_if_selection_loses: L,
      net_profit_if_selection_loses: L.mul(ONE.sub(c)), loss_if_selection_wins: liability, break_even_probability: ONE.sub(c).div(O.sub(c))},
    rounded: {liability: liability.round(2), net_profit_if_selection_loses: L.mul(ONE.sub(c)).round(2), loss_if_selection_wins: liability.round(2)},
    warnings,
  });
}

// ---- TOOL 4 and 5: BACK → LAY and LAY → BACK hedge (green-up of one selection) ----
// Equal-profit hedge stake: BACK → LAY L = B·O_b / O_l; LAY → BACK B = L·O_l / O_b. With both legs on the same market,
// P_win = B·(O_b − 1) − L·(O_l − 1) and P_lose = L − B. The commission is charged on the market's positive net result in
// each outcome (#94: per outcome, never one naive multiplication). The equal-profit stake equalizes the net results too:
// equal gross results have the same sign, so they are reduced by the same factor or not at all. The hedge stake is
// rounded to the cent (half-even); the residual imbalance it leaves is reported. Liquidity has no certified source:
// the stake is the theoretical quantity, never declared executable.
export function hedge({side, stake, odds, exitOdds, commission = '0'}) {
  if (side !== 'BACK' && side !== 'LAY') throw new MathInputError('side', 'must be BACK or LAY');
  const S = positive('stake', stake), O = decimalOdds('odds', odds), X = decimalOdds('exit_odds', exitOdds), c = commissionRate('commission', commission);
  const theoretical = S.mul(O).div(X);
  const H = theoretical.roundToStep(CENT, ROUNDING.HALF_EVEN);
  if (H.isZero()) throw new MathInputError('stake', 'too small to hedge at a cent');
  const [backStake, backOdds, layStake, layOdds] = side === 'BACK' ? [S, O, H, X] : [H, X, S, O];
  const outcome = (bs, bo, ls, lo) => ({win: bs.mul(bo.sub(1)).sub(ls.mul(lo.sub(1))), lose: ls.sub(bs)});
  const open = side === 'BACK' ? {win: S.mul(O.sub(1)), lose: S.neg()} : {win: S.mul(O.sub(1)).neg(), lose: S};
  const gross = outcome(backStake, backOdds, layStake, layOdds);
  const exact = outcome(...(side === 'BACK' ? [S, O, theoretical, X] : [theoretical, X, S, O]));
  const after = {win: net(gross.win, c), lose: net(gross.lose, c)};
  const hedgeLiability = side === 'BACK' ? H.mul(X.sub(1)) : H;
  return envelope('hedge', {
    inputs: {side, stake, odds, exit_odds: exitOdds, commission},
    normalized: {side, stake: S, odds: O, exit_odds: X, commission: c},
    result: {hedge_side: side === 'BACK' ? 'LAY' : 'BACK', hedge_stake_theoretical: theoretical, hedge_stake: H, hedge_liability: hedgeLiability,
      before: {if_wins: net(open.win, c), if_loses: net(open.lose, c)},
      gross: {if_wins: gross.win, if_loses: gross.lose}, after: {if_wins: after.win, if_loses: after.lose},
      equalized_theoretical: net(exact.win, c), residual_imbalance: after.win.sub(after.lose).abs(), liquidity: 'UNAVAILABLE'},
    rounded: {hedge_stake: H, hedge_liability: hedgeLiability.round(2), after_if_wins: after.win.round(2), after_if_loses: after.lose.round(2)},
    warnings: [gross.win.gt(0) ? 'GREEN' : gross.win.isZero() ? 'SCRATCH' : 'RED', 'HEDGE_STAKE_ROUNDED_TO_CENT', 'LIQUIDITY_UNAVAILABLE',
      c.isZero() ? 'NO_COMMISSION' : 'COMMISSION_ON_NET_WINNINGS'],
  });
}

// ---- TOOL 7: Dutching BACK ----
// K = Σ 1/O_i, R = T / K, S_i = R / O_i, gross profit P = R − T. K < 1: profit on every selection before commission and
// rounding. Stakes are rounded to the cent (half-even) and the outcomes recomputed from the rounded stakes, net of
// commission, one by one. If none of the selections wins, the whole placed amount is lost.
export function dutchingBack({total, odds, commission = '0'}) {
  const T = positive('total', total), list = oddsList('odds', odds), c = commissionRate('commission', commission);
  if (list.length > 20) throw new MathInputError('odds', 'at most 20 selections');
  const K = sum(list.map(o => ONE.div(o)));
  const R = T.div(K);
  const exactStakes = list.map(o => R.div(o));
  const stakes = exactStakes.map(s => s.roundToStep(CENT, ROUNDING.HALF_EVEN));
  // A selection whose stake rounds to zero is not covered: refused, as a hedge too small to place (review of PR #244, N1).
  if (stakes.some(s => s.isZero())) throw new MathInputError('total', 'too small for these odds: a stake would round to 0 at a cent');
  const placed = sum(stakes);
  const outcomes = stakes.map((s, i) => net(s.mul(list[i]).sub(placed), c));
  return envelope('dutching_back', {
    inputs: {total, odds, commission},
    normalized: {total: T, odds: list, commission: c},
    result: {book: K, target_return: R, stakes_theoretical: exactStakes, gross_profit_theoretical: R.sub(T),
      stakes, placed, if_wins: outcomes, if_none_wins: placed.neg(), liquidity: 'UNAVAILABLE'},
    rounded: {stakes, placed, if_wins: outcomes.map(o => o.round(2))},
    warnings: [K.lt(1) ? 'BOOK_BELOW_ONE' : 'BOOK_AT_LEAST_ONE', 'STAKES_ROUNDED_TO_CENT', 'LIQUIDITY_UNAVAILABLE',
      c.isZero() ? 'NO_COMMISSION' : 'COMMISSION_ON_NET_WINNINGS'],
  });
}

// ---- TOOL 12: Poisson (independent baseline) ----
// P(X = k) = e^−λ·λ^k / k!; P(H = i, A = j) = Pois(i; λ_home)·Pois(j; λ_away). 1X2 sums the grid 0..GRID per side
// (truncation declared, its covered mass reported); goal lines are exact (H + A is Poisson with λ_home + λ_away);
// BTTS yes = 1 − P(H = 0) − P(A = 0) + P(H = 0, A = 0). Independence is the baseline model: Dixon-Coles or a bivariate
// model would be a separate version.
export const POISSON_GRID = 40;
export const POISSON_MAX_LAMBDA = '10';

// e^x for 0 <= x <= 10 by its Taylor series in Decimal; the terms stop once below the 1e-18 resolution.
function exp(x) {
  let term = ONE, total = ONE;
  for (let n = 1; n < 400; n++) {
    term = term.mul(x).div(n);
    if (term.isZero()) return total;
    total = total.add(term);
  }
  throw new MathInputError('lambda', 'exponential did not converge');
}
const pmf = (lambda, max) => {
  const out = [ONE.div(exp(lambda))];
  for (let k = 1; k <= max; k++) out.push(out[k - 1].mul(lambda).div(k));
  return out;
};
const lambdaOf = (field, value) => {
  const l = nonNegative(field, value);
  if (l.gt(POISSON_MAX_LAMBDA)) throw new MathInputError(field, `expected goals must be at most ${POISSON_MAX_LAMBDA}`);
  return l;
};

export function poisson({lambdaHome, lambdaAway, lines = ['0.5', '1.5', '2.5', '3.5', '4.5']}) {
  const lh = lambdaOf('lambda_home', lambdaHome), la = lambdaOf('lambda_away', lambdaAway);
  const ph = pmf(lh, POISSON_GRID), pa = pmf(la, POISSON_GRID);
  let home = ZERO, draw = ZERO, away = ZERO, covered = ZERO;
  const grid = [];
  for (let i = 0; i <= POISSON_GRID; i++) {
    const row = [];
    for (let j = 0; j <= POISSON_GRID; j++) {
      const p = ph[i].mul(pa[j]);
      covered = covered.add(p);
      if (i > j) home = home.add(p); else if (i === j) draw = draw.add(p); else away = away.add(p);
      row.push(p);
    }
    grid.push(row);
  }
  const total = pmf(lh.add(la), 10);
  const goalLines = lines.map(line => {
    const n = Number(line) - 0.5;
    if (!/^\d\.5$/.test(line) || n > 9) throw new MathInputError('lines', 'lines are 0.5 .. 9.5');
    const under = sum(total.slice(0, n + 1));
    return {line, under, over: ONE.sub(under)};
  });
  return envelope('poisson', {
    inputs: {lambda_home: lambdaHome, lambda_away: lambdaAway, lines},
    normalized: {lambda_home: lh, lambda_away: la},
    result: {home, draw, away, grid_coverage: covered, grid_max_goals: POISSON_GRID,
      btts_yes: ONE.sub(ph[0]).sub(pa[0]).add(ph[0].mul(pa[0])), lines: goalLines,
      expected_goals: {home: lh, away: la, total: lh.add(la)}, grid},
    warnings: ['INDEPENDENT_POISSON_BASELINE', 'MODEL_NOT_A_FORECAST', `GRID_TRUNCATED_AT_${POISSON_GRID}`],
  });
}
