# C - Provider capability inventory (read-only, main 7f0896e)

Scope: repo only. No network or provider calls. Evidence tiers: DOC (provider documentation in repo), REAL (recorded real responses/certification evidence), IMPL (code). Machine-readable twin: `C-providers.json` (102 rows).

## 0. Key findings

1. No provider documentation is stored in the repo (no copy of the FPT `/api-docs` page, no TC API manual). The only "documentation" evidence is the catalog parser (`src/providers/futpython/catalog.mjs:62-79`) and the README/certificate. DOC tier is empty for all providers.
2. FPT REAL evidence = certificate of 2026-10-05 (`docs/futpython-certification-2026-10-05.md`, commit 6f83e2e, Neon): 1,027 catalog datasets = 615 AVAILABLE + **412 UNAVAILABLE_404** (lines 60-73; "412" is the 404 count, not extra datasets), 161,801 unique matches, 325 raw fields (line 907).
3. The 325 raw column NAMES are not in the repo. The certificate gives only per-family counts (line 1208). About 58 names are cited by code/tests (see JSON). The remaining 267 are NOT VERIFIED by name; their existence is verified by count.
4. API-FOOTBALL: zero references anywhere (case-insensitive grep of code, docs, governance, owner-decisions.json, issues, migrations). No integration, no authorization, no decision, no budget. Status: NOT VERIFIED / not authorized.
5. BetsAPI: benchmark only. `docs/provider-trial-final-closure-2026-10-08.md:244-245,365` ("Do not purchase or require a recurring BetsAPI plan now"; archived benchmark, owner-gated), `docs/governance/issues/issue-3.md:56` and `AGENTS.md:290` (BetsAPI as core = OPEN owner decision). No `src/` code. There is no BetsAPI entry in `owner-decisions.json`; the position rests on the closure doc and issue #3.
6. TotalCorner: code present, collectors SUSPENDED by DEC-003 (`docs/governance/owner-decisions.json:82`, "TotalCorner rimane spento").

## 1. FutPythonTrader (ACTIVE)

### 1.1 Endpoints / protocol
| Capability | Status | Evidence |
|---|---|---|
| `GET /api-docs` (catalog HTML) | AVAILABLE AND IMPLEMENTED | catalog.mjs:62-79; cert:60-62 (1027 datasets, 56 countries, 185 leagues) |
| `GET /api/download/{country}/{league}/{season}` (CSV, api_key) | AVAILABLE AND IMPLEMENTED | catalog.mjs:20-27; client.mjs:45-50; cert:63-73 |
| `GET /api/jogos-do-dia?date=&format=csv` (pre-match) | PARTIALLY IMPLEMENTED | client.mjs:58-64; only 24 rows on 2026-10-04, 0 on 10-05 (cert:90,945); country/league/season unresolved for the 24 rows, so no competition/season in facts |
| Other endpoints | NOT VERIFIED | provider docs absent from repo |
| Live in-play | NOT VERIFIED | no route; closure doc:241 "not primary" |
| Odds capture time / opening-closing / movement | PROVIDER NOT SUPPORTED | cert:1360 (PREMATCH_MARKET_UNTIMED) |
| Kick-off timezone | PROVIDER NOT SUPPORTED (undocumented) | cert:1359, 161,801 rows PROVIDER_TZ_UNDOCUMENTED (1184) |
| Expected matches per season | PROVIDER NOT SUPPORTED | cert:1358 |
| Players / lineups / injuries | NOT VERIFIED | none among 10 observed field families |
| Provider pagination | PROVIDER NOT SUPPORTED | whole season per CSV; cursors in MatchPilot API are internal |
| Provider plan/quota | NOT VERIFIED | cert:1361; internal caps 20/min, 2000/day, backfill 8/min (budget.mjs:12-14; README.md:872) |
| Auth | api_key query param, redacted in ledger (api_key_paths=0, cert:1100) | budget.mjs:191,304 |

### 1.2 Data volumes (REAL, cert 2026-10-05)
Datasets 1,027 (615 available / 412 404); dataset rows 161,777; prematch versions 24; unique matches 161,801 (2020-09-11..2026-09-28); teams 2,931, aliases 3,324; competitions 185; competition-seasons 1,027; seasons 2020-2021..2026-2027 (13 labels). Per-league breakdown at cert:~100-840. Feed stalled since 20/09 on the provider side per DEC-003.

