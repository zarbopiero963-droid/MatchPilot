// MP-PR183-HARDENING-01 (review D2 6326290307 on PR #183): PR state read from GitHub and fail closed, structured
// evidence for claims pending verification, NO DUAL WRITER on branches, PRs and declared resources, complete and
// unambiguous authorization scopes, authz-check validating the repository first. Imports only APIs that already
// existed before the hardening, so the same file runs RED on the previous code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {checkAuthorization, handoffIn, validateCheckpoint} from '../tools/governance/checkpoints.mjs';
import {realityFor} from '../tools/governance/git.mjs';
import {claim, release, validateRegistry} from '../tools/governance/registry.mjs';
import {validateState} from '../tools/governance/cli.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_P = 'e'.repeat(40);
const context = {decisionIds: new Set(['MP-OWNER-R01-AUTH-20261018']), requirementIds: new Set(['MP-GOV-017']), taskIds: new Set(['R-01', 'R-02'])};
const NOW = new Date('2026-10-18T21:00:00Z');
const root = fileURLToPath(new URL('../', import.meta.url));

function makeV3(overrides = {}) {
  return {
    schema_version: 'mp-checkpoint-v3', id: 'CP-20261018T200000Z-agent-a', timestamp_utc: '2026-10-18T20:00:00Z',
    agent: {id: 'agent-a', role: 'Development Agent', session: 'session-a'}, mandate: {id: 'MANDATE-1', source: 'owner message'},
    activity: 'work', task: 'R-01', repository: 'zarbopiero963-droid/MatchPilot', issue: 150, pr: null, branch: 'feature',
    commit_sha: SHA_A, tree_sha: 'b'.repeat(40), base_sha: 'c'.repeat(40), worktree: {clean: true},
    requirements: ['MP-GOV-017'], changes: ['x'], tests: [], ci: {run_id: null, conclusion: 'NOT_RUN'}, gate_a: 'PASS', gate_b: 'NOT_VERIFIED',
    review: {verdict: 'NOT REQUESTED', reference: null}, findings: [], owner_decisions: ['MP-OWNER-R01-AUTH-20261018'], dependencies: [],
    progress: {done: [], in_progress: [], not_started: []}, resources: ['branch:feature'], authorizations: [], external_commands: [], artifacts: [],
    stop_conditions: ['any divergence'], costs: {incurred: 'none', authorized: 'none'}, vps: null,
    handoff: {status: 'NONE', from: null, to: null, responsibilities: []},
    state: 'RUNNING', next_action: 'next', resume_conditions: [], supersedes: null, ...overrides,
  };
}

function gitRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-hardening-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
  git('init', '-q', '-b', 'feature');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(dir, 'a.txt'), 'a');
  git('add', '.');
  git('commit', '-q', '-m', 'a');
  return {dir, head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}')};
}

const task = (overrides = {}) => ({id: 'R-01', title: 't', issue: 150, pr: null, branch: 'feature', kind: 'implementation', state: 'BLOCKED', assignee: null, lease: null, latest_checkpoint: 'CP-20261018T200000Z-agent-a', ...overrides});
const reg = (...tasks) => ({schema_version: 'mp-work-registry-v1', revision: 7, tasks});
const lease = (holder, expires = '2026-10-18T23:00:00Z') => ({holder, acquired_at: '2026-10-18T19:00:00Z', expires_at: expires});
const codes = result => result.problems.map(problem => problem.split(':')[0]);
const prEvidence = (overrides = {}) => ({source: 'github-api', url: 'https://api.github.com/repos/x/y/pulls/183', number: 183, state: 'open', head_sha: SHA_P, fetched_at: '2026-10-18T20:58:00Z', ...overrides});

// 1. PR state fail-closed.
test('a task with a PR stops when the PR state was not read from GitHub, or is stale, foreign or unverifiable', t => {
  const repo = gitRepo(t);
  const cp = makeV3({commit_sha: repo.head, tree_sha: repo.tree, pr: 183});
  const registry = reg(task({pr: 183, pr_open: true}));
  const run = reality => handoffIn({checkpoints: [cp], registry, task: 'R-01', agentId: 'agent-z', reality: {...realityFor(repo.dir, cp), ...reality}, now: NOW});
  assert.deepEqual(codes(run({})), ['PR_STATE_REQUIRED'], 'no PR state at all');
  assert.deepEqual(codes(run({prState: 'open'})), ['PR_STATE_REQUIRED'], 'a state typed by the agent is not evidence');
  assert.deepEqual(codes(run({prError: 'GitHub read failed'})), ['PR_STATE_UNVERIFIABLE']);
  assert.ok(codes(run({pr: prEvidence({source: 'agent'})})).includes('PR_STATE_REQUIRED'));
  assert.ok(codes(run({pr: prEvidence({number: 178})})).includes('PR_STATE_MISMATCH'));
  assert.ok(codes(run({pr: prEvidence({fetched_at: '2026-10-18T20:40:00Z'})})).includes('PR_STATE_STALE'), 'older than 10 minutes');
  assert.ok(codes(run({pr: prEvidence({fetched_at: '2026-10-18T22:00:00Z'})})).includes('PR_STATE_STALE'), 'from the future');
  assert.ok(codes(run({pr: prEvidence({state: 'draft'})})).includes('PR_STATE_UNVERIFIABLE'));
  assert.ok(codes(run({pr: prEvidence({head_sha: null})})).includes('PR_STATE_UNVERIFIABLE'));
});

