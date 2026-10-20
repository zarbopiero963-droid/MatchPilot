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
const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
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
];

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
  const {pixel, ratio} = manifest.thresholds ?? {};
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
  for (const scene of SCENES) for (const viewport of Object.keys(VISUAL_VIEWPORTS)) {
    if (!Object.hasOwn(manifest.files ?? {}, `${scene.id}-${viewport}.png`)) errors.push(`${scene.id}-${viewport}.png: no baseline`);
  }
  return {ok: errors.length === 0, errors, manifest};
}

async function capture({browser, server, seed, scene, viewport, path}) {
  const context = await browser.newContext({viewport: VISUAL_VIEWPORTS[viewport], deviceScaleFactor: 1, locale: 'it-IT',
    timezoneId: 'Europe/Rome', colorScheme: 'dark', reducedMotion: 'reduce'});
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.setFixedTime(new Date(FIXED_TIME));
    await page.route('**/api/v1/**', async route => {
      const response = await route.fetch();
      const type = response.headers()['content-type'] ?? '';
      if (!type.includes('application/json')) return route.fulfill({response});
      return route.fulfill({response, json: normalizeMeta(await response.json())});
    });
    await page.goto(`${server.base}/${scene.path(seed)}`);
    await page.waitForSelector(scene.ready);
    await page.waitForLoadState('networkidle');
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
  return withQaEnvironment(async ({browser, server, seed}) => {
    const results = [];
    for (const scene of scenes) for (const viewport of viewports) {
      const name = `${scene.id}-${viewport}.png`;
      const file = join(out, 'captures', name);
      const result = {scene: scene.id, title: scene.title, viewport, capture: `captures/${name}`};
      try {
        await capture({browser, server, seed, scene, viewport, path: file});
        result.capture_sha256 = sha256(readFileSync(file));
        const baseline = join(root, BASELINES, name);
        if (!baselines.ok || !existsSync(baseline)) {
          result.status = 'NOT_VERIFIED';
          result.reason = baselines.ok ? 'no baseline' : 'baselines refused by their manifest';
        } else {
          result.baseline_sha256 = baselines.manifest.files[name];
          const compared = comparePng(decodePng(readFileSync(baseline)), decodePng(readFileSync(file)), thresholds);
          result.differing_pixels = compared.differing;
          result.share = compared.share;
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
  });
}

// The only way to change the baselines: the captures of a finished run, a reason and an approval reference, all written
// to the manifest and the log. It never runs as part of a check.
export function promote({run, reason, approval, thresholds}) {
  if (!reason?.trim() || !approval?.trim()) throw new Error('promote needs --reason and --approval');
  const report = JSON.parse(readFileSync(join(run, 'report.json'), 'utf8'));
  if (report.schema !== VISUAL_SCHEMA) throw new Error('not a visual run');
  if (!report.working_tree_clean) throw new Error('the run was made on a modified tree');
  const previous = readManifest();
  const files = {};
  mkdirSync(join(root, BASELINES), {recursive: true});
  for (const name of readdirSync(join(root, BASELINES))) if (!report.results.some(r => `${r.scene}-${r.viewport}.png` === name)) throw new Error(`${name} has no capture in the run`);
  for (const result of report.results) {
    const name = `${result.scene}-${result.viewport}.png`;
    const buffer = readFileSync(join(run, result.capture));
    if (sha256(buffer) !== result.capture_sha256) throw new Error(`${name}: capture differs from its report`);
    writeFileSync(join(root, BASELINES, name), buffer);
    files[name] = result.capture_sha256;
  }
  const manifest = {schema: VISUAL_SCHEMA, thresholds: thresholds ?? previous?.thresholds,
    generated: {commit: report.tested_commit, browser: report.browser, date: report.generated_at, fixed_time: report.fixed_time, reason, approval},
    files: Object.fromEntries(Object.entries(files).sort())};
  writeFileSync(join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  const changed = Object.entries(manifest.files).filter(([name, hash]) => previous?.files?.[name] !== hash);
  const entry = [`\n## ${report.generated_at.slice(0, 10)} — ${reason}`, '', `- Approval: ${approval}`,
    `- Run: commit \`${report.tested_commit}\`, ${report.browser}`,
    `- Thresholds: pixel ${manifest.thresholds.pixel}, ratio ${manifest.thresholds.ratio}`, '- Baselines:',
    ...changed.map(([name, hash]) => `  - \`${name}\` \`${hash}\``), ''].join('\n');
  writeFileSync(join(root, LOG), readFileSync(join(root, LOG), 'utf8') + entry);
  return {changed: changed.map(([name]) => name)};
}

// A pull request that changes a baseline, the manifest or a threshold must say so in the log: every changed baseline
// with its new SHA-256 and an approval reference, in lines that this change adds.
export function checkUpdate({base, head}) {
  const changed = git(['diff', '--name-only', '--no-renames', `${base}...${head}`]).split('\n').filter(Boolean);
  const touched = changed.filter(path => path.startsWith('test/visual/'));
  if (touched.length === 0) return {ok: true, touched, errors: []};
  const errors = [];
  if (!changed.includes(LOG)) return {ok: false, touched, errors: [`${touched.length} baseline file(s) changed without an entry in ${LOG}`]};
  const added = git(['diff', '--no-renames', '-U0', `${base}...${head}`, '--', LOG]).split('\n')
    .filter(line => line.startsWith('+') && !line.startsWith('+++')).join('\n');
  if (!/^\+- Approval: \S/m.test(added)) errors.push(`the new entry of ${LOG} has no approval reference`);
  const manifest = JSON.parse(git(['show', `${head}:${MANIFEST}`]));
  for (const path of touched.filter(path => path.startsWith(`${BASELINES}/`))) {
    const name = path.slice(BASELINES.length + 1);
    const hash = manifest.files?.[name];
    if (hash && !added.includes(`\`${name}\` \`${hash}\``)) errors.push(`${name}: its new SHA-256 is not in the new entry of ${LOG}`);
  }
  let before = null;
  try {
    before = JSON.parse(execFileSync('git', ['show', `${base}:${MANIFEST}`], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}));
  } catch { /* the base has no baselines yet */ }
  if (before && JSON.stringify(before.thresholds) !== JSON.stringify(manifest.thresholds) && !/^\+- Thresholds: /m.test(added)) {
    errors.push(`thresholds changed without a Thresholds line in ${LOG}`);
  }
  return {ok: errors.length === 0, touched, errors};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  if (args[0] === 'promote') {
    const thresholds = opt('pixel') ? {pixel: Number(opt('pixel')), ratio: Number(opt('ratio'))} : undefined;
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
    for (const result of report.results) console.log(`${result.status.padEnd(12)} ${result.scene}/${result.viewport}${result.share != null ? ` ${(result.share * 100).toFixed(3)}%` : ''}${result.reason ? ` — ${result.reason}` : ''}`);
    console.log(JSON.stringify({verdict: report.verdict, counts: report.counts, baselines: report.baselines.ok, browser: report.browser}));
    process.exit(report.verdict === 'PASS' ? 0 : 1);
  }
}
