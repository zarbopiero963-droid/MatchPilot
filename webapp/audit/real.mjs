// Independent audit of the single-file web app (MP-UI-PROTOTYPE-AUDIT-01), REAL side: the file is served next to a local
// MatchPilot server (seeded QA archive in a temporary schema) through a small proxy, then driven with Playwright.
// Run: node webapp/build.mjs && node webapp/audit/real.mjs   (needs a local PostgreSQL 17, never a shared database).
import http from 'node:http';
import {spawn} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {chromium} from 'playwright-core';
import {seedQaArchive} from '../../test/helpers/fpt-seed.mjs';
import {hashPassword} from '../../src/auth/owner-auth.mjs';
import {WEB_SECURITY_HEADERS} from '../../src/web/static.mjs';
// Local throw-away PostgreSQL only (same convention as test/api-v1-postgres.test.mjs); a temporary schema is dropped at the end.
const ROOT = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const REPO = fileURLToPath(new URL('../../', import.meta.url));
// ARCH-CSP is NOT resolved by design: a single file with inline script/style cannot run under the site's strict CSP.
// It is a requirement of the integration into the official site (src/web), tracked as an open finding.
const KNOWN_OPEN = ['ARCH-CSP'];
const CHROME = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!CHROME) { console.error('Chromium non trovato: impostare MATCHPILOT_E2E_CHROME'); process.exit(2); }
const html = readFileSync(new URL('../dist/matchpilot-webapp.html', import.meta.url));
const R = []; const rec = (id, ok, d) => R.push({id, result: ok ? 'PASS' : 'FAIL', d});
const admin = new pg.Client(ROOT); await admin.connect();
const schema = `audit_wa_${process.pid}`;
await admin.query(`CREATE SCHEMA ${schema}`);
const url = new URL(ROOT); url.searchParams.set('options', `-c search_path=${schema}`);
async function server(env) {
  const c = spawn(process.execPath, ['src/server.mjs'], {cwd: REPO, env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', ...env}, stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  for (let i = 0; i < 600 && !/listening on \d+/.test(out); i++) await new Promise(r => setTimeout(r, 50));
  return {base: `http://127.0.0.1:${/listening on (\d+)/.exec(out)[1]}`, stop: () => c.kill('SIGTERM')};
}
function proxy(base, headers = {}) {
  const p = http.createServer((req, res) => {
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(200, {'content-type': 'text/html; charset=utf-8', ...headers}); res.end(html); return; }
    const up = http.request(base + req.url, {method: req.method, headers: req.headers}, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }); req.pipe(up);
  });
  return new Promise(r => p.listen(0, '127.0.0.1', () => r({base: `http://127.0.0.1:${p.address().port}`, close: () => p.close()})));
}
const browser = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
const ready = p => p.waitForFunction(() => { const v = document.querySelector('#view'); return v?.dataset.ready && !document.querySelector('main [data-state="loading"]'); }, null, {timeout: 20000});
try {
  const s1 = await server({});
  const c = new pg.Client({connectionString: url.toString()}); await c.connect(); const seed = await seedQaArchive(c); await c.end();
  const px = await proxy(s1.base);
  let page = await (await browser.newContext()).newPage();
  await page.goto(`${px.base}/#/dashboard?date=${seed.busyDay}`); await ready(page);
  rec('REAL-01 servita dal server: modo REAL', (await page.textContent('#modebtn')) === 'REAL', '');
  // persisted DEMO filter leaks into REAL
  await page.evaluate(() => localStorage.setItem('mp.compFilter', JSON.stringify(['ita-serie-a'])));
  await page.reload(); await ready(page);
  const rows = await page.locator('.mrow').count();
  rec('REAL-02 un filtro campionati salvato in DEMO non deve svuotare silenziosamente il palinsesto REAL', rows > 0, `righe ${rows} (API: 31)`);
  await page.evaluate(() => localStorage.removeItem('mp.compFilter'));
  // error injection
  for (const [code, body] of [[500, {api_version: 'v1', error: {code: 'INTERNAL', message: 'x'}}], [503, {api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'x'}}], [401, {api_version: 'v1', error: {code: 'UNAUTHENTICATED', message: 'x'}}]]) {
    await page.route('**/api/v1/fpt/matches?**', r => r.fulfill({status: code, contentType: 'application/json', body: JSON.stringify(body)}));
    await page.goto(`${px.base}/#/calendar`); await ready(page);
    if (code === 401) { await page.goto(`${px.base}/#/dashboard?date=${seed.busyDay}`).catch(() => {}); await page.waitForURL('**/login**', {timeout: 10000}).catch(() => {}); }
    else { await page.goto(`${px.base}/#/dashboard?date=${seed.busyDay}`); await ready(page); }
    const st = code === 401 ? {url: new URL(page.url()).pathname, next: new URL(page.url()).searchParams.get('next')} : await page.evaluate(() => ({err: document.querySelector('main [data-state="error"]')?.dataset.code, url: location.pathname}));
    if (code === 401) rec('REAL-03 401 a sessione scaduta porta al login (come il sito su main)', st.url === '/login', JSON.stringify(st));
    else rec(`REAL-04 ${code} mostra stato di errore con codice`, !!st.err, JSON.stringify(st));
    await page.unroute('**/api/v1/fpt/matches?**');
    if (code === 401) await page.goto(`${px.base}/#/calendar`).then(() => ready(page));
  }
  // timeout: hold the request
  await page.route('**/api/v1/fpt/matches?**', () => {});
  await page.goto(`${px.base}/#/dashboard?date=${seed.busyDay}`);
  await page.waitForTimeout(16500);
  rec('REAL-05 richiesta senza risposta: errore esplicito entro il timeout (15 s)', await page.locator('main [data-state="error"]').count() === 1, await page.textContent('main'));
  await page.unroute('**/api/v1/fpt/matches?**');
  // F-11: REAL search follows next_cursor (page size forced to 5 to prove it), F-10: PIT selector enabled in REAL
  const seen = [];
  await page.route('**/api/v1/fpt/search?**', r => { const u = new URL(r.request().url()); seen.push(u.searchParams.get('cursor') ? 'c' : '0'); u.searchParams.set('limit', '5'); r.continue({url: u.toString()}); });
  await page.goto(`${px.base}/#/matches?from=2024-07-01&to=2024-08-31`); await ready(page);
  const cnt = Number(await page.getAttribute('[data-testid="matches-results"]', 'data-count').catch(() => -1));
  rec('REAL-07 ricerca partite segue next_cursor (pagine da 5)', seen.length > 1 && seen.slice(1).every(x => x === 'c') && cnt > 5, `richieste ${seen.join(',')} righe ${cnt}`);
  await page.unroute('**/api/v1/fpt/search?**');
  await page.goto(`${px.base}/#/backtest`); await ready(page);
  rec('REAL-08 selettore PIT/NON_PIT attivo in REAL', await page.isEnabled('[data-control="CTL-BT-PIT"]'), '');
  // CSP of main applied to the file
  const pxc = await proxy(s1.base, WEB_SECURITY_HEADERS);
  const pc = await (await browser.newContext()).newPage(); const csp = []; pc.on('console', m => { if (m.type() === 'error') csp.push(m.text()); });
  await pc.goto(`${pxc.base}/`); await pc.waitForTimeout(1500);
  rec('ARCH-CSP il file gira con la CSP del sito su main (script-src/style-src/font-src self)', await pc.evaluate(() => !!document.querySelector('#view')), `errori CSP: ${csp.length} — ${csp[0]?.slice(0, 120)}`);
  px.close(); pxc.close(); s1.stop();
  // auth enforced: silent fallback?
  const hash = await hashPassword('correct horse battery staple 2026', {N: 1024});
  const s2 = await server({MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'owner', MATCHPILOT_OWNER_PASSWORD_HASH: hash});
  const px2 = await proxy(s2.base);
  page = await (await browser.newContext()).newPage();
  await page.goto(`${px2.base}/#/dashboard`).catch(() => {}); await page.waitForURL('**/login**', {timeout: 10000}).catch(() => {});
  const path = new URL(page.url()).pathname, mode = path === '/login' ? 'pagina di login' : await page.textContent('#modebtn').catch(() => '?');
  rec('REAL-06 con login obbligatorio e senza sessione: non deve ripiegare in silenzio su DEMO', mode !== 'DEMO', `modo mostrato: ${mode}, path ${path}`);
  px2.close(); s2.stop();
} finally {
  await browser.close(); await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();
  for (const x of R) console.log((KNOWN_OPEN.some(k => x.id.startsWith(k)) && x.result !== 'PASS' ? 'OPEN' : x.result).padEnd(4), x.id, '|', String(x.d).slice(0, 200));
}
// Exit status: 0 only when every check passes, except the findings deliberately left open (listed in KNOWN_OPEN).
const unexpected = R.filter(x => x.result !== 'PASS' && !KNOWN_OPEN.some(k => x.id.startsWith(k)));
if (unexpected.length) process.exitCode = 1;
