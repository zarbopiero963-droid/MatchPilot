# Migrazione 031: snapshot quote API-FOOTBALL — preflight (MP-ODDS-MIG-01, MP-NEXT-20261102 punto E)

`db/staged/031-apifootball-odds-snapshots.sql` diventa `migrations/031-apifootball-odds-snapshots.sql`, senza cambiamenti di sostanza. Cambia solo il commento di testata.

**Questa PR non applica nulla alla produzione.** In produzione la migrazione parte solo con due passi espliciti dell'owner:
1. il nome del file in `MATCHPILOT_APPROVED_MIGRATIONS` (`src/migrate.mjs`: senza approvazione la migrazione resta in attesa);
2. il file `allow-migrations-<sha>` di `mp-deploy`, che altrimenti blocca il deploy con `BLOCKED_MIGRATION`.

## Verifiche

| Punto | Esito | Evidenza |
|---|---|---|
| Versione PostgreSQL | testata su **17.11** (container locale) e **16** (istanza locale, PR #275). La CI usa `postgres:17`. **La VPS non è verificata.** L'unità del worker FPT dipende da `postgresql@18-staging.service`: se la produzione è su PostgreSQL 18, va testata prima del GO. | `docs/product/mp-263/pg17-run-2026-11-02.md`, `infra/vps/systemd/matchpilot-fpt-worker.service` |
| Compatibilità dello schema | solo aggiunte: 2 tabelle (`af_request_ledger`, `af_odds_snapshots`), 1 funzione, trigger e indici, tutti con prefisso `af_` o `mp_af_`. Nessuna tabella esistente viene toccata. | file della migrazione |
| Vincoli PIT | il database rifiuta una riga prematch acquisita al calcio d'inizio o dopo, oppure con `update` del provider al calcio d'inizio o dopo o successivo all'acquisizione oltre 5 minuti. | test `MP-ODDS-MIG-01 migration` |
| Indici | `(fixture_id, acquired_at)`, selezione con `acquired_at DESC`, `(market_key, acquired_at)` parziale. La lettura point-in-time usa l'indice. | piano `EXPLAIN` qui sotto |
| Deduplica | una riga per selezione e acquisizione (vincolo unico). Il writer salta un prezzo invariato rispetto allo snapshot precedente della stessa selezione. Un ritorno a un prezzo precedente resta. | test della PR #275 |
| Integrità referenziale | `af_odds_snapshots.request_id` → `af_request_ledger`. Il campo può essere nullo finché un collector non lega le righe. | file della migrazione |
| Idempotenza | `CREATE … IF NOT EXISTS`, `CREATE OR REPLACE`: rieseguire il file non cambia nulla. `migrate()` lo registra in `schema_migrations`. | test (doppia esecuzione) |
| Append-only | `UPDATE`, `DELETE` e `TRUNCATE` vengono rifiutati dal database. | test |
| Prestazioni | vedi la tabella qui sotto | misura locale |
| Impatto sugli archivi esistenti | nessuno: nessuna tabella FPT, TotalCorner o di persistenza viene modificata o letta. | file della migrazione, test di rollback |
| Rollback | `db/rollback/031-apifootball-odds-snapshots.down.sql`: rifiuta di eseguire se una delle due tabelle contiene righe, perché lo storico non si cancella mai con un rollback. Con tabelle vuote rimuove esattamente ciò che la migrazione ha creato e la sua riga in `schema_migrations`. La migrazione si può poi riapplicare. | test `MP-ODDS-MIG-01 rollback` |

## Prestazioni (misura locale, PostgreSQL 17.11, container, nessun tuning)

Carico: 100 partite × 10 bookmaker × 100 selezioni × 5 acquisizioni, con tutti i prezzi cambiati a ogni acquisizione.

| Misura | Valore |
|---|---|
| Righe offerte e inserite | 500 000 / 500 000 |
| Scrittura totale | circa 40 s, cioè circa 80 µs per riga (transazioni da 1 000 righe per acquisizione, lotti da 500) |
| `oddsAsOf` per partita (1 000 selezioni) | circa 21 ms in media su 100 letture |
| Dimensione della tabella con gli indici | 216 MB |
| Piano della lettura point-in-time | `Unique` su `Sort` su `Index Scan using af_odds_snapshots_fixture_idx` |

**Stima per il budget proposto.** Con 900 chiamate prematch al giorno, se ogni chiamata restituisce al massimo circa 1 800 selezioni (il massimo osservato è 1 777 per un bookmaker), il carico resta nell'ordine di 1,6 milioni di righe offerte al giorno. Le righe davvero scritte sono di meno, perché i prezzi invariati vengono saltati. In MB è circa 700 MB al giorno nel caso peggiore.

È una stima, non una misura sulla VPS. La crescita dello spazio va verificata nel preflight della VPS e nel monitoraggio dopo il GO.

## Ancora da fare prima del GO
- Versione PostgreSQL della VPS e prova della migrazione su quella versione.
- Spazio disco e backup prima dell'applicazione.
- Il collector prematch (PR separata) resta spento fino al suo GO.
