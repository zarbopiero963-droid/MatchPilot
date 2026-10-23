#!/usr/bin/env node
// Governance CLI (#150). Commands:
//   validate                  registry, checkpoints, chains and owner-decision register
//   status [--json]           where the work stands: tasks, leases, latest checkpoints, divergences
//   resume <task>             handoff/recovery check for <task>; exit 2 on divergence
//   handoff-in <task> --agent <id> [--evidence <file.json>]
//                             HANDOFF IN for any agent: exit 2 unless it may write on <task> now (fail closed); the PR
//                             state is read from GitHub by the tool, claims need structured evidence
//   authz-check <id> [--mandate M] [--task T] [--resource R] [--action A]
//                             may this owner authorization be used for this request (task and action required)? the
//                             repository state is validated first; exit 2 if not
//   scan-closing [files...]   reject auto-closing references in files, PR_TITLE/PR_BODY and BASE_SHA..HEAD_SHA commits
//   merge-gate <file.json>    evaluate MP-OWNER-AUTOMERGE-01 for a merge input filled from GitHub facts
//   check-append-only         fail if BASE_SHA..HEAD_SHA modifies or deletes an existing checkpoint
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkAuthorization, errataMap, handoffIn, loadCheckpoints, reconcile, resolveLatest, taskResources, validateCheckpoint, validateErrata, validateHistory} from './checkpoints.mjs';
import {readPullRequest} from './github.mjs';
import {validateRegistry} from './registry.mjs';
import {evaluateMergeGate, findClosingReferences} from './policy.mjs';
import {checkpointHistory, commitMessages, realityFor, rewrittenCheckpoints} from './git.mjs';
import {loadDecisions, loadInventory, validateDecisions} from '../validate-requirements.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export const paths = {
  registry: `${root}docs/governance/work-registry.json`,
  checkpoints: `${root}docs/governance/checkpoints`,
  errata: `${root}docs/governance/checkpoint-errata.json`,
};
export const CANONICAL_FILES = ['AGENTS.md', 'CLAUDE.md', 'README.md', '.github/pull_request_template.md', 'docs/governance/HANDOFF.md'];

export async function loadState() {
  const decisions = await loadDecisions();
  const inventory = await loadInventory();
  return {
    decisions,
    inventory,
    registry: JSON.parse(readFileSync(paths.registry, 'utf8')),
    checkpoints: loadCheckpoints(paths.checkpoints),
    errata: JSON.parse(readFileSync(paths.errata, 'utf8')),
    history: checkpointHistory(root),
  };
}

export function validateState({decisions, inventory, registry, checkpoints, errata: errataFile, history = null}, {now = new Date()} = {}) {
  const decisionIds = new Set(decisions.decisions.map(item => item.id));
  const requirementIds = new Set(inventory.requirements.map(item => item.id));
  const taskIds = new Set(registry.tasks.map(task => task.id));
  const errors = [...validateDecisions(decisions)];
  errors.push(...validateRegistry(registry, {checkpointIds: new Set(checkpoints.map(cp => cp.id)), decisions, now}));
  errors.push(...validateErrata(errataFile, checkpoints));
  errors.push(...validateHistory(checkpoints, errataFile, history, {now}));
  const errata = errataMap(errataFile);
  for (const cp of checkpoints) errors.push(...validateCheckpoint(cp, {decisionIds, requirementIds, taskIds, now, errata}));
  for (const task of registry.tasks) {
    const {latest, conflicts} = resolveLatest(checkpoints, task.id, {errata});
    errors.push(...conflicts);
    if ((latest?.id ?? null) !== (task.latest_checkpoint ?? null)) errors.push(`${task.id} registry latest_checkpoint ${task.latest_checkpoint} != chain head ${latest?.id}`);
    // NO DUAL WRITER needs the registry to know every resource the work writes: a v3 checkpoint of an open task may
    // not write a resource its registry entry does not declare.
    if (latest && Array.isArray(latest.resources) && !['MERGED', 'COMPLETED'].includes(task.state)) {
      const declared = new Set(taskResources(task));
      for (const resource of latest.resources) if (!declared.has(resource)) errors.push(`${task.id} checkpoint ${latest.id} writes ${resource}, not declared in the registry`);
    }
  }
  return errors;
}

