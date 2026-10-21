// MP-GITHUB-RECON-IMPLEMENTATION-01 and MP-OWNER-AGENTS-INTERCHANGEABLE-01: checkpoint v3, HANDOFF OUT/IN for any
// agent, authorization ledger (a consumed GO is refused), one writer per resource, parallel-PR exception only by
// owner decision, and no agent identity in the governance code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {authorizationLedger, checkAuthorization, handoffIn, validateCheckpoint} from '../tools/governance/checkpoints.mjs';
import {realityFor} from '../tools/governance/git.mjs';
import {claim, release, validateRegistry} from '../tools/governance/registry.mjs';

const SHA_A = 'a'.repeat(40);
// A structured verification by the receiver (MP-PR183-HARDENING-01): never a bare sentence.
const check = (claim, overrides = {}) => ({claim, resource: 'branch:feature', method: 'git rev-parse origin/feature', observed: SHA_A, observed_at: '2026-10-18T20:00:00Z', observer: 'agent-b', result: 'VERIFIED', ...overrides});
const SHA_B = 'c'.repeat(40);

// The v2 base of test/governance-checkpoints.test.mjs, copied so that importing it does not run its tests twice.
function makeCheckpoint(overrides = {}) {
  return {
    schema_version: 'mp-checkpoint-v2', id: 'CP-20261018T200000Z-agent-a', timestamp_utc: '2026-10-18T20:00:00Z',
    agent: {id: 'agent-a', role: 'Development Agent'}, activity: 'implement checkpoint library', task: 'R-01',
    repository: 'zarbopiero963-droid/MatchPilot', issue: 150, pr: null, branch: 'feature', commit_sha: SHA_A, tree_sha: 'b'.repeat(40),
    requirements: ['MP-GOV-017'], changes: ['tools/governance/checkpoints.mjs'],
    tests: [{command: 'node --test', result: 'PASS', environment: 'local node 22', commit: SHA_A, time: '2026-10-18T19:59:00Z', limits: []}],
    ci: {run_id: null, conclusion: 'NOT_RUN'}, gate_a: 'PASS', gate_b: 'NOT_VERIFIED', review: {verdict: 'NOT REQUESTED', reference: null},
    findings: [], owner_decisions: ['MP-OWNER-R01-AUTH-20261018'], dependencies: [], state: 'RUNNING', next_action: 'write registry tests',
    resume_conditions: ['branch head equals commit_sha'], supersedes: null, ...overrides,
  };
}
const context = {decisionIds: new Set(['MP-OWNER-R01-AUTH-20261018']), requirementIds: new Set(['MP-GOV-017']), taskIds: new Set(['R-01'])};

export function makeV3(overrides = {}) {
  return makeCheckpoint({
    schema_version: 'mp-checkpoint-v3',
    agent: {id: 'agent-a', role: 'Development Agent', session: 'session-a'},
    mandate: {id: 'MANDATE-1', source: 'owner message in the session'},
    base_sha: SHA_B,
    worktree: {clean: true},
    progress: {done: ['schema'], in_progress: [], not_started: ['docs']},
    resources: ['branch:feature'],
    authorizations: [],
    external_commands: [],
    artifacts: [],
    stop_conditions: ['any divergence from the real branch'],
    costs: {incurred: 'none', authorized: 'none'},
    vps: null,
    handoff: {status: 'NONE', from: null, to: null, responsibilities: []},
    ...overrides,
  });
}

