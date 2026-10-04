import { gunzipSync } from 'node:zlib';
import { parseCsv } from '../../lib/csv.mjs';
import { first, dateOrNull, matchKey, PROVIDER_MATCH_ID_FIELDS } from './identity.mjs';
import { sha256, insertMissingMatchRows } from './store.mjs';

export function inspectDatasetCsv(text, datasetKey) {
  const parsed = parseCsv(text, {audit: true});
  const issues = [...(parsed.issues || [])];
  if (!String(text || '').trim() || parsed.rows.length === 0) issues.push({code: 'empty_payload'});
  let missingHome = 0;
  let missingAway = 0;
  let missingDate = 0;
  let dateParseFailures = 0;
  const seenKeys = new Set();
  const seenPayload = new Map();
  let duplicateMatchKeys = 0;
  let duplicatePayloads = 0;
  for (const row of parsed.rows) {
    const home = first(row, ['Home', 'home']);
    const away = first(row, ['Away', 'away']);
    const date = first(row, ['Date', 'date']);
    if (!home) missingHome += 1;
    if (!away) missingAway += 1;
    if (!date) missingDate += 1;
    else if (!dateOrNull(date)) dateParseFailures += 1;
    const key = matchKey(row, datasetKey);
    if (seenKeys.has(key)) duplicateMatchKeys += 1;
    seenKeys.add(key);
    const payloadHash = sha256(JSON.stringify(row));
    if (seenPayload.has(payloadHash)) duplicatePayloads += 1;
    seenPayload.set(payloadHash, key);
  }
  if (missingHome || missingAway || missingDate) {
    issues.push({code: 'missing_home_away_date', missingHome, missingAway, missingDate});
  }
  if (dateParseFailures) issues.push({code: 'date_parse_failure', count: dateParseFailures});
  if (duplicateMatchKeys) issues.push({code: 'duplicate_match_key', count: duplicateMatchKeys});
  if (duplicatePayloads) issues.push({code: 'duplicate_payload', count: duplicatePayloads});
  return {
    headers: parsed.headers,
    rows: parsed.rows,
    issues,
    parser_rows: parsed.rows.length,
    distinct_match_keys: seenKeys.size,
    missing_home: missingHome,
    missing_away: missingAway,
    missing_date: missingDate,
    date_parse_failures: dateParseFailures,
    duplicate_match_keys: duplicateMatchKeys,
    duplicate_payloads: duplicatePayloads,
    malformed_csv: issues.filter(item => item.code === 'malformed_csv').length,
    header_row_mismatch: issues.filter(item => item.code === 'header_row_mismatch').length
  };
}

export function selectHardSample(datasets) {
  const rows = [...datasets].filter(row => Number(row.row_count) > 0);
  const byKey = new Map();
  const add = row => { if (row && !byKey.has(row.dataset_key)) byKey.set(row.dataset_key, row); };
  const sorted = [...rows].sort((a, b) => a.row_count - b.row_count || a.dataset_key.localeCompare(b.dataset_key));
  add(sorted[0]);
  add([...rows].sort((a, b) => b.row_count - a.row_count || a.dataset_key.localeCompare(b.dataset_key))[0]);
  const split = rows.filter(row => /^\d{4}-\d{4}$/.test(row.season)).sort((a, b) => a.dataset_key.localeCompare(b.dataset_key));
  const calendar = rows.filter(row => /^\d{4}$/.test(row.season) && Number(row.season) >= 2020).sort((a, b) => a.dataset_key.localeCompare(b.dataset_key));
  const historical = rows.filter(row => /^\d{4}$/.test(row.season) && Number(row.season) < 2020).sort((a, b) => a.dataset_key.localeCompare(b.dataset_key));
  add(split[0]);
  add(calendar[0]);
  add(historical[0]);
  const countries = [];
  for (const row of [...split, ...calendar, ...historical, ...rows].sort((a, b) => a.dataset_key.localeCompare(b.dataset_key))) {
    if (!countries.includes(row.country_slug)) countries.push(row.country_slug);
    if (countries.length === 3) break;
  }
  for (const country of countries) {
    add(rows.filter(row => row.country_slug === country).sort((a, b) => a.dataset_key.localeCompare(b.dataset_key))[0]);
  }
  for (const row of rows.sort((a, b) => a.dataset_key.localeCompare(b.dataset_key))) {
    if (byKey.size >= 10) break;
    add(row);
  }
  return [...byKey.values()];
}

