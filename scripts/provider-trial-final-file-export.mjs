import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { getFreezeBoundary, listProviderTrialDatasets } from './lib/provider-trial-final-export.mjs';

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';
const BATCH_SIZE=Math.max(100,Math.min(5000,Number(process.env.PROVIDER_TRIAL_FINAL_EXPORT_BATCH||1000)));

function qid(v) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) throw new Error('invalid_identifier');
  return '"' + v.replaceAll('"','""') + '"';
}

async function sha256File(file) {
  const h=crypto.createHash('sha256');
  const s=fs.createReadStream(file);
  s.on('data',chunk=>h.update(chunk));
  await once(s,'end');
  return h.digest('hex');
}

async function datasetColumns(pool,name) {
  const {rows}=await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='provider_trial' AND table_name=$1
    ORDER BY ordinal_position
  `,[name]);
  return rows.map(r=>r.column_name);
}

async function writeDataset(pool,name,freeze) {
  const columns=await datasetColumns(pool,name);
  const colSet=new Set(columns);
  const file=path.join(OUT_DIR,name+'.ndjson.gz');
  const output=fs.createWriteStream(file,{flags:'w'});
  const gzip=createGzip({level:6});
  gzip.pipe(output);

  let exported=0;
  let cursor=null;
  const idKey=colSet.has('record_id')?'record_id':colSet.has('observation_id')?'observation_id':null;

  while (true) {
    const params=[];
    const where=[];
    if (name==='records') {
      params.push(freeze.max_raw_record_id);
      where.push('record_id <= $'+params.length);
    }
    if (idKey && cursor!==null) {
      params.push(cursor);
      where.push(qid(idKey)+' > $'+params.length);
    }

    const order=idKey ? qid(idKey) :
      colSet.has('observed_at') ? qid('observed_at') :
      colSet.has('updated_at') ? qid('updated_at') :
      columns.length ? qid(columns[0]) : null;

    const sql=[
      'SELECT * FROM provider_trial.'+qid(name),
      where.length?'WHERE '+where.join(' AND '):'',
      order?'ORDER BY '+order:'',
      'LIMIT '+BATCH_SIZE,
      (!idKey && exported>0)?'OFFSET '+exported:''
    ].filter(Boolean).join(' ');

    const {rows}=await pool.query(sql,params);
    if (!rows.length) break;
    for (const row of rows) {
      if (!gzip.write(JSON.stringify(row)+'\n')) await once(gzip,'drain');
    }
    exported += rows.length;
    if (idKey) cursor=rows.at(-1)[idKey];
    if (rows.length<BATCH_SIZE) break;
  }

  gzip.end();
  await once(output,'close');
  const stat=fs.statSync(file);
  return {name,rows:exported,file:path.basename(file),bytes:stat.size,sha256:await sha256File(file)};
}

export async function runFinalFileExport(pool) {
  fs.mkdirSync(OUT_DIR,{recursive:true});
  const freeze=await getFreezeBoundary(pool);
  if (!freeze) throw new Error('freeze_not_created');

  const datasets=await listProviderTrialDatasets(pool);
  const results=[];
  for (const d of datasets) {
    const result=await writeDataset(pool,d.table_name,freeze);
    results.push({...result,type:d.table_type});
    console.log('PROVIDER_TRIAL_EXPORT_DATASET '+JSON.stringify(result));
  }

  const manifest={
    archive_version:'provider-trial-freeze-v1',
    created_at:new Date().toISOString(),
    freeze,
    datasets:results,
    total_files:results.length,
    raw_expected:Number(freeze.total_raw||0),
    raw_exported:results.find(x=>x.name==='records')?.rows||0
  };
  fs.writeFileSync(path.join(OUT_DIR,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const manifestSha=await sha256File(path.join(OUT_DIR,'manifest.json'));
  fs.writeFileSync(path.join(OUT_DIR,'SHA256SUMS.txt'),
    results.map(x=>x.sha256+'  '+x.file).concat([manifestSha+'  manifest.json']).join('\n')+'\n'
  );
  console.log('PROVIDER_TRIAL_EXPORT_COMPLETE '+JSON.stringify({
    out_dir:OUT_DIR,
    total_files:results.length,
    raw_expected:manifest.raw_expected,
    raw_exported:manifest.raw_exported,
    datasets:results.map(x=>({name:x.name,rows:x.rows,bytes:x.bytes,sha256:x.sha256}))
  }));
  return manifest;
}
