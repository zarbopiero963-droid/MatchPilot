# Runtime isolation

Issue #144 requires the HTTP backend to run independently from provider collectors and scheduled work.

## Modes

`MATCHPILOT_RUNTIME_MODE` accepts only:

- `offline` (default): HTTP/API process with every background service disabled;
- `test`: the same isolation contract for automated tests;
- `production`: permits background work only when `MATCHPILOT_BACKGROUND_ENABLED=true` is also present.

Offline and test modes reject a `DATABASE_URL` whose hostname is not `localhost`, `127.0.0.1`, or `::1`. This prevents an offline/test process from connecting to Neon or another remote database even if a production URL is accidentally injected.

## Isolated services

The background boundary owns FutPython cron and backfill, watchdog/recovery, Telegram connectivity, startup certification, TotalCorner discovery, mapping, prematch, historical, live collector, and every timer they create. The web process always performs migrations on its explicitly supplied database before listening, but isolated modes can only use a local PostgreSQL instance.

## Production reactivation

Production collectors require both variables:

```text
MATCHPILOT_RUNTIME_MODE=production
MATCHPILOT_BACKGROUND_ENABLED=true
```

Absence, misspelling, or any other mode fails closed without starting background work. Provider-specific enable flags continue to apply after this top-level gate. `FUTPYTHON_BACKFILL_ON_START` remains an additional explicit opt-in and must not be enabled on the web service during normal operation.
