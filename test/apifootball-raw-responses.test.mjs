// MP-AF-RAW-01 (#263, P1 of PR #283, migration 033): the API-FOOTBALL raw answers, kept before normalization, and the
// link from every new odds snapshot to its raw answer. Synthetic answers in the /odds and /fixtures shapes observed on
// 2026-11-01 (invented prices); a fake fetch only: no test reaches the network or spends provider quota.
// The PostgreSQL tests use a throwaway local database (FUTPYTHON_TEST_DATABASE_URL) and skip without one, like the
// other PostgreSQL tests of the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { apiFootballConfig, createApiFootballClient, createMemoryLedger, paramsHash } from '../src/providers/apifootball/client.mjs';
import { createPrematchCollector, prematchCollectorConfig } from '../src/providers/apifootball/prematch-collector.mjs';
import { oddsAsOf, createPgRequestLedger, recoverRawOdds, saveOddsSnapshots, saveRawResponse, SnapshotStoreError } from '../src/providers/apifootball/store.mjs';
import { oddsSnapshotsFromResult } from '../src/providers/apifootball/odds-snapshots.mjs';

const MIGRATION = readFileSync(new URL('../migrations/033-apifootball-raw-responses.sql', import.meta.url), 'utf8');
const ROLLBACK = readFileSync(new URL('../db/rollback/033-apifootball-raw-responses.down.sql', import.meta.url), 'utf8');
const T0 = Date.UTC(2026, 10, 2, 9, 0, 0);
const H = 3600000;
const KEY = 'test-key-not-real-0123456789';
const clientEnv = {APIFOOTBALL_ENABLED: 'true', APIFOOTBALL_KEY: KEY, APIFOOTBALL_REQUESTS_PER_DAY: '100', APIFOOTBALL_REQUESTS_PER_MINUTE: '30'};
const collectorEnv = {APIFOOTBALL_PREMATCH_COLLECTOR_ENABLED: 'true', APIFOOTBALL_PREMATCH_LEAGUES: '135:2026', APIFOOTBALL_PREMATCH_CALLS_PER_DAY: '20',
  APIFOOTBALL_PREMATCH_CALLS_PER_MINUTE: '10', APIFOOTBALL_PREMATCH_MAX_CALLS_PER_RUN: '10', APIFOOTBALL_PREMATCH_LEAD_HOURS: '24', APIFOOTBALL_PREMATCH_MIN_INTERVAL_MINUTES: '60'};
const KO = T0 + 3 * H;
const fixturesText = id => JSON.stringify({get: 'fixtures', parameters: {league: '135', season: '2026'}, errors: [], results: 1, paging: {current: 1, total: 1},
  response: [{fixture: {id, timestamp: KO / 1000, date: new Date(KO).toISOString(), status: {short: 'NS'}}, league: {id: 135}}]});
// Key order, spacing and an unknown field as the provider might send them: the stored bytes must be these, exactly.
const oddsText = (id, home = '2.10') => '{"get":"odds","parameters":{"fixture":"' + id + '"},"errors":[],"results":1,"paging":{"current":1,"total":1},'
  + '"future_field":{"x":1}, "response":[{"fixture":{"id":' + id + ',"timestamp":' + KO / 1000 + '},"update":"2026-11-02T08:50:00+00:00",'
  + '"bookmakers":[{"id":8,"name":"Bet365","bets":[{"id":1,"name":"Match Winner","values":[{"value":"Home","odd":"' + home + '"},'
  + '{"value":"Draw","odd":"3.40"},{"value":"Away","odd":"3.50"}]}]}]}]}';
const PROVIDER_DATE = 'Mon, 02 Nov 2026 09:00:00 GMT';
const response = (text, status = 200) => ({status, headers: new Headers({'content-type': 'application/json', date: PROVIDER_DATE}),
  arrayBuffer: async () => new TextEncoder().encode(text).buffer, text: async () => text, json: async () => JSON.parse(text)});
const sha = buf => createHash('sha256').update(buf).digest('hex');

function harness({ledger = createMemoryLedger(), saveRawResponse, saveSnapshots, openConnection, odds = id => oddsText(id), fixtureId = 1, start = T0} = {}) {
  let clock = start;
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    clock += 50;
    return response(new URL(url).pathname === '/odds' ? odds(fixtureId) : fixturesText(fixtureId));
  };
  const client = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger, fetchImpl, now: () => clock, sleep: async () => {}});
  const raws = [];
  const saved = [];
  const collector = createPrematchCollector({config: prematchCollectorConfig(collectorEnv), client, ledger, now: () => clock,
    saveRawResponse: saveRawResponse ?? (async result => { raws.push(result); return {raw_id: 77}; }),
    openConnection: openConnection ?? (async () => ({release() {}})),
    saveSnapshots: saveSnapshots ?? (async (_c, rows) => { saved.push(...rows); return {inserted: rows.length, skipped: 0}; })});
  return {collector, client, raws, saved, calls, ledger, now: () => clock, advance: ms => { clock += ms; }};
}

