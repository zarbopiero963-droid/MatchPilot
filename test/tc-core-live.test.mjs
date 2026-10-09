import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { eventsOf, isInplay, snapshotHash, verifiedInplay } from '../src/providers/totalcorner/live.mjs';
import {terminalPagePlan} from '../src/jobs/totalcorner-live.mjs';

test('terminal recovery spends its bounded budget on the newest ended pages', () => {
  assert.deepEqual(terminalPagePlan({pages: 18}, 6), [1, 14, 15, 16, 17, 18]);
  assert.deepEqual(terminalPagePlan({pages: 4}, 6), [1, 2, 3, 4]);
  assert.deepEqual(terminalPagePlan({pages: 18}, 1), [1]);
  assert.deepEqual(terminalPagePlan(undefined, 6), [1]);
});

test('live selection keeps only in-play rows from verified leagues and drops duplicates', () => {
  const rows = [
    {id: '1', l_id: '10', status: '1'},
    {id: '1', l_id: '10', status: '1'},
    {id: '2', l_id: '99', status: '1'},
    {id: '3', l_id: '10', status: 'full'},
    {id: '4', l_id: '11', status: 'ht'}
  ];
  const live = verifiedInplay(rows, ['10', '11']);
  assert.deepEqual(live.map(r => r.id), ['1', '4']);
  assert.equal(isInplay({status: 'full'}), false);
  assert.equal(isInplay({status: 'upcoming'}), false);
});

