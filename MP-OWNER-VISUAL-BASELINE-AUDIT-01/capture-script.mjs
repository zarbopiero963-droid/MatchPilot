// Visual audit (MP-OWNER-VISUAL-BASELINE-AUDIT-01): screenshots of the mockup and of the real site at main, same viewports.
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const S = process.argv[2];
import {spawn} from 'node:child_process';
const pg = (await import(pathToFileURL(join(S, 'site/node_modules/pg/lib/index.js')).href)).default;
const {chromium} = await import(pathToFileURL(join(S, 'site/node_modules/playwright-core/index.mjs')).href);
const {seedQaArchive} = await import(pathToFileURL(join(S, 'site/test/helpers/fpt-seed.mjs')).href);
const ROOT = 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
async function withQaEnvironment(fn) {
  const admin = new pg.Client(ROOT); await admin.connect();
  const schema = `visual_audit_${process.pid}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const url = new URL(ROOT); url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawn(process.execPath, ['src/server.mjs'], {cwd: join(S, 'site'), env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test'}, stdio: ['ignore', 'pipe', 'pipe']});
  let out = ''; child.stdout.on('data', c => out += c); child.stderr.on('data', c => out += c);
  while (!/listening on (\d+) /.test(out)) await new Promise(r => setTimeout(r, 50));
  const server = {base: `http://127.0.0.1:${/listening on (\d+) /.exec(out)[1]}`};
  const c = new pg.Client(url.toString()); await c.connect();
  const seed = await seedQaArchive(c); await c.end();
  const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox']});
  try { await fn({browser, server, seed}); }
  finally { await browser.close(); child.kill(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
}
const VP = {desktop: {width: 1280, height: 800}, mobile: {width: 390, height: 844}};
const mock = pathToFileURL(join(S, 'site/docs/mockups/matchpilot-trading-os.html')).href;
const fontLog = [];
await withQaEnvironment(async ({browser, server, seed}) => {
  for (const [vpName, vp] of Object.entries(VP)) {
    const ctx = await browser.newContext({viewport: vp});
    const page = await ctx.newPage();
    page.on('requestfailed', r => { if (/fonts\.g/.test(r.url())) fontLog.push(`${vpName} ${r.url().slice(0, 60)} ${r.failure()?.errorText}`); });
    for (const view of ['home', 'data', 'match', 'live', 'strategies', 'backtest']) {
      await page.goto(`${mock}#${view}`);
      await page.waitForTimeout(1200);
      await page.screenshot({path: join(S, `shots/mock-${view}-${vpName}.png`), fullPage: false});
      await page.screenshot({path: join(S, `shots/mock-${view}-${vpName}-full.png`), fullPage: true});
    }
    const site = [['dashboard', '/#/'], ['board', `/#/board?date=${seed.busyDay}`], ['board-empty', '/#/board?date=2024-07-31'],
      ['search', '/#/search?run=1'], ['search-form', '/#/search'], ['search-invalid', '/#/search?run=1&fav_min=abc'], ['providers', '/#/providers'], ['endpoints', '/#/endpoints']];
    for (const [name, path] of site) {
      await page.goto('about:blank');
      await page.goto(`${server.base}${path}`);
      await page.waitForLoadState('networkidle');
      await page.screenshot({path: join(S, `shots/site-${name}-${vpName}.png`), fullPage: false});
      await page.screenshot({path: join(S, `shots/site-${name}-${vpName}-full.png`), fullPage: true});
    }
    const fonts = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    console.log(vpName, 'site font-family:', fonts);
    await ctx.close();
  }
  console.log('browser', browser.version());
});
console.log('font requests failed:', fontLog.length, fontLog.slice(0, 2));
