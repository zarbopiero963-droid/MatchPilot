const EMPTY = new Set(['', 'null', 'undefined', 'nan', 'na', 'n/a', '-']);

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

export function fieldFamily(name) {
  const n = String(name).toLowerCase();
  if (/odd|bookie|asian|over_|under_|btts|dc_|cs_/.test(n)) return 'market';
  if (/xg|xgot|xa|big_chance/.test(n)) return 'expected_goals';
  if (/shot|woodwork/.test(n)) return 'shooting';
  if (/corner/.test(n)) return 'corners';
  if (/possession|pass|cross|touches_box|through/.test(n)) return 'possession_creation';
  if (/tackle|duel|clearance|interception|save|error|prevented/.test(n)) return 'defense';
  if (/foul|yellow|red|offside|free_kick/.test(n)) return 'discipline';
  if (/min_goal|goal|score/.test(n)) return 'goals';
  if (/_ht$|_2t$|half/.test(n)) return 'period_split';
  if (/home|away|league|season|date|time|round|id/.test(n)) return 'identity';
  return 'unclassified';
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
