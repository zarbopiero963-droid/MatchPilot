import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillResumeDecision, incrementalTargets } from '../src/jobs/futpython-sync.mjs';

const october = new Date('2026-10-05T00:00:00Z');

test('incremental sync considers only the current season', () => {
  const catalog = [
    { datasetKey: 'argentina/liga-profesional/2026', season: '2026' },
    { datasetKey: 'england/premier-league/2026-2027', season: '2026-2027' },
    { datasetKey: 'england/premier-league/2025-2026', season: '2025-2026' },
    { datasetKey: 'world/world-championship/2022', season: '2022' }
  ];
  assert.deepEqual(
    incrementalTargets(catalog, october).map(entry => entry.datasetKey),
    ['argentina/liga-profesional/2026', 'england/premier-league/2026-2027']
  );
});

test('a terminal dataset is not an incremental upstream call', () => {
  for (const availability of ['available', 'unavailable_404', 'deprecated']) {
    assert.equal(backfillResumeDecision({ availability, last_snapshot_id: 4, ingest_complete: true }).skip, true);
  }
  assert.equal(backfillResumeDecision({ availability: 'error', last_snapshot_id: 4, ingest_complete: true }).skip, false);
  assert.equal(backfillResumeDecision({ availability: 'available', last_snapshot_id: 4, ingest_complete: false }).skip, false);
});
