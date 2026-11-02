import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {commentMarker, errataMap, loadCheckpoints, planComment, reconcile, resolveLatest, validateCheckpoint, validateErrata, validateEvidence, validateHistory, writeCheckpoint} from '../tools/governance/checkpoints.mjs';
import {checkpointHistory, realityFor, rewrittenCheckpoints, rewrittenWithdrawals} from '../tools/governance/git.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_T = 'b'.repeat(40);
const SHA_B = 'c'.repeat(40);

export function makeCheckpoint(overrides = {}) {
  return {
    schema_version: 'mp-checkpoint-v2',
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
  const merged = makeCheckpoint({state: 'MERGED', gate_b: 'PASS', review: {verdict: 'APPROVED', reference: 'https://example.invalid/review', reviewed_sha: SHA_A}});
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

test('a checkpoint dated after its validation, or with test times after itself, is refused (PR #162 NB-9)', () => {
  const cp = makeCheckpoint();
  const now = new Date('2026-10-18T20:05:00Z');
  assert.deepEqual(validateCheckpoint(cp, {now}), []);
  assert.deepEqual(validateCheckpoint(cp, {now: new Date('2026-10-18T19:51:00Z')}), [], 'within the 10 minute clock tolerance');
  assert.ok(validateCheckpoint(cp, {now: new Date('2026-10-18T19:49:00Z')}).some(e => e.includes('in the future')));
  const late = makeCheckpoint({tests: [{...cp.tests[0], time: '2026-10-18T20:01:00Z'}]});
  assert.ok(validateCheckpoint(late, {now}).some(e => e.includes('tests[0] time is later than the checkpoint')));
  // An erratum accepts the recorded (wrong) time instead of rewriting an append-only file.
  const errata = errataMap({entries: [{id: cp.id, not_after_utc: '2026-10-18T19:40:00Z'}]});
  assert.deepEqual(validateCheckpoint(cp, {now: new Date('2026-10-18T19:45:00Z'), errata}), []);
});

test('errata bound a wrong checkpoint time with a real commit time and keep the chain resolvable', () => {
  const a = makeCheckpoint();
  const b = makeCheckpoint({id: 'CP-20261018T230000Z-agent-a', timestamp_utc: '2026-10-18T23:00:00Z', supersedes: a.id});
  const good = {schema_version: 'mp-checkpoint-errata-v1', entries: [
    {id: a.id, recorded_timestamp_utc: a.timestamp_utc, not_after_utc: '2026-10-18T19:00:00Z', basis_commit: SHA_A},
    {id: b.id, recorded_timestamp_utc: b.timestamp_utc, not_after_utc: '2026-10-18T19:00:00Z', basis_commit: SHA_A},
  ]};
  assert.deepEqual(validateErrata(good, [a, b]), []);
  const bad = entry => validateErrata({schema_version: 'mp-checkpoint-errata-v1', entries: [{...good.entries[0], ...entry}]}, [a, b]);
  assert.ok(bad({id: 'CP-20261018T000000Z-x'}).some(e => e.includes('unknown checkpoint')));
  assert.ok(bad({recorded_timestamp_utc: '2026-10-18T20:00:01Z'}).some(e => e.includes('differs')));
  assert.ok(bad({not_after_utc: '2026-10-18T20:00:00Z'}).some(e => e.includes('earlier than the recorded time')));
  assert.ok(bad({basis_commit: 'abc'}).some(e => e.includes('full SHA')));
  assert.ok(validateErrata({schema_version: 'x', entries: []}, []).some(e => e.includes('schema_version')));
  assert.ok(validateErrata({...good, entries: [...good.entries, good.entries[0]]}, [a, b]).some(e => e.includes('duplicated')));

  const errata = errataMap(good);
  // Both under an erratum with the same bound: the recorded order is kept.
  assert.deepEqual(resolveLatest([a, b], 'R-01', {errata}).conflicts, []);
  // A correctly dated successor of a future-dated checkpoint: without the erratum it looks older, with it the chain holds.
  const real = makeCheckpoint({id: 'CP-20261018T193000Z-agent-a', timestamp_utc: '2026-10-18T19:30:00Z', supersedes: b.id});
  assert.ok(resolveLatest([a, b, real], 'R-01').conflicts.some(e => e.includes('not newer')));
  assert.deepEqual(resolveLatest([a, b, real], 'R-01', {errata}).conflicts, []);
  assert.equal(resolveLatest([a, b, real], 'R-01', {errata}).latest.id, real.id);
  // A successor dated before the bound is still refused.
  const early = makeCheckpoint({id: 'CP-20261018T185000Z-agent-a', timestamp_utc: '2026-10-18T18:50:00Z', supersedes: b.id});
  assert.ok(resolveLatest([a, b, early], 'R-01', {errata}).conflicts.some(e => e.includes('not newer')));
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

test('schema v2 binds reviews and CI runs to the commit they covered (#151 review R-2)', () => {
  const ts = '2026-10-18T22:00:00Z';
  const v2 = makeCheckpoint({schema_version: 'mp-checkpoint-v2', id: 'CP-20261018T220000Z-agent-a', timestamp_utc: ts});
  assert.deepEqual(validateCheckpoint(v2, context), []);
  assert.ok(validateCheckpoint({...v2, review: {verdict: 'APPROVED', reference: 'x'}}, context).some(e => e.includes('reviewed_sha')));
  assert.ok(validateCheckpoint({...v2, ci: {run_id: 1, conclusion: 'SUCCESS'}}, context).some(e => e.includes('ci.head_sha')));
  assert.deepEqual(validateCheckpoint({...v2, ci: {run_id: 1, conclusion: 'SUCCESS', head_sha: SHA_A}}, context), []);
  const merged = {...v2, state: 'MERGED', gate_b: 'PASS', review: {verdict: 'APPROVED', reference: 'x', reviewed_sha: 'c'.repeat(40)}};
  assert.ok(validateCheckpoint(merged, context).some(e => e.includes('review covers')));
  assert.deepEqual(validateCheckpoint({...merged, review: {...merged.review, reviewed_sha: SHA_A}}, context), []);
  assert.ok(validateCheckpoint({...v2, schema_version: 'mp-checkpoint-v1'}, context).some(e => e.includes('schema_version')), 'v1 is legacy-only');
});

test('a merge commit that rewrites an existing checkpoint is detected (#151 review R-1)', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  const base = repo.commit('docs/governance/checkpoints/CP-a.json', '{"original": true}\n', 'checkpoint');
  repo.git('checkout', '-q', '-b', 'side');
  repo.commit('src/b.mjs', 'export const b = 1;\n', 'side work');
  repo.git('checkout', '-q', 'feature');
  repo.commit('src/c.mjs', 'export const c = 1;\n', 'main work');
  repo.git('merge', '-q', '--no-ff', '--no-commit', 'side');
  writeFileSync(join(repo.dir, 'docs/governance/checkpoints/CP-a.json'), '{"rewritten": true}\n');
  repo.git('add', '.');
  repo.git('commit', '-q', '-m', 'evil merge');
  const head = repo.git('rev-parse', 'HEAD');
  const plainLog = repo.git('log', '--name-status', '--format=', `${base}..${head}`);
  assert.ok(!plainLog.includes('CP-a.json'), 'precondition: a plain git log hides the merge rewrite');
  assert.deepEqual(rewrittenCheckpoints(repo.dir, base, head).map(c => c.file), ['docs/governance/checkpoints/CP-a.json', 'docs/governance/checkpoints/CP-a.json']);
  const clean = repo.commit('docs/governance/checkpoints/CP-b.json', '{}\n', 'append only');
  assert.deepEqual(rewrittenCheckpoints(repo.dir, head, clean), []);
});

test('a checkpoint added on a side branch and rewritten in the merge is detected; an unchanged one is not (#152 review N-2)', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  const base = repo.commit('README.md', 'base\n', 'base');
  repo.git('checkout', '-q', '-b', 'side');
  repo.commit('docs/governance/checkpoints/CP-side.json', '{"original": true}\n', 'side adds checkpoint');
  repo.commit('docs/governance/checkpoints/CP-keep.json', '{"keep": true}\n', 'side adds second checkpoint');
  repo.git('checkout', '-q', 'feature');
  repo.commit('src/c.mjs', 'export const c = 1;\n', 'main work');
  repo.git('merge', '-q', '--no-ff', '--no-commit', 'side');
  writeFileSync(join(repo.dir, 'docs/governance/checkpoints/CP-side.json'), '{"rewritten": true}\n');
  repo.git('add', '.');
  repo.git('commit', '-q', '-m', 'evil merge');
  const files = rewrittenCheckpoints(repo.dir, base, repo.git('rev-parse', 'HEAD')).map(c => c.file);
  assert.ok(files.includes('docs/governance/checkpoints/CP-side.json'));
  assert.ok(!files.includes('docs/governance/checkpoints/CP-keep.json'), 'an unchanged checkpoint merged from a side branch is append-only');
});

test('a new v1 checkpoint cannot dodge v2 by backdating (#152 review N-3)', () => {
  const backdated = makeCheckpoint({schema_version: 'mp-checkpoint-v1', id: 'CP-20261018T190000Z-agent-x', timestamp_utc: '2026-10-18T19:00:00Z'});
  assert.ok(validateCheckpoint(backdated, context).some(e => e.includes('schema_version')));
});

test('errata and checkpoint times are checked against the real git history (PR #162 NB-10, NB-11)', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  // Commit a checkpoint file at a chosen author time.
  const at = (time, file, message) => {
    mkdirSync(join(repo.dir, file, '..'), {recursive: true});
    writeFileSync(join(repo.dir, file), '{}\n');
    repo.git('add', '.');
    execFileSync('git', ['commit', '-q', '-m', message], {cwd: repo.dir, env: {...process.env, GIT_AUTHOR_DATE: time, GIT_COMMITTER_DATE: time}});
    return repo.git('rev-parse', 'HEAD');
  };
  const dir = 'docs/governance/checkpoints';
  const honest = makeCheckpoint({id: 'CP-20261018T200000Z-agent-a', timestamp_utc: '2026-10-18T20:00:00Z'});
  const future = makeCheckpoint({id: 'CP-20261018T230000Z-agent-a', timestamp_utc: '2026-10-18T23:00:00Z'});
  const honestSha = at('2026-10-18T20:05:00Z', `${dir}/${honest.id}.json`, 'honest');
  const futureSha = at('2026-10-18T20:30:00Z', `${dir}/${future.id}.json`, 'future');
  const history = checkpointHistory(repo.dir);
  assert.equal(history.firstAdded.get(future.id).sha, futureSha);
  const now = new Date('2026-10-19T12:00:00Z');

  // NB-11: dated 2.5 hours after the commit that added it; re-validating later does not hide it.
  assert.ok(validateHistory([honest, future], {entries: []}, history, {now}).some(e => e.includes(`${future.id} timestamp_utc is later than ${futureSha}`)));
  assert.deepEqual(validateHistory([honest], {entries: []}, history, {now}), []);

  // A true erratum: bound = author time of the commit that added the file.
  const good = {id: future.id, recorded_timestamp_utc: future.timestamp_utc, not_after_utc: '2026-10-18T20:30:00Z', basis_commit: futureSha};
  assert.deepEqual(validateHistory([honest, future], {entries: [good]}, history, {now}), []);
  // NB-10: a made-up basis commit (absent) with a bound later than the real commit is refused.
  const fake = {...good, not_after_utc: '2026-10-18T22:00:00Z', basis_commit: 'f'.repeat(40)};
  assert.ok(validateHistory([honest, future], {entries: [fake]}, history, {now}).some(e => e.includes('later than')));
  // A present basis commit that does not add the checkpoint, or whose time differs, is refused.
  assert.ok(validateHistory([honest, future], {entries: [{...good, basis_commit: honestSha, not_after_utc: '2026-10-18T20:05:00Z'}]}, history, {now})
    .some(e => e.includes('does not add the checkpoint')));
  assert.ok(validateHistory([honest, future], {entries: [{...good, not_after_utc: '2026-10-18T20:29:00Z'}]}, history, {now})
    .some(e => e.includes('differs from the author time')));
  // An erratum for a checkpoint no commit added, and a bound in the future, are refused.
  assert.ok(validateHistory([honest, future], {entries: [{...good, id: 'CP-20261018T210000Z-agent-a'}]}, history, {now}).some(e => e.includes('no commit has added')));
  assert.ok(validateHistory([], {entries: [{...good, not_after_utc: '2026-10-20T00:00:00Z'}]}, null, {now}).some(e => e.includes('in the future')));
  // An amend keeps the author time but moves the committer time: an honest checkpoint added that way passes (PR #163 NB-5).
  const amended = makeCheckpoint({id: 'CP-20261018T201000Z-agent-a', timestamp_utc: '2026-10-18T20:10:00Z'});
  mkdirSync(join(repo.dir, dir), {recursive: true});
  writeFileSync(join(repo.dir, `${dir}/${amended.id}.json`), '{}\n');
  repo.git('add', '.');
  execFileSync('git', ['commit', '-q', '-m', 'amended'], {cwd: repo.dir, env: {...process.env, GIT_AUTHOR_DATE: '2026-10-18T19:00:00Z', GIT_COMMITTER_DATE: '2026-10-18T20:12:00Z'}});
  assert.deepEqual(validateHistory([honest, amended], {entries: []}, checkpointHistory(repo.dir), {now}), []);
  // Without git history only the clock check applies.
  assert.deepEqual(validateHistory([honest, future], {entries: [good]}, null, {now}), []);
});

test('MP-CP-WITHDRAW-01: a propagated checkpoint replaced by a corrected sibling can be withdrawn, under strict conditions', () => {
  const a = makeCheckpoint();
  const old = makeCheckpoint({id: 'CP-20261018T210000Z-agent-a', timestamp_utc: '2026-10-18T21:00:00Z', supersedes: a.id});
  const fixed = makeCheckpoint({id: 'CP-20261018T211000Z-agent-a', timestamp_utc: '2026-10-18T21:10:00Z', supersedes: a.id});
  // without a withdrawal the two siblings are a fork
  assert.ok(resolveLatest([a, old, fixed], 'R-01').conflicts.some(e => e.startsWith('fork after')));
  const file = {schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn: [{id: old.id, replaced_by: fixed.id, reason: 'review attribution corrected in a sibling', reference: 'PR #301'}]};
  assert.deepEqual(validateErrata(file, [a, old, fixed]), []);
  const errata = errataMap(file);
  assert.deepEqual(resolveLatest([a, old, fixed], 'R-01', {errata}).conflicts, []);
  assert.equal(resolveLatest([a, old, fixed], 'R-01', {errata}).latest.id, fixed.id);
  const bad = patch => validateErrata({...file, withdrawn: [{...file.withdrawn[0], ...patch}]}, [a, old, fixed]);
  assert.ok(bad({id: 'CP-20261018T000000Z-x'}).some(e => e.includes('unknown checkpoint')));
  assert.ok(bad({replaced_by: 'CP-20261018T000000Z-x'}).some(e => e.includes('not a known checkpoint')));
  assert.ok(bad({replaced_by: old.id}).some(e => e.includes('cannot replace itself')));
  assert.ok(bad({reason: 'x'}).some(e => e.includes('needs a reason')));
  assert.ok(bad({reference: ''}).some(e => e.includes('needs a reference')));
  // the replacement must be a sibling (same parent, same task)
  const other = makeCheckpoint({id: 'CP-20261018T212000Z-agent-a', timestamp_utc: '2026-10-18T21:20:00Z', supersedes: old.id});
  assert.ok(validateErrata({...file, withdrawn: [{...file.withdrawn[0], replaced_by: other.id}]}, [a, old, fixed, other]).some(e => e.includes('same parent')));
  // a checkpoint that already has successors cannot be withdrawn
  assert.ok(validateErrata(file, [a, old, fixed, other]).some(e => e.includes('has successors')));
  const foreign = makeCheckpoint({id: 'CP-20261018T213000Z-agent-a', timestamp_utc: '2026-10-18T21:30:00Z', supersedes: a.id, task: 'R-02'});
  assert.ok(validateErrata({...file, withdrawn: [{...file.withdrawn[0], replaced_by: foreign.id}]}, [a, old, fixed, foreign]).some(e => e.includes('another task')));
  assert.ok(validateErrata({...file, withdrawn: [file.withdrawn[0], file.withdrawn[0]]}, [a, old, fixed]).some(e => e.includes('duplicated')));
  // two roots are not siblings: withdrawing one root to hide "multiple roots" is refused (PR #302 review)
  const root2 = makeCheckpoint({id: 'CP-20261018T214000Z-agent-a', timestamp_utc: '2026-10-18T21:40:00Z', supersedes: null});
  const rootFile = {...file, withdrawn: [{...file.withdrawn[0], id: a.id, replaced_by: root2.id}]};
  assert.ok(validateErrata(rootFile, [a, root2]).some(e => e.includes('common parent')));
  assert.ok(validateErrata({...file, withdrawn: [{...file.withdrawn[0], replaced_by: root2.id}]}, [a, old, root2]).some(e => e.includes('common parent')));
});

test('MP-CP-WITHDRAW-01 anti-bypass: circular, double and orphaning withdrawals are refused; a withdrawn checkpoint is still validated', () => {
  const a = makeCheckpoint();
  const x = makeCheckpoint({id: 'CP-20261018T210000Z-agent-a', timestamp_utc: '2026-10-18T21:00:00Z', supersedes: a.id});
  const y = makeCheckpoint({id: 'CP-20261018T211000Z-agent-a', timestamp_utc: '2026-10-18T21:10:00Z', supersedes: a.id});
  const entry = (id, by) => ({id, replaced_by: by, reason: 'sibling replaced after a propagated correction', reference: 'PR #302'});
  const file = withdrawn => ({schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn});
  // circular: each one withdrawn in favour of the other leaves no active checkpoint
  const circular = validateErrata(file([entry(x.id, y.id), entry(y.id, x.id)]), [a, x, y]);
  assert.ok(circular.filter(e => e.includes('replacement is itself withdrawn')).length === 2);
  // withdrawing a checkpoint that is not part of a fork (no sibling with the same parent) is refused
  const lone = makeCheckpoint({id: 'CP-20261018T212000Z-agent-a', timestamp_utc: '2026-10-18T21:20:00Z', supersedes: x.id});
  assert.ok(validateErrata(file([entry(lone.id, y.id)]), [a, x, y, lone]).some(e => e.includes('same parent')));
  // the parent of the fork (it has successors) cannot be withdrawn
  const parentErrors = validateErrata(file([entry(a.id, y.id)]), [a, x, y]);
  assert.ok(parentErrors.some(e => e.includes('common parent')));
  assert.ok(parentErrors.some(e => e.includes('has successors')));
  // withdrawing never makes an invalid checkpoint acceptable: validateCheckpoint still runs on every file
  const forged = makeCheckpoint({id: 'CP-20261018T213000Z-agent-a', timestamp_utc: '2026-10-18T21:30:00Z', supersedes: a.id, state: 'MERGED', review: {verdict: 'APPROVED', reviewed_sha: 'f'.repeat(40), reference: 'x'}});
  assert.ok(validateCheckpoint(forged, {}).some(e => e.includes('review covers')));
  // after a valid withdrawal the chain head is the replacement, never the withdrawn one
  const errata = errataMap(file([entry(x.id, y.id)]));
  const {latest, conflicts} = resolveLatest([a, x, y], 'R-01', {errata});
  assert.deepEqual(conflicts, []);
  assert.equal(latest.id, y.id);
  assert.notEqual(latest.id, x.id);
});

test('MP-CP-WITHDRAW-01 anti-bypass: a withdrawal cannot choose between two different outcomes of a task (PR #302 review)', () => {
  const a = makeCheckpoint();
  const blocked = makeCheckpoint({id: 'CP-20261018T210000Z-agent-a', timestamp_utc: '2026-10-18T21:00:00Z', supersedes: a.id, state: 'BLOCKED', findings: [{id: 'F-1', severity: 'P1', status: 'OPEN', blocking: true}]});
  const running = makeCheckpoint({id: 'CP-20261018T211000Z-agent-a', timestamp_utc: '2026-10-18T21:10:00Z', supersedes: a.id, commit_sha: SHA_B});
  const entry = {id: blocked.id, replaced_by: running.id, reason: 'hide a blocking sibling behind a withdrawal', reference: 'unverified'};
  const file = {schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn: [entry]};
  const errors = validateErrata(file, [a, blocked, running]);
  assert.ok(errors.some(e => e.includes('different work') && e.includes('commit_sha') && e.includes('state')));
  for (const [key, value] of [['pr', 999], ['branch', 'other'], ['tree_sha', SHA_B], ['base_sha', SHA_B], ['state', 'BLOCKED'], ['merge_sha', SHA_B]]) {
    const sibling = makeCheckpoint({id: 'CP-20261018T212000Z-agent-a', timestamp_utc: '2026-10-18T21:20:00Z', supersedes: a.id, [key]: value});
    const twin = makeCheckpoint({id: 'CP-20261018T213000Z-agent-a', timestamp_utc: '2026-10-18T21:30:00Z', supersedes: a.id});
    const f = {...file, withdrawn: [{...entry, id: sibling.id, replaced_by: twin.id}]};
    assert.ok(validateErrata(f, [a, sibling, twin]).some(e => e.includes('different work') && e.includes(key)), key);
  }
});

test('MP-CP-WITHDRAW-01 anti-bypass (PR #302 peer review): malformed lists, authorizations, unvalidated withdrawals, three siblings', () => {
  const a = makeCheckpoint();
  const x = makeCheckpoint({id: 'CP-20261018T210000Z-agent-a', timestamp_utc: '2026-10-18T21:00:00Z', supersedes: a.id});
  const y = makeCheckpoint({id: 'CP-20261018T211000Z-agent-a', timestamp_utc: '2026-10-18T21:10:00Z', supersedes: a.id});
  const z = makeCheckpoint({id: 'CP-20261018T212000Z-agent-a', timestamp_utc: '2026-10-18T21:20:00Z', supersedes: a.id});
  const entry = (id, by) => ({id, replaced_by: by, reason: 'sibling replaced after a propagated correction', reference: 'PR #302'});
  const file = withdrawn => ({schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn});
  // F6: malformed shapes are validation errors, never exceptions, and errataMap ignores them
  assert.deepEqual(validateErrata(file({id: x.id}), [a, x, y]), ['checkpoint errata withdrawn must be a list']);
  assert.deepEqual(validateErrata(file('x'), [a, x, y]), ['checkpoint errata withdrawn must be a list']);
  assert.ok(validateErrata(file([null]), [a, x, y]).some(e => e.includes('must be an object')));
  assert.ok(validateErrata(file(['x']), [a, x, y]).some(e => e.includes('must be an object')));
  for (const bad of [{id: x.id}, 'x', [null], ['x']]) assert.equal(errataMap(file(bad)).withdrawn.size, 0);
  // F3: a checkpoint that records an authorization cannot be withdrawn
  const authorized = {...x, authorizations: [{id: 'GO-1', status: 'VALID', scope: {task: 'R-01', action: 'merge'}}]};
  assert.ok(validateErrata(file([entry(x.id, y.id)]), [a, authorized, y]).some(e => e.includes('records authorizations')));
  // F7: resolveLatest never falls back silently to the parent when the withdrawal has no active sibling
  const lone = makeCheckpoint({id: 'CP-20261018T213000Z-agent-a', timestamp_utc: '2026-10-18T21:30:00Z', supersedes: a.id});
  const silent = resolveLatest([a, lone], 'R-01', {errata: errataMap(file([entry(lone.id, 'CP-20261018T000000Z-x')]))});
  assert.ok(silent.conflicts.some(e => e.includes('has no active sibling')));
  const both = resolveLatest([a, x, y], 'R-01', {errata: errataMap(file([entry(x.id, y.id), entry(y.id, x.id)]))});
  assert.ok(both.conflicts.filter(e => e.includes('has no active sibling')).length === 2);
  // three siblings: withdrawing one leaves a fork, withdrawing two in favour of the third resolves it
  assert.ok(resolveLatest([a, x, y, z], 'R-01', {errata: errataMap(file([entry(x.id, z.id)]))}).conflicts.some(e => e.startsWith('fork after')));
  const two = file([entry(x.id, z.id), entry(y.id, z.id)]);
  assert.deepEqual(validateErrata(two, [a, x, y, z]), []);
  const resolved = resolveLatest([a, x, y, z], 'R-01', {errata: errataMap(two)});
  assert.deepEqual(resolved.conflicts, []);
  assert.equal(resolved.latest.id, z.id);
});

test('MP-CP-WITHDRAW-01: withdrawals are append-only, a later commit cannot remove, invert or edit one (PR #302 peer review F1)', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  const path = 'docs/governance/checkpoint-errata.json';
  const write = (withdrawn, message) => repo.commit(path, `${JSON.stringify({schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn}, null, 2)}\n`, message);
  const w1 = {id: 'CP-x', replaced_by: 'CP-y', reason: 'sibling replaced after a propagated correction', reference: 'PR #302'};
  const base = repo.commit('README.md', 'base\n', 'base');
  const added = write([w1], 'add withdrawal');
  assert.deepEqual(rewrittenWithdrawals(repo.dir, base, added), [], 'adding a withdrawal (also where the file is new) is allowed');
  const more = write([w1, {...w1, id: 'CP-z'}], 'add another');
  assert.deepEqual(rewrittenWithdrawals(repo.dir, added, more), []);
  const edited = write([{...w1, reason: 'a different reason, written after the fact'}, {...w1, id: 'CP-z'}], 'edit');
  assert.deepEqual(rewrittenWithdrawals(repo.dir, more, edited).map(p => p.problem), ['withdrawal CP-x changed']);
  repo.git('reset', '-q', '--hard', more);
  const inverted = write([{...w1, id: 'CP-y', replaced_by: 'CP-x'}, {...w1, id: 'CP-z'}], 'invert the winner');
  assert.deepEqual(rewrittenWithdrawals(repo.dir, more, inverted).map(p => p.problem), ['withdrawal CP-x removed']);
  repo.git('reset', '-q', '--hard', more);
  // removed then restored inside the range is still detected commit by commit
  const removed = write([{...w1, id: 'CP-z'}], 'remove');
  const restored = write([w1, {...w1, id: 'CP-z'}], 'restore');
  assert.ok(rewrittenWithdrawals(repo.dir, more, restored).some(p => p.problem === 'withdrawal CP-x removed' && p.commit === removed));
  const malformed = repo.commit(path, '{"withdrawn": {}}\n', 'malformed');
  assert.ok(rewrittenWithdrawals(repo.dir, restored, malformed).some(p => p.problem.includes('malformed')));
});

