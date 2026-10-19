# Math Core — Decimal policy and common contracts (`mp-math-core-1`)

Issue: #94 (Trading Tools, backend Math Core first; the UI only consumes it). Roadmap: R-12, card MATH-CORE-01 (#104). Requirement: MP-MTH-001.

Code:
- [`src/math/decimal.mjs`](../src/math/decimal.mjs): fixed-precision decimal;
- [`src/math/core.mjs`](../src/math/core.mjs): validators, envelope and base formulas.

Tests: `test/math-core.test.mjs`. Both modules are pure: no database, no network, no clock.

## Decimal policy

- **Representation:** values are BigInt multiples of 10⁻¹⁸ (`SCALE = 18`). No binary floating point enters a calculation.
- **Inputs:**
  - accepted: plain decimal strings (`"2.10"`, surrounding whitespace ignored), BigInts and safe integers;
  - refused (`BINARY_FLOAT`): JS numbers with a fraction, because they may already carry a binary error;
  - refused: exponents, hexadecimal, empty values and comma decimals.
- **Precision:** inputs with more than 18 decimals are rounded on entry (half-even unless a mode is given; the sign is applied before rounding). `mul` and `div` round half-even to 18 decimals unless a mode is given.
- **Rounding modes:** `HALF_EVEN`, `HALF_UP` (away from zero), `DOWN` (toward zero), `FLOOR`, `CEIL`. An unknown mode is refused even when no rounding is needed.
  - `round(places, mode)` rounds to a number of decimals.
  - `roundToStep(step, mode)` rounds to a stake increment or price tick.
- **Formatting:** `toString(places)` pads and never rounds silently. A value with more decimals is refused (`PRECISION_LOSS`).
- **Money:** `roundMoney` keeps the unrounded value for audit next to the rounded one (default step €0.01, `HALF_EVEN`). This follows #94 "Precisione".
- **Rounding policy version:** `mp-rounding-1`. A change to defaults or modes is a new version.

## Common contract

Every formula:
1. validates its inputs and fails with `BAD_MATH_INPUT` naming the field;
2. computes in Decimal;
3. returns an envelope with these fields (holding JSON-safe copies of the inputs, with Decimal and BigInt values as text and dates as ISO text, so later changes by the caller cannot alter it and it always serializes to JSON):

| Field | Content |
|---|---|
| `formula`, `formula_version` | stable name and `mp-math-core-1` |
| `inputs` | what the caller passed |
| `normalized_inputs` | the validated Decimal values used (as text) |
| `result` | unrounded results (as text) |
| `rounded` | optional rounded values with `policy_version` |
| `warnings` | e.g. which kind of probability the result is |

Validators:

| Validator | Accepts |
|---|---|
| decimal odds | `1 < O ≤ 1,000,000`, decimal odds only. #94 requires only `O > 1`; the upper cap is the agent's choice (PROPOSAL, part of `mp-math-core-1`): exchange odds stop at 1000, and the cap keeps `1/O` far above the 10⁻¹⁸ resolution |
| probability | in `[0, 1]`, or `(0, 1)` when required |
| non-negative amounts | `≥ 0` |
| commission rate | `0 ≤ c < 1`, on net winnings |
| odds list | at least two outcomes |

## Base formulas (#94 "Regole matematiche generali")

| Formula | Definition | Warning |
|---|---|---|
| `implied_probability` | `1 / O` | `RAW_IMPLIED_PROBABILITY` |
| `overround` | `Σ 1/Oᵢ − 1` (and the book `Σ 1/Oᵢ`) | `BOOK_BELOW_ONE` when the book is below 1 |
| `normalized_probabilities` | `(1/Oᵢ) / Σ 1/Oⱼ`; the last value absorbs the rounding remainder so the vector sums exactly to 1 | `MARGIN_NORMALIZED_PROPORTIONAL` |
| `fair_odds` | `1 / p`, `0 < p < 1` | — |

The warning always says which kind of probability a result is (raw implied or margin-normalized), as #94 requires.

## Verification

- **Oracle:** an independent exact rational implementation (BigInt fractions) in the test file. It checks add, sub, mul and div on 2,000 seeded cases, plus every base formula. A second oracle rounds exact fractions with floor-based definitions of each mode. It checks parsing, `mul` and `div` in all five modes, with both signs, on 1,500 seeded cases, plus 1,000 `mul` cases whose products need rounding. Tolerance: at most 1 to 4 units of 10⁻¹⁸, well inside the #94 tolerance of 1e-9 for non-monetary values.
- **Property and metamorphic tests** (seeded, 500 books):
  - probabilities in `[0, 1]`;
  - normalized probabilities sum exactly to 1;
  - lower odds never get a lower probability;
  - `fair(implied(O)) = O` within 1e-9;
  - permuting the outcomes leaves the book unchanged.
- **Determinism:** the same input gives the same output, and no clock is read.

## Limits

- **Formulas not yet implemented:** the money and commission formulas (Kelly, EV, liability, hedge, dutching, …) are MATH-CORE-02..06, and Poisson is MATH-CORE-07. Commission-aware net results also depend on the persistent commission settings of #95.
- **No API yet:** the tool surface is MATH-CORE-08.
- **MP-MTH-001 stays NOT_VERIFIED:** it requires every formula used by statistics or backtest to have oracle vectors, and those formulas don't exist yet.
