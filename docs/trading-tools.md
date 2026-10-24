# Trading Tools — MP-UI-PR-005 (`mp-tools-1` over `mp-math-core-1`)

Issue: #94 (Trading Tools Hub). Roadmap: #239 MP-UI-PR-005, R-12 (MATH-CORE-02..04, 06, 07 for the formulas, MATH-CORE-08 for the API). Owner decisions:
- MP-UI-PROTOTYPE-INTEGRATION-01: the calculators are ported from the prototype `claude/matchpilot-web-app-wygcsn` and aligned to #94;
- MP-UI-HARD-GATES-01;
- MP-UI-CONTINUOUS-FUNCTIONAL-CERTIFICATION-01: feature `FEAT-TRADING-TOOLS` in [`qa/feature-certification.json`](qa/feature-certification.json), data `COMPUTED`: the real server computes from manual input. State **CERTIFIED CALCULATION** (MP-UI-CERT-CALC-01), verified on commit `50cfd6b`. The perimeter is the seven manual calculators; the limits are in the register record. The gate re-checks it on every Browser QA run, so a changed contract, a lost test or a failed step makes it REGRESSED.

## Perimeter

Seven calculators, with **manual input only**. The page labels it «INSERIMENTO MANUALE» (#94 "Manual mode"). Each one is computed by the server in Decimal; nothing places or prepares an order (#94 CALCULATE level).

| Tool | #94 | Endpoint | Formula (Math Core) |
|---|---|---|---|
| Margine | base rules | `/api/v1/tools/odds` | `1/O`, `Σ 1/Oᵢ − 1`, `(1/Oᵢ)/Σ 1/Oⱼ`, fair odds; reuses `src/math/core.mjs` |
| Stake e Kelly | TOOL 1 | `/api/v1/tools/kelly` | `f* = (b·p − q)/b`. The stake is `max(0, B·f*·α)`, capped by `min(stake, max_stake, B·max_bankroll)`. `f* ≤ 0` is NO BET. Also returns worst-case loss and the bankroll after a loss or a win |
| Valore atteso (BACK) | TOOL 2 | `/api/v1/tools/ev` | `EV_net = p·S·(O−1)·(1−c) − (1−p)·S`, `EV/S`, `O_fair = 1/p`, `edge = O/O_fair − 1`. Break-even `p = 1/((O−1)(1−c)+1)`, where `EV_net = 0` |
| Responsabilità (LAY) | TOOL 3 | `/api/v1/tools/liability` | `L·(O−1)`; net result if the selection loses `L·(1−c)`; break-even `(1−c)/(O−c)`; a warning when the liability exceeds the bankroll |
| Copertura | TOOL 4 and 5 | `/api/v1/tools/hedge` | BACK→LAY `L = B·O_b/O_l`, LAY→BACK `B = L·O_l/O_b`. P/L per outcome before and after commission. Equalized result. Residual imbalance from the cent rounding |
| Dutching (BACK) | TOOL 7 | `/api/v1/tools/dutching` | `K = Σ 1/Oᵢ`, `R = T/K`, `Sᵢ = R/Oᵢ`, gross profit `R − T`. Outcomes are recomputed from the rounded stakes. A total so small that a stake rounds to 0 is refused |
| Poisson | TOOL 12 | `/api/v1/tools/poisson` | independent Poisson baseline. 1X2 is summed over a 0–40 grid per side, with the covered mass reported. Goal lines are exact (`H + A ~ Pois(λh+λa)`). BTTS is `1 − P(H=0) − P(A=0) + P(0,0)`. Also returns expected goals and the most likely scores |

**Commission.** It is charged on the positive net result of each outcome only, never as one multiplication (#94).

**Hedge after commission.** The equal-profit stake also equalizes the net results. Two equal gross results have the same sign, so the commission reduces both by the same factor, or neither.

**Liquidity** has no certified source (#94 "Stato attuale liquidità"). Hedge and dutching stakes are the theoretical quantity: the answer says `liquidity: UNAVAILABLE` and the page says the stakes are not verified as executable.

**Out of the perimeter.** The page lists these as not yet available; none is offered as a control (rule 13):
- the LIVE/PRE-MATCH match selector;
- cash-out of several legs;
- Dutching LAY;
- arbitrage with quote freshness;
- Dutch Each Way and Draw No Bet;
- progressions (MATH-CORE-05, owner formulas still BLOCKED);
- portfolio risk exposure;
- the commission optimizer;
- saving calculations (the #94 tool state model).

## Contract

- **Input.**
  - What the user typed, as text.
  - A decimal comma is accepted (`2,10`).
  - Probabilities, commissions, Kelly fraction and bankroll share are percentages (`5` = 5%). The server turns them into fractions in Decimal; the page computes nothing (MP-WEB-011).
  - Odds are decimal only (`1 < O ≤ 1,000,000`, Math Core).
  - Amounts must be positive and have no upper limit beyond the 300-character parameter length: no new monetary limit.
  - Expected goals are `0–10`; grid display is `1–8` goals.
- **Answer.** The v1 envelope. `data` carries:
  - `tool`, `tools_version`, `formula` and `formula_version`, `mode: MANUAL`;
  - `inputs` and `normalized_inputs`;
  - `result`: exact values, as text;
  - `rounded`: money rounded by the formula's own rule. Kelly rounds down to the cent, so the rounded stake never exceeds Kelly or a cap; hedge and dutching stakes are rounded half-even;
  - `display`: money to the cent, percentages to two decimals, odds to three, half-even;
  - `warnings` and `display_rounding`.
- **Refusal.** 400 `BAD_REQUEST`; the message starts with the parameter name, and the page shows that field's label. Unknown, repeated or missing parameters, a wrong method and over-long values are refused by the v1 layer.
- **No database, no provider.** The provenance is `{source: computation, mode: MANUAL, upstream_calls: 0}`.
- **Access.** Like every v1 route, the tools need the owner session when `MATCHPILOT_AUTH=enforce` (journey step «accesso»).

## Verification

**Formulas** (`test/math-trading.test.mjs`):
- the #94 golden vectors: Kelly `p .5, O 2 → 0`; `p .6, O 2 → .20`; fraction `.25 → .05`;
- hand vectors;
- an independent exact-fraction oracle (BigInt, written from the #94 definitions) on 2,000 seeded cases per formula, within 1e-9 for pure values and €0.01 for money (#94 "Precisione");
- EV and liability are exactly zero at their break-even probability;
- an independent float oracle for Poisson;
- property and metamorphic tests:
  - doubling the bankroll doubles the Kelly stake;
  - permuting dutching selections permutes the stakes;
  - swapping the teams swaps 1 and 2;
  - liability is never negative;
  - the hedge stays equalized within the rounding bound;
  - Poisson probabilities are never negative.

**API** (`test/tools-api.test.mjs`): the envelope, no database, every refusal, display rounding (`0.5575 → 0.56`, `0.125 → 0.12`, `0.135 → 0.14`), and no monetary upper limit.

**Browser** (journey `trading-tools`, desktop and mobile):
- the manual label is shown and the missing tools are named;
- every tab works;
- per tool: every field reaches the request and the page shows the server's values; one invalid field is refused and named; Azzera empties the form;
- the address carries the calculation across a reload;
- a server error (503) and a lost connection are stated, and Riprova calculates again;
- 401 without the owner session when the login is enforced.

All 47 controls of the page and the menu entry are ASSERTED.

**Mutation testing** (`node tools/qa/mutation-trading.mjs`, local, on demand). The run on 2026-10-24 killed 25/25 mutants of `src/math/trading.mjs` and `src/api/tools.mjs`. The first run left three survivors, all real gaps in the tests:
- a signed rounding residual;
- the liability of a LAY hedge leg;
- money display rounded down.

Each one has a test now. Four page mutants were also run against the `trading-tools` journey, and each one failed it:
- hedge values taken from the open position;
- a field dropped from the request;
- the refusal naming another field;
- a field not sent to the API.

## Limits

- Manual input only: there is no match, archived odds or live feed yet. That needs the common match selector (#94 TT-PR-02) and quote freshness.
- Liquidity is unavailable, so the stakes are theoretical.
- Calculations are not saved, so point-in-time reproducibility of a saved calculation is not built.
- Hard certification on real matches (#94 "Hard certification reale") is outside this perimeter. Issue #94 stays open.
