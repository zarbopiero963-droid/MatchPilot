import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyFiles } from '../scripts/ci-classify.mjs';

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
