// MP-ODDS-SNAP-01: pre-match odds snapshots. The answers below are synthetic, in the /odds shape observed on 2026-11-01
// (fixture, update, bookmakers[].bets[].values[] with value and odd as text); the prices are invented test values.
// The staged schema is applied to a throwaway PostgreSQL schema by the test only; migrate() never sees it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { MAX_ROWS_PER_ANSWER, oddsSnapshotRows, oddsSnapshotsFromResult, payloadSha256 } from '../src/providers/apifootball/odds-snapshots.mjs';
import { createPgRequestLedger, oddsAsOf, saveOddsSnapshots, SnapshotStoreError } from '../src/providers/apifootball/store.mjs';
import { apiFootballConfig, createApiFootballClient } from '../src/providers/apifootball/client.mjs';

const STAGED = readFileSync(new URL('../db/staged/031-apifootball-odds-snapshots.sql', import.meta.url), 'utf8');
const KICKOFF = Date.UTC(2026, 10, 1, 17, 30);
const answer = ({update = '2026-11-01T14:52:00+00:00', home = '2.10', over = '1.85', timestamp = KICKOFF / 1000} = {}) => ({response: [{
  fixture: {id: 1035001, timestamp, date: new Date(timestamp * 1000).toISOString()}, update,
  bookmakers: [{id: 8, name: 'Bet365', bets: [
    {id: 1, name: 'Match Winner', values: [{value: 'Home', odd: home}, {value: 'Draw', odd: '3.40'}, {value: 'Away', odd: '3.50'}]},
    {id: 5, name: 'Goals Over/Under', values: [{value: 'Over 2.5', odd: over}, {value: 'Under 2.5', odd: '1.95'}]},
    {id: 92, name: 'Anytime Goal Scorer', values: [{value: 'A. Player', odd: '4.50'}]}
  ]}]
}]});
const BEFORE = new Date(KICKOFF - 2 * 3600 * 1000);

test('MP-ODDS-SNAP-01 every selection becomes a row with ids, texts, decimal price, market_ref and provenance', () => {
  const {rows, rejected} = oddsSnapshotRows(answer(), {acquiredAt: BEFORE});
  assert.deepEqual(rejected, []);
  assert.equal(rows.length, 6);
  const over = rows.find(r => r.value_text === 'Over 2.5');
  assert.deepEqual([over.fixture_id, over.bookmaker_id, over.bookmaker_name, over.bet_id, over.odd_text, over.phase, over.market_ref_status, over.market_key],
    [1035001, 8, 'Bet365', 5, '1.85', 'PREMATCH', 'PARSED', 'OVER_UNDER|FT||OVER|2.5']);
  assert.deepEqual([over.kickoff_at, over.acquired_at, over.provider_update_at], ['2026-11-01T17:30:00.000Z', '2026-11-01T15:30:00.000Z', '2026-11-01T14:52:00.000Z']);
  const scorer = rows.find(r => r.bet_id === 92);
  assert.deepEqual([scorer.market_ref_status, scorer.market_key], ['UNCLASSIFIED', null], 'unknown market kept, never guessed');
  assert.ok(rows.every(r => r.payload_sha256 === payloadSha256(answer().response[0])));
  assert.equal(payloadSha256({b: 1, a: [2, {d: 3, c: 4}]}), payloadSha256({a: [2, {c: 4, d: 3}], b: 1}), 'key order does not change the hash');
});

