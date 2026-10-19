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
    'test/helpers/fpt-seed.mjs']) {
    assert.equal(webImpact([file]), true, file);
  }
  assert.equal(webImpact(['README.md', 'src/web/app.css']), true, 'docs mixed with a web file stay a web change');
});

test('web impact exemption is automatic, verifiable and fails closed', () => {
  for (const files of [['README.md'], ['docs/web.md'], ['docs/governance/checkpoints/CP-x.json'], ['docs/mockups/matchpilot-trading-os.html'],
    ['src/math/core.mjs'], ['src/jobs/futpython-sync.mjs'], ['tools/governance/cli.mjs'], ['test/math-core.test.mjs']]) {
    assert.equal(webImpact(files), false, files.join(','));
  }
  assert.equal(webImpact([]), true, 'an empty or unreadable diff is a web change');
  assert.equal(webImpact(['', '  ']), true);
});
