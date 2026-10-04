import test from 'node:test';
import assert from 'node:assert/strict';
import { alertFingerprint } from '../src/alerts.mjs';

test('telegram outbound-only fingerprint helper remains deterministic',()=>{
  const a=alertFingerprint({source:'telegram',code:'TEST',key:'group'});
  const b=alertFingerprint({source:'telegram',code:'TEST',key:'group'});
  assert.equal(a,b);
  assert.equal(a.length,64);
});
