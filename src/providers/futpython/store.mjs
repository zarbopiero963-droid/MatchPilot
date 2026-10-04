import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { profileSchema } from './schema.mjs';
import { persistRemovedDatasets } from './classification.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

function first(row, names) {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

function matchKey(row, datasetKey) {
  const providerId = first(row, ['Id','ID','id','Match_Id','match_id']);
  if (providerId) return `fpt:id:${providerId}`;
  const parts = [
    datasetKey,
    first(row,['Date','date']) || '',
    first(row,['Time','time']) || '',
    first(row,['Home','home']) || '',
    first(row,['Away','away']) || ''
  ];
  return 'fpt:hash:' + sha256(parts.join('|')).slice(0, 32);
}

function dateOrNull(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : null;
}

export function chunkArray(values, size=500) {
  if (!Number.isInteger(size) || size < 1) throw new Error('chunk size must be >= 1');
  const out = [];
  for (let i=0;i<values.length;i+=size) out.push(values.slice(i,i+size));
  return out;
}

export async function upsertCatalog(client, catalog) {
  const before = await client.query('SELECT dataset_key FROM fpt_catalog');
  const known = new Set(before.rows.map(r=>r.dataset_key));
  const newDatasets = catalog.filter(e=>!known.has(e.datasetKey));
  const payload = catalog.map(e=>({
    dataset_key:e.datasetKey,
    country_slug:e.countrySlug,
    league_slug:e.leagueSlug,
    season:e.season,
    route:e.route
  }));

  await client.query('UPDATE fpt_catalog SET active=false');

  if (payload.length) {
    const json=JSON.stringify(payload);
    await client.query(
      `INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route,active)
       SELECT dataset_key,country_slug,league_slug,season,route,true
       FROM jsonb_to_recordset($1::jsonb) AS x(
         dataset_key text,country_slug text,league_slug text,season text,route text
       )
       ON CONFLICT(dataset_key) DO UPDATE SET
         country_slug=excluded.country_slug,
         league_slug=excluded.league_slug,
         season=excluded.season,
         route=excluded.route,
         active=true,
         last_seen_at=now()`,
      [json]
    );
    await client.query(
      `INSERT INTO fpt_dataset_state(dataset_key)
       SELECT dataset_key
       FROM jsonb_to_recordset($1::jsonb) AS x(dataset_key text)
       ON CONFLICT(dataset_key) DO NOTHING`,
      [json]
    );
  }

  await persistRemovedDatasets(client);
  return {newDatasets};
}

async function upsertSchemaBatch(client, schema) {
  if (!schema.length) return;
  const payload=schema.map(f=>({
    field_name:f.field,
    inferred_type:f.inferredType,
    family:f.family,
    rows_seen:f.rowsSeen,
    nonempty_seen:f.nonemptySeen,
    sample_values:f.sampleValues
  }));

  await client.query(
    `INSERT INTO fpt_schema_fields(
       field_name,inferred_type,family,datasets_seen,rows_seen,nonempty_seen,sample_values
     )
     SELECT field_name,inferred_type,family,1,rows_seen,nonempty_seen,sample_values
     FROM jsonb_to_recordset($1::jsonb) AS x(
       field_name text,
       inferred_type text,
       family text,
       rows_seen bigint,
       nonempty_seen bigint,
       sample_values jsonb
     )
     ON CONFLICT(field_name) DO UPDATE SET
       inferred_type = CASE
         WHEN fpt_schema_fields.inferred_type=excluded.inferred_type THEN excluded.inferred_type
         WHEN fpt_schema_fields.inferred_type='unknown' THEN excluded.inferred_type
         WHEN excluded.inferred_type='unknown' THEN fpt_schema_fields.inferred_type
         WHEN fpt_schema_fields.inferred_type IN ('integer','number')
          AND excluded.inferred_type IN ('integer','number') THEN 'number'
         ELSE 'text' END,
       family=CASE
         WHEN fpt_schema_fields.family='unclassified' THEN excluded.family
         ELSE fpt_schema_fields.family END,
       last_seen_at=now(),
       datasets_seen=fpt_schema_fields.datasets_seen+1,
       rows_seen=fpt_schema_fields.rows_seen+excluded.rows_seen,
       nonempty_seen=fpt_schema_fields.nonempty_seen+excluded.nonempty_seen,
       sample_values=(
         SELECT COALESCE(jsonb_agg(v),'[]'::jsonb)
         FROM (
           SELECT DISTINCT value AS v
           FROM jsonb_array_elements(fpt_schema_fields.sample_values || excluded.sample_values)
           LIMIT 5
         ) q
       )`,
    [JSON.stringify(payload)]
  );
}

function normalizeMatchRecord(row,{
  datasetKey,snapshotId,acquiredAt,countrySlug,leagueSlug,season,sourceKind
}) {
  const payloadJson=JSON.stringify(row);
  return {
    match_key:matchKey(row,datasetKey),
    provider_match_id:first(row,['Id','ID','id','Match_Id','match_id']),
    dataset_key:datasetKey,
    snapshot_id:Number(snapshotId),
    acquired_at:acquiredAt.toISOString(),
    country_slug:countrySlug,
    league_slug:leagueSlug,
    season,
    match_date:dateOrNull(first(row,['Date','date'])),
    match_time:first(row,['Time','time']),
    home:first(row,['Home','home']),
    away:first(row,['Away','away']),
    phase:sourceKind==='dataset'?'HISTORICAL':'PREMATCH',
    payload:row,
    payload_sha256:sha256(payloadJson)
  };
}

async function insertMatchBatch(client, records) {
  if (!records.length) return 0;
  const result=await client.query(
    `INSERT INTO fpt_match_versions(
      match_key,provider_match_id,dataset_key,snapshot_id,acquired_at,country_slug,league_slug,season,
      match_date,match_time,home,away,phase,payload,payload_sha256
     )
     SELECT
       match_key,provider_match_id,dataset_key,snapshot_id,acquired_at,country_slug,league_slug,season,
       match_date,match_time,home,away,phase,payload,payload_sha256
     FROM jsonb_to_recordset($1::jsonb) AS x(
       match_key text,
       provider_match_id text,
       dataset_key text,
       snapshot_id bigint,
       acquired_at timestamptz,
       country_slug text,
       league_slug text,
       season text,
       match_date date,
       match_time text,
       home text,
       away text,
       phase text,
       payload jsonb,
       payload_sha256 text
     )
     ON CONFLICT(match_key,payload_sha256) DO NOTHING`,
    [JSON.stringify(records)]
  );
  return result.rowCount;
}

async function withOwnTransaction(client, fn) {
  const assigned = await client.query('SELECT txid_current_if_assigned() AS tx');
  const owns = assigned.rows[0]?.tx == null;
  if (owns) await client.query('BEGIN');
  try {
    const result = await fn();
    if (owns) await client.query('COMMIT');
    return result;
  } catch (error) {
    if (owns) {
      try { await client.query('ROLLBACK'); } catch { /* connection may already be gone */ }
    }
    throw error;
  }
}

export async function storeDataset(client, {
  datasetKey, sourceKind, providerPath, countrySlug=null, leagueSlug=null, season=null,
  text, headers, rows, acquiredAt = new Date()
}, hooks = {}) {
  return withOwnTransaction(client, () => storeDatasetInTransaction(client, {
    datasetKey, sourceKind, providerPath, countrySlug, leagueSlug, season,
    text, headers, rows, acquiredAt
  }, hooks));
}

async function storeDatasetInTransaction(client, {
  datasetKey, sourceKind, providerPath, countrySlug=null, leagueSlug=null, season=null,
  text, headers, rows, acquiredAt = new Date()
}, hooks = {}) {
  const hash = sha256(text);
  const existing = await client.query(
    'SELECT snapshot_id, ingest_complete FROM fpt_raw_snapshots WHERE dataset_key=$1 AND sha256=$2',
    [datasetKey, hash]
  );
  if (existing.rowCount && existing.rows[0].ingest_complete) {
    if (sourceKind==='dataset') {
      await client.query(
        `UPDATE fpt_dataset_state
         SET last_sha256=$2,last_snapshot_id=$3,last_row_count=$4,last_synced_at=now(),last_error=null
         WHERE dataset_key=$1`,
        [datasetKey,hash,existing.rows[0].snapshot_id,rows.length]
      );
    }
    return {
      changed:false,complete:true,snapshotId:existing.rows[0].snapshot_id,
      rowsInserted:0,fields:headers.length,newFields:[]
    };
  }

  let snapshotId;
  let changed = false;
  if (existing.rowCount) {
    snapshotId = existing.rows[0].snapshot_id;
  } else {

  const snapshot = await client.query(
    `INSERT INTO fpt_raw_snapshots(
       dataset_key,source_kind,provider_path,acquired_at,sha256,row_count,headers,payload_gzip
     ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     RETURNING snapshot_id`,
    [
      datasetKey,sourceKind,providerPath,acquiredAt,hash,rows.length,
      JSON.stringify(headers),gzipSync(Buffer.from(text,'utf8'))
    ]
  );
    snapshotId = snapshot.rows[0].snapshot_id;
    changed = true;
    if (hooks.afterSnapshotInserted) await hooks.afterSnapshotInserted({client, snapshotId});
  }

  const schema = profileSchema(headers, rows);
  const knownFieldsResult = headers.length
    ? await client.query(
        'SELECT field_name FROM fpt_schema_fields WHERE field_name = ANY($1::text[])',
        [headers]
      )
    : {rows:[]};
  const knownFields = new Set(knownFieldsResult.rows.map(r=>r.field_name));
  const newFields = headers.filter(h=>!knownFields.has(h));
  await upsertSchemaBatch(client,schema);

  const records=rows.map(row=>normalizeMatchRecord(row,{
    datasetKey,snapshotId,acquiredAt,countrySlug,leagueSlug,season,sourceKind
  }));
  let inserted=0;
  const batchSize=Number(process.env.FUTPYTHON_DB_BATCH_SIZE||500);
  for (const batch of chunkArray(records,batchSize)) {
    inserted += await insertMatchBatch(client,batch);
  }

  await client.query(
    'UPDATE fpt_raw_snapshots SET ingest_complete=true WHERE snapshot_id=$1',
    [snapshotId]
  );

  if (sourceKind === 'dataset') {
    await client.query(
      `UPDATE fpt_dataset_state
       SET last_sha256=$2,last_snapshot_id=$3,last_row_count=$4,
           last_synced_at=now(),last_changed_at=CASE WHEN $5 THEN now() ELSE last_changed_at END,
           last_error=null
       WHERE dataset_key=$1`,
      [datasetKey,hash,snapshotId,rows.length,changed]
    );
  }

  return {changed,complete:true,snapshotId,rowsInserted:inserted,fields:headers.length,newFields};
}
