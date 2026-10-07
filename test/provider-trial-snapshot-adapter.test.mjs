import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';
import {withReadOnlySnapshot} from '../scripts/provider-trial-regenerate-archive.mjs';
test('snapshot adapter uses one PostgreSQL snapshot across two connections and rejects writes',async t=>{
 const url=process.env.FUTPYTHON_TEST_DATABASE_URL;
 if(!url){if(process.env.CI)throw new Error('CI requires throwaway PostgreSQL');return t.skip('optional local throwaway PostgreSQL not configured');}
 if(!['localhost','127.0.0.1','::1'].includes(new URL(url).hostname))throw new Error('snapshot test requires local throwaway PostgreSQL');
 const config={connectionString:url};const a=new pg.Client(config),b=new pg.Client(config);await a.connect();await b.connect();
 const table='snapshot_adapter_'+process.pid;
 try{
 await b.query('CREATE TABLE '+table+'(id integer PRIMARY KEY)');await b.query('INSERT INTO '+table+' VALUES (1)');
 await withReadOnlySnapshot(a,async pool=>{
 assert.equal((await pool.query('SELECT count(*)::integer n FROM '+table)).rows[0].n,1);
 await b.query('INSERT INTO '+table+' VALUES (2)');
 assert.equal((await pool.query('SELECT count(*)::integer n FROM '+table)).rows[0].n,1);
 const adapter=await pool.connect();assert.equal((await adapter.query('SELECT count(*)::integer n FROM '+table)).rows[0].n,1);adapter.release();
 });
 assert.equal((await a.query('SELECT count(*)::integer n FROM '+table)).rows[0].n,2);
 await assert.rejects(()=>withReadOnlySnapshot(a,pool=>pool.query('INSERT INTO '+table+' VALUES (3)')),e=>e.code==='25006');
 assert.equal((await b.query('SELECT count(*)::integer n FROM '+table)).rows[0].n,2);
 }finally{await b.query('DROP TABLE IF EXISTS '+table);await a.end();await b.end();}
});
