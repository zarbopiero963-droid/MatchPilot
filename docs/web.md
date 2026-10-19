# Web site (R-05, R-06b)

Issue #3, #30 and roadmap #97, R-05 and R-06b. Code: [`src/web/`](../src/web/). Tests: `test/web-e2e.test.mjs`.

## What it is

- **A real, read-only website served at `/`.** `index.html`, `app.js` and `app.css` are static files.
- **Data:** every value on screen comes from the MatchPilot API v1, and the browser computes nothing (MP-WEB-011). The only date arithmetic is calendar navigation (previous/next day), which derives no data value.
- **Menu** (V-B2, D-2): **Oggi** (`#/`, the home page), **Ricerca** (`#/search`) and **Dati** (`#/data`), as in the approved mockup. On a phone the menu is a bottom bar with icons. «Dati» is the technical area: its tabs open Panoramica (`#/data`), Fornitori (`#/providers`), API (`#/endpoints`) and Copertura (`/coverage`). The former address of the Daily Board, `#/board`, still opens Oggi.
- **Sections:**
  - **Stato dei dati**, formerly the Dashboard (`#/data`, R-06b, MP-WEB-013, technical view). One tile per route:
    - service (`/api/v1/health`);
    - data health and FutPythonTrader certification (`/api/v1/providers`);
    - TotalCorner historical, prematch and captured live (`/api/v1/tc/historical`, `/api/v1/tc/prematch`, `/api/v1/tc/live`);
    - FutPythonTrader coverage per league (`/api/v1/fpt/coverage-competitions`), with first and last match date, coverage ratios and status.

    A route that fails turns only its own tile into N/D, with the error code in `data-code` and the tooltip: the view is then partial, not blank. The last sync run of the data health shows its state and end time. Each league's last match date opens Oggi on that day.
  - **Oggi**, the Daily Board (`#/?date=YYYY-MM-DD`, R-06b, MP-WEB-002, home page). The title is «Oggi» for today and «Partite del giorno» for another day. Above the day, the day strip of the mockup: the chosen day and the three before and after it. The matches of a day from `/api/v1/fpt/matches`, in the API's kickoff order across competitions, one compact row each as in the mockup (V-B4); they are not grouped by competition because the API has no grouping (D-4). Each row shows:
    - kickoff, competition and season;
    - teams, and the score, or the state of a match without a final result ("Non iniziata", "Senza risultato");
    - 1X2, Over 2.5 and BTTS odds in labelled boxes;
    - favourite and xG.

    On a desktop the markets sit on the row next to the teams; on a phone they go under the teams, never hidden.

    The time-zone status, result status, phase and dataset key stay on the card as `data-*` attributes, not as text (MP-WEB-015).

    "Carica altre partite" follows `next_cursor`. A day with no stored match is an explicit empty state, and an invalid date is refused before any request.

    «Dati aggiornati: …» shows when the archive was last synchronised: the end of the last FutPythonTrader sync run (`/api/v1/providers`, `data_health.lastRun`), only when that run completed («in parte» when partial) and has a real time. Otherwise nothing is shown: when the last run is running or failed the line disappears even if an earlier run completed, because the API returns only the last run. The matches never wait for this route, which is a heavy diagnostic one: the line is filled in when it answers, and one good answer serves every day viewed for five minutes; a failed answer is not kept.
  - **Ricerca** (`#/search?…`, R-06b, MP-WEB-007). Combined filters on `/api/v1/fpt/search`:
    - team by name (resolved by `/api/v1/fpt/teams`; several teams with the same name are offered as a choice) and venue;
    - competition (from `/api/v1/fpt/competitions`);
    - date range, result, favourite odds and total goals;
    - data quality: `with_odds` (complete 1X2 odds) and `with_xg`.

    The server validates every filter; a refusal names the field in Italian, and the server's message stays in the tooltip. "Altri risultati" follows `next_cursor`; a failed page keeps the rows already shown and offers a retry. On a phone each result reads as a small card, every value after its column title.
  - Fornitori dati (data health and FutPythonTrader certification), API (the v1 registry and legacy routes): **technical views** in «Dati». Every key of the provider tree reads in Italian; the raw key stays in `data-key` and the tooltip, and a key without a label reads as words and is marked (V-B2b). Copertura links to the existing `/coverage` page.
- **Not yet shown:** Match Center, historical replay and PIT backtest (R-07, R-09…R-14).
- **Data used for tests:** one league season ingested through the real FutPythonTrader path (`test/helpers/fpt-seed.mjs`). No production data is read. Against the real archive these views are TESTED, not certified (MP-OWNER-ARCHIVE-FIRST-01).

## Rules

- **No technical text in user views** (MP-OWNER-UI-NO-RAW-TEXT-01, MP-WEB-015). Every view declares its area on `main`:
  - `data-area="user"`: Oggi, Ricerca, the not-found page;
  - `data-area="technical"`: Stato dei dati, Fornitori dati, API.

  A user view shows none of these: API codes, parameter names, identifiers, dataset keys, routes, raw ISO dates, provenance lines, diagnostic messages, or explanatory text under titles. What it does not print stays in `data-*` attributes and tooltips, and in the technical views.
  - The Browser QA gate fails a user view, or the page header or footer, that shows such text (`technicalText` in `tools/qa/browser-qa.mjs`), and any view with lead text (`.lead`). The patterns are a safety net: each text of the inventory names the test that checks it.
  - Every view declares its area, checked for every menu item and every tab of «Dati» (journey `general-navigation`).
  - The inventory of every text of the site, its class and the PR that handles it is [docs/qa/ui-text-inventory.md](qa/ui-text-inventory.md).

