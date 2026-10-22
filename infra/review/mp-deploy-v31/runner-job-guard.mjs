// MP-GATE-S1S2-FIX (review B4, #179 6321726326): the job-started hook of the VPS runner (ACTIONS_RUNNER_HOOK_JOB_STARTED).
// GitHub runs it after a job is assigned to the runner and before any of its steps; any exit code but 0 fails the job
// before it runs. Its purpose: no code runs on the VPS without the owner's approval, not only no deploy.
//
// The agents act on GitHub as the owner's account (one identity for the owner and the agents), with Contents and
// Workflows write and no required PR approval: a PR merged by an agent can change deploy-vps.yml (drop `environment`,
// add a job) together with the policy and its tests, and its push to main would start a job on this runner with no
// approval. The repository checks cannot stop that (they change in the same PR); this hook, installed by root on the
// VPS, can. The one thing the agents cannot do is approve a deployment (their GitHub App has no Deployments permission),
// so a job may start here only when all of these hold, read from GitHub and not from the job:
//   - the job is `deploy` of .github/workflows/deploy-vps.yml, run by a push to main of this repository (runner env and
//     the run as GitHub reports it: event, branch, path, SHA, attempt);
//   - deploy-vps.yml at that SHA is byte for byte the pinned file: its git blob SHA equals the one in the root-owned
//     config, so a changed workflow needs a new pin by root (an owner GO), even after an approval;
//   - the run and this attempt's `deploy` job are in progress, not concluded, and that job is assigned to this runner;
//   - the owner approved vps-production for this run, and nothing of it is still waiting;
//   - it is the run's first attempt: GitHub's review history of a run has no attempt and no time, so an approval cannot
//     be tied to a re-run; a re-run is refused (fail closed) and a new deploy needs a new run (PR #181, owner point 2);
//   - the SHA is the current tip of main, from two sources (anti-stale).
// Any unreadable answer refuses (fail closed). No token is used: these are public reads of a public repository.
//   node runner-job-guard.mjs <config.json>     config: {"workflow_blob_sha": "<40 hex>"}, root-owned, read-only
import {readFileSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {EXPECTED, GITHUB_API, approvalProblems, httpJson, readMainTip, tipProblems} from './deploy-authz.mjs';

export const WORKFLOW_PATH = '.github/workflows/deploy-vps.yml';
export const JOB = 'deploy';
const SHA = /^[0-9a-f]{40}$/;
const DIGITS = /^[1-9][0-9]{0,19}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const message = error => String(error?.message ?? error).split('\n')[0];

// The git blob SHA of a file (what `git hash-object` prints and what the contents API returns as `sha`): the pin.
export function gitBlobSha(bytes) {
  const body = Buffer.from(bytes);
  return createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
}

export function configProblems(config) {
  if (!plain(config) || Object.keys(config).join() !== 'workflow_blob_sha' || !SHA.test(config.workflow_blob_sha ?? '')) return ['GUARD_CONFIG: expected exactly {"workflow_blob_sha": "<40 hex>"}'];
  return [];
}

// What the runner says about the job. GitHub does not let a workflow overwrite GITHUB_* variables; the run is read back
// from the API anyway, and the job must be the one assigned to this runner.
export function envProblems(env) {
  const p = [];
  if (env.GITHUB_REPOSITORY !== EXPECTED.repository) p.push(`GUARD_REPOSITORY: ${env.GITHUB_REPOSITORY}`);
  if (env.GITHUB_EVENT_NAME !== 'push') p.push(`GUARD_EVENT: ${env.GITHUB_EVENT_NAME}`);
  if (env.GITHUB_REF !== 'refs/heads/main') p.push(`GUARD_REF: ${env.GITHUB_REF}`);
  if (env.GITHUB_WORKFLOW_REF !== EXPECTED.workflow_ref) p.push(`GUARD_WORKFLOW: ${env.GITHUB_WORKFLOW_REF}`);
  if (env.GITHUB_JOB !== JOB) p.push(`GUARD_JOB: ${env.GITHUB_JOB}`);
  if (!DIGITS.test(env.GITHUB_RUN_ID ?? '') || !DIGITS.test(env.GITHUB_RUN_ATTEMPT ?? '')) p.push('GUARD_RUN_ID');
  else if (env.GITHUB_RUN_ATTEMPT !== '1') p.push(`GUARD_RERUN_APPROVAL_UNBOUND: attempt ${env.GITHUB_RUN_ATTEMPT}; GitHub's approvals do not say which attempt they were given to`);
  if (!SHA.test(env.GITHUB_SHA ?? '')) p.push(`GUARD_SHA: ${env.GITHUB_SHA}`);
  if (!env.RUNNER_NAME) p.push('GUARD_RUNNER_NAME');
  return p;
}

// Reads GitHub. Each read that fails is recorded as a problem; nothing is assumed.
export async function readGuardFacts(env, {fetchJson = httpJson, fetchText} = {}) {
  const facts = {run: null, jobs: null, workflow: null, approvals: null, pending: null, tip: null, errors: []};
  const run = `${GITHUB_API}/actions/runs/${env.GITHUB_RUN_ID}`;
  const read = async (what, url) => { try { return await fetchJson(url); } catch (error) { facts.errors.push(`GUARD_API_ERROR: ${what} ${message(error)}`); return null; } };
  facts.run = await read('run', run);
  facts.jobs = await read('jobs', `${run}/attempts/${env.GITHUB_RUN_ATTEMPT}/jobs?per_page=100`);
  facts.workflow = await read('workflow', `${GITHUB_API}/contents/${WORKFLOW_PATH}?ref=${env.GITHUB_SHA}`);
  facts.approvals = await read('approvals', `${run}/approvals`);
  facts.pending = await read('pending deployments', `${run}/pending_deployments`);
  facts.tip = await readMainTip(fetchText ? {fetchText} : {});
  return facts;
}

export function guardProblems(env, facts, config) {
  const p = [...facts.errors];
  const run = facts.run;
  const runOk = plain(run) && String(run.id) === env.GITHUB_RUN_ID && String(run.run_attempt) === env.GITHUB_RUN_ATTEMPT
    && run.status === 'in_progress' && run.conclusion == null
    && run.event === 'push' && run.head_branch === 'main' && run.head_sha === env.GITHUB_SHA && run.path === WORKFLOW_PATH
    && run.repository?.full_name === EXPECTED.repository;
  if (!runOk) p.push(`GUARD_RUN_MISMATCH: ${plain(run) ? JSON.stringify({id: run.id, run_attempt: run.run_attempt, status: run.status, conclusion: run.conclusion, event: run.event, head_branch: run.head_branch, head_sha: run.head_sha, path: run.path}) : 'unreadable'}`);
  const jobs = plain(facts.jobs) && Array.isArray(facts.jobs.jobs) ? facts.jobs.jobs : null;
  const mine = jobs ? jobs.filter(job => plain(job) && job.name === JOB) : [];
  if (mine.length !== 1 || mine[0].runner_name !== env.RUNNER_NAME || String(mine[0].run_attempt) !== env.GITHUB_RUN_ATTEMPT) {
    p.push(`GUARD_JOB_NOT_ASSIGNED_HERE: ${mine.length === 1 ? `runner ${mine[0].runner_name}` : `${mine.length} jobs named ${JOB}`}`);
  } else if (mine[0].status !== 'in_progress' || mine[0].conclusion != null) {
    // A job that is concluded, cancelled, queued or waiting is not the one being started here (review NB-1).
    p.push(`GUARD_JOB_NOT_ACTIVE: ${mine[0].status}/${mine[0].conclusion ?? 'none'}`);
  }
  const workflow = facts.workflow;
  if (!(plain(workflow) && workflow.type === 'file' && workflow.path === WORKFLOW_PATH && workflow.sha === config.workflow_blob_sha)) {
    p.push(`GUARD_WORKFLOW_NOT_PINNED: ${plain(workflow) ? workflow.sha : 'unreadable'} (pinned ${config.workflow_blob_sha})`);
  }
  p.push(...approvalProblems(facts.approvals).map(item => item.replace(/^AUTHZ_/, 'GUARD_')));
  if (!Array.isArray(facts.pending) || facts.pending.length !== 0) p.push('GUARD_DEPLOYMENT_STILL_WAITING');
  p.push(...tipProblems(facts.tip ?? {tip: null, problems: ['TIP_UNVERIFIABLE']}, env.GITHUB_SHA));
  return p;
}

// The whole hook: the config, the runner's word, then GitHub. Stops at the first stage that fails (no read is made for
// a job that is not even the deploy job).
export async function runGuard({env, config, fetchJson, fetchText}) {
  let problems = configProblems(config);
  if (!problems.length) problems = envProblems(env);
  if (!problems.length) {
    const facts = await readGuardFacts(env, {fetchJson, fetchText});
    problems = guardProblems(env, facts, config);
  }
  return {guard: 'MP-RUNNER-JOB-GUARD', result: problems.length ? 'REFUSE' : 'ALLOW', problems,
    job: {run_id: env.GITHUB_RUN_ID ?? null, run_attempt: env.GITHUB_RUN_ATTEMPT ?? null, job: env.GITHUB_JOB ?? null,
      workflow_ref: env.GITHUB_WORKFLOW_REF ?? null, sha: env.GITHUB_SHA ?? null}};
}

const entry = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href; } catch { return null; } })();
if (entry === import.meta.url) {
  let report;
  try {
    let config;
    try { config = JSON.parse(readFileSync(process.argv[2], 'utf8')); } catch (error) { config = {error: message(error)}; }
    report = await runGuard({env: process.env, config});
  } catch (error) {
    report = {guard: 'MP-RUNNER-JOB-GUARD', result: 'REFUSE', problems: [`GUARD_ERROR: ${message(error)}`]};
  }
  console.log(JSON.stringify(report));
  process.exitCode = report.result === 'ALLOW' ? 0 : 1;
}
