// Browser QA Gate (MP-OWNER-BROWSER-QA-HARD-GATE-01): the verifier refuses every way of passing the gate without a real,
// complete, unmodified run on the exact commit; and the runner really fails when the page shows a defect.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {REQUIRED_JOURNEYS, REQUIRED_VIEWPORTS} from '../tools/qa/journeys.mjs';
import {verifyReport} from '../tools/qa/verify-report.mjs';

const HEAD = 'a'.repeat(40);
const COMMIT = 'b'.repeat(40);
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

// A complete, valid evidence directory with small placeholder files; each test then breaks one thing.
function evidence(t, mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-qa-gate-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  mkdirSync(join(dir, 'screenshots'));
  mkdirSync(join(dir, 'traces'));
  const files = {};
  const put = (path, content) => { writeFileSync(join(dir, path), content); files[path] = sha256(Buffer.from(content)); };
  const journeys = [];
  for (const id of REQUIRED_JOURNEYS) for (const viewport of REQUIRED_VIEWPORTS) {
    const shot = `screenshots/${id}-${viewport}-01.png`;
    const trace = `traces/${id}-${viewport}.zip`;
    put(shot, `png ${id} ${viewport}`);
    put(trace, `zip ${id} ${viewport}`);
    journeys.push({id, viewport, status: 'PASS', reason: null, duration_ms: 1234, trace, steps: [{name: 'step', status: 'PASS', screenshot: shot}],
      console_errors: [], page_errors: [], http_errors: [], request_failures: []});
  }
  const report = {schema: 'mp-browser-qa-v1', head_sha: HEAD, tested_commit: COMMIT, working_tree_clean: true, generated_at: new Date().toISOString(),
    dataset: {production_data: false}, injected_defect: false, journeys, counts: {pass: journeys.length, fail: 0, skip: 0, not_verified: 0},
    missing_required: [], verdict: 'PASS', files};
  mutate(report, dir);
  writeFileSync(join(dir, 'report.json'), JSON.stringify(report));
  return dir;
}
const check = (dir, opts = {}) => verifyReport(dir, {expectedHead: HEAD, expectedCommit: COMMIT, ...opts});
const refused = (result, pattern) => {
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => pattern.test(error)), `expected ${pattern} in ${JSON.stringify(result.errors)}`);
};

test('a complete, unmodified report on the exact commit is accepted', t => {
  const result = check(evidence(t));
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
});

test('missing evidence is refused', t => {
  const empty = mkdtempSync(join(tmpdir(), 'mp-qa-gate-'));
  t.after(() => rmSync(empty, {recursive: true, force: true}));
  refused(check(empty), /report\.json missing/);
  writeFileSync(join(empty, 'report.json'), '{not json');
  refused(check(empty), /not valid JSON/);
  refused(verifyReport(evidence(t), {expectedHead: ''}), /expected head SHA/);
});

test('evidence of another commit, a modified tree or an injected defect is refused', t => {
  refused(check(evidence(t, r => { r.head_sha = 'c'.repeat(40); })), /not the PR head/);
  refused(check(evidence(t), {expectedHead: 'd'.repeat(40)}), /not the PR head/);
  refused(check(evidence(t, r => { r.tested_commit = 'e'.repeat(40); })), /not the checked-out commit/);
  refused(check(evidence(t, r => { r.working_tree_clean = false; })), /modified working tree/);
  refused(check(evidence(t, r => { r.injected_defect = true; })), /injected defect/);
  refused(check(evidence(t, r => { r.generated_at = '2999-01-01T00:00:00Z'; })), /future/);
  refused(check(evidence(t, r => { r.dataset.production_data = true; })), /production_data/);
});

test('a missing or changed evidence file is refused', t => {
  refused(check(evidence(t, (r, dir) => { rmSync(join(dir, r.journeys[0].trace)); })), /evidence missing/);
  refused(check(evidence(t, (r, dir) => { writeFileSync(join(dir, r.journeys[0].steps[0].screenshot), 'edited'); })), /changed after the run/);
  refused(check(evidence(t, r => { delete r.files[r.journeys[0].trace]; })), /trace not in the evidence/);
  refused(check(evidence(t, r => { r.files['../escape.png'] = 'x'; })), /unsafe evidence path/);
});

