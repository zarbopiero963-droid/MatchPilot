# Offline backtest engine — HIST-01a (`mp-hist-engine-1`)

Owner decision: `MP-OWNER-HIST-01A-01`. Issues: #34 (Strategy Lab, backtest), #99 (settlement), #94 (Math Core). Roadmap #97: first slice of R-14, with the parts of R-13 it needs (1X2 outcome rule, frozen configuration snapshot).

**Scope.** HIST-01a is the engine only, tested on **synthetic fixtures**. It has no real-data result:
- every report says `real_data_verdict: NOT VERIFIED`;
- a fixture report also says its figures are not a real return.

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
- odds must satisfy `1 < O ≤ 1,000,000` and be plain decimal text such as `2.10`: no JS numbers, sign, surrounding space or leading zero;
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
- the strategy returns `BACK` with a selection that has a price in the view, or `NO_TRADE` with a reason. Anything else fails with `BAD_STRATEGY_DECISION`. The engine takes the price from the view, so a strategy cannot choose one.

**`mp-ref-fav-back-1`:**
- BACK the selection with the lowest admitted price among home, draw and away;
- without all three prices: `INCOMPLETE_1X2` or `NO_ADMISSIBLE_ODDS`;
- a tie for the lowest: `FAVOURITE_TIE`.

It is a test oracle only, never a trading strategy.

## Settlement phase (MP-MKT-001 for 1X2, MP-MKT-002, MP-MTH-003)

Outcomes are read only after every decision is fixed. Rule `mp-outcome-1x2-1`:
- **FINAL:** gives HOME, DRAW or AWAY from the scores;
- **VOID:** voids the bet, and the stake is returned;
- **Same provider only:** the outcome must belong to the same provider and event as the odds. Cross-provider mappings are not used;
- **Acquired after kickoff:** an outcome acquired before kickoff is not used (`OUTCOME_ACQUIRED_BEFORE_KICKOFF`). This applies to VOID too, which is conservative: a postponement announced before the match leaves the bet unsettled;
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
| `OK` | admissible data, and every bet decided was settled or there was no bet | metrics on the settled bets; `metrics: null` when no bet was made (every event NO_TRADE) |

**Metrics (`OK` only):**
- counts of bets won, lost and void;
- stake at risk, gross P/L, commission and net P/L;
- ROI = net ÷ stake at risk;
- maximum drawdown of the cumulative net in decision order.

They are given exact, then rounded to the cent (ROI to 4 places), HALF_EVEN. Unsettled bets are excluded from the metrics and counted in `counts.unsettled_by_reason`; the report's limits say this can bias the metrics.

`OK` is also the status of a run on `REAL` data. Until a real-data certification exists, only `real_data_verdict: NOT VERIFIED` and the notice tell it apart. Whether such a run should get its own status is an owner decision, due before HIST-01b.

**Other fields of every report:**
- `scope` (`FIXTURE` or `REAL`), `real_data_verdict: NOT VERIFIED` and a notice;
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
| No bet | admissible data with every event NO_TRADE gives `OK` with `metrics: null` |
| Refused inputs | 21 malformed inputs (7 odds formats among them) and 6 malformed configurations |
| Isolation from R1 | `src/hist` imports only the Math Core, the PIT policy and its own modules: no `src/analysis`, no FutPythonTrader path, no SQL, no environment, no network |

**RED evidence (mutations):** each mutation was applied, the tests were run, and the code was restored.

| Mutation | Tests failed |
|---|---|
| Admission on the provider time instead of the acquisition time | 6 of 10 |
| Outcome guard removed | 1 of 10 (outcomes invisible) |
| Commission on losses | 1 of 10 (settlement oracle) |

## Limits

- Fixtures only. The real-data verdict stays `NOT VERIFIED`, and the matrix row Backtest stays `BLOCKED` on real data until authentic pre-kickoff data exist.
- Option A of `MP-OWNER-HIST-01A-01` is a read-only check for such data on the VPS.
- 1X2 only, BACK only in the strategy. Asian lines, PUSH and the other markets of MP-MKT-001 are not built.
- One bookmaker per run. No liquidity, matching, slippage or exchange execution.
- No walk-forward or out-of-sample split (R-14, MP-STA-004…009).
