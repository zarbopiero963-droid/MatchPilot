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
Catture a T-24 h, T-6 h, T-1 h, T-15 min (4 per partita), solo per le competizioni attive. Una chiamata `odds?fixture=` restituisce tutti i bookmaker (paginata): il costo API è per partita × cattura × pagine, contato nel budget condiviso dello scheduler (PR scheduler).

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
- Allarme WARN con meno di 15 G liberi su `/`, CRIT con meno di 8 G: lo scheduler si ferma (stato STOPPED, nota "spazio").
- Tetto: `af_odds_snapshots` ≤ 5 GB (configurabile); al superamento, stop delle catture, nessuna cancellazione automatica.
- Metriche giornaliere: righe inserite, righe deduplicate, MB per giorno, budget usato.
