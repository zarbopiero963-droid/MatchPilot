import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runFinalChecksums } from '../scripts/provider-trial-final-checksums.mjs';
import { runFinalReconciliation, scanNdjson, assertReconciliationPit } from '../scripts/provider-trial-final-reconciliation.mjs';
import {DuckDBInstance} from '@duckdb/node-api';
import {pitViewsSql} from '../scripts/lib/provider-trial-closing-pit.mjs';
import {ARCHIVE_VERSION,ANALYTICS_VERSION} from '../scripts/lib/provider-trial-package-contract.mjs';

const FREEZE={freeze_at_utc:'2026-10-06T11:18:19.484Z',min_raw_record_id:1,max_raw_record_id:3,total_raw:3,
  first_observed_at:'2026-10-05T08:22:36.532Z',last_observed_at:'2026-10-06T10:45:39.950Z'};
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const nd=rows=>gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n');

function baseData(){
  return {
    records:[1,2,3].map(id=>({record_id:id,observed_at:'2026-10-06T10:0'+id+':00.000Z',source_type:id===3?'scoretrend_games':'betsapi_upcoming',payload:{}})),
    odds_observations:[1,2].map(id=>({observation_id:id,observed_at:'2026-10-06T09:00:00.000Z',provider:'betsapi',event_id:'e1',market_key:'1x2',selection_key:'h'+id})),
    sports:[{provider:'betsapi',sport_id:'1',last_seen_at:'2026-10-06T09:00:00.000Z'},{provider:'scoretrend',sport_id:'1',last_seen_at:'2026-10-05T20:00:00.000Z'}],
    competitions:[{provider:'betsapi',sport_id:'1',country_code:'it',league_id:'l1',last_seen_at:'2026-10-06T09:00:00.000Z'}],
    coverage:[{provider:'betsapi',sport_id:'1',country_code:'it',league_id:'l1',latest_observed_at:'2026-10-06T09:00:00.000Z'}],
    events:[{provider:'betsapi',event_id:'e1',last_seen_at:'2026-10-06T09:00:00.000Z'},{provider:'betsapi',event_id:'e2',last_seen_at:'2026-10-06T09:00:00.000Z'}],
    odds_summary:[{provider:'betsapi',event_id:'e1',bookmaker:null,market_key:'1x2',selection_key:'h1',line_value:null,last_observed_at:'2026-10-06T09:00:00.000Z'}],
    reconciliation_state:[{key:'final_freeze_v1',value:FREEZE,updated_at:'2026-10-06T11:18:19.484Z'}]
  };
}