export function describe(state, {now = new Date(), cwd = root} = {}) {
  return state.registry.tasks.map(task => {
    const errata = errataMap(state.errata);
    const {latest} = resolveLatest(state.checkpoints, task.id, {errata});
    const finished = ['MERGED', 'COMPLETED'].includes(task.state);
    const divergences = latest && !finished ? reconcile(latest, realityFor(cwd, latest), {now, errata}) : [];
    return {task: task.id, title: task.title, issue: task.issue, pr: task.pr, kind: task.kind, state: task.state,
      assignee: task.assignee, lease: task.lease, latest_checkpoint: latest?.id ?? null,
      next_action: latest?.next_action ?? null, resume_conditions: latest?.resume_conditions ?? [], divergences};
  });
}

function scanClosing(files) {
  const hits = [];
  for (const file of files) for (const ref of findClosingReferences(readFileSync(`${root}${file}`, 'utf8'))) hits.push(`${file}: ${ref}`);
  for (const key of ['PR_TITLE', 'PR_BODY']) for (const ref of findClosingReferences(process.env[key])) hits.push(`${key}: ${ref}`);
  const {BASE_SHA: base, HEAD_SHA: head} = process.env;
  if (base && head && !/^0+$/.test(base)) {
    const messages = commitMessages(root, base, head);
    if (messages === null) hits.push(`commits ${base}..${head}: history unavailable (fail closed)`);
    else for (const message of messages) for (const ref of findClosingReferences(message)) hits.push(`commit message: ${ref}`);
  }
  return hits;
}

const option = (args, name) => { const i = args.indexOf(name); return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined; };

