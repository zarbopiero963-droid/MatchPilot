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
});

test('prevent self-review on, or unreadable, is reported: the owner who merges could never approve (review NB-4)', async () => {
  const rule = prevent => env(protectedEnvironment({protection_rules: [{type: 'required_reviewers', prevent_self_review: prevent, reviewers: [owner]}]}));
  assert.match((await problems(rule(true))).join(), /GATE_SELF_REVIEW/);
  assert.match((await problems(rule(undefined))).join(), /GATE_SELF_REVIEW/);
  assert.deepEqual(await problems(rule(false)), []);
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
  // A run without a JSON report (a crash) resolves with report null: the assertions fail instead of the test hanging.
  child.on('close', status => { let report = null; try { report = JSON.parse(stdout); } catch {} resolve({status, report}); });
});

const ROUTES = {
  [ENV_PATH]: {status: 200, body: protectedEnvironment()},
  [`${ENV_PATH}/deployment-branch-policies?per_page=100`]: {status: 200, body: {branch_policies: [{name: 'main', type: 'branch'}]}},
  [`repos/${REPOSITORY}/branches/main`]: {status: 200, body: {commit: {sha: SHA}}},
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
    assert.match(result.report.problems.join(), /GATE_NO_REQUIRED_REVIEWERS/);
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
  symlinkSync(copy, join(dir, 'linked gate.mjs'));
  for (const script of [copy, join(dir, 'linked gate.mjs')]) {
    const result = spawnSync(process.execPath, [script], {encoding: 'utf8', env: {PATH: process.env.PATH, GITHUB_SHA: SHA}});
    assert.equal(result.status, 1, `${script}: ${result.stdout}${result.stderr}`);
    assert.match(JSON.parse(result.stdout).problems.join(), /GATE_ERROR: GH_TOKEN is not set/);
  }
});

// ---- the post-approval step of the deploy job, extracted from the workflow and run on a simulated VPS: the step's own
// bash, a fake curl that serves this repository's gate script for the approved SHA only, the real node, a fake API ----
const WORKFLOW = readFileSync(new URL('../.github/workflows/deploy-vps.yml', import.meta.url), 'utf8');
function stepScript(name) {
  const lines = WORKFLOW.split('\n');
  const at = lines.findIndex(line => line.trim() === `- name: ${name}`);
  const runAt = lines.findIndex((line, i) => i > at && line.trim() === 'run: |');
  const body = [];
  for (const line of lines.slice(runAt + 1)) { if (!line.startsWith('          ')) break; body.push(line.slice(10)); }
  return body.join('\n');
}
const GATE_SOURCE = new URL('../scripts/deploy-gate.mjs', import.meta.url).pathname;
function vps({curl = 'serve', tools = ['node', 'curl', 'grep', 'cat']} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-vps-'));
  const bin = join(dir, 'bin');
  execFileSync('mkdir', [bin, join(dir, 'tmp')]);
  const real = tool => execFileSync('bash', ['-c', `command -v ${tool}`], {encoding: 'utf8'}).trim();
  for (const tool of tools.filter(tool => tool !== 'curl')) symlinkSync(tool === 'node' ? process.execPath : real(tool), join(bin, tool));
  if (tools.includes('curl')) {
    const body = curl === 'serve'
      ? `out=""; url=""; while [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift 2;; --proto|--max-time) shift 2;; -*) shift;; *) url="$1"; shift;; esac; done
         [ "$url" = "https://raw.githubusercontent.com/zarbopiero963-droid/MatchPilot/$DEPLOY_SHA/scripts/deploy-gate.mjs" ] || { echo "curl: (22) 404" >&2; exit 22; }
         /bin/cp "${GATE_SOURCE}" "$out"`
      : curl;
    writeFileSync(join(bin, 'curl'), `#!/bin/bash\n${body}\n`);
    chmodSync(join(bin, 'curl'), 0o755);
  }
  return {bin, tmp: join(dir, 'tmp')};
}
async function postApproval({routes = ROUTES, deploySha = SHA, ...options} = {}) {
  return withFakeGithub(routes, base => new Promise(resolve => {
    const {bin, tmp} = vps(options);
    const child = spawn('/bin/bash', ['-e', '-c', stepScript("Gate dopo l'approvazione")], {env: {PATH: bin, RUNNER_TEMP: tmp,
      DEPLOY_SHA: deploySha, GH_TOKEN: 't0ken', GITHUB_API_URL: base, GITHUB_REPOSITORY: REPOSITORY, GITHUB_REF: 'refs/heads/main',
      GITHUB_EVENT_NAME: 'push', GITHUB_SHA: deploySha}});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.stderr.on('data', chunk => { out += chunk; });
    child.on('close', status => resolve({status, out}));
  }));
}

