# Gate delle migrazioni: doppia autorizzazione (F3, MP-MIG-GATE-01)

Mandato owner `MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01`, F3=A. Codice: `src/migration-authz.mjs`,
`src/migrate.mjs`. Test di sicurezza: `test/migration-gate.test.mjs`. Evidenza: `docs/product/mp-263/evidence/mig-gate.md`.

## Regola

In **ogni** modalità (`offline` compresa) un'operazione di migrazione — applicazione, ri-applicazione dopo un
rollback, adozione legacy (F2) — richiede **due autorizzazioni indipendenti**:

| | (a) Owner | (b) Tecnica |
|---|---|---|
| Dove | `db/migration-approvals.json`, nel repository (quindi nella release) | `allow-migrations-<release sha>.json` in `MATCHPILOT_MIGRATION_AUTHZ_DIR` (default `/etc/matchpilot/migration-authz`), **fuori** dalla release |
| Chi la scrive | una PR MANUAL che solo l'owner fa mergiare | root sulla macchina che esegue, dopo il GO |
| Vincolo | operazione + `filename` + `sha256` dei byte esatti (`plan_code` per l'adozione; `revocation_event` per la ri-applicazione), decisione owner `IN_FORCE` del registro, `expires_at` | `release_sha` = commit del codice in esecuzione (cartella `releases/<sha>` di mp-deploy o HEAD git; mai una variabile d'ambiente), `nonce` ≥ 32 hex, validità ≤ 24 h, elenco esatto delle operazioni |
| Sicurezza del file | — | file regolare, non symlink, proprietario uid 0, non scrivibile da gruppo/altri; cartella con le stesse proprietà; fuori dall'albero della release |
| Uso | una sola volta (id registrato) | una sola volta: ogni uso registrato, il token chiuso a fine esecuzione e il file rimosso se il processo può farlo |

Le due non sono soddisfacibili dallo stesso meccanismo: schemi diversi (`mp-migration-approvals-v1`,
`mp-migration-technical-authz-v1`), ciascun loader rifiuta l'altro, posizioni separate (il token dentro la release è
rifiutato). **Nessuna variabile d'ambiente autorizza.** `MATCHPILOT_APPROVED_MIGRATIONS` (D13) resta una condizione
**in più** in modalità `production`. Il file `allow-migrations-<sha>` di `mp-deploy` (gate del deploy, solo presenza) non
cambia e non sostituisce né (a) né (b).

Il commit della release non può stare nel manifest owner (un commit non contiene il proprio hash): l'owner vincola la
**versione del contenuto** (sha256 dei byte), il token tecnico vincola la **release**.

## Comportamento del runner

- Storico verificato prima (F2). Se ci sono pendenti, si decide l'autorizzazione di **tutte** prima di applicarne una.
- Una pendente senza entrambe le autorizzazioni → `MIGRATION_NOT_AUTHORIZED`, evento registrato, **niente applicato**:
  l'avvio dell'app fallisce in modo chiuso e chiaro (anche in offline). Prima di F3, in offline le pendenti si
  applicavano all'avvio.
- Manifest illeggibile o non valido, decisione non `IN_FORCE`, token non sicuro/scaduto/di un'altra release, release
  non determinabile → errore con codice (`APPROVALS_INVALID`, `TOKEN_UNSAFE`, `TOKEN_EXPIRED`,
  `TOKEN_RELEASE_MISMATCH`, …): tutto rifiutato.
- Uso registrato in `schema_migration_authorizations` nella stessa transazione della migrazione: un crash prima o
  durante non consuma nulla; il riavvio può riprovare. Indici unici: un'approvazione o un uso di token non si ripetono.
- Autorizzazione registrata per un file che il registro non conosce → `MIGRATION_STATE_AMBIGUOUS`.

## Rollback e revoca

I file `db/rollback/*.down.sql` marcano la riga del registro `REVOKED` ed emettono l'evento `REVOKED` nella stessa
transazione. Una migrazione revocata:

- **non viene riapplicata ai riavvii** (nemmeno con l'approvazione `apply` originale o un nuovo token `apply`): è
  tenuta (`MIGRATION_REVOKED_HELD`) e l'avvio prosegue;
- blocca una migrazione successiva (`MIGRATION_ORDER_BLOCKED`);
- torna solo con un'approvazione owner `reapply` che cita il `revocation_event` di quella revoca, più un token
  `reapply`, e con gli stessi byte di prima.

Un rollback che cancella solo la riga di `schema_migrations` senza registrare la revoca è uno stato ambiguo, rifiutato
a ogni avvio (fail-closed).

### Integrazione con il down di 031 (PR #282)

Il down di 031 su #282 cancella la riga di `schema_migrations` ma non registra la revoca: con F2/F3 lo stato risultante
è ambiguo (fail-closed, mai riapplicata). Quando #282 e questo stack si incontrano, prima del `DELETE FROM
schema_migrations` del down di 031 va aggiunto lo stesso blocco del down di 030:

```sql
DO $$
BEGIN
  IF to_regclass('schema_migration_ledger') IS NOT NULL THEN
    UPDATE schema_migration_ledger SET status = 'REVOKED', revoked_at = now(), revoke_reason = 'db/rollback/031-apifootball-odds-snapshots.down.sql'
      WHERE filename = '031-apifootball-odds-snapshots.sql' AND status = 'APPLIED';
    IF FOUND THEN
      INSERT INTO schema_migration_events(event, filename, detail) VALUES('REVOKED', '031-apifootball-odds-snapshots.sql', 'db/rollback/031-apifootball-odds-snapshots.down.sql');
    END IF;
  END IF;
END
$$;
```

## Procedura operativa (solo con GO owner; nessuna parte eseguita da questa PR)

1. PR MANUAL dell'owner che aggiunge a `db/migration-approvals.json`, ad esempio:
   `{"id":"MA-030-APPLY-01","operation":"apply","filename":"030-persistence.sql","sha256":"b81e0ca4…6999","decision":"<id IN_FORCE>","expires_at":"<ISO>"}`.
2. Dopo il merge, root crea il token per lo SHA di release:
   `install -d -o root -g root -m 0755 /etc/matchpilot/migration-authz` e
   `allow-migrations-<sha>.json` (`0644 root:root`) con `schema`, `release_sha`, `nonce` (`openssl rand -hex 32`),
   `issued_at`, `expires_at` (≤ 24 h), `operations`.
3. Riavvio dell'app (o `node src/migrate.mjs` dalla release): il runner applica, registra, chiude il token.
4. Rollback: `db/rollback/<file>.down.sql` (registra `REVOKED`); un ritorno richiede un nuovo `reapply`.

Adozione legacy (F2) con F3: piano (`adopt --plan`), approvazione owner `{"operation":"adopt","plan_code":"<codice>"}`,
token con `{"operation":"adopt","plan_code":"<codice>"}`, poi `adopt --confirm <codice> --authorized-by <decisione>`.

## Test e CI

Meccanismo esplicito di test: `MATCHPILOT_RUNTIME_MODE=test` **e** `MATCHPILOT_MIGRATION_TEST_AUTHORIZATION=throwaway-schema`.
È rifiutato in `offline` e `production`, sullo schema `public`, su uno schema con un'autorizzazione reale o con uno
storico adottato; il suo uso è registrato con origine `TEST`. I test del repository lo passano esplicitamente a ogni
chiamata del runner e a ogni server avviato su schemi usa-e-getta; la suite di `mp-deploy` (modalità offline, schemi dei
test) resta coerente. Nessun bypass è attivo in produzione: l'app della VPS gira in `offline` con DB nello schema
`public`.

## Impatto sull'avvio

Dopo il deploy di questo codice un avvio con una migrazione pendente non autorizzata **si ferma** (prima veniva
applicata in offline). Con `mp-deploy` l'healthcheck fallisce e la release precedente viene ripristinata. Con F2, un DB
legacy va adottato prima (adozione che ora richiede la doppia autorizzazione).