export const PHASE3_SQL = {
  matchKeyCollisions: `SELECT count(*)::int AS n FROM (
    SELECT match_key FROM fpt_match_versions WHERE phase='HISTORICAL'
    GROUP BY match_key
    HAVING count(DISTINCT (COALESCE(home,'') || '|' || COALESCE(away,'') || '|' || COALESCE(match_date::text,''))) > 1
  ) d`,
  providerCollisions: `SELECT count(*)::int AS n FROM (
    SELECT COALESCE(NULLIF(btrim(provider_match_id),''), NULLIF(btrim(payload->>'Match_ID'),'')) AS provider_id
    FROM fpt_match_versions WHERE phase='HISTORICAL'
    GROUP BY 1
    HAVING COALESCE(NULLIF(btrim(provider_match_id),''), NULLIF(btrim(payload->>'Match_ID'),'')) IS NOT NULL
       AND count(DISTINCT (COALESCE(home,'') || '|' || COALESCE(away,'') || '|' || COALESCE(match_date::text,''))) > 1
  ) d`,
  providerSharedIdentity: `SELECT count(*)::int AS n FROM (
    SELECT COALESCE(NULLIF(btrim(provider_match_id),''), NULLIF(btrim(payload->>'Match_ID'),'')) AS provider_id
    FROM fpt_match_versions WHERE phase='HISTORICAL'
    GROUP BY 1
    HAVING COALESCE(NULLIF(btrim(provider_match_id),''), NULLIF(btrim(payload->>'Match_ID'),'')) IS NOT NULL
       AND count(DISTINCT match_key) > 1
       AND count(DISTINCT (COALESCE(home,'') || '|' || COALESCE(away,'') || '|' || COALESCE(match_date::text,''))) = 1
  ) d`,
  duplicatePayload: `SELECT count(*)::int AS n FROM (
    SELECT payload_sha256 FROM fpt_match_versions WHERE phase='HISTORICAL'
    GROUP BY payload_sha256 HAVING count(*) > 1
  ) d`,
  orphanVersions: `SELECT count(*)::int AS n
    FROM fpt_match_versions v
    LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id=v.snapshot_id
    WHERE r.snapshot_id IS NULL`,
  orphanSnapshots: `SELECT count(*)::int AS n
    FROM fpt_raw_snapshots r
    WHERE r.source_kind='dataset' AND r.row_count > 0
      AND NOT EXISTS (SELECT 1 FROM fpt_match_versions v WHERE v.snapshot_id=r.snapshot_id)`,
  rowGaps: `SELECT count(*)::int AS n
    FROM fpt_raw_snapshots r
    WHERE r.source_kind='dataset'
      AND r.row_count <> (SELECT count(*)::int FROM fpt_match_versions v WHERE v.snapshot_id=r.snapshot_id)`,
  missingIdentity: `SELECT
      count(*) FILTER (WHERE home IS NULL OR btrim(home)='')::int AS home,
      count(*) FILTER (WHERE away IS NULL OR btrim(away)='')::int AS away,
      count(*) FILTER (WHERE match_date IS NULL)::int AS match_date
    FROM fpt_match_versions WHERE phase='HISTORICAL'`,
  dateParseFailures: `SELECT count(*)::int AS n
    FROM fpt_match_versions
    WHERE phase='HISTORICAL' AND match_date IS NULL
      AND COALESCE(btrim(payload->>'Date'), btrim(payload->>'date'), '') <> ''`
};

export async function loadPhase3Sql(client) {
  const entries = await Promise.all(Object.entries(PHASE3_SQL).map(async ([name, sql]) => {
    const result = await client.query(sql);
    return [name, result.rows[0]];
  }));
  const raw = Object.fromEntries(entries);
  return {
    match_key_collisions: raw.matchKeyCollisions.n,
    provider_match_id_collisions: raw.providerCollisions.n,
    provider_match_id_shared_same_identity: raw.providerSharedIdentity.n,
    duplicate_payload_hashes: raw.duplicatePayload.n,
    orphan_versions: raw.orphanVersions.n,
    orphan_snapshots: raw.orphanSnapshots.n,
    snapshot_row_gaps: raw.rowGaps.n,
    missing_home: raw.missingIdentity.home,
    missing_away: raw.missingIdentity.away,
    missing_date: raw.missingIdentity.match_date,
    date_parse_failures: raw.dateParseFailures.n
  };
}

export function phase3SqlGate(summary) {
  return summary.match_key_collisions === 0
    && summary.provider_match_id_collisions === 0
    && summary.orphan_versions === 0
    && summary.orphan_snapshots === 0
    && summary.snapshot_row_gaps === 0
    && summary.missing_home === 0
    && summary.missing_away === 0
    && summary.missing_date === 0
    && summary.date_parse_failures === 0;
}

