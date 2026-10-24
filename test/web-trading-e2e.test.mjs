// WEB-APP-01 (MP-FRONTEND-CLAUDE-DIRECT-E2E-01, #3 #29 #34 #94 #96 #99 #100 #25 #23): browser end-to-end tests of the
// sections added to the real web shell: Live, Strategie, Simulazioni salvate, Strumenti, Money, Portafoglio, Account,
// Regole dei mercati and the Match Center additions. The real server runs on a throwaway PostgreSQL schema with the QA
// archive through the real FutPythonTrader ingestion path; each control is exercised for its outcome (route, request,
// result), not only for its presence. The writes run against the staged persistence schema applied to the throwaway
// schema only, behind a real owner login: this is mock-free browser E2E, not a production certification.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import test from 'node:test';
import {hashPassword} from '../src/auth/owner-auth.mjs';
import {seedQaArchive} from './helpers/fpt-seed.mjs';
import {invariants} from '../tools/qa/browser-qa.mjs';

const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const BROWSERS = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const PASSWORD = 'correct horse battery staple 2026';
const STAGED = readFileSync(new URL('../db/staged/030-persistence.sql', import.meta.url), 'utf8');
const DESKTOP = {width: 1280, height: 800};
const TABLET = {width: 820, height: 1180};
const MOBILE = {width: 390, height: 844};

async function setup(t) {
  const executablePath = BROWSERS.find(path => path && existsSync(path));
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
  const {chromium} = await import('playwright-core');
  return {admin, pg, browser: await chromium.launch({executablePath, args: ['--no-sandbox']})};
}