// Builds a complete final package (export, ScoreTrend split, analytics manifest, final checksums) plus a fake DB pool.
async function fixture({mutateCanonicalEvents=null,mutateRecords=null,duckdbBytes=4096,regenerated=false,closingVersion='closing_odds_pit_v1',pitFailure=null}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-reconcile-'));
  const data=baseData();
  const dbRows=baseData();
  if(mutateRecords) mutateRecords(data.records);
  const datasets=[];
  for(const [name,rows] of Object.entries(data)){
    const file=path.join(root,name+'.ndjson.gz');
    fs.writeFileSync(file,nd(rows));
    datasets.push({name,rows:rows.length,file:name+'.ndjson.gz',bytes:fs.statSync(file).size,sha256:sha(file)});
  }
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({...(regenerated?{archive_version:ARCHIVE_VERSION}:{}),freeze:FREEZE,datasets,raw_expected:3,raw_exported:data.records.length},null,2)+'\n');
  fs.writeFileSync(path.join(root,'SHA256SUMS.txt'),datasets.map(d=>d.sha256+'  '+d.file).join('\n')+'\n');
  fs.writeFileSync(path.join(root,'scoretrend_excluded.ndjson.gz'),nd(data.records.filter(r=>r.source_type.startsWith('scoretrend'))));
  fs.mkdirSync(path.join(root,'canonical_without_scoretrend'));
  const clean={};
  for(const name of ['sports','competitions','coverage','events']){
    let rows=data[name].filter(r=>r.provider!=='scoretrend');
    if(name==='events' && mutateCanonicalEvents) rows=mutateCanonicalEvents(rows);
    clean[name]=data[name].filter(r=>r.provider!=='scoretrend').length;
    fs.writeFileSync(path.join(root,'canonical_without_scoretrend',name+'.ndjson.gz'),nd(rows));
  }
  fs.mkdirSync(path.join(root,'parquet','canonical'),{recursive:true});
  fs.writeFileSync(path.join(root,'parquet','canonical','events.parquet'),'events');
  fs.writeFileSync(path.join(root,'matchpilot_trial.duckdb'),Buffer.alloc(duckdbBytes,1));
  if(regenerated){
    fs.unlinkSync(path.join(root,'matchpilot_trial.duckdb'));
    const instance=await DuckDBInstance.create(path.join(root,'matchpilot_trial.duckdb'));const conn=await instance.connect();
    try{
      await conn.run(`CREATE TABLE canonical_odds_observations(provider VARCHAR,event_id VARCHAR,bookmaker VARCHAR,market_key VARCHAR,selection_key VARCHAR,line_value VARCHAR,observation_id BIGINT,price DOUBLE,provider_time TIMESTAMP,observed_at TIMESTAMP,kickoff_utc TIMESTAMP);
      INSERT INTO canonical_odds_observations VALUES ('betsapi','e1',NULL,'1x2','h1',NULL,1,2,'2026-10-06 08:00','2026-10-06 09:00','2026-10-06 07:00');
      CREATE VIEW v_odds_timeline AS SELECT *,observed_at acquisition_time,provider_time effective_at FROM canonical_odds_observations;
      CREATE TABLE strategy_field_catalog(source_view VARCHAR,field_name VARCHAR,phases VARCHAR,temporal_semantics VARCHAR);`);
      await conn.run(pitViewsSql());await conn.run('CREATE TABLE canonical_odds_summary AS SELECT * FROM v_closing_odds_pit');
      if(pitFailure==='relations')await conn.run("UPDATE canonical_odds_summary SET closing_status='AVAILABLE',closing_odds_pit=99");
      await conn.run('CHECKPOINT');
    }finally{conn.closeSync();instance.closeSync();}
  }
  fs.writeFileSync(path.join(root,'secret_scan_report.json'),'{"result":"PASS"}\n');
  const afile=f=>({file:f,bytes:fs.statSync(path.join(root,f)).size,sha256:sha(path.join(root,f))});
  fs.writeFileSync(path.join(root,'analytics_manifest.json'),JSON.stringify({
    ...(regenerated?{package_version:ANALYTICS_VERSION,closing_rule_version:closingVersion==='MISSING'?undefined:closingVersion,closing_pit_coverage:{total_groups:1,available:0,unavailable:pitFailure==='manifest'?2:1,ambiguous_same_timestamp:0,arbitrary_prices_selected:0},readiness:{closing_odds_pit:'UNAVAILABLE',retrospective:'AUDIT_RESEARCH_ONLY_NOT_PIT_FEATURE'}}:{}),
    scoretrend_excluded:true,liquidity_status:'UNAVAILABLE',
    counts:{...clean,odds_observations:data.odds_observations.length,odds_summary:data.odds_summary.length},
    contamination:{sports:0,competitions:0,coverage:0,events:0,odds_observations:0,odds_summary:0},
    files:[afile('parquet/canonical/events.parquet'),afile('matchpilot_trial.duckdb')]
  },null,2)+'\n');
  await runFinalChecksums({root});

  const counts={records:3,odds_observations:2,sports:2,competitions:1,coverage:1,events:2,odds_summary:1,reconciliation_state:1};
  const pool={query:async(sql,params=[])=>{
    if(/reconciliation_state WHERE key=\$1/.test(sql)) return {rows:[{value:FREEZE}]};
    if(/record_id > \$1/.test(sql)) return {rows:[{n:'0'}]};
    if(/min\(record_id\)/.test(sql)) return {rows:[{n:'1'}]};
    if(/max\(record_id\)/.test(sql)) return {rows:[{n:'3'}]};
    if(/source_type LIKE 'scoretrend%'/.test(sql)) return {rows:[{n:'1'}]};
    const m=/provider_trial\.(\w+)/.exec(sql);
    const name=m[1];
    if(/provider <> \$1/.test(sql)) return {rows:[{n:String(name==='sports'?1:counts[name])}]};
    return {rows:[{n:String(counts[name])}]};
  },
  // Server-side cursor over the DB keys, as diffDbKeys reads them (DECLARE ... FETCH).
  async connect(){
    let pending=[];
    return {
      release(){},
      async query(sql){
        const m=/^DECLARE \w+ NO SCROLL CURSOR FOR SELECT (.+) FROM provider_trial\."(\w+)"(?: WHERE (.+))?$/.exec(sql);
        if (m) {
          const cols=m[1].split(',').map(c=>c.replaceAll('"',''));
          const where=m[3]||'';
          const max=/record_id <= (\d+)/.exec(where);
          pending=dbRows[m[2]]
            .filter(r=>!max || Number(r.record_id)<=Number(max[1]))
            .filter(r=>!/source_type LIKE 'scoretrend%'/.test(where) || r.source_type.startsWith('scoretrend'))
            .filter(r=>!/provider <> 'scoretrend'/.test(where) || r.provider!=='scoretrend')
            .map(r=>Object.fromEntries(cols.map(c=>[c,r[c]??null])));
          return {rows:[]};
        }
        const f=/^FETCH (\d+)/.exec(sql);
        if (f) return {rows:pending.splice(0,Number(f[1]))};
        return {rows:[]};
      }
    };
  }};
  return {root,pool};
}