### 1.3 Raw fields by family (REAL: cert:1208) and implementation
| Family | Observed fields | Typed in fpt_match_facts | Filterable in /api/fpt/search | Notes |
|---|---|---|---|---|
| identity | 11 | 9 | 6 | Home, Away, Date, Time, League, Season, Round, Id, Match_ID, Country, Div; Round and Div untyped |
| goals | 4 | 2 | 2 | Home_Score, Away_Score typed; Min_Goals_Home/Away payload-only |
| expected_goals | 26 | 2 | 2 | xG_Home_FT, xG_Away_FT; xGOT, Big_Chances etc payload-only |
| market | 188 | 12 | 8 | 1X2 (6 spellings), O/U 2.5 FT (4), BTTS_Yes (2) typed; AH_*, EH_*, correct score Odd_CS_*/CS_*, double chance DC_*, Bookie_1X2_FT, HT O/U (Under_HT_0_5), more lines payload-only |
| shooting | 28 | 0 | 0 | |
| discipline (cards, fouls, offsides) | 24 | 0 | 0 | |
| defense | 18 | 0 | 0 | |
| possession_creation | 18 | 0 | 0 | |
| corners | 6 | 0 | 0 | |
| set_pieces | 2 | 0 | 0 | Throw_Ins |
| **Total** | **325** | **25** | **18** | sums verified: 11+4+26+188+28+24+18+18+6+2 = 325 |

Periods: suffixes FT / HT / 2T observed in names (test/phase9-certificate.test.mjs:13-27). Markets seen by name: 1X2, O/U (FT, HT), BTTS, Asian handicap (AH_H_/AH_Home_ alias pairs, schema.mjs aliasCandidateNames), European handicap (EH_), correct score, double chance. Bookmaker: only a field named `Bookie_1X2_FT` is cited; which bookmaker(s) it contains is NOT VERIFIED. Exact list of O/U lines and AH lines: NOT VERIFIED (names not in repo). Single-source odds: MatchPilot labels it `futpythontrader-odds` (hist-input.mjs FPT_BOOKMAKER), no multi-bookmaker.

How the 25 typed fields were identified: `migrations/016-fpt-filter-registry-complete.sql:20-46` (fpt_fact_columns, 25 rows), matching cert:1204 `fields_with_fact_column = 25`. Facts SQL: `src/providers/futpython/facts-refresh.mjs` (REFRESH_SQL) and `migrations/015-fpt-query-facts.sql`. Derived (not raw): favorite_side, favorite_odd, total_goals, result_status.

### 1.4 Queryable surface
21 read-only routes `/api/fpt/*` (query.mjs:738-760) plus `/api/v1/fpt/*` mirrors, `/api/v1/fpt/match-analysis` (match-analysis.mjs uses only result, xG, 1X2 and O/U, BTTS odds) and hist-input (1X2 only, hist-input.mjs:20). `/api/fpt/search` filters (query.mjs:530-556): competition, season, from, fav_min/max, fav_side, home_odd_min/max, over25_min/max, result, min/max_goals, min_xg_total, with_odds, with_xg, plus team/venue/phase/before. `/api/fpt/match` returns the full 325-field payload per match with N/D handling and timing_class (query.mjs:720-735, 838): this is read access, not filter/aggregate.
Registry caveat: `fpt_filter_registry` marks 278 of 325 fields `filterable` with operators (cert:1197), but only 5 fields are indexed (cert:1203) and the search API implements 18 raw fields; the registry overstates executable filtering. Dev-flag, not a bug in data.

### 1.5 Coverage computation (verifiable)
Denominator: 325 raw fields with real evidence (cert:907 `raw_unique_fields`; cert:1208 family sum). Note: "649 distinct fields" in closure doc:173/197 = 325 global + 324 normalized coverage rows (cert:924), a double count, not 649 fields.

| Metric | Numerator | Source | % of 325 |
|---|---|---|---|
| A. Typed in fpt_match_facts | 25 | migration 016:20-46; cert:1204 | **7.69%** |
| B. Executable filter via MatchPilot API (/api/fpt/search) | 18 (Home, Away, Date, League, Country, Season, Home_Score, Away_Score, Odd_1/H/2/A/X/D_FT, Over_FT_2_5, Odd_Over25_FT, xG_Home/Away_FT) | query.mjs:530-556 + team filter | **5.54%** |
| C. Readable per match through /api/fpt/match payload | 325 | query.mjs:838 | 100% read-only (no filter/aggregation) |
| D. Used by analytics/backtest (match-analysis, hist-input) | about 11 (scores, xG x2, 1X2 x3 spellings pairs, O/U, BTTS) | match-analysis.mjs:27,42; hist-input.mjs:20 | about 3% |

Headline figure: **implemented (queryable through MatchPilot API, typed) = 25/325 = 7.7%**; executable-filter 18/325 = 5.5%; raw display 100%. Counting by family: market 12/188 (6.4%), expected_goals 2/26, identity 9/11, goals 2/4, other 6 families 0/96 (corners, shooting, discipline, defense, possession_creation, set_pieces). Limitation: counts by name were done on the 25 mapped names; the 325 total rests on the certificate (Neon, 2026-10-05), not re-verifiable offline. Data after that date (cron refresh, later migrations 021-029 are TC/auth) are NOT VERIFIED.

