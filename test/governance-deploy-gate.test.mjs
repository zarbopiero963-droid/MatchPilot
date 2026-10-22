// MP-DEPLOY-APPROVAL-01: the deploy gate (scripts/deploy-gate.mjs) and the post-approval SHA check of deploy-vps.yml.
// Simulated: a fake GitHub API and a fake git on PATH. What only GitHub can show (that the deploy job really waits for
// the approval, that a re-run asks for it again) is verified at activation, per docs/deploy-approval.md.
import assert from 'node:assert/strict';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {BRANCH, ENVIRONMENT, REPOSITORY, gateProblems, readFacts} from '../scripts/deploy-gate.mjs';

const SHA = 'a'.repeat(40);
const NEWER = 'b'.repeat(40);
const ENV_PATH = `repos/${REPOSITORY}/environments/${ENVIRONMENT}`;

const owner = {type: 'User', reviewer: {login: 'zarbopiero963-droid', id: 1}};
const protectedEnvironment = (overrides = {}) => ({
  name: ENVIRONMENT, can_admins_bypass: false,
  protection_rules: [{id: 1, type: 'required_reviewers', prevent_self_review: false, reviewers: [owner]}, {id: 2, type: 'branch_policy'}],
  deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}, ...overrides});

function fakeApi(overrides = {}) {
  const routes = {
    [ENV_PATH]: {status: 200, body: protectedEnvironment()},
    [`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 200, body: {total_count: 1, branch_policies: [{id: 9, name: BRANCH, type: 'branch'}]}},
    [`repos/${REPOSITORY}/branches/${BRANCH}`]: {status: 200, body: {commit: {sha: SHA}}},
    ...merged(SHA), ...merged('b'.repeat(40)),
    ...overrides,
  };
  return async path => {
    if (!(path in routes)) throw new Error(`unexpected ${path}`);
    const value = routes[path];
    if (value instanceof Error) throw value;
    return structuredClone(value);
  };
}

const run = {repository: REPOSITORY, ref: 'refs/heads/main', event: 'push', sha: SHA};
const problems = async (overrides = {}, context = {}) => gateProblems(await readFacts({...run, ...context, api: fakeApi(overrides)}));
const env = body => ({[ENV_PATH]: {status: 200, body}});
// MP-AUTODEPLOY-01: a merged PR into main and a green CI gate on the SHA.
const PULLS = sha => `repos/${REPOSITORY}/commits/${sha}/pulls?per_page=100`;
const CHECKS = sha => `repos/${REPOSITORY}/commits/${sha}/check-runs?check_name=CI%20gate&filter=all&per_page=100`;
const runOf = sha => (sha === SHA ? 7 : 70);
const merged = sha => ({[PULLS(sha)]: {status: 200, body: [{merged_at: '2026-10-22T16:00:00Z', merge_commit_sha: sha, base: {ref: 'main', repo: {full_name: REPOSITORY}}}]},
  [CHECKS(sha)]: {status: 200, body: {check_runs: [{id: 1, name: 'CI gate', head_sha: sha, status: 'completed', conclusion: 'success', app: {slug: 'github-actions'}, check_suite: {id: 5},
    details_url: `https://github.com/zarbopiero963-droid/MatchPilot/actions/runs/${runOf(sha)}/job/8`}]}},
  [`repos/zarbopiero963-droid/MatchPilot/actions/runs/${runOf(sha)}`]: {status: 200, body: {id: runOf(sha), path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: sha,
    status: 'completed', conclusion: 'success', check_suite_id: 5, repository: {full_name: 'zarbopiero963-droid/MatchPilot'}}}});

test('a push to main with vps-production protected by the owner only, no admin bypass and only main passes', async () => {
  assert.deepEqual(await problems(), []);
});

test('prevent self-review on, or unreadable, is reported: the owner who merges could never approve (review NB-4)', async () => {
  const rule = prevent => env(protectedEnvironment({protection_rules: [{type: 'required_reviewers', prevent_self_review: prevent, reviewers: [owner]}]}));
  assert.match((await problems(rule(true))).join(), /GATE_SELF_REVIEW/);
  assert.match((await problems(rule(undefined))).join(), /GATE_SELF_REVIEW/);
  assert.deepEqual(await problems(rule(false)), []);
});

test('a missing environment, or one GitHub created from the workflow without protection, stops the deploy', async () => {
  assert.match((await problems({[ENV_PATH]: {status: 404, body: null}})).join('\n'), /GATE_ENVIRONMENT_MISSING/);
  const created = await problems(env({name: ENVIRONMENT, can_admins_bypass: true, protection_rules: [], deployment_branch_policy: null}));
  assert.match(created.join('\n'), /GATE_ADMIN_BYPASS/);
  assert.match(created.join('\n'), /GATE_BRANCH_POLICY/);
});

test('MP-AUTODEPLOY-01: no required reviewer is needed; if one is configured it may only be the owner', async () => {
  assert.deepEqual(await problems(env(protectedEnvironment({protection_rules: [{type: 'branch_policy'}]}))), []);
  const withReviewers = reviewers => env(protectedEnvironment({protection_rules: [{type: 'required_reviewers', prevent_self_review: false, reviewers}]}));
  assert.match((await problems(withReviewers([owner, {type: 'User', reviewer: {login: 'someone-else'}}]))).join(), /GATE_UNEXPECTED_REVIEWER: User someone-else/);
  assert.match((await problems(withReviewers([{type: 'Team', reviewer: {slug: 'devs'}}]))).join(), /GATE_UNEXPECTED_REVIEWER: Team devs/);
  assert.match((await problems(withReviewers([{type: 'User'}]))).join(), /GATE_UNEXPECTED_REVIEWER/);
});

test('MP-AUTODEPLOY-01: a direct push, an unmerged or foreign PR, a missing, pending or red CI gate stop the deploy', async () => {
  const pulls = body => ({[PULLS(SHA)]: {status: 200, body}});
  const pr = o => ({merged_at: '2026-10-22T16:00:00Z', merge_commit_sha: SHA, base: {ref: 'main', repo: {full_name: REPOSITORY}}, ...o});
  for (const body of [[], [pr({merged_at: null})], [pr({merge_commit_sha: NEWER})], [pr({base: {ref: 'dev', repo: {full_name: REPOSITORY}}})], [pr({base: {ref: 'main', repo: {full_name: 'x/y'}}})]]) {
    assert.match((await problems(pulls(body))).join(), /GATE_NOT_A_MERGED_PR/, JSON.stringify(body));
  }
  assert.match((await problems({[PULLS(SHA)]: {status: 404, body: null}})).join(), /GATE_API_ERROR: pulls HTTP 404/);
  const checks = list => ({[CHECKS(SHA)]: {status: 200, body: {check_runs: list}}});
  const ck = o => ({id: 1, name: 'CI gate', head_sha: SHA, status: 'completed', conclusion: 'success', app: {slug: 'github-actions'}, ...o});
  assert.match((await problems(checks([]))).join(), /GATE_CI_MISSING/);
  assert.match((await problems(checks([ck({status: 'queued', conclusion: null})]))).join(), /GATE_CI_PENDING/);
  assert.match((await problems(checks([ck({conclusion: 'failure'})]))).join(), /GATE_CI_NOT_GREEN/);
  assert.match((await problems(checks([ck({app: {slug: 'other'}})]))).join(), /GATE_CI_MISSING/);
  assert.match((await problems(checks([ck(), ck({id: 2, conclusion: 'cancelled'})]))).join(), /GATE_CI_NOT_GREEN: cancelled/);
  // The trusted ci.yml run must itself be finished and green (it finalizes just after its last job), and be ci.yml on push/main.
  const ciRun = o => ({[`repos/${REPOSITORY}/actions/runs/7`]: {status: 200, body: {id: 7, path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: SHA,
    status: 'completed', conclusion: 'success', check_suite_id: 5, repository: {full_name: REPOSITORY}, ...o}}});
  assert.match((await problems(ciRun({status: 'in_progress', conclusion: null}))).join(), /GATE_CI_PENDING/);
  assert.match((await problems(ciRun({path: '.github/workflows/fake.yml'}))).join(), /GATE_CI_NOT_FROM_TRUSTED_WORKFLOW/);
  assert.match((await problems(ciRun({check_suite_id: 6}))).join(), /GATE_CI_CHECK_NOT_FROM_TRUSTED_WORKFLOW/);
});

test('administrators must not be able to bypass the approval; an absent setting counts as a bypass', async () => {
  assert.match((await problems(env(protectedEnvironment({can_admins_bypass: true})))).join(), /GATE_ADMIN_BYPASS: can_admins_bypass is true/);
  const {can_admins_bypass: _, ...absent} = protectedEnvironment();
  assert.match((await problems(env(absent))).join(), /GATE_ADMIN_BYPASS: can_admins_bypass is undefined/);
});

test('only main may deploy: protected branches, no policy, another branch, a tag or a pattern stop the deploy', async () => {
  const policies = list => ({[`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 200, body: {total_count: list.length, branch_policies: list}}});
  assert.match((await problems(env(protectedEnvironment({deployment_branch_policy: {protected_branches: true, custom_branch_policies: false}})))).join(), /GATE_BRANCH_POLICY/);
  assert.match((await problems(env(protectedEnvironment({deployment_branch_policy: null})))).join(), /GATE_BRANCH_POLICY: null/);
  assert.match((await problems(policies([{name: 'main', type: 'branch'}, {name: 'dev', type: 'branch'}]))).join(), /GATE_BRANCH_POLICY: branch:main, branch:dev/);
  assert.match((await problems(policies([{name: 'main', type: 'tag'}]))).join(), /GATE_BRANCH_POLICY: tag:main/);
  assert.match((await problems(policies([{name: '*', type: 'branch'}]))).join(), /GATE_BRANCH_POLICY: branch:\*/);
  assert.match((await problems(policies([]))).join(), /GATE_BRANCH_POLICY: none/);
});

test('an SHA that is no longer the tip of main, a dispatch, another ref or a fork stops the deploy', async () => {
  assert.match((await problems({[`repos/${REPOSITORY}/branches/${BRANCH}`]: {status: 200, body: {commit: {sha: NEWER}}}})).join(), /GATE_SUPERSEDED: main is b+, this run is a+/);
  assert.match((await problems({}, {event: 'workflow_dispatch'})).join(), /GATE_EVENT: workflow_dispatch/);
  assert.match((await problems({}, {ref: 'refs/heads/dev'})).join(), /GATE_REF/);
  assert.match((await problems({}, {repository: 'someone/MatchPilot'})).join(), /GATE_REPOSITORY/);
  assert.match((await problems({}, {sha: 'main'})).join(), /GATE_SHA/);
});

test('an unreadable answer fails closed: 403, 500, a network error, a malformed main', async () => {
  assert.match((await problems({[ENV_PATH]: {status: 403, body: null}})).join('\n'), /GATE_API_ERROR: environment HTTP 403[\s\S]*GATE_ENVIRONMENT_MISSING/);
  assert.match((await problems({[ENV_PATH]: new Error('ECONNRESET')})).join(), /GATE_API_ERROR: environment ECONNRESET/);
  assert.match((await problems({[`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 500, body: null}})).join(), /GATE_API_ERROR: branch policies HTTP 500/);
  assert.match((await problems({[`repos/${REPOSITORY}/branches/${BRANCH}`]: {status: 200, body: {commit: {}}}})).join(), /GATE_MAIN_UNREADABLE/);
  assert.match((await problems({[`repos/${REPOSITORY}/branches/${BRANCH}`]: new Error('timeout')})).join(), /GATE_API_ERROR: main timeout/);
});

