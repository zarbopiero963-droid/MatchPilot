import {assertPackageContract} from './provider-trial-package-contract.mjs';
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
 assertPackageContract({manifest,analytics,report,files:inventory.map(f=>f.file)});
 for(const [k,v] of Object.entries(FROZEN_DATASET)) check(String(manifest.freeze?.[k])===String(v)&&String(report.freeze?.[k])===String(v),'manifest_freeze_mismatch_'+k);
 check(manifest.raw_expected===82862&&manifest.raw_exported===82862,'manifest_raw_mismatch');
 for(const e of manifest.datasets) match(e);
 check(analytics.scoretrend_excluded===true&&Object.values(analytics.contamination).every(n=>n===0),'analytics_scoretrend_mismatch');
 for(const e of analytics.files) match(e);
 const excluded=new Set(['final_checksums.json','SHA256SUMS.final.txt','final_reconciliation_report.json']);
 check(checksums.version==='provider-trial-final-sha256-v1'&&checksums.result==='PASS'&&checksums.files_hashed===checksums.files.length&&checksums.transient_files.length===0,'checksum_header_mismatch');
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
 const secret=read('secret_scan_report.json');
 check(secret.version==='provider-trial-secret-scan-v1'&&secret.result==='PASS'&&Array.isArray(secret.findings)&&secret.findings.length===0&&Number.isSafeInteger(secret.files_scanned)&&secret.files_scanned>0,'secret_scan_not_pass');
 return {inventory,analytics,report,file_count:inventory.length,mismatch_count:0};
}

// Real read-only query verification, including equality to every canonical Parquet.
export async function verifyPortableDuckDB(root){
 const {DuckDBInstance}=await import('@duckdb/node-api');
 const {analytics,report}=await verifyPackageFiles(root);
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
  {
   const pit=await verifyPitRelations(conn);
   verifyPitManifest(analytics,pit);
   verifyPitReport(report.pit,pit);
  }
  for(const e of analytics.files.filter(e=>e.file.endsWith('.parquet'))){
   await value('SELECT count(*) AS n FROM read_parquet('+literal(path.join(root,e.file))+')');
  }
 }finally{conn.closeSync();instance.closeSync();}
 return {result:'PASS',mismatch_count:0};
}

// Independent oracle: anti-join against strictly newer eligible source rows, not the generator's dense_rank or its views.
export function independentPitSql(){
 const keys=['provider','event_id','bookmaker','market_key','selection_key','line_value'];
 const same=(a,b)=>keys.map(k=>`${a}.${k} IS NOT DISTINCT FROM ${b}.${k}`).join(' AND ');
 const group=keys.join(',');
 return `WITH universe AS (SELECT DISTINCT ${group} FROM canonical_odds_observations), eligible AS (
 SELECT * FROM canonical_odds_observations WHERE provider_time IS NOT NULL AND observed_at IS NOT NULL AND kickoff_utc IS NOT NULL AND provider_time<=kickoff_utc AND observed_at<=kickoff_utc
 ), top_candidates AS (SELECT a.* FROM eligible a WHERE NOT EXISTS (SELECT 1 FROM eligible b WHERE ${same('a','b')} AND (b.provider_time>a.provider_time OR (b.provider_time=a.provider_time AND b.observed_at>a.observed_at)))), expected AS (
 SELECT ${group},max(provider_time) closing_provider_time,max(observed_at) closing_observed_at,
 CASE WHEN count(DISTINCT price)=1 AND count(price)=count(*) THEN max(price) END closing_odds_pit,
 CASE WHEN count(DISTINCT price)=1 AND count(price)=count(*) THEN 'AVAILABLE' ELSE 'AMBIGUOUS_SAME_TIMESTAMP' END closing_status,
 array_agg(price ORDER BY observation_id) candidate_prices,array_agg(observation_id ORDER BY observation_id) candidate_observation_ids
 FROM top_candidates GROUP BY ${group}
 ) SELECT ${keys.map(k=>'u.'+k).join(',')},e.closing_odds_pit,coalesce(e.closing_status,'UNAVAILABLE') closing_status,e.closing_provider_time,e.closing_observed_at,e.candidate_prices,e.candidate_observation_ids,'closing_odds_pit_v1' closing_rule_version
 FROM universe u LEFT JOIN expected e ON ${same('u','e')}`;
}
export async function verifyPitRelations(conn){
 const value=async sql=>Number((await conn.runAndReadAll(sql)).getRowObjectsJson()[0].n);
 const fields='provider,event_id,bookmaker,market_key,selection_key,line_value,closing_odds_pit,closing_status,closing_provider_time,closing_observed_at,candidate_prices,candidate_observation_ids,closing_rule_version';
 const oracle='('+independentPitSql()+')';
 for(const relation of ['canonical_odds_summary','v_closing_odds_pit','v_prematch','v_replay_asof','v_backtest_observations','v_market_movement']){
  for(const [left,right] of [[relation,oracle],[oracle,relation]]){
   if(await value('SELECT count(*) n FROM (SELECT '+fields+' FROM '+left+' EXCEPT ALL SELECT '+fields+' FROM '+right+')')!==0) throw new Error('pit_source_reconciliation_mismatch_'+relation);
  }
 }
 if(await value('SELECT count(*) n FROM v_replay_asof WHERE valid_from IS DISTINCT FROM greatest(closing_provider_time,closing_observed_at)')!==0) throw new Error('pit_replay_valid_from_mismatch');
 for(const name of ['v_pit_observation_timeline','v_indicator_inputs','v_math_inputs']){
  if(await value('SELECT count(*) n FROM '+name+' WHERE provider_time IS NULL OR observed_at IS NULL OR kickoff_utc IS NULL OR provider_time>kickoff_utc OR observed_at>kickoff_utc')!==0) throw new Error('pit_leakage_'+name);
 }
 return {result:'PASS',mismatch_count:0,closing_rule_version:'closing_odds_pit_v1',statuses:(await conn.runAndReadAll('SELECT closing_status,count(*) AS groups FROM '+oracle+' GROUP BY closing_status ORDER BY closing_status')).getRowObjectsJson()};
}
export function verifyPitReport(actual,expected){
 const normalize=p=>({result:p?.result,mismatch_count:p?.mismatch_count,closing_rule_version:p?.closing_rule_version,statuses:p?.statuses?.map(r=>({closing_status:r.closing_status,groups:Number(r.groups)})).sort((a,b)=>a.closing_status.localeCompare(b.closing_status))});
 if(JSON.stringify(normalize(actual))!==JSON.stringify(normalize(expected))) throw new Error('pit_report_recalculation_mismatch');
 return true;
}

export function verifyPitManifest(analytics,pit){
   const states=Object.fromEntries(pit.statuses.map(r=>[r.closing_status,Number(r.groups)]));
   const expected={total_groups:Object.values(states).reduce((a,b)=>a+b,0),available:states.AVAILABLE||0,unavailable:states.UNAVAILABLE||0,ambiguous_same_timestamp:states.AMBIGUOUS_SAME_TIMESTAMP||0,arbitrary_prices_selected:0};
   if(JSON.stringify(analytics.closing_pit_coverage)!==JSON.stringify(expected)||analytics.readiness?.retrospective!=='AUDIT_RESEARCH_ONLY_NOT_PIT_FEATURE'||(expected.available===0&&analytics.readiness?.closing_odds_pit!=='UNAVAILABLE')) throw new Error('pit_manifest_readiness_mismatch');
 return true;
}
