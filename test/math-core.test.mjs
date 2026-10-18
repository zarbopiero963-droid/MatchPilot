// R-12 / MATH-CORE-01 (#94): Decimal and common contracts. The oracle is an independent exact rational implementation
// (BigInt numerator/denominator); property tests use a seeded generator, so every run checks the same cases.
import assert from 'node:assert/strict';
import test from 'node:test';
import {Decimal, DecimalError, ROUNDING, SCALE, sum} from '../src/math/decimal.mjs';
import {MATH_CORE_VERSION, MAX_ODDS, MathInputError, commissionRate, decimalOdds, envelope, fairOdds, impliedProbability,
  normalizedProbabilities, overround, probability, roundMoney} from '../src/math/core.mjs';

// ---- Independent oracle: exact fractions ----
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const frac = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return {n: n / g, d: d / g}; };
const fromText = text => {
  const [w, f = ''] = text.replace('-', '').split('.');
  const value = frac(BigInt(w + f), 10n ** BigInt(f.length));
  return text.startsWith('-') ? frac(-value.n, value.d) : value;
};
const fadd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fsub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const fmul = (a, b) => frac(a.n * b.n, a.d * b.d);
const fdiv = (a, b) => frac(a.n * b.d, a.d * b.n);
// |decimal - exact| <= tolerance (both as fractions); tolerance in units of 10^-18 by default.
const close = (decText, exact, ulps = 1n) => {
  const diff = fsub(fromText(decText), exact);
  const abs = diff.n < 0n ? -diff.n : diff.n;
  return abs * 10n ** BigInt(SCALE) <= ulps * diff.d;
};

// ---- Seeded generator ----
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const randomOdds = next => {
  const cents = 101 + Math.floor(next() * 99900); // 1.01 .. 1000.00
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
};

test('Decimal parses only plain decimal text and refuses binary floats', () => {
  assert.equal(Decimal.from('1.50').toString(), '1.5');
  assert.equal(Decimal.from('-0.000000000000000001').toString(), '-0.000000000000000001');
  assert.equal(Decimal.from(42).toString(), '42');
  assert.equal(Decimal.from(10n).toString(), '10');
  for (const bad of ['1e3', '0x10', '', ' ', '1.', '.5', '1,5', 'NaN', 'Infinity', '--1']) {
    assert.throws(() => Decimal.from(bad), DecimalError, bad);
  }
  assert.throws(() => Decimal.from(0.1), e => e.code === 'BINARY_FLOAT');
  assert.throws(() => Decimal.from(null), DecimalError);
  // More than SCALE decimals are rounded half-even on input.
  assert.equal(Decimal.from('0.0000000000000000015').toString(), '0.000000000000000002');
  assert.equal(Decimal.from('0.0000000000000000025').toString(), '0.000000000000000002');
});

test('Decimal arithmetic matches the exact oracle (golden and seeded cases)', () => {
  assert.equal(Decimal.from('0.1').add('0.2').toString(), '0.3', 'no binary float error');
  assert.equal(Decimal.from('1').div('3').toString(), '0.333333333333333333');
  assert.equal(Decimal.from('2').div('3').toString(), '0.666666666666666667');
  assert.equal(Decimal.from('-2').div('3').toString(), '-0.666666666666666667');
  assert.throws(() => Decimal.from('1').div('0'), e => e.code === 'DIVISION_BY_ZERO');
  const next = rng(20261018);
  for (let i = 0; i < 2000; i++) {
    const a = randomOdds(next);
    const b = randomOdds(next);
    const neg = next() < 0.3 ? `-${a}` : a;
    assert.ok(close(Decimal.from(neg).add(b).toString(), fadd(fromText(neg), fromText(b)), 0n), `add ${neg} ${b}`);
    assert.ok(close(Decimal.from(neg).sub(b).toString(), fsub(fromText(neg), fromText(b)), 0n), `sub ${neg} ${b}`);
    assert.ok(close(Decimal.from(neg).mul(b).toString(), fmul(fromText(neg), fromText(b)), 1n), `mul ${neg} ${b}`);
    assert.ok(close(Decimal.from(neg).div(b).toString(), fdiv(fromText(neg), fromText(b)), 1n), `div ${neg} ${b}`);
  }
});

