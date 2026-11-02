# Evidenze MP-AF-RAW-01 — risposte grezze API-FOOTBALL (P1 della PR #283)

**Mandato owner:** MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01, decisione **P1=A**: una migrazione MANUAL che corregge per intero il difetto P1. Il mandato è registrato su main dalla PR #295 (70ee74b).

**Finding:** thread Codex P1 `4443372780` sulla PR #283, "Persist raw odds responses before normalizing them".

**Requisiti coinvolti:**
- AGENTS.md §9: raw e normalized separati; timestamp del provider e di acquisizione sempre salvati; campi sconosciuti preservati nel raw;
- MP-REQ-1308: collector PREMATCH;
- MP-REQ-0209: snapshot raw immutabili, deduplicati per hash;
- MP-REQ-0219: payload originale e provenienza;
- MP-REQ-0074: nuovi campi del provider senza perdite;
- MP-REQ-0063: ritenzione senza cancellare il raw.

**Stato:** IMPLEMENTATO e TESTATO su PostgreSQL 17 e 18 usa e getta.
- Migrazione **non applicata** in alcun ambiente reale.
- Collector **non attivo**.
- Nessuna chiamata al provider: solo fetch finte.

## Difetto riprodotto (RED)

Il test `MP-AF-RAW-01 (RED on 7f0bc4b)` in `test/apifootball-raw-responses.test.mjs` è stato eseguito su `58185f9`, cioè l'head di #283 `7f0bc4b` più il merge di #282. Il test fallisce con `the client result carries the raw answer`, per tre motivi:
- il client passava a `saveRawResponse` solo la sua proiezione (`response`, `paging`, `results`, `fetched_at`, `status`, `quota`) e perdeva `get`, `parameters`, `errors` e i campi sconosciuti dell'involucro;
- non esisteva una tabella delle risposte grezze;
- gli snapshot non avevano alcun riferimento alla risposta grezza.

Dopo la correzione lo stesso test passa (GREEN).

## Criteri di accettazione → verifica

| # | Criterio | Test (file `test/apifootball-raw-responses.test.mjs` salvo indicazione) | Esito PG17 | Esito PG18 |
|---|---|---|---|---|
| A1 | Corpo grezzo **completo e identico al byte**: involucro con `get`, `parameters`, `errors`, `paging`, campi sconosciuti, spaziature | `client raw record…`, `PG: persistence…` | PASS | PASS |
| A2 | SHA-256 del corpo, ricontrollato dal database (`CHECK body_sha256 = encode(sha256(body),'hex')`); dimensione controllata | `PG: persistence…` (SHA o dimensione falsi → 23514) | PASS | PASS |
| A3 | Tracciabilità: `request_id` del ledger, endpoint, path canonico, `params_hash`, `request_params`, purpose. Il trigger rifiuta una riga raw incoerente col ledger | `PG: persistence…` (path diverso → 23514, nessun ledger → 23503, istante riscritto → 23514) | PASS | PASS |
| A4 | Timestamp senza riscritture: `requested_at` uguale al ledger, `received_at` uguale a `fetched_at` del client e ad `acquired_at` degli snapshot, header `Date` del provider verbatim; tabella append-only | `PG: persistence…` | PASS | PASS |
| A5 | Dedupe idempotente su (`request_id`, `body_sha256`): stessa risposta, risultato in cache e 4 scrittori concorrenti producono una riga sola. Un corpo diverso per la stessa richiesta → 23505, mai sovrascritto | `PG: idempotent dedupe…` | PASS | PASS |
| A6 | Ogni **nuovo** snapshot punta alla sua risposta grezza: senza `raw_id` → 23514; `raw_id` inesistente → 23503; istante, richiesta o risposta d'errore diversi → 23514 | `PG: every new snapshot names…`, test PG del collector | PASS | PASS |
| A7 | Righe già presenti in `af_odds_snapshots` **intatte e leggibili**: stesso relfilenode, stesso `xmin`, stesso hash del contenuto, `raw_id` NULL, vincoli NOT VALID | `PG: rows stored before migration 033…` (5 000 righe inserite prima della 033) | PASS | PASS |
| A8 | Crash a metà (connessione del writer degli snapshot uccisa con `pg_terminate_backend`) → `STORE_FAILED` riportato, raw conservato, zero snapshot parziali. Retry del ciclo senza nuova chiamata entro l'intervallo. `recoverRawOdds` ricostruisce gli snapshot ed è idempotente. Crash durante l'insert raw → `RAW_STORE_FAILED`, nulla normalizzato | `PG: crash between raw answer and snapshots…` | PASS | PASS |
| A9 | Coerenza transazionale degli snapshot: un batch che fallisce non lascia nulla | `test/apifootball-odds-snapshots.test.mjs` (chunks, batch rifiutato) | PASS | PASS |
| A10 | Rollback down: rifiutato con dati (`ROLLBACK_REFUSED`). A vuoto rimuove esattamente la 033, è idempotente e lascia intatti gli oggetti della 031; `migrate()` la riapplica | `PG: rollback refuses data…`, rollback 031 in `apifootball-odds-snapshots.test.mjs` | PASS | PASS |
| A11 | Lock: `ACCESS EXCLUSIVE` su `af_odds_snapshots` fino al commit, mai sul ledger. `lock_timeout` 5 s: con un lettore lungo la migrazione fallisce con 55P03 dopo circa 5 s e non lascia nulla | `PG: locks taken by migration 033…` | PASS | PASS |
| A12 | Errore del provider (`errors` non vuoto) salvato come raw `provider_error`, mai normalizzato. Il corpo resta fuori dalla serializzazione dell'errore | `collector: no raw_id…`, `client raw record…` | PASS | PASS |
| A13 | La chiave API non arriva mai nel record raw | `client raw record…` | PASS | PASS |
| A14 | Backup e restore con `pg_dump -Fc` e `pg_restore` della stessa versione del server | `af-raw-backup-restore.sh` (sotto) | PASS | PASS |

