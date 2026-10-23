#!/usr/bin/env node
// QA-V: versioned visual baselines of the approved views (MP-OWNER-QA-VISUAL-EXECUTION-01, MP-OWNER-AUTONOMOUS-UI-ROADMAP-01).
//
//   node tools/qa/visual.mjs --out <dir>                    capture every scene and compare it with its baseline
//   node tools/qa/visual.mjs promote <run dir> --reason <why> --approval <PR or issue>
//                                                           make the captures of a run the new baselines (explicit only)
//   node tools/qa/visual.mjs check-update                   BASE_SHA/HEAD_SHA: a baseline change must be declared in the log
//
// The capture is deterministic: the QA archive through the real ingestion path, a fixed clock, the Europe/Rome zone,
// the fonts hosted with the site, reduced motion, and the screenshot's own switches for animations and caret (the CSP of
// the site refuses an injected style, rightly). A comparison never rewrites a baseline: new captures land
// in the run folder, and only `promote` turns them into baselines, with a reason and an approval written to the log.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {comparePng, decodePng, encodePng} from './png.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const BASELINES = 'test/visual/baselines';
export const MANIFEST = 'test/visual/manifest.json';
export const LOG = 'docs/qa/visual-baselines.md';
export const VISUAL_SCHEMA = 'mp-visual-v1';
const git = (args, cwd = root) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// The day the site believes it is: a fixed instant, so «Oggi», the day strip and every relative date never move.
export const FIXED_TIME = '2026-10-20T10:00:00+02:00';
export const VISUAL_VIEWPORTS = {desktop: {width: 1280, height: 800}, tablet: {width: 820, height: 1180}, mobile: {width: 390, height: 844}};

// Every scene opens one address of the site on the QA archive and waits until it is complete.
export const SCENES = [
  {id: 'oggi', title: 'Oggi: giorno affollato', path: seed => `#/?date=${seed.busyDay}`, ready: 'article.match'},
  {id: 'oggi-righe', title: 'Oggi: righe più in basso', path: seed => `#/?date=${seed.busyDay}`, ready: 'article.match', scroll: 'article.match:nth-of-type(6)'},
  {id: 'oggi-vuoto', title: 'Oggi: giorno senza partite', path: seed => `#/?date=${shiftDay(seed.busyDay, -1)}`, ready: '[data-testid="board-empty"]'},
  {id: 'oggi-oggi', title: 'Oggi: il giorno corrente', path: () => '#/', ready: '[data-testid="day-strip"] a[aria-current="date"]'},
  {id: 'ricerca', title: 'Ricerca: modulo', path: () => '#/search', ready: '[data-testid="search-form"] select[name="competition"]'},
  {id: 'ricerca-risultati', title: 'Ricerca: risultati', path: seed => `#/search?run=1&competition=${encodeURIComponent(seed.laliga.competition)}&from=2024-08-02&before=2024-08-03`,
    ready: '[data-testid="search-results"] tr', scroll: '[data-testid="search-outcome"]'},
  {id: 'dati', title: 'Dati: panoramica', path: () => '#/data', ready: '[data-testid="tile-coverage"] tbody tr'},
  {id: 'non-trovata', title: 'Pagina non trovata', path: () => '#/inesistente', ready: 'main h1'},
  // Explicit states (MP-WEB-010, MP-OWNER-CONTINUOUS-EXECUTION-02 P1). The QA archive never fails, so for loading and
  // unavailability the answer of one route is held or replaced by the API's error envelope (code UNAVAILABLE, as the
  // journeys do); a refused filter is the real server's answer. Every other route stays real.
  {id: 'oggi-caricamento', title: 'Oggi: caricamento', path: seed => `#/?date=${seed.busyDay}`, ready: '.state.loading', idle: false,
    api: {'/api/v1/fpt/matches': 'hold'}},
  {id: 'oggi-errore', title: 'Oggi: dati non disponibili', path: seed => `#/?date=${seed.busyDay}`, ready: '.state.error',
    api: {'/api/v1/fpt/matches': 'unavailable'}},
  // The real server refuses this pair of filters (400, «fav_min must not exceed fav_max»): no answer is replaced (PR #175 review B1).
  {id: 'ricerca-filtro-rifiutato', title: 'Ricerca: filtro rifiutato dal server', path: () => '#/search?run=1&fav_min=2&fav_max=1.5',
    ready: '[data-testid="search-invalid"]', scroll: '[data-testid="search-invalid"]'},
  // Match Center (R-07a): a match of the last day of the QA archive, whose teams have a history, and one of the first day.
  {id: 'partita', title: 'Match Center: analisi pre-partita', path: async (seed, api) => matchPath(await lastDayMatch(api)), ready: '[data-testid="compare"]'},
  {id: 'partita-confronto', title: 'Match Center: confronto e partite considerate', path: async (seed, api) => matchPath(await lastDayMatch(api)),
    ready: '[data-testid="compare"]', scroll: '[data-testid="cutoff"]'},
  {id: 'partita-senza-storico', title: 'Match Center: nessuna partita precedente', path: async (seed, api) => matchPath(await firstDayMatch(api)),
    ready: '[data-testid="compare"]', scroll: '[data-testid="cutoff"]'},
  {id: 'dati-parziale', title: 'Dati: un riquadro non disponibile', path: () => '#/data', ready: '[data-testid="tile-tc-live"] .state.partial',
    scroll: '[data-testid="tile-tc-live"]', api: {'/api/v1/tc/live': 'unavailable'}},
  {id: 'simulazione', title: 'Simulazione: modulo', path: () => '#/sim', ready: '[data-testid="sim-form"] select[name="competition"]'},
  {id: 'simulazione-ricerca', title: 'Simulazione: risultato in ricerca esplorativa, etichettato',
    path: seed => `#/sim?run=1&from=2024-08-01&to=2024-08-31&competition=${encodeURIComponent(seed.eredivisie.competition)}&pit_mode=NON_PIT_RESEARCH&stake=10&commission=0.05`,
    ready: '[data-testid="sim-metrics"]', scroll: '[data-testid="sim-outcome"]'},
];

