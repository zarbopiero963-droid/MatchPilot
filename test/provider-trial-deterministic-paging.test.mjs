import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { gunzipSync } from 'node:zlib';
import pg from 'pg';
import { DATASET_ORDER_KEYS, resolveDatasetOrder, streamDatasetNdjsonGzip } from '../scripts/lib/provider-trial-final-export.mjs';
import { runFinalFileExport } from '../scripts/provider-trial-final-file-export.mjs';
import { auditAndExportScoretrend } from '../scripts/provider-trial-scoretrend-segregation.mjs';
import { initReconciliation } from '../scripts/lib/provider-trial-reconciliation.mjs';
import { DATASET_KEYS, scanNdjson, diffDbKeys } from '../scripts/provider-trial-final-reconciliation.mjs';

// Issue #40 point 9: ORDER BY a non-unique column + LIMIT/OFFSET duplicated 282 coverage rows and lost as many.
// SQL allows any order among ties, and may pick a different one for every page: this emulator does exactly that.

const FREEZE_MAX=2400;
const FREEZE={version:1,freeze_at_utc:'2026-10-06T11:18:19.484Z',min_raw_record_id:1,max_raw_record_id:FREEZE_MAX,total_raw:0,
  first_observed_at:'2026-10-05T08:00:00.000Z',last_observed_at:'2026-10-06T10:00:00.000Z'};

const text=(name,nullable=false)=>({column_name:name,is_nullable:nullable?'YES':'NO',data_type:'text'});
const SCHEMA={
  records:{type:'BASE TABLE',columns:[{column_name:'record_id',is_nullable:'NO',data_type:'bigint'},text('observed_at'),text('source_type')],pk:['record_id']},
  odds_observations:{type:'BASE TABLE',columns:[{column_name:'observation_id',is_nullable:'NO',data_type:'bigint'},text('observed_at'),text('provider'),text('event_id',true)],pk:['observation_id']},
  sports:{type:'BASE TABLE',columns:[text('provider'),text('sport_id'),text('last_seen_at',true)],pk:['provider','sport_id']},
  competitions:{type:'BASE TABLE',columns:[text('provider'),text('sport_id'),text('country_code'),text('league_id'),text('last_seen_at')],pk:['provider','sport_id','country_code','league_id']},
  coverage:{type:'BASE TABLE',columns:[text('provider'),text('sport_id'),text('country_code'),text('league_id'),text('latest_observed_at')],pk:['provider','sport_id','country_code','league_id']},
  events:{type:'BASE TABLE',columns:[text('provider'),text('event_id'),text('last_seen_at')],pk:['provider','event_id']},
  reconciliation_state:{type:'BASE TABLE',columns:[text('key'),{column_name:'value',is_nullable:'NO',data_type:'jsonb'},text('updated_at')],pk:['key']},
  odds_summary:{type:'VIEW',columns:['provider','event_id','bookmaker','market_key','selection_key','line_value','last_observed_at'].map(c=>text(c,true)),pk:[]}
};

// Many rows share provider (the old order column), observed_at/updated_at and the first key columns; >= 2 pages each.
function buildData(){
  const ts='2026-10-06T09:00:00.000Z';
  const prov=i=>i%11===0?'scoretrend':'betsapi';
  const d={};
  d.records=[];
  for(let id=1;id<=2600;id++) if(id%97!==0) d.records.push({record_id:id,observed_at:ts,source_type:id%13===0?'scoretrend_games':'betsapi_upcoming'});
  d.odds_observations=Array.from({length:2300},(_,i)=>({observation_id:i+1,observed_at:ts,provider:'betsapi',event_id:'e'+(i%50)}));
  d.sports=Array.from({length:1300},(_,i)=>({provider:prov(i),sport_id:'s'+i,last_seen_at:ts}));
  d.competitions=Array.from({length:2500},(_,i)=>({provider:prov(i),sport_id:'1',country_code:'c'+(i%3),league_id:'l'+i,last_seen_at:ts}));
  d.coverage=Array.from({length:2414},(_,i)=>({provider:prov(i),sport_id:String(i%2),country_code:i%5===0?'':'c'+(i%4),league_id:'l'+i,latest_observed_at:ts}));
  d.events=Array.from({length:2700},(_,i)=>({provider:prov(i),event_id:String(i),last_seen_at:ts}));
  d.reconciliation_state=[{key:'final_freeze_v1',value:FREEZE,updated_at:ts},...Array.from({length:1500},(_,i)=>({key:'k'+i,value:{i},updated_at:ts}))];
  d.odds_summary=[];
  for(let i=0;i<700;i++) for(const bookmaker of [null,'','bet365']) d.odds_summary.push({provider:'betsapi',event_id:i%7===0?null:'e'+i,bookmaker,market_key:'1_1',selection_key:'h'+i,line_value:i%2?null:'',last_observed_at:ts});
  return d;
}

