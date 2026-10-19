#!/usr/bin/env node
// Exploratory Browser QA (MP-OWNER-BROWSER-QA-HARD-GATE-01, level B, QA-02). A seeded crawler explores the real site
// beyond the scripted journeys. It discovers the site's routes and controls, then performs pseudo-random but
// reproducible interactions (links, buttons, selects, checkboxes, text/date/number inputs, back, reload) on desktop and
// mobile. After every action it checks for:
//   js-error        an uncaught exception in the page
//   console-error   a console error that is not the browser's line for a 4xx answer
//   http-5xx        a server error answer
//   request-failed  a failed request (aborted navigations excepted)
//   stuck-loading   a view still loading after the network is idle
//   blank-view      a view that rendered nothing
//   invariant       the generic page invariants of the deterministic gate (raw values, overflow, basic
//                   accessibility, clipped text, overlapping controls)
// Every finding carries the exact action sequence that led to it and is replayed in a fresh browser context; only a
// finding that reproduces is reported as reproduced. The run also records observations (screenshot, accessibility
// snapshot and visible text of every route on every viewport) for the AI review of level B, which a Claude agent
// performs on the bundle (docs/qa/exploratory.md). The crawler does not judge whether a value is right: that is the
// review's job. Output (--out, a fresh directory): exploration.json, screenshots/, observations/, traces/, with the
// SHA-256 of every file. Exit code 1 when a reproduced finding exists.
//
// Usage: node tools/qa/explore.mjs --out <dir> [--seed N] [--actions N] [--viewports desktop,mobile]
import {mkdirSync, existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {git, invariants, listFiles, sha256, withQaEnvironment} from './browser-qa.mjs';
import {JOURNEYS, VIEWPORTS} from './journeys.mjs';

// API prose the deterministic journeys already declare as legitimate (allowRawText): the crawler crosses every route,
// so it accepts the union, and nothing else.
const ALLOW_RAW_TEXT = JOURNEYS.flatMap(journey => journey.allowRawText ?? []);

export const EXPLORE_SCHEMA = 'mp-browser-explore-v1';
// Kinds a reviewer must triage before a merge; an invariant problem is the same class as in the deterministic gate.
export const FINDING_KINDS = ['js-error', 'console-error', 'http-5xx', 'request-failed', 'stuck-loading', 'blank-view', 'invariant'];

// Deterministic PRNG (mulberry32): the same seed and the same site give the same exploration.
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Controls the crawler can use, in DOM order. A control is addressed by its query and index, plus its text as a guard.
const CONTROLS = [
  ['link', 'nav a[href^="#/"], main a[href^="#/"]'],
  ['button', 'main button:not([disabled])'],
  ['select', 'main select'],
  ['checkbox', 'main input[type="checkbox"]'],
  ['text', 'main input[type="search"], main input[type="text"]'],
  ['date', 'main input[type="date"]'],
  ['number', 'main input[type="number"]'],
];
const TEXT_VALUES = ['Ajax', 'PSV', 'Real Madrid', 'Barcelona', '', 'zz', '<b>x</b>', "O'Neil", 'Ü€🙂', 'a'.repeat(80)];
const NUMBER_VALUES = ['', '0', '1.5', '2', '30', '1000', '-1'];

async function candidates(page) {
  const found = [];
  for (const [kind, query] of CONTROLS) {
    const items = await page.locator(query).evaluateAll(nodes => nodes.map((node, index) => {
      const r = node.getBoundingClientRect();
      const s = getComputedStyle(node);
      return {index, visible: r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none',
        text: (node.textContent || node.name || '').trim().slice(0, 40), options: node.tagName === 'SELECT' ? node.options.length : 0};
    }));
    for (const item of items) if (item.visible) found.push({kind, query, index: item.index, text: item.text, options: item.options});
  }
  return found;
}

function chooseAction(random, list, dates) {
  const roll = random();
  if (roll < 0.04) return {type: 'back'};
  if (roll < 0.07) return {type: 'reload'};
  if (!list.length) return {type: 'reload'};
  const target = list[Math.floor(random() * list.length)];
  const pick = values => values[Math.floor(random() * values.length)];
  const base = {type: target.kind, query: target.query, index: target.index, text: target.text};
  if (target.kind === 'select') return {...base, value: Math.floor(random() * Math.max(target.options, 1))};
  if (target.kind === 'text') return {...base, value: pick(TEXT_VALUES)};
  if (target.kind === 'date') return {...base, value: pick([...dates, '1999-01-01', '2100-12-31', ''])};
  if (target.kind === 'number') return {...base, value: pick(NUMBER_VALUES)};
  return base;
}

async function perform(page, action) {
  if (action.type === 'goto') return page.goto(action.url);
  if (action.type === 'back') return page.goBack().catch(() => null);
  if (action.type === 'reload') return page.reload();
  const element = page.locator(action.query).nth(action.index);
  if (action.type === 'select') return element.selectOption({index: action.value});
  if (action.type === 'checkbox') return element.click();
  if (['text', 'date', 'number'].includes(action.type)) return element.fill(String(action.value));
  return element.click();
}

// Watches one page; problems() returns what happened since the last call, already classified.
function watch(page) {
  let pending = [];
  page.on('pageerror', error => pending.push({kind: 'js-error', message: error.message}));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/status of 4\d\d/.test(text)) return; // a refused input is the server doing its job
    pending.push({kind: 'console-error', message: text});
  });
  page.on('response', response => {
    if (response.status() >= 500) pending.push({kind: 'http-5xx', message: `${response.status()} ${new URL(response.url()).pathname}`});
  });
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText ?? 'failed';
    if (failure !== 'net::ERR_ABORTED') pending.push({kind: 'request-failed', message: `${new URL(request.url()).pathname}: ${failure}`});
  });
  return () => { const out = pending; pending = []; return out; };
}

