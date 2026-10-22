# Ratifica decisioni owner DEC-001…DEC-014 (MP-OWNER-DECISIONS-RATIFICATION-14-2026-10-22)

Fonte: mandato owner t121u (22/10/2026) e rettifica owner t122u (DEC-004-R1). Registro canonico: [`owner-decisions.json`](owner-decisions.json).
Review di questa PR: **self-review dell'agente autore, NON indipendente** (DEC-004-R1). Nessuna certificazione dichiarata.

> **Fonti.** DEC-001…DEC-014: testo verbatim t121u (DEC-001/002 tradotti nel registro; originale italiano conservato in evidenza). DEC-004-R1: rettifica owner t122u. Il baseline `MP-GLOBAL-AUDIT-2026-10-22` (D-decisions.md, B-rtm.md, E-roadmap.md, MP-GLOBAL-AUDIT-REPORT.md) **non è stato trovato in nessuna fonte accessibile** (branch del repository, box agenti, Google Drive, issue GitHub): i 47 requisiti aggiuntivi e il confronto delle 54/73 trascrizioni con gli originali sono **BLOCKED_SOURCE_MISSING**. t107u/t108u/t109u/t114u: registrati da sintesi della conversazione (**summary source, not verbatim**), voce `AUDIT-SOURCES-2026-10-22`.

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
| DEC-012 Sblocco deploy | A | IN_FORCE (cl. 1 e 5 → R1) | #179 #180 #181 | — | IN PROGRESS (S4, approvazione umana run) | NOT VERIFIED |
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
| deploy-approval.md, gate S1–S4 (#180 #181) | sequenza gate | DEC-012 (run obsoleto non approvato automaticamente; solo SHA approvato) | coerente; dipendenza A7 rimossa |
| #104 piano 82 PR, #97 roadmap | numeri piano storici | §6: ~87 PR stimate, non definitive | storico superato per i numeri |

Nessun conflitto noto resta non classificato rispetto ai testi disponibili. I conflitti dipendenti dal baseline audit non disponibile restano BLOCKED_SOURCE_MISSING.

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
- **Bloccato:** 47 requisiti aggiuntivi e confronto 54/73 trascrizioni (BLOCKED_SOURCE_MISSING).

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
