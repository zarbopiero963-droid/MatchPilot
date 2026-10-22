// MP-MULTIAGENT-SYNC-CHECKPOINT-01 (#150): machine-readable checkpoints, latest-valid resolution,
// reconciliation against real git state and idempotent persistence. No network access here.
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync} from 'node:fs';
import {join} from 'node:path';
import {findSecrets} from './secrets.mjs';

export const SCHEMA_VERSION = 'mp-checkpoint-v2';
// v3 (MP-GITHUB-RECON-IMPLEMENTATION-01) extends v2 with the handoff record: every v2 rule still applies, v2 stays valid.
export const SCHEMA_V3 = 'mp-checkpoint-v3';
export const HANDOFF_STATUSES = ['NONE', 'OUT', 'IN', 'PENDING_VERIFICATION'];
export const AUTHORIZATION_STATUSES = ['VALID', 'CONSUMED', 'REVOKED', 'NOT_GRANTED'];
// MP-OWNER-AGENTS-INTERCHANGEABLE-01: an authorization depends on mandate, task, resource and action, never on who the
// agent is; any agent holding the lease may use it.
export const AUTHORIZATION_SCOPE_KEYS = ['mandate', 'task', 'resource', 'action'];
// MP-PR183-HARDENING-01: a GO names at least the task and the action it allows; a wildcard value is ambiguous.
export const REQUIRED_SCOPE_KEYS = ['task', 'action'];
const WILDCARD = /^\s*(\*|any|all|every|tutt[ie]|qualsiasi)\s*$/i;
export const VERIFICATION_RESULTS = ['VERIFIED', 'MISMATCH'];
export const PR_STATES = ['open', 'closed', 'merged'];
// PR state read from GitHub is evidence for a few minutes only; an older reading must be taken again.
export const PR_EVIDENCE_MAX_AGE_MS = 10 * 60e3;
export const VERIFICATION_MAX_AGE_MS = 24 * 3600e3;

// Resources a task writes, whoever holds it: the declared ones plus, implicitly, the branch of an implementation task
// and its PR. Two writers on any of them at the same time are refused (NO DUAL WRITER).
export function taskResources(task) {
  const resources = new Set(Array.isArray(task?.resources) ? task.resources : []);
  if (task?.kind === 'implementation' && typeof task.branch === 'string' && task.branch) resources.add(`branch:${task.branch}`);
  if (Number.isInteger(task?.pr)) resources.add(`pr:${task.pr}`);
  return [...resources];
}

// One structured verification by the receiving agent: which claim, on which resource, how it was checked (the command
// or read), what was observed, when, by whom, and the result. A bare sentence is not evidence.
export function validateVerification(entry, where = 'verification') {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [`${where} must be an object`];
  for (const key of ['claim', 'resource', 'method', 'observed', 'observer']) if (!text(entry[key])) errors.push(`${where} missing ${key}`);
  if (!VERIFICATION_RESULTS.includes(entry.result)) errors.push(`${where} result must be ${VERIFICATION_RESULTS.join(' or ')}`);
  if (!validIso(entry.observed_at)) errors.push(`${where} observed_at must be ISO UTC`);
  if (entry.artifact_sha256 !== undefined && !/^[0-9a-f]{64}$/.test(entry.artifact_sha256)) errors.push(`${where} artifact_sha256 must be SHA-256`);
  return errors;
}
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
// Owner decision ids as written in mandates (MP-..., OWN-...), e.g. MP-PR183-HARDENING-01.
const DECISION_ID = /\b(?:MP|OWN)-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
const text = value => typeof value === 'string' && value.trim() !== '';
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
  if (cp.schema_version !== SCHEMA_VERSION && cp.schema_version !== SCHEMA_V3 && !legacy) errors.push(`${at} schema_version must be ${SCHEMA_VERSION} or ${SCHEMA_V3}`);
  if (cp.schema_version === SCHEMA_V3) errors.push(...validateV3(cp, at));
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
  // Review 6326994852 finding 1: a v3 mandate may only name decisions that the register really holds, in its id and in
  // the text of its source.
  if (decisionIds && cp.schema_version === SCHEMA_V3) {
    for (const id of new Set([cp.mandate?.id, ...String(cp.mandate?.source ?? '').match(DECISION_ID) ?? []])) {
      if (id && !decisionIds.has(id)) errors.push(`${at} mandate names ${id}, which is not in the owner-decision register`);
    }
  }
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

