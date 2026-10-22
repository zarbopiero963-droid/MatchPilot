# Ratifica decisioni owner DEC-001…DEC-014 (MP-OWNER-DECISIONS-RATIFICATION-14-2026-10-22)

Fonte: mandato owner t121u (22/10/2026) e rettifica owner t122u (DEC-004-R1). Registro canonico: [`owner-decisions.json`](owner-decisions.json).
Review di questa PR: **self-review dell'agente autore, NON indipendente** (DEC-004-R1). Nessuna certificazione dichiarata.

> **Fonti.** DEC-001…DEC-014: testo verbatim t121u (DEC-001/002 tradotti nel registro; originale italiano conservato in evidenza). DEC-004-R1: rettifica owner t122u. Fonte canonica di DEC-001…014: ratifica owner t121u. Il baseline audit, fornito dall'owner, è conservato in [`audits/2026-10-22-MP-GLOBAL-AUDIT/`](audits/2026-10-22-MP-GLOBAL-AUDIT/) con `SHA256SUMS` (zip 69a23fee…); le schede di D-decisions.md sono domande aperte con raccomandazioni, non decisioni. 47 lacune: §G. Confronto delle 54 trascrizioni: §H. t123u (auto-deploy, 10 condizioni) e precisazione t124u: voce `OWN-T123U-AUTODEPLOY`, verbatim. t107u/t108u/t109u/t114u: registrati da sintesi della conversazione (**summary source, not verbatim**), voce `AUDIT-SOURCES-2026-10-22`.

## A. Registro (tutte OWNER APPROVED; approvazione ≠ implementazione ≠ certificazione)

| ID | Scelta | Stato | Issue | Sostituisce | Implementazione | Certificazione |
|---|---|---|---|---|---|---|
| DEC-001 STOP/ADVISORY_ONLY | A | IN_FORCE | #96 #99 #102 #97 | OWN-OPEN-STOP-ADVISORY | NOT IMPLEMENTED | NOT VERIFIED |
| DEC-002 Correzioni esiti/PIT | A1 | IN_FORCE | #12 #20 #24 #34 #178 | — (integra D1-D9.D4) | PARTIAL (#178 sintetico) | NOT VERIFIED |
| DEC-003 Perimetro FPT/TC | C | IN_FORCE | #3 #12 #20 #182 | OWN-2026-10-06-SCOPE (parziale) | PARTIAL | NOT VERIFIED; feed FPT fermo lato provider |
| DEC-004 Identità/review indipendente | A | **SUPERSEDED** da DEC-004-R1 | tutte le PR | — | n/a | n/a |
| DEC-004-R1 (t122u) | rettifica | IN_FORCE | tutte le PR | DEC-004; D1-D9.D2, AUTOMERGE-01, MASTER-GOVERNANCE (solo indipendenza review) | testi governance aggiornati | NOT VERIFIED |
| DEC-005 GOV-01 | C | IN_FORCE | #97 #150 | — (AUTOMERGE-02/03 resta proposta non approvata) | NOT IMPLEMENTED | NOT VERIFIED |
| DEC-006 PR #178 | A | IN_FORCE (cl. 6 → R1) | #178 #34 | integra HIST-01A-02 | NOT IMPLEMENTED | NOT VERIFIED |
| DEC-007 Dati backtest | D | IN_FORCE | #12 #20 #34 #178 | integra D1-D9.D4 | NOT IMPLEMENTED | NOT VERIFIED |
| DEC-008 Segnali simulati | B | IN_FORCE (review → R1) | #184 #187 #189 | — | IN PROGRESS (altro worker) | NOT VERIFIED |
| DEC-009 Telegram | B | IN_FORCE | #34 #182 #12 | — | PARTIAL (solo notifiche tecniche) | NOT VERIFIED |
| DEC-010 Retention backup | A | IN_FORCE | #179 | MP-OWNER-BACKUP-RETENTION-01 | PARTIAL (nessuna cancellazione automatica) | NOT VERIFIED |
| DEC-011 PG18 definitivo | A | IN_FORCE | #179 #182 | — | PARTIAL (restore isolato PASS; DR altra macchina no) | NOT VERIFIED |
| DEC-012 Sblocco deploy | A | PARTIALLY_SUPERSEDED (cl. 1 e 5 → R1; approvazione umana passo 8 → t123u) | #179 #180 #181 | — | IN PROGRESS (S4, approvazione umana run) | NOT VERIFIED |
| DEC-013 Default MM | A | IN_FORCE | #96 #99 | — | NOT IMPLEMENTED | NOT VERIFIED |
| DEC-014 Render/Neon | A | IN_FORCE | #179 #182 | — | PARTIAL (fuori runtime; export Neon non verificato) | NOT VERIFIED |

