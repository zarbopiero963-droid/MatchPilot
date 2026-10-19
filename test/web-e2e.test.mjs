// R-05 (#3, #97): browser end-to-end tests of the real web shell, served by the real server on a throwaway
// PostgreSQL schema. The browser is driven with playwright-core and an installed Chromium/Chrome (no download):
// MATCHPILOT_E2E_CHROME, else known local paths. Without a browser the test is skipped locally and fails in CI.
// On failure a screenshot of the page is saved under the OS temp directory and its path is printed.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {hashPassword} from '../src/auth/owner-auth.mjs';
import {seedEredivisie} from './helpers/fpt-seed.mjs';
import {outcomeShownFor, seasonShown, words} from '../tools/qa/journeys.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const BROWSERS = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const PASSWORD = 'correct horse battery staple 2026';

function browserPath() {
  return BROWSERS.find(path => path && existsSync(path)) || null;
}

async function setup(t) {
  const executablePath = browserPath();
  if (!executablePath) {
    if (process.env.CI) throw new Error('no Chromium/Chrome for the browser E2E tests (set MATCHPILOT_E2E_CHROME)');
    t.skip('no local Chromium/Chrome');
    return null;
  }
  const pg = (await import('pg')).default;
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname), 'remote PostgreSQL is forbidden');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 2000});
  try { await admin.connect(); }
  catch (cause) {
    await admin.end().catch(() => {});
    if (process.env.CI) throw cause;
    t.skip('throwaway postgres unavailable');
    return null;
  }
  try {
    const {chromium} = await import('playwright-core');
    const browser = await chromium.launch({executablePath, args: ['--no-sandbox']});
    return {admin, browser};
  } catch (error) {
    await admin.end().catch(() => {});
    throw error;
  }
}

// PORT=0: the OS picks a free port and the server logs it, so parallel test files never race for a fixed port.
const boundPort = text => Number(/listening on (\d+) /.exec(text)?.[1]);
async function startServer(schema, env = {}) {
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: resolve('.'),
    env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!/listening on/.test(output) && child.exitCode == null && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
  if (!/listening on/.test(output)) {
    if (child.exitCode == null) child.kill('SIGKILL');
    throw new Error(`server did not start: ${output}`);
  }
  const port = boundPort(output);
  assert.ok(port > 0, `no port in the server log: ${output}`);
  return {base: `http://127.0.0.1:${port}`, stop: () => new Promise(done => { child.on('close', done); child.kill('SIGTERM'); })};
}

