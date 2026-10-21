// MP-DEPLOY-APPROVAL-01: the gate job of deploy-vps.yml, before the deploy job waits for the owner's approval. It reads
// from GitHub (never from the workflow or the repository) that:
//   - this run is a push to main of this repository;
//   - the environment vps-production exists and requires the approval of exactly the owner (no team, no other user);
//   - administrators cannot bypass that approval;
//   - only the branch main can deploy to it (selected branches, a single branch policy "main");
//   - the SHA of this run is still the tip of main (a newer merge has its own run to approve).
// GitHub creates an environment named by a workflow when it does not exist, without any protection rule: that case, an
// unreadable answer or any unexpected shape fails the gate, so the deploy job never starts (fail closed).
//   node scripts/deploy-gate.mjs   (GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_REF, GITHUB_EVENT_NAME, GH_TOKEN)
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
    const rules = Array.isArray(environment.protection_rules) ? environment.protection_rules : [];
    const reviewerRules = rules.filter(rule => rule?.type === 'required_reviewers');
    const reviewers = reviewerRules.flatMap(rule => Array.isArray(rule.reviewers) ? rule.reviewers : []);
    if (reviewerRules.length === 0 || reviewers.length === 0) problems.push('GATE_NO_REQUIRED_REVIEWERS');
    for (const entry of reviewers) {
      const login = entry?.reviewer?.login;
      if (entry?.type !== 'User' || !REVIEWERS.includes(login)) problems.push(`GATE_UNEXPECTED_REVIEWER: ${entry?.type} ${login ?? entry?.reviewer?.slug ?? '?'}`);
    }
    if (reviewers.length && !reviewers.some(entry => entry?.type === 'User' && REVIEWERS.includes(entry?.reviewer?.login))) problems.push('GATE_OWNER_NOT_REVIEWER');
    if (environment.can_admins_bypass !== false) problems.push(`GATE_ADMIN_BYPASS: can_admins_bypass is ${environment.can_admins_bypass}`);
    const policy = environment.deployment_branch_policy;
    if (!policy || policy.custom_branch_policies !== true || policy.protected_branches !== false) problems.push(`GATE_BRANCH_POLICY: ${JSON.stringify(policy ?? null)}`);
    else {
      const names = (facts.branchPolicies ?? []).map(item => `${item?.type ?? 'branch'}:${item?.name}`);
      if (JSON.stringify(names) !== JSON.stringify([`branch:${BRANCH}`])) problems.push(`GATE_BRANCH_POLICY: ${names.join(', ') || 'none'}`);
    }
  }
  if (!SHA.test(facts.mainSha ?? '')) problems.push('GATE_MAIN_UNREADABLE');
  else if (facts.mainSha !== facts.sha) problems.push(`GATE_SUPERSEDED: main is ${facts.mainSha}, this run is ${facts.sha}`);
  return problems;
}

// api(path) resolves to {status, body}; every call that is not a 200 (the environment: 200 or 404) is an error.
export async function readFacts({repository, ref, event, sha, api}) {
  const facts = {repository, ref, event, sha, environment: null, branchPolicies: null, mainSha: null, errors: []};
  const call = async (what, path, allow404 = false) => {
    try {
      const {status, body} = await api(path);
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
  return facts;
}

export function githubApi({token, base = 'https://api.github.com'}) {
  return async path => {
    const response = await fetch(`${base}/${path}`, {headers: {
      accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28', 'user-agent': 'matchpilot-deploy-gate'}});
    return {status: response.status, body: response.status === 200 ? await response.json() : null};
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  let problems;
  try {
    if (!env.GH_TOKEN) throw new Error('GH_TOKEN is not set');
    const facts = await readFacts({repository: env.GITHUB_REPOSITORY, ref: env.GITHUB_REF, event: env.GITHUB_EVENT_NAME, sha: env.GITHUB_SHA,
      api: githubApi({token: env.GH_TOKEN, base: env.GITHUB_API_URL || 'https://api.github.com'})});
    problems = gateProblems(facts);
  } catch (error) {
    problems = [`GATE_ERROR: ${String(error?.message ?? error).split('\n')[0]}`];
  }
  console.log(JSON.stringify({gate: 'MP-DEPLOY-APPROVAL-01', environment: ENVIRONMENT, sha: env.GITHUB_SHA ?? null, result: problems.length ? 'FAIL' : 'PASS', problems}, null, 2));
  process.exitCode = problems.length ? 1 : 0;
}
