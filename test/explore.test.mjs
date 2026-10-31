// Exploratory Browser QA (QA-02, MP-OWNER-BROWSER-QA-HARD-GATE-01 level B): the seeded crawler is deterministic, finds and
// reproduces a defect no scripted journey covers, and both verifiers (crawler bundle, AI review) refuse incomplete,
// altered or foreign evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {prng} from '../tools/qa/explore.mjs';
import {verifyAiReview, verifyExploration} from '../tools/qa/verify-exploration.mjs';

const HEAD = 'a'.repeat(40);
const COMMIT = 'b'.repeat(40);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const temp = (t, prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const refused = (result, pattern) => {
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => pattern.test(error)), `expected ${pattern} in ${JSON.stringify(result.errors)}`);
};

// A complete, valid crawler bundle with placeholder files; each test breaks one thing.
function bundle(t, mutate = () => {}) {
  const dir = temp(t, 'mp-explore-');
  for (const sub of ['screenshots', 'observations', 'traces']) mkdirSync(join(dir, sub));
  const files = {};
  const put = (path, content) => { writeFileSync(join(dir, path), content); files[path] = sha256(Buffer.from(content)); };
  const observations = [];
  const trails = [];
  for (const viewport of ['desktop', 'tablet', 'mobile']) {
    for (const label of ['open', 'end']) {
      const file = `observations/01-${viewport}-${label}.json`;
      const screenshot = `observations/01-${viewport}-${label}.png`;
      put(file, `{"label":"${label}"}`);
      put(screenshot, `png ${viewport} ${label}`);
      observations.push({route: '/#/', viewport, label, file, screenshot});
    }
    put(`traces/01-${viewport}.zip`, `zip ${viewport}`);
    trails.push({route: '/#/', viewport, actions: 5, sha256: sha256(Buffer.from(viewport))});
  }
  put('screenshots/01-desktop-finding-1.png', 'png finding');
  const findings = [{id: 'EX-1', kind: 'js-error', message: 'boom', key: 'js-error: boom', route: '/#/', viewport: 'desktop',
    steps: [{type: 'goto', url: '/#/'}, {type: 'button', query: 'main button', index: 0, text: 'x'}], screenshot: 'screenshots/01-desktop-finding-1.png',
    classification: 'UNTRIAGED', severity: 'UNTRIAGED', reproduced: true}];
  const report = {schema: 'mp-browser-explore-v1', head_sha: HEAD, tested_commit: COMMIT, working_tree_clean: true, restricted: false, generated_at: new Date().toISOString(),
    seed: 1, actions_per_route: 5, viewports: ['desktop', 'tablet', 'mobile'], routes: ['/#/'], trails, totals: {actions: 15, action_errors: 0, findings: 1, reproduced: 1}, findings, observations, injected_defect: false,
    ai_review: {status: 'NOT_VERIFIED'}, files};
  mutate(report, dir);
  writeFileSync(join(dir, 'exploration.json'), JSON.stringify(report));
  return dir;
}
const check = (dir, opts = {}) => verifyExploration(dir, {expectedHead: HEAD, expectedCommit: COMMIT, ...opts});

// A valid AI review of a bundle, written outside it; each test breaks one thing.
function review(t, dir, mutate = () => {}) {
  const exploration = JSON.parse(readFileSync(join(dir, 'exploration.json'), 'utf8'));
  const body = {schema: 'mp-browser-ai-review-v1', head_sha: exploration.head_sha, exploration_sha256: sha256(readFileSync(join(dir, 'exploration.json'))),
    reviewer: {kind: 'claude-code-session', session: 'https://claude.ai/code/session_test'}, reviewed_at: new Date().toISOString(),
    observations_reviewed: exploration.observations.map(item => item.file), observations_not_reviewed: {},
    findings: exploration.findings.filter(item => item.reproduced).map((item, index) => ({id: `AI-${index + 1}`, source: 'crawler', ref: item.id,
      classification: 'BUG', severity: 'P3', status: 'DEFERRED', reason: 'cosmetic', impact: 'none on data', follow_up: 'V-A',
      summary: 'reproduced error on the dashboard', evidence: [item.screenshot]})),
    verdict: 'NO_BLOCKING'};
  mutate(body);
  const path = join(temp(t, 'mp-ai-review-'), 'ai-review.json');
  writeFileSync(path, JSON.stringify(body));
  return path;
}

