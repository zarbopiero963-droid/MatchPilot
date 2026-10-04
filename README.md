# MatchPilot — Sports Trading OS

MatchPilot è una piattaforma web di **trading sportivo decisionale**, non un semplice sito di pronostici.

## Obiettivo

Per ogni partita il prodotto deve raccogliere, normalizzare e mostrare in card **tutte le informazioni realmente disponibili da FutPythonTrader**, combinarle con i mercati pre-match di TotalCorner e, dopo il calcio d'inizio, usare TotalCorner come feed live per validare opportunità di trading.

Il flusso prodotto è:

**PRE-MATCH → LIVE VALIDATION → ENTRY → MANAGEMENT → EXIT → POST-MORTEM**

## Fonti dati

### FutPythonTrader — motore statistico/pre-match
Usare ogni campo disponibile e con copertura reale. Le famiglie includono, quando presenti:

- risultati e forma;
- gol fatti/subiti;
- 1X2, Over/Under, BTTS, Double Chance, Correct Score;
- xG, xGA, xGOT, xA;
- tiri totali, in porta, fuori, bloccati;
- tiri dentro/fuori area e legni;
- big chances;
- possesso;
- pass accuracy, long-pass accuracy, final-third passing, through passes, crosses;
- touches in box;
- corner;
- falli, cartellini, fuorigioco, punizioni;
- tackle, duelli, clearances, interceptions;
- saves, errors leading to shot/goal, goals prevented;
- split HT e 2T;
- minuti dei gol;
- storico quote;
- ogni ulteriore campo futuro restituito dall'API.

**Regola:** un campo disponibile non deve essere nascosto dal modello dati. Se non è ancora visualizzato, resta comunque normalizzato e interrogabile.

### TotalCorner — mercato pre-match + live
Prima del kickoff:

- opening e pre-match 1X2;
- Asian Handicap;
- Goal Line;
- Corner Line;
- storico movimenti quota precedente al kickoff.

Dopo il kickoff:

- score e stato;
- events;
- attacks;
- dangerous attacks;
- shots on/off target;
- possession;
- corners e cards;
- 1X2 live;
- Asian / Goal / Corner lines;
- storico movimenti in-play.

## Separazione temporale obbligatoria

Il motore pre-match **non può leggere o derivare** alcuna informazione successiva al kickoff.

Ogni record deve avere:
- provider timestamp;
- acquisition timestamp UTC;
- match id provider;
- fase: PREMATCH o LIVE;
- provenance;
- versione parser/schema.

Un'analisi pre-match deve poter essere ricostruita usando esclusivamente snapshot anteriori al kickoff.

## Web app

### Home / Daily Board
Card per tutte le partite disponibili con:
- squadre, campionato, orario;
- probabilità 1X2 modello;
- fair odds;
- O1.5 / O2.5 / BTTS;
- expected goals;
- market movement;
- trading profile;
- numero di strategie live candidate;
- qualità/copertura dati.

### Match Center
La pagina partita deve mostrare card separate e confrontabili Home/Away:

1. Overview
2. Forma 5/10/20
3. Casa vs trasferta
4. xG / xGA / xGOT / xA
5. Tiri e qualità occasioni
6. Creazione offensiva
7. Possesso e costruzione
8. Difesa
9. Disciplina
10. Corner
11. Primo tempo
12. Secondo tempo
13. Timing gol
14. Score distribution
15. H2H
16. Mercati storici
17. Similar Odds
18. Strengths / Weaknesses
19. Model Output
20. Trading Candidates
21. Data Coverage
22. Market Movement
23. Live State (solo dopo kickoff)
24. Trading Opportunities
25. Trade Journal / Post-mortem

Le card devono mostrare sempre anche **coverage N** e provenienza.

## Trading Opportunity Engine

MatchPilot non deve limitarsi a "pronostico sì/no". Ogni opportunità deve descrivere:

- mercato/strategia;
- direzione BACK/LAY;
- confidence;
- entry window;
- quota corrente;
- fair price;
- edge;
- contesto pre-match;
- conferme live;
- invalidation conditions;
- stake/risk suggestion;
- exit target;
- stop;
- evidenze usate.

Esempio concettuale:

```text
LAY 1-0
Confidence: 78/100
Entry window: 68'-76'
Current odds: 8.40
Fair lay odds: 6.90
Edge: +17.8%
Pressure: HIGH
Pre-match vulnerability: HIGH
Stop: 82' or momentum reversal
```