test('GitHub PR evidence is checked against the registry and the branch', t => {
  const repo = gitRepo(t);
  const cp = makeV3({commit_sha: repo.head, tree_sha: repo.tree, pr: 183});
  const run = (taskOverrides, pr) => handoffIn({checkpoints: [cp], registry: reg(task({pr: 183, ...taskOverrides})), task: 'R-01', agentId: 'agent-z', reality: {...realityFor(repo.dir, cp), pr}, now: NOW});
  assert.deepEqual(codes(run({pr_open: true}, prEvidence({head_sha: repo.head}))), [], 'fresh evidence, open, same head');
  assert.deepEqual(codes(run({pr_open: true}, prEvidence())), ['PR_HEAD_MISMATCH'], 'the PR moved on GitHub');
  assert.deepEqual(codes(run({pr_open: true}, prEvidence({state: 'merged', head_sha: repo.head}))), ['PR_OPEN_MISMATCH', 'PR_ALREADY_MERGED']);
  assert.deepEqual(codes(run({pr_open: false}, prEvidence({head_sha: repo.head}))), ['PR_OPEN_MISMATCH']);
  // The PR of the checkpoint counts even when the registry entry has none.
  assert.deepEqual(codes(handoffIn({checkpoints: [cp], registry: reg(task()), task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now: NOW})), ['PR_STATE_REQUIRED']);
});

test('the CLI refuses a declared PR state or declared verifications instead of ignoring them', () => {
  for (const args of [['--pr-state', 'open'], ['--verified', 'anything']]) {
    const result = spawnSync(process.execPath, ['tools/governance/cli.mjs', 'handoff-in', 'GOV-RECON-01', '--agent', 'agent-x', ...args], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1, `${args[0]} accepted`);
    assert.match(result.stderr, /not accepted/);
  }
});

// 2. Verified evidence fail-closed.
const claims = [{id: 'C1', resource: 'vps:host', statement: 'mp-deploy v3 installed'}, {id: 'C2', resource: 'db:staging', statement: 'PG18 staging has 2,570,282 rows'}];
const record = (claimId, overrides = {}) => ({claim: claimId, resource: claimId === 'C1' ? 'vps:host' : 'db:staging', method: 'read-only command', observed: 'value', observed_at: '2026-10-18T20:50:00Z', observer: 'agent-z', result: 'VERIFIED', ...overrides});

function pendingCase(t, handoffOverrides = {}) {
  const repo = gitRepo(t);
  const cp = makeV3({commit_sha: repo.head, tree_sha: repo.tree, state: 'BLOCKED', handoff: {status: 'PENDING_VERIFICATION', from: 'agent-g', to: 'ANY', responsibilities: ['VPS'], claims, ...handoffOverrides}});
  return (args = {}) => handoffIn({checkpoints: [cp], registry: reg(task()), task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now: NOW, ...args});
}

test('a generic declaration never releases claims pending verification', t => {
  const run = pendingCase(t);
  assert.equal(run({verified: ['anything']}).ok, false, 'the old --verified list');
  assert.equal(run({evidence: ['anything']}).ok, false);
  assert.ok(codes(run({evidence: ['anything']})).includes('EVIDENCE_INVALID'));
  assert.equal(run({evidence: [record('C1'), record('C2')]}).ok, true, 'one recent VERIFIED record per claim, on its resource, by this agent');
});

test('claims without ids and resources can never be released, whatever the evidence', t => {
  const run = pendingCase(t, {claims: undefined});
  assert.deepEqual(codes(run({evidence: [record('C1'), record('C2')]})), ['HANDOFF_CLAIMS_UNSTRUCTURED']);
  const runNoResource = pendingCase(t, {claims: [{id: 'C1', statement: 'x'}]});
  assert.ok(codes(runNoResource({evidence: [record('C1')]})).includes('HANDOFF_CLAIMS_UNSTRUCTURED'));
});

