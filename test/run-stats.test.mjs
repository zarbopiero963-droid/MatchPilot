import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunStats } from '../src/jobs/futpython-sync.mjs';

test('FutPython run stats start with explicit numeric zeros',()=>{
  const stats=createRunStats({mode:'backfill',bootstrap:true,startedAt:new Date('2026-10-04T00:00:00Z')});
  for (const key of [
    'catalogEntries','datasetsAttempted','datasetsChanged','snapshotsInserted',
    'rowsSeen','rowsInserted','fieldsSeen','resumedSkips','availableCount',
    'finalUnavailable404','errorRealCount'
  ]) assert.equal(stats[key],0,key);
  assert.equal(stats.meta.mode,'backfill');
  assert.equal(stats.meta.bootstrap,true);
});
