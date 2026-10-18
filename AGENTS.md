# AGENTS.md — Regole operative canoniche MatchPilot

Questo file è la **fonte canonica delle regole operative** per qualunque agente (Claude, Codex, ChatGPT o altri) e per ogni PR. Lo stabilisce la decisione owner `MP-GITHUB-SINGLE-SOURCE-OF-TRUTH-01`.

- **CLAUDE.md** rimanda qui e non duplica le regole.
- **Prevalenza:** se un altro documento contraddice questo file o il registro delle decisioni owner, prevalgono le decisioni owner registrate e poi questo file.

## 0. Ingresso operativo — come riprendere il lavoro

Ogni agente, prima di toccare il repository:

1. Legge questo file e [CLAUDE.md](CLAUDE.md).
2. Legge le decisioni owner vigenti in [`docs/governance/owner-decisions.json`](docs/governance/owner-decisions.json), stato `IN_FORCE`. È il registro canonico, con id, data, ambito, precedenza e riferimenti.
3. Esegue `npm run governance:status` per vedere attività, lease, ultimo checkpoint, prossima azione e divergenze. Poi legge la issue assegnata.
4. Controlla roadmap e dipendenze: **#97** è la roadmap canonica; #104 è il catalogo storico; `docs/governance/mp-pr-00/requirements.json → pr_registry` è la sequenza R-xx.
5. Verifica lo stato reale: branch, SHA, PR aperte, CI su GitHub.
6. Identifica i blocker.
7. Riprende dall'ultimo checkpoint **verificato** seguendo la procedura in [`docs/governance/HANDOFF.md`](docs/governance/HANDOFF.md) (`npm run governance:resume -- <task>`).

**Regole di ripresa:**
- Un checkpoint dichiarato PASS non vale finché le sue evidenze non sono state verificate.
- In caso di divergenza fra checkpoint e realtà ci si ferma e si registra il conflitto.
- Non si ripete lavoro già certificato.

## 1. Gerarchia

Decisioni owner registrate → **#3** master di prodotto → **#97** roadmap operativa → contratti e gate delle issue di dominio → requisiti Gate A (`docs/governance/mp-pr-00/`) → AGENTS.md → CLAUDE.md / README → documenti di integrazione → mock.

- **#104** resta il catalogo storico delle 82 card (D8).
- Ogni card è COMPLETED / PARTIAL / PLANNED / SUPERSEDED / DEFERRED / NOT VERIFIED.
- Una PR mergiata non completa da sola una card.

## 2. Contratto prodotto

MatchPilot è una piattaforma web di **trading sportivo**: solo calcio, con feed core **FutPythonTrader** (storico, statistiche, pre-match) e **TotalCorner** (mercato pre-match e live). Il perimetro operativo è l'intersezione FPT ∩ TC con mapping VERIFIED.

Ciclo: **PRE-MATCH → LIVE VALIDATION → ENTRY → MANAGEMENT → EXIT → POST-MORTEM**.

Il perimetro **HARD CERTIFIED OFFLINE v1** è fissato dalla decisione D3. Le funzioni LIVE, Exchange, SaaS e quelle avanzate del Trading OS restano nella roadmap globale.

**Regole obbligatorie:**
- normalizzare e rendere interrogabili tutti i campi FPT realmente disponibili;
- PREMATCH e LIVE separati in modo verificabile;
- vietato usare dati successivi al kickoff per analisi pre-match;
- ogni metrica con provenance e coverage;
- nessun valore inventato né fallback numerico silenzioso (N/D non è 0);
- nessuna dipendenza funzionale dal vecchio progetto;
- nessun trade reale, puntata o modifica a conti esterni durante lo sviluppo;
- nessun secret in codice, fixture, issue, log, checkpoint o output di test.

Il contratto prodotto si modifica solo con decisione owner registrata.

## 3. PR, Gate A / Gate B e certificazione

