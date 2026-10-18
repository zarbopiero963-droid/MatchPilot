# MP-PR-00 — Bidirectional traceability matrix

La fonte machine-readable è `requirements.json`. Questo documento rende leggibili copertura e mapping inverso, senza sostituire il catalogo atomico. Le tabelle sono calcolate dal JSON della revisione R-00; il validatore impedisce che il JSON diverga dai path reali e dal `pr_registry`.

## Requirement → design → code → test → evidence → verdict

<!-- inventory:groups:start -->
| Gruppo | Requisiti | P0 | PASS | FAIL | BLOCKED | NOT_VERIFIED |
|---|---:|---:|---:|---:|---:|---:|
| GOV | 23 | 19 | 17 | 0 | 0 | 6 |
| FPT | 12 | 8 | 4 | 1 | 1 | 6 |
| TC | 15 | 9 | 8 | 2 | 1 | 4 |
| WEB | 14 | 10 | 0 | 10 | 0 | 4 |
| RPL | 12 | 9 | 0 | 8 | 2 | 2 |
| STA | 13 | 9 | 0 | 11 | 1 | 1 |
| QAC | 13 | 12 | 3 | 4 | 0 | 6 |
| SEC | 11 | 9 | 3 | 2 | 1 | 5 |
| API | 6 | 5 | 0 | 5 | 0 | 1 |
| ARC | 5 | 4 | 1 | 1 | 1 | 2 |
| PIT | 5 | 5 | 0 | 5 | 0 | 0 |
| XPR | 2 | 1 | 0 | 2 | 0 | 0 |
| MKT | 3 | 3 | 0 | 3 | 0 | 0 |
| MTH | 3 | 1 | 0 | 3 | 0 | 0 |
| OPS | 1 | 0 | 0 | 1 | 0 | 0 |
| **Totale** | **138** | **104** | **36** | **58** | **7** | **37** |
<!-- inventory:groups:end -->