## Strategie

Le strategie devono essere configurabili e backtestabili. Non esiste un limite artificiale di 5 strategie.

Esempi:
- Lay Score;
- Lay Draw;
- Lay Favourite;
- Back Over;
- Goal after pressure;
- Next Goal;
- score vulnerability;
- market/model divergence;
- strategie custom create dall'utente.

Ogni strategia deve avere versione, regole, parametri, campione, risultati, ROI, drawdown e intervallo di confidenza.

## Principi non negoziabili

1. Nessun dato live nel pre-match.
2. Nessuna probabilità inventata se manca il dato.
3. Coverage sempre visibile.
4. Modello e mercato sono segnali distinti.
5. Un movimento quota non è automaticamente un edge.
6. NO TRADE è un risultato valido.
7. Ogni trade deve essere riproducibile da snapshot immutabili.
8. Nessuna strategia viene dichiarata profittevole senza backtest out-of-sample.
9. Tutti i dati FutPythonTrader disponibili devono poter essere ispezionati.
10. GOAT non è una dipendenza del prodotto.

## Stato

Il progetto precedente è stato archiviato nel branch:

`archive/pre-trading-os-reset-2026-10-04`

La branch `main` rappresenta esclusivamente il nuovo MatchPilot Sports Trading OS.


## Stato FutPythonTrader — certificazione

La chiusura definitiva della sorgente FutPythonTrader è governata dalla issue **#12 — FPT-CERT**.

Stato corrente della sorgente: **IN CERTIFICAZIONE — non ancora CLOSED**.

