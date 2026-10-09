import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { eventsOf, isInplay, snapshotHash, verifiedInplay } from '../src/providers/totalcorner/live.mjs';

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
    const row = {status: '70', hg: '1', ag: '0', i_odds: ['2.0', '3.0', '4.0']};
    const args = payload => ['m1', 'l1', null, '2026-10-09T09:00:00Z', '70', null, null,
      snapshotHash(payload), null, JSON.stringify(payload)];
    const legacy = args(row); legacy[7] = 'legacy-v1-hash';
    assert.equal((await insertLiveSnapshot(db, legacy)).rowCount, 1);
    assert.equal((await insertLiveSnapshot(db, args(row))).rowCount, 0);
    const changed = {...row, hg: '2'};
    assert.equal((await insertLiveSnapshot(db, args(changed))).rowCount, 1);
    assert.equal((await insertLiveSnapshot(db, args(changed))).rowCount, 0);
    const event = {detail: {team: 'home', player: 1}};
    const evArgs = payload => ['m1', eventsOf({events:[payload]})[0].event_hash, '70', 'goal', null,
      '2026-10-09T09:00:00Z', JSON.stringify(payload)];
    const oldEvent = evArgs(event); oldEvent[1] = 'legacy-event-v1-hash';
    assert.equal((await insertLiveEvent(db, oldEvent)).rowCount, 1);
    assert.equal((await insertLiveEvent(db, evArgs(event))).rowCount, 0);
    assert.equal((await insertLiveEvent(db, evArgs({detail:{team:'home',player:2}}))).rowCount, 1);
    const retained = await db.query("SELECT snapshot_hash FROM tc_live_snapshots WHERE snapshot_hash='legacy-v1-hash'");
    assert.equal(retained.rowCount, 1);
    assert.equal((await db.query('SELECT count(*)::int n FROM tc_live_snapshots')).rows[0].n, 2);
    assert.equal((await db.query('SELECT count(*)::int n FROM tc_live_events')).rows[0].n, 2);
  } finally { await db.query('ROLLBACK'); await db.end(); }
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