test('rounding modes and step rounding are explicit and exact', () => {
  const cases = [
    ['2.345', 2, ROUNDING.HALF_EVEN, '2.34'], ['2.355', 2, ROUNDING.HALF_EVEN, '2.36'], ['2.345', 2, ROUNDING.HALF_UP, '2.35'],
    ['-2.345', 2, ROUNDING.HALF_UP, '-2.35'], ['-2.345', 2, ROUNDING.HALF_EVEN, '-2.34'], ['2.349', 2, ROUNDING.DOWN, '2.34'],
    ['-2.349', 2, ROUNDING.DOWN, '-2.34'], ['-2.341', 2, ROUNDING.FLOOR, '-2.35'], ['2.341', 2, ROUNDING.CEIL, '2.35'], ['2.34', 2, ROUNDING.CEIL, '2.34'],
  ];
  for (const [value, places, mode, expected] of cases) assert.equal(Decimal.from(value).round(places, mode).toString(), expected, `${value} ${mode}`);
  assert.equal(Decimal.from('10.37').roundToStep('0.05').toString(), '10.35');
  assert.equal(Decimal.from('10.375').roundToStep('0.05', ROUNDING.HALF_UP).toString(), '10.4');
  assert.equal(Decimal.from('10.37').roundToStep('0.5', ROUNDING.FLOOR).toString(), '10');
  assert.throws(() => Decimal.from('1').roundToStep('0'), DecimalError);
  assert.throws(() => Decimal.from('1').round(19), DecimalError);
  assert.equal(Decimal.from('1.5').toString(2), '1.50');
  assert.throws(() => Decimal.from('1.505').toString(2), e => e.code === 'PRECISION_LOSS', 'formatting never rounds silently');
  const money = roundMoney('12.345');
  assert.deepEqual([money.unrounded.toString(), money.rounded.toString()], ['12.345', '12.34'], 'unrounded value kept for audit');
});

test('validators refuse invalid odds, probabilities and commission rates', () => {
  for (const bad of ['1', '0.99', '-2', '0', 'abc', '']) assert.throws(() => decimalOdds('odds', bad), MathInputError, bad);
  assert.equal(decimalOdds('odds', '1.01').toString(), '1.01');
  for (const bad of ['-0.01', '1.01', 'x']) assert.throws(() => probability('p', bad), MathInputError, bad);
  assert.equal(probability('p', '0').toString(), '0');
  assert.throws(() => probability('p', '0', {open: true}), MathInputError);
  assert.throws(() => probability('p', '1', {open: true}), MathInputError);
  for (const bad of ['-0.01', '1', '1.5']) assert.throws(() => commissionRate('c', bad), MathInputError, bad);
  assert.equal(commissionRate('c', '0').toString(), '0');
  assert.equal(commissionRate('c', '0.05').toString(), '0.05');
  assert.throws(() => decimalOdds('odds', 2.5), e => e.field === 'odds', 'a JS float is not accepted as odds');
});

test('implied probability, overround, normalization and fair odds match the oracle (#94 golden vectors)', () => {
  const implied = impliedProbability({odds: '2.00'});
  assert.equal(implied.formula_version, MATH_CORE_VERSION);
  assert.equal(implied.result.probability, '0.5');
  assert.deepEqual(implied.warnings, ['RAW_IMPLIED_PROBABILITY']);
  const book = overround({odds: ['2.10', '3.40', '3.60']});
  const exactBook = [fromText('2.10'), fromText('3.40'), fromText('3.60')].reduce((a, o) => fadd(a, fdiv(frac(1n), o)), frac(0n));
  assert.ok(close(book.result.book, exactBook, 3n));
  assert.ok(close(book.result.overround, fsub(exactBook, frac(1n)), 3n));
  assert.deepEqual(overround({odds: ['2', '2']}).result, {book: '1', overround: '0'});
  assert.deepEqual(overround({odds: ['2.10', '2.10']}).warnings, ['BOOK_BELOW_ONE']);
  const norm = normalizedProbabilities({odds: ['2.10', '3.40', '3.60']});
  assert.equal(sum(norm.result.probabilities).toString(), '1', 'normalized probabilities sum exactly to 1');
  for (const [i, o] of ['2.10', '3.40', '3.60'].entries()) {
    assert.ok(close(norm.result.probabilities[i], fdiv(fdiv(frac(1n), fromText(o)), exactBook), 4n), `p${i}`);
  }
  assert.equal(fairOdds({probability: '0.25'}).result.odds, '4');
  assert.throws(() => fairOdds({probability: '0'}), MathInputError);
  assert.throws(() => overround({odds: ['2.0']}), MathInputError, 'one outcome is not a book');
});

