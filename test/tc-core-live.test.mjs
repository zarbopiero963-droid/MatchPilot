import test from 'node:test';
import assert from 'node:assert/strict';
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
