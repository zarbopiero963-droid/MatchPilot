# Persistence migration — VPS preflight and GO/NO-GO (priority 4)

**Status: preflight tool only. No migration file, no change to the VPS.** Owner decision
MP-PERSISTENCE-232-NEXT-20261023: before any migration file of [the persistence plan](persistence-plan.md) is created,
the real VPS state is verified read-only and reported without credentials, followed by one GO/NO-GO report: [persistence-go-no-go.md](persistence-go-no-go.md), with the commands of the authorized
operations in [persistence-runbook.md](persistence-runbook.md).

## Why the owner runs it

The agent has no channel to the VPS. The self-hosted runner's guard (`mp-runner-guard`, enforce mode) admits only the
pinned deploy job, so no workflow can run a command there, read-only or not. The preflight is therefore a script in
the repository that the owner runs as root. It writes nothing and prints one JSON report to standard output.

## Step 1 — read-only preflight (owner, root, no authorization needed beyond running it)

```sh
cd /srv/mp-deploy/current
node tools/vps/persistence-preflight.mjs > /root/persistence-preflight-$(date -u +%Y%m%dT%H%M%SZ).json
```

What it does (`tools/vps/persistence-preflight.mjs`, tested by `test/persistence-preflight.test.mjs`):
- **Services:** `systemctl show` of `matchpilot-app.service` and `matchpilot-fpt-worker.service`: load and active state,
  every environment file in load order, and only these settings: `MATCHPILOT_RUNTIME_MODE` (with the effective mode, `offline` when unset),
  `MATCHPILOT_BACKGROUND_ENABLED`, `MATCHPILOT_APPROVED_MIGRATIONS`, `FUTPYTHON_CRON_ENABLED`, `DATA_WATCHDOG_ENABLED`,
  `TOTALCORNER_ENABLED`, `NODE_ENV`. A unit systemd cannot show is reported with its `error` and no mode.
- **Database actually used:** of each `DATABASE_URL`, scheme, host, port, database name and user, plus whether a
  password is set. The password and the full URL are never printed.
- **Database content**, inside one `BEGIN READ ONLY` transaction with a 60 s statement timeout, then `ROLLBACK`:
  PostgreSQL version, database size, schemas, every table and view with the planner's row estimate and size, exact
  counts of `schema_migrations` and the FPT history tables (each statement in its own savepoint, so one failure is
  reported without hiding the others; a 5 s lock timeout so it never waits behind a migration), foreign keys, triggers, the applied migrations, the
  privileges of the app's role, and whether any persistence table already exists.
- **Deploy state:** the current release, the migration files it carries (`release_migrations`), the migration ledger
  `migrations.sha256` (present, number of files), any `allow-migrations-*` / `allow-rollback-*` file, the FREEZE flag.
- **FPT facts recovery (#233):** `factsGap` (facts rows, duplicates, hidden and stale matches, history size and digest,
  last refresh) and the last five `fpt_sync_runs`, read inside the same READ ONLY transaction.
- **Backups:** last PG17 nightly directory, `matchpilot-staging-backup` service result and timer, presence of
  `RESTORE-PG18-STAGING.md`, `pg_lsclusters`.

An env file or the migration ledger that cannot be read is reported (`readable` / `error`), never a crash. The tests run
the script only with `--self-check`, which prints a fixed marker and reads nothing, because on the VPS the deploy runs
the test suite.

The owner sends the JSON back (it holds no secret; review it before sharing). The agent then writes the GO/NO-GO report.

## Step 2 — GO/NO-GO criteria (evaluated by the agent on the JSON)

| # | Criterion | GO when |
|---|---|---|
| 1 | App mode | `effective_runtime_mode` of the app is `offline` (owner decision: keep it) |
| 2 | Database | the app's `DATABASE_URL` is local (`127.0.0.1`/`localhost`/socket) and names the database the owner confirms |
| 3 | Same database | the worker writes to the same database (expected) or the difference is explained |
| 4 | Schema | every repository migration up to the current release is in `schema_migrations`; no persistence table exists yet |
| 5 | Dependencies | no foreign key or trigger references the planned table names |
| 6 | Privileges | the app role can `CREATE` in its schema (needed by `migrate()`), and nothing else changes |
| 7 | Backup | staging backup service `Result=success`, timer enabled, restore document present |
| 8 | Deploy state | no stale `allow-migrations-*` file; FREEZE off; ledger present |

Any failed criterion is a NO-GO with its cause. A missing unit state, a unit `error`, a missing database entry or a
statement `error` is a NO-GO for the criteria that need it, never a GO by default.

## Step 3 — operations that need the owner's final authorization (not run by the preflight)

Listed in the GO/NO-GO report with exact commands; none is run before the owner authorizes it:
1. **Manual dump** of the operational database (`pg_dump -Fc`) and its SHA-256: it reads only, but it uses disk and is
   the backup the migration relies on.
2. **Restore drill** into a new throwaway database on the VPS (creates a database), with row counts compared with the
   dump's, then the drill database dropped.
3. **Dry run** of the migration on that restored copy, recording the schema diff (only new objects expected).
4. **Merge of the migration PR** and the root file `allow-migrations-<sha>`: not authorized in this phase
   (MP-PERSISTENCE-232-NEXT-20261023).

The `production` mode switch is not part of this procedure (not authorized in this phase).
