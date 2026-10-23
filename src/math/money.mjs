// HIST-01a / MATH-CORE (#94, #99; MP-MTH-003): settlement P/L of the bets of one market with exchange commission.
// Same contract as core.mjs: validated inputs, Decimal arithmetic, unrounded results kept for audit, rounded values with
// the rounding policy beside them. Pure module: no database, no network, no clock.
import {Decimal, ROUNDING, sum} from './decimal.mjs';
import {MathInputError, commissionRate, decimalOdds, envelope, nonNegative} from './core.mjs';

export const MONEY_STEP = '0.01';
export const SIDES = ['BACK', 'LAY'];
export const OUTCOMES = ['WIN', 'LOSE', 'VOID'];

const ZERO = Decimal.zero();
const cents = value => value.roundToStep(MONEY_STEP, ROUNDING.HALF_EVEN);

function positive(field, value) {
  const v = nonNegative(field, value);
  if (v.isZero()) throw new MathInputError(field, 'must be positive');
  return v;
}

// Gross P/L of one bet, from the bettor's side: BACK wins S·(O − 1) or loses S; LAY loses S·(O − 1) when the selection
// wins and wins S when it loses; VOID returns the stake (0). `outcome` is the selection's result.
export function grossProfit(side, stake, odds, outcome) {
  if (outcome === 'VOID') return ZERO;
  const won = outcome === 'WIN';
  if (side === 'BACK') return won ? stake.mul(odds.sub(1)) : stake.neg();
  return won ? stake.mul(odds.sub(1)).neg() : stake;
}

// Exchange commission is charged on the net winnings of the market: commission = max(0, Σ gross)·c. The rounded block
// rounds the market totals (not each bet) to the cent, and net = gross − commission exactly, so it reconciles.
export function settleMarket({bets, commission = '0'}) {
  if (!Array.isArray(bets) || bets.length === 0) throw new MathInputError('bets', 'at least one bet is required');
  const c = commissionRate('commission', commission);
  const legs = bets.map((bet, i) => {
    const field = `bets[${i}]`;
    if (!bet || typeof bet !== 'object') throw new MathInputError(field, 'must be an object');
    if (!SIDES.includes(bet.side)) throw new MathInputError(`${field}.side`, `must be one of ${SIDES.join(', ')}`);
    if (!OUTCOMES.includes(bet.outcome)) throw new MathInputError(`${field}.outcome`, `must be one of ${OUTCOMES.join(', ')}`);
    const stake = positive(`${field}.stake`, bet.stake);
    const odds = decimalOdds(`${field}.odds`, bet.odds);
    return {side: bet.side, outcome: bet.outcome, stake, odds, gross: grossProfit(bet.side, stake, odds, bet.outcome)};
  });
  const gross = sum(legs.map(leg => leg.gross));
  const charged = gross.gt(0) ? gross.mul(c) : ZERO;
  const roundedGross = cents(gross);
  const roundedCommission = cents(charged);
  return envelope('settle_market', {
    inputs: {bets, commission},
    normalized: {bets: legs.map(({side, outcome, stake, odds}) => ({side, outcome, stake, odds})), commission_rate_used: c},
    result: {legs: legs.map(leg => ({side: leg.side, outcome: leg.outcome, gross: leg.gross})), gross, commission: charged, net: gross.sub(charged)},
    rounded: {gross: roundedGross, commission: roundedCommission, net: roundedGross.sub(roundedCommission), step: MONEY_STEP, mode: ROUNDING.HALF_EVEN},
    warnings: ['COMMISSION_ON_MARKET_NET_WINNINGS'],
  });
}
