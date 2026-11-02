// MP-ODDS-SNAP-01 (#263): PostgreSQL side of the API-FOOTBALL request ledger and of the pre-match odds snapshots. The
// tables are staged (db/staged/031-apifootball-odds-snapshots.sql) and exist only once an owner-authorized migration
// applies them: until then every call fails with SNAPSHOTS_UNAVAILABLE and nothing is created on the fly.
// No job, route or schedule uses this module yet.
import { COUNTED } from './client.mjs';

export class SnapshotStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'SnapshotStoreError'; this.code = code; }
}
const UNDEFINED_TABLE = '42P01';
async function guarded(run) {
  try { return await run(); }
  catch (error) {
    if (error?.code === UNDEFINED_TABLE) throw new SnapshotStoreError('SNAPSHOTS_UNAVAILABLE', 'the staged API-FOOTBALL schema is not applied');
    throw error;
  }
}

// The request ledger with the two methods the client needs (insert, countSince). `db` is a pg client or pool.
export function createPgRequestLedger(db) {
  return {
    async insert(row) {
      await guarded(() => db.query(
        `INSERT INTO af_request_ledger (requested_at, endpoint, family, path, params_hash, purpose, attempt, outcome, http_status, latency_ms, quota, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [new Date(row.at_ms).toISOString(), row.endpoint, row.family, row.path, row.params_hash, row.purpose, row.attempt, row.outcome,
          row.status ?? null, row.latency_ms ?? null, row.quota ? JSON.stringify(row.quota) : null, row.error ?? null]));
    },
    async countSince(sinceMs) {
      const result = await guarded(() => db.query(
        'SELECT count(*)::int AS n FROM af_request_ledger WHERE requested_at >= $1 AND outcome = ANY($2::text[])',
        [new Date(sinceMs).toISOString(), [...COUNTED]]));
      return result.rows[0].n;
    }
  };
}

const COLUMNS = ['fixture_id', 'kickoff_at', 'acquired_at', 'provider_update_at', 'phase', 'bookmaker_id', 'bookmaker_name', 'bet_id', 'bet_name',
  'value_text', 'handicap_text', 'odd', 'odd_text', 'market_ref_status', 'market_key', 'market_ref_version', 'request_id', 'payload_sha256'];

// Saves rows from oddsSnapshotRows in one transaction on a dedicated client (not a pool). Duplicates (same price for the
// same selection at the same provider update) are skipped by the database. Returns {inserted, duplicates}.
export async function saveOddsSnapshots(client, rows) {
  // A pool would run BEGIN and the inserts on different connections: only one dedicated connection is accepted.
  if (!client || typeof client.query !== 'function' || 'totalCount' in client || typeof client.release !== 'function' && typeof client.end !== 'function') {
    throw new TypeError('saveOddsSnapshots needs a dedicated client, not a pool');
  }
  if (!Array.isArray(rows) || !rows.length) return {inserted: 0, duplicates: 0};
  return guarded(async () => {
    await client.query('BEGIN');
    try {
      let inserted = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const values = [];
        const tuples = chunk.map((row, r) => `(${COLUMNS.map((name, c) => {
          values.push(name === 'odd' ? row.odd_text : row[name] ?? (name === 'handicap_text' ? '' : null));
          return `$${r * COLUMNS.length + c + 1}`;
        }).join(',')})`);
        const result = await client.query(
          `INSERT INTO af_odds_snapshots (${COLUMNS.join(',')}) VALUES ${tuples.join(',')}
           ON CONFLICT ON CONSTRAINT af_odds_snapshots_dedup DO NOTHING RETURNING snapshot_id`, values);
        inserted += result.rowCount;
      }
      await client.query('COMMIT');
      return {inserted, duplicates: rows.length - inserted};
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

// Point in time: for one fixture, the last snapshot of every selection acquired at or before `asOf`. Every stored row
// was acquired before kickoff, so an `asOf` after kickoff gives the last pre-kickoff price MatchPilot saw, never a
// later one. Prices are returned as the stored decimal text.
export async function oddsAsOf(db, {fixtureId, asOf}) {
  const at = Date.parse(asOf);
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0 || !Number.isFinite(at)) throw new TypeError('fixtureId and asOf are required');
  const result = await guarded(() => db.query(
    `SELECT DISTINCT ON (bookmaker_id, bet_id, value_text, handicap_text)
        fixture_id, bookmaker_id, bookmaker_name, bet_id, bet_name, value_text, handicap_text, odd_text, market_key,
        market_ref_status, acquired_at, provider_update_at, kickoff_at, snapshot_id
      FROM af_odds_snapshots
      WHERE fixture_id = $1 AND acquired_at <= $2
      ORDER BY bookmaker_id, bet_id, value_text, handicap_text, acquired_at DESC, snapshot_id DESC`,
    [fixtureId, new Date(at).toISOString()]));
  return result.rows;
}