test('MP-AF-RAW-01 (RED on 7f0bc4b) the raw store receives the whole provider envelope and snapshots reference it', async () => {
  const h = harness();
  await h.collector.runOnce();
  assert.equal(h.raws.length, 1);
  const raw = h.raws[0].raw;
  assert.ok(raw, 'the client result carries the raw answer');
  assert.equal(Buffer.from(raw.body).toString('utf8'), oddsText(1), 'the exact provider bytes: get, parameters, errors and unknown fields included');
  assert.ok(h.saved.length > 0 && h.saved.every(r => r.raw_id === 77), 'every snapshot references its raw answer');
});

test('MP-AF-RAW-01 client raw record: exact bytes and hash, request, timestamps verbatim, no key; json-only responses are flagged', async () => {
  const h = harness();
  const result = await h.client.get('/odds', {fixture: 1}, {purpose: 'prematch-collector'});
  const raw = result.raw;
  assert.equal(raw.body_sha256, sha(Buffer.from(oddsText(1))));
  assert.deepEqual([raw.body_exact, raw.body_bytes, raw.endpoint, raw.family, raw.path, raw.params_hash, raw.outcome, raw.http_status, raw.provider_date, raw.provider],
    [true, Buffer.byteLength(oddsText(1)), '/odds', 'odds', '/odds?fixture=1', paramsHash('/odds?fixture=1'), 'ok', 200, PROVIDER_DATE, 'api-football']);
  assert.deepEqual(raw.params, {fixture: '1'});
  assert.ok(Date.parse(raw.received_at) > Date.parse(raw.requested_at) && raw.received_at === result.fetched_at, 'received_at is the snapshots acquisition instant');
  assert.equal(result.request_id, null, 'the memory ledger returns no id: the PostgreSQL raw store will refuse it');
  assert.ok(!JSON.stringify({...result, raw: {...raw, body: Buffer.from(raw.body).toString('utf8')}}).includes(KEY), 'the key never reaches the raw record');
  // A test double offering json() only: the parsed body serialized again, and flagged as not exact.
  const client = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger: createMemoryLedger(), sleep: async () => {},
    fetchImpl: async () => ({status: 200, headers: new Headers(), json: async () => JSON.parse(oddsText(2))})});
  const loose = (await client.get('/odds', {fixture: 2}, {purpose: 'x'})).raw;
  assert.equal(loose.body_exact, false);
  assert.deepEqual(JSON.parse(Buffer.from(loose.body).toString('utf8')), JSON.parse(oddsText(2)));
  // A provider `errors` answer: the raw body rides on the error, not enumerable, never in its serialization.
  const errText = '{"get":"odds","parameters":{"fixture":"3"},"errors":{"plan":"not in your plan"},"results":0,"response":[]}';
  const ec = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger: createMemoryLedger(), sleep: async () => {}, fetchImpl: async () => response(errText)});
  const error = await ec.get('/odds', {fixture: 3}, {purpose: 'x'}).catch(e => e);
  assert.equal(error.code, 'PROVIDER_ERROR');
  assert.equal(Buffer.from(error.raw.body).toString('utf8'), errText);
  assert.equal(error.raw.outcome, 'provider_error');
  assert.ok(!JSON.stringify(error).includes('not in your plan') && !Object.keys(error).includes('raw'));
});

test('MP-AF-RAW-01 collector: no raw_id, no snapshot; a provider error answer is stored raw and never normalized', async () => {
  const none = harness({saveRawResponse: async () => ({})});
  const r = await none.collector.runOnce();
  assert.deepEqual([r.stop_reason, none.saved.length], ['RAW_STORE_FAILED', 0]);
  const stored = [];
  const errText = '{"get":"odds","parameters":{"fixture":"1"},"errors":{"plan":"x"},"results":0,"response":[]}';
  const pe = harness({odds: () => errText, saveRawResponse: async raw => { stored.push(raw); return {raw_id: 1}; }});
  const rp = await pe.collector.runOnce();
  assert.equal(rp.fixtures[0].outcome, 'failed_PROVIDER_ERROR');
  assert.equal(stored.length, 1);
  assert.equal(Buffer.from(stored[0].body).toString('utf8'), errText);
  assert.equal(pe.saved.length, 0);
});

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve(output) : reject(new Error(`node ${args.join(' ')} exited ${code}\n${output}`))));
  });
}
const migrateEnv = url => ({PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: url, MATCHPILOT_RUNTIME_MODE: 'test'});