test('a PASS without execution, a hidden failure or a wrong count is refused', t => {
  refused(check(evidence(t, r => { r.journeys[0].steps = []; })), /PASS without executed steps/);
  refused(check(evidence(t, r => { r.journeys[0].steps[0].status = 'FAIL'; })), /failed or unrecorded step/);
  refused(check(evidence(t, r => { r.journeys[0].duration_ms = 0; })), /without a duration/);
  refused(check(evidence(t, r => { r.journeys[0].page_errors = ['TypeError: x']; })), /PASS with page_errors/);
  refused(check(evidence(t, r => { r.journeys[0].http_errors = ['500 /api/v1/health']; })), /PASS with http_errors/);
  refused(check(evidence(t, r => { delete r.journeys[0].console_errors; })), /console_errors missing/);
  refused(check(evidence(t, r => { r.journeys[0].status = 'FAIL'; })), /declared verdict PASS/);
  refused(check(evidence(t, r => { r.counts.pass += 1; })), /counts/);
  refused(check(evidence(t, r => { r.journeys.push({...r.journeys[0]}); r.counts.pass += 1; })), /reported twice/);
});

test('a skipped or missing required journey is refused, with or without a reason', t => {
  refused(check(evidence(t, r => { r.journeys[0].status = 'SKIP'; r.counts = {...r.counts, pass: r.counts.pass - 1, skip: 1}; })), /SKIP without a reason/);
  refused(check(evidence(t, r => { Object.assign(r.journeys[0], {status: 'NOT_VERIFIED', reason: 'no browser'}); r.counts = {...r.counts, pass: r.counts.pass - 1, not_verified: 1}; r.verdict = 'FAIL'; })),
    /required journeys not passed/);
  refused(check(evidence(t, r => { r.journeys.shift(); r.counts.pass -= 1; })), /required journeys not passed/);
  refused(check(evidence(t, r => { r.secret = 'gh' + 'p_' + 'Z'.repeat(36); })), /secret-like/);
});

test('the runner fails a real page that leaks a raw value, with evidence (deliberately injected defect)', {timeout: 240000}, async t => {
  const {runBrowserQa} = await import('../tools/qa/browser-qa.mjs');
  const {JOURNEYS} = await import('../tools/qa/journeys.mjs');
  const out = mkdtempSync(join(tmpdir(), 'mp-qa-defect-'));
  t.after(() => rmSync(out, {recursive: true, force: true}));
  // The defect: the page renders missing values with String(value) instead of N/D.
  const contextHook = context => context.route('**/assets/app.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace("if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, ND);", 'if (false) return null;');
    await route.fulfill({response, body});
  });
  let report;
  try {
    report = await runBrowserQa({out, journeys: JOURNEYS.filter(journey => journey.id === 'dashboard'), viewports: ['desktop'], headSha: HEAD, contextHook});
  } catch (error) {
    if (!process.env.CI && /no Chromium|ECONNREFUSED/.test(String(error?.message))) return t.skip(String(error.message));
    throw error;
  }
  assert.equal(report.verdict, 'FAIL');
  const journey = report.journeys[0];
  assert.equal(journey.status, 'FAIL');
  assert.match(journey.reason, /N\/D|raw value shown/);
  assert.ok(journey.steps.some(step => step.status === 'FAIL' && step.screenshot && existsSync(join(out, step.screenshot))), 'failure screenshot saved');
  assert.ok(existsSync(join(out, journey.trace)), 'trace saved');
  assert.equal(report.findings.length, 1);
  assert.equal(report.injected_defect, true);
  const verdict = verifyReport(out, {expectedHead: HEAD});
  assert.equal(verdict.ok, false, 'the gate refuses it');
  assert.ok(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).files[journey.trace]);
});

test('the runner fails a real page with a control missing from the control inventory (MP-UI-PR-001, injected defect)', {timeout: 240000}, async t => {
  const {runBrowserQa} = await import('../tools/qa/browser-qa.mjs');
  const {JOURNEYS} = await import('../tools/qa/journeys.mjs');
  const out = mkdtempSync(join(tmpdir(), 'mp-qa-control-'));
  t.after(() => rmSync(out, {recursive: true, force: true}));
  // The defect: the tabs of the Dati area lose their data-control id.
  const contextHook = context => context.route('**/assets/app.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(", 'data-control': ctl('DATA-TAB', view ?? 'coverage')", '');
    await route.fulfill({response, body});
  });
  let report;
  try {
    report = await runBrowserQa({out, journeys: JOURNEYS.filter(journey => journey.id === 'dashboard'), viewports: ['desktop'], headSha: HEAD, contextHook});
  } catch (error) {
    if (!process.env.CI && /no Chromium|ECONNREFUSED/.test(String(error?.message))) return t.skip(String(error.message));
    throw error;
  }
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.journeys[0].reason, /control without data-control: <a>/);
});

