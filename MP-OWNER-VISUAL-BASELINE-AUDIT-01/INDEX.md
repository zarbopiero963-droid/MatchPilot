# MP-OWNER-VISUAL-BASELINE-AUDIT-01 — evidence package

| Field | Value |
|---|---|
| Audit | MP-OWNER-VISUAL-BASELINE-AUDIT-01 (read-only visual audit, mockup vs real site) |
| Capture date (UTC) | 2026-10-19, 13:42:24–13:44:17 (file times); report 13:45:13 |
| Site analysed | `main` 3d8f5c96c73e3eace0436bf83edccfa74d9a183a (src/web), throwaway PostgreSQL 16 schema with the QA archive (test/helpers/fpt-seed.mjs), server in test mode |
| Mockup analysed | docs/mockups/matchpilot-trading-os.html at main 3d8f5c9; approved baseline #103 = 5b39f33 (differences in audit-report.md §1) |
| Browser | Chromium 141.0.7390.37 (playwright-core 1.56.1), viewports desktop 1280×800, mobile 390×844 |
| Environment | Claude Code cloud container, Linux; capture script capture-script.mjs |
| Outcome | report audit-report.md (categories A/B/C/D, owner decisions D-1…D-7 later ratified as MP-OWNER-VISUAL-BASELINE-D1-D7-01) |
| Originals | byte-identical copies of the session files (SHA-256 verified before packaging); nothing regenerated |

Contents: 56 screenshots (6 mockup views and 8 site views × 2 viewports × viewport/full page) and 6 side-by-side comparisons (mockup left, real site right). The 4 comparisons sent in the conversation at the time are marked *sent*; the other 2 (dati-dashboard-mobile, ricerca-desktop) were generated in the same run and not sent.

Note: capture-script.mjs contains the connection string of the throwaway local test database (`matchpilot_local_test`), the same public value used in .github/workflows/ci.yml; it is not a production credential.

| File | Bytes | Width × height | Note |
|---|---|---|---|
| screenshots/mock-backtest-desktop-full.png | 208750 | 1280×1461 |  |
| screenshots/mock-backtest-desktop.png | 125305 | 1280×800 |  |
| screenshots/mock-backtest-mobile-full.png | 178312 | 390×2776 |  |
| screenshots/mock-backtest-mobile.png | 71310 | 390×844 |  |
| screenshots/mock-data-desktop-full.png | 235710 | 1280×1633 |  |
| screenshots/mock-data-desktop.png | 143756 | 1280×800 |  |
| screenshots/mock-data-mobile-full.png | 216747 | 390×2800 |  |
| screenshots/mock-data-mobile.png | 73893 | 390×844 |  |
| screenshots/mock-home-desktop-full.png | 393815 | 1280×2206 |  |
| screenshots/mock-home-desktop.png | 210134 | 1280×800 |  |
| screenshots/mock-home-mobile-full.png | 258907 | 390×3399 |  |
| screenshots/mock-home-mobile.png | 83438 | 390×844 |  |
| screenshots/mock-live-desktop-full.png | 311075 | 1280×2122 |  |
| screenshots/mock-live-desktop.png | 161077 | 1280×800 |  |
| screenshots/mock-live-mobile-full.png | 371012 | 390×5531 |  |
| screenshots/mock-live-mobile.png | 70405 | 390×844 |  |
| screenshots/mock-match-desktop-full.png | 523357 | 1280×2349 |  |
| screenshots/mock-match-desktop.png | 255978 | 1280×800 |  |
| screenshots/mock-match-mobile-full.png | 429330 | 390×5322 |  |
| screenshots/mock-match-mobile.png | 124276 | 390×844 |  |
| screenshots/mock-strategies-desktop-full.png | 237496 | 1280×1375 |  |
| screenshots/mock-strategies-desktop.png | 153667 | 1280×800 |  |
| screenshots/mock-strategies-mobile-full.png | 223954 | 390×2993 |  |
| screenshots/mock-strategies-mobile.png | 73571 | 390×844 |  |
| screenshots/site-board-desktop-full.png | 738045 | 1280×3330 |  |
| screenshots/site-board-desktop.png | 160337 | 1280×800 |  |
| screenshots/site-board-empty-desktop-full.png | 63950 | 1280×800 |  |
| screenshots/site-board-empty-desktop.png | 63950 | 1280×800 |  |
| screenshots/site-board-empty-mobile-full.png | 61084 | 390×844 |  |
| screenshots/site-board-empty-mobile.png | 61084 | 390×844 |  |
| screenshots/site-board-mobile-full.png | 862513 | 390×9859 |  |
| screenshots/site-board-mobile.png | 70328 | 390×844 |  |
| screenshots/site-dashboard-desktop-full.png | 199090 | 1280×1442 |  |
| screenshots/site-dashboard-desktop.png | 118814 | 1280×800 |  |
| screenshots/site-dashboard-mobile-full.png | 201344 | 390×3798 |  |
| screenshots/site-dashboard-mobile.png | 49197 | 390×844 |  |
| screenshots/site-endpoints-desktop-full.png | 583243 | 1280×3851 |  |
| screenshots/site-endpoints-desktop.png | 114510 | 1280×800 |  |
| screenshots/site-endpoints-mobile-full.png | 544740 | 390×8697 |  |
| screenshots/site-endpoints-mobile.png | 64776 | 390×844 |  |
| screenshots/site-providers-desktop-full.png | 372678 | 1280×4729 |  |
| screenshots/site-providers-desktop.png | 69774 | 1280×800 |  |
| screenshots/site-providers-mobile-full.png | 343512 | 390×7321 |  |
| screenshots/site-providers-mobile.png | 45287 | 390×844 |  |
| screenshots/site-search-desktop-full.png | 306514 | 1280×1779 |  |
| screenshots/site-search-desktop.png | 101553 | 1280×800 |  |
| screenshots/site-search-form-desktop-full.png | 65815 | 1280×800 |  |
| screenshots/site-search-form-desktop.png | 65815 | 1280×800 |  |
| screenshots/site-search-form-mobile-full.png | 67398 | 390×1367 |  |
| screenshots/site-search-form-mobile.png | 44217 | 390×844 |  |
| screenshots/site-search-invalid-desktop-full.png | 70948 | 1280×800 |  |
| screenshots/site-search-invalid-desktop.png | 70948 | 1280×800 |  |
| screenshots/site-search-invalid-mobile-full.png | 73327 | 390×1415 |  |
| screenshots/site-search-invalid-mobile.png | 44217 | 390×844 |  |
| screenshots/site-search-mobile-full.png | 249844 | 390×4513 |  |
| screenshots/site-search-mobile.png | 44217 | 390×844 |  |
| comparisons/daily-board-desktop.png | 388402 | 2580×840 | sent in conversation |
| comparisons/daily-board-mobile.png | 174883 | 800×884 | sent in conversation |
| comparisons/dati-dashboard-desktop.png | 277673 | 2580×840 | sent in conversation |
| comparisons/dati-dashboard-mobile.png | 135357 | 800×884 |  |
| comparisons/ricerca-desktop.png | 365652 | 2580×840 |  |
| comparisons/ricerca-mobile.png | 146982 | 800×884 | sent in conversation |