async function main([command, ...args]) {
  if (command === 'validate') {
    const errors = validateState(await loadState());
    if (errors.length) { console.error(JSON.stringify({result: 'FAIL', errors}, null, 2)); return 1; }
    console.log(JSON.stringify({result: 'PASS'}));
    return 0;
  }
  if (command === 'status' || command === 'resume') {
    const state = await loadState();
    const rows = describe(state).filter(row => command === 'status' || row.task === args[0]);
    if (command === 'resume' && !rows.length) { console.error(`unknown task ${args[0]}`); return 1; }
    const errors = validateState(state);
    const report = {decisions_in_force: state.decisions.decisions.filter(item => item.status === 'IN_FORCE').length, registry_revision: state.registry.revision, validation_errors: errors, tasks: rows};
    if (args.includes('--json') || command === 'resume') console.log(JSON.stringify(report, null, 2));
    else for (const row of rows) console.log(`${row.task} [${row.state}] issue #${row.issue}${row.pr ? ` PR #${row.pr}` : ''} — ${row.title}\n  lease: ${row.lease ? `${row.lease.holder} until ${row.lease.expires_at}` : 'none'} · latest: ${row.latest_checkpoint ?? 'none'}\n  next: ${row.next_action ?? '—'}${row.divergences.length ? `\n  DIVERGENCES: ${row.divergences.map(d => d.code).join(', ')}` : ''}`);
    return errors.length || rows.some(row => row.divergences.length) ? 2 : 0;
  }
  if (command === 'handoff-in') {
    const task = args[0];
    const agentId = option(args, '--agent');
    if (!task || !agentId) { console.error('usage: cli.mjs handoff-in <task> --agent <id> [--evidence <file.json>]'); return 1; }
    // Declared values are not evidence (MP-PR183-HARDENING-01): refuse them instead of ignoring them silently.
    for (const flag of ['--pr-state', '--verified']) if (args.includes(flag)) { console.error(`${flag} is not accepted: the PR state is read from GitHub and claims need --evidence <file.json>`); return 1; }
    let evidence = [];
    const evidenceFile = option(args, '--evidence');
    if (evidenceFile) {
      try { evidence = JSON.parse(readFileSync(evidenceFile, 'utf8')); } catch (error) { console.error(`cannot read ${evidenceFile}: ${error.message}`); return 1; }
      if (!Array.isArray(evidence)) { console.error(`${evidenceFile} must hold an array of verification records`); return 1; }
    }
    const state = await loadState();
    const now = new Date();
    const errata = errataMap(state.errata);
    const {latest} = resolveLatest(state.checkpoints, task, {errata});
    const registryTask = state.registry.tasks.find(item => item.id === task);
    const prNumber = Number.isInteger(registryTask?.pr) ? registryTask.pr : Number.isInteger(latest?.pr) ? latest.pr : null;
    const reality = latest ? realityFor(root, latest) : {};
    if (latest && prNumber !== null) {
      const read = readPullRequest({repository: latest.repository, number: prNumber, now});
      reality.pr = read.evidence ?? null;
      reality.prError = read.error ?? null;
    }
    const verdict = handoffIn({checkpoints: state.checkpoints, registry: state.registry, task, agentId, reality, now, errata, evidence});
    const errors = validateState(state);
    const problems = [...verdict.problems, ...errors.map(error => `VALIDATION: ${error}`)];
    console.log(JSON.stringify({result: problems.length ? 'STOP' : 'PROCEED', task, agent: agentId, checkpoint: verdict.checkpoint?.id ?? null, pr: reality.pr ?? null,
      next_action: verdict.checkpoint?.next_action ?? null, stop_conditions: verdict.checkpoint?.stop_conditions ?? [], problems}, null, 2));
    return problems.length ? 2 : 0;
  }
  if (command === 'authz-check') {
    const state = await loadState();
    const request = Object.fromEntries(['mandate', 'task', 'resource', 'action'].map(key => [key, option(args, `--${key}`)]).filter(([, value]) => value !== undefined));
    // Checkpoints are used as evidence only when the whole repository state validates (fail closed).
    const errors = validateState(state);
    const verdict = errors.length ? {ok: false, problems: errors.map(error => `VALIDATION: ${error}`)} : checkAuthorization(state.checkpoints, args[0], request);
    console.log(JSON.stringify({result: verdict.ok ? 'USABLE' : 'REFUSED', id: args[0], request, problems: verdict.problems}, null, 2));
    return verdict.ok ? 0 : 2;
  }
  if (command === 'scan-closing') {
    const hits = scanClosing(args.length ? args : CANONICAL_FILES);
    if (hits.length) { console.error(JSON.stringify({result: 'FAIL', auto_closing_references: hits}, null, 2)); return 1; }
    console.log(JSON.stringify({result: 'PASS'}));
    return 0;
  }
  if (command === 'check-append-only') {
    const {BASE_SHA: base, HEAD_SHA: head} = process.env;
    if (!base || !head || /^0+$/.test(base)) { console.log(JSON.stringify({result: 'PASS', note: 'no range to check'})); return 0; }
    const rewritten = rewrittenCheckpoints(root, base, head);
    if (rewritten === null) { console.error(JSON.stringify({result: 'FAIL', error: `history ${base}..${head} unavailable (fail closed)`})); return 1; }
    if (rewritten.length) { console.error(JSON.stringify({result: 'FAIL', rewritten_checkpoints: rewritten}, null, 2)); return 1; }
    console.log(JSON.stringify({result: 'PASS'}));
    return 0;
  }
  if (command === 'orient') {
    // GOV-PROTOCOL-01: one-shot orientation for any agent (PROTOCOL.md step 1). --offline skips the GitHub drift read.
    const {validateRuntimeState} = await import('./runtime-state.mjs');
    const state = await loadState();
    const runtime = JSON.parse(readFileSync(`${root}docs/governance/runtime-state.json`, 'utf8'));
    const rows = describe(state);
    const report = {
      registry_revision: state.registry.revision, validation_errors: validateState(state), runtime_state_errors: validateRuntimeState(runtime),
      production_release_sha: runtime.production?.release_sha ?? null, runtime_updated_at: runtime.updated_at, current_task: runtime.current_task,
      next_action: runtime.next_action, blockers: runtime.blockers, pending_runtime_checks: runtime.pending_runtime_checks,
      decisions_in_force: state.decisions.decisions.filter(item => item.status === 'IN_FORCE').map(item => item.id),
      live_tasks: rows.filter(row => !['MERGED', 'COMPLETED'].includes(row.state)),
      handoff_ready: rows.filter(row => row.state === 'HANDOFF READY').map(row => ({task: row.task, checkpoint: row.latest_checkpoint, next_action: row.next_action})),
      drift: null};
    if (!args.includes('--offline')) {
      const {detectDrift, fetchPulls} = await import('./drift.mjs');
      try { report.drift = detectDrift({registry: state.registry, prs: fetchPulls(option(args, '--repo') || 'zarbopiero963-droid/MatchPilot')}); }
      catch (error) { report.drift = [{code: 'GITHUB_UNREADABLE', detail: String(error?.message ?? error).split('\n')[0]}]; }
    }
    const blocked = report.validation_errors.length || report.runtime_state_errors.length || (report.drift || []).length || report.live_tasks.some(row => row.state !== 'BLOCKED' && row.divergences.length);
    if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
    else console.log(`release ${report.production_release_sha}\ncurrent ${report.current_task}\nnext ${report.next_action}\nhandoff ready: ${report.handoff_ready.map(h => `${h.task} @ ${h.checkpoint}`).join(', ') || 'none'}\nlive: ${report.live_tasks.map(r => `${r.task}[${r.state}${r.lease ? ` lease ${r.lease.holder}->${r.lease.expires_at}` : ''}${r.divergences.length ? ` DIVERGENT ${r.divergences.map(d => d.code)}` : ''}]`).join(', ')}\ndrift: ${report.drift === null ? 'skipped (--offline)' : report.drift.map(d => d.code).join(', ') || 'none'}\nverdict: ${blocked ? 'STOP' : 'PROCEED'}`);
    return blocked ? 2 : 0;
  }
  if (command === 'takeover-check') {
    // Owner t145u: mandatory before modifying anything. Reads leases (registry), open PRs, unmerged branches, running CI.
    const {takeoverCheck, fetchPulls, fetchRunningRuns} = await import('./drift.mjs');
    const task = args[0]; const agent = option(args, '--agent');
    if (!task || !agent) { console.error('usage: takeover-check <task> --agent <id>'); return 1; }
    const repository = option(args, '--repo') || 'zarbopiero963-droid/MatchPilot';
    let pulls, runs;
    try { pulls = fetchPulls(repository); runs = fetchRunningRuns(repository); }
    catch (error) { console.log(JSON.stringify({verdict: 'STOP', reasons: [{code: 'GITHUB_UNREADABLE', detail: String(error?.message ?? error).split('\n')[0]}]})); return 2; }
    const state = await loadState();
    const report = takeoverCheck({registry: state.registry, task, agentId: agent, openPrs: pulls.filter(pr => pr.state === 'open'), runningRuns: runs});
    const merged = new Set(pulls.filter(pr => pr.state === 'merged').map(pr => pr.branch));
    let remote = [];
    try { remote = execFileSync('git', ['ls-remote', '--heads', 'origin'], {cwd: root, encoding: 'utf8'}).split('\n').filter(Boolean).map(line => line.split('refs/heads/')[1]); } catch {}
    report.in_progress.unmerged_branches = remote.filter(name => name !== 'main' && !merged.has(name)).length;
    console.log(JSON.stringify(report, null, 2));
    return report.verdict === 'PROCEED' ? 0 : 2;
  }
  if (command === 'claim' || command === 'release') {
    // GOV-PROTOCOL-01: lease claim/release on the registry with revision CAS and the file lock (registry.mjs).
    const {claim, release, updateRegistryFile, RegistryConflict} = await import('./registry.mjs');
    const task = args[0]; const agent = option(args, '--agent');
    if (!task || !agent) { console.error(`usage: ${command} <task> --agent <id> [--role R] [--minutes N] [--reconciled] [--checkpoint <id> --state <STATE>] [--expected-revision N]`); return 1; }
    const expected = option(args, '--expected-revision'); const expectedRevision = expected === undefined ? undefined : Number(expected);
    const decisions = (await loadState()).decisions;
    try {
      const next = updateRegistryFile(`${root}docs/governance/work-registry.json`, registry => command === 'claim'
        ? claim(registry, task, {id: agent, role: option(args, '--role') || 'Development Agent'}, new Date(), {expectedRevision, ttlMinutes: Number(option(args, '--minutes') || 120), reconciled: args.includes('--reconciled'), decisions})
        : release(registry, task, agent, option(args, '--checkpoint') ?? null, option(args, '--state') || 'HANDOFF READY', {expectedRevision}));
      const row = next.tasks.find(item => item.id === task);
      console.log(JSON.stringify({result: 'OK', revision: next.revision, task, state: row.state, lease: row.lease}));
      return 0;
    } catch (error) {
      if (error instanceof RegistryConflict) { console.error(JSON.stringify({result: 'CONFLICT', code: error.code, detail: error.message})); return 2; }
      throw error;
    }
  }
  if (command === 'runtime-state') {
    // GOV-RUNTIME-STATE-01: print (default) or --check the vendor-neutral runtime state.
    const {validateRuntimeState} = await import('./runtime-state.mjs');
    const state = JSON.parse(readFileSync(`${root}docs/governance/runtime-state.json`, 'utf8'));
    const errors = validateRuntimeState(state);
    if (args.includes('--check')) { console.log(JSON.stringify({result: errors.length ? 'FAIL' : 'PASS', errors})); return errors.length ? 1 : 0; }
    console.log(JSON.stringify({...state, validation_errors: errors}, null, 2));
    return errors.length ? 1 : 0;
  }
  if (command === 'drift') {
    // GOV-DRIFT-01: registry vs GitHub. --pr/--branch: the PR under test; --grace: PR numbers allowed non-final.
    const {detectDrift, fetchPulls} = await import('./drift.mjs');
    const state = await loadState();
    const repository = option(args, '--repo') || process.env.GITHUB_REPOSITORY || 'zarbopiero963-droid/MatchPilot';
    let prs;
    try { prs = fetchPulls(repository); } catch (error) { console.error(JSON.stringify({result: 'FAIL', errors: [`GitHub read failed (fail closed): ${String(error?.message ?? error).split('\n')[0]}`]})); return 1; }
    const currentPr = option(args, '--pr') ? Number(option(args, '--pr')) : null;
    const grace = String(option(args, '--grace') || '').split(',').filter(Boolean).map(Number);
    if (Number.isInteger(currentPr)) grace.push(currentPr);
    const problems = detectDrift({registry: state.registry, prs, grace, currentPr, currentBranch: option(args, '--branch') || null});
    console.log(JSON.stringify({result: problems.length ? 'FAIL' : 'PASS', checked_prs: prs.length, problems}, null, 2));
    return problems.length ? 1 : 0;
  }
  if (command === 'merge-gate') {
    const verdict = evaluateMergeGate(JSON.parse(readFileSync(args[0], 'utf8')));
    console.log(JSON.stringify(verdict, null, 2));
    return verdict.allowed ? 0 : 3;
  }
  console.error('usage: cli.mjs validate | status [--json] | resume <task> | handoff-in <task> --agent <id> | authz-check <id> | scan-closing [files...] | check-append-only | merge-gate <file.json>');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
