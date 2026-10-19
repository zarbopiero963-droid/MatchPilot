# V-B2b-PROVIDER-LABELS — evidence package

| Field | Value |
|---|---|
| Audit | V-B2b (MP-OWNER-AUTONOMOUS-UI-ROADMAP-01, MP-WEB-015, inventory UI-60): every key of the provider tree in Italian in Fornitori (technical view), raw key kept in data-key; review notes of PR #170 (a failed update answer is not cached, the last sync run never breaks inside a number, the empty-day link and the last sync run row checked) |
| Commits | GREEN: 28ad1aeded6754eff80a8db8ae5894acc9b2581e (clean tree, verifier ok). BEFORE: `main` cd83d02a9b162845ed0d7b15f8f9079160e67364 (Browser QA of the post-merge verification of PR #170, clean tree). RED: the tests of 28ad1ae with `src/web` of `main` (uncommitted tree: a RED demonstration, not gate evidence) |
| Date (UTC) | 2026-10-19; report times: before 21:40:55, GREEN 21:49:19, RED 21:50:46 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: 4 of 10 journeys fail on `main` (providers: keys without labels; daily-board: a failed update answer is kept and the line never comes back). GREEN: 10/10, verifier ok |

Contents
- `before-main-cd83d02/`: Browser QA on `main` before V-B2b.
- `red-main-web/` and `.log`: the new tests against `src/web` of `main`.
- `green-28ad1ae/` and `.log`: Browser QA on the committed change.
- `comparisons/`: before/after crops (top of the full-page screenshots, derived with PIL; the originals are in the run folders) of Fornitori on desktop and mobile, and the last sync run tile after the change.
