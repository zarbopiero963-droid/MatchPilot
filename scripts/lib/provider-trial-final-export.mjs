import { createGzip } from 'node:zlib';

const IDENT=/^[a-zA-Z_][a-zA-Z0-9_]*$/;
const FREEZE_KEY='final_freeze_v1';

function qid(value) {
  if (!IDENT.test(value)) throw new Error('invalid_identifier');
  return '"' + value.replaceAll('"','""') + '"';
}

// Unique order key of every exported dataset. Tables must match their real PRIMARY KEY (checked at runtime);
// odds_summary is a view without a PK: its key is the GROUP BY of the view.
export const DATASET_ORDER_KEYS=Object.freeze({
  records:['record_id'],
  odds_observations:['observation_id'],
  sports:['provider','sport_id'],
  competitions:['provider','sport_id','country_code','league_id'],
  coverage:['provider','sport_id','country_code','league_id'],
  events:['provider','event_id'],
  reconciliation_state:['key'],
  odds_summary:['provider','event_id','bookmaker','market_key','selection_key','line_value']
});

// Reads the real columns and PRIMARY KEY of a dataset and returns its deterministic order key.
// No fallback: a dataset without a unique key, or whose PK differs from DATASET_ORDER_KEYS, is an error.
export async function resolveDatasetOrder(pool,name) {
  if (!IDENT.test(name)) throw new Error('invalid_identifier');
  const {rows}=await pool.query(`
    SELECT c.column_name,c.is_nullable,c.data_type,k.ordinal_position AS pk_position
    FROM information_schema.columns c
    LEFT JOIN (
      SELECT kcu.column_name,kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema=tc.constraint_schema AND kcu.constraint_name=tc.constraint_name
       AND kcu.table_schema=tc.table_schema AND kcu.table_name=tc.table_name
      WHERE tc.table_schema='provider_trial' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
    ) k ON k.column_name=c.column_name
    WHERE c.table_schema='provider_trial' AND c.table_name=$1
    ORDER BY c.ordinal_position
  `,[name]);
  const columns=new Map(rows.map(r=>[r.column_name,r]));
  const pk=rows.filter(r=>r.pk_position!=null).sort((a,b)=>Number(a.pk_position)-Number(b.pk_position)).map(r=>r.column_name);
  const declared=DATASET_ORDER_KEYS[name]||null;
  let key;
  if (pk.length) {
    if (declared && declared.join(',')!==pk.join(',')) throw new Error('order_key_mismatch_'+name);
    key=pk;
  } else if (declared) {
    key=declared;
  } else {
    throw new Error('no_unique_order_key_'+name);
  }
  const order=key.map(col=>{
    const c=columns.get(col);
    if (!c) throw new Error('order_key_column_missing_'+name+'_'+col);
    const nullable=c.is_nullable==='YES';
    if (nullable && !['text','character varying'].includes(c.data_type)) throw new Error('order_key_nullable_non_text_'+name+'_'+col);
    return {column:col,nullable};
  });
  return {name,columns:rows.map(r=>r.column_name),key,order};
}

// A nullable key column sorts as (col IS NULL, COALESCE(col,'')) so NULL and '' stay distinct and comparable.
function orderExpressions(order) {
  return order.flatMap(({column,nullable})=>nullable
    ? [{sql:'('+qid(column)+' IS NULL)',value:row=>row[column]==null},{sql:'COALESCE('+qid(column)+',\'\')',value:row=>row[column]??''}]
    : [{sql:qid(column),value:row=>row[column]}]);
}

// Keyset pagination on the full unique key: ORDER BY <key> and (key) > (last key) instead of OFFSET,
// so no row can be read twice or skipped between pages. onRows is awaited for every page.
export async function forEachDatasetPage(pool,{name,order,where=[],params=[],batchSize=1000},onRows) {
  if (!IDENT.test(name)) throw new Error('invalid_identifier');
  if (!order?.length) throw new Error('order_key_required_'+name);
  const exprs=orderExpressions(order);
  const orderSql=exprs.map(e=>e.sql).join(', ');
  let cursor=null;
  let total=0;
  while (true) {
    const p=[...params];
    const w=[...where];
    if (cursor) {
      const ph=cursor.map(v=>{ p.push(v); return '$'+p.length; });
      w.push('('+orderSql+') > ('+ph.join(', ')+')');
    }
    const sql=[
      'SELECT * FROM provider_trial.'+qid(name),
      w.length?'WHERE '+w.join(' AND '):'',
      'ORDER BY '+orderSql,
      'LIMIT '+batchSize
    ].filter(Boolean).join(' ');
    const {rows}=await pool.query(sql,p);
    if (!rows.length) break;
    await onRows(rows);
    total += rows.length;
    cursor=exprs.map(e=>e.value(rows.at(-1)));
    if (rows.length<batchSize) break;
  }
  return total;
}

// Same filter, no paging: used to prove the paged export read exactly the rows the DB holds.
export async function countDatasetRows(pool,{name,where=[],params=[]}) {
  if (!IDENT.test(name)) throw new Error('invalid_identifier');
  const {rows}=await pool.query('SELECT count(*)::bigint AS n FROM provider_trial.'+qid(name)+(where.length?' WHERE '+where.join(' AND '):''),params);
  return Number(rows[0]?.n||0);
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
  const {columns,order}=await resolveDatasetOrder(pool,name);
  const colSet=new Set(columns);
  const where=[];
  const params=[];
  if (name==='records') {
    params.push(freeze.max_raw_record_id);
    where.push('record_id <= $'+params.length);
    if (excludeScoretrend) where.push("source_type NOT LIKE 'scoretrend%'");
  } else if (excludeScoretrend && colSet.has('provider')) {
    where.push("provider <> 'scoretrend'");
  }

  res.statusCode=200;
  res.setHeader('content-type','application/x-ndjson');
  res.setHeader('content-encoding','gzip');
  res.setHeader('content-disposition','attachment; filename="'+name+'.ndjson.gz"');
  const gzip=createGzip({level:6});
  gzip.pipe(res);

  await forEachDatasetPage(pool,{name,order,where,params,batchSize:500},rows=>{
    for (const row of rows) gzip.write(JSON.stringify(row)+'\n');
  });
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
