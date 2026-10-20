# V-B4-DAILY-BOARD — evidence package

| Field | Value |
|---|---|
| Audit | V-B4 (MP-OWNER-AUTONOMOUS-UI-ROADMAP-01): compact Daily Board rows and day strip of the approved mockup (UI-14, UI-22), markets kept under the teams on a phone; search results as cards on a phone (UI-44); no grouping by competition (D-4, the API has none); the font check requires each weight to be served by its own face (PR #172 review R2-NB-1) |
| Commits | GREEN: fe8eba23dff22ca8e6c6dca494084b87cd3a5afb (clean tree, verifier ok). BEFORE: `main` f36cc469a1127b3161175e20ccda28aea30bc7fb (Browser QA of the post-merge verification of PR #172). RED (uncommitted trees on e453497, demonstrations, not gate evidence): `red-main-web` = new journeys with app.js and app.css of `main`; `red-main-css` = new journeys and new app.js with app.css of `main`; `red-font-700` = the change with the Barlow Condensed 700 `@font-face` rule removed |
| Date (UTC) | 2026-10-19; report times: before 22:58:20, RED 23:05:05, 23:05:50, 23:05:52, GREEN 23:09:00 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: daily-board and search fail on both viewports with the code of `main` (no day strip, no results table class); with only the CSS of `main`, daily-board desktop fails (teams and markets not on one line) and search mobile fails (column titles not beside the values); without the 700 rule general-navigation fails (700 served by the 800 face). GREEN: 10/10, verifier ok |

Contents
- `before-main-f36cc46/`: Browser QA on `main` before V-B4.
- `red-main-web/`, `red-main-css/`, `red-font-700/`: the RED runs above (report and screenshots; the console logs were not kept, the reports hold every step and failure).
- `green-fe8eba2/`: Browser QA on the committed change.
- `comparisons/`: before/after crops derived with PIL from the full-page screenshots of the run folders: Oggi on desktop and mobile, Oggi on mobile with the non-final states, search results on desktop and mobile.