export async function repairShortSnapshots(client) {
  const short = await client.query(
    `SELECT r.snapshot_id, r.dataset_key, r.source_kind, r.acquired_at, r.sha256, r.row_count, r.payload_gzip,
            c.country_slug, c.league_slug, c.season
     FROM fpt_raw_snapshots r
     LEFT JOIN fpt_catalog c USING (dataset_key)
     WHERE r.source_kind='dataset'
       AND r.row_count <> (SELECT count(*)::int FROM fpt_match_versions v WHERE v.snapshot_id=r.snapshot_id)
     ORDER BY r.dataset_key`
  );
  const repaired = [];
  for (const row of short.rows) {
    const text = gunzipSync(row.payload_gzip).toString('utf8');
    const hashOk = sha256(text) === row.sha256;
    const inspected = inspectDatasetCsv(text, row.dataset_key);
    let inserted = 0;
    if (hashOk && inspected.malformed_csv === 0 && inspected.header_row_mismatch === 0) {
      inserted = await insertMissingMatchRows(client, {
        datasetKey: row.dataset_key,
        snapshotId: row.snapshot_id,
        acquiredAt: row.acquired_at,
        countrySlug: row.country_slug,
        leagueSlug: row.league_slug,
        season: row.season,
        sourceKind: row.source_kind,
        rows: inspected.rows
      });
    }
    repaired.push({
      dataset_key: row.dataset_key,
      snapshot_id: Number(row.snapshot_id),
      stored_row_count: row.row_count,
      parser_rows: inspected.parser_rows,
      hash_ok: hashOk,
      inserted,
      malformed_csv: inspected.malformed_csv,
      header_row_mismatch: inspected.header_row_mismatch,
      missing_home: inspected.missing_home,
      missing_away: inspected.missing_away,
      missing_date: inspected.missing_date,
      date_parse_failures: inspected.date_parse_failures
    });
  }
  return repaired;
}

export async function backfillProviderMatchIds(client) {
  const before = await client.query(PHASE3_SQL.providerCollisions);
  if (before.rows[0].n !== 0) return {updated: 0, skipped: 'provider_collision'};
  const updated = await client.query(
    `UPDATE fpt_match_versions
     SET provider_match_id = NULLIF(btrim(payload->>'Match_ID'),'')
     WHERE phase='HISTORICAL'
       AND (provider_match_id IS NULL OR btrim(provider_match_id)='')
       AND COALESCE(btrim(payload->>'Match_ID'),'') <> ''`
  );
  return {updated: updated.rowCount, skipped: null};
}

export async function auditStoredSnapshot(client, datasetKey) {
  const snap = await client.query(
    `SELECT r.snapshot_id, r.dataset_key, r.sha256, r.row_count, r.payload_gzip,
            (SELECT count(*)::int FROM fpt_match_versions v WHERE v.snapshot_id=r.snapshot_id) AS db_rows
     FROM fpt_raw_snapshots r
     WHERE r.dataset_key=$1 AND r.source_kind='dataset'
     ORDER BY r.snapshot_id DESC LIMIT 1`,
    [datasetKey]
  );
  const row = snap.rows[0];
  if (!row) return {dataset_key: datasetKey, missing_snapshot: true};
  const text = gunzipSync(row.payload_gzip).toString('utf8');
  const inspected = inspectDatasetCsv(text, datasetKey);
  return {
    dataset_key: datasetKey,
    snapshot_id: Number(row.snapshot_id),
    hash_ok: sha256(text) === row.sha256,
    stored_row_count: row.row_count,
    parser_rows: inspected.parser_rows,
    db_rows: row.db_rows,
    reconciled: inspected.parser_rows === row.row_count && row.row_count === row.db_rows && sha256(text) === row.sha256,
    malformed_csv: inspected.malformed_csv,
    header_row_mismatch: inspected.header_row_mismatch,
    missing_home: inspected.missing_home,
    missing_away: inspected.missing_away,
    missing_date: inspected.missing_date,
    date_parse_failures: inspected.date_parse_failures,
    duplicate_match_keys: inspected.duplicate_match_keys,
    duplicate_payloads: inspected.duplicate_payloads,
    empty_payload: inspected.parser_rows === 0,
    provider_id_field: inspected.headers.includes('Match_ID') || PROVIDER_MATCH_ID_FIELDS.some(name => inspected.headers.includes(name))
  };
}
