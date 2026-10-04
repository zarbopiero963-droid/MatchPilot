export const CLASSIFICATIONS = ['AVAILABLE', 'UNAVAILABLE_404', 'ERROR_REAL', 'DEPRECATED', 'REMOVED'];

export const CLASSIFICATION_ROWS_SQL = `
SELECT
  c.dataset_key,
  c.active,
  c.route,
  c.first_seen_at,
  c.last_seen_at,
  s.classification,
  s.classification_reason,
  s.http_disposition,
  s.availability,
  s.last_synced_at,
  s.first_success_at,
  s.last_success_at,
  s.last_error_at,
  s.last_http_status,
  s.provider_path,
  s.last_snapshot_id,
  s.last_error,
  r.ingest_complete
FROM fpt_catalog c
LEFT JOIN fpt_dataset_state s USING (dataset_key)
LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id
ORDER BY c.dataset_key`;

export const DUPLICATE_CATALOG_SQL = `
SELECT count(*)::int AS n FROM (
  SELECT country_slug, league_slug, season
  FROM fpt_catalog
  GROUP BY 1, 2, 3
  HAVING count(*) > 1
) d`;

export function outcomePatch(outcome = {}) {
  const providerPath = outcome.providerPath || null;
  const httpStatus = Number.isInteger(outcome.httpStatus) ? outcome.httpStatus : null;
  if (outcome.kind === 'success') {
    return {
      availability: 'available',
      unavailableReason: null,
      lastError: null,
      classification: 'AVAILABLE',
      classificationReason: 'snapshot_committed',
      httpDisposition: null,
      lastHttpStatus: 200,
      providerPath,
      touchSuccess: true,
      touchError: false
    };
  }
  if (outcome.kind === 'initial_404') {
    return {
      availability: 'unavailable_404',
      unavailableReason: 'INITIAL_404',
      lastError: null,
      classification: 'UNAVAILABLE_404',
      classificationReason: 'INITIAL_404',
      httpDisposition: 'INITIAL_404',
      lastHttpStatus: 404,
      providerPath,
      touchSuccess: false,
      touchError: true
    };
  }
  if (outcome.kind === 'regression_404') {
    return {
      availability: 'error',
      unavailableReason: 'REGRESSION_404',
      lastError: outcome.reason || 'REGRESSION_404',
      classification: 'ERROR_REAL',
      classificationReason: 'REGRESSION_404',
      httpDisposition: 'REGRESSION_404',
      lastHttpStatus: 404,
      providerPath,
      touchSuccess: false,
      touchError: true
    };
  }
  if (outcome.kind === 'deprecated') {
    return {
      availability: 'deprecated',
      unavailableReason: outcome.reason || 'deprecated',
      lastError: null,
      classification: 'DEPRECATED',
      classificationReason: outcome.reason || 'deprecated',
      httpDisposition: null,
      lastHttpStatus: httpStatus,
      providerPath,
      touchSuccess: false,
      touchError: false
    };
  }
  if (outcome.kind === 'removed') {
    return {
      availability: 'removed',
      unavailableReason: 'absent_from_catalog',
      lastError: null,
      classification: 'REMOVED',
      classificationReason: 'absent_from_catalog',
      httpDisposition: null,
      lastHttpStatus: httpStatus,
      providerPath,
      touchSuccess: false,
      touchError: false
    };
  }
  return {
    availability: 'error',
    unavailableReason: outcome.reason || 'error',
    lastError: outcome.reason || 'error',
    classification: 'ERROR_REAL',
    classificationReason: outcome.reason || 'error',
    httpDisposition: null,
    lastHttpStatus: httpStatus,
    providerPath,
    touchSuccess: false,
    touchError: true
  };
}

export async function persistOutcome(client, datasetKey, outcome) {
  const patch = outcomePatch(outcome);
  await client.query(
    `UPDATE fpt_dataset_state
     SET availability=$2,
         unavailable_reason=$3,
         last_error=$4,
         last_synced_at=now(),
         classification=$5,
         classification_reason=$6,
         http_disposition=$7,
         last_http_status=$8,
         provider_path=COALESCE($9, provider_path),
         first_success_at=CASE WHEN $10 THEN COALESCE(first_success_at, now()) ELSE first_success_at END,
         last_success_at=CASE WHEN $10 THEN now() ELSE last_success_at END,
         last_error_at=CASE WHEN $11 THEN now() ELSE last_error_at END
     WHERE dataset_key=$1`,
    [
      datasetKey,
      patch.availability,
      patch.unavailableReason,
      patch.lastError,
      patch.classification,
      patch.classificationReason,
      patch.httpDisposition,
      patch.lastHttpStatus,
      patch.providerPath,
      patch.touchSuccess,
      patch.touchError
    ]
  );
}

export async function persistRemovedDatasets(client) {
  await client.query(
    `UPDATE fpt_dataset_state s
     SET availability='removed',
         unavailable_reason='absent_from_catalog',
         last_error=NULL,
         classification='REMOVED',
         classification_reason='absent_from_catalog',
         http_disposition=NULL,
         last_synced_at=COALESCE(s.last_synced_at, now())
     FROM fpt_catalog c
     WHERE c.dataset_key = s.dataset_key
       AND c.active = false
       AND s.classification IS DISTINCT FROM 'REMOVED'`
  );
}