test('property tests: probabilities in [0,1], normalized sums to 1, order preserved, round trips (seeded)', () => {
  const next = rng(94);
  for (let i = 0; i < 500; i++) {
    const n = 2 + Math.floor(next() * 6);
    const odds = Array.from({length: n}, () => randomOdds(next));
    const norm = normalizedProbabilities({odds}).result.probabilities;
    assert.equal(sum(norm).toString(), '1');
    for (const p of norm) assert.ok(Decimal.from(p).gte(0) && Decimal.from(p).lte(1));
    // Lower odds never get a lower normalized probability (up to the last-element remainder of 1e-18 per element).
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      if (Decimal.from(odds[a]).lt(odds[b])) assert.ok(Decimal.from(norm[a]).add(`0.${'0'.repeat(SCALE - 2)}${n}`).gte(norm[b]), `${odds[a]} vs ${odds[b]}`);
    }
    const p = impliedProbability({odds: odds[0]}).result.probability;
    const back = fairOdds({probability: p}).result.odds;
    assert.ok(Decimal.from(back).sub(odds[0]).abs().lte('0.000000001'), 'fair(implied(O)) = O within 1e-9 (#94 tolerance)');
    // Metamorphic: permuting the outcomes permutes the probabilities and keeps the book.
    const reversed = normalizedProbabilities({odds: [...odds].reverse()}).result;
    assert.equal(reversed.book, normalizedProbabilities({odds}).result.book);
  }
});

test('results are deterministic and never read the clock', () => {
  const input = {odds: ['1.85', '3.75', '4.50']};
  const first = JSON.stringify(normalizedProbabilities(input));
  const realNow = Date.now;
  Date.now = () => { throw new Error('the Math Core must not read the clock'); };
  try { assert.equal(JSON.stringify(normalizedProbabilities(input)), first); }
  finally { Date.now = realNow; }
});

// Independent rounding oracle: an exact fraction rounded to 18 decimals with floor-based definitions of each mode.
const floorDiv = (a, b) => (a >= 0n ? a / b : -((-a + b - 1n) / b));
function oracleUnits(x, mode) {
  const scaled = frac(x.n * 10n ** BigInt(SCALE), x.d);
  const floor = floorDiv(scaled.n, scaled.d);
  const ceil = -floorDiv(-scaled.n, scaled.d);
  const twiceRemainder = 2n * (scaled.n - floor * scaled.d); // 2 * (x - floor) * d, in [0, 2d)
  switch (mode) {
    case ROUNDING.FLOOR: return floor;
    case ROUNDING.CEIL: return ceil;
    case ROUNDING.DOWN: return scaled.n >= 0n ? floor : ceil;
    case ROUNDING.HALF_UP:
      if (twiceRemainder === scaled.d) return scaled.n >= 0n ? ceil : floor;
      return twiceRemainder < scaled.d ? floor : ceil;
    case ROUNDING.HALF_EVEN:
      if (twiceRemainder === scaled.d) return floor % 2n === 0n ? floor : ceil;
      return twiceRemainder < scaled.d ? floor : ceil;
  }
}
const units = text => { const f = fromText(text); return f.n * 10n ** BigInt(SCALE) / f.d; };

