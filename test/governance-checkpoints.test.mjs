import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {commentMarker, loadCheckpoints, planComment, reconcile, resolveLatest, validateCheckpoint, validateEvidence, writeCheckpoint} from '../tools/governance/checkpoints.mjs';
import {realityFor} from '../tools/governance/git.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_T = 'b'.repeat(40);

export function makeCheckpoint(overrides = {}) {
  return {
    schema_version: 'mp-checkpoint-v1',
    id: 'CP-20261018T200000Z-agent-a',
    timestamp_utc: '2026-10-18T20:00:00Z',
    agent: {id: 'agent-a', role: 'Development Agent'},
    activity: 'implement checkpoint library',
    task: 'R-01',
    repository: 'zarbopiero963-droid/MatchPilot',
    issue: 150,
    pr: null,
    branch: 'feature',
    commit_sha: SHA_A,
    tree_sha: SHA_T,
    requirements: ['MP-GOV-017'],
    changes: ['tools/governance/checkpoints.mjs'],
    tests: [{command: 'node --test', result: 'PASS', environment: 'local node 22', commit: SHA_A, time: '2026-10-18T19:59:00Z', limits: []}],
    ci: {run_id: null, conclusion: 'NOT_RUN'},
    gate_a: 'PASS',
    gate_b: 'NOT_VERIFIED',
    review: {verdict: 'NOT REQUESTED', reference: null},
    findings: [],
    owner_decisions: ['MP-OWNER-R01-AUTH-20261018'],
    dependencies: [],
    state: 'RUNNING',
    next_action: 'write registry tests',
    resume_conditions: ['branch head equals commit_sha'],
    supersedes: null,
    ...overrides,
  };
}

const context = {decisionIds: new Set(['MP-OWNER-R01-AUTH-20261018']), requirementIds: new Set(['MP-GOV-017']), taskIds: new Set(['R-01'])};

test('a complete checkpoint validates and every mandatory field is enforced', () => {
  assert.deepEqual(validateCheckpoint(makeCheckpoint(), context), []);
  for (const key of ['activity', 'task', 'branch', 'next_action', 'commit_sha', 'tree_sha', 'issue', 'state', 'requirements', 'tests']) {
    const cp = makeCheckpoint();
    delete cp[key];
    assert.ok(validateCheckpoint(cp, context).length > 0, `missing ${key} accepted`);
  }
  assert.ok(validateCheckpoint(makeCheckpoint({state: 'DONE'}), context).some(e => e.includes('invalid state')));
  assert.ok(validateCheckpoint(makeCheckpoint({agent: {id: 'x', role: 'Wizard'}}), context).some(e => e.includes('admitted role')));
  assert.ok(validateCheckpoint(makeCheckpoint({id: 'CP-20261018T200001Z-agent-a'}), context).some(e => e.includes('id timestamp')));
  assert.ok(validateCheckpoint(makeCheckpoint({task: 'R-99'}), context).some(e => e.includes('unknown task')));
});

test('checkpoints are cross-checked against owner decisions and requirements', () => {
  assert.ok(validateCheckpoint(makeCheckpoint({owner_decisions: ['INVENTED-DECISION']}), context).some(e => e.includes('unknown owner decision')));
  assert.ok(validateCheckpoint(makeCheckpoint({requirements: ['MP-XXX-999']}), context).some(e => e.includes('unknown requirement')));
});

test('terminal states require gates, APPROVED review and no open blocking finding', () => {
  const merged = makeCheckpoint({state: 'MERGED', gate_b: 'PASS', review: {verdict: 'APPROVED', reference: 'https://example.invalid/review'}});
  assert.deepEqual(validateCheckpoint(merged, context), []);
  assert.ok(validateCheckpoint({...merged, review: {verdict: 'NOT VERIFIED', reference: null}}, context).some(e => e.includes('APPROVED')));
  assert.ok(validateCheckpoint({...merged, gate_b: 'NOT_VERIFIED'}, context).some(e => e.includes('Gate B')));
  assert.ok(validateCheckpoint({...merged, findings: [{id: 'F1', severity: 'BLOCKING', status: 'OPEN', summary: 'x'}]}, context).some(e => e.includes('blocking')));
  assert.ok(validateCheckpoint(makeCheckpoint({state: 'HANDOFF READY', resume_conditions: []}), context).some(e => e.includes('resume_conditions')));
});

