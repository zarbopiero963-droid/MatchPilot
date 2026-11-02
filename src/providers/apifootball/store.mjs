// MP-ODDS-SNAP-01 (#263): PostgreSQL side of the API-FOOTBALL request ledger, of the raw answers (MP-AF-RAW-01) and of
// the pre-match odds snapshots. The tables come from migrations/031-apifootball-odds-snapshots.sql and
// migrations/033-apifootball-raw-responses.sql, applied in production only with the owner's approval:
// until then every call fails with SNAPSHOTS_UNAVAILABLE and nothing is created on the fly.
// No job, route or schedule uses this module yet.
import { createHash } from 'node:crypto';
import { COUNTED, paramsHash } from './client.mjs';
import { oddsSnapshotRows } from './odds-snapshots.mjs';

export class SnapshotStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'SnapshotStoreError'; this.code = code; }
}
const UNDEFINED_TABLE = '42P01';
const UNDEFINED_COLUMN = '42703'; // af_odds_snapshots without raw_id: migration 033 not applied
async function guarded(run) {
  try { return await run(); }
  catch (error) {
    if (error?.code === UNDEFINED_TABLE || error?.code === UNDEFINED_COLUMN) throw new SnapshotStoreError('SNAPSHOTS_UNAVAILABLE', 'the API-FOOTBALL schema (migrations 031 and 033) is not applied');
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
    async countSince(sinceMs, {purpose} = {}) {
      const result = await guarded(() => db.query(
        'SELECT count(*)::int AS n FROM af_request_ledger WHERE requested_at >= $1 AND outcome = ANY($2::text[]) AND ($3::text IS NULL OR purpose = $3)',
        [new Date(sinceMs).toISOString(), [...COUNTED], purpose ?? null]));
      return result.rows[0].n;
    },
    // The latest counted request for this exact canonical path since sinceMs (bounded window: uses the requested_at index).
    async lastRequestAt(path, sinceMs) {
      const result = await guarded(() => db.query(
        'SELECT max(requested_at) AS at FROM af_request_ledger WHERE requested_at >= $1 AND params_hash = $2 AND path = $3 AND outcome = ANY($4::text[])',
        [new Date(sinceMs).toISOString(), paramsHash(path), path, [...COUNTED]]));
      return result.rows[0].at ? new Date(result.rows[0].at).getTime() : null;
    }
  };
}

const COLUMNS = [['fixture_id', 'bigint'], ['kickoff_at', 'timestamptz'], ['acquired_at', 'timestamptz'], ['provider_update_at', 'timestamptz'],
  ['phase', 'text'], ['bookmaker_id', 'integer'], ['bookmaker_name', 'text'], ['bet_id', 'integer'], ['bet_name', 'text'], ['value_text', 'text'],
  ['handicap_text', 'text'], ['odd', 'numeric'], ['odd_text', 'text'], ['market_ref_status', 'text'], ['market_key', 'text'],
  ['market_ref_version', 'text'], ['request_id', 'bigint'], ['payload_sha256', 'text'], ['raw_id', 'bigint']];
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

// MP-AF-RAW-01 (#263, P1 of PR #283, migration 033): the raw provider answer, stored before any normalization.
// `input` is a client result (its `raw`) or a raw record itself (an ApiFootballError's `raw`, for provider errors).
// One statement, committed on its own before the snapshots: a crash after it leaves a raw answer without snapshots,
// which recoverRawOdds() replays; never a snapshot without its raw answer (foreign key and NOT VALID check).
// Idempotent: the same answer (request_id, body_sha256) returns the raw_id already stored, with inserted false.
// Fails closed: no request_id (a ledger that does not return it), no body bytes, a hash or size that does not match.
export async function saveRawResponse(db, input) {
  const raw = input?.raw ?? input;
  const id = raw?.request_id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new SnapshotStoreError('RAW_INVALID', 'a raw answer needs the request_id of its ledger row (use the PostgreSQL ledger)');
  // A cached client result carries a Uint8Array (structuredClone drops the Buffer prototype): same bytes.
  const body = raw.body instanceof Uint8Array ? Buffer.from(raw.body.buffer, raw.body.byteOffset, raw.body.byteLength) : null;
  if (!body) throw new SnapshotStoreError('RAW_INVALID', 'a raw answer needs its body bytes');
  const sha = createHash('sha256').update(body).digest('hex');
  if (raw.body_sha256 !== sha || raw.body_bytes !== body.length) throw new SnapshotStoreError('RAW_INVALID', 'raw body does not match its declared hash or size');
  const result = await guarded(() => db.query(
    `WITH ins AS (
       INSERT INTO af_raw_responses (provider, request_id, endpoint, family, path, params_hash, request_params, purpose, requested_at, received_at,
         provider_date, content_type, http_status, outcome, body, body_exact, body_bytes, body_sha256, quota)
       VALUES ('api-football',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       ON CONFLICT ON CONSTRAINT af_raw_responses_dedupe DO NOTHING
       RETURNING raw_id)
     SELECT raw_id, true AS inserted FROM ins
     UNION ALL
     SELECT raw_id, false FROM af_raw_responses WHERE request_id = $1 AND body_sha256 = $17 AND NOT EXISTS (SELECT 1 FROM ins)`,
    [id, raw.endpoint, raw.family, raw.path, raw.params_hash, JSON.stringify(raw.params ?? {}), raw.purpose, raw.requested_at, raw.received_at,
      raw.provider_date == null ? null : String(raw.provider_date).slice(0, 100), raw.content_type == null ? null : String(raw.content_type).slice(0, 200),
      raw.http_status, raw.outcome, body, raw.body_exact === true, body.length, sha, raw.quota ? JSON.stringify(raw.quota) : null]));
  const row = result.rows[0];
  if (!row) throw new SnapshotStoreError('RAW_INVALID', 'raw answer neither stored nor found');
  return {raw_id: Number(row.raw_id), inserted: row.inserted};
}

// Recovery after a crash between a raw answer and its snapshots: every successful /odds raw answer received since
// `since` that no snapshot references is parsed again from its stored bytes and saved through saveOddsSnapshots, with
// its original acquisition instant (received_at), request_id and raw_id. Idempotent: an answer whose snapshots exist, or
// whose prices were all unchanged, writes nothing. `client` is a dedicated connection (saveOddsSnapshots needs one).
export async function recoverRawOdds(client, {since, limit = 100} = {}) {
  const at = since instanceof Date ? since.getTime() : Date.parse(since);
  if (!Number.isFinite(at) || !Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new TypeError('since and a limit between 1 and 10000 are required');
  const pending = await guarded(() => client.query(
    `SELECT r.raw_id, r.request_id, r.received_at, r.body FROM af_raw_responses r
      WHERE r.endpoint = '/odds' AND r.outcome = 'ok' AND r.received_at >= $1
        AND NOT EXISTS (SELECT 1 FROM af_odds_snapshots s WHERE s.raw_id = r.raw_id)
      ORDER BY r.received_at, r.raw_id LIMIT $2`, [new Date(at).toISOString(), limit]));
  let inserted = 0;
  let rejected = 0;
  for (const r of pending.rows) {
    const body = JSON.parse(new TextDecoder('utf-8').decode(r.body));
    const out = oddsSnapshotRows({response: body?.response}, {acquiredAt: r.received_at, requestId: Number(r.request_id), rawId: Number(r.raw_id)});
    rejected += out.rejected.length;
    if (out.rows.length) inserted += (await saveOddsSnapshots(client, out.rows)).inserted;
  }
  return {raw_checked: pending.rows.length, inserted, rejected};
}
