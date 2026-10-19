// R-12 / MATH-CORE-01 (#94): fixed-precision decimal arithmetic for the Math Core. Values are BigInt multiples of
// 10^-SCALE, so money and probabilities never pass through binary floating point. Inputs are decimal strings
// (surrounding whitespace is ignored), BigInts or safe integers; a non-integer JS number is refused because it may
// already carry a binary error.

export const SCALE = 18;
const UNIT = 10n ** BigInt(SCALE);

export const ROUNDING = Object.freeze({HALF_EVEN: 'HALF_EVEN', HALF_UP: 'HALF_UP', DOWN: 'DOWN', FLOOR: 'FLOOR', CEIL: 'CEIL'});

export class DecimalError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const DECIMAL_TEXT = /^([+-])?(\d+)(?:\.(\d+))?$/;

const MODES = new Set(Object.values(ROUNDING));
const checkMode = mode => {
  if (!MODES.has(mode)) throw new DecimalError('BAD_ROUNDING', `unknown rounding mode ${mode}`);
};

// Integer division of n by d (d > 0) rounded with the given mode.
function divRound(n, d, mode) {
  checkMode(mode);
  if (d <= 0n) throw new DecimalError('INTERNAL', 'divisor must be positive');
  const q = n / d; // truncates toward zero
  const r = n % d;
  if (r === 0n) return q;
  const negative = n < 0n;
  const away = negative ? q - 1n : q + 1n;
  switch (mode) {
    case ROUNDING.DOWN: return q;
    case ROUNDING.FLOOR: return negative ? q - 1n : q;
    case ROUNDING.CEIL: return negative ? q : q + 1n;
    case ROUNDING.HALF_UP:
    case ROUNDING.HALF_EVEN: {
      const twice = (r < 0n ? -r : r) * 2n;
      if (twice > d) return away;
      if (twice < d) return q;
      if (mode === ROUNDING.HALF_UP) return away;
      return q % 2n === 0n ? q : away;
    }
    default: throw new DecimalError('BAD_ROUNDING', `unknown rounding mode ${mode}`);
  }
}

export class Decimal {
  // units: BigInt count of 10^-SCALE.
  constructor(units) {
    if (typeof units !== 'bigint') throw new DecimalError('INTERNAL', 'Decimal units must be a BigInt');
    this.units = units;
    Object.freeze(this);
  }

  static from(value, {mode = ROUNDING.HALF_EVEN} = {}) {
    checkMode(mode);
    if (value instanceof Decimal) return value;
    if (typeof value === 'bigint') return new Decimal(value * UNIT);
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new DecimalError('BINARY_FLOAT', 'pass non-integer values as decimal strings, not JS numbers');
      return new Decimal(BigInt(value) * UNIT);
    }
    if (typeof value !== 'string') throw new DecimalError('BAD_DECIMAL', 'expected a decimal string');
    const match = DECIMAL_TEXT.exec(value.trim());
    if (!match) throw new DecimalError('BAD_DECIMAL', `not a plain decimal: ${String(value).slice(0, 40)}`);
    const [, sign, whole, fraction = ''] = match;
    // Sign first, then round: FLOOR and CEIL depend on it.
    const digits = (sign === '-' ? -1n : 1n) * BigInt(whole + fraction);
    const exponent = fraction.length;
    if (exponent <= SCALE) return new Decimal(digits * 10n ** BigInt(SCALE - exponent));
    return new Decimal(divRound(digits, 10n ** BigInt(exponent - SCALE), mode));
  }

  static zero() { return ZERO; }
  static one() { return ONE; }

  add(other) { return new Decimal(this.units + Decimal.from(other).units); }
  sub(other) { return new Decimal(this.units - Decimal.from(other).units); }
  neg() { return new Decimal(-this.units); }
  abs() { return this.units < 0n ? this.neg() : this; }

  mul(other, {mode = ROUNDING.HALF_EVEN} = {}) {
    return new Decimal(divRound(this.units * Decimal.from(other).units, UNIT, mode));
  }

  div(other, {mode = ROUNDING.HALF_EVEN} = {}) {
    const d = Decimal.from(other).units;
    if (d === 0n) throw new DecimalError('DIVISION_BY_ZERO', 'division by zero');
    const n = this.units * UNIT;
    return new Decimal(d < 0n ? divRound(-n, -d, mode) : divRound(n, d, mode));
  }

  cmp(other) {
    const o = Decimal.from(other).units;
    return this.units < o ? -1 : this.units > o ? 1 : 0;
  }
  eq(other) { return this.cmp(other) === 0; }
  lt(other) { return this.cmp(other) < 0; }
  lte(other) { return this.cmp(other) <= 0; }
  gt(other) { return this.cmp(other) > 0; }
  gte(other) { return this.cmp(other) >= 0; }
  isZero() { return this.units === 0n; }
  isNegative() { return this.units < 0n; }

  // Rounds to `places` decimal places (0..SCALE).
  round(places, mode = ROUNDING.HALF_EVEN) {
    if (!Number.isInteger(places) || places < 0 || places > SCALE) throw new DecimalError('BAD_ROUNDING', `places must be 0..${SCALE}`);
    const step = 10n ** BigInt(SCALE - places);
    return new Decimal(divRound(this.units, step, mode) * step);
  }

  // Rounds to a multiple of `step` (> 0), e.g. a stake increment of 0.01 or a price tick.
  roundToStep(step, mode = ROUNDING.HALF_EVEN) {
    const s = Decimal.from(step).units;
    if (s <= 0n) throw new DecimalError('BAD_ROUNDING', 'step must be positive');
    return new Decimal(divRound(this.units, s, mode) * s);
  }

  // Exact text: no trailing zeros, at most SCALE decimals; `places` pads to a fixed number of decimals (no rounding).
  toString(places = null) {
    const negative = this.units < 0n;
    const abs = negative ? -this.units : this.units;
    const whole = abs / UNIT;
    let fraction = (abs % UNIT).toString().padStart(SCALE, '0');
    if (places === null) fraction = fraction.replace(/0+$/, '');
    else {
      if (!Number.isInteger(places) || places < 0 || places > SCALE) throw new DecimalError('BAD_ROUNDING', `places must be 0..${SCALE}`);
      if (/[^0]/.test(fraction.slice(places))) throw new DecimalError('PRECISION_LOSS', `value has more than ${places} decimals; round it first`);
      fraction = fraction.slice(0, places);
    }
    return `${negative && abs !== 0n ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
  }

  toJSON() { return this.toString(); }
}

const ZERO = new Decimal(0n);
const ONE = new Decimal(UNIT);

export const sum = values => values.reduce((acc, v) => acc.add(v), ZERO);
export const dec = value => Decimal.from(value);
