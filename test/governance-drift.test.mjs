// GOV-DRIFT-01 (#150, t141u): RED→GREEN tests for the registry/GitHub drift check.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {detectDrift, normalizePulls} from '../tools/governance/drift.mjs';

const now = new Date('2026-10-23T10:00:00Z');
const reg = tasks => ({tasks});
const codes = problems => problems.map(p => p.code).sort();

test('REVIEW task whose PR is merged fails', () => {
  const p = detectDrift({registry: reg([{id: 'T', pr: 189, branch: 'b', state: 'REVIEW', lease: null}]), prs: [{number: 189, branch: 'b', base: 'main', state: 'merged'}], now});
  assert.deepEqual(codes(p), ['TASK_PR_MERGED_NOT_FINAL']);
});
test('RUNNING task whose PR is closed unmerged (branch gone) fails', () => {
  const p = detectDrift({registry: reg([{id: 'T', pr: 5, branch: 'b', state: 'RUNNING', lease: null}]), prs: [{number: 5, branch: 'b', base: 'main', state: 'closed'}], now});
  assert.deepEqual(codes(p), ['TASK_PR_CLOSED_NOT_FINAL']);
});
test('expired lease on a non-terminal task fails', () => {
  const p = detectDrift({registry: reg([{id: 'T', pr: null, branch: 'x', state: 'RUNNING', lease: {holder: 'a', expires_at: '2026-10-22T15:43:00Z'}}]), prs: [], now});
  assert.deepEqual(codes(p), ['LEASE_EXPIRED']);
});
test('merged PR on main after the baseline without a task fails; before the baseline is ignored', () => {
  const prs = [{number: 195, branch: 'z', base: 'main', state: 'merged', merge_sha: 'abcdef1'}, {number: 100, branch: 'old', base: 'main', state: 'merged'}];
  assert.deepEqual(codes(detectDrift({registry: reg([]), prs, now})), ['MERGED_PR_UNREGISTERED']);
});
test('PR under test without a claim fails; claimed by branch passes', () => {
  assert.deepEqual(codes(detectDrift({registry: reg([]), prs: [], now, currentPr: 300, currentBranch: 'feat'})), ['PR_UNCLAIMED']);
  assert.deepEqual(detectDrift({registry: reg([{id: 'F', pr: null, branch: 'feat', state: 'RUNNING', lease: null}]), prs: [], now, currentPr: 300, currentBranch: 'feat'}), []);
});
test('grace: the just-merged PR may still be RUNNING on the push to main', () => {
  const registry = reg([{id: 'T', pr: null, branch: 'b', state: 'RUNNING', lease: {holder: 'a', expires_at: '2026-10-23T09:00:00Z'}}]);
  const prs = [{number: 211, branch: 'b', base: 'main', state: 'merged'}];
  assert.equal(detectDrift({registry, prs, now}).length, 2);
  assert.deepEqual(detectDrift({registry, prs, now, grace: [211]}), []);
});
test('normalizePulls maps GitHub REST rows', () => {
  assert.deepEqual(normalizePulls([{number: 1, head: {ref: 'h'}, base: {ref: 'main'}, state: 'closed', merged_at: 'x', merge_commit_sha: 's'}]), [{number: 1, branch: 'h', base: 'main', state: 'merged', merge_sha: 's'}]);
});
test('CI runs the drift check', () => {
  assert.match(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'), /cli\.mjs drift/);
});
