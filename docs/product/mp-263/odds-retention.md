# MP-263 — Politica di conservazione dello storico quote (API-FOOTBALL, PREMATCH)

Stato: **PROPOSTA**. Nessuna applicazione in produzione senza autorizzazione owner. Gli archivi storici congelati (FPT, arch40, backup notturni esistenti) **non vengono mai alterati né eliminati** da questa politica.

## 1. Base di calcolo
- Schema: `af_odds_snapshots` (migrazione 031, PR #282), **una riga per selezione** (fixture × bookmaker × bet × valore × handicap × acquisizione), append-only.
- Dimensione stimata: ~250 B heap + ~250 B per PK, UNIQUE di acquisizione e 3 indici ≈ **500 B/riga** (stima analitica: in produzione non esistono ancora righe da misurare; da ricalibrare con `pg_total_relation_size` dopo 7 giorni).
- Spazio VPS al preflight del 2026-11-02: `/` 58 G, **24 G liberi** (58 %); PG17 `matchpilot_fpt` 68 MB.

## 2. Stime (righe/giorno = partite × catture × bookmaker × selezioni)
| Scenario | Partite/g | Catture/partita | Bookmaker | Selezioni | Righe/g | 30 g | 90 g | 365 g |
|---|---|---|---|---|---|---|---|---|
| Minimo (1X2, O/U 2.5, GG/NG, DC, AH principale) | 40 | 4 | 1 | 20 | 3 200 | ~48 MB | ~144 MB | ~0,6 GB |
| Medio | 60 | 4 | 3 | 60 | 43 200 | ~0,65 GB | ~1,9 GB | ~7,9 GB |
| Ampio (tutti i mercati) | 80 | 6 | 3 | 300 | 432 000 | ~6,5 GB | ~19 GB | **~79 GB (non sostenibile)** |

Con la deduplica (§4) il carico reale atteso è il 30–50 % dei valori sopra. Lo scenario ampio a 365 g supera il disco: **vietato** senza partizionamento + archiviazione fuori linea.

## 3. Frequenza di cattura (PREMATCH)
Catture a T-24 h, T-6 h, T-1 h, T-15 min (4 per partita), solo per le competizioni attive. Una chiamata `odds?fixture=` restituisce tutti i bookmaker (paginata): il costo API è per partita × cattura × pagine, contato nel budget condiviso dello scheduler (PR #287, §9).

## 4. Deduplica
Si scrive una riga solo se `(fixture, bookmaker, bet, valore, handicap)` cambia quota rispetto all'ultima cattura, o se `provider_update_at` avanza. L'ultima cattura prima del calcio d'inizio è sempre conservata (chiusura) anche se invariata, per il PIT.

## 5. Partizionamento e compressione
- Oltre lo scenario minimo: partizionamento **mensile** per `kickoff_at` (richiede una migrazione futura, non la 031). Le partizioni chiuse diventano di sola lettura.
- Partizioni più vecchie della finestra calda: esportazione `COPY` + zstd (atteso 8–12×), checksum SHA-256, copia fuori sede cifrata come gli altri backup; solo dopo verifica di ripristino, eventuale `DETACH` (mai `DROP` senza autorizzazione).

## 6. Conservazione
| Dato | Finestra calda (in DB) | Dopo |
|---|---|---|
| Tutte le catture | 90 g | archivio zstd mensile |
| Catture di chiusura (ultima prima del calcio d'inizio) | 365 g | archivio, mai eliminate |
| Snapshot usati da un backtest | **per sempre**: congelati con hash nel manifest del backtest | mai alterati |
| `af_request_ledger` | 365 g | archivio |

## 7. Backup
I dump notturni (03:30) includono le nuove tabelle; con oltre 1 GB di quote si passa a dump per partizione. Si conservano i SHA256SUMS esistenti; nessun backup o prova di ripristino viene eseguito sulla VPS senza autorizzazione.

## 8. Monitoraggio spazio e limiti di crescita
- Allarme WARN con meno di 15 G liberi su `/` (monitoraggio esterno, non nello scheduler). Sotto la soglia CRIT, 8 G per default (`MP_AF_MIN_FREE_DISK_MB=8192`, configurabile), lo scheduler non avvia la richiesta successiva: esecuzione `STOPPED`, `reason_code` `DISK_LOW`, nota con spazio libero e soglia. Se la misura dello spazio fallisce o non è un numero: `STOPPED` / `DISK_CHECK_FAILED` (fail-closed). Il controllo si ripete prima di ogni task.
- Tetto: `af_odds_snapshots` ≤ 5 GB per default (`MP_AF_MAX_ODDS_TABLE_MB=5120`, configurabile, misurato con `pg_total_relation_size`). Al superamento: `STOPPED` / `TABLE_CAP`, stop delle catture, **nessuna cancellazione automatica**.
- Con il tetto di 5 GB lo scenario ampio (~216 MB/g senza deduplica) si ferma dopo ~23 giorni; il medio (~21,6 MB/g) resta sotto il tetto per tutta la finestra calda di 90 g (~1,9 GB). Il tetto si alza solo con decisione owner dopo il partizionamento del §5.
- Metriche giornaliere: righe inserite, righe deduplicate, MB per giorno, budget usato (`af_scheduler_budget`), esecuzioni e motivi di stop (`af_scheduler_runs`), decisioni per task (`af_scheduler_events`).

## 9. Scheduler: parametri e garanzie (PR #287)
Disattivato per default: parte solo con `MP_AF_SCHEDULER_ENABLED=1` (esattamente `1`) e `MP_AF_DAILY_BUDGET` esplicito. Ogni valore non intero decimale o fuori intervallo lascia lo scheduler disattivato (`CONFIG_INVALID`); da disattivato non apre il database e non chiama nulla. Non esiste alcun avvio automatico (nessun cron, nessun servizio, nessun import dal server).

| Variabile | Default | Intervallo | Effetto |
|---|---|---|---|
| `MP_AF_DAILY_BUDGET` | — (obbligatorio) | 1–100 000 | tentativi al giorno UTC, condivisi tra istanze; abbassarlo ha effetto subito |
| `MP_AF_MAX_REQUESTS_PER_RUN` | nessuno | 1–100 000 | quota per esecuzione (`RUN_QUOTA`) |
| `MP_AF_MIN_INTERVAL_MS` | 1 000 | 100–600 000 | distanza minima tra due tentativi, retry compresi |
| `MP_AF_REQUEST_TIMEOUT_MS` | 15 000 | 1 000–120 000 | timeout per tentativo (richiesta annullata) |
| `MP_AF_MAX_RETRIES` | 2 | 0–5 | retry solo su errori transitori (5xx, rete, timeout) |
| `MP_AF_RETRY_BASE_MS` | 2 000 | 100–60 000 | backoff `base × 2^(n−1)`, massimo 60 s |
| `MP_AF_MIN_FREE_DISK_MB` | 8 192 | ≥ 1 | soglia CRIT del disco (§8) |
| `MP_AF_MAX_ODDS_TABLE_MB` | 5 120 | ≥ 1 | tetto di `af_odds_snapshots` (§8) |
| `MP_AF_DISK_PATH` | `/` | percorso assoluto | filesystem misurato |

- Errori: 429 e quota del provider (`RATE_LIMITED`, `PROVIDER_QUOTA`, errore `requests`) → `STOPPED` / `PROVIDER_QUOTA` senza retry; 401/403, configurazione o ledger non disponibili, errori sconosciuti → `FAILED` / `PROVIDER_FATAL` senza retry; altri 4xx → task saltato (`SKIPPED` / `CLIENT_ERROR`) senza retry; transitori esauriti → `FAILED` / `PROVIDER_UNAVAILABLE`; errore del database o del budget → `FAILED` / `INTERNAL_ERROR`, nessuna richiesta successiva.
- Ogni tentativo, retry compresi, è riservato nel budget prima della richiesta: in caso di crash il budget sovrastima, non sottostima.
- Deduplica: una chiave di task completata in un giorno UTC (`af_scheduler_done`) non si ripete, nemmeno dopo un riavvio; le chiavi ripetute nello stesso run sono saltate.
- Un solo esecutore: `pg_try_advisory_lock(2630032)` sulla sessione dedicata (un pool è rifiutato) e indice unico sullo stato `RUNNING`. Dopo un crash PostgreSQL rilascia il lock; il run rimasto `RUNNING` diventa `ABORTED` / `CRASH_RECOVERED` all'avvio successivo.
- Il client API-FOOTBALL (`client.mjs`) ha già un proprio retry singolo e un proprio budget: nel collegamento reale (PR #283) i due livelli vanno coordinati (per esempio `MP_AF_MAX_RETRIES=0`), fuori da questa PR.