test('Gate B evidence records carry command, result, environment, commit, time and limits (MP-QAC-010)', () => {
  const ok = {command: 'npm test', result: 'PASS', environment: 'CI ubuntu-latest', commit: SHA_A, time: '2026-10-18T19:00:00Z', limits: ['PG17 only in CI']};
  assert.deepEqual(validateEvidence(ok), []);
  assert.ok(validateEvidence({...ok, result: 'GREEN'}).some(e => e.includes('invalid result')));
  assert.ok(validateEvidence({...ok, commit: 'abc'}).some(e => e.includes('commit')));
  assert.ok(validateEvidence({...ok, limits: undefined}).some(e => e.includes('limits')));
  assert.ok(validateEvidence({...ok, time: '18/10/2026'}).some(e => e.includes('time')));
  assert.ok(validateEvidence({...ok, dataset_hash: 'xyz'}).some(e => e.includes('dataset_hash')));
});

test('secret-like values are rejected anywhere in a checkpoint', () => {
  const token = 'gh' + 'p_' + 'Z'.repeat(36);
  assert.ok(validateCheckpoint(makeCheckpoint({activity: `push with ${token}`}), context).some(e => e.includes('secret')));
  assert.ok(validateCheckpoint(makeCheckpoint({extra: {api_key: 'abc'}}), context).some(e => e.includes('secret')));
  const url = 'postgres://user:' + 'pw' + '@db.example.com/x';
  assert.ok(validateCheckpoint(makeCheckpoint({changes: [url]}), context).some(e => e.includes('secret')));
  assert.deepEqual(validateCheckpoint(makeCheckpoint({changes: ['postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/x']}), context), []);
});

test('the latest valid checkpoint is the single head of the supersedes chain', () => {
  const a = makeCheckpoint();
  const b = makeCheckpoint({id: 'CP-20261018T210000Z-agent-a', timestamp_utc: '2026-10-18T21:00:00Z', supersedes: a.id, state: 'HANDOFF READY'});
  const c = makeCheckpoint({id: 'CP-20261018T220000Z-agent-b', timestamp_utc: '2026-10-18T22:00:00Z', supersedes: b.id, agent: {id: 'agent-b', role: 'Development Agent'}});
  assert.equal(resolveLatest([c, a, b], 'R-01').latest.id, c.id);
  assert.deepEqual(resolveLatest([c, a, b], 'R-01').conflicts, []);
  const fork = makeCheckpoint({id: 'CP-20261018T221000Z-agent-c', timestamp_utc: '2026-10-18T22:10:00Z', supersedes: b.id, agent: {id: 'agent-c', role: 'Test Agent'}});
  assert.ok(resolveLatest([a, b, c, fork], 'R-01').conflicts.some(e => e.startsWith('fork after')));
  const backwards = makeCheckpoint({id: 'CP-20261018T190000Z-agent-b', timestamp_utc: '2026-10-18T19:00:00Z', supersedes: a.id});
  assert.ok(resolveLatest([a, backwards], 'R-01').conflicts.some(e => e.includes('not newer')));
  const orphanRoot = makeCheckpoint({id: 'CP-20261018T230000Z-agent-x', timestamp_utc: '2026-10-18T23:00:00Z'});
  assert.ok(resolveLatest([a, orphanRoot], 'R-01').conflicts.some(e => e.includes('multiple roots')));
  assert.equal(resolveLatest([a], 'R-02').latest, null);
});

function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mp-governance-git-'));
  const git = (...args) => execFileSync('git', args, {cwd: dir, encoding: 'utf8'}).trim();
  git('init', '-q', '-b', 'feature');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'test');
  git('config', 'commit.gpgsign', 'false');
  const commit = (file, content, message) => {
    mkdirSync(join(dir, file, '..'), {recursive: true});
    writeFileSync(join(dir, file), content);
    git('add', '.');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  return {dir, git, commit, cleanup: () => rmSync(dir, {recursive: true, force: true})};
}

