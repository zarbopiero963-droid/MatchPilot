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

`render.yaml` deploys every merge to `main` (`autoDeploy: true`) and the server runs `migrate()` at startup, so a merged migration would otherwise reach the production database on the next deploy. Owner decision `MP-OWNER-D13-MIGRATIONS-AUTODEPLOY-20261019` forbids that. In `production` mode:

- a pending migration is applied only when its exact file name is listed in `MATCHPILOT_APPROVED_MIGRATIONS` (comma separated, e.g. `017-owner-sessions.sql`); no wildcards or partial names;
- migrations run in file order and the run stops at the first pending file that is not approved, so a later file is never applied ahead of an earlier one;
- held files are logged as `MIGRATIONS_PENDING_NOT_APPROVED {"held":[...]}` and the process keeps serving with the current schema; each applied file is logged as `MIGRATION_APPLIED <file>`.

Before the owner lists a file, D13 requires a backup, a compatibility check (the running code must work both before and after the migration), a recovery plan and explicit owner authorization. Offline and test modes keep applying every pending migration to their local databases. Jobs that call `migrate()` (sync, onboarding, audits, reprocessing) follow the same rule.
