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
  head_sha: head, blocking_findings: 0, owner_conflicts: 0, external_operations: [], web_impact: false, merge_class: 'AUTO-MERGE ELIGIBLE', facts_source: 'github',
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
  assert.equal(evaluateMergeGate({...base, review: {...base.review, independent: false, separate_session: true}}).allowed, true, 'a separate-session review counts (MP-OWNER-AUTOMERGE-02)');
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
    // Recorded before GOV-01; the base classifier output and GitHub-read facts are now part of every input.
    merge_class: 'AUTO-MERGE ELIGIBLE', facts_source: 'github',
    commit_messages: ['Governance: add MP-PR-00 atomic requirements inventory', 'Governance: apply MP-PR-00 independent audit corrections (R-00)\n\nRefs #3 #97 #104 #149'],
  };
  assert.equal(evaluateMergeGate(pr149).allowed, true);
});

test('a web change merges only with verified Browser QA evidence on the current head (MP-OWNER-BROWSER-QA-HARD-GATE-01)', () => {
  const qa = {verdict: 'PASS', verified: true, head_sha: head, ci_run_id: 123};
  assert.deepEqual(evaluateMergeGate({...ready(), web_impact: true, browser_qa: qa}).reasons, []);
  const blocked = (input, pattern) => {
    const verdict = evaluateMergeGate({...ready(), ...input});
    assert.equal(verdict.allowed, false);
    assert.ok(verdict.reasons.some(reason => pattern.test(reason)), JSON.stringify(verdict.reasons));
  };
  blocked({web_impact: undefined}, /web impact is unknown/);
  blocked({web_impact: 'no'}, /web impact is unknown/);
  blocked({web_impact: true}, /browser QA is missing/);
  blocked({web_impact: true, browser_qa: {...qa, verdict: 'FAIL'}}, /browser QA is FAIL/);
  blocked({web_impact: true, browser_qa: {...qa, verified: false}}, /not verified/);
  blocked({web_impact: true, browser_qa: {...qa, head_sha: 'e'.repeat(40)}}, /current head/);
  blocked({web_impact: true, browser_qa: {...qa, ci_run_id: null}}, /no CI run/);
  // A non-web change needs no browser evidence.
  assert.equal(evaluateMergeGate({...ready(), web_impact: false}).allowed, true);
});

test('GOV-01: the merge class from the base classifier decides; an owner-only PR needs the owner GO on this head', () => {
  assert.match(evaluateMergeGate({...ready(), merge_class: undefined}).reasons.join(), /merge class unknown/);
  assert.match(evaluateMergeGate({...ready(), merge_class: 'ELIGIBLE?'}).reasons.join(), /merge class unknown/);
  const owner = {...ready(), merge_class: 'OWNER-GO REQUIRED'};
  assert.match(evaluateMergeGate(owner).reasons.join(), /owner GO required/);
  assert.match(evaluateMergeGate({...owner, owner_go: {reference: 'https://github.com/o/r/pull/1#issuecomment-2', sha: 'e'.repeat(40)}}).reasons.join(), /owner GO required/);
  assert.equal(evaluateMergeGate({...owner, owner_go: {reference: 'https://github.com/o/r/pull/1#issuecomment-2', sha: head}}).allowed, true);
});

test('GOV-01: only the certified VPS deploy of main may follow a merge, and a failed deploy stops further merges', () => {
  const base = 'b'.repeat(40);
  const deploy = {...ready(), base_sha: base, external_operations: ['vps_deploy_main'], deploy_path_certified: true, last_main_deploy: {sha: base, conclusion: 'success'}};
  assert.equal(evaluateMergeGate(deploy).allowed, true);
  const cases = [
    [{deploy_path_certified: false}, /not certified/],
    [{deploy_path_certified: undefined}, /not certified/],
    [{last_main_deploy: {sha: base, conclusion: 'failure'}}, /merges are stopped/],
    [{last_main_deploy: {sha: 'c'.repeat(40), conclusion: 'success'}}, /merges are stopped/],
    [{last_main_deploy: undefined}, /merges are stopped/],
    [{external_operations: ['vps_deploy_main', 'render_deploy']}, /deploy, cost, production or LIVE/],
    [{external_operations: ['neon_write']}, /deploy, cost, production or LIVE/],
    [{external_operations: undefined}, /external operations are unknown/],
  ];
  for (const [change, expected] of cases) assert.match(evaluateMergeGate({...deploy, ...change}).reasons.join('\n'), expected, JSON.stringify(change));
});
