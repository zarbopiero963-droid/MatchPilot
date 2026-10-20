#!/usr/bin/env node
// Governance CLI (#150). Commands:
//   validate                  registry, checkpoints, chains and owner-decision register
//   status [--json]           where the work stands: tasks, leases, latest checkpoints, divergences
//   resume <task>             handoff/recovery check for <task>; exit 2 on divergence
//   scan-closing [files...]   reject auto-closing references in files, PR_TITLE/PR_BODY and BASE_SHA..HEAD_SHA commits
//   merge-gate <file.json>    evaluate MP-OWNER-AUTOMERGE-01 for a merge input filled from GitHub facts
//   check-append-only         fail if BASE_SHA..HEAD_SHA modifies or deletes an existing checkpoint
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {errataMap, loadCheckpoints, reconcile, resolveLatest, validateCheckpoint, validateErrata, validateHistory} from './checkpoints.mjs';
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
  errors.push(...validateRegistry(registry, {checkpointIds: new Set(checkpoints.map(cp => cp.id))}));
  errors.push(...validateErrata(errataFile, checkpoints));
  errors.push(...validateHistory(checkpoints, errataFile, history, {now}));
  const errata = errataMap(errataFile);
  for (const cp of checkpoints) errors.push(...validateCheckpoint(cp, {decisionIds, requirementIds, taskIds, now, errata}));
  for (const task of registry.tasks) {
    const {latest, conflicts} = resolveLatest(checkpoints, task.id, {errata});
    errors.push(...conflicts);
    if ((latest?.id ?? null) !== (task.latest_checkpoint ?? null)) errors.push(`${task.id} registry latest_checkpoint ${task.latest_checkpoint} != chain head ${latest?.id}`);
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
  if (command === 'merge-gate') {
    // merge-gate <input.json> --pr <number> [--repo owner/name] [--base origin/main]: the declared part (review, gates,
    // merge class from the base classifier) plus the facts read from GitHub, which override and are cross-checked.
    const at = name => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1]; };
    let input = JSON.parse(readFileSync(args[0], 'utf8'));
    const extra = [];
    if (at('pr')) {
      const {readGithubFacts, deployPathCertified, mergeWithFacts} = await import('./merge-facts.mjs');
      const facts = await readGithubFacts({repo: at('repo') ?? 'zarbopiero963-droid/MatchPilot', pr: at('pr')});
      const merged = mergeWithFacts(input, facts, {deployCertified: deployPathCertified(root, at('base') ?? 'origin/main')});
      input = merged.input;
      extra.push(...merged.reasons);
    }
    const verdict = evaluateMergeGate(input);
    if (extra.length) Object.assign(verdict, {allowed: false, action: verdict.action === 'noop' ? 'noop' : 'block', reasons: [...extra, ...verdict.reasons]});
    console.log(JSON.stringify({...verdict, facts: {pr_state: input.pr_state, head_sha: input.head_sha, base_sha: input.base_sha, ci: input.ci,
      last_main_deploy: input.last_main_deploy, deploy_path_certified: input.deploy_path_certified, facts_source: input.facts_source ?? 'declared'}}, null, 2));
    return verdict.allowed ? 0 : 3;
  }
  console.error('usage: cli.mjs validate | status [--json] | resume <task> | scan-closing [files...] | check-append-only | merge-gate <file.json>');
  return 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
