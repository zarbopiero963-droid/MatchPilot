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
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {arch, platform, release} from 'node:os';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JOURNEYS, REQUIRED_JOURNEYS, REQUIRED_VIEWPORTS, VIEWPORTS} from './journeys.mjs';

export const REPORT_SCHEMA = 'mp-browser-qa-v1';
const root = fileURLToPath(new URL('../../', import.meta.url));
const ROOT_URL = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const BROWSERS = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// A JavaScript value that leaked to the page: a text node that is exactly null/undefined/NaN (what a missing value
// rendered without formatScalar becomes), or NaN anywhere. API prose such as "expected null" or the label
// "undefined states" is data and stays allowed.
export const RAW_VALUE = /^(?:null|undefined|NaN)$|\bNaN\b/;

// Generic checks after every step: what no page may ever show, whatever the journey.
async function invariants(page) {
  return page.evaluate(rawSource => {
    const rawValue = new RegExp(rawSource);
    const problems = [];
    const main = document.querySelector('main');
    const walker = document.createTreeWalker(main ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (rawValue.test(text)) problems.push(`raw value shown: "${text.slice(0, 60)}"`);
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
    let last = 0;
    for (const h of document.querySelectorAll('main h1, main h2, main h3, main h4')) {
      const level = Number(h.tagName[1]);
      if (last && level > last + 1) problems.push(`heading jumps from h${last} to h${level}`);
      last = level;
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
        const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        const overlap = Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2;
        if (overlap) problems.push(`overlapping controls: ${a.tagName.toLowerCase()} "${(a.textContent || a.name || '').trim().slice(0, 20)}" and ${b.tagName.toLowerCase()} "${(b.textContent || b.name || '').trim().slice(0, 20)}"`);
      }
    }
    return [...new Set(problems)];
  }, RAW_VALUE.source);
}

function browserPath() {
  return BROWSERS.find(path => path && existsSync(path)) || null;
}

async function startServer(schema) {
  const url = new URL(ROOT_URL);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: root,
    env: {PATH: process.env.PATH, PORT: '0', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test'},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 30000;
  while (!/listening on \d+ /.test(output) && child.exitCode == null && Date.now() < deadline) await new Promise(done => setTimeout(done, 50));
  const port = Number(/listening on (\d+) /.exec(output)?.[1]);
  if (!(port > 0)) { child.kill('SIGKILL'); throw new Error(`server did not start: ${output.slice(-500)}`); }
  return {base: `http://127.0.0.1:${port}`, url, stop: () => new Promise(done => { child.on('close', done); child.kill('SIGTERM'); })};
}

const allowedHttp = (journey, url, status) => (journey.allowHttp ?? []).some(rule => new URL(url).pathname === rule.path && rule.status === status);

async function runJourney({browser, journey, viewportName, base, out, api, seed, contextHook}) {
  const tag = `${journey.id}-${viewportName}`;
  const context = await browser.newContext({viewport: VIEWPORTS[viewportName]});
  // Tests only: lets a test inject a defect into the page under test, to prove the gate detects it.
  if (contextHook) await contextHook(context);
  await context.tracing.start({screenshots: true, snapshots: true, sources: false});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const consoleErrors = [], pageErrors = [], httpErrors = [], requestFailures = [];
  const allowedStatuses = new Set();
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText ?? 'failed';
    if (failure !== 'net::ERR_ABORTED') requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}: ${failure}`);
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    if (allowedHttp(journey, response.url(), response.status())) allowedStatuses.add(response.status());
    else httpErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const steps = [];
  const started = Date.now();
  let status = 'PASS';
  let reason = null;
  const shot = async name => {
    const file = `screenshots/${tag}-${String(steps.length + 1).padStart(2, '0')}-${name}.png`;
    await page.screenshot({path: join(out, file), fullPage: true});
    return file;
  };
  const step = async (name, fn) => {
    const slug = name.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40);
    try {
      await fn();
      const problems = await invariants(page);
      if (problems.length) throw new Error(`invariants: ${problems.join('; ')}`);
      steps.push({name, status: 'PASS', screenshot: await shot(slug)});
    } catch (error) {
      steps.push({name, status: 'FAIL', error: String(error?.message ?? error).slice(0, 2000), screenshot: await shot(`${slug}-failure`).catch(() => null)});
      throw error;
    }
  };
  try {
    await journey.run({page, base, step, api, seed});
  } catch (error) {
    status = 'FAIL';
    reason = String(error?.message ?? error).slice(0, 2000);
  }
  // Errors the journey did not expect fail it, even when every assertion passed.
  const expectedConsole = text => [...allowedStatuses].some(code => text.includes(`status of ${code}`));
  const unexpectedConsole = consoleErrors.filter(text => !expectedConsole(text));
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
    console_errors: unexpectedConsole, page_errors: pageErrors, http_errors: httpErrors, request_failures: requestFailures,
  };
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
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
  mkdirSync(join(out, 'screenshots'), {recursive: true});
  mkdirSync(join(out, 'traces'), {recursive: true});
  const executablePath = browserPath();
  if (!executablePath) throw new Error('no Chromium/Chrome (set MATCHPILOT_E2E_CHROME)');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(ROOT_URL).hostname)) throw new Error('Browser QA runs on a local throwaway PostgreSQL only');
  const pg = (await import('pg')).default;
  const {chromium} = await import('playwright-core');
  const {seedQaArchive} = await import('../../test/helpers/fpt-seed.mjs');
  const admin = new pg.Client({connectionString: ROOT_URL, connectionTimeoutMillis: 5000});
  await admin.connect();
  const schema = `browser_qa_${process.pid}_${Date.now()}`;
  let server, browser;
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    server = await startServer(schema);
    const client = new pg.Client({connectionString: server.url.toString()});
    await client.connect();
    const seed = await seedQaArchive(client).finally(() => client.end());
    const health = await (await fetch(`${server.base}/api/v1/health`)).json();
    const api = async path => {
      const response = await fetch(`${server.base}${path}`);
      if (!response.ok) throw new Error(`API ${path}: ${response.status}`);
      return response.json();
    };
    browser = await chromium.launch({executablePath, args: ['--no-sandbox']});
    const results = [];
    for (const journey of journeys) for (const viewport of viewports) {
      results.push(await runJourney({browser, journey, viewportName: viewport, base: server.base, out, api, seed, contextHook}));
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
        fixture_sha256: sha256(readFileSync(join(root, 'test/helpers/fpt-seed.mjs'))), production_data: false},
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
      ],
      verdict,
      files,
    };
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  } finally {
    await browser?.close().catch(() => {});
    await server?.stop().catch(() => {});
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