## Comandi e ambiente

- **Data:** 2026-11-02.
- **Container usa e getta:**
  - `mpraw17`: `postgres:17`, 17.11, su 127.0.0.1:5452;
  - `mpraw18`: `mirror.gcr.io/library/postgres:18`, 18.6, su 127.0.0.1:5453.
- **Node:** 22.

```sh
FUTPYTHON_TEST_DATABASE_URL=postgres://matchpilot:matchpilot_local_test@127.0.0.1:5452/matchpilot_fpt \
  node --test test/apifootball-raw-responses.test.mjs test/apifootball-odds-snapshots.test.mjs test/apifootball-prematch-collector.test.mjs
# idem con la porta 5453 (PG18)
bash docs/product/mp-263/evidence/af-raw-backup-restore.sh mpraw17 5452
bash docs/product/mp-263/evidence/af-raw-backup-restore.sh mpraw18 5453
```

Risultati:
- `test/apifootball-raw-responses.test.mjs`: 11/11 su PG17 e 11/11 su PG18;
- insieme ai test della 031 e del collector: 22/22 su ciascuna versione;
- la suite completa del repository su PG17 e `npm run check` sono riportati nel checkpoint della PR.

### Lock osservati da una seconda sessione (pg_locks, PG17 e PG18 identici)

```
af_odds_snapshots: AccessExclusiveLock, ShareRowExclusiveLock, ShareLock, AccessShareLock
af_request_ledger: ShareRowExclusiveLock (FK), AccessShareLock
```

- **Durata:** `migrate()` con 5 000 righe preesistenti ha impiegato 94 ms su PG17 e 127 ms su PG18, avvio del processo compreso.
- **Cosa scala con le righe esistenti:** solo la costruzione dell'indice parziale `af_odds_snapshots_raw_idx` (`WHERE raw_id IS NOT NULL`), che scansiona la tabella senza inserire voci.
- **Cosa non scala:**
  - `ADD COLUMN` nullable senza default è una modifica di catalogo, senza riscrittura;
  - FK e CHECK sono `NOT VALID`, quindi senza scansione.
