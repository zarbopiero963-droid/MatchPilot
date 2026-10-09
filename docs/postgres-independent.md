# Independent PostgreSQL certification

PR-C of issue #144 proves that MatchPilot can migrate, start and serve its current API without Render or Neon.

The CI job uses a standard GitHub-hosted runner and an ephemeral `postgres:17` service. It applies all migrations twice, loads a small repository fixture, starts the real backend in isolated `test` mode, calls `/healthz` and `/api/tc/live`, and then reconnects twice to verify deterministic replay and idempotent deduplication.

## Dataset boundaries

`test/fixtures/independent-historical-sample.json` contains only sanitized metadata selected read-only from the MatchPilot Neon project on 2026-10-09. It includes two final FutPythonTrader rows and two provider-confirmed TotalCorner FT rows. No raw provider body, credential, connection string, personal data or production secret is included.

The adjacent `.sha256` file pins the exact bytes committed to the repository. The CI test fails on a hash mismatch, malformed source hashes, a secret-like field, an incomplete migration set, any provider request, a non-local database host, an API-contract mismatch, replay drift or duplicate insertion.

This fixture is a small certification sample, not a complete backup of MatchPilot production and not the frozen trial archive from issue #40. Restore/readback of the complete operational database remains a separate Neon suspension gate.

## Reproduction

Provide only a local PostgreSQL 17 URL and run:

```text
FUTPYTHON_TEST_DATABASE_URL=postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt \
node --test test/postgres-independence.test.mjs
```

The test creates and drops a unique schema. It never accepts a remote database URL and never starts collectors in isolated mode.