async function startServer(schema, env = {}) {
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawn(process.execPath, ['src/server.mjs'], {cwd: resolve('.'),
    env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!/listening on \d+ /.test(output) && child.exitCode == null && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
  const port = Number(/listening on (\d+) /.exec(output)?.[1]);
  if (!(port > 0)) { child.kill('SIGKILL'); throw new Error(`server did not start: ${output}`); }
  return {base: `http://127.0.0.1:${port}`, url, output: () => output,
    stop: () => new Promise(done => { if (child.exitCode !== null) return done(); child.on('close', done); child.kill('SIGTERM'); })};
}

// A schema with the QA archive (and the staged persistence schema when asked), the server on it, always cleaned up.
async function withArchive(t, name, {staged = false, env = {}} = {}, body) {
  const ctx = await setup(t);
  if (!ctx) return;
  const {admin, pg, browser} = ctx;
  const schema = `web_trading_${name}_${process.pid}_${Date.now()}`;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const server = await startServer(schema, env);
    try {
      const client = new pg.Client({connectionString: server.url.toString()});
      await client.connect();
      let seed;
      try {
        seed = await seedQaArchive(client);
        if (staged) await client.query(STAGED);
      } finally { await client.end(); }
      await body({browser, server, seed});
    } finally { await server.stop(); }
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end();
    await browser.close();
  }
}

// A page recording console errors, page errors and every API request; a screenshot is kept when `check` throws.
// A refused API answer (400, 403, 404, 503) is logged by Chrome as a failed resource: those are expected outcomes of the
// negative cases and are checked through the page instead, so only other errors count as problems.
async function withPage(browser, viewport, check) {
  const context = await browser.newContext({viewport});
  const page = await context.newPage();
  const problems = [];
  const requests = [];
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource: the server responded with a status of (400|401|403|404|503)/.test(message.text())) problems.push(`console: ${message.text()}`); });
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('request', request => { if (/\/api\/v1\//.test(request.url())) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
  try {
    await check(page, problems, requests);
  } catch (error) {
    const shot = join(mkdtempSync(join(tmpdir(), 'mp-trading-e2e-')), 'failure.png');
    await page.screenshot({path: shot, fullPage: true}).catch(() => {});
    console.error(`E2E failure screenshot: ${shot}`);
    throw error;
  } finally {
    await context.close();
  }
}

const titled = (page, text) => page.waitForFunction(title => document.querySelector('main h1')?.textContent === title && !document.querySelector('main .state.loading'), text);
async function fresh(page, url) {
  await page.goto('about:blank');
  await page.goto(url);
}
// The invariants of the Browser QA gate (no raw values, no technical text in user views, no squeezed text, no
// overlapping controls) and no horizontal scroll of the page.
async function clean(page) {
  assert.deepEqual(await invariants(page), []);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
}
const text = async (page, selector) => (await page.textContent(selector)).replace(/\s+/g, ' ').trim();

// The sections of the menu: [view, label, title], in the order of the header.
const NAV = [['', 'Oggi', 'Oggi'], ['live', 'Live', 'Live'], ['search', 'Ricerca', 'Ricerca partite'], ['strategies', 'Strategie', 'Strategie'],
  ['sim', 'Simulazione', 'Simulazione'], ['tools', 'Strumenti', 'Strumenti'], ['money', 'Money', 'Money Management'], ['portfolio', 'Portafoglio', 'Portafoglio'],
  ['data', 'Dati', 'Stato dei dati']];

test('menu, tools, money, live, match center and every refused write on an open server', {timeout: 300000}, async t => {
  await withArchive(t, 'open', {}, async ({browser, server, seed}) => {
    for (const [viewportName, viewport] of [['desktop', DESKTOP], ['tablet', TABLET], ['mobile', MOBILE]]) {
      await withPage(browser, viewport, async (page, problems) => {
        // Menu: every section opens its view, marks itself current, and the view declares its area.
        await page.goto(`${server.base}/`);
        await titled(page, 'Oggi');
        assert.deepEqual(await page.locator('nav.mainnav a[data-view]').evaluateAll(links => links.map(link => link.dataset.view)), NAV.map(([view]) => view));
        for (const [view, label, title] of NAV) {
          const link = page.locator(`nav.mainnav a[data-view="${view}"]`);
          assert.equal((await link.textContent()).trim(), label);
          await link.scrollIntoViewIfNeeded();
          await link.click();
          await titled(page, title);
          assert.equal(await link.getAttribute('aria-current'), 'page', `${label} is current`);
          assert.equal(await page.getAttribute('main', 'data-area'), view === 'data' ? 'technical' : 'user');
          await clean(page);
        }
        if (viewportName === 'mobile') {
          // Nine sections: the bar scrolls inside itself; the page never does.
          const bar = await page.evaluate(() => {
            const nav = document.querySelector('.mainnav');
            return {fixed: getComputedStyle(nav).position, scrolls: nav.scrollWidth > nav.clientWidth, page: document.documentElement.scrollWidth <= innerWidth};
          });
          assert.deepEqual(bar, {fixed: 'fixed', scrolls: true, page: true});
        }
        // Account (header icon): the owner login is off, the archive is not active.
        await page.click('header a.account');
        await titled(page, 'Account');
        assert.equal(await page.getAttribute('header a.account', 'aria-current'), 'page');
        assert.equal(await page.getAttribute('[data-testid="account-session"]', 'data-session'), 'AUTH_OFF');
        assert.equal(await page.getAttribute('[data-testid="account-archive"]', 'data-available'), 'false');
        await clean(page);
        // Back and forward keep the views in step with the address.
        await page.goBack();
        await titled(page, 'Stato dei dati');
        await page.goForward();
        await titled(page, 'Account');
        assert.deepEqual(problems, []);
      });
    }

    await withPage(browser, DESKTOP, async (page, problems, requests) => {
      // Strumenti: each tab opens its form; each form computes on the server and shows the server's values.
      await fresh(page, `${server.base}/#/tools`);
      await titled(page, 'Strumenti');
      const tabs = await page.locator('[data-testid="tool-tabs"] a').evaluateAll(links => links.map(link => link.dataset.value));
      assert.deepEqual(tabs, ['odds', 'ev', 'kelly', 'position', 'hedge', 'dutching', 'poisson']);
      for (const tool of tabs) {
        await page.click(`[data-testid="tool-tabs"] a[data-value="${tool}"]`);
        await page.waitForSelector(`[data-testid="tool-form"][data-tool="${tool}"]`);
        assert.equal(await page.getAttribute(`[data-testid="tool-tabs"] a[data-value="${tool}"]`, 'aria-current'), 'true');
      }
      const run = async (tool, values, {enter = false} = {}) => {
        await fresh(page, `${server.base}/#/tools?tool=${tool}`);
        await page.waitForSelector(`[data-testid="tool-form"][data-tool="${tool}"]`);
        for (const [name, value] of Object.entries(values)) {
          const field = page.locator(`[data-testid="tool-form"] [name="${name}"]`);
          if (await field.evaluate(node => node.tagName) === 'SELECT') await field.selectOption(value);
          else await field.fill(value);
        }
        if (enter) await page.press(`[data-testid="tool-form"] [name="${Object.keys(values)[0]}"]`, 'Enter');
        else await page.click('[data-testid="tool-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="tool-result"], [data-testid="tool-invalid"]');
        // The outcome gets the focus (it starts below the form on a phone).
        await page.waitForFunction(() => document.activeElement?.hasAttribute('data-outcome'));
        await clean(page);
      };
      await run('odds', {odds: '2,10 3,40 3,60'}, {enter: true});
      assert.equal(await page.locator('[data-testid="tool-result"] tbody tr').count(), 3);
      assert.equal(await text(page, '[data-field="overround"]'), '4,81');
      await run('ev', {odds: '2.2', probability: '50', stake: '10', side: 'BACK', commission: '5'});
      assert.equal(await text(page, '[data-field="expected_value"]'), '0,70');
      assert.match(await page.getAttribute('[data-field="expected_value"]', 'title'), /Valore esatto: 0,7$/);
      await run('kelly', {odds: '2.2', probability: '50', bankroll: '1000', fraction: '50'});
      assert.equal(await text(page, '[data-field="stake"]'), '41,66');
      await run('position', {side: 'LAY', odds: '4', liability: '30'});
      assert.deepEqual([await text(page, '[data-field="stake"]'), await text(page, '[data-field="if_wins"]')], ['10,00', '-30,00']);
      await run('hedge', {side: 'BACK', odds: '3', stake: '10', current_odds: '2'});
      assert.deepEqual([await text(page, '[data-field="hedge_side"]'), await text(page, '[data-field="hedge_stake"]'), await text(page, '[data-field="after_wins"]')],
        ['Banca', '15,00', '5,00']);
      await run('dutching', {odds: '4 5 6', total: '100'});
      assert.equal(await text(page, '[data-field="placed"]'), '100,00');
      await run('poisson', {xg_home: '1.6', xg_away: '1.1', max_goals: '3'});
      assert.equal(await page.locator('[data-testid="poisson-grid"] tbody tr').count(), 4);
      assert.equal(await text(page, '[data-testid="poisson-grid"] td[data-score="0-0"]'), '6,72%');
      // The browser refuses a value out of range before any request; the server refuses it too (deep link), naming the
      // field in Italian.
      await fresh(page, `${server.base}/#/tools?tool=ev`);
      await page.waitForSelector('[data-testid="tool-form"][data-tool="ev"]');
      await page.fill('[data-testid="tool-form"] [name="odds"]', '1');
      await page.fill('[data-testid="tool-form"] [name="probability"]', '50');
      await page.fill('[data-testid="tool-form"] [name="stake"]', '10');
      const asked = requests.length;
      await page.click('[data-testid="tool-form"] button[type="submit"]');
      assert.equal(await page.evaluate(() => document.querySelector('[data-testid="tool-form"] [name="odds"]').validity.rangeUnderflow), true);
      assert.equal(requests.length, asked, 'no request for an invalid form');
      assert.match(page.url(), /#\/tools\?tool=ev$/);
      await fresh(page, `${server.base}/#/tools?tool=ev&odds=1&probability=50&stake=10&run=1`);
      await page.waitForSelector('[data-testid="tool-invalid"]');
      assert.equal(await page.getAttribute('[data-testid="tool-invalid"]', 'data-fields'), 'odds');
      assert.equal(await text(page, '[data-testid="tool-invalid"]'), 'Valore non valido in: Quota. Correggi il campo e riprova.');
      // «Azzera» empties the form and the result.
      await page.click('[data-testid="tool-form"] a');
      await page.waitForFunction(() => !document.querySelector('[data-testid="tool-invalid"]'));
      assert.equal(await page.inputValue('[data-testid="tool-form"] [name="odds"]'), '');
      // A server failure is an explicit error with a working «Riprova».
      await page.route(/\/api\/v1\/tools\/odds\?/, route => route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', error: {code: 'INTERNAL', message: 'internal error'}})}));
      await fresh(page, `${server.base}/#/tools?tool=odds&odds=2%203&run=1`);
      await page.waitForSelector('.state.error[data-code="INTERNAL"]');
      await page.unroute(/\/api\/v1\/tools\/odds\?/);
      await page.click('.state.error button');
      await page.waitForSelector('[data-testid="tool-result"]');
      // The only console error so far is the 500 injected above.
      assert.deepEqual(problems.splice(0), ['console: Failed to load resource: the server responded with a status of 500 (Internal Server Error)']);

      // Money: the registry, a stake within the limits, a reduced one, a refused value.
      await fresh(page, `${server.base}/#/money`);
      await titled(page, 'Money Management');
      assert.equal(await page.locator('[data-testid="mm-registry"] tbody tr').count(), 16);
      assert.equal(await page.locator('[data-testid="mm-registry"] tr[data-status="IMPLEMENTED"]').count(), 4);
      assert.deepEqual(await page.locator('[data-testid="mm-form"] select[name="model"] option').evaluateAll(o => o.map(x => x.value)),
        ['FIXED_STAKE', 'FIXED_LIABILITY', 'PERCENT_BANKROLL', 'LIABILITY_PERCENT_BANKROLL']);
      const money = async values => {
        for (const [name, value] of Object.entries(values)) {
          const field = page.locator(`[data-testid="mm-form"] [name="${name}"]`);
          if (await field.evaluate(node => node.tagName) === 'SELECT') await field.selectOption(value); else await field.fill(value);
        }
        await page.click('[data-testid="mm-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="mm-result"], [data-testid="mm-invalid"]');
        await clean(page);
      };
      await money({model: 'PERCENT_BANKROLL', value: '2', bankroll: '1000', side: 'LAY', odds: '3'});
      assert.equal(await page.getAttribute('[data-testid="mm-result"]', 'data-decision'), 'ALLOW');
      assert.equal(await text(page, '[data-field="adjusted_stake"]'), '20,00');
      await money({max_liability: '30'});
      assert.equal(await page.getAttribute('[data-testid="mm-result"]', 'data-decision'), 'REDUCE');
      assert.equal(await text(page, '[data-field="caps"]'), 'tetto alla responsabilità');
      await fresh(page, `${server.base}/#/money?model=FIXED_STAKE&value=10&bankroll=100&odds=0.5&run=1`);
      await page.waitForSelector('[data-testid="mm-invalid"]');
      await clean(page);
      assert.equal(await text(page, '[data-testid="mm-invalid"]'), 'Valore non valido in: Quota. Correggi il campo e riprova.');

      // Live: the live collection is stopped, the QA archive has no match today: two explicit empty states.
      await fresh(page, `${server.base}/#/live`);
      await titled(page, 'Live');
      await page.waitForSelector('[data-testid="live-none"]');
      await page.waitForSelector('[data-testid="live-upcoming-empty"]');
      await clean(page);
      // A failing live route leaves the rest of the page usable (partial).
      await page.route('**/api/v1/tc/live', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}})}));
      await fresh(page, `${server.base}/#/live`);
      await page.waitForSelector('[data-testid="live-collector"][data-state="error"] .state.partial[data-code="UNAVAILABLE"]');
      await page.unroute('**/api/v1/tc/live');

      // Match Center: a finished match shows its settled markets; a tool link computes with the match's own values.
      await fresh(page, `${server.base}/#/?date=${seed.busyDay}`);
      await page.waitForSelector('article.match');
      const finished = await page.locator('article.match[data-result="FINAL"] a.match-link').first();
      await finished.click();
      await page.waitForSelector('[data-testid="post-match"]');
      const winner = await page.getAttribute('[data-testid="post-match"] dd[data-market="MATCH_ODDS"]', 'data-winner');
      assert.ok(['HOME', 'DRAW', 'AWAY'].includes(winner));
      assert.equal(await page.getAttribute('[data-testid="post-match"] dd[data-market="MATCH_ODDS"]', 'data-rule'), 'MATCH_ODDS@v2');
      await clean(page);
      await page.click('[data-testid="match-tools"] a[data-action="tool-poisson"]');
      await page.waitForSelector('[data-testid="tool-result"][data-tool="poisson"]');
      await page.goBack();
      await page.waitForSelector('[data-testid="post-match"]');
      await page.click('[data-testid="match-tools"] a[data-action="tool-odds"]');
      await page.waitForSelector('[data-testid="tool-result"][data-tool="odds"]');
      assert.equal(await page.locator('[data-testid="tool-result"] tbody tr').count(), 3);

      // Strategie: the archive is not active (503) — an explicit state, the builder still works for a simulation.
      await fresh(page, `${server.base}/#/strategies`);
      await titled(page, 'Strategie');
      await page.waitForSelector('[data-testid="strategy-list"] [data-testid="archive-off"]');
      await clean(page);
      await page.fill('[data-testid="builder-form"] [name="name"]', 'Prova');
      await page.selectOption('[data-testid="builder-form"] [name="selection"]', 'HOME');
      await page.fill('[data-testid="builder-form"] [name="odds_max"]', '2.5');
      await page.click('[data-action="try-strategy"]');
      await titled(page, 'Simulazione');
      assert.equal(await page.inputValue('[data-testid="sim-form"] [name="strategy"]'), 'custom');
      assert.equal(await page.inputValue('[data-testid="sim-form"] [name="selection"]'), 'HOME');
      assert.equal(await page.inputValue('[data-testid="sim-form"] [name="odds_max"]'), '2.5');
      assert.equal(await page.isVisible('[data-testid="sim-rules"]'), true);
      // Saving on an open server is refused by the server: the page says why, nothing is retried.
      await fresh(page, `${server.base}/#/strategies`);
      await page.fill('[data-testid="builder-form"] [name="name"]', 'Prova');
      await page.click('[data-action="save-strategy"]');
      await page.waitForSelector('[data-testid="builder-status"] [data-testid="save-refused"][data-code="WRITES_REQUIRE_AUTH"]');
      const refusedSim = `${server.base}/#/sim?run=1&from=2024-08-01&to=2024-08-31`;
      await fresh(page, refusedSim);
      await page.waitForSelector('[data-testid="sim-outcome"]');
      await page.fill('[data-testid="sim-save"] [name="name"]', 'Agosto');
      await page.click('[data-testid="sim-save"] button[type="submit"]');
      await page.waitForSelector('[data-testid="sim-save-status"] [data-testid="save-refused"][data-code="WRITES_REQUIRE_AUTH"]');
      await clean(page);
      // An empty name is refused by the page before any request.
      const before = requests.length;
      await page.fill('[data-testid="sim-save"] [name="name"]', '   ');
      await page.evaluate(() => document.querySelector('[data-testid="sim-save"]').requestSubmit());
      await page.waitForSelector('[data-testid="sim-save-status"] .state.error');
      assert.equal(requests.length, before, 'no request for an empty name');

      // Simulazioni salvate, Portafoglio: the archive is not active.
      await fresh(page, `${server.base}/#/saved`);
      await page.waitForSelector('[data-testid="archive-off"]');
      assert.equal(await page.getAttribute('nav.mainnav a[data-view="sim"]', 'aria-current'), 'page');
      assert.equal(await page.getAttribute('[data-testid="sim-tabs"] a[href="#/saved"]', 'aria-current'), 'page');
      await fresh(page, `${server.base}/#/portfolio`);
      await page.waitForSelector('[data-testid="portfolio-prompt"]');
      await page.fill('[data-testid="portfolio-form"] [name="account"]', 'principale');
      await page.click('[data-testid="portfolio-form"] button');
      await page.waitForSelector('[data-testid="archive-off"]');
      assert.match(page.url(), /#\/portfolio\?account=principale$/);

      // Dati › Regole: the market rules registry, a technical view.
      await fresh(page, `${server.base}/#/data`);
      await page.click('[data-testid="data-tabs"] a[href="#/rules"]');
      await titled(page, 'Regole dei mercati');
      assert.equal(await page.getAttribute('main', 'data-area'), 'technical');
      assert.equal(await page.locator('[data-testid="market-rules"] tbody tr').count(), 8);
      assert.deepEqual(problems, []);
    });
  });
});

