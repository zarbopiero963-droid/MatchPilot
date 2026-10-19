# V-B3-IDENTITY — evidence package

| Field | Value |
|---|---|
| Audit | V-B3 (MP-OWNER-AUTONOMOUS-UI-ROADMAP-01, D-1): identity of the approved mockup. Tokens (charcoal surfaces, amber accent #FFB547), logo, typefaces hosted with the site (Manrope, Barlow Condensed, JetBrains Mono, Latin WOFF2 subsets under SIL OFL 1.1), font-src 'self', hover and focus states; login and /coverage in the same palette |
| Commits | GREEN: 34c0cfeaa29b9abf622ae60dae8239443cbde61d (clean tree, verifier ok). BEFORE: `main` 2ebe1a080bcbce3c5b2b3edce66bd31f4b542064 (Browser QA of the post-merge verification of PR #171). RED: general-navigation and search of 34c0cfe with app.css, index.html and static.mjs of `main` (uncommitted tree: a RED demonstration, not gate evidence) |
| Date (UTC) | 2026-10-19; report times: before 22:26:44, GREEN 22:33:13, RED 22:33:34 |
| Environment | Claude Code cloud container (Linux), PostgreSQL 16 throwaway schema with the QA archive, Chromium 141.0.7390.37, desktop 1280×800 and mobile 390×844 |
| Outcome | RED: general-navigation fails on desktop and mobile (no font-src in the CSP, no local font); search passes (unchanged). GREEN: 10/10, verifier ok |

Contents
- `before-main-2ebe1a0/`: Browser QA on `main` before V-B3.
- `red-main-web/` and `.log`: the new tests against the shell files of `main`.
- `green-34c0cfe/` and `.log`: Browser QA on the committed change.
- `comparisons/`: before/after crops of the first screen (derived with PIL; the originals are in the run folders): Oggi cards on desktop and mobile, search results, Stato dei dati, the home page on a phone.
