// MP-SEARCH-01 (#263, MP-NEXT-20261102 priority A): GET /api/v1/search, the universal search over the stored
// FutPythonTrader archive with the AND/OR/NOT conditions of MP-CAP-03 (src/conditions/expression.mjs) on any field of
// the capability catalog (MP-CAP-01b), instead of a fixed list of filters or markets (nothing privileges Over 2.5).
//
// Rules:
// - a field is usable only when the catalog says AVAILABLE AND IMPLEMENTED; any other state (AVAILABLE BUT NOT
//   IMPLEMENTED, NOT AVAILABLE, NOT VERIFIED, or an unknown id) is refused with its state, never searched;
// - a missing value never matches: absent, a registry missing token, a zero where the registry says zero is missing,
//   or an unreadable text are all missing, and the three-valued logic keeps them out (NOT included);
// - decision PREMATCH refuses post-kickoff fields (MP-PIT-TIMING-01) and is never PIT verified on archive prices whose
//   capture time is unknown; decision POSTMATCH is research on finished matches;
// - read only and bounded: a date window of at most 366 days, at most MAX_SCAN matches read, at most 200 returned.
// The existing search (/api/v1/fpt/search) and the strategies are unchanged.
import { buildCatalog } from '../capabilities/catalog.mjs';
import { capabilityCatalog, FPT_CAPABILITY_SQL, FPT_FIELDS_MAX } from './capabilities-api.mjs';
import { ExpressionError, expressionFields, filterRecords, normalizeExpression, pitReport } from '../conditions/expression.mjs';

export const SEARCH_VERSION = 'mp-search-1';
export const MAX_EXPR_LENGTH = 1800; // inside the 2048-character query string of v1
export const MAX_SCAN = 5000;
export const MAX_WINDOW_DAYS = 366;
export const USABLE_STATUS = 'AVAILABLE AND IMPLEMENTED';
export const DECISIONS = Object.freeze(['PREMATCH', 'POSTMATCH']);

export const MISSING_RULES_SQL = `SELECT field_name, missing_tokens, zero_is_missing FROM fpt_filter_registry WHERE field_name = ANY($1::text[])`;
// Only the payload keys the expression uses leave the database. Newest matches first; one row more than the scan limit
// tells that the window was truncated.
export const SEARCH_SQL = `SELECT f.internal_match_id, f.match_date, f.kickoff_utc, f.internal_competition_id, f.season_id,
    f.home_name, f.away_name, f.result_status, f.phase,
    (SELECT coalesce(jsonb_object_agg(k, v.payload -> k), '{}'::jsonb) FROM unnest($1::text[]) AS k WHERE v.payload ? k) AS fields
  FROM fpt_match_facts f
  JOIN fpt_match_versions v ON v.version_id = f.version_id
  WHERE f.match_date >= $2::date AND f.match_date <= $3::date
    AND ($4::text IS NULL OR f.internal_competition_id = $4)
    AND ($5::text IS NULL OR f.season_id = $5)
  ORDER BY f.match_date DESC, f.internal_match_id
  LIMIT $6`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayOf = (value, name, ApiError) => {
  const ms = DAY.test(value) ? Date.parse(`${value}T00:00:00Z`) : Number.NaN;
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) throw new ApiError('BAD_REQUEST', `${name} must be a calendar date YYYY-MM-DD`, undefined, [name]);
  return ms;
};

