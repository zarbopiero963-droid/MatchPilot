// MP-GATE-S1S2-FIX: the job-started hook of the VPS runner (scripts/runner-job-guard.mjs). Review B4 (#179 6321726326):
// a PR merged by an agent could change deploy-vps.yml and run code on the VPS without the owner's approval. GitHub is
// simulated (routes by URL); the anti-stale tip uses the same two sources as mp-deploy v3.1.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {CI_WORKFLOW_PATH, EXPECTED, GITHUB_API, TIP_SOURCES, mergeUrls} from '../scripts/deploy-authz.mjs';
import {JOB, WORKFLOW_PATH, configProblems, gitBlobSha, runGuard} from '../scripts/runner-job-guard.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const RUN = '700';
const WORKFLOW = readFileSync(new URL('../.github/workflows/deploy-vps.yml', import.meta.url));
const PIN = gitBlobSha(WORKFLOW);
const CI_PIN = gitBlobSha(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url)));
const CONFIG = {workflow_blob_sha: PIN, ci_workflow_blob_sha: CI_PIN};

const pkt = line => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;
const advertisement = (main, others = []) => pkt('# service=git-upload-pack\n') + '0000'
  + pkt(`${main} HEAD\0multi_ack side-band-64k symref=HEAD:refs/heads/main agent=git/github\n`)
  + others.map(([sha, ref]) => pkt(`${sha} ${ref}\n`)).join('') + pkt(`${main} refs/heads/main\n`) + '0000';

const env = (overrides = {}) => ({GITHUB_REPOSITORY: EXPECTED.repository, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main',
  GITHUB_WORKFLOW_REF: EXPECTED.workflow_ref, GITHUB_JOB: JOB, GITHUB_RUN_ID: RUN, GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: C,
  RUNNER_NAME: 'matchpilot-vps', ...overrides});
// MP-AUTODEPLOY-01: what authorizes a SHA is a merged PR into main and a green CI gate from the pinned ci.yml.
const mergedPr = (sha, overrides = {}) => ({number: 1, merged_at: '2026-10-22T16:00:00Z', merge_commit_sha: sha,
  base: {ref: 'main', repo: {full_name: EXPECTED.repository}}, ...overrides});
const ciCheck = (sha, overrides = {}) => ({id: 10, name: 'CI gate', head_sha: sha, status: 'completed', conclusion: 'success',
  app: {slug: 'github-actions'}, check_suite: {id: 99},
  details_url: `https://github.com/${EXPECTED.repository}/actions/runs/20/job/30`, ...overrides});
const ciRun = (sha, overrides = {}) => ({id: 20, path: CI_WORKFLOW_PATH, event: 'push', head_branch: 'main', head_sha: sha,
  status: 'completed', conclusion: 'success', check_suite_id: 99, repository: {full_name: EXPECTED.repository}, ...overrides});

