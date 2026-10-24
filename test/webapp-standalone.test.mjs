// MP-UI-ROADMAP-01: the single-file MatchPilot web app (webapp/dist/matchpilot-webapp.html), opened as a local file in a
// real Chromium. Every view renders at desktop, tablet and mobile sizes without console errors, horizontal scroll, raw
// values or interactive elements without a declared control id; the built-in autotest then exercises every control and
// must pass every scenario. DEMO data only: the file records SEEN/ACTUATED/ASSERTED evidence, never CERTIFIED MOCK or REAL.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';

const BROWSERS = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const VIEWS = ['dashboard', 'calendar', 'matches', 'competitions', 'live', 'copilot', 'analysis', 'replay', 'strategies', 'backtest', 'paper', 'money', 'tools', 'settings', 'session', 'diagnostics', 'coverage'];

test('the single-file web app renders every view and passes its built-in autotest', {timeout: 300000}, async t => {
  const executablePath = BROWSERS.find(p => p && existsSync(p));
  if (!executablePath) {
    if (process.env.CI) throw new Error('no Chromium/Chrome (set MATCHPILOT_E2E_CHROME)');
    return t.skip('no local Chromium/Chrome');
  }
  execFileSync(process.execPath, ['webapp/build.mjs']);
  const {chromium} = await import('playwright-core');
  const browser = await chromium.launch({executablePath, args: ['--no-sandbox']});
  try {
    for (const viewport of [{width: 1366, height: 860}, {width: 820, height: 1180}, {width: 390, height: 844}]) {
      const page = await (await browser.newContext({viewport})).newPage();
      const problems = [];
      page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(m.text()); });
      page.on('pageerror', e => problems.push(e.message));
      await page.goto(`file://${resolve('webapp/dist/matchpilot-webapp.html')}`);
      await page.waitForFunction(() => document.querySelector('#view')?.dataset.ready);
      assert.equal(await page.textContent('#modebtn'), 'DEMO', 'a local file has no server: DEMO');
      for (const view of VIEWS) {
        await page.evaluate(v => { location.hash = `#/${v}`; }, view);
        await page.waitForFunction(v => document.querySelector('#view').dataset.view === v && document.querySelector('#view').dataset.ready, view);
        const r = await page.evaluate(() => ({audit: window.MatchPilot.audit(), overflow: document.documentElement.scrollWidth - innerWidth,
          raw: /\b(undefined|NaN)\b|\[object/.test(document.querySelector('main').innerText)}));
        assert.deepEqual(r.audit, {missing: [], unknown: []}, `${view} @${viewport.width}: controls without a declared id`);
        assert.ok(r.overflow <= 0, `${view} @${viewport.width}: horizontal scroll ${r.overflow}px`);
        assert.equal(r.raw, false, `${view} @${viewport.width}: raw value on screen`);
      }
      if (viewport.width === 1366) {
        const rec = await page.evaluate(() => window.MatchPilot.runAutotest());
        const failed = rec.scenarios.filter(s => s.result === 'FAIL').map(s => `${s.id}: ${s.error}`);
        assert.deepEqual(failed, [], 'autotest scenarios failed');
        const specs = await page.evaluate(() => window.MatchPilot.specs().map(s => s.id));
        const blocked = Object.entries(rec.controls).filter(([, x]) => x.result === 'BLOCKED').map(([id]) => id);
        const untested = specs.filter(id => !rec.controls[id]);
        assert.deepEqual(untested, [], 'every declared control is exercised or explicitly blocked');
        assert.deepEqual(blocked.sort(), ['CTL-BT-PIT', 'CTL-MODE-REAL', 'CTL-PAPER-ACCOUNT', 'CTL-PAPER-LOAD', 'CTL-SESSION-LOGIN', 'CTL-SESSION-LOGOUT'], 'only server-only controls are blocked');
        // The starter of the autotest cannot verify itself, and a PASS without a later check is only ACTUATED.
        assert.equal(rec.controls['CTL-COV-RUN'].result, 'NOT_RUN');
        for (const [id, x] of Object.entries(rec.controls)) {
          assert.ok(['ASSERTED', 'ACTUATED', 'NONE'].includes(x.evidence), `${id}: evidence ${x.evidence}`);
          if (x.evidence === 'ASSERTED') assert.ok(x.assertedBy.length > 0, `${id}: ASSERTED without a scenario`);
        }
        const levels = await page.evaluate(() => { location.hash = '#/coverage?tab=controls'; return new Promise(r => setTimeout(() => r(document.querySelector('[data-kpi="certified"]')?.textContent ?? ''), 500)); });
        assert.match(levels, /0 · 0/, 'the file never claims CERTIFIED MOCK or REAL');
        assert.deepEqual(rec.unknownIds, [], 'no undeclared control id');
      }
      assert.deepEqual(problems, [], `console problems @${viewport.width}`);
    }
  } finally { await browser.close(); }
});
