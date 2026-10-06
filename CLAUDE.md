# CLAUDE.md — MatchPilot Trading OS

Leggere **README.md**, **AGENTS.md** e la issue operativa corrente prima di qualsiasi modifica.

## Contratto prodotto

MatchPilot è una piattaforma web di trading sportivo.

Fonti dati:
- **FutPythonTrader**: storico, statistiche e pre-match.
- **TotalCorner**: mercato pre-match e feed live.

Il prodotto segue:

**PRE-MATCH → LIVE VALIDATION → ENTRY → MANAGEMENT → EXIT → POST-MORTEM**

## Regole obbligatorie

- Mostrare e normalizzare tutti i campi FutPythonTrader realmente disponibili.
- Separare PREMATCH e LIVE in modo verificabile.
- Vietato usare dati successivi al kickoff per generare analisi pre-match.
- Ogni metrica deve avere provenance e coverage.
- Nessun valore inventato o fallback numerico silenzioso.
- Nessuna dipendenza funzionale dal vecchio progetto.
- Nessuna modifica a questo contratto senza autorizzazione esplicita dell'owner.
- Una PR alla volta salvo autorizzazione esplicita.
- Ogni PR deve includere test pertinenti e criteri di accettazione.
- Non effettuare trade reali, puntate o modifiche a conti esterni durante test di sviluppo.
- Nessun secret in codice, fixture, issue, log o output di test.

## Review AI — non attendere se bloccate

Regola dell'owner, vale per CodeRabbit, Codex e qualunque altro reviewer AI.

- Se la review AI non parte o si ferma per rate limit, quota d'uso esaurita, limite del piano (per esempio "fewer than 10 stars"), servizio non disponibile o nessuna risposta dopo il trigger, **non si aspetta**.
- Si scrive nella PR una riga con il motivo e il link al commento del bot, e si procede. Il merge resta subordinato a CI verde, test pertinenti, evidenza reale e README aggiornato.
- I finding già pubblicati da un reviewer AI restano da risolvere o da rispondere prima del merge. La regola copre solo l'attesa di una review che non arriva.
- La regola non vale per review umane richieste, per CI rossa né per un gate reale fallito.

## README sincronizzato obbligatoriamente

**README.md deve essere aggiornato in ogni PR** quando cambia uno dei seguenti elementi:

- stato reale di una fase;
- architettura;
- contratto dati;
- endpoint;
- job/cron;
- fonti dati;
- stato di certificazione;
- limiti noti;
- criteri di accettazione;
- evidenze reali ottenute;
- ordine o fase della roadmap #97.

README non deve dichiarare completato nulla che non sia stato realmente verificato. Se cambia una feature visibile, nella stessa PR si aggiornano anche il mock `docs/mockups/matchpilot-trading-os.html` e il suo changelog.

## Protocollo FutPythonTrader — issue #12

La issue **#12 — FPT-CERT** è il contratto operativo vincolante per la chiusura della sorgente FutPythonTrader.

### Regola fondamentale

FutPythonTrader può essere dichiarato **CLOSED / CERTIFIED** solo quando tutti i gate della #12 sono completati con evidenza reale.

Non sono sufficienti:
- codice presente;
- CI verde;
- test unitari;
- endpoint che risponde;
- deploy live.

Ogni fase deve avere:

1. implementazione;
2. test automatici;
3. test reali su Render/Neon;
4. evidenza verificabile;
5. README sincronizzato;
6. review/thread chiusi;
7. merge solo dopo accettazione tecnica.

### Una PR alla volta

Durante #12:
- una sola PR aperta;
- la PR successiva parte solo dopo merge della precedente;
- failure reale = restare nella stessa fase;
- vietato saltare alla fase successiva per aggirare un gate fallito;
- vietato marcare checklist completate in anticipo.

### Evidenza reale obbligatoria

Ogni PR FPT-CERT deve riportare una sezione **EVIDENZA REALE** con, quando pertinente:

- commit SHA;
- deploy Render;
- migration applicata;
- query/contatori Neon;
- endpoint verificato;
- numero dataset;
- numero righe;
- numero match;
- numero colonne;
- coverage;
- available / unavailable_404 / error_real;
- test idempotenza;
- test resume;
- alert/watchdog;
- eventuali failure e correzioni.