test('v3 extends v2: a complete v3 checkpoint validates and v2 checkpoints stay valid', () => {
  assert.deepEqual(validateCheckpoint(makeV3(), context), []);
  assert.deepEqual(validateCheckpoint(makeCheckpoint(), context), [], 'v2 is still accepted');
  assert.ok(validateCheckpoint(makeCheckpoint({schema_version: 'mp-checkpoint-v4'}), context).some(e => e.includes('schema_version')));
  for (const key of ['mandate', 'base_sha', 'worktree', 'progress', 'resources', 'authorizations', 'external_commands', 'artifacts', 'stop_conditions', 'costs', 'handoff']) {
    const cp = makeV3();
    delete cp[key];
    assert.ok(validateCheckpoint(cp, context).length > 0, `v3 without ${key} accepted`);
  }
  assert.ok(validateCheckpoint(makeV3({agent: {id: 'agent-a', role: 'Development Agent'}}), context).some(e => e.includes('agent.session')));
  assert.ok(validateCheckpoint(makeV3({vps: 'up'}), context).some(e => e.includes('vps')));
  assert.ok(validateCheckpoint(makeV3({stop_conditions: []}), context).some(e => e.includes('stop_conditions')));
  assert.ok(validateCheckpoint(makeV3({artifacts: [{path: 'x', sha256: 'abc'}]}), context).some(e => e.includes('SHA-256')));
  assert.ok(validateCheckpoint(makeV3({external_commands: [{target: 'github', command: 'comment'}]}), context).some(e => e.includes('effect')));
});

test('v3 handoff states are consistent and unverified claims certify nothing', () => {
  const out = {status: 'OUT', from: 'agent-a', to: 'ANY', responsibilities: ['PR review follow-up']};
  assert.deepEqual(validateCheckpoint(makeV3({state: 'HANDOFF READY', handoff: out}), context), []);
  assert.ok(validateCheckpoint(makeV3({state: 'HANDOFF READY'}), context).some(e => e.includes('handoff.status OUT')));
  assert.ok(validateCheckpoint(makeV3({state: 'RUNNING', handoff: out}), context).some(e => e.includes('state HANDOFF READY')));
  assert.ok(validateCheckpoint(makeV3({state: 'HANDOFF READY', handoff: {...out, responsibilities: []}}), context).some(e => e.includes('responsibilities')));
  assert.ok(validateCheckpoint(makeV3({handoff: {status: 'IN', from: 'agent-a', to: 'agent-b', responsibilities: [], verified: []}}), context).some(e => e.includes('handoff IN')));
  assert.ok(validateCheckpoint(makeV3({handoff: {status: 'IN', from: 'agent-a', to: 'agent-b', responsibilities: [], verified: ['branch head equals commit_sha']}}), context).some(e => e.includes('must be an object')), 'a sentence is not a verification');
  assert.deepEqual(validateCheckpoint(makeV3({handoff: {status: 'IN', from: 'agent-a', to: 'agent-b', responsibilities: [], verified: [check('state')]}}), context), []);
  for (const key of ['claim', 'resource', 'method', 'observed', 'observer', 'observed_at', 'result']) {
    const record = check('state');
    delete record[key];
    assert.ok(validateCheckpoint(makeV3({handoff: {status: 'IN', from: 'agent-a', to: 'agent-b', responsibilities: [], verified: [record]}}), context).length > 0, `verification without ${key} accepted`);
  }
  const pending = {status: 'PENDING_VERIFICATION', from: 'agent-g', to: 'ANY', responsibilities: ['VPS claims']};
  assert.deepEqual(validateCheckpoint(makeV3({state: 'BLOCKED', handoff: pending}), context), []);
  assert.ok(validateCheckpoint(makeV3({state: 'HANDOFF READY', handoff: pending}), context).length > 0);
  const merged = {state: 'MERGED', gate_b: 'PASS', review: {verdict: 'APPROVED', reference: 'r', reviewed_sha: 'a'.repeat(40)}};
  assert.ok(validateCheckpoint(makeV3(merged), context).some(e => e.includes('merge_sha')));
  assert.deepEqual(validateCheckpoint(makeV3({...merged, merge_sha: 'd'.repeat(40)}), context), []);
});

test('no secret goes into a v3 checkpoint, wherever it is put', () => {
  const leaked = makeV3({external_commands: [{target: 'vps', command: 'export GH_TOKEN=ghp_' + 'A'.repeat(36), effect: 'none'}]});
  assert.ok(validateCheckpoint(leaked, context).some(e => e.includes('secret-like')));
  const vps = makeV3({vps: {password: 'hunter2-very-secret-value'}});
  assert.ok(validateCheckpoint(vps, context).some(e => e.includes('secret-like')));
});

const go = (status, extra = {}) => ({id: 'GO-S3', source: '#179 comment', status, scope: {task: 'VPS-S3-01', resource: 'vps:matchpilot', action: 'install gate'}, ...extra});