Il gate dati della FASE 1 (backfill storico + verifier, PR #33) resta valido sull'evidenza reale sotto. Il kill live e il budget sono stati verificati dopo il merge di PR #35, con il limite esplicito che il SIGTERM di produzione è caduto fra due dataset e non a metà scrittura. La pipeline FutPythonTrader non è CLOSED / CERTIFIED. La issue #12 resta aperta. FPT-PR-05 … FPT-PR-09 non partono.

La certificazione richiede, nell'ordine:

1. backfill storico completo e restartable;
2. classificazione di ogni dataset;
3. riconciliazione snapshot, versioni e match unici;
4. censimento completo delle colonne;
5. coverage per campo/dataset/lega/stagione;
6. audit delle stagioni mancanti;
7. due sync incrementali reali con verifica idempotenza;
8. certificazione Data Health/Watchdog/Telegram;
9. documento finale `docs/futpython-certification-YYYY-MM-DD.md`.

### FASE 1 — Backfill

La FASE 1 introduce:
- snapshot immutabile del catalogo usato dal run;
- backfill riprendibile senza riscaricare dataset terminali;
- conteggio `resumed_skips`;
- classificazione `available / unavailable_404 / error / deprecated`;
- riepilogo reale tramite `/api/futpython-certification`.

**Regola:** README viene aggiornato in ogni PR di certificazione. Una fase viene marcata completata solo dopo CI verde e test reali su Render/Neon.


### FASE 1 — evidenza reale e correzione resume

Il primo collaudo reale della FASE 1 ha rilevato che dataset già acquisiti prima dell'introduzione della colonna `availability` conservavano `availability=unknown` pur avendo uno snapshot valido.

Correzione prevista in questa PR:
- `unknown + last_snapshot_id` viene riconciliato a `available`;
- `error` resta ritentabile anche se esiste uno snapshot precedente;
- run lasciati `running` da un deploy/interruzione vengono chiusi come `partial/interrupted`;
- il backfill resta restartable e non duplica dataset terminali.

Al momento di quella correzione la FASE 1 restava **NON CERTIFICATA**, in attesa di un collaudo reale con `undefined_states=0`.


### FASE 1 — ottimizzazione persistenza reale

Il collaudo del backfill ha mostrato che la persistenza riga-per-riga verso Neon era corretta ma troppo lenta per una certificazione operativa ripetibile.

Questa PR sostituisce:
- upsert catalogo per singola riga;
- upsert schema per singolo campo;
- insert versione partita per singola riga;

con operazioni PostgreSQL batch tramite `jsonb_to_recordset`.

Il contratto dati non cambia:
- raw snapshot immutabile;
- payload completo JSONB;
- deduplica per hash;
- versioning partita;
- schema discovery dinamico.

Al momento di quella ottimizzazione la FASE 1 restava **NON CERTIFICATA**: mancavano ancora il backfill reale completo e la riconciliazione finale.


### FASE 1 — correzione contatori certificazione

Il backfill reale ha completato la classificazione del catalogo, ma ha evidenziato un difetto nel solo ledger del run: alcuni contatori numerici non erano inizializzati e quindi venivano serializzati come zero dopo operazioni su `undefined`.

La correzione:
- inizializza esplicitamente tutti i contatori;
- conserva separatamente 404 incontrati nel run e totale finale `unavailable_404`;
- permette di verificare l'equazione `datasets_attempted + resumed_skips = catalog_entries` nei backfill.

La classificazione già persistita dei dataset non viene modificata.


### FASE 1 — verifica reale finale

Prima della chiusura formale vengono eseguiti e persistiti in `fpt_certification_checks`:
- deduplica reale su almeno 3 dataset disponibili mediante nuovo download e confronto snapshot/versioni;
- conferma reale di un dataset `unavailable_404`;
- conferma di un dataset disponibile con righe;
- conferma di almeno una lega multi-stagione.

Il verificatore è eseguibile con `npm run verify:futpython:p1` o, in modo one-shot su Render, con `FUTPYTHON_PHASE1_VERIFY_ON_START=true`.

La FASE 1 viene marcata **CERTIFICATA** solo se tutti questi check risultano `pass`.


### FASE 1 — finding catalogo storico completo

Il verificatore reale ha bloccato la certificazione perché il catalogo iniziale conteneva 185 leghe ma una sola stagione per lega. La documentazione ufficiale FutPythonTrader espone invece, nella colonna **TEMPORADAS**, tutte le stagioni disponibili per ciascuna lega.

Esempi osservati realmente:
- Argentina Primera Nacional: 2026 → 2021;
- Australia A League: 2025-2026 → 2020-2021;
- Europe Euro: 2020, 2016, 2012, 2008, 2004, 2000;
- World Championship: 2026, 2022, 2018, 2014, 2010, 2006, 2002.

La discovery viene quindi corretta per espandere **ogni stagione documentata** in un dataset distinto. La precedente prova su 185 dataset resta valida solo come collaudo tecnico, non come backfill storico completo.

Al momento di quel finding la FASE 1 restava **NON CERTIFICATA**: il catalogo espanso non era ancora stato acquisito per intero e il verifier reale non era passato.

### FASE 1 — stato corrente, evidenza 2026-10-04

**Gate dati FASE 1 (PR #33): evidenza reale, non certificazione completa della fase.**

I numeri sotto restano l'evidenza del backfill e del verifier. Non includono un kill a metà `storeDataset`. Il codice osservato allora era il commit `0307e72e977767cf4ee1a694bcbab9c635d40e39` su `main`. Quella PR non aggiungeva migrazioni né modificava il sync.

Backfill `fpt-1791137791126-7a167652` (`kind=backfill`, `status=complete`):
- avvio 20:16:31 Europe/Rome, fine 20:42:01 Europe/Rome;
- deploy di boot `dep-db19fq8u01pc73depeh0` (stesso commit, finito 20:16:36 Europe/Rome, poi disattivato);
- catalogo 1027 (56 paesi, 185 leghe), snapshot catalogo `fpt-catalog-9dcea3d469a9598004098794`;
- `datasets_attempted` 840, `resumed_skips` 187, equazione 840+187=1027;
- `available` 615, `unavailable_404` 412, `error_real` 0, `deprecated` 0, `unknown` 0, `undefined_states` 0;
- equazione di stato 615+412+0+0=1027, confermata anche dal `GROUP BY availability` su Neon (nessuna riga `error` o `unknown`);
- `snapshots_inserted` di questo run 509; snapshot correnti nel mirror 615;
- `rows_seen` 147999, `rows_inserted` 147975, `datasets_changed` 509, `fields_seen` 261;
- `errors` vuoto (`[]`), `error_real_count` 0. Nessuna anomalia di errore su questo run.

Il resume dimostrato è reale rispetto al catalogo incompleto precedente: i 187 dataset già terminali sono stati saltati prima di `syncEntry` e non sono stati riscaricati. Le GET di dataset di questo run sono le 840 sugli stati non terminali, più il fetch del catalogo e il fetch di `jogos-do-dia` (today). Non è stato eseguito un kill a metà di questo run: il test di interruzione durante `storeDataset` **non** è stato fatto e non si dichiara superato.

Verifier one-shot sul deploy `dep-db19u88u01pc73dgmck0` (live 20:47:23 Europe/Rome, poi disattivato). Log `FUTPYTHON_PHASE1_VERIFY` alle 20:47:19 Europe/Rome: 6 check, 0 fail. In `fpt_certification_checks` (fase `FPT_PHASE1`), tutti `pass`:
- `DEDUP_australia/a-league/2020-2021` (20:47:16 Europe/Rome);
- `DEDUP_austria/bundesliga/2020-2021` (20:47:17);
- `DEDUP_belgium/jupiler-pro-league/2020-2021` (20:47:18);
- `UNAVAILABLE_404_SAMPLE` (20:47:18);
- `AVAILABLE_DATASET_SAMPLE` (20:47:19);
- `MULTI_SEASON_SAMPLE` (20:47:19).

I tre `DEDUP_*` hanno riscaricato e persistito di nuovo: snapshot e versioni invariati (`changed=false`). Un verifier precedente, alle 17:54 Europe/Rome, aveva `MULTI_SEASON_SAMPLE` in fail sul catalogo non espanso; non è lo stato corrente.

Dopo il verifier è andato live un terzo deploy dello stesso commit, `dep-db19vb5g1s2s7398372g` (finito 20:49:40 Europe/Rome, trigger API). Non ha rilanciato il verifier. Le variabili d'ambiente non sono state lette né modificate da questa PR.

Scansione log runtime Render del servizio `matchpilot-test` sulla finestra 20:10–21:15 Europe/Rome (boot backfill, verifier e deploy successivo): nessuna occorrenza di `api_key=`, `postgres://`, `postgresql://`, `DATABASE_URL` o `FUTPYTHON_API_KEY`. Nessun token Telegram (cifre:token) nelle righe esaminate. Esito scansione: **PASS**.

Quella evidenza non chiudeva il test di interruzione. La issue #12 restava aperta.



### FASE 1 — verifica post-merge (2026-10-04, 22:27 Europe/Rome)

PR #35 è mergiata in `222be65bf5775e1687de4bf6f2798cde92efbf68`. Deploy Render `dep-db1bbujtqb8s7396dg50` live alle 22:24:50 Europe/Rome. Commento di verifica: issue #12, FPT-PR-01 VERIFIED REAL.

Riletto dopo il deploy, non copiato dalla PR:

- `GET /healthz` HTTP 200, `status=ok`;
- `GET /api/data-health` `status=ok`, activeDatasets 1027, datasetsWithErrors 0, nessun run nuovo;
- `GET /api/futpython-certification`: catalogo 1027, available 615, unavailable_404 412, error_real 0, unknown 0, undefined_states 0, duplicate_catalog_keys 0, snapshots 615, historical_versions 161398;
- Neon: migrazione `007-fpt-request-ledger.sql` applicata, run `running` 0, righe di ledger dopo il deploy 0, nessun 429;
- boot senza backfill. `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` false;
- secret scan dei log di boot: PASS.

Il SIGTERM live del drill è fra i dataset, nel delay di 5 secondi. Il rollback a metà `storeDataset` resta provato solo su Postgres locale.

### FASE 2 — classificazione terminale persistente

La classificazione non è un calcolo solo al momento della GET. La migrazione `008-fpt-dataset-classification.sql` aggiunge su `fpt_dataset_state` le colonne `classification`, `classification_reason`, `http_disposition`, `first_success_at`, `last_success_at`, `last_error_at`, `last_http_status` e `provider_path`, e le riempie dalle righe già presenti senza riscaricare i dataset. `first_seen_at` e `last_seen_at` restano su `fpt_catalog`. `last_synced_at` resta sulla riga di stato.

Stati persistiti: `AVAILABLE`, `UNAVAILABLE_404`, `ERROR_REAL`, `DEPRECATED`, `REMOVED`. `http_disposition` è `INITIAL_404` oppure `REGRESSION_404`. Un 404 iniziale resta `unavailable_404` e il backfill lo salta. Una regressione 404 resta `availability=error` (ritentabile) con `classification=ERROR_REAL` e `http_disposition=REGRESSION_404`: non viene sigillata come unavailable. Un dataset assente dal catalogo diventa `REMOVED` con `active=false`; `active=false` da solo non è la classificazione.

Il sync scrive gli stessi campi a ogni esito. Il gate letto dall'intero catalogo, non da un sottoinsieme, è `classified_total === catalog_total`, `unclassified = 0` e `duplicate_catalog_keys = 0`. Lo espongono `/api/futpython-certification` (`phase2`) e `node src/jobs/futpython-classify-phase2.mjs`. Non chiamano FutPythonTrader. Il budget richieste di PR #35 non cambia.

I numeri del gate su Neon production sono nel commento della PR, dopo la migrazione applicata dal job e prima del deploy del sito. Non sono inventati in questo paragrafo.

### FASE 3 — integrità raw → parser → DB e identità squadra

L'audit non riscarica FutPythonTrader. Rilegge il payload gzip già salvato e lo confronta con il parser e con `fpt_match_versions`. Controlla collisioni di `match_key`, collisioni di `provider_match_id` solo se la stessa id descrive partite diverse, payload duplicati, CSV malformato, header/riga di larghezza diversa, Home/Away/Date mancanti, `row_count` contro righe parser e contro righe DB, snapshot orfani, versioni orfane, date non interpretabili e payload vuoto. Uno snapshot già completo che ha meno versioni del proprio `row_count` riceve solo le righe mancanti: il gzip e l'hash non vengono riscritti.

`Match_ID` nel CSV non entra nella `match_key` storica, che resta `fpt:hash:` quando il codice non ha riconosciuto `Id`. Il valore viene copiato in `provider_match_id` se non crea una collisione di identità. La stessa partita presente in due dataset (per esempio Eredivisie ed Eerste Divisie) resta due `match_key`, con la stessa identità, e non è una collisione.

La migrazione `009-fpt-team-identity.sql` crea `fpt_teams` e `fpt_team_aliases`. `internal_team_id` è stabile su paese e nome normalizzato: case, punteggiatura e il suffisso paese `(XXX)` non creano una seconda squadra. La competizione resta contesto, non una seconda identità. Il CSV non ha un id squadra provider: `provider_team_id` resta nullo. Alias, abbreviazioni e nomi storici stanno sulla stessa entità. `first_seen` e `last_seen` vengono dalle date partita. La provenance registra la sorgente. Il gate SQL è esposto da `/api/futpython-certification` (`phase3`) e da `node src/jobs/futpython-audit-phase3.mjs`. I numeri del campione reale stanno nel commento della PR, non in questo paragrafo.

### FASE 4 — schema registry e lineage

`fpt_schema_fields` resta la registry. La migrazione `011-fpt-schema-registry.sql` aggiunge `type_history`, `type_collision`, `seasons_seen`, `alias_candidates`, `normalized_field`, `queryable`, `filterable`, `unique_rows_seen`, `source_provider` e `source_kinds`. `rows_seen` resta il contatore cumulativo degli ingest e può superare le righe distinte. `unique_rows_seen` è il numero di match già salvati negli snapshot il cui header contiene il campo: non cresce se lo stesso snapshot viene riletto.

Il gate conta i nomi header distinti in tutti gli snapshot raw, dataset e today, contro `field_name` della registry. Gli alias non vengono tolti dal conteggio. `AH_H_*` e `AH_Home_*` (e `AH_A_*` / `AH_Away_*`) restano due campi, con `alias_candidates` che li collega. Nessun campo raw viene scartato per far tornare l'uguaglianza.

`fpt_field_transforms` e le colonne `source_provider`, `parser_version`, `schema_version`, `transform_version` su `fpt_match_versions` legano ogni valore normalizzato già persistito (`home`, `match_date`, `provider_match_id`) allo snapshot. Il default non riscrive il gzip. Il gate è `phase4` su `/api/futpython-certification` e `node src/jobs/futpython-audit-phase4.mjs`. I numeri reali stanno nel commento della PR.



### FASE 1 — resume drill e budget richieste (testo della PR, prima del merge)

**Stato al momento della PR, prima del merge.** Il kill live e la verifica post-merge sono nella sezione precedente. Questo paragrafo non va letto come lo stato attuale.

Il kill live su Render **non è stato eseguito** in questa PR. Non è stato chiamato FutPythonTrader reale. Non sono state cambiate le variabili d'ambiente del servizio, non è stato fatto un deploy e non è stato avviato un backfill di produzione. `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` non vanno toccati e restano disattivi.

Cosa cambia nel codice:

- uno snapshot non è visibile, e il dataset non diventa `available`, finché snapshot e righe match non sono committati nella stessa transazione. Uno snapshot `ingest_complete=false` non viene sigillato dallo short-circuit sull'hash: il resume finisce le righe mancanti. Gli snapshot già presenti vengono marcati completi dalla migrazione `007`, perché il backfill terminale li ha già chiusi;
- il backfill di default continua a saltare `available`, `unavailable_404`, `deprecated` e `unknown` con snapshot completo. `error` resta ritentabile. Non si cancellano snapshot né versioni e il drill non azzera `last_snapshot_id`;
- SIGTERM/SIGINT fra un dataset e il successivo chiude il run `running` come `partial` con `meta.interrupted=true` prima dell'uscita. Un SIGKILL non è intercettabile: il run successivo riconcilia ancora i `running` rimasti;
- il client è cache-first, deduplica le chiamate identiche in corso, rispetta un budget al minuto e al giorno, limita il backfill a un ritmo più basso, cede il passo a un hold `critical`, onora `Retry-After` sui 429, usa backoff con jitter e un tetto di tentativi, e apre un circuit breaker dopo errori ripetuti (5xx/rete/429, non i 404). Il ledger `fpt_request_ledger` non salva la API key né l'URL completa. Il browser non chiama FutPythonTrader e non esiste un proxy verso il provider.

Limiti, non presentati come piano del fornitore:

- default conservativi di codice, da sostituire quando l'owner conosce la quota reale: `FUTPYTHON_REQUESTS_PER_MINUTE` 20, `FUTPYTHON_REQUESTS_PER_DAY` 2000, `FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE` 8, `FUTPYTHON_MAX_ATTEMPTS` 4;
- un successo già persistito non viene riscaricato. Se la risposta è nel ledger ma lo snapshot non è committato, una nuova GET è ammessa: non si sigilla un buco;
- catalogo e `jogos-do-dia` restano richieste di run, non dataset terminali;
- il drill accetta al massimo 5 chiavi esplicite. Non è stato scelto un elenco di produzione oltre agli esempi già deduplicati in PR #33.

Comando one-off per il processo che l'owner lancerà su Render **dopo il merge di questa PR**, nello shell del servizio, senza modificare le env del servizio e senza `--force`:

```bash
node src/jobs/futpython-sync.mjs --resume-drill-requeue=australia/a-league/2020-2021,austria/bundesliga/2020-2021
FUTPYTHON_SYNC_DELAY_MS=5000 node src/jobs/futpython-sync.mjs --backfill
# SIGTERM a quel processo dopo la prima GET di dataset e prima che esca
node src/jobs/futpython-sync.mjs --backfill
```

Il delay di 5 secondi vale solo per quel processo, così il SIGTERM cade fra i due dataset. Poi il terzo comando riprende solo le chiavi non terminali. Le chiavi sono un esempio già verificato in dedup; l'owner può sostituirle con al massimo cinque chiavi di catalogo. Questo comando non è stato eseguito contro Neon/Render in questa PR.

### Contratto operativo agenti

`CLAUDE.md` e `AGENTS.md` sono sincronizzati con la issue **#12 FPT-CERT**.

Per il lavoro FutPythonTrader:
- una PR alla volta;
- README aggiornato in ogni PR;
- CI verde non basta;
- test reali Render/Neon obbligatori;
- evidenza reale prima del merge/chiusura fase;
- nessuna checklist anticipata;
- `CLOSED / CERTIFIED` solo dopo tutti i gate della #12.


## TotalCorner — certificazione #20

L'integrazione completa TotalCorner è governata dalla issue **#20 — TC-CERT**.

Obiettivi:
- mapping verificato solo sui campionati comuni FutPythonTrader ↔ TotalCorner;
- mirror pre-match dei mercati;
- collector live continuo;
- snapshot temporali di statistiche, eventi e quote;
- archivio storico live proprietario;
- replay deterministico;
- coverage per campo;
- rate limiting/retry/recovery;
- alert nella stessa chat Telegram già usata da FutPythonTrader;
- certificato finale.

Regola: **TotalCorner non può essere dichiarato CLOSED/CERTIFIED finché tutti i gate hard reali della #20 non sono passati.**


## Chiusura delle issue

Le issue vengono dichiarate **CHIUDIBILI** dall'agente solo quando ogni punto del loro contenuto è implementato e verificato. L'agente deve pubblicare un commento finale con checklist ed evidenze, ma lasciare l'issue aperta.

La chiusura viene effettuata dall'owner, salvo autorizzazione esplicita data all'agente per quella specifica issue.


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