// ---- the CLI as the workflow runs it, against a local fake of the GitHub API ----
async function withFakeGithub(routes, fn) {
  const server = createServer((req, res) => {
    const path = req.url.replace(/^\//, '');
    const route = routes[path];
    const auth = req.headers.authorization === 'Bearer t0ken';
    res.writeHead(!auth ? 401 : route ? route.status : 404, {'content-type': 'application/json'});
    res.end(JSON.stringify(auth && route ? route.body : {message: 'Not Found'}));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
// Asynchronous: the fake API answers from this same process.
const cli = (base, extra = {}) => new Promise(resolve => {
  const child = spawn(process.execPath, ['scripts/deploy-gate.mjs'], {env: {PATH: process.env.PATH, GITHUB_API_URL: base,
    GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_SHA: SHA, GH_TOKEN: 't0ken', ...extra}});
  let stdout = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  // A run without a JSON report (a crash) resolves with report null: the assertions fail instead of the test hanging.
  child.on('close', status => { let report = null; try { report = JSON.parse(stdout); } catch {} resolve({status, report}); });
});

const ROUTES = {
  [ENV_PATH]: {status: 200, body: protectedEnvironment()},
  [`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 200, body: {branch_policies: [{name: 'main', type: 'branch'}]}},
  [`repos/${REPOSITORY}/branches/main`]: {status: 200, body: {commit: {sha: SHA}}},
  ...merged(SHA),
};

test('CLI: PASS exits 0; a missing environment, a bad token or no token exits 1 with the reason', async () => {
  const routes = ROUTES;
  await withFakeGithub(routes, async base => {
    const pass = await cli(base);
    assert.equal(pass.status, 0, JSON.stringify(pass.report));
    assert.equal(pass.report.result, 'PASS');
    const wrongToken = await cli(base, {GH_TOKEN: 'other'});
    assert.equal(wrongToken.status, 1);
    assert.match(wrongToken.report.problems.join(), /GATE_API_ERROR: environment HTTP 401/);
    const noToken = await cli(base, {GH_TOKEN: ''});
    assert.equal(noToken.status, 1);
    assert.match(noToken.report.problems.join(), /GATE_ERROR: GH_TOKEN is not set/);
  });
  await withFakeGithub({[`repos/${REPOSITORY}/branches/main`]: routes[`repos/${REPOSITORY}/branches/main`]}, async base => {
    const missing = await cli(base);
    assert.equal(missing.status, 1);
    assert.match(missing.report.problems.join(), /GATE_ENVIRONMENT_MISSING/);
  });
});

test('the report lists what GitHub returned, never the token', async () => {
  await withFakeGithub(ROUTES, async base => {
    const pass = await cli(base);
    assert.deepEqual(pass.report.observed, {environment: {can_admins_bypass: false,
      required_reviewers: [{prevent_self_review: false, reviewers: ['User:zarbopiero963-droid']}],
      deployment_branch_policy: {protected_branches: false, custom_branch_policies: true}, branch_policies: ['branch:main']}, main: SHA});
    assert.doesNotMatch(JSON.stringify(pass.report), /t0ken/);
  });
});

test('NB-11: an answer of an unexpected shape still gives a full report, and FAIL', async () => {
  const odd = {...ROUTES, [ENV_PATH]: {status: 200, body: protectedEnvironment({protection_rules: [{type: 'required_reviewers', prevent_self_review: false, reviewers: 'x'}]})}};
  await withFakeGithub(odd, async base => {
    const result = await cli(base);
    assert.equal(result.status, 1);
    assert.equal(result.report.result, 'FAIL');
    assert.match(result.report.problems.join(), /GATE_REVIEWERS_UNREADABLE/);
    assert.ok(result.report.observed, 'the report is written');
  });
  await withFakeGithub({...ROUTES, [`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 200, body: {branch_policies: {}}}}, async base => {
    const result = await cli(base);
    assert.equal(result.status, 1);
    assert.equal(result.report.result, 'FAIL');
  });
});

// Review NB-2: the entry check compared an encoded URL with a plain path, so from a path with spaces the script exited
// 0 without checking anything. Run from such a path, and through a symlink, it must still check and fail closed.
test('CLI: from a path with spaces or through a symlink the checks still run', async () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'deploy gate ')), 'a b');
  execFileSync('mkdir', ['-p', dir]);
  const copy = join(dir, 'deploy-gate.mjs');
  writeFileSync(copy, readFileSync(new URL('../scripts/deploy-gate.mjs', import.meta.url)));
  writeFileSync(join(dir, 'deploy-authz.mjs'), readFileSync(new URL('../scripts/deploy-authz.mjs', import.meta.url)));
  symlinkSync(copy, join(dir, 'linked gate.mjs'));
  for (const script of [copy, join(dir, 'linked gate.mjs')]) {
    const result = spawnSync(process.execPath, [script], {encoding: 'utf8', env: {PATH: process.env.PATH, GITHUB_SHA: SHA}});
    assert.equal(result.status, 1, `${script}: ${result.stdout}${result.stderr}`);
    assert.match(JSON.parse(result.stdout).problems.join(), /GATE_ERROR: GH_TOKEN is not set/);
  }
});

