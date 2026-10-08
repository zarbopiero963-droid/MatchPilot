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
  assert.equal(snapshotHash(row), snapshotHash({...row, extra: 'ignored'}));
  assert.equal(eventsOf(row)[0].event_hash, eventsOf(row)[0].event_hash);
  assert.notEqual(eventsOf(row)[0].event_hash, eventsOf({events: [{type: 'goal', minute: 12, side: 'home'}]})[0].event_hash);
});