test('the crawler PRNG is deterministic per seed', () => {
  const draw = seed => { const random = prng(seed); return Array.from({length: 8}, random); };
  assert.deepEqual(draw(7), draw(7));
  assert.notDeepEqual(draw(7), draw(8));
  assert.ok(draw(3).every(value => value >= 0 && value < 1));
});

test('a complete crawler bundle on the exact commit is accepted', t => {
  const result = check(bundle(t));
  assert.deepEqual(result.errors, []);
});

test('crawler bundles that are missing, foreign, altered or incomplete are refused', t => {
  refused(check(temp(t, 'mp-explore-empty-')), /exploration\.json missing/);
  refused(verifyExploration(bundle(t), {expectedHead: 'short'}), /expected head SHA/);
  refused(check(bundle(t), {expectedHead: 'c'.repeat(40)}), /not the PR head/);
  refused(check(bundle(t, r => { r.tested_commit = 'd'.repeat(40); })), /not the checked-out commit/);
  refused(check(bundle(t, r => { r.schema = 'mp-browser-explore-v0'; })), /unexpected schema/);
  refused(check(bundle(t, r => { r.injected_defect = true; })), /injected defect/);
  refused(check(bundle(t, r => { r.restricted = true; })), /restricted to some routes/);
  refused(check(bundle(t, r => { r.generated_at = '2999-01-01T00:00:00Z'; })), /future/);
  refused(check(bundle(t, (r, dir) => { writeFileSync(join(dir, 'traces/01-mobile.zip'), 'edited'); })), /changed after the run/);
  refused(check(bundle(t, (r, dir) => { writeFileSync(join(dir, 'screenshots/planted.png'), 'x'); })), /not in the manifest/);
  refused(check(bundle(t, r => { r.findings[0].kind = 'something'; })), /unknown kind/);
  refused(check(bundle(t, r => { r.findings[0].steps = [{type: 'button'}]; })), /no replayable sequence/);
  refused(check(bundle(t, r => { r.findings[0].screenshot = 'toString'; })), /screenshot not in the evidence/);
  refused(check(bundle(t, r => { delete r.findings[0].reproduced; r.totals.reproduced = 0; })), /reproduction not attempted/);
  refused(check(bundle(t, r => { r.findings.push({...r.findings[0]}); r.totals.findings = 2; r.totals.reproduced = 2; })), /reported twice/);
  refused(check(bundle(t, r => { r.trails = []; })), /has 0 trails/);
  refused(check(bundle(t, r => { r.trails[0].sha256 = 'x'; })), /without a SHA-256/);
  refused(check(bundle(t, r => { r.observations = r.observations.filter(item => item.label !== 'end'); })), /observation end missing/);
  refused(check(bundle(t, r => { r.totals.actions = 99; })), /totals\.actions/);
  refused(check(bundle(t, r => { r.totals.reproduced = 0; })), /totals do not match/);
  refused(check(bundle(t, r => { r.note = 'gh' + 'p_' + 'Z'.repeat(36); })), /secret-like/);
  refused(check(bundle(t, r => { r.working_tree_clean = false; })), /modified working tree/);
  // Coverage (PR #165 NB-2): a declared route or viewport without its trail, or a run with fewer actions, is refused.
  refused(check(bundle(t, r => { r.trails = r.trails.filter(trail => trail.viewport !== 'mobile'); r.totals.actions = 5; })), /\/#\/\/mobile has 0 trails/);
  refused(check(bundle(t, r => { r.routes.push('/#/search'); })), /\/#\/search\/desktop has 0 trails/);
  refused(check(bundle(t, r => { r.trails[0].actions = 0; r.totals.actions = 5; })), /ran 0 actions, not 5/);
  refused(check(bundle(t, r => { r.actions_per_route = 'abc'; })), /actions_per_route/);
});

test('malformed bundles and reviews are refused with an error, never a crash (PR #165 NB-1)', t => {
  const write = (dir, name, value) => { writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value)); return dir; };
  refused(check(write(temp(t, 'mp-explore-null-'), 'exploration.json', 'null')), /not a JSON object/);
  refused(check(write(temp(t, 'mp-explore-list-'), 'exploration.json', [])), /not a JSON object/);
  refused(check(bundle(t, r => { r.findings = [null]; })), /malformed entries|totals/);
  refused(check(bundle(t, r => { r.trails.push(null); })), /malformed entries/);
  refused(check(bundle(t, r => { r.observations = {}; })), /must be lists/);
  refused(check(bundle(t, r => { r.findings[0].steps = [null]; })), /no replayable sequence/);
  refused(check(bundle(t, (r, dir) => { mkdirSync(join(dir, 'screenshots/dir.png')); r.files['screenshots/dir.png'] = 'x'; })), /evidence missing: screenshots\/dir\.png/);
  const dir = bundle(t);
  const opts = {expectedHead: HEAD};
  for (const body of ['null', '[]', '"x"']) {
    const path = join(temp(t, 'mp-ai-review-'), 'ai-review.json');
    writeFileSync(path, body);
    refused(verifyAiReview(dir, path, opts), /not a JSON object/);
  }
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings = [null]; }), opts), /malformed review findings/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings = {}; }), opts), /findings must be a list/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.observations_reviewed = null; r.observations_not_reviewed = 'x'; }), opts), /neither reviewed nor excused/);
});