// ---- the post-approval step of the deploy job, extracted from the workflow and run on a simulated VPS: the step's own
// bash, the gate script installed by root (here: a copy of this repository's in a temporary directory that stands for
// /usr/local/libexec/mp-gate), the real node, a fake API ----
const WORKFLOW = readFileSync(new URL('../.github/workflows/deploy-vps.yml', import.meta.url), 'utf8');
const INSTALLED = '/usr/local/libexec/mp-gate/';
// The step's own bash; `installed` replaces the root-owned directory in the text only (the workflow itself is unchanged).
function stepScript(name, installed = INSTALLED) {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex(line => line.trim() === `- name: ${name}`);
  const runAt = lines.findIndex((line, i) => i > at && line.trim() === 'run: |');
  const body = [];
  for (const line of lines.slice(runAt + 1)) { if (!line.startsWith('          ')) break; body.push(line.slice(10)); }
  return body.join('\n').replaceAll(INSTALLED, installed);
}
const GATE_SOURCE = new URL('../scripts/deploy-gate.mjs', import.meta.url).pathname;
function vps({gate = 'installed', tools = ['node', 'grep', 'cat']} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-vps-'));
  const bin = join(dir, 'bin');
  const installed = join(dir, 'mp-gate');
  execFileSync('mkdir', [bin, join(dir, 'tmp'), installed]);
  const real = tool => execFileSync('bash', ['-c', `command -v ${tool}`], {encoding: 'utf8'}).trim();
  for (const tool of tools) symlinkSync(tool === 'node' ? process.execPath : real(tool), join(bin, tool));
  if (gate === 'installed') writeFileSync(join(installed, 'deploy-gate.mjs'), readFileSync(GATE_SOURCE), {flag: 'wx'});
  // MP-AUTODEPLOY-01: the installed gate imports the installed deploy-authz.mjs (root installs both, §8.2).
  if (gate === 'installed') writeFileSync(join(installed, 'deploy-authz.mjs'), readFileSync(new URL('../scripts/deploy-authz.mjs', import.meta.url)), {flag: 'wx'});
  else if (gate !== 'missing') writeFileSync(join(installed, 'deploy-gate.mjs'), gate, {flag: 'wx'});
  return {bin, tmp: join(dir, 'tmp'), installed: `${installed}/`};
}
async function postApproval({routes = ROUTES, deploySha = SHA, ...options} = {}) {
  return withFakeGithub(routes, base => new Promise(resolve => {
    const {bin, tmp, installed} = vps(options);
    const child = spawn('/bin/bash', ['-e', '-c', stepScript("Gate dopo l'approvazione", installed)], {env: {PATH: bin, RUNNER_TEMP: tmp,
      DEPLOY_SHA: deploySha, GH_TOKEN: 't0ken', GITHUB_API_URL: base, GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'push', GITHUB_SHA: deploySha}});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('close', status => resolve({status, out}));
  }));
}