function text(value) {
  return String(value ?? '').trim();
}

export function persistedIssues(row = {}) {
  const classification = row.classification ?? null;
  const issues = [];
  if (!CLASSIFICATIONS.includes(classification)) issues.push('unclassified');
  if (!row.first_seen_at) issues.push('missing_first_seen');
  if (!row.last_seen_at) issues.push('missing_last_seen');
  if (!row.last_synced_at) issues.push('missing_last_synced_at');
  if (!text(row.classification_reason)) issues.push('missing_reason');
  if (classification !== 'REMOVED' && !text(row.provider_path)) issues.push('missing_provider_path');
  if (classification === 'AVAILABLE') {
    if (row.active === false) issues.push('available_inactive');
    if (row.last_snapshot_id == null) issues.push('available_without_snapshot');
    if (row.ingest_complete !== true) issues.push('available_incomplete');
    if (!row.first_success_at) issues.push('missing_first_success_at');
    if (!row.last_success_at) issues.push('missing_last_success_at');
    if (Number(row.last_http_status) !== 200) issues.push('available_http_status');
    if (row.http_disposition) issues.push('available_http_disposition');
  }
  if (classification === 'UNAVAILABLE_404') {
    if (row.http_disposition !== 'INITIAL_404' || row.classification_reason !== 'INITIAL_404') issues.push('not_initial_404');
    if (row.last_snapshot_id != null) issues.push('initial_404_has_snapshot');
    if (Number(row.last_http_status) !== 404) issues.push('initial_404_http_status');
    if (row.active === false) issues.push('initial_404_inactive');
    if (!row.last_error_at) issues.push('missing_last_error_at');
  }
  if (classification === 'ERROR_REAL') {
    if (!row.last_error_at) issues.push('missing_last_error_at');
    if (row.http_disposition === 'REGRESSION_404' || row.classification_reason === 'REGRESSION_404') {
      if (row.http_disposition !== 'REGRESSION_404' || row.classification_reason !== 'REGRESSION_404') issues.push('regression_fields_disagree');
      if (row.last_snapshot_id == null) issues.push('regression_without_snapshot');
      if (Number(row.last_http_status) !== 404) issues.push('regression_http_status');
    }
  }
  if (classification === 'REMOVED') {
    if (row.active !== false) issues.push('removed_still_active');
    if (row.classification_reason !== 'absent_from_catalog') issues.push('removed_reason');
  }
  if (classification === 'DEPRECATED' && row.classification_reason === 'INITIAL_404') issues.push('deprecated_marked_initial_404');
  return issues;
}

function remember(samples, key, row) {
  if (samples[key]) return;
  samples[key] = {
    dataset_key: row.dataset_key,
    classification: row.classification ?? null,
    classification_reason: row.classification_reason ?? null,
    http_disposition: row.http_disposition ?? null,
    active: row.active ?? null,
    last_http_status: row.last_http_status ?? null,
    has_snapshot: row.last_snapshot_id != null,
    first_seen_at: row.first_seen_at ?? null,
    last_seen_at: row.last_seen_at ?? null,
    last_synced_at: row.last_synced_at ?? null,
    first_success_at: row.first_success_at ?? null,
    last_success_at: row.last_success_at ?? null,
    last_error_at: row.last_error_at ?? null
  };
}

export function reconcileClassification(rows = [], {duplicateCatalogKeys = 0} = {}) {
  const labels = {AVAILABLE: 0, UNAVAILABLE_404: 0, ERROR_REAL: 0, DEPRECATED: 0, REMOVED: 0};
  const issues = {};
  const samples = {available: null, initial_404: null, regression_404: null, error: null, removed: null, deprecated: null};
  let classified = 0;
  for (const row of rows) {
    const found = persistedIssues(row);
    if (row.http_disposition === 'REGRESSION_404' || row.classification_reason === 'REGRESSION_404') remember(samples, 'regression_404', row);
    if (!found.length) {
      classified += 1;
      labels[row.classification] += 1;
      if (row.classification === 'AVAILABLE') remember(samples, 'available', row);
      if (row.classification === 'UNAVAILABLE_404') remember(samples, 'initial_404', row);
      if (row.classification === 'ERROR_REAL' && row.http_disposition !== 'REGRESSION_404') remember(samples, 'error', row);
      if (row.classification === 'REMOVED') remember(samples, 'removed', row);
      if (row.classification === 'DEPRECATED') remember(samples, 'deprecated', row);
    }
    for (const issue of found) issues[issue] = (issues[issue] || 0) + 1;
  }
  const catalogTotal = rows.length;
  const unclassified = catalogTotal - classified;
  const duplicates = Number(duplicateCatalogKeys) || 0;
  return {
    catalog_total: catalogTotal,
    classified_total: classified,
    unclassified,
    duplicate_catalog_keys: duplicates,
    labels,
    issues,
    samples,
    gate: classified === catalogTotal && unclassified === 0 && duplicates === 0
  };
}

export async function loadClassification(client) {
  const [rows, duplicates] = await Promise.all([
    client.query(CLASSIFICATION_ROWS_SQL),
    client.query(DUPLICATE_CATALOG_SQL)
  ]);
  return reconcileClassification(rows.rows, {duplicateCatalogKeys: duplicates.rows[0]?.n || 0});
}