// The matches the Match Center scenes open, chosen from the API of the QA archive: never a hard-coded id.
const matchPath = row => `#/match?id=${encodeURIComponent(row.internal_match_id)}`;
const archiveMatches = async api => (await api('/api/v1/fpt/search?limit=500')).data.rows;
const byDateThenId = (a, b) => a.match_date.localeCompare(b.match_date) || a.internal_match_id.localeCompare(b.internal_match_id);
async function lastDayMatch(api) {
  const day = (await archiveMatches(api)).sort(byDateThenId).at(-1).match_date;
  return (await api(`/api/v1/fpt/matches?date=${day}&limit=1`)).data.rows[0];
}
const firstDayMatch = async api => (await archiveMatches(api)).sort(byDateThenId)[0];

// The error envelope of the API v1, as the server sends it when a data source is down.
const UNAVAILABLE = {status: 503, error: {code: 'UNAVAILABLE', message: 'data source unavailable'}};

// Two values of every API answer change with each run and each commit: the server's time of the answer and the code
// version. Only these two metadata fields are replaced, with fixed values; the data stay the API's (their width moves the
// layout, so a mask would not be enough).
export const FIXED_META = {generated_at: '2026-10-20T08:00:00.000Z', code_version: '0000000'};
export function normalizeMeta(body) {
  if (body && typeof body === 'object' && body.meta && typeof body.meta === 'object') {
    for (const [key, value] of Object.entries(FIXED_META)) if (Object.hasOwn(body.meta, key)) body.meta[key] = value;
  }
  return body;
}

