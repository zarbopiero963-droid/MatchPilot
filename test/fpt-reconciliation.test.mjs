import test from 'node:test';
import assert from 'node:assert/strict';
import { detectGaps, GAP_KINDS, reconConfig } from '../src/providers/futpython/reconciliation.mjs';
import { reconciliationGate, RECON_SCOPES } from '../src/futpython-certificate.mjs';

const now = new Date('2026-10-05T12:00:00Z');
const config = reconConfig({});
const ds = (key, patch = {}) => ({dataset_key: key, season: key.split('/')[2], availability: 'available',
  last_snapshot_id: 1, ingest_complete: true, last_success_at: '2026-10-05T10:00:00Z', last_synced_at: '2026-10-05T10:00:00Z', ...patch});
const okRun = {run_id: 'r1', kind: 'cron', status: 'complete', mode: 'incremental', started_at: '2026-10-05T10:17:00Z', finished_at: '2026-10-05T10:20:00Z'};

test('every #31 FutPython gap kind is detected once, with its priority and recovery action', () => {
  const gaps = detectGaps({now, config, runs: [okRun,
    {run_id: 'r0', kind: 'cron', status: 'partial', interrupted: true, mode: 'incremental', started_at: '2026-10-05T11:00:00Z'}],
  datasets: [
    ds('a/l/2026'),
    ds('a/l/2026-2027', {last_success_at: '2026-10-03T10:00:00Z'}),
    ds('a/l/2020', {last_snapshot_id: null}),
    ds('a/l/2019', {availability: 'unknown', last_snapshot_id: null, last_synced_at: null, last_success_at: null}),
    ds('a/l/2018', {availability: 'error', last_error: 'HTTP 500'}),
    ds('a/l/2017', {http_disposition: 'REGRESSION_404', availability: 'error', last_error: '404'}),
    ds('a/l/2016', {availability: 'unavailable_404', last_snapshot_id: null}),
    ds('a/l/2015', {last_success_at: '2020-01-01T00:00:00Z'})
  ],
  seasonGaps: [
    {country_slug: 'a', league_slug: 'l', season: '2014', in_catalog: true, missing_available: true},
    {country_slug: 'a', league_slug: 'l', season: '2013', in_catalog: false, missing_available: false},
    {country_slug: 'a', league_slug: 'l', season: '2020', in_catalog: true, missing_available: true}
  ]});
  const byEntity = Object.fromEntries(gaps.map(g => [g.entity, g.gap_kind]));
  assert.deepEqual(byEntity, {
    'a/l/2026-2027': 'current_season_stale',
    'a/l/2020': 'available_without_snapshot',
    'a/l/2019': 'never_attempted',
    'a/l/2018': 'failed_dataset',
    'a/l/2017': 'regression_404',
    'a/l/2014': 'missing_season',
    'a/l/2013': 'season_not_published',
    r0: 'interrupted_run'
  }, 'a fresh current season, a terminal 404 and an old closed season are not gaps; one gap per entity');
  for (const g of gaps) {
    assert.equal(g.priority, GAP_KINDS[g.gap_kind].priority);
    assert.equal(g.action, GAP_KINDS[g.gap_kind].action);
  }
  assert.equal(gaps.find(g => g.gap_kind === 'regression_404').recoverable, false);
});

test('a skipped incremental sync is a P1 catch-up gap; a backfill does not count as incremental', () => {
  const late = detectGaps({now, config, datasets: [], seasonGaps: [], runs: [
    {...okRun, finished_at: '2026-10-05T03:00:00Z', started_at: '2026-10-05T02:59:00Z'},
    {run_id: 'b', kind: 'backfill', status: 'complete', mode: 'backfill', started_at: '2026-10-05T11:00:00Z', finished_at: '2026-10-05T11:30:00Z'}
  ]});
  assert.deepEqual(late.map(g => [g.gap_kind, g.priority, g.action]), [['incremental_sync_skipped', 'P1', 'catchup_sync']]);
  assert.equal(detectGaps({now, config, datasets: [], seasonGaps: [], runs: [okRun]}).length, 0);
  const resumed = detectGaps({now, config, datasets: [], seasonGaps: [], runs: [
    {run_id: 'r0', kind: 'cron', status: 'partial', interrupted: true, mode: 'incremental', started_at: '2026-10-05T04:17:00Z'}, okRun]});
  assert.equal(resumed.length, 0, 'an interrupted run followed by a complete one is resolved');
});

test('reconciliation gate: fresh checkpoints, nothing given up, nothing open for two days', () => {
  const ok = {checkpoint_scopes: RECON_SCOPES.length, checkpoints_age_hours: 0.5, failed: 0, open_older_than_48h: 0};
  assert.equal(reconciliationGate(ok), true);
  assert.equal(reconciliationGate({...ok, checkpoint_scopes: 4}), false);
  assert.equal(reconciliationGate({...ok, checkpoints_age_hours: 3}), false);
  assert.equal(reconciliationGate({...ok, checkpoints_age_hours: null}), false);
  assert.equal(reconciliationGate({...ok, failed: 1}), false);
  assert.equal(reconciliationGate({...ok, open_older_than_48h: 1}), false);
});
