// GOV-01 (MP-OWNER-AUTOMERGE-03): the file- and impact-based merge classifier. Fail closed on unknown paths and doubt;
// indirect effects through imports; a PR cannot weaken the classifier that decides its own merge, because the procedure
// runs the BASE commit's copy (checked here on throwaway git repositories).
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {ELIGIBLE, OWNER_GO, classifyChanges, importGraph, importsOf} from '../tools/governance/merge-class.mjs';

const M = (path, status = 'M') => ({status, path});
const classOf = (changes, files = []) => classifyChanges(changes, importGraph(files)).class;

test('owner-only areas need the owner GO; ordinary areas are eligible; unknown paths fail closed', () => {
  for (const path of ['AGENTS.md', 'CLAUDE.md', '.github/workflows/ci.yml', '.github/workflows/deploy-vps.yml', 'scripts/ci-classify.mjs',
    'tools/governance/merge-class.mjs', 'tools/governance/policy.mjs', 'test/governance-merge-class.test.mjs', 'docs/governance/owner-decisions.json',
    'docs/governance/certifiability-matrix.md', 'migrations/030-x.sql', 'src/db.mjs', 'src/migrate.mjs', 'src/auth/owner-auth.mjs',
    'src/runtime-safety.mjs', 'src/server.mjs', 'package.json', 'package-lock.json', '.npmrc', 'src/providers/futpython/integrity.mjs',
    'src/jobs/totalcorner-live.mjs', 'src/alerts.mjs', 'src/background.mjs', 'src/pit/policy.mjs', 'src/hist/engine.mjs', 'src/math/money.mjs',
    'src/analysis/match-analysis.mjs', 'src/api/v1.mjs', 'tools/qa/visual.mjs', 'test/visual/baselines/x.png', 'docs/qa/visual.md',
    'docs/mockups/matchpilot-trading-os.html', 'docs/pit-policy.md', 'tools/hist/backtest.mjs']) {
    assert.equal(classOf([M(path)]), OWNER_GO, path);
  }
  for (const path of ['src/web/app.js', 'src/web/app.css', 'src/web/index.html', 'docs/web.md', 'README.md', 'test/new-ui.test.mjs',
    'docs/governance/checkpoints/CP-1.json', 'docs/governance/work-registry.json', 'docs/governance/mp-pr-00/requirements.json', 'tools/perf/bench.mjs']) {
    assert.equal(classOf([M(path, 'A')]), ELIGIBLE, path);
  }
  for (const path of ['src/lib/csv.mjs', 'src/new-module.mjs', 'docs/new-normative.md', 'Dockerfile', 'random.txt', 'tools/other/x.mjs']) {
    const result = classifyChanges([M(path)], new Map());
    assert.equal(result.class, OWNER_GO, path);
    assert.match(result.reasons[0], /UNKNOWN_PATH/);
  }
  assert.match(classifyChanges([], new Map()).reasons[0], /EMPTY_OR_UNREADABLE_DIFF/);
  assert.match(classifyChanges([{status: 'X', path: 'src/web/app.js'}], new Map()).reasons[0], /UNKNOWN_CHANGE_TYPE/);
  assert.match(classifyChanges([M('src/web/../server.mjs')], new Map()).reasons[0], /UNSAFE_PATH/);
});

test('a mixed PR, a rename out of an owner-only area and a deletion of a governance file need the owner GO', () => {
  assert.equal(classOf([M('src/web/app.css'), M('src/server.mjs')]), OWNER_GO);
  assert.equal(classOf([{status: 'R100', oldPath: 'src/hist/engine.mjs', path: 'src/web/engine.js'}]), OWNER_GO, 'the old path counts too');
  assert.equal(classOf([M('AGENTS.md', 'D')]), OWNER_GO);
  assert.equal(classOf([M('test/governance-policy.test.mjs', 'D')]), OWNER_GO);
});

test('indirect effects: a file an owner-only module imports, directly or not, needs the owner GO', () => {
  const files = [
    ['tools/qa/visual.mjs', "import {seedQaArchive} from '../../test/helpers/fpt-seed.mjs';"],
    ['test/helpers/fpt-seed.mjs', "import {x} from './util.mjs';"],
    ['test/helpers/util.mjs', 'export const x = 1;'],
    ['test/helpers/free.mjs', 'export const y = 2;'],
  ];
  const direct = classifyChanges([M('test/helpers/fpt-seed.mjs')], importGraph(files));
  assert.equal(direct.class, OWNER_GO);
  assert.match(direct.reasons[0], /indirect:tools\/qa\/visual\.mjs/);
  assert.equal(classOf([M('test/helpers/util.mjs')], files), OWNER_GO, 'transitive importer');
  assert.equal(classOf([M('test/helpers/free.mjs')], files), ELIGIBLE);
});

