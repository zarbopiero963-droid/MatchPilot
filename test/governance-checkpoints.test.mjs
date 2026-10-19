import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {commentMarker, errataMap, loadCheckpoints, planComment, reconcile, resolveLatest, validateCheckpoint, validateErrata, validateEvidence, validateHistory, writeCheckpoint} from '../tools/governance/checkpoints.mjs';
import {checkpointHistory, realityFor, rewrittenCheckpoints} from '../tools/governance/git.mjs';

const SHA_A = 'a'.repeat(40);
const SHA_T = 'b'.repeat(40);

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
