# #263 — Migrazione provider: piano preparatorio

Decisioni owner: #263 e MP-OWNER-GO-2026-11-01. In sintesi:

- **API-FOOTBALL** è il provider principale: prima PREMATCH, poi LIVE dove le capacità sono verificate.
- **FutPythonTrader (FPT)** è dismesso come provider operativo. Si conservano storico, provenienza, checksum e prove PIT.
- **TotalCorner (TC)** è solo un candidato LIVE e richiede un benchmark quantitativo. I collector restano spenti.

Questo documento è **solo un piano**. Non è stato fermato nulla, non è stato attivato nulla, non è stata fatta nessuna chiamata a provider e non ci sono stati deploy o spese. Ogni dato marcato NOT VERIFIED non è stato misurato.

Il piano segue l'architettura capability-driven di MP-PRODUCT-100 (`docs/product/mp-product-100/README.md`, sezione D). L'idea è che API-FOOTBALL entri come provider del catalogo delle capacità (MP-CAP-01), non come un secondo insieme di colonne fisse.

## 1. Dismissione FPT: dipendenze operative trovate nel repository

L'inventario è ricavato dal codice e dalla configurazione versionata. Lo stato reale dei servizi sulla VPS **non è verificato**: in questa sessione non c'è un accesso in sola lettura alla VPS.

| Componente | Dove | Cosa fa | Accoppiamento da sciogliere prima dell'arresto |
|---|---|---|---|
| `matchpilot-fpt-worker.service` | `infra/vps/systemd/` | `node src/worker.mjs`: cron FPT `17 */6 * * *` Europe/Rome, **data watchdog**, **alert operativi Telegram** | Watchdog e alert Telegram vivono nello stesso processo del cron FPT. Fermare il worker spegne anche la sorveglianza. |
| `futpython-cron.mjs` | `src/jobs/` | sync incrementale FPT | Si disattiva già con `FUTPYTHON_CRON_ENABLED=false`, una variabile d'ambiente: richiede il GO owner. |
| `data-watchdog.mjs` | `src/jobs/` | alert sulla sorgente `futpython`: `SYNC_STALE` (critical), `DATASET_ERRORS`, `DATA_CONTENT_STALE`, budget, 429 e circuit breaker; **riconciliazione #31 con `catchup`, che avvia una sync di recupero** (`runFutpythonSync({kind: 'recovery'})`) | A cron fermo segnalerebbe `SYNC_STALE` e `DATA_CONTENT_STALE` per sempre. Inoltre **`FUTPYTHON_CRON_ENABLED=false` da solo non garantisce zero chiamate a FPT**: il watchdog vivo può ancora avviare la sync di recupero. Serve una modalità «sorgente dismessa» che spenga sia gli alert FPT sia il recupero. |
| `matchpilot-fpt-liveness.timer`/`.service` | `infra/vps/systemd/` | `scripts/fpt-liveness-probe.mjs` ogni 30 minuti (salta 03:15–04:45): alert `FPT_WORKER_LIVENESS` e `FPT_PERSISTENT_ERRORS`, controlla anche `systemctl is-active` del worker | Va disattivato **prima** di cambiare il worker, altrimenti genera alert. |
| `infra/vps/sbin/mp-deploy` | righe 293 e 311 | `systemctl restart matchpilot-fpt-worker.service` a ogni release e nel rollback | **Un restart avvia anche un'unità fermata o disabilitata (non mascherata).** Ogni deploy successivo riaccenderebbe il worker. Serve una guardia in `mp-deploy` oppure `systemctl mask`: è una modifica del sistema di deploy, MANUAL. |
| `secrets/fpt.env` | VPS | credenziali FPT e chat Telegram (`TG_ENV` in `mp-deploy`, riga 76) | Token e chat Telegram sono letti anche dalle notifiche di `mp-deploy`: togliere il file o le sue righe romperebbe anche quelle. Si tolgono solo le credenziali FPT. |
| `FUTPYTHON_BACKFILL_ON_START`, `FUTPYTHON_PHASE1_VERIFY_ON_START` | `src/background.mjs` | backfill e verifica all'avvio, spenti di default | La checklist della modalità dismessa verifica che restino `false`. |
| `Restart=always` | `matchpilot-fpt-worker.service` | systemd riavvia il worker se termina | Il worker si ferma solo con `systemctl disable --now` (o resta acceso in modalità dismessa), mai con `kill`. |