test('after approval, at every attempt: the gate runs again on the VPS from the approved SHA before mp-deploy', async () => {
  const ok = await postApproval();
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /"result": "PASS"[\s\S]*DEPLOY_GATE_SHA_OK a+/);
  // Re-run of the deploy job alone after the environment lost its protection (review NB-1): the step checks again.
  const unprotected = await postApproval({routes: {...ROUTES, [ENV_PATH]: {status: 200, body: {name: ENVIRONMENT, can_admins_bypass: true, protection_rules: [], deployment_branch_policy: null}}}});
  assert.equal(unprotected.status, 1);
  assert.match(unprotected.out, /GATE_NO_REQUIRED_REVIEWERS[\s\S]*DEPLOY_GATE_FAIL/);
  // An older run approved after a newer merge.
  const stale = await postApproval({routes: {...ROUTES, [`repos/${REPOSITORY}/branches/main`]: {status: 200, body: {commit: {sha: NEWER}}}}});
  assert.equal(stale.status, 1);
  assert.match(stale.out, /GATE_SUPERSEDED[\s\S]*DEPLOY_GATE_FAIL/);
  const missing = await postApproval({routes: {[`repos/${REPOSITORY}/branches/main`]: ROUTES[`repos/${REPOSITORY}/branches/main`]}});
  assert.equal(missing.status, 1);
  assert.match(missing.out, /GATE_ENVIRONMENT_MISSING/);
});

test('after approval: no node, no curl, an unreadable script or a script that does not say PASS stops the deploy', async () => {
  for (const tool of ['node', 'curl', 'grep']) {
    const result = await postApproval({tools: ['node', 'curl', 'grep', 'cat'].filter(item => item !== tool)});
    assert.equal(result.status, 1, tool);
    assert.match(result.out, new RegExp(`DEPLOY_GATE_MISSING_TOOL: ${tool}`));
  }
  const unreadable = await postApproval({curl: 'echo "curl: (6) Could not resolve host" >&2; exit 6'});
  assert.equal(unreadable.status, 1);
  assert.match(unreadable.out, /DEPLOY_GATE_SCRIPT_UNREADABLE/);
  // A script that exits 0 without checking anything (the NB-2 failure mode) is not a PASS.
  const silent = await postApproval({curl: 'while [ $# -gt 0 ]; do [ "$1" = -o ] && out="$2"; shift; done; echo "process.exitCode = 0;" > "$out"'});
  assert.equal(silent.status, 1);
  assert.match(silent.out, /DEPLOY_GATE_FAIL/);
  const empty = await postApproval({deploySha: ''});
  assert.equal(empty.status, 1);
});

test('the gate job step also requires an explicit PASS', () => {
  const script = stepScript('Environment vps-production protetto e SHA ancora su main');
  assert.match(script, /node scripts\/deploy-gate\.mjs > "\$RUNNER_TEMP\/deploy-gate\.json" \|\|/);
  assert.match(script, /grep -q '"result": "PASS"' "\$RUNNER_TEMP\/deploy-gate\.json" \|\| \{ echo "DEPLOY_GATE_FAIL"; exit 1; \}/);
  assert.match(script, /^set -euo pipefail/);
});

// ---- the mp-deploy step on a simulated VPS: a fake OIDC endpoint (curl), a fake sudo/mp-deploy, the real node ----
function mpDeployStep({oidc = 'ok', results = [0]} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'deploy-step-'));
  const bin = join(dir, 'bin');
  execFileSync('mkdir', [bin]);
  for (const tool of ['cat', 'sleep']) symlinkSync(execFileSync('bash', ['-c', `command -v ${tool}`], {encoding: 'utf8'}).trim(), join(bin, tool));
  symlinkSync(process.execPath, join(bin, 'node'));
  writeFileSync(join(bin, 'sleep'), '#!/bin/bash\nexit 0\n'); chmodSync(join(bin, 'sleep'), 0o755);
  const log = join(dir, 'log');
  writeFileSync(log, '');
  // Each OIDC request returns a new token; the URL must carry the audience.
  const curl = oidc === 'ok'
    ? `n=$(( $(/bin/cat ${dir}/n 2>/dev/null || echo 0) + 1 )); echo $n > ${dir}/n; for a in "$@"; do case "$a" in *audience=matchpilot-vps-deploy) ok=1;; esac; done; [ "$ok" = 1 ] || exit 22; echo "{\\"value\\":\\"tok-$n\\"}"`
    : oidc;
  writeFileSync(join(bin, 'curl'), `#!/bin/bash\n${curl}\n`); chmodSync(join(bin, 'curl'), 0o755);
  // sudo -n /usr/local/sbin/mp-deploy <sha>: records the argument and the token read on stdin, then exits as told.
  writeFileSync(join(bin, 'sudo'), `#!/bin/bash\nk=$(( $(/bin/cat ${dir}/k 2>/dev/null || echo 0) + 1 )); echo $k > ${dir}/k\ntok=$(/bin/cat)\nprintf '%s token=%s\\n' "$*" "$tok" >> ${log}\nset -- ${results.join(' ')}\nshift $((k-1)); exit \${1:-0}\n`);
  chmodSync(join(bin, 'sudo'), 0o755);
  const result = spawnSync('/bin/bash', ['-e', '-c', stepScript('mp-deploy')], {encoding: 'utf8', env: {PATH: bin, DEPLOY_SHA: SHA,
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/token?api-version=2.0', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token'}});
  return {status: result.status, out: result.stdout + result.stderr, calls: readFileSync(log, 'utf8').trim().split('\n').filter(Boolean)};
}

test('mp-deploy step: each try sends a new OIDC token on stdin; without a token nothing is deployed', () => {
  const once = mpDeployStep();
  assert.equal(once.status, 0, once.out);
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
