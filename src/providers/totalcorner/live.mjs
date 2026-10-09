import { createHash } from 'node:crypto';

export const LIVE_VERSION = 'tc-core-04-v2';

/** Return match rows from either documented TotalCorner response envelope. */
export function rowsOf(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.matches)) return body.data.matches;
  return [];
}

/** True only for a row whose provider status denotes an active match. */
export function isInplay(row) {
  const status = String(row?.status ?? '').toLowerCase();
  return status !== '' && status !== 'full' && status !== 'ended' && status !== 'upcoming' && status !== 'notstarted' && status !== 'ns';
}

/** Select unique in-play matches belonging to VERIFIED provider leagues. */
export function verifiedInplay(rows, leagueIds) {
  const allowed = leagueIds instanceof Set ? leagueIds : new Set(leagueIds);
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    const id = row?.id == null ? '' : String(row.id);
    const league = row?.l_id == null ? '' : String(row.l_id);
    if (!id || seen.has(id) || !allowed.has(league) || !isInplay(row)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/** Serialize JSON recursively with stable object keys and preserved array order. */
function stable(value) {
  // A JSON replacer key whitelist also filters nested objects, losing values.
  // Sort objects recursively; retain array order and every upstream JSON field.
  function canonical(item) {
    if (Array.isArray(item)) return item.map(canonical);
    if (item !== null && typeof item === 'object') {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, canonical(item[key])]));
    }
    return item;
  }
  return JSON.stringify(canonical(value));
}

/** Hash every upstream snapshot field without discarding unknown keys. */
export function snapshotHash(row) {
  return createHash('sha256').update(stable(row ?? {})).digest('hex');
}

/** Normalize event identity while retaining its original payload. */
export function eventsOf(row) {
  const events = Array.isArray(row?.events) ? row.events : [];
  return events.map(event => {
    const payload = event && typeof event === 'object' ? event : {value: event};
    return {
      event_type: String(payload.type ?? payload.event ?? payload.kind ?? 'event'),
      minute: payload.minute ?? payload.time ?? null,
      event_hash: createHash('sha256').update(stable(payload)).digest('hex'),
      payload
    };
  });
}