**Preflight dell'arresto, da approvare come un unico pacchetto GO owner:**
1. Una PR di codice (MANUAL, perché tocca alerting e deploy):
   - modalità `FUTPYTHON_RETIRED=true`, in cui il watchdog non segnala più alcun alert della sorgente FPT (`SYNC_STALE`, `DATASET_ERRORS`, `DATA_CONTENT_STALE`, budget, 429, circuit), **non avvia più la sync di recupero** e continua a sorvegliare tutto il resto;
   - il worker può girare senza il cron FPT;
   - `mp-deploy` non riavvia un'unità disabilitata.
2. Verifica in sola lettura sulla VPS:
   - nessuna sync in corso (`fpt_sync_runs`);
   - ultimo backup e checksum dell'archivio;
   - elenco delle unità attive.
3. Backup finale con checksum, registrato.
4. Operazioni sulla VPS, solo dopo il GO:
   - `FUTPYTHON_CRON_ENABLED=false` oppure `FUTPYTHON_RETIRED=true`;
   - prima `systemctl disable --now matchpilot-fpt-liveness.timer`;
   - poi il worker: riavvio in modalità dismessa (consigliato, il watchdog resta vivo) oppure `systemctl disable --now` più `mask`, se l'owner sceglie di fermarlo del tutto;
   - verifica che `FUTPYTHON_BACKFILL_ON_START` e `FUTPYTHON_PHASE1_VERIFY_ON_START` restino `false`.
5. Verifica dopo l'arresto: nessuna chiamata a FPT (né dal cron né dalla sync di recupero del watchdog, controllata nel `fpt_request_ledger`), watchdog vivo, notifiche Telegram di `mp-deploy` funzionanti, archivio integro.
6. Rollback: riattivare la variabile e il timer. Nessun dato viene cancellato.

## 2. API-FOOTBALL: piano di verifica

**Blocker attuali:**
- in questo ambiente non c'è una chiave API-FOOTBALL;
- dal container i domini `api-football.com`, `api-sports.io` e `v3.football.api-sports.io` rispondono 403, sia la documentazione sia l'API.

Per questo l'inventario delle capacità resta **NOT VERIFIED**: niente viene descritto a memoria.

**Verifica proposta, senza spese e con budget di chiamate dichiarato:**

| Passo | Chiamate | Cosa misura |
|---|---|---|
| `status` | 1 | piano, quota giornaliera, chiamate residue |
| `leagues` (con `coverage` per stagione) | 1–2 | campionati, stagioni e capacità per stagione (eventi, statistiche, formazioni, quote, pronostici, infortuni) |
| `fixtures?date=` (oggi e un giorno passato) | 2 | partite, stati, timestamp |
| `fixtures/statistics`, `fixtures/events`, `fixtures/lineups` su 3 partite concluse | 9 | tipi di statistica ed evento realmente restituiti |
| `odds?fixture=` su 3 partite + `odds/bets` + `odds/bookmakers` | 5 | mercati, selezioni, linee, bookmaker, profondità storica |
| `odds/live` e `fixtures?live=all`, una volta | 2 | capacità LIVE sul piano |

- **Totale:** circa 20–25 chiamate, una sola volta.
- **Risultato:** un file di capacità con provenienza (endpoint, ora, piano) per il catalogo MP-CAP-01.
- **Cosa serve dall'owner:**
  - la chiave come secret dell'ambiente, mai nel codice o nei log;
  - l'accesso di rete ai domini sopra.

  Nessun upgrade di piano.

## 3. TotalCorner LIVE: protocollo del benchmark

- **Prerequisito:** i dati LIVE dei due provider sulle **stesse partite e nelle stesse finestre**.
  - TC è sospeso. Gli snapshot LIVE già archiviati sulla VPS possono servire solo se sono sovrapposti a partite che API-FOOTBALL copre, cosa da verificare.
  - Altrimenti serve una finestra di raccolta parallela, che richiede il GO per riattivare TC. Senza GO il verdetto resta **INSUFFICIENT EVIDENCE**.
