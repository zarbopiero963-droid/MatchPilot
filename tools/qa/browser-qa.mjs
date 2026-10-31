#!/usr/bin/env node
// Browser QA Gate runner (MP-OWNER-BROWSER-QA-HARD-GATE-01, level A). Starts the real server on a throwaway PostgreSQL
// schema, loads the QA archive through the real ingestion path, drives a real Chromium through every required journey
// on every required viewport, and writes verifiable evidence to --out:
//   report.json            commit, environment, dataset, journeys, steps, errors, findings, limitations, computed verdict
//   screenshots/*.png      one per step (and one on failure)
//   traces/*.zip           a Playwright trace per journey and viewport
// Every evidence file is listed in report.files with its SHA-256, so tools/qa/verify-report.mjs can prove the report
// belongs to the tested commit and that nothing was removed or changed afterwards. The verdict is computed from the
// results, never declared. Exit code 0 only when the verdict is PASS.
//
// Usage: node tools/qa/browser-qa.mjs --out <dir> [--journeys id,id] [--viewports desktop,mobile]
// Env:   FUTPYTHON_TEST_DATABASE_URL (local throwaway PostgreSQL only), MATCHPILOT_E2E_CHROME, QA_HEAD_SHA (PR head)
import {execFileSync, spawn} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {arch, platform, release} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JOURNEYS, REQUIRED_JOURNEYS, REQUIRED_VIEWPORTS, VIEWPORTS} from './journeys.mjs';
import {inventoryIds, loadInventory} from './control-inventory.mjs';
import {BADGES} from '../../src/web/states.js';

export const REPORT_SCHEMA = 'mp-browser-qa-v1';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const BROWSERS = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
export const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
export const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// A JavaScript value that leaked to the page: null/undefined alone or before punctuation or the end of a text node
// ("null", "null · 1,2", "Partite del undefined"), or NaN anywhere. A word followed by more words (the field label
// "undefined states") is not a leak. API prose that legitimately ends with such a word is declared per journey in
// allowRawText, never allowed globally (PR #164 NB-3).
export const RAW_VALUE = /(?:^|[\s(:·–])(?:null|undefined)(?=\s*(?:$|[·–),.;:]))|\bNaN\b/;

