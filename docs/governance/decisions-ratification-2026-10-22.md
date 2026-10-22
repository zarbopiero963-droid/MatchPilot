# Ratifica decisioni owner DEC-001…DEC-014 (MP-OWNER-DECISIONS-RATIFICATION-14-2026-10-22)

Fonte: mandato owner t121u (22/10/2026) e rettifica owner t122u (DEC-004-R1). Registro canonico: [`owner-decisions.json`](owner-decisions.json).
Review di questa PR: **self-review dell'agente autore, NON indipendente** (DEC-004-R1). Nessuna certificazione dichiarata.

> **Limite dichiarato.** La copia del mandato t121u disponibile all'agente che registra era troncata dopo il testo di DEC-003. Il baseline `MP-GLOBAL-AUDIT-2026-10-22` (D-decisions.md, B-rtm.md, E-roadmap.md, MP-GLOBAL-AUDIT-REPORT.md) non è presente nel repository, sul box o su Drive. Per questo DEC-004 (originale) e DEC-005…DEC-014 sono registrate come **approvate nel merito, testo PENDING_VERBATIM**: nessun testo è stato inventato. Serve il testo originale per completarle in una PR di follow-up.

## A. Registro

| ID | Scelta | Stato registro | Issue | Sostituisce | Implementazione | Certificazione |
|---|---|---|---|---|---|---|
| DEC-001 STOP/ADVISORY_ONLY | A | IN_FORCE (verbatim) | #96 #99 #102 #97 | OWN-OPEN-STOP-ADVISORY → SUPERSEDED | NOT IMPLEMENTED | NOT VERIFIED |
| DEC-002 Correzioni esiti/PIT | A1 | IN_FORCE (verbatim) | #12 #20 #24 #34 #178 | — (affina D1-D9.D4, che resta IN_FORCE) | PARTIAL (#178 aperta, fixture sintetiche) | NOT VERIFIED |
| DEC-003 Perimetro FPT/TC | C | IN_FORCE (verbatim parziale) | #3 #12 #20 #182 | OWN-2026-10-06-SCOPE → PARTIALLY_SUPERSEDED | PARTIAL (collector FPT attivo; etichette provenienza non verificate) | NOT VERIFIED; feed FPT fermo dal 20/09 lato provider |
| DEC-004 (originale) | — | SUPERSEDED da DEC-004-R1 | tutte le PR | — | n/a | n/a |
| DEC-004-R1 (t122u) | rettifica | IN_FORCE | tutte le PR | DEC-004; D1-D9.D2, AUTOMERGE-01, MASTER-GOVERNANCE → PARTIALLY_SUPERSEDED (solo indipendenza review) | testo governance aggiornato in questa PR | NOT VERIFIED |
| DEC-005…DEC-014 | PENDING_VERBATIM | IN_FORCE (merito) | da t121u | da determinare col testo | NOT VERIFIED | NOT VERIFIED |
| DEC-008 | PENDING_VERBATIM | IN_FORCE (merito) | — | — | rimozione segnali simulati in corso (altro worker, t120u §3) | NOT VERIFIED |

Le trascrizioni t107u, t108u, t109u, t114u e il confronto delle 54/73 decisioni "transcribed by the agent" con gli originali **non sono stati eseguiti**: gli originali non erano leggibili dall'agente (BLOCKED, serve accesso alla trascrizione della chat owner). t108u e t114u risultano citati solo in commit/commenti (#189, #12, #97, #179), non nel registro.

## B. Conflitti risolti (testo precedente → vigente)

