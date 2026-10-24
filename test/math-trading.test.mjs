// MATH-CORE-02..04, 06, 07 (#94): the Trading Tools formulas against the golden vectors of #94, hand vectors, an
// independent exact-fraction oracle (BigInt numerator/denominator, written from the #94 definitions, not from the code),
// an independent float oracle for Poisson, and seeded property and metamorphic tests (#94 "Test strategy").
// Tolerances (#94 "Precisione"): pure formulas within 1e-9, money after rounding within €0.01.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Decimal} from '../src/math/decimal.mjs';
import {MATH_CORE_VERSION, MathInputError} from '../src/math/core.mjs';
import {POISSON_GRID, dutchingBack, expectedValue, hedge, kelly, layLiability, poisson} from '../src/math/trading.mjs';

// ---- Independent oracle: exact fractions ----
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const F = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return {n: n / g, d: d / g}; };
const q = text => { const neg = text.startsWith('-'); const [w, f = ''] = text.replace('-', '').split('.'); const v = F(BigInt(w + f), 10n ** BigInt(f.length)); return neg ? F(-v.n, v.d) : v; };
const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => F(a.n * b.n, a.d * b.d);
const div = (a, b) => F(a.n * b.d, a.d * b.n);
const ONE = F(1n), ZERO = F(0n);
const gt0 = a => a.n > 0n;
const netQ = (g, c) => (gt0(g) ? mul(g, sub(ONE, c)) : g);
// |decimal − exact| <= tol (a fraction).
const within = (text, exact, tol) => { const d = sub(q(text), exact); const abs = F(d.n < 0n ? -d.n : d.n, d.d); return abs.n * tol.d <= tol.n * abs.d; };
const PURE = F(1n, 1000000000n); // 1e-9
const CENT = F(1n, 100n);
const assertPure = (text, exact, what) => assert.ok(within(text, exact, PURE), `${what}: ${text}`);
const assertMoney = (text, exact, what) => assert.ok(within(text, exact, CENT), `${what}: ${text}`);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cents = (next, lo, hi) => { const c = lo + Math.floor(next() * (hi - lo + 1)); return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`; };

// ---- TOOL 1: Stake & Kelly ----

test('Kelly: the #94 golden vectors and its outputs', () => {
  assert.equal(kelly({bankroll: '1000', odds: '2.00', probability: '0.50'}).result.kelly_full, '0', '#94: p 0.50, O 2.00 → Kelly 0');
  const k = kelly({bankroll: '1000', odds: '2.00', probability: '0.60'});
  assert.equal(k.result.kelly_full, '0.2', '#94: p 0.60, O 2.00 → Kelly 0.20');
  assert.equal(kelly({bankroll: '1000', odds: '2.00', probability: '0.60', fraction: '0.25'}).result.kelly_fractional, '0.05', '#94: fraction 0.25 → 0.05');
  assert.deepEqual([k.result.stake, k.result.implied_probability, k.result.edge, k.result.worst_case_loss, k.result.bankroll_after_loss, k.result.bankroll_after_win],
    ['200', '0.5', '0.2', '200', '800', '1200']);
  assert.equal(k.formula_version, MATH_CORE_VERSION);
  // No edge: NO BET, stake 0 (#94 "Se f* <= 0").
  const none = kelly({bankroll: '1000', odds: '1.50', probability: '0.40'});
  assert.ok(Decimal.from(none.result.kelly_full).lt(0));
  assert.deepEqual([none.result.stake, none.rounded.stake, none.warnings[0]], ['0', '0', 'NO_BET']);
});

test('Kelly: caps (#94 stake_final = min(stake, max_stake, B·max_bankroll)) and rounding down to the cent', () => {
  const capped = kelly({bankroll: '1000', odds: '2.00', probability: '0.60', maxStake: '120'});
  assert.deepEqual([capped.result.stake, capped.result.governing_limit], ['120', 'MAX_STAKE']);
  assert.ok(capped.warnings.includes('CAPPED_BY_MAX_STAKE'));
  const share = kelly({bankroll: '1000', odds: '2.00', probability: '0.60', maxStake: '120', maxBankroll: '0.1'});
  assert.deepEqual([share.result.stake, share.result.governing_limit], ['100', 'MAX_BANKROLL']);
  // f* = (2.1·0.33 − 0.67)/2.1 = 0.0109523…; B = 333.33 → 3.6507…: rounded down, never above Kelly.
  const odd = kelly({bankroll: '333.33', odds: '3.10', probability: '0.33'});
  assert.equal(odd.rounded.stake, '3.65');
  assert.ok(Decimal.from(odd.rounded.stake).lte(odd.result.stake));
});

test('Kelly: refusals name the field', () => {
  for (const [input, field] of [[{bankroll: '0', odds: '2', probability: '0.6'}, 'bankroll'], [{bankroll: '10', odds: '1', probability: '0.6'}, 'odds'],
    [{bankroll: '10', odds: '2', probability: '1'}, 'probability'], [{bankroll: '10', odds: '2', probability: '-0.1'}, 'probability'],
    [{bankroll: '10', odds: '2', probability: '0.6', fraction: '0'}, 'fraction'], [{bankroll: '10', odds: '2', probability: '0.6', fraction: '1.5'}, 'fraction'],
    [{bankroll: '10', odds: '2', probability: '0.6', maxStake: '-1'}, 'max_stake'], [{bankroll: '10', odds: '2', probability: '0.6', maxBankroll: '2'}, 'max_bankroll']]) {
    assert.throws(() => kelly(input), e => e instanceof MathInputError && e.field === field, JSON.stringify(input));
  }
});

test('Kelly: exact oracle and metamorphic doubling (2000 seeded cases)', () => {
  const next = rng(94001);
  for (let i = 0; i < 2000; i++) {
    const B = cents(next, 100, 10000000), O = cents(next, 101, 5000), p = cents(next, 1, 99).replace(/^0\./, '0.'), a = cents(next, 1, 100);
    const r = kelly({bankroll: B, odds: O, probability: p, fraction: a}).result;
    const b = sub(q(O), ONE), full = div(sub(mul(b, q(p)), sub(ONE, q(p))), b);
    assertPure(r.kelly_full, full, 'f*');
    const stake = gt0(full) ? mul(mul(q(B), full), q(a)) : ZERO;
    assertMoney(r.stake, stake, 'stake');
    assert.ok(!Decimal.from(r.stake).isNegative());
    // Doubling the bankroll doubles the stake before caps (#94 metamorphic).
    const doubled = kelly({bankroll: Decimal.from(B).mul(2).toString(), odds: O, probability: p, fraction: a}).result;
    assertPure(doubled.stake, mul(q(r.stake), F(2n)), 'doubled');
  }
});

// ---- TOOL 2: Value / EV ----

test('EV: #94 definitions, with and without commission', () => {
  const e = expectedValue({stake: '10', odds: '2.10', probability: '0.50'});
  assert.deepEqual([e.result.expected_value, e.result.roi, e.result.fair_odds, e.result.edge, e.result.break_even_probability],
    ['0.5', '0.05', '2', '0.05', '0.476190476190476190'.replace(/0+$/, '')]);
  // EV = S·(p·O − 1) without commission (#94 "Equivalent").
  assert.equal(e.result.expected_value, Decimal.from('10').mul(Decimal.from('0.5').mul('2.10').sub(1)).toString());
  const c = expectedValue({stake: '10', odds: '2.10', probability: '0.50', commission: '0.05'});
  assert.deepEqual([c.result.expected_value, c.rounded.expected_value, c.result.profit_if_wins], ['0.225', '0.22', '10.45']);
  assert.ok(c.warnings.includes('POSITIVE_EV') && c.warnings.includes('COMMISSION_ON_NET_WINNINGS'));
  assert.equal(expectedValue({stake: '10', odds: '2', probability: '0.5'}).warnings[0], 'ZERO_EV');
  assert.equal(expectedValue({stake: '10', odds: '1.8', probability: '0.5'}).warnings[0], 'NEGATIVE_EV');
});

test('EV: exact oracle; EV is zero at the break-even probability (2000 seeded cases)', () => {
  const next = rng(94002);
  for (let i = 0; i < 2000; i++) {
    const S = cents(next, 1, 1000000), O = cents(next, 101, 100000), p = cents(next, 1, 99), c = cents(next, 0, 10);
    const r = expectedValue({stake: S, odds: O, probability: p, commission: c}).result;
    const win = mul(mul(q(S), sub(q(O), ONE)), sub(ONE, q(c)));
    const ev = sub(mul(q(p), win), mul(sub(ONE, q(p)), q(S)));
    assertPure(r.expected_value, ev, 'EV');
    assertPure(r.edge, sub(div(q(O), div(ONE, q(p))), ONE), 'edge');
    const be = div(ONE, add(mul(sub(q(O), ONE), sub(ONE, q(c))), ONE));
    assertPure(r.break_even_probability, be, 'break-even');
    const atBe = sub(mul(be, win), mul(sub(ONE, be), q(S)));
    assert.equal(atBe.n, 0n, 'EV_net(p_break_even) = 0 exactly');
  }
});

// ---- TOOL 3: Liability ----

test('Liability: #94 definitions, break-even and the bankroll warning', () => {
  const l = layLiability({stake: '10', odds: '3', commission: '0.05', bankroll: '15'});
  assert.deepEqual([l.result.liability, l.result.net_profit_if_selection_loses, l.result.loss_if_selection_wins], ['20', '9.5', '20']);
  assertPure(l.result.break_even_probability, div(F(95n, 100n), F(295n, 100n)), 'p = (1 − c)/(O − c)');
  assert.ok(l.warnings.includes('LIABILITY_ABOVE_BANKROLL'));
  assert.ok(!layLiability({stake: '10', odds: '3', bankroll: '20'}).warnings.includes('LIABILITY_ABOVE_BANKROLL'), 'equal is not above');
  assert.equal(layLiability({stake: '10', odds: '3'}).result.liability_share_of_bankroll, null);
  const next = rng(94003);
  for (let i = 0; i < 1000; i++) {
    const L = cents(next, 1, 1000000), O = cents(next, 101, 100000), c = cents(next, 0, 10);
    const r = layLiability({stake: L, odds: O, commission: c}).result;
    assert.ok(!Decimal.from(r.liability).isNegative(), 'liability >= 0');
    assertPure(r.liability, mul(q(L), sub(q(O), ONE)), 'liability');
    // At p_break_even the lay has zero expected value: (1 − p)·L·(1 − c) − p·L·(O − 1) = 0.
    const p = div(sub(ONE, q(c)), sub(q(O), q(c)));
    assert.equal(sub(mul(mul(sub(ONE, p), q(L)), sub(ONE, q(c))), mul(mul(p, q(L)), sub(q(O), ONE))).n, 0n);
    assertPure(r.break_even_probability, p, 'break-even');
  }
});

// ---- TOOL 4 and 5: hedge ----

test('Hedge: #94 BACK → LAY and LAY → BACK, green pre-commission = B·(O_b/O_l − 1)', () => {
  const h = hedge({side: 'BACK', stake: '10', odds: '3', exitOdds: '2'});
  assert.deepEqual([h.result.hedge_side, h.result.hedge_stake, h.result.gross.if_wins, h.result.gross.if_loses, h.result.hedge_liability], ['LAY', '15', '5', '5', '15']);
  assert.equal(h.result.gross.if_wins, Decimal.from('10').mul(Decimal.from('3').div('2').sub(1)).toString(), '#94 green');
  const c = hedge({side: 'BACK', stake: '10', odds: '3', exitOdds: '2', commission: '0.05'});
  assert.deepEqual([c.result.after.if_wins, c.result.after.if_loses, c.warnings[0]], ['4.75', '4.75', 'GREEN']);
  const red = hedge({side: 'BACK', stake: '10', odds: '2', exitOdds: '3', commission: '0.05'});
  assert.deepEqual([red.result.after.if_wins, red.result.after.if_loses, red.warnings[0]], ['-3.34', '-3.33', 'RED'], 'a loss pays no commission (cent rounding of the hedge stake)');
  const lay = hedge({side: 'LAY', stake: '10', odds: '2', exitOdds: '3'});
  assert.deepEqual([lay.result.hedge_side, lay.result.hedge_stake, lay.result.hedge_stake_theoretical.slice(0, 8)], ['BACK', '6.67', '6.666666']);
  assert.deepEqual([lay.result.gross.if_wins, lay.result.gross.if_loses, lay.result.residual_imbalance], ['3.34', '3.33', '0.01'], 'the cent rounding is reported');
  assert.ok(h.warnings.includes('LIQUIDITY_UNAVAILABLE') && h.result.liquidity === 'UNAVAILABLE', '#94: no certified liquidity source');
  // The LAY hedge of a BACK risks H·(O_l − 1); the BACK hedge of a LAY risks its stake.
  assert.deepEqual([hedge({side: 'BACK', stake: '10', odds: '3', exitOdds: '2.5'}).result.hedge_stake, hedge({side: 'BACK', stake: '10', odds: '3', exitOdds: '2.5'}).result.hedge_liability], ['12', '18']);
  // The rounding residual is a size, never negative, also when the win side is the lower one.
  const low = hedge({side: 'BACK', stake: '10', odds: '3', exitOdds: '7'}).result;
  assert.deepEqual([low.hedge_stake, low.after.if_wins, low.after.if_loses, low.residual_imbalance], ['4.29', '-5.74', '-5.71', '0.03']);
  assert.throws(() => hedge({side: 'X', stake: '10', odds: '2', exitOdds: '3'}), e => e.field === 'side');
  assert.throws(() => hedge({side: 'BACK', stake: '0.001', odds: '2', exitOdds: '300'}), e => e.field === 'stake');
});

test('Hedge: exact oracle per outcome, equalized within the cent rounding (2000 seeded cases)', () => {
  const next = rng(94004);
  for (let i = 0; i < 2000; i++) {
    const side = next() < 0.5 ? 'BACK' : 'LAY';
    const S = cents(next, 100, 100000), O = cents(next, 101, 2000), X = cents(next, 101, 2000), c = cents(next, 0, 10);
    const r = hedge({side, stake: S, odds: O, exitOdds: X, commission: c}).result;
    const H = q(r.hedge_stake);
    assertMoney(r.hedge_stake, div(mul(q(S), q(O)), q(X)), 'hedge stake');
    const [bs, bo, ls, lo] = side === 'BACK' ? [q(S), q(O), H, q(X)] : [H, q(X), q(S), q(O)];
    const win = sub(mul(bs, sub(bo, ONE)), mul(ls, sub(lo, ONE))), lose = sub(ls, bs);
    assertPure(r.after.if_wins, netQ(win, q(c)), 'win');
    assertPure(r.after.if_loses, netQ(lose, q(c)), 'lose');
    assertPure(r.hedge_liability, side === 'BACK' ? mul(H, sub(q(X), ONE)) : H, 'hedge liability');
    assertPure(r.residual_imbalance, F(sub(q(r.after.if_wins), q(r.after.if_loses)).n < 0n ? -sub(q(r.after.if_wins), q(r.after.if_loses)).n : sub(q(r.after.if_wins), q(r.after.if_loses)).n, sub(q(r.after.if_wins), q(r.after.if_loses)).d), 'residual = |win − lose|');
    // Equalized up to the rounding of the hedge stake: |ΔH|·max(odds) <= 0.005·max(O, X).
    const bound = mul(F(5n, 1000n), q(Decimal.from(O).gt(X) ? O : X));
    assert.ok(within(r.after.if_wins, q(r.after.if_loses), bound), `${side} ${S}@${O}→${X}`);
  }
});

// ---- TOOL 7: Dutching BACK ----

test('Dutching BACK: #94 K, R, S_i and the rounded outcomes', () => {
  const d = dutchingBack({total: '100', odds: ['4', '5', '6']});
  assertPure(d.result.book, F(37n, 60n), 'K');
  assertPure(d.result.target_return, F(6000n, 37n), 'R = T/K');
  assert.deepEqual([d.result.stakes, d.result.placed], [['40.54', '32.43', '27.03'], '100']);
  assert.deepEqual(d.result.if_wins, ['62.16', '62.15', '62.18']);
  assert.deepEqual([d.result.if_none_wins, d.warnings[0]], ['-100', 'BOOK_BELOW_ONE']);
  assert.equal(dutchingBack({total: '100', odds: ['1.5', '2.5', '6']}).warnings[0], 'BOOK_AT_LEAST_ONE');
  const dup = dutchingBack({total: '50', odds: ['3', '3']});
  assert.deepEqual(dup.result.stakes, ['25', '25'], 'duplicate odds');
  for (const [input, field] of [[{total: '100', odds: ['2']}, 'odds'], [{total: '100', odds: ['2', '1']}, 'odds[1]'], [{total: '0', odds: ['2', '3']}, 'total']]) {
    assert.throws(() => dutchingBack(input), e => e instanceof MathInputError && e.field === field);
  }
});

test('Dutching BACK: exact oracle, uniform payout before rounding, permutation (1000 seeded cases)', () => {
  const next = rng(94007);
  for (let i = 0; i < 1000; i++) {
    const n = 2 + Math.floor(next() * 6);
    const odds = Array.from({length: n}, () => cents(next, 101, 3000));
    const T = cents(next, 1000, 1000000), c = cents(next, 0, 10);
    const r = dutchingBack({total: T, odds, commission: c}).result;
    const K = odds.reduce((acc, o) => add(acc, div(ONE, q(o))), ZERO), R = div(q(T), K);
    assertPure(r.target_return, R, 'R');
    odds.forEach((o, k) => {
      assertPure(r.stakes_theoretical[k], div(R, q(o)), 'S_i');
      assertPure(Decimal.from(r.stakes_theoretical[k]).mul(o).toString(), R, 'uniform payout');
      assertMoney(r.stakes[k], div(R, q(o)), 'rounded stake');
      assertPure(r.if_wins[k], netQ(sub(mul(q(r.stakes[k]), q(o)), q(r.placed)), q(c)), 'outcome');
    });
    // Permuting the outcomes permutes the stakes and keeps the total (#94 metamorphic).
    const order = odds.map((_, k) => k).reverse();
    const p = dutchingBack({total: T, odds: order.map(k => odds[k]), commission: c}).result;
    assert.deepEqual(p.stakes, order.map(k => r.stakes[k]));
    assert.equal(p.placed, r.placed);
  }
});

// ---- TOOL 12: Poisson ----

// Independent float oracle: P(X = k) = e^−λ λ^k / k!, computed with Math.exp and a running product.
const pmfFloat = (l, k) => { let p = Math.exp(-l); for (let i = 1; i <= k; i++) p *= l / i; return p; };

test('Poisson: λ = 0, the #94 BTTS formula, lines, and an independent float oracle', () => {
  const zero = poisson({lambdaHome: '0', lambdaAway: '0'}).result;
  assert.deepEqual([zero.home, zero.draw, zero.away, zero.btts_yes, zero.grid_coverage], ['0', '1', '0', '0', '1']);
  for (const [lh, la] of [['1.4', '1.1'], ['0.3', '2.7'], ['2', '2'], ['4.5', '0.8'], ['10', '10']]) {
    const r = poisson({lambdaHome: lh, lambdaAway: la}).result;
    let home = 0, draw = 0, away = 0;
    for (let i = 0; i <= POISSON_GRID; i++) for (let j = 0; j <= POISSON_GRID; j++) {
      const p = pmfFloat(Number(lh), i) * pmfFloat(Number(la), j);
      if (i > j) home += p; else if (i === j) draw += p; else away += p;
      assert.ok(Math.abs(Number(r.grid[i][j]) - p) < 1e-9, `${lh}/${la} ${i}-${j}`);
    }
    for (const [mine, theirs] of [[r.home, home], [r.draw, draw], [r.away, away]]) assert.ok(Math.abs(Number(mine) - theirs) < 1e-9);
    const h0 = pmfFloat(Number(lh), 0), a0 = pmfFloat(Number(la), 0);
    assert.ok(Math.abs(Number(r.btts_yes) - (1 - h0 - a0 + h0 * a0)) < 1e-9, 'BTTS');
    const total = Number(lh) + Number(la);
    for (const line of r.lines) {
      let under = 0;
      for (let k = 0; k <= Number(line.line) - 0.5; k++) under += pmfFloat(total, k);
      assert.ok(Math.abs(Number(line.under) - under) < 1e-9, `under ${line.line}`);
      assert.equal(Decimal.from(line.under).add(line.over).toString(), '1');
    }
    // The 1X2 mass is the covered mass of the declared grid.
    assert.equal(Decimal.from(r.home).add(r.draw).add(r.away).toString(), r.grid_coverage);
    assert.ok(Number(r.grid_coverage) > 0.9999999, `coverage ${r.grid_coverage}`);
    assert.deepEqual(r.expected_goals, {home: lh, away: la, total: Decimal.from(lh).add(la).toString()});
  }
  assert.throws(() => poisson({lambdaHome: '10.01', lambdaAway: '1'}), e => e.field === 'lambda_home');
  assert.throws(() => poisson({lambdaHome: '1', lambdaAway: '-1'}), e => e.field === 'lambda_away');
});

test('Poisson: probabilities are non-negative, swapping the teams swaps 1 and 2 (200 seeded cases)', () => {
  const next = rng(94012);
  for (let i = 0; i < 200; i++) {
    const lh = cents(next, 0, 600), la = cents(next, 0, 600);
    const r = poisson({lambdaHome: lh, lambdaAway: la}).result, s = poisson({lambdaHome: la, lambdaAway: lh}).result;
    assert.ok(r.grid.flat().every(p => !Decimal.from(p).isNegative()));
    assert.deepEqual([s.home, s.draw, s.away], [r.away, r.draw, r.home]);
    assert.equal(s.btts_yes, r.btts_yes);
  }
});

test('the formulas are deterministic and serialize to JSON', () => {
  const a = JSON.stringify([kelly({bankroll: '500', odds: '2.5', probability: '0.45', fraction: '0.5'}), hedge({side: 'LAY', stake: '20', odds: '4', exitOdds: '5', commission: '0.02'}),
    dutchingBack({total: '30', odds: ['2.2', '3.3', '9']}), poisson({lambdaHome: '1.7', lambdaAway: '0.9'})]);
  const b = JSON.stringify([kelly({bankroll: '500', odds: '2.5', probability: '0.45', fraction: '0.5'}), hedge({side: 'LAY', stake: '20', odds: '4', exitOdds: '5', commission: '0.02'}),
    dutchingBack({total: '30', odds: ['2.2', '3.3', '9']}), poisson({lambdaHome: '1.7', lambdaAway: '0.9'})]);
  assert.equal(a, b);
  assert.ok(!/NaN|Infinity/.test(a));
});
