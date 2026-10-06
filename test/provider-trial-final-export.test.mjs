import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExportDatasetName, createOrReadFreezeBoundary, isExportAuthorized } from '../scripts/lib/provider-trial-final-export.mjs';

test('final export dataset name rejects injection-like identifiers',()=>{
  assert.equal(isSafeExportDatasetName('records'),true);
  assert.equal(isSafeExportDatasetName('odds_observations'),true);
  assert.equal(isSafeExportDatasetName('records;drop table x'),false);
  assert.equal(isSafeExportDatasetName('provider_trial.records'),false);
  assert.equal(isSafeExportDatasetName('../records'),false);
});

test('freeze boundary is immutable after first creation',async()=>{
  const stored={version:1,freeze_at_utc:'2026-10-06T10:45:40Z',max_raw_record_id:123};
  const pool={
    calls:0,
    async query(sql){
      this.calls++;
      if (String(sql).includes("WHERE key=$1")) return {rows:[{value:stored}]};
      throw new Error('unexpected mutation');
    }
  };
  const got=await createOrReadFreezeBoundary(pool,{collector_commit:'ignored'});
  assert.deepEqual(got,stored);
  assert.equal(pool.calls,1);
});


test('final export accepts header token or basic auth and rejects wrong credentials',()=>{
  const token='unit-test-token';
  const basic='Basic '+Buffer.from('export:'+token).toString('base64');
  assert.equal(isExportAuthorized({'x-provider-trial-export-token':token},token),true);
  assert.equal(isExportAuthorized({authorization:basic},token),true);
  assert.equal(isExportAuthorized({authorization:'Basic '+Buffer.from('export:wrong').toString('base64')},token),false);
  assert.equal(isExportAuthorized({},token),false);
  assert.equal(isExportAuthorized({'x-provider-trial-export-token':token},''),false);
});
