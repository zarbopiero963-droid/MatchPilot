# V-B2a-HOME-NAV-DATI — evidence package

| Field | Value |
|---|---|
| Audit | V-B2a (MP-OWNER-AUTONOMOUS-UI-ROADMAP-01, D-2, MP-WEB-015): home page Oggi on the Daily Board, menu Oggi · Ricerca · Dati, technical area Dati with tabs (Stato dei dati, Fornitori, API, Copertura), phone bottom bar, Stato dei dati cleanup, update time only from a completed sync run |
| Commits | GREEN: 58f5ebdbb6584ae755099e63782d6fb7ba68f9cf (clean tree, verifier ok). BEFORE: `main` 1a0d1b36a9bc1432b310479721ad35d6db80e78e (Browser QA of the post-merge verification of PR #169, clean tree). RED: the tests of 58f5ebd with `src/web` of `main` (uncommitted tree: a RED demonstration, not gate evidence) |
| Date (UTC) | 2026-10-19 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: 8 of 10 journeys fail on `main` (no home Oggi, no area Dati and its tabs, the search step leaves through the old menu); providers-endpoints passes (its routes are unchanged). GREEN: 10/10, verifier ok |

Contents
- `before-main-1a0d1b3/`: Browser QA on `main` before V-B2a (screenshots and traces), the «before» of the comparisons.
- `red-main-web/` and `.log`: the new tests against `src/web` of `main`.
- `green-58f5ebd/` and `.log`: Browser QA on the committed change.
- `comparisons/`: before/after crops (top of the full-page screenshots, derived with PIL; the originals are in the run folders) of the opening page (desktop, mobile) and of the data view (desktop, mobile), plus after-only crops of the tabs of Dati and of a day of Oggi on a phone.
