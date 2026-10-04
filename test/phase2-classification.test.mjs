import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classificationIssues,
  isClassified,
  reconcileClassification
} from '../src/providers/futpython/classification.mjs';

const seen = {
  first_seen_at: '2026-10-04T16:17:03.552Z',
  last_seen_at: '2026-10-04T20:12:43.562Z',
  last_synced_at: '2026-10-04T20:12:17.090Z'
};

test('available with snapshot and timestamps is terminal', () => {
  const row = {
    dataset_key: 'australia/a-league/2020-2021',
    availability: 'available',
    last_snapshot_id: 117,
    ...seen
  };
  assert.deepEqual(classificationIssues(row), []);
  assert.equal(isClassified(row), true);
});

test('initial 404 with a reason is terminal and a regression is not', () => {
  const initial = {
    dataset_key: 'argentina/copa-de-la-liga-profesional/2024',
    availability: 'unavailable_404',
    unavailable_reason: 'HTTP 404',
    last_snapshot_id: null,
    ...seen
  };
  assert.equal(isClassified(initial), true);
  const regression = {...initial, last_snapshot_id: 9};
  assert.deepEqual(classificationIssues(regression), ['regression_404']);
  assert.equal(isClassified({...initial, unavailable_reason: '  '}), false);
});

test('error needs a reason and unknown is unclassified', () => {
  assert.equal(isClassified({
    dataset_key: 'x', availability: 'error', last_error: 'timeout', last_snapshot_id: 3, ...seen
  }), true);
  assert.ok(classificationIssues({
    dataset_key: 'x', availability: 'error', last_snapshot_id: null, ...seen
  }).includes('missing_error_reason'));
  assert.ok(classificationIssues({
    dataset_key: 'x', availability: 'unknown', last_snapshot_id: null, ...seen
  }).includes('non_terminal_state'));
  assert.equal(isClassified({
    dataset_key: 'x', availability: 'deprecated', ...seen
  }), true);
  assert.equal(isClassified({
    dataset_key: 'x', availability: 'removed', ...seen
  }), true);
});

test('missing timestamps or an available row without a snapshot are unclassified', () => {
  assert.ok(classificationIssues({
    dataset_key: 'x', availability: 'available', last_snapshot_id: 1,
    first_seen_at: null, last_seen_at: seen.last_seen_at, last_synced_at: seen.last_synced_at
  }).includes('missing_first_seen'));
  assert.ok(classificationIssues({
    dataset_key: 'x', availability: 'available', last_snapshot_id: null, ...seen
  }).includes('available_without_snapshot'));
});

test('gate is classified_total === catalog_total and unclassified = 0, duplicates fail it', () => {
  const rows = [
    {dataset_key: 'a', availability: 'available', last_snapshot_id: 1, ...seen},
    {dataset_key: 'b', availability: 'unavailable_404', unavailable_reason: 'HTTP 404', last_snapshot_id: null, ...seen},
    {dataset_key: 'c', availability: 'error', last_error: 'boom', last_snapshot_id: 2, ...seen},
    {dataset_key: 'd', availability: 'deprecated', ...seen}
  ];
  const ok = reconcileClassification(rows, {duplicateCountryLeagueSeason: 0});
  assert.equal(ok.catalog_total, 4);
  assert.equal(ok.classified_total, 4);
  assert.equal(ok.unclassified, 0);
  assert.equal(ok.gate, true);
  assert.equal(ok.raw_equation, true);
  assert.equal(ok.labels.AVAILABLE, 1);
  assert.equal(ok.labels.UNAVAILABLE_404, 1);
  assert.equal(ok.labels.ERROR_REAL, 1);
  assert.equal(ok.labels.DEPRECATED, 1);
  assert.equal(ok.samples.available.dataset_key, 'a');
  assert.equal(ok.samples.error.dataset_key, 'c');
  assert.equal(ok.samples.regression_404, null);

  const broken = reconcileClassification([
    ...rows,
    {dataset_key: 'e', availability: 'unavailable_404', unavailable_reason: 'HTTP 404', last_snapshot_id: 8, ...seen}
  ]);
  assert.equal(broken.classified_total, 4);
  assert.equal(broken.catalog_total, 5);
  assert.equal(broken.unclassified, 1);
  assert.equal(broken.gate, false);
  assert.equal(broken.issues.regression_404, 1);
  assert.equal(broken.samples.regression_404.dataset_key, 'e');

  const dup = reconcileClassification(rows, {duplicateCountryLeagueSeason: 1});
  assert.equal(dup.classified_total, dup.catalog_total);
  assert.equal(dup.gate, false);
});