test('a changed or deleted test of an owner-only module needs the owner GO; a new test only adds coverage', () => {
  const files = [['test/hist-backtest.test.mjs', "import {runBacktest} from '../src/hist/engine.mjs';"], ['test/web.test.mjs', "import x from 'node:test';"]];
  assert.equal(classOf([M('test/hist-backtest.test.mjs')], files), OWNER_GO);
  assert.equal(classOf([M('test/hist-backtest.test.mjs', 'D')], files), OWNER_GO);
  assert.equal(classOf([M('test/hist-backtest.test.mjs', 'A')], files), ELIGIBLE);
  assert.equal(classOf([M('test/web.test.mjs')], files), ELIGIBLE);
});

test('import parsing covers static, re-export, side-effect and dynamic imports', () => {
  assert.deepEqual(importsOf(`import a from './a.mjs';\nimport {b} from "../b.mjs";\nexport {c} from './c.mjs';\nimport './d.mjs';\nconst e = await import('./e.mjs');`).sort(),
    ['../b.mjs', './a.mjs', './c.mjs', './d.mjs', './e.mjs']);
});

// ---- CLI on throwaway git repositories ----
const CLASSIFIER = readFileSync(new URL('../tools/governance/merge-class.mjs', import.meta.url), 'utf8');
function repo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'merge-class-'));
  const run = (...args) => execFileSync('git', ['-C', dir, ...args], {encoding: 'utf8', env: {...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t'}});
  run('init', '-q', '-b', 'main');
  const write = entries => { for (const [path, text] of Object.entries(entries)) { mkdirSync(dirname(join(dir, path)), {recursive: true}); writeFileSync(join(dir, path), text); } };
  write(files);
  run('add', '-A');
  run('commit', '-qm', 'base');
  return {dir, run, write};
}
// The procedure of AGENTS.md §4: extract the classifier of the BASE commit and run it on the range.
function classifyFromBase(dir, base, head) {
  const out = mkdtempSync(join(tmpdir(), 'merge-class-base-'));
  writeFileSync(join(out, 'merge-class.mjs'), execFileSync('git', ['-C', dir, 'show', `${base}:tools/governance/merge-class.mjs`], {encoding: 'utf8'}));
  const result = spawnSync(process.execPath, [join(out, 'merge-class.mjs'), '--repo', dir, '--base', base, '--head', head], {encoding: 'utf8'});
  return {status: result.status, ...JSON.parse(result.stdout)};
}

test('CLI: a frontend-only branch is eligible, an indirect change is not, and errors fail closed', () => {
  const r = repo({'tools/governance/merge-class.mjs': CLASSIFIER, 'src/server.mjs': "import {f} from './lib/a.mjs';", 'src/lib/a.mjs': 'export const f = 1;',
    'src/web/app.css': 'body{}', 'README.md': '# r'});
  r.run('checkout', '-qb', 'web');
  r.write({'src/web/app.css': 'body{color:red}', 'README.md': '# r2'});
  r.run('commit', '-qam', 'web');
  const web = classifyFromBase(r.dir, 'main', 'web');
  assert.equal(web.class, ELIGIBLE, JSON.stringify(web.reasons));
  assert.equal(web.status, 0);
  r.run('checkout', '-qb', 'lib', 'main');
  r.write({'src/lib/a.mjs': 'export const f = 2;'});
  r.run('commit', '-qam', 'lib');
  const lib = classifyFromBase(r.dir, 'main', 'lib');
  assert.equal(lib.class, OWNER_GO);
  assert.equal(lib.status, 4);
  const broken = classifyFromBase(r.dir, 'main', 'no-such-branch');
  assert.equal(broken.class, OWNER_GO);
  assert.match(broken.reasons[0], /CLASSIFIER_ERROR/);
});

test('CLI: a PR that loosens the classifier is still judged by the base copy, and is owner-only itself', () => {
  const r = repo({'tools/governance/merge-class.mjs': CLASSIFIER, 'src/server.mjs': "export const s = 1;", 'src/web/app.css': 'body{}'});
  r.run('checkout', '-qb', 'bypass');
  // The PR rewrites the classifier to call everything eligible and touches the server.
  r.write({'tools/governance/merge-class.mjs': CLASSIFIER.replace("export const OWNER_RULES = [", "export const OWNER_RULES = [] && [").replace("const reasons = [];\n  if (!Array.isArray(changes)", "const reasons = [];\n  return {class: ELIGIBLE, reasons, files};\n  if (!Array.isArray(changes)"),
    'src/server.mjs': 'export const s = 2;'});
  r.run('commit', '-qam', 'bypass');
  const head = spawnSync(process.execPath, [join(r.dir, 'tools/governance/merge-class.mjs'), '--repo', r.dir, '--base', 'main', '--head', 'bypass'], {encoding: 'utf8'});
  assert.equal(JSON.parse(head.stdout).class, ELIGIBLE, 'sanity: the loosened copy in the PR would wave it through');
  const verdict = classifyFromBase(r.dir, 'main', 'bypass');
  assert.equal(verdict.class, OWNER_GO, 'the base copy decides');
  assert.ok(verdict.reasons.some(reason => /tools\/governance\/merge-class\.mjs: governance/.test(reason)));
  assert.ok(verdict.reasons.some(reason => /src\/server\.mjs: security/.test(reason)));
});
