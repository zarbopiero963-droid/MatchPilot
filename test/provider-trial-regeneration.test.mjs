import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';
import {assertFrozenDataset,FROZEN_DATASET} from '../scripts/lib/provider-trial-regeneration-guard.mjs';
import {DATASET_ORDER_KEYS} from '../scripts/lib/provider-trial-final-export.mjs';
import {withReadOnlySnapshot,regeneratedStatementTimeoutMs} from '../scripts/provider-trial-regenerate-archive.mjs';
import {fileInventory,verifyInventory,assertNewOutput,createTransferBundle,hashFile,extractVerifiedBundle} from '../scripts/lib/provider-trial-transfer.mjs';
import {diffDbKeys} from '../scripts/provider-trial-final-reconciliation.mjs';
import {verifyPortableDuckDB} from '../scripts/lib/provider-trial-package-verify.mjs';
import {runFinalChecksums} from '../scripts/provider-trial-final-checksums.mjs';

function guardedPool({freeze=FROZEN_DATASET,post=0,ties=0,pkWrong=false}={}){
 return {query:async(sql,p=[])=>{
  if(sql.includes('WHERE key=$1')) return {rows:[{value:freeze}]};
  if(sql.includes('AS post_freeze')) return {rows:[{n:82862,min_id:1,max_id:82862,post_freeze:post}]};
  if(sql.includes('information_schema.tables')) return {rows:Object.keys(DATASET_ORDER_KEYS).map(table_name=>({table_name}))};
  if(sql.includes('information_schema.columns')) return {rows:DATASET_ORDER_KEYS[p[0]].map((column_name,i)=>({column_name,is_nullable:'NO',data_type:'text',pk_position:p[0]==='odds_summary'?null:(pkWrong?null:i+1)}))};
  if(sql.includes('WITH ranked')) return {rows:[{n:ties}]};
  return {rows:[{n:0}]};
 }};
}
test('immutable boundary and unresolved opening/latest prices block regeneration',async()=>{
 await assertFrozenDataset(guardedPool());
 await assert.rejects(()=>assertFrozenDataset(guardedPool({freeze:{...FROZEN_DATASET,total_raw:82863}})),/boundary_mismatch/);
 await assert.rejects(()=>assertFrozenDataset(guardedPool({post:1})),/records_mismatch/);
 await assert.rejects(()=>assertFrozenDataset(guardedPool({ties:12})),/OWNER_DECISION_REQUIRED.*12/);
 await assert.rejects(()=>assertFrozenDataset(guardedPool({pkWrong:true})),/primary_key_mismatch/);
});

test('regenerated statement timeout is bounded and defaults to ten minutes',()=>{
 assert.equal(regeneratedStatementTimeoutMs({}),600000);
 assert.equal(regeneratedStatementTimeoutMs({PROVIDER_TRIAL_REGENERATED_STATEMENT_TIMEOUT_MS:'900000'}),900000);
 assert.throws(()=>regeneratedStatementTimeoutMs({PROVIDER_TRIAL_REGENERATED_STATEMENT_TIMEOUT_MS:'119999'}),/invalid_regenerated_statement_timeout_ms/);
 assert.throws(()=>regeneratedStatementTimeoutMs({PROVIDER_TRIAL_REGENERATED_STATEMENT_TIMEOUT_MS:'1800001'}),/invalid_regenerated_statement_timeout_ms/);
 assert.throws(()=>regeneratedStatementTimeoutMs({PROVIDER_TRIAL_REGENERATED_STATEMENT_TIMEOUT_MS:'600000;DROP TABLE x'}),/invalid_regenerated_statement_timeout_ms/);
});