async function withSchema(t, name, body) {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); }
  catch (cause) {
    await root.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `afraw_${name}_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], migrateEnv(dbUrl.toString()));
    const pool = new pg.Pool({connectionString: dbUrl.toString(), max: 4});
    pool.on('error', () => {});
    try { await body({pool, root, pg, url: dbUrl.toString(), schema}); }
    finally { await pool.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
}
const code = async promise => { try { await promise; return 'OK'; } catch (error) { return error.code; } };
const count = async (db, sql, params) => (await db.query(sql, params)).rows[0].n;

// A PostgreSQL ledger and a client on it: results carry the ledger's request_id.
function pgClient(pool, {odds = id => oddsText(id), start = T0} = {}) {
  let clock = start;
  const ledger = createPgRequestLedger(pool);
  const client = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger, sleep: async () => {}, now: () => clock,
    fetchImpl: async url => { clock += 50; const u = new URL(url); return response(u.pathname === '/odds' ? odds(Number(u.searchParams.get('fixture'))) : fixturesText(1)); }});
  return {client, ledger, now: () => clock, advance: ms => { clock += ms; }};
}

test('MP-AF-RAW-01 PG: persistence of the exact envelope, sha256 and size checked by the database, provenance and timestamps', {timeout: 90000}, async t => {
  await withSchema(t, 'persist', async ({pool}) => {
    assert.equal(await count(pool, "SELECT count(*)::int AS n FROM schema_migrations WHERE filename = '033-apifootball-raw-responses.sql'"), 1, 'applied by migrate()');
    await pool.query(MIGRATION); // idempotent
    await pool.query(MIGRATION);
    const {client} = pgClient(pool);
    const result = await client.get('/odds', {fixture: 1}, {purpose: 'prematch-collector'});
    assert.ok(Number.isSafeInteger(result.request_id) && result.request_id > 0);
    const saved = await saveRawResponse(pool, result);
    assert.equal(saved.inserted, true);
    const row = (await pool.query(`SELECT r.*, convert_from(r.body, 'UTF8') AS text, encode(sha256(r.body), 'hex') AS db_sha, l.requested_at AS ledger_at
      FROM af_raw_responses r JOIN af_request_ledger l USING (request_id) WHERE raw_id = $1`, [saved.raw_id])).rows[0];
    assert.equal(row.text, oddsText(1), 'byte for byte: get, parameters, errors, paging, unknown field, spacing');
    for (const field of ['get', 'parameters', 'errors', 'paging', 'future_field', 'response']) assert.ok(Object.hasOwn(JSON.parse(row.text), field), field);
    assert.equal(row.db_sha, row.body_sha256);
    assert.equal(row.body_sha256, sha(Buffer.from(oddsText(1))));
    assert.deepEqual([row.provider, row.endpoint, row.family, row.path, row.purpose, row.http_status, row.outcome, row.provider_date, row.body_exact],
      ['api-football', '/odds', 'odds', '/odds?fixture=1', 'prematch-collector', 200, 'ok', PROVIDER_DATE, true]);
    assert.deepEqual(row.request_params, {fixture: '1'});
    assert.equal(row.requested_at.getTime(), row.ledger_at.getTime(), 'requested_at is the ledger instant');
    assert.equal(row.received_at.toISOString(), result.fetched_at, 'received_at is the client fetched_at, not rewritten');
    assert.equal(row.quota.day_remaining, null);
    // Integrity: a body whose hash or size does not match is refused, by the store and by the database itself.
    const forged = {...result.raw, body: Buffer.from(oddsText(1, '9.99'))};
    await assert.rejects(saveRawResponse(pool, forged), err => err instanceof SnapshotStoreError && err.code === 'RAW_INVALID');
    const r2 = await client.get('/odds', {fixture: 2}, {purpose: 'prematch-collector'});
    const cols = 'provider, request_id, endpoint, family, path, params_hash, request_params, purpose, requested_at, received_at, http_status, outcome, body, body_exact, body_bytes, body_sha256';
    const vals = r => [r.raw.request_id, r.raw.endpoint, r.raw.family, r.raw.path, r.raw.params_hash, JSON.stringify(r.raw.params), r.raw.purpose, r.raw.requested_at, r.raw.received_at, r.raw.http_status, r.raw.outcome];
    const insert = (r, body, bytes, digest) => pool.query(`INSERT INTO af_raw_responses (${cols}) VALUES ('api-football',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14)`,
      [...vals(r), body, bytes, digest]);
    const b2 = Buffer.from(r2.raw.body);
    assert.equal(await code(insert(r2, b2, b2.length, 'f'.repeat(64))), '23514', 'wrong sha256 refused by the database');
    assert.equal(await code(insert(r2, b2, b2.length + 1, sha(b2))), '23514', 'wrong size refused by the database');
    // Traceability: a raw answer that does not match its ledger row is refused.
    assert.equal(await code(insert({...r2, raw: {...r2.raw, path: '/odds?fixture=3', params_hash: paramsHash('/odds?fixture=3')}}, b2, b2.length, sha(b2))), '23514');
    assert.equal(await code(insert({...r2, raw: {...r2.raw, request_id: 999999}}, b2, b2.length, sha(b2))), '23503', 'no ledger row');
    assert.equal(await code(insert({...r2, raw: {...r2.raw, requested_at: new Date(T0 - H).toISOString()}}, b2, b2.length, sha(b2))), '23514', 'instant rewritten');
    // Fails closed without a request_id (memory ledger).
    const mem = harness().client;
    await assert.rejects(saveRawResponse(pool, await mem.get('/odds', {fixture: 1}, {purpose: 'x'})), err => err.code === 'RAW_INVALID');
    // Append-only.
    assert.equal(await code(pool.query('UPDATE af_raw_responses SET http_status = 500')), 'P0001');
    assert.equal(await code(pool.query('DELETE FROM af_raw_responses')), 'P0001');
    // TRUNCATE: refused by the foreign key from the snapshots (0A000), and with CASCADE by the append-only triggers.
    assert.equal(await code(pool.query('TRUNCATE af_raw_responses')), '0A000');
    assert.equal(await code(pool.query('TRUNCATE af_raw_responses CASCADE')), 'P0001');
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_raw_responses'), 1);
  });
});

test('MP-AF-RAW-01 PG: idempotent dedupe on request and sha256; a different body for the same request is refused', {timeout: 90000}, async t => {
  await withSchema(t, 'dedupe', async ({pool}) => {
    const {client} = pgClient(pool);
    const result = await client.get('/odds', {fixture: 1}, {purpose: 'prematch-collector'});
    const a = await saveRawResponse(pool, result);
    const b = await saveRawResponse(pool, result);
    assert.deepEqual([a.inserted, b.inserted, b.raw_id], [true, false, a.raw_id], 'the same answer twice: one row, same raw_id');
    const cached = await client.get('/odds', {fixture: 1}, {purpose: 'prematch-collector'});
    assert.equal(cached.cacheHit, true);
    const c = await saveRawResponse(pool, cached);
    assert.deepEqual([c.inserted, c.raw_id], [false, a.raw_id], 'a cached result (Uint8Array body) is the same answer');
    const other = Buffer.from(oddsText(1, '2.20'));
    assert.equal(await code(saveRawResponse(pool, {...result.raw, body: other, body_bytes: other.length, body_sha256: sha(other)})), '23505');
    // Concurrent writers of the same answer: one row, and every writer gets its raw_id.
    const r2 = await client.get('/odds', {fixture: 2}, {purpose: 'prematch-collector'});
    const outs = await Promise.all(Array.from({length: 4}, () => saveRawResponse(pool, r2)));
    assert.equal(new Set(outs.map(o => o.raw_id)).size, 1);
    assert.equal(outs.filter(o => o.inserted).length, 1);
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_raw_responses WHERE request_id = $1', [r2.request_id]), 1);
    // review (Codex P2 4448788063), deterministic race: the winner's insert is still uncommitted when the loser's
    // INSERT ... ON CONFLICT starts; the loser waits, inserts nothing and must still return the winner's raw_id.
    const r3 = await client.get('/odds', {fixture: 3}, {purpose: 'prematch-collector'});
    const winner = await pool.connect();
    try {
      await winner.query('BEGIN');
      const won = await saveRawResponse(winner, r3);
      const loser = saveRawResponse(pool, r3);
      await new Promise(r => setTimeout(r, 300));
      await winner.query('COMMIT');
      const lost = await loser;
      assert.deepEqual([won.inserted, lost.inserted, lost.raw_id], [true, false, won.raw_id]);
    } finally { winner.release(); }
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_raw_responses'), 3);
  });
});

test('MP-AF-RAW-01 PG: every new snapshot names a matching raw answer; orphans and mismatched links are refused', {timeout: 90000}, async t => {
  await withSchema(t, 'link', async ({pool}) => {
    const {client} = pgClient(pool);
    const result = await client.get('/odds', {fixture: 1}, {purpose: 'prematch-collector'});
    const {raw_id: rawId} = await saveRawResponse(pool, result);
    const rows = oddsSnapshotsFromResult(result, {rawId}).rows;
    assert.ok(rows.every(r => r.request_id === result.request_id && r.raw_id === rawId));
    const conn = await pool.connect();
    try {
      assert.equal(await code(saveOddsSnapshots(conn, rows.map(r => ({...r, raw_id: null})))), '23514', 'no raw_id: refused');
      assert.equal(await code(saveOddsSnapshots(conn, rows.map(r => ({...r, raw_id: 987654})))), '23503', 'unknown raw_id: refused');
      assert.equal(await code(saveOddsSnapshots(conn, rows.map(r => ({...r, acquired_at: new Date(Date.parse(r.acquired_at) - 1000).toISOString()})))), '23514', 'other instant');
      assert.equal(await code(saveOddsSnapshots(conn, rows.map(r => ({...r, request_id: null})))), '23514', 'other request');
      assert.deepEqual(await saveOddsSnapshots(conn, rows), {inserted: 3, skipped: 0});
      assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_odds_snapshots s JOIN af_raw_responses r USING (raw_id) WHERE r.request_id = s.request_id'), 3);
      // A provider error answer can never be the source of a price.
      const errText = '{"get":"odds","parameters":{"fixture":"5"},"errors":{"plan":"x"},"results":0,"response":[]}';
      const ec = pgClient(pool, {odds: () => errText}).client;
      const error = await ec.get('/odds', {fixture: 5}, {purpose: 'prematch-collector'}).catch(e => e);
      const {raw_id: errRaw} = await saveRawResponse(pool, error.raw);
      const forged = rows.map(r => ({...r, fixture_id: 5, raw_id: errRaw, request_id: error.raw.request_id, acquired_at: error.raw.received_at}));
      assert.equal(await code(saveOddsSnapshots(conn, forged)), '23514');
      assert.equal(await count(pool, "SELECT count(*)::int AS n FROM af_raw_responses WHERE outcome = 'provider_error'"), 1);
    } finally { conn.release(); }
  });
});

test('MP-AF-RAW-01 PG: rows stored before migration 033 are kept unchanged and readable; no table rewrite', {timeout: 120000}, async t => {
  await withSchema(t, 'compat', async ({pool, url}) => {
    await pool.query(ROLLBACK);
    assert.equal((await pool.query("SELECT to_regclass('af_raw_responses') AS t")).rows[0].t, null);
    // Old rows, written as the 031 writer wrote them (no raw_id column yet).
    await pool.query(`INSERT INTO af_odds_snapshots (fixture_id, kickoff_at, acquired_at, provider_update_at, phase, bookmaker_id, bookmaker_name, bet_id, bet_name,
        value_text, odd, odd_text, market_ref_status, market_key, market_ref_version, payload_sha256)
      SELECT 2000000 + g / 10, timestamptz '2026-11-01 18:00Z', timestamptz '2026-11-01 12:00Z' + (g % 10) * interval '1 minute', NULL, 'PREMATCH', 8, 'Bet365', 1, 'Match Winner',
        'Home', 2.10, '2.10', 'UNCLASSIFIED', NULL, 'v1', repeat('a', 64) FROM generate_series(1, 5000) g`);
    const before = (await pool.query(`SELECT pg_relation_filenode('af_odds_snapshots') AS node, count(*)::int AS n,
      md5(string_agg(xmin::text || ':' || snapshot_id || ':' || odd_text || ':' || acquired_at, ',' ORDER BY snapshot_id)) AS h FROM af_odds_snapshots`)).rows[0];
    const started = Date.now();
    await runNode(['src/migrate.mjs'], migrateEnv(url));
    const ms = Date.now() - started;
    const after = (await pool.query(`SELECT pg_relation_filenode('af_odds_snapshots') AS node, count(*)::int AS n, count(raw_id)::int AS linked,
      md5(string_agg(xmin::text || ':' || snapshot_id || ':' || odd_text || ':' || acquired_at, ',' ORDER BY snapshot_id)) AS h FROM af_odds_snapshots`)).rows[0];
    assert.deepEqual([after.node, after.n, after.h, after.linked], [before.node, before.n, before.h, 0], 'same file, same rows, same xmin: nothing rewritten');
    const cons = (await pool.query("SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'af_odds_snapshots'::regclass AND conname LIKE 'af_odds_snapshots_raw%' ORDER BY conname")).rows;
    assert.deepEqual(cons, [{conname: 'af_odds_snapshots_raw_fk', convalidated: false}, {conname: 'af_odds_snapshots_raw_required', convalidated: false}]);
    assert.equal((await oddsAsOf(pool, {fixtureId: 2000001, asOf: new Date('2026-11-01T13:00Z')})).length, 1, 'old rows stay readable');
    // New rows on the same fixture are written next to them, with their raw answer.
    const {client} = pgClient(pool);
    const result = await client.get('/odds', {fixture: 2000001}, {purpose: 'prematch-collector'});
    const {raw_id: rawId} = await saveRawResponse(pool, result);
    const conn = await pool.connect();
    try { assert.equal((await saveOddsSnapshots(conn, oddsSnapshotsFromResult(result, {rawId}).rows)).inserted, 3); } finally { conn.release(); }
    t.diagnostic(`AF_RAW_COMPAT migrate_033_ms=${ms} preexisting_rows=${before.n}`);
  });
});

test('MP-AF-RAW-01 PG: crash between raw answer and snapshots (connection killed), explicit recovery, retry and idempotence', {timeout: 120000}, async t => {
  await withSchema(t, 'crash', async ({pool, root, pg, url}) => {
    const fixtureId = 1;
    const ledger = createPgRequestLedger(pool);
    let clock = T0;
    const client = createApiFootballClient({config: apiFootballConfig(clientEnv), ledger, sleep: async () => {}, now: () => clock,
      fetchImpl: async u => { clock += 50; return response(new URL(u).pathname === '/odds' ? oddsText(fixtureId) : fixturesText(fixtureId)); }});
    // A second session holds the per-fixture advisory lock, so the snapshot transaction waits inside BEGIN; then its
    // backend is terminated, as a crash of the database connection would do.
    const blocker = new pg.Client({connectionString: url});
    await blocker.connect();
    await blocker.query("SELECT pg_advisory_lock(hashtext('af_odds_snapshots'), hashtext($1))", [String(fixtureId)]);
    let writerPid;
    const make = () => createPrematchCollector({config: prematchCollectorConfig(collectorEnv), client, ledger, now: () => clock,
      saveRawResponse: result => saveRawResponse(pool, result),
      openConnection: async () => { const c = await pool.connect(); c.on('error', () => {}); writerPid = (await c.query('SELECT pg_backend_pid() AS p')).rows[0].p; return c; },
      saveSnapshots: saveOddsSnapshots});
    const run = make().runOnce();
    const waitLock = async pid => {
      for (let i = 0; i < 200; i += 1) {
        if (pid() && (await root.query("SELECT 1 FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock'", [pid()])).rowCount) return;
        await new Promise(r => setTimeout(r, 50));
      }
      throw new Error('writer never waited on the lock');
    };
    await waitLock(() => writerPid);
    await root.query('SELECT pg_terminate_backend($1)', [writerPid]);
    const report = await run;
    await blocker.end();
    assert.deepEqual([report.status, report.stop_reason, report.fixtures[0].outcome], ['stopped', 'STORE_FAILED', 'failed_store'], 'the failure is reported, never silent');
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_raw_responses'), 1, 'the raw answer was committed before normalization');
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_odds_snapshots'), 0, 'the killed transaction left no partial snapshot');
    // Retry of the cycle: the provider is not asked again inside the interval (no extra quota); recovery replays the raw.
    clock += 10 * 60000;
    const again = await make().runOnce();
    assert.equal(again.fixtures[0].outcome, 'skipped_recently_requested');
    const conn = await pool.connect();
    try {
      const rec = await recoverRawOdds(conn, {since: new Date(T0 - H)});
      assert.deepEqual([rec.raw_checked, rec.inserted], [1, 3]);
      assert.equal((await recoverRawOdds(conn, {since: new Date(T0 - H)})).raw_checked, 0, 'recovery is idempotent');
    } finally { conn.release(); }
    const linked = (await pool.query(`SELECT count(*)::int AS n, bool_and(s.acquired_at = r.received_at AND s.request_id = r.request_id) AS ok
      FROM af_odds_snapshots s JOIN af_raw_responses r USING (raw_id)`)).rows[0];
    assert.deepEqual(linked, {n: 3, ok: true});
    // A crash during the raw insert itself: nothing stored, the cycle stops, nothing normalized.
    const locker = new pg.Client({connectionString: url});
    await locker.connect();
    await locker.query('BEGIN');
    await locker.query('LOCK TABLE af_raw_responses IN ACCESS EXCLUSIVE MODE');
    let rawPid;
    clock += 2 * H;
    const second = createPrematchCollector({config: prematchCollectorConfig(collectorEnv), client, ledger, now: () => clock,
      saveRawResponse: async result => { const c = await pool.connect(); c.on('error', () => {}); rawPid = (await c.query('SELECT pg_backend_pid() AS p')).rows[0].p;
        try { return await saveRawResponse(c, result); } finally { c.release(true); } },
      openConnection: () => pool.connect(), saveSnapshots: saveOddsSnapshots}).runOnce();
    let r2;
    try {
      await waitLock(() => rawPid);
      await root.query('SELECT pg_terminate_backend($1)', [rawPid]);
      r2 = await second;
    } finally {
      await locker.query('ROLLBACK').catch(() => {});
      await locker.end().catch(() => {});
    }
    assert.deepEqual([r2.stop_reason, r2.fixtures[0].outcome], ['RAW_STORE_FAILED', 'failed_raw_store']);
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_raw_responses'), 1);
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_odds_snapshots'), 3);
    // review (Codex P2 4448788049): more than one page of raw answers that legitimately produce no snapshot (empty
    // answers) must not hide a later recoverable one: recovery pages forward by (received_at, raw_id).
    const emptyText = id => '{"get":"odds","parameters":{"fixture":"' + id + '"},"errors":[],"results":0,"paging":{"current":1,"total":1},"response":[]}';
    let page = 0;
    const lateClient = createApiFootballClient({config: apiFootballConfig({...clientEnv, APIFOOTBALL_REQUESTS_PER_DAY: '1000', APIFOOTBALL_REQUESTS_PER_MINUTE: '1000'}), ledger, sleep: async () => {}, now: () => clock,
      fetchImpl: async u => { clock += 50; page += 1; const id = Number(new URL(u).searchParams.get('fixture')); return response(id === 900 ? oddsText(900) : emptyText(id)); }});
    clock += 30 * 60000;
    const lateSince = new Date(clock - 60000);
    for (let id = 700; id < 705 + 100; id += 1) await saveRawResponse(pool, await lateClient.get('/odds', {fixture: id}, {purpose: 'prematch-collector'}));
    await saveRawResponse(pool, await lateClient.get('/odds', {fixture: 900}, {purpose: 'prematch-collector'}));
    const c2 = await pool.connect();
    try {
      const rec = await recoverRawOdds(c2, {since: lateSince, limit: 100});
      assert.deepEqual([rec.raw_checked, rec.inserted], [106, 3], 'the recoverable answer after 105 empty ones is reached');
      assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_odds_snapshots WHERE fixture_id = 900'), 3);
      const again = await recoverRawOdds(c2, {since: lateSince, limit: 100});
      assert.equal(again.inserted, 0, 'idempotent');
      const resumed = await recoverRawOdds(c2, {since: lateSince, after: rec.next, limit: 100});
      assert.deepEqual([resumed.raw_checked, resumed.inserted], [0, 0], 'a caller can resume after the returned cursor');
    } finally { c2.release(); }
  });
});

test('MP-AF-RAW-01 PG: locks taken by migration 033 (pg_locks from a second session) and lock_timeout against a long reader', {timeout: 120000}, async t => {
  await withSchema(t, 'locks', async ({pool, root, pg, url}) => {
    await pool.query(ROLLBACK);
    const mig = new pg.Client({connectionString: url});
    await mig.connect();
    try {
      await mig.query('BEGIN');
      await mig.query(MIGRATION);
      const pid = (await mig.query('SELECT pg_backend_pid() AS p')).rows[0].p;
      const locks = (await root.query(`SELECT c.relname, l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
        WHERE l.pid = $1 AND c.relname IN ('af_odds_snapshots', 'af_request_ledger') AND l.granted ORDER BY 1, 2`, [pid])).rows;
      t.diagnostic(`AF_RAW_LOCKS ${JSON.stringify(locks)}`);
      assert.ok(locks.some(l => l.relname === 'af_odds_snapshots' && l.mode === 'AccessExclusiveLock'), 'ALTER TABLE: ACCESS EXCLUSIVE until commit');
      assert.ok(!locks.some(l => l.relname === 'af_request_ledger' && l.mode === 'AccessExclusiveLock'), 'the ledger is never locked exclusively');
      // A reader of the snapshots waits while the migration transaction is open.
      const reader = new pg.Client({connectionString: url});
      await reader.connect();
      await reader.query("SET lock_timeout = '500ms'");
      assert.equal(await code(reader.query('SELECT count(*) FROM af_odds_snapshots')), '55P03');
      await reader.end();
      await mig.query('ROLLBACK');
    } finally { await mig.end(); }
    // A long reader holding the table: the migration gives up after lock_timeout (5 s) instead of queueing everyone.
    const longReader = new pg.Client({connectionString: url});
    await longReader.connect();
    await longReader.query('BEGIN');
    await longReader.query('SELECT count(*) FROM af_odds_snapshots');
    const m2 = new pg.Client({connectionString: url});
    await m2.connect();
    await m2.query('BEGIN');
    const started = Date.now();
    assert.equal(await code(m2.query(MIGRATION)), '55P03');
    const waited = Date.now() - started;
    await m2.query('ROLLBACK');
    await m2.end();
    await longReader.query('ROLLBACK');
    await longReader.end();
    assert.ok(waited >= 4500 && waited < 15000, `lock_timeout honoured (${waited} ms)`);
    assert.equal((await pool.query("SELECT to_regclass('af_raw_responses') AS t")).rows[0].t, null, 'the failed attempt left nothing');
    await runNode(['src/migrate.mjs'], migrateEnv(url));
    assert.notEqual((await pool.query("SELECT to_regclass('af_raw_responses') AS t")).rows[0].t, null);
  });
});

test('MP-AF-RAW-01 PG: rollback refuses data, removes exactly 033 when empty, is idempotent; migrate() applies it again', {timeout: 120000}, async t => {
  const {planMigrations} = await import('../src/migrate.mjs');
  const pending = ['033-apifootball-raw-responses.sql'];
  assert.deepEqual(planMigrations(pending, {production: true, approved: new Set()}), {apply: [], held: pending}, 'not applied in production without approval');
  await withSchema(t, 'rollback', async ({pool}) => {
    const {client} = pgClient(pool);
    await saveRawResponse(pool, await client.get('/odds', {fixture: 1}, {purpose: 'prematch-collector'}));
    assert.equal(await code(pool.query(ROLLBACK)), 'P0001', 'raw answers are history: refused');
    assert.equal(await count(pool, 'SELECT count(*)::int AS n FROM af_raw_responses'), 1);
  });
  await withSchema(t, 'rollback2', async ({pool, url}) => {
    await pool.query(ROLLBACK);
    await pool.query(ROLLBACK);
    const state = (await pool.query(`SELECT to_regclass('af_raw_responses') AS t, to_regprocedure('mp_af_raw_matches_ledger()') AS f1, to_regprocedure('mp_af_snapshot_matches_raw()') AS f2,
      (SELECT count(*)::int FROM pg_attribute WHERE attrelid = 'af_odds_snapshots'::regclass AND attname = 'raw_id' AND NOT attisdropped) AS col,
      (SELECT count(*)::int FROM schema_migrations WHERE filename = '033-apifootball-raw-responses.sql') AS mig,
      to_regclass('af_odds_snapshots') AS snaps, to_regprocedure('mp_af_append_only()') AS keep`)).rows[0];
    assert.deepEqual([state.t, state.f1, state.f2, state.col, state.mig], [null, null, null, 0, 0]);
    assert.ok(state.snaps && state.keep, '031 objects untouched');
    await runNode(['src/migrate.mjs'], migrateEnv(url));
    assert.equal(await count(pool, "SELECT count(*)::int AS n FROM schema_migrations WHERE filename = '033-apifootball-raw-responses.sql'"), 1);
  });
});

// Disk growth: 1 000 raw /odds answers of a realistic size (synthetic, deterministic: 12 bookmakers x 30 bets x 3 to 8
// values each, the shape observed on 2026-11-01). Measured with pg_total_relation_size (heap, TOAST, indexes).
function bigOdds(id, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const bookmakers = Array.from({length: 12}, (_, b) => ({id: b + 1, name: `Bookmaker ${b + 1}`, bets: Array.from({length: 30}, (_, k) => ({id: k + 1, name: `Bet ${k + 1}`,
    values: Array.from({length: 3 + Math.floor(rnd() * 6)}, (_, v) => ({value: `Value ${v}`, odd: (1.01 + rnd() * 20).toFixed(2)}))}))}));
  return JSON.stringify({get: 'odds', parameters: {fixture: String(id)}, errors: [], results: 1, paging: {current: 1, total: 1},
    response: [{league: {id: 135, name: 'Serie A', country: 'Italy', season: 2026}, fixture: {id, timezone: 'UTC', date: new Date(KO).toISOString(), timestamp: KO / 1000},
      update: '2026-11-02T08:50:00+00:00', bookmakers}]});
}

test('MP-AF-RAW-01 PG: disk growth per 1 000 raw answers and projection at 900 calls a day', {timeout: 300000}, async t => {
  await withSchema(t, 'disk', async ({pool}) => {
    const ledger = createPgRequestLedger(pool);
    let bodyBytes = 0;
    const quota = {day_limit: 7500, day_remaining: 7000, minute_limit: 300, minute_remaining: 290};
    for (let i = 1; i <= 1000; i += 1) {
      const body = Buffer.from(bigOdds(100000 + i, i));
      bodyBytes += body.length;
      const at = T0 + i * 1000;
      const path = `/odds?fixture=${100000 + i}`;
      const req = {endpoint: '/odds', family: 'odds', path, params_hash: paramsHash(path), purpose: 'prematch-collector'};
      const id = await ledger.insert({...req, at_ms: at, attempt: 1, outcome: 'ok', status: 200, latency_ms: 50, quota});
      await saveRawResponse(pool, {...req, request_id: id, params: {fixture: String(100000 + i)}, requested_at: new Date(at).toISOString(), received_at: new Date(at + 50).toISOString(),
        provider_date: PROVIDER_DATE, content_type: 'application/json', http_status: 200, outcome: 'ok', body, body_exact: true, body_bytes: body.length, body_sha256: sha(body), quota});
    }
    await pool.query('ANALYZE af_raw_responses');
    const size = (await pool.query(`SELECT pg_total_relation_size('af_raw_responses')::bigint AS total, pg_relation_size('af_raw_responses')::bigint AS heap,
      pg_indexes_size('af_raw_responses')::bigint AS idx, current_setting('server_version') AS v`)).rows[0];
    const mb = n => Math.round(Number(n) / 1048576 * 100) / 100;
    const perK = mb(size.total);
    const report = {server: size.v, rows: 1000, body_mb: mb(bodyBytes), avg_body_kb: Math.round(bodyBytes / 1000 / 1024 * 10) / 10, table_total_mb: perK,
      heap_mb: mb(size.heap), index_mb: mb(size.idx), per_day_900_mb: Math.round(perK * 0.9 * 100) / 100, per_30_days_mb: Math.round(perK * 0.9 * 30), per_365_days_gb: Math.round(perK * 0.9 * 365 / 1024 * 100) / 100};
    t.diagnostic(`AF_RAW_DISK ${JSON.stringify(report)}`);
    assert.ok(Number(size.total) < bodyBytes, 'stored compressed (TOAST): less than the raw bytes');
    assert.equal(await count(pool, "SELECT count(*)::int AS n FROM af_raw_responses WHERE body_sha256 = encode(sha256(body), 'hex')"), 1000);
  });
});
