// R-12 / MATH-CORE-01 (#94): common contracts of the Math Core. Every formula validates its inputs, computes in
// fixed-precision Decimal and returns a versioned envelope. Odds are decimal odds only (#94 "Formato quote").
// Pure module: no database, no network, no clock.
import {Decimal, DecimalError, ROUNDING, sum} from './decimal.mjs';

export const MATH_CORE_VERSION = 'mp-math-core-1';
export const ROUNDING_POLICY_VERSION = 'mp-rounding-1';

export class MathInputError extends Error {
  constructor(field, message) {
    super(`${field}: ${message}`);
    this.code = 'BAD_MATH_INPUT';
    this.field = field;
  }
}

function parse(field, value) {
  try { return Decimal.from(value); }
  catch (error) {
    if (error instanceof DecimalError) throw new MathInputError(field, error.message);
    throw error;
  }
}

// ---- Validators ----

// Exchange decimal odds stop at 1000; MAX_ODDS leaves headroom while keeping 1/O far above the 1e-18 resolution.
export const MAX_ODDS = '1000000';

export function decimalOdds(field, value) {
  const o = parse(field, value);
  if (!o.gt(1)) throw new MathInputError(field, 'decimal odds must be greater than 1');
  if (o.gt(MAX_ODDS)) throw new MathInputError(field, `decimal odds must be at most ${MAX_ODDS}`);
  return o;
}

export function probability(field, value, {open = false} = {}) {
  const p = parse(field, value);
  if (p.lt(0) || p.gt(1)) throw new MathInputError(field, 'probability must be between 0 and 1');
  if (open && (p.isZero() || p.eq(1))) throw new MathInputError(field, 'probability must be strictly between 0 and 1');
  return p;
}

export function nonNegative(field, value) {
  const v = parse(field, value);
  if (v.isNegative()) throw new MathInputError(field, 'must not be negative');
  return v;
}

// Exchange commission on net winnings, as a fraction: 0 <= c < 1 (e.g. "0.05" for 5%).
export function commissionRate(field, value) {
  const c = parse(field, value);
  if (c.isNegative() || !c.lt(1)) throw new MathInputError(field, 'commission rate must be at least 0 and below 1');
  return c;
}

export function oddsList(field, values, {min = 2} = {}) {
  if (!Array.isArray(values) || values.length < min) throw new MathInputError(field, `at least ${min} decimal odds are required`);
  return values.map((value, i) => decimalOdds(`${field}[${i}]`, value));
}

// ---- Result envelope ----

// JSON-safe copy: Decimal and BigInt as decimal text, Date as ISO text, arrays and plain objects copied recursively.
const show = value => (value instanceof Decimal ? value.toString() : typeof value === 'bigint' ? value.toString()
  : value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(show)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, show(v)])) : value);

// formula: stable name; inputs: what the caller passed; normalized: the validated values used; result: unrounded
// values (kept for audit); rounded: optional display/settlement values with the policy that produced them.
// The envelope holds copies (Decimal values as text), so a caller changing its own objects later cannot alter the
// audit record, and the envelope always serializes to JSON.
export function envelope(formula, {inputs, normalized, result, rounded = null, warnings = []}) {
  return {
    formula,
    formula_version: MATH_CORE_VERSION,
    inputs: show(inputs),
    normalized_inputs: show(normalized),
    result: show(result),
    rounded: rounded ? {...show(rounded), policy_version: ROUNDING_POLICY_VERSION} : null,
    warnings: [...warnings],
  };
}

// ---- Base formulas (#94 "Regole matematiche generali") ----

// p_implied = 1 / O (raw implied probability, margin included).
export function impliedProbability({odds}) {
  const o = decimalOdds('odds', odds);
  return envelope('implied_probability', {inputs: {odds}, normalized: {odds: o}, result: {probability: Decimal.one().div(o)},
    warnings: ['RAW_IMPLIED_PROBABILITY']});
}

// overround = Σ(1 / O_i) - 1 for an exhaustive set of mutually exclusive outcomes.
export function overround({odds}) {
  const list = oddsList('odds', odds);
  const book = sum(list.map(o => Decimal.one().div(o)));
  return envelope('overround', {inputs: {odds}, normalized: {odds: list}, result: {book, overround: book.sub(1)},
    warnings: book.lt(1) ? ['BOOK_BELOW_ONE'] : []});
}

// p_i_norm = (1/O_i) / Σ(1/O_j) (margin-normalized, proportional method). The last probability absorbs the rounding
// remainder so the vector sums exactly to 1.
export function normalizedProbabilities({odds}) {
  const list = oddsList('odds', odds);
  const raw = list.map(o => Decimal.one().div(o));
  const book = sum(raw);
  const probabilities = raw.map(r => r.div(book));
  probabilities[probabilities.length - 1] = Decimal.one().sub(sum(probabilities.slice(0, -1)));
  return envelope('normalized_probabilities', {inputs: {odds}, normalized: {odds: list}, result: {book, probabilities},
    warnings: ['MARGIN_NORMALIZED_PROPORTIONAL']});
}

// O_fair = 1 / p.
export function fairOdds({probability: p}) {
  const value = probability('probability', p, {open: true});
  return envelope('fair_odds', {inputs: {probability: p}, normalized: {probability: value}, result: {odds: Decimal.one().div(value)}});
}

// Money rounding helper: keeps the unrounded value and the value rounded to a step (default one cent).
export function roundMoney(value, {step = '0.01', mode = ROUNDING.HALF_EVEN} = {}) {
  const v = parse('value', value);
  const s = nonNegative('step', step);
  if (s.isZero()) throw new MathInputError('step', 'must be positive');
  try { return {unrounded: v, rounded: v.roundToStep(s, mode), step: s, mode}; }
  catch (error) {
    if (error instanceof DecimalError) throw new MathInputError('mode', error.message);
    throw error;
  }
}
