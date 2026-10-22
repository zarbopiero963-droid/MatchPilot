> **Nota di archiviazione (21/10/2026, MP-GITHUB-RECON-IMPLEMENTATION-01).** Questo è il rapporto in sola lettura R1–R7, archiviato senza modifiche al testo. La riconciliazione che lo applica è in [`../reconciliation-2026-10-21.md`](../reconciliation-2026-10-21.md).
>
> **Rettifica owner successiva** (`MP-OWNER-AGENTS-INTERCHANGEABLE-01`): la ripartizione "Claude possiede il repository, Grok la VPS" (R5, R6, punto 11 di §R7) **non è un vincolo**. Qualunque agente può svolgere qualunque attività autorizzata. Le autorizzazioni dipendono da mandato, attività, risorsa, lease e GO owner, mai dal nome dell'agente.

# MP-GLOBAL-RECON-HANDOFF-01: riconciliazione globale e handoff multi-agente

| Voce | Valore |
|---|---|
| Data | 21/10/2026, circa 20:30 UTC |
| Modalità | sola lettura: nessun commit, push, merge, scrittura GitHub, deploy o accesso alla VPS |
| Agente | Claude Code (sessione `session_01YSsco5dhGuxe1dM8ET2yyd`) |
| Baseline | `main` = `170305418bd4fbbdbf4f3b7a4ed0ac5fcdc407c4` (verificato via API e `git fetch`) |

**Fonti lette:**
- API GitHub: 39 issue, 143 PR, 115 branch, workflow e run, ruleset;
- clone fresco di `main`;
- worktree e branch locali di questo container;
- elenco delle sessioni Claude;
- strumenti Render in sola lettura (`list_services`, `list_deploys`, `list_events`).

**Accessi mancanti:**
- VPS, Neon e ambiente di Grok: nessun accesso. Tutto ciò che li riguarda viene da rapporti pubblicati su GitHub;
- environment GitHub: gli endpoint `/environments` sono bloccati dal proxy di questa sessione.

**Etichette usate**

| Etichetta | Significato |
|---|---|
| VERIFIED | Verificato ora da Claude con API, git o test |
| DECLARED-GROK | Affermato in un rapporto di Grok su GitHub |
| DECLARED-CLAUDE | Affermato in un rapporto Claude precedente e non riverificato ora |
| DECLARED | Affermato in issue o registro, autore non distinguibile |
| NOT VERIFIED | Nessuna prova accessibile |
| BLOCKED | Bloccato da una dipendenza |
| SUPERSEDED | Superato da una decisione o un lavoro successivo |
| COMPLETED | Concluso con prove |

**Avvertenza strutturale (VERIFIED).** Su GitHub ogni commento, PR e commit di agente è pubblicato con l'account dell'owner `zarbopiero963-droid`. Vale per Claude e per Grok, che usa la stessa identità. L'autore di un commento quindi non distingue owner, Claude e Grok: l'attribuzione si deduce solo dal testo, per esempio "rapporto Grok t94u" o il footer Claude Code.

---

## R1. Rapporto di riconciliazione globale

### R1.1 Baseline post-merge #181 (verifica dell'addendum)

| Punto dichiarato | Esito | Evidenza |
|---|---|---|
| #181 mergiata con squash, `main` = `1703054…` | **VERIFIED** | API PR #181: `merged_at` 21/10 19:50Z; `git rev-parse origin/main` |
| CI di `main` verde | **VERIFIED** | run CI 39665149622: success su CI gate, Fast checks, PostgreSQL, Browser QA, Exploratory QA e Classify; UI checks skipped |
| Piano S3/S4 su #179, commento 6325365254 | **VERIFIED** (esiste) | API comments |
| Sintesi su #97, commento 6325365620 | **VERIFIED** (esiste) | API comments |
| S3/S4 non eseguiti, nessuna certificazione runtime | **VERIFIED** per quanto osservabile | nessun rapporto di installazione dopo il merge; run di deploy fermi |
| Run 39635669968 da rifiutare (azione owner) | **VERIFIED** | `waiting` su `e127c26` (obsoleto) |
| Run 39665149747 da non approvare prima delle prove | **VERIFIED** | `pending` senza job: in coda nel gruppo di concorrenza `deploy-vps` dietro 39635669968 |
| F1, F2, B13, B8, NB-E, NB-F aperti | **DECLARED** (VPS: NOT VERIFIED) | #179 6320706638, 6321726326, 6325365254 |
| Registro governance da aggiornare | **VERIFIED** | registro rev 110: DEPLOY-GATE-S1S2-01 in REVIEW con `pr_open: true`, lease attivo fino al 22/10 05:00Z, ma la PR #181 è mergiata |

**Merge, CI verde e Gate certificato sono tre stati distinti.** Il merge e la CI sono VERIFIED. Il Gate **non è certificato**: niente di quanto previsto da #181 è installato sulla VPS, e la sola barriera tecnica dichiarata resta il FREEZE (DECLARED-GROK e DECLARED-CLAUDE).

### R1.2 Stato del progetto in sintesi

**1. Prodotto.** Applicazione Node in sola lettura:
- API v1, ingestione FutPythonTrader (FPT), collector TotalCorner (TC), 29 migrazioni, login owner, Math Core (prima parte), policy PIT, web shell (Daily Board, Ricerca, Dati, Match Center pre-partita), tooling di governance e deploy gate.
- **Assenti su `main`:** backtest, paper trading, ledger/settlement, money management, Strategy Lab, decision engine, MCP di prodotto, script di backup (VERIFIED, inventario del codice).
- Il backtest HIST-01a esiste **solo sulla PR #178, aperta** (VERIFIED: `src/hist/*`, `src/math/money.mjs` sul branch `ccr-e45875c0-5r0fnf`).

**2. Requisiti.** Inventario Gate A del prodotto (`docs/governance/mp-pr-00/requirements.json`, PROVISIONAL, denominatore non ratificato):