test('reconciliation against a real git repository detects SHA mismatch and unreconciled work', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  const work = repo.commit('src/a.mjs', 'export const a = 1;\n', 'work');
  const tree = repo.git('rev-parse', `${work}^{tree}`);
  const cp = makeCheckpoint({branch: 'feature', commit_sha: work, tree_sha: tree, timestamp_utc: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')});
  cp.id = `CP-${cp.timestamp_utc.replace(/[-:]/g, '')}-agent-a`;

  assert.deepEqual(reconcile(cp, realityFor(repo.dir, cp)), [], 'head equals checkpoint');

  repo.commit('docs/governance/checkpoints/CP-x.json', '{}\n', 'checkpoint only');
  repo.commit('docs/governance/work-registry.json', '{}\n', 'registry only');
  assert.deepEqual(reconcile(cp, realityFor(repo.dir, cp)), [], 'bookkeeping-only commits are reconciled');

  repo.commit('docs/governance/checkpoints/CP-x.json', '{"rewritten": true}\n', 'rewrite an existing checkpoint');
  assert.deepEqual(reconcile(cp, realityFor(repo.dir, cp)).map(d => d.code), ['UNRECONCILED_COMMITS'], 'modifying an existing checkpoint is not bookkeeping');

  repo.commit('src/a.mjs', 'export const a = 2;\n', 'unrecorded work');
  assert.deepEqual(reconcile(cp, realityFor(repo.dir, cp)).map(d => d.code), ['UNRECONCILED_COMMITS']);

  repo.git('checkout', '-q', '--orphan', 'rewritten');
  repo.commit('src/a.mjs', 'export const a = 3;\n', 'rewritten history');
  repo.git('branch', '-f', 'feature', 'rewritten');
  assert.deepEqual(reconcile(cp, realityFor(repo.dir, cp)).map(d => d.code), ['SHA_MISMATCH']);

  assert.deepEqual(reconcile({...cp, branch: 'missing'}, realityFor(repo.dir, {...cp, branch: 'missing'})).map(d => d.code), ['BRANCH_MISSING']);
});

test('reconciliation flags tree mismatch, stale active state and merges that did not happen', () => {
  const now = new Date('2026-10-20T00:00:00Z');
  const cp = makeCheckpoint();
  assert.deepEqual(reconcile(cp, {branchHead: SHA_A, treeSha: 'c'.repeat(40)}, {now: new Date('2026-10-18T20:10:00Z')}).map(d => d.code), ['TREE_MISMATCH']);
  assert.deepEqual(reconcile(cp, {branchHead: SHA_A, treeSha: SHA_T}, {now}).map(d => d.code), ['STALE']);
  assert.deepEqual(reconcile({...cp, state: 'HANDOFF READY'}, {branchHead: SHA_A, treeSha: SHA_T}, {now}), []);
  assert.deepEqual(reconcile({...cp, state: 'MERGED'}, {branchHead: SHA_A, treeSha: SHA_T, prState: 'open'}, {now}).map(d => d.code), ['MERGE_NOT_REAL']);
  assert.deepEqual(reconcile({...cp, state: 'HANDOFF READY'}, {branchHead: SHA_A, treeSha: SHA_T, prState: 'merged'}, {now}).map(d => d.code), ['PR_ALREADY_MERGED']);
});

test('checkpoint persistence and comment publication are idempotent', t => {
  const dir = mkdtempSync(join(tmpdir(), 'mp-checkpoints-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const cp = makeCheckpoint();
  assert.equal(writeCheckpoint(dir, cp), 'created');
  assert.equal(writeCheckpoint(dir, cp), 'unchanged');
  assert.throws(() => writeCheckpoint(dir, {...cp, next_action: 'something else'}), /different content/);
  assert.deepEqual(loadCheckpoints(dir), [cp]);
  writeFileSync(join(dir, 'CP-20261018T000000Z-wrong.json'), JSON.stringify(cp));
  assert.throws(() => loadCheckpoints(dir), /does not match id/);
  assert.equal(planComment(['hello', `body ${commentMarker(cp.id)}`], cp.id), 'skip');
  assert.equal(planComment(['hello'], cp.id), 'post');
});