test('a complete AI review of the exact bundle is accepted, with a computed verdict', t => {
  const dir = bundle(t);
  const result = verifyAiReview(dir, review(t, dir), {expectedHead: HEAD});
  assert.deepEqual(result.errors, []);
  assert.equal(result.verdict, 'NO_BLOCKING');
  const blocking = verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {severity: 'P1', status: 'OPEN'}); r.verdict = 'BLOCKING'; }), {expectedHead: HEAD});
  assert.deepEqual(blocking.errors, []);
  assert.equal(blocking.verdict, 'BLOCKING');
  const fixed = verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {severity: 'P0', status: 'FIXED', regression_test: 'test/explore.test.mjs'}); }), {expectedHead: HEAD, changedFiles: ['test/explore.test.mjs']});
  assert.deepEqual(fixed.errors, []);
  assert.equal(fixed.verdict, 'NO_BLOCKING');
});

test('AI reviews that are missing, foreign, incomplete or with a declared verdict are refused', t => {
  const dir = bundle(t);
  const opts = {expectedHead: HEAD};
  refused(verifyAiReview(dir, join(dir, 'nope.json'), opts), /ai review missing/);
  refused(verifyAiReview(temp(t, 'mp-explore-empty-'), review(t, dir), opts), /exploration\.json missing/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.schema = 'x'; }), opts), /unexpected schema/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.exploration_sha256 = 'f'.repeat(64); }), opts), /not about this exploration bundle/);
  refused(verifyAiReview(dir, review(t, dir), {expectedHead: 'c'.repeat(40)}), /not about this head/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.reviewer = {}; }), opts), /reviewer not identified/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.reviewer.kind = 'openai-api-in-ci'; }), opts), /reviewer not identified/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.reviewer.session = ''; }), opts), /reviewer not identified/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.observations_reviewed.pop(); }), opts), /neither reviewed nor excused/);
  // Excuses are bounded: one of eight is fine; all excused is not a review (PR #165 B-1).
  const excused = verifyAiReview(dir, review(t, dir, r => { r.observations_not_reviewed[r.observations_reviewed.shift()] = 'image unreadable'; }), opts);
  assert.deepEqual(excused.errors, []);
  refused(verifyAiReview(dir, review(t, dir, r => { for (const file of r.observations_reviewed.splice(0)) r.observations_not_reviewed[file] = 'skipped'; }), opts), /observations excused|no observation reviewed/);
  refused(verifyAiReview(dir, review(t, dir, r => {
    for (const file of r.observations_reviewed.filter(file => file.includes('mobile'))) r.observations_not_reviewed[file] = 'skipped';
    r.observations_reviewed = r.observations_reviewed.filter(file => !file.includes('mobile'));
  }), opts), /no observation reviewed for \/#\/\/mobile|observations excused/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.observations_reviewed.push('observations/invented.json'); }), opts), /not in the bundle/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings = []; }), opts), /EX-1 not triaged/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].classification = 'FINE'; }), opts), /invalid classification/);
  refused(verifyAiReview(dir, review(t, dir, r => { delete r.findings[0].severity; }), opts), /BUG without severity/);
  refused(verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {classification: 'NOT_A_DEFECT', reason: ''}); }), opts), /NOT_A_DEFECT without a reason/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].status = 'FIXED'; }), opts), /FIXED without an existing regression test/);
  for (const path of ['test/invented.test.mjs', '../outside.test.mjs', 'README.md', 'test'])
    refused(verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {severity: 'P0', status: 'FIXED', regression_test: path}); }), opts), /FIXED without an existing regression test/);
  for (const classification of ['NOT_VERIFIED', 'BLOCKED', 'DATA_MISSING', 'DATA_QUALITY_ISSUE'])
    refused(verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {classification, reason: ''}); }), opts), new RegExp(`${classification} without a reason`));
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].status = 'IGNORED'; }), opts), /invalid status/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].status = 'OPEN'; }), opts), /open P3 BUG/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].follow_up = ''; }), opts), /DEFERRED without reason, impact and follow_up/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].severity = 'P1'; r.verdict = 'BLOCKING'; }), opts), /P1 BUG cannot be deferred/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings.push({...r.findings[0]}); }), opts), /id missing or repeated/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings.push({...r.findings[0], id: 'AI-9', ref: 'EX-404'}); }), opts), /EX-404, not a crawler finding/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].summary = ' '; }), opts), /without a summary/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].evidence = ['screenshots/invented.png']; }), opts), /not in the bundle/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].source = 'guess'; }), opts), /unknown source/);
  refused(verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {severity: 'P0', status: 'OPEN'}); }), opts), /declared verdict NO_BLOCKING but the findings give BLOCKING/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.reviewer.token = 'gh' + 'p_' + 'Z'.repeat(36); }), opts), /secret-like/);
  // The bundle changed after the review: the review no longer names it.
  const path = review(t, dir);
  const report = JSON.parse(readFileSync(join(dir, 'exploration.json'), 'utf8'));
  report.findings[0].message = 'edited';
  writeFileSync(join(dir, 'exploration.json'), JSON.stringify(report));
  refused(verifyAiReview(dir, path, opts), /not about this exploration bundle/);
});