| Esito | Conteggio |
|---|---|
| PASS | 36 |
| FAIL | 35 |
| NOT_VERIFIED | 61 |
| BLOCKED | 7 |
| **Totale** | **139** |

Il README dichiara Gate A del prodotto **NON PASS** e nessuna componente GLOBAL HARD CERTIFIED (VERIFIED).

**3. Test.**

| Esecuzione | Commit | Totale | Pass | Fail | Skipped | Note |
|---|---|---|---|---|---|---|
| Suite completa, Claude, PostgreSQL 16 locale | `f5d6dfc` | 416 | 415 | 0 | 1 | stesso albero di `1703054`; lo skipped richiede PostgreSQL 17 e non è PASS |
| Agente di inventario, senza PostgreSQL | `main` | 416 | 357 | 0 | 59 | |
| CI su `main` | `1703054` | — | — | — | — | PostgreSQL integration suite verde |

**4. Esercizio.**
- Render: `matchpilot-test` e `betsapi-trial-collector` **sospesi** dal 09/10 (VERIFIED).
- Neon: endpoint RW sospeso il 09/10 (DECLARED) e riattivato per l'export del 20/10. Lo stato attuale è **NOT VERIFIED**, con rischio di costi (autosuspend 0).
- VPS: release `3dd833f` in esercizio con **solo dati di prova** su PG17. I dati reali sono nello staging PG18 (DECLARED-GROK).
- **Nessun cutover**, collector fermi, Telegram non attivo (DECLARED-GROK).

