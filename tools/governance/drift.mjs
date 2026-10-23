// GOV-DRIFT-01 (#150, t141u): executable drift check between the work registry and GitHub. The t140u audit found
// the registry 20 PRs behind main while `validate` still passed (gap G3/G4). This check fails when:
//  TASK_PR_MERGED_NOT_FINAL  a live (not BLOCKED) task whose PR GitHub reports merged is not final;
//                            BLOCKED is an explicit owner hold (e.g. R-02, #40) and is reported by `status` instead;
//  TASK_PR_CLOSED_NOT_FINAL  a live task whose PR GitHub reports closed unmerged;
//  LEASE_EXPIRED             a non-final task keeps a lease past its expiry (unreconciled);
//  MERGED_PR_UNREGISTERED    a PR merged into main after the baseline has no task (by pr number or branch);
//  PR_UNCLAIMED              the PR under test has no task in the registry (by pr number or branch).
// `grace` holds the PR numbers allowed to be non-final: the PR under test, and on a push to main the PR just merged.
// Pure function; the CLI fetches GitHub facts (tools/governance/github.mjs style, fail closed).
export const DRIFT_BASELINE_PR = 190; // registry reconciled from #189 on (GOV-SYNC-01)
const FINAL = new Set(['MERGED', 'COMPLETED']);

export function detectDrift({registry, prs = [], now = new Date(), grace = [], currentPr = null, currentBranch = null, baseline = DRIFT_BASELINE_PR}) {
  const problems = [];
  const tasks = registry?.tasks || [];
  const byNumber = new Map(prs.map(pr => [pr.number, pr]));
  const graceSet = new Set(grace.filter(Number.isInteger));
  const owns = pr => tasks.find(task => task.pr === pr.number || (pr.branch && task.branch === pr.branch));
  for (const task of tasks) {
    if (FINAL.has(task.state)) continue;
    const pr = Number.isInteger(task.pr) ? byNumber.get(task.pr) : prs.find(item => item.branch && item.branch === task.branch && item.state !== 'open');
    if (pr && !graceSet.has(pr.number)) {
      if (pr.state === 'merged' && task.state !== 'BLOCKED') problems.push({code: 'TASK_PR_MERGED_NOT_FINAL', task: task.id, detail: `PR #${pr.number} merged, task ${task.state}`});
      else if (pr.state === 'closed' && task.state !== 'BLOCKED') problems.push({code: 'TASK_PR_CLOSED_NOT_FINAL', task: task.id, detail: `PR #${pr.number} closed unmerged, task ${task.state}`});
    }
    if (task.lease && Date.parse(task.lease.expires_at) <= now.getTime() && !(pr && graceSet.has(pr.number)) && !(currentBranch && task.branch === currentBranch))
      problems.push({code: 'LEASE_EXPIRED', task: task.id, detail: `lease of ${task.lease.holder} expired ${task.lease.expires_at}`});
  }
  for (const pr of prs) {
    if (pr.state !== 'merged' || pr.number < baseline || pr.base !== 'main') continue;
    if (!owns(pr)) problems.push({code: 'MERGED_PR_UNREGISTERED', pr: pr.number, detail: `PR #${pr.number} (${pr.branch}) merged ${pr.merge_sha?.slice(0, 7) ?? ''} without a registry task`});
  }
  if (Number.isInteger(currentPr) || currentBranch) {
    const claimed = tasks.some(task => (Number.isInteger(currentPr) && task.pr === currentPr) || (currentBranch && task.branch === currentBranch));
    if (!claimed) problems.push({code: 'PR_UNCLAIMED', pr: currentPr, detail: `PR ${currentPr ?? ''} branch ${currentBranch ?? ''} has no registry task`});
  }
  return problems;
}

// GitHub list -> facts. `run(url)` returns the JSON text (injectable for tests).
export function normalizePulls(list) {
  return (list || []).map(pr => ({number: pr.number, branch: pr.head?.ref ?? null, base: pr.base?.ref ?? null,
    state: pr.merged_at ? 'merged' : pr.state, merge_sha: pr.merge_commit_sha ?? null}));
}