test('MP-CP-WITHDRAW-01 anti-bypass: a withdrawal keeps pending verifications and open findings (PR #302 review)', () => {
  const a = makeCheckpoint();
  const pending = {status: 'PENDING_VERIFICATION', from: 'agent-a', to: 'ANY', responsibilities: ['verify CI on the head']};
  const x = makeCheckpoint({id: 'CP-20261018T210000Z-agent-a', timestamp_utc: '2026-10-18T21:00:00Z', supersedes: a.id, handoff: pending});
  const y = makeCheckpoint({id: 'CP-20261018T211000Z-agent-a', timestamp_utc: '2026-10-18T21:10:00Z', supersedes: a.id, handoff: {status: 'NONE', from: null, to: null, responsibilities: []}});
  const entry = {id: x.id, replaced_by: y.id, reason: 'sibling replaced after a propagated correction', reference: 'PR #302'};
  const file = {schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn: [entry]};
  assert.ok(validateErrata(file, [a, x, y]).some(e => e.includes('different handoff')));
  assert.deepEqual(validateErrata(file, [a, x, {...y, handoff: {...pending}}]), []);
  const open = {id: 'F-1', severity: 'BLOCKING', status: 'OPEN', summary: 'open'};
  const xf = {...x, handoff: y.handoff, findings: [open]};
  assert.ok(validateErrata(file, [a, xf, y]).some(e => e.includes('drops the unresolved finding F-1')));
  assert.ok(validateErrata(file, [a, xf, {...y, findings: [{...open, status: 'RESOLVED'}]}]).some(e => e.includes('F-1')));
  assert.ok(validateErrata(file, [a, xf, {...y, findings: [{...open, severity: 'NON_BLOCKING'}]}]).some(e => e.includes('F-1')));
  assert.deepEqual(validateErrata(file, [a, xf, {...y, findings: [open]}]), []);
  // a descendant of the replacement may carry the finding forward, or record its later resolution
  const later = makeCheckpoint({id: 'CP-20261018T212000Z-agent-a', timestamp_utc: '2026-10-18T21:20:00Z', supersedes: y.id, findings: [{...open, status: 'RESOLVED'}]});
  assert.deepEqual(validateErrata(file, [a, xf, y, later]), []);
  const unrelated = makeCheckpoint({...later, task: 'R-02'});
  assert.ok(validateErrata(file, [a, xf, y, unrelated]).some(e => e.includes('F-1')));
});

