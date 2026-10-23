# Riconciliazione del catalogo #104 (82 card) con lo stato reale di `main`

**Repository:** `zarbopiero963-droid/MatchPilot`. **Base:** `main` = `6407f42` (MARKET-CORE-04, #217). **Data:** 23/10/2026. Lavoro in sola lettura: nessun commit, nessuna scrittura su GitHub.

**Fonti.** Body e commenti di #104 (mirror `docs/governance/issues/issue-104.md` + API GitHub, 2 commenti); #3 (15 commenti) e #97 (45 commenti, ultimo 22/10 14:04); `docs/governance/owner-decisions.json` (94 voci, stati IN_FORCE prevalenti); `work-registry.json` rev 153 e `runtime-state.json`; `git log` di `origin/main` e API `/pulls` (177 PR, 174 mergiate); audit di riferimento `docs/governance/audits/2026-10-22-MP-GLOBAL-AUDIT/` (E-roadmap, B-rtm.json), riverificato sul codice e sulle PR #178 e #190–#217. Test di dominio eseguiti in locale: `node --test` su 11 file, 88 pass, 0 fail, 6 skip (richiedono PostgreSQL).

**Vincoli owner applicati:** TotalCorner sospeso (MP-VPS-ONLY-OPERATIONS-2026-10-21, DEC-003); Render/Neon esclusi (DEC-014); Betwatch #196 non approvato (nessuna card dipende da esso); nessuna esecuzione reale (MP-OWNER-EXCLUDE-REAL-EXECUTION-01); archivio #40 congelato (R-02 BLOCKED); D8: un merge non completa una card da solo.

**Regola di classificazione.** COMPLETED solo se lo scope della card è su `main` con test. Il codice puro non collegato a runtime, DB o API vale COMPLETED solo se lo scope della card era codice puro; altrimenti PARTIALLY COMPLETED, con il gap indicato. Nel dubbio, PARTIALLY COMPLETED.

## Totali (denominatore = 82 card)

| Classe | Card | % |
|---|---:|---:|
| COMPLETED | 10 | 12.2 |
| PARTIALLY COMPLETED | 22 | 26.8 |
| STILL REQUIRED | 46 | 56.1 |
| SUPERSEDED | 0 | 0.0 |
| DUPLICATED | 0 | 0.0 |
| DEFERRED | 2 | 2.4 |
| BLOCKED | 2 | 2.4 |
| **Totale** | **82** | 100 |

Restano da finire 70 card su 82: 22 parziali, 46 da fare, 2 bloccate da formule owner. Altre 2 sono rinviate per la sospensione di TotalCorner.

**Il conteggio 82 è esatto.** Il body di #104 elenca 82 identificativi distinti, uno per intestazione `###` di fase, e la tabella di breakdown somma 82 (4+1+4+10+5+2+8+8+5+7+1+7+8+1+1+3+4+3). Lo stesso body (07/10) e la decisione D8 dicono però che 82 è una **baseline storica di pianificazione, non il residuo verificato**. Il residuo reale è descritto sopra, e il denominatore 82 non comprende:
- le attività VPS richieste dal commento owner del 21/10 su #104 (infra, PostgreSQL/restore, collector FPT, Telegram, TC-off, backup/monitoring, gate), mai aggiunte al catalogo;
- l'audit 412 FPT e il rischio PIT/reprocessing di #12;
- la sequenza web R-05/R-06/R-07, Browser QA e baseline visive.

## Tabella card per card

| # | Card | Titolo | Issue | Classe | Evidenza | Gap / note | Dipendenze |
|---:|---|---|---|---|---|---|---|
| 1 | AUTH-CORE-01 | Authentication/session/security baseline | #23 | **PARTIALLY COMPLETED** | PR #157 (45efd50), #158 (5cb5da1), #159 (b929e4a), #160 (ab0e5fe): src/auth/owner-auth.mjs, src/auth/http.mjs, migrations/029-owner-auth.sql; test/owner-auth.test.mjs (8), test/owner-auth-hardening.test.mjs (3): scrypt hash, sessions, logout/revoke, fixation, CSRF/same-origin, rate limit, audit | Owner-only login, OFF by default (MATCHPILOT_AUTH); MP-SEC-001 and MP-SEC-007 NOT_VERIFIED; no evidence auth is enforced on the VPS deploy; secret redaction outside TC client not certified | — |
| 2 | AUTH-CORE-02 | Users/RBAC/account isolation | #23 | **PARTIALLY COMPLETED** | ROLE_PERMISSIONS {owner:['*']} and permission middleware in src/auth/owner-auth.mjs (#159 b929e4a) | Only the owner role exists: no users table beyond owner, no roles/permissions model, no account isolation (D12: no public registration in v1) | AUTH-CORE-01 |
| 3 | AUTH-CORE-03 | Secondary admin + audit | #23 | **STILL REQUIRED** | No code on main (MP-FUT-018 future register) | — | AUTH-CORE-02 |
| 4 | AUTH-CORE-04 | Hard certification (real DB/deploy) | #23 | **STILL REQUIRED** | No certification evidence; VPS deploy exists (#177 3dd833f) but auth enforcement there NOT VERIFIED | — | AUTH-CORE-01, AUTH-CORE-02, AUTH-CORE-03 |
| 5 | MCP-CORE-00 | Tool registry/schema/error/authz baseline | #98 | **PARTIALLY COMPLETED** | PR #153 (c211836): src/api/v1.mjs endpoint registry /api/v1/endpoints, deterministic error envelope, provenance/as_of meta; test/api-v1-contract.test.mjs (11) | No MCP transport/tool invocation, no tool authz binding to account, no mutation/idempotency convention; read-only HTTP API only | AUTH-CORE-01, AUTH-CORE-02 |
| 6 | SETTINGS-CORE-01 | Schema/versioning | #95 | **STILL REQUIRED** | No settings domain on main: commission rate and settings_snapshot_id are only opaque caller inputs to src/ledger/paper-ledger.mjs openPosition and src/mm/money-management.mjs evaluate (DEC-013 commission fixed at simulated fill) | — | AUTH-CORE-02, MCP-CORE-00 |
| 7 | SETTINGS-CORE-02 | API/validation/propagation | #95 | **STILL REQUIRED** | No settings domain on main: commission rate and settings_snapshot_id are only opaque caller inputs to src/ledger/paper-ledger.mjs openPosition and src/mm/money-management.mjs evaluate (DEC-013 commission fixed at simulated fill) | — | SETTINGS-CORE-01 |
| 8 | SETTINGS-CORE-03 | Concurrency/cache/audit | #95 | **STILL REQUIRED** | No settings domain on main: commission rate and settings_snapshot_id are only opaque caller inputs to src/ledger/paper-ledger.mjs openPosition and src/mm/money-management.mjs evaluate (DEC-013 commission fixed at simulated fill) | — | SETTINGS-CORE-02 |
| 9 | SETTINGS-CORE-04 | Hard certification | #95 | **STILL REQUIRED** | No settings domain on main: commission rate and settings_snapshot_id are only opaque caller inputs to src/ledger/paper-ledger.mjs openPosition and src/mm/money-management.mjs evaluate (DEC-013 commission fixed at simulated fill) | — | SETTINGS-CORE-03 |
| 10 | TC-CORE-01 | Provider contract/discovery/raw retention | #20 | **COMPLETED** | PR #130 (8817548): src/providers/totalcorner/client.mjs, src/jobs/totalcorner-discovery.mjs, migrations/021; MP-TC-001 PASS (audit B-rtm, #20 comment 6057763877) | Runtime: wired (job) but switched OFF by TC-OFF-01 #186 (7b4baf7); TotalCorner suspended (MP-VPS-ONLY-OPERATIONS-2026-10-21, DEC-003) | — |
| 11 | TC-CORE-02 | Competition/team/event mapping | #20 | **COMPLETED** | PR #131 (f224b3c), #133 (23fb986): src/providers/totalcorner/mapping.mjs, migrations/022; MP-TC-002 PASS (96 competitions VERIFIED) | Runtime: competition-level only; match-level FPT<->TC identity absent (see RECON-CORE-01); job OFF since #186 | TC-CORE-01 |
| 12 | TC-CORE-03 | Prematch markets/lines/PIT | #20 | **COMPLETED** | PR #134 (3b1bfa9), #135 (5863cba), #136 (c7c853f): src/providers/totalcorner/prematch.mjs, migrations/023-025; MP-TC-003, MP-TC-004 PASS | Runtime: job OFF since #186; API exposure of opening/last prematch lines MP-TC-005 NOT_VERIFIED | TC-CORE-02 |
| 13 | TC-CORE-03B | Historical upstream backfill (HISTORICAL_UPSTREAM) | #20 | **COMPLETED** | PR #137 (0600f1c), #138 (79960ca), #139 (599cd75), #140 (80409e3), #141 (97dea4a), #142 (3af1243): src/providers/totalcorner/historical.mjs, migrations/026; test/tc-core-historical.test.mjs; MP-TC-006 PASS (60-match sample) | — | TC-CORE-02 |
| 14 | TC-CORE-04 | Live collector | #20 | **COMPLETED** | PR #143 (1988e9f), #145 (60fdd92): src/jobs/totalcorner-live.mjs, src/providers/totalcorner/live.mjs, migrations/027-028; MP-TC-007, MP-TC-008 PASS (#20 comment 6081058030) | Runtime: collector OFF since #186 (TC suspended) | TC-CORE-02 |
| 15 | TC-CORE-05 | Live normalization/events | #20 | **PARTIALLY COMPLETED** | From TC-CORE-04 (#143/#145): tc_live_events with event_hash dedup (eventsOf in src/providers/totalcorner/live.mjs), tc_market_snapshots raw capture | Score/stats/quote-movement/Asian-Goal-Corner line normalization absent: MP-TC-013 FAIL, MP-TC-015 NOT_VERIFIED. Must be done on the captured archive only (MP-OWNER-ARCHIVE-FIRST-01; TC off) | TC-CORE-04 |
| 16 | TC-CORE-06 | Captured live history/replay readiness | #20 | **PARTIALLY COMPLETED** | HISTORICAL_CAPTURED provenance enforced by CHECK in migrations/027 and used in src/jobs/totalcorner-live.mjs (from #143) | No gap model, no replay query, no no-future-leakage query over captured live history | TC-CORE-05 |
| 17 | TC-CORE-06B | Field/minute coverage, kickoff cutoff, missingness | #20 | **STILL REQUIRED** | No code; MP-TC-013/MP-TC-014 FAIL (audit B-rtm) | — | TC-CORE-05, TC-CORE-06 |
| 18 | TC-CORE-07 | Resilience/budgets/alerts | #20 | **PARTIALLY COMPLETED** | Shared limiter, 429/5xx/timeout classification, retry/backoff in src/providers/totalcorner/client.mjs (#130); cursor/terminal recovery (#145); MP-TC-009 PASS | No TC circuit breaker; TC Telegram alert path MP-TC-011 NOT_VERIFIED and cannot be exercised live while TC is suspended (live part effectively deferred) | TC-CORE-04 |
| 19 | TC-CORE-08 | Multi-day live hard certification | #20 | **DEFERRED** | Requires >=2 real live days: TotalCorner collection suspended (MP-VPS-ONLY-OPERATIONS-2026-10-21, DEC-003 'TotalCorner rimane spento', D6 no renewal/cost); MP-TC-012 BLOCKED; MP-FUT-007 owner-gated | — | TC-CORE-05, TC-CORE-06, TC-CORE-06B, TC-CORE-07 |
| 20 | RECON-CORE-01 | Cross-provider identity/gap model | #31 | **STILL REQUIRED** | No FPT<->TC match/team identity on main: MP-XPR-001 FAIL; src/markets/outcomes.mjs states 'no verified match-level FPT<->TC mapping exists'. #154/#155 are PIT policy only (pr_registry R-08 mis-mapping). Perimeter conflict resolved by DEC-003 (FPT∩TC certifiable on verified captured data) | — | TC-CORE-02, TC-CORE-03 |
| 21 | RECON-CORE-02 | TC prematch reconciliation | #31 | **STILL REQUIRED** | No code; MP-XPR-002 FAIL | — | RECON-CORE-01, TC-CORE-03 |
| 22 | RECON-CORE-03 | Live gap detection/recovery | #31 | **DEFERRED** | Live cross-provider gaps need TC live, suspended (MP-VPS-ONLY-OPERATIONS-2026-10-21, DEC-003) | — | RECON-CORE-01, TC-CORE-05 |
| 23 | RECON-CORE-04 | Scheduler/idempotency/alerts | #31 | **STILL REQUIRED** | Cross-provider scheduler absent. FPT-only reconciliation (#88 a09a1bd) and FPT monitoring fixes (#200 a73fa4b, #201 c50e55a, #206 e03fe2b) predate/sit outside this residual card ('la parte FPT già certificata non va rifatta') | — | RECON-CORE-02 |
| 24 | RECON-CORE-05 | Failure drills + certification | #31 | **STILL REQUIRED** | No code/evidence | — | RECON-CORE-04 |
| 25 | REPLAY-CORE-01 | PIT domain/query (match_id+timestamp -> state) | #24 | **STILL REQUIRED** | No replay code. Prerequisites only: PIT policy src/pit/policy.mjs, src/pit/readers.mjs (#154 e66e329, #155 be53472; test/pit-policy.test.mjs). MP-RPL-001 BLOCKED. Archive #40 read-only verification R-02 BLOCKED (owner hold) | — | TC-CORE-06, RECON-CORE-01 |
| 26 | REPLAY-CORE-02 | Neutral replay simulation contract + API/tool | #24 | **STILL REQUIRED** | No code | — | REPLAY-CORE-01 |
| 27 | MATH-CORE-01 | Decimal/common contracts | #94 | **COMPLETED** | PR #156 (4ab36de): src/math/decimal.mjs, src/math/core.mjs (implied probability, overround, fair odds, rounding policy); test/math-core.test.mjs (11) with exact-fraction oracle. MP-MTH-001 NOT_VERIFIED only because it spans all formulas | Runtime: pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029) (used by src/analysis/match-analysis.mjs) | — |
| 28 | MATH-CORE-02 | Kelly/EV/Liability | #94 | **PARTIALLY COMPLETED** | Liability only, inline in domain modules: liabilityOf in src/mm/money-management.mjs and exposureOf in src/ledger/paper-ledger.mjs (#198 ffd9fc2, #207 91aab47; tests test/paper-ledger-mm.test.mjs, test/mm-pr01-registry-liability.test.mjs) | No Kelly or EV formula in Math Core; liability not exposed as a Math Core formula with oracle/envelope | MATH-CORE-01 |
| 29 | MATH-CORE-03 | BACK<->LAY Hedge/Cashout | #94 | **STILL REQUIRED** | No hedge/cashout stake formula; ledger hedgePosition only books a caller-supplied leg and checks exposure reduction | — | MATH-CORE-02 |
| 30 | MATH-CORE-04 | Dutching/Arbitrage/DNB/Each-Way | #94 | **STILL REQUIRED** | No code | — | MATH-CORE-01 |
| 31 | MATH-CORE-05 | Progression formulas | #94 | **BLOCKED** | Martingale/Fibonacci/Labouchere/CS progressivo/Recovery are DISCOVERED with formula=null in src/mm/registry.mjs; blocked_by 'formula, VOID/reset policy and test vectors not yet specified by the owner'; runtime-state blocker MM-RULES (owner t139u: no invented economic rules; 25 owner questions not yet on GitHub) | — | MATH-CORE-01, owner formulas (MM-RULES) |
| 32 | MATH-CORE-06 | Risk/exposure/commission math | #94 | **PARTIALLY COMPLETED** | src/math/money.mjs settleMarket/grossProfit with commission on market net winnings (#178 891e981; oracle test in test/hist-backtest.test.mjs); ledger commission at the cent, rate fixed at fill (DEC-013, #198) | Exposure/risk formulas live inside ledger/MM, not as Math Core formulas with oracle vectors; no tick/rounding for exchange price ladders | MATH-CORE-01 |
| 33 | MATH-CORE-07 | Poisson/advanced math adapters | #94 | **STILL REQUIRED** | No Poisson/Elo/calibration (MP-MTH-002 FAIL; owner OWN-2026-10-07-MATH defines the cheap baseline) | — | MATH-CORE-01 |
| 34 | MATH-CORE-08 | API/tool + mathematical hard certification | #94 | **STILL REQUIRED** | No API/tool for math | — | MATH-CORE-02, MATH-CORE-03, MATH-CORE-04, MATH-CORE-05, MATH-CORE-06, MATH-CORE-07, MCP-CORE-00 |
| 35 | MM-CORE-01 | Registry/capabilities | #96 | **COMPLETED** | PR #207 (91aab47) 'MM-PR-01' + #208 (23d377c): src/mm/registry.mjs full #96 census (16 types, registry fields, 17 capability flags; 4 IMPLEMENTED, 12 DISCOVERED with formula=null); test/mm-pr01-registry-liability.test.mjs | Runtime: pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029); registry is static data, its API surface belongs to MM-CORE-08 | MATH-CORE-01 |
| 36 | MM-CORE-02 | Profiles CRUD/immutable versions/dependencies | #96 | **PARTIALLY COMPLETED** | createProfile returns a frozen versioned profile (src/mm/money-management.mjs, #198 ffd9fc2) | No CRUD, no persistence per account (#96 'persistente per account'), no dependency tracking/safe delete; additive migration needs owner D13 path for production | MM-CORE-01, SETTINGS-CORE-01 |
| 37 | MM-CORE-03 | Rules/filters/risk policy | #96 | **PARTIALLY COMPLETED** | Caps max_stake/max_liability/max_total_exposure/max_concurrent_trades (#207), per match/market/league/strategy exposure caps and min/max odds filters with filter_fail_action (#208 23d377c 'MM-PR-02'); tests test/mm-pr01-*.test.mjs, test/mm-pr02-scope-odds.test.mjs | Deterministic-priority rule engine absent (docs/paper-ledger-mm.md 'MM-PR-03 not done'); daily/weekly loss, drawdown, stop-loss, cooldown, per-day exposure need owner rule definitions | MM-CORE-02 |
| 38 | MM-CORE-04 | Operational mode STOP/RESUME | #96 | **PARTIALLY COMPLETED** | stopOperations/resumeOperations/pause/archive with who/when/reason audit; ADVISORY_ONLY -> SIMULATION_ONLY, execution_permission=false (DEC-001) in src/mm/money-management.mjs (#198 ffd9fc2); test/paper-ledger-mm.test.mjs | Mode not persisted per account and not wired to any runtime/API (pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029)) | MM-CORE-02 |
| 39 | MM-CORE-05 | Stateless + bankroll-dependent models | #96 | **PARTIALLY COMPLETED** | FIXED_STAKE, FIXED_LIABILITY, PERCENT_BANKROLL, LIABILITY_PERCENT_BANKROLL implemented with SHARED_ACCOUNT_BANKROLL (DEC-013) (#198, #207) | KELLY, FRACTIONAL_KELLY, TARGET_PROFIT, RISK_BASED_STAKE, MANUAL_WITHIN_LIMITS DISCOVERED (owner formulas); SEGREGATED bankroll NOT_IMPLEMENTED | MM-CORE-01, MATH-CORE-02 |
| 40 | MM-CORE-06 | Recovery/progression models | #96 | **BLOCKED** | RECOVERY_STAKE, MARTINGALE, FIBONACCI, LABOUCHERE, CS_PROGRESSIVO DISCOVERED with formula=null (src/mm/registry.mjs); sequence state + DEC-013 VOID/PUSH neutrality exist (applySettlement). Blocker MM-RULES in docs/governance/runtime-state.json | — | MATH-CORE-05, MM-CORE-05, owner formulas (MM-RULES) |
| 41 | MM-CORE-07 | Exposure-aware/composite policy | #96 | **PARTIALLY COMPLETED** | Exposure-aware caps on open exposure from #99 accountState (total and per scope) (#207, #208) | EXPOSURE_AWARE and COMPOSITE models DISCOVERED (owner formulas) | MM-CORE-03, MM-CORE-05 |
| 42 | MM-CORE-08 | API/tool + core hard certification | #96 | **STILL REQUIRED** | No MM API/tool, no certification | — | MM-CORE-02, MM-CORE-03, MM-CORE-04, MM-CORE-05, MM-CORE-06, MM-CORE-07, MCP-CORE-00 |
| 43 | MARKET-CORE-01 | Registry/version schema | #100 | **COMPLETED** | PR #209 (6ed4919), revised by #217 (6407f42): src/markets/rules.mjs MARKET_RULES with every #100 minimum field, ids '<type>@v2'; test/market-core-01-02.test.mjs 'every #100 minimum field on every rule' | Runtime: pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029); version freeze/lookup is MARKET-CORE-05 | — |
| 44 | MARKET-CORE-02 | Core football resolvers | #100 | **COMPLETED** | PR #209 (6ed4919): resolve() for MATCH_ODDS, DOUBLE_CHANCE, OVER_UNDER (n+0.5), BTTS, CORRECT_SCORE, HT_MATCH_ODDS, HT_OVER_UNDER, TEAM_GOALS_OVER_UNDER; non-finished/missing -> UNRESOLVED; test/market-core-01-02.test.mjs (5); reused by HIST-01a engine (DEC-006) | Runtime: pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029); extra-time policy for cup ties OWNER DECISION REQUIRED (rules.mjs) | MARKET-CORE-01 |
| 45 | MARKET-CORE-03 | Asian/partial/dead-heat | #100 | **STILL REQUIRED** | Whole/quarter lines refused with UNSUPPORTED_LINE in src/markets/rules.mjs; dead_heat/partial NOT_APPLICABLE | — | MARKET-CORE-02 |
| 46 | MARKET-CORE-04 | postponed/abandoned/corrections | #100 | **COMPLETED** | PR #217 (6407f42): src/markets/outcomes.mjs fromFutPythonTrader/fromTotalCorner/selectOutcome/resolveVersioned; DEC-015 non-final UNRESOLVED with no time window, never VOID; DEC-002 latest validated FINAL at run time with version/provenance/correction flag; test/market-core-04.test.mjs (9) | Runtime: pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029); real provider rows not yet connected (PR #217 'NOT VERIFIED'); cancelled-match policy still OWNER DECISION REQUIRED (stays UNRESOLVED) | MARKET-CORE-02 |
| 47 | MARKET-CORE-05 | API/tool + hard certification | #100 | **STILL REQUIRED** | No API/tool lookup, no version freeze in DB, no certification on real data | — | MARKET-CORE-03, MARKET-CORE-04, MCP-CORE-00 |
| 48 | LEDGER-CORE-01 | Position/leg/fill + append-only schema | #99 | **PARTIALLY COMPLETED** | PR #198 (ffd9fc2) MM-LEDGER-01, #208 (23d377c) scope tags: src/ledger/paper-ledger.mjs; test/paper-ledger-mm.test.mjs (8), test/mm-pr02-scope-odds.test.mjs: frozen append-only entries INITIAL_ALLOCATION/OPEN/HEDGE/SETTLEMENT_*/COMMISSION/REVERSAL, state rebuilt by replay() | No persistence: in-memory ledger; additive PG migration not written (docs/paper-ledger-mm.md: needs owner D13 path for production); pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029) | SETTINGS-CORE-01, MATH-CORE-01 |
| 49 | LEDGER-CORE-02 | Reserve/exposure + BACK/LAY accounting | #99 | **PARTIALLY COMPLETED** | PR #198 (ffd9fc2) MM-LEDGER-01, #208 (23d377c) scope tags: src/ledger/paper-ledger.mjs; test/paper-ledger-mm.test.mjs (8), test/mm-pr02-scope-odds.test.mjs: reserved worst-case exposure, available bankroll refusal, BACK/LAY P/L, per-scope open exposure | No persistence: in-memory ledger; additive PG migration not written (docs/paper-ledger-mm.md: needs owner D13 path for production); pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029) | LEDGER-CORE-01 |
| 50 | LEDGER-CORE-03 | Settlement/commission/market-rules integration | #99 | **PARTIALLY COMPLETED** | PR #198 (ffd9fc2) MM-LEDGER-01, #208 (23d377c) scope tags: src/ledger/paper-ledger.mjs; test/paper-ledger-mm.test.mjs (8), test/mm-pr02-scope-odds.test.mjs: settlePosition with commission fixed at fill (DEC-013), VOID/PUSH P/L 0 | settlePosition takes the outcome as a caller input: no integration with src/markets resolvers/outcome versions; no persistence | LEDGER-CORE-02, MARKET-CORE-02, MARKET-CORE-04, SETTINGS-CORE-02 |
| 51 | LEDGER-CORE-04 | Hedge/cashout/multi-leg/reversal | #99 | **PARTIALLY COMPLETED** | PR #198 (ffd9fc2) MM-LEDGER-01, #208 (23d377c) scope tags: src/ledger/paper-ledger.mjs; test/paper-ledger-mm.test.mjs (8), test/mm-pr02-scope-odds.test.mjs: hedgePosition (multi-leg, reducing-only outside ACTIVE, DEC-001), correctSettlement REVERSAL + version+1 | No cashout pricing (needs MATH-CORE-03); unrealized P/L null; no persistence | LEDGER-CORE-03, MATH-CORE-03 |
| 52 | LEDGER-CORE-05 | Concurrency/idempotency/crash recovery | #99 | **PARTIALLY COMPLETED** | PR #198 (ffd9fc2) MM-LEDGER-01, #208 (23d377c) scope tags: src/ledger/paper-ledger.mjs; test/paper-ledger-mm.test.mjs (8), test/mm-pr02-scope-odds.test.mjs: idempotency keys (ALREADY_APPLIED / IDEMPOTENCY_CONFLICT), DOUBLE_SETTLEMENT refusal | No DB, so no concurrency control or crash recovery; idempotency map is in-memory only | LEDGER-CORE-01 |
| 53 | LEDGER-CORE-06 | API/tool surface | #99 | **STILL REQUIRED** | No ledger API/tool | — | LEDGER-CORE-05, MCP-CORE-00 |
| 54 | LEDGER-CORE-07 | Hard certification/reconciliation | #99 | **STILL REQUIRED** | Reconciliation invariant tested in memory only (allocation + realized net = cash); no real DB/API certification | — | LEDGER-CORE-06 |
| 55 | PAPER-CORE-01 | Intent -> Paper Position | cross (#28/#96/#99) | **PARTIALLY COMPLETED** | src/mm/paper-trading.mjs proposePaperTrade (#198 ffd9fc2): MM evaluate -> execution_permission -> openPosition, advisory never mutates; test/paper-ledger-mm.test.mjs | No #28 entry-intent contract (takes a raw proposal), no audit trail, no persistence; pure code: not wired to runtime, DB or API (no import from src/server.mjs, src/api/v1.mjs or src/worker.mjs; no migration after 029) | TRADE-CORE-01, TRADE-CORE-05, MM-CORE-04, LEDGER-CORE-05 |
| 56 | STRAT-CORE-01 | Persistence/DSL/versioning | #34 | **STILL REQUIRED** | MP-STA-001 FAIL; only hard-coded reference strategy refFavouriteBack in src/hist/strategies.mjs (#178) | — | SETTINGS-CORE-01 |
| 57 | STRAT-CORE-02 | MM assignment/overrides/dependencies | #34 | **STILL REQUIRED** | No code | — | STRAT-CORE-01, MM-CORE-02 |
| 58 | STRAT-CORE-03 | Backtest PIT/no-leakage | #34 | **PARTIALLY COMPLETED** | PR #178 (891e981) HIST-01a: src/hist/admission.mjs, engine.mjs, contract.mjs; test/hist-backtest.test.mjs (19) anti-lookahead, anti-contamination, outcome boundary; reuses MARKET MATCH_ODDS resolver | Synthetic fixtures only (real_data_verdict NOT VERIFIED); HIST-01b on real data (MP-OWNER-HIST-01B-OPTION-A) not done; DEC-007 NON_PIT/EXPLORATORY path absent; DEC-002 outcome versions (outcomes.mjs) not yet consumed by the engine | STRAT-CORE-01, REPLAY-CORE-01, MARKET-CORE-04 |
| 59 | STRAT-CORE-04 | Backtest config/saved/reproducibility | #34 | **PARTIALLY COMPLETED** | PR #178 (891e981): frozen config, canonical JSON + SHA-256, byte-identical report regardless of input order (test 'determinism') | No saved configs/runs persistence; no strategy versions to pin | STRAT-CORE-03 |
| 60 | STRAT-CORE-05 | Live matcher + near-match | #34 | **STILL REQUIRED** | No code; live evidence depends on live data (TC suspended), replay-based implementation possible | — | STRAT-CORE-01, REPLAY-CORE-02 |
| 61 | STRAT-CORE-06 | Indicator Library contracts/validation | #34 | **STILL REQUIRED** | No code | — | STRAT-CORE-01 |
| 62 | STRAT-CORE-07 | API/tool + hard certification | #34 | **STILL REQUIRED** | No code | — | STRAT-CORE-02, STRAT-CORE-04, STRAT-CORE-05, STRAT-CORE-06, MCP-CORE-00 |
| 63 | TRADE-CORE-01 | Signal lifecycle/decision contract | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358) | — | STRAT-CORE-01, MM-CORE-04 |
| 64 | TRADE-CORE-02 | Prematch planner | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358) | — | TRADE-CORE-01 |
| 65 | TRADE-CORE-03 | Live state engine | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358) | — | TRADE-CORE-01, REPLAY-CORE-02 |
| 66 | TRADE-CORE-04 | BACK/LAY/DUTCH engines (analytic/simulated only) | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358); real execution excluded (MP-OWNER-EXCLUDE-REAL-EXECUTION-01): analytic/simulated engines only | — | TRADE-CORE-01, MATH-CORE-04 |
| 67 | TRADE-CORE-05 | Entry validation/MM gate | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358) | — | TRADE-CORE-01, MM-CORE-03 |
| 68 | TRADE-CORE-06 | Position-management intents | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358) | — | TRADE-CORE-05, LEDGER-CORE-04 |
| 69 | TRADE-CORE-07 | Historical/replay validation | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358) | — | TRADE-CORE-03, REPLAY-CORE-02 |
| 70 | TRADE-CORE-08 | API/tool + live hard certification | #28 | **STILL REQUIRED** | No Trading Engine code on main (simulated signals of #184 removed by DEC-008, #190 69f4358); live certification gate depends on live data (TC suspended) and stays NOT VERIFIED until then | — | TRADE-CORE-07, MCP-CORE-00 |
| 71 | MM-INTEGRATION-01 | MM integration with Strategy/Trading/Replay | #96 | **STILL REQUIRED** | No code | — | STRAT-CORE-02, TRADE-CORE-05, REPLAY-CORE-02, LEDGER-CORE-05, PAPER-CORE-01 |
| 72 | REPLAY-CORE-03 | Replay + MM/tool certification | #24 | **STILL REQUIRED** | No code | — | MM-INTEGRATION-01, SETTINGS-CORE-04, LEDGER-CORE-07 |
| 73 | QUERY-CORE-01 | #25 finished-match backend contract | #25 | **STILL REQUIRED** | No finished-match contract (MP-WEB-004 FAIL). #176 is pre-match analysis (#30), mis-linked to this card in pr_registry R-07 | — | REPLAY-CORE-01, MARKET-CORE-04 |
| 74 | QUERY-CORE-02 | #30 analysis/query backend contract | #30 | **PARTIALLY COMPLETED** | PR #162 (2cf3d4b) keyset pagination, #163 (56fe579) Daily Board/search on API v1, #176 (61361b8) src/analysis/match-analysis.mjs + /api/v1/fpt/match-analysis; test/match-analysis.test.mjs | First batch of #30 cards only; certified on seeded data, real-data verification NOT_VERIFIED | MCP-CORE-00 |
| 75 | BENCH-CORE-01 | #27 GOAT benchmark on certified data/engine | #27 | **STILL REQUIRED** | No code | — | TRADE-CORE-08 |
| 76 | TCOP-CORE-01 | Trading context + prematch/live tools | #102 | **STILL REQUIRED** | No code | — | TRADE-CORE-08, QUERY-CORE-02 |
| 77 | TCOP-CORE-02 | Position/P&L/outcome-matrix tools | #102 | **STILL REQUIRED** | No code | — | TCOP-CORE-01, LEDGER-CORE-06 |
| 78 | TCOP-CORE-03 | Management intents + STOP/advisory + settlement/postmortem | #102 | **STILL REQUIRED** | No code | — | TCOP-CORE-02, MM-INTEGRATION-01 |
| 79 | TCOP-CORE-04 | Agent-driven hard certification | #102 | **STILL REQUIRED** | No code | — | TCOP-CORE-03, REPLAY-CORE-03 |
| 80 | MCP-CORE-01 | Cross-domain tool registry integration | #98 | **STILL REQUIRED** | No code | — | TCOP-CORE-04, MCP-CORE-00 |
| 81 | MCP-CORE-02 | Agent workflow integration | #98 | **STILL REQUIRED** | No code | — | MCP-CORE-01 |
| 82 | MCP-CORE-03 | Final pre-UI certification (agent E2E without site) | #98 | **STILL REQUIRED** | No code | — | MCP-CORE-02 |

