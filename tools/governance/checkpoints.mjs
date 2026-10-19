// MP-MULTIAGENT-SYNC-CHECKPOINT-01 (#150): machine-readable checkpoints, latest-valid resolution,
// reconciliation against real git state and idempotent persistence. No network access here.
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {findSecrets} from './secrets.mjs';

export const SCHEMA_VERSION = 'mp-checkpoint-v2';
// v1 checkpoints written before v2 (#151 review R-2) stay valid as history; new ones must be v2.
// Only these historical v1 checkpoints are accepted: a new checkpoint cannot dodge v2 by backdating (#152 review N-3).
export const LEGACY_SCHEMA = {version: 'mp-checkpoint-v1', ids: new Set(['CP-20261018T201559Z-agent-a-claude-code', 'CP-20261018T202029Z-agent-b-claude-subagent', 'CP-20261018T202316Z-agent-a-claude-code', 'CP-20261018T202336Z-agent-a-claude-code', 'CP-20261018T203228Z-agent-a-claude-code'])};
export const STATES = ['PLANNED', 'RUNNING', 'BLOCKED', 'REVIEW', 'HANDOFF READY', 'CERTIFIED', 'MERGED', 'COMPLETED'];
export const ROLES = ['Development Agent', 'Test Agent', 'Independent Reviewer', 'Requirements Auditor', 'Roadmap Coordinator', 'Integration Agent'];
export const GATE_RESULTS = ['PASS', 'FAIL', 'BLOCKED', 'NOT_VERIFIED', 'NOT_APPLICABLE'];
export const EVIDENCE_RESULTS = ['PASS', 'FAIL', 'SKIPPED', 'NOT_VERIFIED'];
export const REVIEW_VERDICTS = ['APPROVED', 'CHANGES REQUESTED', 'BLOCKED', 'NOT VERIFIED', 'NOT REQUESTED'];
export const CI_CONCLUSIONS = ['SUCCESS', 'FAILURE', 'PENDING', 'NOT_RUN'];
export const ACTIVE_STATES = new Set(['RUNNING', 'REVIEW', 'BLOCKED']);

const SHA = /^[0-9a-f]{40}$/;
const ID = /^CP-(\d{8}T\d{6}Z)-[a-z0-9][a-z0-9-]*$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const commentMarker = id => `<!-- mp-checkpoint:${id} -->`;
// Bookkeeping after a checkpoint: newly added checkpoint files (append-only) and registry updates.
export const isBookkeeping = ({status, file}) => (status === 'A' && /^docs\/governance\/checkpoints\/CP-[^/]+\.json$/.test(file)) || file === 'docs/governance/work-registry.json';
const compactStamp = iso => iso.replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '');
const validIso = value => ISO.test(value || '') && !Number.isNaN(Date.parse(value));

// QAC-010: one Gate B evidence record.
export function validateEvidence(entry, where = 'evidence') {
  const errors = [];
  if (!entry || typeof entry !== 'object') return [`${where} must be an object`];
  for (const key of ['command', 'environment']) if (!String(entry[key] || '').trim()) errors.push(`${where} missing ${key}`);
  if (!EVIDENCE_RESULTS.includes(entry.result)) errors.push(`${where} invalid result ${entry.result}`);
  if (!SHA.test(entry.commit || '')) errors.push(`${where} commit must be a full SHA`);
  if (!validIso(entry.time)) errors.push(`${where} time must be ISO UTC`);
  if (!Array.isArray(entry.limits)) errors.push(`${where} limits must be an array`);
  if (entry.dataset_hash !== undefined && !/^[0-9a-f]{64}$/.test(entry.dataset_hash)) errors.push(`${where} dataset_hash must be SHA-256`);
  return errors;
}

// Checkpoint errata (PR #162 review NB-9): checkpoints are append-only, so a wrong recorded time is never rewritten.
// An erratum bounds the real time from above with the author time of the first commit that contained the file.
// The check below makes a checkpoint dated after its own validation fail, so new errata should not be needed.
export const FUTURE_TOLERANCE_MS = 10 * 60e3;

