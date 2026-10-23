# Persistence migration — GO/NO-GO report (priority 4)

**Verdict on 2026-10-23: NO-GO for any operational step (BLOCKED: no real preflight JSON yet).** Code work that adds no
file under `migrations/` continues (MP-PERSISTENCE-CONTINUE-01). This report is re-issued, criterion by criterion, when
the JSON of [the preflight](persistence-preflight.md) arrives; nothing below is declared PASS from code or declared
state alone.

The criteria are the eight of [persistence-preflight.md](persistence-preflight.md) Step 2, read from the repository and
not changed. The commands of the operations the owner authorizes are in [persistence-runbook.md](persistence-runbook.md).

## The eight criteria

| # | Criterion (GO when) | Evidence today | Status | Risk if wrong | Correction if FAIL | Regression test | Acceptance |
|---|---|---|---|---|---|---|---|
| 1 | App mode: `effective_runtime_mode` of the app is `offline` | declared only (2026-10-22 audit); the preflight reports it and gives `null` with an `error` when systemd cannot show the unit | BLOCKED | in `production` mode only `MATCHPILOT_APPROVED_MIGRATIONS` lets a file through, so the apply plan differs | none by the agent: the mode is an owner decision (production not authorized) | `test/persistence-preflight.test.mjs` (unit not shown → no mode) | JSON: app unit `LoadState=loaded`, `effective_runtime_mode = offline` |
| 2 | Database: the app's `DATABASE_URL` is local and names the database the owner confirms | declared PG18 `matchpilot_staging` on 5434 | BLOCKED | a migration applied to the wrong database | owner confirms or corrects the database before any dump | preflight URL tests (no password in the report) | JSON: host `127.0.0.1`/`localhost`/socket; database confirmed by the owner in writing |
| 3 | Same database: the worker writes to the same database, or the difference is explained | inferred from `matchpilot-fpt-worker.service` (`After=postgresql@18-staging`) | BLOCKED | the backup and drill would cover one database and miss the other | explain the split; back up both | env files read in order (worker loads `worker.env` then `fpt.env`) | JSON: one `databases` key with `used_by` holding both units, or two keys explained |
| 4 | Schema: every repository migration up to the current release is applied; no persistence table exists | repository has 29 files (`001`–`029`); release `2cf0463` carries the same | BLOCKED | a pending migration would be applied together with the persistence one | owner investigates the gap before going on | preflight `release_migrations`, `migrations`, `persistenceTables` | JSON: `migrations` = `release_migrations` (29 files), `persistenceTables.any_present = false` |
| 5 | Dependencies: no foreign key or trigger references the planned table names | planned names (`paper_ledger_entries`, `paper_ledger_keys`, `strategy_definitions`, `strategy_versions`, `saved_backtests`) do not appear in `migrations/` | BLOCKED | a name clash would make `CREATE TABLE IF NOT EXISTS` a silent no-op on a foreign table | rename the planned tables | preflight `foreignKeys`, `triggers`, `tables` | JSON: none of the five names in `tables`, `foreignKeys`, `triggers` |
| 6 | Privileges: the app role can `CREATE` in its schema, and nothing else changes | audit declares `GRANT SELECT,INSERT,UPDATE,DELETE` to the app role (#179) — `CREATE` not stated | BLOCKED | `migrate()` would fail at the app restart; the deploy rolls back (`FAIL_HEALTH_ROLLED_BACK`) | owner grants `CREATE` on the schema to the app role, or applies the file as owner of the schema | preflight `schemaPrivileges` | JSON: `schemaPrivileges.can_create = true` |
| 7 | Backup: staging backup `Result=success`, timer enabled, restore document present | declared nightly 01:30 and `RESTORE-PG18-STAGING.md` | BLOCKED | no tested way back | owner repairs the backup service first | preflight `backups` | JSON: `Result=success`, timer `enabled`, `staging_restore_doc_present = true`; plus the runbook dump and drill (step 2 below) |
| 8 | Deploy state: no stale `allow-migrations-*` file; FREEZE off; ledger present | deploys of `92eb96d` and `2cf0463` ended `result=OK` (job logs), so FREEZE was off then | BLOCKED | a stale allow file would let an unreviewed migration through | owner removes a stale file (root action) | preflight `deploy_state` | JSON: `allow_files = []`, `freeze = false`, `migrations_ledger_present = true` |

## FPT facts recovery (#233), verified separately

| Check | Evidence today | Status | Acceptance |
|---|---|---|---|
| The deployed code contains the fix | `DEPLOY_GATE_SHA_OK 92eb96d` and then `2cf0463` (job logs); both commits contain `src/providers/futpython/facts-refresh.mjs` and the callers switched to it | PASS (code) | — |
| Hidden or stale facts are recovered | the sync refreshes the facts only when a run inserts rows (`futpython-sync.mjs`), so with no productive run nothing is recovered yet; synthetic proof in `test/fpt-facts-gate.test.mjs` (legacy state → `runFactsRefresh --apply` → 0 hidden, 0 stale) | BLOCKED (real data) | preflight `factsGap`: `hidden = 0`, `stale = 0`; otherwise the owner-authorized recovery of the runbook, on the drill copy first |
| No duplicates | primary key on `internal_match_id`; measured as `duplicate_ids` | BLOCKED (real data) | `factsGap.duplicate_ids = 0` |
| Raw and versions untouched | the refresh writes only `fpt_match_facts`; the recovery command rolls back on any history change (negative test) | PASS (code), BLOCKED (real data) | runbook history-prefix check on the drill: digest equal |
| The backtest reader no longer misses matches | the reader takes its match list from the facts; the test shows the miss in the legacy state and the match found after recovery | PASS (synthetic) | real: `hidden = 0` |
| Match analysis uses the right version | it reads `fpt_match_facts`; a recovered fact is on the latest admissible version | PASS (synthetic) | real: `stale = 0` |
| Legacy behaviour kept without onboarding | column-by-column equality with the legacy function (test) | PASS (synthetic) | — |

The recovery is **not** declared complete until `factsGap` of the real database shows `hidden = 0` and `stale = 0`.

## Worker FPT and deploys

Each deploy restarts the worker once (`worker_restart=ok`), as every deploy does. The worker stops on SIGTERM after
its current step (`src/worker.mjs`, PR #195) and the next cron (`17 */6`, Europe/Rome) resumes; no PR of this unit adds
any other restart. The preflight `syncRuns` shows the last five runs, so a run cut by a deploy is visible.

## What moves the verdict

- **GO for the backup drill (runbook steps 1–3):** criteria 1, 2, 3, 7, 8 PASS on the JSON and the owner authorizes the
  dump and the drill database.
- **GO for the migration dry run (step 4):** the drill passed and criteria 4, 5, 6 PASS.
- **Applying the migration to the operational database:** not authorized in this phase, whatever the verdict.