- **Una sola PR di implementazione attiva alla volta**, salvo decisione owner diversa. Analisi e review in sola lettura possono procedere in parallelo. Il registro attività lo impone (`docs/governance/work-registry.json`).
- Ogni lavoro parte da una **issue di riferimento**. Se manca, si chiede l'autorizzazione owner prima di crearla.
- **Gate A locale:** fonte autorizzata, requisiti atomici, comportamento, invarianti, I/O, failure mode, dipendenze, criteri di accettazione, mapping issue → requisito → codice → test, nessun conflitto owner irrisolto.
- **Gate B locale:** test reali pertinenti (unit, integrazione, regressione, contract, DB, E2E browser, anti-leakage temporale, replay deterministico, backtest, sicurezza, recovery/concorrenza dove applicabili). Ogni record di evidenza riporta comando, risultato, ambiente, commit, ora e limiti (schema `validateEvidence`).
- Un controllo obbligatorio non eseguito è NOT_VERIFIED o BLOCKED, mai PASS. Un controllo non applicabile va motivato.
- **HARD OFFLINE (D5):** è valida senza Render/Neon di produzione quando il perimetro non li richiede (PostgreSQL di test, dataset autentici con hash, runtime reale, browser reale). Mock e stub vanno dichiarati. Non si dichiara certificata un'integrazione esterna non provata.
- **Tre stati distinti:** `PR CERTIFIED`, `ISSUE READY TO CLOSE`, `GLOBAL HARD CERTIFIED`. Nessuno implica gli altri.
- **Ciclo di certificazione dei domini:** DISCOVERED → SPECIFIED → CONTRACT_FROZEN → IMPLEMENTED → TESTED → MATH_VERIFIED (se applicabile) → HARD_VERIFIED_REAL → TOOL_VERIFIED → CERTIFIED → OWNER_ACCEPTED.
- **Difetti:** RED → fix minimo → GREEN → regressione pertinente.