// A page that records console errors, page errors and CSP violations, and saves a screenshot when `check` throws.
async function withPage(browser, viewport, check) {
  const context = await browser.newContext({viewport});
  const page = await context.newPage();
  const problems = [];
  page.on('console', message => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  try {
    await check(page, problems);
  } catch (error) {
    const dir = mkdtempSync(join(tmpdir(), 'mp-e2e-'));
    const shot = join(dir, 'failure.png');
    await page.screenshot({path: shot, fullPage: true}).catch(() => {});
    console.error(`E2E failure screenshot: ${shot}`);
    throw error;
  } finally {
    await context.close();
  }
}

const DESKTOP = {width: 1280, height: 800};
const MOBILE = {width: 390, height: 844};

// No raw null/undefined ever reaches the page as text.
async function noRawNulls(page) {
  const text = await page.textContent('main');
  assert.doesNotMatch(text, /\b(null|undefined|NaN)\b/, 'raw null/undefined/NaN shown');
}

async function noHorizontalScroll(page) {
  await noRawNulls(page);
  const {scroll, width} = await page.evaluate(() => ({scroll: document.documentElement.scrollWidth, width: window.innerWidth}));
  assert.ok(scroll <= width, `horizontal overflow: ${scroll} > ${width}`);
}

test('the web shell renders real API v1 data on desktop and mobile, with N/D for missing values', {timeout: 180000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const {admin, browser} = env;
  const schema = `web_e2e_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const server = await startServer(schema);
    try {
      const api = async path => (await fetch(`${server.base}${path}`)).json();
      const health = await api('/api/v1/health');
      const providers = await api('/api/v1/providers');
      const endpoints = await api('/api/v1/endpoints');
      for (const viewport of [DESKTOP, MOBILE]) {
        await withPage(browser, viewport, async (page, problems) => {
          const response = await page.goto(`${server.base}/`);
          assert.equal(response.status(), 200);
          assert.match(response.headers()['content-security-policy'], /script-src 'self'/);
          // The home page is Oggi (D-2); the data health lives in the technical area «Dati».
          await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Oggi' && !document.querySelector('.state.loading'));
          assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
          await page.click('nav a[data-view="data"]');
          await page.waitForSelector('[data-testid="tile-health"]');
          // The service state in Italian, the code kept (PR #170 review NB-3).
          assert.equal(await page.getAttribute('[data-testid="tile-health"] [data-field="status"] [data-code]', 'data-code'), health.data.status);
          assert.equal(await page.textContent('[data-testid="tile-health"] [data-field="status"]'), {ok: 'Regolare', warning: 'Attenzione', critical: 'Critico'}[health.data.status]);
          assert.equal(await page.textContent('[data-testid="tile-health"] [data-field="api_version"]'), health.api_version);
          assert.equal(await page.getAttribute('nav a[data-view="data"]', 'aria-current'), 'page');
          await noHorizontalScroll(page);

          await page.click('[data-testid="data-tabs"] a[href="#/providers"]');
          await page.waitForSelector('[data-testid="data-health"]');
          const healthText = await page.textContent('[data-testid="data-health"]');
          assert.match(healthText, new RegExp(`Stato\\s*${providers.data.data_health.status}`));
          // lastRun is null on an empty database: it must read N/D, never 0.
          assert.equal(providers.data.data_health.lastRun, null);
          assert.match(healthText, /Ultima sincronizzazione\s*N\/D/);
          // latest_backfill is null on an empty database: its own row reads N/D, and a number reads the API value.
          assert.equal(providers.data.futpython_certification.latest_backfill, null);
          const certText = await page.textContent('[data-testid="fpt-certification"]');
          assert.match(certText, /Ultimo backfill\s*N\/D/);
          assert.match(certText, new RegExp(`Snapshot\\s*${providers.data.futpython_certification.snapshots}`));
          await noHorizontalScroll(page);

          await page.click('[data-testid="data-tabs"] a[href="#/endpoints"]');
          await page.waitForSelector('[data-testid="endpoints"] tbody tr');
          assert.equal(await page.getAttribute('nav a[data-view="data"]', 'aria-current'), 'page', 'the API registry is a section of Dati');
          assert.equal(await page.locator('[data-testid="endpoints"] tbody tr').count(), endpoints.data.endpoints.length);
          assert.equal(await page.locator('tr[data-path="/api/v1/health"]').count(), 1);
          await noHorizontalScroll(page);

          await page.goto(`${server.base}/#/does-not-exist`);
          await page.waitForSelector('text=Pagina non trovata');
          assert.deepEqual(problems, [], 'no console errors, page errors or CSP violations');
        });
      }
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await browser.close();
  }
});