test('MP-CP-WITHDRAW-01: a withdrawal inherited through a merged parent cannot be inverted (PR #302 review)', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  const path = 'docs/governance/checkpoint-errata.json';
  const write = (withdrawn, message) => repo.commit(path, `${JSON.stringify({schema_version: 'mp-checkpoint-errata-v1', entries: [], withdrawn}, null, 2)}\n`, message);
  const w1 = {id: 'CP-x', replaced_by: 'CP-y', reason: 'sibling replaced after a propagated correction', reference: 'PR #302'};
  const fork = write([], 'before the withdrawal');
  const base = write([w1], 'withdrawal on main');
  // a branch that diverged before the withdrawal inverts it, then merges BASE as its second parent
  repo.git('checkout', '-q', '-b', 'side', fork);
  write([{...w1, id: 'CP-y', replaced_by: 'CP-x'}], 'inverted on the side branch');
  repo.git('merge', '-q', '--no-ff', '--no-commit', '-s', 'ours', 'feature');
  repo.git('commit', '-q', '-m', 'merge base keeping the inversion');
  const head = repo.git('rev-parse', 'HEAD');
  assert.ok(repo.git('rev-list', '--parents', '-n1', head).split(' ').includes(base), 'precondition: BASE is a merged parent');
  assert.ok(rewrittenWithdrawals(repo.dir, base, head).some(p => p.problem === 'withdrawal CP-x removed'));
});
