export const EMPTY_TOKENS = ['', 'null', 'undefined', 'nan', 'na', 'n/a', '-'];
const EMPTY = new Set(EMPTY_TOKENS);

export function inferValueType(value) {
  const s = String(value ?? '').trim();
  if (EMPTY.has(s.toLowerCase())) return 'empty';
  if (/^(true|false)$/i.test(s)) return 'boolean';
  if (/^-?\d+$/.test(s)) return 'integer';
  if (/^-?(?:\d+\.\d+|\d+,\d+)$/.test(s)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(s) || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(s)) return 'date_or_datetime';
  return 'text';
}

export function mergeTypes(types) {
  const set = new Set(types.filter(t => t !== 'empty'));
  if (!set.size) return 'unknown';
  if (set.size === 1) return [...set][0];
  if ([...set].every(t => t === 'integer' || t === 'number')) return 'number';
  return 'text';
}

// MP-PIT-TIMING-01 (MP-PRODUCT-100, audit BE-08): identity is an explicit list of exact names, the fields known before
// kickoff. It matches the 11 identity fields of the certificate (2026-10-05) and the names the code reads. A name that
// only contains «home», «away», «id», «time»… (Dribbles_Home_FT, Aerials_Won_Away_FT, Blocks_Home_FT) is not identity:
// if no other family claims it, it stays unclassified, whose timing is post-match. Unknown is never pre-match.
export const IDENTITY_FIELDS = Object.freeze(['date', 'time', 'home', 'away', 'league', 'season', 'country', 'div', 'round', 'match_id', 'id']);
const IDENTITY = new Set(IDENTITY_FIELDS);

export function fieldFamily(name) {
  const n = String(name).toLowerCase();
  if (IDENTITY.has(n)) return 'identity';
  if (/^(ah|eh)_/.test(n)) return 'market';
  if (/throw_in/.test(n)) return 'set_pieces';
  if (/odd|bookie|asian|over_|under_|btts|dc_|cs_/.test(n)) return 'market';
  if (/xg|xgot|xa|big_chance/.test(n)) return 'expected_goals';
  if (/shot|woodwork/.test(n)) return 'shooting';
  if (/corner/.test(n)) return 'corners';
  if (/possession|pass|cross|touches_box|through/.test(n)) return 'possession_creation';
  if (/tackle|duel|clearance|interception|save|error|prevented/.test(n)) return 'defense';
  if (/foul|yellow|red|offside|free_kick/.test(n)) return 'discipline';
  if (/min_goal|goal|score/.test(n)) return 'goals';
  if (/_ht$|_2t$|half/.test(n)) return 'period_split';
  return 'unclassified';
}

export const TIMING_CLASSES = ['PREMATCH_IDENTITY', 'PREMATCH_MARKET_UNTIMED', 'POSTMATCH_OUTCOME'];

// Identity is known before kickoff. Market prices are pre-kickoff, but FutPythonTrader does not
// publish their capture time. Every other family, unclassified included, describes the match or is unknown: post-match.
export function fieldTiming(family) {
  if (family === 'identity') return 'PREMATCH_IDENTITY';
  if (family === 'market') return 'PREMATCH_MARKET_UNTIMED';
  return 'POSTMATCH_OUTCOME';
}

// A decimal price is at least 1.01, so a market 0 is a provider placeholder, not a value.
export function marketValueOrNull(family, value) {
  const s = String(value ?? '').trim();
  if (EMPTY.has(s.toLowerCase())) return null;
  const n = Number(s.replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  if (family === 'market' && n <= 0) return null;
  return n;
}

export function profileSchema(headers, rows) {
  return headers.map(field => {
    const values = rows.map(r => r[field]);
    const nonempty = values.filter(v => {
      const s = String(v ?? '').trim().toLowerCase();
      return !EMPTY.has(s);
    });
    const sampleValues = [...new Set(nonempty.slice(0, 200))].slice(0, 5);
    return {
      field,
      inferredType: mergeTypes(values.slice(0, 500).map(inferValueType)),
      family: fieldFamily(field),
      rowsSeen: rows.length,
      nonemptySeen: nonempty.length,
      sampleValues
    };
  });
}

export const LINEAGE_VERSIONS = {
  sourceProvider: 'futpythontrader',
  parserVersion: 'fpt-csv-1',
  schemaVersion: 'fpt-schema-4',
  transformVersion: 'fpt-norm-1'
};

const COLUMN_TRANSFORMS = {
  Home: {normalized: 'home', transform: 'copy'},
  home: {normalized: 'home', transform: 'copy'},
  Away: {normalized: 'away', transform: 'copy'},
  away: {normalized: 'away', transform: 'copy'},
  Date: {normalized: 'match_date', transform: 'dmy_or_iso_date'},
  date: {normalized: 'match_date', transform: 'dmy_or_iso_date'},
  Time: {normalized: 'match_time', transform: 'copy'},
  time: {normalized: 'match_time', transform: 'copy'},
  Match_ID: {normalized: 'provider_match_id', transform: 'copy'},
  Id: {normalized: 'provider_match_id', transform: 'copy'},
  ID: {normalized: 'provider_match_id', transform: 'copy'},
  id: {normalized: 'provider_match_id', transform: 'copy'},
  Match_Id: {normalized: 'provider_match_id', transform: 'copy'},
  match_id: {normalized: 'provider_match_id', transform: 'copy'}
};

export function normalizedFieldName(field) {
  const mapped = COLUMN_TRANSFORMS[field];
  if (mapped) return mapped.normalized;
  return String(field || '').trim().toLowerCase();
}

export function transformFor(field) {
  return COLUMN_TRANSFORMS[field]?.transform || 'payload_text';
}

export function aliasCandidateNames(field) {
  const rules = [
    [/^AH_H_/, 'AH_Home_'],
    [/^AH_Home_/, 'AH_H_'],
    [/^AH_A_/, 'AH_Away_'],
    [/^AH_Away_/, 'AH_A_']
  ];
  return rules.filter(([pattern]) => pattern.test(field)).map(([pattern, replacement]) => field.replace(pattern, replacement));
}

export function isFilterable(field, inferredType) {
  if (['integer', 'number', 'boolean', 'date_or_datetime'].includes(inferredType)) return true;
  return ['Home', 'Away', 'Date', 'Time', 'Season', 'League', 'Country', 'Round', 'Match_ID', 'Id'].includes(field);
}

export function typesCollide(previous, next) {
  if (!previous || !next || previous === 'unknown' || next === 'unknown' || previous === next) return false;
  const numeric = new Set(['integer', 'number']);
  return !(numeric.has(previous) && numeric.has(next));
}

export function registryGate({rawFields = [], registryFields = [], suppressedAliases = []} = {}) {
  const suppressed = new Set(suppressedAliases);
  const raw = new Set(rawFields);
  const registry = new Set(registryFields);
  const missing = [...raw].filter(field => !registry.has(field));
  const extra = [...registry].filter(field => !raw.has(field) && !suppressed.has(field));
  const registryCounted = [...registry].filter(field => !suppressed.has(field)).length;
  return {
    raw_unique_fields: raw.size,
    registry_unique_fields: registryCounted,
    registry_rows: registry.size,
    missing,
    extra,
    suppressed_aliases: [...suppressed],
    gate: missing.length === 0 && extra.length === 0 && raw.size === registryCounted
  };
}
