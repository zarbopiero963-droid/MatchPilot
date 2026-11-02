# Registro dei checksum delle migrazioni (F2, MP-MIG-CHECKSUMS-01)

Mandato owner `MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01`, F2=A. Codice: `src/migrate.mjs`. Test:
`test/migration-checksums.test.mjs`. Evidenza: `docs/product/mp-263/evidence/mig-checksums.md`.

## Tabelle (create dal runner, additive e idempotenti, sotto il lock `MPMG`)

| Tabella | Contenuto |
|---|---|
| `schema_migrations` | invariata: `filename`, `applied_at` |
| `schema_migration_ledger` | una riga per migrazione: `filename`, `sha256`, `hash_rule`, `hash_origin` (`VERIFIED` / `RECONSTRUCTED_FROM_EVIDENCE` / `UNVERIFIABLE_LEGACY`), `status` (`APPLIED` / `REVOKED`), `applied_at`, `recorded_at`, `code_version`, `evidence`, `revoked_at`, `revoke_reason` |
| `schema_migration_events` | eventi: `APPLIED`, `REAPPLIED`, `REVOKED`, `ADOPTED` e ogni rifiuto con il motivo (`MIGRATION_CHECKSUM_MISMATCH`, …) |

## Regola dell'hash: `sha256-file-bytes-v1`

SHA-256 dei **byte esatti** del file letto dal disco, **senza normalizzazione**: fine riga, BOM, newline finale e
commenti contano. Il runner esegue quegli stessi byte (decodificati UTF-8), quindi l'hash è quello di ciò che è stato
eseguito. Coincide con `sha256sum`, la regola del ledger `migrations.sha256` di `mp-deploy`.

## Verifica (a ogni esecuzione, prima di applicare)

Il runner legge lo storico e lo confronta con il disco. Ogni problema è **bloccante** (eccezione con codice), è
registrato in `schema_migration_events` in una transazione propria e niente viene applicato:

| Codice | Caso |
|---|---|
| `MIGRATION_CHECKSUM_MISMATCH` | file applicato con byte diversi dall'hash registrato (anche un newline); file revocato cambiato |
| `MIGRATION_MISSING` | applicato ma assente dal disco |
| `MIGRATION_RENAMED` | applicato e assente, con un file pendente dagli stessi byte |
| `MIGRATION_STATE_AMBIGUOUS` | `APPLIED` nel registro ma non in `schema_migrations` (rollback senza revoca); `REVOKED` ma presente in `schema_migrations`; riga malformata |
| `MIGRATION_LEGACY_UNADOPTED` | righe di `schema_migrations` senza riga nel registro (DB migrato prima di F2) |

Nessun warning-only, nessun aggiornamento automatico dell'hash, nessuna sovrascrittura. L'applicazione di un file,
la sua riga in `schema_migrations`, la riga del registro e l'evento sono nella **stessa transazione**: un crash non
lascia stati parziali e il riavvio riprende. Comando di sola verifica: `node src/migrate.mjs verify`.

**Rollback:** i file `db/rollback/*.down.sql` marcano la riga `REVOKED` nella stessa transazione del drop. Una
migrazione revocata può tornare solo con gli stessi byte (con F3 serve anche una nuova autorizzazione). Un rollback che
cancella solo la riga di `schema_migrations` lascia uno stato ambiguo, rifiutato a ogni avvio.

## Adozione di un database legacy (esplicita, mai automatica)

Un DB migrato prima di F2 (per esempio il DB operativo della VPS, 001–029) ha `schema_migrations` senza registro: il
runner lo rifiuta (`MIGRATION_LEGACY_UNADOPTED`), anche all'avvio dell'app. **Non si inventano hash**: l'adozione
registra l'hash del file oggi su disco e dichiara da dove viene la fiducia.

1. Piano (sola lettura):
   `node src/migrate.mjs adopt --plan --evidence /var/lib/mp-deploy/migrations.sha256 [--allow-unverifiable]`
   - file presente nell'evidenza con lo stesso hash → `RECONSTRUCTED_FROM_EVIDENCE` (evidenza citata col suo sha256);
   - hash diverso nell'evidenza → rifiuto totale `ADOPT_EVIDENCE_MISMATCH`;
   - file senza evidenza → solo con `--allow-unverifiable`, come `UNVERIFIABLE_LEGACY`;
   - file applicato assente dal disco → `ADOPT_FILE_MISSING`; altri problemi dello storico → rifiuto.
   Stampa un codice di conferma legato a schema, file, hash, origini ed evidenza.
2. Adozione: stesso comando con `--confirm <codice> --authorized-by <id decisione owner>` (senza `--plan`). Un
   cambiamento qualunque fra i due passi cambia il codice e l'adozione è rifiutata.

**L'adozione sul DB operativo richiede un GO owner esplicito** (id da citare in `--authorized-by`), dopo backup, ed è
fuori da questa PR. Con F3 l'adozione passa anche dalla doppia autorizzazione.

## Impatto operativo

- Il primo avvio di questo codice su un DB legacy **fallisce in modo chiuso** finché l'adozione non è fatta: il deploy
  che porta questo codice va preceduto dall'adozione (GO owner). `mp-deploy` riporta l'app alla release precedente se
  l'healthcheck fallisce.
- I test del repository usano solo schemi usa-e-getta; `test/resume-drill.test.mjs` ora ha il suo schema, perché il
  DB di test persistente della VPS ha uno schema `public` migrato senza registro.