test('inherited keys, files outside the manifest and a wrong missing_required are refused (PR #164 NB-1, NB-2)', t => {
  // Forged evidence naming inherited object keys instead of real files.
  refused(check(evidence(t, (r, dir) => {
    rmSync(join(dir, r.journeys[0].trace));
    delete r.files[r.journeys[0].trace];
    r.journeys[0].trace = 'toString';
  })), /trace not in the evidence/);
  refused(check(evidence(t, r => { r.files = JSON.parse('{"__proto__": {"x": "y"}}'); })), /no evidence files listed|not in the manifest/);
  refused(check(evidence(t, (r, dir) => { writeFileSync(join(dir, 'screenshots/planted.png'), 'x'); })), /not in the manifest: screenshots\/planted\.png/);
  refused(check(evidence(t, r => { r.missing_required = ['dashboard/desktop']; })), /missing_required/);
});

test('the tested commit must contain the PR head (PR #164 NB-2)', async t => {
  // A repository of its own with two commits: CI checkouts are shallow, so the test does not rely on this one's history.
  const {execFileSync} = await import('node:child_process');
  const repo = mkdtempSync(join(tmpdir(), 'mp-qa-git-'));
  t.after(() => rmSync(repo, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8'}).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  git('commit', '-q', '--allow-empty', '-m', 'one');
  const parent = git('rev-parse', 'HEAD');
  git('commit', '-q', '--allow-empty', '-m', 'two');
  const head = git('rev-parse', 'HEAD');
  // The parent does not contain the head: refused even though the report agrees with itself.
  const dir = evidence(t, r => { r.head_sha = head; r.tested_commit = parent; });
  refused(verifyReport(dir, {expectedHead: head, expectedCommit: parent, gitDir: repo}), /does not contain the PR head/);
  const ok = verifyReport(evidence(t, r => { r.head_sha = parent; r.tested_commit = head; }), {expectedHead: parent, expectedCommit: head, gitDir: repo});
  assert.deepEqual(ok.errors, []);
});

test('raw values are caught in text, labels and declared API prose are not (PR #164 NB-3)', async () => {
  const {RAW_VALUE} = await import('../tools/qa/browser-qa.mjs');
  for (const leak of ['null', 'undefined', 'null · 1,2', 'Partite del undefined', 'Stato: null', 'x (undefined)', 'NaN', '1,2 NaN']) assert.ok(RAW_VALUE.test(leak), leak);
  for (const fine of ['undefined states', 'nullable', 'N/D', 'Annullata', 'nessuno', '0']) assert.equal(RAW_VALUE.test(fine), false, fine);
});

test('technical text is caught in user views, plain Italian is not (MP-OWNER-UI-NO-RAW-TEXT-01)', async () => {
  const {technicalText} = await import('../tools/qa/browser-qa.mjs');
  // The examples the owner named, and the other technical texts of the inventory (docs/qa/ui-text-inventory.md).
  for (const leak of ['Le partite di un giorno nei dati salvati, in ordine di orario.', 'Orari come forniti dal fornitore.', 'ora del fornitore',
    'Fase: Storico · dataset: spain/laliga/2024-2025', 'spain/laliga/2024-2025', 'FINAL', 'HISTORICAL', 'PROVIDER_TZ_UNDOCUMENTED', 'HTTP_503',
    'Impossibile caricare i dati (UNAVAILABLE).', 'Fonte: /api/v1/fpt/matches', 'generato: 19/10/2026', 'versione codice: abc', 'Partite del 2024-08-01',
    '2026-10-19T18:00:00Z', 'Filtri applicati dal server: with_odds', 'fav_min must be a number', 'Dataset attivi', 'Ultimo snapshot', 'Ultimo backfill',
    'EVEN', 'KEPT', 'HTTP 503', '[object Object]']) {
    assert.ok(technicalText(leak), leak);
  }
  for (const fine of ['Finale', 'Senza risultato', 'Casa', 'Spain · Laliga · 2024/25', 'giovedì 1 agosto 2024', '01/08/2024', '15:00', 'Over 2,5',
    'Favorito Casa 1,300', 'xG 1,900 – 1,600', 'N/D', 'Nessuna partita corrisponde ai filtri.', 'Valore non valido in: Quota favorito da.',
    'Data non valida: scegli un giorno dal calendario.', 'MatchPilot · consultazione in sola lettura, nessuna operazione di trading.']) {
    assert.equal(technicalText(fine), false, fine);
  }
});

test('the runner refuses a non-empty output directory (PR #164 NB-5)', async t => {
  const {runBrowserQa} = await import('../tools/qa/browser-qa.mjs');
  const out = mkdtempSync(join(tmpdir(), 'mp-qa-out-'));
  t.after(() => rmSync(out, {recursive: true, force: true}));
  writeFileSync(join(out, 'old.png'), 'x');
  await assert.rejects(runBrowserQa({out, headSha: HEAD}), /not empty/);
});
