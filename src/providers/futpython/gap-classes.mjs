// t132u FIX-04: what actually happened to a gap, decided from evidence, never from "the gap is gone" alone.
// The ledger's status column keeps its CHECK-constrained values (widening it is a migration: D13, owner approval);
// the real outcome is details.classification with details.classification_evidence.
export const GAP_CLASSES = ['RECOVERED', 'ALREADY_COMPLETE', 'STILL_MISSING', 'PROVIDER_UNAVAILABLE', 'RETRY_PENDING', 'PERMANENTLY_UNAVAILABLE'];

const iso = t => t ? new Date(t).toISOString() : null;

// row: ledger row joined with fpt_dataset_state (last_changed_at, last_http_status, availability, last_error) and the
// last raw snapshot's ingest_complete.
export function classifyGap(row) {
  const ev = {gap_kind: row.gap_kind, detected_at: iso(row.detected_at), last_changed_at: iso(row.last_changed_at),
    last_http_status: row.last_http_status ?? null, availability: row.availability ?? null, ingest_complete: row.ingest_complete ?? null};
  if (row.availability === 'unavailable_404' || row.last_http_status === 404 || row.http_disposition === 'REGRESSION_404') {
    return {classification: 'PERMANENTLY_UNAVAILABLE', evidence: {...ev, rule: 'provider answers 404'}};
  }
  const changedAfterDetection = row.last_changed_at && new Date(row.last_changed_at) > new Date(row.detected_at);
  if (changedAfterDetection) return {classification: 'RECOVERED', evidence: {...ev, rule: 'content changed after detection'}};
  if (row.gap_kind === 'current_season_stale') {
    if (row.last_error || (row.last_http_status >= 500) || row.availability === 'error') {
      return {classification: 'PROVIDER_UNAVAILABLE', evidence: {...ev, rule: 'last fetch failed (not 404)'}};
    }
    // Coverage check: the provider's current file (same SHA) was ingested completely: nothing is missing locally.
    if (row.last_http_status === 200 && row.ingest_complete === true) {
      return {classification: 'ALREADY_COMPLETE', evidence: {...ev, rule: 'HTTP 200, unchanged SHA, last snapshot fully ingested'}};
    }
    return {classification: 'STILL_MISSING', evidence: {...ev, rule: 'unchanged and coverage not proven'}};
  }
  if (row.gap_kind === 'incremental_sync_skipped' || row.gap_kind === 'interrupted_run') {
    return {classification: 'RECOVERED', evidence: {...ev, rule: 'pipeline gap closed by a later good run'}};
  }
  if (row.last_http_status === 200 && row.ingest_complete !== false && !row.last_error) {
    return {classification: 'RECOVERED', evidence: {...ev, rule: 'dataset fetched (HTTP 200) and ingested'}};
  }
  return {classification: 'STILL_MISSING', evidence: {...ev, rule: 'no proof of recovery'}};
}

export const RECLASSIFY_SELECT = `SELECT l.reconciliation_id, l.entity, l.gap_kind, l.status, l.detected_at, l.recovery_finished_at,
    l.recovered_count, l.details, s.last_changed_at, s.last_http_status, s.availability, s.http_disposition, s.last_error,
    r.ingest_complete
  FROM data_reconciliation_ledger l
  LEFT JOIN fpt_dataset_state s ON s.dataset_key = l.entity
  LEFT JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id
  WHERE l.source='futpython' AND l.status='RECOVERED' AND l.gap_kind='current_season_stale'
  ORDER BY l.reconciliation_id`;

// Per-row plan; nothing is written. Only rows whose evidence says "not a real recovery" change.
export function planReclassification(rows, batch) {
  return rows.map(row => {
    const {classification, evidence} = classifyGap(row);
    const before = {status: row.status, recovered_count: row.recovered_count, classification: row.details?.classification ?? null};
    const after = {status: row.status, recovered_count: classification === 'RECOVERED' ? row.recovered_count : 0, classification};
    return {reconciliation_id: row.reconciliation_id, entity: row.entity, before, after, evidence, batch,
      change: before.classification !== after.classification || before.recovered_count !== after.recovered_count};
  });
}

// Each change appends a history entry (batch, before, after, evidence): the revert restores "before" for that batch.
export async function applyReclassification(client, plan, {at = new Date()} = {}) {
  let n = 0;
  for (const p of plan.filter(x => x.change)) {
    const entry = {batch: p.batch, at: new Date(at).toISOString(), before: p.before, after: p.after, evidence: p.evidence};
    const r = await client.query(
      `UPDATE data_reconciliation_ledger SET recovered_count=$2,
         details = details || jsonb_build_object('classification', $3::text, 'classification_evidence', $4::jsonb,
           'history', COALESCE(details->'history', '[]'::jsonb) || jsonb_build_array($5::jsonb))
       WHERE reconciliation_id=$1 AND status='RECOVERED' AND recovered_count=$6
         AND COALESCE(details->>'classification','') = COALESCE($7::text,'')`,
      [p.reconciliation_id, p.after.recovered_count, p.after.classification, JSON.stringify(p.evidence), JSON.stringify(entry),
        p.before.recovered_count, p.before.classification]);
    n += r.rowCount;
  }
  return n;
}

export async function revertReclassification(client, batch) {
  const rows = (await client.query(
    `SELECT reconciliation_id, details FROM data_reconciliation_ledger
     WHERE source='futpython' AND details->'history' @> jsonb_build_array(jsonb_build_object('batch', $1::text))`, [batch])).rows;
  let n = 0;
  for (const row of rows) {
    const history = row.details.history || [];
    const last = history[history.length - 1];
    if (!last || last.batch !== batch) continue; // a later batch touched it: revert that one first
    const rest = history.slice(0, -1);
    const r = await client.query(
      `UPDATE data_reconciliation_ledger SET recovered_count=$2,
         details = (details - 'classification' - 'classification_evidence' - 'history')
           || CASE WHEN $3::text IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('classification', $3::text) END
           || jsonb_build_object('history', $4::jsonb)
       WHERE reconciliation_id=$1`,
      [row.reconciliation_id, last.before.recovered_count, last.before.classification, JSON.stringify(rest)]);
    n += r.rowCount;
  }
  return n;
}