test('authorizations depend on mandate, task, resource and action, never on the agent', () => {
  assert.ok(validateCheckpoint(makeV3({authorizations: [{...go('VALID'), scope: {agent: 'agent-a'}}]}), context).some(e => e.includes('scope key agent')));
  assert.ok(validateCheckpoint(makeV3({authorizations: [go('CONSUMED')]}), context).some(e => e.includes('consumed_by')));
  assert.deepEqual(validateCheckpoint(makeV3({authorizations: [go('CONSUMED', {consumed_by: 'CP-x'})]}), context), []);
  const granted = [makeV3({id: 'CP-20261018T200000Z-agent-a', authorizations: [go('VALID')]})];
  const request = {task: 'VPS-S3-01', resource: 'vps:matchpilot', action: 'install gate'};
  assert.equal(checkAuthorization(granted, 'GO-S3', request).ok, true);
  assert.equal(checkAuthorization.length, 2, 'the check has no agent parameter');
  assert.match(checkAuthorization(granted, 'GO-S3', {...request, resource: 'db:prod'}).problems[0], /^AUTHZ_SCOPE/);
  assert.match(checkAuthorization(granted, 'GO-S4', request).problems[0], /^AUTHZ_UNKNOWN/);
});

test('a consumed or revoked GO is refused, even if a later checkpoint calls it VALID again', () => {
  const request = {task: 'VPS-S3-01', resource: 'vps:matchpilot', action: 'install gate'};
  const chain = [
    makeV3({id: 'CP-20261018T200000Z-agent-a', authorizations: [go('VALID')]}),
    makeV3({id: 'CP-20261018T201000Z-agent-g', timestamp_utc: '2026-10-18T20:10:00Z', authorizations: [go('CONSUMED', {consumed_by: 'CP-20261018T201000Z-agent-g'})]}),
    makeV3({id: 'CP-20261018T202000Z-agent-a', timestamp_utc: '2026-10-18T20:20:00Z', authorizations: [go('VALID')]}),
  ];
  const verdict = checkAuthorization(chain, 'GO-S3', request);
  assert.equal(verdict.ok, false);
  assert.match(verdict.problems[0], /^AUTHZ_CONSUMED/);
  assert.equal(authorizationLedger(chain).get('GO-S3').status, 'CONSUMED');
  assert.match(checkAuthorization([makeV3({authorizations: [go('NOT_GRANTED')]})], 'GO-S3', request).problems[0], /^AUTHZ_NOT_GRANTED/);
  const grantedLater = [makeV3({authorizations: [go('NOT_GRANTED')]}), makeV3({id: 'CP-20261018T201000Z-agent-o', timestamp_utc: '2026-10-18T20:10:00Z', authorizations: [go('VALID')]})];
  assert.equal(checkAuthorization(grantedLater, 'GO-S3', request).ok, true, 'a GO not granted yet can be granted later');
  const revoked = [...chain.slice(0, 1), makeV3({id: 'CP-20261018T201000Z-agent-o', timestamp_utc: '2026-10-18T20:10:00Z', authorizations: [go('REVOKED')]})];
  assert.match(checkAuthorization(revoked, 'GO-S3', request).problems[0], /^AUTHZ_REVOKED/);
});

function gitRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'mp-handoff-v3-'));
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

const registryFor = (task = {}) => ({schema_version: 'mp-work-registry-v1', revision: 1, tasks: [
  {id: 'R-01', title: 't', issue: 150, pr: null, branch: 'feature', kind: 'implementation', state: 'PLANNED', assignee: null, lease: null, latest_checkpoint: null, resources: ['branch:feature'], ...task},
]});

