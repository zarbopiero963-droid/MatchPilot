# AGENTS.md — Regole operative MatchPilot

## Prima di lavorare

1. Leggere **README.md**.
2. Leggere **CLAUDE.md**.
3. Leggere la issue master corrente.
4. Se il lavoro riguarda FutPythonTrader, leggere integralmente **#12 FPT-CERT**.
5. Verificare branch, PR aperte, CI, deploy e stato delle dipendenze.
6. Verificare che non esista già un'altra PR aperta prima di crearne una nuova.

## Regola PR

- Una PR aperta alla volta.
- Una fase non può essere suddivisa in PR parallele salvo autorizzazione esplicita owner.
- La PR successiva parte solo dopo il merge della precedente.
- Ogni PR deve avere criteri di accettazione espliciti.
- Ogni PR deve includere test automatici pertinenti.
- Ogni PR FPT-CERT deve includere test reali su Render/Neon prima di essere considerata completata.
- Un test reale fallito blocca il merge o richiede una PR/fix nella stessa fase.
- Nessuna checklist va marcata completata prima dell'evidenza reale.

## README sempre sincronizzato

README.md fa parte del contratto di ogni PR.

Aggiornarlo quando cambia:
- stato;
- architettura;
- schema;
- endpoint;
- cron/job;
- certificazione;
- limiti;
- risultati reali.

Il README deve distinguere chiaramente:
- **IMPLEMENTED**
- **TESTED**
- **VERIFIED REAL**
- **CERTIFIED**

Non usare “completato”, “certificato” o “chiuso” come sinonimi se i gate reali non sono passati.

## Data integrity

- Conservare raw payload e normalized payload separatamente.
- Salvare provider timestamp e acquisition timestamp.
- Non contaminare PREMATCH con LIVE.
- Ogni trasformazione deve essere deterministica e testabile.
- Ogni campo sconosciuto va preservato nel raw payload e registrato nello schema discovery.
- Mai trasformare N/D in 0.
- Mai perdere una colonna upstream perché non ancora mappata nella UI.
- Snapshot e versioni devono essere idempotenti.
- Backfill deve essere restartable.
- Errori upstream e bug MatchPilot devono essere classificati separatamente.

## FutPythonTrader — protocollo #12

Per ogni fase di certificazione:

### Prima della patch
- leggere stato reale della #12;
- verificare ultima evidenza Render/Neon;
- identificare gate ancora falliti;
- definire cosa deve dimostrare la PR.

### Durante la patch
- non modificare criteri di accettazione per far passare il test;
- non nascondere ERROR_REAL;
- non classificare un 404 iniziale come bug MatchPilot;
- non classificare una regressione 404 come semplice unavailable;
- mantenere contatori e ledger riproducibili;
- mantenere provenance.

### Prima del merge
- CI verde;
- test reali eseguiti;
- endpoint/query reali verificati;
- review/thread risolti;
- README aggiornato;
- issue #12 aggiornata solo per punti realmente certificati;
- nessun risultato “atteso” presentato come osservato.

### Dopo il merge
- verificare deploy Render;
- verificare migrazioni Neon;
- controllare log senza secret;
- acquisire numeri reali;
- annotare failure reali;
- solo allora passare alla PR successiva.

## Resume drill e budget FutPython

- Una sola PR. FPT-PR-01 è mergiata e verificata. FPT-PR-02 persiste gli stati terminali, INITIAL_404 e REGRESSION_404. FPT-PR-03 persiste l'audit di integrità e l'identità squadra. FPT-PR-04 persiste registry e lineage. FPT-PR-05 persiste la coverage multidimensionale. Non aprire FPT-PR-06 finché quella PR non è mergiata e la query Neon conferma il gate phase5.
- Non chiudere la issue #12.
- Non lanciare il drill sul servizio web e non impostare `FUTPYTHON_BACKFILL_ON_START=true`.
- Il ledger non deve contenere API key. Il browser non chiama il provider.
- Non dichiarare la FASE 1 priva del limite residuo: il SIGTERM live è fra i dataset, nel delay di 5 secondi, non a metà scrittura.
- I default di budget non sono la quota del fornitore: non inventarli come piano reale.

## Evidenza reale

Una evidenza accettabile deve essere riconducibile a:
- output CI;
- deploy Render;
- log Render;
- dati Neon;
- endpoint MatchPilot;
- risposta upstream verificata;
- test reale Telegram;
- snapshot/hash/ledger persistito.

Non usare come certificazione:
- supposizioni;
- screenshot vecchi;
- output del vecchio progetto;
- test solo mock se è richiesto un test reale;
- numeri copiati da una run precedente non compatibile.

## UI

- Web responsive desktop/mobile.
- Daily Board a card.
- Match Center a card.
- Ogni card deve mostrare N/coverage.
- Le metriche non disponibili devono risultare **N/D**, non 0.
- PREMATCH e LIVE devono essere visualmente distinti.
- Stato dati e freschezza devono essere ispezionabili.

## Trading

- Nessun segnale senza evidenze associate.
- Nessun edge senza fair probability/fair price esplicita.
- NO TRADE deve essere supportato.
- Le strategie devono essere versionate e riproducibili.
- Backtest cronologico, senza leakage.
- Modello e movimento quota restano segnali distinti.

## Repository

- Niente codice esplorativo one-shot su main.
- Probe/forensics solo in tools/ o rimossi dopo uso.
- Nessun secret in codice/log/test fixture.
- Nessun riferimento operativo al vecchio progetto su main.
- Branch archivio non è fonte di contratto corrente.
- Test prima del merge.
- Review/thread prima del merge.
- README/CLAUDE/AGENTS devono restare coerenti tra loro.

## Definizione di chiusura FutPythonTrader

Non dichiarare FutPythonTrader chiuso finché la #12 non ha tutti i gate finali verificati.

Solo il certificato finale può promuovere lo stato a:
- CERTIFIED;
- CERTIFIED WITH KNOWN LIMITATIONS;
- NOT CERTIFIED.


## TotalCorner — protocollo #20

Quando il lavoro riguarda TotalCorner:
1. leggere integralmente la issue #20;
2. verificare overlap campionati con FutPythonTrader;
3. usare solo mapping VERIFIED per produzione;
4. una PR alla volta;
5. ogni PR richiede CI + hard test reali;
6. README sempre sincronizzato;
7. preservare raw payload e campi sconosciuti;
8. rispettare rate limit e backoff;
9. non contaminare PREMATCH con dati live;
10. verificare persistenza/replay dopo restart e giorno successivo;
11. usare la stessa chat Telegram per alert TotalCorner;
12. non dichiarare CLOSED/CERTIFIED prima del certificato finale.


## Issue closure workflow — owner gate

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
