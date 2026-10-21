// MP-GATE-S1S2-FIX: the job-started hook of the VPS runner (scripts/runner-job-guard.mjs). Review B4 (#179 6321726326):
// a PR merged by an agent could change deploy-vps.yml and run code on the VPS without the owner's approval. GitHub is
// simulated (routes by URL); the anti-stale tip uses the same two sources as mp-deploy v3.1.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {EXPECTED, GITHUB_API, TIP_SOURCES} from '../scripts/deploy-authz.mjs';
import {JOB, WORKFLOW_PATH, configProblems, gitBlobSha, runGuard} from '../scripts/runner-job-guard.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const RUN = '700';
const WORKFLOW = readFileSync(new URL('../.github/workflows/deploy-vps.yml', import.meta.url));
const PIN = gitBlobSha(WORKFLOW);
const CONFIG = {workflow_blob_sha: PIN};

const pkt = line => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;
const advertisement = (main, others = []) => pkt('# service=git-upload-pack\n') + '0000'
  + pkt(`${main} HEAD\0multi_ack side-band-64k symref=HEAD:refs/heads/main agent=git/github\n`)
  + others.map(([sha, ref]) => pkt(`${sha} ${ref}\n`)).join('') + pkt(`${main} refs/heads/main\n`) + '0000';

const env = (overrides = {}) => ({GITHUB_REPOSITORY: EXPECTED.repository, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: EXPECTED.workflow_ref, GITHUB_JOB: JOB, GITHUB_RUN_ID: RUN, GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: C,
  RUNNER_NAME: 'matchpilot-vps', ...overrides});
const approval = (overrides = {}) => ({state: 'approved', user: {login: 'zarbopiero963-droid'}, environments: [{name: 'vps-production'}], comment: '', ...overrides});

// GitHub as the hook reads it, for a run of `sha`; `tip` is what both tip sources say.
function github({sha = C, tip = C, blob = PIN, approvals = [approval()], pending = [], jobs, run = {}, overrides = {}} = {}) {
  const runUrl = `${GITHUB_API}/actions/runs/${RUN}`;
  const routes = {
    [runUrl]: {id: Number(RUN), run_attempt: 1, event: 'push', head_branch: 'main', head_sha: sha, path: WORKFLOW_PATH,
      repository: {full_name: EXPECTED.repository}, status: 'in_progress', ...run},
    [`${runUrl}/attempts/1/jobs?per_page=100`]: {jobs: jobs ?? [{name: 'Deploy gate', run_attempt: 1, runner_name: 'GitHub Actions 1'},
      {name: JOB, run_attempt: 1, runner_name: 'matchpilot-vps', status: 'in_progress'}]},
    [`${GITHUB_API}/contents/${WORKFLOW_PATH}?ref=${sha}`]: {type: 'file', path: WORKFLOW_PATH, sha: blob},
    [`${runUrl}/approvals`]: approvals,
    [`${runUrl}/pending_deployments`]: pending,
    ...overrides,
  };
  const reads = [];
  const fetchJson = async url => {
    reads.push(url);
    const route = routes[url];
    if (route instanceof Error) throw route;
    if (route === undefined) throw new Error('HTTP 404');
    return structuredClone(route);
  };
  const tipRoutes = {[TIP_SOURCES.refs]: advertisement(tip), [TIP_SOURCES.api]: JSON.stringify({name: 'main', commit: {sha: tip}}), ...overrides.tip};
  const fetchText = async url => {
    reads.push(url);
    const route = tipRoutes[url];
    if (route instanceof Error) throw route;
    return route;
  };
  return {fetchJson, fetchText, reads};
}
const guard = async (world = {}, envOverrides = {}, config = CONFIG) => {
  const gh = github(world);
  const report = await runGuard({env: env(envOverrides), config, fetchJson: gh.fetchJson, fetchText: gh.fetchText});
  return {...report, reads: gh.reads, text: report.problems.join(' | ')};
};

test('the pin is the git blob SHA of deploy-vps.yml (what `git hash-object` and the contents API give)', () => {
  const file = new URL('../.github/workflows/deploy-vps.yml', import.meta.url).pathname;
  assert.equal(PIN, execFileSync('git', ['hash-object', file], {encoding: 'utf8'}).trim());
  assert.deepEqual(configProblems(CONFIG), []);
  for (const bad of [null, {}, {workflow_blob_sha: 'x'}, {workflow_blob_sha: PIN, extra: 1}, {workflow_blob_sha: PIN.toUpperCase()}]) {
    assert.match(configProblems(bad).join(), /GUARD_CONFIG/);
  }
});

test('ALLOW only for the deploy job of the pinned workflow, approved by the owner, assigned here, on the tip of main', async () => {
  const ok = await guard();
  assert.equal(ok.result, 'ALLOW', ok.text);
  assert.deepEqual(ok.problems, []);
});