Ogni PASS ha evidenza e vale solo nel proprio scope (es. TC-007/TC-008 = runtime PR #145). Nessun PASS equivale a GLOBAL HARD CERTIFIED.

## Production code → requirement

| Codice produzione/tool | Requisiti |
|---|---|
| `src/server.mjs` | MP-WEB-001, MP-API-006 |
| `src/background.mjs` | MP-SEC-003, MP-SEC-005 |
| `src/db.mjs` | MP-SEC-002 |
| `src/coverage-page.mjs` | MP-WEB-005, MP-WEB-006 |
| `src/alerts.mjs` | MP-FPT-011, MP-TC-011 |
| `src/futpython-certification.mjs` | MP-FPT-012 |
| `src/providers/futpython/schema.mjs` | MP-FPT-001 |
| `src/providers/futpython/store.mjs` | MP-FPT-002 |
| `src/providers/futpython/query.mjs` | MP-FPT-003, MP-SEC-006, MP-API-006 |
| `src/providers/futpython/coverage.mjs` | MP-FPT-004 |
| `src/providers/futpython/reprocess.mjs` | MP-FPT-005 |
| `migrations/014-fpt-normalized-layer.sql` | MP-FPT-005 |
| `src/providers/futpython/reconciliation.mjs` | MP-FPT-006 |
| `src/providers/futpython/classification.mjs` | MP-FPT-007 |
| `src/providers/futpython/onboarding.mjs` | MP-FPT-010 |
| `src/jobs/data-watchdog.mjs` | MP-FPT-011 |
| `src/providers/totalcorner/client.mjs` | MP-TC-001, MP-TC-009, MP-SEC-002 |
| `src/providers/totalcorner/mapping.mjs` | MP-TC-002 |
| `src/providers/totalcorner/prematch.mjs` | MP-TC-003, MP-RPL-003 |
| `src/providers/totalcorner/historical.mjs` | MP-TC-006 |
| `src/providers/totalcorner/live.mjs` | MP-TC-007 |
| `src/jobs/totalcorner-prematch.mjs` | MP-TC-004, MP-TC-005, MP-TC-010 |
| `src/jobs/totalcorner-live.mjs` | MP-TC-007, MP-TC-008, MP-TC-010, MP-TC-015 |
| `scripts/ci-classify.mjs` | MP-QAC-009, MP-QAC-012 |
| `tools/validate-requirements.mjs` | MP-GOV-008, MP-GOV-015, MP-QAC-012 |

## PR → requirements (`pr_registry`)

<!-- inventory:prs:start -->
| PR | Scope | Issue | Card #104 | Requisiti |
|---|---|---|---|---:|
| R-00 | MP-PR-00 / PR #149: atomic inventory v2, owner-decision register, audit persistence | #3 #97 #104 #149 | — | 8 |
| R-01 | Governance alignment AGENTS/CLAUDE, closure guards, Gate B evidence schema, MP-MULTIAGENT-SYNC-CHECKPOINT-01 | #3 #97 #144 | — | 11 |
| R-02 | Archive #40 read-only materialization and independent hash/portability verification | #40 #144 | — | 6 |
| R-03 | API v1 contract, error envelope, provenance, bounded queries, legacy route inventory | #98 #3 #30 | MCP-CORE-00 | 12 |
| R-04 | Owner/admin auth baseline | #23 #32 | AUTH-CORE-01, AUTH-CORE-02 | 2 |
| R-05 | Real web shell, browser E2E and security lanes | #3 #97 | — | 10 |
| R-06 | Dashboard, Daily Board, search and filters | #3 #30 | QUERY-CORE-02 | 4 |
| R-07 | Match Center, match analysis, data quality and charts | #3 #25 #30 | QUERY-CORE-01 | 8 |
| R-08 | PIT policy, version pinning, cross-provider identity, timezone/DST | #12 #20 #31 | RECON-CORE-01 | 8 |
| R-09 | Archive query layer and deterministic replay core | #24 | REPLAY-CORE-01 | 11 |
| R-10 | Replay API | #24 #98 | REPLAY-CORE-02 | 2 |
| R-11 | Replay UI | #24 #25 | — | 5 |
| R-12 | Mathematical oracle and statistical metrics | #94 #3 | MATH-CORE-01, MATH-CORE-07, MATH-CORE-08 | 6 |
| R-13 | Backtest market outcomes and frozen configuration snapshot | #100 #95 #99 | — | 3 |
| R-14 | Chronological backtest, walk-forward and out-of-sample validation | #34 #3 | STRAT-CORE-03, STRAT-CORE-04 | 11 |
| R-15 | TotalCorner residual normalization on captured data | #20 | TC-CORE-05, TC-CORE-06, TC-CORE-06B | 6 |
| R-16 | FPT 412 audit (read-only part) and FPT residual certification | #12 | — | 5 |
| R-17 | Adversarial, recovery, performance, security, TC alerts and ops drills | #23 #31 #144 #20 | TC-CORE-07, RECON-CORE-02, RECON-CORE-04, RECON-CORE-05 | 14 |
| R-18 | Integrated Gate A/B and IV&V for OFFLINE v1 | #3 #97 #98 | — | 6 |
| continuous | Cross-cutting rule applied by every PR | — | — | 25 |
<!-- inventory:prs:end -->

## Reverse-mapping gaps

- **Moduli mappati:** 52 moduli di produzione esistono e 25 file sono mappati. Il censimento code→requirement completo resta una condizione per il Gate A PASS.
- **Lacune genuine:** web, replay, statistiche, API e PIT sono implementazioni mancanti, non errori di mapping.
- **Contratti esterni:** i contratti prima referenziati come esterni (MP-API-001/004, MP-MATH-001) sono ora requisiti nel denominatore (API-001/004, MTH-001).
- **Valore dei test mappati:** dimostrano esistenza ed evidenza nel proprio scope; non implicano certificazione integrata, browser, predittiva o LIVE.
