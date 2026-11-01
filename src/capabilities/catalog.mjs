// MP-CAP-01a (MP-PRODUCT-100 section D.2, #263): the provider-neutral catalog of capabilities, as pure data and checks.
// A capability is one thing a provider really offers (a field, a market price, a statistic, an identity attribute),
// described once so that search, analysis, strategies and the interface are built from the catalog instead of a fixed
// list of markets. This module has no route, no database access and no consumer yet: the read-only endpoint is
// MP-CAP-01b (a public API contract, MANUAL).
//
// No new PIT semantics: the timing vocabulary is exactly TIMING_CLASSES of MP-PIT-TIMING-01 (schema.mjs) and the only
// rule is the one fieldTiming already applies (identity and market are known before kickoff, everything else is not).
// Per-phase availability (historical, pre-match, live) and a live class are part of the MANUAL MP-CAP-01b contract.
import { TIMING_CLASSES, fieldFamily, fieldTiming } from '../providers/futpython/schema.mjs';

export const CAPABILITY_VERSION = 'mp-cap-1';

// The six statuses of the MP-PRODUCT-100 provider inventory. NOT VERIFIED is the default: nothing is declared
// available from documentation alone.
export const STATUSES = Object.freeze(['AVAILABLE AND IMPLEMENTED', 'AVAILABLE BUT NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED',
  'PLAN RESTRICTED', 'PROVIDER NOT SUPPORTED', 'NOT VERIFIED']);
const EVIDENCED = new Set(['AVAILABLE AND IMPLEMENTED', 'AVAILABLE BUT NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED']);

export const TIMINGS = TIMING_CLASSES;

// The kind follows the family rule of MP-PIT-TIMING-01: identity and market are the pre-match kinds, statistic is not.
export const KINDS = Object.freeze(['identity', 'market', 'statistic']);
const TIMING_OF_KIND = Object.freeze({identity: 'PREMATCH_IDENTITY', market: 'PREMATCH_MARKET_UNTIMED', statistic: 'POSTMATCH_OUTCOME'});

// Where a provider offers a capability (MP-CAP-01b): historical archive, before kickoff, in play. A description of the
// offer, not a PIT class: the timing above still decides when a value may be used. Optional; when present, a non-empty
// subset. A market offered only in play is refused: MP-PIT-TIMING-01 has no class for it and it would read as pre-match.
export const PHASES = Object.freeze(['HISTORICAL', 'PREMATCH', 'LIVE']);

const COMPARE = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between'];
const PRESENCE = ['is_null', 'not_null'];
// Operators a value type supports. A capability may offer fewer, never others. An unknown type offers only presence.
export const OPERATORS_BY_TYPE = Object.freeze({
  integer: Object.freeze([...COMPARE, ...PRESENCE]),
  number: Object.freeze([...COMPARE, ...PRESENCE]),
  datetime: Object.freeze([...COMPARE, ...PRESENCE]),
  boolean: Object.freeze(['eq', ...PRESENCE]),
  text: Object.freeze(['eq', 'ne', 'in', 'contains', ...PRESENCE]),
  unknown: Object.freeze([...PRESENCE])
});

const SLUG = /^[a-z][a-z0-9_-]{0,39}$/;
// The provider's own name, kept as it is (spaces, brackets, slashes included): any printable text up to 200 characters,
// no control characters, not blank. The id is unambiguous because provider and kind are slugs before the first two colons.
const isProviderRef = value => typeof value === 'string' && value.trim() !== '' && value.length <= 200 && !/[\p{Cc}\p{Cf}]/u.test(value);

// The stable internal id: provider, kind and the provider's own name, never a translated label.
export function capabilityId(provider, kind, providerRef) {
  return `${provider}:${kind}:${providerRef}`;
}

