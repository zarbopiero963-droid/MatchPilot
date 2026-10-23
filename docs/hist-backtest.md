# Offline backtest engine — HIST-01a (`mp-hist-engine-1`)

Owner decision: `MP-OWNER-HIST-01A-01`. Issues: #34 (Strategy Lab, backtest), #99 (settlement), #94 (Math Core). Roadmap #97: first slice of R-14, with the parts of R-13 it needs (1X2 outcome rule, frozen configuration snapshot).

**Scope.** HIST-01a is the engine only, tested on **synthetic fixtures**. It has no real-data result:
- every report has `certification.certified: false`;
- a fixture report has `real_data_verdict: NOT_APPLICABLE` and says its figures are not a real return.

The archive #40 integration (HIST-01b) waits for the Grok handoff. Grok reported that every #40 pre-match observation was acquired after kickoff, so the expected result there is `INSUFFICIENT_PIT_DATA`.

## Code

- **Contract** — [`src/hist/contract.mjs`](../src/hist/contract.mjs): the input contract `mp-hist-input-1`, strict validation, canonical JSON and SHA-256.
- **Admission** — [`src/hist/admission.mjs`](../src/hist/admission.mjs): which observations are usable at the decision time. It reuses the PIT policy `mp-pit-v1` (`src/pit/policy.mjs`).
- **Strategy** — [`src/hist/strategies.mjs`](../src/hist/strategies.mjs): the technical test oracle `mp-ref-fav-back-1`.
- **Engine** — [`src/hist/engine.mjs`](../src/hist/engine.mjs): decision phase, settlement phase and report.
- **Settlement** — [`src/math/money.mjs`](../src/math/money.mjs): settlement P/L with commission on market net winnings, in Decimal.
- **CLI** — [`tools/hist/backtest.mjs`](../tools/hist/backtest.mjs).

None of them touches a database, the network, the clock or the environment. There is no migration, no API route and no new dependency.

## Input contract `mp-hist-input-1`

One JSON document. It is provider-independent: an archive extract, captured TotalCorner snapshots or a fixture all arrive in this shape.

| Part | Fields |
|---|---|
| `dataset` | `id`, `kind` (`FIXTURE` or `REAL`), `description` |
| `events[]` | `provider`, `event_id`, `kickoff_utc` (UTC or null), `home`, `away` |
| `observations[]` | `observation_id`, `provider`, `event_id`, `bookmaker`, `market` (`1X2`), `selection` (`HOME`, `DRAW`, `AWAY`), `odds` (decimal text), `provider_time`, `acquired_at` (UTC or null) |
| `outcomes[]` | `provider`, `event_id`, `status` (`FINAL` with `home_score`/`away_score`, or `VOID` with null scores), `acquired_at` |

**Validation:**
- unknown or missing fields, duplicate ids, references to unknown events and a second outcome for the same event are refused with `BAD_HIST_INPUT` and the field;
- non-UTC times are refused, as are impossible dates;
- odds must satisfy `1 < O ≤ 1,000,000` and be plain decimal text such as `2.10`, with at most 7 integer digits and 6 decimals: no JS numbers, sign, surrounding space or leading zero;
- each list holds at most 2,000,000 items.

Every list is sorted by its ids, so the same data in any order has the same hash.

## Configuration (frozen snapshot, MP-MKT-003)

`{strategy, bookmaker, lead_minutes, stake, commission}`. The report carries:
- the normalized configuration;
- `settings_snapshot_id`, the SHA-256 of that configuration;
- `commission_rate_used`.

Authorized configuration for tests: `mp-ref-fav-back-1`, stake `1`, commission `0`, lead `10` minutes.

## Decision phase (MP-PIT-002, MP-PIT-003, MP-RPL-003)

**Decision time:** kickoff minus `lead_minutes`. An event without a kickoff gets no decision (`KICKOFF_UNKNOWN`).

**Admission:** `classifyRecord` of `mp-pit-v1` with captured knowledge. An observation is admitted only when it is `PIT_VERIFIED`, that is:
- it is acquired at or before the decision time (otherwise `ACQUIRED_AFTER_DECISION`). **The provider time never replaces the acquisition time**: a price acquired after the decision is excluded even when the provider dates it earlier;
- it has an acquisition time (otherwise `ACQUISITION_TIME_MISSING`);
- the provider time is not after the decision time (`PROVIDER_TIME_AFTER_DECISION`), and not more than 5 minutes after the acquisition (`PROVIDER_TIME_AFTER_ACQUISITION`).

**Prices used:** only the configured bookmaker's. For each selection the latest admitted price is taken, by acquisition time, then by observation id in byte order.