test('owner session: strategies saved and versioned, a simulation saved and reopened, logout', {timeout: 300000}, async t => {
  const hash = await hashPassword(PASSWORD, {N: 1024});
  await withArchive(t, 'owner', {staged: true, env: {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash}},
    async ({browser, server}) => {
      for (const viewport of [DESKTOP, MOBILE]) {
        await withPage(browser, viewport, async (page, problems, requests) => {
          await page.goto(`${server.base}/#/strategies`);
          await page.waitForURL(/\/login\?next=/);
          await page.fill('input[name="username"]', 'owner');
          await page.fill('input[name="password"]', PASSWORD);
          await page.click('button[type="submit"]');
          await titled(page, 'Oggi');
          await page.click('nav.mainnav a[data-view="strategies"]');
          await titled(page, 'Strategie');
          const mobile = viewport === MOBILE;
          const name = mobile ? 'Ospite banca' : 'Favorito in casa';
          await page.waitForSelector(mobile ? '[data-testid="strategy-list"] table' : '[data-testid="strategies-empty"]');
          await clean(page);

          // Save: a double click sends one request; the list refreshes with the new strategy.
          await page.fill('[data-testid="builder-form"] [name="name"]', name);
          await page.selectOption('[data-testid="builder-form"] [name="selection"]', mobile ? 'AWAY' : 'FAVOURITE');
          await page.selectOption('[data-testid="builder-form"] [name="side"]', mobile ? 'LAY' : 'BACK');
          await page.fill('[data-testid="builder-form"] [name="odds_max"]', '2');
          const posts = () => requests.filter(r => r === 'POST /api/v1/strategies').length;
          const sent = posts();
          await page.dblclick('[data-action="save-strategy"]');
          await page.waitForSelector('[data-testid="builder-saved"][data-code="SAVED"]');
          assert.equal(posts() - sent, 1, 'one request for a double click');
          assert.equal(await text(page, '[data-testid="builder-saved"]'), 'Salvata, versione 1. Apri la strategia');
          const key = mobile ? 'ospite-banca' : 'favorito-in-casa';
          await page.waitForSelector(`[data-testid="strategy-list"] tr[data-key="${key}"]`);
          // The same rules again: nothing new. New rules: version 2.
          await page.click('[data-action="save-strategy"]');
          await page.waitForSelector('[data-testid="builder-saved"][data-code="UNCHANGED"]');
          await page.fill('[data-testid="builder-form"] [name="odds_max"]', '2.5');
          await page.click('[data-action="save-strategy"]');
          await page.waitForFunction(() => document.querySelector('[data-testid="builder-saved"]')?.textContent.startsWith('Salvata, versione 2'));
          await clean(page);
          // The strategy page: its rules and both versions.
          await page.click('[data-testid="builder-saved"] a');
          await titled(page, name);
          assert.equal(await page.locator('[data-testid="strategy-versions"] tbody tr').count(), 2);
          assert.match(await text(page, '[data-testid="strategy-current"] .rules'), /fino a 2,5/);
          await clean(page);
          // «Simula» opens the simulation with the rules; the run is saved and reopened from «Salvate».
          await page.click('[data-testid="strategy-current"] a[data-action="simulate"]');
          await titled(page, 'Simulazione');
          assert.equal(await page.inputValue('[data-testid="sim-form"] [name="odds_max"]'), '2.5');
          await page.fill('[data-testid="sim-form"] [name="from"]', '2024-08-01');
          await page.fill('[data-testid="sim-form"] [name="to"]', '2024-08-31');
          await page.click('[data-testid="sim-form"] button[type="submit"]');
          await page.waitForSelector('[data-testid="sim-outcome"]');
          const report = await page.getAttribute('[data-testid="sim-outcome"]', 'data-report');
          await page.fill('[data-testid="sim-save"] [name="name"]', `Agosto ${name}`);
          await page.click('[data-testid="sim-save"] button[type="submit"]');
          await page.waitForSelector('[data-testid="sim-save-done"][data-code="SAVED"]');
          await page.click('[data-testid="sim-save"] button[type="submit"]');
          await page.waitForSelector('[data-testid="sim-save-done"][data-code="ALREADY_SAVED"]');
          await page.click('[data-testid="sim-tabs"] a[href="#/saved"]');
          await titled(page, 'Simulazioni salvate');
          await page.click(`[data-testid="saved-list"] a:text("Agosto ${name}")`);
          await titled(page, `Agosto ${name}`);
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), report, 'the saved report is the one that ran');
          assert.equal(await page.getAttribute('[data-testid="saved-meta"]', 'data-kind'), 'BACKTEST');
          await clean(page);
          // A comparison is saved the same way.
          if (!mobile) {
            await fresh(page, `${server.base}/#/compare?run=1&from=2024-08-01&to=2024-08-31&a_strategy=mp-ref-fav-back-1&b_strategy=mp-ref-fav-lay-1`);
            await page.waitForSelector('[data-testid="cmp-outcome"]');
            await page.fill('[data-testid="cmp-save"] [name="name"]', 'Punta o banca');
            await page.click('[data-testid="cmp-save"] button[type="submit"]');
            await page.waitForSelector('[data-testid="cmp-save-done"][data-code="SAVED"]');
            await fresh(page, `${server.base}/#/saved`);
            await page.click('[data-testid="saved-list"] a:text("Punta o banca")');
            await page.waitForSelector('[data-testid="cmp-table"]');
            assert.equal(await page.getAttribute('[data-testid="saved-meta"]', 'data-kind'), 'COMPARE');
          }
          // Unknown saved number and unknown strategy: explicit not-found states.
          await fresh(page, `${server.base}/#/saved?id=999999`);
          await page.waitForSelector('[data-testid="saved-not-found"]');
          await fresh(page, `${server.base}/#/strategies?key=non-esiste`);
          await page.waitForSelector('[data-testid="strategy-not-found"]');
          // Portafoglio: the ledger is active but this account does not exist.
          await fresh(page, `${server.base}/#/portfolio?account=nessuno`);
          await page.waitForSelector('[data-testid="portfolio-not-found"]');
          // Account: signed in; logout ends the session and leads to the login page.
          await fresh(page, `${server.base}/#/account`);
          await titled(page, 'Account');
          assert.equal(await page.getAttribute('[data-testid="account-session"]', 'data-session'), 'signed-in');
          assert.equal(await text(page, '[data-testid="account-session"] [data-field="principal"]'), 'owner');
          assert.equal(await page.getAttribute('[data-testid="account-archive"]', 'data-available'), 'true');
          assert.equal(await text(page, '[data-testid="account-archive"] [data-field="writes"]'), 'consentiti');
          await clean(page);
          await page.click('[data-action="logout"]');
          await page.waitForURL(/\/login$/);
          assert.equal((await page.request.get(`${server.base}/api/v1/strategies`)).status(), 401, 'the session is over');
          assert.deepEqual(problems, []);
        });
      }
    });
});