function rng(seed){ let x=seed>>>0||1; return ()=>{ x^=x<<13; x>>>=0; x^=x>>17; x^=x<<5; x>>>=0; return x/4294967296; }; }
function hash(s){ let h=2166136261; for(const c of s) h=Math.imul(h^c.charCodeAt(0),16777619); return h>>>0; }
function splitTop(s){ const out=[]; let depth=0,cur=''; for(const ch of s){ if(ch==='('){depth++;} if(ch===')'){depth--;} if(ch===','&&depth===0){out.push(cur.trim());cur='';continue;} cur+=ch; } if(cur.trim()) out.push(cur.trim()); return out; }
function evalExpr(expr,row){
  let m;
  if((m=/^\("?(\w+)"? IS NULL\)$/.exec(expr))) return row[m[1]]==null;
  if((m=/^COALESCE\("?(\w+)"?,''\)$/.exec(expr))) return row[m[1]]??'';
  if((m=/^"?(\w+)"?$/.exec(expr))) return row[m[1]];
  throw new Error('emulator_unknown_expr '+expr);
}
function cmp(a,b){
  if(a===b) return 0;
  if(a==null||b==null) throw new Error('emulator_null_compare'); // SQL row comparison with NULL is never true
  if(typeof a==='boolean') return a?1:-1;
  if(typeof a==='number'&&typeof b!=='number') b=Number(b);
  return a<b?-1:a>b?1:0;
}
function cmpTuple(a,b){ for(let i=0;i<a.length;i++){ const c=cmp(a[i],b[i]); if(c) return c; } return 0; }
function matches(row,where,params){
  if(!where) return true;
  return where.split(' AND ').every(cond=>{
    let m;
    if((m=/^"?(\w+)"? <= \$(\d+)$/.exec(cond))) return Number(row[m[1]])<=Number(params[m[2]-1]);
    if((m=/^"?(\w+)"? <> \$(\d+)$/.exec(cond))) return row[m[1]]!==params[m[2]-1];
    if((m=/^"?(\w+)"? <> '(\w+)'$/.exec(cond))) return row[m[1]]!==m[2];
    if((m=/^\((.+)\) > \((.+)\)$/.exec(cond))){
      const exprs=splitTop(m[1]), ph=splitTop(m[2]).map(p=>params[Number(p.slice(1))-1]);
      return cmpTuple(exprs.map(e=>evalExpr(e,row)),ph)>0;
    }
    throw new Error('emulator_unknown_condition '+cond);
  });
}

