import test from 'node:test';
import assert from 'node:assert/strict';
import { isBackfillTerminalState } from '../src/jobs/futpython-sync.mjs';

test('backfill skips only terminal dataset states',()=>{
  assert.equal(isBackfillTerminalState({availability:'available',last_snapshot_id:null}),true);
  assert.equal(isBackfillTerminalState({availability:'unavailable_404',last_snapshot_id:null}),true);
  assert.equal(isBackfillTerminalState({availability:'deprecated',last_snapshot_id:null}),true);
  assert.equal(isBackfillTerminalState({availability:'error',last_snapshot_id:null}),false);
  assert.equal(isBackfillTerminalState({availability:'unknown',last_snapshot_id:null}),false);
  assert.equal(isBackfillTerminalState({availability:'error',last_snapshot_id:12}),false);
});