async function settle(page) {
  await page.waitForLoadState('networkidle', {timeout: 5000}).catch(() => {});
}

const onSite = (page, base) => page.url().startsWith(base);

async function check(page, drain) {
  const problems = drain();
  const loading = await page.locator('.state.loading').count();
  if (loading) {
    await page.waitForTimeout(2000);
    if (await page.locator('.state.loading').count()) problems.push({kind: 'stuck-loading', message: 'view still loading after the network is idle'});
  }
  const blank = await page.evaluate(() => { const main = document.querySelector('main'); return !!main && !main.innerText.trim() && !main.querySelector('*'); });
  if (blank) problems.push({kind: 'blank-view', message: 'the view rendered nothing'});
  for (const message of await invariants(page, ALLOW_RAW_TEXT)) problems.push({kind: 'invariant', message});
  return problems;
}

const keyOf = problem => `${problem.kind}: ${problem.message.replace(/\d+/g, 'N').slice(0, 160)}`;

// Runs an action sequence in a fresh context and reports whether the same problem appears again.
async function replay(browser, viewport, base, steps, key, contextHook) {
  const context = await browser.newContext({viewport: VIEWPORTS[viewport]});
  if (contextHook) await contextHook(context);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  const drain = watch(page);
  try {
    for (const step of steps) {
      await perform(page, {...step, url: step.url && new URL(step.url, base).toString()}).catch(() => {});
      await settle(page);
      if (!onSite(page, base)) return false;
      if ((await check(page, drain)).some(problem => keyOf(problem) === key)) return true;
    }
    return false;
  } finally {
    await context.close();
  }
}