Se l'evidenza reale contraddice il test unitario, prevale il dato reale e la fase resta aperta.

## Resume drill e budget FutPython — operativo

- La migrazione `007-fpt-request-ledger.sql` aggiunge `ingest_complete`, `fpt_request_ledger` e `fpt_provider_hold`.
- Il drill di resume è un comando one-off (`--resume-drill-requeue` poi `--backfill`), mai `FUTPYTHON_BACKFILL_ON_START`.
- Non cambiare le env del servizio Render per il drill. `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` restano false.
- I default `FUTPYTHON_REQUESTS_PER_MINUTE` / `PER_DAY` / `BACKFILL_REQUESTS_PER_MINUTE` sono tetti conservativi di codice, non la quota reale del fornitore. L'owner li sostituisce quando la quota è nota.
- Il browser non chiama FutPythonTrader. Nessun proxy verso il provider.
- La FASE 1 è VERIFIED REAL sul deploy `dep-db1bbujtqb8s7396dg50` / commit `222be65`, con il limite che il SIGTERM live è fra dataset e non a metà scrittura. Non chiudere la issue #12.
- FPT-PR-02 persiste la classificazione su Neon (AVAILABLE, UNAVAILABLE_404, ERROR_REAL, DEPRECATED, REMOVED, più INITIAL_404 e REGRESSION_404). `active=false` da solo non basta.
- FPT-PR-03 riconcilia raw, parser e DB e persiste l'identità squadra (`internal_team_id`, alias, abbreviazioni, nomi storici).
- FPT-PR-04 persiste la schema registry (`type_history`, `unique_rows_seen`, `normalized_field`, alias candidati) e la lineage fino allo snapshot.
- FPT-PR-05 persiste la coverage per global, dataset, league, season, period e campo normalizzato. Il team è solo un campione di 3 squadre e dei campi Home, Date, Match_ID, non un censimento. FPT-PR-06 persiste una riga per lega/stagione, il rilevatore dei buchi annuali e la funzione point-in-time `fpt_known_matches`. `expected_match_count` resta nullo. FPT-PR-07 esegue due sync incrementali senza `--backfill` e senza `--force`. I dataset terminali delle stagioni chiuse non vengono riscaricati. FPT-PR-08 certifica il watchdog esistente, con gli avvisi di budget, 429 e circuit breaker sullo stesso emitAlert. Il gate phase8 è stato riletto vero su Neon prima di FPT-PR-09. FPT-PR-09 aggiunge la migrazione `014-fpt-normalized-layer.sql` (ledger con provider/endpoint/latenza/deduped/budget, famiglie AH/EH/Country/Div/throw-in corrette, `fpt_match_facts`, `fpt_filter_registry`, `fpt_team_links`), le route di sola lettura `/api/fpt/*` e `/api/futpython-certificate`. Il certificato `docs/futpython-certification-YYYY-MM-DD.md` si genera da quell'endpoint, non a mano. Dopo FPT-PR-09 non aprire altre PR FPT senza un gate fallito documentato nella #12. Correzioni della checklist finale #12 dentro FPT-PR-09: query layer assistente, registry filtri completa, livelli di budget #31, onboarding controllato (una nuova lega entra in produzione solo con promozione dell'owner, `node src/jobs/futpython-onboarding.mjs --promote`: l'agente non promuove senza autorizzazione esplicita), riconciliazione #31 (checkpoint, ledger dei gap, recupero nel sync; le stagioni correnti `available` vengono riscaricate con TTL `FUTPYTHON_CURRENT_SEASON_TTL_HOURS`, default 24, massimo `FUTPYTHON_REFRESH_PER_RUN` per run: il "nessun refetch dei terminali" di FPT-PR-07 vale ora solo per le stagioni chiuse), raw append-only (cancellazione solo con `matchpilot.raw_delete_authorization` dell'owner), rielaborazione registrata (`node src/jobs/futpython-reprocess.mjs`: l'agente non lancia `--apply` in produzione senza autorizzazione), pagina `/coverage`.

## Gate finale FutPythonTrader

È vietato scrivere **“FutPythonTrader è chiuso”** fino a quando risultano verificati tutti i punti seguenti:

- backfill storico completo;
- tutti i dataset classificati;
- conteggi reali riconciliati;
- colonne censite;
- coverage completo;
- missing available seasons = 0;
- secondo sync incrementale verificato;
- nessuna duplicazione indebita;
- watchdog certificato;
- alert Telegram certificati;
- certificato finale prodotto;
- CI verde;
- review/thread chiusi;
- nessun ERROR_REAL irrisolto imputabile a MatchPilot.

L'esito finale ammesso è uno solo tra:

- **CERTIFIED**
- **CERTIFIED WITH KNOWN LIMITATIONS**
- **NOT CERTIFIED**

## Priorità — ordine canonico #97

L'ordine di lavoro è quello della issue **#97 — ROADMAP** (revisione owner 06/10/2026), non il numero delle issue. Riassunto e ownership: `docs/integration-map.md`.

0. #23 identità + security baseline
1. #95 settings e commissione via API
2. #12 → #20 → #31 dati certificati (#40 solo dove serve)
3. #24 replay backend / PIT minimo
4. #94 Math Core + API/tool
5. #96 MM Registry / Profiles / Policy + API/tool
6. #100 Market Rules
7. #99 Position / Settlement / Ledger + API/tool
8. #34 Strategy Lab / Backtest + API/tool
9. #28 Trading Engine + API/tool
10. #27 benchmark + query backend #25 / #30 dove servono
11. #98 certificazione integrata pre-UI
12. #44 AI Assistant
13. #45 Exchange Gateway, owner-gated
14. #32 hardening avanzato
15. UI finale (#30, #29, #24, #25, #94, #95, #96, #34, #102, eventuale #91)
16. #46 Billing / SaaS

#102 Trading Copilot attraversa più fasi (tool dopo #28, conversazione dopo #44, certificazione in #98, card in fase 15).

Gerarchia delle fonti: decisioni owner → #97 → issue di dominio → README / CLAUDE / AGENTS → `docs/` → mock. Il mock non è l'architettura: se contraddice una issue si corregge il mock.

## Regola pre-PR obbligatoria (#97)

Prima di aprire qualunque PR:

1. leggere #97;
2. identificare la fase #97 che la PR implementa e scriverla nella PR;
3. identificare l'owner di dominio (vedi sotto) e non spostare logica in un altro dominio;
4. verificare la superficie tool/API che la PR rende disponibile o modifica (#98 è incrementale);
5. verificare i test richiesti: automatici, matematici dove c'è matematica, hard test reali;
6. chiedersi: **"Questa modifica richiede un aggiornamento del mock MatchPilot? SÌ / NO"**, e scrivere la risposta nella PR (se NO, il motivo in una riga);
7. se SÌ, aggiornare `docs/mockups/matchpilot-trading-os.html` e il changelog `docs/mockups/README.md` (SHA-256 compreso) nella stessa PR o nella stessa sequenza di PR pianificata;
8. non dichiarare mai implementato, testato o certificato ciò che esiste solo nel mock.

## Ownership di dominio

- #94 Math: formule pure, Decimal/fixed precision, solver, oracle e test vector.
- #95 Settings: impostazioni account, commissione, default, versioni, snapshot, concorrenza.
- #96 Money Management: registry, profili, capability, staking policy, limiti, filtri, regole, sequence state solo se serve, ALLOW / REDUCE / BLOCK / SIMULATION_ONLY, `operational_mode` (ACTIVE_OPERATIONAL / ADVISORY_ONLY / PAUSED / ARCHIVED). Legge da #99, non scrive posizioni, ledger o saldo.
- #100 Market Rules: risoluzione dei mercati, VOID, PUSH, rinvii, abbandoni, dead heat, esiti asiatici a metà, supplementari e rigori, correzioni, versione della regola.
- #99 Settlement / Ledger: posizioni, leg, riserve, esposizione, contabilità, P/L, equity, settlement, commissione applicata, ledger append-only, reversal, idempotenza.
- #34 Strategy Lab: strategie, DSL, versioni, backtest, assegnazione MM, matching.
- #28 Trading Engine: piano, segnali, BACK / LAY / DUTCH / NO TRADE, intent di entry, invalidation, exit e hedge.
- #45 Execution: unico percorso per ordini reali.
- #44 Assistente globale; #102 Trading Copilot in partita, senza logica propria.

Profili MM: identità stabile e versioni immutabili; modificare crea una versione, lo storico resta sulla versione usata; eliminazione fisica solo se il profilo non è mai stato referenziato. STOP OPERATIONS porta il profilo in ADVISORY_ONLY: l'analisi continua, nessuna nuova posizione, riserva o scrittura nel ledger. Il replay con MM gira in una sessione di simulazione separata, senza dati futuri e senza scritture nel ledger.

Ciclo di certificazione: DISCOVERED → SPECIFIED → CONTRACT_FROZEN → IMPLEMENTED → TESTED → MATH_VERIFIED (se applicabile) → HARD_VERIFIED_REAL → TOOL_VERIFIED → CERTIFIED → OWNER_ACCEPTED.

## Mock vivo — regola permanente

- Il mock `docs/mockups/matchpilot-trading-os.html` deve restare sincronizzato con issue, roadmap e domini. Ogni nuova feature, comportamento, stato, dominio, tool, impostazione, issue di prodotto o cambio UX con impatto visibile o concettuale aggiorna il mock.
- Sequenza: NUOVA FEATURE → issue/contratto → backend/dominio/API → docs → mock, se rilevante.
- Il mock non certifica il backend e distingue sempre DEMO/FUTURE da REAL. REAL solo per valori che arrivano da route certificate.
- Nel prototipo la persistenza è simulata nel browser: non scrivere mai che è account-level.
- `test/mockup-alignment.test.mjs` è un gate di CI: roadmap #97, ownership #96/#99, persistenza, versione e changelog del mock.


## Protocollo TotalCorner — issue #20

La issue **#20 — TC-CERT** è il contratto operativo vincolante per l'integrazione TotalCorner.

Regole:
- una PR alla volta;
- README sincronizzato in ogni PR;
- hard test reali Render/Neon/TotalCorner/Telegram;
- nessuna fase chiusa solo con CI verde;
- solo campionati con mapping VERIFIED FutPythonTrader ↔ TotalCorner entrano nel collector;
- PREMATCH e LIVE devono restare temporalmente separati;
- il collector live deve persistere snapshot, events e market movement in modo deduplicato;
- alert TotalCorner devono usare la stessa chat Telegram configurata per FutPythonTrader;
- nessun token TotalCorner nei log;
- `TotalCorner CLOSED / CERTIFIED` solo dopo tutti i gate della #20.


## Regola chiusura issue — owner gate

Le issue **non devono essere chiuse automaticamente dall'agente**.

Quando ogni punto richiesto nel contenuto dell'issue risulta realmente:
- implementato;
- testato;
- verificato con le evidenze richieste;
- documentato;
- privo di gate aperti;

l'agente deve lasciare un **commento finale di chiudibilità** nell'issue.

Il commento deve includere almeno:
- stato: `READY TO CLOSE` / `CHIUDIBILE`;
- checklist dei punti dell'issue e relativo esito;
- PR/commit coinvolti;
- CI/review status;
- evidenze reali Render/Neon/API/Telegram quando richieste;
- limiti noti residui, se presenti;
- conferma che nessun punto del contenuto resta aperto.

Dopo il commento, l'issue resta **OPEN**.

La chiusura è riservata all'owner.

Eccezione: se l'owner autorizza esplicitamente l'agente a chiudere quella specifica issue, l'agente può chiuderla solo dopo aver pubblicato il commento di chiudibilità e aver verificato nuovamente che tutti i gate siano passati.

Non interpretare autorizzazioni precedenti o generiche come permesso permanente di chiudere issue future.


## Trading-first, non betting-first

MatchPilot è un **tool di trading sportivo**, non un tipster e non un motore di scommesse secche.

Il prodotto deve ragionare in termini di:
- stato del mercato;
- score vulnerabile;
- BACK/LAY;
- fair price;
- edge;
- timing di ingresso;
- conferma live;
- invalidation;
- stop;
- exit/hedge;
- rischio e stake;
- NO TRADE come risultato valido;
- post-mortem e replay.

Un pronostico 1/X/2 o Over/Under può essere un input analitico, ma non è il prodotto finale.

Benchmark GOAT del 04/10/2026: i 21 report mostrano un'impostazione orientata a trading operativo (risultato vulnerabile, frequenza lay, fair lay, rischio, conferma live, check 75', stop e stake). MatchPilot deve superare questo approccio usando dati FutPythonTrader + TotalCorner più completi e replay live persistente.
