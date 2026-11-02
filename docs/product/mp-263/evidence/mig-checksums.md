# Evidenza F2 — registro dei checksum delle migrazioni (MP-MIG-CHECKSUMS-01)

Mandato owner `MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01` (F2=A), su main da #295 (70ee74b). Issue #288, #263.
PR impilata su F1 (#296). Gate **MANUAL**. Regole e procedura: [`docs/migration-checksums.md`](../../../migration-checksums.md).

## Implementazione

- `src/migrate.mjs`: tabelle `schema_migration_ledger` e `schema_migration_events` create dal runner (additive,
  `IF NOT EXISTS`, sotto il lock `MPMG`); regola `sha256-file-bytes-v1`; `verifyHistory` prima di ogni applicazione;
  applicazione, riga `schema_migrations`, riga del registro ed evento nella stessa transazione; `adoptLegacy`
  (piano → codice di conferma → adozione con id della decisione owner); CLI `verify` e `adopt`.
- `db/rollback/030-persistence.down.sql`: marca `REVOKED` nella stessa transazione del drop.
- `test/resume-drill.test.mjs`: schema usa-e-getta proprio (prima migrava lo schema `public` del DB di test, che su un
  DB di test persistente, come quello della VPS, ha uno storico precedente al registro e verrebbe rifiutato).

## Casi provati (`test/migration-checksums.test.mjs`)

| Caso | Atteso | Esito |
|---|---|---|
| nuova | riga `VERIFIED`, hash = sha256 dei byte, `code_version`, evento `APPLIED` | PASS |
| già applicata / match | nessuna applicazione, nessun rifiuto; `verify` conta 2 | PASS |
| mismatch (un newline in più) | `MIGRATION_CHECKSUM_MISMATCH`, evento con hash atteso/effettivo, hash registrato invariato, pendente non applicata, riavvio rifiutato uguale | PASS |
| mancante / rinominata | `MIGRATION_MISSING` / `MIGRATION_RENAMED` | PASS |
| legacy | `MIGRATION_LEGACY_UNADOPTED`, nessuna pendente applicata, registro vuoto; evidenza errata → `ADOPT_EVIDENCE_MISMATCH`; senza evidenza né `allowUnverifiable` → rifiuto; codice errato, decisione mancante → rifiuto; adozione mista `RECONSTRUCTED_FROM_EVIDENCE` + `UNVERIFIABLE_LEGACY`; dopo l'adozione applica la pendente; file adottato modificato → mismatch | PASS |
| DB popolato (migrazioni reali 001–030 + archivio QA) | registro perso → legacy; adozione dal ledger formato `sha256sum` (come `migrations.sha256` di mp-deploy): tutte `RECONSTRUCTED`; digest di tutte le tabelle invariato | PASS |
| crash (SIGKILL durante una migrazione) | nessuna riga per il file interrotto; il riavvio lo applica | PASS |
| retry | errore SQL → nulla registrato; corretto → applicato | PASS |
| concorrenza (due processi) | un solo `APPLIED` per file | PASS |
| rollback registrato | `REVOKED` → riapplicazione con gli stessi byte (`REAPPLIED`) | PASS |
| rollback non registrato | `MIGRATION_STATE_AMBIGUOUS` a ogni riavvio, mai riapplicata | PASS |
| unit `verifyHistory`, parser evidenza | tutti gli stati distinti, riga malformata → ambiguo | PASS |

## Esecuzioni (2026-11-02, container usa-e-getta, Node v22.22.0)

| Comando | PostgreSQL | Esito |
|---|---|---|
| `npm run check` | — | PASS |
| suite completa `node --test` (`FUTPYTHON_TEST_DATABASE_URL` → 127.0.0.1:5450) | 17.11 | 832 test, 831 pass; l'unico fail (`resume-drill`: `MIGRATION_LEGACY_UNADOPTED` sullo schema `public` migrato dal codice precedente) corretto isolando il test; rilancio del file: PASS |
| `node --test test/migration-checksums.test.mjs test/migration-030-promotion.test.mjs test/migration-guard.test.mjs test/migration-hardening.test.mjs test/persistence-store.test.mjs test/persistence-api.test.mjs` (→ 127.0.0.1:5451) | 18.6 | 44/44 PASS |

## Impatto e rollback

- Un DB legacy (VPS: 001–029) viene **rifiutato** dal primo avvio con questo codice finché l'adozione non è fatta con
  GO owner. È voluto (fail-closed); il deploy di questa PR va preceduto dall'adozione (piano incluso nel pacchetto di
  autorizzazione). Nessuna adozione è stata eseguita su DB reali.
- Rollback della PR: revert. Le due tabelle aggiunte sono additive; il codice precedente le ignora.

## Limiti

- Il registro sta nello stesso DB e può essere alterato da chi ne è proprietario (come `schema_migrations`): protegge
  da modifiche accidentali e da deploy incoerenti, non da un amministratore DB ostile.
- `UNVERIFIABLE_LEGACY` dichiara esplicitamente che il passato non è verificabile: protegge solo da modifiche successive.
