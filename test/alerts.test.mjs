import test from 'node:test';
import assert from 'node:assert/strict';
import { alertFingerprint } from '../src/alerts.mjs';

test('alert fingerprint is stable and key-sensitive',()=>{
  const a=alertFingerprint({source:'futpython',code:'NEW_FIELD',key:'xG'});
  const b=alertFingerprint({source:'futpython',code:'NEW_FIELD',key:'xG'});
  const c=alertFingerprint({source:'futpython',code:'NEW_FIELD',key:'xA'});
  assert.equal(a,b);
  assert.notEqual(a,c);
  assert.equal(a.length,64);
});
