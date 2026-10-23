# Persistence of paper positions, ledger, strategies and saved backtests — plan (priority 4)

**Status: PLAN, nothing applied.** This document prepares the additive migration of roadmap priority 4
(MP-AUTONOMOUS-AUTOMERGE-20261023, MP-PRIORITY7-STRATEGIES-20261023). It adds no migration file. The migration PR comes
after it, and its production application needs the owner's decisions and actions in [Owner actions](#owner-actions).
The agent never creates the VPS authorization file.

**Sources of the facts below.** Code is read in this repository. The VPS state is *declared*: the 2026-10-22 audit
reports it (`docs/governance/audits/2026-10-22-MP-GLOBAL-AUDIT/C-code.md`, evidence 6344141373), and the agent has no
access to the VPS. The owner confirms that state before step 1 of the procedure.

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

## Migration properties

- **Additive only:** `CREATE TABLE IF NOT EXISTS`, the trigger functions of the new tables, and new indexes. No
  existing table, column, constraint or row changes.
- **Append-only enforced by the database:** `BEFORE UPDATE OR DELETE` triggers raise on the append-only tables. The
  only UPDATE allowed on `strategy_versions` sets `superseded_at` from NULL.
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
   table (FPT tables included) are compared with production.
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
   Without the last statement `migrate()` would never create the tables again. The file must also leave the root
   ledger `migrations.sha256`, a root action, otherwise the guard keeps expecting it.
3. **Restore of the dump (step 2): last resort, it loses data.**
   - It restores the **whole** database to the moment of the dump. Every write made since then is lost, including the
     FPT data the worker collects on the same database.
   - It requires stopping the app and the worker, an owner decision, and a later FPT resync from the provider where
     that data is still available.
   - It is not a rollback of this migration alone.

## Impact

- **Services:** DDL touches new objects only, so no lock is taken on existing data. The app applies the file at its
  restart through the ordinary deploy, and the worker is restarted as usual.
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
     a separate change, with its own check that every existing migration is listed.
3. When the migration PR is ready:
   - merge it only when you can act on the VPS;
   - verify the backup (steps 1–3) and run the dry run (step 4);
   - create as root `$STATE/allow-migrations-<sha of the tip being deployed>`;
   - list the file in `MATCHPILOT_APPROVED_MIGRATIONS` if you chose `production` mode.
4. The ordinary deploy then applies it, and the agent verifies the deploy log and health as for every PR.
