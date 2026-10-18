# MP-PR-00 — Bidirectional traceability matrix

La fonte machine-readable è `requirements.json`. Questo documento rende leggibili copertura e reverse mapping senza sostituire il catalogo atomico.

## Requirement → design → code → test → evidence → verdict

| Gruppo | Requisiti | PASS | FAIL | BLOCKED | NOT_VERIFIED | N/A |
|---|---:|---:|---:|---:|---:|---:|
| GOV | 12 | 9 | 0 | 0 | 3 | 0 |
| FPT | 12 | 5 | 1 | 1 | 5 | 0 |
| TC | 12 | 6 | 0 | 2 | 4 | 0 |
| WEB | 12 | 0 | 8 | 0 | 4 | 0 |
| RPL | 12 | 0 | 8 | 2 | 2 | 0 |
| STA | 12 | 0 | 10 | 1 | 1 | 0 |
| QAC | 12 | 3 | 4 | 0 | 5 | 0 |
| SEC | 12 | 3 | 2 | 1 | 5 | 1 |
| **Totale** | **96** | **26** | **33** | **7** | **29** | **1** |

Il dettaglio riga-per-riga, inclusi design, test, evidence e dependencies, è nel JSON e viene validato automaticamente.

## Production code → requirement → test

| Codice produzione/tool | Requisiti |
|---|---|
| `src/server.mjs` | MP-WEB-001 |
| `src/background.mjs` | MP-SEC-003, MP-SEC-005 |
| `src/db.mjs` | MP-SEC-002 |
| `src/coverage-page.mjs` | MP-WEB-005, MP-WEB-006 |
| `src/alerts.mjs` | MP-FPT-011, MP-TC-011 |
| `src/futpython-certification.mjs` | MP-FPT-012 |
| `src/providers/futpython/schema.mjs` | MP-FPT-001 |
| `src/providers/futpython/store.mjs` | MP-FPT-002 |
| `src/providers/futpython/query.mjs` | MP-FPT-003, MP-SEC-006 |
| `src/providers/futpython/coverage.mjs` | MP-FPT-004 |
| `src/providers/futpython/reprocess.mjs` | MP-FPT-005 |
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
| `src/jobs/totalcorner-live.mjs` | MP-TC-007, MP-TC-008, MP-TC-010 |
| `scripts/ci-classify.mjs` | MP-QAC-009, MP-QAC-012 |
| `tools/validate-requirements.mjs` | MP-GOV-008, MP-QAC-012 |

## Reverse-mapping gaps

- 52 production modules exist; MP-PR-00 maps the modules carrying v1-critical behavior, not every helper file. The remaining code-to-requirement census must expand before Gate A PASS.
- Current web, replay and statistics gaps are genuine missing implementations, not absent mapping mistakes.
- References `MP-API-001`, `MP-API-004` and `MP-MATH-001` are reserved dependency contracts for later PRs; the validator recognizes them but they are not counted as implemented v1 requirements.
- Tests mapped today show existence and scoped evidence only. They do not imply integration, browser, predictive or LIVE certification.
