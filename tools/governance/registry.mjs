// Shared activity registry (#150): verifiable assignments, leases, one active implementation task, one writer per resource,
// optimistic concurrency (revision compare-and-swap) and a local file lock for same-worktree writers.
import {closeSync, existsSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {STATES, taskResources} from './checkpoints.mjs';

export const REGISTRY_SCHEMA = 'mp-work-registry-v1';
// operations: work outside the repository (VPS, databases, services) under an owner GO; it never takes the PR slot,
// but its resources follow the single-writer rule like any other task.
export const KINDS = ['implementation', 'review', 'audit', 'readonly', 'operations'];
// RUNNING and REVIEW always occupy the single implementation slot. Any other non-final state occupies it
// while its PR may still be open: only an explicit `pr_open: false` releases it, so a missing flag fails
// closed (#152 review N-4, #153 review NB-5). A BLOCKED task without an open PR has no work in flight and
// must not stop independent tasks (MP-OWNER-AUTONOMOUS-EXECUTION-01, "stop conditions").
const FINAL_STATES = new Set(['MERGED', 'COMPLETED']);
const isLive = task => task.state === 'RUNNING' || task.state === 'REVIEW'
  || (!FINAL_STATES.has(task.state) && Number.isInteger(task.pr) && task.pr_open !== false);

export class RegistryConflict extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}

const leaseActive = (lease, now) => Boolean(lease) && Date.parse(lease.expires_at) > now.getTime();

// A second live implementation task is admitted only when it cites an IN_FORCE owner decision that names it in
// `parallel_tasks` (e.g. one governance PR while another PR waits): the exception is the owner's, recorded, and
// limited to the tasks it names. Without the decision register the rule stays strict.
export function parallelAuthorized(task, decisions) {
  if (!decisions || !task.parallel_authorization) return false;
  const decision = (decisions.decisions || []).find(item => item.id === task.parallel_authorization);
  return decision?.status === 'IN_FORCE' && Array.isArray(decision.parallel_tasks) && decision.parallel_tasks.includes(task.id);
}

// No dual writer (MP-OWNER-AGENTS-INTERCHANGEABLE-01): a resource (branch, PR, VPS host, database...) has at most one
// writer, whoever the agent is. Two active leases of different holders on one resource are an error. The branch of an
// implementation task and its PR are resources even when not declared (taskResources). The registry file itself is
// protected by the revision compare-and-swap and the file lock, not by a lease.
export function resourceConflicts(registry, now = new Date()) {
  const writers = new Map();
  const conflicts = [];
  for (const task of registry.tasks || []) {
    if (!leaseActive(task.lease, now)) continue;
    for (const resource of taskResources(task)) {
      const other = writers.get(resource);
      if (other && other.holder !== task.lease.holder) conflicts.push(`dual writer on ${resource}: ${other.task} (${other.holder}) and ${task.id} (${task.lease.holder})`);
      else writers.set(resource, {task: task.id, holder: task.lease.holder});
    }
  }
  return conflicts;
}

export function validateRegistry(registry, {checkpointIds, decisions, now = new Date()} = {}) {
  const errors = [];
  if (registry.schema_version !== REGISTRY_SCHEMA) errors.push(`registry schema_version must be ${REGISTRY_SCHEMA}`);
  if (!Number.isInteger(registry.revision) || registry.revision < 0) errors.push('registry revision must be a non-negative integer');
  const ids = new Set();
  for (const task of registry.tasks || []) {
    if (!task.id || ids.has(task.id)) errors.push(`task id missing or duplicated: ${task.id}`);
    ids.add(task.id);
    if (!KINDS.includes(task.kind)) errors.push(`${task.id} invalid kind ${task.kind}`);
    if (!STATES.includes(task.state)) errors.push(`${task.id} invalid state ${task.state}`);
    if (!Number.isInteger(task.issue)) errors.push(`${task.id} issue must be a number`);
    if (task.pr_open !== undefined && typeof task.pr_open !== 'boolean') errors.push(`${task.id} pr_open must be a boolean`);
    if (task.pr_open === true && !Number.isInteger(task.pr)) errors.push(`${task.id} pr_open without pr`);
    if (Number.isInteger(task.pr) && !FINAL_STATES.has(task.state) && typeof task.pr_open !== 'boolean') errors.push(`${task.id} has pr ${task.pr} in state ${task.state} but no pr_open`);
    if (task.lease && !(task.lease.holder && Date.parse(task.lease.acquired_at) < Date.parse(task.lease.expires_at))) errors.push(`${task.id} malformed lease`);
    if (task.lease && task.assignee?.agent !== task.lease.holder) errors.push(`${task.id} lease holder is not the assignee`);
    if (checkpointIds && task.latest_checkpoint && !checkpointIds.has(task.latest_checkpoint)) errors.push(`${task.id} latest_checkpoint ${task.latest_checkpoint} not found`);
    if (task.resources !== undefined && !(Array.isArray(task.resources) && task.resources.every(item => typeof item === 'string' && item))) errors.push(`${task.id} resources must be an array of strings`);
    if (task.parallel_authorization !== undefined && decisions && !parallelAuthorized(task, decisions)) errors.push(`${task.id} parallel_authorization ${task.parallel_authorization} is not an IN_FORCE owner decision naming this task`);
  }
  const liveImplementations = (registry.tasks || []).filter(task => task.kind === 'implementation' && isLive(task) && !parallelAuthorized(task, decisions));
  if (liveImplementations.length > 1) errors.push(`more than one active implementation task: ${liveImplementations.map(task => task.id).join(', ')}`);
  errors.push(...resourceConflicts(registry, now));
  return errors;
}

