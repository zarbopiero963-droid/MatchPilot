// GOV-01 (MP-OWNER-AUTOMERGE-02/-03): the facts the merge gate needs, read from GitHub instead of being declared by the
// agent. A gate fed by hand is never treated as certified: the deploy breaker uses only these facts.
//   - the PR: state, head SHA, base branch and the current SHA of main;
//   - CI: the "CI gate" check run of GitHub Actions on the PR head;
//   - the last deploy of main: the deploy-vps run of a push on main for the CURRENT main SHA, completed, on the runner
//     matchpilot-vps (self-hosted);
//   - whether the GitHub -> VPS path is certified: an IN_FORCE owner decision MP-OWNER-DEPLOY-PATH-CERTIFIED-* in the
//     owner-decision register of the base commit (git), not a flag in the input.
// Every missing, failed, running or unreadable fact is reported as such and blocks (fail closed).
import {execFileSync} from 'node:child_process';

export const DEPLOY_WORKFLOW = '.github/workflows/deploy-vps.yml';
export const CI_CHECK = 'CI gate';
export const VPS_RUNNER_LABEL = 'matchpilot-vps';
export const DEPLOY_PATH_DECISION = /^MP-OWNER-DEPLOY-PATH-CERTIFIED(-|$)/;

// Default transport: the GitHub CLI already configured for this environment. Tests inject a fake.
export const ghApi = path => JSON.parse(execFileSync('gh', ['api', path], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024}));

const latest = (items, key) => [...items].sort((a, b) => String(b[key] ?? '').localeCompare(String(a[key] ?? '')))[0];

export async function readGithubFacts({repo, pr, api = ghApi}) {
  const facts = {facts_source: 'github', errors: []};
  const call = async (what, path) => {
    try { return await api(`repos/${repo}/${path}`); }
    catch (error) { facts.errors.push(`${what}: ${String(error?.message ?? error).split('\n')[0]}`); return null; }
  };
  const pull = await call('pull request', `pulls/${pr}`);
  facts.pr_state = pull ? (pull.merged ? 'merged' : pull.state) : 'unknown';
  facts.head_sha = pull?.head?.sha ?? null;
  facts.base_ref = pull?.base?.ref ?? null;
  if (pull && facts.base_ref !== 'main') facts.errors.push(`base branch is ${facts.base_ref}, not main`);
  const main = await call('main', 'branches/main');
  facts.base_sha = main?.commit?.sha ?? null;

  // CI: the latest "CI gate" check run of GitHub Actions on the head.
  facts.ci = 'UNKNOWN';
  if (facts.head_sha) {
    const runs = await call('check runs', `commits/${facts.head_sha}/check-runs?check_name=${encodeURIComponent(CI_CHECK)}&per_page=100`);
    const gate = runs ? latest((runs.check_runs ?? []).filter(run => run.name === CI_CHECK && run.app?.slug === 'github-actions'), 'started_at') : null;
    facts.ci = !gate ? 'MISSING' : gate.status !== 'completed' ? 'PENDING' : gate.conclusion === 'success' ? 'SUCCESS' : String(gate.conclusion).toUpperCase();
  }

  // The deploy of the current main: the newest deploy-vps push run on main for that exact SHA, and its runner.
  facts.last_main_deploy = {sha: facts.base_sha, conclusion: 'unknown', run_id: null, runner: null};
  if (facts.base_sha) {
    const runs = await call('deploy runs', `actions/workflows/${encodeURIComponent('deploy-vps.yml')}/runs?branch=main&event=push&head_sha=${facts.base_sha}&per_page=20`);
    const run = runs ? latest((runs.workflow_runs ?? []).filter(item => item.head_sha === facts.base_sha && item.path === DEPLOY_WORKFLOW && item.event === 'push' && item.head_branch === 'main'), 'created_at') : null;
    if (!run) facts.last_main_deploy.conclusion = runs ? 'not_found' : 'unknown';
    else {
      facts.last_main_deploy.run_id = run.id;
      facts.last_main_deploy.conclusion = run.status !== 'completed' ? `in_progress:${run.status}` : String(run.conclusion);
      const jobs = await call('deploy jobs', `actions/runs/${run.id}/jobs`);
      const job = jobs?.jobs?.find(item => item.name === 'deploy');
      facts.last_main_deploy.runner = job ? {name: job.runner_name ?? null, labels: job.labels ?? []} : null;
      if (!job || !(job.labels ?? []).includes(VPS_RUNNER_LABEL) || !(job.labels ?? []).includes('self-hosted')) {
        facts.last_main_deploy.conclusion = `not_on_vps_runner:${facts.last_main_deploy.conclusion}`;
      }
    }
  }
  return facts;
}

// The register of the BASE commit (never the PR's): is the GitHub -> VPS deploy path certified by the owner?
export function deployPathCertified(repoDir, baseRef) {
  try {
    const text = execFileSync('git', ['-C', repoDir, 'show', `${baseRef}:docs/governance/owner-decisions.json`], {encoding: 'utf8'});
    const decisions = JSON.parse(text).decisions ?? [];
    return decisions.some(decision => DEPLOY_PATH_DECISION.test(decision.id) && decision.status === 'IN_FORCE');
  } catch { return false; }
}

// GitHub facts override what the input declares; a declared value that disagrees is a reason to block.
export function mergeWithFacts(input, facts, {deployCertified}) {
  const reasons = [];
  for (const key of ['pr_state', 'head_sha', 'base_sha', 'ci']) {
    if (input[key] !== undefined && input[key] !== facts[key]) reasons.push(`declared ${key} (${input[key]}) differs from GitHub (${facts[key]})`);
  }
  for (const error of facts.errors) reasons.push(`GitHub facts unreadable: ${error}`);
  const merged = {...input, pr_state: facts.pr_state, head_sha: facts.head_sha, base_sha: facts.base_sha, ci: facts.ci,
    last_main_deploy: facts.last_main_deploy, deploy_path_certified: deployCertified === true, facts_source: facts.errors.length ? 'github-incomplete' : 'github'};
  return {input: merged, reasons};
}
