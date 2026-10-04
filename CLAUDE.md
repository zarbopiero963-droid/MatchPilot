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
- evidenze reali ottenute.

README non deve dichiarare completato nulla che non sia stato realmente verificato.

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
- La FASE 1 non è completamente certificata finché il kill live su Render non è stato eseguito e documentato. Non chiudere la issue #12.

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

## Priorità

1. Certificazione completa FutPythonTrader (#12).
2. Normalizzazione TotalCorner pre-match/live.
3. Persistenza temporale immutabile.
4. Daily Board.
5. Match Center con tutte le card.
6. Models/fair odds.
7. Trading Opportunity Engine.
8. Backtest/replay.
9. Journal, risk ed execution.


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