// The same sequence whichever agent starts: A -> B -> A on a real git repository, with the registry, the chain and
// handoff IN in between. Run with (Claude, Grok) and with the names swapped: the outcomes are identical.
function relay(first, second, repo) {
  const t0 = new Date('2026-10-18T20:00:00Z');
  const at = minutes => new Date(t0.getTime() + minutes * 60e3);
  const stamp = date => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const cpId = (date, agent) => `CP-${stamp(date).replace(/[-:]/g, '')}-${agent}`;
  const head = () => repo.git('rev-parse', 'HEAD');
  const tree = () => repo.git('rev-parse', 'HEAD^{tree}');
  const log = [];
  const checkpoints = [];
  const add = cp => { assert.deepEqual(validateCheckpoint(cp, context), [], cp.id); checkpoints.push(cp); return cp; };

  let registry = claim(registryFor(), 'R-01', {id: first, role: 'Development Agent'}, at(0));
  repo.commit(`work-${first}.txt`, 'step 1', 'step 1');
  const out1 = add(makeV3({id: cpId(at(10), first), timestamp_utc: stamp(at(10)), agent: {id: first, role: 'Development Agent', session: `s-${first}`},
    commit_sha: head(), tree_sha: tree(), state: 'HANDOFF READY', next_action: 'step 2', resume_conditions: ['branch head equals commit_sha'],
    handoff: {status: 'OUT', from: first, to: 'ANY', responsibilities: ['R-01 step 2', 'PR follow-up']}}));
  registry = release(registry, 'R-01', first, out1.id, 'HANDOFF READY');

  // Second agent: no conversation, only repository facts.
  const in1 = handoffIn({checkpoints, registry, task: 'R-01', agentId: second, reality: realityFor(repo.dir, out1), now: at(20)});
  log.push(in1.ok ? 'IN-1 PROCEED' : `IN-1 STOP ${in1.problems.join(';')}`);
  registry = claim(registry, 'R-01', {id: second, role: 'Development Agent'}, at(20), {reconciled: true});
  const taken = add(makeV3({id: cpId(at(21), second), timestamp_utc: stamp(at(21)), agent: {id: second, role: 'Development Agent', session: `s-${second}`},
    commit_sha: head(), tree_sha: tree(), supersedes: out1.id, state: 'RUNNING', next_action: 'step 2',
    handoff: {status: 'IN', from: first, to: second, responsibilities: out1.handoff.responsibilities, verified: [check('state', {observer: second, observed: head(), observed_at: stamp(at(21))})]}}));
  registry = {...registry, tasks: registry.tasks.map(item => ({...item, latest_checkpoint: taken.id}))};

  // While the second agent writes, the first is refused: no dual writer.
  const dual = handoffIn({checkpoints, registry, task: 'R-01', agentId: first, reality: realityFor(repo.dir, taken), now: at(25)});
  log.push(dual.ok ? 'DUAL PROCEED' : `DUAL STOP ${dual.problems.map(p => p.split(':')[0]).join(',')}`);
  let dualClaim = 'NO_ERROR';
  try { claim(registry, 'R-01', {id: first, role: 'Development Agent'}, at(25)); } catch (error) { dualClaim = error.code; }
  log.push(`DUAL CLAIM ${dualClaim}`);

  repo.commit(`work-${second}.txt`, 'step 2', 'step 2');
  const out2 = add(makeV3({id: cpId(at(40), second), timestamp_utc: stamp(at(40)), agent: {id: second, role: 'Development Agent', session: `s-${second}`},
    commit_sha: head(), tree_sha: tree(), supersedes: taken.id, state: 'HANDOFF READY', next_action: 'step 3', resume_conditions: ['branch head equals commit_sha'],
    handoff: {status: 'OUT', from: second, to: 'ANY', responsibilities: ['R-01 step 3']}}));
  registry = release(registry, 'R-01', second, out2.id, 'HANDOFF READY');

  // A stale view: the first agent reads a registry from before the second handoff.
  const stale = handoffIn({checkpoints, registry: {...registry, tasks: registry.tasks.map(item => ({...item, latest_checkpoint: taken.id}))}, task: 'R-01', agentId: first, reality: realityFor(repo.dir, out2), now: at(50)});
  log.push(stale.ok ? 'STALE PROCEED' : `STALE STOP ${stale.problems.map(p => p.split(':')[0]).join(',')}`);
  // Work pushed after the checkpoint without a new one: the branch no longer matches.
  repo.commit(`stray-${second}.txt`, 'unrecorded', 'unrecorded');
  const moved = handoffIn({checkpoints, registry, task: 'R-01', agentId: first, reality: realityFor(repo.dir, out2), now: at(50)});
  log.push(moved.ok ? 'MOVED PROCEED' : `MOVED STOP ${moved.problems.map(p => p.split(':')[0]).join(',')}`);
  repo.git('reset', '-q', '--hard', out2.commit_sha);
  const back = handoffIn({checkpoints, registry, task: 'R-01', agentId: first, reality: realityFor(repo.dir, out2), now: at(50)});
  log.push(back.ok ? 'IN-2 PROCEED' : `IN-2 STOP ${back.problems.join(';')}`);
  // A day later the same HANDOFF READY is not STALE (not an active state), but an active one is.
  const old = handoffIn({checkpoints: [...checkpoints.slice(0, 2)], registry: {...registry, tasks: registry.tasks.map(item => ({...item, latest_checkpoint: taken.id, lease: null}))}, task: 'R-01', agentId: first, reality: realityFor(repo.dir, taken), now: at(60 * 30)});
  log.push(old.ok ? 'OLD PROCEED' : `OLD STOP ${old.problems.map(p => p.split(':')[0]).join(',')}`);
  return log;
}