test('loading, error, retry and partial states are explicit', {timeout: 120000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const {admin, browser} = env;
  const schema = `web_e2e_states_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const server = await startServer(schema);
    try {
      await withPage(browser, DESKTOP, async page => {
        // Loading: hold the API response and check the loading state is shown meanwhile.
        let release;
        const held = new Promise(done => { release = done; });
        await page.route('**/api/v1/providers', async route => { await held; await route.continue(); });
        await page.goto(`${server.base}/#/providers`);
        await page.waitForSelector('.state.loading[role="status"]');
        assert.equal(await page.textContent('.state.loading'), 'Caricamento in corso…');
        release();
        await page.waitForSelector('[data-testid="data-health"]');
        await page.unroute('**/api/v1/providers');

        // Error: the API fails; an explicit error with its code and a retry button, never a blank page.
        let fail = true;
        await page.route('**/api/v1/providers', route => fail
          ? route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}})})
          : route.continue());
        await page.goto(`${server.base}/#/endpoints`);
        await page.waitForSelector('[data-testid="data-tabs"]');
        await page.click('[data-testid="data-tabs"] a[href="#/providers"]');
        await page.waitForSelector('.state.error[role="alert"]');
        // The reason stays on the error (code and tooltip); the page says it in plain words.
        assert.equal(await page.getAttribute('.state.error', 'data-code'), 'UNAVAILABLE');
        assert.match(await page.textContent('.state.error'), /non sono disponibili/);
        fail = false;
        await page.click('.state.error button');
        await page.waitForSelector('[data-testid="data-health"]');
        await page.unroute('**/api/v1/providers');

        // Partial: one section missing from the payload.
        await page.route('**/api/v1/providers', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.futpython_certification = null;
          await route.fulfill({response, body: JSON.stringify(body)});
        });
        await page.goto(`${server.base}/#/endpoints`);
        await page.waitForSelector('[data-testid="data-tabs"]');
        await page.click('[data-testid="data-tabs"] a[href="#/providers"]');
        await page.waitForSelector('.state.partial');
        assert.match(await page.textContent('[data-testid="fpt-certification"]'), /Dati non disponibili/);
        await page.unroute('**/api/v1/providers');

        // Values are shown exactly as the API sends them (no rounding); empty strings read N/D (review B-2, NB-1).
        await page.route('**/api/v1/providers', async route => {
          const response = await route.fetch();
          const body = await response.json();
          Object.assign(body.data.data_health, {status: '', activeDatasets: 1234567, schemaFields: 0.123456789, datasetsWithErrors: 0});
          await route.fulfill({response, body: JSON.stringify(body)});
        });
        await page.goto(`${server.base}/#/endpoints`);
        await page.waitForSelector('[data-testid="data-tabs"]');
        await page.click('[data-testid="data-tabs"] a[href="#/providers"]');
        await page.waitForSelector('[data-testid="data-health"]');
        const shown = await page.textContent('[data-testid="data-health"]');
        assert.match(shown, /Stato\s*N\/D/);
        assert.match(shown, /Dataset attivi\s*1\.234\.567/);
        assert.match(shown, /Campi di schema\s*0,123456789/);
        assert.match(shown, /Dataset con errori\s*0(?![,.\d])/, 'a real zero stays 0');
        await page.unroute('**/api/v1/providers');

        // A slow earlier view never overwrites a later route (review B-1).
        let releaseSlow;
        const slow = new Promise(done => { releaseSlow = done; });
        await page.route('**/api/v1/providers', async route => { await slow; await route.continue(); });
        // The dashboard reads /api/v1/providers too, so start from a view that does not.
        await page.goto(`${server.base}/#/endpoints`);
        await page.waitForSelector('[data-testid="endpoints"]');
        await page.click('[data-testid="data-tabs"] a[href="#/providers"]');
        await page.waitForSelector('.state.loading');
        await page.evaluate(() => { location.hash = '#/nope'; });
        await page.waitForSelector('text=Pagina non trovata');
        // Release the slow response and wait until it has been fully delivered and handled (no fixed sleep: R-05 R2-NB-2).
        const delivered = page.waitForResponse(response => response.url().endsWith('/api/v1/providers'));
        releaseSlow();
        await (await delivered).finished();
        await page.evaluate(() => new Promise(done => setTimeout(() => setTimeout(done, 0), 0)));
        assert.equal(await page.textContent('h1'), 'Pagina non trovata');
      });
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await browser.close();
  }
});

