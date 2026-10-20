import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFiles, webImpact } from '../scripts/ci-classify.mjs';

test('documentation-only changes use the documentation lane', () => {
  assert.deepEqual(classifyFiles(['README.md', 'docs/operations.md']), {
    mode: 'docs',
    categories: ['documentation'],
  });
});

test('mock-only changes use targeted UI checks', () => {
  assert.deepEqual(classifyFiles(['docs/mockups/matchpilot-trading-os.html']), {
    mode: 'ui',
    categories: ['ui'],
  });
});

test('database changes include transitive consumers and full suite', () => {
  const result = classifyFiles(['migrations/015-example.sql']);
  assert.equal(result.mode, 'full');
  for (const category of ['database', 'api', 'fpt', 'totalcorner', 'replay', 'trading', 'money-management', 'mcp']) {
    assert.ok(result.categories.includes(category), category);
  }
});

test('TotalCorner changes include API, replay and trading dependents', () => {
  const result = classifyFiles(['src/providers/totalcorner/live.mjs']);
  assert.equal(result.mode, 'full');
  for (const category of ['totalcorner', 'api', 'mcp', 'replay', 'trading']) assert.ok(result.categories.includes(category));
});

test('shared components conservatively select all dependent categories', () => {
  const result = classifyFiles(['src/alerts.mjs']);
  assert.equal(result.mode, 'full');
  assert.ok(result.categories.includes('security'));
  assert.ok(result.categories.includes('database'));
});

test('workflow, lockfile and unknown changes fall back to full', () => {
  for (const file of ['.github/workflows/ci.yml', 'package-lock.json', 'new-root-file.xyz']) {
    assert.deepEqual(classifyFiles([file]), { mode: 'full', categories: ['unknown'] });
  }
});

test('empty or invalid diff fails closed to full', () => {
  assert.deepEqual(classifyFiles([]), { mode: 'full', categories: ['unknown'] });
});

test('documentation mixed with source cannot downgrade the source lane', () => {
  assert.equal(classifyFiles(['docs/operations.md', 'src/providers/futpython/store.mjs']).mode, 'full');
});

test('web impact: site, browser-read APIs, data schema, dependencies and the gate itself require Browser QA', () => {
  for (const file of ['src/web/app.js', 'src/web/index.html', 'src/server.mjs', 'src/api/v1.mjs', 'src/auth/http.mjs', 'src/coverage-page.mjs',
    'src/providers/futpython/query.mjs', 'src/providers/totalcorner/live.mjs', 'src/db.mjs', 'migrations/030-x.sql', 'package.json', 'package-lock.json',
    'tools/qa/journeys.mjs', 'scripts/ci-classify.mjs', '.github/workflows/ci.yml', 'test/web-e2e.test.mjs', 'test/browser-qa-gate.test.mjs',
    'test/helpers/fpt-seed.mjs', 'test/visual/manifest.json', 'test/visual/baselines/oggi-desktop.png']) {
    assert.equal(webImpact([file]), true, file);
  }
  assert.equal(webImpact(['README.md', 'src/web/app.css']), true, 'docs mixed with a web file stay a web change');
  // Every application module is web: the server imports them directly or through the query layer (PR #164 B-1).
  for (const file of ['src/alerts.mjs', 'src/pit/readers.mjs', 'src/math/core.mjs', 'src/jobs/totalcorner-live.mjs', 'src/analysis/match-analysis.mjs', 'src/lib/csv.mjs']) {
    assert.equal(webImpact([file]), true, file);
  }
});

test('web impact exemption is automatic, verifiable and fails closed', () => {
  for (const files of [['README.md'], ['docs/web.md'], ['docs/governance/checkpoints/CP-x.json'], ['docs/mockups/matchpilot-trading-os.html'],
    ['tools/governance/cli.mjs'], ['test/math-core.test.mjs'], ['docs/governance/wip/R-07a-match-analysis.patch']]) {
    assert.equal(webImpact(files), false, files.join(','));
  }
  assert.equal(webImpact([]), true, 'an empty or unreadable diff is a web change');
  assert.equal(webImpact(['', '  ']), true);
});

test('a moved web file is a web change: the diff lists old and new paths (PR #164 B-2)', async () => {
  const {execFileSync} = await import('node:child_process');
  const {mkdtempSync, mkdirSync, rmSync, writeFileSync} = await import('node:fs');
  const {tmpdir} = await import('node:os');
  const {join} = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'mp-classify-'));
  try {
    const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'test');
    git('config', 'commit.gpgsign', 'false');
    mkdirSync(join(dir, 'src/web'), {recursive: true});
    writeFileSync(join(dir, 'src/web/app.js'), 'export const a = 1;\n'.repeat(20));
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(join(dir, 'docs/x'), {recursive: true});
    git('mv', 'src/web/app.js', 'docs/x/app.js');
    git('commit', '-q', '-m', 'move');
    const head = git('rev-parse', 'HEAD');
    const out = execFileSync(process.execPath, [join(process.cwd(), 'scripts/ci-classify.mjs')], {cwd: dir, env: {...process.env, BASE_SHA: base, HEAD_SHA: head, GITHUB_OUTPUT: ''}, encoding: 'utf8'});
    assert.match(out, /web=true/);
    assert.match(out, /mode=full/, 'the deleted source path keeps the full lane');
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
