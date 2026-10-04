import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomePatch, persistedIssues, reconcileClassification } from '../src/providers/futpython/classification.mjs';

const stamps = {
  active: true,
  first_seen_at: '2026-10-04T16:17:03.552Z',
  last_seen_at: '2026-10-04T20:12:43.562Z',
  last_synced_at: '2026-10-04T20:12:17.090Z',
  provider_path: '/api/download/example'
};

test('persisted outcomes keep INITIAL_404 distinct from REGRESSION_404', () => {
  const initial = outcomePatch({kind: 'initial_404', providerPath: '/api/download/a'});
  assert.equal(initial.classification, 'UNAVAILABLE_404');
  assert.equal(initial.httpDisposition, 'INITIAL_404');
  assert.equal(initial.availability, 'unavailable_404');
  assert.equal(initial.lastHttpStatus, 404);

  const regression = outcomePatch({kind: 'regression_404', providerPath: '/api/download/a'});
  assert.equal(regression.classification, 'ERROR_REAL');
  assert.equal(regression.classificationReason, 'REGRESSION_404');
  assert.equal(regression.httpDisposition, 'REGRESSION_404');
  assert.equal(regression.availability, 'error');
  assert.equal(regression.lastHttpStatus, 404);

  const success = outcomePatch({kind: 'success', providerPath: '/api/download/a'});
  assert.equal(success.classification, 'AVAILABLE');
  assert.equal(success.lastHttpStatus, 200);
  assert.equal(success.touchSuccess, true);

  const removed = outcomePatch({kind: 'removed'});
  assert.equal(removed.classification, 'REMOVED');
  assert.equal(removed.classificationReason, 'absent_from_catalog');
  assert.equal(removed.availability, 'removed');
});

test('a stored row is classified only when the persisted fields agree', () => {
  const available = {
    ...stamps,
    classification: 'AVAILABLE',
    classification_reason: 'snapshot_committed',
    http_disposition: null,
    last_snapshot_id: 117,
    ingest_complete: true,
    first_success_at: stamps.last_synced_at,
    last_success_at: stamps.last_synced_at,
    last_http_status: 200
  };
  assert.deepEqual(persistedIssues(available), []);

  const initial = {
    ...stamps,
    classification: 'UNAVAILABLE_404',
    classification_reason: 'INITIAL_404',
    http_disposition: 'INITIAL_404',
    last_snapshot_id: null,
    last_http_status: 404,
    last_error_at: stamps.last_synced_at
  };
  assert.deepEqual(persistedIssues(initial), []);
  assert.ok(persistedIssues({...initial, last_snapshot_id: 9}).includes('initial_404_has_snapshot'));

  const regression = {
    ...stamps,
    classification: 'ERROR_REAL',
    classification_reason: 'REGRESSION_404',
    http_disposition: 'REGRESSION_404',
    last_snapshot_id: 117,
    last_http_status: 404,
    last_error_at: stamps.last_synced_at
  };
  assert.deepEqual(persistedIssues(regression), []);
  assert.ok(persistedIssues({...regression, last_snapshot_id: null}).includes('regression_without_snapshot'));

  const removed = {
    ...stamps,
    active: false,
    classification: 'REMOVED',
    classification_reason: 'absent_from_catalog',
    provider_path: null
  };
  assert.deepEqual(persistedIssues(removed), []);
  assert.ok(persistedIssues({...removed, active: true}).includes('removed_still_active'));
  assert.ok(persistedIssues({...available, classification: null}).includes('unclassified'));
});

test('gate requires every catalog row, including removed, and rejects duplicate keys', () => {
  const rows = [
    {...stamps, dataset_key: 'a', classification: 'AVAILABLE', classification_reason: 'snapshot_committed', http_disposition: null, last_snapshot_id: 1, ingest_complete: true, first_success_at: stamps.last_synced_at, last_success_at: stamps.last_synced_at, last_http_status: 200},
    {...stamps, dataset_key: 'b', classification: 'UNAVAILABLE_404', classification_reason: 'INITIAL_404', http_disposition: 'INITIAL_404', last_snapshot_id: null, last_http_status: 404, last_error_at: stamps.last_synced_at},
    {...stamps, dataset_key: 'c', classification: 'ERROR_REAL', classification_reason: 'REGRESSION_404', http_disposition: 'REGRESSION_404', last_snapshot_id: 2, last_http_status: 404, last_error_at: stamps.last_synced_at},
    {...stamps, dataset_key: 'd', active: false, classification: 'REMOVED', classification_reason: 'absent_from_catalog', provider_path: null},
    {...stamps, dataset_key: 'e', classification: 'DEPRECATED', classification_reason: 'provider_retired', http_disposition: null}
  ];
  const ok = reconcileClassification(rows, {duplicateCatalogKeys: 0});
  assert.equal(ok.catalog_total, 5);
  assert.equal(ok.classified_total, 5);
  assert.equal(ok.unclassified, 0);
  assert.equal(ok.gate, true);
  assert.equal(ok.labels.AVAILABLE, 1);
  assert.equal(ok.labels.UNAVAILABLE_404, 1);
  assert.equal(ok.labels.ERROR_REAL, 1);
  assert.equal(ok.labels.REMOVED, 1);
  assert.equal(ok.labels.DEPRECATED, 1);
  assert.equal(ok.samples.initial_404.dataset_key, 'b');
  assert.equal(ok.samples.regression_404.dataset_key, 'c');
  assert.equal(ok.samples.error, null);
  const dup = reconcileClassification(rows, {duplicateCatalogKeys: 1});
  assert.equal(dup.gate, false);
  assert.equal(dup.duplicate_catalog_keys, 1);
});
