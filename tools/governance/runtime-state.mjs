// GOV-RUNTIME-STATE-01 (#150, t141u): validator for docs/governance/runtime-state.json (schema
// docs/governance/schemas/runtime-state.schema.json). Dependency-free so any agent can run it with plain node.
export const RUNTIME_STATE_SCHEMA = 'mp-runtime-state-v1';
const SHA = /^[0-9a-f]{40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const CHECK_STATUS = new Set(['PENDING', 'PASS', 'FAIL', 'BLOCKED']);
const text = value => typeof value === 'string' && value.trim().length > 0;

export function validateRuntimeState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') return ['runtime state is not an object'];
  if (state.schema_version !== RUNTIME_STATE_SCHEMA) errors.push(`schema_version must be ${RUNTIME_STATE_SCHEMA}`);
  if (!ISO.test(state.updated_at || '')) errors.push('updated_at must be an ISO UTC timestamp');
  if (!text(state.updated_by)) errors.push('updated_by required');
  const production = state.production || {};
  if (!SHA.test(production.release_sha || '')) errors.push('production.release_sha must be a 40-hex SHA');
  if (!ISO.test(production.verified_at || '')) errors.push('production.verified_at must be an ISO UTC timestamp');
  if (!text(production.verification)) errors.push('production.verification required');
  if (!text(state.current_task)) errors.push('current_task required');
  if (!text(state.next_action)) errors.push('next_action required');
  for (const key of ['blockers', 'pending_runtime_checks']) {
    if (!Array.isArray(state[key])) { errors.push(`${key} must be an array`); continue; }
    const seen = new Set();
    for (const item of state[key]) {
      if (!text(item?.id) || !text(item?.detail)) errors.push(`${key}: every item needs id and detail`);
      if (seen.has(item?.id)) errors.push(`${key}: duplicate id ${item?.id}`);
      seen.add(item?.id);
      if (key === 'pending_runtime_checks' && !CHECK_STATUS.has(item?.status)) errors.push(`${key} ${item?.id}: status must be one of ${[...CHECK_STATUS].join('/')}`);
    }
  }
  const decisions = state.owner_decisions_relayed;
  if (!decisions || !text(decisions.source) || !Array.isArray(decisions.items) || !decisions.items.length) errors.push('owner_decisions_relayed needs source and items');
  else for (const item of decisions.items) if (!text(item?.ref) || !text(item?.text)) errors.push('owner_decisions_relayed: every item needs ref and text');
  return errors;
}