// GitHub as the hook reads it, for a run of `sha`; `tip` is what both tip sources say.
function github({sha = C, tip = C, blob = PIN, pulls, checks, ciRuns, ciBlob = CI_PIN, pending = [], jobs, run = {}, overrides = {}} = {}) {
  const runUrl = `${GITHUB_API}/actions/runs/${RUN}`;
  const routes = {
    [runUrl]: {id: Number(RUN), run_attempt: 1, event: 'push', head_branch: 'main', head_sha: sha, path: WORKFLOW_PATH,
      repository: {full_name: EXPECTED.repository}, status: 'in_progress', ...run},
    [`${runUrl}/attempts/1/jobs?per_page=100`]: {jobs: jobs ?? [{name: 'Deploy gate', run_attempt: 1, runner_name: 'GitHub Actions 1'},
      {name: JOB, run_attempt: 1, runner_name: 'matchpilot-vps', status: 'in_progress'}]},
    [`${GITHUB_API}/contents/${WORKFLOW_PATH}?ref=${sha}`]: {type: 'file', path: WORKFLOW_PATH, sha: blob},
    [mergeUrls(sha).pulls]: pulls === undefined ? [mergedPr(sha)] : pulls,
    [mergeUrls(sha).checks]: checks === undefined ? {check_runs: [ciCheck(sha)]} : checks,
    [mergeUrls(sha).ciRun(20)]: ciRuns === undefined ? ciRun(sha) : ciRuns,
    [mergeUrls(sha).ciBlob]: {type: 'file', path: CI_WORKFLOW_PATH, sha: ciBlob},
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
  for (const bad of [null, {}, {workflow_blob_sha: 'x'}, {workflow_blob_sha: PIN}, {...CONFIG, extra: 1}, {...CONFIG, workflow_blob_sha: PIN.toUpperCase()}, {...CONFIG, ci_workflow_blob_sha: 'x'}]) {
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
  // A changed workflow that was not even merged through a PR: refused for that too.
  const notMerged = await guard({blob: 'f'.repeat(40), pulls: []});
  assert.match(notMerged.text, /GUARD_WORKFLOW_NOT_PINNED[\s\S]*GUARD_NOT_A_MERGED_PR/);
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

// MP-AUTODEPLOY-01 (owner t123u/t124u): no human approval; a merged PR and a green CI gate from the pinned ci.yml.
test('only a SHA merged through a PR into main of this repository may start', async () => {
  for (const pulls of [[], [mergedPr(C, {merged_at: null})], [mergedPr(C, {merge_commit_sha: B})], [mergedPr(C, {base: {ref: 'feature', repo: {full_name: EXPECTED.repository}}})],
    [mergedPr(C, {base: {ref: 'main', repo: {full_name: 'fork/MatchPilot'}}})], {message: 'Not Found'}, null]) {
    const result = await guard({pulls});
    assert.equal(result.result, 'REFUSE', JSON.stringify(pulls));
    assert.match(result.text, /GUARD_NOT_A_MERGED_PR|GUARD_PULLS_UNREADABLE/);
  }
  const waiting = await guard({pending: [{environment: {name: 'vps-production'}}]});
  assert.match(waiting.text, /GUARD_DEPLOYMENT_STILL_WAITING/);
});

test('the CI gate must be green on exactly this SHA, newest run deciding', async () => {
  const cases = [
    [{check_runs: []}, /GUARD_CI_MISSING/],
    [{check_runs: [ciCheck(C, {status: 'in_progress', conclusion: null})]}, /GUARD_CI_PENDING/],
    [{check_runs: [ciCheck(C, {conclusion: 'failure'})]}, /GUARD_CI_NOT_GREEN: failure/],
    [{check_runs: [ciCheck(C), ciCheck(C, {id: 11, conclusion: 'failure'})]}, /GUARD_CI_NOT_GREEN/],
    [{check_runs: [ciCheck(B)]}, /GUARD_CI_MISSING/],
    [{check_runs: [ciCheck(C, {name: 'CI gate (fake)'})]}, /GUARD_CI_MISSING/],
    [{check_runs: [ciCheck(C, {app: {slug: 'evil-app'}})]}, /GUARD_CI_MISSING/],
    [null, /GUARD_CHECKS_UNREADABLE/],
  ];
  for (const [checks, expected] of cases) {
    const result = await guard({checks});
    assert.equal(result.result, 'REFUSE', JSON.stringify(checks));
    assert.match(result.text, expected);
  }
});

test('owner t124u: a CI gate faked by a workflow changed in the same PR is refused', async () => {
  // A green "CI gate" from another workflow file (added by the PR) does not count.
  const otherFile = await guard({ciRuns: ciRun(C, {path: '.github/workflows/fake.yml'})});
  assert.match(otherFile.text, /GUARD_CI_NOT_FROM_TRUSTED_WORKFLOW/);
  // The check run must belong to the check suite of the trusted ci.yml run.
  const otherSuite = await guard({checks: {check_runs: [ciCheck(C, {check_suite: {id: 12345}})]}});
  assert.match(otherSuite.text, /GUARD_CI_CHECK_NOT_FROM_TRUSTED_WORKFLOW/);
  // ci.yml changed in the PR (so its gate could be weakened): not the root-pinned blob.
  const changedCi = await guard({ciBlob: 'e'.repeat(40)});
  assert.match(changedCi.text, /GUARD_CI_WORKFLOW_NOT_PINNED/);
  // A pull_request or non-main run of ci.yml does not count, nor a failed trusted run.
  for (const run of [{event: 'pull_request'}, {head_branch: 'feature'}, {head_sha: B}, {conclusion: 'failure'}, {repository: {full_name: 'fork/x'}}, {id: 21}]) {
    const result = await guard({ciRuns: ciRun(C, run)});
    assert.equal(result.result, 'REFUSE', JSON.stringify(run));
    assert.match(result.text, /GUARD_CI_(NOT_FROM_TRUSTED_WORKFLOW|RUN_NOT_GREEN)/);
  }
  assert.match((await guard({ciRuns: null})).text, /GUARD_CI_RUNS_UNREADABLE/);
  // The run is the one named by the check run's details_url, of this repository only.
  for (const details_url of ['https://github.com/fork/x/actions/runs/20/job/30', 'https://evil.example/actions/runs/20/job/30', undefined]) {
    assert.equal((await guard({checks: {check_runs: [ciCheck(C, {details_url})]}})).result, 'REFUSE', String(details_url));
  }
  // A trusted run still in progress is not green.
  assert.match((await guard({ciRuns: ciRun(C, {status: 'in_progress', conclusion: null})})).text, /GUARD_CI_PENDING/);
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

test('MP-AUTODEPLOY-01: commits/{sha}/pulls unreadable -> the closed PRs into main prove the merge; nothing weaker', async () => {
  const down = {[mergeUrls(C).pulls]: new Error('HTTP 500')};
  const ok = await guard({overrides: {...down, [mergeUrls(C).pullsFallback]: [mergedPr(B), mergedPr(C)]}});
  assert.equal(ok.result, 'ALLOW', ok.text);
  for (const list of [[mergedPr(B)], [mergedPr(C, {merged_at: null})], [mergedPr(C, {base: {ref: 'main', repo: {full_name: 'fork/x'}}})]]) {
    assert.match((await guard({overrides: {...down, [mergeUrls(C).pullsFallback]: list}})).text, /GUARD_NOT_A_MERGED_PR/);
  }
  assert.match((await guard({overrides: {...down, [mergeUrls(C).pullsFallback]: new Error('HTTP 500')}})).text, /GUARD_API_ERROR: pulls/);
});
