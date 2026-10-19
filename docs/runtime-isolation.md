# Runtime isolation

Issue #144 requires the HTTP backend to run independently from provider collectors and scheduled work.

## Modes

`MATCHPILOT_RUNTIME_MODE` accepts only:

- `offline` (default): HTTP/API process with every background service disabled;
- `test`: the same isolation contract for automated tests;
- `production`: permits background work only when `MATCHPILOT_BACKGROUND_ENABLED=true` is also present.

Offline and test modes reject a `DATABASE_URL` whose hostname is not `localhost`, `127.0.0.1`, or `::1`. This prevents an offline/test process from connecting to Neon or another remote database even if a production URL is accidentally injected.

## Isolated services

The background boundary owns FutPython cron and backfill, watchdog/recovery, Telegram connectivity, startup certification, TotalCorner discovery, mapping, prematch, historical, live collector, and every timer they create. The web process runs the migration step on its explicitly supplied database before listening. Isolated modes can only use a local PostgreSQL instance; production mode applies only owner-approved migrations (next section).

## Production reactivation

Production collectors require both variables:

```text
MATCHPILOT_RUNTIME_MODE=production
MATCHPILOT_BACKGROUND_ENABLED=true
```

Absence, misspelling, or any other mode fails closed without starting background work. Provider-specific enable flags continue to apply after this top-level gate. `FUTPYTHON_BACKFILL_ON_START` remains an additional explicit opt-in and must not be enabled on the web service during normal operation.

## Production migrations (owner decision D13)

`render.yaml` deploys every merge to `main` while the service is active (`autoDeploy: true`; see the evidence below) and the server runs `migrate()` at startup, so a merged migration would otherwise reach the production database on the next deploy. Owner decision `MP-OWNER-D13-MIGRATIONS-AUTODEPLOY-20261019` forbids that. In `production` mode:

- a pending migration is applied only when its exact file name is listed in `MATCHPILOT_APPROVED_MIGRATIONS` (comma separated, e.g. `017-owner-sessions.sql`); no wildcards or partial names;
- migrations run in file order and the run stops at the first pending file that is not approved, so a later file is never applied ahead of an earlier one;
- held files are logged as `MIGRATIONS_PENDING_NOT_APPROVED {"held":[...]}` and the process keeps serving with the current schema; each applied file is logged as `MIGRATION_APPLIED <file>`.

Before the owner lists a file, D13 requires a backup, a compatibility check (the running code must work both before and after the migration), a recovery plan and explicit owner authorization. Offline and test modes keep applying every pending migration to their local databases.

The guard fails closed on every path, not only server startup: `migrate()` itself refuses an unknown `MATCHPILOT_RUNTIME_MODE` (for example `prod`) and, in offline/test mode, a non-local `DATABASE_URL`. So `npm run migrate` and the jobs that call `migrate()` (sync, onboarding, audits, reprocessing) cannot apply migrations to a remote database unless they run in production mode, where the approval list applies. An approved name that matches no pending file is logged as `MIGRATION_APPROVALS_NOT_PENDING {"unused":[...]}`, so a mistyped approval is visible.

## Deploy effect of a merge (verified 2026-10-19, PR #157)

Read-only evidence gathered from Render and git before merging PR #157 (owner request of 2026-10-19 under D13). No Render setting, environment variable or database was changed.

| Question | Evidence | Result |
|---|---|---|
| Does a merge to `main` start a production deploy? | `matchpilot-test` (`srv-davpi23ncjis73f9dkbg`, branch `main`, `autoDeployTrigger: commit`) is **suspended by the user** since 2026-10-09T16:58Z. Its last deploy is `353dfc6` (#148, 2026-10-09T15:39Z, live before suspension). The eight merges since then (#149–#156) created **no deploy**. The other Render service on this repository (`betsapi-trial-collector`) has auto-deploy off, follows another branch and is suspended. | No deploy while the service stays suspended. |
| Are migrations run at deploy? | Yes, when a deploy happens: the server runs `migrate()` before listening. Before this PR every pending file was applied; after it, production mode applies only approved files. | Only approved files from now on. |
| Which migrations does production have? | Render keeps no logs for that period, and the agent has no production database access (by design). The deployed `353dfc6` ran the old `migrate()` (apply all, then listen) and reached `live`, so files `001`–`028` were applied; `migrations/` is identical between `353dfc6` and `main`. | Nothing pending in production (inferred, not observed). |
| Is `main` compatible with the production schema? | The code added since `353dfc6` uses no table or column outside migrations `001`–`028`, and its only writes (`fpt_reprocessing_runs`, migration `020`) are in an explicit audit job, not at startup. CI runs the full chain on PostgreSQL 17. | Compatible. |

**Residual risk:** `matchpilot-test` still has `autoDeployTrigger: commit`. If the owner resumes it, the next merge deploys `main` automatically. With this PR, such a deploy can no longer apply an unapproved migration. Separating merge and deploy entirely means setting the trigger to `off` (deploy by hand) or `checksPass`. That is an owner action in the Render dashboard, and the agent does not change it.

## Known gaps (tracked)

**MIG-GAP-01: the local-database check can be overridden by URL parameters (found by PR #157 review, NB-6).**
- **Problem:** `isLocalDatabaseUrl` reads the URL host, but `pg` lets the `host` and `hostaddr` query parameters override it. For example, `postgres://u:p@localhost/db?host=remote` is accepted as local and connects to the remote host. This predates PR #157, and it needs a deliberately crafted URL.
- **Requirement:** the check must use the host and address that `pg` actually connects to: the URL host, `host`/`hostaddr` parameters, and `PGHOST`/`PGHOSTADDR` when the URL has none. Offline/test mode accepts only loopback hosts or a Unix socket path on the local machine. Anything ambiguous is refused.
- **Planned tests:** in offline/test mode,
  - `?host=` and `?hostaddr=` with remote values are rejected;
  - multi-host lists are rejected when any host is remote;
  - `PGHOST` pointing remote is rejected;
  - loopback forms (`localhost`, `127.0.0.1`, `[::1]`) are still accepted;
  - production mode is unaffected.

**MIG-GAP-02: no lock against concurrent `migrate()` runs (PR #157 review NB-4, pre-existing).**
- **Problem:** two processes starting together (overlapping deploys, a job next to the server) can both read the same pending set and apply a file twice. The second run fails on the `schema_migrations` primary key or on non-idempotent DDL.
- **Requirement:** `migrate()` takes a transaction-scoped or session advisory lock (`pg_advisory_lock` on a fixed key) before reading `schema_migrations`, and releases it on every path. Production keeps the approval rule.
- **Planned tests:** on a throwaway PostgreSQL,
  - two concurrent `migrate()` calls on one schema: each file is applied exactly once, and both calls return without error;
  - the lock is released after a failing migration.

Both gaps are scheduled before the first PR that adds a migration (R-04b).