test('PostgreSQL legacy hash transition preserves old rows, dedups equal payloads and keeps changed aliases', {timeout: 30000}, async t => {
  const pg = (await import('pg')).default;
  const db = new pg.Client({connectionString: process.env.FUTPYTHON_TEST_DATABASE_URL
    || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt', connectionTimeoutMillis: 2000});
  try { await db.connect(); }
  catch (e) {
    await db.end().catch(() => {});
    if (process.env.CI) throw e;
    return t.skip('throwaway postgres unavailable');
  }
  const {insertLiveSnapshot, insertLiveEvent} = await import('../src/jobs/totalcorner-live.mjs');
  try {
    await db.query('BEGIN');
    await db.query('CREATE SCHEMA tc_live_hash_transition_test');
    await db.query('SET LOCAL search_path TO tc_live_hash_transition_test');
    await db.query(await readFile(new URL('../migrations/027-tc-live-collector.sql', import.meta.url), 'utf8'));
    await db.query(await readFile(new URL('../migrations/028-tc-live-v2-terminal.sql', import.meta.url), 'utf8'));
    const row = {status: '70', hg: '1', ag: '0', i_odds: ['2.0', '3.0', '4.0']};
    const args = payload => ['m1', 'l1', null, '2026-10-09T09:00:00Z', '70', null, null,
      snapshotHash(payload), null, JSON.stringify(payload)];
    const legacy = args(row); legacy[7] = 'legacy-v1-hash';
    assert.equal((await db.query(`INSERT INTO tc_live_snapshots
      (match_id,league_id,run_id,acquired_at,provider_status,minute,score,snapshot_hash,raw_id,payload,hash_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'v1')`, legacy)).rowCount, 1);
    assert.equal((await insertLiveSnapshot(db, args(row))).rowCount, 0);
    const changed = {...row, hg: '2'};
    assert.equal((await insertLiveSnapshot(db, args(changed))).rowCount, 1);
    assert.equal((await insertLiveSnapshot(db, args(changed))).rowCount, 0);
    const event = {detail: {team: 'home', player: 1}};
    const evArgs = payload => ['m1', eventsOf({events:[payload]})[0].event_hash, '70', 'goal', null,
      '2026-10-09T09:00:00Z', JSON.stringify(payload)];
    const oldEvent = evArgs(event); oldEvent[1] = 'legacy-event-v1-hash';
    assert.equal((await db.query(`INSERT INTO tc_live_events
      (match_id,event_hash,minute,event_type,raw_id,acquired_at,payload,hash_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,'v1')`, oldEvent)).rowCount, 1);
    assert.equal((await insertLiveEvent(db, evArgs(event))).rowCount, 0);
    assert.equal((await insertLiveEvent(db, evArgs({detail:{team:'home',player:2}}))).rowCount, 1);
    const retained = await db.query("SELECT snapshot_hash FROM tc_live_snapshots WHERE snapshot_hash='legacy-v1-hash'");
    assert.equal(retained.rowCount, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM tc_live_snapshots')).rows[0].n, 2);
    assert.equal((await db.query('SELECT count(*)::int n FROM tc_live_events')).rows[0].n, 2);
    const plan = await db.query(`EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1 WHERE NOT EXISTS
      (SELECT 1 FROM tc_live_snapshots WHERE match_id='m1' AND hash_version='v1'
       AND md5(payload::text)=md5(($1::jsonb)::text) AND payload=$1::jsonb)`, [JSON.stringify(row)]);
    const executionMs = plan.rows[0]['QUERY PLAN'][0]['Execution Time'];
    assert.ok(executionMs < 100, `legacy lookup took ${executionMs} ms`);
  } finally { await db.query('ROLLBACK'); await db.end(); }
});

test('PostgreSQL restart recovery persists a provider-confirmed ended row as FT once', {timeout: 30000}, async t => {
  const pg = (await import('pg')).default;
  const db = new pg.Client({connectionString: process.env.FUTPYTHON_TEST_DATABASE_URL
    || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt', connectionTimeoutMillis: 2000});
  try { await db.connect(); }
  catch (e) {
    await db.end().catch(() => {});
    if (process.env.CI) throw e;
    return t.skip('throwaway postgres unavailable');
  }
  const {captureTerminal} = await import('../src/jobs/totalcorner-live.mjs');
  try {
    await db.query('BEGIN');
    await db.query('CREATE SCHEMA tc_live_restart_test');
    await db.query('SET LOCAL search_path TO tc_live_restart_test');
    await db.query(await readFile(new URL('../migrations/027-tc-live-collector.sql', import.meta.url), 'utf8'));
    await db.query(await readFile(new URL('../migrations/028-tc-live-v2-terminal.sql', import.meta.url), 'utf8'));
    await db.query(`INSERT INTO tc_live_cursors(match_id,league_id,last_polled_at,last_snapshot_at,last_status,poll_count)
      VALUES('m-ft','10','2026-10-09T09:00:00Z','2026-10-09T09:00:00Z','94',61)`);
    const ended = {id:'m-ft',l_id:'10',status:'full',hg:'2',ag:'1',events:[{tp:'g',t:'85',h:'h'}]};
    const args = {row:ended,rawId:777,acquiredAt:new Date('2026-10-09T09:07:00Z'),runId:null};
    assert.deepEqual(await captureTerminal(db,args),{snapshots:1,events:1});
    assert.deepEqual(await captureTerminal(db,args),{snapshots:0,events:0});
    const cursor = (await db.query("SELECT last_status,terminal_source,terminal_raw_id,terminal_at FROM tc_live_cursors WHERE match_id='m-ft'")).rows[0];
    assert.equal(cursor.last_status,'FT');
    assert.equal(cursor.terminal_source,'today_ended');
    assert.equal(String(cursor.terminal_raw_id),'777');
    assert.ok(cursor.terminal_at);
    const snap = (await db.query("SELECT provider_status,hash_version,raw_id,payload->>'hg' hg FROM tc_live_snapshots WHERE match_id='m-ft'")).rows[0];
    assert.deepEqual({status:snap.provider_status,version:snap.hash_version,raw:String(snap.raw_id),hg:snap.hg},
      {status:'FT',version:'v2',raw:'777',hg:'2'});
    const event = (await db.query("SELECT hash_version,raw_id,payload->>'tp' tp FROM tc_live_events WHERE match_id='m-ft'")).rows[0];
    assert.deepEqual({version:event.hash_version,raw:String(event.raw_id),tp:event.tp},
      {version:'v2',raw:'777',tp:'g'});
  } finally { await db.query('ROLLBACK'); await db.end(); }
});

test('PostgreSQL live lock is released after a failed cycle and can be reacquired', {timeout: 30000}, async t => {
  const pg = (await import('pg')).default;
  const connectionString = process.env.FUTPYTHON_TEST_DATABASE_URL
    || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const first = new pg.Client({connectionString, connectionTimeoutMillis: 2000});
  const second = new pg.Client({connectionString, connectionTimeoutMillis: 2000});
  try { await first.connect(); await second.connect(); }
  catch (e) {
    await first.end().catch(() => {}); await second.end().catch(() => {});
    if (process.env.CI) throw e;
    return t.skip('throwaway postgres unavailable');
  }
  const {TC_LIVE_LOCK, withLiveLock} = await import('../src/jobs/totalcorner-live.mjs');
  try {
    assert.equal(TC_LIVE_LOCK, 76420325);
    await assert.rejects(withLiveLock(first, () => {}, async () => { throw new Error('cycle failed'); }), /cycle failed/);
    const acquired = await second.query('SELECT pg_try_advisory_lock($1) AS locked', [TC_LIVE_LOCK]);
    assert.equal(acquired.rows[0].locked, true);
    assert.equal((await second.query('SELECT pg_advisory_unlock($1) AS unlocked', [TC_LIVE_LOCK])).rows[0].unlocked, true);
  } finally { await first.end(); await second.end(); }
});

test('PostgreSQL clock_timestamp advances inside the transaction-scoped live lock', {timeout: 30000}, async t => {
  const pg = (await import('pg')).default;
  const db = new pg.Client({connectionString: process.env.FUTPYTHON_TEST_DATABASE_URL
    || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt', connectionTimeoutMillis: 2000});
  try { await db.connect(); }
  catch (e) {
    await db.end().catch(() => {});
    if (process.env.CI) throw e;
    return t.skip('throwaway postgres unavailable');
  }
  const {withLiveLock} = await import('../src/jobs/totalcorner-live.mjs');
  try {
    await withLiveLock(db, () => {}, async client => {
      const stamps = await client.query(`SELECT now() transaction_started, clock_timestamp() wall_started,
        pg_sleep(0.01), clock_timestamp() wall_finished`);
      assert.equal(stamps.rows[0].transaction_started < stamps.rows[0].wall_finished, true);
      assert.equal(stamps.rows[0].wall_started < stamps.rows[0].wall_finished, true);
    });
  } finally { await db.end(); }
});

test('unchanged live snapshot hashes are stable and events dedup on payload', () => {
  const row = {status: '1', minute: '12', score: '1-0', events: [{type: 'goal', minute: 11, side: 'home'}]};
  assert.equal(snapshotHash(row), snapshotHash({...row}));
  assert.equal(eventsOf(row)[0].event_hash, eventsOf(row)[0].event_hash);
  assert.notEqual(eventsOf(row)[0].event_hash, eventsOf({events: [{type: 'goal', minute: 12, side: 'home'}]})[0].event_hash);
});

test('observed TotalCorner aliases and unknown fields participate in snapshot identity', () => {
  // Field names observed in Neon live payloads on 2026-10-09; values are synthetic.
  const row = {status: '70', hg: '1', ag: '0', hc: '2', ac: '3',
    possess: ['41', '59'], i_odds: ['2.550', '3.000', '2.500'],
    shot_off: ['1', '3'], events: [{h: 'h', t: '69', tp: 'g'}]};
  for (const patch of [{hg: '2'}, {hc: '3'}, {possess: ['42', '58']},
    {i_odds: ['2.000', '3.000', '2.500']}, {shot_off: ['2', '3']},
    {events: [{h: 'a', t: '69', tp: 'g'}]}, {new_upstream_field: 'present'}]) {
    assert.notEqual(snapshotHash(row), snapshotHash({...row, ...patch}), JSON.stringify(patch));
  }
});

test('canonical hashing preserves nested values and ignores object key order recursively', () => {
  const a = {status: '70', attacks: {home: 100, away: 90}, events: [{detail: {team: 'home', player: 1}}]};
  const reordered = {events: [{detail: {player: 1, team: 'home'}}], attacks: {away: 90, home: 100}, status: '70'};
  assert.equal(snapshotHash(a), snapshotHash(reordered));
  assert.notEqual(snapshotHash(a), snapshotHash({...a, attacks: {home: 101, away: 90}}));
  assert.notEqual(eventsOf(a)[0].event_hash, eventsOf({events: [{detail: {team: 'home', player: 2}}]})[0].event_hash);
  assert.notEqual(snapshotHash({values: [1, 2]}), snapshotHash({values: [2, 1]}));
  assert.notEqual(snapshotHash({value: null}), snapshotHash({}));
});