- **Missing values** (`null`, absent or an empty string) are shown as **N/D**, never as `0` (MP-WEB-005).
- **Numbers are shown exactly as the API sends them.** Every digit is kept, the integer part is grouped by thousands with a dot and the decimal point becomes a comma, for JSON numbers and for exact decimal text alike (odds arrive as `"1.450"` and read `1,450`). Nothing is rounded in the browser.
- **Dates** are calendar dates (`YYYY-MM-DD`) from the API, independent of the server time zone. User views show them in Italian (`giovedì 1 agosto 2024`, `01/08/2024`), without shifting the day.
- **Instants** (ISO timestamps with a zone) are shown in Europe/Rome with the offset, and the exact UTC is in the tooltip (D-7). A kickoff time whose zone the provider does not document is shown as written, with a plain tooltip.
- **Codes** from the API (result state, favourite side, phase, coverage and route status) are shown in Italian; the code stays in `data-code` and the tooltip.
- **Explicit states** (MP-WEB-010):
  - loading (`role=status`);
  - empty;
  - partial: a section is missing from the payload, a dashboard tile's route failed, or a next page failed (rows already shown stay);
  - error: the title «Dati non disponibili», a plain message and a "Riprova" button; the error code from the v1 envelope stays in `data-code` and the tooltip.

  A view never stays blank and never shows stale success: a later navigation always wins over an earlier view still loading.
- **No HTML injection:** API text is inserted with `textContent` only.
- **Identity** (V-B3, D-1): the tokens of the approved mockup (charcoal surfaces, amber accent `#FFB547`), its logo, and its typefaces hosted with the site: Manrope for text, Barlow Condensed for titles, JetBrains Mono for numbers. The fonts are Latin subsets in WOFF2 under the SIL Open Font License 1.1, with their licenses and sources in `src/web/fonts/README.md`; no font is requested from another origin. The login page and `/coverage` use the same palette with system fonts.
- **Security headers** on every shell file:
  - CSP: `default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
  - `X-Frame-Options: DENY`;
  - `Referrer-Policy: same-origin`;
  - `Permissions-Policy`;
  - `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`.

  There is no inline code and no external resource.
- **With owner login enforced** (R-04, `docs/auth.md`), the shell is protected like every other route. Opening it without a session leads to `/login`, and a successful login returns to the page.
  - If the session ends while the page is open, the next API call leads to `/login` with the current view in `next`, including the `#/…` part.
  - On first opening, the browser never sends the `#/…` part to the server, so that redirect returns to `/`.
- **Layout:** works on desktop (1280×800) and mobile (390×844) viewports, with no horizontal scroll (MP-WEB-009).

## Browser end-to-end tests

`test/web-e2e.test.mjs` starts the real server on a throwaway PostgreSQL schema. It drives Chromium or Chrome with `playwright-core`, an exact-pinned dev dependency that only the tests import. The `matchpilot-test` service (suspended since 2026-10-09) builds with `npm install --omit=dev`, so it would not be installed there. `render.yaml` still declares plain `npm install`; even then the server never loads it.

The browser is found through `MATCHPILOT_E2E_CHROME` or known local paths. CI uses the runner's preinstalled Chrome, so no browser is downloaded. Without a browser the test is skipped locally and fails in CI.

The tests check:
- the values on screen equal the API responses;
- `null` values read N/D;
- the endpoint table has the same count as the API;
- the loading, error, retry and partial states;
- the unknown route;
- no console errors, page errors or CSP violations;
- no horizontal overflow at both viewports;
- the login → shell flow with auth enforced;
- R-06b: dashboard tiles, Daily Board cards and search rows equal the API (same order, same digits, N/D for missing values), the coverage link to the Daily Board, pagination to the end, team/venue/quality filters, unknown team, server-refused filter, empty results, a partial dashboard and a failed next page with retry;
- no raw `null`, `undefined` or `NaN` text on any page.

On failure, a screenshot is saved and its path is printed.

Writing these tests exposed a real defect in the R-04 login page. Its `Referrer-Policy: no-referrer` made Chrome send `Origin: null` on the form POST, so the owner's own login was refused (403). The fix:
- the login page now uses `same-origin`;
- the origin check accepts the browser-set `Sec-Fetch-Site: same-origin`, which a page cannot forge.

## Security lane

- CI runs `npm audit --omit=dev --audit-level=high` on every PR. A high or critical production finding fails the build. `npm audit --audit-level=high` including dev dependencies also reported 0 when this PR was written.
- Secrets stay in the environment, and the governance checks scan for closing keywords. The broader hardening of #32 (CSP and HSTS on every legacy page, per-user rate limits) remains phase 14.
