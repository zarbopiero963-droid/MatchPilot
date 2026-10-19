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
| Does a merge to `main` start a production deploy? | `matchpilot-test` (`srv-davpi23ncjis73f9dkbg`, branch `main`, `autoDeployTrigger: commit`) is **suspended by the user** since 2026-10-09T16:58Z. Its last deploy is `353dfc6` (#148, 2026-10-09T15:39Z, live before suspension). The seven merges to `main` since then (#149, #151–#156) created **no deploy**. The other Render service on this repository (`betsapi-trial-collector`) has auto-deploy off, follows another branch and is suspended. | No deploy while the service stays suspended. |
| Are migrations run at deploy? | Yes, when a deploy happens: the server runs `migrate()` before listening. Before this PR every pending file was applied; after it, production mode applies only approved files. | Only approved files from now on. |
| Which migrations does production have? | Render keeps no logs for that period, and the agent has no production database access (by design). The deployed `353dfc6` ran the old `migrate()` (apply all, then listen) and reached `live`, so files `001`–`028` were applied; `migrations/` is identical between `353dfc6` and `main`. | Nothing pending in production (inferred, not observed). |
| Is `main` compatible with the production schema? | The code added since `353dfc6` uses no table or column outside migrations `001`–`028`, and its only writes (`fpt_reprocessing_runs`, migration `020`) are in an explicit audit job, not at startup. CI runs the full chain on PostgreSQL 17. | Compatible. |

**Residual risk:** `matchpilot-test` still has `autoDeployTrigger: commit`. If the owner resumes it, the next merge deploys `main` automatically. With this PR, such a deploy can no longer apply an unapproved migration. Separating merge and deploy entirely means setting the trigger to `off` (deploy by hand) or `checksPass`. That is an owner action in the Render dashboard, and the agent does not change it.

## Migration hardening (MIG-GAP-01 and MIG-GAP-02, resolved)

Both gaps found by the PR #157 reviews were fixed in a dedicated PR under the owner mandate of 2026-10-19. Tests: `test/migration-hardening.test.mjs`. They were written first and failed on the previous code (RED), including a real connection attempt to the overridden host and the concurrent-creation race on `schema_migrations`.

**MIG-GAP-01: the local-database check judges the host `pg` really connects to.**
- **Which host is checked:** `isLocalDatabaseUrl` asks `pg` for its resolved host, so it covers:
  - the URL authority;
  - a `?host=` override (the last value wins);
  - percent-encoded and `socket:` Unix-socket paths.
- **Accepted:** only exact loopback literals (`localhost`, `127.0.0.1`, `::1`) or an absolute socket directory.
- **Refused:**
  - host lists, trailing-dot names, other loopback addresses and `0.0.0.0`;
  - a non-local `?hostaddr=`;
  - a URL with no host of its own, which would leave the choice to `PGHOST`;
  - a non-local `PGHOST` or `PGHOSTADDR`.
- `migrate()` applies the check before opening any connection.
- Production mode is unaffected.

**MIG-GAP-02: `migrate()` is mutually exclusive.**
- **The lock:** `migrate()` takes a session advisory lock (class `MIGRATION_LOCK_CLASS`, key = hash of the current schema) before it even creates `schema_migrations`.
- **Bounded wait:** the wait is limited by `MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS` (default 120 s) and fails closed with `MIGRATION_LOCK_TIMEOUT`. An invalid value fails with `BAD_MIGRATION_LOCK_TIMEOUT`.
- **Release:** the lock is released in `finally`, under the schema and key fixed when it was taken, so a migration that changes `search_path` cannot leak it. The bookkeeping table is schema-qualified for the same reason. A connection whose unlock failed, or that ended in an unknown state, is closed instead of returned to the pool. A clean one is returned with the client check reset.
- **Connection lost mid-migration:** `migrate()` rejects with the driver error instead of crashing the process. The server rolls back the open file and frees the lock with the connection.
- **No schema:** if no schema of the `search_path` exists, `migrate()` fails with `MIGRATION_NO_SCHEMA`.
- **Crashed process:** the migrator sets `client_connection_check_interval` (PostgreSQL 14+). If the process dies during a long statement, the server notices within about a second, rolls back the open file and frees the lock. Without this setting, the transaction and lock would stay held until the statement ended. On older servers the setting is skipped and logged as `MIGRATION_CLIENT_CHECK_UNAVAILABLE`.
- **Verified on a real PostgreSQL, with separate processes:**
  - four concurrent migrators apply each file exactly once;
  - concurrent production migrators apply only the approved file;
  - a held lock times out without touching the schema;
  - a failing file rolls back and frees the lock;
  - a process killed mid-migration leaves no partial table, frees the lock, and a restart applies only the remaining file;
  - a connection cut mid-migration rejects cleanly, with no crash, no partial table and the lock freed;
  - a migration that changes `search_path` still releases the lock;
  - a refused connection fails at once.

**Accepted risk:** any absolute Unix-socket path counts as local. A socket is on this machine, but a proxy socket (for example a cloud SQL proxy) can forward to a remote database. That is the same trust as a loopback tunnel. Offline and test environments must not run such proxies (PR #158 review NB-2).