test('after approval, at every attempt: the gate installed by root runs again on the VPS before mp-deploy', async () => {
  const ok = await postApproval();
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /"result": "PASS"[\s\S]*DEPLOY_GATE_SHA_OK a+/);
  // Re-run of the deploy job alone after the environment lost its protection (review NB-1): the step checks again.
  const unprotected = await postApproval({routes: {...ROUTES, [ENV_PATH]: {status: 200, body: {name: ENVIRONMENT, can_admins_bypass: true, protection_rules: [], deployment_branch_policy: null}}}});
  assert.equal(unprotected.status, 1);
  assert.match(unprotected.out, /GATE_ADMIN_BYPASS[\s\S]*DEPLOY_GATE_FAIL/);
  // An older run approved after a newer merge.
  const stale = await postApproval({routes: {...ROUTES, [`repos/${REPOSITORY}/branches/main`]: {status: 200, body: {commit: {sha: NEWER}}}}});
  assert.equal(stale.status, 1);
  assert.match(stale.out, /GATE_SUPERSEDED[\s\S]*DEPLOY_GATE_FAIL/);
  const missing = await postApproval({routes: {[`repos/${REPOSITORY}/branches/main`]: ROUTES[`repos/${REPOSITORY}/branches/main`]}});
  assert.equal(missing.status, 1);
  assert.match(missing.out, /GATE_ENVIRONMENT_MISSING/);
});

