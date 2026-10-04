import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePhase1Checks } from '../src/jobs/futpython-certify-phase1.mjs';

test('phase1 summary passes only when every real check passes',()=>{
  assert.equal(summarizePhase1Checks([
    {status:'pass'},{status:'pass'},{status:'pass'}
  ]).status,'pass');
  const failed=summarizePhase1Checks([{status:'pass'},{status:'fail'}]);
  assert.equal(failed.status,'fail');
  assert.equal(failed.failed,1);
});
