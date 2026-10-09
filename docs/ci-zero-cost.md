# GitHub Actions selective CI

This workflow implements the first transition gate tracked by issue #144. It does not certify Render or Neon for suspension by itself.

## Stable required check

Branch protection should require `CI gate`. That job always runs and fails unless classification, fast checks, and every selected lane succeed. Conditional jobs are never required directly, so a skipped lane cannot bypass the final gate.

## Selection policy

| Change | Automatic lane |
| --- | --- |
| Documentation only | dependency audit and classifier regression tests |
| MatchPilot mock only | fast checks plus targeted mock alignment test |
| Application, API, database, provider, math, trading, replay, MCP, security, test, workflow, dependency, shared, mixed or unknown files | fast checks plus complete PostgreSQL integration suite |

The classifier expands known dependency relationships transitively. Any empty, invalid, failed, mixed, or unknown classification fails closed to the complete suite. This conservative fallback preserves mandatory coverage while the repository develops more independently selectable suites.

## Cost and security controls

- Standard GitHub-hosted runners only; no larger runner or paid external service.
- Pull-request runs cancel obsolete runs for the same PR; main runs are not cancelled.
- Push CI runs only on `main`, avoiding duplicate branch push and pull-request workflows.
- Actions are pinned to immutable commit SHAs with read-only repository permissions.
- `npm ci --ignore-scripts` uses the committed lockfile and the npm cache.
- Jobs have explicit timeouts and receive no production secrets.
- Heavy live/provider certification remains a manual, explicit release gate when a change requires it; it is never represented as passed by this CI.

## Required repository setting

After this workflow is proven green, configure branch protection or the active ruleset to require the exact check name `CI gate`. Repository settings are external state and must be verified separately.