**Regola pre-PR (#97):**
1. dichiarare fase #97, issue (`Refs #N`), card #104 e ID requisiti;
2. identificare l'owner di dominio senza spostare logica;
3. verificare la superficie tool/API;
4. definire i test (automatici, matematici dove c'è matematica, hard);
5. rispondere a "Questa modifica richiede un aggiornamento del mock MatchPilot? SÌ / NO", con il motivo se NO.

## 4. Review indipendente e auto-merge (MP-OWNER-AUTOMERGE-01, D2)

**L'agente esegue il merge senza chiedere l'approvazione owner** solo quando valgono tutte le condizioni:
- scope autorizzato;
- Gate A locale PASS;
- Gate B locale PASS;
- test obbligatori PASS;
- GitHub Actions verdi;
- branch protection soddisfatta;
- **review indipendente APPROVED** sul head corrente;
- nessun finding bloccante;
- nessun conflitto owner irrisolto;
- nessuna operazione esterna non autorizzata (deploy, costo, produzione, LIVE);
- nessun riferimento di auto-chiusura nella PR.

La valutazione eseguibile è `node tools/governance/cli.mjs merge-gate <input.json>`.

**Requisiti della review indipendente:**
- il revisore non ha prodotto la modifica;
- verifica diff e SHA;
- esamina requisiti, codice, test, evidenze e rischi;
- pubblica su GitHub un rapporto con verdetto esplicito: APPROVED / CHANGES REQUESTED / BLOCKED / NOT VERIFIED;
- un commento positivo generico non vale come APPROVED;
- se la branch protection richiede un'approvazione formale, serve un account autorizzato indipendente;
- vietato simulare o aggirare.

**Altre regole di merge:**
- Merge con lo SHA atteso, tracciato con commit, timestamp, review ed evidenze nel checkpoint successivo.
- L'auto-merge non autorizza deploy, costi o accessi alla produzione. Dopo il merge non si avvia né si verifica un deploy Render salvo autorizzazione owner specifica.

**Review AI bloccata:** se il reviewer automatico (CodeRabbit o altri) non parte per limiti di piano, quota o disponibilità, non si aspetta. Si scrive una riga nella PR con il link e si usa la review indipendente D2. I finding già pubblicati vanno risolti o motivati prima del merge.

## 5. Issue — chiusura solo owner (MP-OWNER-CERT-ISSUE-CLOSURE-01)

**Solo l'owner chiude le issue.**

Gli agenti non chiudono issue, né direttamente né tramite script, workflow, API o merge. Nelle PR, nei commit e nei documenti si usa `Refs #N`, mai le parole chiave GitHub di auto-chiusura (Closes/Fixes/Resolves seguite da un riferimento). La CI rifiuta queste parole chiave in titolo, corpo e commit della PR e nei documenti canonici (`npm run governance:scan-closing`).

Quando **tutti** i requisiti approvati di una issue sono implementati e certificati, e tutte le PR necessarie sono mergiate, l'agente pubblica nella issue un commento intitolato **`READY TO CLOSE — OWNER APPROVAL REQUIRED`** con:
1. issue e obiettivo;
2. requisiti completati;
3. PR e commit mergiati;
4. codice implementato;
5. test eseguiti e risultati;
6. CI;
7. review indipendente;
8. Gate A/B;
9. certificazione e perimetro;
10. limiti residui approvati;
11. dipendenze verificate;
12. assenza di blocker;
13. verdetto.

Se manca una prova obbligatoria si usa BLOCKED o NOT VERIFIED. Una PR che completa solo una parte di una issue produce un aggiornamento di avanzamento, non READY TO CLOSE. La issue resta OPEN fino alla decisione dell'owner.

## 6. Checkpoint, handoff e recovery (MP-MULTIAGENT-SYNC-CHECKPOINT-01, #150)

Ogni ciclo di lavoro lascia su GitHub un checkpoint machine-readable in `docs/governance/checkpoints/<id>.json`:
- append-only, schema `mp-checkpoint-v2` (v1 accettato solo per i checkpoint storici precedenti al 18/10 21:00Z);
- stati ammessi: PLANNED, RUNNING, BLOCKED, REVIEW, HANDOFF READY, CERTIFIED, MERGED, COMPLETED;
- ogni checkpoint ha un commento corrispondente su issue o PR con marker `<!-- mp-checkpoint:<id> -->`.

Il registro attività `docs/governance/work-registry.json` gestisce assegnazioni e lease:
- un lease attivo di un altro agente non si scavalca;
- un lease scaduto si rileva solo dopo aver riconciliato il suo ultimo checkpoint con lo stato reale.

Quando un agente interrompe il lavoro pubblica `HANDOFF READY`. Procedura completa, regole di idempotenza e casi di recovery (crash, timeout, limiti d'uso, cambio di modello, agente o ambiente): [`docs/governance/HANDOFF.md`](docs/governance/HANDOFF.md).

## 7. README sincronizzato

README.md va aggiornato in ogni PR che cambia:
- stato di una fase;
- architettura;
- contratto dati;
- endpoint;
- job/cron;
- fonti dati;
- certificazione;
- limiti noti;
- criteri di accettazione;
- evidenze reali;
- roadmap.

Il README distingue IMPLEMENTED / TESTED / VERIFIED REAL / CERTIFIED e non dichiara completato nulla che non sia verificato.

## 8. Roadmap #97, ownership e mock vivo

**Ordine canonico #97** (revisione owner 06/10/2026), con sequenza operativa R-00…R-18 (D8):
0. #23 identità + security baseline;
1. #95 settings;
2. #12 → #20 → #31 dati certificati;
3. #24 replay backend;
4. #94 Math Core;
5. #96 MM;
6. #100 Market Rules;
7. #99 Settlement/Ledger;
8. #34 Strategy Lab;
9. #28 Trading Engine;
10. #27 benchmark e query #25/#30;
11. #98 certificazione integrata;
12. #44 AI Assistant;
13. #45 Exchange (owner-gated);
14. #32 hardening;
15. UI finale;
16. #46 Billing.

#102 Trading Copilot attraversa più fasi. Riassunto: `docs/integration-map.md`.

**Ownership di dominio:**
- **#94 Math:** formule pure, Decimal/fixed precision, solver, oracle e test vector.
- **#95 Settings:** impostazioni account, commissione, default, versioni, snapshot, concorrenza.
- **#96 Money Management:**
  - registry, profili, capability, staking policy, limiti, filtri, regole;
  - sequence state solo se serve;
  - decisioni ALLOW / REDUCE / BLOCK / SIMULATION_ONLY;
  - `operational_mode` (ACTIVE_OPERATIONAL / ADVISORY_ONLY / PAUSED / ARCHIVED).

  Legge da #99; non scrive posizioni, ledger o saldo.
- **#100 Market Rules:** risoluzione dei mercati, VOID, PUSH, rinvii, abbandoni, dead heat, esiti asiatici a metà, supplementari e rigori, correzioni, versione della regola.
- **#99 Settlement / Ledger:** posizioni, leg, riserve, esposizione, contabilità, P/L, equity, settlement, commissione applicata, ledger append-only, reversal, idempotenza.
- **#34 Strategy Lab:** strategie, DSL, versioni, backtest, assegnazione MM, matching. L'Indicator Library/DSL appartiene solo a #34.
- **#28 Trading Engine:** piano, segnali, BACK / LAY / DUTCH / NO TRADE, intent di entry, invalidation, exit e hedge.
- **#45 Execution:** unico percorso per ordini reali.
- **#44:** assistente globale.
- **#102:** Trading Copilot in partita, senza logica propria.

**Nessuna logica di business nella UI.**

**Profili MM:**
- identità stabile e versioni immutabili: ogni modifica crea una versione e lo storico resta sulla versione usata;
- eliminazione fisica solo se il profilo non è mai stato referenziato;
- STOP OPERATIONS porta il profilo in ADVISORY_ONLY: l'analisi continua, ma nessuna nuova posizione, riserva o scrittura nel ledger;
- il replay con MM gira in una sessione di simulazione separata, senza dati futuri e senza scritture nel ledger.

**Livelli di certificazione distinti:** implementazione; certificazione di componente nel proprio scope; certificazione integrata #98. Mock e CI da soli non sono hard evidence.

**OPEN / OWNER DECISION REQUIRED:**
- eccezione STOP/ADVISORY sulle posizioni già aperte (`OWN-OPEN-STOP-ADVISORY`): non scegliere automaticamente "blocca tutto" né "settle comunque";
- WeWeb;
- sport o overlap aggiuntivi;
- BetsAPI come provider core;
- execution reale.

**Mock vivo:**
- Ogni feature, stato, dominio, tool, impostazione o cambio UX con impatto visibile o concettuale aggiorna `docs/mockups/matchpilot-trading-os.html` e `docs/mockups/README.md` (changelog con SHA-256) nella stessa PR o sequenza pianificata.
- Ogni PR risponde: "Questa modifica richiede un aggiornamento del mock MatchPilot? SÌ / NO".
- REAL solo per valori da route certificate. Il prototipo simula la persistenza nel browser: non dichiararla account-level.
- Una funzione presente solo nel mock non è mai IMPLEMENTED, TESTED né CERTIFIED.

## 9. Data integrity e point-in-time (D4)

- Raw e normalized separati. Provider timestamp e acquisition timestamp sempre salvati. Campi sconosciuti preservati nel raw e registrati nello schema discovery.
- Mai trasformare N/D in 0. Mai perdere una colonna upstream perché non mappata nella UI.
- Snapshot idempotenti, backfill restartable, trasformazioni deterministiche e testabili. Errori upstream e bug MatchPilot classificati separatamente.

**PIT (D4)** per replay, statistiche e backtest:
- si usa un dato solo se la sua disponibilità è dimostrabile entro il tempo della decisione simulata;
- si distinguono tempo dell'evento, del provider, di acquisizione, di disponibilità e di decisione;
- timestamp assenti o ambigui ⇒ dato non PIT-verificato, mai orari inventati;
- policy UTC/timezone/DST esplicita e testata;
- parser, reprocessing e versioni dell'identità possono cambiare il risultato allo stesso T, quindi a ogni reprocessing si registrano:
  - prima e dopo;
  - raw e acquisition;
  - versioni di parser, schema, transform e data contract;
  - versioni di mapping;
- nessun apply in produzione senza owner;
- i dati non PIT escono dai backtest certificati o vengono etichettati come non PIT.

## 10. FutPythonTrader — protocollo #12

#12 è il contratto vincolante FPT. FPT si dichiara CLOSED / CERTIFIED solo con tutti i gate #12 verificati. Esito finale: CERTIFIED / CERTIFIED WITH KNOWN LIMITATIONS / NOT CERTIFIED.

Codice presente, CI verde, test unitari, endpoint che risponde o deploy live non bastano.

**Gate finale** ("FutPythonTrader è chiuso" solo se):
- backfill completo;
- dataset classificati;
- conteggi riconciliati;
- colonne censite;
- coverage completa;
- missing available seasons = 0;
- secondo sync incrementale;
- nessuna duplicazione;
- watchdog e alert Telegram certificati;
- certificato finale;
- CI verde;
- review chiuse;
- nessun ERROR_REAL imputabile a MatchPilot.

**Disciplina di fase** (#12 e #20):
- una fase non si suddivide in PR parallele senza autorizzazione owner;
- un failure reale ⇒ si resta nella stessa fase;
- vietato saltare alla fase successiva per aggirare un gate fallito;
- vietato marcare checklist completate in anticipo.

**Durante una patch FPT:**
- non modificare i criteri per far passare i test;
- non nascondere ERROR_REAL;
- un 404 iniziale non è un bug MatchPilot;
- una regressione 404 non è semplice unavailable;
- contatori, ledger e provenance riproducibili.

**Evidenza reale FPT:** commit SHA, migration, query/contatori, endpoint, dataset, righe, match, colonne, coverage, available / unavailable_404 / error_real, idempotenza, resume, alert/watchdog, failure e correzioni. Se l'evidenza reale contraddice il test, prevale il dato reale.

**Resume drill e budget:**
- **migrazione:** `007-fpt-request-ledger.sql` aggiunge `ingest_complete`, `fpt_request_ledger` e `fpt_provider_hold`;
- **drill:** è one-off (`--resume-drill-requeue` poi `--backfill`), mai con `FUTPYTHON_BACKFILL_ON_START`. Non si cambiano le env del servizio per il drill e `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` restano false;
- **FASE 1:** è VERIFIED REAL (deploy `dep-db1bbujtqb8s7396dg50`, commit `222be65`) con un limite residuo dichiarato: il SIGTERM live cade fra i dataset, nel delay di 5 secondi, non a metà scrittura;
- **classificazione:** gli stati AVAILABLE, UNAVAILABLE_404, ERROR_REAL, DEPRECATED, REMOVED, INITIAL_404 e REGRESSION_404 sono persistiti; `active=false` da solo non basta;
- **budget:** i default `FUTPYTHON_REQUESTS_PER_MINUTE` / `PER_DAY` / `BACKFILL_REQUESTS_PER_MINUTE` sono tetti di codice, non la quota del fornitore;
- **provider:** il browser non chiama FPT e non esiste un proxy verso il provider;
- **ledger:** non contiene API key.

**Storico FPT-PR-01..09 (evidenze storiche nel proprio perimetro):**
- **migrazione `014-fpt-normalized-layer.sql`** introduce `fpt_match_facts`, `fpt_filter_registry` e `fpt_team_links`.
- **Route di sola lettura:** `/api/fpt/*`, `/api/futpython-certificate` e la pagina `/coverage`.
- **Certificato:** `docs/futpython-certification-YYYY-MM-DD.md` si genera dall'endpoint, non a mano.
- **Stagioni:** le stagioni correnti `available` sono riscaricate con TTL `FUTPYTHON_CURRENT_SEASON_TTL_HOURS` (default 24, massimo `FUTPYTHON_REFRESH_PER_RUN` per run); il divieto di refetch dei terminali vale solo per le stagioni chiuse.

**Restano owner-gated:**
- promozione di una nuova lega (`node src/jobs/futpython-onboarding.mjs --promote`);
- cancellazione raw (`matchpilot.raw_delete_authorization`);
- `node src/jobs/futpython-reprocess.mjs --apply` in produzione.

L'audit dei 412 `UNAVAILABLE_404` è autorizzato solo nella parte read-only (D7).

## 11. TotalCorner — protocollo #20

1. Leggere integralmente la #20.
2. Nel collector entrano solo campionati FPT ∩ TC con mapping VERIFIED.
3. PREMATCH e LIVE temporalmente separati.
4. Il collector live persiste snapshot, eventi e market movement deduplicati.
5. Preservare raw e campi sconosciuti.
6. Rispettare rate limit e backoff.
7. Alert sulla stessa chat Telegram di FPT.
8. Nessun token TotalCorner nei log.
9. Verificare persistenza e replay dopo un restart.
10. `TotalCorner CLOSED / CERTIFIED` solo dopo tutti i gate della #20.
11. **D6:**
    - nessun rinnovo, credito o servizio a pagamento;
    - nessun riavvio di collector che produca costi senza approvazione owner con costo, beneficio e impatto;
    - lo sviluppo continua offline sui dati già acquisiti.

## 12. Archivio #40 (D7) e produzione

**Archivio #40:** solo lettura (inventario, SHA-256, readback, verifica DuckDB/Parquet, PIT, riconciliazione). Mai modifica, rigenerazione, backfill o pubblicazione dei dati. #40 resta OPEN fino alla verifica indipendente di portabilità, hash e integrità (D9).

**Produzione:**
- nessun deploy, scrittura Neon/Render, costo o operazione LIVE senza autorizzazione owner esplicita;
- Render e Neon sono sospesi dal 09/10 (#144);
- lo sviluppo è offline su PostgreSQL isolato.

## 13. Evidenza

**Fonti accettabili:**
- output CI;
- test eseguiti su codice reale;
- dati di PostgreSQL di test;
- endpoint MatchPilot;
- risposta upstream verificata;
- snapshot, hash o ledger persistiti;
- commenti GitHub con ID.

**Fonti non accettabili:**
- supposizioni;
- screenshot vecchi;
- output del vecchio progetto;
- test solo mock dove serve un test reale;
- numeri copiati da run incompatibili;
- etichette senza fonte verificabile.

## 14. UI e trading

**UI:**
- web responsive;
- Daily Board e Match Center a card con N e coverage;
- metriche non disponibili mostrate come N/D;
- PREMATCH e LIVE visivamente distinti;
- stato e freschezza dei dati ispezionabili.

**Trading-first, non betting-first.** Il prodotto ragiona in termini di:
- stato del mercato;
- score vulnerabile;
- BACK/LAY;
- fair price;
- edge;
- timing;
- conferma live;
- invalidation;
- stop;
- exit/hedge;
- rischio e stake.

NO TRADE è un risultato valido. Strategie versionate e riproducibili; backtest cronologico senza leakage; modello e movimento quota restano segnali distinti.

Benchmark GOAT del 04/10/2026: MatchPilot deve superarlo con dati FPT + TC più completi e replay persistente.

## 15. Repository

- Niente codice esplorativo one-shot su main: probe e forensics vanno in `tools/` o si rimuovono.
- Nessun riferimento operativo al vecchio progetto.
- Il branch archivio non è fonte di contratto.
- Test e review prima del merge.
- AGENTS, CLAUDE, README, `docs/integration-map.md` e il mock restano coerenti. La coerenza è verificata da `test/governance-docs.test.mjs` e `test/mockup-alignment.test.mjs`.
