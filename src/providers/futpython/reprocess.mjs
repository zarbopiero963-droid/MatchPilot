import { randomUUID } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../../lib/csv.mjs';
import { LINEAGE_VERSIONS } from './schema.mjs';
import { insertMatchBatch, normalizeMatchRecord, sha256 } from './store.mjs';

// #12 parser / schema version policy. The raw snapshot is the source of truth: a re-parse never rewrites or
// deletes a stored version. A row whose new output differs becomes a new version with the new lineage and the
// snapshot's own acquired_at, so point-in-time reads keep their timeline and the old output stays auditable.

function changedFields(before = {}, after = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) out[key] = {before: before[key] ?? null, after: after[key] ?? null};
  }
  return out;
}

export async function reprocessRaw(client, {
  mode = 'dry_run', parse = text => parseCsv(text), lineage = LINEAGE_VERSIONS, actor, reason,
  datasetKeys = null, diffSample = 200, batchSize = 500
} = {}) {
  if (!['dry_run', 'apply'].includes(mode)) throw new Error('mode must be dry_run or apply');
  if (!actor || !String(actor).trim()) throw new Error('reprocessing needs an actor');
  if (!reason || !String(reason).trim()) throw new Error('reprocessing needs a reason');
  const runId = `fpt-reprocess-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const versionSets = (await client.query(
    `SELECT parser_version, schema_version, transform_version, count(*)::int AS n
     FROM fpt_match_versions GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`)).rows;
  const before = Number((await client.query('SELECT count(*)::bigint AS n FROM fpt_match_versions')).rows[0].n);
  await client.query(
    `INSERT INTO fpt_reprocessing_runs(run_id, mode, parser_version, schema_version, transform_version,
       stored_version_sets, actor, reason, scope, status, versions_before)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb,'running',$10)`,
    [runId, mode, lineage.parserVersion, lineage.schemaVersion, lineage.transformVersion, JSON.stringify(versionSets),
      actor, reason, JSON.stringify({datasets: datasetKeys}), before]);
  const stats = {snapshots: 0, hashMismatch: 0, rows: 0, unchanged: 0, newOutput: 0, inserted: 0, diffs: 0};
  try {
    const snapshots = (await client.query(
      `SELECT r.snapshot_id, r.dataset_key, r.source_kind, r.acquired_at, r.sha256,
              COALESCE(c.country_slug, v.country_slug) AS country_slug, COALESCE(c.league_slug, v.league_slug) AS league_slug,
              COALESCE(c.season, v.season) AS season
       FROM fpt_raw_snapshots r
       LEFT JOIN fpt_catalog c ON c.dataset_key = r.dataset_key
       LEFT JOIN LATERAL (SELECT country_slug, league_slug, season FROM fpt_match_versions x
                          WHERE x.snapshot_id = r.snapshot_id LIMIT 1) v ON true
       WHERE r.ingest_complete AND ($1::text[] IS NULL OR r.dataset_key = ANY($1::text[]))
       ORDER BY r.snapshot_id`, [datasetKeys])).rows;
    let known = null;
    let knownDataset = null;
    for (const snap of snapshots) {
      stats.snapshots++;
      const raw = (await client.query('SELECT payload_gzip FROM fpt_raw_snapshots WHERE snapshot_id=$1', [snap.snapshot_id])).rows[0];
      const text = gunzipSync(raw.payload_gzip).toString('utf8');
      if (sha256(text) !== snap.sha256) {
        // A corrupted raw is never re-parsed into the mirror.
        stats.hashMismatch++;
        continue;
      }
      if (knownDataset !== snap.dataset_key) {
        known = new Map((await client.query(
          `SELECT match_key, payload_sha256, version_id, payload FROM fpt_match_versions WHERE dataset_key=$1
           ORDER BY acquired_at, version_id`, [snap.dataset_key])).rows.map(r => [`${r.match_key}|${r.payload_sha256}`, r]));
        knownDataset = snap.dataset_key;
      }
      const latestByKey = new Map([...known.values()].map(r => [r.match_key, r]));
      const records = parse(text).rows.map(row => normalizeMatchRecord(row, {
        datasetKey: snap.dataset_key, snapshotId: snap.snapshot_id, acquiredAt: new Date(snap.acquired_at),
        countrySlug: snap.country_slug, leagueSlug: snap.league_slug, season: snap.season,
        sourceKind: snap.source_kind, lineage
      }));
      const fresh = [];
      for (const rec of records) {
        stats.rows++;
        const pair = `${rec.match_key}|${rec.payload_sha256}`;
        if (known.has(pair)) { stats.unchanged++; continue; }
        stats.newOutput++;
        fresh.push(rec);
        if (stats.diffs < diffSample) {
          const previous = latestByKey.get(rec.match_key);
          const res = await client.query(
            `INSERT INTO fpt_reprocessing_diffs(run_id, snapshot_id, dataset_key, match_key, previous_version_id, changed_fields)
             VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING`,
            [runId, snap.snapshot_id, snap.dataset_key, rec.match_key, previous?.version_id ?? null,
              JSON.stringify(changedFields(previous?.payload, rec.payload))]);
          stats.diffs += res.rowCount;
        }
      }
      if (mode === 'apply' && fresh.length) {
        for (let i = 0; i < fresh.length; i += batchSize) stats.inserted += await insertMatchBatch(client, fresh.slice(i, i + batchSize));
        for (const rec of fresh) known.set(`${rec.match_key}|${rec.payload_sha256}`, {match_key: rec.match_key, payload: rec.payload});
      }
    }
    const after = Number((await client.query('SELECT count(*)::bigint AS n FROM fpt_match_versions')).rows[0].n);
    await client.query(
      `UPDATE fpt_reprocessing_runs SET status='complete', finished_at=now(), snapshots_scanned=$2, snapshots_hash_mismatch=$3,
         rows_parsed=$4, rows_unchanged=$5, rows_new_output=$6, versions_inserted=$7, versions_after=$8
       WHERE run_id=$1`,
      [runId, stats.snapshots, stats.hashMismatch, stats.rows, stats.unchanged, stats.newOutput, stats.inserted, after]);
    return {runId, mode, lineage, versionsBefore: before, versionsAfter: after, ...stats};
  } catch (error) {
    await client.query(`UPDATE fpt_reprocessing_runs SET status='failed', finished_at=now(), error=$2 WHERE run_id=$1`,
      [runId, String(error?.message || error).slice(0, 300)]).catch(() => {});
    throw error;
  }
}