test('after approval: no node, no installed gate or a gate that does not say PASS stops the deploy', async () => {
  for (const tool of ['node', 'grep']) {
    const result = await postApproval({tools: ['node', 'grep', 'cat'].filter(item => item !== tool)});
    assert.equal(result.status, 1, tool);
    assert.match(result.out, new RegExp(`DEPLOY_GATE_MISSING_TOOL: ${tool}`));
  }
  const missing = await postApproval({gate: 'missing'});
  assert.equal(missing.status, 1);
  assert.match(missing.out, /DEPLOY_GATE_NOT_INSTALLED/);
  // A script that exits 0 without checking anything (the NB-2 failure mode) is not a PASS.
  const silent = await postApproval({gate: 'process.exitCode = 0;\n'});
  assert.equal(silent.status, 1);
  assert.match(silent.out, /DEPLOY_GATE_FAIL/);
  const empty = await postApproval({deploySha: ''});
  assert.equal(empty.status, 1);
});

// PR #181 hardening (owner, point 4): the security code run on the VPS is the root-installed, pinned copy, never code
// taken from the approved commit. RED on 5e79bfc: the steps downloaded scripts/deploy-gate.mjs from the commit.
test('on the VPS the gate is the root-installed copy: nothing is downloaded from the approved commit', () => {
  for (const name of ["Gate dopo l'approvazione", 'mp-deploy']) {
    const script = stepScript(name);
    assert.match(script, /^ *gate=\/usr\/local\/libexec\/mp-gate\/deploy-gate\.mjs$/m, name);
    assert.doesNotMatch(script, /raw\.githubusercontent|scripts\/deploy-gate|\$RUNNER_TEMP\/deploy-gate-|\$DEPLOY_SHA\/|git (clone|fetch|checkout)/, name);
  }
  assert.match(stepScript("Gate dopo l'approvazione"), /\[ -f "\$gate" \] \|\| \{ echo "DEPLOY_GATE_NOT_INSTALLED"; exit 1; \}/);
  const deployJob = WORKFLOW.slice(WORKFLOW.indexOf('\n  deploy:'));
  assert.doesNotMatch(deployJob, /uses:|actions\/checkout/, 'the deploy job checks out nothing');
});

