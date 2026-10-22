// MP-DEPLOY-APPROVAL-01: the gate job of deploy-vps.yml, before the deploy job waits for the owner's approval. It reads
// from GitHub (never from the workflow or the repository) that:
//   - this run is a push to main of this repository;
//   - the environment vps-production exists and requires the approval of exactly the owner (no team, no other user),
//     with prevent self-review off (the owner both merges and approves: with it on nobody could approve);
//   - administrators cannot bypass that approval;
//   - only the branch main can deploy to it (selected branches, a single branch policy "main");
//   - the SHA of this run is still the tip of main (a newer merge has its own run to approve).
// GitHub creates an environment named by a workflow when it does not exist, without any protection rule: that case, an
// unreadable answer or any unexpected shape fails the gate, so the deploy job never starts (fail closed).
// The workflow runs it in the gate job before the approval (this file, from the commit, on a GitHub-hosted runner) and
// on the VPS after it and before every retry (the copy installed by root in /usr/local/libexec/mp-gate, never this
// commit's file). A re-run is refused on the VPS by the runner's job-start guard.
// Its report lists the environment settings it read, as evidence of what GitHub returned.
//   node scripts/deploy-gate.mjs   (GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_REF, GITHUB_EVENT_NAME, GH_TOKEN)
import {appendFileSync, realpathSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {REQUIRED_CHECK, TRANSIENT_STATUS, ciProblems, ciRunId, latestCiCheck, mergeProblems, withRetry} from './deploy-authz.mjs';

// ciProblems without the ci.yml pin, which only the root-installed runner guard holds (its config).
export const basicCiProblems = (checks, sha, ciRun) => ciProblems(checks, sha, {ciRuns: ciRun}).filter(item => item !== 'AUTHZ_CI_PIN_MISSING');

export const REPOSITORY = 'zarbopiero963-droid/MatchPilot';
export const ENVIRONMENT = 'vps-production';
export const REVIEWERS = Object.freeze(['zarbopiero963-droid']);
export const BRANCH = 'main';

const SHA = /^[0-9a-f]{40}$/;

// facts: {repository, ref, event, sha, environment, branchPolicies, mainSha, errors}; returns the reasons to stop.
export function gateProblems(facts) {
  const problems = [...(facts.errors ?? [])];
  if (facts.repository !== REPOSITORY) problems.push(`GATE_REPOSITORY: ${facts.repository}`);
  if (facts.event !== 'push') problems.push(`GATE_EVENT: ${facts.event}, not push`);
  if (facts.ref !== `refs/heads/${BRANCH}`) problems.push(`GATE_REF: ${facts.ref}`);
  if (!SHA.test(facts.sha ?? '')) problems.push(`GATE_SHA: ${facts.sha}`);

  const environment = facts.environment;
  if (!environment) problems.push(`GATE_ENVIRONMENT_MISSING: ${ENVIRONMENT}`);
  else {
    // MP-AUTODEPLOY-01 (owner t123u): ordinary deploys need no human approval. A required-reviewers rule is no longer
    // required; if one is still configured (transition), it may name only the owner, with prevent self-review off.
    if (!Array.isArray(environment.protection_rules)) problems.push('GATE_PROTECTION_RULES_UNREADABLE');
    const rules = Array.isArray(environment.protection_rules) ? environment.protection_rules : [];
    const reviewerRules = rules.filter(rule => rule?.type === 'required_reviewers');
    if (reviewerRules.some(rule => !Array.isArray(rule.reviewers))) problems.push('GATE_REVIEWERS_UNREADABLE');
    const reviewers = reviewerRules.flatMap(rule => Array.isArray(rule.reviewers) ? rule.reviewers : []);
    for (const entry of reviewers) {
      const login = entry?.reviewer?.login;
      if (entry?.type !== 'User' || !REVIEWERS.includes(login)) problems.push(`GATE_UNEXPECTED_REVIEWER: ${entry?.type} ${login ?? entry?.reviewer?.slug ?? '?'}`);
    }
    if (reviewerRules.some(rule => rule.prevent_self_review !== false)) problems.push('GATE_SELF_REVIEW: prevent_self_review must be false, or the owner who merges cannot approve');
    if (environment.can_admins_bypass !== false) problems.push(`GATE_ADMIN_BYPASS: can_admins_bypass is ${environment.can_admins_bypass}`);
    const policy = environment.deployment_branch_policy;
    if (!policy || policy.custom_branch_policies !== true || policy.protected_branches !== false) problems.push(`GATE_BRANCH_POLICY: ${JSON.stringify(policy ?? null)}`);
    else {
      const names = (facts.branchPolicies ?? []).map(item => `${item?.type ?? 'branch'}:${item?.name}`);
      if (JSON.stringify(names) !== JSON.stringify([`branch:${BRANCH}`])) problems.push(`GATE_BRANCH_POLICY: ${names.join(', ') || 'none'}`);
    }
  }
  // MP-AUTODEPLOY-01: what authorizes the SHA is a merged PR into main and a green "CI gate" on exactly this SHA. The
  // root-installed runner guard also proves the check comes from the pinned ci.yml (owner t124u).
  problems.push(...mergeProblems(facts.pulls, facts.sha).map(item => item.replace(/^AUTHZ_/, 'GATE_')));
  problems.push(...basicCiProblems(facts.checks, facts.sha, facts.ciRun).map(item => item.replace(/^AUTHZ_/, 'GATE_')));
  if (!SHA.test(facts.mainSha ?? '')) problems.push('GATE_MAIN_UNREADABLE');
  else if (facts.mainSha !== facts.sha) problems.push(`GATE_SUPERSEDED: main is ${facts.mainSha}, this run is ${facts.sha}`);
  return problems;
}

// api(path) resolves to {status, body}; every call that is not a 200 (the environment: 200 or 404) is an error.
export async function readFacts({repository, ref, event, sha, api, retry = {}}) {
  const facts = {repository, ref, event, sha, environment: null, branchPolicies: null, mainSha: null, errors: []};
  const call = async (what, path, allow404 = false) => {
    try {
      // a transient answer (5xx, 429) is read again a bounded number of times (deploy-authz.mjs withRetry)
      const {status, body} = await withRetry(async () => {
        const answer = await api(path);
        if (TRANSIENT_STATUS(answer?.status)) throw Object.assign(new Error(`HTTP ${answer.status}`), {transient: true, answer});
        return answer;
      }, retry).catch(error => { if (error?.answer) return error.answer; throw error; });
      if (status === 200) return body;
      if (!(allow404 && status === 404)) facts.errors.push(`GATE_API_ERROR: ${what} HTTP ${status}`);
    } catch (error) { facts.errors.push(`GATE_API_ERROR: ${what} ${String(error?.message ?? error).split('\n')[0]}`); }
    return null;
  };
  const env = `repos/${repository}/environments/${encodeURIComponent(ENVIRONMENT)}`;
  facts.environment = await call('environment', env, true);
  if (facts.environment?.deployment_branch_policy?.custom_branch_policies === true) {
    facts.branchPolicies = (await call('branch policies', `${env}/deployment-branch-policies?per_page=100`))?.branch_policies ?? null;
  }
  facts.mainSha = (await call('main', `repos/${repository}/branches/${BRANCH}`))?.commit?.sha ?? null;
  if (SHA.test(sha ?? '')) {
    facts.pulls = await call('pulls', `repos/${repository}/commits/${sha}/pulls?per_page=100`);
    facts.checks = await call('checks', `repos/${repository}/commits/${sha}/check-runs?check_name=${encodeURIComponent(REQUIRED_CHECK)}&filter=all&per_page=100`);
    const ciId = ciRunId(latestCiCheck(facts.checks, sha));
    if (ciId) facts.ciRun = await call('ci run', `repos/${repository}/actions/runs/${ciId}`);
  }
  return facts;
}

// What the gate read, for the run log: never a token, only the settings that decide.
export function observed(facts) {
  const environment = facts.environment;
  return {
    environment: environment ? {
      can_admins_bypass: environment.can_admins_bypass,
      required_reviewers: (Array.isArray(environment.protection_rules) ? environment.protection_rules : []).filter(rule => rule?.type === 'required_reviewers')
        .map(rule => ({prevent_self_review: rule.prevent_self_review, reviewers: (rule.reviewers ?? []).map(entry => `${entry?.type}:${entry?.reviewer?.login ?? entry?.reviewer?.slug ?? '?'}`)})),
      deployment_branch_policy: environment.deployment_branch_policy ?? null,
      branch_policies: (facts.branchPolicies ?? []).map(item => `${item?.type}:${item?.name}`),
    } : null,
    main: facts.mainSha,
  };
}

// Review NB-11: an unexpected shape in the answer must not stop the report (the result is already FAIL for it).
function safeObserved(facts) {
  try { return observed(facts); } catch (error) { return {unreadable: String(error?.message ?? error).split('\n')[0]}; }
}

export function githubApi({token, base = 'https://api.github.com'}) {
  return async path => {
    const response = await fetch(`${base}/${path}`, {headers: {
      accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'matchpilot-deploy-gate'}});
    return {status: response.status, body: response.status === 200 ? await response.json() : null};
  };
}

// Entry point check on the resolved file URL: a path with spaces or a symlink must still run the checks.
const entry = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href; } catch { return null; } })();
if (entry === import.meta.url) {
  const env = process.env;
  let problems;
  let facts = {};
  try {
    if (!env.GH_TOKEN) throw new Error('GH_TOKEN is not set');
    const read = () => readFacts({repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, sha: env.GITHUB_SHA,
      api: githubApi({token: env.GH_TOKEN, base: env.GITHUB_API_URL || 'https://api.github.com'})});
    // MP-AUTODEPLOY-01: in the gate job (DEPLOY_GATE_WAIT_CI_S > 0) wait for CI on this SHA to finish; only a pending or
    // missing CI is waited for, every other problem stops at once. On the VPS the wait is 0: CI must already be green.
    const deadline = Date.now() + 1000 * Math.min(Number(env.DEPLOY_GATE_WAIT_CI_S || 0) || 0, 3600);
    for (;;) {
      facts = await read();
      problems = gateProblems(facts);
      const waiting = problems.length > 0 && problems.every(item => /^GATE_CI_(PENDING|MISSING)/.test(item));
      if (!waiting || Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
  } catch (error) {
    problems = [`GATE_ERROR: ${String(error?.message ?? error).split('\n')[0]}`];
  }
  // Anti-stale (MP-GATE-S1S2-FIX): a run of a superseded SHA says on its page which run to approve instead. It
  // approves nothing and never deploys another SHA.
  if (problems.some(item => item.startsWith('GATE_SUPERSEDED')) && env.GITHUB_STEP_SUMMARY) {
    try { appendFileSync(env.GITHUB_STEP_SUMMARY, `### Run obsoleto: non approvarlo\n\nQuesto run distribuirebbe \`${env.GITHUB_SHA}\`, ma l'ultimo commit di main è \`${facts.mainSha}\`. Il deploy di questo run è rifiutato; approva il run deploy-vps dell'ultimo commit di main.\n`); } catch {}
  }
  console.log(JSON.stringify({gate: 'MP-DEPLOY-APPROVAL-01', environment: ENVIRONMENT, sha: env.GITHUB_SHA ?? null, result: problems.length ? 'FAIL' : 'PASS', problems, observed: safeObserved(facts)}, null, 2));
  process.exitCode = problems.length ? 1 : 0;
}
