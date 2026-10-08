# #40 — Provider Trial Final Closure Report

Date: 2026-10-08  
Scope: BetsAPI / TotalCorner / FutPythonTrader trial evidence, archive readiness, provider comparison, and points 10–16 closure.  
Owner gate: final physical Render service suspension/deletion remains a separate shutdown action if the service is still present.

## 1. Certified archive identity

Qualification:

`REGENERATED CERTIFIED ARCHIVE FROM SAME FROZEN DATASET`

Certified runner commit:

`1500be816ec9fa4dd2b6a20267b8b0ce7cfb4e60`

Frozen boundary:

- `freeze_at_utc = 2026-10-06T11:18:19.484Z`
- raw record IDs: `1..82862`
- raw records: `82862`
- post-freeze records: `0`

Certified bundle:

- bytes: `498614829`
- SHA-256: `fb07443646a7f6d98afe1f0769eda6849a8339a8a84ecd556ae1e1a2b89ac456`
- trusted inventory SHA-256: `377a85327d0dd3fc61356ef48b1606b1522b87561a4e057133e415a02b004041`

Google Drive durable location:

`MatchPilot/Archives/BetsAPI-Trial-2026-10-05_06/regenerated/readback40/`

Drive transfer/readback:

- 13 split bundle artifacts + metadata
- every Drive-downloaded artifact matched the corresponding GitHub artifact SHA-256
- bundle reconstructed byte-identically
- independent `extract-readback`: PASS
- files verified: 29
- mismatch count: 0

Final readback run: `37702158603` — SUCCESS.

## 2. Point 10 — final manifest, data dictionary, Strategy Lab catalog

### Final manifest

Archive package versions:

- archive: `provider-trial-regenerated-pit-v1`
- analytics: `matchpilot-trial-analytics-pit-v2`
- closing rule: `closing_odds_pit_v1`

Required raw datasets:

- records
- sports
- competitions
- coverage
- events
- odds_observations
- odds_summary
- reconciliation_state

Required canonical datasets:

- sports
- competitions
- coverage
- events
- odds_observations
- odds_summary

Required analytics/readiness relations include:

- v_prematch
- v_live
- v_replay_asof
- v_events
- v_odds_timeline
- v_market_movement
- v_coverage
- v_provider_comparison
- v_strategy_fields
- v_indicator_inputs
- v_math_inputs
- v_backtest_observations
- v_outcomes
- v_closing_odds_pit
- v_provider_closing_retrospective
- v_pit_observation_timeline

### Data dictionary — core fields

| Dataset | Key fields | Temporal fields | Main use |
| --- | --- | --- | --- |
| records | record_id, source_type, instance_id | observed_at, persisted_at | immutable raw trial evidence |
| events | provider, event_id | kickoff_utc, first_seen_at, last_seen_at | event identity and timing |
| coverage | provider, sport_id, country_code, league_id | earliest/latest event and observation times | provider/league coverage |
| odds_observations | observation_id, provider, event_id, bookmaker, market_key, selection_key, line_value | provider_time, observed_at, kickoff_utc | market timeline / PIT research |
| odds_summary | provider + event/market/selection/line | derived closing timestamps | derived market summary |
| reconciliation_state | key | updated_at | collector/reconciliation state |

Null semantics remain explicit. Missing is not converted to zero. ScoreTrend rows are preserved only in segregated raw evidence and excluded from canonical analytics.

### Strategy Lab field catalog

The portable DuckDB contains a versioned `strategy_field_catalog` with these initial certified fields:

| Field | Source | Phases | Readiness |
| --- | --- | --- | --- |
| closing_odds_pit / price research | v_prematch / PIT timeline | prematch / research timeline | STRATEGY_RESEARCH_READY with PIT limitation |
| market_key | v_odds_timeline | prematch, live | STRATEGY_RESEARCH_READY |
| selection_key | v_odds_timeline | prematch, live | STRATEGY_RESEARCH_READY |
| line_value | v_odds_timeline | prematch, live | STRATEGY_RESEARCH_READY |
| kickoff_utc | v_events | prematch, live | REPLAY_RESEARCH_READY |
| event_count | v_coverage | all | QUERY_READY |

This catalog is research metadata only. Formula ownership, indicator versioning, KEEP/MERGE/REJECT and promotion remain owned by #34.

## 3. Point 11 — deterministic Google Drive structure

PASS.

Final durable hierarchy:

`MatchPilot/Archives/BetsAPI-Trial-2026-10-05_06/regenerated/readback40/`

The obsolete 90 MB transfer chunks were deleted after the 40 MB readback chain passed. Only the final readback40 set remains.

## 4. Point 12 — complete Drive upload

PASS.

The certified bundle was transferred to Drive in deterministic split form because the connector enforces a per-file transfer limit below the bundle size.

No archive semantics changed during splitting. Reassembly order is lexical part order.

## 5. Point 13 — real Drive readback

PASS.

Every final part was independently downloaded from Google Drive. This was not a local copy or a second DB export.

## 6. Point 14 — size/SHA integrity after readback

PASS.

- 13/13 Drive-downloaded parts: exact SHA-256 match against their source artifact
- metadata artifact: exact SHA-256 match
- reconstructed bundle: exact bytes `498614829`
- reconstructed bundle SHA-256:
  `fb07443646a7f6d98afe1f0769eda6849a8339a8a84ecd556ae1e1a2b89ac456`
- trusted inventory SHA-256:
  `377a85327d0dd3fc61356ef48b1606b1522b87561a4e057133e415a02b004041`
- `PROVIDER_TRIAL_READBACK_LOCAL_VERIFICATION`: PASS, 29 files, mismatch_count=0

## 7. Provider comparison — real trial evidence

### Observed volumes

| Source | Trial evidence |
| --- | ---: |
| BetsAPI raw family | 48,756 records |
| TotalCorner raw family | 32,449 records |
| ScoreTrend segregated | 1,657 records |
| BetsAPI normalized odds observations | 821,877 |
| BetsAPI canonical events | 401,349 |
| FPT match facts currently persisted | 161,801 |
| FPT catalog entries | 1,027 |
| FPT field coverage rows | 194,333 |
| FPT distinct monitored fields | 649 |

ScoreTrend is outside the provider decision and remains excluded.

### Latency/error evidence

| Provider | latency samples | p50 | p95 | max | HTTP 429 | HTTP 5xx |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| TotalCorner | 32,449 | 32 ms | 97 ms | 8,772 ms | 0 | 0 |
| BetsAPI | 47,974 | 277 ms | 9,574.7 ms | 20,627 ms | 376 | 487 |

These metrics are trial observations, not a universal SLA.

### FutPythonTrader

Current mirror evidence:

- 1,027 competition/season catalog rows
- 56 countries
- 165 league slugs
- 161,801 current match facts
- 161,777 aggregated competition-season match count
- date depth observed in persisted facts: 2020-09-11 through 2026-10-04
- 615 competition-season rows report prematch availability
- 649 distinct fields represented in coverage accounting
- latest coverage audit: payload mismatch 0, rollup mismatch 0, class mismatch 0

FPT is therefore the strongest source in this dataset for structured historical/prematch feature research.

### TotalCorner

Real trial raw evidence includes:

- 14,550 `totalcorner_match_view`
- 14,547 `totalcorner_match_odds`
- 2,680 `totalcorner_today_inplay`
- 336 ended snapshots
- 336 upcoming snapshots

TotalCorner showed materially lower trial latency and zero observed 429/5xx in the frozen window.

Important limitation: TotalCorner was retained in the raw trial evidence but was not promoted into the same canonical `events/odds_observations` model used for BetsAPI. Therefore cross-provider canonical identity coverage must not be invented from this archive.

### BetsAPI

The trial produced:

- broad documented Events/Soccer and bookmaker-family discovery
- Bet365, BWin, Betfair Exchange, Betfair Sportsbook, SBOBET, 1xBet and results-family evidence
- 821,877 normalized odds observations
- 64,446 normalized market groups
- 1,336 canonical coverage rows after ScoreTrend exclusion
- broad event/history coverage in the canonical layer

Observed downsides:

- substantially higher p95 latency than TotalCorner in this trial
- 376 HTTP 429 observations
- 487 HTTP 5xx observations
- recurring monthly cost is not authorized as a production dependency
- production promotion remains owner-gated

## 8. Final provider verdict matrix