test('the gate job step also requires an explicit PASS', () => {
  const script = stepScript('Environment vps-production protetto e SHA ancora su main');
  assert.match(script, /node scripts\/deploy-gate\.mjs > "\$RUNNER_TEMP\/deploy-gate\.json" \|\|/);
  assert.match(script, /grep -q '"result": "PASS"' "\$RUNNER_TEMP\/deploy-gate\.json" \|\| \{ echo "DEPLOY_GATE_FAIL"; exit 1; \}/);
  assert.match(script, /^set -euo pipefail/);
});

// ---- the mp-deploy step on a simulated VPS: a fake OIDC endpoint (curl), a fake sudo/mp-deploy, the real node ----
function mpDeployStepSetup({oidc = 'ok', results = [0], mktemp = 'real', preexisting = false, sudoDelay = 0, gate = []} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-step-'));
  const bin = join(dir, 'bin');
  execFileSync('mkdir', [bin]);
  // Fake tools are created with 'wx' (never through an existing symlink: a write through one would replace the real
  // binary when the tests run as root, as happened to /usr/bin/sleep in a container on 21/10).
  for (const tool of ['cat', 'stat', 'rm', 'grep', ...(mktemp === 'real' ? ['mktemp'] : [])]) symlinkSync(execFileSync('bash', ['-c', `command -v ${tool}`], {encoding: 'utf8'}).trim(), join(bin, tool));
  symlinkSync(process.execPath, join(bin, 'node'));
  writeFileSync(join(bin, 'sleep'), '#!/bin/bash\nexit 0\n', {flag: 'wx'}); chmodSync(join(bin, 'sleep'), 0o755);
  execFileSync('mkdir', [join(dir, 'tmp')]);
  // The root-installed gate script: here a stand-in that answers, call after call,
  // PASS or a superseded SHA as told by `gate` (PASS once the list is used up), and counts its calls.
  execFileSync('mkdir', [join(dir, 'mp-gate')]);
  writeFileSync(join(dir, 'mp-gate', 'deploy-gate.mjs'), `import {readFileSync, writeFileSync} from 'node:fs';
const file = ${JSON.stringify(join(dir, 'gate-calls'))};
let n = 0; try { n = Number(readFileSync(file, 'utf8')); } catch {}
writeFileSync(file, String(n + 1));
const answer = ${JSON.stringify(gate)}[n] ?? 'PASS';
const problems = answer === 'PASS' ? [] : ['GATE_SUPERSEDED: main is ${NEWER}, this run is ${SHA}'];
console.log(JSON.stringify({result: problems.length ? 'FAIL' : 'PASS', problems}, null, 2));
process.exitCode = problems.length ? 1 : 0;
`, {flag: 'wx'});
  // A fake mktemp that fails, or that hands back a directory where the header file already exists (a collision).
  if (mktemp === 'fail') { writeFileSync(join(bin, 'mktemp'), '#!/bin/bash\nexit 1\n', {flag: 'wx'}); chmodSync(join(bin, 'mktemp'), 0o755); }
  if (mktemp === 'collision') {
    execFileSync('mkdir', ['-m', '700', join(dir, 'tmp', 'oidc.taken')]);
    writeFileSync(join(dir, 'tmp', 'oidc.taken', 'request-header'), 'Authorization: bearer attacker\n', {mode: 0o644});
    writeFileSync(join(bin, 'mktemp'), `#!/bin/bash\necho ${join(dir, 'tmp', 'oidc.taken')}\n`, {flag: 'wx'}); chmodSync(join(bin, 'mktemp'), 0o755);
  }
  // A stale, world-readable header file at a predictable path must be neither used nor trusted.
  if (preexisting) writeFileSync(join(dir, 'tmp', 'oidc-request-header'), 'Authorization: bearer stale\n', {mode: 0o644});
  const log = join(dir, 'log');
  writeFileSync(log, '');
  // Each OIDC request returns a new token; the URL must carry the audience.
  const curl = oidc === 'ok'
    // The request token must come from the 0600 header file, never from argv (review NB-16).
    // The header file must be 0600 in a 0700 directory made for this step (review NB-21); its path is recorded.
    ? `n=$(( $(/bin/cat ${dir}/n 2>/dev/null || echo 0) + 1 )); echo $n > ${dir}/n; for a in "$@"; do case "$a" in *request-token*) echo argv >> ${dir}/leak; exit 22;; *audience=matchpilot-vps-deploy) ok=1;; @*) h="\${a#@}";; esac; done; [ "$ok" = 1 ] || exit 22; [ "$(/bin/cat "$h")" = "Authorization: bearer request-token" ] || exit 22; [ "$(stat -c %a "$h")" = 600 ] || exit 22; [ "$(stat -c %a "\${h%/*}")" = 700 ] || exit 22; echo "$h" >> ${dir}/headers; echo "{\\"value\\":\\"tok-$n\\"}"`
    : oidc;
  writeFileSync(join(bin, 'curl'), `#!/bin/bash\n${curl}\n`, {flag: 'wx'}); chmodSync(join(bin, 'curl'), 0o755);
  // sudo -n /usr/local/sbin/mp-deploy <sha>: records the argument and the token read on stdin, then exits as told.
  writeFileSync(join(bin, 'sudo'), `#!/bin/bash\nk=$(( $(/bin/cat ${dir}/k 2>/dev/null || echo 0) + 1 )); echo $k > ${dir}/k\ntok=$(/bin/cat)\n${sudoDelay ? `: > ${dir}/started; /usr/bin/sleep ${sudoDelay}\n` : ''}printf '%s token=%s\\n' "$*" "$tok" >> ${log}\nset -- ${results.join(' ')}\nshift $((k-1)); exit \${1:-0}\n`, {flag: 'wx'});
  chmodSync(join(bin, 'sudo'), 0o755);
  const env = {PATH: bin, DEPLOY_SHA: SHA, RUNNER_TEMP: join(dir, 'tmp'), GH_TOKEN: 't0ken',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/token?api-version=2.0', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token'};
  const report = () => ({calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean), leftover: readdirSync(join(dir, 'tmp')).filter(name => !name.startsWith('deploy-gate')).sort(),
    gateCalls: (() => { try { return Number(readFileSync(join(dir, 'gate-calls'), 'utf8')); } catch { return 0; } })(),
    headers: (() => { try { return readFileSync(join(dir, 'headers'), 'utf8').trim().split('\n'); } catch { return []; } })()});
  return {dir, env, report, installed: join(dir, 'mp-gate/')};
}
function mpDeployStep(options = {}) {
  const {env, report, installed} = mpDeployStepSetup(options);
  const result = spawnSync('/bin/bash', ['-e', '-c', stepScript('mp-deploy', installed)], {encoding: 'utf8', env});
  return {status: result.status, out: result.stdout + result.stderr, ...report()};
}

