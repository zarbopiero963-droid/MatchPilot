// MP-CAP-01a (MP-PRODUCT-100 section D.2, #263): the provider-neutral catalog of capabilities, as pure data and checks.
// A capability is one thing a provider really offers (a field, a market price, a statistic, an identity attribute),
// described once so that search, analysis, strategies and the interface are built from the catalog instead of a fixed
// list of markets. This module has no route, no database access and no consumer yet: the read-only endpoint is
// MP-CAP-01b (a public API contract, MANUAL). Nothing here changes the PIT rules: timing comes from the provider
// adapters (for FutPythonTrader, fieldFamily/fieldTiming of MP-PIT-TIMING-01) and the checks only refuse an entry that
// would claim more than its timing allows.
import { fieldFamily, fieldTiming } from '../providers/futpython/schema.mjs';

export const CAPABILITY_VERSION = 'mp-cap-1';

// The six statuses of the MP-PRODUCT-100 provider inventory. NOT VERIFIED is the default: nothing is declared
// available from documentation alone.
export const STATUSES = Object.freeze(['AVAILABLE AND IMPLEMENTED', 'AVAILABLE BUT NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED',
  'PLAN RESTRICTED', 'PROVIDER NOT SUPPORTED', 'NOT VERIFIED']);
const EVIDENCED = new Set(['AVAILABLE AND IMPLEMENTED', 'AVAILABLE BUT NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED']);

// When a value is known. PREMATCH_* is known before kickoff (market prices without a capture time stay UNTIMED);
// POSTMATCH_OUTCOME describes the match; LIVE is known during it; UNCLASSIFIED is never treated as pre-match.
export const TIMINGS = Object.freeze(['PREMATCH_IDENTITY', 'PREMATCH_MARKET_UNTIMED', 'POSTMATCH_OUTCOME', 'LIVE', 'UNCLASSIFIED']);
const PREMATCH = new Set(['PREMATCH_IDENTITY', 'PREMATCH_MARKET_UNTIMED']);

export const KINDS = Object.freeze(['identity', 'market', 'statistic']);

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
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:+-]{0,199}$/;

// The stable internal id: provider, kind and the provider's own name, never a translated label.
export function capabilityId(provider, kind, providerRef) {
  return `${provider}:${kind}:${providerRef}`;
}

const isBoolOrNull = value => value === true || value === false || value === null;

// Every reason an entry is not a valid capability; an empty list means valid.
export function validateCapability(c) {
  const errors = [];
  const at = `capability ${c?.id ?? '(no id)'}`;
  if (!c || typeof c !== 'object') return ['capability must be an object'];
  if (!SLUG.test(String(c.provider ?? ''))) errors.push(`${at}: provider must be a lowercase slug`);
  if (!KINDS.includes(c.kind)) errors.push(`${at}: kind must be one of ${KINDS.join(', ')}`);
  if (!REF.test(String(c.provider_ref ?? ''))) errors.push(`${at}: provider_ref is the provider's own name (letters, digits, _.:+-)`);
  else if (c.id !== capabilityId(c.provider, c.kind, c.provider_ref)) errors.push(`${at}: id must be provider:kind:provider_ref`);
  if (!Object.hasOwn(OPERATORS_BY_TYPE, c.value_type)) errors.push(`${at}: value_type must be one of ${Object.keys(OPERATORS_BY_TYPE).join(', ')}`);
  else {
    const allowed = new Set(OPERATORS_BY_TYPE[c.value_type]);
    if (!Array.isArray(c.operators) || !c.operators.length) errors.push(`${at}: operators must be a non-empty list`);
    else for (const op of c.operators) if (!allowed.has(op)) errors.push(`${at}: operator ${op} is not valid for ${c.value_type}`);
  }
  if (c.unit !== null && (typeof c.unit !== 'string' || !c.unit.trim())) errors.push(`${at}: unit is a text or null`);
  if (!TIMINGS.includes(c.timing)) errors.push(`${at}: timing must be one of ${TIMINGS.join(', ')}`);
  const a = c.availability;
  if (!a || !isBoolOrNull(a.historical) || !isBoolOrNull(a.prematch) || !isBoolOrNull(a.live)) {
    errors.push(`${at}: availability needs historical, prematch and live as true, false or null (not verified)`);
  } else {
    // Integrity in time: a value known only after or during the match is never offered for a pre-match decision.
    if (a.prematch === true && !PREMATCH.has(c.timing)) errors.push(`${at}: timing ${c.timing} cannot be available before the match`);
    if (a.live === true && c.timing === 'UNCLASSIFIED') errors.push(`${at}: an unclassified value cannot be offered live`);
  }
  if (c.coverage !== null && !(typeof c.coverage === 'number' && c.coverage >= 0 && c.coverage <= 1)) errors.push(`${at}: coverage is a ratio from 0 to 1, or null when unknown`);
  if (!STATUSES.includes(c.status)) errors.push(`${at}: status must be one of the inventory statuses`);
  const p = c.provenance;
  if (!p || typeof p.source !== 'string' || !p.source.trim()) errors.push(`${at}: provenance.source is required`);
  // A status that says the provider offers it needs evidence, not documentation.
  else if (EVIDENCED.has(c.status) && !(Array.isArray(p.evidence) && p.evidence.length)) errors.push(`${at}: status ${c.status} needs provenance.evidence`);
  if (c.limits !== null && !Array.isArray(c.limits)) errors.push(`${at}: limits is a list of texts or null`);
  return errors;
}

// The catalog: every entry validated, ids unique, ordered by id so that the same inputs always give the same catalog.
export function buildCatalog(entries) {
  const errors = [];
  const seen = new Set();
  for (const entry of entries) {
    errors.push(...validateCapability(entry));
    if (seen.has(entry?.id)) errors.push(`capability ${entry.id}: duplicate id`);
    seen.add(entry?.id);
  }
  const capabilities = [...entries].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return {version: CAPABILITY_VERSION, capabilities, errors};
}

const FPT_TYPES = {integer: 'integer', number: 'number', boolean: 'boolean', date_or_datetime: 'datetime', text: 'text', unknown: 'unknown'};

// One FutPythonTrader column of the schema registry (fpt_schema_fields: field_name, inferred_type, nonempty_seen,
// filterable; coverage_ratio only when joined from fpt_field_coverage) as a capability. Seen means at least one non-empty
// value was stored. The family and the timing are recomputed with the current rule (MP-PIT-TIMING-01), so a
// registry written by the old rule cannot make a post-match statistic look pre-match. FutPythonTrader is retired as an
// operational provider (MP-OWNER-GO-2026-11-01): its data are the frozen historical archive, never upcoming or live.
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
    availability: {historical: seen, prematch: false, live: false},
    coverage: row?.coverage_ratio == null ? null : Number(row.coverage_ratio),
    status,
    provenance: {source: 'fpt_schema_fields', evidence: seen ? [...evidence, `nonempty_seen=${Number(row.nonempty_seen)}`] : [...evidence]},
    limits: ['FutPythonTrader retired as operational provider: historical archive only']
  };
}