// Every reason an entry is not a valid capability; an empty list means valid. unit and limits are required keys whose
// value may be null; coverage is a ratio from 0 to 1, or null when unknown (never 0 for unknown).
export function validateCapability(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return ['capability must be an object'];
  const errors = [];
  const at = `capability ${typeof c.id === 'string' && c.id ? c.id : '(no id)'}`;
  if (typeof c.id !== 'string' || !c.id) errors.push(`${at}: id is required`);
  if (!SLUG.test(String(c.provider ?? ''))) errors.push(`${at}: provider must be a lowercase slug`);
  if (!KINDS.includes(c.kind)) errors.push(`${at}: kind must be one of ${KINDS.join(', ')}`);
  if (!isProviderRef(c.provider_ref)) errors.push(`${at}: provider_ref is the provider's own name, printable and not blank`);
  else if (typeof c.id === 'string' && c.id && c.id !== capabilityId(c.provider, c.kind, c.provider_ref)) errors.push(`${at}: id must be provider:kind:provider_ref`);
  if (!Object.hasOwn(OPERATORS_BY_TYPE, c.value_type)) errors.push(`${at}: value_type must be one of ${Object.keys(OPERATORS_BY_TYPE).join(', ')}`);
  else {
    const allowed = new Set(OPERATORS_BY_TYPE[c.value_type]);
    if (!Array.isArray(c.operators) || !c.operators.length) errors.push(`${at}: operators must be a non-empty list`);
    else for (const op of c.operators) if (!allowed.has(op)) errors.push(`${at}: operator ${op} is not valid for ${c.value_type}`);
  }
  if (c.unit !== null && (typeof c.unit !== 'string' || !c.unit.trim())) errors.push(`${at}: unit is a text or null`);
  if (!TIMINGS.includes(c.timing)) errors.push(`${at}: timing must be one of ${TIMINGS.join(', ')}`);
  // The MP-PIT-TIMING-01 rule, for every provider: a statistic is never pre-match; identity and market keep their class.
  else if (KINDS.includes(c.kind) && c.timing !== TIMING_OF_KIND[c.kind]) errors.push(`${at}: a ${c.kind} has timing ${TIMING_OF_KIND[c.kind]}, not ${c.timing}`);
  if (c.coverage !== null && !(typeof c.coverage === 'number' && Number.isFinite(c.coverage) && c.coverage >= 0 && c.coverage <= 1)) {
    errors.push(`${at}: coverage is a ratio from 0 to 1, or null when unknown`);
  }
  if (c.phases !== undefined) {
    if (!Array.isArray(c.phases) || !c.phases.length || !c.phases.every(p => PHASES.includes(p)) || new Set(c.phases).size !== c.phases.length) {
      errors.push(`${at}: phases is a non-empty list of ${PHASES.join(', ')}`);
    } else if (c.kind === 'market' && c.phases.includes('LIVE')) errors.push(`${at}: an in-play market has no MP-PIT-TIMING-01 class`);
  }
  if (!STATUSES.includes(c.status)) errors.push(`${at}: status must be one of the inventory statuses`);
  const p = c.provenance;
  if (!p || typeof p.source !== 'string' || !p.source.trim()) errors.push(`${at}: provenance.source is required`);
  // A status that says the provider offers it needs evidence, not documentation.
  else if (EVIDENCED.has(c.status) && !(Array.isArray(p.evidence) && p.evidence.length)) errors.push(`${at}: status ${c.status} needs provenance.evidence`);
  if (c.limits !== null && !(Array.isArray(c.limits) && c.limits.every(item => typeof item === 'string' && item.trim()))) {
    errors.push(`${at}: limits is a list of texts or null`);
  }
  return errors;
}

// The catalog: every entry validated, ids unique, ordered by id so that the same inputs always give the same catalog.
// Malformed input is reported, never thrown.
export function buildCatalog(entries) {
  if (!Array.isArray(entries)) return {version: CAPABILITY_VERSION, capabilities: [], errors: ['entries must be a list']};
  const errors = [];
  const seen = new Set();
  for (const entry of entries) {
    errors.push(...validateCapability(entry));
    const id = entry && typeof entry === 'object' && typeof entry.id === 'string' && entry.id ? entry.id : null;
    if (id === null) continue;
    if (seen.has(id)) errors.push(`capability ${id}: duplicate id`);
    seen.add(id);
  }
  const key = entry => (entry && typeof entry.id === 'string' ? entry.id : '');
  const capabilities = [...entries].sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0));
  return {version: CAPABILITY_VERSION, capabilities, errors};
}

const FPT_TYPES = {integer: 'integer', number: 'number', boolean: 'boolean', date_or_datetime: 'datetime', text: 'text', unknown: 'unknown'};

// A ratio from the database (pg numeric arrives as text): a finite number, or null. An empty or non-numeric value is
// unknown, never 0.
function ratioOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// One FutPythonTrader column of the schema registry (fpt_schema_fields: field_name, inferred_type, nonempty_seen,
// filterable; coverage_ratio only when joined from fpt_field_coverage) as a capability. Seen means at least one non-empty
// value was stored. The family and the timing are recomputed with the current rule (MP-PIT-TIMING-01), so a registry
// written by the old rule cannot make a post-match statistic look pre-match. FutPythonTrader is retired as an
// operational provider (MP-OWNER-GO-2026-11-01): its data are the frozen historical archive, as the limits say.
export function fptFieldCapability(row, {evidence = []} = {}) {
  const name = String(row?.field_name ?? '');
  const family = fieldFamily(name);
  const timing = fieldTiming(family);
  const kind = family === 'identity' ? 'identity' : family === 'market' ? 'market' : 'statistic';
  const valueType = FPT_TYPES[row?.inferred_type] ?? 'unknown';
  const seen = Number(row?.nonempty_seen ?? 0) > 0;
  const status = !seen ? 'NOT VERIFIED' : row?.filterable === true ? 'AVAILABLE AND IMPLEMENTED' : 'AVAILABLE BUT NOT IMPLEMENTED';
  return {
    id: capabilityId('fpt', kind, name),
    provider: 'fpt',
    provider_ref: name,
    kind,
    family,
    value_type: valueType,
    unit: null,
    operators: [...OPERATORS_BY_TYPE[valueType]],
    timing,
    coverage: ratioOrNull(row?.coverage_ratio),
    status,
    phases: ['HISTORICAL'],
    provenance: {source: 'fpt_schema_fields', evidence: seen ? [...evidence, `nonempty_seen=${Number(row.nonempty_seen)}`] : [...evidence]},
    limits: ['FutPythonTrader retired as operational provider: historical archive only']
  };
}
