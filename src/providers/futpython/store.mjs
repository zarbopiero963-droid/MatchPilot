import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { profileSchema } from './schema.mjs';

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

export async function upsertCatalog(client, catalog) {
  await client.query('UPDATE fpt_catalog SET active=false');
  for (const e of catalog) {
    await client.query(
      `INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route,active)
       VALUES($1,$2,$3,$4,$5,true)
       ON CONFLICT(dataset_key) DO UPDATE SET
         country_slug=excluded.country_slug,
         league_slug=excluded.league_slug,
         season=excluded.season,
         route=excluded.route,
         active=true,
         last_seen_at=now()`,
      [e.datasetKey,e.countrySlug,e.leagueSlug,e.season,e.route]
    );
    await client.query(
      `INSERT INTO fpt_dataset_state(dataset_key) VALUES($1)
       ON CONFLICT(dataset_key) DO NOTHING`, [e.datasetKey]
    );
  }
}

export async function storeDataset(client, {
  datasetKey, sourceKind, providerPath, countrySlug=null, leagueSlug=null, season=null,
  text, headers, rows, acquiredAt = new Date()
}) {
  const hash = sha256(text);
  const existing = await client.query(
    'SELECT snapshot_id FROM fpt_raw_snapshots WHERE dataset_key=$1 AND sha256=$2',
    [datasetKey, hash]
  );
  if (existing.rowCount) {
    await client.query(
      `UPDATE fpt_dataset_state
       SET last_sha256=$2,last_snapshot_id=$3,last_row_count=$4,last_synced_at=now(),last_error=null
       WHERE dataset_key=$1`,
      [datasetKey, hash, existing.rows[0].snapshot_id, rows.length]
    );
    return { changed:false, snapshotId:existing.rows[0].snapshot_id, rowsInserted:0, fields:headers.length };
  }

  const snapshot = await client.query(
    `INSERT INTO fpt_raw_snapshots(dataset_key,source_kind,provider_path,acquired_at,sha256,row_count,headers,payload_gzip)
     VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     RETURNING snapshot_id`,
    [datasetKey,sourceKind,providerPath,acquiredAt,hash,rows.length,JSON.stringify(headers),gzipSync(Buffer.from(text,'utf8'))]
  );
  const snapshotId = snapshot.rows[0].snapshot_id;

  const schema = profileSchema(headers, rows);
  for (const f of schema) {
    await client.query(
      `INSERT INTO fpt_schema_fields(field_name,inferred_type,family,datasets_seen,rows_seen,nonempty_seen,sample_values)
       VALUES($1,$2,$3,1,$4,$5,$6::jsonb)
       ON CONFLICT(field_name) DO UPDATE SET
         inferred_type = CASE
           WHEN fpt_schema_fields.inferred_type=excluded.inferred_type THEN excluded.inferred_type
           WHEN fpt_schema_fields.inferred_type='unknown' THEN excluded.inferred_type
           WHEN excluded.inferred_type='unknown' THEN fpt_schema_fields.inferred_type
           WHEN fpt_schema_fields.inferred_type IN ('integer','number') AND excluded.inferred_type IN ('integer','number') THEN 'number'
           ELSE 'text' END,
         family=CASE WHEN fpt_schema_fields.family='unclassified' THEN excluded.family ELSE fpt_schema_fields.family END,
         last_seen_at=now(),
         datasets_seen=fpt_schema_fields.datasets_seen+1,
         rows_seen=fpt_schema_fields.rows_seen+excluded.rows_seen,
         nonempty_seen=fpt_schema_fields.nonempty_seen+excluded.nonempty_seen,
         sample_values=(
           SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
           FROM (
             SELECT DISTINCT x
             FROM jsonb_array_elements(fpt_schema_fields.sample_values || excluded.sample_values) AS t(x)
             LIMIT 5
           ) s
         )`,
      [f.field,f.inferredType,f.family,f.rowsSeen,f.nonemptySeen,JSON.stringify(f.sampleValues)]
    );
  }

  let inserted = 0;
  for (const row of rows) {
    const payloadJson = JSON.stringify(row);
    const payloadHash = sha256(payloadJson);
    const mk = matchKey(row,datasetKey);
    const providerId = first(row,['Id','ID','id','Match_Id','match_id']);
    const result = await client.query(
      `INSERT INTO fpt_match_versions(
        match_key,provider_match_id,dataset_key,snapshot_id,acquired_at,country_slug,league_slug,season,
        match_date,match_time,home,away,phase,payload,payload_sha256
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PREMATCH',$13::jsonb,$14)
       ON CONFLICT(match_key,payload_sha256) DO NOTHING`,
      [
        mk,providerId,datasetKey,snapshotId,acquiredAt,countrySlug,leagueSlug,season,
        dateOrNull(first(row,['Date','date'])),first(row,['Time','time']),
        first(row,['Home','home']),first(row,['Away','away']),payloadJson,payloadHash
      ]
    );
    inserted += result.rowCount;
  }

  if (sourceKind === 'dataset') {
    await client.query(
      `UPDATE fpt_dataset_state
       SET last_sha256=$2,last_snapshot_id=$3,last_row_count=$4,last_synced_at=now(),last_changed_at=now(),last_error=null
       WHERE dataset_key=$1`,
      [datasetKey,hash,snapshotId,rows.length]
    );
  }

  return { changed:true, snapshotId, rowsInserted:inserted, fields:headers.length };
}
