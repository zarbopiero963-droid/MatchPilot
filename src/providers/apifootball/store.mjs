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
    // Returns the request_id. The error text is cut to the column limit: a long provider error list must never make
    // the insert fail (the client would then stop every call as LEDGER_UNAVAILABLE).
    async insert(row) {
      const result = await guarded(() => db.query(
        `INSERT INTO af_request_ledger (requested_at, endpoint, family, path, params_hash, purpose, attempt, outcome, http_status, latency_ms, quota, error)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING request_id`,
        [new Date(row.at_ms).toISOString(), row.endpoint, row.family, row.path, row.params_hash, row.purpose, row.attempt, row.outcome,
          row.status ?? null, row.latency_ms ?? null, row.quota ? JSON.stringify(row.quota) : null,
          row.error == null ? null : String(row.error).slice(0, 200)]));
      return Number(result.rows[0].request_id);
    },
    async countSince(sinceMs) {
      const result = await guarded(() => db.query(
        'SELECT count(*)::int AS n FROM af_request_ledger WHERE requested_at >= $1 AND outcome = ANY($2::text[])',
        [new Date(sinceMs).toISOString(), [...COUNTED]]));
      return result.rows[0].n;
    }
  };
}

const COLUMNS = [['fixture_id', 'bigint'], ['kickoff_at', 'timestamptz'], ['acquired_at', 'timestamptz'], ['provider_update_at', 'timestamptz'],
  ['phase', 'text'], ['bookmaker_id', 'integer'], ['bookmaker_name', 'text'], ['bet_id', 'integer'], ['bet_name', 'text'], ['value_text', 'text'],
  ['handicap_text', 'text'], ['odd', 'numeric'], ['odd_text', 'text'], ['market_ref_status', 'text'], ['market_key', 'text'],
  ['market_ref_version', 'text'], ['request_id', 'bigint'], ['payload_sha256', 'text']];
const NAMES = COLUMNS.map(([name]) => name).join(',');

// A row is written unless the previous snapshot of the same selection (the latest acquired before it) has the same
// price and the same provider update: an unchanged price adds nothing, a changed one (also back to an earlier value)
// is a new snapshot. Replaying the same acquisition writes nothing (unique per selection and acquisition).
function insertSql(count) {
  const tuples = Array.from({length: count}, (_, r) => `(${COLUMNS.map(([, type], c) => `$${r * COLUMNS.length + c + 1}::${type}`).join(',')})`);
  return `WITH v (${NAMES}) AS (VALUES ${tuples.join(',')})
    INSERT INTO af_odds_snapshots (${NAMES})
    SELECT ${NAMES} FROM v
    WHERE NOT EXISTS (
      SELECT 1 FROM (
        SELECT s.odd, s.provider_update_at FROM af_odds_snapshots s
        WHERE s.fixture_id = v.fixture_id AND s.bookmaker_id = v.bookmaker_id AND s.bet_id = v.bet_id
          AND s.value_text = v.value_text AND s.handicap_text = v.handicap_text AND s.acquired_at < v.acquired_at
        ORDER BY s.acquired_at DESC, s.snapshot_id DESC LIMIT 1
      ) prev
      WHERE prev.odd = v.odd AND prev.provider_update_at IS NOT DISTINCT FROM v.provider_update_at)
    ON CONFLICT ON CONSTRAINT af_odds_snapshots_acquisition DO NOTHING
    RETURNING snapshot_id`;
}

// Saves rows from oddsSnapshotRows in one transaction on a dedicated client (not a pool), holding a per-fixture lock so
// that concurrent writers compare against each other's rows. Rows are written acquisition by acquisition, oldest first,
// so each one is compared with the snapshot really before it. Returns {inserted, skipped}.
export async function saveOddsSnapshots(client, rows) {
  // A pool would run BEGIN and the inserts on different connections: only one dedicated connection is accepted.
  if (!client || typeof client.query !== 'function' || 'totalCount' in client || typeof client.release !== 'function' && typeof client.end !== 'function') {
    throw new TypeError('saveOddsSnapshots needs a dedicated client, not a pool');
  }
  if (!Array.isArray(rows) || !rows.length) return {inserted: 0, skipped: 0};
  return guarded(async () => {
    await client.query('BEGIN');
    try {
      const fixtures = [...new Set(rows.map(row => String(row.fixture_id)))].sort();
      for (const id of fixtures) await client.query("SELECT pg_advisory_xact_lock(hashtext('af_odds_snapshots'), hashtext($1))", [id]);
      const byAcquisition = new Map();
      for (const row of rows) {
        const at = Date.parse(row.acquired_at);
        if (!byAcquisition.has(at)) byAcquisition.set(at, []);
        byAcquisition.get(at).push(row);
      }
      let inserted = 0;
      for (const at of [...byAcquisition.keys()].sort((a, b) => a - b)) {
        const group = byAcquisition.get(at);
        for (let i = 0; i < group.length; i += 500) {
          const chunk = group.slice(i, i + 500);
          const values = chunk.flatMap(row => COLUMNS.map(([name]) => (name === 'odd' ? row.odd_text : row[name] ?? (name === 'handicap_text' ? '' : null))));
          inserted += (await client.query(insertSql(chunk.length), values)).rowCount;
        }
      }
      await client.query('COMMIT');
      return {inserted, skipped: rows.length - inserted};
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  });
}

// Point in time: for one fixture, the last snapshot of every selection acquired at or before `asOf` (and whose provider
// update is not after `asOf`). Every stored row was acquired before kickoff, so an `asOf` after kickoff gives the last
// pre-kickoff price MatchPilot saw, never a later one; acquired_at says how old it is. Prices are the stored decimal text.
export async function oddsAsOf(db, {fixtureId, asOf}) {
  const at = asOf instanceof Date ? asOf.getTime() : typeof asOf === 'string' ? Date.parse(asOf) : Number.NaN;
  if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0 || !Number.isFinite(at)) throw new TypeError('fixtureId and asOf are required');
  const result = await guarded(() => db.query(
    `SELECT DISTINCT ON (bookmaker_id, bet_id, value_text, handicap_text)
        fixture_id, bookmaker_id, bookmaker_name, bet_id, bet_name, value_text, handicap_text, odd_text, market_key,
        market_ref_status, acquired_at, provider_update_at, kickoff_at, snapshot_id
      FROM af_odds_snapshots
      WHERE fixture_id = $1 AND acquired_at <= $2 AND (provider_update_at IS NULL OR provider_update_at <= $2)
      ORDER BY bookmaker_id, bet_id, value_text, handicap_text, acquired_at DESC, snapshot_id DESC`,
    [fixtureId, new Date(at).toISOString()]));
  return result.rows;
}