// Fake pg pool: catalog, freeze, count(*) and SELECT ... ORDER BY ... LIMIT [OFFSET] with per-query tie order.
function emulatedPool(data){
  return {
    queries:[],
    async query(sql,params=[]){
      sql=sql.replace(/\s+/g,' ').trim();
      this.queries.push(sql);
      let m;
      if(/FROM information_schema\.tables/.test(sql)) return {rows:Object.entries(SCHEMA).map(([table_name,s])=>({table_name,table_type:s.type})).sort((a,b)=>a.table_name<b.table_name?-1:1)};
      if(/FROM information_schema\.columns c/.test(sql)){
        const s=SCHEMA[params[0]]; if(!s) return {rows:[]};
        return {rows:s.columns.map(c=>({...c,pk_position:s.pk.includes(c.column_name)?s.pk.indexOf(c.column_name)+1:null}))};
      }
      if(/reconciliation_state WHERE key=\$1/.test(sql)) return {rows:[{value:FREEZE}]};
      if((m=/^SELECT count\(\*\)::bigint AS n FROM provider_trial\.(\w+) WHERE provider=\$1$/.exec(sql))) return {rows:[{n:String(data[m[1]].filter(r=>r.provider===params[0]).length)}]};
      if((m=/^SELECT source_type,count\(\*\)::bigint AS n FROM provider_trial\.records WHERE record_id <= \$1 AND source_type LIKE 'scoretrend%' GROUP BY source_type ORDER BY source_type$/.exec(sql))){
        const by={}; for(const r of data.records) if(r.record_id<=params[0]&&r.source_type.startsWith('scoretrend')) by[r.source_type]=(by[r.source_type]||0)+1;
        return {rows:Object.entries(by).map(([source_type,n])=>({source_type,n:String(n)}))};
      }
      if((m=/^SELECT \* FROM provider_trial\.records WHERE record_id > \$1 AND record_id <= \$2 AND source_type LIKE 'scoretrend%' ORDER BY record_id LIMIT (\d+)$/.exec(sql)))
        return {rows:data.records.filter(r=>r.record_id>params[0]&&r.record_id<=params[1]&&r.source_type.startsWith('scoretrend')).slice(0,Number(m[1]))};
      if((m=/^SELECT count\(\*\)::bigint AS n FROM provider_trial\."?(\w+)"?(?: WHERE (.+))?$/.exec(sql)))
        return {rows:[{n:String(data[m[1]].filter(r=>matches(r,m[2],params)).length)}]};
      if((m=/^SELECT \* FROM provider_trial\."?(\w+)"?(?: WHERE (.+?))? ORDER BY (.+?) LIMIT (\d+)(?: OFFSET (\d+))?$/.exec(sql))){
        const [,name,where,orderBy,limit,offset='0']=m;
        const exprs=splitTop(orderBy);
        const shuffle=rng(hash(sql+JSON.stringify(params)));
        const rows=data[name].filter(r=>matches(r,where,params)).map(r=>({r,t:shuffle()}));
        rows.sort((a,b)=>cmpTuple(exprs.map(e=>evalExpr(e,a.r)),exprs.map(e=>evalExpr(e,b.r)))||a.t-b.t);
        return {rows:rows.slice(Number(offset),Number(offset)+Number(limit)).map(x=>structuredClone(x.r))};
      }
      throw new Error('emulator_unhandled_sql '+sql);
    }
  };
}

const keyOf=(name,row)=>JSON.stringify(DATASET_ORDER_KEYS[name].map(c=>row[c]??null));
// rows / distinct / duplicates / missing against the expected DB rows.
function audit(name,exported,expected){
  const want=new Set(expected.map(r=>keyOf(name,r)));
  const got=new Set();
  let duplicates=0;
  for(const r of exported){ const k=keyOf(name,r); if(got.has(k)) duplicates++; else got.add(k); }
  let missing=0; for(const k of want) if(!got.has(k)) missing++;
  return {rows:exported.length,expected:expected.length,distinct:got.size,duplicates,missing};
}
const readNd=file=>gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const clean=rows=>rows.filter(r=>r.provider!=='scoretrend');

// The two pre-fix SQL shapes, kept here only to prove they are wrong.
async function legacyExport(pool,name,{canonical=false}={}){
  const out=[];
  for(let offset=0;;){
    const sql=canonical
      ? 'SELECT * FROM provider_trial.'+name+' WHERE provider <> $1 ORDER BY provider LIMIT 1000 OFFSET '+offset
      : 'SELECT * FROM provider_trial."'+name+'" ORDER BY "provider" LIMIT 1000'+(offset?' OFFSET '+offset:'');
    const {rows}=await pool.query(sql,canonical?['scoretrend']:[]);
    out.push(...rows); offset+=rows.length;
    if(rows.length<1000) break;
  }
  return out;
}

