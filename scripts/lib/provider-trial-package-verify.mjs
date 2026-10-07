import fs from 'node:fs';
import path from 'node:path';
import {fileInventory} from './provider-trial-transfer.mjs';
import {FROZEN_DATASET} from './provider-trial-regeneration-guard.mjs';

export async function verifyPackageFiles(root){
 const inventory=await fileInventory(root),byFile=new Map(inventory.map(f=>[f.file,f]));
 const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 const check=(ok,message)=>{if(!ok) throw new Error(message);};
 const match=e=>{const a=byFile.get(e.file);check(a&&a.bytes===e.bytes&&a.sha256===e.sha256,'manifest_file_mismatch_'+e.file);};
 const manifest=read('manifest.json'),analytics=read('analytics_manifest.json'),checksums=read('final_checksums.json'),report=read('final_reconciliation_report.json');
 for(const [k,v] of Object.entries(FROZEN_DATASET)) check(String(manifest.freeze?.[k])===String(v)&&String(report.freeze?.[k])===String(v),'manifest_freeze_mismatch_'+k);
 check(manifest.raw_expected===82862&&manifest.raw_exported===82862,'manifest_raw_mismatch');
 for(const e of manifest.datasets) match(e);
 check(analytics.scoretrend_excluded===true&&Object.values(analytics.contamination).every(n=>n===0),'analytics_scoretrend_mismatch');
 for(const e of analytics.files) match(e);
 const excluded=new Set(['final_checksums.json','SHA256SUMS.final.txt','final_reconciliation_report.json']);
 check(checksums.result==='PASS'&&checksums.files_hashed===checksums.files.length&&checksums.transient_files.length===0,'checksum_header_mismatch');
 check(JSON.stringify(checksums.files.map(f=>f.file).sort())===JSON.stringify(inventory.map(f=>f.file).filter(f=>!excluded.has(f)).sort()),'checksum_set_mismatch');
 for(const e of checksums.files) match(e);
 function verifySums(name,expected){
  const lines=fs.readFileSync(path.join(root,name),'utf8').trim().split('\n');
  check(lines.length===expected.length,'checksum_lines_mismatch_'+name);
  const seen=new Set();
  for(const line of lines){
   const m=/^([a-f0-9]{64})  (.+)$/.exec(line);check(m&&!seen.has(m[2]),'checksum_line_invalid_'+name);
   seen.add(m[2]);check(byFile.get(m[2])?.sha256===m[1]&&expected.includes(m[2]),'checksum_value_mismatch_'+name);
  }
 }
 verifySums('SHA256SUMS.txt',[...manifest.datasets.map(e=>e.file),'manifest.json']);
 verifySums('SHA256SUMS.final.txt',checksums.files.map(e=>e.file));
 check(report.result==='PASS'&&report.mismatches.length===0&&Number(report.db.records)===82862&&Number(report.db.records_post_freeze)===0,'reconciliation_not_pass');
 for(const e of [...Object.values(report.export),...Object.values(report.canonical),report.scoretrend_excluded]){
  check(e.duplicate_keys===0&&e.missing_keys===0&&e.extra_keys===0,'reconciliation_keys_mismatch');
 }
 check(read('secret_scan_report.json').result==='PASS','secret_scan_not_pass');
 return {inventory,analytics,file_count:inventory.length,mismatch_count:0};
}

// Real read-only query verification, including equality to every canonical Parquet.
export async function verifyPortableDuckDB(root){
 const {DuckDBInstance}=await import('@duckdb/node-api');
 const {analytics}=await verifyPackageFiles(root);
 const instance=await DuckDBInstance.create(path.join(root,'matchpilot_trial.duckdb'),{access_mode:'READ_ONLY',threads:'1',max_memory:'192MB'});
 const conn=await instance.connect();
 const value=async sql=>Number((await conn.runAndReadAll(sql)).getRowObjectsJson()[0].n);
 const literal=s=>"'"+s.replaceAll("'","''")+"'";
 try{
  const views=(await conn.runAndReadAll("SELECT sql FROM duckdb_views() WHERE NOT internal")).getRowObjectsJson();
  if(views.some(v=>/read_parquet|read_json|\/tmp\//i.test(v.sql||''))) throw new Error('duckdb_external_path_dependency');
  for(const [name,count] of Object.entries(analytics.counts)){
   if(!/^[a-z_]+$/.test(name)) throw new Error('invalid_analytics_name');
   const pq=literal(path.join(root,'parquet','canonical',name+'.parquet'));
   if(await value('SELECT count(*) AS n FROM canonical_'+name)!==count||await value('SELECT count(*) AS n FROM read_parquet('+pq+')')!==count) throw new Error('duckdb_parquet_count_mismatch_'+name);
   for(const [left,right] of [['canonical_'+name,'read_parquet('+pq+')'],['read_parquet('+pq+')','canonical_'+name]]){
    if(await value('SELECT count(*) AS n FROM (SELECT * FROM '+left+' EXCEPT ALL SELECT * FROM '+right+')')!==0) throw new Error('duckdb_parquet_content_mismatch_'+name);
   }
  }
  for(const [name,count] of Object.entries(analytics.views)){
   if(!/^v_[a-z_]+$/.test(name)||await value('SELECT count(*) AS n FROM '+name)!==count) throw new Error('duckdb_view_mismatch_'+name);
  }
  if(analytics.closing_rule_version==='closing_odds_pit_v1') await verifyPitRelations(conn);
  for(const e of analytics.files.filter(e=>e.file.endsWith('.parquet'))){
   await value('SELECT count(*) AS n FROM read_parquet('+literal(path.join(root,e.file))+')');
  }
 }finally{conn.closeSync();instance.closeSync();}
 return {result:'PASS',mismatch_count:0};
}

export async function verifyPitRelations(conn){
 const value=async sql=>Number((await conn.runAndReadAll(sql)).getRowObjectsJson()[0].n);
   for(const name of ['v_prematch','v_replay_asof','v_backtest_observations','v_indicator_inputs','v_math_inputs']){
    if(await value('SELECT count(*) n FROM '+name+' WHERE effective_at>kickoff_utc OR acquisition_time>kickoff_utc OR kickoff_utc IS NULL OR acquisition_time IS NULL')!==0) throw new Error('pit_leakage_'+name);
   }
   if(await value("SELECT count(*) n FROM v_closing_odds_pit WHERE (closing_status<>'AVAILABLE' AND closing_odds_pit IS NOT NULL) OR (closing_status='AVAILABLE' AND (closing_provider_time IS NULL OR closing_observed_at IS NULL))")!==0) throw new Error('pit_status_mismatch');
   const fields='provider,event_id,bookmaker,market_key,selection_key,line_value,closing_odds_pit,closing_status,closing_provider_time,closing_observed_at,candidate_prices,candidate_observation_ids,closing_rule_version';
   for(const [left,right] of [['canonical_odds_summary','v_closing_odds_pit'],['v_closing_odds_pit','canonical_odds_summary']]){
    if(await value('SELECT count(*) n FROM (SELECT '+fields+' FROM '+left+' EXCEPT ALL SELECT '+fields+' FROM '+right+')')!==0) throw new Error('pit_summary_reconciliation_mismatch');
   }

 return {result:'PASS',mismatch_count:0,closing_rule_version:'closing_odds_pit_v1',statuses:(await conn.runAndReadAll('SELECT closing_status,count(*) AS groups FROM v_closing_odds_pit GROUP BY closing_status ORDER BY closing_status')).getRowObjectsJson()};
}