test('simulated handoff A -> B -> A on a real git repository works the same whichever agent starts', t => {
  const runs = [['agent-a-claude-code', 'agent-g-grok'], ['agent-g-grok', 'agent-a-claude-code'], ['agent-x', 'agent-y']].map(([a, b]) => {
    const repo = gitRepo();
    t.after(repo.cleanup);
    repo.commit('README', 'base', 'base');
    return relay(a, b, repo);
  });
  assert.deepEqual(runs[0], [
    'IN-1 PROCEED',
    'DUAL STOP DUAL_WRITER,HANDOFF_ADDRESSED_ELSEWHERE',
    'DUAL CLAIM CONFLICT_LEASE_ACTIVE',
    'STALE STOP STALE_REGISTRY',
    'MOVED STOP UNRECONCILED_COMMITS',
    'IN-2 PROCEED',
    'OLD STOP UNRECONCILED_COMMITS,STALE,HANDOFF_ADDRESSED_ELSEWHERE',
  ]);
  assert.deepEqual(runs[1], runs[0], 'swapping Claude and Grok changes nothing');
  assert.deepEqual(runs[2], runs[0], 'any agent id behaves the same');
});

test('handoff IN releases structured claims only with structured evidence, and refuses a handoff addressed elsewhere', t => {
  const repo = gitRepo();
  t.after(repo.cleanup);
  const sha = repo.commit('a.txt', 'a', 'a');
  const claims = [{id: 'C1', resource: 'vps:host', statement: 'mp-deploy v3 is installed'}];
  const cp = makeV3({commit_sha: sha, tree_sha: repo.git('rev-parse', 'HEAD^{tree}'), state: 'BLOCKED',
    handoff: {status: 'PENDING_VERIFICATION', from: 'agent-g', to: 'ANY', responsibilities: ['VPS claims'], claims}});
  assert.deepEqual(validateCheckpoint(cp, context), []);
  const registry = registryFor({latest_checkpoint: cp.id});
  const now = new Date('2026-10-18T21:00:00Z');
  const run = evidence => handoffIn({checkpoints: [cp], registry, task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, cp), now, evidence});
  assert.deepEqual(run([]).problems.map(p => p.split(':')[0]), ['HANDOFF_PENDING_VERIFICATION', 'EVIDENCE_MISSING']);
  const good = {claim: 'C1', resource: 'vps:host', method: 'sha256sum /usr/local/sbin/mp-deploy', observed: '07dbed21', observed_at: '2026-10-18T20:50:00Z', observer: 'agent-z', result: 'VERIFIED'};
  assert.equal(run([good]).ok, true);
  const addressed = {...cp, handoff: {...cp.handoff, status: 'NONE', to: 'agent-b'}};
  assert.deepEqual(handoffIn({checkpoints: [addressed], registry, task: 'R-01', agentId: 'agent-z', reality: realityFor(repo.dir, addressed), now}).problems.map(p => p.split(':')[0]), ['HANDOFF_ADDRESSED_ELSEWHERE']);
  assert.deepEqual(handoffIn({checkpoints: [], registry, task: 'R-01', agentId: 'agent-z', reality: {}, now}).problems.map(p => p.split(':')[0]), ['NO_CHECKPOINT']);
  assert.equal(handoffIn({checkpoints: [cp], registry: null, task: 'R-01', agentId: 'agent-z', reality: {}, now}).ok, false, 'an unreadable registry fails closed');
});