test('legacy ORDER BY provider + LIMIT/OFFSET duplicates and loses coverage rows with an unchanged row count', async () => {
  const data=buildData();
  const pool=emulatedPool(data);
  const raw=audit('coverage',await legacyExport(pool,'coverage'),data.coverage);
  assert.equal(raw.rows,raw.expected,'row count alone looks right');
  assert.ok(raw.duplicates>0 && raw.missing>0,'raw: '+JSON.stringify(raw));
  assert.equal(raw.duplicates,raw.missing);
  const can=audit('coverage',await legacyExport(pool,'coverage',{canonical:true}),clean(data.coverage));
  assert.equal(can.rows,can.expected);
  assert.ok(can.duplicates>0 && can.missing>0,'canonical: '+JSON.stringify(can));
});

test('every dataset is exported with keyset pagination on its full unique key: no duplicates, no missing rows', async () => {
  const data=buildData();
  const pool=emulatedPool(data);
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-paging-'));
  try {
    const manifest=await runFinalFileExport(pool,{outDir});
    assert.deepEqual(manifest.datasets.map(d=>d.name).sort(),Object.keys(DATASET_ORDER_KEYS).sort());
    for(const name of Object.keys(DATASET_ORDER_KEYS)){
      const expected=name==='records'?data.records.filter(r=>r.record_id<=FREEZE_MAX):data[name];
      assert.ok(expected.length>1000,name+' must span at least two pages');
      const exported=readNd(path.join(outDir,name+'.ndjson.gz'));
      const a=audit(name,exported,expected);
      assert.deepEqual(a,{rows:expected.length,expected:expected.length,distinct:expected.length,duplicates:0,missing:0},name);
      assert.deepEqual(manifest.datasets.find(d=>d.name===name).order_key,DATASET_ORDER_KEYS[name]);
      const scan=await scanNdjson(path.join(outDir,name+'.ndjson.gz'),DATASET_KEYS[name]);
      assert.equal(scan.duplicate_keys,0,name);
      assert.equal(scan.distinct_keys,expected.length,name);
    }
    const pageQueries=pool.queries.filter(q=>/^SELECT \* FROM provider_trial\./.test(q));
    assert.ok(pageQueries.length>0);
    assert.ok(pageQueries.every(q=>!/OFFSET/.test(q)),'no OFFSET paging left');
    assert.ok(pageQueries.some(q=>/ORDER BY \("provider" IS NULL\), COALESCE\("provider",''\), \("event_id" IS NULL\)/.test(q)),'odds_summary orders by its null-safe GROUP BY key');
  } finally { fs.rmSync(outDir,{recursive:true,force:true}); }
});

test('canonical_without_scoretrend is exported with keyset pagination: no duplicates, no missing rows', async () => {
  const data=buildData();
  const pool=emulatedPool(data);
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-paging-canonical-'));
  try {
    const result=await auditAndExportScoretrend(pool,{outDir});
    for(const name of ['sports','competitions','coverage','events']){
      const expected=clean(data[name]);
      const exported=readNd(path.join(outDir,'canonical_without_scoretrend',name+'.ndjson.gz'));
      assert.deepEqual(audit(name,exported,expected),{rows:expected.length,expected:expected.length,distinct:expected.length,duplicates:0,missing:0},name);
      assert.ok(exported.every(r=>r.provider!=='scoretrend'),name);
      const entry=result.canonical_without_scoretrend.find(x=>x.table===name);
      assert.equal(entry.rows,expected.length);
      assert.deepEqual(entry.order_key,DATASET_ORDER_KEYS[name]);
    }
    assert.ok(clean(data.coverage).length>1000);
    assert.equal(result.export_rows,data.records.filter(r=>r.record_id<=FREEZE_MAX&&r.source_type.startsWith('scoretrend')).length);
  } finally { fs.rmSync(outDir,{recursive:true,force:true}); }
});

