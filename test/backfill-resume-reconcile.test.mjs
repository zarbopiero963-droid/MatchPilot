import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillResumeDecision } from '../src/jobs/futpython-sync.mjs';

test('backfill resume reconciles legacy unknown datasets with snapshots',()=>{
  assert.deepEqual(backfillResumeDecision({availability:'unknown',last_snapshot_id:10}),
    {skip:true,reconcileToAvailable:true});
});

test('backfill retries error states even when an older snapshot exists',()=>{
  assert.deepEqual(backfillResumeDecision({availability:'error',last_snapshot_id:10}),
    {skip:false,reconcileToAvailable:false});
});

test('backfill skips terminal classifications',()=>{
  for (const availability of ['available','unavailable_404','deprecated']) {
    assert.equal(backfillResumeDecision({availability,last_snapshot_id:null}).skip,true);
  }
});