| Area | FPT | TotalCorner | BetsAPI | Verdict |
| --- | --- | --- | --- | --- |
| historical match depth | strong | trial-only raw evidence | broad trial discovery | **BEST: FPT** |
| prematch structured statistics | strong | useful complement | useful complement | **BEST: FPT / COMPLEMENTARY: TC+BetsAPI** |
| live operational feed | not primary | strong trial latency, rich live payload | broad but slower/noisier trial | **BEST: TotalCorner** |
| odds/market breadth discovery | limited structured prematch odds | odds/Asian/goal/corner lines | very broad bookmaker/market coverage | **BEST discovery: BetsAPI; COMPLEMENTARY operationally** |
| vendor independence | high in current architecture | acceptable | lower due paid external dependency | **FPT + TC preferred** |
| production necessity | core source | core candidate/source | no demonstrated necessity | **BetsAPI NOT REQUIRED** |
| current cost/benefit | retained | retained/current membership path | owner considers recurring cost unsustainable now | **BetsAPI NOT WORTH COST as mandatory core dependency** |

### Recommended production architecture

Current evidence supports:

1. FutPythonTrader as historical/prematch research backbone.
2. TotalCorner as live/market operational source.
3. BetsAPI retained as archived benchmark, discovery evidence and possible future optional provider only.
4. No production feature may require BetsAPI without a new owner decision.

## 9. Indicator Library impact (#34)

The archive is sufficient to support input discovery for:

- Pressure Index
- Goal Pressure
- Momentum
- Draw Risk
- Vulnerable Score
- Attack/territorial/shot/corner/card pressure families
- market movement and odds momentum families

But this report does **not** promote any indicator.

Data dependency recommendation:

- historical baselines: FPT
- live pressure/event inputs: TotalCorner
- broad market/bookmaker benchmark: BetsAPI optional
- liquidity/fill-dependent indicators: NOT READY from this archive

No candidate should depend exclusively on BetsAPI unless #34 demonstrates incremental out-of-sample value sufficient to justify the recurring provider cost.

## 10. Point 15 — final archive readiness

PASS WITH EXPLICIT LIMITS.

Allowed readiness labels:

- QUERY_READY
- REPLAY_RESEARCH_READY
- STRATEGY_RESEARCH_READY
- INDICATOR_INPUT_READY
- MATH_INPUT_READY
- BACKTEST_RESEARCH_READY
- PROVIDER_COMPARISON_READY

Hard limitations:

1. `closing_odds_pit_v1`: all 64,446 frozen market groups are `UNAVAILABLE`; no arbitrary closing price was selected.
2. Provider-retrospective closing is audit/research only and is not a PIT feature.
3. Liquidity is `UNAVAILABLE`.
4. Matched fill price is not certified.
5. No execution-quality or slippage certification.
6. Outcome labels are not fully materialized in the portable archive.
7. TotalCorner remains raw in this archive rather than normalized into the same canonical provider model.
8. Cross-provider identity joins remain unresolved unless separately VERIFIED.
9. This archive is research/evidence, not the runtime DB or financial ledger.

## 11. Point 16 — independent audit of points 1–15

Verdict: **PASS WITH RESERVES limited to declared research semantics; no integrity blocker remains.**

Hard evidence reviewed:

- frozen DB boundary
- deterministic keyset export
- ScoreTrend segregation
- portable DuckDB relocation
- secret scan
- final SHA inventory
- final reconciliation mismatch 0
- complete transfer inventory
- durable Drive upload
- independent Drive downloads
- per-part SHA-256 verification
- byte-identical bundle reconstruction
- independent `extract-readback`
- 29-file verification with mismatch 0
- removal of temporary GitHub transfer artifacts

No archive integrity, durability, secret, portability or readback blocker remains.

The reserves are semantic/product limits listed in Point 15, not archive failures.

## 12. Point 17 — shutdown gate

Owner has authorized final closure work on 2026-10-08.

Automatable shutdown actions:

- GitHub provider-trial keepalive: remove/disable
- BetsAPI legacy collection: disable
- BetsAPI Everything collection: disable
- trial census/history/odds loops: disable
- internal keepalive URL: disable
- TotalCorner collection on the temporary collector: disable without touching the frozen database

Physical Render service suspension/deletion must be verified separately. The current connector does not expose a suspend/delete operation.

## 13. Final closure decision

The archive, provider comparison, readiness report and independent audit are complete.

Recommended production decision:

**Use FPT + TotalCorner as the current core data architecture. Keep BetsAPI as optional archived benchmark/future owner-gated provider. Do not purchase or require a recurring BetsAPI plan now.**

#40 may be closed only after the temporary Render collector is confirmed physically suspended/deleted (or another owner-approved equivalent shutdown state is recorded).