test('the HTTP dataset stream uses the same deterministic keyset paging', async () => {
  const data=buildData();
  const pool=emulatedPool(data);
  for(const [name,opts,expected] of [['coverage',{},data.coverage],['coverage',{excludeScoretrend:true},clean(data.coverage)],['odds_summary',{},data.odds_summary]]){
    const res=new PassThrough(); res.setHeader=()=>{};
    const chunks=[]; res.on('data',c=>chunks.push(c));
    const done=new Promise(r=>res.on('end',r));
    await streamDatasetNdjsonGzip(pool,res,name,opts);
    await done;
    const rows=gunzipSync(Buffer.concat(chunks)).toString('utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
    assert.deepEqual(audit(name,rows,expected),{rows:expected.length,expected:expected.length,distinct:expected.length,duplicates:0,missing:0},name);
  }
});

test('order key resolution uses the real PRIMARY KEY and never falls back to a non-unique column', async () => {
  const pool=emulatedPool(buildData());
  for(const name of Object.keys(DATASET_ORDER_KEYS)) assert.deepEqual((await resolveDatasetOrder(pool,name)).key,DATASET_ORDER_KEYS[name]);
  const nullable=(await resolveDatasetOrder(pool,'odds_summary')).order.filter(o=>o.nullable).map(o=>o.column);
  assert.deepEqual(nullable,DATASET_ORDER_KEYS.odds_summary);
  const catalog=(rows)=>({async query(){ return {rows}; }});
  await assert.rejects(()=>resolveDatasetOrder(catalog([{...text('provider'),pk_position:null},{...text('note',true),pk_position:null}]),'unknown_table'),/no_unique_order_key_unknown_table/);
  await assert.rejects(()=>resolveDatasetOrder(catalog([{...text('provider'),pk_position:1},{...text('sport_id'),pk_position:null}]),'coverage'),/order_key_mismatch_coverage/);
  await assert.rejects(()=>resolveDatasetOrder(catalog([{column_name:'provider',is_nullable:'YES',data_type:'timestamp with time zone',pk_position:null}]),'odds_summary'),/order_key_nullable_non_text_odds_summary/);
});

test('an export that reads fewer rows than the DB holds fails instead of writing a silent short file', async () => {
  const data=buildData();
  const pool=emulatedPool(data);
  const query=pool.query.bind(pool);
  pool.query=async(sql,params)=>{
    const r=await query(sql,params);
    if(/^SELECT count\(\*\)::bigint AS n FROM provider_trial\."coverage"/.test(sql.replace(/\s+/g,' ').trim())) return {rows:[{n:String(Number(r.rows[0].n)+1)}]};
    return r;
  };
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-paging-short-'));
  try {
    await assert.rejects(()=>runFinalFileExport(pool,{outDir}),/export_row_count_mismatch_coverage/);
  } finally { fs.rmSync(outDir,{recursive:true,force:true}); }
});

test('real Postgres: raw and canonical exports have zero duplicate and zero missing keys across several pages', async (tt) => {
  const url=process.env.FUTPYTHON_TEST_DATABASE_URL;
  if (!url) return tt.skip('FUTPYTHON_TEST_DATABASE_URL not set');
  const pool=new pg.Pool({connectionString:url,max:1});
  const outDir=fs.mkdtempSync(path.join(os.tmpdir(),'provider-trial-paging-pg-'));
  await pool.query('SELECT pg_advisory_lock(40409)');
  try {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.query('CREATE SCHEMA provider_trial');
    await pool.query(`CREATE TABLE provider_trial.records (record_id bigserial PRIMARY KEY, observed_at timestamptz NOT NULL, instance_id text NOT NULL,
      source_type text NOT NULL, payload jsonb NOT NULL, persisted_at timestamptz NOT NULL DEFAULT now())`);
    await initReconciliation(pool);
    const ts="'2026-10-06T09:00:00Z'";
    await pool.query(`INSERT INTO provider_trial.records(record_id,observed_at,instance_id,source_type,payload)
      SELECT g,${ts},'i',CASE WHEN g%13=0 THEN 'scoretrend_games' ELSE 'betsapi_upcoming' END,'{}' FROM generate_series(1,2600) g WHERE g%97<>0`);
    await pool.query(`INSERT INTO provider_trial.sports(provider,sport_id,last_seen_at) SELECT CASE WHEN g%11=0 THEN 'scoretrend' ELSE 'betsapi' END,'s'||g,${ts} FROM generate_series(1,1300) g`);
    await pool.query(`INSERT INTO provider_trial.competitions(provider,sport_id,country_code,league_id,first_seen_at,last_seen_at)
      SELECT CASE WHEN g%11=0 THEN 'scoretrend' ELSE 'betsapi' END,'1','c'||(g%3),'l'||g,${ts},${ts} FROM generate_series(1,2500) g`);
    await pool.query(`INSERT INTO provider_trial.coverage(provider,sport_id,country_code,league_id,earliest_observed_at,latest_observed_at)
      SELECT CASE WHEN g%11=0 THEN 'scoretrend' ELSE 'betsapi' END,(g%2)::text,CASE WHEN g%5=0 THEN '' ELSE 'c'||(g%4) END,'l'||g,${ts},${ts} FROM generate_series(1,2414) g`);
    await pool.query(`INSERT INTO provider_trial.events(provider,event_id,first_seen_at,last_seen_at)
      SELECT CASE WHEN g%11=0 THEN 'scoretrend' ELSE 'betsapi' END,g::text,${ts},${ts} FROM generate_series(1,2700) g`);
    await pool.query(`INSERT INTO provider_trial.odds_observations(observation_hash,observed_at,provider,source_type,event_id,phase,bookmaker,market_key,selection_key,line_value,price,raw_path)
      SELECT 'h'||g,${ts},'betsapi','betsapi_documented_event_odds',CASE WHEN g%7=0 THEN NULL ELSE 'e'||(g%700) END,'prematch',
             (ARRAY[NULL,'','bet365'])[1+g%3],'1_1','home',CASE WHEN g%2=0 THEN NULL ELSE '' END,2.0,'p' FROM generate_series(1,2600) g`);
    await pool.query(`INSERT INTO provider_trial.reconciliation_state(key,value) SELECT 'k'||g,'{}' FROM generate_series(1,1200) g`);
    await pool.query(`INSERT INTO provider_trial.reconciliation_state(key,value) VALUES('final_freeze_v1',$1::jsonb)`,[JSON.stringify(FREEZE)]);

    await auditAndExportScoretrend(pool,{outDir});
    await runFinalFileExport(pool,{outDir});

    const keysSql=(name,where='')=>'SELECT '+DATASET_ORDER_KEYS[name].map(c=>'"'+c+'"').join(',')+' FROM provider_trial.'+name+where;
    for(const name of Object.keys(DATASET_ORDER_KEYS)){
      const {rows:expected}=await pool.query(keysSql(name,name==='records'?' WHERE record_id <= '+FREEZE_MAX:''));
      if(name!=='sports') assert.ok(expected.length>1000,name+' spans several pages');
      const exported=readNd(path.join(outDir,name+'.ndjson.gz'));
      assert.deepEqual(audit(name,exported,expected),{rows:expected.length,expected:expected.length,distinct:expected.length,duplicates:0,missing:0},'raw '+name);
      // The point 9 gate re-reads the DB keys through a server-side cursor and diffs them with the file.
      const {key_set:keySet}=await scanNdjson(path.join(outDir,name+'.ndjson.gz'),{...DATASET_KEYS[name],collectKeys:true});
      assert.deepEqual(await diffDbKeys(pool,{table:name,spec:DATASET_KEYS[name],where:name==='records'?'record_id <= '+FREEZE_MAX:null,exportKeys:keySet}),
        {db_keys:expected.length,missing_keys:0,extra_keys:0},'gate '+name);
    }
    const {key_set:short}=await scanNdjson(path.join(outDir,'coverage.ndjson.gz'),{...DATASET_KEYS.coverage,collectKeys:true});
    short.delete(short.values().next().value);
    short.add(JSON.stringify(['betsapi','9','x','not-in-db']));
    assert.deepEqual(await diffDbKeys(pool,{table:'coverage',spec:DATASET_KEYS.coverage,exportKeys:short}),{db_keys:2414,missing_keys:1,extra_keys:1},'gate detects a missing and an extra key');
    for(const name of ['sports','competitions','coverage','events']){
      const {rows:expected}=await pool.query(keysSql(name," WHERE provider <> 'scoretrend'"));
      const exported=readNd(path.join(outDir,'canonical_without_scoretrend',name+'.ndjson.gz'));
      assert.deepEqual(audit(name,exported,expected),{rows:expected.length,expected:expected.length,distinct:expected.length,duplicates:0,missing:0},'canonical '+name);
    }
  } finally {
    fs.rmSync(outDir,{recursive:true,force:true});
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.query('SELECT pg_advisory_unlock(40409)');
    await pool.end();
  }
});