- **Finestra:** durante la migrazione letture e scritture di `af_odds_snapshots` attendono. Va applicata con il collector spento.

### Crescita del disco (stima, corpi sintetici)

Sono state misurate 1 000 risposte `/odds` sintetiche e deterministiche: 12 bookmaker × 30 mercati × 3-8 esiti, circa 78,6 KB l'una, 76,8 MB di corpi in totale. La misura usa `pg_total_relation_size`, con heap, TOAST e indici.

| Misura | PG17 | PG18 |
|---|---|---|
| tabella per 1 000 risposte | 16,51 MB | 16,51 MB |
| di cui heap / indici | 0,49 / 0,24 MB | 0,49 / 0,24 MB |
| 900 chiamate al giorno (budget proposto PREMATCH) | ≈ 14,9 MB al giorno | idem |
| 30 giorni | ≈ 446 MB | idem |
| 365 giorni | ≈ 5,3 GB | idem |

**Limiti della stima:**
- I corpi sono sintetici: la compressione TOAST (pglz) su risposte reali può essere diversa. Il rapporto osservato qui è di circa 4,6:1.
- La proiezione assume che tutte le 900 chiamate siano `/odds` di quella dimensione. Le `/fixtures` di scoperta non si salvano nel raw.
- La dimensione reale di una risposta `/odds` non è verificata: servirebbe una chiamata reale, non autorizzata.
- La tabella è append-only e non c'è ritenzione: oltre una certa soglia serve una decisione owner sulla politica di conservazione (MP-REQ-0063: mai cancellare il raw senza approvazione).

### Backup e restore

Lo script `docs/product/mp-263/evidence/af-raw-backup-restore.sh` lavora così:
1. migra un database usa e getta;
2. annulla la 033 e inserisce 50 snapshot "storici" senza `raw_id`;
3. riapplica la 033 con `migrate()`;
4. aggiunge 20 risposte grezze e 40 snapshot collegati;
5. esegue `pg_dump -Fc` e `pg_restore --exit-on-error` dentro il container, con il binario della stessa versione del server.

Esito su PG17 (17.11) e PG18 (18.6): **IDENTICAL**. Il confronto copre:
- conteggi;
- verifica SHA-256 ricalcolata dal database;
- md5 di tutti i corpi;
- vincoli ancora `NOT VALID`;
- 4 trigger.

Dopo il restore:
- uno snapshot senza `raw_id` viene rifiutato (`af_odds_snapshots_raw_required`);
- un `DELETE` sulle risposte grezze viene rifiutato (`APPEND_ONLY`).

## Limiti dichiarati

- Una **risposta grezza senza snapshot** è possibile e voluta. Il raw si salva e si committa prima della normalizzazione: se poi la scrittura degli snapshot fallisce, il ciclo si ferma con `STORE_FAILED` e `recoverRawOdds(conn, {since})` rigenera gli snapshot dai byte salvati. Uno **snapshot senza raw** invece è impossibile, perché lo impediscono la FK e il CHECK sulle righe nuove.
- La recovery non è automatica. Lo scheduler futuro (PR #287, draft) dovrà chiamarla prima di ogni ciclo, oppure l'owner la esegue a mano.
- Se la connessione cade **durante** l'insert raw, quella risposta è persa. La chiamata resta contata nel ledger e il ciclo si ferma con `RAW_STORE_FAILED`, quindi non è una perdita silenziosa. Dopo l'intervallo minimo la partita si richiede di nuovo.
- Le risposte `/fixtures` di scoperta non vengono salvate nel raw: non producono dati normalizzati. La tabella è comunque generica (`endpoint`, `family`).
- Le righe di `af_odds_snapshots` scritte prima della 033 restano con `raw_id` NULL. Il loro corpo grezzo non è recuperabile perché non è mai stato salvato. In produzione oggi non esistono righe: la 031 non è applicata.
- `body_exact = false` solo se la risposta HTTP non espone i byte, il che accade solo con alcuni doppi di test. Il `fetch` reale li espone sempre.