function bump(registry, taskId, change) {
  return {...registry, revision: registry.revision + 1, tasks: registry.tasks.map(task => task.id === taskId ? {...task, ...change} : task)};
}

// Claim (or renew) a task. Taking over an expired lease from another agent requires an explicit
// reconciliation of its latest checkpoint against the real repository (`reconciled: true`).
export function claim(registry, taskId, agent, now, {expectedRevision, ttlMinutes = 120, reconciled = false, decisions} = {}) {
  if (expectedRevision !== undefined && expectedRevision !== registry.revision) throw new RegistryConflict('CONFLICT_REVISION', `expected ${expectedRevision}, found ${registry.revision}`);
  const task = registry.tasks.find(item => item.id === taskId);
  if (!task) throw new RegistryConflict('UNKNOWN_TASK', taskId);
  if (['MERGED', 'COMPLETED'].includes(task.state)) throw new RegistryConflict('TASK_FINISHED', `${taskId} is ${task.state}`);
  const holder = task.lease?.holder;
  if (holder && holder !== agent.id) {
    if (leaseActive(task.lease, now)) throw new RegistryConflict('CONFLICT_LEASE_ACTIVE', `${taskId} held by ${holder} until ${task.lease.expires_at}`);
    if (!reconciled) throw new RegistryConflict('CONFLICT_UNRECONCILED', `${taskId}: expired lease of ${holder} needs reconciliation first`);
  }
  if (task.kind === 'implementation' && !parallelAuthorized(task, decisions)) {
    const other = registry.tasks.find(item => item.id !== taskId && item.kind === 'implementation' && isLive(item) && !parallelAuthorized(item, decisions));
    if (other) throw new RegistryConflict('CONFLICT_PARALLEL_IMPLEMENTATION', `${other.id} is ${other.state}`);
  }
  const wanted = taskResources(task);
  for (const other of registry.tasks) {
    if (other.id === taskId || !leaseActive(other.lease, now) || other.lease.holder === agent.id) continue;
    const shared = taskResources(other).filter(resource => wanted.includes(resource));
    if (shared.length) throw new RegistryConflict('CONFLICT_RESOURCE_LEASED', `${shared.join(', ')} written by ${other.id} (${other.lease.holder}) until ${other.lease.expires_at}`);
  }
  const lease = {holder: agent.id, acquired_at: now.toISOString(), expires_at: new Date(now.getTime() + ttlMinutes * 60e3).toISOString()};
  return bump(registry, taskId, {assignee: {agent: agent.id, role: agent.role}, lease, state: 'RUNNING'});
}

// Release a task at a checkpoint (e.g. HANDOFF READY, REVIEW, MERGED). Only the lease holder may release.
export function release(registry, taskId, agentId, checkpointId, state, {expectedRevision} = {}) {
  if (expectedRevision !== undefined && expectedRevision !== registry.revision) throw new RegistryConflict('CONFLICT_REVISION', `expected ${expectedRevision}, found ${registry.revision}`);
  const task = registry.tasks.find(item => item.id === taskId);
  if (!task) throw new RegistryConflict('UNKNOWN_TASK', taskId);
  if (task.lease?.holder !== agentId) throw new RegistryConflict('NOT_LEASE_HOLDER', `${agentId} does not hold ${taskId}`);
  if (!STATES.includes(state)) throw new RegistryConflict('INVALID_STATE', state);
  const keepAssignee = state === 'HANDOFF READY' ? null : task.assignee;
  return bump(registry, taskId, {lease: null, assignee: keepAssignee, state, latest_checkpoint: checkpointId});
}

// Serialize writers in one worktree with an exclusive lock file, then write atomically.
export function updateRegistryFile(file, mutate) {
  const lock = `${file}.lock`;
  let fd;
  try { fd = openSync(lock, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') {
      // The holder may release the lock between our open and stat: the age is then unknown, the conflict stands.
      let age = 'unknown';
      try { age = `${Math.round((Date.now() - statSync(lock).mtimeMs) / 1000)}s`; } catch {}
      throw new RegistryConflict('CONFLICT_LOCKED', `${lock} exists (age ${age}); if no writer is running, follow the stale-lock recovery in docs/governance/HANDOFF.md`);
    }
    throw error;
  }
  try {
    const current = JSON.parse(readFileSync(file, 'utf8'));
    const next = mutate(current);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    renameSync(tmp, file);
    return next;
  } finally {
    closeSync(fd);
    if (existsSync(lock)) unlinkSync(lock);
  }
}
