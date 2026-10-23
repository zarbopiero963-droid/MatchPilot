# Offline backtest engine — HIST-01a, HIST-LINK-01, HIST-LEDGER-01, HIST-LAY-01, HIST-PG-01, HIST-MM-01 (`mp-hist-engine-6`)

Owner decision: `MP-OWNER-HIST-01A-01`. Issues: #34 (Strategy Lab, backtest), #99 (settlement), #94 (Math Core). Roadmap #97: first slice of R-14, with the parts of R-13 it needs (1X2 outcome rule, frozen configuration snapshot).

**Scope.** HIST-01a is the engine only, tested on **synthetic fixtures**. It has no real-data result:
- every report has `certification.certified: false`;
- a fixture report has `real_data_verdict: NOT_APPLICABLE` and says its figures are not a real return.

The archive #40 integration (HIST-01b) waits for the Grok handoff. Grok reported that every #40 pre-match observation was acquired after kickoff, so the expected result there is `INSUFFICIENT_PIT_DATA`.

## Code

- **Contract** — [`src/hist/contract.mjs`](../src/hist/contract.mjs): the input contract `mp-hist-input-2` (and the older `mp-hist-input-1`), strict validation, canonical JSON and SHA-256.
- **Admission** — [`src/hist/admission.mjs`](../src/hist/admission.mjs): which observations are usable at the decision time. It reuses the PIT policy `mp-pit-v1` (`src/pit/policy.mjs`).
- **Strategy** — [`src/hist/strategies.mjs`](../src/hist/strategies.mjs): the technical test oracles `mp-ref-fav-back-1` and `mp-ref-fav-lay-1`.
- **Engine** — [`src/hist/engine.mjs`](../src/hist/engine.mjs): decision phase, settlement phase and report.
- **Results** — [`src/markets/outcomes.mjs`](../src/markets/outcomes.mjs) `resolveVersioned`: result versions (DEC-002) resolved by the registry rule (#100).
- **Settlement** — [`src/ledger/paper-ledger.mjs`](../src/ledger/paper-ledger.mjs) and [`src/ledger/settlement.mjs`](../src/ledger/settlement.mjs): every bet is a paper-ledger position settled by `settleFromResult` (#99, HIST-LEDGER-01).
- **CLI** — [`tools/hist/backtest.mjs`](../tools/hist/backtest.mjs).
- **FutPythonTrader reader** (HIST-PG-01) — [`src/providers/futpython/hist-input.mjs`](../src/providers/futpython/hist-input.mjs) and the CLI [`tools/hist/fpt-backtest.mjs`](../tools/hist/fpt-backtest.mjs): builds `mp-hist-input-2` from the FPT tables in PostgreSQL, read only. It lives outside `src/hist/`, which still reads no SQL.

None of them touches a database, the network, the clock or the environment. There is no migration, no API route and no new dependency.

## Input contract `mp-hist-input-2`

One JSON document. It is provider-independent: an archive extract, captured TotalCorner snapshots or a fixture all arrive in this shape.

| Part | Fields |
|---|---|
| `dataset` | `id`, `kind` (`FIXTURE` or `REAL`), `description` |
| `events[]` | `provider`, `event_id`, `kickoff_utc` (UTC or null), `home`, `away` |
| `observations[]` | `observation_id`, `provider`, `event_id`, `bookmaker`, `market` (`1X2`), `selection` (`HOME`, `DRAW`, `AWAY`), `odds` (decimal text), `provider_time`, `acquired_at` (UTC or null) |
| `outcomes[]` | result versions: `provider`, `event_id`, `version` (integer ≥ 1), `status` (`FINAL` with `home_score`/`away_score`, or `NOT_FINAL` with null scores), `acquired_at`, `provenance` |

Any number of versions per event (HIST-LINK-01, DEC-002): a version number is unique per event and a higher version must not be acquired before a lower one. There is no `VOID` status (DEC-015).

**`mp-hist-input-1` is still accepted.** Its `outcomes[]` hold one outcome per event (`FINAL` with scores, or `VOID` with null scores). Each becomes version 1; a `VOID` becomes a `NOT_FINAL` version flagged as declared void, which is never settled (`VOID_NO_APPROVED_RULE`). The normalized input is always version 2.

**Validation:**
- unknown or missing fields, duplicate ids, references to unknown events, a second outcome for the same event (input-1), a duplicate or non-monotonic version (input-2) are refused with `BAD_HIST_INPUT` and the field;
- non-UTC times are refused, as are impossible dates;
- odds must satisfy `1 < O ≤ 1,000,000` and be plain decimal text such as `2.10`, with at most 7 integer digits and 6 decimals: no JS numbers, sign, surrounding space or leading zero;
- each list holds at most 2,000,000 items.

Every list is sorted by its ids, so the same data in any order has the same hash.

## PIT and NON_PIT_RESEARCH (HIST-PG-01)

`config.pit_mode` is `PIT` (the default) or `NON_PIT_RESEARCH`, authorized by the owner mandate MP-AUTONOMOUS-AUTOMERGE-20261023 for research and testing only.

| | `PIT` | `NON_PIT_RESEARCH` |
|---|---|---|
| Prices | only those acquired by the decision time (mp-pit-v1) | also those acquired later; every PIT reason overridden is counted in `counts.pit_exclusions_overridden` |
| Event without kickoff | no decision (`KICKOFF_UNKNOWN`) | decided by its `match_date` (`decision_basis: MATCH_DATE_NON_PIT`, `decision_time: null`), ordered by date; the date is never turned into an instant |
| Result versions without kickoff | — | all used; the bet carries `kickoff_filter: NOT_APPLIED_KICKOFF_UNKNOWN` |
| Certification block | `pit_mode: PIT` | `pit_mode: NON_PIT_RESEARCH`, and the notice says the figures are not point-in-time and no evidence of real profitability; `certified` stays `false` |

Further NON_PIT notes: `counts.admitted` includes the overridden observations; the latest price of an FPT match can be one acquired after the result (the stored historical version); for a match decided by date, the ledger entries of its opening carry the date (`YYYY-MM-DD`) as their time, while settlements carry the result's acquisition instant.

The mode is part of the settings snapshot; a PIT configuration keeps the snapshot id it had before the mode existed. Events may carry an optional `match_date` (`YYYY-MM-DD`).

## FutPythonTrader data (HIST-PG-01)

`readFptHistInput(db, {dateFrom, dateTo, competitionId, maxEvents})` reads the matches of `fpt_match_facts` in the date range (optionally one `fpt:competition:` id, at most 50,000 events) and every acquired version in `fpt_match_versions`:
- **events:** the match key (hashed when it has characters outside the contract's alphabet), names as given (`N/D` when absent), `match_date`, and `kickoff_utc: null` (the provider's time zone is undocumented);
- **observations:** the 1X2 prices of each version (`Odd_1_FT` then `Odd_H_FT`, …; the facts' acceptance rule, digits with `,` or `.` decimals and greater than 1), kept exactly as the provider wrote them, never rounded; a price the contract cannot carry (more than 7 integer or 6 decimal digits) or not greater than 1 is dropped and counted in the reader's `prices_dropped`; bookmaker `futpythontrader-odds`, `provider_time: null` (FPT has no price timestamp), `acquired_at` = the ingestion time;
- **onboarding gate:** only versions of datasets with no onboarding row or an `ACTIVE` one are read (the facts' gate, migration 018);
- **results:** one version per acquired version, numbered in acquisition order, `FINAL` only for a historical version with both scores, provenance `futpythontrader:snapshot:<id>`.

Nothing is invented or written. Because the stored prices were acquired after kickoff, a PIT run gives `INSUFFICIENT_PIT_DATA`; `NON_PIT_RESEARCH` simulates them as labelled exploratory runs.

```
DATABASE_URL=<local> node tools/hist/fpt-backtest.mjs --from 2025-08-01 --to 2026-05-31 --config config.json --out report.json [--competition fpt:competition:<md5>] [--max-events N] [--input-out input.json]
```

The CLI refuses a non-local database (exit 4), sets the session read only, and prints a one-line summary with the certification block.

## Configuration (frozen snapshot, MP-MKT-003)

`{strategy, bookmaker, lead_minutes, stake, commission}`, plus the optional `outcomes_as_of` (UTC instant): the cutoff of the result versions used to settle (DEC-002 `asOf`). Without it, every version in the input is available, and the report says so (`LATEST_IN_INPUT`, or `NO_OUTCOMES` with a null cutoff when the input has no result). The report carries:
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
- the strategy returns `BACK` or `LAY` (HIST-LAY-01) with a selection that has a price in the view, or `NO_TRADE` with a reason. Anything else fails with `BAD_STRATEGY_DECISION`. The engine takes the price from the view, so a strategy cannot choose one;
- the prices are collected in a prototype-free map: a value planted on `Object.prototype`, by a strategy or any other code, can neither fill a missing selection nor outrank a real price (PR #178 review, finding 1);
- the view guards against look-ahead; it is not a sandbox. A strategy runs in the same process, so the configuration can select only the strategies registered in code (`STRATEGIES`).

**`mp-ref-fav-back-1`:**
- BACK the selection with the lowest admitted price among home, draw and away;
- without all three prices: `INCOMPLETE_1X2` or `NO_ADMISSIBLE_ODDS`;
- a tie for the lowest: `FAVOURITE_TIE`.

**`mp-ref-fav-lay-1`** (HIST-LAY-01): the same favourite and the same no-trade rules, laid instead of backed.

Both are test oracles only, never trading strategies.

## Settlement phase (MP-MKT-001 for 1X2, MP-MKT-002, MP-MTH-003)

Results are read only after every decision is fixed. The 1X2 rule is the Market Rules Registry's `MATCH_ODDS@v2`
(`src/markets/rules.mjs`, #100), recorded in the report as `versions.outcome_rule`; the engine has no resolver of its own
(DEC-006). Since HIST-LINK-01 the engine resolves through `resolveVersioned` (`src/markets/outcomes.mjs`):
- **Which version:** the latest validated `FINAL` acquired by the outcomes cutoff (`settlement_policy.outcomes_as_of`). Each settled bet records the rule id, the result version, its provenance and acquisition time;
- **Corrections:** when that version changes the score of an earlier `FINAL`, the bet carries `corrected: true`, the first final version and the outcome it would have had; `metrics.corrected_results` counts them;
- **No VOID** (DEC-015): `NOT_FINAL` versions (postponed, suspended, no result) and matches declared void leave the bet unsettled (`NO_VALIDATED_FINAL`, `VOID_NO_APPROVED_RULE`). No stake is returned by an invented rule;
- **Providers:** results are resolved only for MatchPilot's two football APIs (`futpythontrader`, `totalcorner`); any other provider id gives `OUTCOME_PROVIDER_UNSUPPORTED`;
- **Same provider only:** the versions must belong to the same provider and event as the odds. Cross-provider mappings are not used;
- **Acquired at or after kickoff:** a version acquired before the kickoff instant is ignored and counted in `counts.result_versions_ignored_before_kickoff` (it can hide a correction of the first final); when every version is, the bet stays unsettled (`OUTCOME_ACQUIRED_BEFORE_KICKOFF`, or `VOID_NO_APPROVED_RULE` for a void announced before the match);
- **Missing result:** the bet stays unsettled (`OUTCOME_MISSING`, N/D).

**Paper ledger (HIST-LEDGER-01, #99).** Every bet is a position of a paper ledger created for the run; the ledger is the engine's only P/L path:
- the ledger is funded by a **notional allocation** equal to the sum of the bets' exposures (BACK: the stake; LAY: the liability `S·(O − 1)`), so every bet can be opened. It is not a bankroll, and no money management is applied;
- each position is opened in decision order, at its decision time, with its #100 market binding (`MATCH_ODDS`, the selection) and the commission rate fixed at the fill (DEC-013);
- a bet with a resolved result is settled by `settleFromResult` with the same result versions; the engine checks that the ledger reached the same outcome (`LEDGER_MISMATCH` otherwise);
- an unsettled bet stays an open position with its exposure reserved: nothing is refunded;
- **P/L:** BACK wins `S·(O − 1)` or loses `S`; LAY wins `S` when the selection loses and loses `S·(O − 1)` when it wins; the ledger charges commission on each position's positive net winnings, rounded to the cent HALF_EVEN (DEC-013). Before HIST-LEDGER-01 the engine kept the commission unrounded (`settleMarket`), so figures with commission differ by that rounding;
- each settled bet carries its `position_id` and the sequence numbers of its ledger entries; the report's `ledger` block gives the allocation, the number of entries, their SHA-256 and the final state (cash, realized P/L, commission, reserved funds, open positions, `reconciled`).

## Bankroll and Money Management (HIST-MM-01, #96)

Without `config.bankroll` the engine works as above (notional allocation, every bet at `config.stake`). With it, the run is a **chronological simulation** on that starting bankroll:
- the decisions are the strategy's, unchanged; before each decision (in decision order) every placed bet whose result is **known by then** is settled, so the bankroll a stake sees contains exactly the results known at that moment;
- a result is known at the acquisition of the version that settles it (the PIT rule); in `NON_PIT_RESEARCH`, a match without kickoff is taken as known at the end of its match date, and `bankroll.settlement_timing` says so;
- the stake is `config.stake`, or, with `config.money_management` (`{model, params, caps}` of an IMPLEMENTED #96 model: `FIXED_STAKE`, `FIXED_LIABILITY`, `PERCENT_BANKROLL`, `LIABILITY_PERCENT_BANKROLL`), the `adjusted_stake` of `evaluate()` on the ledger's account state; the profile's caps and odds filters apply; `config.stake` is then not required;
- a bet whose exposure does not fit the available bankroll, or that the profile blocks, is not placed: counted in `bankroll.skipped_by_reason` (`INSUFFICIENT_AVAILABLE_BANKROLL`, `MM_<decision>:<reasons>`); the strategy's decision counts are unchanged;
- each placed bet carries its stake and, with a profile, its `money_management` decision (original stake, caps triggered, bankroll snapshot);
- **timing details:** a result known exactly at a decision's time is settled before that decision (as a price acquired at the decision time is admitted); a corrected result settles the bet only when the correcting version is acquired (until then the position stays open with its worst case reserved, so sizing is conservative and the cash drawdown may be understated); in `NON_PIT_RESEARCH` the end-of-date rule is applied even when the result was acquired later: a research assumption, stated in `settlement_timing`;
- per-scope caps (`max_exposure_per_*`) are refused (the backtest assigns no scope ids), and `config.stake` is refused with a profile; with a bankroll, `metrics.unit` is `bankroll currency units`;
- the report's `bankroll` block gives the initial bankroll, final cash, available bankroll, realized P/L, return on bankroll, maximum drawdown of the cash in settlement order, the settlement timing, the profile, and the placed, reduced and skipped counts. `bankroll` and `money_management` are part of the settings snapshot.

## Report `mp-hist-report-6`

| `status` | When | Bets and metrics |
|---|---|---|
| `INSUFFICIENT_PIT_DATA` | no admitted observation of the configured bookmaker | none: no bet, P/L, ROI or drawdown |
| `INSUFFICIENT_OUTCOMES` | bets decided, none settled | bets listed without settlement; `metrics: null` |
| `OK` | admissible data, and at least one bet settled or no bet at all | metrics on the settled bets; `metrics: null` when no bet was made (every event NO_TRADE) |

**Metrics (`OK` only):**
- counts of bets won and lost from the bettor's side (`bet_result` on each bet: a LAY is `WON` when its selection loses; `outcome` stays the selection's), and of bets settled on a corrected result;
- `staked` (the stakes as quoted: for a LAY, the backer's stake it accepts, not its risk), `exposure` (capital at risk: a BACK's stake, a LAY's liability; the ROI base) and `by_side` (bets and net P/L for BACK and LAY);
- gross P/L, commission and net P/L;
- ROI = net ÷ exposure (for BACK bets the exposure is the stake, as before);
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
- `ledger` (when at least one bet was made): see above;
- `settlement_policy` (when outcomes were read): the outcomes cutoff, its source (`CONFIG` or `LATEST_IN_INPUT`) and the VOID policy;
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