test('one writer per resource, whoever the agents are', () => {
  const now = new Date('2026-10-18T20:00:00Z');
  const lease = holder => ({holder, acquired_at: '2026-10-18T19:00:00Z', expires_at: '2026-10-18T22:00:00Z'});
  const reg = {schema_version: 'mp-work-registry-v1', revision: 1, tasks: [
    {id: 'VPS-S3', title: 's3', issue: 179, pr: null, branch: 'main', kind: 'audit', state: 'RUNNING', assignee: {agent: 'agent-g', role: 'Integration Agent'}, lease: lease('agent-g'), latest_checkpoint: null, resources: ['vps:matchpilot']},
    {id: 'DR-PG18', title: 'dr', issue: 179, pr: null, branch: 'main', kind: 'audit', state: 'PLANNED', assignee: null, lease: null, latest_checkpoint: null, resources: ['vps:matchpilot']},
  ]};
  assert.deepEqual(validateRegistry(reg, {now}), []);
  assert.throws(() => claim(reg, 'DR-PG18', {id: 'agent-a', role: 'Integration Agent'}, now), {code: 'CONFLICT_RESOURCE_LEASED'});
  assert.ok(claim(reg, 'DR-PG18', {id: 'agent-g', role: 'Integration Agent'}, now), 'the holder of the resource may take a second task on it');
  const both = {...reg, tasks: reg.tasks.map(task => task.id === 'DR-PG18' ? {...task, state: 'RUNNING', assignee: {agent: 'agent-a', role: 'Integration Agent'}, lease: lease('agent-a')} : task)};
  assert.ok(validateRegistry(both, {now}).some(e => e.startsWith('dual writer on vps:matchpilot')));
  assert.deepEqual(validateRegistry(both, {now: new Date('2026-10-18T23:00:00Z')}), [], 'expired leases write nothing');
  assert.ok(validateRegistry({...reg, tasks: [{...reg.tasks[0], resources: 'vps'}]}, {now}).some(e => e.includes('resources must be')));
});

test('a second live implementation PR is admitted only by an IN_FORCE owner decision that names it', () => {
  const now = new Date('2026-10-18T20:00:00Z');
  const reg = {schema_version: 'mp-work-registry-v1', revision: 1, tasks: [
    {id: 'HIST', title: 'h', issue: 34, pr: 178, pr_open: true, branch: 'b', kind: 'implementation', state: 'BLOCKED', assignee: null, lease: null, latest_checkpoint: null},
    {id: 'GOV', title: 'g', issue: 97, pr: 183, pr_open: true, branch: 'c', kind: 'implementation', state: 'REVIEW', assignee: null, lease: null, latest_checkpoint: null, parallel_authorization: 'GO-GOV'},
  ]};
  const decisions = status => ({decisions: [{id: 'GO-GOV', status, parallel_tasks: ['GOV']}]});
  assert.ok(validateRegistry(reg, {now}).some(e => e.startsWith('more than one active implementation task')), 'strict without the decision register');
  assert.deepEqual(validateRegistry(reg, {now, decisions: decisions('IN_FORCE')}), []);
  for (const status of ['SUPERSEDED', 'COMPLETED']) {
    const errors = validateRegistry(reg, {now, decisions: decisions(status)});
    assert.ok(errors.some(e => e.includes('parallel_authorization')) && errors.some(e => e.startsWith('more than one')), status);
  }
  assert.ok(validateRegistry(reg, {now, decisions: {decisions: [{id: 'GO-GOV', status: 'IN_FORCE', parallel_tasks: ['OTHER']}]}}).some(e => e.startsWith('more than one')));
  const third = {...reg, tasks: [...reg.tasks, {id: 'APP', title: 'a', issue: 182, pr: null, branch: 'd', kind: 'implementation', state: 'PLANNED', assignee: null, lease: null, latest_checkpoint: null}]};
  assert.throws(() => claim(third, 'APP', {id: 'agent-x', role: 'Development Agent'}, now, {decisions: decisions('IN_FORCE')}), {code: 'CONFLICT_PARALLEL_IMPLEMENTATION'}, 'the exception covers only the task it names');
});

