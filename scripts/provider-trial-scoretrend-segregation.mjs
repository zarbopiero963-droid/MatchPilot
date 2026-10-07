import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { getFreezeBoundary, resolveDatasetOrder, forEachDatasetPage, countDatasetRows } from './lib/provider-trial-final-export.mjs';

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';

async function sha256File(file) {
  const h=crypto.createHash('sha256');
  const s=fs.createReadStream(file);
  s.on('data',chunk=>h.update(chunk));
  await once(s,'end');
  return h.digest('hex');
}


// Keyset pagination on the table's full primary key; never ORDER BY provider with OFFSET (issue #40, point 9).
export async function exportCanonicalWithoutScoretrend(pool,table,outDir=OUT_DIR) {
  const canonicalDir=path.join(outDir,'canonical_without_scoretrend');
  fs.mkdirSync(canonicalDir,{recursive:true});
  const file=path.join(canonicalDir,table+'.ndjson.gz');
  const output=fs.createWriteStream(file,{flags:'w'});
  const gzip=createGzip({level:6});
  gzip.pipe(output);

  const {order}=await resolveDatasetOrder(pool,table);
  const where=['provider <> $1'];
  const params=['scoretrend'];
  const exported=await forEachDatasetPage(pool,{name:table,order,where,params,batchSize:1000},async rows=>{
    for (const row of rows) {
      if (!gzip.write(JSON.stringify(row)+'\n')) await once(gzip,'drain');
    }
  });
  gzip.end();
  await once(output,'close');
  const expected=await countDatasetRows(pool,{name:table,where,params});
  if (exported!==expected) throw new Error('canonical_row_count_mismatch_'+table+'_'+exported+'_'+expected);
  return {
    table,
    rows:exported,
    file:path.relative(outDir,file),
    bytes:fs.statSync(file).size,
    sha256:await sha256File(file),
    order_key:order.map(o=>o.column)
  };
}

export async function auditAndExportScoretrend(pool,{outDir=OUT_DIR}={}) {
  fs.mkdirSync(outDir,{recursive:true});
  const freeze=await getFreezeBoundary(pool);
  if (!freeze) throw new Error('freeze_not_created');

  const raw=await pool.query(`
    SELECT source_type,count(*)::bigint AS n
    FROM provider_trial.records
    WHERE record_id <= $1 AND source_type LIKE 'scoretrend%'
    GROUP BY source_type ORDER BY source_type
  `,[freeze.max_raw_record_id]);

  const canonical={};
  for (const table of ['sports','competitions','coverage','events','odds_observations']) {
    const {rows}=await pool.query('SELECT count(*)::bigint AS n FROM provider_trial.'+table+' WHERE provider=$1',['scoretrend']);
    canonical[table]=Number(rows[0]?.n||0);
  }

  const file=path.join(outDir,'scoretrend_excluded.ndjson.gz');
  const output=fs.createWriteStream(file,{flags:'w'});
  const gzip=createGzip({level:6});
  gzip.pipe(output);

  let cursor=0;
  let exported=0;
  while (true) {
    const {rows}=await pool.query(`
      SELECT *
      FROM provider_trial.records
      WHERE record_id > $1 AND record_id <= $2 AND source_type LIKE 'scoretrend%'
      ORDER BY record_id
      LIMIT 500
    `,[cursor,freeze.max_raw_record_id]);
    if (!rows.length) break;
    for (const row of rows) {
      if (!gzip.write(JSON.stringify(row)+'\n')) await once(gzip,'drain');
    }
    exported += rows.length;
    cursor=Number(rows.at(-1).record_id);
    if (rows.length<500) break;
  }
  gzip.end();
  await once(output,'close');

  const canonicalClean=[];
  for (const table of ['sports','competitions','coverage','events']) {
    canonicalClean.push(await exportCanonicalWithoutScoretrend(pool,table,outDir));
  }

  const result={
    raw_by_source:raw.rows.map(r=>({source_type:r.source_type,records:Number(r.n)})),
    raw_total:raw.rows.reduce((a,r)=>a+Number(r.n),0),
    canonical_scoretrend_rows:canonical,
    canonical_without_scoretrend:canonicalClean,
    export_file:path.basename(file),
    export_rows:exported,
    export_bytes:fs.statSync(file).size,
    export_sha256:await sha256File(file)
  };
  console.log('PROVIDER_TRIAL_SCORETREND_SEGREGATION '+JSON.stringify(result));
  return result;
}
