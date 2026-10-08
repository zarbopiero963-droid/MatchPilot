import { createHash } from 'node:crypto';

export const LIVE_VERSION = 'tc-core-04-v1';

export function rowsOf(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.data?.matches)) return body.data.matches;
  return [];
}

export function isInplay(row) {
  const status = String(row?.status ?? '').toLowerCase();
  return status !== '' && status !== 'full' && status !== 'ended' && status !== 'upcoming' && status !== 'notstarted' && status !== 'ns';
}

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

function stable(value) {
  return JSON.stringify(value, Object.keys(value || {}).sort());
}

export function snapshotHash(row) {
  return createHash('sha256').update(stable({
    status: row?.status ?? null,
    minute: row?.minute ?? row?.time ?? null,
    score: row?.score ?? row?.ss ?? null,
    ht: row?.ht_score ?? row?.ht ?? null,
    corners: row?.corners ?? row?.corner ?? null,
    cards: row?.cards ?? null,
    attacks: row?.attacks ?? row?.att ?? null,
    dangerous: row?.dangerous_attacks ?? row?.dang_attacks ?? null,
    shots: row?.shot_on ?? row?.shotOn ?? null,
    possession: row?.possession ?? null
  })).digest('hex');
}

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