## Catena di dipendenze critica

Le dipendenze tecniche vere sono più strette dell'ordine per fasi di #104. Il percorso critico verso il paper trading integrato e l'E2E agente (#98) è:

```
MATH-CORE-01 [C]
  └─ SETTINGS-CORE-01..02 [SR]  (commission/settings snapshot versionati: oggi settings_snapshot_id è una stringa opaca)
       └─ LEDGER-CORE-01 [P] persistenza append-only (migrazione additiva; produzione solo via D13)
            ├─ MM-CORE-02 [P] profili persistiti/versionati ── MM-CORE-03/04 [P]
            ├─ LEDGER-CORE-03 [P] settlement ← MARKET-CORE-02/04 [C] (+ MARKET-CORE-03 [SR] per Asian)
            └─ LEDGER-CORE-05 [P] concorrenza / crash recovery su DB
                 └─ TRADE-CORE-01 → TRADE-CORE-05 [SR] (contratto intent + gate MM)
                      └─ PAPER-CORE-01 [P] (glue proposePaperTrade già presente)
                           └─ STRAT-CORE-01/02 [SR] → STRAT-CORE-03/04 [P] (HIST-01b su dati reali)
                                └─ MM-INTEGRATION-01 → REPLAY-CORE-03 → TCOP-CORE-01..04 → MCP-CORE-01..03 [SR]
Ramo dati (parallelo):  TC-CORE-05/06 [P] → TC-CORE-06B [SR] → RECON-CORE-01/02 [SR] → REPLAY-CORE-01/02 [SR] → STRAT-CORE-05, TRADE-CORE-03/07
Ramo sicurezza/tool:    AUTH-CORE-01/02 [P] → AUTH-CORE-03/04 [SR] → MCP-CORE-00 [P] → *-API/tool (MATH-08, MM-08, MARKET-05, LEDGER-06, STRAT-07, TRADE-08)
Bloccati da formule owner (MM-RULES, t139u): MATH-CORE-05, MM-CORE-06 (e il residuo di MM-CORE-05/07)
Rinviati per TC sospeso: TC-CORE-08, RECON-CORE-03
```

## Card ancora da fare, in ordine di dipendenza

Ordine topologico delle card PARTIALLY COMPLETED, STILL REQUIRED e BLOCKED. A parità di livello vale l'ordine di #104.

| Ordine | Livello | Card | Classe | Dipende da (aperte) |
|---:|---:|---|---|---|
| 1 | 0 | AUTH-CORE-01 | PARTIALLY COMPLETED | — |
| 2 | 0 | TC-CORE-05 | PARTIALLY COMPLETED | — |
| 3 | 0 | TC-CORE-07 | PARTIALLY COMPLETED | — |
| 4 | 0 | RECON-CORE-01 | STILL REQUIRED | — |
| 5 | 0 | MATH-CORE-02 | PARTIALLY COMPLETED | — |
| 6 | 0 | MATH-CORE-04 | STILL REQUIRED | — |
| 7 | 0 | MATH-CORE-05 | BLOCKED | owner formulas (MM-RULES) |
| 8 | 0 | MATH-CORE-06 | PARTIALLY COMPLETED | — |
| 9 | 0 | MATH-CORE-07 | STILL REQUIRED | — |
| 10 | 0 | MARKET-CORE-03 | STILL REQUIRED | — |
| 11 | 1 | AUTH-CORE-02 | PARTIALLY COMPLETED | AUTH-CORE-01 |
| 12 | 1 | TC-CORE-06 | PARTIALLY COMPLETED | TC-CORE-05 |
| 13 | 1 | RECON-CORE-02 | STILL REQUIRED | RECON-CORE-01 |
| 14 | 1 | MATH-CORE-03 | STILL REQUIRED | MATH-CORE-02 |
| 15 | 1 | MM-CORE-05 | PARTIALLY COMPLETED | MATH-CORE-02 |
| 16 | 2 | AUTH-CORE-03 | STILL REQUIRED | AUTH-CORE-02 |
| 17 | 2 | MCP-CORE-00 | PARTIALLY COMPLETED | AUTH-CORE-01, AUTH-CORE-02 |
| 18 | 2 | TC-CORE-06B | STILL REQUIRED | TC-CORE-05, TC-CORE-06 |
| 19 | 2 | RECON-CORE-04 | STILL REQUIRED | RECON-CORE-02 |
| 20 | 2 | REPLAY-CORE-01 | STILL REQUIRED | TC-CORE-06, RECON-CORE-01 |
| 21 | 2 | MM-CORE-06 | BLOCKED | MATH-CORE-05, MM-CORE-05, owner formulas (MM-RULES) |
| 22 | 3 | AUTH-CORE-04 | STILL REQUIRED | AUTH-CORE-01, AUTH-CORE-02, AUTH-CORE-03 |
| 23 | 3 | SETTINGS-CORE-01 | STILL REQUIRED | AUTH-CORE-02, MCP-CORE-00 |
| 24 | 3 | RECON-CORE-05 | STILL REQUIRED | RECON-CORE-04 |
| 25 | 3 | REPLAY-CORE-02 | STILL REQUIRED | REPLAY-CORE-01 |
| 26 | 3 | MATH-CORE-08 | STILL REQUIRED | MATH-CORE-02, MATH-CORE-03, MATH-CORE-04, MATH-CORE-05, MATH-CORE-06, MATH-CORE-07, MCP-CORE-00 |
| 27 | 3 | MARKET-CORE-05 | STILL REQUIRED | MARKET-CORE-03, MCP-CORE-00 |
| 28 | 3 | QUERY-CORE-01 | STILL REQUIRED | REPLAY-CORE-01 |
| 29 | 3 | QUERY-CORE-02 | PARTIALLY COMPLETED | MCP-CORE-00 |
| 30 | 4 | SETTINGS-CORE-02 | STILL REQUIRED | SETTINGS-CORE-01 |
| 31 | 4 | MM-CORE-02 | PARTIALLY COMPLETED | SETTINGS-CORE-01 |
| 32 | 4 | LEDGER-CORE-01 | PARTIALLY COMPLETED | SETTINGS-CORE-01 |
| 33 | 4 | STRAT-CORE-01 | STILL REQUIRED | SETTINGS-CORE-01 |
| 34 | 5 | SETTINGS-CORE-03 | STILL REQUIRED | SETTINGS-CORE-02 |
| 35 | 5 | MM-CORE-03 | PARTIALLY COMPLETED | MM-CORE-02 |
| 36 | 5 | MM-CORE-04 | PARTIALLY COMPLETED | MM-CORE-02 |
| 37 | 5 | LEDGER-CORE-02 | PARTIALLY COMPLETED | LEDGER-CORE-01 |
| 38 | 5 | LEDGER-CORE-05 | PARTIALLY COMPLETED | LEDGER-CORE-01 |
| 39 | 5 | STRAT-CORE-02 | STILL REQUIRED | STRAT-CORE-01, MM-CORE-02 |
| 40 | 5 | STRAT-CORE-03 | PARTIALLY COMPLETED | STRAT-CORE-01, REPLAY-CORE-01 |
| 41 | 5 | STRAT-CORE-05 | STILL REQUIRED | STRAT-CORE-01, REPLAY-CORE-02 |
| 42 | 5 | STRAT-CORE-06 | STILL REQUIRED | STRAT-CORE-01 |
| 43 | 6 | SETTINGS-CORE-04 | STILL REQUIRED | SETTINGS-CORE-03 |
| 44 | 6 | MM-CORE-07 | PARTIALLY COMPLETED | MM-CORE-03, MM-CORE-05 |
| 45 | 6 | LEDGER-CORE-03 | PARTIALLY COMPLETED | LEDGER-CORE-02, SETTINGS-CORE-02 |
| 46 | 6 | LEDGER-CORE-06 | STILL REQUIRED | LEDGER-CORE-05, MCP-CORE-00 |
| 47 | 6 | STRAT-CORE-04 | PARTIALLY COMPLETED | STRAT-CORE-03 |
| 48 | 6 | TRADE-CORE-01 | STILL REQUIRED | STRAT-CORE-01, MM-CORE-04 |
| 49 | 7 | MM-CORE-08 | STILL REQUIRED | MM-CORE-02, MM-CORE-03, MM-CORE-04, MM-CORE-05, MM-CORE-06, MM-CORE-07, MCP-CORE-00 |
| 50 | 7 | LEDGER-CORE-04 | PARTIALLY COMPLETED | LEDGER-CORE-03, MATH-CORE-03 |
| 51 | 7 | LEDGER-CORE-07 | STILL REQUIRED | LEDGER-CORE-06 |
| 52 | 7 | STRAT-CORE-07 | STILL REQUIRED | STRAT-CORE-02, STRAT-CORE-04, STRAT-CORE-05, STRAT-CORE-06, MCP-CORE-00 |
| 53 | 7 | TRADE-CORE-02 | STILL REQUIRED | TRADE-CORE-01 |
| 54 | 7 | TRADE-CORE-03 | STILL REQUIRED | TRADE-CORE-01, REPLAY-CORE-02 |
| 55 | 7 | TRADE-CORE-04 | STILL REQUIRED | TRADE-CORE-01, MATH-CORE-04 |
| 56 | 7 | TRADE-CORE-05 | STILL REQUIRED | TRADE-CORE-01, MM-CORE-03 |
| 57 | 8 | PAPER-CORE-01 | PARTIALLY COMPLETED | TRADE-CORE-01, TRADE-CORE-05, MM-CORE-04, LEDGER-CORE-05 |
| 58 | 8 | TRADE-CORE-06 | STILL REQUIRED | TRADE-CORE-05, LEDGER-CORE-04 |
| 59 | 8 | TRADE-CORE-07 | STILL REQUIRED | TRADE-CORE-03, REPLAY-CORE-02 |
| 60 | 9 | TRADE-CORE-08 | STILL REQUIRED | TRADE-CORE-07, MCP-CORE-00 |
| 61 | 9 | MM-INTEGRATION-01 | STILL REQUIRED | STRAT-CORE-02, TRADE-CORE-05, REPLAY-CORE-02, LEDGER-CORE-05, PAPER-CORE-01 |
| 62 | 10 | REPLAY-CORE-03 | STILL REQUIRED | MM-INTEGRATION-01, SETTINGS-CORE-04, LEDGER-CORE-07 |
| 63 | 10 | BENCH-CORE-01 | STILL REQUIRED | TRADE-CORE-08 |
| 64 | 10 | TCOP-CORE-01 | STILL REQUIRED | TRADE-CORE-08, QUERY-CORE-02 |
| 65 | 11 | TCOP-CORE-02 | STILL REQUIRED | TCOP-CORE-01, LEDGER-CORE-06 |
| 66 | 12 | TCOP-CORE-03 | STILL REQUIRED | TCOP-CORE-02, MM-INTEGRATION-01 |
| 67 | 13 | TCOP-CORE-04 | STILL REQUIRED | TCOP-CORE-03, REPLAY-CORE-03 |
| 68 | 14 | MCP-CORE-01 | STILL REQUIRED | TCOP-CORE-04, MCP-CORE-00 |
| 69 | 15 | MCP-CORE-02 | STILL REQUIRED | MCP-CORE-01 |
| 70 | 16 | MCP-CORE-03 | STILL REQUIRED | MCP-CORE-02 |

## Discrepanze rilevate

1. **82 come residuo:** 82 è la baseline storica (D8, body #104). Il residuo aperto è di 70 card (22 + 46 + 2), più 2 rinviate; l'audit del 22/10 contava 76 card non completate.
2. **Delta rispetto all'audit del 22/10** (6 COMPLETED / 5 PARTIAL / 69 PLANNED / 2 DEFERRED):
   - MM-CORE-01, MARKET-CORE-01, MARKET-CORE-02 e MARKET-CORE-04 passano a COMPLETED (#207, #209, #217);
   - 17 card passano a PARTIALLY COMPLETED: TC-CORE-05/06, MATH-CORE-02/06, MM-CORE-02/03/04/05/07, LEDGER-CORE-01..05, PAPER-CORE-01, STRAT-CORE-03/04 (#198, #207, #208, #178, #143 riletti);
   - MATH-CORE-05 e MM-CORE-06 passano a BLOCKED (formule owner).
3. **`work-registry.json` rev 153:** MARKET-CORE-04 risulta ancora `REVIEW` con PR #217, ma #217 è mergiata (`6407f42`, HEAD di main). MARKET-CORE-01-02 ha issue `104` invece di `100`.
4. **Nomi delle PR rispetto alle card:**
   - #207 "MM-PR-01" e #208 "MM-PR-02" usano la numerazione di #96 (12 MM-PR), non quella delle card;
   - #208 implementa filtri e cap, cioè lo scope di MM-CORE-03 (#96 MM-PR-03), non i Profiles CRUD (#96 MM-PR-02 = MM-CORE-02).
5. **Mappature di `pr_registry`:** R-07 (#176) è collegata a QUERY-CORE-01 ma implementa #30 (QUERY-CORE-02); R-08 (#154/#155) è collegata a RECON-CORE-01 ma è solo policy PIT.
6. **Codice puro non collegato:** ledger, MM, market rules e motore HIST non sono importati da server, API o worker, e non esiste nessuna migrazione dopo la 029. Nessuna card di #96, #99, #100 o #34 ha quindi persistenza o API.
7. **Conflitto OWN-2026-10-06-SCOPE contro #182:** risolto da DEC-003 (FPT∩TC certificabile sui dati verificati, TC spento). RECON-CORE-01/02 sono eseguibili sui dati TC già catturati e non sono più BLOCKED.

