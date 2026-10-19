# V-B1-UI-NO-RAW-TEXT — evidence package

| Field | Value |
|---|---|
| Audit | V-B1: no technical text in the user views (owner decision MP-OWNER-UI-NO-RAW-TEXT-01, requirement MP-WEB-015). Daily Board, Ricerca, shared states and footer; the Browser QA gate fails a user view or the footer that shows technical text |
| Commits | GREEN: 629be0dbb62fcb48394f7a5a75cfe72799598c01 (clean tree, verifier ok). BEFORE: `main` 3521a07ae03c188da6492bdeb7a8c8bf50ba78d7 (Browser QA of the post-merge verification of PR #168, clean tree). RED: the tests of 629be0d with `src/web` of `main` (uncommitted tree, report.json says working_tree_clean false: valid as a RED demonstration, not as gate evidence) |
| Date (UTC) | 2026-10-19; report times: before 18:16:34, GREEN 18:55:35, RED 18:55:47 and 18:56:08 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: 10/10 journeys fail on `main` (footer text); with only the view areas and the new footer added, Daily Board and Ricerca still fail on the owner's examples (lead text, «Partite del 2024-08-02», PROVIDER_TZ_UNDOCUMENTED, FINAL, HOME, HISTORICAL, «dataset:», «Fonte:», raw ISO dates). GREEN: 10/10, verifier ok |

Contents
- `before-main-3521a07/`: Browser QA on `main` before V-B1 (screenshots and traces), the «before» of the comparisons.
- `red-main-web/` and `.log`: the new tests against `src/web` of `main`.
- `red-main-web-areas/`, `.log` and `.patch`: the same, with the patch that only declares the view areas and changes the footer, so the invariant reaches the texts of the views.
- `green-629be0d/` and `.log`: Browser QA on the committed change.
- `comparisons/`: before/after crops (top of the full-page screenshots, derived with PIL; the originals are in the run folders) of the Daily Board cards (step 04), the search results (step 02) and the validation error (step 05), desktop and mobile.