// Technical text that a user view never shows (MP-OWNER-UI-NO-RAW-TEXT-01, MP-WEB-015): API codes and parameter names
// (FINAL, HTTP_503, PROVIDER_TZ_UNDOCUMENTED, fav_min), dataset keys (spain/laliga/2024-2025), API routes, raw ISO dates
// and instants, and the implementation words of the inventory (docs/qa/ui-text-inventory.md). Codes are matched
// case-sensitively, words not.
// Checked in main when the view declares data-area="user", and in the page header and footer. No view has lead text (the
// explanatory paragraph style under a title): the rule bans superfluous explanations, not only technical words.
export const TECHNICAL_CODE = /\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b|\b[a-z][a-z0-9]*_[a-z0-9_]+\b|\b(?:FINAL|HISTORICAL|PREMATCH|HOME|AWAY|EVEN|KEPT|DEPRECATED|UNAVAILABLE|NETWORK)\b|\bHTTP \d{3}\b|\[object \w+\]|\b[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\/\d{4}(?:-\d{4})?\b|\/api\/|\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?\b/;
export const TECHNICAL_WORD = /\b(?:dataset|pipeline|endpoint|snapshot|backfill|payload|envelope|cursore?|schema|slug|provenance|debug|fornitore|provider|api v1|versione codice|generato|dati salvati|fuso del fornitore)\b|\bfonte:/i;
export const technicalText = text => TECHNICAL_CODE.test(text) || TECHNICAL_WORD.test(text);

// The interactive elements of the page, as the control inventory counts them (MP-UI-PR-001).
export const CONTROL_SELECTOR = 'a[href], button, input:not([type="hidden"]), select, textarea, summary';

// Generic checks after every step: what no page may ever show, whatever the journey.
// `knownControls` (the ids of docs/qa/control-inventory.json): every visible control of the page must carry a
// `data-control` id the inventory lists, so no control can be added without being inventoried.
export async function invariants(page, allowRawText = [], knownControls = null) {
  return page.evaluate(([rawSource, allowSources, codeSource, wordSource, known, controlSelector, badgeTexts]) => {
    const rawValue = new RegExp(rawSource);
    const allowed = allowSources.map(source => new RegExp(source));
    const technical = [new RegExp(codeSource), new RegExp(wordSource, 'i')];
    const problems = [];
    const main = document.querySelector('main');
    const walker = document.createTreeWalker(main ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (rawValue.test(text) && !allowed.some(pattern => pattern.test(text))) problems.push(`raw value shown: "${text.slice(0, 60)}"`);
    }
    // Lead text is banned from every view, technical ones included (V-B2a: none is left).
    for (const lead of main?.querySelectorAll('.lead') ?? []) problems.push(`explanatory text under a title: "${lead.textContent.trim().slice(0, 60)}"`);
    for (const scope of [main?.dataset.area === 'user' ? main : null, document.querySelector('header'), document.querySelector('footer')]) {
      if (!scope) continue;
      const texts = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        const text = node.textContent.trim();
        if (text && technical.some(pattern => pattern.test(text))) problems.push(`technical text in a user view: "${text.slice(0, 60)}"`);
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth) problems.push(`horizontal overflow ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    // Basic accessibility.
    if (!document.documentElement.lang) problems.push('html has no lang');
    const h1 = document.querySelectorAll('main h1');
    if (h1.length !== 1) problems.push(`${h1.length} h1 in main`);
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const name = el => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.value || el.getAttribute('placeholder') || '').trim()
      || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent.trim()) || el.closest('label')?.textContent.trim() || '';
    for (const el of document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea')) {
      if (visible(el) && !name(el)) problems.push(`control without accessible name: <${el.tagName.toLowerCase()}> ${el.outerHTML.slice(0, 80)}`);
    }
    for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) problems.push('img without alt');
    // Data modes and badges (MP-UI-PR-007, MP-REQ-UI-1029/1043/1079): an area declared DEMO (data-mode, the view itself
    // included) shows a visible DEMO badge; every badge says exactly the text of its kind in src/web/states.js.
    for (const area of [main, ...(main?.querySelectorAll('[data-mode="DEMO"]') ?? [])].filter(node => node?.dataset.mode === 'DEMO')) {
      if (![...area.querySelectorAll('[data-badge="DEMO"]')].some(visible)) problems.push('DEMO data without a visible DEMO badge');
    }
    for (const node of document.querySelectorAll('[data-badge]')) {
      const kind = node.dataset.badge;
      if (!Object.hasOwn(badgeTexts, kind)) problems.push(`unknown badge ${kind}`);
      else if (node.textContent.trim() !== badgeTexts[kind]) problems.push(`badge ${kind} shows "${node.textContent.trim().slice(0, 30)}"`);
    }
    let last = 0;
    for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4')) {
      const level = Number(h.tagName[1]);
      if (last && level > last + 1) problems.push(`heading jumps from h${last} to h${level}`);
      last = level;
    }
    // Layout: squeezed text (V-A, audit A-2): a text of 12+ characters broken almost at every character, because its
    // box is too narrow, is unreadable even when nothing overflows. Fewer than 6 characters per rendered line fails.
    const squeezed = document.createTreeWalker(main ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = squeezed.nextNode(); node; node = squeezed.nextNode()) {
      const text = node.textContent.trim();
      if (text.length < 12 || !node.parentElement || !visible(node.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const lines = new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size;
      if (lines > 1 && text.length / lines < 6) problems.push(`squeezed text (${text.length} characters on ${lines} lines): "${text.slice(0, 40)}"`);
    }
    // Layout: clipped text and overlapping controls.
    for (const el of main?.querySelectorAll('*') ?? []) {
      const s = getComputedStyle(el);
      const clips = ['hidden', 'clip'].includes(s.overflowX) || s.textOverflow === 'ellipsis';
      if (clips && el.scrollWidth > el.clientWidth + 1 && el.children.length === 0 && el.textContent.trim()) problems.push(`truncated text: "${el.textContent.trim().slice(0, 40)}"`);
    }
    const controls = [...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select')].filter(visible);
    for (let i = 0; i < controls.length; i++) {
      for (let j = i + 1; j < controls.length; j++) {
        const a = controls[i], b = controls[j];
        if (a.contains(b) || b.contains(a)) continue;
        // A fixed bar (the phone menu at the bottom) lies over the page by design and the page scrolls under it: only
        // controls of the same layer can collide (V-B2).
        if (Boolean(a.closest('.mainnav')) !== Boolean(b.closest('.mainnav')) && getComputedStyle(document.querySelector('.mainnav')).position === 'fixed') continue;
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        const overlap = Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2;
        if (overlap) problems.push(`overlapping controls: ${a.tagName.toLowerCase()} "${(a.textContent || a.name || '').trim().slice(0, 20)}" and ${b.tagName.toLowerCase()} "${(b.textContent || b.name || '').trim().slice(0, 20)}"`);
      }
    }
    if (known) {
      const ids = new Set(known);
      for (const el of document.body.querySelectorAll(controlSelector)) {
        if (!visible(el)) continue;
        const id = el.dataset.control;
        if (!id) problems.push(`control without data-control: <${el.tagName.toLowerCase()}> ${el.outerHTML.slice(0, 80)}`);
        else if (!ids.has(id)) problems.push(`control ${id} is not in the control inventory`);
      }
    }
    return [...new Set(problems)];
  }, [RAW_VALUE.source, allowRawText.map(pattern => pattern.source), TECHNICAL_CODE.source, TECHNICAL_WORD.source, knownControls, CONTROL_SELECTOR,
    Object.fromEntries(Object.values(BADGES).map(spec => [spec.kind, spec.text]))]);
}

// The visible inventoried controls of the page.
export const visibleControls = page => page.evaluate(() => [...new Set([...document.querySelectorAll('[data-control]')]
  .filter(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; })
  .map(el => el.dataset.control))].sort());

// Records, in the page, every user action on an inventoried control: click, input, change of a select or checkbox (a
// text field already reports input; its change fires on blur, possibly in the next step) and submit (for a submit, the
// form's submit button, also when the form is sent with Enter), reported through the __mpControl binding so that page
// loads lose nothing.
const ACTUATION_SCRIPT = `(() => {
  const report = (event) => {
    if (event.type === 'change' && !(event.target instanceof HTMLSelectElement || event.target.type === 'checkbox')) return;
    const target = event.type === 'submit' ? (event.submitter ?? event.target.querySelector('[type=submit][data-control]')) : event.target;
    const id = target?.closest?.('[data-control]')?.dataset.control;
    if (id && window.__mpControl) window.__mpControl(id);
  };
  for (const type of ['click', 'input', 'change', 'submit']) window.addEventListener(type, report, true);
})();`;

export function browserPath() {
  return BROWSERS.find(path => path && existsSync(path)) || null;
}

export async function startServer(schema, env = {}) {
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: root,
    env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test', ...env},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!/listening on \d+ /.test(output) && child.exitCode == null && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
  const port = Number(/listening on (\d+) /.exec(output)?.[1]);
  if (!(port > 0)) { child.kill('SIGKILL'); throw new Error(`server did not start: ${output.slice(-500)}`); }
  // Stopping never hangs: an already exited server resolves at once, a stuck one is killed after 5 s (PR #164 NB-4).
  const stop = () => new Promise(done => {
    if (child.exitCode !== null || child.signalCode !== null) return done();
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.on('close', () => { clearTimeout(timer); done(); });
    child.kill('SIGTERM');
  });
  return {base: `http://127.0.0.1:${port}`, url, stop};
}

// A journey may declare a network failure it provokes on purpose (allowNetwork: [{path, error}]): that request failing
// with that error, and its console line, are expected; any other failure still fails the journey.
const allowedNetwork = (journey, url, error) => (journey.allowNetwork ?? []).some(rule => new URL(url).pathname === rule.path && rule.error === error);
// An expected HTTP error may be bound to the one step that provokes it (`step`: its exact name): outside that step the
// same status on the same path fails the journey. A 500 is a server defect, so its allowance must name the step
// (review #251, MP-OWNER-UI006-FINAL-UI007-01).
const stepsOf = rule => (rule.step === undefined ? null : [].concat(rule.step));
const allowedHttp = (journey, url, status, current) => (journey.allowHttp ?? []).some(rule => new URL(url).pathname === rule.path && rule.status === status
  && (stepsOf(rule) === null || stepsOf(rule).includes(current)));
// The console lines a journey did not expect. Each allowed response (status and path) excuses the one line the browser
// writes for that resource, no more and no other; an allowed network failure excuses its own line (review #251 R3-1).
const pathOf = url => { try { return new URL(url).pathname; } catch { return ''; } };
export function unexpectedConsoleLines(lines, allowedResponses, allowedFailures = new Set()) {
  const left = new Map();
  for (const {status, path} of allowedResponses) left.set(`${status} ${path}`, (left.get(`${status} ${path}`) ?? 0) + 1);
  return lines.filter(({text, url}) => {
    const status = /status of (\d{3})/.exec(text)?.[1];
    const key = status ? `${status} ${pathOf(url)}` : null;
    if (key && left.get(key) > 0) { left.set(key, left.get(key) - 1); return false; }
    return ![...allowedFailures].some(failure => text === `Failed to load resource: ${failure}`);
  }).map(({text, url}) => (url ? `${text} (${pathOf(url)})` : text));
}

export function allowHttpErrors(journey) {
  const errors = [];
  for (const rule of journey.allowHttp ?? []) {
    if (rule.step !== undefined && (!stepsOf(rule).length || stepsOf(rule).some(name => typeof name !== 'string' || !name.trim()))) errors.push(`allowHttp ${rule.path} ${rule.status}: step must be a step name or a list of them`);
    // A server error (5xx) is allowed only in the step that provokes it: elsewhere it is an outage to report (review #251 T-2).
    if (rule.status >= 500 && rule.step === undefined) errors.push(`allowHttp ${rule.path} ${rule.status}: a ${rule.status} is allowed only in the step that provokes it`);
  }
  return errors;
}

async function runJourney({browser, journey, viewportName, base, out, api, seed, owner, contextHook, knownControls}) {
  const tag = `${journey.id}-${viewportName}`;
  const context = await browser.newContext({viewport: VIEWPORTS[viewportName]});
  let actuated = new Set();
  await context.exposeBinding('__mpControl', (_source, id) => { if (typeof id === 'string') actuated.add(id); });
  await context.addInitScript(ACTUATION_SCRIPT);
  // Tests only: lets a test inject a defect into the page under test, to prove the gate detects it.
  if (contextHook) await contextHook(context);
  await context.tracing.start({screenshots: true, snapshots: true, sources: false});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const consoleErrors = [], pageErrors = [], httpErrors = [], requestFailures = [];
  const allowedResponses = [];
  const allowedFailures = new Set();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push({text: message.text(), url: message.location()?.url ?? ''}); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText ?? 'failed';
    if (allowedNetwork(journey, request.url(), failure)) allowedFailures.add(failure);
    else if (failure !== 'net::ERR_ABORTED') requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${failure}`);
  });
  // Requests still in flight: a step waits for them before it ends, so a late answer is judged in the step that asked
  // for it, not lost or credited to the next one (review #251 R2-4).
  const inflight = new Set();
  page.on('request', request => inflight.add(request));
  for (const done of ['requestfinished', 'requestfailed']) page.on(done, request => inflight.delete(request));
  page.on('response', response => {
    if (response.status() < 400) return;
    if (allowedHttp(journey, response.url(), response.status(), current)) {
      allowedResponses.push({status: response.status(), path: new URL(response.url()).pathname, step: current});
    }
    else httpErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const steps = [];
  const started = Date.now();
  let status = 'PASS';
  let reason = null;
  let current = null;
  const ruleErrors = allowHttpErrors(journey);
  const shot = async name => {
    const file = `screenshots/${tag}-${String(steps.length + 1).padStart(2, '0')}-${name}.png`;
    await page.screenshot({path: join(out, file), fullPage: true});
    return file;
  };
  // ASSERTED evidence (MP-UI-PR-002, MP-UI-HARD-GATES-01): inside a step, `asserted(controls, description, check)` runs
  // the check of what the action produced and, only when it passes, records the controls as asserted in this step. A
  // control must have been actuated earlier in the same step, the description must say what is verified and the check
  // must be a function; a failing check fails the step. Calling it outside a step is a defect of the journey.
  let assertions = null;
  const asserted = async (controls, description, check) => {
    const list = [].concat(controls);
    if (!assertions) throw new Error('asserted() outside a step');
    if (!list.length || list.some(id => typeof id !== 'string' || !/^CTL-[A-Z0-9-]+$/.test(id))) throw new Error(`asserted(): invalid control ids ${JSON.stringify(list)}`);
    if (typeof description !== 'string' || description.trim().length < 8) throw new Error('asserted(): the description must say what is verified');
    if (typeof check !== 'function') throw new Error('asserted(): the check must be a function');
    await page.evaluate(() => 0); // every action so far has reached the binding
    const missing = list.filter(id => !actuated.has(id));
    if (missing.length) throw new Error(`asserted() without an action in this step: ${missing.join(', ')}`);
    await check();
    assertions.push({controls: [...list].sort(), description: description.trim()});
  };
  const step = async (name, fn) => {
    const slug = name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);
    actuated = new Set();
    assertions = [];
    current = name;
    try {
      await fn();
      await page.evaluate(() => 0); // the responses of the step are seen while it is still the current step
      for (const until = Date.now() + 5000; inflight.size && Date.now() < until;) await new Promise(done => setTimeout(done, 50));
      // Requests still running after the wait are named in the step, so a late answer is easy to trace (review #252 F4).
      const pending = [...inflight].map(request => new URL(request.url()).pathname);
      const problems = await invariants(page, journey.allowRawText, knownControls);
      if (problems.length) throw new Error(`invariants: ${problems.join('; ')}`);
      const seen = await visibleControls(page); // also a round trip: every action of the step has reached the binding
      const done = assertions;
      assertions = null;
      steps.push({name, status: 'PASS', screenshot: await shot(slug), actuated: [...actuated].sort(), seen, ...(pending.length ? {pending} : {}),
        asserted: [...new Set(done.flatMap(a => a.controls))].sort(), assertions: done});
    } catch (error) {
      assertions = null;
      steps.push({name, status: 'FAIL', error: String(error?.message ?? error).slice(0, 2000), screenshot: await shot(`${slug}-failure`).catch(() => null), actuated: [...actuated].sort(), asserted: []});
      throw error;
    } finally {
      current = null;
    }
  };
  try {
    if (ruleErrors.length) throw new Error(`journey declaration: ${ruleErrors.join('; ')}`);
    await journey.run({page, base, step, asserted, api, seed, owner});
  } catch (error) {
    status = 'FAIL';
    reason = String(error?.message ?? error).slice(0, 2000);
  }
  // An allowance bound to a step that never ran is a stale declaration: it fails the journey, never silently.
  const stale = (journey.allowHttp ?? []).flatMap(rule => (stepsOf(rule) ?? []).filter(name => !steps.some(s => s.name === name)).map(name => ({...rule, step: name})));
  if (status === 'PASS' && stale.length) {
    status = 'FAIL';
    reason = `allowHttp bound to a step that did not run: ${stale.map(rule => `${rule.status} ${rule.path} «${rule.step}»`).join('; ')}`;
  }
  // Errors the journey did not expect fail it, even when every assertion passed.
  const unexpectedConsole = unexpectedConsoleLines(consoleErrors, allowedResponses, allowedFailures);
  if (status === 'PASS' && (unexpectedConsole.length || pageErrors.length || httpErrors.length || requestFailures.length)) {
    status = 'FAIL';
    reason = 'unexpected browser errors';
  }
  const trace = `traces/${tag}.zip`;
  await context.tracing.stop({path: join(out, trace)});
  await context.close();
  return {
    id: journey.id, surface: journey.surface, title: journey.title, viewport: viewportName, viewport_size: VIEWPORTS[viewportName],
    required: REQUIRED_JOURNEYS.includes(journey.id), status, reason, duration_ms: Date.now() - started, steps, trace,
    console_errors: unexpectedConsole, page_errors: pageErrors, http_errors: httpErrors, request_failures: requestFailures, allowed_http: allowedResponses,
  };
}

export function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    // A symbolic link is listed as itself, never followed: the manifest check refuses it.
    const stat = lstatSync(path);
    if (stat.isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}

export function computeVerdict(journeys) {
  const counts = {pass: 0, fail: 0, skip: 0, not_verified: 0};
  for (const journey of journeys) counts[journey.status.toLowerCase()]++;
  const missing = [];
  for (const id of REQUIRED_JOURNEYS) for (const viewport of REQUIRED_VIEWPORTS) {
    if (!journeys.some(journey => journey.id === id && journey.viewport === viewport && journey.status === 'PASS')) missing.push(`${id}/${viewport}`);
  }
  return {counts, verdict: counts.fail === 0 && missing.length === 0 ? 'PASS' : 'FAIL', missing};
}

export async function runBrowserQa({out, journeys = JOURNEYS, viewports = REQUIRED_VIEWPORTS, headSha = process.env.QA_HEAD_SHA, contextHook = null} = {}) {
  const testedCommit = git(['rev-parse', 'HEAD']);
  const dirty = git(['status', '--porcelain', '--untracked-files=no']) !== '';
  out = resolve(out);
  // A fresh directory only: files of an earlier run must never enter this run's manifest (PR #164 NB-5).
  if (existsSync(out) && readdirSync(out).length) throw new Error(`--out ${out} is not empty`);
  mkdirSync(join(out, 'screenshots'), {recursive: true});
  mkdirSync(join(out, 'traces'), {recursive: true});
  const knownControls = inventoryIds(loadInventory());
  return withQaEnvironment(async ({browser, server, seed, api, health, executablePath, owner}) => {
    const results = [];
    for (const journey of journeys) for (const viewport of viewports) {
      results.push(await runJourney({browser, journey, viewportName: viewport, base: server.base, out, api, seed, owner, contextHook, knownControls}));
    }
    const {counts, verdict, missing} = computeVerdict(results);
    const files = Object.fromEntries(listFiles(out).filter(path => !path.endsWith('report.json'))
      .map(path => [relative(out, path).split('\\').join('/'), sha256(readFileSync(path))]));
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const report = {
      schema: REPORT_SCHEMA,
      head_sha: headSha || testedCommit,
      tested_commit: testedCommit,
      tested_tree: git(['rev-parse', 'HEAD^{tree}']),
      working_tree_clean: !dirty,
      generated_at: new Date().toISOString(),
      environment: {node: process.version, browser: `${browser.browserType().name()} ${browser.version()}`, browser_path: executablePath,
        os: `${platform()} ${release()} ${arch()}`, ci: Boolean(process.env.CI), ci_run_id: process.env.GITHUB_RUN_ID ?? null},
      software: {package: pkg.name, version: pkg.version, code_version: health.meta?.code_version ?? null},
      dataset: {fixture: 'test/helpers/fpt-seed.mjs#seedQaArchive', ingestion: 'real FutPythonTrader path (CSV → storeDataset → facts)',
        competitions: [seed.eredivisie.competition, seed.laliga.competition], matches: seed.matches, busy_day: seed.busyDay,
        fixture_sha256: sha256(readFileSync(join(root, 'test/helpers/fpt-seed.mjs'))), production_data: false,
        persistence: 'staged schema db/staged/030-persistence.sql applied to the throwaway schema; a second server on it with MATCHPILOT_AUTH=enforce and a test owner'},
      required: {journeys: REQUIRED_JOURNEYS, viewports: REQUIRED_VIEWPORTS},
      journeys: results,
      counts,
      missing_required: missing,
      findings: results.filter(journey => journey.status === 'FAIL').map(journey => ({
        id: `QA-${journey.id}-${journey.viewport}`, classification: 'BUG', severity: 'UNTRIAGED', journey: journey.id, viewport: journey.viewport,
        reason: journey.reason, evidence: [journey.trace, ...journey.steps.map(step => step.screenshot).filter(Boolean)],
      })),
      exploratory: {status: 'NOT_VERIFIED', reason: 'level B (exploratory AI agent) is not part of this run'},
      injected_defect: Boolean(contextHook),
      limitations: [
        'QA archive is a seeded fixture through the real ingestion path, not the real archive (#40) nor production data',
        'accessibility checks are basic structural checks, not a full WCAG audit',
        'saves are verified on the throwaway schema with the staged persistence schema; production has no persistence schema yet (503)',
        'the sim-save traces contain the test owner password and session of this run (login request, cookie header): generated per run, valid only on the local server and schema destroyed at its end; no real credential is ever used',
      ],
      verdict,
      files,
    };
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  });
}

// The QA environment shared by the deterministic gate and the exploratory crawler: a throwaway PostgreSQL schema, the
// real server on it, the QA archive through the real ingestion path and a real Chromium. Always cleaned up.
// MP-UI-PR-003: the staged persistence schema is applied to the same throwaway schema, and a second server runs on it
// with the owner login enforced (`owner`: its base and a test owner, created for this run only), so a journey can save
// for real; the first server keeps the login off, as production does today. The Playwright traces of that journey record
// the login request and the session cookie: the password is random per run and both die with the server and the schema
// at the end of the run (review #242 NB-1); a real credential must never be used here.
export async function withQaEnvironment(fn, {browserEnv = null} = {}) {
  const executablePath = browserPath();
  if (!executablePath) throw new Error('no Chromium/Chrome (set MATCHPILOT_E2E_CHROME)');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname)) throw new Error('Browser QA runs on a local throwaway PostgreSQL only');
  const pg = (await import('pg')).default;
  const {chromium} = await import('playwright-core');
  const {seedQaArchive} = await import('../../test/helpers/fpt-seed.mjs');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 5000});
  await admin.connect();
  const schema = `browser_qa_${process.pid}_${Date.now()}`;
  let server, browser, ownerServer;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    server = await startServer(schema);
    const client = new pg.Client({connectionString: server.url.toString()});
    await client.connect();
    const seed = await seedQaArchive(client).then(async result => {
      await client.query(readFileSync(join(root, 'db/staged/030-persistence.sql'), 'utf8'));
      return result;
    }).finally(() => client.end());
    const {hashPassword} = await import('../../src/auth/owner-auth.mjs');
    const password = `qa-${randomBytes(18).toString('hex')}`;
    ownerServer = await startServer(schema, {MATCHPILOT_AUTH: 'enforce', MATCHPILOT_OWNER_USERNAME: 'qa-owner',
      MATCHPILOT_OWNER_PASSWORD_HASH: await hashPassword(password, {N: 1024})});
    const owner = {base: ownerServer.base, username: 'qa-owner', password};
    const health = await (await fetch(`${server.base}/api/v1/health`)).json();
    const api = async path => {
      const response = await fetch(`${server.base}${path}`);
      if (!response.ok) throw new Error(`API ${path}: ${response.status}`);
      return response.json();
    };
    browser = await chromium.launch({executablePath, args: ['--no-sandbox'], ...(browserEnv ? {env: {...process.env, ...browserEnv}} : {})});
    return await fn({browser, server, seed, api, health, executablePath, owner});
  } finally {
    await browser?.close().catch(() => {});
    await server?.stop().catch(() => {});
    await ownerServer?.stop().catch(() => {});
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const out = opt('out');
  if (!out) { console.error('usage: browser-qa.mjs --out <dir> [--journeys a,b] [--viewports desktop,mobile]'); process.exit(2); }
  const only = opt('journeys')?.split(',');
  const report = await runBrowserQa({out, journeys: only ? JOURNEYS.filter(journey => only.includes(journey.id)) : JOURNEYS,
    viewports: opt('viewports')?.split(',') ?? REQUIRED_VIEWPORTS});
  for (const journey of report.journeys) console.log(`${journey.status.padEnd(4)} ${journey.id}/${journey.viewport} (${journey.steps.length} steps)${journey.reason ? ` — ${journey.reason.split('\n')[0]}` : ''}`);
  console.log(JSON.stringify({verdict: report.verdict, counts: report.counts, missing_required: report.missing_required, head_sha: report.head_sha}));
  process.exit(report.verdict === 'PASS' ? 0 : 1);
}