test('evidence must cover every claim, on its resource, by this agent, recently, without mismatch or strays', t => {
  const run = pendingCase(t);
  const stop = (evidence, code) => assert.ok(codes(run({evidence})).includes(code), `${code} expected, got ${codes(run({evidence}))}`);
  stop([record('C1')], 'EVIDENCE_MISSING');
  stop([record('C1'), record('C2', {resource: 'vps:host'})], 'EVIDENCE_MISSING');
  stop([record('C1'), record('C2', {observer: 'agent-g'})], 'EVIDENCE_MISSING');
  stop([record('C1'), record('C2', {observed_at: '2026-10-17T20:00:00Z'})], 'EVIDENCE_MISSING');
  stop([record('C1'), record('C2', {observed_at: '2026-10-18T22:00:00Z'})], 'EVIDENCE_MISSING');
  stop([record('C1'), record('C2', {result: 'MISMATCH'})], 'CLAIM_MISMATCH');
  stop([record('C1'), record('C2'), record('C9')], 'EVIDENCE_UNKNOWN_CLAIM');
  stop([record('C1'), record('C2', {method: ''})], 'EVIDENCE_INVALID');
  stop([record('C1'), record('C2', {result: 'OK'})], 'EVIDENCE_INVALID');
});

// 3. NO DUAL WRITER.
test('handoff IN stops on a resource written by another agent, declared on the task or only in its checkpoint (M6, M10)', t => {
  const repo = gitRepo(t);
  const cp = makeV3({commit_sha: repo.head, tree_sha: repo.tree, resources: ['branch:feature', 'vps:host']});
  const other = {id: 'R-02', title: 'o', issue: 179, pr: null, branch: 'main', kind: 'operations', state: 'RUNNING', assignee: {agent: 'agent-b', role: 'Integration Agent'}, lease: lease('agent-b'), latest_checkpoint: null, resources: ['vps:host']};
  const declared = handoffIn({checkpoints: [cp], registry: reg(task({resources: ['vps:host']}), other), task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now: NOW});
  assert.deepEqual(codes(declared), ['DUAL_WRITER_RESOURCE'], 'declared on the task');
  const onlyCheckpoint = handoffIn({checkpoints: [cp], registry: reg(task(), other), task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now: NOW});
  assert.deepEqual(codes(onlyCheckpoint), ['DUAL_WRITER_RESOURCE'], 'declared only in the checkpoint');
  const sameBranch = {...other, kind: 'implementation', branch: 'feature', resources: []};
  assert.deepEqual(codes(handoffIn({checkpoints: [cp], registry: reg(task(), sameBranch), task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now: NOW})), ['DUAL_WRITER_RESOURCE'], 'the branch is a resource even when not declared');
  assert.deepEqual(codes(handoffIn({checkpoints: [cp], registry: reg(task(), other), task: 'R-01', agentId: 'agent-b', reality: realityFor(repo.dir, cp), now: NOW})), [], 'the holder itself is not a second writer');
});

test('an expired lease of another agent is not a writer (M9)', t => {
  const repo = gitRepo(t);
  const cp = makeV3({commit_sha: repo.head, tree_sha: repo.tree, resources: ['branch:feature', 'vps:host']});
  const other = {id: 'R-02', title: 'o', issue: 179, pr: null, branch: 'main', kind: 'operations', state: 'BLOCKED', assignee: {agent: 'agent-b', role: 'Integration Agent'}, lease: lease('agent-b', '2026-10-18T20:30:00Z'), latest_checkpoint: null, resources: ['vps:host']};
  const expiredOwn = task({assignee: {agent: 'agent-b', role: 'Development Agent'}, lease: lease('agent-b', '2026-10-18T20:30:00Z')});
  assert.deepEqual(codes(handoffIn({checkpoints: [cp], registry: reg(expiredOwn, other), task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now: NOW})), []);
});