for(const [name,options,reason] of [
  ['missing version',{closingVersion:'MISSING'},'pit_closing_rule_version'],
  ['null version',{closingVersion:null},'pit_closing_rule_version'],
  ['empty version',{closingVersion:''},'pit_closing_rule_version'],
  ['legacy version',{closingVersion:'legacy'},'pit_closing_rule_version'],
  ['verifyPitRelations error',{pitFailure:'relations'},'pit_semantic_reconciliation'],
  ['verifyPitManifest error',{pitFailure:'manifest'},'pit_semantic_reconciliation']
])test('regenerated FINAL_RECONCILIATION fails without PASS marker: '+name,async t=>{
  const {root,pool}=await fixture({regenerated:true,...options});const logs=[];
  t.mock.method(console,'log',(...args)=>logs.push(args.join(' ')));
  try{
    await assert.rejects(()=>runFinalReconciliation(pool,{root}),/final_reconciliation_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8'));
    assert.equal(report.result,'FAIL');assert.ok(report.mismatches.includes(reason));
    const markers=logs.filter(s=>s.startsWith('PROVIDER_TRIAL_FINAL_RECONCILIATION ')).map(s=>JSON.parse(s.slice(s.indexOf(' ')+1)));
    assert.equal(markers.length,1);assert.equal(markers[0].result,'FAIL');
    assert.ok(!markers.some(m=>m.result==='PASS'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('regenerated FINAL_RECONCILIATION PASS requires a verified non-null PIT result',async()=>{
  const {root,pool}=await fixture({regenerated:true});
  try{const report=await runFinalReconciliation(pool,{root});assert.equal(report.result,'PASS');assertReconciliationPit(report.pit);}
  finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('runner snapshot cannot bypass PIT by removing both archive version markers',async t=>{
  const {root,pool}=await fixture({regenerated:true});const logs=[];t.mock.method(console,'log',s=>logs.push(s));
  try{
    for(const [file,fields] of [['manifest.json',['archive_version']],['analytics_manifest.json',['package_version','closing_rule_version']]]){
      const value=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));for(const field of fields)delete value[field];fs.writeFileSync(path.join(root,file),JSON.stringify(value)+'\n');
    }
    await runFinalChecksums({root});pool.readOnlySnapshot=true;
    await assert.rejects(()=>runFinalReconciliation(pool,{root}),/final_reconciliation_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8'));
    assert.equal(report.result,'FAIL');assert.ok(report.mismatches.includes('pit_closing_rule_version'));
    assert.ok(!logs.some(s=>s.startsWith('PROVIDER_TRIAL_FINAL_RECONCILIATION ')&&JSON.parse(s.slice(s.indexOf(' ')+1)).result==='PASS'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

for(const pit of [undefined,null,{}, {result:null}, {result:'FAIL',mismatch_count:0,closing_rule_version:'closing_odds_pit_v1'}, {result:'PASS',mismatch_count:1,closing_rule_version:'closing_odds_pit_v1'}, {result:'PASS',mismatch_count:0,closing_rule_version:'legacy'}])
  test('final PIT result assertion rejects '+JSON.stringify(pit),()=>assert.throws(()=>assertReconciliationPit(pit),/pit_result_not_verified/));

test('scanNdjson counts duplicate composite keys even when the row count looks right', async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-scan-'));
  try {
    const file=path.join(root,'events.ndjson.gz');
    fs.writeFileSync(file,nd([{provider:'betsapi',event_id:'e1'},{provider:'betsapi',event_id:'e1'}]));
    const r=await scanNdjson(file,{keys:['provider','event_id']});
    assert.equal(r.rows,2);
    assert.equal(r.distinct_keys,1);
    assert.equal(r.duplicate_keys,1);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('final reconciliation passes on a consistent DB -> export -> canonical -> analytics -> checksum chain', async () => {
  const {root,pool}=await fixture();
  try {
    const report=await runFinalReconciliation(pool,{root});
    assert.equal(report.result,'PASS');
    assert.deepEqual(report.mismatches,[]);
    assert.equal(report.export.records.max_id,3);
    assert.equal(report.records_id_contiguous,true);
    assert.equal(report.canonical.events.distinct_keys,2);
    for(const [name,e] of Object.entries(report.export)) assert.deepEqual([e.missing_keys,e.extra_keys,e.duplicate_keys],[0,0,0],name);
    for(const name of ['sports','competitions','coverage','events']) assert.deepEqual([report.canonical[name].missing_keys,report.canonical[name].extra_keys],[0,0],name);
    assert.ok(report.final_checksums.entries_verified>=10);
    assert.ok(fs.existsSync(path.join(root,'final_reconciliation_report.json')));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('final reconciliation fails when canonical has a duplicate key replacing a missing one (same row count)', async () => {
  const {root,pool}=await fixture({mutateCanonicalEvents:rows=>[rows[0],rows[0]]});
  try {
    await assert.rejects(()=>runFinalReconciliation(pool,{root}),/final_reconciliation_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8'));
    assert.ok(report.mismatches.includes('canonical_distinct_keys_vs_db_events'));
    assert.ok(report.mismatches.includes('canonical_missing_keys_events'));
    assert.equal(report.canonical.events.missing_keys,1);
    assert.equal(report.canonical.events.duplicate_keys,1);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('final reconciliation fails when the raw export contains a record after the freeze boundary', async () => {
  const {root,pool}=await fixture({mutateRecords:rows=>rows.push({record_id:4,observed_at:'2026-10-06T12:00:00.000Z',source_type:'betsapi_upcoming',payload:{}})});
  try {
    await assert.rejects(()=>runFinalReconciliation(pool,{root}),/final_reconciliation_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8'));
    assert.ok(report.mismatches.includes('export_rows_vs_db_records'));
    assert.ok(report.mismatches.includes('export_records_id_range'));
    assert.ok(report.mismatches.includes('export_after_freeze_records'));
    assert.ok(report.mismatches.includes('export_extra_keys_records'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('final reconciliation accepts a gap in record_id when the boundary and DB count still match', async () => {
  const {root,pool}=await fixture({mutateRecords:rows=>{ rows.splice(1,1); }});
  try {
    pool.query=(orig=>async(sql,params)=>/provider_trial\.records WHERE record_id <= \$1$/.test(sql)?{rows:[{n:'2'}]}:orig(sql,params))(pool.query);
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
    assert.equal(manifest.raw_exported,2);
    const report=await runFinalReconciliation(pool,{root}).catch(e=>JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8')));
    assert.ok(!report.mismatches.includes('export_records_id_range'));
    assert.equal(report.records_id_contiguous,false);
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('final reconciliation fails when a file changes after the final checksums were written', async () => {
  const {root,pool}=await fixture();
  try {
    fs.appendFileSync(path.join(root,'secret_scan_report.json'),'tampered\n');
    await assert.rejects(()=>runFinalReconciliation(pool,{root}),/final_reconciliation_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8'));
    assert.ok(report.mismatches.includes('final_checksums_vs_file_secret_scan_report.json'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});

test('final reconciliation rejects the pre-checkpoint 12288-byte DuckDB file', async () => {
  const {root,pool}=await fixture({duckdbBytes:12288});
  try {
    await assert.rejects(()=>runFinalReconciliation(pool,{root}),/final_reconciliation_failed/);
    const report=JSON.parse(fs.readFileSync(path.join(root,'final_reconciliation_report.json'),'utf8'));
    assert.ok(report.mismatches.includes('duckdb_not_checkpointed'));
  } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
