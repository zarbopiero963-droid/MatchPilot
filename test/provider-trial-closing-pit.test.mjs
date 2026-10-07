import {verifyPitRelations,verifyPitManifest} from '../scripts/lib/provider-trial-package-verify.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {DuckDBInstance} from '@duckdb/node-api';
import {closingSql,pitViewsSql,summaryProjection} from '../scripts/lib/provider-trial-closing-pit.mjs';

test('PIT closing, ambiguity and prematch consumers enforce both clocks',async()=>{
 const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
 try{
 await c.run(`CREATE TABLE canonical_odds_observations(provider VARCHAR,event_id VARCHAR,bookmaker VARCHAR,market_key VARCHAR,selection_key VARCHAR,line_value VARCHAR,observation_id BIGINT,price DECIMAL(12,4),provider_time TIMESTAMP,observed_at TIMESTAMP,kickoff_utc TIMESTAMP);
 INSERT INTO canonical_odds_observations VALUES
 ('p','before','b','m','s',NULL,1,2,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','late_acquisition','b','m','s',NULL,2,3,'2026-10-05 10:00','2026-10-05 11:01','2026-10-05 11:00'),
 ('p','late_provider','b','m','s',NULL,3,4,'2026-10-05 11:01','2026-10-05 10:00','2026-10-05 11:00'),
 ('p','different','b','m','s',NULL,4,2,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','different','b','m','s',NULL,5,3,'2026-10-05 10:02','2026-10-05 10:03','2026-10-05 11:00'),
 ('p','different','b','m','s',NULL,6,9,'2026-10-05 10:04','2026-10-05 11:01','2026-10-05 11:00'),
 ('p','ambiguous','b','m','s',NULL,99,2,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','ambiguous','b','m','s',NULL,7,3,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','same_price','b','m','s',NULL,8,2,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','same_price','b','m','s',NULL,9,2,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','null_provider','b','m','s',NULL,10,2,NULL,'2026-10-05 10:01','2026-10-05 11:00'),
 ('p','secondary','b','m','s',NULL,20,2,'2026-10-05 10:00','2026-10-05 10:01','2026-10-05 11:00'),
 ('p','secondary','b','m','s',NULL,21,3,'2026-10-05 10:00','2026-10-05 10:02','2026-10-05 11:00'),
 ('p','boundary','b','m','s',NULL,11,2,'2026-10-05 11:00','2026-10-05 11:00','2026-10-05 11:00');
 CREATE TABLE strategy_field_catalog(source_view VARCHAR,field_name VARCHAR,phases VARCHAR,temporal_semantics VARCHAR);
 CREATE VIEW v_odds_timeline AS SELECT *, observed_at acquisition_time,coalesce(provider_time,observed_at) effective_at FROM canonical_odds_observations;`);
 await c.run(pitViewsSql());
 const rows=(await c.runAndReadAll('SELECT * FROM v_closing_odds_pit')).getRowObjectsJson();
 const by=new Map(rows.map(r=>[r.event_id,r]));
 assert.equal(by.get('before').closing_status,'AVAILABLE');assert.equal(Number(by.get('before').closing_odds_pit),2);
 for(const id of ['late_acquisition','late_provider','null_provider']){assert.equal(by.get(id).closing_status,'UNAVAILABLE');assert.equal(by.get(id).closing_odds_pit,null);}
 assert.equal(Number(by.get('different').closing_odds_pit),3);
 assert.equal(Number(by.get('secondary').closing_odds_pit),3);
 assert.equal(by.get('ambiguous').closing_status,'AMBIGUOUS_SAME_TIMESTAMP');assert.equal(by.get('ambiguous').closing_odds_pit,null);
 assert.deepEqual(by.get('ambiguous').candidate_observation_ids.map(Number),[7,99]);assert.deepEqual(by.get('ambiguous').candidate_prices.map(Number),[3,2]);
 await c.run('UPDATE canonical_odds_observations SET observation_id=1000-observation_id');
 const again=(await c.runAndReadAll("SELECT * FROM v_closing_odds_pit WHERE event_id='ambiguous'")).getRowObjectsJson()[0];
 assert.equal(again.closing_status,'AMBIGUOUS_SAME_TIMESTAMP');assert.equal(again.closing_odds_pit,null);
 assert.equal(by.get('same_price').closing_status,'AVAILABLE');assert.equal(by.get('boundary').closing_status,'AVAILABLE');
 for(const v of ['v_prematch','v_replay_asof','v_backtest_observations']){
 const actual=(await c.runAndReadAll(`SELECT event_id,closing_odds_pit,closing_status,closing_rule_version,candidate_observation_ids FROM ${v}`)).getRowObjectsJson();
 const indexed=new Map(actual.map(r=>[r.event_id,r]));
 for(const [id,status] of [['before','AVAILABLE'],['late_acquisition','UNAVAILABLE'],['ambiguous','AMBIGUOUS_SAME_TIMESTAMP']]){
 assert.equal(indexed.get(id).closing_status,status);assert.equal(indexed.get(id).closing_rule_version,'closing_odds_pit_v1');
 if(status!=='AVAILABLE')assert.equal(indexed.get(id).closing_odds_pit,null);
 }
 assert.equal(indexed.get('ambiguous').candidate_observation_ids.length,2);
 }
 const retro=(await c.runAndReadAll("SELECT * FROM v_provider_closing_retrospective WHERE event_id='late_acquisition'")).getRowObjectsJson()[0];assert.equal(retro.closing_status,'AVAILABLE');
 // Consumers of scalar closing never inherit a representative price from an ambiguous group.
 assert.equal((await c.runAndReadAll("SELECT closing_odds_pit FROM v_market_movement WHERE event_id='ambiguous'")).getRowObjectsJson()[0].closing_odds_pit,null);
 assert.match(closingSql('canonical_odds_observations'),/ORDER BY provider_time DESC,observed_at DESC/);
 await c.run('CREATE TABLE canonical_odds_summary AS SELECT * FROM v_closing_odds_pit');
 assert.equal((await verifyPitRelations(c)).result,'PASS');
 await c.run("UPDATE canonical_odds_summary SET closing_odds_pit=7 WHERE event_id='ambiguous'");
 await assert.rejects(()=>verifyPitRelations(c),/pit_source_reconciliation_mismatch/);
 await c.run('CREATE OR REPLACE VIEW v_prematch AS SELECT * FROM v_odds_timeline');
 await assert.rejects(()=>verifyPitRelations(c));
 }finally{c.closeSync();db.closeSync();}
});

 test('null-only frozen closing fields have portable explicit types',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pit-null-'));const file=path.join(dir,'summary.json');
 const db=await DuckDBInstance.create(':memory:');const c=await db.connect();
 try{
 fs.writeFileSync(file,JSON.stringify({closing_price:null,change_open_close:null,closing_odds_pit:null,closing_provider_time:null,closing_observed_at:null,candidate_prices:null,candidate_observation_ids:null,closing_status:'UNAVAILABLE'})+'\n');
 await c.run('CREATE TABLE typed AS '+summaryProjection("read_json_auto('"+file+"',format='newline_delimited')"));
 const types=(await c.runAndReadAll('DESCRIBE typed')).getRowObjectsJson();
 assert.equal(types.find(r=>r.column_name==='candidate_observation_ids').column_type,'BIGINT[]');
 assert.equal(types.find(r=>r.column_name==='closing_odds_pit').column_type,'DOUBLE');
 await c.run("COPY typed TO '"+path.join(dir,'summary.parquet')+"' (FORMAT PARQUET)");
 assert.equal((await c.runAndReadAll("SELECT closing_odds_pit FROM read_parquet('"+path.join(dir,'summary.parquet')+"')")).getRowObjectsJson()[0].closing_odds_pit,null);
 }finally{c.closeSync();db.closeSync();fs.rmSync(dir,{recursive:true,force:true});}
 });

test('manifest/readiness explicitly preserves unavailable closing coverage',()=>{
 const analytics={closing_pit_coverage:{total_groups:64446,available:0,unavailable:64446,ambiguous_same_timestamp:0,arbitrary_prices_selected:0},readiness:{closing_odds_pit:'UNAVAILABLE',retrospective:'AUDIT_RESEARCH_ONLY_NOT_PIT_FEATURE'}};
 const pit={statuses:[{closing_status:'UNAVAILABLE',groups:'64446'}]};
 assert.equal(verifyPitManifest(analytics,pit),true);
 assert.throws(()=>verifyPitManifest({...analytics,closing_pit_coverage:{...analytics.closing_pit_coverage,available:1}},pit),/pit_manifest_readiness_mismatch/);
 assert.throws(()=>verifyPitManifest({...analytics,readiness:{...analytics.readiness,closing_odds_pit:'READY'}},pit),/pit_manifest_readiness_mismatch/);
 assert.throws(()=>verifyPitManifest({...analytics,readiness:{...analytics.readiness,retrospective:'PIT_FEATURE'}},pit),/pit_manifest_readiness_mismatch/);
});
