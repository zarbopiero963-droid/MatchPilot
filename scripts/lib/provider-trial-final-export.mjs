import { createGzip } from 'node:zlib';

const IDENT=/^[a-zA-Z_][a-zA-Z0-9_]*$/;
const FREEZE_KEY='final_freeze_v1';

function qid(value) {
  if (!IDENT.test(value)) throw new Error('invalid_identifier');
  return '"' + value.replaceAll('"','""') + '"';
}

export async function listProviderTrialDatasets(pool) {
  const {rows}=await pool.query(`
    SELECT table_name,
           CASE WHEN table_type='VIEW' THEN 'VIEW' ELSE 'BASE TABLE' END AS table_type
    FROM information_schema.tables
    WHERE table_schema='provider_trial'
    ORDER BY table_name
  `);
  return rows.filter(r=>IDENT.test(r.table_name));
}

export async function createOrReadFreezeBoundary(pool, metadata={}) {
  const existing=await pool.query(
    "SELECT value,updated_at FROM provider_trial.reconciliation_state WHERE key=$1",
    [FREEZE_KEY]
  );
  if (existing.rows[0]) return existing.rows[0].value;

  const [raw,bySource,datasets]=await Promise.all([
    pool.query(`
      SELECT count(*)::bigint AS total_raw,
             min(record_id)::bigint AS min_raw_record_id,
             max(record_id)::bigint AS max_raw_record_id,
             min(observed_at) AS first_observed_at,
             max(observed_at) AS last_observed_at
      FROM provider_trial.records
    `),
    pool.query(`
      SELECT source_type,count(*)::bigint AS records,
             min(observed_at) AS first_observed_at,
             max(observed_at) AS last_observed_at
      FROM provider_trial.records
      GROUP BY source_type ORDER BY source_type
    `),
    listProviderTrialDatasets(pool)
  ]);
  const r=raw.rows[0]||{};
  const value={
    version:1,
    freeze_at_utc:new Date().toISOString(),
    max_raw_record_id:Number(r.max_raw_record_id||0),
    min_raw_record_id:Number(r.min_raw_record_id||0),
    total_raw:Number(r.total_raw||0),
    first_observed_at:r.first_observed_at||null,
    last_observed_at:r.last_observed_at||null,
    source_counts:bySource.rows,
    datasets,
    scoretrend_excluded_from_canonical:true,
    ...metadata
  };
  await pool.query(`
    INSERT INTO provider_trial.reconciliation_state(key,value,updated_at)
    VALUES($1,$2::jsonb,now())
    ON CONFLICT(key) DO NOTHING
  `,[FREEZE_KEY,JSON.stringify(value)]);
  const reread=await pool.query(
    "SELECT value FROM provider_trial.reconciliation_state WHERE key=$1",
    [FREEZE_KEY]
  );
  return reread.rows[0]?.value || value;
}

export async function getFreezeBoundary(pool) {
  const {rows}=await pool.query(
    "SELECT value FROM provider_trial.reconciliation_state WHERE key=$1",
    [FREEZE_KEY]
  );
  return rows[0]?.value || null;
}

export async function exportMetadata(pool) {
  const freeze=await getFreezeBoundary(pool);
  const datasets=await listProviderTrialDatasets(pool);
  const counts=[];
  for (const d of datasets) {
    const table=qid(d.table_name);
    const filter=d.table_name==='records' && freeze?.max_raw_record_id
      ? ' WHERE record_id <= $1'
      : '';
    const params=filter ? [freeze.max_raw_record_id] : [];
    const {rows}=await pool.query('SELECT count(*)::bigint AS n FROM provider_trial.'+table+filter,params);
    counts.push({name:d.table_name,type:d.table_type,rows:Number(rows[0]?.n||0)});
  }
  return {freeze,datasets:counts};
}

export async function streamDatasetNdjsonGzip(pool,res,name,{excludeScoretrend=false}={}) {
  const freeze=await getFreezeBoundary(pool);
  if (!freeze) throw new Error('freeze_not_created');
  const datasets=await listProviderTrialDatasets(pool);
  if (!datasets.some(d=>d.table_name===name)) throw new Error('dataset_not_allowed');
  const table=qid(name);
  const columns=await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='provider_trial' AND table_name=$1
    ORDER BY ordinal_position
  `,[name]);
  const colSet=new Set(columns.rows.map(r=>r.column_name));
  const where=[];
  const params=[];
  if (name==='records') {
    params.push(freeze.max_raw_record_id);
    where.push('record_id <= $'+params.length);
    if (excludeScoretrend) where.push("source_type NOT LIKE 'scoretrend%'");
  } else if (excludeScoretrend && colSet.has('provider')) {
    where.push("provider <> 'scoretrend'");
  }
  const order=colSet.has('record_id')?'record_id':
    colSet.has('observation_id')?'observation_id':
    colSet.has('observed_at')?'observed_at':
    colSet.has('updated_at')?'updated_at':
    null;

  res.statusCode=200;
  res.setHeader('content-type','application/x-ndjson');
  res.setHeader('content-encoding','gzip');
  res.setHeader('content-disposition','attachment; filename="'+name+'.ndjson.gz"');
  const gzip=createGzip({level:6});
  gzip.pipe(res);

  let offset=0;
  const batchSize=500;
  while (true) {
    const sql=[
      'SELECT * FROM provider_trial.'+table,
      where.length?'WHERE '+where.join(' AND '):'',
      order?'ORDER BY '+qid(order):'',
      'LIMIT '+batchSize+' OFFSET '+offset
    ].filter(Boolean).join(' ');
    const {rows}=await pool.query(sql,params);
    if (!rows.length) break;
    for (const row of rows) gzip.write(JSON.stringify(row)+'\n');
    offset += rows.length;
    if (rows.length < batchSize) break;
  }
  gzip.end();
}

export function isSafeExportDatasetName(name) {
  return IDENT.test(name||'');
}


export function isExportAuthorized(headers={}, token='') {
  if (!token) return false;
  const expectedBasic='Basic ' + Buffer.from('export:' + token).toString('base64');
  return headers['x-provider-trial-export-token']===token || headers.authorization===expectedBasic;
}
