import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { runFinalChecksums } from '../scripts/provider-trial-final-checksums.mjs';
import { runFinalReconciliation, scanNdjson } from '../scripts/provider-trial-final-reconciliation.mjs';

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
async function fixture({mutateCanonicalEvents=null,mutateRecords=null,duckdbBytes=4096}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-reconcile-'));
  const data=baseData();
  if(mutateRecords) mutateRecords(data.records);
  const datasets=[];
  for(const [name,rows] of Object.entries(data)){
    const file=path.join(root,name+'.ndjson.gz');
    fs.writeFileSync(file,nd(rows));
    datasets.push({name,rows:rows.length,file:name+'.ndjson.gz',bytes:fs.statSync(file).size,sha256:sha(file)});
  }
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({freeze:FREEZE,datasets,raw_expected:3,raw_exported:data.records.length},null,2)+'\n');
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
  fs.writeFileSync(path.join(root,'secret_scan_report.json'),'{"result":"PASS"}\n');
  const afile=f=>({file:f,bytes:fs.statSync(path.join(root,f)).size,sha256:sha(path.join(root,f))});
  fs.writeFileSync(path.join(root,'analytics_manifest.json'),JSON.stringify({
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
  }};
  return {root,pool};
}

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
