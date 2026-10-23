# Persistence of paper positions, ledger, strategies and saved backtests — plan (priority 4)

**Status: PLAN, nothing applied.** This document prepares the additive migration of roadmap priority 4
(MP-AUTONOMOUS-AUTOMERGE-20261023, MP-PRIORITY7-STRATEGIES-20261023). It adds no migration file. The migration PR comes
after it, and its production application needs the owner's actions listed in [Owner actions](#owner-actions). The agent
never creates the VPS authorization file.

## What is persisted and why

Today the paper ledger (`src/ledger/paper-ledger.mjs`), the configurable strategies (`src/hist/strategy-def.mjs`) and
the backtest reports live only in memory. Nothing survives a restart, and no strategy or simulation can be saved
(#34, #99).

| Table | Content | Rule |
|---|---|---|
| `paper_ledger_entries` | one row per ledger entry: `account_id`, `seq`, `type`, the entry as canonical JSON, `entry_sha256`, `recorded_at` | append-only, primary key `(account_id, seq)`, `seq` contiguous from 1 |
| `paper_ledger_keys` | idempotency keys: `account_id`, `key`, `fingerprint`, entry seqs | append-only, primary key `(account_id, key)` |
| `strategy_definitions` | immutable `mp-strategy-def-1` definitions: `strategy_id` (`def:<16 hex>`), the normalized definition, `definition_sha256` | append-only; the id is the content hash, so a row never changes |
| `strategy_versions` | #34 versioning: stable `strategy_key`, `version`, `strategy_id`, name, `created_at`, `superseded_at` | rows are added; the only update is setting `superseded_at` once |
| `saved_backtests` | a saved report as produced (JSON with its `report_sha256`), the request parameters, `strategy_id`, `dataset input_sha256`, `code_version`, name, `created_at` | append-only |

Positions are **not** stored as a table. They are rebuilt by replaying the entries, as they are today, so the
entries stay the single source of truth and there is no second truth to reconcile.

## Migration properties

- **Additive only:** `CREATE TABLE IF NOT EXISTS` and new indexes. No existing table, column, constraint or row is changed.
- **Append-only enforced by the database:** `BEFORE UPDATE OR DELETE` triggers raise on the append-only tables. The only
  UPDATE allowed on `strategy_versions` sets `superseded_at` from NULL. The application re-verifies `entry_sha256` on
  every replay.
- **Compatibility (D13):** the code running before the migration never reads these tables, and the code after it works
  with them empty. Persistence stays off until the tables exist; until then the routes that need them answer
  `503 UNAVAILABLE`, as R-04b does for authentication. So deploying the code before the migration is safe.

## How the VPS deploy treats a new migration (verified in `infra/vps/sbin/mp-deploy`)

- **Deploy guard:** a commit that adds a file under `migrations/` compared with the running release ends with
  `BLOCKED_MIGRATION` unless root created `$STATE/allow-migrations-<sha>` for **that commit**. The release in
  `current` stays where it was.
- **Consequence for later merges:** every later merge still carries the new file compared with the running release,
  so every later deploy is blocked too, until the authorization exists for the commit being deployed. **The migration
  PR is therefore merged only when the owner is ready to authorize it.** Until then the code PRs keep the persistence
  path disabled and add no migration file.
- **Second key:** even after the guard lets the release through, the server applies the file only when its exact name
  is listed in `MATCHPILOT_APPROVED_MIGRATIONS` (`src/migrate.mjs`, D13).

## Backup and verification before applying

1. **Nightly backup:** the nightly PG17 backup is present and verified: `dr_coverage_check.py` reports the last NIGHTLY
   less than 26 h old and `SHA256SUMS` OK.
2. **Manual backup:** a manual `pg_dump -Fc` of `matchpilot_offline` is taken right before applying, and its SHA-256 is
   recorded in the checkpoint of the migration.
3. **Restore drill:** that dump is restored into a throwaway database on the VPS, and the row counts of every existing
   table are compared with production.
4. **Dry run:** the migration is applied to the restored copy, and the schema diff is recorded. It must contain new
   objects only.

## Rollback

- **Drop the new tables:** they have no dependants, so
  `DROP TABLE saved_backtests, strategy_versions, strategy_definitions, paper_ledger_keys, paper_ledger_entries;`
  restores the previous schema exactly, and the code falls back to the disabled path. Rows written after the
  migration are exported with `COPY … TO` before a drop.
- **Worst case:** restore the dump of step 2.

## Impact

- **Services:** DDL touches new tables only, so no lock is taken on existing data. The worker restarts through the
  ordinary deploy.
- **Storage:** grows only with what the owner saves. A report is JSON of a few tens of KB.
- **Out of scope:** the FPT collector and the frozen history are not touched.

## Tests the migration PR must add

- The append-only triggers refuse UPDATE and DELETE; `superseded_at` can be set once.
- A replay from the table equals the in-memory ledger: the oracle compares `accountState` after every operation of
  seeded random sequences, as `test/ledger-perf.test.mjs` does.
- Restart: entries are written, the process restarts, the replay gives the same state.
- Idempotency: the same key applied twice gives `ALREADY_APPLIED` and no second row; concurrent appends conflict on
  `(account_id, seq)`.
- A saved backtest reloads byte-identical (same `report_sha256`), and a saved strategy reloads with the same `def:` id.
- An additive-only schema diff check runs against a database migrated to main.

## Owner actions

1. Approve this plan, or change it.
2. When the migration PR is ready, merge it only when you can act on the VPS. Then:
   - verify the backup (steps 1–3);
   - create as root `$STATE/allow-migrations-<merge sha>`;
   - add the file name to `MATCHPILOT_APPROVED_MIGRATIONS`.
3. The ordinary deploy then applies it, and the agent verifies the deploy log and health as for every PR.