## B. Conflitti classificati (testo precedente → vigente)

| Fonte | Precedente | Vigente | Classe |
|---|---|---|---|
| Registro OWN-OPEN-STOP-ADVISORY (#96/#99) | OPEN: scritture ammesse in ADVISORY_ONLY | DEC-001 | SUPERSEDED |
| OWN-2026-10-06-SCOPE (#3, #20) | perimetro = FPT∩TC VERIFIED | DEC-003: FPT∩TC solo per certificazione congiunta; FPT-only con provenienza; TC spento | PARTIALLY_SUPERSEDED |
| D1-D9.D2, AUTOMERGE-01, MASTER-GOVERNANCE, AGENTS.md §4, README | review indipendente APPROVED obbligatoria | DEC-004-R1 self-review etichettata; deploy con approvazione umana | PARTIALLY_SUPERSEDED |
| DEC-004 (P1/A7 GitHub App, review retrospettiva PR mergiate, censimento deroghe self-review) | blocchi | rimossi (DEC-004-R1) | SUPERSEDED |
| DEC-006 cl. 6, DEC-008 "review indipendente", DEC-012 cl. 1 e 5 | review indipendente / S4 dopo DEC-004 | self-review etichettata; S4 non dipende più da A7 | clausole superate da R1 |
| MP-OWNER-BACKUP-RETENTION-01 (#179) | OPEN, lettura proposta | DEC-010 | SUPERSEDED |
| MP-OWNER-AUTOMERGE-02-03-PROPOSAL (GOV-01) | proposta non approvata | DEC-005: non riattivare automerge GOV-01 senza verifica separata | resta OPEN, nota |
| MP-OWNER-HIST-01A-02 (#178) | merge non autorizzato, NB-2 | DEC-006: riallineamento a main, merge solo con gate | complementare |
| D1-D9.D4, docs/pit-policy.md (#12 #20 #34) | solo dati PIT, non-PIT esclusi o etichettati | DEC-002 + DEC-007: due percorsi, etichetta NON_PIT / EXPLORATORY / NOT CERTIFIED | complementare (pit-policy aggiornata) |
| #34 notifiche strategiche, #182 FPT+Telegram on | Telegram per segnali | DEC-009: solo notifiche tecniche; strategiche future | limitazione di ambito |
| #96/#99 default MM | non fissati | DEC-013 (SHARED_ACCOUNT_BANKROLL, VOID/PUSH non avanzano, commissione fissata al fill, decimale) | nuova regola |
| #179, #182, MP-VPS-ONLY-OPERATIONS | Render/Neon off | DEC-014 + DEC-011 (PG18 definitivo, PG17 preservato, nessuna cancellazione) | coerente, nessun conflitto |
| DEC-012 passo 8, DEC-004-R1 frase deploy, t112u/t113u/t119u | approvazione umana di ogni run | t123u: auto-deploy dei deploy ordinari sotto 10 condizioni | SUPERSEDED (parti di approvazione umana) |
| deploy-approval.md, gate S1–S4 (#180 #181) | sequenza gate | DEC-012 (run obsoleto non approvato automaticamente; solo SHA approvato) | coerente; dipendenza A7 rimossa |
| #104 piano 82 PR, #97 roadmap | numeri piano storici | §6: ~87 PR stimate, non definitive | storico superato per i numeri |

Nessun conflitto noto resta non classificato rispetto ai testi disponibili.

## C. Modifiche di codice necessarie (priorità, dipendenze)

1. P0 — DEC-008: rimozione `src/signals/simulated.mjs`, `src/jobs/sim-signals.mjs`, route/UI/test collegati (altro worker; dopo il deploy).
2. P1 — Tooling governance: verificare che i controlli che richiedono un verdetto "independent" (`tools/governance/*`, CI gate) accettino una self-review etichettata, senza indebolire gate CI e deploy (dipende da DEC-004-R1).
3. P1 — DEC-001: macchina di stato STOP/ADVISORY_ONLY in #96/#99 con test RED/GREEN (blocco aperture, riduzione esposizione, settlement idempotente una sola volta). Dipende dal ledger #99.
4. P1 — DEC-002: versioning esiti FINAL (versione, provenienza, timestamp correzione) e flag nel report backtest; dipende da #178/HIST-01b.
5. P2 — DEC-003: etichette provenienza/copertura FPT-only vs FPT∩TC in API/UI; vietare il marchio "congiunto certificato" su dati solo FPT.
6. P1 — DEC-006: riallineare #178 a main (PIT, regressione, report merge readiness).
7. P1 — DEC-007: etichetta NON_PIT/EXPLORATORY/NOT CERTIFIED e percorso snapshot pre-kickoff.
8. P1 — DEC-013: default MM nel motore #96/#99, aritmetica decimale.
9. P2 — DEC-005: verifiche automatiche dello stato GitHub (PR, check, SHA, merge).
10. Operativo — DEC-010 dry-run retention; DEC-014 export Neon cifrato e ripristino isolato; DEC-011 DR su altra macchina.

## D. Roadmap esecutiva (baseline audit non definitiva: 39 issue, 139+47 requisiti, ~87 PR stimate)

- **Completato:** VPS + PG18 operativo, collector FPT attivo, Telegram, restore isolato PASS, TotalCorner spento (#186), S3 installato.
- **Da correggere:** segnali simulati (DEC-008); testi governance sull'indipendenza review (questa PR, parziale).
- **Da certificare:** deploy 39fe08e (S4 bloccante, approvazione owner), DR su macchina diversa, copia offsite automatica.
- **Non implementato:** DEC-001 (#96/#99), DEC-002 versioning esiti, Copilot #102, Strategy Lab #34 oltre HIST-01a.
- **Dipendenze esterne:** feed FutPythonTrader fermo dal 20/09 (supporto provider/abbonamento).
- **Fuori scope:** denaro reale, sport diversi dal calcio, Render/Neon runtime, TotalCorner attivo.
- **Operativo VPS/DR/deploy:** guard bloccante dopo primo ALLOW, backup Drive 05:15, runbook grant post-restore.
- **Da integrare nella matrice:** 47 lacune (§G, NOT VERIFIED).
- **Bloccato:** trascrizioni con originale solo in chat (§H, BLOCKED_SOURCE_MISSING).
- **Operativo (t123u/t124u):** auto-deploy NOT IMPLEMENTED — correzione permessi mp-deploy v3, check obbligatori legati allo SHA non falsificabili da workflow modificati nella stessa PR, annullamento del run superato da un nuovo commit su main, rollback automatico, notifica Telegram; attivazione solo dopo test isolati.

## E. Decisioni residue

- Nessuna nuova ambiguità sostanziale per DEC-001…003 e DEC-004-R1.
- Necessario solo un dato: i file del baseline audit e gli originali di t107u/t109u. Attivazione delle cancellazioni automatiche dei backup (DEC-010) resta decisione owner futura.
- Tecniche delegabili: forma dei campi di versioning (DEC-002), nomi degli stati STOP (DEC-001).

## F. Piano PR e certificazione

1. Questa PR (governance, solo documenti/registro) — aperta, merge dopo la conclusione del deploy owner.
2. PR DEC-008 removal (altro worker) → nuova release → approvazione umana deploy.
3. PR follow-up solo se emergono le fonti audit mancanti.
4. Una PR implementativa alla volta: tooling self-review → DEC-001 → DEC-002 → DEC-003 etichette.
Ogni PR: RED/GREEN, regressione, self-review etichettata, CI verde, merge gate; merge ≠ deploy ≠ certificazione.

## G. Le 47 lacune aggiuntive (B-rtm.json `gaps`) — stato: NOT VERIFIED

| ID | Fonte | Priorità | Requisito | Indizio codice |
|---|---|---|---|---|
| GAP-FPT-001 | #12 | P1 | Provider budget states NORMAL/ELEVATED/CONSERVE/CRITICAL/EXHAUSTED with configurable thresholds and consumption alerts | implemented, untraced: src/providers/futpython/budget.mjs:97 BUDGET_LEVELS |
| GAP-FPT-002 | #12 | P1 | Request deduplication: concurrent identical requests share one upstream call | implemented, untraced: src/providers/futpython/budget.mjs:185 inflight map |
| GAP-FPT-003 | #12 | P0 | Cache-first: user traffic never triggers provider calls; frontend never calls FPT/TC (hard test 20 clients -> 1 upstream) | partially implied by MP-WEB-001/API 'no provider call'; no requirement/test for the 20-client gate |
| GAP-FPT-004 | #12 | P1 | Startup protection: restart/deploy does not relaunch history, reset budgets or duplicate collectors |  |
| GAP-FPT-005 | #12 | P1 | Competition & Season Coverage Registry: earliest/latest season, state, match count and field coverage per season | partially implemented: src/providers/futpython/seasons.mjs earliest_season/latest_season |
| GAP-FPT-006 | #12 | P1 | Missing-season detection without assuming continuity |  |
| GAP-FPT-007 | #12 | P0 | Field evolution / backtest safety: a metric is never used before the season it first appears |  |
| GAP-FPT-008 | #12 | P2 | Filter metadata registry describing filterable fields, operators and semantics |  |
| GAP-TC-001 | #20 | P1 | Per-match TC data-quality classification complete/partial/inconsistent/upstream_missing incl. score↔events reconciliation |  |
| GAP-TC-002 | #20 | P2 | Retention policy of the proprietary live archive | census known gap |
| GAP-TC-003 | #182 | P0 | TotalCorner disabled by configuration with a negative test (no new acquisitions) | implemented, untraced: src/background.mjs:33 tcEnabled, test/runtime-isolation.test.mjs (#186) |
| GAP-VPS-001 | #182 | P0 | No runtime process depends on Render/Neon, verified by network/config proofs and VPS restart |  |
| GAP-VPS-002 | #182 | P0 | FPT acquires and persists validated data on VPS PostgreSQL and Telegram notifies without duplicates |  |
| GAP-VPS-003 | #182 | P0 | FREEZE archive intact (hash/readback) plus off-host backup and tested restore | MP-OPS-001 covers only dev DB drill |
| GAP-VPS-004 | #182 | P0 | Deploy gate S3/S4 PASS documented before normal deploy; unauthorized deploys refused | implemented, untraced: .github/workflows/deploy-vps.yml, scripts/workflow-policy.mjs, test/governance-workflows.test.mjs (13/13 PASS after npm ci) |
| GAP-MIG-001 | #179 | P1 | Neon→VPS migration: read-only export, full import with hashes and counts, encrypted backup and restore, authorized cutover | owner-gated |
| GAP-GH-001 | #144 | P2 | Return repository to PRIVATE at end of development and verify visibility=private | end-of-development |
| GAP-GH-002 | #144 | P2 | Measured (not presumed) zero additional Actions spend | MP-GOV-009 has no measurement evidence |
| GAP-UI-001 | #3 | P1 | Odds shown with Italian comma and exact precision, no rounding (D-3) | implemented, untraced: src/web/app.js:131; violated in #/segnali (raw r.odd) |
| GAP-UI-002 | #3 | P1 | Dates/times shown in Europe/Rome with DST, exact UTC in details (D-7) | implemented, untraced: src/web/app.js:140-143; violated in #/segnali (raw ISO dates) |
| GAP-ARCH-001 | #3 | P1 | Shared ingestion/computation: provider → shared collection → DB → reusable computation → N users, no per-user duplication |  |
| GAP-QA-001 | #3 | P0 | Findings classified BUG / DATA MISSING / DATA QUALITY ...; strategies/backtests run only with available inputs, else NON VALUTABILE | MP-OWNER-PRODUCT-QUALITY-DATA-01 |
| GAP-MAH-001 | #30 | P1 | Opponent-strength and favourite/underdog filters |  |
| GAP-MAH-002 | #30 | P1 | Score-state and time-phase filters |  |
| GAP-MAH-003 | #30 | P2 | Custom sample window besides 5/10/20/season |  |
| GAP-MAH-004 | #30 | P2 | Compare mode |  |
| GAP-MAH-005 | #30 | P2 | Saved filter presets |  |
| GAP-MAH-006 | #3/#25/#30 | P1 | Card-level catalogue (Similar Odds, Score distribution, Goal timing, League context, Strengths/Weaknesses, ...) not atomized | census known gap (#3, #25/#30) |
| GAP-REC-001 | #31 | P1 | TC live gap detector recording UNRECOVERABLE_GAP with start/end/duration/affected fields/cause |  |
| GAP-REC-002 | #31 | P1 | Startup reconciliation for all collectors: mark running runs interrupted, resume from checkpoints | FPT only: reconciliation.mjs markOrphanRuns (MP-FPT-006) |
| GAP-REC-003 | #31 | P2 | Periodic reconciliation (lightweight 5 min, deep 1 h, daily audit), configurable |  |
| GAP-REC-004 | #31 | P1 | Persistent data integrity ledger with states DETECTED/QUEUED/RECOVERING/RECOVERED/PARTIAL/UNRECOVERABLE/FAILED |  |
| GAP-REC-005 | #31 | P2 | Reconciliation queue with priorities P0-P3 |  |
| GAP-SEC-001 | #32 | P0 | Browser never calls providers; upstream tokens not visible; bundle/network hard test | CSP connect-src 'self' in src/web/static.mjs:7; no traced test |
| GAP-SEC-002 | #32 | P1 | HTTP security headers | implemented, untraced: src/web/static.mjs CSP, src/server.mjs:47 nosniff; may fall under MP-FUT-008 |
| GAP-SEC-003 | #32 | P1 | API rate limiting / anti-abuse on the read API | only login rate limit (R-04b); may fall under MP-FUT-008 |
| GAP-SEC-004 | #32 | P2 | Public source maps off / frontend minified | may fall under MP-FUT-008 |
| GAP-AUTH-001 | #23 | P1 | Persistent audit log of sensitive actions with actor, action, target, UTC time, outcome, sanitized metadata | partially implemented, untraced: migrations/029-owner-auth.sql auth_audit |
| GAP-AUTH-002 | #23 | P1 | Robust password hashing and login errors that do not reveal whether the account exists | scrypt in src/auth/owner-auth.mjs; not a traced requirement |
| GAP-STR-001 | #34 | P0 | Saved backtests with backtest_id, strategy version, parameters, dataset snapshot/version, commit/data-contract version |  |
| GAP-STR-002 | #34 | P1 | Backtest controls: date range, leagues, teams, odds range, commission, slippage, data-quality threshold |  |
| GAP-STR-003 | #34 | P1 | Extended backtest metrics: yield, profit factor, longest losing streak, max liability, equity curve | MP-STA-008 covers ROI/strike/drawdown/sample only |
| GAP-ARC-001 | #40 | P0 | Versioned closing rule: closing odds = last valid observation <= kickoff cutoff, with closing_rule_version and source record |  |
| GAP-ARC-002 | #40 | P0 | Physical/logical separation FEATURES vs LABELS with label_available_at | MP-MKT-002 covers label materialization only |
| GAP-ARC-003 | #40 | P2 | ScoreTrend raw segregated and excluded from canonical/feature/backtest layers |  |
| GAP-ARC-004 | #40 | P1 | Coverage semantics vocabulary OBSERVED/MISSING/UNKNOWN_UPSTREAM/NOT_APPLICABLE/PROVIDER_UNAVAILABLE/COLLECTION_GAP/STALE |  |
| GAP-ARC-005 | #40 | P2 | Readiness vocabulary: trial archive never called backtest/strategy certified |  |

## H. Confronto delle 54 trascrizioni dell'agente con le fonti

| Decisione | Stato | Esito del confronto |
|---|---|---|
| MP-ENTERPRISE-GATE-AB-WEB-SIM-01 | SUPERSEDED | GitHub comment(s) present in audit snapshot: 6254329652, 6254330895 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-OWNER-CERT-ISSUE-CLOSURE-01 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6254329652, 6254330895 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-OWNER-AUTOMERGE-01 | PARTIALLY_SUPERSEDED | GitHub comment(s) present in audit snapshot: 6254329652, 6254330895 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6254329652, 6254330895 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-OWNER-DECISIONS-D1-D9-20261018.D1 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6254329652, 6254330895 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-OWNER-DECISIONS-D1-D9-20261018.D2 | PARTIALLY_SUPERSEDED | GitHub comment(s) present in audit snapshot: 6254329652, 6254330895 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-OWNER-DECISIONS-D1-D9-20261018.D3 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D4 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D5 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D6 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D7 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D8 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D9 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D10 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-DECISIONS-D1-D9-20261018.D11 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-MASTER-GOVERNANCE-2026-10-18 | PARTIALLY_SUPERSEDED | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-R01-AUTH-20261018 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-AUTONOMOUS-EXECUTION-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-D12-OWNER-LOGIN-20261019 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-D13-MIGRATIONS-AUTODEPLOY-20261019 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-CONTINUE-20261019 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6263792750 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-ROADMAP-CONTINUE-ARCHIVE-FIRST-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-ARCHIVE-FIRST-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-EXCLUDE-REAL-EXECUTION-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-BROWSER-QA-HARD-GATE-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-PRODUCT-QUALITY-DATA-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-QA-01-AUTHORIZATION | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-CI-GATE-REQUIRED-CHECK-CONFIRMED | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-VISUAL-BASELINE-D1-D7-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-QA-VISUAL-EXECUTION-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-PERMANENT-EVIDENCE-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-RESUME-AFTER-EVIDENCE-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-UI-NO-RAW-TEXT-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-AUTONOMOUS-UI-ROADMAP-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-CONTINUOUS-EXECUTION-02 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-FUNCTIONAL-DELIVERY-03 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-VPS-DEPLOY-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-DEPLOY-APPROVAL-01 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6313461364 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-DEPLOY-APPROVAL-02 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6313944252, 6314059221 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-DEPLOY-GATE-FINAL-01 | IN_FORCE | GitHub comment(s) present in audit snapshot: 6314826174 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-DEPLOY-UNBLOCK-FINAL | IN_FORCE | GitHub comment(s) present in audit snapshot: 6316028694, 6316562293 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-DEPLOY-PR180-FINAL-FIX | IN_FORCE | GitHub comment(s) present in audit snapshot: 6318631568 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-GATE-S1S2-FIX | PARTIALLY_SUPERSEDED | GitHub comment(s) present in audit snapshot: 6321186934, 6321275419, 6321726326 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-GATE-PR181-HARDENING | PARTIALLY_SUPERSEDED | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-HIST-01A-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-HIST-01A-02 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-AGENTS-INTERCHANGEABLE-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-GITHUB-RECON-IMPLEMENTATION-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-OWNER-PR181-CONTROLLED-MERGE | COMPLETED | GitHub comment(s) present in audit snapshot: 6325053841 — wording NOT re-compared line by line (agent transcription stays secondary) |
| MP-PR183-HARDENING-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-PR183-FINAL-HARDENING-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-VPS-FUNCTIONAL-RECOVERY-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-GROK-GLOBAL-TAKEOVER-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
| MP-GROK-AUTONOMOUS-EXECUTION-01 | IN_FORCE | original only in owner chat session (Claude Code / Grok chat) — BLOCKED_SOURCE_MISSING |
