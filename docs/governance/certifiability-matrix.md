# Certifiability matrix

Owner decision: MP-OWNER-CONTINUOUS-EXECUTION-02 §4. For every feature of the product, the matrix answers what it needs, what data are really present, which tests can run and what their evidence shows. It is read together with the requirement inventory (`docs/governance/mp-pr-00/requirements.json`), whose verdicts it does not replace.

**Reading rules**
- **Two separate verdicts.** A test on a fixture is never equivalent to a test on the real archive, so each row has one verdict for deterministic tests and one for real data.
- **Replay is not realtime.** Replaying captured history does not certify a realtime collector running H24.
- **No invented data.** A gap stays a gap.
- **Data really present in this repository's environments:**
  - **QA archive:** a fixture of 2 competitions, 86 matches and a day of 31 matches (`test/helpers/fpt-seed.mjs#seedQaArchive`), loaded through the real FutPythonTrader ingestion path (CSV → `storeDataset` → facts). It is real code on seeded data, not real matches.
  - **Archive #40** (FutPythonTrader and TotalCorner history): its manifest and pins are in the repository (`docs/governance/archive/40/`), but its 13 parts are not materialized. The available Drive tool refuses downloads over 10 MB, and there are no read-only Drive API credentials (task R-02, BLOCKED).
  - **Production database (Neon):** not read and never written (owner constraint).
  - **Render service `matchpilot-test`:** suspended.

**Verdicts**

| Verdict | Meaning |
|---|---|
| `REAL DATA PASS` | Passed on the real archive or real provider data, with evidence. |
| `DETERMINISTIC TEST PASS` | Passed reproducible tests on fixtures or synthetic data, with evidence; says nothing about real data. |
| `PARTIAL COVERAGE` | Part of the feature is implemented and tested; the rest is missing or untested. |
| `NOT VERIFIED` | Implemented or partly implemented, but the verification this column needs has not run. |
| `BLOCKED` | Cannot be verified until a named blocker is removed. |
| `FAIL` | Not implemented, or implemented and failing. |

## Matrix