// Real browser runs: skipped locally when no Chromium or PostgreSQL is available, never in CI.
async function explore(t, options) {
  const {runExploration} = await import('../tools/qa/explore.mjs');
  const out = temp(t, 'mp-explore-run-');
  rmSync(out, {recursive: true, force: true});
  try {
    return {out, report: await runExploration({out, viewports: ['desktop'], ...options})};
  } catch (error) {
    if (!process.env.CI && /no Chromium|ECONNREFUSED|FUTPYTHON_TEST_DATABASE_URL/.test(String(error?.message))) { t.skip(String(error.message)); return null; }
    throw error;
  }
}

test('the same seed on the same site replays the same exploration, and its bundle verifies', {timeout: 300000}, async t => {
  const options = {seed: 4, actions: 6, onlyRoutes: ['/#/']};
  const first = await explore(t, options);
  if (!first) return;
  const second = await explore(t, options);
  assert.equal(first.report.trails.length, 1);
  assert.deepEqual(second.report.trails, first.report.trails, 'same seed, same action sequence');
  assert.equal(first.report.injected_defect, false);
  const other = await explore(t, {...options, seed: 5});
  assert.notEqual(other.report.trails[0].sha256, first.report.trails[0].sha256, 'another seed explores differently');
  const {report, out} = first;
  // A restricted test run is refused as evidence, and so is a run on a modified tree (a local run while developing);
  // nothing else may be wrong with the real bundle.
  const verified = verifyExploration(out, {expectedHead: report.head_sha, expectedCommit: report.tested_commit});
  assert.equal(report.restricted, true);
  assert.deepEqual(report.routes, ['/#/']);
  // (A desktop-only test run also lacks the required tablet and mobile viewports.)
  const expected = ['the run was restricted to some routes (test run): not valid evidence', 'required viewport tablet not explored', 'required viewport mobile not explored'];
  if (!report.working_tree_clean) expected.unshift('the run was made on a modified working tree');
  assert.deepEqual(verified.errors, expected);
  for (const item of report.observations) assert.ok(existsSync(join(out, item.screenshot)) && existsSync(join(out, item.file)));
  // An altered copy of the real bundle is refused.
  const altered = temp(t, 'mp-explore-altered-');
  cpSync(out, altered, {recursive: true});
  writeFileSync(join(altered, report.observations[0].file), '{}');
  refused(verifyExploration(altered, {expectedHead: report.head_sha}), /changed after the run/);
});

test('the crawler finds and reproduces a defect no scripted journey covers (deliberately injected)', {timeout: 300000}, async t => {
  // The defect: on the Daily Board, any click in the page throws an uncaught error a moment later. The scripted journeys
  // never see it (the hook is test-only); the crawler must reach it, report it with its sequence and replay it.
  const contextHook = context => context.addInitScript(() => {
    document.addEventListener('click', () => {
      if (location.hash.startsWith('#/board')) setTimeout(() => { throw new Error('injected exploratory defect'); }, 0);
    }, true);
  });
  const run = await explore(t, {seed: 1, actions: 12, onlyRoutes: [`/#/board?date=2024-08-01`], contextHook});
  if (!run) return;
  const {report, out} = run;
  const finding = report.findings.find(item => item.kind === 'js-error' && /injected exploratory defect/.test(item.message));
  assert.ok(finding, `expected the injected error in ${JSON.stringify(report.findings.map(item => item.message))}`);
  assert.equal(finding.reproduced, true, 'replayed in a fresh context');
  assert.equal(finding.steps[0].type, 'goto');
  assert.ok(existsSync(join(out, finding.screenshot)), 'finding screenshot saved');
  assert.ok(report.totals.reproduced >= 1);
  assert.equal(report.injected_defect, true);
  refused(verifyExploration(out, {expectedHead: report.head_sha}), /injected defect/);
});

