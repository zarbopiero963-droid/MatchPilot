// Exploratory Browser QA (QA-02, MP-OWNER-BROWSER-QA-HARD-GATE-01 level B): the seeded crawler is deterministic, finds and
// reproduces a defect no scripted journey covers, and both verifiers (crawler bundle, AI review) refuse incomplete,
// altered or foreign evidence.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
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
  for (const viewport of ['desktop', 'mobile']) {
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
  const report = {schema: 'mp-browser-explore-v1', head_sha: HEAD, tested_commit: COMMIT, generated_at: new Date().toISOString(), seed: 1,
    trails, totals: {actions: 10, action_errors: 0, findings: 1, reproduced: 1}, findings, observations, injected_defect: false,
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
    reviewer: {kind: 'claude-code-session', session: 'authorized owner session'}, reviewed_at: new Date().toISOString(),
    observations_reviewed: exploration.observations.map(item => item.file), observations_not_reviewed: {},
    findings: exploration.findings.filter(item => item.reproduced).map((item, index) => ({id: `AI-${index + 1}`, source: 'crawler', ref: item.id,
      classification: 'BUG', severity: 'P3', status: 'OPEN', summary: 'reproduced error on the dashboard', evidence: [item.screenshot]})),
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
  refused(check(bundle(t, r => { r.generated_at = '2999-01-01T00:00:00Z'; })), /future/);
  refused(check(bundle(t, (r, dir) => { writeFileSync(join(dir, 'traces/01-mobile.zip'), 'edited'); })), /changed after the run/);
  refused(check(bundle(t, (r, dir) => { writeFileSync(join(dir, 'screenshots/planted.png'), 'x'); })), /not in the manifest/);
  refused(check(bundle(t, r => { r.findings[0].kind = 'something'; })), /unknown kind/);
  refused(check(bundle(t, r => { r.findings[0].steps = [{type: 'button'}]; })), /no replayable sequence/);
  refused(check(bundle(t, r => { r.findings[0].screenshot = 'toString'; })), /screenshot not in the evidence/);
  refused(check(bundle(t, r => { delete r.findings[0].reproduced; r.totals.reproduced = 0; })), /reproduction not attempted/);
  refused(check(bundle(t, r => { r.findings.push({...r.findings[0]}); r.totals.findings = 2; r.totals.reproduced = 2; })), /reported twice/);
  refused(check(bundle(t, r => { r.trails = []; })), /no exploration trails/);
  refused(check(bundle(t, r => { r.trails[0].sha256 = 'x'; })), /without a SHA-256/);
  refused(check(bundle(t, r => { r.observations = r.observations.filter(item => item.label !== 'end'); })), /observation end missing/);
  refused(check(bundle(t, r => { r.totals.actions = 99; })), /totals\.actions/);
  refused(check(bundle(t, r => { r.totals.reproduced = 0; })), /totals do not match/);
  refused(check(bundle(t, r => { r.note = 'gh' + 'p_' + 'Z'.repeat(36); })), /secret-like/);
});

test('a complete AI review of the exact bundle is accepted, with a computed verdict', t => {
  const dir = bundle(t);
  const result = verifyAiReview(dir, review(t, dir), {expectedHead: HEAD});
  assert.deepEqual(result.errors, []);
  assert.equal(result.verdict, 'NO_BLOCKING');
  const blocking = verifyAiReview(dir, review(t, dir, r => { r.findings[0].severity = 'P1'; r.verdict = 'BLOCKING'; }), {expectedHead: HEAD});
  assert.deepEqual(blocking.errors, []);
  assert.equal(blocking.verdict, 'BLOCKING');
  const fixed = verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {severity: 'P0', status: 'FIXED', regression_test: 'test/x.test.mjs'}); }), {expectedHead: HEAD});
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
  refused(verifyAiReview(dir, review(t, dir, r => { r.observations_reviewed.pop(); }), opts), /neither reviewed nor excused/);
  const excused = verifyAiReview(dir, review(t, dir, r => { r.observations_not_reviewed[r.observations_reviewed.pop()] = 'image unreadable'; }), opts);
  assert.deepEqual(excused.errors, []);
  refused(verifyAiReview(dir, review(t, dir, r => { r.observations_reviewed.push('observations/invented.json'); }), opts), /not in the bundle/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings = []; }), opts), /EX-1 not triaged/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].classification = 'FINE'; }), opts), /invalid classification/);
  refused(verifyAiReview(dir, review(t, dir, r => { delete r.findings[0].severity; }), opts), /BUG without severity/);
  refused(verifyAiReview(dir, review(t, dir, r => { Object.assign(r.findings[0], {classification: 'NOT_A_DEFECT', reason: ''}); }), opts), /NOT_A_DEFECT without a reason/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].status = 'FIXED'; }), opts), /FIXED without a regression test/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].summary = ' '; }), opts), /without a summary/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].evidence = ['screenshots/invented.png']; }), opts), /not in the bundle/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].source = 'guess'; }), opts), /unknown source/);
  refused(verifyAiReview(dir, review(t, dir, r => { r.findings[0].severity = 'P0'; }), opts), /declared verdict NO_BLOCKING but the findings give BLOCKING/);
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
  const verified = verifyExploration(out, {expectedHead: report.head_sha, expectedCommit: report.tested_commit});
  assert.deepEqual(verified.errors, []);
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
