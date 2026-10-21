// MP-DEPLOY-APPROVAL-01: the deploy gate (scripts/deploy-gate.mjs) and the post-approval SHA check of deploy-vps.yml.
// Simulated: a fake GitHub API and a fake git on PATH. What only GitHub can show (that the deploy job really waits for
// the approval, that a re-run asks for it again) is verified at activation, per docs/deploy-approval.md.
import assert from 'node:assert/strict';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {chmodSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
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

test('a push to main with vps-production protected by the owner only, no admin bypass and only main passes', async () => {
  assert.deepEqual(await problems(), []);
  // prevent_self_review must stay off: the owner both merges and approves (docs/deploy-approval.md).
  assert.deepEqual(await problems(env(protectedEnvironment({protection_rules: [{type: 'required_reviewers', prevent_self_review: true, reviewers: [owner]}]}))), []);
});

test('a missing environment, or one GitHub created from the workflow without protection, stops the deploy', async () => {
  assert.match((await problems({[ENV_PATH]: {status: 404, body: null}})).join('\n'), /GATE_ENVIRONMENT_MISSING/);
  // What GitHub creates when a workflow names an environment that does not exist.
  const created = await problems(env({name: ENVIRONMENT, can_admins_bypass: true, protection_rules: [], deployment_branch_policy: null}));
  assert.match(created.join('\n'), /GATE_NO_REQUIRED_REVIEWERS/);
  assert.match(created.join('\n'), /GATE_ADMIN_BYPASS/);
  assert.match(created.join('\n'), /GATE_BRANCH_POLICY/);
  // A wait timer alone is not an approval.
  assert.match((await problems(env(protectedEnvironment({protection_rules: [{type: 'wait_timer', wait_timer: 30}]})))).join(), /GATE_NO_REQUIRED_REVIEWERS/);
});

test('only the owner may approve: another user, a team, an empty list or an unreadable entry stops the deploy', async () => {
  const withReviewers = reviewers => env(protectedEnvironment({protection_rules: [{type: 'required_reviewers', reviewers}]}));
  assert.match((await problems(withReviewers([owner, {type: 'User', reviewer: {login: 'someone-else'}}]))).join(), /GATE_UNEXPECTED_REVIEWER: User someone-else/);
  assert.match((await problems(withReviewers([{type: 'Team', reviewer: {slug: 'devs'}}]))).join(), /GATE_UNEXPECTED_REVIEWER: Team devs/);
  assert.match((await problems(withReviewers([]))).join(), /GATE_NO_REQUIRED_REVIEWERS/);
  assert.match((await problems(withReviewers([{type: 'User'}]))).join(), /GATE_UNEXPECTED_REVIEWER/);
  assert.match((await problems(env(protectedEnvironment({protection_rules: 'x'})))).join(), /GATE_NO_REQUIRED_REVIEWERS/);
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
  child.on('close', status => resolve({status, report: JSON.parse(stdout)}));
});

test('CLI: PASS exits 0; a missing environment, a bad token or no token exits 1 with the reason', async () => {
  const routes = {
    [ENV_PATH]: {status: 200, body: protectedEnvironment()},
    [`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 200, body: {branch_policies: [{name: 'main', type: 'branch'}]}},
    [`repos/${REPOSITORY}/branches/main`]: {status: 200, body: {commit: {sha: SHA}}},
  };
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

// ---- the post-approval step of the deploy job, extracted from the workflow and run with a fake git ----
const WORKFLOW = readFileSync(new URL('../.github/workflows/deploy-vps.yml', import.meta.url), 'utf8');
function shaStep() {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex(line => line.trim() === '- name: SHA approvato ancora su main');
  const runAt = lines.findIndex((line, i) => i > at && line.trim() === 'run: |');
  const body = [];
  for (const line of lines.slice(runAt + 1)) { if (!line.startsWith('          ')) break; body.push(line.slice(10)); }
  return body.join('\n');
}
function runShaStep({gitScript, deploySha = SHA}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-sha-'));
  const bin = join(dir, 'bin');
  execFileSync('mkdir', [bin]);
  for (const tool of ['cut', 'timeout', 'env', 'cat']) symlinkSync(execFileSync('bash', ['-c', `command -v ${tool}`], {encoding: 'utf8'}).trim(), join(bin, tool));
  if (gitScript) { writeFileSync(join(bin, 'git'), `#!/bin/bash\n${gitScript}\n`); chmodSync(join(bin, 'git'), 0o755); }
  const result = spawnSync('/bin/bash', ['-e', '-c', shaStep()], {encoding: 'utf8', env: {PATH: bin, DEPLOY_SHA: deploySha}});
  return {status: result.status, out: result.stdout + result.stderr};
}

test('after approval: the deploy goes on only when the approved SHA is still the tip of main', () => {
  assert.match(shaStep(), /git ls-remote --exit-code https:\/\/github\.com\/zarbopiero963-droid\/MatchPilot\.git refs\/heads\/main/);
  const same = runShaStep({gitScript: `echo "${SHA}\trefs/heads/main"`});
  assert.equal(same.status, 0, same.out);
  assert.match(same.out, /DEPLOY_GATE_SHA_OK a+/);
  const newer = runShaStep({gitScript: `echo "${NEWER}\trefs/heads/main"`});
  assert.equal(newer.status, 1);
  assert.match(newer.out, /DEPLOY_GATE_STALE_SHA/);
  const failing = runShaStep({gitScript: 'echo "fatal: unable to access" >&2; exit 128'});
  assert.equal(failing.status, 1);
  assert.match(failing.out, /DEPLOY_GATE_MAIN_UNREADABLE/);
  const missingRef = runShaStep({gitScript: 'exit 2'});
  assert.equal(missingRef.status, 1);
  assert.match(missingRef.out, /DEPLOY_GATE_MAIN_UNREADABLE/);
  const noGit = runShaStep({gitScript: null});
  assert.equal(noGit.status, 1);
  assert.match(noGit.out, /DEPLOY_GATE_NO_GIT/);
  const emptySha = runShaStep({gitScript: `echo "${SHA}\trefs/heads/main"`, deploySha: ''});
  assert.equal(emptySha.status, 1);
});
