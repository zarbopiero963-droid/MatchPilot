# Web shell (R-05)

Issue #3 and roadmap #97, R-05. Code: [`src/web/`](../src/web/). Tests: `test/web-e2e.test.mjs`.

## What it is

- **A real, read-only website served at `/`.** `index.html`, `app.js` and `app.css` are static files.
- **Data:** every value on screen comes from the MatchPilot API v1. The browser calls `/api/v1/health`, `/api/v1/providers` and `/api/v1/endpoints` and computes nothing (MP-WEB-011).
- **Sections:** Stato (service health), Fornitori dati (data health and FutPythonTrader certification) and API (the v1 registry and legacy routes). Copertura links to the existing `/coverage` page.
- **Not yet shown:** Daily Board, Match Center, historical replay and PIT backtest are visible as "in costruzione" and show no data until their backend is certified (R-06, R-07, R-09…R-14).

## Rules

- **Missing values** (`null` or absent) are shown as **N/D**, never as `0` (MP-WEB-005).
- **Explicit states** (MP-WEB-010):
  - loading (`role=status`);
  - empty;
  - partial: a section is missing from the payload;
  - error: the error code from the v1 envelope plus a "Riprova" button.

  A view never stays blank and never shows stale success.
- **No HTML injection:** API text is inserted with `textContent` only.
- **Security headers** on every shell file:
  - CSP: `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;
  - `X-Frame-Options: DENY`;
  - `Referrer-Policy: same-origin`;
  - `Permissions-Policy`;
  - `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`.

  There is no inline code and no external resource.
- **With owner login enforced** (R-04, `docs/auth.md`), the shell is protected like every other route. Opening it without a session leads to `/login`, and a successful login returns to the page.
- **Layout:** works on desktop (1280×800) and mobile (390×844) viewports, with no horizontal scroll (MP-WEB-009).

## Browser end-to-end tests

`test/web-e2e.test.mjs` starts the real server on a throwaway PostgreSQL schema. It drives Chromium or Chrome with `playwright-core`, a pinned dev dependency that is not installed on Render.

The browser is found through `MATCHPILOT_E2E_CHROME` or known local paths. CI uses the runner's preinstalled Chrome, so no browser is downloaded. Without a browser the test is skipped locally and fails in CI.

The tests check:
- the values on screen equal the API responses;
- `null` values read N/D;
- the endpoint table has the same count as the API;
- the loading, error, retry and partial states;
- the unknown route;
- no console errors, page errors or CSP violations;
- no horizontal overflow at both viewports;
- the login → shell flow with auth enforced.

On failure, a screenshot is saved and its path is printed.

Writing these tests exposed a real defect in the R-04 login page. Its `Referrer-Policy: no-referrer` made Chrome send `Origin: null` on the form POST, so the owner's own login was refused (403). The fix:
- the login page now uses `same-origin`;
- the origin check accepts the browser-set `Sec-Fetch-Site: same-origin`, which a page cannot forge.

## Security lane

- CI runs `npm audit --omit=dev --audit-level=high` on every PR. A high or critical production finding fails the build. `npm audit --audit-level=high` including dev dependencies also reported 0 when this PR was written.
- Secrets stay in the environment, and the governance checks scan for closing keywords. The broader hardening of #32 (CSP and HSTS on every legacy page, per-user rate limits) remains phase 14.