export function validateErrata(errata, checkpoints) {
  const errors = [];
  if (errata?.schema_version !== 'mp-checkpoint-errata-v1') return ['checkpoint errata schema_version must be mp-checkpoint-errata-v1'];
  const byId = new Map(checkpoints.map(cp => [cp.id, cp]));
  const seen = new Set();
  for (const entry of errata.entries || []) {
    const at = `erratum ${entry?.id}`;
    const cp = byId.get(entry?.id);
    if (!cp) { errors.push(`${at} names an unknown checkpoint`); continue; }
    if (seen.has(entry.id)) errors.push(`${at} is duplicated`);
    seen.add(entry.id);
    if (entry.recorded_timestamp_utc !== cp.timestamp_utc) errors.push(`${at} recorded_timestamp_utc differs from the checkpoint`);
    if (!validIso(entry.not_after_utc)) errors.push(`${at} not_after_utc must be ISO UTC`);
    else if (Date.parse(entry.not_after_utc) >= Date.parse(cp.timestamp_utc)) errors.push(`${at} not_after_utc must be earlier than the recorded time`);
    if (!SHA.test(entry.basis_commit || '')) errors.push(`${at} basis_commit must be a full SHA`);
  }
  return errors;
}

// Checks that need the real history (NB-10, NB-11). `history` comes from git (checkpointHistory) or is null when the
// history is unavailable; the clock check on errata applies either way.
// - An erratum bound can only move a time earlier than a commit that really contained the checkpoint, never later,
//   and when its basis commit is present it must add the checkpoint at exactly that author time.
// - Any other checkpoint may not be dated after the commit that added it (beyond the clock tolerance), whenever the
//   validation runs.
export function validateHistory(checkpoints, errata, history, {now = new Date()} = {}) {
  const errors = [];
  const listed = new Set();
  for (const entry of errata?.entries || []) {
    listed.add(entry.id);
    const at = `erratum ${entry.id}`;
    const bound = Date.parse(entry.not_after_utc);
    if (bound > now.getTime()) errors.push(`${at} not_after_utc is in the future`);
    if (!history) continue;
    const added = history.firstAdded.get(entry.id);
    if (!added) errors.push(`${at} names a checkpoint no commit has added`);
    else if (bound > Date.parse(added.time)) errors.push(`${at} not_after_utc is later than ${added.sha}, which already contained the checkpoint`);
    const basis = SHA.test(entry.basis_commit || '') ? history.commit(entry.basis_commit) : null;
    if (basis) {
      if (!basis.adds.has(entry.id)) errors.push(`${at} basis_commit does not add the checkpoint`);
      if (Date.parse(basis.time) !== bound) errors.push(`${at} not_after_utc differs from the author time of basis_commit`);
    }
  }
  if (history) {
    for (const cp of checkpoints) {
      if (listed.has(cp.id)) continue;
      const added = history.firstAdded.get(cp.id);
      if (added && Date.parse(cp.timestamp_utc) > Date.parse(added.time) + FUTURE_TOLERANCE_MS) {
        errors.push(`checkpoint ${cp.id} timestamp_utc is later than ${added.sha}, the commit that added it`);
      }
    }
  }
  return errors;
}

export const errataMap = errata => new Map((errata?.entries || []).map(entry => [entry.id, entry]));
// The time a checkpoint can be trusted with: its recorded time, or the erratum bound when the recorded time is wrong.
export const effectiveTime = (cp, errata = new Map()) => Date.parse(errata.get(cp.id)?.not_after_utc ?? cp.timestamp_utc);