| Feature | Requirements | Inputs needed | Data really present | Executable tests | Evidence | Deterministic | Real data |
|---|---|---|---|---|---|---|---|
| Daily Board (Oggi) | MP-WEB-002, MP-WEB-005, MP-WEB-010, MP-WEB-015 | FPT matches of a day: kickoff, teams, competition, result, 1X2/Over/BTTS odds, favourite, xG; last sync run | QA archive; #40 not materialized | `test/web-e2e.test.mjs`, Browser QA `daily-board`, QA-V scenes `oggi*` | `docs/audits/V-B4-DAILY-BOARD`, `docs/audits/QA-V-VISUAL-BASELINES*` | DETERMINISTIC TEST PASS | NOT VERIFIED |
| Ricerca | MP-WEB-007, MP-API-004 | FPT search with combined filters and keyset pagination; teams and competitions | QA archive | `test/web-e2e.test.mjs`, `test/api-v1-postgres.test.mjs`, Browser QA `search`, QA-V `ricerca*` | `docs/audits/V-B1-UI-NO-RAW-TEXT`, `docs/audits/QA-V-VISUAL-BASELINES*` | DETERMINISTIC TEST PASS | NOT VERIFIED |
| Area Dati (Stato dei dati, Fornitori, API) | MP-WEB-013, MP-WEB-006, MP-API-005 | health, providers, coverage per league, TotalCorner historical/prematch/live summaries | QA archive; TotalCorner tables empty in the fixture | `tools/qa/journeys.mjs` (Browser QA `dashboard`, `providers-endpoints`), `tools/qa/visual.mjs` (QA-V `dati*`) | `docs/audits/V-B2a-HOME-NAV-DATI`, `docs/audits/V-B2b-PROVIDER-LABELS` | DETERMINISTIC TEST PASS | NOT VERIFIED |
| Visual conformity and states | MP-WEB-009, MP-WEB-010, MP-WEB-015, MP-QAC-004 | the approved mockup (#103), the site on desktop, tablet and mobile | QA archive | `tools/qa/journeys.mjs` (Browser QA, every journey on desktop and mobile), `tools/qa/visual.mjs` (QA-V, 18 scenes × 3 viewports) | `docs/audits/QA-V-VISUAL-BASELINES*`, `docs/qa/visual.md` | PARTIAL COVERAGE | NOT VERIFIED |
| Match Center, pre-match (R-07a) | MP-WEB-003, MP-WEB-014, MP-FPT-009 | match header, team form, home/away, xG and other metrics, historical odds and markets per window, provenance and the sample size N | QA archive | `test/match-analysis.test.mjs`, Browser QA `match-center`, QA-V `partita*` | `docs/audits/R-07a-MATCH-CENTER` | PARTIAL COVERAGE | NOT VERIFIED |
| Match Center, finished match (#25) | MP-WEB-004 | final state, timeline, markets, replay link, post-mortem | — | none | — | FAIL | NOT VERIFIED |
| Match Replay (#24) | MP-RPL-001…012, MP-WEB-012 | authentic captured snapshots and events in time order, as of each instant | none: live snapshots are in production (not read) and in #40 (not materialized) | none | — | FAIL | BLOCKED (R-02; MP-RPL-001) |
| Live Trading Board (#29) | none registered | realtime TotalCorner snapshots from a certified H24 collector | none | none | — | FAIL | BLOCKED (MP-TC-012: no certified H24 collector) |
| Trading Tools (#94) | MP-MTH-001, MP-MTH-002, MP-MTH-003 | Decimal arithmetic, odds, commission, P/L formulas with an independent oracle | synthetic test vectors | `test/math-core.test.mjs` | R-12 part 1 (PR #156) | PARTIAL COVERAGE | NOT VERIFIED |
| Strategy Lab (#34) | MP-STA-001, MP-STA-013 | versioned strategies and parameters, backtest inputs | — | none | — | FAIL | NOT VERIFIED |
| Indicator Library | MP-FPT-009 (feature slices) | pre-match indicators computed point-in-time | — | none | — | FAIL | NOT VERIFIED |
| Trading Decision Engine (#28) | none registered | indicators, strategies, market rules, money management | — | none | — | FAIL | NOT VERIFIED |
| Money Management (#96) | none registered | bankroll, stake models, limits | — | none | — | FAIL | NOT VERIFIED |
| Backtest | MP-STA-001…012, MP-MKT-001…003, MP-RPL-003 | authentic point-in-time inputs, outcome labels, market rules, commission | synthetic fixtures; #40 pre-match observations all acquired after kickoff (reported by Grok, not yet verified here) | `test/hist-backtest.test.mjs`, `tools/hist/backtest.mjs` | `docs/hist-backtest.md` | PARTIAL COVERAGE | BLOCKED (no authentic pre-kickoff data; R-02; MP-STA-003) |
| Paper Trading | none registered | live or replayed prices, orders, settlement | — | none | — | FAIL | NOT VERIFIED |
| Settlement and ledger (#99, #100) | MP-MKT-001, MP-MTH-003 | versioned market rules, outcomes, ledger entries | synthetic fixtures and seeded vectors | `test/hist-backtest.test.mjs` | `docs/hist-backtest.md` | PARTIAL COVERAGE | NOT VERIFIED |
| Trading Copilot (#102) | none registered | the engine, explanations, no paid AI in CI | — | none | — | FAIL | NOT VERIFIED |
| API v1 (#98) | MP-API-001…006 | versioned routes, error envelope, provenance, bounded queries, registry | QA archive and seeded database | `test/api-v1-contract.test.mjs`, `test/api-v1-postgres.test.mjs` | R-03 (PR #153), R-06a (PR #162) | DETERMINISTIC TEST PASS | NOT VERIFIED |
| MCP | MP-API-005 (machine-readable registry only) | MCP server exposing the read-only tools | — | none | — | FAIL | NOT VERIFIED |
| Administration and settings | MP-SEC-001, MP-SEC-007 (owner login, R-04) | owner sessions, rate limit, audit, migration guard | test databases | `test/owner-auth.test.mjs`, `test/owner-auth-hardening.test.mjs` | R-04, R-04b, R-04c (PRs #157–#160) | PARTIAL COVERAGE | NOT VERIFIED |
| FutPythonTrader ingestion | MP-FPT-001…012 | provider CSVs, raw snapshots, identities, versions | QA archive through the real path; production data not read | `test/fpt-*.test.mjs` (onboarding, reconciliation, reprocessing, pagination) | FPT certification (#12) | PARTIAL COVERAGE | BLOCKED (R-02; MP-FPT-008, MP-FPT-012) |
| TotalCorner collectors | MP-TC-001…015 | provider responses, mappings, prematch, live, FT | fixtures; live history in production (not read) | `test/tc-core-*.test.mjs` | TotalCorner certification (#20) | PARTIAL COVERAGE | BLOCKED (MP-TC-012: H24 not certified) |
| Archive #40 | MP-ARC-001…005 | the 13 parts, their SHA-256, DuckDB portability, counts, PIT | manifest and pins only | `test/archive-verify.test.mjs`, `tools/archive/verify-archive.mjs` | `docs/governance/archive/40/`, checkpoint `CP-20261018T211916Z` | PARTIAL COVERAGE | BLOCKED (R-02) |

Why the Match Center is only a partial coverage: R-07a is the first batch of the analysis of #30 (form, venue, sample, goals, xG, odds coverage, head to head); the other analytical cards, charts and the finished-match page are not built.

Why the Backtest is only a partial coverage: HIST-01a is the offline engine (PIT admission, the test-oracle strategy `mp-ref-fav-back-1`, 1X2 settlement, reproducible report) on synthetic fixtures; walk-forward, out-of-sample (MP-STA-004…010), the sample-size gate (MP-STA-012), other markets and the real-data run are not built; of the STA requirements only MP-STA-001 and MP-STA-011 are partly covered. Settlement covers BACK/LAY P/L with commission; the ledger, exposure and positions of #99/#100 are not built.

Why «Visual conformity and states» is only a partial coverage: the baselines and journeys catch regressions against the views as approved, not conformity to the mockup itself. The required check on `main` is not verified (MP-QAC-004), and the login texts are not automated (inventory UI-63…UI-65).

## How a verdict changes

A verdict moves only with evidence, in the PR that produces it:
- deterministic verdicts with the PR's tests, Browser QA or QA-V;
- real-data verdicts only after R-02 materializes archive #40 and a test reads it.

The `REAL DATA PASS` verdict is never used for a fixture. `test/governance-certifiability.test.mjs` checks that:
- every verdict is exactly one of the six above, with only a parenthesised cause after `BLOCKED`;
- every requirement named exists in the inventory;
- `REAL DATA PASS` appears only in the real-data column, only when the data column names archive #40 or real provider data and none of the QA archive, fixtures, synthetic, mock or seeded data, and only with an existing `docs/audits/` package as evidence;
- `DETERMINISTIC TEST PASS` and `PARTIAL COVERAGE` name at least one test file or tool that exists in the repository;
- the table has exactly the features listed in the test, so a row cannot vanish or be skipped by its layout.
