export const TERMINAL_AVAILABILITY = ['available', 'unavailable_404', 'error', 'deprecated', 'removed'];

export const CLASSIFICATION_ROWS_SQL = `
SELECT
  c.dataset_key,
  c.country_slug,
  c.league_slug,
  c.season,
  c.first_seen_at,
  c.last_seen_at,
  s.availability,
  s.unavailable_reason,
  s.last_error,
  s.last_synced_at,
  s.last_snapshot_id,
  s.last_row_count
FROM fpt_catalog c
LEFT JOIN fpt_dataset_state s USING (dataset_key)
WHERE c.active = true
ORDER BY c.dataset_key`;

export const DUPLICATE_CATALOG_SQL = `
SELECT count(*)::int AS n FROM (
  SELECT country_slug, league_slug, season
  FROM fpt_catalog
  WHERE active = true
  GROUP BY 1, 2, 3
  HAVING count(*) > 1
) d`;

function text(value) {
  return String(value ?? '').trim();
}

export function classificationIssues(row = {}) {
  const availability = row.availability ?? 'unknown';
  const issues = [];
  if (!row.first_seen_at) issues.push('missing_first_seen');
  if (!row.last_seen_at) issues.push('missing_last_seen');
  if (!row.last_synced_at) issues.push('missing_last_synced_at');
  if (!TERMINAL_AVAILABILITY.includes(availability)) issues.push('non_terminal_state');
  if (availability === 'available' && row.last_snapshot_id == null) issues.push('available_without_snapshot');
  if (availability === 'unavailable_404') {
    if (!text(row.unavailable_reason)) issues.push('missing_unavailable_reason');
    if (row.last_snapshot_id != null) issues.push('regression_404');
  }
  if (availability === 'error' && !text(row.last_error || row.unavailable_reason)) {
    issues.push('missing_error_reason');
  }
  return issues;
}

export function isClassified(row) {
  return classificationIssues(row).length === 0;
}

function terminalLabel(availability) {
  if (availability === 'available') return 'AVAILABLE';
  if (availability === 'unavailable_404') return 'UNAVAILABLE_404';
  if (availability === 'error') return 'ERROR_REAL';
  if (availability === 'deprecated' || availability === 'removed') return 'DEPRECATED';
  return 'UNCLASSIFIED';
}

function rememberSample(samples, key, row) {
  if (samples[key]) return;
  samples[key] = {
    dataset_key: row.dataset_key,
    availability: row.availability ?? null,
    unavailable_reason: row.unavailable_reason ?? null,
    last_error: row.last_error ?? null,
    has_snapshot: row.last_snapshot_id != null,
    last_row_count: row.last_row_count ?? null,
    first_seen_at: row.first_seen_at ?? null,
    last_seen_at: row.last_seen_at ?? null,
    last_synced_at: row.last_synced_at ?? null
  };
}

export function reconcileClassification(rows = [], {duplicateCountryLeagueSeason = 0} = {}) {
  const raw = {available: 0, unavailable_404: 0, error: 0, deprecated: 0, removed: 0, other: 0};
  const issues = {};
  const samples = {available: null, unavailable_404: null, error: null, regression_404: null};
  let classifiedTotal = 0;
  for (const row of rows) {
    const availability = row.availability ?? 'unknown';
    if (Object.hasOwn(raw, availability)) raw[availability] += 1;
    else raw.other += 1;
    const found = classificationIssues(row);
    if (found.includes('regression_404')) rememberSample(samples, 'regression_404', row);
    if (!found.length) {
      classifiedTotal += 1;
      if (availability === 'available') rememberSample(samples, 'available', row);
      if (availability === 'unavailable_404') rememberSample(samples, 'unavailable_404', row);
      if (availability === 'error') rememberSample(samples, 'error', row);
    }
    for (const issue of found) issues[issue] = (issues[issue] || 0) + 1;
  }
  const catalogTotal = rows.length;
  const unclassified = catalogTotal - classifiedTotal;
  const duplicates = Number(duplicateCountryLeagueSeason) || 0;
  const rawTerminal = raw.available + raw.unavailable_404 + raw.error + raw.deprecated + raw.removed;
  return {
    catalog_total: catalogTotal,
    classified_total: classifiedTotal,
    unclassified,
    duplicate_country_league_season: duplicates,
    raw,
    raw_terminal: rawTerminal,
    raw_equation: rawTerminal === catalogTotal && raw.other === 0,
    issues,
    samples,
    labels: {
      AVAILABLE: raw.available,
      UNAVAILABLE_404: raw.unavailable_404,
      ERROR_REAL: raw.error,
      DEPRECATED: raw.deprecated + raw.removed
    },
    gate: classifiedTotal === catalogTotal && unclassified === 0 && duplicates === 0
  };
}

export async function loadClassification(client) {
  const [rows, duplicates] = await Promise.all([
    client.query(CLASSIFICATION_ROWS_SQL),
    client.query(DUPLICATE_CATALOG_SQL)
  ]);
  return reconcileClassification(rows.rows, {
    duplicateCountryLeagueSeason: duplicates.rows[0]?.n || 0
  });
}

export {terminalLabel};