- **Abbinamento:** id partita del provider, più data, ora e squadre normalizzate; si conservano solo le partite abbinate VERIFIED.
- **Metriche per provider:**
  - copertura di partite e campionati;
  - statistiche LIVE (insieme e frequenza);
  - dati unici: campi presenti in uno solo dei due;
  - ritardo: differenza tra evento e disponibilità, sugli eventi gol e cartellino con orario noto;
  - freschezza: intervallo tra aggiornamenti;
  - errori e risposte vuote;
  - dati mancanti per campo;
  - stabilità: buchi nelle serie;
  - chiamate consumate e costo.
- **Rapporto:** riproducibile, con gli script e le query versionati e i numeri per campionato e per finestra.
- **Verdetto:** KEEP / DROP / INSUFFICIENT EVIDENCE, con soglie proposte nel rapporto e approvate dall'owner. La decisione operativa resta all'owner.

## 4. Inventario dei 325 nomi di `fpt_schema_fields`

- **Stato:** non eseguito. In questa sessione non esiste un accesso in sola lettura verificabile al database della VPS.
- **Alternativa che non richiede nuovi privilegi:** l'owner esegue sulla VPS questa query in sola lettura, sul database applicativo, e incolla il risultato senza credenziali:

```sql
SELECT field_name, normalized_field, family, inferred_type, datasets_seen, rows_seen, nonempty_seen, unique_rows_seen
FROM fpt_schema_fields ORDER BY field_name;
```

- **Uso del risultato:**
  - classificare ogni campo con la regola MP-PIT-TIMING-01;
  - mappare ogni campo all'equivalente API-FOOTBALL, dove esiste;
  - elencare i campi senza equivalente, che restano solo storici.

## 5. Roadmap PR (coordinata con MP-PRODUCT-100)

| # | PR | Classe | Dipende da |
|---|---|---|---|
| 1 | MP-263-PLAN: questo documento | SAFE | — |
| 2 | MP-CAP-01a: modulo del catalogo delle capacità, puro e indipendente dal provider (id interno, provider, id originale, tipo, unità, operatori, momento, copertura, provenienza), con test; nessuna route. Il momento riusa la classificazione MP-PIT-TIMING-01 senza nuove semantiche, altrimenti la PR è MANUAL | SAFE | #265 (mergiata) |
| 3 | MP-CAP-01b: `/api/v1/capabilities` in sola lettura | MANUAL (nuovo contratto API) | 2 |
| 4 | MP-FPT-RETIRE-01: modalità «sorgente dismessa» per watchdog e worker, `mp-deploy` senza riavvio delle unità disabilitate | MANUAL (alerting e deploy) | — |
| 5 | MP-AF-01: client API-FOOTBALL con budget e limite di chiamate, mai attivo di default, test con fixture registrate | MANUAL (nuovo provider) | 2, chiave |
| 6 | MP-AF-02: esecuzione delle chiamate di verifica (sezione 2) | MANUAL (chiave, rete, quota) | 5 |
| 6b | MP-AF-02b: file delle capacità risultante, come documento ed evidenza | SAFE | 6 |
| 7 | MP-CAP-02: mercati, selezioni e quote dal catalogo | MANUAL (database) | 3, 6 |
| 8 | MP-CAP-03: condizioni AND/OR guidate dal registro | MANUAL (contratto API) | 3, 7 |
| 9 | MP-TC-BENCH-01: script e rapporto del benchmark | SAFE solo su dati già archiviati; una raccolta parallela richiede il GO di riattivazione TC | dati della sezione 3 |
| 10 | Pacchetto operativo VPS: arresto FPT e collector API-FOOTBALL | GO owner unico | 4, 5 |

Le funzioni già mergiate che leggono l'archivio FPT (Ricerca, Oggi, Match Center, Simulazione) restano sullo **storico congelato**. Non aggiungono acquisizioni e passeranno al catalogo con MP-CAP-01b e MP-CAP-02.