const stringArray = value => Array.isArray(value) && value.every(text);

function scopeErrors(scope, where) {
  const errors = [];
  if (!scope || typeof scope !== 'object' || Array.isArray(scope) || !Object.keys(scope).length) return [`${where} needs a scope`];
  for (const key of Object.keys(scope)) {
    if (!AUTHORIZATION_SCOPE_KEYS.includes(key)) errors.push(`${where} scope key ${key} is not admitted (authorizations depend on ${AUTHORIZATION_SCOPE_KEYS.join(', ')}, never on the agent)`);
    else if (!text(scope[key])) errors.push(`${where} scope.${key} must be a string`);
    else if (WILDCARD.test(scope[key])) errors.push(`${where} scope.${key} is a wildcard: ambiguous`);
  }
  for (const key of REQUIRED_SCOPE_KEYS) if (!(key in scope)) errors.push(`${where} scope needs ${key}`);
  return errors;
}

// v3 handoff record. The receiving agent needs nothing from the sender's conversation: mandate, session, base and tree,
// worktree, progress, authorizations, external commands, artifacts, stop conditions, costs and VPS facts are all here.
// No secret ever goes in a checkpoint (findSecrets runs on the whole object); credentials stay where they are.
function validateV3(cp, at) {
  const errors = [];
  if (!text(cp.mandate?.id) || !text(cp.mandate?.source)) errors.push(`${at} v3 mandate needs id and source`);
  if (!text(cp.agent?.session)) errors.push(`${at} v3 agent.session is required`);
  if (!SHA.test(cp.base_sha || '')) errors.push(`${at} v3 base_sha must be a full SHA`);
  if (typeof cp.worktree?.clean !== 'boolean') errors.push(`${at} v3 worktree.clean must be a boolean`);
  for (const key of ['done', 'in_progress', 'not_started']) if (!stringArray(cp.progress?.[key])) errors.push(`${at} v3 progress.${key} must be an array of strings`);
  if (!stringArray(cp.resources)) errors.push(`${at} v3 resources must be an array of strings`);
  if (!Array.isArray(cp.stop_conditions) || !cp.stop_conditions.length || !stringArray(cp.stop_conditions)) errors.push(`${at} v3 stop_conditions must be a non-empty array of strings`);
  if (!text(cp.costs?.incurred) || !text(cp.costs?.authorized)) errors.push(`${at} v3 costs needs incurred and authorized`);
  if (cp.vps !== null && (typeof cp.vps !== 'object' || Array.isArray(cp.vps))) errors.push(`${at} v3 vps must be an object or null`);
  if (!Array.isArray(cp.external_commands)) errors.push(`${at} v3 external_commands must be an array`);
  (cp.external_commands || []).forEach((entry, i) => {
    if (!text(entry?.target) || !text(entry?.command) || !text(entry?.effect)) errors.push(`${at} external_commands[${i}] needs target, command and effect`);
  });
  if (!Array.isArray(cp.artifacts)) errors.push(`${at} v3 artifacts must be an array`);
  (cp.artifacts || []).forEach((entry, i) => {
    if (!text(entry?.path) || !/^[0-9a-f]{64}$/.test(entry?.sha256 || '')) errors.push(`${at} artifacts[${i}] needs path and a SHA-256`);
  });
  if (!Array.isArray(cp.authorizations)) errors.push(`${at} v3 authorizations must be an array`);
  (cp.authorizations || []).forEach((entry, i) => {
    const where = `${at} authorizations[${i}]`;
    if (!text(entry?.id) || !text(entry?.source)) errors.push(`${where} needs id and source`);
    if (!AUTHORIZATION_STATUSES.includes(entry?.status)) errors.push(`${where} invalid status ${entry?.status}`);
    if (entry?.status === 'CONSUMED' && !text(entry?.consumed_by)) errors.push(`${where} CONSUMED needs consumed_by`);
    errors.push(...scopeErrors(entry?.scope, where));
  });
  const handoff = cp.handoff;
  if (!HANDOFF_STATUSES.includes(handoff?.status)) errors.push(`${at} v3 handoff.status must be one of ${HANDOFF_STATUSES.join(', ')}`);
  else {
    if (!stringArray(handoff.responsibilities)) errors.push(`${at} v3 handoff.responsibilities must be an array of strings`);
    if (cp.state === 'HANDOFF READY' && handoff.status !== 'OUT') errors.push(`${at} HANDOFF READY needs handoff.status OUT`);
    if (handoff.status === 'OUT' && cp.state !== 'HANDOFF READY') errors.push(`${at} handoff OUT needs state HANDOFF READY`);
    if (handoff.status === 'OUT' && !(handoff.responsibilities || []).length) errors.push(`${at} handoff OUT must list the responsibilities transferred`);
    if (handoff.status === 'IN') {
      if (!text(handoff.from) || !Array.isArray(handoff.verified) || !handoff.verified.length) errors.push(`${at} handoff IN needs from and the structured verifications of the receiver`);
      (Array.isArray(handoff.verified) ? handoff.verified : []).forEach((entry, i) => errors.push(...validateVerification(entry, `${at} handoff.verified[${i}]`)));
    }
    if (handoff.claims !== undefined) {
      const ids = new Set();
      if (!Array.isArray(handoff.claims)) errors.push(`${at} handoff.claims must be an array`);
      else handoff.claims.forEach((claim, i) => {
        if (!text(claim?.id) || !text(claim?.resource) || !text(claim?.statement)) errors.push(`${at} handoff.claims[${i}] needs id, resource and statement`);
        else if (ids.has(claim.id)) errors.push(`${at} handoff.claims[${i}] duplicates ${claim.id}`);
        ids.add(claim?.id);
      });
    }
    if (handoff.status === 'PENDING_VERIFICATION' && ['CERTIFIED', 'MERGED', 'COMPLETED', 'HANDOFF READY'].includes(cp.state)) errors.push(`${at} PENDING_VERIFICATION cannot be ${cp.state}: unverified claims certify nothing`);
    if (handoff.to !== undefined && handoff.to !== null && !text(handoff.to)) errors.push(`${at} handoff.to must be an agent id, ANY or null`);
  }
  if (cp.state === 'MERGED' && !SHA.test(cp.merge_sha || '')) errors.push(`${at} v3 MERGED needs merge_sha`);
  return errors;
}