test('MP-ODDS-SNAP-01 nothing after kickoff becomes a pre-match price; bad rows are refused, never adjusted', () => {
  for (const [acquiredAt, body, reason] of [
    [new Date(KICKOFF), answer(), /acquired at or after kickoff/],
    [new Date(KICKOFF + 60000), answer(), /acquired at or after kickoff/],
    [BEFORE, answer({update: '2026-11-01T17:31:00+00:00'}), /provider update at or after kickoff/],
    [BEFORE, answer({update: '2026-11-01T15:40:00+00:00'}), /later than the acquisition/],
    [BEFORE, answer({update: 'yesterday'}), /not an ISO instant with offset/],
    [BEFORE, answer({update: 123}), /not an ISO instant with offset/],
    [BEFORE, answer({update: '2026-11-01T14:52:00'}), /not an ISO instant with offset/],
    [BEFORE, answer({timestamp: null}), /kickoff unknown/]
  ]) {
    if (body.response[0].fixture.timestamp === null) body.response[0].fixture.date = 'n/a';
    const {rows, rejected} = oddsSnapshotRows(body, {acquiredAt});
    assert.equal(rows.length, 0);
    assert.match(rejected[0].reason, reason);
  }
  // Within the 5-minute clock tolerance the update is accepted.
  assert.equal(oddsSnapshotRows(answer({update: '2026-11-01T15:34:00+00:00'}), {acquiredAt: BEFORE}).rows.length, 6);
  for (const odd of ['0.95', '1,85', 'abc', '', '12345.5', '-2', '1.23456']) {
    const {rows, rejected} = oddsSnapshotRows(answer({home: odd}), {acquiredAt: BEFORE});
    assert.equal(rows.length, 5, odd);
    assert.match(rejected[0].reason, /price is not a decimal of at least 1/, odd);
  }
  assert.throws(() => oddsSnapshotRows(answer(), {}), /acquiredAt is required/);
  assert.deepEqual(oddsSnapshotRows({errors: {x: 'y'}}, {acquiredAt: BEFORE}), {rows: [], rejected: []});
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

async function withSchema(t, name, body, {staged = true} = {}) {
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
  const schema = `afsnap_${name}_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const db = new pg.Client({connectionString: dbUrl.toString()});
    await db.connect();
    try {
      if (staged) await db.query(STAGED);
      await body(db, pg);
    } finally { await db.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
}
const code = async promise => { try { await promise; return 'OK'; } catch (error) { return error.code; } };

test('MP-ODDS-SNAP-01 schema: staged outside migrations/, idempotent, append-only and PIT enforced by the database', {timeout: 90000}, async t => {
  await withSchema(t, 'schema', async db => {
    assert.equal((await db.query("SELECT to_regclass('af_odds_snapshots') AS t")).rows[0].t, null, 'migrate() does not apply the staged file');
    await assert.rejects(saveOddsSnapshots(db, oddsSnapshotRows(answer(), {acquiredAt: BEFORE}).rows), err => err instanceof SnapshotStoreError && err.code === 'SNAPSHOTS_UNAVAILABLE');
    await db.query(STAGED);
    await db.query(STAGED);
    const {rows} = oddsSnapshotRows(answer(), {acquiredAt: BEFORE});
    assert.deepEqual(await saveOddsSnapshots(db, rows), {inserted: 6, skipped: 0});
    assert.deepEqual(await saveOddsSnapshots(db, rows), {inserted: 0, skipped: 6}, 'replaying the same acquisition writes nothing');
    assert.deepEqual(await saveOddsSnapshots(db, oddsSnapshotRows(answer(), {acquiredAt: new Date(BEFORE.getTime() + 600000)}).rows), {inserted: 0, skipped: 6},
      'unchanged price at the same provider update: no new snapshot');
    assert.equal(await code(db.query('UPDATE af_odds_snapshots SET odd = 9')), 'P0001');
    assert.equal(await code(db.query('DELETE FROM af_odds_snapshots')), 'P0001');
    assert.equal(await code(db.query('TRUNCATE af_odds_snapshots')), 'P0001');
    // The database itself refuses a pre-match row acquired at kickoff, or an update after kickoff.
    const late = {...rows[0], acquired_at: new Date(KICKOFF).toISOString(), odd_text: '2.20'};
    assert.equal(await code(saveOddsSnapshots(db, [late])), '23514');
    const lateUpdate = {...rows[0], provider_update_at: new Date(KICKOFF).toISOString(), odd_text: '2.30'};
    assert.equal(await code(saveOddsSnapshots(db, [lateUpdate])), '23514');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM af_odds_snapshots')).rows[0].n, 6, 'a refused batch writes nothing');
  }, {staged: false});
});

test('MP-ODDS-SNAP-01 point in time: the last snapshot acquired at or before as_of, never a later one', {timeout: 90000}, async t => {
  await withSchema(t, 'pit', async db => {
    const t1 = new Date(KICKOFF - 3 * 3600 * 1000);
    const t2 = new Date(KICKOFF - 3600 * 1000);
    await saveOddsSnapshots(db, oddsSnapshotRows(answer({update: '2026-11-01T14:20:00+00:00'}), {acquiredAt: t1}).rows);
    await saveOddsSnapshots(db, oddsSnapshotRows(answer({update: '2026-11-01T16:20:00+00:00', home: '2.30'}), {acquiredAt: t2}).rows);
    const home = async asOf => (await oddsAsOf(db, {fixtureId: 1035001, asOf})).find(r => r.bet_id === 1 && r.value_text === 'Home')?.odd_text;
    assert.equal(await home(new Date(t1.getTime() - 1).toISOString()), undefined, 'nothing known before the first acquisition');
    assert.equal(await home(t1.toISOString()), '2.10');
    assert.equal(await home(new Date(t2.getTime() - 1).toISOString()), '2.10', 'the later price is not visible before it was acquired');
    assert.equal(await home(t2.toISOString()), '2.30');
    assert.equal(await home(new Date(KICKOFF + 86400000).toISOString()), '2.30', 'after kickoff: the last pre-kickoff price, nothing later');
    assert.equal((await oddsAsOf(db, {fixtureId: 1035001, asOf: t2.toISOString()})).length, 6);
    await assert.rejects(oddsAsOf(db, {fixtureId: 0, asOf: t2.toISOString()}), TypeError);
  });
});

test('MP-ODDS-SNAP-01 the PostgreSQL request ledger holds the client budget (fake fetch, no network)', {timeout: 90000}, async t => {
  await withSchema(t, 'ledger', async (db, pg) => {
    const pool = new pg.Pool();
    await assert.rejects(saveOddsSnapshots(pool, []), /dedicated client, not a pool/);
    await pool.end();
    const ledger = createPgRequestLedger(db);
    const config = apiFootballConfig({APIFOOTBALL_ENABLED: 'true', APIFOOTBALL_KEY: 'test-key-not-real', APIFOOTBALL_REQUESTS_PER_DAY: '2', APIFOOTBALL_REQUESTS_PER_MINUTE: '5'});
    const fetchImpl = async () => ({status: 200, headers: new Headers({'x-ratelimit-requests-remaining': '7000'}), json: async () => ({errors: [], results: 1, response: answer().response})});
    const client = createApiFootballClient({config, ledger, fetchImpl, sleep: async () => {}});
    const result = await client.get('/odds', {fixture: 1035001, bookmaker: 8}, {purpose: 'prematch-odds'});
    await client.get('/odds', {fixture: 1035002, bookmaker: 8}, {purpose: 'prematch-odds'});
    await assert.rejects(client.get('/odds', {fixture: 1035003, bookmaker: 8}, {purpose: 'prematch-odds'}), err => err.code === 'BUDGET_DAY');
    const rows = (await db.query('SELECT endpoint, family, purpose, attempt, outcome, http_status, quota, path FROM af_request_ledger ORDER BY request_id')).rows;
    assert.equal(rows.length, 2);
    assert.deepEqual([rows[0].endpoint, rows[0].family, rows[0].purpose, rows[0].outcome, rows[0].http_status, rows[0].quota.day_remaining],
      ['/odds', 'odds', 'prematch-odds', 'ok', 200, 7000]);
    assert.ok(!JSON.stringify(rows).includes('test-key-not-real'), 'the key never reaches the ledger');
    const saved = await saveOddsSnapshots(db, oddsSnapshotRows(result, {acquiredAt: BEFORE}).rows);
    assert.equal(saved.inserted, 6);
    assert.equal(await code(db.query('DELETE FROM af_request_ledger')), 'P0001');
  });
});

test('MP-ODDS-SNAP-01 review: ids beyond the column range and NUL characters are refused row by row, never the whole batch', () => {
  const body = answer();
  body.response[0].bookmakers.push({id: '9999999999', name: 'Big', bets: [{id: 1, name: 'Match Winner', values: [{value: 'Home', odd: '2.00'}]}]});
  body.response[0].bookmakers.push({id: 9, name: 'Nul\u0000Book', bets: [{id: 1, name: 'Match Winner', values: [{value: 'Home', odd: '2.00'}]}]});
  body.response[0].bookmakers[0].bets[0].values.push({value: 'Ho\u0000me', odd: '2.00'});
  body.response[0].bookmakers[0].bets.push({id: 2147483648, name: 'x', values: [{value: 'Home', odd: '2.00'}]});
  body.response[0].bookmakers[0].bets.push({id: 3, name: 'Second\u0000Half', values: [{value: 'Home', odd: '2.00'}]});
  body.response[0].bookmakers[0].bets.push({id: 4, name: 'Handicap', values: 'not a list'});
  const {rows, rejected} = oddsSnapshotRows(body, {acquiredAt: BEFORE});
  assert.equal(rows.length, 6, 'the good selections stay');
  assert.deepEqual(rejected.map(r => r.reason).sort(), ['bet id missing or out of range', 'bet name not storable', 'bookmaker id missing or out of range',
    'bookmaker name not storable', 'selection text missing'].sort());
  const big = {response: [{...answer().response[0], bookmakers: [{id: 8, name: 'B', bets: [{id: 5, name: 'G', values: Array.from({length: MAX_ROWS_PER_ANSWER + 1}, (_, i) => ({value: `Over ${i}.5`, odd: '2.00'}))}]}]}]};
  const refused = oddsSnapshotRows(big, {acquiredAt: BEFORE});
  assert.equal(refused.rows.length, 0);
  assert.match(refused.rejected[0].reason, /refused whole/);
});

test('MP-ODDS-SNAP-01 review: from a client result the acquisition is the fetch instant; a cached result is not stored again', () => {
  const result = {endpoint: '/odds', cacheHit: false, fetched_at: BEFORE.toISOString(), response: answer().response};
  const {rows} = oddsSnapshotsFromResult(result, {requestId: 7});
  assert.ok(rows.length === 6 && rows.every(r => r.acquired_at === BEFORE.toISOString() && r.request_id === 7));
  assert.deepEqual(oddsSnapshotsFromResult({...result, cacheHit: true}).rows, []);
  assert.throws(() => oddsSnapshotsFromResult({...result, endpoint: '/fixtures'}), /an \/odds client result is required/);
});

test('MP-ODDS-SNAP-01 review: a price that returns to an earlier value is a new snapshot (no update field, or a repeated one)', {timeout: 90000}, async t => {
  await withSchema(t, 'revert', async db => {
    for (const update of [null, '2026-11-01T11:00:00+00:00']) {
      const fixture = update === null ? 1035001 : 1035002;
      const at = n => new Date(KICKOFF - (5 - n) * 3600 * 1000);
      for (const [n, home] of [[0, '2.00'], [1, '2.10'], [2, '2.00'], [3, '2.00']]) {
        const body = answer({home, update});
        body.response[0].fixture.id = fixture;
        if (update === null) delete body.response[0].update;
        await saveOddsSnapshots(db, oddsSnapshotRows(body, {acquiredAt: at(n)}).rows);
      }
      const history = (await db.query("SELECT odd_text FROM af_odds_snapshots WHERE fixture_id = $1 AND bet_id = 1 AND value_text = 'Home' ORDER BY acquired_at", [fixture])).rows.map(r => r.odd_text);
      assert.deepEqual(history, ['2.00', '2.10', '2.00'], `update ${update}: the return to 2.00 is kept, the unchanged repeat is not`);
      const last = (await oddsAsOf(db, {fixtureId: fixture, asOf: new Date(KICKOFF - 1000)})).find(r => r.bet_id === 1 && r.value_text === 'Home');
      assert.equal(last.odd_text, '2.00', 'the reader gives the price really seen last');
    }
  });
});

test('MP-ODDS-SNAP-01 review: chunks of 500, a failing later chunk rolls back the earlier ones; long ledger errors are cut', {timeout: 90000}, async t => {
  await withSchema(t, 'chunks', async db => {
    const values = Array.from({length: 1200}, (_, i) => ({value: `Over ${i}.5`, odd: '2.00'}));
    const body = {response: [{...answer().response[0], bookmakers: [{id: 8, name: 'Bet365', bets: [{id: 5, name: 'Goals Over/Under', values}]}]}]};
    const {rows} = oddsSnapshotRows(body, {acquiredAt: BEFORE});
    assert.deepEqual(await saveOddsSnapshots(db, rows), {inserted: 1200, skipped: 0});
    const later = oddsSnapshotRows({response: [{...body.response[0], fixture: {...body.response[0].fixture, id: 1035009}}]}, {acquiredAt: BEFORE}).rows;
    later[1100] = {...later[1100], kickoff_at: BEFORE.toISOString()};
    assert.equal(await code(saveOddsSnapshots(db, later)), '23514');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM af_odds_snapshots WHERE fixture_id = 1035009')).rows[0].n, 0, 'nothing of the failed batch stays');
    const ledger = createPgRequestLedger(db);
    const base = {at_ms: Date.now(), endpoint: '/odds', family: 'odds', path: '/odds?fixture=1', params_hash: 'a'.repeat(64), purpose: 'p', attempt: 1, latency_ms: 3, quota: null};
    for (const [outcome, status] of [['ok', 200], ['provider_error', 200], ['http_error', 503], ['rate_limited', 429], ['network_error', null], ['timeout', null]]) {
      assert.ok(Number.isInteger(await ledger.insert({...base, outcome, status, error: `provider errors: ${Array.from({length: 12}, (_, i) => 'k'.repeat(39) + i).join(',')}`})));
    }
    assert.equal(await ledger.countSince(base.at_ms - 1000), 6);
    assert.ok((await db.query('SELECT max(length(error)) AS n FROM af_request_ledger')).rows[0].n <= 200);
  });
});

