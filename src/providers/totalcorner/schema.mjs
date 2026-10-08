// Field census of TotalCorner raw bodies (#20, TC-CORE-01). Every path seen in a body is counted, nothing is dropped:
// objects -> a.b, arrays of objects -> a[].b, arrays of arrays (movement rows) -> a[][i], short scalar arrays
// (home/away pairs, line triples) -> a[i], long scalar arrays -> a[].

const SCALAR_INDEX_LIMIT = 12;

// Match phase from the upstream status: null/'' before kickoff, 'full' after, minute or 'half' in play.
export function phaseOf(row) {
  const s = row?.status;
  if (s === null || s === undefined || s === '') return 'PREMATCH';
  if (s === 'full') return 'ENDED';
  if (s === 'half' || /^\d+$/.test(String(s))) return 'LIVE';
  return 'UNKNOWN';
}

export function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

export function isNonEmpty(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;
}

function note(out, path, v) {
  let e = out.get(path);
  if (!e) out.set(path, e = {types: new Set(), nonnull: false, sample: undefined});
  e.types.add(jsonType(v));
  if (isNonEmpty(v)) {
    e.nonnull = true;
    if (e.sample === undefined && (typeof v !== 'object' || v === null)) e.sample = String(v).slice(0, 120);
  }
}

// Paths of one row; a path is counted once per row even if it repeats inside arrays.
export function walkRow(value, prefix = '', out = new Map()) {
  if (prefix) note(out, prefix, value);
  if (Array.isArray(value)) {
    const scalars = value.every(x => x === null || typeof x !== 'object');
    if (scalars && value.length <= SCALAR_INDEX_LIMIT) value.forEach((x, i) => note(out, `${prefix}[${i}]`, x));
    else if (scalars) value.forEach(x => note(out, `${prefix}[]`, x));
    else for (const x of value) {
      if (Array.isArray(x)) {
        note(out, `${prefix}[]`, x);
        x.forEach((y, i) => (y !== null && typeof y === 'object') ? walkRow(y, `${prefix}[][${i}]`, out) : note(out, `${prefix}[][${i}]`, y));
      } else if (x !== null && typeof x === 'object') walkRow(x, `${prefix}[]`, out);
      else note(out, `${prefix}[]`, x);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkRow(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

// Rows of a body: every element of `data` (list endpoints) or `data` itself; plus the envelope as row "$".
export function bodyRows(body) {
  const rows = [];
  if (body && typeof body === 'object') {
    const {data, ...envelope} = body;
    rows.push({phase: 'ENVELOPE', prefix: '$', value: envelope});
    const items = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
    for (const item of items) rows.push({phase: phaseOf(item), prefix: '', value: item, id: item?.id ?? null, league: item?.l_id ?? null});
  }
  return rows;
}

// Accumulator keyed by family|phase|path, flushed into tc_schema_registry with increments.
export function createCensus() {
  const acc = new Map();
  return {
    add(family, body, observedAt = new Date()) {
      for (const row of bodyRows(body)) {
        const paths = row.prefix === '$' ? walkRow(row.value, '$') : walkRow(row.value);
        for (const [path, e] of paths) {
          const key = `${family}\u0000${row.phase}\u0000${path}`;
          let a = acc.get(key);
          if (!a) acc.set(key, a = {endpoint_family: family, phase: row.phase, field_path: path, types: new Set(), rows: 0, nonnull: 0,
            sample: undefined, first: observedAt, last: observedAt});
          e.types.forEach(t => a.types.add(t));
          a.rows += 1;
          if (e.nonnull) a.nonnull += 1;
          if (a.sample === undefined && e.sample !== undefined) a.sample = e.sample;
          if (observedAt < a.first) a.first = observedAt;
          if (observedAt > a.last) a.last = observedAt;
        }
      }
    },
    entries() { return [...acc.values()]; },
    async flush(client) {
      for (const a of acc.values()) {
        await client.query(
          `INSERT INTO tc_schema_registry(endpoint_family,phase,field_path,json_types,rows_seen,nonnull_seen,sample_value,first_seen,last_seen)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (endpoint_family,phase,field_path) DO UPDATE SET
             json_types=(SELECT array_agg(DISTINCT t ORDER BY t) FROM unnest(tc_schema_registry.json_types || EXCLUDED.json_types) t),
             rows_seen=tc_schema_registry.rows_seen+EXCLUDED.rows_seen,
             nonnull_seen=tc_schema_registry.nonnull_seen+EXCLUDED.nonnull_seen,
             sample_value=COALESCE(tc_schema_registry.sample_value,EXCLUDED.sample_value),
             first_seen=LEAST(tc_schema_registry.first_seen,EXCLUDED.first_seen),
             last_seen=GREATEST(tc_schema_registry.last_seen,EXCLUDED.last_seen)`,
          [a.endpoint_family, a.phase, a.field_path, [...a.types].sort(), a.rows, a.nonnull, a.sample ?? null, a.first, a.last]);
      }
      acc.clear();
    }
  };
}