test('a bundle without desktop and mobile, a linked evidence file or a fix without its test is refused (PR #165 R2-NB-2, NB-3, NB-5)', t => {
  refused(check(bundle(t, r => { r.viewports = ['desktop']; r.trails = r.trails.filter(trail => trail.viewport === 'desktop'); r.totals.actions = 5; })), /required viewport mobile not explored/);
  refused(check(bundle(t, r => { r.viewports.push('bogus'); })), /unknown viewport bogus/);
  // Evidence must be a regular file inside the bundle: a link to a file elsewhere, or a linked folder, is refused.
  const outside = temp(t, 'mp-explore-outside-');
  writeFileSync(join(outside, 'shot.png'), 'png finding');
  refused(check(bundle(t, (r, dir) => { rmSync(join(dir, r.findings[0].screenshot)); symlinkSync(join(outside, 'shot.png'), join(dir, r.findings[0].screenshot)); })), /link or outside the bundle/);
  refused(check(bundle(t, (r, dir) => {
    cpSync(join(dir, 'screenshots'), join(outside, 'screenshots'), {recursive: true});
    rmSync(join(dir, 'screenshots'), {recursive: true});
    symlinkSync(join(outside, 'screenshots'), join(dir, 'screenshots'));
  })), /link or outside the bundle|not in the manifest: screenshots/);
  // With the files the fix changed, FIXED must name one of them.
  const dir = bundle(t);
  const fixed = r => { Object.assign(r.findings[0], {severity: 'P0', status: 'FIXED', regression_test: 'test/explore.test.mjs'}); };
  assert.deepEqual(verifyAiReview(dir, review(t, dir, fixed), {expectedHead: HEAD, changedFiles: ['src/web/app.js', 'test/explore.test.mjs']}).errors, []);
  refused(verifyAiReview(dir, review(t, dir, fixed), {expectedHead: HEAD, changedFiles: ['src/web/app.js']}), /not changed by the fix/);
  // Without the files of the fix (no --base), FIXED is refused (PR #166 NB-2).
  refused(verifyAiReview(dir, review(t, dir, fixed), {expectedHead: HEAD}), /FIXED needs the files changed by the fix/);
});

test('a problem caused just before the page leaves the site still reproduces (PR #165 R2-NB-1)', {timeout: 120000}, async t => {
  const {replay} = await import('../tools/qa/explore.mjs');
  const {withQaEnvironment} = await import('../tools/qa/browser-qa.mjs');
  // The defect: a menu click throws and the page then leaves the site.
  const contextHook = context => context.addInitScript(() => {
    document.addEventListener('click', event => {
      if (!event.target.closest('nav a')) return;
      setTimeout(() => { throw new Error('injected leave error'); }, 0);
      setTimeout(() => location.assign('about:blank'), 100);
    }, true);
  });
  let reproduced;
  try {
    reproduced = await withQaEnvironment(({browser, server}) =>
      replay(browser, 'desktop', server.base, [{type: 'goto', url: '/#/'}, {type: 'link', query: 'nav a[href^="#/"]', index: 0}], 'js-error: injected leave error', contextHook));
  } catch (error) {
    if (!process.env.CI && /no Chromium|ECONNREFUSED|FUTPYTHON_TEST_DATABASE_URL/.test(String(error?.message))) return t.skip(String(error.message));
    throw error;
  }
  assert.equal(reproduced, true);
});

test('the seeded defects of the AI review evaluation still apply to the page, once each (QA-03)', async () => {
  const {SEEDED_DEFECTS} = await import('../tools/qa/ai-eval-seeds.mjs');
  const source = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');
  assert.deepEqual(SEEDED_DEFECTS.map(defect => defect.id), ['S1', 'S2', 'S3', 'S4']);
  for (const defect of SEEDED_DEFECTS) assert.equal(source.split(defect.from).length - 1, 1, `${defect.id} matches src/web/app.js once`);
});