| Fonte | Testo precedente | Vigente |
|---|---|---|
| owner-decisions.json OWN-OPEN-STOP-ADVISORY | "OPEN: quali scritture #99 restano permesse in ADVISORY_ONLY" | DEC-001: nessuna nuova esposizione; chiusure/hedge/cashout solo se riducono l'esposizione; settlement e ledger consentiti |
| OWN-2026-10-06-SCOPE (#3, #20) | "perimetro = intersezione VERIFIED FPT∩TC" | DEC-003: FPT∩TC solo per la certificazione congiunta; dati solo-FPT consentiti con provenienza |
| D1-D9.D2, AUTOMERGE-01, MASTER-GOVERNANCE, AGENTS.md §4, README | "review indipendente APPROVED" obbligatoria | DEC-004-R1: self-review dell'autore sufficiente, etichettata; deploy con approvazione umana GitHub |
| docs/pit-policy.md | nessuna regola sulle correzioni post-FINAL | DEC-002 aggiunta in coda |
| Roadmap: P1/A7 (identità GitHub App dell'agente), review indipendente retrospettiva delle PR già unite | bloccanti | RIMOSSI come blocchi (DEC-004-R1); restano solo idee facoltative |

Non classificati per mancanza del testo: conflitti di DEC-005…DEC-014 con #12, #34, #96, #97, #99, #102, #104, #179, #182 e la documentazione dei gate di deploy. I gate di deploy (S1–S4, approvazione umana `vps-production`) **non** sono toccati da DEC-004-R1.

## C. Modifiche di codice necessarie (priorità, dipendenze)

1. P0 — DEC-008: rimozione `src/signals/simulated.mjs`, `src/jobs/sim-signals.mjs`, route/UI/test collegati (altro worker; dopo il deploy).
2. P1 — Tooling governance: verificare che i controlli che richiedono un verdetto "independent" (`tools/governance/*`, CI gate) accettino una self-review etichettata, senza indebolire gate CI e deploy (dipende da DEC-004-R1).
3. P1 — DEC-001: macchina di stato STOP/ADVISORY_ONLY in #96/#99 con test RED/GREEN (blocco aperture, riduzione esposizione, settlement idempotente una sola volta). Dipende dal ledger #99.
4. P1 — DEC-002: versioning esiti FINAL (versione, provenienza, timestamp correzione) e flag nel report backtest; dipende da #178/HIST-01b.
5. P2 — DEC-003: etichette provenienza/copertura FPT-only vs FPT∩TC in API/UI; vietare il marchio "congiunto certificato" su dati solo FPT.
6. Da DEC-005…DEC-014: da determinare quando il testo è registrato.

## D. Roadmap esecutiva (baseline audit non definitiva: 39 issue, 139+47 requisiti, ~87 PR stimate)

- **Completato:** VPS + PG18 operativo, collector FPT attivo, Telegram, restore isolato PASS, TotalCorner spento (#186), S3 installato.
- **Da correggere:** segnali simulati (DEC-008); testi governance sull'indipendenza review (questa PR, parziale).
- **Da certificare:** deploy 39fe08e (S4 bloccante, approvazione owner), DR su macchina diversa, copia offsite automatica.
- **Non implementato:** DEC-001 (#96/#99), DEC-002 versioning esiti, Copilot #102, Strategy Lab #34 oltre HIST-01a.
- **Dipendenze esterne:** feed FutPythonTrader fermo dal 20/09 (supporto provider/abbonamento).
- **Fuori scope:** denaro reale, sport diversi dal calcio, Render/Neon runtime, TotalCorner attivo.
- **Operativo VPS/DR/deploy:** guard bloccante dopo primo ALLOW, backup Drive 05:15, runbook grant post-restore.
- **Bloccato:** 47 requisiti aggiuntivi e matrice B-rtm (baseline audit non disponibile); DEC-005…014 testo.

## E. Decisioni residue

- Nessuna nuova ambiguità sostanziale per DEC-001…003 e DEC-004-R1.
- Necessario solo un dato, non una decisione: il testo originale di t121u (DEC-003 coda, DEC-004…DEC-014) e dei file del baseline audit.
- Tecniche delegabili: forma dei campi di versioning (DEC-002), nomi degli stati STOP (DEC-001).

## F. Piano PR e certificazione

1. Questa PR (governance, solo documenti/registro) — aperta, merge dopo la conclusione del deploy owner.
2. PR DEC-008 removal (altro worker) → nuova release → approvazione umana deploy.
3. PR follow-up registro: testo verbatim DEC-005…014 e coda DEC-003 + riconciliazione issue residua.
4. Una PR implementativa alla volta: tooling self-review → DEC-001 → DEC-002 → DEC-003 etichette.
Ogni PR: RED/GREEN, regressione, self-review etichettata, CI verde, merge gate; merge ≠ deploy ≠ certificazione.