test('registry: one holder may write a resource from two tasks, two holders may not; branch and PR are implicit resources (M23)', () => {
  const now = NOW;
  const t1 = {id: 'A', title: 'a', issue: 1, pr: null, branch: 'b1', kind: 'audit', state: 'RUNNING', assignee: {agent: 'x', role: 'Integration Agent'}, lease: lease('x'), latest_checkpoint: null, resources: ['vps:host']};
  const t2 = {...t1, id: 'B', branch: 'b2'};
  assert.deepEqual(validateRegistry(reg(t1, t2), {now}), [], 'same holder');
  assert.ok(validateRegistry(reg(t1, {...t2, assignee: {agent: 'y', role: 'Integration Agent'}, lease: lease('y')}), {now}).some(e => e.startsWith('dual writer on vps:host')));
  const impl = (id, holder, extra) => ({id, title: id, issue: 1, pr: null, branch: 'shared', kind: 'implementation', state: 'BLOCKED', assignee: holder ? {agent: holder, role: 'Development Agent'} : null, lease: holder ? lease(holder) : null, latest_checkpoint: null, pr_open: false, ...extra});
  assert.ok(validateRegistry(reg(impl('I1', 'x'), impl('I2', 'y')), {now}).some(e => e.startsWith('dual writer on branch:shared')));
  assert.ok(validateRegistry(reg(impl('I1', 'x', {branch: 'b1', pr: 9}), impl('I2', 'y', {branch: 'b2', pr: 9})), {now}).some(e => e.startsWith('dual writer on pr:9')));
  assert.throws(() => claim(reg(impl('I1', 'x'), impl('I2', null)), 'I2', {id: 'y', role: 'Development Agent'}, now), {code: 'CONFLICT_RESOURCE_LEASED'});
});

test('registry writes stay serialized: stale revision and foreign release are refused', () => {
  const registry = reg(task({latest_checkpoint: null, state: 'PLANNED'}));
  assert.throws(() => claim(registry, 'R-01', {id: 'x', role: 'Development Agent'}, NOW, {expectedRevision: 6}), {code: 'CONFLICT_REVISION'});
  const held = claim(registry, 'R-01', {id: 'x', role: 'Development Agent'}, NOW, {expectedRevision: 7});
  assert.equal(held.revision, 8);
  assert.throws(() => claim(held, 'R-01', {id: 'y', role: 'Development Agent'}, NOW), {code: 'CONFLICT_LEASE_ACTIVE'});
  assert.throws(() => release(held, 'R-01', 'y', 'CP-1', 'REVIEW'), {code: 'NOT_LEASE_HOLDER'});
  assert.throws(() => release(held, 'R-01', 'x', 'CP-1', 'REVIEW', {expectedRevision: 7}), {code: 'CONFLICT_REVISION'});
});

test('validate refuses a checkpoint that writes a resource its open task does not declare', () => {
  const cp = makeV3({resources: ['branch:feature', 'vps:host']});
  const decision = {id: 'MP-OWNER-R01-AUTH-20261018', date: '2026-10-18', decision: 'd', scope: 's', precedence: 'owner', references: ['r'], status: 'IN_FORCE'};
  const state = registryTasks => ({decisions: {states: ['IN_FORCE'], decisions: [decision]}, inventory: {requirements: [{id: 'MP-GOV-017'}]}, registry: reg(...registryTasks),
    checkpoints: [cp], errata: {schema_version: 'mp-checkpoint-errata-v1', entries: []}, history: null});
  assert.ok(validateState(state([task({latest_checkpoint: cp.id})]), {now: NOW}).some(e => e.includes('writes vps:host, not declared')));
  assert.deepEqual(validateState(state([task({latest_checkpoint: cp.id, resources: ['vps:host']})]), {now: NOW}), []);
});

// Edge cases of the review (M14, M28, M2).
test('claims pending verification cannot sit in a final or handoff state (M14), and handoff.to is validated (M28)', () => {
  const pending = {status: 'PENDING_VERIFICATION', from: 'agent-g', to: 'ANY', responsibilities: ['x'], claims: [{id: 'C1', resource: 'vps:host', statement: 's'}]};
  const passed = {gate_b: 'PASS', review: {verdict: 'APPROVED', reference: 'r', reviewed_sha: SHA_A}, merge_sha: 'd'.repeat(40)};
  for (const state of ['MERGED', 'CERTIFIED', 'COMPLETED']) {
    assert.ok(validateCheckpoint(makeV3({...passed, state, handoff: pending}), context).some(e => e.includes('PENDING_VERIFICATION cannot be')), state);
  }
  for (const to of ['', '   ', 5, true]) {
    assert.ok(validateCheckpoint(makeV3({handoff: {status: 'NONE', from: null, to, responsibilities: []}}), context).some(e => e.includes('handoff.to')), JSON.stringify(to));
  }
  assert.deepEqual(validateCheckpoint(makeV3({handoff: {status: 'NONE', from: null, to: 'ANY', responsibilities: []}}), context), []);
});