// Authorization ledger over all checkpoints: once an owner GO is CONSUMED or REVOKED it never becomes VALID again,
// whatever a later checkpoint says (fail closed).
export function authorizationLedger(checkpoints) {
  const ledger = new Map();
  for (const cp of checkpoints) for (const entry of cp.authorizations || []) {
    if (!entry?.id) continue;
    const item = ledger.get(entry.id) ?? {id: entry.id, status: null, scope: entry.scope ?? {}, sources: [], ambiguous: false};
    item.sources.push(cp.id);
    if (entry.status === 'CONSUMED' || entry.status === 'REVOKED') { if (item.status !== 'REVOKED') item.status = entry.status; if (entry.consumed_by) item.consumed_by = entry.consumed_by; }
    // A GO recorded as not granted may be granted later; nothing brings back a consumed or revoked one. The same GO
    // recorded VALID with two different scopes is ambiguous and never usable.
    else if (entry.status === 'VALID' && (item.status === null || item.status === 'NOT_GRANTED')) { item.status = 'VALID'; item.scope = entry.scope ?? {}; }
    else if (entry.status === 'VALID' && item.status === 'VALID' && canonicalScope(entry.scope) !== canonicalScope(item.scope)) item.ambiguous = true;
    else if (entry.status === 'NOT_GRANTED' && item.status === null) item.status = 'NOT_GRANTED';
    ledger.set(entry.id, item);
  }
  return ledger;
}