**The view the strategy sees:**
- it is frozen and has exactly these fields: `provider`, `event_id`, `home`, `away`, `kickoff_utc`, `decision_time`, `odds`;
- reading any other field, such as an outcome or a score, throws `VIEW_FIELD_NOT_AVAILABLE`;
- the strategy returns `BACK` with a selection that has a price in the view, or `NO_TRADE` with a reason. Anything else fails with `BAD_STRATEGY_DECISION`. The engine takes the price from the view, so a strategy cannot choose one;
- the prices are collected in a prototype-free map: a value planted on `Object.prototype`, by a strategy or any other code, can neither fill a missing selection nor outrank a real price (PR #178 review, finding 1);
- the view guards against look-ahead; it is not a sandbox. A strategy runs in the same process, so the configuration can select only the strategies registered in code (`STRATEGIES`).

**`mp-ref-fav-back-1`:**
- BACK the selection with the lowest admitted price among home, draw and away;
- without all three prices: `INCOMPLETE_1X2` or `NO_ADMISSIBLE_ODDS`;
- a tie for the lowest: `FAVOURITE_TIE`.

It is a test oracle only, never a trading strategy.

## Settlement phase (MP-MKT-001 for 1X2, MP-MKT-002, MP-MTH-003)

Outcomes are read only after every decision is fixed. The 1X2 rule is the Market Rules Registry's `MATCH_ODDS@v2`
(`src/markets/rules.mjs`, #100), recorded in the report as `versions.outcome_rule`; the engine has no resolver of its own
(DEC-006). It replaced the earlier branch-local rule `mp-outcome-1x2-1`, with the same results:
- **FINAL:** gives HOME, DRAW or AWAY from the scores (regular time);
- **VOID:** voids the bet, and the stake is returned;
- **Same provider only:** the outcome must belong to the same provider and event as the odds. Cross-provider mappings are not used;
- **Acquired at or after kickoff:** an outcome acquired before the kickoff instant, including between the decision and the kickoff, is not used (`OUTCOME_ACQUIRED_BEFORE_KICKOFF`); one acquired exactly at kickoff is. This applies to VOID too, which is conservative: a postponement announced before the match leaves the bet unsettled;
- **Missing outcome:** the bet stays unsettled (`OUTCOME_MISSING`, N/D).

**P/L.** `settleMarket` computes it in Decimal:
- BACK wins `S·(O − 1)` or loses `S`;
- commission is `max(0, net of the market)·c`;
- unrounded values are kept, and the rounded ones reconcile to the cent (`net = gross − commission`).

## Report `mp-hist-report-1`

| `status` | When | Bets and metrics |
|---|---|---|
| `INSUFFICIENT_PIT_DATA` | no admitted observation of the configured bookmaker | none: no bet, P/L, ROI or drawdown |
| `INSUFFICIENT_OUTCOMES` | bets decided, none settled | bets listed without settlement; `metrics: null` |
| `OK` | admissible data, and at least one bet settled or no bet at all | metrics on the settled bets; `metrics: null` when no bet was made (every event NO_TRADE) |

**Metrics (`OK` only):**
- counts of bets won, lost and void;
- stake at risk, gross P/L, commission and net P/L;
- ROI = net ÷ stake at risk;
- maximum drawdown of the cumulative net in decision order.

They are given exact, then rounded to the cent (ROI to 4 places), HALF_EVEN. Unsettled bets are excluded from the metrics and counted in `counts.unsettled_by_reason`; the report's limits say this can bias the metrics.

**Run status and certification are separate** (owner decision on PR #178, NB-2). `status` is the technical result of the run and says nothing about the data: a technically `OK` run is not VERIFIED data. The certification is its own block:

| `certification` field | FIXTURE dataset | REAL dataset |
|---|---|---|
| `data_scope` | `FIXTURE` | `REAL` |
| `real_data_verdict` | `NOT_APPLICABLE` (a fixture cannot certify real data) | `NOT_VERIFIED` |
| `certified` | `false` | `false` |
| `notice` | the figures are not a real return | a technically OK run is not a certification |

HIST-01a has no certification path: no input or configuration field reaches the block, and the engine sets `certified` only to the literal `false` (checked by a test).

**Other fields of every report:**
- the `certification` block above;
- the dataset with the SHA-256 of the normalized input;
- the code version, all component versions and the frozen configuration;
- counts per exclusion and no-trade reason;
- the limits: no liquidity, matching or execution; no claim of profitability (MP-STA-012).

**Hash.** The report is canonical JSON with `report_sha256` computed over the report without that field. The same input, configuration and code give the same bytes.

## CLI

```
node tools/hist/backtest.mjs --input <input.json> --config <config.json> --out <report.json> [--code-version <sha>] [--repeat N]
```

- Input and configuration are always explicit arguments; nothing is read from the environment. The tests that the VPS deploy runs therefore never touch real data.
- `--repeat N` fails with exit 3 unless every report is identical.
- Exit codes: 0 for a report (any status), 2 for an invalid input or configuration, 3 when the reports differ.

## Verification

`test/hist-backtest.test.mjs` runs on synthetic fixtures only.

| Test | What it checks |
|---|---|
| Golden fixture | decisions, exclusions, settlement and metrics, exact |
| Anti-lookahead | provider time earlier than an acquisition after the decision; missing acquisition; provider time after the decision; inclusive decision boundary |
| Archive #40 profile | every observation acquired 80 minutes to 4 hours after kickoff gives `INSUFFICIENT_PIT_DATA` with no monetary field |
| Outcomes invisible | a strategy reading an outcome or a score fails; the view cannot be changed; a strategy cannot invent a selection or change it between check and bet; any no-trade reason is counted |
| Anti-contamination | prices acquired after the decision, or at kickoff, change no decision; changed outcomes change only the settlement |
| Determinism | 20 shuffled inputs and the CLI with `--repeat 3` give the same bytes |
| Settlement oracle | 1,500 seeded markets (BACK, LAY, VOID, commission 0–6.5 %) against an independent exact-fraction oracle, plus the engine's metrics with commission |
| Status and certification | a REAL dataset with admissible data: `status: OK` with `real_data_verdict: NOT_VERIFIED` and `certified: false`; no run of any status is certified; no input field reaches the block |
| No bet | admissible data with every event NO_TRADE gives `OK` with `metrics: null` |
| Prototype pollution | prices planted on `Object.prototype` reach no view and no bet; a BACK on a planted selection fails with `BAD_STRATEGY_DECISION` |
| Other bookmaker only | prices admitted only for another bookmaker give `INSUFFICIENT_PIT_DATA` with no bet or metric |
| ROI rounding | exact ties `0.00135 → 0.0014` and `0.00125 → 0.0012` (HALF_EVEN, 4 places) |
| Same-instant tie-break | two prices of one selection acquired at the same instant: the greater observation id wins, whatever the price |
| Refused inputs | 21 malformed inputs (7 odds formats among them) and 6 malformed configurations |
| Isolation from R1 | `src/hist` imports only the Math Core, the PIT policy and its own modules: no `src/analysis`, no FutPythonTrader path, no SQL, no environment, no network |

**RED evidence (mutations):** each mutation was applied, the tests were run, and the code was restored.

| Mutation | Tests failed |
|---|---|
| Admission on the provider time instead of the acquisition time | 6 of 10 |
| Outcome guard removed | 1 of 10 (outcomes invisible) |
| Commission on losses | 1 of 10 (settlement oracle) |

After the PR #178 review (comment 6300543152), on 16 tests:

| Change | Tests failed |
|---|---|
| Price map with a prototype (`{}`), the code before the fix | 1 of 16 (prototype pollution) |
| `INSUFFICIENT_PIT_DATA` on admitted instead of usable observations | 1 of 16 |
| ROI rounded DOWN, or HALF_UP | 1 of 16 each |
| Tie-break by observation id reversed | 1 of 16 |

## Limits

- Fixtures only. The real-data verdict stays `NOT VERIFIED`, and the matrix row Backtest stays `BLOCKED` on real data until authentic pre-kickoff data exist.
- Option A of `MP-OWNER-HIST-01A-01` is a read-only check for such data on the VPS.
- 1X2 only, BACK only in the strategy. Asian lines, PUSH and the other markets of MP-MKT-001 are not built.
- One bookmaker per run. No liquidity, matching, slippage or exchange execution.
- No walk-forward or out-of-sample split (R-14, MP-STA-004…009).

## Open owner decisions (behaviour unchanged)

Both points concern real data (HIST-01b), and no registered decision settles them. HIST-01a keeps its documented behaviour until the owner decides.

- **Stale prices acquired later.** The latest admitted price is chosen by acquisition time, then observation id, as documented above; the provider time does not order prices. A snapshot acquired later therefore supersedes another one even when the provider dates it much earlier. This is correct point-in-time, since both prices were held at the decision time. Whether real data need a staleness limit, or an ordering by provider time among admitted prices, is an owner decision before HIST-01b.
- **Earliest acceptable outcome.** An outcome is used when acquired at or after kickoff. `MP-OWNER-HIST-01A-01` says outcomes "may be acquired after the match if final and correctly linked to the event", and specifies no minimum match duration or proof of finality beyond `status: FINAL`. A FINAL outcome acquired one minute after kickoff is therefore accepted. Whether real data need such a margin is an owner decision before HIST-01b.
