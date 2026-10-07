import test from 'node:test';import assert from 'node:assert/strict';import {DuckDBInstance} from '@duckdb/node-api';
import {pitViewsSql} from '../scripts/lib/provider-trial-closing-pit.mjs';
import {verifyPitRelations,verifyPitReport} from '../scripts/lib/provider-trial-package-verify.mjs';

async function fixture(rows,work){
 const db=await DuckDBInstance.create(':memory:');const c=await db.connect();try{
 await c.run(`CREATE TABLE canonical_odds_observations(provider VARCHAR,event_id VARCHAR,bookmaker VARCHAR,market_key VARCHAR,selection_key VARCHAR,line_value VARCHAR,observation_id BIGINT,price DOUBLE,provider_time TIMESTAMP,observed_at TIMESTAMP,kickoff_utc TIMESTAMP);
 INSERT INTO canonical_odds_observations VALUES ${rows};
 CREATE VIEW v_odds_timeline AS SELECT *,observed_at acquisition_time,provider_time effective_at FROM canonical_odds_observations;
 CREATE TABLE strategy_field_catalog(source_view VARCHAR,field_name VARCHAR,phases VARCHAR,temporal_semantics VARCHAR);`);
 await c.run(pitViewsSql());await c.run('CREATE TABLE canonical_odds_summary AS SELECT * FROM v_closing_odds_pit');
 await work(c);
 }finally{c.closeSync();db.closeSync();}
}
const row=(id,price,pt,at)=>`('p','e','b','m','s',NULL,${id},${price},TIMESTAMP '2026-10-05 ${pt}',TIMESTAMP '2026-10-05 ${at}',TIMESTAMP '2026-10-05 11:00')`;
for(const [name,rows,mutation] of [
 ['late acquisition AVAILABLE',row(1,2,'10:00','12:00'),"closing_status='AVAILABLE',closing_odds_pit=2,closing_provider_time=TIMESTAMP '2026-10-05 10:00',closing_observed_at=TIMESTAMP '2026-10-05 12:00',candidate_prices=[2],candidate_observation_ids=[1]"],
 ['both clocks after kickoff AVAILABLE',row(1,2,'12:00','12:01'),"closing_status='AVAILABLE',closing_odds_pit=2,closing_provider_time=TIMESTAMP '2026-10-05 12:00',closing_observed_at=TIMESTAMP '2026-10-05 12:01',candidate_prices=[2],candidate_observation_ids=[1]"],
 ['closing price outside valid candidate set',row(1,2,'10:00','10:01'),"closing_odds_pit=99"],
 ['ambiguous valid candidates falsely AVAILABLE',row(1,2,'10:00','10:01')+','+row(2,3,'10:00','10:01'),"closing_status='AVAILABLE',closing_odds_pit=2"],
 ['unique valid candidate falsely UNAVAILABLE',row(1,2,'10:00','10:01'),"closing_status='UNAVAILABLE',closing_odds_pit=NULL"]
])test('independent PIT oracle rejects '+name,async()=>fixture(rows,async c=>{
 await c.run('UPDATE canonical_odds_summary SET '+mutation);
 await c.run('CREATE OR REPLACE VIEW v_closing_odds_pit AS SELECT * FROM canonical_odds_summary');
 await assert.rejects(()=>verifyPitRelations(c),/pit_source_reconciliation_mismatch/);
}));
test('independent PIT oracle checks ranking, not merely candidate membership',async()=>fixture(row(1,2,'10:00','10:01')+','+row(2,3,'10:02','10:03'),async c=>{
 assert.equal((await verifyPitRelations(c)).result,'PASS');
 await c.run("UPDATE canonical_odds_summary SET closing_odds_pit=2,candidate_prices=[2],candidate_observation_ids=[1],closing_provider_time=TIMESTAMP '2026-10-05 10:00',closing_observed_at=TIMESTAMP '2026-10-05 10:01'");
 await c.run('CREATE OR REPLACE VIEW v_closing_odds_pit AS SELECT * FROM canonical_odds_summary');await assert.rejects(()=>verifyPitRelations(c),/pit_source_reconciliation_mismatch/);
}));
test('report.pit must equal independently recalculated PIT',()=>{
 const expected={result:'PASS',mismatch_count:0,closing_rule_version:'closing_odds_pit_v1',statuses:[{closing_status:'UNAVAILABLE',groups:'64446'}]};
 assert.equal(verifyPitReport(expected,expected),true);assert.throws(()=>verifyPitReport({...expected,statuses:[{closing_status:'AVAILABLE',groups:64446}]},expected),/pit_report_recalculation_mismatch/);
});