test('the governance code grants nothing by agent name', () => {
  const dir = new URL('../tools/governance/', import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.mjs'))) {
    const source = readFileSync(new URL(file, dir), 'utf8').replaceAll('CLAUDE.md', 'AGENT-FILE.md').split('\n').filter(line => !line.startsWith('export const LEGACY_SCHEMA'));
    for (const [i, line] of source.entries()) assert.doesNotMatch(line, /claude|grok|codex|chatgpt|openai|anthropic/i, `${file}:${i + 1} names an agent`);
  }
});

const repoFile = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('the repository reflects the 21/10 reconciliation (MP-GITHUB-RECON-IMPLEMENTATION-01)', () => {
  const decisions = new Map(JSON.parse(repoFile('docs/governance/owner-decisions.json')).decisions.map(item => [item.id, item]));
  for (const id of ['MP-VPS-ONLY-OPERATIONS-2026-10-21', 'MP-OWNER-AGENTS-INTERCHANGEABLE-01', 'MP-OWNER-VPS-DR-PORTABILITY-01', 'MP-OWNER-HIST-01B-OPTION-A']) assert.equal(decisions.get(id)?.status, 'IN_FORCE', id);
  for (const id of ['MP-OWNER-PR181-CONTROLLED-MERGE', 'MP-OWNER-GO1-VPS-OIDC-PREFLIGHT-01', 'MP-OWNER-GO2-MERGE-PR180', 'MP-OWNER-GO-BACKUP-RERUN-20261021']) assert.equal(decisions.get(id)?.status, 'COMPLETED', `${id} is consumed`);
  assert.equal(decisions.get('MP-OWNER-AUTOMERGE-02-03-PROPOSAL')?.status, 'OPEN', 'AUTOMERGE-02/03 are not in force');
  assert.ok(![...decisions.keys()].some(id => /^MP-OWNER-AUTOMERGE-0[23]$/.test(id)));
  const tasks = new Map(JSON.parse(repoFile('docs/governance/work-registry.json')).tasks.map(task => [task.id, task]));
  assert.equal(tasks.get('DEPLOY-GATE-S1S2-01').state, 'MERGED');
  assert.equal(tasks.get('DEPLOY-GATE-S1S2-01').lease, null);
  assert.deepEqual([tasks.get('HIST-01a').state, tasks.get('HIST-01a').pr, tasks.get('HIST-01a').pr_open], ['BLOCKED', 178, true]);
  for (const id of ['APP-01', 'GOV-01']) assert.equal(tasks.get(id).pr, null, `${id} has no PR`);
  const vps = JSON.parse(repoFile(`docs/governance/checkpoints/${tasks.get('VPS-MIGRATION-01').latest_checkpoint}.json`));
  assert.equal(vps.handoff.status, 'PENDING_VERIFICATION');
  assert.equal(vps.handoff.to, 'ANY', 'the VPS work is not reserved to one agent');
  assert.ok(!['HANDOFF READY', 'COMPLETED', 'CERTIFIED'].includes(vps.state));
  const inventory = JSON.parse(repoFile('docs/governance/mp-pr-00/requirements.json'));
  assert.ok(!inventory.pr_registry.some(pr => pr.status === 'DELIVERED' && Object.keys(pr.requirement_verdicts ?? {}).some(v => !['PASS', 'NOT_APPLICABLE'].includes(v))), 'DELIVERED only with every requirement PASS');
  assert.match(repoFile('render.yaml'), /^\s*autoDeploy: false$/m);
  assert.doesNotMatch(repoFile('render.yaml'), /autoDeploy: true/);
  const settings = JSON.parse(repoFile('.claude/settings.json')).permissions;
  for (const tool of ['mcp__Neon__run_sql', 'mcp__Neon__explain_sql_statement']) {
    assert.ok(!settings.allow.includes(tool) && settings.deny.includes(tool), `${tool} must be denied`);
  }
  assert.ok(!settings.allow.some(tool => /^mcp__Render__(trigger|create|update)/.test(tool)));
});