test('every rounding mode matches the oracle for parsing, mul and div with both signs (review B-1, NB-1)', () => {
  const next = rng(156);
  const modes = Object.values(ROUNDING);
  for (let i = 0; i < 1500; i++) {
    const sign = next() < 0.5 ? '-' : '';
    const digits = Array.from({length: 19 + Math.floor(next() * 6)}, () => Math.floor(next() * 10)).join('');
    const text = `${sign}${Math.floor(next() * 1000)}.${digits}`;
    const a = `${next() < 0.5 ? '-' : ''}${randomOdds(next)}`;
    const b = `${next() < 0.5 ? '-' : ''}${randomOdds(next)}`;
    for (const mode of modes) {
      assert.equal(units(Decimal.from(text, {mode}).toString()), oracleUnits(fromText(text), mode), `from ${text} ${mode}`);
      assert.equal(units(Decimal.from(a).mul(b, {mode}).toString()), oracleUnits(fmul(fromText(a), fromText(b)), mode), `mul ${a} ${b} ${mode}`);
      assert.equal(units(Decimal.from(a).div(b, {mode}).toString()), oracleUnits(fdiv(fromText(a), fromText(b)), mode), `div ${a} ${b} ${mode}`);
    }
  }
  assert.equal(Decimal.from('-1.0000000000000000001', {mode: ROUNDING.FLOOR}).toString(), '-1.000000000000000001');
  assert.equal(Decimal.from('-1.0000000000000000009', {mode: ROUNDING.CEIL}).toString(), '-1');
  assert.equal(Decimal.from('-2.341').round(2, ROUNDING.CEIL).toString(), '-2.34');
  assert.throws(() => Decimal.from('1.5').round(2, 'NEAREST'), e => e.code === 'BAD_ROUNDING', 'an unknown mode is refused even when no rounding is needed');
});

test('odds are bounded, money rounding reports input errors, envelopes copy their inputs (review NB-2..NB-4)', () => {
  assert.throws(() => decimalOdds('odds', '10000000000000000000'), MathInputError);
  assert.equal(decimalOdds('odds', MAX_ODDS).toString(), MAX_ODDS);
  assert.throws(() => normalizedProbabilities({odds: ['1.5', '2.9', '6', '3000000000000000000']}), MathInputError);
  for (const [value, opts] of [['x', {}], ['1', {step: '0'}], ['1', {step: '-1'}], ['1', {mode: 'NEAREST'}]]) {
    assert.throws(() => roundMoney(value, opts), MathInputError, `${value} ${JSON.stringify(opts)}`);
  }
  const odds = ['2.10', '3.40', '3.60'];
  const result = overround({odds});
  odds[0] = '9.99';
  assert.deepEqual(result.inputs.odds, ['2.10', '3.40', '3.60'], 'the audit record does not follow later caller changes');
  assert.equal(envelope('x', {inputs: {}, normalized: {}, result: {}, rounded: {policy_version: 'forged'}}).rounded.policy_version, 'mp-rounding-1');
  assert.equal(Decimal.from('  2.5 ').toString(), '2.5', 'surrounding whitespace is ignored (documented)');
});

test('envelopes built from Decimal inputs serialize to JSON and can be chained (second review B-1, NB-1, NB-2)', () => {
  const implied = impliedProbability({odds: Decimal.from('2.5')});
  assert.equal(JSON.parse(JSON.stringify(implied)).inputs.odds, '2.5');
  assert.deepEqual(JSON.parse(JSON.stringify(overround({odds: [Decimal.from('2'), '2.5']}))).inputs.odds, ['2', '2.5']);
  const chained = fairOdds({probability: Decimal.from(implied.result.probability)});
  assert.equal(JSON.parse(JSON.stringify(chained)).result.odds, '2.5');
  // mul in every mode, with operands whose product needs rounding at 18 decimals.
  const next = rng(1561);
  for (let i = 0; i < 1000; i++) {
    const digits = () => Array.from({length: 12}, () => Math.floor(next() * 10)).join('');
    const a = `${next() < 0.5 ? '-' : ''}${Math.floor(next() * 100)}.${digits()}`;
    const b = `${next() < 0.5 ? '-' : ''}${Math.floor(next() * 100)}.${digits()}`;
    for (const mode of Object.values(ROUNDING)) {
      assert.equal(units(Decimal.from(a).mul(b, {mode}).toString()), oracleUnits(fmul(fromText(a), fromText(b)), mode), `mul ${a} ${b} ${mode}`);
    }
  }
  assert.throws(() => Decimal.from('1.5', {mode: 'BOGUS'}), e => e.code === 'BAD_ROUNDING', 'an unknown mode is refused on input too');
});
