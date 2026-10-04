import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkArray } from '../src/providers/futpython/store.mjs';

test('chunkArray preserves all rows and batch boundaries',()=>{
  const input=Array.from({length:1201},(_,i)=>i);
  const chunks=chunkArray(input,500);
  assert.deepEqual(chunks.map(x=>x.length),[500,500,201]);
  assert.deepEqual(chunks.flat(),input);
});

test('chunkArray rejects invalid sizes',()=>{
  assert.throws(()=>chunkArray([1,2,3],0),/chunk size/);
});
