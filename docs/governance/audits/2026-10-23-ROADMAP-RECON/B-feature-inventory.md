# B — Inventario funzionalità MatchPilot su `main` 6407f42

- **Data:** 2026-10-23.
- **Modalità:** sola lettura. Nessun file del checkout modificato, nessun commit, nessuna scrittura su GitHub.
- **Dati strutturati:** `B-feature-inventory.json` (stessa cartella).
- **Baseline:** audit `2026-10-22-MP-GLOBAL-AUDIT` (main `39fe08e`), riverificato. Dopo l'audit sono state mergiate le PR #190–#217.

**Metodo**
- Lettura completa degli entrypoint: `src/server.mjs`, `src/worker.mjs`, `src/background.mjs`, `src/api/v1.mjs`.
- Grafo degli import di ogni modulo di dominio, cercando gli importatori fuori da `test/`.
- Elenco delle tabelle nelle migrazioni 001–029.
- Esecuzione di `node --test` su 9 suite pure: 76 test, 74 pass, 0 fail, 2 skip (manca un PostgreSQL usa e getta).
- PR chiuse lette dall'API GitHub. Run `deploy-vps` letti dall'API.
- Evidenze runtime: `runtime-state.json`, checkpoint `CP-20261023*`, commento #12 `6344142029`.

**Avvertenza:** tutte le prove sulla VPS sono **DICHIARATE** da agenti, perché da qui non c'è accesso alla VPS.

## 1. Delta rispetto all'audit del 22/10

| PR | Effetto su `main` |
|---|---|
| #190 (DEC-008) | Rimossi i segnali simulati: `src/signals/simulated.mjs`, `/api/v1/sim/signals`, `#/segnali`. Su `main` non ne resta traccia. |
| #198, #207, #208 | Ledger paper, Money Management e paper-trading: moduli **puri**, senza persistenza. |
| #209, #217 | `src/markets/rules.mjs` v2 e `src/markets/outcomes.mjs`: moduli puri. |
| #178 | `src/hist/*` e `tools/hist/backtest.mjs`: motore offline, solo su fixture. |
| #192–#195, #197, #199–#206, #210 | Auto-deploy, shutdown del worker, `infra/vps`, hardening FPT, backup/DR, alert. |
| #211–#216 | Strumenti di governance (#150). |

Effetti sulle migrazioni e sull'API:
- **Nessuna nuova migrazione:** l'ultima resta `029-owner-auth.sql`.
- **API v1:** ora 31 endpoint GET (verificato con `createEndpoints`), tutti in sola lettura.

## 2. Tabella degli stati