const go = (status, scope = {task: 'VPS-S3', resource: 'vps:host', action: 'install gate'}, extra = {}) => ({id: 'GO-S3', source: 'owner comment', status, scope, ...extra});
const ledger = (...entries) => entries.map((entry, i) => makeV3({id: `CP-20261018T20${String(i).padStart(2, '0')}00Z-agent-a`, timestamp_utc: `2026-10-18T20:${String(i).padStart(2, '0')}:00Z`, authorizations: [entry]}));
const request = {task: 'VPS-S3', resource: 'vps:host', action: 'install gate'};

test('a revoked GO stays revoked even if later recorded as consumed (M2)', () => {
  assert.match(checkAuthorization(ledger(go('VALID'), go('REVOKED'), go('CONSUMED', undefined, {consumed_by: 'x'})), 'GO-S3', request).problems[0], /^AUTHZ_REVOKED/);
});

// 4. Authorization scope.
test('an authorization scope must name task and action, without wildcards', () => {
  for (const scope of [{task: 'VPS-S3'}, {action: 'install gate'}, {mandate: 'M'}, {task: '*', action: 'install gate'}, {task: 'VPS-S3', action: 'any'}, {task: 'VPS-S3', action: 'install gate', resource: 'all'}]) {
    assert.ok(validateCheckpoint(makeV3({authorizations: [go('VALID', scope)]}), context).length > 0, JSON.stringify(scope));
  }
  assert.deepEqual(validateCheckpoint(makeV3({authorizations: [go('VALID')]}), context), []);
});

test('a GO cannot be reused for another task, resource or action, nor stretched to a key it does not bound', () => {
  const granted = ledger(go('VALID'));
  assert.equal(checkAuthorization(granted, 'GO-S3', request).ok, true);
  for (const change of [{task: 'VPS-S4'}, {resource: 'db:prod'}, {action: 'switch release'}]) {
    assert.match(checkAuthorization(granted, 'GO-S3', {...request, ...change}).problems[0], /^AUTHZ_SCOPE/, JSON.stringify(change));
  }
  assert.match(checkAuthorization(granted, 'GO-S3', {task: 'VPS-S3', resource: 'vps:host'}).problems[0], /^AUTHZ_REQUEST_INCOMPLETE/, 'no action named');
  assert.match(checkAuthorization(granted, 'GO-S3', {resource: 'vps:host', action: 'install gate'}).problems[0], /^AUTHZ_REQUEST_INCOMPLETE/, 'no task named');
  const noResource = ledger(go('VALID', {task: 'VPS-S3', action: 'install gate'}));
  assert.match(checkAuthorization(noResource, 'GO-S3', request).problems[0], /^AUTHZ_SCOPE_UNBOUNDED/, 'a GO without a resource is not a GO for any resource');
  assert.equal(checkAuthorization(noResource, 'GO-S3', {task: 'VPS-S3', action: 'install gate'}).ok, true);
});

test('an incomplete or ambiguous GO is never usable', () => {
  const partial = [{id: 'CP-x', authorizations: [go('VALID', {mandate: 'M'})]}];
  assert.match(checkAuthorization(partial, 'GO-S3', {...request, mandate: 'M'}).problems[0], /^AUTHZ_SCOPE_INCOMPLETE/);
  const twice = ledger(go('VALID'), go('VALID', {task: 'VPS-S3', resource: 'vps:other', action: 'install gate'}));
  assert.match(checkAuthorization(twice, 'GO-S3', request).problems[0], /^AUTHZ_AMBIGUOUS/);
  assert.equal(checkAuthorization(ledger(go('VALID'), go('VALID')), 'GO-S3', request).ok, true, 'the same scope twice is not ambiguous');
});

test('authz-check validates the repository state before using any checkpoint', t => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-authz-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  for (const path of ['tools', 'docs/governance']) { mkdirSync(join(dir, path, '..'), {recursive: true}); cpSync(join(root, path), join(dir, path), {recursive: true}); }
  const run = () => spawnSync(process.execPath, ['tools/governance/cli.mjs', 'authz-check', 'MP-GITHUB-RECON-IMPLEMENTATION-01', '--task', 'GOV-RECON-01', '--action', 'one governance PR and issue comments, no merge'], {cwd: dir, encoding: 'utf8'});
  const before = run();
  assert.equal(before.status, 0, before.stdout + before.stderr);
  const file = join(dir, 'docs/governance/work-registry.json');
  const registry = JSON.parse(readFileSync(file, 'utf8'));
  registry.tasks.push({...registry.tasks.at(-1)});
  writeFileSync(file, JSON.stringify(registry));
  const after = run();
  assert.equal(after.status, 2);
  assert.match(after.stdout, /"REFUSED"/);
  assert.match(after.stdout, /VALIDATION: task id missing or duplicated/);
});
