import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateMergeGate, findClosingReferences} from '../tools/governance/policy.mjs';

test('GitHub auto-closing references are detected in every form', () => {
  for (const text of ['Closes #12', 'fixes: #3', 'Resolved owner/repo#4', 'close https://github.com/a/b/issues/5', 'FIX #1', 'This PR resolves #150.', 'closes:#2', '**Fixes** #4', 'fixes (#8)', 'Resolves https://www.github.com/a/b/issues/9', '__Closes__: #6', 'Closes: [#12](https://github.com/o/r/issues/12)', 'Closes `#12`', 'Closes ( [#12](u) )', 'Closes <#12>']) {
    assert.equal(findClosingReferences(text).length, 1, text);
  }
  for (const text of ['Refs #12', 'closes the gap', 'fix #', 'prefix #12', 'never Closes/Fixes/Resolves #N', 'Fixed a bug in #12 handling? no: "in" breaks it', 'unfixed #3', 'enclosed #4', 'fixture #5']) {
    assert.deepEqual(findClosingReferences(text), [], text);
  }
});

const head = 'f'.repeat(40);
const ready = () => ({
  pr_state: 'open', scope_authorized: true, gate_a: 'PASS', gate_b: 'PASS', mandatory_tests: 'PASS', ci: 'SUCCESS', branch_protection: true,
  review: {verdict: 'APPROVED', independent: true, reference: 'https://github.com/o/r/pull/1#issuecomment-1', reviewed_sha: head},
  head_sha: head, blocking_findings: 0, owner_conflicts: 0, external_operations: [],
  title: 'R-01: governance', body: 'Refs #150', commit_messages: ['Governance: checkpoints\n\nRefs #150'],
});

test('merge is allowed only when every MP-OWNER-AUTOMERGE-01 condition holds', () => {
  assert.deepEqual(evaluateMergeGate(ready()), {allowed: true, action: 'merge', reasons: []});
  const broken = {
    scope_authorized: false, gate_a: 'FAIL', gate_b: 'NOT_VERIFIED', mandatory_tests: undefined, ci: 'FAILURE', branch_protection: false,
    blocking_findings: 1, owner_conflicts: undefined, external_operations: ['deploy'], pr_state: 'closed',
  };
  for (const [key, value] of Object.entries(broken)) {
    const verdict = evaluateMergeGate({...ready(), [key]: value});
    assert.equal(verdict.allowed, false, `${key}=${value} allowed a merge`);
    assert.equal(verdict.reasons.length, 1, `${key}: ${verdict.reasons}`);
  }
});

test('the review must be independent, recorded and cover the current head', () => {
  const base = ready();
  assert.match(evaluateMergeGate({...base, review: {...base.review, verdict: 'CHANGES REQUESTED'}}).reasons[0], /CHANGES REQUESTED/);
  assert.match(evaluateMergeGate({...base, review: {...base.review, independent: false}}).reasons[0], /not independent/);
  assert.match(evaluateMergeGate({...base, review: {...base.review, reference: null}}).reasons[0], /not recorded/);
  assert.match(evaluateMergeGate({...base, review: {...base.review, reviewed_sha: 'e'.repeat(40)}}).reasons[0], /current head/);
  assert.match(evaluateMergeGate({...base, review: undefined}).reasons[0], /missing/);
});

test('auto-closing references in title, body or commits block the merge; merged PRs are a no-op', () => {
  assert.match(evaluateMergeGate({...ready(), body: 'Closes #150'}).reasons[0], /auto-closing/);
  assert.match(evaluateMergeGate({...ready(), commit_messages: ['fix #3']}).reasons[0], /auto-closing/);
  assert.deepEqual(evaluateMergeGate({...ready(), pr_state: 'merged'}), {allowed: false, action: 'noop', reasons: ['PR already merged']});
});

test('regression: the recorded PR #149 merge input satisfies the gate', () => {
  const pr149 = {
    ...ready(), head_sha: '3c3bf20bf8628688b2ce1f35d4467335b84a6167', title: 'MP-PR-00: establish Gate A atomic requirements inventory',
    body: 'Refs #3 #97 #104 #12 #20 #40 #144',
    review: {verdict: 'APPROVED', independent: true, reference: 'https://github.com/zarbopiero963-droid/MatchPilot/pull/149#issuecomment-6254321043', reviewed_sha: '3c3bf20bf8628688b2ce1f35d4467335b84a6167'},
    commit_messages: ['Governance: add MP-PR-00 atomic requirements inventory', 'Governance: apply MP-PR-00 independent audit corrections (R-00)\n\nRefs #3 #97 #104 #149'],
  };
  assert.equal(evaluateMergeGate(pr149).allowed, true);
});
