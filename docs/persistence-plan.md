# Persistence of paper positions, ledger, strategies and saved backtests — plan (priority 4)

**Status: PLAN, nothing applied.** This document prepares the additive migration of roadmap priority 4
(MP-AUTONOMOUS-AUTOMERGE-20261023, MP-PRIORITY7-STRATEGIES-20261023). It adds no migration file. The migration PR comes
after it, and its production application needs the owner's decisions and actions in [Owner actions](#owner-actions).
The agent never creates the VPS authorization file.

**Sources of the facts below.** Code is read in this repository. The VPS state is *declared*: the 2026-10-22 audit
reports it (`docs/governance/audits/2026-10-22-MP-GLOBAL-AUDIT/C-code.md`, evidence 6344141373), and the agent has no
access to the VPS. The owner confirms that state before step 1 of the procedure, with the read-only preflight of
[persistence-preflight.md](persistence-preflight.md) (owner decision MP-PERSISTENCE-232-NEXT-20261023).

## What is persisted and why

Today the paper ledger (`src/ledger/paper-ledger.mjs`), the configurable strategies (`src/hist/strategy-def.mjs`) and
the backtest reports live only in memory: nothing survives a restart, and no strategy or simulation can be saved
(#34, #99).

| Table | Content | Rule |
|---|---|---|
| `paper_ledger_entries` | one row per ledger entry: `account_id`, `seq`, `type`, the entry as canonical JSON text, `entry_sha256`, `recorded_at` | append-only; primary key `(account_id, seq)`; `seq` must be `max(seq)+1` for the account, checked by a trigger inside the inserting transaction |
| `paper_ledger_keys` | idempotency keys: `account_id`, `key`, `fingerprint`, entry seqs | append-only; primary key `(account_id, key)`; written in the same transaction as its entries |
| `strategy_definitions` | immutable `mp-strategy-def-1` definitions: `strategy_id` (`def:<16 hex>`), the normalized definition as text, the full `definition_sha256` | append-only; a conflict on `strategy_id` is accepted only when `definition_sha256` is equal (the id is a 64-bit prefix) |
| `strategy_versions` | #34 versioning: stable `strategy_key`, `version`, `strategy_id`, name, `created_at`, `superseded_at` | rows are added; the only update sets `superseded_at` once |
| `saved_backtests` | a saved backtest or comparison response as produced, stored as **text** (not `jsonb`, which reorders keys), with its report hash or hashes (an array for a comparison), the request parameters, `strategy_id`(s), dataset `input_sha256`, `code_version`, name, `created_at` | append-only |

Positions are **not** a table. They are rebuilt by replaying the entries, as today, so the entries stay the single
source of truth.

**Requirements carried by the migration PR:**
- **Canonical fingerprint:** the in-memory idempotency fingerprint is `JSON.stringify` of the arguments, and `scope`
  and `market` are not canonical (`paper-ledger.mjs`). Before it is persisted it becomes the canonical JSON
  (`canonicalJson`), so that after a restart the same request is not taken for a conflicting one
  (`IDEMPOTENCY_CONFLICT`).
- **Exact reload:** a reloaded backtest must be byte-identical to the saved one, with the same `report_sha256`.

## Staged schema and store (PERSIST-STORE-01)

- **Schema:** `db/staged/030-persistence.sql`, outside `migrations/`: `migrate()` and the deploy guard do not see it, so
  merging it blocks no deploy. The migration PR moves it, unchanged, to `migrations/030-persistence.sql`; that move is
  the only step that needs the owner's authorization.
- **Store:** `src/persistence/store.mjs`. Until the schema is applied every call fails with `PERSISTENCE_UNAVAILABLE`
  (the API answers 503), and nothing is created on the fly.
  - Ledger: `createAccount`, `applyToLedger(client, account, operation, args)` (any paper-ledger operation, run on the
    stored ledger under a per-account advisory lock, on one dedicated connection: a pool or a connection already in a
    store transaction is refused, new entries and keys appended in the same transaction),
    `loadLedger` (rows re-verified: hash, contiguous seq, seq and type inside the entry).
  - Strategies: `saveStrategy` (same rules under the same key: no new version; new rules: version + 1, the previous one
    superseded once; a new name for the same rules is also a new version, never an edit in place), `loadStrategy`,
    `listStrategies`.
  - Backtests: `saveBacktest` (the result object as text, every report's engine seal re-verified), `loadBacktest`
    (byte-identical, hash re-verified).
- **Canonical fingerprint:** the ledger's `scope` is now built in the fixed scope order, so the persisted idempotency
  fingerprint does not depend on the caller's key order; `market` already was.

## HTTP API (PERSIST-API-01)

`src/api/persistence-api.mjs`, wired in `src/server.mjs`. Until the schema is applied every route but the status answers
503 `UNAVAILABLE`.

| Route | Method | What it does |
|---|---|---|
| `/api/v1/persistence/status` | GET | `{available, writes_enabled, writes}`: whether the schema is applied; `writes_enabled` (MP-UI-PR-003) is true only with the schema and the owner login enforced, and is what the page reads to offer a save; `writes` keeps the operator's wording |
| `/api/v1/strategies` | GET | the current strategies; `?key=` one strategy with `versions` (its history) and `rules` (the request fields of that version, null when a request cannot express it), `&version=` a given version. Private (MP-UI-PR-006, #34, D12-18): an owner session is needed also when auth is off — 403 `READS_REQUIRE_AUTH` with auth off, 401 without a session |
| `/api/v1/strategies` | POST | `{key, name, definition}` or `{key, name, rules}`: 201 `SAVED` (new version) or 200 `UNCHANGED`. `rules` (MP-UI-PR-003) are the request fields of a configurable backtest as text (selection, side, prices, team, venue): the server builds the definition the backtest itself uses, so a page saves what it simulated without computing anything |
| `/api/v1/backtests/saved` | GET | `?id=`: the saved result, `response_text` byte-identical and `result` parsed. Without `id` (MP-UI-PR-003): the list, newest first, without responses (`backtest_id, kind, name, report_sha256, input_sha256, strategy_ids, created_at`), `?limit=` 1–200, default 50 |
| `/api/v1/backtests/saved` | POST | `{name, kind: BACKTEST\|COMPARE, params}`: the server runs the same `/api/v1/hist/backtest` or `/compare` request and saves its own result (201 `SAVED`, 200 `ALREADY_SAVED`); the backtest's own refusals (400, 429 `BUSY`, 503) come back unchanged |
| `/api/v1/ledger/account` | GET | `?account_id=`: the paper account state rebuilt from the stored entries |

**Reads** follow the rest of `/api/v1`: behind the owner session when `MATCHPILOT_AUTH=enforce`.

**Writes** need all of the following, checked before the body is parsed and before any database access:
- `MATCHPILOT_AUTH=enforce` and an owner session with the `write` permission. With auth off there is no anonymous
  write: 403 `WRITES_REQUIRE_AUTH`.
- A same-origin request (`Sec-Fetch-Site` / `Origin`, the login rule), else 403 `ORIGIN_NOT_ALLOWED`; and
  `Content-Type: application/json`, else 415. The session cookie is also `SameSite=Strict`.
- A JSON object body of at most 64 KiB (413 beyond), with only the listed fields (400 `UNKNOWN_FIELD`) and no query
  parameters.
- The body is read (at most 64 KiB, the rest is never buffered) before the gate answers; a body cut at the limit always
  ends with `Connection: close`, whatever the answer, so no half-read connection stays open.
- Query texts (`key`, `account_id`, `id`, `version`) are validated before any database access. Only database
  connection failures answer 503; any other SQL error is 500 `INTERNAL`.
- `ALREADY_SAVED` keeps the first record's name and parameters and names the record (`backtest_id`, `kind`).

**Not exposed: paper-ledger writes.** Opening a position needs the operating mode (DEC-001: ACTIVE_OPERATIONAL,
ADVISORY_ONLY, PAUSED, ARCHIVED), and no server-side source of that mode exists yet; a mode sent by the client could
bypass STOP. Exposing ledger operations waits for an owner decision on where the mode comes from.

## Migration properties

- **Additive only:** `CREATE TABLE IF NOT EXISTS`, the trigger functions of the new tables, and new indexes. No
  existing table, column, constraint or row changes.
- **Append-only enforced by the database:** `BEFORE UPDATE OR DELETE` row triggers and `BEFORE TRUNCATE` statement
  triggers raise on the append-only tables. The only UPDATE allowed on `strategy_versions` sets `superseded_at` from NULL.
  This covers data changes (DML). The app role owns the tables (`migrate()` creates them), so it could still
  `ALTER TABLE … DISABLE TRIGGER`; that is not prevented, it is detected: every stored entry, definition and response is
  re-verified against its SHA-256 when it is read (`LEDGER_CORRUPT`, `STRATEGY_CORRUPT`, `BACKTEST_CORRUPT`).
- **Compatibility:**
  - The code running before the migration never reads these tables.
  - The code after it keeps persistence off and answers `503 UNAVAILABLE` until the tables exist (the R-04b pattern).
  - On the VPS the code and the migration arrive in the same release, so this pattern only covers a database where
    the migration is held, i.e. a `production`-mode process without approval.

## How migrations reach the VPS database (verified in code, VPS state declared)

1. **Deploy guard (`infra/vps/sbin/mp-deploy`).** A commit that adds a file under `migrations/`, compared with the
   running release, ends with `BLOCKED_MIGRATION` unless root created `$STATE/allow-migrations-<sha>` for **the commit
   being deployed**, and `current` is not switched. Consequences:
   - **Later merges are blocked too:** they still carry the new file compared with the running release, and so do
     hotfixes.
   - **Only the tip of main deploys:** a commit that is no longer the tip ends with `SUPERSEDED`, so the SHA to
     authorize is the tip at the moment of the deploy (the merge SHA only if nothing else lands after it).
   - **The migration PR is merged only when the owner is ready to authorize it.** The code PRs before it add no
     migration file.
2. **Server.** `src/server.mjs` calls `migrate()` at start, and `src/migrate.mjs` applies pending files:
   - **in `production` mode**, only those listed in `MATCHPILOT_APPROVED_MIGRATIONS` (D13), stopping at the first
     unlisted one;
   - **in `offline` mode**, every pending file.
3. **Declared VPS state.** The app runs in `offline` mode on the definitive PG18 database `matchpilot_staging`, and the
   worker runs in `production` mode. **So on the VPS the allow file is today the only key:** once the guard lets the
   release through, the app applies the migration when it restarts. `MATCHPILOT_APPROVED_MIGRATIONS` is a second key
   only if the owner first switches the app to `production` mode, which is an owner decision (see
   [Owner actions](#owner-actions)).

## Backup and verification before applying (database: PG18 `matchpilot_staging`)

1. **Staging backup checked:** `dr_coverage_check.py` reports "PG18 staging data local 01:30" OK (state OK, less
   than 26 h old) and the offsite copy verified less than 8 days old.
   - Restore procedure: `/srv/matchpilot/infra/staging-backup/RESTORE-PG18-STAGING.md`.
   - The PG17 nightly concerns other databases and is not the backup of this migration.
2. **Manual dump:** a `pg_dump -Fc` of `matchpilot_staging` is taken right before applying, and its SHA-256 is recorded
   in the checkpoint of the migration.
3. **Restore drill:** that dump is restored into a throwaway database on the VPS, and the row counts of every existing
   table (FPT tables included) are compared with counts taken at the moment of the dump. The worker keeps writing, so
   production counts move on.
4. **Dry run:** the migration is applied to the restored copy, and the schema diff is recorded. It must contain new
   tables, trigger functions and indexes only.

## Rollback

1. **Normal rollback is roll-forward.**
   - A later release turns the persistence path off (feature flag), and the tables stay, unused.
   - Redeploying an older commit is not possible: after a successful deploy `mp-deploy` records every migration file
     in `$STATE/migrations.sha256`, so a commit without the new file ends with `BLOCKED_MIGRATION_MODIFIED`, besides
     needing `allow-rollback-<sha>`.
2. **Removing the schema objects** (owner decision, after `COPY … TO` of every row written since the migration):
   ```sql
   DROP TABLE saved_backtests, strategy_versions, strategy_definitions, paper_ledger_keys, paper_ledger_entries;
   DROP FUNCTION …; -- the trigger functions created by the migration
   DELETE FROM schema_migrations WHERE filename = '<file>';
   ```
   - Without the last statement `migrate()` would never create the tables again.
   - With it, while the file is still in the release, an app in `offline` mode recreates the tables at its next
     restart. A drop lasts only if a release without the file is deployed. In that case the file must also leave the
     root ledger `migrations.sha256` (a root action), otherwise the guard refuses that release.
   - The simpler choice is to keep the row and the tables, with the code on the disabled (503) path.
3. **Restore of the dump (step 2): last resort, it loses data.**
   - It restores the **whole** database to the moment of the dump, and every write made since then is lost. That
     probably includes FPT data: the worker unit starts after `postgresql@18-staging`, so it likely writes to the same
     database. This is inferred, not declared, and the owner confirms it.
   - It requires stopping the app and the worker, an owner decision, and a later FPT resync from the provider where
     that data is still available.
   - It is not a rollback of this migration alone.

## Impact

- **Services:** DDL touches new objects only, so no lock is taken on existing data. The app applies the file at its
  restart through the ordinary deploy, and the worker is restarted as usual.
- **Failed health check:** `mp-deploy` switches `current` back automatically (`FAIL_HEALTH_ROLLED_BACK`).
  - If the migration SQL fails, `migrate()` rolls it back, the app does not start, and the database is unchanged.
  - If the SQL commits but the health check fails for another reason, the schema stays applied under the old code.
    The tables are unused there, the migration ledger is not updated, and the next deploy needs the allow file again.
- **Storage:** grows only with what the owner saves. A report is JSON of a few tens of KB.
- **Not touched:** the FPT collector and the frozen history.

## Tests the migration PR must add

- The append-only triggers refuse UPDATE and DELETE; `superseded_at` can be set once; a non-contiguous `seq` is refused.
- A replay from the table equals the in-memory ledger: the oracle compares `accountState` after every operation of
  seeded random sequences, as `test/ledger-perf.test.mjs` does.
- Restart: entries are written, the process restarts, the replay gives the same state.
- Idempotency: the same key applied twice gives `ALREADY_APPLIED` and no second row, also after a restart (canonical
  fingerprint). Concurrent appends conflict on `(account_id, seq)`, and the losing transaction writes neither key nor
  entries.
- A saved backtest and a saved comparison reload byte-identical (same hash or hashes); a saved strategy reloads with
  the same `def:` id; a forged id collision is refused.
- An additive-only schema diff check runs against a database migrated to main.

## Owner actions

1. Approve this plan, or change it.
2. Confirm the declared VPS state (app mode and database) and decide the keys:
   - keep the app in `offline` mode, where the allow file is the only key;
   - or switch the app to `production` mode first, so that `MATCHPILOT_APPROVED_MIGRATIONS` is a second key. That is
     a separate change, with its own checks:
     - no migration is pending at the moment of the switch (only pending files need to be listed; listing applied
       ones only logs `MIGRATION_APPROVALS_NOT_PENDING`);
     - `production` lifts the refusal of non-local databases (`src/runtime-safety.mjs`), so the database must stay
       local;
     - `app.env` must not enable `MATCHPILOT_BACKGROUND_ENABLED`, otherwise the app would also start the FPT cron and
       the watchdog, twice with the worker.
3. When the migration PR is ready:
   - merge it only when you can act on the VPS;
   - verify the backup (steps 1–3) and run the dry run (step 4);
   - create as root `$STATE/allow-migrations-<sha of the tip being deployed>`;
   - list the file in `MATCHPILOT_APPROVED_MIGRATIONS` if you chose `production` mode.
4. The ordinary deploy then applies it, and the agent verifies the deploy log and health as for every PR.