// May an authorization be used for this request? The request names mandate, task, resource and action; there is no
// agent parameter on purpose. Unknown, consumed, revoked, not granted or out-of-scope: refused.
// The request must name at least task and action; every key of the GO scope must match, and the request may not
// name a key the GO does not bound (a GO without a resource is not a GO for any resource).
export function checkAuthorization(checkpoints, id, request = {}) {
  const missing = REQUIRED_SCOPE_KEYS.filter(key => !text(request[key]));
  if (missing.length) return {ok: false, problems: [`AUTHZ_REQUEST_INCOMPLETE: the request must name ${missing.join(' and ')}`]};
  const item = authorizationLedger(checkpoints).get(id);
  if (!item || item.status === null) return {ok: false, problems: [`AUTHZ_UNKNOWN: ${id} is not recorded in any checkpoint`]};
  if (item.status !== 'VALID') return {ok: false, problems: [`AUTHZ_${item.status}: ${id}${item.consumed_by ? ` (consumed by ${item.consumed_by})` : ''}`]};
  if (item.ambiguous) return {ok: false, problems: [`AUTHZ_AMBIGUOUS: ${id} is recorded VALID with different scopes`]};
  const scopeProblems = scopeErrors(item.scope, id);
  if (scopeProblems.length) return {ok: false, problems: scopeProblems.map(problem => `AUTHZ_SCOPE_INCOMPLETE: ${problem}`)};
  const problems = [];
  for (const [key, value] of Object.entries(item.scope)) {
    if (request[key] !== value) problems.push(`AUTHZ_SCOPE: ${id} is for ${key} ${value}, not ${request[key] ?? '(none)'}`);
  }
  for (const key of Object.keys(request)) {
    if (!(key in item.scope)) problems.push(`AUTHZ_SCOPE_UNBOUNDED: ${id} does not bound ${key}, so it cannot authorize ${key} ${request[key]}`);
  }
  return {ok: !problems.length, problems};
}

const canonicalScope = scope => JSON.stringify(Object.entries(scope ?? {}).sort(([a], [b]) => a.localeCompare(b)));

// PR state evidence (MP-PR183-HARDENING-01): read from the GitHub API by the tool itself (tools/governance/github.mjs),
// for this PR number, a few minutes old at most. A state typed by the agent is not evidence.
function prProblems(prNumber, evidence, error, now) {
  if (!evidence) return [`PR_STATE_${error ? 'UNVERIFIABLE' : 'REQUIRED'}: PR #${prNumber} state must be read from GitHub${error ? ` (${error})` : ''}`];
  const problems = [];
  if (evidence.source !== 'github-api') problems.push(`PR_STATE_REQUIRED: PR #${prNumber} state has no GitHub API source`);
  if (evidence.number !== prNumber) problems.push(`PR_STATE_MISMATCH: evidence is for PR #${evidence.number}, not #${prNumber}`);
  if (!PR_STATES.includes(evidence.state)) problems.push(`PR_STATE_UNVERIFIABLE: state ${evidence.state}`);
  if (!SHA.test(evidence.head_sha || '')) problems.push('PR_STATE_UNVERIFIABLE: no head SHA');
  const age = now.getTime() - Date.parse(evidence.fetched_at);
  if (!validIso(evidence.fetched_at) || age > PR_EVIDENCE_MAX_AGE_MS || age < -FUTURE_TOLERANCE_MS) problems.push(`PR_STATE_STALE: read at ${evidence.fetched_at}`);
  return problems;
}

// Claims pending verification are released only by structured verifications of this agent covering every claim on its
// resource, recent and all VERIFIED. Unstructured claims can never be released: the sender must restate them.
function claimProblems(cp, evidence, agentId, now) {
  const claims = cp.handoff?.claims;
  if (!Array.isArray(claims) || !claims.length || claims.some(claim => !text(claim?.id) || !text(claim?.resource))) {
    return [`HANDOFF_CLAIMS_UNSTRUCTURED: ${cp.id} carries unverified claims without ids and resources; they must be restated as structured claims before any takeover`];
  }
  const records = Array.isArray(evidence) ? evidence : [];
  const problems = [];
  const ids = new Set(claims.map(claim => claim.id));
  records.forEach((entry, i) => {
    const errors = validateVerification(entry, `evidence[${i}]`);
    if (errors.length) problems.push(...errors.map(error => `EVIDENCE_INVALID: ${error}`));
    else if (!ids.has(entry.claim)) problems.push(`EVIDENCE_UNKNOWN_CLAIM: evidence[${i}] names ${entry.claim}`);
  });
  for (const claim of claims) {
    const own = records.filter(entry => entry?.claim === claim.id && !validateVerification(entry).length);
    const usable = own.filter(entry => entry.resource === claim.resource && entry.observer === agentId
      && now.getTime() - Date.parse(entry.observed_at) <= VERIFICATION_MAX_AGE_MS && Date.parse(entry.observed_at) <= now.getTime() + FUTURE_TOLERANCE_MS);
    if (!usable.length) problems.push(`EVIDENCE_MISSING: claim ${claim.id} on ${claim.resource} has no recent verification by ${agentId} on that resource`);
    if (usable.some(entry => entry.result === 'MISMATCH')) problems.push(`CLAIM_MISMATCH: claim ${claim.id} does not match what ${agentId} observed`);
  }
  if (!problems.length) return [];
  return [`HANDOFF_PENDING_VERIFICATION: ${cp.id} carries unverified claims`, ...problems];
}

