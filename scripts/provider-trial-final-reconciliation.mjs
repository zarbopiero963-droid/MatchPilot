import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { createGunzip } from 'node:zlib';
import { getFreezeBoundary } from './lib/provider-trial-final-export.mjs';

// Point 9: independent reconciliation DB/freeze -> export -> canonical -> analytics manifest -> final checksums.
// Reads only; never rewrites the files it verifies. Counts are recomputed from the real files, not taken from markers.

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';
export const RECONCILIATION_REPORT='final_reconciliation_report.json';
const OWN_OUTPUTS=new Set(['final_checksums.json','SHA256SUMS.final.txt',RECONCILIATION_REPORT]);
const LEGACY_DUCKDB_BYTES=12288;

// Primary keys from scripts/lib/provider-trial-reconciliation.mjs and the records DDL (odds_summary: GROUP BY key of the view).
export const DATASET_KEYS=Object.freeze({
  records:{numericKey:'record_id',time:'observed_at'},
  odds_observations:{numericKey:'observation_id',time:'observed_at'},
  sports:{keys:['provider','sport_id'],time:'last_seen_at'},
  competitions:{keys:['provider','sport_id','country_code','league_id'],time:'last_seen_at'},
  coverage:{keys:['provider','sport_id','country_code','league_id'],time:'latest_observed_at'},
  events:{keys:['provider','event_id'],time:'last_seen_at'},
  odds_summary:{keys:['provider','event_id','bookmaker','market_key','selection_key','line_value'],time:'last_observed_at'},
  reconciliation_state:{keys:['key'],time:null}
});
const CANONICAL_CLEAN=['sports','competitions','coverage','events'];

function sha256File(file){
  return new Promise((resolve,reject)=>{
    const h=crypto.createHash('sha256');
    fs.createReadStream(file).on('data',c=>h.update(c)).on('end',()=>resolve(h.digest('hex'))).on('error',reject);
  });
}
function walk(root){
  const out=[];
  for(const e of fs.readdirSync(root,{withFileTypes:true})){
    const full=path.join(root,e.name);
    if(e.isDirectory()) out.push(...walk(full));
    else if(e.isFile()) out.push(full);
  }
  return out;
}
const isTransient=rel=>/(?:\.duckdb\.wal|\.wal|\.tmp|\.lock)$/i.test(rel);
const ms=v=>v==null?null:new Date(v).getTime();

// Streams one gzip NDJSON file and recomputes rows, distinct primary keys, id range and max timestamp.
export async function scanNdjson(file,{numericKey=null,keys=null,time=null,rowCheck=null}={}){
  const rl=readline.createInterface({input:fs.createReadStream(file).pipe(createGunzip()),crlfDelay:Infinity});
  let rows=0,duplicates=0,nonMonotonic=0,rowCheckFailures=0,prev=null,minId=null,maxId=null,maxTime=null;
  const seen=keys?new Set():null;
  for await (const line of rl){
    if(!line) continue;
    const row=JSON.parse(line);
    rows++;
    if(numericKey){
      const id=Number(row[numericKey]);
      if(prev!==null && !(id>prev)) nonMonotonic++;
      prev=id;
      if(minId===null||id<minId) minId=id;
      if(maxId===null||id>maxId) maxId=id;
    }
    if(seen){
      const k=JSON.stringify(keys.map(c=>row[c]??null));
      if(seen.has(k)) duplicates++; else seen.add(k);
    }
    if(time && row[time]!=null){ const t=ms(row[time]); if(maxTime===null||t>maxTime) maxTime=t; }
    if(rowCheck && !rowCheck(row)) rowCheckFailures++;
  }
  const distinct=seen?seen.size:(nonMonotonic===0?rows:null);
  return {rows,distinct_keys:distinct,duplicate_keys:seen?duplicates:nonMonotonic,min_id:minId,max_id:maxId,
    max_time:maxTime===null?null:new Date(maxTime).toISOString(),row_check_failures:rowCheckFailures};
}

async function dbCount(pool,sql,params=[]){
  const {rows}=await pool.query(sql,params);
  return Number(rows[0]?.n||0);
}