test('read-only snapshot applies timeout through parameterized set_config',async()=>{
 const calls=[];
 const client={query:async(sql,params)=>{calls.push({sql,params});return {rows:[{transaction_read_only:'on'}]};}};
 await withReadOnlySnapshot(client,async()=>{}, {statementTimeoutMs:600000});
 const timeoutCall=calls.find(x=>x.sql.includes("set_config('statement_timeout'"));
 assert.ok(timeoutCall);assert.deepEqual(timeoutCall.params,['600000']);
 assert.equal(calls[0].sql,'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 assert.equal(calls.at(-1).sql,'ROLLBACK');
});

test('one read-only repeatable-read transaction is rolled back on success and failure',async()=>{
 const calls=[];const client={query:async sql=>{calls.push(sql);return {rows:[{transaction_read_only:'on'}]};}};
 await withReadOnlySnapshot(client,async pool=>{assert.equal(pool.readOnlySnapshot,true);await pool.query('SELECT 1');});
 assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
 await assert.rejects(()=>withReadOnlySnapshot(client,async()=>{throw new Error('stop');}),/stop/);
 assert.equal(calls.at(-1),'ROLLBACK');assert.ok(!calls.some(sql=>/INSERT|UPDATE|DELETE|CREATE|COMMIT/.test(sql)));
});
test('independent key cursor never ends the enclosing read-only snapshot',async()=>{
 const calls=[];let fetched=false;
 const pool={readOnlySnapshot:true,connect:async()=>({query:async sql=>{calls.push(sql);if(sql.startsWith('FETCH')&&!fetched){fetched=true;return {rows:[{record_id:1}]};}return {rows:[]};},release(){}})};
 const result=await diffDbKeys(pool,{table:'records',spec:{numericKey:'record_id'},exportKeys:new Set([1])});
 assert.equal(result.missing_keys,0);assert.equal(result.extra_keys,0);
 assert.ok(!calls.some(s=>/BEGIN|COMMIT|ROLLBACK/.test(s)));assert.ok(calls.some(s=>s.startsWith('CLOSE')));
});
test('transfer inventory includes every file, detects mutation, missing, extra and symlinks',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'transfer-test-'));
 try{
  fs.writeFileSync(path.join(root,'report.json'),'original');const inv=await fileInventory(root);
  assert.equal((await verifyInventory(root,inv)).mismatch_count,0);
  fs.writeFileSync(path.join(root,'report.json'),'changed');await assert.rejects(()=>verifyInventory(root,inv),/mismatch/);
  fs.unlinkSync(path.join(root,'report.json'));await assert.rejects(()=>verifyInventory(root,inv),/mismatch/);
  fs.writeFileSync(path.join(root,'report.json'),'original');fs.writeFileSync(path.join(root,'extra'),'x');await assert.rejects(()=>verifyInventory(root,inv),/mismatch/);
  fs.unlinkSync(path.join(root,'extra'));fs.symlinkSync('/etc/hosts',path.join(root,'link'));await assert.rejects(()=>fileInventory(root),/symlink/);
  assert.throws(()=>assertNewOutput('/tmp/new-export'),/non_tmp/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('binary bundle has independent digest and includes the late reconciliation report',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'bundle-test-')),root=path.join(parent,'archive');fs.mkdirSync(root);
 try{
  fs.writeFileSync(path.join(root,'final_reconciliation_report.json'),'report');
  const b=await createTransferBundle(root);
  assert.equal(b.files[0].file,'final_reconciliation_report.json');assert.equal(b.bundle.sha256,await hashFile(b.bundlePath));
  await assert.rejects(()=>createTransferBundle(root),/exists/);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
test('download digest failure blocks extraction before any readback directory exists',async()=>{
 const parent=fs.mkdtempSync(path.join(process.cwd(),'download-test-')),root=path.join(parent,'readback'),download=path.join(parent,'download.tar.gz');
 try{
  fs.writeFileSync(download,'different');
  await assert.rejects(()=>extractVerifiedBundle(download,{bundle:{bytes:9,sha256:'0'.repeat(64)},files:[]},root),/downloaded_bundle_mismatch/);
  assert.equal(fs.existsSync(root),false);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
test('relocated DuckDB is portable but minimal self-consistent package is rejected',async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'portable-test-')),root=path.join(parent,'source'),moved=path.join(parent,'readback');fs.mkdirSync(root);fs.mkdirSync(path.join(root,'parquet','canonical'),{recursive:true});
 const json=(name,obj)=>fs.writeFileSync(path.join(root,name),JSON.stringify(obj));
 try{
  const instance=await DuckDBInstance.create(path.join(root,'matchpilot_trial.duckdb'));const conn=await instance.connect();
  await conn.run('CREATE TABLE canonical_events AS SELECT 1 AS event_id');
  await conn.run('CREATE VIEW v_events AS SELECT * FROM canonical_events');
  await conn.run("COPY canonical_events TO '"+path.join(root,'parquet','canonical','events.parquet').replaceAll("'","''")+"' (FORMAT PARQUET)");
  await conn.run('CHECKPOINT');conn.closeSync();instance.closeSync();
  const files=await fileInventory(root);
  json('manifest.json',{freeze:FROZEN_DATASET,raw_expected:82862,raw_exported:82862,datasets:[]});
  fs.writeFileSync(path.join(root,'SHA256SUMS.txt'),await hashFile(path.join(root,'manifest.json'))+'  manifest.json\n');
  json('analytics_manifest.json',{files,counts:{events:1},views:{v_events:1},contamination:{events:0},scoretrend_excluded:true});
  json('secret_scan_report.json',{result:'PASS'});await runFinalChecksums({root});
  json('final_reconciliation_report.json',{freeze:FROZEN_DATASET,result:'PASS',mismatches:[],db:{records:82862,records_post_freeze:0},export:{},canonical:{},scoretrend_excluded:{duplicate_keys:0,missing_keys:0,extra_keys:0}});
  const before=await fileInventory(root);fs.renameSync(root,moved);
  await assert.rejects(()=>verifyPortableDuckDB(moved),/package_contract/);
  const relocated=await DuckDBInstance.create(path.join(moved,'matchpilot_trial.duckdb'),{access_mode:'READ_ONLY'});const read=await relocated.connect();
  try{assert.equal(Number((await read.runAndReadAll('SELECT count(*) n FROM v_events')).getRowObjectsJson()[0].n),1);
  assert.equal(Number((await read.runAndReadAll("SELECT count(*) n FROM (SELECT * FROM canonical_events EXCEPT ALL SELECT * FROM read_parquet('"+path.join(moved,'parquet','canonical','events.parquet')+"'))")).getRowObjectsJson()[0].n),0);
  }finally{read.closeSync();relocated.closeSync();}
  await verifyInventory(moved,before);assert.equal(fs.existsSync(root),false);
 }finally{fs.rmSync(parent,{recursive:true,force:true});}
});