test('mp-deploy step: each try sends a new OIDC token on stdin; without a token nothing is deployed', () => {
  const once = mpDeployStep();
  assert.equal(once.status, 0, once.out);
  assert.deepEqual(once.leftover, [], 'the request header file is removed');
  assert.deepEqual(once.calls, [`-n /usr/local/sbin/mp-deploy ${SHA} token=tok-1`]);
  // Lock busy (75) twice, then deployed: three tries, three different tokens, same SHA.
  const retried = mpDeployStep({results: [75, 75, 0]});
  assert.equal(retried.status, 0, retried.out);
  assert.deepEqual(retried.calls, [1, 2, 3].map(n => `-n /usr/local/sbin/mp-deploy ${SHA} token=tok-${n}`));
  const refused = mpDeployStep({results: [3]});
  assert.equal(refused.status, 3);
  for (const [what, oidc] of [['endpoint down', 'exit 22'], ['no value', 'echo "{}"'], ['not JSON', 'echo nope'], ['empty value', 'echo "{\\"value\\":\\"\\"}"']]) {
    const result = mpDeployStep({oidc});
    assert.equal(result.status, 1, what);
    assert.match(result.out, /DEPLOY_OIDC_UNAVAILABLE/, what);
    assert.deepEqual(result.calls, [], `${what}: mp-deploy not called`);
  }
});

