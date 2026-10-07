import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createGzip } from 'node:zlib';
import { once } from 'node:events';
import { getFreezeBoundary, listProviderTrialDatasets, resolveDatasetOrder, forEachDatasetPage, countDatasetRows } from './lib/provider-trial-final-export.mjs';

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';
const BATCH_SIZE=Math.max(100,Math.min(5000,Number(process.env.PROVIDER_TRIAL_FINAL_EXPORT_BATCH||1000)));

async function sha256File(file) {
  const h=crypto.createHash('sha256');
  const s=fs.createReadStream(file);
  s.on('data',chunk=>h.update(chunk));
  await once(s,'end');
  return h.digest('hex');
}

// Every dataset is read with keyset pagination on its full unique key (see resolveDatasetOrder):
// ORDER BY a non-unique column with LIMIT/OFFSET can return a row twice and skip another (issue #40, point 9).
export async function writeDataset(pool,name,freeze,outDir=OUT_DIR) {
  const {order}=await resolveDatasetOrder(pool,name);
  const file=path.join(outDir,name+'.ndjson.gz');
  const output=fs.createWriteStream(file,{flags:'w'});
  const gzip=createGzip({level:6});
  gzip.pipe(output);

  const where=[];
  const params=[];
  if (name==='records') {
    params.push(freeze.max_raw_record_id);
    where.push('record_id <= $'+params.length);
  }
  const exported=await forEachDatasetPage(pool,{name,order,where,params,batchSize:BATCH_SIZE},async rows=>{
    for (const row of rows) {
      if (!gzip.write(JSON.stringify(row)+'\n')) await once(gzip,'drain');
    }
  });

  gzip.end();
  await once(output,'close');
  const expected=await countDatasetRows(pool,{name,where,params});
  if (exported!==expected) throw new Error('export_row_count_mismatch_'+name+'_'+exported+'_'+expected);
  const stat=fs.statSync(file);
  return {name,rows:exported,file:path.basename(file),bytes:stat.size,sha256:await sha256File(file),order_key:order.map(o=>o.column)};
}

export async function runFinalFileExport(pool,{outDir=OUT_DIR}={}) {
  fs.mkdirSync(outDir,{recursive:true});
  const freeze=await getFreezeBoundary(pool);
  if (!freeze) throw new Error('freeze_not_created');

  const datasets=await listProviderTrialDatasets(pool);
  const results=[];
  for (const d of datasets) {
    const result=await writeDataset(pool,d.table_name,freeze,outDir);
    results.push({...result,type:d.table_type});
    console.log('PROVIDER_TRIAL_EXPORT_DATASET '+JSON.stringify(result));
  }

  const manifest={
    ...(pool.datasetSources?.odds_summary?{odds_summary_semantics:"derived closing_odds_pit_v1; frozen DB view unchanged; opening/latest audit only; change_open_close unavailable"}:{}),
    archive_version:'provider-trial-freeze-v1',
    created_at:new Date().toISOString(),
    freeze,
    datasets:results,
    total_files:results.length,
    raw_expected:Number(freeze.total_raw||0),
    raw_exported:results.find(x=>x.name==='records')?.rows||0
  };
  fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const manifestSha=await sha256File(path.join(outDir,'manifest.json'));
  fs.writeFileSync(path.join(outDir,'SHA256SUMS.txt'),
    results.map(x=>x.sha256+'  '+x.file).concat([manifestSha+'  manifest.json']).join('\n')+'\n'
  );
  console.log('PROVIDER_TRIAL_EXPORT_COMPLETE '+JSON.stringify({
    out_dir:outDir,
    total_files:results.length,
    raw_expected:manifest.raw_expected,
    raw_exported:manifest.raw_exported,
    datasets:results.map(x=>({name:x.name,rows:x.rows,bytes:x.bytes,sha256:x.sha256}))
  }));
  return manifest;
}

