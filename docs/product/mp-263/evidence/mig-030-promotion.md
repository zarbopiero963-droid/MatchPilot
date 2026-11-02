# Evidenza F1 — promozione della migrazione 030 (MP-MIG-030-PROMOTE-01)

Mandato owner: `MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01` (F1=A), registrato su main con la PR #295 (70ee74b).
Issue: #288 (MASTER), #263. Stato del gate: **MANUAL** (migrazioni e schema): nessun merge, nessuna applicazione
produttiva, nessun deploy.

## Cosa cambia

| Elemento | Prima (main 70ee74b) | Dopo |
|---|---|---|
| `030-persistence.sql` | `db/staged/` (fuori dal runner) | `migrations/030-persistence.sql`, **byte-identica** (sha256 `b81e0ca4be76712c09e1556a53c112d779d8532f911c16684fa0e50671276999`, git rename 100%) |
| Rollback 030 | assente | `db/rollback/030-persistence.down.sql` (stesso schema del down di 031 in #282: lock consultivo `MPMG`, rifiuto con righe presenti, nessun CASCADE) |
| 031 | `db/staged/` | invariata (la sposta #282) |

Il commento di testa del file 030 ("STAGED, NOT A MIGRATION") resta perché il file è promosso senza cambiare un byte:
l'hash rivisto in `docs/persistence-plan.md` resta lo stesso. Lo stato reale è quello di questa tabella.

Sequenza logica risultante: 001 → 029 → 030 → 031 (031 con #282). Nessuna rinumerazione di migrazioni applicate.

## Preflight sugli ambienti (dubbi documentati)

- **DB operativo VPS (PG18 di staging):** 29 righe in `schema_migrations` (001–029) secondo il manifest del backup del
  29/10 e `docs/persistence-go-no-go.md` riga 4. Non verificato direttamente da questa sessione (nessun accesso VPS).
- **030 applicata a mano:** `docs/persistence-runbook.md` §5 prescrive un dry run di `db/staged/030` **su una copia
  drill**, non sul DB operativo. Nessuna evidenza nel repository che sia stato eseguito, né sul drill né altrove. Il
  dubbio resta: il preflight (`tools/vps/persistence-preflight.mjs`, `persistenceTables.any_present`) deve risultare
  `false` prima del GO. Se fosse `true`, lo scenario D sotto mostra che il runner riapplica 030 senza cambiare schema né
  righe, ma serve comunque la decisione owner (tabelle create da un ruolo diverso, contenuto da verificare).
- **031 applicata prima di 030:** #282 non è mergiata, quindi nessun deploy l'ha portata in `migrations/`; nessuna
  evidenza di un'applicazione manuale (`docs/product/mp-263/vps-preflight-2026-11-02.md` riga 11: atteso "031 assente").
  Se #282 fosse mergiata e applicata prima di questa PR, lo scenario C mostra che 030 si applica dopo 031 con lo stesso
  schema finale.

Condizione di arresto del mandato (030 incompatibile con 031 o con DB migrati in ordine diverso): **non ricorre**.

## Verifiche automatiche nel repository

`test/migration-030-promotion.test.mjs` (statiche + PostgreSQL, saltate senza DB locale fuori dalla CI):

1. 030 in `migrations/`, copia staged rimossa, sha256 invariato; numerazione 001..N contigua, unica, ordine di sort =
   ordine numerico; 030 subito dopo 029.
2. Dipendenze: ogni tabella/funzione a cui 030 fa riferimento è creata da 030 stessa; nessun nome di 030 compare in
   001–029; 030 e 031 non condividono né citano oggetti l'una dell'altra; il down rimuove esattamente 5 tabelle,
   3 funzioni e la riga `schema_migrations` di 030.
3. PostgreSQL, runner reale in processi figli:
   - A. DB vuoto: applicate 001..030 in ordine, rilancio senza effetti.
   - 030 da sola e 031 da sola su schema vuoto: nessuna dipendenza da 001–029.
   - B. DB 001–029 popolato (archivio QA tramite il percorso di ingestione reale): solo 030 applicata, md5 di riga di
     ogni tabella esistente invariato, catalogo esistente conservato, schema finale = scenario A.
   - C. 031 applicata prima di 030: 030 applicata dopo, schema finale identico all'ordine 030→031.
   - D. 030 eseguita a mano con una riga: il runner la registra, schema e riga invariati.
   - Rollback: rifiutato con righe (`ROLLBACK_REFUSED`), con tabelle vuote ritorno esatto allo schema 029, idempotente,
     riapplicazione possibile (comportamento che F3 rende soggetto a nuova autorizzazione).

Test esistenti adeguati: `persistence-store`, `persistence-api`, `web-persistence-contract` (lo stato "senza schema" è
costruito dal runner su una copia di `migrations/` ferma a 029, o dal down di 030), `postgres-independence` (30 righe),
`tools/qa/browser-qa.mjs` (lo schema arriva da `migrate()` all'avvio del server).

## Esecuzioni (2026-11-02, container usa-e-getta locali, Node v22.22.0)

| Comando | PostgreSQL | Esito |
|---|---|---|
| `npm run check` | — | PASS |
| `FUTPYTHON_TEST_DATABASE_URL=…127.0.0.1:5450… node --test` (suite completa) | 17.11 | 825 test: 824 pass, 1 fail (`master-registry`: `code_paths` ancora su `db/staged/030`), corretto in `requirements.jsonl` + manifest; rilancio sotto |
| `node --test test/master-registry.test.mjs test/pr-plan.test.mjs` | — | 17/17 PASS |
| `FUTPYTHON_TEST_DATABASE_URL=…127.0.0.1:5451… node --test test/migration-030-promotion.test.mjs test/persistence-store.test.mjs test/persistence-api.test.mjs test/migration-guard.test.mjs test/migration-hardening.test.mjs` | 18.6 | 37/37 PASS |

Il rilancio della suite completa sull'head finale è riportato nel checkpoint della PR.

## Rollback della PR

Revert del commit: 030 torna in `db/staged/`. Su un DB dove 030 fosse già stata applicata: `db/rollback/030-persistence.down.sql`
(solo con GO owner, dopo backup, tabelle vuote).

## Limiti

- Nessuna verifica sul DB della VPS (fuori mandato); gli stati storici sono simulati su schemi usa-e-getta.
- `postgres-independence.test.mjs` richiede PostgreSQL 17 ed è in conflitto testuale banale con #282 (conteggio 30/31).