test('NB-21: the request header lives in a private directory, is never reused or clobbered, and is removed in every case', async () => {
  const ok = mpDeployStep();
  assert.equal(ok.status, 0, ok.out);
  assert.equal(ok.headers.length, 1);
  assert.match(ok.headers[0], /\/tmp\/oidc\.[A-Za-z0-9]{8}\/request-header$/, 'a unique directory for this step');
  assert.deepEqual(ok.leftover, [], 'removed after success');
  // A failure after the header was written (mp-deploy refuses), and an OIDC failure: removed too.
  assert.deepEqual(mpDeployStep({results: [3]}).leftover, []);
  assert.deepEqual(mpDeployStep({oidc: 'exit 22'}).leftover, []);
  // A stale world-readable file at a predictable path is not used, and stays untouched.
  const stale = mpDeployStep({preexisting: true});
  assert.equal(stale.status, 0, stale.out);
  assert.doesNotMatch(stale.headers[0], /tmp\/oidc-request-header$/);
  assert.deepEqual(stale.leftover, ['oidc-request-header']);
  // No private directory: stop before any request or deploy.
  const noDir = mpDeployStep({mktemp: 'fail'});
  assert.equal(noDir.status, 1);
  assert.match(noDir.out, /DEPLOY_OIDC_UNAVAILABLE: no private directory/);
  assert.deepEqual(noDir.calls, []);
  // A collision (the header file already there, readable by others): noclobber refuses to write it, nothing is deployed.
  const taken = mpDeployStep({mktemp: 'collision'});
  assert.equal(taken.status, 1);
  assert.match(taken.out, /DEPLOY_OIDC_UNAVAILABLE: header file/);
  assert.deepEqual(taken.calls, []);
  // A signal while mp-deploy runs: the step ends and the private directory is removed.
  const {dir, env, report, installed} = mpDeployStepSetup({sudoDelay: 2});
  const child = spawn('/bin/bash', ['-e', '-c', stepScript('mp-deploy', installed)], {env});
  const deadline = Date.now() + 10000;
  while (!existsSync(join(dir, 'started')) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(report().leftover.length, 1, 'the private directory exists while mp-deploy runs');
  child.kill('SIGTERM');
  const code = await new Promise(resolve => child.on('close', resolve));
  assert.notEqual(code, 0);
  assert.deepEqual(report().leftover, [], 'removed after SIGTERM');
});

// MP-GATE-S1S2-FIX, anti-stale in the workflow: the lock was busy (75) and main moved meanwhile. Before the next try the
// gate of the approved SHA runs again, so the run stops before asking for another token. Before this fix the step retried
// with a new token for the superseded SHA (RED on e127c26: 2 calls to mp-deploy).
test('anti-stale: before every retry the gate runs again; a merge while the lock was busy stops the run', () => {
  const first = mpDeployStep({results: [0]});
  assert.equal(first.status, 0, first.out);
  assert.equal(first.gateCalls, 0, 'the first try follows the post-approval gate step: no second check');
  const moved = mpDeployStep({results: [75, 0], gate: ['SUPERSEDED']});
  assert.equal(moved.status, 1, moved.out);
  assert.match(moved.out, /GATE_SUPERSEDED[\s\S]*DEPLOY_GATE_FAIL/);
  assert.deepEqual(moved.calls, [`-n /usr/local/sbin/mp-deploy ${SHA} token=tok-1`], 'no second token, no second call');
  assert.deepEqual(moved.leftover, [], 'the request header is removed');
  // Still the tip after two busy locks: two checks, three tries.
  const busy = mpDeployStep({results: [75, 75, 0]});
  assert.equal(busy.status, 0, busy.out);
  assert.equal(busy.gateCalls, 2);
  assert.equal(busy.calls.length, 3);
  // mp-deploy v3.1 refusing a stale SHA under its lock (79) is not retried.
  const stale = mpDeployStep({results: [79, 0]});
  assert.equal(stale.status, 79);
  assert.equal(stale.calls.length, 1);
  assert.equal(stale.gateCalls, 0);
});

test('anti-stale: a superseded run says on its page which run to approve instead; a current one writes nothing', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'summary-'));
  await withFakeGithub({...ROUTES, [`repos/${REPOSITORY}/branches/main`]: {status: 200, body: {commit: {sha: NEWER}}}}, async base => {
    const summary = join(dir, 'stale.md');
    const result = await cli(base, {GITHUB_STEP_SUMMARY: summary});
    assert.equal(result.status, 1);
    const text = readFileSync(summary, 'utf8');
    assert.match(text, /Run obsoleto: non approvarlo/);
    assert.match(text, new RegExp(`distribuirebbe \`${SHA}\`, ma l'ultimo commit di main è \`${NEWER}\``));
  });
  await withFakeGithub(ROUTES, async base => {
    const summary = join(dir, 'current.md');
    const result = await cli(base, {GITHUB_STEP_SUMMARY: summary});
    assert.equal(result.status, 0);
    assert.equal(existsSync(summary), false);
  });
});