test('B4: a changed deploy-vps.yml cannot run on the VPS, even merged and even approved', async () => {
  // The same run, approved, but deploy-vps.yml at that SHA is not the pinned file (environment dropped, a job added).
  const changed = await guard({blob: gitBlobSha(Buffer.concat([WORKFLOW, Buffer.from('  evil:\n    runs-on: x\n')]))});
  assert.equal(changed.result, 'REFUSE');
  assert.match(changed.text, /GUARD_WORKFLOW_NOT_PINNED/);
  // Without the environment nobody approved: refused for that too.
  const noEnvironment = await guard({blob: 'f'.repeat(40), approvals: []});
  assert.match(noEnvironment.text, /GUARD_WORKFLOW_NOT_PINNED[\s\S]*GUARD_NO_OWNER_APPROVAL/);
  // A job added to deploy-vps.yml under another name is refused from the runner's word alone, before any read.
  const extraJob = await guard({}, {GITHUB_JOB: 'evil'});
  assert.match(extraJob.text, /GUARD_JOB: evil/);
  assert.deepEqual(extraJob.reads, [], 'no GitHub read for a job that is not the deploy job');
});

test('B4: another workflow, event, branch or repository cannot use the VPS runner', async () => {
  const cases = [
    [{GITHUB_WORKFLOW_REF: `${EXPECTED.repository}/.github/workflows/ci.yml@refs/heads/main`}, /GUARD_WORKFLOW/],
    [{GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/1/merge'}, /GUARD_EVENT[\s\S]*GUARD_REF/],
    [{GITHUB_EVENT_NAME: 'workflow_dispatch'}, /GUARD_EVENT/],
    [{GITHUB_REF: 'refs/heads/feature', GITHUB_WORKFLOW_REF: `${EXPECTED.repository}/.github/workflows/deploy-vps.yml@refs/heads/feature`}, /GUARD_REF[\s\S]*GUARD_WORKFLOW/],
    [{GITHUB_REPOSITORY: 'someone/fork'}, /GUARD_REPOSITORY/],
    [{GITHUB_RUN_ID: '07'}, /GUARD_RUN_ID/],
    [{GITHUB_SHA: 'main'}, /GUARD_SHA/],
    [{RUNNER_NAME: ''}, /GUARD_RUNNER_NAME/],
  ];
  for (const [overrides, pattern] of cases) {
    const result = await guard({}, overrides);
    assert.equal(result.result, 'REFUSE', JSON.stringify(overrides));
    assert.match(result.text, pattern);
    assert.deepEqual(result.reads, []);
  }
});

test('only the owner\'s approval of vps-production counts; a deployment still waiting is refused', async () => {
  for (const approvals of [[], [approval({user: {login: 'someone'}})], [approval({state: 'rejected'})],
    [approval({environments: [{name: 'other'}]})], {message: 'Not Found'}, null]) {
    const result = await guard({approvals});
    assert.equal(result.result, 'REFUSE', JSON.stringify(approvals));
    assert.match(result.text, /GUARD_NO_OWNER_APPROVAL|GUARD_APPROVALS_UNREADABLE/);
  }
  const waiting = await guard({pending: [{environment: {name: 'vps-production'}}]});
  assert.match(waiting.text, /GUARD_DEPLOYMENT_STILL_WAITING/);
});

test('the job must be this run\'s deploy job assigned to this runner; the run must be what the runner says', async () => {
  const elsewhere = await guard({jobs: [{name: JOB, run_attempt: 1, runner_name: 'other-runner'}]});
  assert.match(elsewhere.text, /GUARD_JOB_NOT_ASSIGNED_HERE: runner other-runner/);
  const twice = await guard({jobs: [{name: JOB, run_attempt: 1, runner_name: 'matchpilot-vps'}, {name: JOB, run_attempt: 1, runner_name: 'matchpilot-vps'}]});
  assert.match(twice.text, /GUARD_JOB_NOT_ASSIGNED_HERE: 2 jobs/);
  // A job pointing GITHUB_RUN_ID at another, approved run: GitHub's run has another SHA, attempt or file.
  for (const run of [{head_sha: B}, {run_attempt: 2}, {path: '.github/workflows/ci.yml'}, {event: 'workflow_dispatch'}, {head_branch: 'feature'}, {repository: {full_name: 'x/y'}}]) {
    const result = await guard({run});
    assert.equal(result.result, 'REFUSE', JSON.stringify(run));
    assert.match(result.text, /GUARD_RUN_MISMATCH/);
  }
});

// PR #181 hardening (owner point 1, review NB-1): a job that is concluded, cancelled or not active, or a run that is
// over, is not the job being started. RED on 5e79bfc: a completed job of the same run was ALLOWED.
test('a concluded, cancelled, queued or waiting job, or a run that is over, is refused', async () => {
  const deployJob = extra => [{name: JOB, run_attempt: 1, runner_name: 'matchpilot-vps', status: 'in_progress', ...extra}];
  for (const extra of [{status: 'completed', conclusion: 'success'}, {status: 'completed', conclusion: 'cancelled'},
    {status: 'queued'}, {status: 'waiting'}, {status: 'in_progress', conclusion: 'failure'}, {status: undefined}]) {
    const result = await guard({jobs: deployJob(extra)});
    assert.equal(result.result, 'REFUSE', JSON.stringify(extra));
    assert.match(result.text, /GUARD_JOB_NOT_ACTIVE/);
  }
  for (const run of [{status: 'completed', conclusion: 'success'}, {status: 'completed', conclusion: 'cancelled'}, {status: 'queued'}, {conclusion: 'failure'}]) {
    const result = await guard({run});
    assert.equal(result.result, 'REFUSE', JSON.stringify(run));
    assert.match(result.text, /GUARD_RUN_MISMATCH/);
  }
  // Review NB-3 (redundant checks, now tested): a job record of another attempt, a workflow path that is not a file.
  assert.match((await guard({jobs: deployJob({run_attempt: 2})})).text, /GUARD_JOB_NOT_ASSIGNED_HERE/);
  assert.match((await guard({overrides: {[`${GITHUB_API}/contents/${WORKFLOW_PATH}?ref=${C}`]: {type: 'dir', path: WORKFLOW_PATH, sha: PIN}}})).text, /GUARD_WORKFLOW_NOT_PINNED/);
});

// PR #181 hardening (owner point 2, review NB-2): GitHub's review history has no attempt and no time; an approval of
// attempt 1 must not let a re-run start. RED on 5e79bfc: attempt 2 with attempt 1's approval was ALLOWED.
test('a re-run is refused before any GitHub read: an approval cannot be tied to its attempt', async () => {
  for (const attempt of ['2', '3', '17']) {
    const result = await guard({run: {run_attempt: Number(attempt)}}, {GITHUB_RUN_ATTEMPT: attempt});
    assert.equal(result.result, 'REFUSE');
    assert.match(result.text, new RegExp(`GUARD_RERUN_APPROVAL_UNBOUND: attempt ${attempt}`));
    assert.deepEqual(result.reads, []);
  }
});

test('anti-stale: after merges A, B, C only C may start; an approval of A or B is refused', async () => {
  for (const sha of [A, B]) {
    const result = await guard({sha, tip: C}, {GITHUB_SHA: sha});
    assert.equal(result.result, 'REFUSE');
    assert.match(result.text, new RegExp(`TIP_STALE: main is ${C}, not ${sha}`));
  }
  assert.equal((await guard({sha: C, tip: C})).result, 'ALLOW');
});

test('fail closed: GitHub unreachable, malformed or contradicting answers refuse', async () => {
  const down = await guard({overrides: {[`${GITHUB_API}/actions/runs/${RUN}`]: new Error('fetch failed')}});
  assert.match(down.text, /GUARD_API_ERROR: run fetch failed/);
  const noWorkflow = await guard({overrides: {[`${GITHUB_API}/contents/${WORKFLOW_PATH}?ref=${C}`]: new Error('HTTP 404')}});
  assert.match(noWorkflow.text, /GUARD_API_ERROR: workflow HTTP 404[\s\S]*GUARD_WORKFLOW_NOT_PINNED/);
  const tipDown = await guard({overrides: {tip: {[TIP_SOURCES.refs]: new Error('timeout')}}});
  assert.match(tipDown.text, /TIP_UNVERIFIABLE: refs timeout/);
  const disagree = await guard({overrides: {tip: {[TIP_SOURCES.api]: JSON.stringify({name: 'main', commit: {sha: B}})}}});
  assert.match(disagree.text, /TIP_UNVERIFIABLE: sources disagree/);
  const badRefs = await guard({overrides: {tip: {[TIP_SOURCES.refs]: 'garbage'}}});
  assert.match(badRefs.text, /TIP_REFS_MALFORMED/);
  for (const result of [down, noWorkflow, tipDown, disagree, badRefs]) assert.equal(result.result, 'REFUSE');
  const badConfig = await guard({}, {}, {workflow_blob_sha: 'nope'});
  assert.match(badConfig.text, /GUARD_CONFIG/);
  assert.deepEqual(badConfig.reads, []);
});

test('CLI: refuses with exit 1 and a JSON report, without reading GitHub, when the config or the job is wrong', () => {
  const script = new URL('../scripts/runner-job-guard.mjs', import.meta.url).pathname;
  const dir = mkdtempSync(join(tmpdir(), 'runner-guard-'));
  const config = join(dir, 'guard.json');
  writeFileSync(config, JSON.stringify(CONFIG));
  const run = (args, extra) => {
    const result = spawnSync(process.execPath, [script, ...args], {encoding: 'utf8', env: {PATH: process.env.PATH, ...extra}});
    return {status: result.status, report: JSON.parse(result.stdout)};
  };
  const missing = run([join(dir, 'absent.json')], env());
  assert.equal(missing.status, 1);
  assert.equal(missing.report.result, 'REFUSE');
  assert.match(missing.report.problems.join(), /GUARD_CONFIG/);
  const ciJob = run([config], env({GITHUB_WORKFLOW_REF: `${EXPECTED.repository}/.github/workflows/ci.yml@refs/heads/main`, GITHUB_JOB: 'test'}));
  assert.equal(ciJob.status, 1);
  assert.match(ciJob.report.problems.join(), /GUARD_WORKFLOW[\s\S]*GUARD_JOB: test/);
});