**5. Migrazione VPS.**
- Staging, export, import, compatibilità e backup cifrato: PASS (DECLARED-GROK).
- Cutover, osservazione e dismissione: non autorizzati né eseguiti.
- **MIGRATION: NOT VERIFIED** (#179 6311571621).

### R1.3 Componenti

| Funzionalità | Implementazione | File principali | Ultimo commit | Test verificati | Dipendenze | Runtime | Residuo |
|---|---|---|---|---|---|---|---|
| HTTP server, `/healthz`, coverage | reale | `src/server.mjs`, `src/coverage-page.mjs` | 2cf3d4b | contratto API 11/11 | pg | NOT VERIFIED | — |
| API v1 in sola lettura | reale | `src/api/v1.mjs`, `src/providers/futpython/query.mjs` | 61361b8 | contratto 11/11; test su DB pass con PostgreSQL (Claude, f5d6dfc) e in CI | PostgreSQL | NOT VERIFIED | prova su dati reali |
| Match Center pre-partita (R-07a) | reale, auto-etichettato `PIT_NOT_VERIFIED` | `src/analysis/match-analysis.mjs` | 61361b8 | 2/4 senza DB, 4/4 con DB | Math Core, FPT | NOT VERIFIED | partite finite, replay, dati reali |
| Isolamento runtime (offline default, doppio opt-in produzione) | reale | `src/runtime-safety.mjs`, `src/background.mjs` | 5cb5da1 | pass | — | NOT VERIFIED | in `production` accetta qualsiasi `DATABASE_URL`, anche Neon |
| FPT: client, budget, ledger, sync, cron, riconciliazione, rielaborazione | reale | `src/providers/futpython/*`, `src/jobs/futpython-*` | 6f83e2e…56fe579 | unit pass; sync su DB pass con PostgreSQL | API FPT (chiave), PostgreSQL | NOT VERIFIED (fermo dal 09/10) | audit 412, policy PIT D4, ripresa sulla VPS (#182 P5) |
| Certificato FPT (20 gate) | reale | `src/futpython-certificate*.mjs` | e856c9c | 11/12 senza DB | PostgreSQL | storico: CERTIFIED WITH KNOWN LIMITATIONS solo per Render `6f83e2e` del 05/10 | non vale per la VPS |
| TC: discovery, mapping, prematch, historical, live | reale | `src/providers/totalcorner/*`, `src/jobs/totalcorner-*` | 60fdd92 | unit pass; su DB pass con PostgreSQL | token TC | **sospeso per #182** | H24 non certificato; **collector opt-out in produzione**: senza `*_ENABLED=false` partono se c'è il token |
| Migrazioni 001–029 e runner con lock e approvazione | reale | `migrations/`, `src/migrate.mjs` | b929e4a | pass con PostgreSQL 16; PostgreSQL 17 in CI | PostgreSQL | 29/29 applicate su PG17 e staging (DECLARED-GROK) | 029 "held" in produzione fino al piano di backup |
| Scheduler e collector in-process | reale | `src/background.mjs`, `src/jobs/*` | b929e4a | pass offline | — | NOT VERIFIED | nessun workflow schedulato |
| Telegram (solo uscita) | reale | `src/alerts.mjs`, `src/jobs/data-watchdog.mjs` | a09a1bd | 7/7 unit | bot token | non attivo (DECLARED-GROK) | test anti-duplicati, ripresa (#182 P5) |
| Web shell e UI | reale (parziale) | `src/web/*` | 61361b8 | gate e mockup pass; `web-e2e` richiede DB; Browser QA verde in CI | API | NOT VERIFIED | partite finite, Replay, Live Board **FAIL** (matrice) |
| Math Core (prima parte) | reale | `src/math/{decimal,core}.mjs` | 4ab36de | 11/11 con oracle | — | n/a | Trading Tools PARTIAL |
| Policy PIT | reale | `src/pit/*` | be53472 | 10/10; lettori su DB pass con PostgreSQL | PostgreSQL | NOT VERIFIED | — |
| Backtest HIST-01a | reale **solo su PR #178** | `src/hist/*`, `src/math/money.mjs` | 57aab63 | 16 test, CI verde sul head (20/10) | Math Core | n/a | PR in conflitto con `main` (`dirty`), merge = GO-5 |
| Paper, ledger, MM, strategie, decision engine, MCP | **assente** | — | — | — | — | — | roadmap #96 #99 #100 #34 #28 #98 |
| Login owner | reale | `src/auth/*`, migrazione 029 | f36cc46 | pass con DB | env scrypt | spento (serve `MATCHPILOT_AUTH=enforce`) | attivazione: azione owner |
| Deploy gate GitHub (`deploy-gate.mjs`, `deploy-vps.yml`) | reale | `scripts/deploy-gate.mjs`, workflow | 1703054 | 20/20 | environment `vps-production` | job `gate` SUCCESS su run reali (VERIFIED) | S4 |
| Hook del runner (`runner-job-guard.mjs`) | reale nel repo | `scripts/runner-job-guard.mjs` | 1703054 | 11/11 | VPS | **NON installato** | S3 |
| Verifier OIDC, `main-tip`, `approved` | reale | `scripts/deploy-authz.mjs` | 1703054 | 20/20 | `mp-deploy` v3.1 | sulla VPS c'è la versione **obsoleta** `a4123e44` (DECLARED-GROK) | S3 (NB-E) |
| `mp-deploy` v3 / v3.1 | **fuori dal repo** (repo infra della VPS) | `/usr/local/sbin/mp-deploy` | — | 39/39 in simulazione, 12 test reali (DECLARED-GROK) | — | v3 in FREEZE installata (DECLARED-GROK); v3.1 assente | S3 |
| Policy dei workflow e classificatore CI | reale | `scripts/workflow-policy.mjs`, `ci-classify.mjs` | 1703054 | pass | — | CI attiva (VERIFIED) | — |
| Backup, restore, DR | sulla VPS, fuori dal repo | repo infra `528cd79` (DECLARED-GROK) | — | restore PASS (DECLARED-GROK) | — | PARTIALLY VERIFIED (solo Grok) | PG18 cross-machine, watchdog indipendente, routine offsite dello staging |
| Verifica dell'archivio #40 | reale | `tools/archive/verify-archive.mjs` | — | 9/9 | parti su Drive | SHA delle parti non riverificati (BLOCKED, connettore Drive oltre 10 MB) | R-02 |

**Tre gradi da non confondere:**
- **Codice presente:** tutto ciò che è "reale" sopra.
- **Testato in modo deterministico:** tutte le righe con test pass.
- **Certificato:** solo il certificato FPT storico (Render, 05/10) e il Browser QA livello A per le capacità del gate. **Nessuna certificazione runtime sulla VPS.**

---

## R2. Recupero del lavoro degli agenti

### R2.1 Claude: worktree e branch di questo container (VERIFIED)

Nessuna modifica non committata in alcun worktree. Elenco dei branch:

| Branch | Tip | Pubblicato | Contenuto | Stato | Azione proposta |
|---|---|---|---|---|---|
| `ccr-e45875c0-5r0fnf` (PR #178 HIST-01a) | `57aab63` (remoto; il locale `d47c25c` è suo antenato) | sì | backtest offline deterministico | **APERTA**, `dirty` (conflitti su `owner-decisions.json` e `work-registry.json`), 0 review GitHub, Gate A/B PASS dichiarati sul 20/10. Le prove di mergeability sono superate | intoccabile; prima del GO-5 servono riallineamento, CI e Gate sul nuovo head |
| `gov-01-merge-policy` (GOV-01) | `b841a06` | sì, senza PR | classificatore del merge e merge-gate (MP-OWNER-AUTOMERGE-02/03), 13 file | **BLOCKED** "prepared, no PR". Registro rev 101, superato dalla 110 | decisione owner: riprendere (riallineare) o archiviare |
| `app-01-row-gaps` (APP-01) | `768bae9` | sì, senza PR | aggregazione dei row-gap (risolve #179 F3, pagina da 24 s) | **BLOCKED** "prepared, no PR". Registro rev 100 | candidata per #182 P4 (backend sulla VPS) |
| `deploy-approval-01-history-2af874f` | `5874736` | sì | storia pre-riscrittura di #180 | **SUPERSEDED** da #180 e #181 | archiviare |
| `wip-r07a-local` | `474f59d` | **no, solo locale** | WIP di R-07a | **SUPERSEDED**: `src/analysis/match-analysis.mjs` è su `main` con #176 | nessuna; va perso con il container |
| `b5-local-backup` | `15af348` | **no, solo locale** | fix B-5 alternativo, che rifiuta ogni CR | **SUPERSEDED** dal fix pubblicato in #180 | nessuna |
| `pr149`, `governance/mp-pr-00-atomic-requirements` | `21eee83` / `3c3bf20` | parziale | MP-PR-00 | **COMPLETED** (#149 mergiata) | nessuna |
| `claude/permanent-evidence-01` | `368aacd` | sì | EVIDENCE-01 | **COMPLETED** (#167 mergiata) | nessuna |
| `deploy-approval-01`, `deploy-gate-final-01` | `3b1604b` / `f5d6dfc` | sì | #180, #181 | **COMPLETED** (mergiate) | nessuna |
| `evidence/audits` | `17f78c8` | sì | archivio delle evidenze, storia separata, ruleset dedicato | intenzionale | nessuna |

### R2.2 Claude: sessioni (VERIFIED, elenco sessioni)

- **Sessioni di review in sola lettura:** 11 sessioni dal 20/10 al 21/10, tutte concluse con un commento su GitHub (#178, #180, #181).
- **Sessione bloccata:** "Revisione tecnica separata PR #178" del 20/10, in `REQUIRES_ACTION`. È ferma su una richiesta di permesso per inviare un messaggio: **è abbandonata**, ma la sua review è comunque pubblicata (#178).
- **Sessione principale** (questa, dal 18/10): MP-PR-00, R-01…R-08, QA, V-A…V-B4, R-07a, VPS-DEPLOY-01, HIST-01a, DEPLOY-APPROVAL-01 (#180), DEPLOY-GATE-S1S2-01 (#181), audit S1 e questa riconciliazione.
- **Ultimo lavoro concluso:** merge controllato di #181 e pubblicazione del piano S3/S4 (VERIFIED).
- **Altre sessioni dell'account:** riguardano progetti diversi (Pickfair, XTrader e altri), non MatchPilot.

### R2.3 Claude: lavori iniziati e non conclusi

| Lavoro | Stato | Evidenza |
|---|---|---|
| **Registro e checkpoint dopo il merge di #181** | non fatto | registro rev 110: DEPLOY-GATE-S1S2-01 in REVIEW, `pr_open: true`, lease. Manca il checkpoint MERGED |
| **Checkpoint MERGED di #180** | non fatto | `latest_checkpoint` di DEPLOY-APPROVAL-01 è in stato BLOCKED |
| **HIST-01a sul registro di `main`** | mancante | presente solo sul branch di #178 |
| **APP-01, GOV-01** | preparati, nessuna PR | branch e registri paralleli obsoleti |
| **`pr_registry` di `requirements.json`** | mai aggiornato | R-00 in REVIEW, R-01…R-18 PLANNED, ma 25 PR sono mergiate |
| **Incidente del rerun del 21/10** | verifica sulla VPS non pubblicata | #179 6313551158 |
| **Mandato "PR #181 CONTROLLED MERGE"** | non registrato | presente solo in sessione: assente dal registro e dai commenti di #181 |
| **Decisioni MP-GATE-S1S2-FIX e MP-GATE-PR181-HARDENING** | testo superato dai fatti | dicono "without merge", ma #181 è mergiata con un mandato successivo |

### R2.4 Grok (tutto DECLARED-GROK, nessun branch o commit di Grok nel repository)

| Rapporto (#179) | Contenuto | Stato |
|---|---|---|
| Preflight, inventario, piano (20/10) | inventario di VPS, Neon e Render | eseguito (dichiarato) |
| Staging PG18, export Neon, import, compatibilità PG17 (20/10, 6296081246…6296840088) | 73 tabelle, 2.570.281 righe, checksum identici | **eseguito** (dichiarato) |
| Backup cifrato, offsite, restore dello staging (20–21/10) | PASS manuale e automatico | eseguito; timer delle 01:30 e routine offsite **non create / NOT VERIFIED** |
| t92u (21/10): sicurezza env, allineamento script, contenuto DR | `infra@528cd79`, `SHA256SUMS.installed` | eseguito; `infra.bundle` da verificare il 22/10 |
| t93u: preflight OIDC | v3 isolata, 39/39 in simulazione | eseguito |
| t94u, GO-1: installazione v3 in FREEZE | `mp-deploy` `07dbed21`, `authz.conf` report+FREEZE, verifier `a4123e44` | **eseguito** (dichiarato); è l'ultimo intervento sulla VPS noto |
| t95u, GO-2: merge #180 | `main` `e127c26` | eseguito (merge VERIFIED) |
| Checkpoint in formato `mp-checkpoint` | — | **nessuno.** I rapporti di Grok sono commenti in prosa, senza marker o checkpoint nel repository. Il suo filesystem, le routine e lo stato del repository infra sono **NOT VERIFIED** |

**Annunciato da Grok e mai eseguito:**
- routine offsite dello staging e controllo DR settimanale ("non create");
- verifica sulla VPS dell'incidente del rerun;
- inventario delle credenziali (B13).

### R2.5 Duplicazioni e conflitti

- **Doppio fix B-5.** Il 21/10 un'altra sessione Claude ha pubblicato un fix B-5 mentre questa ne preparava un altro. Riconciliato senza force-push; il fix locale è stato scartato. Prova concreta che serve la regola "NO DUAL WRITER".
- **Seconda sessione con la chiave root sulla VPS** (DECLARED-GROK, #179 6311571621): rischio di doppio scrittore sulla VPS.
- **Registri paralleli.** I registri di APP-01, GOV-01 e #178 sono divergenti dalla rev 110 di `main`.
- **Branch condivisi.** `ccr-e45875c0-5r0fnf` è riusato da 27 PR. Causa `SHA_MISMATCH` permanenti su R-02 in `governance:status`.

---

## R3. Matrice issue / PR / roadmap

### R3.1 Issue chiave

| Issue | Ultimo stato (21/10) | Lavoro implementato | Chiudibile? |
|---|---|---|---|
| #3 Master | body fermo al 07/10 (cita ancora la PR #125, già mergiata). Rimanda a #182 (6325344914) | — | no |
| #12 FPT | READY TO CLOSE del 05/10 ritrattato il 07/10: restano audit 412 e PIT. #182: ripresa FPT sulla VPS dopo GO | codice FPT completo; certificato storico Render | **no** |
| #20 TC | READY TO CLOSE del 09/10 annullato da D9. #182: TC **sospeso**, nessuna chiusura | codice TC completo (PR 130–145) | **no** |
| #40 Archivio/FREEZE | "COMPLETED" dell'08/10 annullato da D9. R-02: SHA delle parti BLOCKED. #182: FREEZE immutabile | bundle `fb0744…`, verificatore 9/9 | **no** (manca la verifica di portabilità e hash) |
| #97 Roadmap | body fermo al 07/10 + D-1..D-7. **Non menziona VPS, #179, #182.** Fasi P0–P6 solo in un commento | — | n/a |
| #104 Catalogo 82 PR | catalogo storico. 82 **non** è il residuo (D8) | — | n/a |
| #149 | **è una PR** (MP-PR-00, mergiata) | — | — |
| #179 Migrazione | staging PASS (Grok); S1 non certificato; S3/S4 da fare | — | no |
| #182 VPS-only | decisione approvata, implementazione **non** autorizzata. 0 commenti. Non registrata nel registro | — | no |
| #23 Auth | R-04a/b/c mergiate (157–160) | parziale | no |
| #30 Analysis Hub | R-06a/b e R-07a (162, 163, 176) | parziale | no |
| #94 Trading Tools | Math Core (156); HIST-01a su #178 | parziale | no |
| #98 MCP | API v1 (153); MCP di prodotto assente | parziale | no |
| #150 Governance multi-agente | R-01 (151) | parziale | no |
| #144 Actions zero-cost | sospensione Render/Neon dichiarata certificata | probabile esaurimento | **da valutare dall'owner** (nessun READY TO CLOSE) |
| #87 INFRA-COST Railway | resa obsoleta da #182, mai marcata | — | candidata SUPERSEDED (decisione owner) |
| #132 ML Lab | "IDEA / NON APPROVATA" | — | decisione owner |
| #24 #25 #27 #28 #29 #31 #32 #34 #44 #45 #46 #91 #95 #96 #99 #100 #102 | aperte, nessun lavoro dal 06/10 tranne #34/#99 (HIST-01a su #178) | assente o parziale | no |

**Issue chiudibili oggi con prove complete: nessuna.** Candidate da valutare dall'owner: #144, ed eventualmente #87 e #132 come SUPERSEDED o NON APPROVATE.

### R3.2 PR

| Gruppo | Numero | Stato |
|---|---|---|
| Totale | 143 | 140 mergiate, 2 chiuse senza merge (#73, #80), 1 aperta (#178) |
| Mergiate senza certificazione completa | molte | tutte le R-xx: un merge non completa una card (D8). In particolare #177 (VPS-DEPLOY-01), #180, #181: gate sulla VPS **non installato e non certificato** |
| PR ancora necessarie (#182, #97) | da pianificare | Gate S3/S4 (lato VPS, non PR); riconciliazione governance (registro, checkpoint, #182 nel registro, `pr_registry`); APP-01 (F3); riallineamento #178; PR di #182 P3–P5 (backend VPS, FPT, Telegram, TC-off con test negativo) |

### R3.3 Conflitti tra decisioni

| Decisione precedente | Decisione successiva | Effetto |
|---|---|---|
| OWN-2026-10-06-SCOPE (TC feed core, perimetro FPT∩TC) | #182 (TC sospeso) | **perimetro dei nuovi dati FPT irrisolto** |
| AUDIT412 "dopo TC" | TC spento | trigger ambiguo |
| MP-OWNER-VPS-DEPLOY-01 ("collectors forbidden") | #182 (FPT ripreso dopo GO) | parzialmente superata, non annotata |
| D13 e `render.yaml` `autoDeploy: true` | #182 (Render escluso) | il file è ancora attivo: rischio se Render venisse riattivato |
| `.claude/settings.json` (pre-autorizza `mcp__Neon__run_sql`, anche in scrittura) | #182 (Neon spento e non scritto) | contraddizione nei permessi dell'harness |
| MP-GATE-S1S2-FIX / PR181-HARDENING ("without merge") | mandato di merge controllato (sessione) | testo da superare con una voce di registro |
| MP-OWNER-EXCLUDE-REAL-EXECUTION-01 | — | in vigore, ma assente dalla issue #45 |

### R3.4 Percorso critico per tornare operativi (da #182)

1. **P0/P1:** fatti (questa riconciliazione e il piano su #179).
2. **P2 Gate:** S3, poi S4.
3. **P3 PostgreSQL:** cutover dello staging PG18 con dati reali, o di PG17 con migrazione.
4. **P4 backend sulla VPS:** con APP-01 (F3) e F1/F2 dell'app.
5. **P5 FPT + Telegram:** con TC-off verificato da un test negativo.
6. **P6:** riconciliazione di #97 e #104.

---

## R4. Prontezza della migrazione VPS

| Area | Stato | Etichetta |
|---|---|---|
| VPS | Ubuntu 24.04 (dedotto), 3,9 GB di RAM al limite, 32 GB di disco liberi (43%), CPU NOT VERIFIED | DECLARED-GROK |
| App | `matchpilot-app` `3dd833f`, PID 44981, `/healthz` 200 (21/10 18:40 Roma); porta 3000 solo su tailscale | DECLARED-GROK |
| PostgreSQL | PG17 :5432 (dati **di prova**); PG17 `restoretest` :5433 spento; **PG18 staging :5434 con dati Neon reali** (2.826 MB, 75 tabelle, 2.570.282 righe) | DECLARED-GROK |
| Export e import Neon | consistente (REPEATABLE READ), checksum identici, dump grezzo distrutto con shred dopo i gate | DECLARED-GROK |
| Dati solo su Neon | nessuno per conteggi e checksum; scritture successive al 20/10 NOT VERIFIED | DECLARED-GROK / NOT VERIFIED |
| Backup | PG17 notturno cifrato (age) con offsite su Drive VERIFIED da Grok; staging PG18: manuale e automatico PASS | DECLARED-GROK |
| Lacune dei backup | timer delle 01:30 non ancora eseguito; routine offsite non create; nessun watchdog indipendente; backup on-demand in chiaro in locale; `config.tgz` con `.env` in chiaro | DECLARED-GROK |
| DR cross-machine | PASS solo su PG17 con dati di prova. **PG18 con dati reali: NOT VERIFIED** | DECLARED-GROK |
| FREEZE #40 | bundle SHA `fb07443646a7…ac456`, 498.614.829 B, su Drive e sulla VPS. SHA per parte **BLOCKED** | DECLARED / BLOCKED |
| Telegram | non attivo; 57 avvisi consegnati e 4 aperti, da non reinviare | DECLARED-GROK |
| FPT | fermo dal 09/10; chiave e gratuità NOT VERIFIED | DECLARED-GROK |
| Runner e Gate | v3 in FREEZE; verifier obsoleto; guard e gate non installati; F1 e F2 aperti | DECLARED-GROK |
| Sicurezza VPS | `mpadmin` NOPASSWD ALL; seconda sessione con la chiave root; credenziali GitHub sulla VPS NOT VERIFIED (B13) | DECLARED-GROK |
| Render | `matchpilot-test` sospeso dal 09/10 con **auto-deploy commit su `main`**; collector sospeso; nessun Postgres Render | **VERIFIED** |
| Neon | stato attuale NOT VERIFIED. Possibile compute rimasto acceso dopo il 20/10 (autosuspend 0) | NOT VERIFIED |
| Dipendenze residue | `render.yaml`; testi `RENDER_*` nel certificato FPT; `runtime-safety` accetta qualsiasi DB in produzione; 4 workflow `provider-trial-*` ancora registrati su GitHub (non su `main`) | VERIFIED |

**Verdetto R4: MIGRATION STAGING PASS (dichiarato), MIGRATION NOT VERIFIED.**
- Il cutover non è autorizzato.
- I dati in esercizio sulla VPS sono di prova.
- Il gate di deploy della VPS non è certificato.

---

## R5. Protocollo di handoff multi-agente (Claude ↔ Grok)

### R5.1 Cosa esiste già (VERIFIED)

- **Schema `mp-checkpoint-v2`:** append-only (CI `check-append-only`), catena `supersedes`, stati PLANNED…COMPLETED, marker `<!-- mp-checkpoint:<id> -->` nei commenti.
- **Registro `work-registry.json`:** lease di 120 minuti con revisione CAS, un solo slot di implementazione.
- **Comandi `governance:status` e `governance:resume`.**
- **Procedura** in `docs/governance/HANDOFF.md`.

**Limiti emersi:**
- `pr_open` non viene confrontato con GitHub (I-1, I-2);
- Grok non produce checkpoint;
- mancano base commit, stato del worktree, autorizzazioni valide, comandi eseguiti, artifact e costi;
- il lavoro sulla VPS non ha checkpoint nel repository;
- branch riusati e registri paralleli.

### R5.2 Checkpoint standard (estensione proposta `mp-checkpoint-v3`, retrocompatibile)

Campi obbligatori:

| Campo | Contenuto |
|---|---|
| `mandate` | id del mandato owner, con link al testo registrato in `owner-decisions.json` o al commento |
| `agent` | `{id: "agent-a-claude-code" \| "agent-g-grok" \| …, role, session}` |
| `timestamp_utc`, `repository` | — |
| `branch`, `head_sha`, `base_sha`, `tree_sha` | — |
| `worktree` | `clean` oppure l'elenco dei file modificati con hash |
| `prs`, `issues` | — |
| `objective`, `done[]`, `in_progress[]`, `not_started[]` | — |
| `tests[]` | `{command, result, environment, commit, skipped}`. Gli skipped sono elencati, mai contati come PASS |
| `findings[]` | `{id, severity, status, summary}` |
| `owner_decisions[]`, `authorizations[]` | per le autorizzazioni: `{go, scope, expires_or_consumed}` |
| `commands[]` | solo comandi con effetti esterni |
| `files_changed[]`, `artifacts[]` | gli artifact con path e SHA-256 |
| `next_atomic_action`, `stop_conditions[]` | — |
| `costs` | stimati o sostenuti |
| `vps` | solo per lavori sulla VPS: host, componenti toccati, hash prima e dopo, percorso del rollback, riferimento al commit del repository infra |

**Persistenza:**
- **Lavoro sul repository:** file in `docs/governance/checkpoints/` sul branch della PR, più un commento con marker sulla issue o PR.
- **Lavoro sulla VPS (Grok):** commento con marker su #179 contenente il JSON, più un commit nel repository infra della VPS. L'hash del commit infra va riportato nel commento.

GitHub resta la fonte canonica.

### R5.3 Procedure

**HANDOFF OUT (agente uscente):**
1. Ferma ogni processo in corso.
2. Esegue push di tutti i commit. Nessun lavoro solo locale: per esempio `wip-r07a-local` e `b5-local-backup` sarebbero andati persi.
3. Scrive un checkpoint `HANDOFF READY` con `next_atomic_action` e `resume_conditions`.
4. Pubblica il commento con il marker.
5. Rilascia il lease.
6. Cancella i propri promemoria programmati o li consegna.
7. Dichiara le autorizzazioni consumate.

**HANDOFF IN (agente entrante), in ordine:**
1. `git fetch`; verifica che `head_sha`, `base_sha` e `tree_sha` del checkpoint corrispondano al remoto.
2. Verifica su GitHub lo stato reale delle PR e dei run (non `pr_open`).
3. Controlla che il worktree sia pulito.
4. Rilegge le decisioni owner e le autorizzazioni. Un GO già consumato non si riusa.
5. Riesegue i test elencati sul commit indicato; gli esiti devono coincidere.
6. Acquisisce il lease, con CAS sulla revisione.
7. Pubblica un commento "HANDOFF IN" con l'esito delle verifiche.

Solo dopo questi passi riprende. **L'handoff è completo solo quando l'entrante ha pubblicato un HANDOFF IN con tutte le verifiche PASS.**

**STALE CHECKPOINT.** Il checkpoint è obsoleto, e non si riprende automaticamente, se:
- un SHA è cambiato;
- una PR ha cambiato stato;
- c'è un nuovo commento owner successivo;
- è scaduto un lease.

L'entrante pubblica prima una riconciliazione con il diff, poi un nuovo checkpoint che supera il precedente.

**NO DUAL WRITER:**
- un solo agente scrive su un dato branch, PR, worktree o host VPS, quello che tiene il lease;
- branch per agente e per task (`claude/<task>`, `grok/<task>`), mai riusati;
- sulla VPS una sola sessione root operativa per volta, con un lock dichiarato su #179;
- regola nel protocollo: **nessun agente avvia lavoro se un lease attivo di un altro agente copre la stessa risorsa.**

**FAIL-CLOSED.** Si ferma, pubblica un checkpoint BLOCKED e chiede una decisione all'owner quando:
- lo stato non è ricostruibile (SHA mancanti, evidenze irraggiungibili, divergenze non spiegate);
- un'autorizzazione è ambigua.

### R5.4 Debolezze da correggere prima del primo handoff reale

1. Registro di `main` riallineato: I-1…I-5.
2. `governance:status` che legga lo stato delle PR da GitHub.
3. Identità degli agenti: Claude e Grok pubblicano come owner, quindi l'attribuzione si basa solo sul campo `agent` del checkpoint e sul footer.
4. Grok deve adottare il marker e lo schema.

**Questo protocollo è progettato ma non attivo:** non è ancora nel repository né adottato da Grok. **Handoff non completato.**

---

## R6. Piano delle prossime attività (ordinate per dipendenza, rischio e valore)

### Fase A: governance

| # | Attività | Chi | Dipende da | GO | Accettazione | Costo |
|---|---|---|---|---|---|---|
| A1 | **Rifiutare il run 39635669968** (libera il gruppo di concorrenza; non distribuisce nulla) | owner | — | azione owner | run `completed/failure`; 39665149747 passa a `waiting` | 0 |
| A2 | Controllare il compute Neon e lo stato di fatturazione (sola lettura, console owner) | owner | — | — | endpoint sospeso | 0 |
| A3 | **PR di riconciliazione governance** (solo documenti e registro): DEPLOY-GATE-S1S2-01 e DEPLOY-APPROVAL-01 a MERGED con checkpoint; registrazione di #182, del mandato di merge controllato e dei GO-1/GO-2/DR/retention; nota su HIST-01a (#178); aggiornamento di `pr_registry`; decisione su `.claude/settings.json` (Neon), `render.yaml` e i 4 workflow trial | Claude | A1 non necessario | **GO owner** | CI verde, review separata, nessuna modifica funzionale | 0 |
| A4 | Protocollo di handoff v3 nel repository (schema, HANDOFF.md, `status` che legge GitHub) | Claude | A3 | GO owner | test di governance; prova di handoff simulata | 0 |

### Fase B: VPS

| # | Attività | Chi | Dipende da | GO | Accettazione | Costo |
|---|---|---|---|---|---|---|
| B1 | **S3** come da #179 6325365254, **senza duplicarlo**: installazione di mp-gate, pin NB-F, v3.1 con un solo verifier (NB-E), hook, integrità, test V. Primo checkpoint Grok in formato v3 | Grok | A1 consigliato | **GO-S3** | come nel piano | 0 |
| B2 | **S4** prove runtime R1–R8 | owner + Grok | B1 | **GO-S4** | come nel piano. **Solo allora il Gate è certificato** | 0 |
| B3 | Chiusura delle lacune DR: routine offsite dello staging, watchdog indipendente, restore PG18 su un'altra macchina, rotazione dei backup locali | Grok | — | GO | restore PG18 cross-machine PASS | 0 o costi da autorizzare se serve una seconda macchina |
| B4 | F1 (sudo `mpdeploy`), F2 (lock), `mpadmin`, credenziali (B13), sessione root unica | Grok + owner | B1 | GO | rapporto su #179 | 0 |
| B5 | Cutover PostgreSQL (P3): scelta PG18 staging o PG17 con migrazione; RAM 3,9 GB al limite | Grok | B2, B3 | GO cutover | conteggi e checksum; rollback provato | 0 o upgrade della VPS da autorizzare |

### Fase C: ritorno operativo

| # | Attività | Chi | Dipende da | GO | Accettazione |
|---|---|---|---|---|---|
| C1 | Backend sulla VPS con dati reali (P4): riprendere **APP-01** (F3) e F1/F2 dell'app, senza riscriverle | Claude (PR) + Grok (deploy) | B2, B5 | GO PR + approvazione deploy | health check, pagina sotto soglia |
| C2 | FPT (P5): contratti, chiave, gap storico, idempotenza, storage separato dal FREEZE | Claude + Grok | C1 | GO | sync idempotente, PIT |
| C3 | Telegram (P5): anti-duplicati sui 57+4 avvisi esistenti | Claude + Grok | C2 | GO | nessun duplicato |
| C4 | **TC OFF verificato**: `*_ENABLED=false` esplicito (oggi i collector sono opt-out) e test negativo | Claude | C1 | GO | test negativo PASS |
| C5 | Monitoring e continuità | Grok | C1 | GO | alert e watchdog |

### Fase D: sviluppo

| # | Attività | Dipende da | GO |
|---|---|---|---|
| D1 | **#178 HIST-01a**: riallineare a `main` (conflitti sul registro), poi CI, Gate e review sul nuovo head | A3 | GO-5 per il merge, dopo il Gate |
| D2 | GOV-01: riprendere o archiviare | A3 | decisione owner |
| D3 | Roadmap funzionale #97/#104 (ledger, MM, strategie, replay), una PR alla volta, archive-first | D1 | GO per PR |
| D4 | Frontend e dashboard (Replay, Live Board, partite finite) | D3 | GO |

**Prossima singola attività consigliata:**
- **A1** per l'owner;
- **A3** come primo lavoro di un agente: riconciliazione governance, solo documenti. Libera lo slot occupato in modo errato e registra #182.
- Subito dopo, **B1** (S3) a Grok, con il piano già pubblicato.

### Alternanza Claude ↔ Grok

| Agente | Possiede | Esempi |
|---|---|---|
| Claude | repository: PR, test, review, documenti | A3, A4, C1–C4 lato codice, D |
| Grok | VPS: installazioni, prove runtime, backup | B1–B5, deploy di C |

- Passaggio di consegne con HANDOFF OUT/IN (R5) a ogni cambio di proprietario, su #179 per la VPS e sulla PR per il codice.
- **Mai due agenti attivi sulla stessa risorsa.**
- Ciclo tipico: Claude PR → merge (GO) → Grok S3/deploy (GO) → Claude review dell'evidenza → owner.

---

## R7. Registro delle decisioni owner

### R7.1 Decisioni vigenti rilevanti (registro su `main`: 54 voci, 49 IN_FORCE)

- **Gerarchia e governance:** D1–D11, MASTER-GOVERNANCE, AUTOMERGE-01, CERT-ISSUE-CLOSURE-01, D8 (#97 roadmap, #104 storico), D9 (READY TO CLOSE non autorizza la chiusura).
- **Prodotto:**
  - ARCHIVE-FIRST-01;
  - PRODUCT-QUALITY-DATA-01;
  - EXCLUDE-REAL-EXECUTION-01 (#45 fuori perimetro);
  - VISUAL-BASELINE-D1-D7;
  - OWN-2026-10-06-SCOPE/AUDIT412, **in conflitto con #182 (vedi R3.3)**.
- **Infrastruttura e deploy:**
  - CI-ZERO-COST;
  - VPS-DEPLOY-01;
  - DEPLOY-APPROVAL-01/02, GATE-FINAL-01, UNBLOCK-FINAL, PR180-FINAL-FIX;
  - GATE-S1S2-FIX;
  - **GATE-PR181-HARDENING, che rende la verifica di integrità vincolante per S3/S4.**
- **Aperta:** OWN-OPEN-STOP-ADVISORY (#96/#99).

### R7.2 Decisioni prese ma non registrate nel file (da registrare con A3)

- **#182 MP-VPS-ONLY-OPERATIONS-2026-10-21**, con il suo commento su #3 come riferimento canonico.
- Mandato "PR #181 CONTROLLED MERGE" (in sessione).
- GO-1 (#179 6320528334), GO-2 (#180 6321069450).
- DR e portabilità obbligatorie (6296081484).
- Retention dei backup (6311242687).
- GO backup/rerun (6311340969).
- Configurazione di `vps-production` (#97 6319055171).
- HIST-01b opzioni A (#97 6301851779, 6301856737).
- AUTOMERGE-02/03 (testo solo sul branch GOV-01, **non attive**).

**Formulazione da confermare.** Molte voci dal 18 al 21/10 citano "owner confirmation of wording pending": la formulazione non è confermata dall'owner.

### R7.3 Decisioni ancora necessarie (le sole indispensabili)

1. **GO-S3** a Grok (B1).
2. **GO per la PR di riconciliazione governance** (A3), che comprende:
   - la conferma delle voci R7.2;
   - lo stato di MP-GATE-S1S2-FIX e PR181-HARDENING dopo il merge;
   - le sorti di `render.yaml` (`autoDeploy`), del permesso `mcp__Neon__run_sql` in `.claude/settings.json` e dei 4 workflow trial registrati.
3. **Perimetro dei dati FPT senza TC.** OWN-2026-10-06-SCOPE (FPT∩TC) e il trigger dell'audit 412 vanno chiariti ora che TC è spento.
4. **Destino di GOV-01 e APP-01:** riprendere o archiviare. Consiglio: APP-01 sì in C1, GOV-01 da valutare.
5. **Azioni owner, non decisioni:**
   - rifiuto del run 39635669968;
   - controllo del compute Neon;
   - eventuale valutazione di #144, #87, #132 (SUPERSEDED o NON APPROVATA).

---

## Verdetto finale

1. **Stato reale di MatchPilot.**
   - Applicazione in sola lettura con un nucleo dati FPT/TC maturo e testato in modo deterministico.
   - Dominio di trading (backtest, ledger, MM, strategie) assente su `main`; HIST-01a è solo su #178.
   - In esercizio sulla VPS c'è la release `3dd833f` con dati di prova. Render e Neon sono fermi.
   - Il deploy gate è mergiato ma **non installato e non certificato**: la sola barriera tecnica è il FREEZE.
2. **Percentuale di completamento.** Solo quella dell'inventario Gate A, PROVISIONAL: **36 requisiti PASS su 139 (circa 26%)**, con 61 NOT_VERIFIED, 35 FAIL e 7 BLOCKED. Non è un avanzamento di prodotto certificato.
3. **Ultima attività effettivamente conclusa.** Merge controllato di #181 (`1703054`), CI di `main` verde, piano S3/S4 pubblicato (VERIFIED).
4. **Ultima attività iniziata e non terminata.**
   - Riconciliazione post-merge del registro (DEPLOY-GATE-S1S2-01 ancora in REVIEW con lease).
   - Lato VPS: S3, non iniziato. L'ultimo intervento dichiarato sulla VPS è GO-1 (v3 in FREEZE).
5. **Lavoro Claude recuperabile:**
   - #178 (da riallineare);
   - APP-01 (pronta per C1);
   - GOV-01 (da decidere);
   - checkpoint e registro post-merge;
   - `pr_registry`.

   I branch solo locali (`wip-r07a-local`, `b5-local-backup`) sono superati.
6. **Lavoro Grok recuperabile:**
   - staging PG18 con dati reali e backup (base per il cutover);
   - v3 in FREEZE;
   - repository infra `528cd79`.

   Da completare: routine offsite e DR, `infra.bundle`, verifica dell'incidente del rerun, B13, F1, F2. Nessun checkpoint Grok nel repository.
7. **Issue chiudibili.** Nessuna con prove complete. Da valutare dall'owner: #144, ed eventualmente #87 e #132.
8. **Blocker critici:**
   - Gate VPS non installato e non certificato (S3/S4);
   - run obsoleto che blocca la coda;
   - registro di `main` incoerente (slot occupato);
   - #178 `dirty`;
   - DR PG18 cross-machine NOT VERIFIED;
   - compute Neon NOT VERIFIED;
   - `render.yaml` con auto-deploy;
   - TC opt-out in produzione;
   - perimetro FPT senza TC non deciso.
9. **Migrazione VPS.** STAGING PASS (dichiarato), **MIGRATION NOT VERIFIED**, cutover non autorizzato.
10. **Prossima singola attività consigliata.** Owner: rifiutare il run 39635669968. Primo agente: **A3**, PR di riconciliazione governance (solo documenti, con GO). Poi **GO-S3 a Grok** sul piano già pubblicato.
11. **Alternanza Claude ↔ Grok.** Claude possiede il repository, Grok la VPS. HANDOFF OUT/IN con checkpoint v3 su #179 o sulla PR. Branch per agente, lease, una sola sessione root, fail-closed su stato non ricostruibile (R5).
12. **Decisioni owner indispensabili:**
    - GO-S3;
    - GO per A3, con la conferma delle decisioni non registrate e la sorte di `render.yaml`, del permesso Neon e dei workflow trial;
    - perimetro FPT senza TC e trigger dell'audit 412;
    - destino di GOV-01 e APP-01.

**Mi fermo qui.** Nessuna implementazione, modifica a GitHub o ripresa operativa.