export async function runExploration({out, seed = 1, actions = 30, viewports = Object.keys(VIEWPORTS), headSha = process.env.QA_HEAD_SHA, contextHook = null} = {}) {
  out = resolve(out);
  if (existsSync(out) && readdirSync(out).length) throw new Error(`--out ${out} is not empty`);
  for (const dir of ['screenshots', 'observations', 'traces']) mkdirSync(join(out, dir), {recursive: true});
  const testedCommit = git(['rev-parse', 'HEAD']);
  return withQaEnvironment(async ({browser, server, seed: archive}) => {
    const base = server.base;
    const dates = [archive.busyDay, ...archive.eredivisie.dates.slice(0, 2)];
    // Routes: the menu of the site, plus the pages that only exist with parameters.
    const routes = new Set(['/#/', `/#/board?date=${archive.busyDay}`, '/#/search?run=1']);
    {
      const page = await browser.newPage();
      await page.goto(`${base}/`);
      await settle(page);
      for (const href of await page.locator('nav a[href^="#/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) routes.add(`/${href}`);
      await page.close();
    }
    const findings = [];
    const observations = [];
    const seen = new Set();
    let total = 0;
    let actionErrors = 0;
    let routeIndex = 0;
    for (const route of routes) {
      for (const viewport of viewports) {
        const tag = `${String(++routeIndex).padStart(2, '0')}-${viewport}`;
        const random = prng(seed * 1000 + routeIndex);
        const context = await browser.newContext({viewport: VIEWPORTS[viewport]});
        if (contextHook) await contextHook(context);
        await context.tracing.start({screenshots: true, snapshots: true});
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        const drain = watch(page);
        let steps = [{type: 'goto', url: route}];
        await page.goto(`${base}${route}`);
        await settle(page);
        // Observation for the AI review: what a user sees when the route opens.
        const observe = async label => {
          const shot = `observations/${tag}-${label}.png`;
          await page.screenshot({path: join(out, shot), fullPage: true});
          const record = {route, viewport, label, url: page.url().replace(base, ''), screenshot: shot,
            aria: await page.locator('main').ariaSnapshot().catch(() => null),
            text: (await page.locator('main').innerText().catch(() => '')).slice(0, 4000)};
          const file = `observations/${tag}-${label}.json`;
          writeFileSync(join(out, file), JSON.stringify(record, null, 2) + '\n');
          observations.push({route, viewport, label, file, screenshot: shot});
        };
        await observe('open');
        for (let i = 0; i < actions; i++) {
          const action = chooseAction(random, await candidates(page), dates);
          steps.push(action);
          total++;
          // A control that vanished or changed between discovery and action is not a site defect: counted, not reported.
          await perform(page, action).catch(() => { actionErrors++; });
          await settle(page);
          // Leaving the site (history before the first page, an external page) restarts the route without a check:
          // what is outside the site is not the site's defect, and sequences stay short and replayable.
          if (!onSite(page, base) || (await page.locator('main').count()) === 0) {
            await page.goto(`${base}${route}`);
            await settle(page);
            drain();
            steps = [{type: 'goto', url: route}];
            continue;
          }
          for (const problem of await check(page, drain)) {
            const key = keyOf(problem);
            if (seen.has(key)) continue;
            seen.add(key);
            const shot = `screenshots/${tag}-finding-${findings.length + 1}.png`;
            await page.screenshot({path: join(out, shot), fullPage: true}).catch(() => {});
            findings.push({id: `EX-${findings.length + 1}`, kind: problem.kind, message: problem.message, key, route, viewport,
              steps: steps.map(step => step.type === 'goto' ? {type: 'goto', url: step.url} : step), screenshot: shot,
              classification: 'UNTRIAGED', severity: 'UNTRIAGED'});
          }
        }
        await observe('end');
        await context.tracing.stop({path: join(out, `traces/${tag}.zip`)});
        await context.close();
      }
    }
    // Deterministic reproduction of every finding in a fresh context.
    for (const finding of findings) finding.reproduced = await replay(browser, finding.viewport, base, finding.steps, finding.key, contextHook);
    const files = Object.fromEntries(listFiles(out).filter(path => !path.endsWith('exploration.json'))
      .map(path => [relative(out, path).split('\\').join('/'), sha256(readFileSync(path))]));
    const report = {
      schema: EXPLORE_SCHEMA, head_sha: headSha || testedCommit, tested_commit: testedCommit, generated_at: new Date().toISOString(),
      browser: `${browser.browserType().name()} ${browser.version()}`, seed, actions_per_route: actions, viewports, routes: [...routes],
      totals: {actions: total, action_errors: actionErrors, findings: findings.length, reproduced: findings.filter(finding => finding.reproduced).length},
      findings, observations, injected_defect: Boolean(contextHook),
      ai_review: {status: 'NOT_VERIFIED', reason: 'the AI review of level B is a separate step on this bundle (docs/qa/exploratory.md)'},
      limitations: ['explores the hash routes of the site; /coverage and /login are out of scope', 'checks generic properties, not whether a value is right (that is the AI review)',
        'QA archive fixture, not production data'],
      files,
    };
    writeFileSync(join(out, 'exploration.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const out = opt('out');
  if (!out) { console.error('usage: explore.mjs --out <dir> [--seed N] [--actions N] [--viewports desktop,mobile]'); process.exit(2); }
  const report = await runExploration({out, seed: Number(opt('seed') ?? 1), actions: Number(opt('actions') ?? 30), viewports: opt('viewports')?.split(',')});
  for (const finding of report.findings) console.log(`${finding.reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${finding.id} ${finding.kind} ${finding.route} ${finding.viewport}: ${finding.message.slice(0, 160)}`);
  console.log(JSON.stringify({totals: report.totals, routes: report.routes.length, head_sha: report.head_sha}));
  process.exit(report.totals.reproduced ? 1 : 0);
}