export async function runFinalReconciliation(pool,{root=OUT_DIR}={}){
  if(!fs.existsSync(root)) throw new Error('reconciliation_root_missing');
  const mismatches=[];
  const check=(ok,what)=>{ if(!ok) mismatches.push(what); return ok; };
  const readJson=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

  // 0. Freeze boundary from the DB, compared with the canonical values recorded in the export manifest.
  const freeze=await getFreezeBoundary(pool);
  if(!freeze) throw new Error('freeze_not_created');
  const max=Number(freeze.max_raw_record_id), freezeAt=ms(freeze.freeze_at_utc), lastObserved=ms(freeze.last_observed_at);

  const allFiles=walk(root).map(f=>path.relative(root,f)).sort();
  const transient=allFiles.filter(isTransient);
  check(transient.length===0,'transient_files_present');

  // 1. Live DB counts at the freeze boundary.
  const db={
    records:await dbCount(pool,'SELECT count(*)::bigint AS n FROM provider_trial.records WHERE record_id <= $1',[max]),
    records_post_freeze:await dbCount(pool,'SELECT count(*)::bigint AS n FROM provider_trial.records WHERE record_id > $1',[max]),
    records_min_id:await dbCount(pool,'SELECT min(record_id)::bigint AS n FROM provider_trial.records WHERE record_id <= $1',[max]),
    records_max_id:await dbCount(pool,'SELECT max(record_id)::bigint AS n FROM provider_trial.records WHERE record_id <= $1',[max])
  };
  for(const name of Object.keys(DATASET_KEYS)) if(name!=='records') db[name]=await dbCount(pool,'SELECT count(*)::bigint AS n FROM provider_trial.'+name);
  const dbClean={};
  for(const name of CANONICAL_CLEAN) dbClean[name]=await dbCount(pool,'SELECT count(*)::bigint AS n FROM provider_trial.'+name+' WHERE provider <> $1',['scoretrend']);
  dbClean.odds_observations=await dbCount(pool,'SELECT count(*)::bigint AS n FROM provider_trial.odds_observations WHERE provider <> $1',['scoretrend']);
  dbClean.odds_summary=await dbCount(pool,'SELECT count(*)::bigint AS n FROM provider_trial.odds_summary WHERE provider <> $1',['scoretrend']);
  const dbScoretrendRaw=await dbCount(pool,"SELECT count(*)::bigint AS n FROM provider_trial.records WHERE record_id <= $1 AND source_type LIKE 'scoretrend%'",[max]);

  check(db.records===Number(freeze.total_raw),'db_records_vs_freeze_total');
  check(db.records_post_freeze===0,'db_records_after_freeze');
  check(db.records_min_id===Number(freeze.min_raw_record_id) && db.records_max_id===max,'db_record_id_range');

  // 2. Export layer: recount every exported file and reconcile with DB and export manifest.
  const exportManifest=readJson('manifest.json');
  const exportLayer={};
  for(const [name,spec] of Object.entries(DATASET_KEYS)){
    const file=name+'.ndjson.gz';
    if(!check(fs.existsSync(path.join(root,file)),'export_file_missing_'+name)) continue;
    const scan=await scanNdjson(path.join(root,file),spec);
    const entry=(exportManifest.datasets||[]).find(d=>d.name===name)||{};
    const bytes=fs.statSync(path.join(root,file)).size, sha=await sha256File(path.join(root,file));
    exportLayer[name]={db:db[name],...scan,manifest_rows:entry.rows,bytes,sha256:sha};
    check(scan.rows===db[name],'export_rows_vs_db_'+name);
    check(scan.distinct_keys===db[name],'export_distinct_keys_vs_db_'+name);
    check(scan.duplicate_keys===0,'export_duplicate_keys_'+name);
    check(entry.rows===scan.rows && entry.bytes===bytes && entry.sha256===sha,'export_manifest_vs_file_'+name);
    if(spec.time && scan.max_time) check(ms(scan.max_time)<=freezeAt,'export_after_freeze_'+name);
  }
  const rec=exportLayer.records||{};
  // bigserial ids may have gaps (a failed insert consumes sequence values): gate on the boundary, report contiguity only.
  check(rec.min_id===Number(freeze.min_raw_record_id) && rec.max_id===max,'export_records_id_range');
  const recordsContiguous=rec.rows===rec.max_id-rec.min_id+1;
  check(rec.max_time!=null && ms(rec.max_time)<=lastObserved,'export_records_after_last_observed');
  check(exportManifest.raw_expected===Number(freeze.total_raw) && exportManifest.raw_exported===rec.rows,'export_manifest_raw_expected_exported');
  check(exportManifest.freeze?.freeze_at_utc===freeze.freeze_at_utc && Number(exportManifest.freeze?.max_raw_record_id)===max,'export_manifest_freeze');
  for(const line of fs.readFileSync(path.join(root,'SHA256SUMS.txt'),'utf8').split('\n').filter(Boolean)){
    const [sha,rel]=line.split(/\s+/);
    check(fs.existsSync(path.join(root,rel)) && await sha256File(path.join(root,rel))===sha,'export_sha256sums_'+rel);
  }

  // 3. ScoreTrend segregation and clean canonical files.
  const st=await scanNdjson(path.join(root,'scoretrend_excluded.ndjson.gz'),{numericKey:'record_id',time:'observed_at',rowCheck:r=>String(r.source_type||'').startsWith('scoretrend') && Number(r.record_id)<=max});
  check(st.rows===dbScoretrendRaw && st.duplicate_keys===0 && st.row_check_failures===0,'scoretrend_excluded_vs_db');
  const canonical={};
  for(const name of CANONICAL_CLEAN){
    const scan=await scanNdjson(path.join(root,'canonical_without_scoretrend',name+'.ndjson.gz'),{...DATASET_KEYS[name],rowCheck:r=>r.provider!=='scoretrend'});
    canonical[name]={db:dbClean[name],...scan};
    check(scan.rows===dbClean[name],'canonical_rows_vs_db_'+name);
    check(scan.distinct_keys===dbClean[name] && scan.duplicate_keys===0,'canonical_distinct_keys_vs_db_'+name);
    check(scan.row_check_failures===0,'canonical_scoretrend_contamination_'+name);
  }
  // odds tables have no ScoreTrend rows in the DB; the analytics layer reads them from the export files.
  canonical.odds_observations={db:dbClean.odds_observations,rows:exportLayer.odds_observations?.rows,distinct_keys:exportLayer.odds_observations?.distinct_keys};
  canonical.odds_summary={db:dbClean.odds_summary,rows:exportLayer.odds_summary?.rows,distinct_keys:exportLayer.odds_summary?.distinct_keys};
  check(dbClean.odds_observations===db.odds_observations && dbClean.odds_summary===db.odds_summary,'canonical_odds_scoretrend_free_in_db');

  // 4. Analytics manifest: counts against the recounted canonical layer, files against the real files.
  const analytics=readJson('analytics_manifest.json');
  const analyticsFiles=[];
  for(const item of analytics.files||[]){
    const full=path.join(root,item.file);
    const exists=fs.existsSync(full);
    const bytes=exists?fs.statSync(full).size:null, sha=exists?await sha256File(full):null;
    analyticsFiles.push({file:item.file,manifest_bytes:item.bytes,bytes,manifest_sha256:item.sha256,sha256:sha});
    check(exists && bytes===item.bytes && sha===item.sha256,'analytics_manifest_vs_file_'+item.file);
  }
  for(const name of Object.keys(canonical)) check(Number(analytics.counts?.[name])===canonical[name].distinct_keys && Number(analytics.counts?.[name])===canonical[name].db,'analytics_count_vs_canonical_'+name);
  for(const [name,n] of Object.entries(analytics.contamination||{})) check(Number(n)===0,'analytics_contamination_'+name);
  check(analytics.scoretrend_excluded===true,'analytics_scoretrend_excluded_flag');
  check(analytics.liquidity_status==='UNAVAILABLE','analytics_liquidity_status');
  const duck=analyticsFiles.find(f=>f.file==='matchpilot_trial.duckdb');
  check(duck && duck.bytes!==LEGACY_DUCKDB_BYTES,'duckdb_not_checkpointed');

  // 5. Final checksums: every entry re-hashed; the entry set must equal the real file set.
  const finalJson=readJson('final_checksums.json');
  const finalTxt=fs.readFileSync(path.join(root,'SHA256SUMS.final.txt'),'utf8').split('\n').filter(Boolean).map(l=>{const [sha,...rest]=l.split('  ');return {sha256:sha,file:rest.join('  ')};});
  const expectedSet=allFiles.filter(f=>!OWN_OUTPUTS.has(f));
  const entrySet=(finalJson.files||[]).map(f=>f.file).sort();
  check(finalJson.result==='PASS' && Array.isArray(finalJson.transient_files) && finalJson.transient_files.length===0,'final_checksums_header');
  check(finalJson.files_hashed===entrySet.length,'final_checksums_files_hashed');
  check(JSON.stringify(entrySet)===JSON.stringify(expectedSet),'final_checksums_file_set');
  let finalVerified=0;
  for(const item of finalJson.files||[]){
    const full=path.join(root,item.file);
    const ok=fs.existsSync(full) && fs.statSync(full).size===item.bytes && await sha256File(full)===item.sha256;
    if(check(ok,'final_checksums_vs_file_'+item.file)) finalVerified++;
  }
  check(finalTxt.length===(finalJson.files||[]).length && finalTxt.every((l,i)=>l.file===finalJson.files[i].file && l.sha256===finalJson.files[i].sha256),'sha256sums_final_vs_final_checksums');
  for(const item of analytics.files||[]){
    const f=(finalJson.files||[]).find(x=>x.file===item.file);
    check(f && f.sha256===item.sha256 && f.bytes===item.bytes,'final_checksums_vs_analytics_manifest_'+item.file);
  }
  const duckFinal=(finalJson.files||[]).find(x=>x.file==='matchpilot_trial.duckdb');

  const report={
    version:'provider-trial-final-reconciliation-v1',
    created_at:new Date().toISOString(),
    freeze:{freeze_at_utc:freeze.freeze_at_utc,min_raw_record_id:Number(freeze.min_raw_record_id),max_raw_record_id:max,total_raw:Number(freeze.total_raw),first_observed_at:freeze.first_observed_at,last_observed_at:freeze.last_observed_at},
    db,db_canonical_without_scoretrend:dbClean,db_scoretrend_raw:dbScoretrendRaw,
    records_id_contiguous:recordsContiguous,
    export:exportLayer,scoretrend_excluded:st,canonical,
    analytics_manifest:{files:analyticsFiles,counts:analytics.counts,contamination:analytics.contamination,liquidity_status:analytics.liquidity_status},
    final_checksums:{files_hashed:finalJson.files_hashed,entries_verified:finalVerified,sha256sums_final_lines:finalTxt.length,duckdb:duckFinal||null},
    transient_files:transient,
    mismatches,
    result:mismatches.length===0?'PASS':'FAIL'
  };
  fs.writeFileSync(path.join(root,RECONCILIATION_REPORT),JSON.stringify(report,null,2)+'\n');
  const reportSha=await sha256File(path.join(root,RECONCILIATION_REPORT));
  const short=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[k,{db:v.db,rows:v.rows,distinct_keys:v.distinct_keys,duplicate_keys:v.duplicate_keys}]));
  console.log('PROVIDER_TRIAL_FINAL_RECONCILIATION '+JSON.stringify({
    result:report.result,
    mismatch_count:mismatches.length,
    mismatches,
    freeze:report.freeze,
    db_records:db.records,db_records_post_freeze:db.records_post_freeze,
    export:short(exportLayer),
    export_records_id_range:[rec.min_id,rec.max_id],export_records_id_contiguous:recordsContiguous,export_records_max_observed_at:rec.max_time,
    scoretrend_excluded:{db:dbScoretrendRaw,rows:st.rows,row_check_failures:st.row_check_failures},
    canonical:short(canonical),
    analytics_files_verified:analyticsFiles.length,
    final_checksums_entries_verified:finalVerified,
    duckdb:duckFinal?{bytes:duckFinal.bytes,sha256:duckFinal.sha256}:null,
    transient_files:transient.length,
    report_sha256:reportSha
  }));
  if(mismatches.length) throw new Error('final_reconciliation_failed_'+mismatches.length);
  return {...report,report_sha256:reportSha};
}