// The expression text as JSON, before any database access: syntax and size only (the catalog check needs the catalog).
export function parseExpressionParam(text, ApiError) {
  let value;
  try { value = JSON.parse(text); } catch { throw new ApiError('BAD_REQUEST', 'expr must be a JSON expression', undefined, ['expr']); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError('BAD_REQUEST', 'expr must be a JSON object', undefined, ['expr']);
  return value;
}

// A stored text value as the expression reads it, or null when the registry says it is missing. Values stay text: the
// expression engine parses numbers as exact decimals and refuses anything else as unreadable (UNKNOWN).
export function storedValue(raw, rule) {
  if (raw === null || raw === undefined) return null;
  const text = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' || typeof raw === 'boolean' ? raw : null;
  if (text === null || text === '') return null;
  const tokens = Array.isArray(rule?.missing_tokens) ? rule.missing_tokens.map(t => String(t).trim().toLowerCase()) : [];
  if (typeof text === 'string' && tokens.includes(text.toLowerCase())) return null;
  if (rule?.zero_is_missing === true && /^[+-]?0+(\.0+)?$/.test(String(text))) return null;
  return text;
}

// Pure core: catalog rows, missing rules and stored rows in, the search answer out. Throws ApiError on a refusal.
export function universalSearch({catalogRows, missingRules = [], rows = null, input, ApiError, scanLimit = MAX_SCAN}) {
  const catalog = capabilityCatalog(catalogRows, {provider: 'fpt'});
  const caps = buildCatalog(catalog.rows).capabilities;
  const byId = new Map(caps.map(c => [c.id, c]));
  let normalized;
  try { normalized = normalizeExpression(input.expr, caps); }
  catch (error) {
    if (error instanceof ExpressionError) throw new ApiError('BAD_REQUEST', `expr: ${error.message}`, undefined, ['expr']);
    throw error;
  }
  const fields = expressionFields(normalized).map(id => byId.get(id));
  const refused = fields.filter(c => c.status !== USABLE_STATUS);
  if (refused.length) {
    throw new ApiError('BAD_REQUEST', `fields not usable in a search: ${refused.map(c => `${c.id} (${c.status})`).join(', ')}`,
      {fields: refused.map(c => ({id: c.id, status: c.status}))}, ['expr']);
  }
  const pit = pitReport(normalized, caps, {decision: input.decision});
  if (pit.violations.length) {
    throw new ApiError('BAD_REQUEST', `decision PREMATCH cannot use fields known only after kickoff: ${pit.violations.map(v => v.field).join(', ')}`,
      {pit}, ['expr', 'decision']);
  }
  if (rows === null) return {normalized, fields, pit, providerRefs: fields.map(c => c.provider_ref)};
  const rules = new Map(missingRules.map(r => [r.field_name, r]));
  const truncated = rows.length > scanLimit;
  const scanned = rows.slice(0, scanLimit);
  const records = scanned.map(row => {
    const record = {};
    for (const c of fields) {
      const value = storedValue(row.fields?.[c.provider_ref], rules.get(c.provider_ref));
      if (value !== null) record[c.id] = value;
    }
    return {row, record};
  });
  const {selected, counts} = filterRecords(normalized, records.map(r => r.record), caps);
  const chosen = new Set(selected);
  const matches = records.filter(r => chosen.has(r.record)).slice(0, input.limit).map(({row, record}) => ({
    id: row.internal_match_id, date: row.match_date instanceof Date ? row.match_date.toISOString().slice(0, 10) : row.match_date,
    kickoff_utc: row.kickoff_utc instanceof Date ? row.kickoff_utc.toISOString() : row.kickoff_utc ?? null,
    competition: row.internal_competition_id, season: row.season_id, home: row.home_name, away: row.away_name,
    result_status: row.result_status, values: record
  }));
  return {
    version: SEARCH_VERSION,
    expression: normalized,
    decision: input.decision,
    fields: fields.map(c => ({id: c.id, provider_ref: c.provider_ref, kind: c.kind, value_type: c.value_type, timing: c.timing, status: c.status, coverage: c.coverage,
      missing_rule: rules.has(c.provider_ref) ? {tokens: rules.get(c.provider_ref).missing_tokens, zero_is_missing: rules.get(c.provider_ref).zero_is_missing} : null})),
    pit: {...pit, label: pit.pit_verifiable ? 'NO_POSTMATCH_FIELD_AND_TIMED' : input.decision === 'PREMATCH' ? 'NOT_PIT_VERIFIED' : 'RESEARCH_POSTMATCH'},
    window: {from: input.from, to: input.to, competition: input.competition ?? null, season: input.season ?? null},
    scanned: scanned.length,
    truncated,
    counts,
    rows: matches,
    notes: [
      'only TRUE matches are returned; FALSE and UNKNOWN (missing data) are counted, never shown as matches',
      'FutPythonTrader is retired: this is the frozen historical archive',
      truncated ? `window truncated to the ${scanLimit} most recent matches: narrow the dates or the competition` : 'every match of the window was evaluated'
    ]
  };
}

export function searchEndpoint({param, integer, oneOf, ApiError}) {
  return {
    path: '/api/v1/search', source: 'FutPythonTrader',
    summary: 'Ricerca universale: condizioni AND/OR/NOT su qualunque campo del catalogo delle capacità, con stato del campo, PIT e dati mancanti espliciti',
    params: {
      expr: param('espressione JSON {all|any|not|field,op,value} sugli id del catalogo /api/v1/capabilities', true, undefined, MAX_EXPR_LENGTH),
      decision: param('PREMATCH | POSTMATCH (ricerca su partite concluse)', true, oneOf('decision', DECISIONS)),
      from: param('YYYY-MM-DD, obbligatorio', true),
      to: param(`YYYY-MM-DD, obbligatorio, al massimo ${MAX_WINDOW_DAYS} giorni dopo from`, true),
      competition: param('id interno del campionato (fpt:competition:…), opzionale'),
      season: param('id interno della stagione (fpt:season:…), opzionale'),
      limit: param('1–200, default 50', false, integer('limit', 1, 200))
    },
    precheck: input => {
      const from = dayOf(input.from, 'from', ApiError);
      const to = dayOf(input.to, 'to', ApiError);
      if (to < from) throw new ApiError('BAD_REQUEST', 'to must not be before from', undefined, ['from', 'to']);
      if ((to - from) / 86400000 > MAX_WINDOW_DAYS) throw new ApiError('BAD_REQUEST', `the window is longer than ${MAX_WINDOW_DAYS} days`, undefined, ['from', 'to']);
      input.expr = parseExpressionParam(input.expr, ApiError);
      input.limit = input.limit ?? 50;
    },
    // read only fetches; the refusals and the evaluation run in compute, after the connection is released (an ApiError
    // raised while connected would be reported as a database failure).
    read: async (client, input) => {
      const catalogRows = (await client.query(FPT_CAPABILITY_SQL, [FPT_FIELDS_MAX + 1])).rows;
      let plan;
      // Refusals (unknown field, unusable state, PIT) come before any match is read.
      try { plan = universalSearch({catalogRows, input, ApiError}); } catch (error) { if (error instanceof ApiError) return {refused: error}; throw error; }
      const missingRules = (await client.query(MISSING_RULES_SQL, [plan.providerRefs])).rows;
      const rows = (await client.query(SEARCH_SQL, [plan.providerRefs, input.from, input.to, input.competition ?? null, input.season ?? null, MAX_SCAN + 1])).rows;
      return {catalogRows, missingRules, rows};
    },
    compute: (fetched, input) => {
      if (fetched.refused) throw fetched.refused;
      return universalSearch({...fetched, input, ApiError});
    },
    provenance: data => ({source: 'fpt_match_facts + fpt_match_versions payload + fpt_filter_registry', upstream_calls: 0, search_version: SEARCH_VERSION,
      expression_version: data?.expression?.version ?? null, scanned: data?.scanned ?? null, truncated: data?.truncated ?? null}),
    limit: input => input.limit ?? 50
  };
}