// HANDOFF IN: what an agent must establish before writing anything on a task, whoever it is. Any problem stops it
// (fail closed): a stale or forked chain, a registry behind the chain, a branch that does not match, a lease or a
// resource held by another writer, a handoff addressed to someone else or still pending verification.
// `reality` comes from git (realityFor) plus the PR state read from GitHub; never from the checkpoint.
// `evidence` holds the receiver's structured verifications (validateVerification), made read-only before any write;
// they go into its handoff IN checkpoint and are required to take over claims pending verification. `reality.pr` is the
// PR state read from GitHub by the tool, required whenever the task or its checkpoint has a PR.
export function handoffIn({checkpoints, registry, task: taskId, agentId, reality = {}, now = new Date(), errata = new Map(), evidence = []}) {
  const problems = [];
  try {
    const task = registry.tasks.find(item => item.id === taskId);
    if (!task) return {ok: false, problems: [`UNKNOWN_TASK: ${taskId}`], checkpoint: null};
    const {latest, conflicts} = resolveLatest(checkpoints, taskId, {errata});
    for (const conflict of conflicts) problems.push(`CHAIN_CONFLICT: ${conflict}`);
    if (!latest) return {ok: false, problems: [...problems, `NO_CHECKPOINT: ${taskId}`], checkpoint: null};
    if (task.latest_checkpoint !== latest.id) problems.push(`STALE_REGISTRY: registry says ${task.latest_checkpoint}, chain head is ${latest.id}`);
    const prNumber = Number.isInteger(task.pr) ? task.pr : Number.isInteger(latest.pr) ? latest.pr : null;
    let prState = null;
    if (prNumber !== null) {
      const prErrors = prProblems(prNumber, reality.pr, reality.prError, now);
      problems.push(...prErrors);
      if (!prErrors.length) {
        prState = reality.pr.state;
        if (task.pr_open === true && prState !== 'open') problems.push(`PR_OPEN_MISMATCH: registry says PR #${prNumber} is open, GitHub says ${prState}`);
        if (task.pr_open === false && prState === 'open') problems.push(`PR_OPEN_MISMATCH: registry says PR #${prNumber} is not open, GitHub says open`);
        if (prState === 'open' && reality.branchHead && reality.pr.head_sha !== reality.branchHead) problems.push(`PR_HEAD_MISMATCH: PR #${prNumber} head is ${reality.pr.head_sha}, local view of ${latest.branch} is ${reality.branchHead}: fetch first`);
      }
    }
    for (const divergence of reconcile(latest, {...reality, prState}, {now, errata})) problems.push(`${divergence.code}: ${divergence.detail}`);
    const nowMs = now.getTime();
    const activeLease = lease => Boolean(lease) && Date.parse(lease.expires_at) > nowMs;
    if (activeLease(task.lease) && task.lease.holder !== agentId) problems.push(`DUAL_WRITER: ${taskId} is leased to ${task.lease.holder} until ${task.lease.expires_at}`);
    const resources = new Set([...taskResources(task), ...(Array.isArray(latest.resources) ? latest.resources : [])]);
    for (const other of registry.tasks) {
      if (other.id === taskId || !activeLease(other.lease) || other.lease.holder === agentId) continue;
      for (const resource of taskResources(other)) if (resources.has(resource)) problems.push(`DUAL_WRITER_RESOURCE: ${resource} is written by ${other.id} (${other.lease.holder})`);
    }
    const handoff = latest.handoff;
    if (handoff?.status === 'PENDING_VERIFICATION') problems.push(...claimProblems(latest, evidence, agentId, now));
    if (handoff?.to && handoff.to !== 'ANY' && handoff.to !== agentId) problems.push(`HANDOFF_ADDRESSED_ELSEWHERE: ${latest.id} is handed to ${handoff.to}`);
    return {ok: !problems.length, problems, checkpoint: latest};
  } catch (error) {
    return {ok: false, problems: [...problems, `HANDOFF_IN_ERROR: ${String(error?.message ?? error).split('\n')[0]}`], checkpoint: null};
  }
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
