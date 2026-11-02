# MatchPilot — Roadmap MASTER (generata da `tools/governance/master.mjs render`, non modificare a mano)

MASTER: #288 · base riconciliata `b6dc4ce` · 2026-11-02

Ogni scheda elenca i requisiti (`requirements.jsonl`) e porta test, HARD TEST REALI, browser QA, evidenze e gate in `cards.jsonl`.

## P0 — Governance e tracciabilità (27 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-012 | Governance e tracciabilità — #20: Football-only scope; other sports out of scope (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-017 | Governance e tracciabilità — #23: Future SaaS features must not be implemented implicitly (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-021 | Governance e tracciabilità — #28: Hard gate: Trading Engine CHIUDIBILE checklist (+1) | 2 | NOT STARTED | NO |
| MP-CARD-031 | Governance e tracciabilità — #31: RECON PR sequence RECON-PR-01..12 normalised to RECON-CORE-01..05 (#10 | 1 | NOT STARTED | NO |
| MP-CARD-034 | Governance e tracciabilità — #32: Final acceptance checklist SECURITY HARDENING CLOSABLE (16 points) | 1 | NOT STARTED | NO |
| MP-CARD-041 | Governance e tracciabilità — #34: Strategy Lab acceptance checklist (final) | 1 | NOT STARTED | NO |
| MP-CARD-045 | Governance e tracciabilità — #40: Owner decision: BetsAPI not economically sustainable (~100 EUR/month); (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-049 | Governance e tracciabilità — #45: Out-of-scope rule: no indirect introduction of real execution | 1 | IMPLEMENTING | NO |
| MP-CARD-053 | Governance e tracciabilità — #91: Reviews and one PR at a time; implementation sequence (audit -> E2E ha | 1 | IMPLEMENTING | NO |
| MP-CARD-057 | Governance e tracciabilità — #94: PR split MATH-CORE-01..08; sidebar/UI deferred (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-060 | Governance e tracciabilità — #95: All future settings must be account-persistent (+3) | 4 | IMPLEMENTING | NO |
| MP-CARD-066 | Governance e tracciabilità — #96: PR cards and gate (+1) | 2 | NOT STARTED | NO |
| MP-CARD-070 | Governance e tracciabilità — #97: Gate before final UI (17 capabilities via API/tooling) (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-073 | Governance e tracciabilità — #98: Definition of Done: core testable end-to-end by ChatGPT/tooling withou (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-076 | Governance e tracciabilità — #99: Certification dependency: HARD_VERIFIED_REAL + TOOL_VERIFIED before #3 | 1 | NOT STARTED | NO |
| MP-CARD-080 | Governance e tracciabilità — #100: MARKET-PR-01..06 cards and gate | 1 | IMPLEMENTING | NO |
| MP-CARD-083 | Governance e tracciabilità — #150: Owner wording confirmation of agent-transcribed decisions (N-5) | 1 | NOT STARTED | NO |
| MP-CARD-088 | Governance e tracciabilità — #179: Previous owner-requested tracking: issue records every verdict and own | 1 | IMPLEMENTING | NO |
| MP-CARD-090 | Governance e tracciabilità — #182: Continue programming one PR at a time with Gate A/B, CI, review; S3/S4 (+5) | 6 | IMPLEMENTING | NO |
| MP-CARD-093 | Governance e tracciabilità — #225: Scope constraints: read-only, no deploy/merge/spend/external transfer, | 1 | NOT STARTED | NO |
| MP-CARD-095 | Governance e tracciabilità — #234: Constraints: no purchase/new key/scraping/IP bypass; Render/Neon off,  | 1 | NOT STARTED | NO |
| MP-CARD-101 | Governance e tracciabilità — #239: Objective quality metrics; no best-in-class claims (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-109 | Governance e tracciabilità — #263: Prior conflicting provider decisions superseded only for provider choi (+1) | 2 | IMPLEMENTING | NO |
| MP-PR-00:R-00 | MP-PR-00:R-00 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 26 | IMPLEMENTING | NO |
| MP-PR-00:R-01 | MP-PR-00:R-01 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 24 | IMPLEMENTING | NO |
| MP-PR-00:R-18 | MP-PR-00:R-18 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 20 | IMPLEMENTING | SÌ |
| MP-PR-00:continuous | MP-PR-00:continuous (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 97 | IMPLEMENTING | SÌ |

## P1 — PR MANUAL aperte in attesa del GO owner (5 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-OPEN-280 | PR #280 — PIT LIVE: fasi temporali e LIVE_ACQUIRED | 31 | IMPLEMENTED | SÌ |
| MP-CARD-OPEN-281 | PR #281 — mp-deploy v3.4 con guardia di dismissione FPT | 13 | IMPLEMENTED | NO |
| MP-CARD-OPEN-282 | PR #282 — migrazione 031 snapshot quote | 24 | IMPLEMENTED | SÌ |
| MP-CARD-OPEN-283 | PR #283 — collector PREMATCH API-FOOTBALL | 26 | IMPLEMENTED | SÌ |
| MP-CARD-OPEN-285 | PR #285 — ricerca universale API | 25 | IMPLEMENTED | SÌ |

## P2 — Dati e provider (API-FOOTBALL) (46 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-006 | Dati calcistici — #4: Incremental sync of active seasons (+4) | 5 | IMPLEMENTING | NO |
| MP-CARD-008 | Dati calcistici — #12: Reconcile snapshot/version/unique-match counts; collisions; malformed  (+5) | 6 | IMPLEMENTING | NO |
| MP-CARD-013 | Dati calcistici — #20: Empirical test that live statistics are (not) retroactive; retroactive (+3) | 4 | IMPLEMENTING | NO |
| MP-CARD-022 | Dati calcistici — #28: Live: one centralised collector per match, N users != N calls (+3) | 4 | IMPLEMENTING | NO |
| MP-CARD-027 | Dati calcistici — #31: Recovery strategy: recoverable upstream (re-download interval, verify  (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-035 | Dati calcistici — #32: Request deduplication: concurrent identical requests share one upstrea (+3) | 4 | IMPLEMENTING | NO |
| MP-CARD-042 | Dati calcistici — #34: Season coverage states (+5) | 6 | IMPLEMENTING | NO |
| MP-CARD-046 | Dati calcistici — #40: Lineage/versioning of derived rows: source_record_ids, source_snapshot | 1 | IMPLEMENTING | NO |
| MP-CARD-078 | Dati calcistici — #100: Result source: provider-independent final score | 1 | IMPLEMENTING | NO |
| MP-CARD-081 | Mercati e quote — #100: Dynamic market catalogue interplay (market_ref) | 1 | IMPLEMENTING | NO |
| MP-CARD-087 | Dati calcistici — #179: F3 / APP-01: /api/futpython-certification ~24 s; rowGaps query rewrite | 1 | NOT STARTED | NO |
| MP-CARD-091 | Dati calcistici — #182: TotalCorner LIVE-only conditional candidate: read-only assessment/cont | 1 | BLOCKED | NO |
| MP-CARD-092 | Dati calcistici — #225: Forensic preflight: verify reachable VPS/DB, repository SHA, PostgreSQ (+8) | 9 | NOT STARTED | NO |
| MP-CARD-094 | Dati calcistici — #234: Licence for caching, VPS storage, commercial use, redistribution, rese (+1) | 2 | NOT STARTED | NO |
| MP-CARD-097 | Dati calcistici — #239: MP-PRODUCT-100: zero arbitrary limitations; universal capability (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-098 | Mercati e quote — #239: MP-CAP-04 time windows (+1) | 2 | BLOCKED | NO |
| MP-CARD-102 | Dati calcistici — #248: AF-G1 endpoint contract/payload verification: 38 GET + /status (anagra (+4) | 5 | IMPLEMENTING | NO |
| MP-CARD-105 | Dati calcistici — #249: FR-01 inventory of all FPT fields and dependencies actually used in Ma (+6) | 7 | IMPLEMENTING | NO |
| MP-CARD-108 | Dati calcistici — #263: Field mapping and contracts FPT/TC to API-FOOTBALL (+15) | 16 | IMPLEMENTING | NO |
| MP-CARD-111 | Mercati e quote — #263: Schema 031 staged: append-only snapshot and request tables with DB-enf (+2) | 5 | IMPLEMENTING | NO |
| A-104:MARKET-CORE-01 | A-104:MARKET-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MARKET-CORE-02 | A-104:MARKET-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MARKET-CORE-03 | A-104:MARKET-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:MARKET-CORE-04 | A-104:MARKET-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MARKET-CORE-05 | A-104:MARKET-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:RECON-CORE-01 | A-104:RECON-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:RECON-CORE-02 | A-104:RECON-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:RECON-CORE-03 | A-104:RECON-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:RECON-CORE-04 | A-104:RECON-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:RECON-CORE-05 | A-104:RECON-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:TC-CORE-01 | A-104:TC-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-02 | A-104:TC-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-03 | A-104:TC-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-03B | A-104:TC-CORE-03B (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-04 | A-104:TC-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-05 | A-104:TC-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-06 | A-104:TC-CORE-06 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-06B | A-104:TC-CORE-06B (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:TC-CORE-07 | A-104:TC-CORE-07 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TC-CORE-08 | A-104:TC-CORE-08 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| MP-PR-00:R-02 | MP-PR-00:R-02 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 20 | IMPLEMENTING | NO |
| MP-PR-00:R-06 | MP-PR-00:R-06 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 31 | IMPLEMENTING | SÌ |
| MP-PR-00:R-08 | MP-PR-00:R-08 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 48 | IMPLEMENTING | SÌ |
| MP-PR-00:R-15 | MP-PR-00:R-15 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 22 | IMPLEMENTING | SÌ |
| MP-PR-00:R-16 | MP-PR-00:R-16 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 39 | IMPLEMENTING | SÌ |
| MP-PR-00:R-17 | MP-PR-00:R-17 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 54 | IMPLEMENTING | SÌ |

## P3 — Ricerca, mercati e analisi (13 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-001 | Analisi, indicatori e formule — #3: Shared computation: precompute, derived tables, event-driven recompute | 1 | IMPLEMENTING | NO |
| MP-CARD-011 | Ricerca universale — #12: Filter operators = != > >= < <= between in not in contains exists miss | 1 | IMPLEMENTING | NO |
| MP-CARD-054 | Analisi, indicatori e formule — #94: TOOL 10c: Fibonacci (+5) | 6 | IMPLEMENTING | NO |
| MP-CARD-110 | Analisi, indicatori e formule — #263: Catalog statuses AVAILABLE/NOT AVAILABLE/NOT VERIFIED per competition  | 1 | NOT STARTED | NO |
| A-104:MATH-CORE-01 | A-104:MATH-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MATH-CORE-02 | A-104:MATH-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MATH-CORE-03 | A-104:MATH-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MATH-CORE-04 | A-104:MATH-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MATH-CORE-05 | A-104:MATH-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:MATH-CORE-06 | A-104:MATH-CORE-06 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MATH-CORE-07 | A-104:MATH-CORE-07 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MATH-CORE-08 | A-104:MATH-CORE-08 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| MP-PR-00:R-12 | MP-PR-00:R-12 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 51 | IMPLEMENTING | SÌ |

## P4 — Strategie, backtest e replay (22 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-003 | Strategie, backtest e replay — #3: Intelligence: Lay Score vulnerability (+7) | 8 | IMPLEMENTING | SÌ |
| MP-CARD-018 | Strategie, backtest e replay — #27: Anti-betting rule: primary metric is ex-ante trading decision quality, (+2) | 3 | NOT STARTED | NO |
| MP-CARD-024 | Strategie, backtest e replay — #28: AND / OR / NOT nested groups (+9) | 10 | IMPLEMENTING | NO |
| MP-CARD-036 | Strategie, backtest e replay — #34: Creation flow (12 steps) (+19) | 20 | IMPLEMENTING | NO |
| MP-CARD-037 | Strategie, backtest e replay — #34: Indicators as Strategy Lab DSL fields (Pressure, Goal Pressure, Moment | 1 | NOT STARTED | NO |
| MP-CARD-065 | Strategie, backtest e replay — #96: Backtest / Replay / Simulation with MM frozen | 1 | IMPLEMENTING | NO |
| A-104:BENCH-CORE-01 | A-104:BENCH-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:QUERY-CORE-01 | A-104:QUERY-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:QUERY-CORE-02 | A-104:QUERY-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:REPLAY-CORE-01 | A-104:REPLAY-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:REPLAY-CORE-02 | A-104:REPLAY-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:REPLAY-CORE-03 | A-104:REPLAY-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:STRAT-CORE-01 | A-104:STRAT-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:STRAT-CORE-02 | A-104:STRAT-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:STRAT-CORE-03 | A-104:STRAT-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:STRAT-CORE-04 | A-104:STRAT-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:STRAT-CORE-05 | A-104:STRAT-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:STRAT-CORE-06 | A-104:STRAT-CORE-06 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:STRAT-CORE-07 | A-104:STRAT-CORE-07 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| MP-PR-00:R-09 | MP-PR-00:R-09 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 34 | IMPLEMENTING | SÌ |
| MP-PR-00:R-10 | MP-PR-00:R-10 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 4 | IMPLEMENTING | SÌ |
| MP-PR-00:R-14 | MP-PR-00:R-14 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 34 | IMPLEMENTING | SÌ |

## P5 — Trading, Money Management e ledger (45 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-004 | Money Management — #3: Backtest/risk: Exposure limits | 1 | IMPLEMENTING | NO |
| MP-CARD-005 | Ledger e contabilità — #3: Backtest/risk: Immutable journal | 1 | IMPLEMENTING | SÌ |
| MP-CARD-019 | Trading — #28: Product contract: trading tool, not tipster (+19) | 20 | IMPLEMENTING | NO |
| MP-CARD-020 | Trading — #28: TRADING-PR-02 Pre-match trading planner (+10) | 11 | NOT STARTED | NO |
| MP-CARD-028 | Trading — #31: Automatic backfill after outage (example: lost at 68:15, back at 71:40 | 1 | NOT STARTED | NO |
| MP-CARD-030 | Ledger e contabilità — #31: Data integrity ledger: reconciliation_id, source, scope, entity, detec | 1 | BLOCKED | NO |
| MP-CARD-038 | Money Management — #34: Stake type: bankroll % (+5) | 6 | IMPLEMENTING | NO |
| MP-CARD-044 | Ledger e contabilità — #34: Settlement lifecycle for strategies/backtests (superseded wording) | 1 | IMPLEMENTING | NO |
| MP-CARD-055 | Money Management — #94: TOOL 11: Risk Exposure (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-056 | Trading — #94: CALCULATE / PREPARE / EXECUTE separation | 1 | IMPLEMENTING | NO |
| MP-CARD-058 | Ledger e contabilità — #95: Commission propagation to every net calculation consumer | 1 | IMPLEMENTING | NO |
| MP-CARD-061 | Ledger e contabilità — #96: Domain boundary with #99 (+3) | 4 | IMPLEMENTING | NO |
| MP-CARD-063 | Money Management — #96: MM Registry census before implementation (10 steps) (+19) | 20 | IMPLEMENTING | NO |
| MP-CARD-064 | Money Management — #96: Deterministic priority and hard caps (+7) | 8 | IMPLEMENTING | NO |
| MP-CARD-067 | Trading — #97: Phase 9 Trading Engine (#28) (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-068 | Money Management — #97: Phase 5 MM operational mode STOP/RESUME and capability flags | 1 | IMPLEMENTING | NO |
| MP-CARD-074 | Ledger e contabilità — #99: Accounting separated from MM and gateway (+14) | 15 | IMPLEMENTING | NO |
| MP-CARD-077 | Trading — #99: PAPER-CORE-01 paper position from validated intent | 1 | IMPLEMENTING | NO |
| MP-CARD-079 | Ledger e contabilità — #100: Rule version freeze; same input + rule version => same resolution (+1) | 2 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-01 | A-104:LEDGER-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-02 | A-104:LEDGER-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-03 | A-104:LEDGER-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-04 | A-104:LEDGER-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-05 | A-104:LEDGER-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-06 | A-104:LEDGER-CORE-06 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:LEDGER-CORE-07 | A-104:LEDGER-CORE-07 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:MM-CORE-01 | A-104:MM-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MM-CORE-02 | A-104:MM-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MM-CORE-03 | A-104:MM-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MM-CORE-04 | A-104:MM-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MM-CORE-05 | A-104:MM-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MM-CORE-06 | A-104:MM-CORE-06 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:MM-CORE-07 | A-104:MM-CORE-07 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MM-CORE-08 | A-104:MM-CORE-08 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:MM-INTEGRATION-01 | A-104:MM-INTEGRATION-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:PAPER-CORE-01 | A-104:PAPER-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:TRADE-CORE-01 | A-104:TRADE-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-02 | A-104:TRADE-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-03 | A-104:TRADE-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-04 | A-104:TRADE-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-05 | A-104:TRADE-CORE-05 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-06 | A-104:TRADE-CORE-06 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-07 | A-104:TRADE-CORE-07 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TRADE-CORE-08 | A-104:TRADE-CORE-08 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| MP-PR-00:R-13 | MP-PR-00:R-13 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 30 | IMPLEMENTING | SÌ |

## P6 — Operator API e MCP (22 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-002 | Automazione, Operator API e MCP — #3: Cache and fan-out (CDN/app cache, WebSocket/SSE shared) | 1 | NOT STARTED | NO |
| MP-CARD-009 | Automazione, Operator API e MCP — #12: Separate provider budgets (requests/minute, requests/day) configurable (+6) | 7 | IMPLEMENTING | NO |
| MP-CARD-023 | Automazione, Operator API e MCP — #28: Cache order: server cache, DB, provider only if missing/expired | 1 | IMPLEMENTING | NO |
| MP-CARD-039 | Automazione, Operator API e MCP — #34: Alerts on state transitions with Telegram and anti-spam (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-048 | Automazione, Operator API e MCP — #44: Provider abstraction with OpenRouter and configurable model (+10) | 11 | BLOCKED | NO |
| MP-CARD-069 | Automazione, Operator API e MCP — #97: #102 Trading Copilot pre-UI tools | 1 | BLOCKED | NO |
| MP-CARD-071 | Automazione, Operator API e MCP — #98: Money Management tools: create/list/get/update/clone/archive/delete-sa (+5) | 6 | IMPLEMENTING | SÌ |
| MP-CARD-075 | Automazione, Operator API e MCP — #99: SETTLE-PR-05 API/tool contracts (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-112 | Automazione, Operator API e MCP — #263: Request ledger modeled on fpt_request_ledger with dedicated shared-key (+1) | 2 | IMPLEMENTING | NO |
| A-104:MCP-CORE-00 | A-104:MCP-CORE-00 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:MCP-CORE-01 | A-104:MCP-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:MCP-CORE-02 | A-104:MCP-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:MCP-CORE-03 | A-104:MCP-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:SETTINGS-CORE-01 | A-104:SETTINGS-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:SETTINGS-CORE-02 | A-104:SETTINGS-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:SETTINGS-CORE-03 | A-104:SETTINGS-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:SETTINGS-CORE-04 | A-104:SETTINGS-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:TCOP-CORE-01 | A-104:TCOP-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TCOP-CORE-02 | A-104:TCOP-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TCOP-CORE-03 | A-104:TCOP-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| A-104:TCOP-CORE-04 | A-104:TCOP-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | BLOCKED | NO |
| MP-PR-00:R-03 | MP-PR-00:R-03 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 87 | IMPLEMENTING | SÌ |

## P7 — Interfaccia web (165 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-016 | Interfaccia web — #23: Settings -> Users & Permissions section for the owner | 1 | BLOCKED | SÌ |
| MP-CARD-026 | Interfaccia web — #28: Indicator explainability rule + 'Come funziona questo indicatore?' pan | 1 | BLOCKED | SÌ |
| MP-CARD-032 | Interfaccia web — #32: Frontend production hardening: minify, tree-shake, mangle, no public s | 1 | BLOCKED | SÌ |
| MP-CARD-043 | Interfaccia web — #34: Data Coverage -> Competitions UI (+1) | 2 | IMPLEMENTING | SÌ |
| MP-CARD-052 | Interfaccia web — #91: Versioned UI interaction inventory / coverage matrix: every route, pag (+5) | 6 | IMPLEMENTING | SÌ |
| MP-CARD-099 | Interfaccia web — #239: MP-UI-CAP-01/02 capability-driven UI (SAFE after CAP PRs) | 1 | BLOCKED | SÌ |
| #98 OPERATOR-API (MCP-CORE, #104) | #98 OPERATOR-API (MCP-CORE, #104) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| BENCH-CORE-01 | BENCH-CORE-01 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | NOT STARTED | SÌ |
| CONSEGNATO su main (vedi evidenza) | CONSEGNATO su main (vedi evidenza) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 24 | IMPLEMENTING | SÌ |
| CONSEGNATO su main (vedi evidenza) + ogni nuova card | CONSEGNATO su main (vedi evidenza) + ogni nuova card (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | IMPLEMENTING | SÌ |
| ESCLUSO (#45, MP-OWNER-EXCLUDE-REAL-EXECUTION-01) | ESCLUSO (#45, MP-OWNER-EXCLUDE-REAL-EXECUTION-01) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | NOT STARTED | SÌ |
| ESCLUSO (#46 SaaS, non approvato) | ESCLUSO (#46 SaaS, non approvato) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| HIST-01b (backend) + MP-UI-PR-046-BTCTRL | HIST-01b (backend) + MP-UI-PR-046-BTCTRL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| LIVE-PR-01 | LIVE-PR-01 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 10 | IMPLEMENTING | SÌ |
| LIVE-PR-02 | LIVE-PR-02 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| LIVE-PR-03 | LIVE-PR-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | NOT STARTED | SÌ |
| LIVE-PR-03 (#29; con LIVE-PR-01…11) | LIVE-PR-03 (#29; con LIVE-PR-01…11) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| LIVE-PR-04 | LIVE-PR-04 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| LIVE-PR-05 | LIVE-PR-05 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| LIVE-PR-06 | LIVE-PR-06 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | NOT STARTED | SÌ |
| LIVE-PR-07 | LIVE-PR-07 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| LIVE-PR-08 | LIVE-PR-08 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | NOT STARTED | SÌ |
| LIVE-PR-09 | LIVE-PR-09 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| LIVE-PR-09 (#29) | LIVE-PR-09 (#29) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| LIVE-PR-10 | LIVE-PR-10 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | IMPLEMENTING | SÌ |
| LIVE-PR-11 | LIVE-PR-11 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| LIVE-PR-12 | LIVE-PR-12 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MATH-CORE-07 (backend); PR UI non pianificata | MATH-CORE-07 (backend); PR UI non pianificata (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MATH-CORE-07 / MP-MTH-002 (backend) | MATH-CORE-07 / MP-MTH-002 (backend) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MCP-CORE-01..03 (#104) | MCP-CORE-01..03 (#104) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-OWNER-D12-IMPLEMENTATION-20261024 phase A (this governance PR) | MP-OWNER-D12-IMPLEMENTATION-20261024 phase A (this governance PR) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-PR-00:R-05 | MP-PR-00:R-05 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 35 | IMPLEMENTING | SÌ |
| MP-PR-00:R-07 | MP-PR-00:R-07 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 64 | IMPLEMENTING | SÌ |
| MP-PR-00:R-11 | MP-PR-00:R-11 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 7 | IMPLEMENTING | SÌ |
| MP-UI-PR-001 (#240, mergiata) | MP-UI-PR-001 (#240, mergiata) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-001/002 (mergiate) | MP-UI-PR-001/002 (mergiate) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-003 (#242, mergiata) | MP-UI-PR-003 (#242, mergiata) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-004 (#243) | MP-UI-PR-004 (#243) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-004 (#243) + MP-UI-PR-066-SESSION | MP-UI-PR-004 (#243) + MP-UI-PR-066-SESSION (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-004 (#243, mergiata) | MP-UI-PR-004 (#243, mergiata) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-005 (#244) + MP-UI-CERT-CALC-01 (#246) | MP-UI-PR-005 (#244) + MP-UI-CERT-CALC-01 (#246) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 16 | IMPLEMENTING | SÌ |
| MP-UI-PR-005 (#244) e #246 (mergiate) | MP-UI-PR-005 (#244) e #246 (mergiate) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-006-STRAT | MP-UI-PR-006-STRAT (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-007-FOUND | MP-UI-PR-007-FOUND (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-007-FOUND (badge condiviso) | MP-UI-PR-007-FOUND (badge condiviso) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-008-COV | MP-UI-PR-008-COV (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-009-NAV | MP-UI-PR-009-NAV (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-010-BOARD | MP-UI-PR-010-BOARD (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-011-SRCHX | MP-UI-PR-011-SRCHX (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | IMPLEMENTING | SÌ |
| MP-UI-PR-012-DATAQ | MP-UI-PR-012-DATAQ (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| MP-UI-PR-013-FLOW | MP-UI-PR-013-FLOW (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-013-FLOW (aggiornamento mock) | MP-UI-PR-013-FLOW (aggiornamento mock) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-013-FLOW (mock) | MP-UI-PR-013-FLOW (mock) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-013-FLOW + MP-UI-PR-006 Strategie | MP-UI-PR-013-FLOW + MP-UI-PR-006 Strategie (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-014-HUBSHELL | MP-UI-PR-014-HUBSHELL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-015-HUBCORE | MP-UI-PR-015-HUBCORE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | IMPLEMENTING | SÌ |
| MP-UI-PR-016-HUBFILTERS | MP-UI-PR-016-HUBFILTERS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-017-HUBDRILL | MP-UI-PR-017-HUBDRILL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-018-HUBMARKETS | MP-UI-PR-018-HUBMARKETS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| MP-UI-PR-019-HUBADV | MP-UI-PR-019-HUBADV (scheda esistente, docs/governance/ui-requirements-matrix.json) | 11 | IMPLEMENTING | SÌ |
| MP-UI-PR-020-PRESETS | MP-UI-PR-020-PRESETS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | IMPLEMENTING | SÌ |
| MP-UI-PR-021-HUBTRADE | MP-UI-PR-021-HUBTRADE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-022-MC-PLAN | MP-UI-PR-022-MC-PLAN (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-023-MCF-STATE | MP-UI-PR-023-MCF-STATE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | IMPLEMENTING | SÌ |
| MP-UI-PR-024-MCF-CARDS (con le PR #30 di UI-04) | MP-UI-PR-024-MCF-CARDS (con le PR #30 di UI-04) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 18 | IMPLEMENTING | SÌ |
| MP-UI-PR-025-MCF-FINAL-STATS | MP-UI-PR-025-MCF-FINAL-STATS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MP-UI-PR-026-MCF-MARKETS | MP-UI-PR-026-MCF-MARKETS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-027-MCF-TRADING-POSTMORTEM | MP-UI-PR-027-MCF-TRADING-POSTMORTEM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | BLOCKED | SÌ |
| MP-UI-PR-028-MCF-EXPORT | MP-UI-PR-028-MCF-EXPORT (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | IMPLEMENTING | SÌ |
| MP-UI-PR-029-LIVE-LAYOUT | MP-UI-PR-029-LIVE-LAYOUT (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | BLOCKED | SÌ |
| MP-UI-PR-030-LIVE-DEMO | MP-UI-PR-030-LIVE-DEMO (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-031-LIVE-RAIL | MP-UI-PR-031-LIVE-RAIL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MP-UI-PR-032-LIVE-PRESSURE | MP-UI-PR-032-LIVE-PRESSURE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | IMPLEMENTING | SÌ |
| MP-UI-PR-033-LIVEMATCH | MP-UI-PR-033-LIVEMATCH (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | BLOCKED | SÌ |
| MP-UI-PR-034-RPL-PLAYER | MP-UI-PR-034-RPL-PLAYER (scheda esistente, docs/governance/ui-requirements-matrix.json) | 6 | IMPLEMENTING | SÌ |
| MP-UI-PR-035-RPL-CHARTS-GAPS | MP-UI-PR-035-RPL-CHARTS-GAPS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | NOT STARTED | SÌ |
| MP-UI-PR-036-RPL-MM | MP-UI-PR-036-RPL-MM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | BLOCKED | SÌ |
| MP-UI-PR-037-COP-REPLAY | MP-UI-PR-037-COP-REPLAY (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-038-STRATLIFE | MP-UI-PR-038-STRATLIFE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | IMPLEMENTING | SÌ |
| MP-UI-PR-039-RULEDSL | MP-UI-PR-039-RULEDSL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| MP-UI-PR-040-RULEFIELDS | MP-UI-PR-040-RULEFIELDS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 6 | IMPLEMENTING | SÌ |
| MP-UI-PR-041-RULETYPES | MP-UI-PR-041-RULETYPES (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | IMPLEMENTING | SÌ |
| MP-UI-PR-042-STRATMM | MP-UI-PR-042-STRATMM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| MP-UI-PR-043-INDLIB | MP-UI-PR-043-INDLIB (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-043-INDLIB (UI) · backend STRAT-CORE-06; calcolo live TRADE-CORE-03 | MP-UI-PR-043-INDLIB (UI) · backend STRAT-CORE-06; calcolo live TRADE-CORE-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 42 | IMPLEMENTING | SÌ |
| MP-UI-PR-044-IND-EXPLAIN | MP-UI-PR-044-IND-EXPLAIN (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-045-BTMETRICS | MP-UI-PR-045-BTMETRICS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-046-BTCTRL | MP-UI-PR-046-BTCTRL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-047-SIMMM | MP-UI-PR-047-SIMMM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-047-SIMMM (Simulazione) + MP-UI-PR-048-MMREG (registro) | MP-UI-PR-047-SIMMM (Simulazione) + MP-UI-PR-048-MMREG (registro) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | IMPLEMENTING | SÌ |
| MP-UI-PR-048-MMREG | MP-UI-PR-048-MMREG (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | IMPLEMENTING | SÌ |
| MP-UI-PR-048-MMREG / MP-UI-PR-047-SIMMM | MP-UI-PR-048-MMREG / MP-UI-PR-047-SIMMM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-049-MKTRULES | MP-UI-PR-049-MKTRULES (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-050-CONTO | MP-UI-PR-050-CONTO (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-051-MMPROF | MP-UI-PR-051-MMPROF (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-051-MMPROF (editor) / MP-UI-PR-048-MMREG (decisione) | MP-UI-PR-051-MMPROF (editor) / MP-UI-PR-048-MMREG (decisione) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-051-MMPROF / MP-UI-PR-052-OPMODE | MP-UI-PR-051-MMPROF / MP-UI-PR-052-OPMODE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-052-OPMODE | MP-UI-PR-052-OPMODE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-053-POSLEDGER | MP-UI-PR-053-POSLEDGER (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-054-TT-TREE | MP-UI-PR-054-TT-TREE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| MP-UI-PR-054-TT-TREE / MP-UI-PR-055-TT-PREMATCH-SELECTOR | MP-UI-PR-054-TT-TREE / MP-UI-PR-055-TT-PREMATCH-SELECTOR (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MP-UI-PR-055-TT-PREMATCH-SELECTOR | MP-UI-PR-055-TT-PREMATCH-SELECTOR (scheda esistente, docs/governance/ui-requirements-matrix.json) | 6 | IMPLEMENTING | SÌ |
| MP-UI-PR-056-TT-DUTCH-ARB | MP-UI-PR-056-TT-DUTCH-ARB (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| MP-UI-PR-056-TT-DUTCH-ARB … MP-UI-PR-059-TT-RISK-NETTING | MP-UI-PR-056-TT-DUTCH-ARB … MP-UI-PR-059-TT-RISK-NETTING (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MP-UI-PR-057-TT-EW-DNB | MP-UI-PR-057-TT-EW-DNB (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MP-UI-PR-058-TT-CASHOUT-COMM | MP-UI-PR-058-TT-CASHOUT-COMM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| MP-UI-PR-059-TT-RISK-NETTING | MP-UI-PR-059-TT-RISK-NETTING (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | NOT STARTED | SÌ |
| MP-UI-PR-060-TT-PROGRESSIONS | MP-UI-PR-060-TT-PROGRESSIONS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | NOT STARTED | SÌ |
| MP-UI-PR-061-TT-CALC-STATE | MP-UI-PR-061-TT-CALC-STATE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| MP-UI-PR-061-TT-CALC-STATE / MP-UI-PR-062-TT-PREPARE-MM | MP-UI-PR-061-TT-CALC-STATE / MP-UI-PR-062-TT-PREPARE-MM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-062-TT-PREPARE-MM | MP-UI-PR-062-TT-PREPARE-MM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| MP-UI-PR-063-TT-LIVE | MP-UI-PR-063-TT-LIVE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | NOT STARTED | SÌ |
| MP-UI-PR-064-SETTINGS | MP-UI-PR-064-SETTINGS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | BLOCKED | SÌ |
| MP-UI-PR-065-COMMISSION | MP-UI-PR-065-COMMISSION (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | BLOCKED | SÌ |
| MP-UI-PR-065-COMMISSION / MP-UI-PR-047-SIMMM | MP-UI-PR-065-COMMISSION / MP-UI-PR-047-SIMMM (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | BLOCKED | SÌ |
| MP-UI-PR-066-SESSION | MP-UI-PR-066-SESSION (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-067-APIREG | MP-UI-PR-067-APIREG (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-068-ASSIST | MP-UI-PR-068-ASSIST (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| MP-UI-PR-069-COP-SHELL | MP-UI-PR-069-COP-SHELL (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-070-COP-PRE | MP-UI-PR-070-COP-PRE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-071-COP-LIVE | MP-UI-PR-071-COP-LIVE (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-072-COP-ENTRY | MP-UI-PR-072-COP-ENTRY (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-073-COP-POS | MP-UI-PR-073-COP-POS (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-074-COP-MGMT | MP-UI-PR-074-COP-MGMT (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-075-COP-SET | MP-UI-PR-075-COP-SET (scheda esistente, docs/governance/ui-requirements-matrix.json) | 22 | IMPLEMENTING | SÌ |
| MP-UI-PR-076-COP-ASK | MP-UI-PR-076-COP-ASK (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| MP-UI-PR-077-A11Y | MP-UI-PR-077-A11Y (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-078-CERT12 | MP-UI-PR-078-CERT12 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 4 | NOT STARTED | SÌ |
| MP-UI-PR-078-CERT12 (hard test #30) | MP-UI-PR-078-CERT12 (hard test #30) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | BLOCKED | SÌ |
| MP-UI-PR-078-CERT12 (hard test #34) | MP-UI-PR-078-CERT12 (hard test #34) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| MP-UI-PR-078-CERT12 (matrice) | MP-UI-PR-078-CERT12 (matrice) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 27 | IMPLEMENTING | SÌ |
| MP-UI-PR-079-WATCHLIST | MP-UI-PR-079-WATCHLIST (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| NESSUNA (proposta non approvata) | NESSUNA (proposta non approvata) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| NESSUNA: capacità futura dichiarata da #96, non pianificabile senza decisione owner | NESSUNA: capacità futura dichiarata da #96, non pianificabile senza decisione owner (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| NESSUNA: opzione futura di #34, mai attiva senza approvazione owner | NESSUNA: opzione futura di #34, mai attiva senza approvazione owner (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| R-09 (backend, prerequisito) | R-09 (backend, prerequisito) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | BLOCKED | SÌ |
| R-10 (backend, prerequisito) | R-10 (backend, prerequisito) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 1 | NOT STARTED | SÌ |
| R-10 + MCP-CORE (#104) | R-10 + MCP-CORE (#104) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| REPLAY-CORE-01 | REPLAY-CORE-01 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| REPLAY-CORE-03 | REPLAY-CORE-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| STRAT-CORE-01 | STRAT-CORE-01 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| STRAT-CORE-03 | STRAT-CORE-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| STRAT-CORE-05 | STRAT-CORE-05 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| STRAT-CORE-06 | STRAT-CORE-06 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| STRAT-CORE-07 | STRAT-CORE-07 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TC-CORE-03 | TC-CORE-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 3 | IMPLEMENTING | SÌ |
| TC-CORE-04 | TC-CORE-04 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 6 | IMPLEMENTING | SÌ |
| TC-CORE-07 | TC-CORE-07 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 5 | IMPLEMENTING | SÌ |
| TCOP-CORE-01 | TCOP-CORE-01 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| TCOP-CORE-02 | TCOP-CORE-02 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| TCOP-CORE-03 | TCOP-CORE-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| TCOP-CORE-04 | TCOP-CORE-04 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 21 | IMPLEMENTING | SÌ |
| TRADE-CORE-01 | TRADE-CORE-01 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-02 | TRADE-CORE-02 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-03 | TRADE-CORE-03 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-04 | TRADE-CORE-04 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-05 | TRADE-CORE-05 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-06 | TRADE-CORE-06 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-07 | TRADE-CORE-07 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRADE-CORE-08 | TRADE-CORE-08 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| TRASVERSALE (regola di governance: vale per ogni PR, nessuna PR dedicata) | TRASVERSALE (regola di governance: vale per ogni PR, nessuna PR dedicata) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 2 | IMPLEMENTING | SÌ |
| backend (MATH-CORE-08, R-10) | backend (MATH-CORE-08, R-10) (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| decisione owner Q14, poi MP-UI-PR-078-CERT12 | decisione owner Q14, poi MP-UI-PR-078-CERT12 (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| decisione owner Q3, poi MP-UI-PR-030-LIVE-DEMO | decisione owner Q3, poi MP-UI-PR-030-LIVE-DEMO (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |
| esistente + MP-UI-PR-010-BOARD per i controlli SEEN | esistente + MP-UI-PR-010-BOARD per i controlli SEEN (scheda esistente, docs/governance/ui-requirements-matrix.json) | 0 | BLOCKED | SÌ |

## P8 — Multiutente e sicurezza (18 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-015 | Multiutente e sicurezza — #23: OWNER role immutable, sole full admin, no automatic owner, no public r (+6) | 7 | IMPLEMENTING | NO |
| MP-CARD-033 | Multiutente e sicurezza — #32: Optional build obfuscation evaluation (SEC-PR-08) (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-040 | Multiutente e sicurezza — #34: Strategy permissions for future SaaS | 1 | BLOCKED | NO |
| MP-CARD-047 | Multiutente e sicurezza — #40: Export consistency and security scrub: DB count at freeze = export = m | 1 | BLOCKED | NO |
| MP-CARD-050 | Multiutente e sicurezza — #46: Plans: Trial / Free / Paid (+9) | 10 | BLOCKED | NO |
| MP-CARD-059 | Multiutente e sicurezza — #95: Settings precedence: global, per-exchange override, explicit simulatio (+2) | 3 | NOT STARTED | NO |
| MP-CARD-062 | Multiutente e sicurezza — #96: MM account-level persistence, versioned, audited, snapshotted (+1) | 2 | BLOCKED | NO |
| MP-CARD-072 | Multiutente e sicurezza — #98: Safety: paper/simulation default; real execution (#45) separate; no se | 1 | IMPLEMENTING | NO |
| MP-CARD-086 | Multiutente e sicurezza — #179: F1: server must not always listen on 0.0.0.0; configurable validated l (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-096 | Multiutente e sicurezza — #234: SECURITY P0: API key exposed in screenshots must be rotated/revoked by | 1 | NOT STARTED | NO |
| MP-CARD-100 | Multiutente e sicurezza — #239: Provider redistribution/display/commercial-use rights | 1 | BLOCKED | NO |
| MP-CARD-104 | Multiutente e sicurezza — #248: AF licence/terms verification: storage, redistribution, commercial/bet | 1 | NOT STARTED | NO |
| MP-CARD-106 | Multiutente e sicurezza — #249: Contract/licence tests for AF: storage, commercial use, betting, ML, p | 1 | NOT STARTED | NO |
| A-104:AUTH-CORE-01 | A-104:AUTH-CORE-01 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:AUTH-CORE-02 | A-104:AUTH-CORE-02 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | IMPLEMENTING | NO |
| A-104:AUTH-CORE-03 | A-104:AUTH-CORE-03 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| A-104:AUTH-CORE-04 | A-104:AUTH-CORE-04 (scheda esistente, docs/governance/audits/2026-10-23-ROADMAP-RECON/A-104-reconciliation.json) | 1 | NOT STARTED | NO |
| MP-PR-00:R-04 | MP-PR-00:R-04 (scheda esistente, docs/governance/mp-pr-00/requirements.json) | 15 | IMPLEMENTING | NO |

## P9 — Infrastruttura, deploy e monitoraggio (12 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-007 | Infrastruttura — #6: Provider-neutral data-health/watchdog for the main provider | 1 | IMPLEMENTING | NO |
| MP-CARD-010 | Infrastruttura — #12: Budget alerts: WARNING 70-80%, CRITICAL near exhaustion, repeated 429, (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-014 | Infrastruttura — #20: No automatic deletion of historical data (retention) | 1 | IMPLEMENTING | NO |
| MP-CARD-025 | Infrastruttura — #28: Query optimisation: indexed SQL, derived facts, planner guard, paginat | 1 | IMPLEMENTING | NO |
| MP-CARD-029 | Infrastruttura — #31: Periodic reconciliation: lightweight every 5 min, deep hourly, daily a | 1 | BLOCKED | NO |
| MP-CARD-051 | Infrastruttura — #87: VPS capacity/cost measurement (CPU, RAM, disk growth, egress, backup g | 1 | NOT STARTED | NO |
| MP-CARD-082 | Infrastruttura — #144: Repository PUBLIC during development, PRIVATE at the end (mandatory fi (+2) | 3 | IMPLEMENTING | NO |
| MP-CARD-084 | Infrastruttura — #179: Migration gate list: isolated staging, read-only Neon export, full imp (+19) | 20 | IMPLEMENTING | NO |
| MP-CARD-085 | Infrastruttura — #179: Unauthorised rerun refused: reruns of pre-gate or attempt>1 runs must  (+1) | 2 | IMPLEMENTING | NO |
| MP-CARD-089 | Infrastruttura — #182: All MatchPilot operations on the VPS (backend/API, local PostgreSQL, F (+8) | 9 | IMPLEMENTING | NO |
| MP-CARD-103 | Infrastruttura — #248: AF plans, quotas and cost: Free 0 (100/day,10/min), Pro $19 (7,500/day | 1 | IMPLEMENTING | NO |
| MP-CARD-107 | Infrastruttura — #263: Read-only inventory of FPT processes and VPS dependencies (+9) | 14 | IMPLEMENTING | NO |

## P10 — Certificazione integrata e gate finale (1 schede)

| Scheda | Titolo | Requisiti | Stato | GUI |
|---|---|---|---|---|
| MP-CARD-900 | Certificazione integrata end-to-end e gate finale del prodotto | 0 | NOT STARTED | SÌ |