test('with owner login enforced the shell requires a session and returns to the page after login', {timeout: 120000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const {admin, browser} = env;
  const schema = `web_e2e_auth_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const hash = await hashPassword(PASSWORD, {N: 1024});
    const server = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
    try {
      await withPage(browser, MOBILE, async (page, problems) => {
        await page.goto(`${server.base}/`);
        await page.waitForURL(/\/login\?next=%2F$/);
        // The login page in the identity of the site (V-B3): the logo reads as one word and the form fits a phone.
        assert.equal(await page.evaluate(() => document.querySelector('h1').innerText), 'MATCHPILOT');
        assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('button[type="submit"]')).backgroundColor), 'rgb(255, 181, 71)');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the login form fits the phone');
        await page.fill('input[name="username"]', 'owner');
        await page.fill('input[name="password"]', PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Oggi' && !document.querySelector('.state.loading'));
        assert.equal(new URL(page.url()).pathname, '/');
        await page.click('nav a[data-view="data"]');
        await page.click('[data-testid="data-tabs"] a[href="#/endpoints"]');
        await page.waitForSelector('[data-testid="endpoints"] tbody tr');
        await noHorizontalScroll(page);
        assert.deepEqual(problems, []);
        // The session ends while the page is open: the next API call leads to /login, keeping the view in `next`.
        await admin.query(`UPDATE ${schema}.auth_sessions SET revoked_at = now(), revoke_reason = 'revoked'`);
        await page.click('[data-testid="data-tabs"] a[href="#/providers"]');
        await page.waitForURL(/\/login\?next=%2F%23%2Fproviders$/);
      });
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await browser.close();
  }
});

// R-06b: the same formatting rule the page uses, applied to API text in the test (exact digits, comma decimals).
const shown = value => {
  if (value === null || value === undefined || value === '') return 'N/D';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  return m ? `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${m[3] === undefined ? '' : `,${m[3]}`}` : String(value);
};

async function seeded(admin, schema, server) {
  const pg = (await import('pg')).default;
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const client = new pg.Client({connectionString: url.toString()});
  await client.connect();
  try { return await seedEredivisie(client); } finally { await client.end(); }
}

test('R-06b: dashboard, Daily Board and search render the stored matches exactly as the API returns them', {timeout: 240000}, async t => {
  const env = await setup(t);
  if (!env) return;
  const {admin, browser} = env;
  const schema = `web_e2e_board_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const server = await startServer(schema);
    try {
      const seed = await seeded(admin, schema, server);
      const api = async path => (await fetch(`${server.base}${path}`)).json();
      const providers = await api('/api/v1/providers');
      const coverage = await api('/api/v1/fpt/coverage-competitions');
      assert.equal(coverage.data.rows.length, 1);
      const league = coverage.data.rows[0];
      const day = league.last_match_date;
      const dayRows = (await api(`/api/v1/fpt/matches?date=${day}&limit=500`)).data.rows;
      assert.equal(dayRows.length, 3);
      const allSearch = (await api(`/api/v1/fpt/search?before=2100-01-01&limit=500`)).data.rows;
      assert.equal(allSearch.length, seed.matches);

      for (const viewport of [DESKTOP, MOBILE]) {
        await withPage(browser, viewport, async (page, problems) => {
          // Stato dei dati (the former Dashboard, in «Dati»): every tile reads its route; values equal the API.
          await page.goto(`${server.base}/#/data`);
          await page.waitForSelector('[data-testid="tile-coverage"] tbody tr');
          assert.equal(await page.textContent('[data-testid="tile-certification"] [data-field="unique_matches"]'), shown(providers.data.futpython_certification.unique_matches));
          assert.equal(await page.textContent('[data-testid="tile-certification"] [data-field="latest_backfill"]'), 'N/D');
          assert.equal(await page.textContent('[data-testid="tile-coverage"] [data-field="matches"]'), shown(league.matches));
          assert.match(await page.textContent('[data-testid="tile-coverage"] tbody tr'), new RegExp(shown(league.odds_coverage)));
          assert.equal(await page.textContent('[data-testid="tile-tc-live"] [data-field="latest"]'), 'N/D', 'no live snapshot: N/D, not 0');
          assert.equal(await page.locator('[data-testid="dashboard-partial"]').count(), 0);
          await noHorizontalScroll(page);

          // The league's last day with data opens the Daily Board on that day.
          await page.click('[data-testid="tile-coverage"] [data-field="last_match_date"] a');
          await page.waitForSelector('[data-testid="board-day"]');
          assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
          const cards = page.locator('article.match');
          assert.equal(await cards.count(), dayRows.length);
          for (let i = 0; i < dayRows.length; i++) {
            const row = dayRows[i];
            const card = cards.nth(i);
            assert.equal(await card.getAttribute('data-match'), row.internal_match_id, 'API order is kept');
            assert.equal(await card.locator('[data-field="home"]').textContent(), row.home_name);
            assert.equal(await card.locator('[data-field="competition"]').textContent(), `${words(row.country_slug)} · ${words(row.league_slug)} · ${seasonShown(row.season)}`);
            assert.equal(await card.locator('[data-field="kickoff"]').textContent(), shown(row.kickoff_local_time));
            for (const name of ['odd_home', 'odd_draw', 'odd_away']) assert.equal(await card.locator(`[data-field="${name}"] b`).textContent(), shown(row[name]));
            assert.equal(await card.locator('[data-field="score"]').textContent(), outcomeShownFor(row));
            assert.equal(await card.locator('[data-field="xg"] b').textContent(), `${shown(row.xg_home)} – ${shown(row.xg_away)}`);
            assert.equal(await card.locator('[data-field="favorite"]').textContent(),
              row.favorite_side ? `Favorito ${{HOME: 'Casa', AWAY: 'Ospite', EVEN: 'Pari'}[row.favorite_side]} ${shown(row.favorite_odd)}` : 'Favorito N/D');
          }
          assert.ok(dayRows.some(row => row.kickoff_local_time === null), 'the seed has a match without kickoff on every day');
          await noHorizontalScroll(page);

          // A day without stored matches is an explicit empty state; an invalid date is refused before any request.
          await page.click('[data-action="next"]');
          await page.waitForSelector('[data-testid="board-empty"]');
          await page.goto(`${server.base}/#/board?date=2024-13-01`);
          await page.waitForSelector('.state.error[role="alert"]');
          assert.match(await page.textContent('.state.error'), /Data non valida/);

          // Search: all matches, two pages, same order as the API, then the end.
          await page.goto(`${server.base}/#/search`);
          await page.waitForSelector('[data-testid="search-form"]');
          await page.click('[data-testid="search-form"] button[type="submit"]');
          await page.waitForSelector('[data-testid="search-results"] tr');
          assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 25);
          await page.click('[data-action="more"]');
          await page.waitForSelector('[data-testid="end"]');
          const ids = await page.locator('[data-testid="search-results"] tr').evaluateAll(rows => rows.map(row => row.dataset.match));
          assert.deepEqual(ids, allSearch.map(row => row.internal_match_id));
          await noHorizontalScroll(page);

          // A team by name, at home, with complete 1X2 odds: the same rows as the API with the same filters.
          const ajax = (await api('/api/v1/fpt/teams?q=Ajax')).data.rows[0].internal_team_id;
          const expected = (await api(`/api/v1/fpt/search?team=${encodeURIComponent(ajax)}&venue=home&with_odds=true&before=2100-01-01&limit=500`)).data.rows;
          assert.ok(expected.length > 0 && expected.every(row => row.home_team_id === ajax && row.odd_home !== null));
          await page.goto(`${server.base}/#/search`);
          await page.waitForSelector('[data-testid="search-form"]');
          await page.fill('input[name="team"]', 'Ajax');
          await page.selectOption('select[name="venue"]', 'home');
          await page.check('input[name="with_odds"]');
          await page.fill('input[name="before"]', '2100-01-01');
          await page.click('[data-testid="search-form"] button[type="submit"]');
          await page.waitForSelector('[data-testid="search-results"] tr');
          const teamIds = await page.locator('[data-testid="search-results"] tr').evaluateAll(rows => rows.map(row => row.dataset.match));
          assert.deepEqual(teamIds, expected.map(row => row.internal_match_id));
          assert.equal(await page.locator('[data-testid="search-results"] [data-field="odds_1x2"]:has-text("N/D")').count(), 0);
          assert.match(await page.getAttribute('[data-testid="search-outcome"]', 'data-filters'), /\bwith_odds\b/);
          assert.equal(await page.inputValue('input[name="team"]'), 'Ajax', 'the form keeps the filters');

          // Unknown team, invalid filter (server validation), no match.
          await page.goto(`${server.base}/#/search?run=1&venue=home`);
          await page.waitForSelector('[data-testid="venue-ignored"]');
          await page.goto(`${server.base}/#/search?run=1&team=Nessuno`);
          await page.waitForSelector('[data-testid="team-not-found"]');
          assert.deepEqual(problems, [], 'no console errors, page errors or CSP violations');
          await page.goto(`${server.base}/#/search?run=1&fav_min=abc`);
          await page.waitForSelector('[data-testid="search-invalid"]');
          assert.match(await page.textContent('[data-testid="search-invalid"]'), /Quota favorito da/);
          // The browser itself logs the refused request; nothing else may appear.
          assert.deepEqual(problems, ['console: Failed to load resource: the server responded with a status of 400 (Bad Request)']);
          await page.goto(`${server.base}/#/search?run=1&min_goals=30`);
          await page.waitForSelector('[data-testid="search-empty"]');
          assert.equal(problems.length, 1);
        });
      }

      // Partial dashboard and a failed next page: what is shown stays, the failure is explicit, retry works.
      await withPage(browser, DESKTOP, async page => {
        await page.route('**/api/v1/tc/live', route => route.fulfill({status: 503, contentType: 'application/json',
          body: JSON.stringify({api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}})}));
        await page.goto(`${server.base}/#/data`);
        await page.waitForSelector('[data-testid="tile-tc-live"][data-state="error"]');
        assert.match(await page.textContent('[data-testid="tile-tc-live"]'), /N\/D[\s\S]*non disponibile/);
        assert.equal(await page.getAttribute('[data-testid="tile-tc-live"] .state.partial', 'data-code'), 'UNAVAILABLE');
        assert.equal(await page.getAttribute('[data-testid="tile-certification"]', 'data-state'), 'ok');
        assert.match(await page.textContent('[data-testid="dashboard-partial"]'), /1 riquadro su 6 non è disponibile/);
        await page.unroute('**/api/v1/tc/live');

        let failNext = true;
        await page.route(/\/api\/v1\/fpt\/search\?.*cursor=/, route => {
          if (!failNext) return route.continue();
          failNext = false;
          return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}})});
        });
        await page.goto(`${server.base}/#/search?run=1`);
        await page.waitForSelector('[data-testid="search-results"] tr');
        await page.click('[data-action="more"]');
        await page.waitForSelector('.paged-foot .state.error');
        assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 25, 'the first page stays');
        await page.click('.paged-foot .state.error button');
        await page.waitForSelector('[data-testid="end"]');
        assert.equal(await page.locator('[data-testid="search-results"] tr').count(), seed.matches);
      });
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await browser.close();
  }
});
