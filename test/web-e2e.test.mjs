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
  return {base: `http://127.0.0.1:${boundPort(output)}`, stop: () => new Promise(done => { child.on('close', done); child.kill('SIGTERM'); })};
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

async function noHorizontalScroll(page) {
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
          await page.waitForSelector('[data-testid="health"]');
          assert.equal(await page.textContent('[data-field="status"]'), health.data.status);
          assert.equal(await page.textContent('[data-field="api_version"]'), health.api_version);
          assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
          await noHorizontalScroll(page);

          await page.click('nav a[data-view="providers"]');
          await page.waitForSelector('[data-testid="data-health"]');
          const healthText = await page.textContent('[data-testid="data-health"]');
          assert.match(healthText, new RegExp(`Stato\\s*${providers.data.data_health.status}`));
          // lastRun is null on an empty database: it must read N/D, never 0.
          assert.equal(providers.data.data_health.lastRun, null);
          assert.match(healthText, /Ultimo controllo\s*N\/D/);
          // latest_backfill is null on an empty database: its own row reads N/D, and a number reads the API value.
          assert.equal(providers.data.futpython_certification.latest_backfill, null);
          const certText = await page.textContent('[data-testid="fpt-certification"]');
          assert.match(certText, /Ultimo backfill\s*N\/D/);
          assert.match(certText, new RegExp(`Snapshot\\s*${providers.data.futpython_certification.snapshots}`));
          await noHorizontalScroll(page);

          await page.click('nav a[data-view="endpoints"]');
          await page.waitForSelector('[data-testid="endpoints"] tbody tr');
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
        release();
        await page.waitForSelector('[data-testid="data-health"]');
        await page.unroute('**/api/v1/providers');

        // Error: the API fails; an explicit error with its code and a retry button, never a blank page.
        let fail = true;
        await page.route('**/api/v1/providers', route => fail
          ? route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}})})
          : route.continue());
        await page.goto(`${server.base}/#/`);
        await page.click('nav a[data-view="providers"]');
        await page.waitForSelector('.state.error[role="alert"]');
        assert.match(await page.textContent('.state.error'), /UNAVAILABLE/);
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
        await page.goto(`${server.base}/#/`);
        await page.click('nav a[data-view="providers"]');
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
        await page.goto(`${server.base}/#/`);
        await page.click('nav a[data-view="providers"]');
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
        await page.goto(`${server.base}/#/`);
        await page.waitForSelector('[data-testid="health"]');
        await page.click('nav a[data-view="providers"]');
        await page.waitForSelector('.state.loading');
        await page.evaluate(() => { location.hash = '#/nope'; });
        await page.waitForSelector('text=Pagina non trovata');
        releaseSlow();
        await page.waitForTimeout(500);
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
        await page.fill('input[name="username"]', 'owner');
        await page.fill('input[name="password"]', PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForSelector('[data-testid="health"]');
        assert.equal(new URL(page.url()).pathname, '/');
        await page.click('nav a[data-view="endpoints"]');
        await page.waitForSelector('[data-testid="endpoints"] tbody tr');
        await noHorizontalScroll(page);
        assert.deepEqual(problems, []);
        // The session ends while the page is open: the next API call leads to /login, keeping the view in `next`.
        await admin.query(`UPDATE ${schema}.auth_sessions SET revoked_at = now(), revoke_reason = 'revoked'`);
        await page.click('nav a[data-view="providers"]');
        await page.waitForURL(/\/login\?next=%2F%23%2Fproviders$/);
      });
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
    await browser.close();
  }
});