export function validateCheckpoint(cp, {decisionIds, requirementIds, taskIds, now, errata = new Map()} = {}) {
  const errors = [];
  const at = `checkpoint ${cp?.id}`;
  if (!cp || typeof cp !== 'object') return ['checkpoint must be an object'];
  const legacy = cp.schema_version === LEGACY_SCHEMA.version && LEGACY_SCHEMA.ids.has(cp.id);
  if (cp.schema_version !== SCHEMA_VERSION && !legacy) errors.push(`${at} schema_version must be ${SCHEMA_VERSION}`);
  if (!legacy) {
    // v2: a review and a CI run are only evidence for the exact commit they covered.
    if (cp.review?.verdict === 'APPROVED' && !SHA.test(cp.review?.reviewed_sha || '')) errors.push(`${at} APPROVED review needs review.reviewed_sha`);
    if (cp.ci?.run_id !== null && cp.ci?.run_id !== undefined && !SHA.test(cp.ci?.head_sha || '')) errors.push(`${at} ci.run_id needs ci.head_sha`);
    if (['CERTIFIED', 'MERGED'].includes(cp.state) && cp.review?.reviewed_sha && cp.review.reviewed_sha !== cp.commit_sha) errors.push(`${at} ${cp.state} review covers ${cp.review.reviewed_sha}, not ${cp.commit_sha}`);
  }
  const match = ID.exec(cp.id || '');
  if (!match) errors.push(`${at} invalid id`);
  if (!validIso(cp.timestamp_utc)) errors.push(`${at} timestamp_utc must be ISO UTC`);
  else if (match && compactStamp(cp.timestamp_utc) !== match[1]) errors.push(`${at} id timestamp differs from timestamp_utc`);
  else if (now && !errata.has(cp.id) && Date.parse(cp.timestamp_utc) > now.getTime() + FUTURE_TOLERANCE_MS) errors.push(`${at} timestamp_utc is in the future`);
  if (!cp.agent?.id || !ROLES.includes(cp.agent?.role)) errors.push(`${at} agent needs id and an admitted role`);
  for (const key of ['activity', 'task', 'repository', 'branch', 'next_action']) if (!String(cp[key] || '').trim()) errors.push(`${at} missing ${key}`);
  if (taskIds && !taskIds.has(cp.task)) errors.push(`${at} unknown task ${cp.task}`);
  if (!Number.isInteger(cp.issue)) errors.push(`${at} issue must be a number`);
  if (cp.pr !== null && !Number.isInteger(cp.pr)) errors.push(`${at} pr must be a number or null`);
  if (!SHA.test(cp.commit_sha || '')) errors.push(`${at} commit_sha must be a full SHA`);
  if (!SHA.test(cp.tree_sha || '')) errors.push(`${at} tree_sha must be a full SHA`);
  if (!STATES.includes(cp.state)) errors.push(`${at} invalid state ${cp.state}`);
  for (const key of ['requirements', 'changes', 'tests', 'findings', 'owner_decisions', 'dependencies', 'resume_conditions']) {
    if (!Array.isArray(cp[key])) errors.push(`${at} ${key} must be an array`);
  }
  (cp.tests || []).forEach((entry, i) => {
    errors.push(...validateEvidence(entry, `${at} tests[${i}]`));
    if (validIso(entry?.time) && validIso(cp.timestamp_utc) && Date.parse(entry.time) > Date.parse(cp.timestamp_utc)) errors.push(`${at} tests[${i}] time is later than the checkpoint`);
  });
  if (!CI_CONCLUSIONS.includes(cp.ci?.conclusion)) errors.push(`${at} invalid ci conclusion`);
  if (cp.ci?.run_id !== null && cp.ci?.run_id !== undefined && !Number.isInteger(cp.ci.run_id)) errors.push(`${at} ci.run_id must be a number or null`);
  for (const gate of ['gate_a', 'gate_b']) if (!GATE_RESULTS.includes(cp[gate])) errors.push(`${at} invalid ${gate}`);
  if (!REVIEW_VERDICTS.includes(cp.review?.verdict)) errors.push(`${at} invalid review verdict`);
  for (const finding of cp.findings || []) {
    if (!finding.id || !['BLOCKING', 'NON_BLOCKING'].includes(finding.severity) || !['OPEN', 'RESOLVED', 'TRACKED'].includes(finding.status)) errors.push(`${at} malformed finding ${finding.id}`);
  }
  if (decisionIds) for (const id of cp.owner_decisions || []) if (!decisionIds.has(id)) errors.push(`${at} unknown owner decision ${id}`);
  if (requirementIds) for (const id of cp.requirements || []) if (!requirementIds.has(id)) errors.push(`${at} unknown requirement ${id}`);
  if (cp.state === 'HANDOFF READY' && !(cp.resume_conditions || []).length) errors.push(`${at} HANDOFF READY needs resume_conditions`);
  if (['CERTIFIED', 'MERGED', 'COMPLETED'].includes(cp.state)) {
    if (cp.gate_a !== 'PASS' || cp.gate_b !== 'PASS') errors.push(`${at} ${cp.state} requires Gate A and Gate B PASS`);
    if (cp.review?.verdict !== 'APPROVED') errors.push(`${at} ${cp.state} requires an APPROVED independent review`);
    if ((cp.findings || []).some(f => f.severity === 'BLOCKING' && f.status === 'OPEN')) errors.push(`${at} ${cp.state} with an open blocking finding`);
  }
  if (cp.supersedes !== null && !ID.test(cp.supersedes || '')) errors.push(`${at} supersedes must be a checkpoint id or null`);
  for (const secret of findSecrets(cp)) errors.push(`${at} contains a secret-like value at ${secret}`);
  return errors;
}