### 1.6 Biggest unused FPT capabilities (AVAILABLE BUT NOT typed/filterable)
- 188 market fields: only 12 typed. Asian/European handicap, correct score, double chance, HT lines unused in queries.
- 96 non-market statistics (shots 28, discipline 24, defense 18, possession/creation 18, corners 6, throw-ins 2): only visible in match detail; Math/Strategy Lab cannot filter on cards, corners, shots.
- xG family: 24 of 26 unused (xGOT, big chances, half splits).
- Pre-match feed (jogos-do-dia): ingested but sparse (24 rows) and without competition/season link.

## 2. TotalCorner (code present, SUSPENDED by DEC-003)
| Capability | Status | Evidence |
|---|---|---|
| `/match/today` upcoming/inplay/ended (columns events, odds, asian, cornerLine, goalLine, attacks, dangerousAttacks, shotOn, shotOff, possession, btts...) | AVAILABLE AND IMPLEMENTED (suspended) | discovery.mjs:10,86; live.mjs:101,145 |
| `/match/view/{id}`, `/match/odds/{id}` (asian/goal/corner/1x2 and half lists, bttsList) | AVAILABLE AND IMPLEMENTED (suspended) | discovery.mjs:11,119-120; historical.mjs:131-132 |
| `/match/bookmaker_odds/{id}` 18 bookmakers, open/close/inplay/movement (Pinnacle 1X2/Asian/Goal/Corner) | AVAILABLE AND IMPLEMENTED (suspended) | README.md:945-950 REAL run 08/10/2026 |
| `/league/schedule/{id}`, `/league/table/{id}` | schedule implemented; table PARTIALLY (discovery only) | historical.mjs:163; README.md:942 |
| `/match/schedule` | PARTIALLY IMPLEMENTED (discovery) | README.md:939 |
| Field census: 1,346 registry rows (run 1); timestamps UTC+2; 30 rows/page | REAL | README.md:946-950 |
| Mapping FPT<->TC: 92 VERIFIED of 708 TC leagues, 51 countries | REAL | README.md:975-980 |
| Live collector / replay | IMPLEMENTED, TESTED; HARD VERIFIED REAL not certified | README.md:1000 |
| Rate limit | 5 req/10s observed, 4/10s configured | client.mjs:12-13; README.md:928 |
| Trial raw evidence: 14,550 match_view, 14,547 match_odds, 2,680 today_inplay | REAL (trial, outside repo) | closure doc:~205-212 |
| Plan tier, terms, redistribution | NOT VERIFIED | not documented |
Not promoted to canonical odds model in trial (closure doc:214). No quantitative TC coverage figure computed (field names stored only in tc_schema_registry, DB not accessible).

## 3. API-FOOTBALL
No integration, authorization or budget found. Searches: `api-football|apifootball|api_football|api-sports|apisports` (case-insensitive) in the whole repo excluding .git and node_modules: 0 hits. Status for every capability: NOT VERIFIED. The owner naming it in MP-PRODUCT-100 has no counterpart in `owner-decisions.json` (DEC-003: only FPT and TC; "no new costs or provider reactivations").

## 4. BetsAPI
Benchmark only. Closure doc: not core, not required, not worth recurring cost; production promotion owner-gated. Trial: 48,756 raw records, 821,877 normalized odds observations, 401,349 canonical events, bookmakers Bet365, BWin, Betfair Exchange/Sportsbook, SBOBET, 1xBet; 376 HTTP 429 and 487 5xx (closure doc:165-182,216-232). Archive is outside the repo. No code.

## 5. Licence / redistribution
No FPT, TC or BetsAPI terms of use, licence, or redistribution rule is recorded anywhere in the repo (grep terms|licen|redistribut|ridistribu|ToS over README, AGENTS, docs). Items touching the question: browser never calls FPT, no proxy (CLAUDE.md "Resume drill"); DEC-007 requires no provider-condition violations when changing collection frequency; raw tokens never logged. Redistribution rights of stored FPT/TC data to SaaS users (#46 billing) are NOT VERIFIED.

## 6. Open questions
1. Obtain the 325 raw column names (SELECT field_name FROM fpt_schema_fields) to extend the JSON from 58 names to all 325.
2. Provider docs: archive the FPT `/api-docs` page and TC manual in the repo (DOC tier currently empty).
3. Is API-FOOTBALL an intended new provider? If so an owner decision, budget, and ToS check are required first (DEC-003 forbids new costs).
4. Which bookmaker is behind `Bookie_1X2_FT`, and which AH/EH/O-U lines exist (distribution per field)?
5. Typed-column gap: owner priority for corners, cards, shots, handicaps (feeds #34/#94).
6. FPT quota, plan tier, ToS and redistribution terms for SaaS use.
7. Certificate is 2026-10-05; DEC-003 says feed stalled since 20/09: counts need refresh before any new certification.
