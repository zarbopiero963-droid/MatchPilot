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