// Reads every pull request of the repository (newest first, up to 300) via the public REST API. A token, when the
// environment provides one (CI: GITHUB_TOKEN), only lifts the rate limit; it is passed to curl via a header and never
// printed. Any failure throws (fail closed).
import {execFileSync} from 'node:child_process';
export function fetchPulls(repository, {env = process.env, run} = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '')) throw new Error(`invalid repository ${repository}`);
  const exec = run || (url => execFileSync('curl', ['-sS', '--fail', '--max-time', '30', '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: matchpilot-governance',
    ...(env.GITHUB_TOKEN ? ['-H', `Authorization: Bearer ${env.GITHUB_TOKEN}`] : []), url], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}));
  const all = [];
  for (let page = 1; page <= 3; page += 1) {
    const rows = JSON.parse(exec(`https://api.github.com/repos/${repository}/pulls?state=all&per_page=100&page=${page}&sort=created&direction=desc`));
    if (!Array.isArray(rows)) throw new Error('GitHub answered a non-list');
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return normalizePulls(all);
}

// GOV-PROTOCOL-01 takeover rule (owner t145u): before modifying anything an incoming agent checks in-progress work
// (active leases, open PRs, unmerged branches, running CI). It may take over a task only when the task has no lease
// (explicitly released) or the lease expired; an interrupted agent is handled by lease expiry, never by overwriting.
// Returns {verdict: 'PROCEED'|'STOP', reasons[]}. Pure: the CLI supplies GitHub facts.
export function takeoverCheck({registry, task: taskId, agentId, openPrs = [], runningRuns = [], now = new Date()}) {
  const reasons = [];
  const task = (registry?.tasks || []).find(item => item.id === taskId);
  if (!task) return {verdict: 'STOP', reasons: [{code: 'UNKNOWN_TASK', detail: taskId}]};
  if (FINAL.has(task.state)) reasons.push({code: 'TASK_FINISHED', detail: `${taskId} is ${task.state}`});
  const lease = task.lease;
  if (lease && lease.holder !== agentId && Date.parse(lease.expires_at) > now.getTime())
    reasons.push({code: 'LEASE_ACTIVE', detail: `${taskId} held by ${lease.holder} until ${lease.expires_at}: wait for release or expiry, never overwrite`});
  const held = new Set((registry.tasks || []).filter(t => t.lease && t.lease.holder !== agentId && Date.parse(t.lease.expires_at) > now.getTime()).flatMap(t => [t.branch, t.pr].filter(Boolean)));
  for (const pr of openPrs) if (pr.branch === task.branch || pr.number === task.pr) {
    if (held.has(pr.branch) || held.has(pr.number)) reasons.push({code: 'OPEN_PR_OF_ACTIVE_AGENT', detail: `PR #${pr.number} (${pr.branch}) belongs to an active lease`});
  }
  for (const run of runningRuns) if (run.branch === task.branch) reasons.push({code: 'CI_RUNNING', detail: `CI run ${run.id} on ${run.branch} is ${run.status}: wait for it to finish`});
  return {verdict: reasons.length ? 'STOP' : 'PROCEED', reasons, task: {id: task.id, state: task.state, branch: task.branch, pr: task.pr, lease: lease ?? null},
    in_progress: {active_leases: (registry.tasks || []).filter(t => t.lease && Date.parse(t.lease.expires_at) > now.getTime()).map(t => ({task: t.id, holder: t.lease.holder, expires_at: t.lease.expires_at})),
      open_prs: openPrs.map(pr => ({number: pr.number, branch: pr.branch})), running_ci: runningRuns.map(run => ({id: run.id, branch: run.branch}))}};
}

export function fetchRunningRuns(repository, {env = process.env, run} = {}) {
  const exec = run || (url => execFileSync('curl', ['-sS', '--fail', '--max-time', '30', '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: matchpilot-governance',
    ...(env.GITHUB_TOKEN ? ['-H', `Authorization: Bearer ${env.GITHUB_TOKEN}`] : []), url], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']}));
  const rows = [];
  for (const status of ['in_progress', 'queued']) rows.push(...(JSON.parse(exec(`https://api.github.com/repos/${repository}/actions/runs?status=${status}&per_page=100`)).workflow_runs || []));
  return rows.map(r => ({id: r.id, branch: r.head_branch, status: r.status}));
}