// Latest valid checkpoint of a task: the single head of the supersedes chain. Forks are conflicts.
// Among checkpoints both under an erratum the recorded order is kept (their bounds can coincide); otherwise the
// effective times are compared, so a correctly dated checkpoint can follow one recorded in the future.
export function resolveLatest(checkpoints, task, {errata = new Map()} = {}) {
  const own = checkpoints.filter(cp => cp.task === task);
  if (!own.length) return {latest: null, conflicts: []};
  const byId = new Map(own.map(cp => [cp.id, cp]));
  const conflicts = [];
  const children = new Map();
  for (const cp of own) {
    if (cp.supersedes === null) continue;
    const parent = byId.get(cp.supersedes);
    if (!parent) { conflicts.push(`${cp.id} supersedes unknown ${cp.supersedes}`); continue; }
    const bothErrata = errata.has(cp.id) && errata.has(parent.id);
    const newer = bothErrata ? Date.parse(cp.timestamp_utc) > Date.parse(parent.timestamp_utc) : effectiveTime(cp, errata) > effectiveTime(parent, errata);
    if (!newer) conflicts.push(`${cp.id} is not newer than ${parent.id}`);
    children.set(parent.id, [...(children.get(parent.id) || []), cp.id]);
  }
  for (const [parent, kids] of children) if (kids.length > 1) conflicts.push(`fork after ${parent}: ${kids.join(', ')}`);
  const roots = own.filter(cp => cp.supersedes === null);
  if (roots.length > 1) conflicts.push(`multiple roots for ${task}: ${roots.map(cp => cp.id).join(', ')}`);
  const heads = own.filter(cp => !children.has(cp.id));
  if (heads.length !== 1) conflicts.push(`expected one head for ${task}, found ${heads.length}`);
  const latest = heads.sort((a, b) => effectiveTime(b, errata) - effectiveTime(a, errata))[0];
  return {latest, conflicts};
}

// Compare a checkpoint with the real repository state. `reality` comes from git/GitHub, never from the checkpoint.
export function reconcile(cp, reality, {now = new Date(), staleAfterHours = 24, errata = new Map()} = {}) {
  const divergences = [];
  if (reality.branchHead === null) divergences.push({code: 'BRANCH_MISSING', detail: `${cp.branch} not found`});
  else if (reality.branchHead !== cp.commit_sha) {
    // The commit that carries a checkpoint necessarily follows the work commit it describes:
    // later commits touching only governance bookkeeping are reconciled, anything else is not.
    const changed = reality.changedSinceCheckpoint;
    if (!reality.checkpointIsAncestor) divergences.push({code: 'SHA_MISMATCH', detail: `${cp.commit_sha} is not an ancestor of ${reality.branchHead}`});
    else if (!Array.isArray(changed) || !changed.length || !changed.every(isBookkeeping)) {
      divergences.push({code: 'UNRECONCILED_COMMITS', detail: `${cp.branch} moved from ${cp.commit_sha} to ${reality.branchHead}: ${(changed || [{status: '?', file: 'unknown files'}]).filter(entry => !isBookkeeping(entry)).map(entry => `${entry.status} ${entry.file}`).join(', ')}`});
    }
  }
  if (reality.treeSha && reality.branchHead === cp.commit_sha && reality.treeSha !== cp.tree_sha) divergences.push({code: 'TREE_MISMATCH', detail: `tree ${reality.treeSha} != ${cp.tree_sha}`});
  if (reality.prState === 'merged' && !['MERGED', 'COMPLETED', 'CERTIFIED'].includes(cp.state)) divergences.push({code: 'PR_ALREADY_MERGED', detail: `PR #${cp.pr} is merged`});
  if (cp.state === 'MERGED' && reality.prState && reality.prState !== 'merged') divergences.push({code: 'MERGE_NOT_REAL', detail: `PR #${cp.pr} is ${reality.prState}`});
  if (ACTIVE_STATES.has(cp.state) && now - effectiveTime(cp, errata) > staleAfterHours * 3600e3) divergences.push({code: 'STALE', detail: `${cp.state} older than ${staleAfterHours}h`});
  return divergences;
}

export function loadCheckpoints(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.json')).sort().map(name => ({file: name, ...JSON.parse(readFileSync(join(dir, name), 'utf8'))}))
    .map(({file, ...cp}) => {
      if (file !== `${cp.id}.json`) throw new Error(`checkpoint file ${file} does not match id ${cp.id}`);
      return cp;
    });
}

// Idempotent, append-only persistence: same id + same content is a no-op; same id + different content is refused.
export function writeCheckpoint(dir, cp) {
  mkdirSync(dir, {recursive: true});
  const file = join(dir, `${cp.id}.json`);
  const body = JSON.stringify(cp, null, 2) + '\n';
  if (existsSync(file)) {
    if (readFileSync(file, 'utf8') === body) return 'unchanged';
    throw new Error(`checkpoint ${cp.id} already exists with different content`);
  }
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, body, {flag: 'wx'});
  renameSync(tmp, file);
  return 'created';
}

// Idempotent GitHub publication: post a checkpoint comment only when its marker is absent.
export const planComment = (existingBodies, id) => existingBodies.some(body => body.includes(commentMarker(id))) ? 'skip' : 'post';