| Dominio | Funzionalità | Issue | Stato | Evidenza chiave |
|---|---|---|---|---|
| P0 | Deploy VPS automatico | #179/#182 | **RUNTIME VERIFIED** | Run `deploy-vps` 39947944189 (8f64c6b) success, con report mp-deploy `health=200 worker_restart=ok`; run 6407f42 in corso. Non certificato (#179 aperta). |
| P0 | PostgreSQL, migrazioni, guard D13 | DEC-011 | **RUNTIME VERIFIED** | 29 migrazioni su PG18 staging, 161.801 fatti, 0 violazioni di FK (dichiarato). App VPS in modalità `offline`, quindi lì il guard D13 non si applica. |
| P0 | Ingestion FutPythonTrader | #12 | **RUNTIME VERIFIED** | Worker, cron e reconciliation attivi (#12 c6344142029). Finding F-1: provider fermo al 20–21/09, `datasetsChanged=0`. "Fully operational" NOT VERIFIED. Il certificato del 05/10 è storico ed è stato ritrattato. |
| P0 | TotalCorner | #20 | **BLOCKED** | Codice collegato in `background.mjs`, ma spento: decisione owner #182/TC-OFF-01, nessun token. |
| P0 | Recovery e reconciliation FPT | #31 | **RUNTIME VERIFIED** | 106 gap rilevati, recovery con `rowsInserted=0` (dichiarato). RECOVERY-415 pendente (serve una migrazione). Metà TC ferma. |
| P0 | Archivio congelato #40 | #40 | **BLOCKED** | R-02: le 13 parti non sono materializzate; hold dell'owner. |
| P0 | Alert Telegram | #182 | **RUNTIME VERIFIED** | DATASET_ERRORS e RECON_GAPS consegnati il 22/10; un SYNC_STALE fallito. Solo alert operativi. |
| P0 | Watchdog, liveness, heartbeat | t131u | **RUNTIME VERIFIED** | Watchdog orario sulla VPS (dichiarato); timer liveness ogni 30 min; PR-210-RUNTIME pendente. |
| P0 | Backup notturno | #179 | **RUNTIME VERIFIED** | `20261023T033001` BACKUP_OK, `git_sha` 6ed4919. Copia off-site del PG18 non verificata. |
| P0 | DR / restore | #179 | **PARTIAL** | RESTORE-TEST mai eseguito. |
| P1 | Market rules core (8 mercati, linee n+0.5, adapter FPT/TC, versioni DEC-002) | #100 | **CODE COMPLETE** | `rules.resolve` è usato solo da `hist/engine` (CLI); `outcomes.mjs` non ha importatori fuori dai test. |
| P1 | VOID, postponed, dead-heat, linee asiatiche | #100 | **BLOCKED** | DEC-015: OWNER DECISION REQUIRED; MARKET-CORE-03 non iniziato. |
| P1 | Paper ledger (append-only, settlement versionato) | #99 | **CODE COMPLETE** | In memoria; lo importano solo `mm/*`, che nessun entrypoint importa. |
| P1 | Persistenza e API di ledger e posizioni | #99/#98 | **NOT STARTED** | Nessuna migrazione, tabella o endpoint. |
| P1 | Math core / trading tools | #94 | **PARTIAL** | Decimal, probabilità implicite, overround, fair odds, `settleMarket` BACK/LAY. Mancano Kelly, EV, hedge, cashout, dutching. |
| P1 | Money Management | #96 | **PARTIAL** | 4 modelli implementati su 16. Gli altri 12 sono BLOCKED da MM-RULES (formule dell'owner). Nessuna persistenza. |
| P1 | Paper trading | #96/#99 | **PARTIAL** | `proposePaperTrade` (12 righe) usato solo dai test. Nessuna fonte prezzi, runner o persistenza. |
| P2 | Motore di backtest HIST-01a | #34 | **CODE COMPLETE** | `runBacktest` raggiungibile solo dalla CLI su file JSON. Una sola strategia oracolo, solo BACK 1X2, solo fixture. |
| P2 | Strategy Lab: rule builder e HIST-01b su dati reali | #34 | **NOT STARTED** | Nessun reader dal DB, nessuna strategia salvata, nessun walk-forward. |
| P2 | Match Center pre-partita R-07a | #30 | **INTEGRATED** | `/api/v1/fpt/match-analysis` e `#/match`; dati reali NOT VERIFIED. Il resto di #30 è PARTIAL. |
| P2 | Analisi storica, ricerca, filtri, statistiche | #12/#30/#98 | **INTEGRATED** | `QUERY_CATALOG` con 20 query e `fpt_filter_registry`, esposti su API v1 e web. |
| P2 | Policy PIT mp-pit-v1 | R-08 | **INTEGRATED** | `pit/readers` usato da `query.mjs` (team-matches-asof) e dal prematch TC. |
| P2 | Backtest cronologico su dati reali | #34 (MP-STA-003) | **BLOCKED** | Le quote FPT sono state acquisite dopo il kickoff (import massivo del 04/10), quindi il backtest dà INSUFFICIENT_PIT_DATA. Lo stesso vale per #40. |
| P2 | Simulazioni con P/L e bankroll | #34/#96/#99 | **PARTIAL** | Il report HIST dà P/L, ROI e drawdown in unità di stake, ma senza bankroll, MM o ledger. |
| P3 | Operator API v1 (sola lettura) | #98 | **INTEGRATED** | 31 GET; nessun endpoint per simulazione, ledger o backtest. |
| P3 | MCP / API di controllo | #98/#104 | **NOT STARTED** | — |
| P3 | Settings e commissione persistente | #95 | **NOT STARTED** | Esiste solo il parametro `settingsSnapshotId`. |
| P3 | Login owner | #23 | **INTEGRATED** | Migrazione 029. Spento per default; impostazione sulla VPS non documentata. |
| P3 | Web dashboard in sola lettura | #97/#103 | **INTEGRATED** | Browser QA e QA-V solo su archivio QA (fixture). |
| P3 | Viste di simulazione, backtest e ledger | — | **NOT STARTED** | `#/segnali` rimossa da #190. |
| P4 | Trading Engine | #28 | **NOT STARTED** | — |
| P4 | Live Trading Board | #29 | **BLOCKED** | Serve un collettore TC H24 certificato (MP-TC-012); TC spento. |
| P4 | Replay | #24 | **BLOCKED** | R-02; TC spento; nessun codice. |
| P4 | Match Center a partita conclusa | #25 | **NOT STARTED** | — |
| P4 | Trading Copilot | #102 | **NOT STARTED** | — |
| P4 | AI assistant | #44 | **NOT STARTED** | Esiste solo il catalogo query "assistant". |
| P4 | SaaS e billing | #46 | **NOT STARTED** | — |
| P4 | Exchange gateway | #45 | **BLOCKED** | Esclusione owner: solo denaro simulato. |
| P4 | Betwatch | #196 | **NOT STARTED** | Solo preparazione. |
| Extra | Governance multi-agente | #150 | **INTEGRATED** | Gira in CI; esplicitamente NOT CERTIFIED. |
| Extra | Segnali simulati FPT (#184) | — | **NOT STARTED** | Codice rimosso da #190. |

**CERTIFIED: nessuna funzionalità.** Motivi:
- la matrice di certificabilità non ha nessuna riga REAL DATA PASS;
- il certificato FPT del 05/10 è storico;
- #150 è dichiarata NOT CERTIFIED.

## 3. Liste

### Usabili oggi (integrate a runtime)
- Deploy, PostgreSQL, worker FPT, reconciliation, watchdog, alert Telegram, backup.
- API v1 in sola lettura.
- Web: Oggi, Ricerca, Match Center pre-partita, Dati, `/coverage`.
- Policy PIT nelle query.
- Login owner, attivabile.

Limite comune: i dati FPT sono fermi a monte (F-1) e le viste non sono verificate su dati reali.

### Implementate ma scollegate (solo test o CLI)
- `src/markets/rules.mjs` e soprattutto `src/markets/outcomes.mjs`: zero importatori a runtime.
- `src/ledger/paper-ledger.mjs`.
- `src/mm/money-management.mjs`, `src/mm/registry.mjs` (4 modelli), `src/mm/paper-trading.mjs`.
- `src/math/money.mjs`.
- `src/hist/*`, raggiungibile solo dalla CLI `tools/hist/backtest.mjs` su file JSON.
- I job TotalCorner: collegati ma spenti.

### Da sviluppare
- Persistenza di ledger, posizioni e MM (migrazioni additive sotto D13=A).
- Adapter dal DB al backtest (HIST-01b) e Strategy Lab.
- Simulazione con bankroll.
- Trading tools #94 completi.
- MCP, Settings #95, viste di simulazione.
- #28, #25, #102, #44, #46, #196.

### Bloccate o non verificabili da qui
- **Bloccate:**
  - #40 (R-02);
  - TotalCorner (pausa owner);
  - DR/restore;
  - VOID e mercati estesi (DEC-015);
  - altri modelli MM (MM-RULES);
  - backtest PIT su dati reali (mancano quote pre-kickoff);
  - #29 e #24 (TC e R-02);
  - #45 (esclusione owner).
- **Non verificabili da qui:** tutte le affermazioni runtime sulla VPS, che sono dichiarate.

## 4. Flusso end-to-end richiesto dall'owner

Flusso: **FPT in PostgreSQL → selezione → regola/strategia → simulazione BACK/LAY → WIN/LOSE/UNRESOLVED → P/L → ledger → persistenza → API.**

| # | Passo | Cosa esiste | Stato | Collegato al passo successivo in codice non di test? |
|---|---|---|---|---|
| 1 | Dati FPT in PostgreSQL | `fpt_match_facts`: punteggi, `result_status`, quote 1X2/OU2.5/BTTS, `acquired_at`. 161.801 righe sulla VPS (dichiarato). | RUNTIME VERIFIED | Sì: le legge `query.mjs`. |
| 2 | Selezione partite | `query.mjs` (`searchMatches`, `matchesOnDate`, `competitionSeason`, `favoriteOddsRange`) via `/api/v1/fpt/*`. | INTEGRATED | **NO** |
| 3 | Regola / strategia | `hist/strategies.mjs` `mp-ref-fav-back-1` (oracolo di collaudo) e fase decisionale di `runBacktest` con ammissione PIT. | CODE COMPLETE | Sì, dentro il motore. |
| 4 | Simulazione BACK/LAY | Il motore genera solo BACK. `math/money` e il ledger supportano anche LAY. | PARTIAL | Sì |
| 5 | Esito (`src/markets`) | Il motore chiama `rules.resolve('MATCH_ODDS')` con un proprio contratto FINAL/VOID. `outcomes.mjs` (adapter FPT, DEC-002, UNRESOLVED) non è usato. | CODE COMPLETE | Sì, ma con il contratto sbagliato. |
| 6 | P/L (`src/math`) | `money.settleMarket`: lordo, commissione, netto; metriche ROI e drawdown. | CODE COMPLETE | **NO** |
| 7 | Ledger (`src/ledger`) | `paper-ledger.mjs` in memoria, raggiunto solo da `mm/paper-trading.mjs` (test). L'esito si passa a mano. | CODE COMPLETE | **NO** |
| 8 | Persistenza | Nessuna migrazione o tabella per posizioni, ledger, run di backtest o profili MM. | NOT STARTED | — |
| 9 | API | Nessun endpoint `/api/v1` per run, posizioni, ledger o P/L. | NOT STARTED | — |

### Primo anello mancante

**Dove:** tra il passo 2 e il passo 3. Manca il reader/adapter che porta i dati da PostgreSQL al motore.

**Cosa manca:**
- da `fpt_match_facts`/`fpt_match_versions` al contratto `mp-hist-input-1`, cioè a `src/hist/contract.mjs#validateInput` (events, observations, outcomes);
- per gli esiti, a `src/markets/outcomes.mjs#fromFutPythonTrader`.

Oggi `runBacktest` è raggiungibile solo da `tools/hist/backtest.mjs`, che legge un file JSON.

**Issue proprietaria:** **#34** (Strategy Lab, HIST-01b). Lato adapter degli esiti, #100.

**Ostacolo subito dietro:**
- le quote FPT nel DB hanno `acquired_at` successivo al kickoff (import massivo del 04/10/2026 per partite dal 2020-09-11 al 2026-10-04, dichiarato in #12);
- con mp-pit-v1 ogni osservazione viene esclusa come `ACQUIRED_AFTER_DECISION`, e il run restituisce `INSUFFICIENT_PIT_DATA`;
- serve una decisione owner: una modalità di ricerca NON_PIT con conoscenza del provider, oppure la cattura in avanti di quote pre-kickoff (MP-STA-003).

### Anelli mancanti successivi, in ordine
1. **Motore → mercati:** `runBacktest` deve usare `outcomes.resolveVersioned` (DEC-002, UNRESOLVED) invece del proprio contratto FINAL/VOID. Il motore accetta VOID, mentre #100 (DEC-015) non ha una regola VOID approvata. Owner: #34/#100.
2. **Mercati/P&L → ledger:** nessun codice apre o chiude posizioni con `openPosition`/`settlePosition` a partire dalle scommesse simulate. Esistono inoltre due calcoli P/L paralleli (`math/money.grossProfit` e `ledger.legPl`). Owner: "#99 ledger link".
3. **Ledger/MM → PostgreSQL:** migrazioni additive sotto D13=A. Owner: #99, #96.
4. **PostgreSQL → API:** endpoint di lettura per run, posizioni, ledger e P/L. Owner: #98.
