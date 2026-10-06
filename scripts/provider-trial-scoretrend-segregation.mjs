import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { getFreezeBoundary } from './lib/provider-trial-final-export.mjs';

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';

async function sha256File(file) {
  const h=crypto.createHash('sha256');
  const s=fs.createReadStream(file);
  s.on('data',chunk=>h.update(chunk));
  await once(s,'end');
  return h.digest('hex');
}

export async function auditAndExportScoretrend(pool) {
  fs.mkdirSync(OUT_DIR,{recursive:true});
  const freeze=await getFreezeBoundary(pool);
  if (!freeze) throw new Error('freeze_not_created');

  const raw=await pool.query(`
    SELECT source_type,count(*)::bigint AS n
    FROM provider_trial.records
    WHERE record_id <= $1 AND source_type LIKE 'scoretrend%'
    GROUP BY source_type ORDER BY source_type
  `,[freeze.max_raw_record_id]);

  const canonical={};
  for (const table of ['competitions','coverage','events','odds_observations']) {
    const {rows}=await pool.query('SELECT count(*)::bigint AS n FROM provider_trial.'+table+' WHERE provider=$1',['scoretrend']);
    canonical[table]=Number(rows[0]?.n||0);
  }

  const file=path.join(OUT_DIR,'scoretrend_excluded.ndjson.gz');
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

  const result={
    raw_by_source:raw.rows.map(r=>({source_type:r.source_type,records:Number(r.n)})),
    raw_total:raw.rows.reduce((a,r)=>a+Number(r.n),0),
    canonical_scoretrend_rows:canonical,
    export_file:path.basename(file),
    export_rows:exported,
    export_bytes:fs.statSync(file).size,
    export_sha256:await sha256File(file)
  };
  console.log('PROVIDER_TRIAL_SCORETREND_SEGREGATION '+JSON.stringify(result));
  return result;
}