function shiftDay(text, days) {
  return new Date(Date.parse(`${text}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function readManifest(dir = root) {
  const path = join(dir, MANIFEST);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

// The manifest is the only list of baselines: each file must exist with its SHA-256, and no other file may sit next to them.
export function verifyBaselines(dir = root) {
  const errors = [];
  const manifest = readManifest(dir);
  if (!manifest) return {ok: false, errors: [`${MANIFEST} is missing`], manifest: null};
  if (manifest.schema !== VISUAL_SCHEMA) errors.push(`manifest schema ${manifest.schema}`);
  const {block, pixel, ratio} = manifest.thresholds ?? {};
  if (!(Number.isInteger(block) && block >= 1 && block <= 16)) errors.push('thresholds.block must be an integer between 1 and 16');
  if (!(Number.isInteger(pixel) && pixel >= 0 && pixel <= 64)) errors.push('thresholds.pixel must be an integer between 0 and 64');
  if (!(typeof ratio === 'number' && ratio >= 0 && ratio <= 0.01)) errors.push('thresholds.ratio must be between 0 and 0.01');
  const listed = Object.keys(manifest.files ?? {});
  const onDisk = existsSync(join(dir, BASELINES)) ? readdirSync(join(dir, BASELINES)).sort() : [];
  for (const name of listed) {
    const path = join(dir, BASELINES, name);
    if (!existsSync(path)) { errors.push(`${name}: listed but missing`); continue; }
    if (sha256(readFileSync(path)) !== manifest.files[name]) errors.push(`${name}: SHA-256 differs from the manifest`);
  }
  for (const name of onDisk) if (!Object.hasOwn(manifest.files ?? {}, name)) errors.push(`${name}: not in the manifest`);
  // The manifest and the scenes of the code list exactly the same views: removing a scene or a viewport from the code
  // without changing the manifest (and so the log) is refused, as is a baseline no scene captures (PR #174 review F1).
  const expected = SCENES.flatMap(scene => Object.keys(VISUAL_VIEWPORTS).map(viewport => `${scene.id}-${viewport}.png`));
  for (const name of expected) if (!Object.hasOwn(manifest.files ?? {}, name)) errors.push(`${name}: no baseline`);
  for (const name of listed) if (!expected.includes(name)) errors.push(`${name}: no scene of the code captures it`);
  return {ok: errors.length === 0, errors, manifest};
}

async function capture({browser, server, seed, api, scene, viewport, path}) {
  const context = await browser.newContext({viewport: VISUAL_VIEWPORTS[viewport], deviceScaleFactor: 1, locale: 'it-IT',
    timezoneId: 'Europe/Rome', colorScheme: 'dark', reducedMotion: 'reduce'});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date(FIXED_TIME));
    await page.route('**/api/v1/**', async route => {
      const replaced = scene.api?.[new URL(route.request().url()).pathname];
      // A held answer never arrives: the page stays in its loading state for the screenshot.
      if (replaced === 'hold') return;
      if (replaced) {
        const {status, error} = replaced === 'unavailable' ? UNAVAILABLE : replaced;
        return route.fulfill({status, contentType: 'application/json', json: {api_version: 'v1', error}});
      }
      const response = await route.fetch();
      const type = response.headers()['content-type'] ?? '';
      if (!type.includes('application/json')) return route.fulfill({response});
      return route.fulfill({response, json: normalizeMeta(await response.json())});
    });
    await page.goto(`${server.base}/${await scene.path(seed, api)}`);
    await page.waitForSelector(scene.ready);
    // A scene holding a route never reaches network idle. Its loading state is on screen once the ready selector is: the
    // board makes no other request before the held answer, so the short wait only lets the fonts and layout settle.
    if (scene.idle === false) await page.waitForTimeout(500);
    else await page.waitForLoadState('networkidle');
    await page.evaluate(async () => { document.activeElement?.blur(); await document.fonts.ready; });
    if (scene.scroll) await page.locator(scene.scroll).evaluate(node => node.scrollIntoView({block: 'start'}));
    else await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path, animations: 'disabled', caret: 'hide'});
    if (errors.length) throw new Error(`${scene.id}/${viewport}: page errors ${errors.join('; ')}`);
  } finally {
    await context.close();
  }
}

export async function runVisual({out, scenes = SCENES, viewports = Object.keys(VISUAL_VIEWPORTS), headSha = process.env.QA_HEAD_SHA} = {}) {
  out = resolve(out);
  if (existsSync(out) && readdirSync(out).length) throw new Error(`--out ${out} is not empty`);
  mkdirSync(join(out, 'captures'), {recursive: true});
  mkdirSync(join(out, 'diffs'), {recursive: true});
  const baselines = verifyBaselines();
  const thresholds = baselines.manifest?.thresholds ?? null;
  const {withQaEnvironment} = await import('./browser-qa.mjs');
  // Chromium draws the native date field in the language of its interface, which follows the language of its process
  // environment, not the page locale nor --lang: Italian, as an Italian user sees it (PR #174 review N6).
  return withQaEnvironment(async ({browser, server, seed, api}) => {
    const results = [];
    for (const scene of scenes) for (const viewport of viewports) {
      const name = `${scene.id}-${viewport}.png`;
      const file = join(out, 'captures', name);
      const result = {scene: scene.id, title: scene.title, viewport, capture: `captures/${name}`};
      try {
        await capture({browser, server, seed, api, scene, viewport, path: file});
        result.capture_sha256 = sha256(readFileSync(file));
        const baseline = join(root, BASELINES, name);
        if (!baselines.ok || !existsSync(baseline)) {
          result.status = 'NOT_VERIFIED';
          result.reason = baselines.ok ? 'no baseline' : 'baselines refused by their manifest';
        } else {
          result.baseline_sha256 = baselines.manifest.files[name];
          const compared = comparePng(decodePng(readFileSync(baseline)), decodePng(readFileSync(file)), thresholds);
          result.differing_blocks = compared.differing;
          result.share = compared.share;
          result.max_block_delta = compared.max;
          result.status = compared.match ? 'PASS' : 'FAIL';
          result.reason = compared.reason;
          if (compared.diff && compared.differing > 0) {
            writeFileSync(join(out, 'diffs', name), encodePng(compared.diff));
            result.diff = `diffs/${name}`;
          }
        }
      } catch (error) {
        result.status = 'FAIL';
        result.reason = String(error?.message ?? error).slice(0, 1000);
      }
      results.push(result);
    }
    const counts = {pass: 0, fail: 0, not_verified: 0};
    for (const result of results) counts[result.status.toLowerCase()]++;
    const report = {
      schema: VISUAL_SCHEMA, head_sha: headSha || git(['rev-parse', 'HEAD']), tested_commit: git(['rev-parse', 'HEAD']),
      working_tree_clean: git(['status', '--porcelain', '--untracked-files=no']) === '', generated_at: new Date().toISOString(),
      browser: `${browser.browserType().name()} ${browser.version()}`, fixed_time: FIXED_TIME, fixed_meta: FIXED_META, viewports: VISUAL_VIEWPORTS,
      baselines: {ok: baselines.ok, errors: baselines.errors, generated: baselines.manifest?.generated ?? null}, thresholds,
      results, counts,
      verdict: baselines.ok && counts.fail === 0 && counts.not_verified === 0 && results.length === scenes.length * viewports.length ? 'PASS' : 'FAIL',
    };
    writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    return report;
  }, {browserEnv: {LANG: 'it_IT.UTF-8', LANGUAGE: 'it', LC_ALL: 'it_IT.UTF-8'}});
}

// The only way to change the baselines: the captures of a finished run, a reason and an approval reference, all written
// to the manifest and the log. It never runs as part of a check.
export function promote({run, reason, approval, thresholds, dir = root}) {
  if (!reason?.trim() || !approval?.trim()) throw new Error('promote needs --reason and --approval');
  const report = JSON.parse(readFileSync(join(run, 'report.json'), 'utf8'));
  if (report.schema !== VISUAL_SCHEMA) throw new Error('not a visual run');
  if (!report.working_tree_clean) throw new Error('the run was made on a modified tree');
  const previous = readManifest(dir);
  const files = {};
  mkdirSync(join(dir, BASELINES), {recursive: true});
  for (const name of readdirSync(join(dir, BASELINES))) if (!report.results.some(r => `${r.scene}-${r.viewport}.png` === name)) throw new Error(`${name} has no capture in the run`);
  for (const result of report.results) {
    const name = `${result.scene}-${result.viewport}.png`;
    const buffer = readFileSync(join(run, result.capture));
    if (sha256(buffer) !== result.capture_sha256) throw new Error(`${name}: capture differs from its report`);
    writeFileSync(join(dir, BASELINES, name), buffer);
    files[name] = result.capture_sha256;
  }
  const manifest = {schema: VISUAL_SCHEMA, thresholds: thresholds ?? previous?.thresholds,
    generated: {commit: report.tested_commit, browser: report.browser, date: report.generated_at, fixed_time: report.fixed_time, reason, approval},
    files: Object.fromEntries(Object.entries(files).sort())};
  writeFileSync(join(dir, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  const changed = Object.entries(manifest.files).filter(([name, hash]) => previous?.files?.[name] !== hash);
  const entry = [`\n## ${report.generated_at.slice(0, 10)} — ${reason}`, '', `- Approval: ${approval}`,
    `- Run: commit \`${report.tested_commit}\`, ${report.browser}`,
    `- Thresholds: block ${manifest.thresholds.block}, pixel ${manifest.thresholds.pixel}, ratio ${manifest.thresholds.ratio}`, '- Baselines:',
    ...changed.map(([name, hash]) => `  - \`${name}\` \`${hash}\``), ''].join('\n');
  writeFileSync(join(dir, LOG), readFileSync(join(dir, LOG), 'utf8') + entry);
  return {changed: changed.map(([name]) => name)};
}

// A pull request that changes a baseline, the manifest or a threshold must say so in the log: every changed baseline
// with its new SHA-256 and an approval reference, in lines that this change adds.
export function checkUpdate({base, head, dir = root}) {
  if (!base || !head) return {ok: false, touched: [], errors: ['BASE_SHA and HEAD_SHA are required']};
  try {
    return checkUpdateAt({base, head, dir});
  } catch (error) {
    // A missing manifest, an unknown base or any other git failure is a refusal, never a crash (PR #174 review N8).
    return {ok: false, touched: [], errors: [`check failed: ${String(error?.message ?? error).split('\n')[0]}`]};
  }
}

function checkUpdateAt({base, head, dir}) {
  const changed = git(['diff', '--name-only', '--no-renames', `${base}...${head}`], dir).split('\n').filter(Boolean);
  const touched = changed.filter(path => path.startsWith('test/visual/'));
  const errors = [];
  // The log only grows: an earlier entry is never rewritten, whatever else the change does (PR #174 review N2).
  if (changed.includes(LOG)) {
    let previous = null;
    try { previous = git(['show', `${base}:${LOG}`], dir); } catch { /* the base has no log yet */ }
    if (previous !== null && !git(['show', `${head}:${LOG}`], dir).startsWith(previous)) errors.push(`${LOG} may only grow: an earlier entry was changed`);
  }
  if (touched.length === 0) return {ok: errors.length === 0, touched, errors};
  if (!changed.includes(LOG)) return {ok: false, touched, errors: [...errors, `${touched.length} baseline file(s) changed without an entry in ${LOG}`]};
  const added = git(['diff', '--no-renames', '-U0', `${base}...${head}`, '--', LOG], dir).split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  if (!/^\+- Approval: \S/m.test(added)) errors.push(`the new entry of ${LOG} has no approval reference`);
  const manifest = JSON.parse(git(['show', `${head}:${MANIFEST}`], dir));
  for (const path of touched.filter(path => path.startsWith(`${BASELINES}/`))) {
    const name = path.slice(BASELINES.length + 1);
    const hash = manifest.files?.[name];
    if (hash && !added.includes(`\`${name}\` \`${hash}\``)) errors.push(`${name}: its new SHA-256 is not in the new entry of ${LOG}`);
  }
  let before = null;
  try {
    before = JSON.parse(git(['show', `${base}:${MANIFEST}`], dir));
  } catch { /* the base has no baselines yet */ }
  // The Thresholds line of the new entry states the values of the manifest, not any values (PR #174 review N1).
  const t = manifest.thresholds ?? {};
  const stated = /^\+- Thresholds: (.*)$/m.exec(added)?.[1];
  if (stated !== undefined && stated !== `block ${t.block}, pixel ${t.pixel}, ratio ${t.ratio}`) errors.push(`the Thresholds line of ${LOG} does not match the manifest`);
  if (before && JSON.stringify(before.thresholds) !== JSON.stringify(manifest.thresholds) && stated === undefined) {
    errors.push(`thresholds changed without a Thresholds line in ${LOG}`);
  }
  return {ok: errors.length === 0, touched, errors};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  if (args[0] === 'promote') {
    const thresholds = opt('pixel') ? {block: Number(opt('block')), pixel: Number(opt('pixel')), ratio: Number(opt('ratio'))} : undefined;
    console.log(JSON.stringify(promote({run: resolve(args[1]), reason: opt('reason'), approval: opt('approval'), thresholds})));
    const verified = verifyBaselines();
    console.log(JSON.stringify({ok: verified.ok, errors: verified.errors}));
    process.exit(verified.ok ? 0 : 1);
  } else if (args[0] === 'check-update') {
    const result = checkUpdate({base: process.env.BASE_SHA, head: process.env.HEAD_SHA});
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  } else if (args[0] === 'verify') {
    const result = verifyBaselines();
    console.log(JSON.stringify({ok: result.ok, errors: result.errors}));
    process.exit(result.ok ? 0 : 1);
  } else {
    const out = opt('out');
    if (!out) { console.error('usage: visual.mjs --out <dir> | promote <run> --reason <why> --approval <ref> | check-update | verify'); process.exit(2); }
    const only = opt('scenes')?.split(',');
    const report = await runVisual({out, scenes: only ? SCENES.filter(scene => only.includes(scene.id)) : SCENES,
      viewports: opt('viewports')?.split(',') ?? Object.keys(VISUAL_VIEWPORTS)});
    for (const result of report.results) console.log(`${result.status.padEnd(12)} ${result.scene}/${result.viewport}${result.share != null ? ` ${(result.share * 100).toFixed(3)}% max ${result.max_block_delta}` : ''}${result.reason ? ` — ${result.reason}` : ''}`);
    console.log(JSON.stringify({verdict: report.verdict, counts: report.counts, baselines: report.baselines.ok, browser: report.browser}));
    process.exit(report.verdict === 'PASS' ? 0 : 1);
  }
}
