import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cadenceGaps,
  coverageStatus,
  futureSeasonRow,
  historicalComplete,
  phase6Gate
} from '../src/providers/futpython/seasons.mjs';

test('a 404 is never complete and an unknown expected count stays available', () => {
  assert.equal(coverageStatus({ classification: 'UNAVAILABLE_404', matchCount: 0, expectedMatchCount: null }), 'UNAVAILABLE_404');
  assert.equal(coverageStatus({ classification: 'AVAILABLE', matchCount: 380, expectedMatchCount: null }), 'AVAILABLE');
  assert.equal(coverageStatus({ classification: 'AVAILABLE', matchCount: 380, expectedMatchCount: 380 }), 'COMPLETE');
  assert.equal(coverageStatus({ classification: 'AVAILABLE', matchCount: 100, expectedMatchCount: 380 }), 'PARTIAL');
  assert.equal(historicalComplete({ matchCount: 380, expectedMatchCount: null }), false);
});

test('annual holes are gaps and tournament cadences are not filled in', () => {
  const annual = cadenceGaps([
    { country_slug: 'england', league_slug: 'premier-league', season: '2019-2020' },
    { country_slug: 'england', league_slug: 'premier-league', season: '2020-2021' },
    { country_slug: 'england', league_slug: 'premier-league', season: '2022-2023' }
  ]);
  assert.deepEqual(annual.map(row => row.season), ['2021-2022']);
  assert.equal(annual[0].missing_available, false);
  const worldCup = ['2002', '2006', '2010', '2014', '2018', '2022', '2026']
    .map(season => ({ country_slug: 'world', league_slug: 'world-championship', season }));
  assert.deepEqual(cadenceGaps(worldCup), []);
  const copa = ['2001', '2004', '2007', '2011', '2015', '2016', '2019', '2021']
    .map(season => ({ country_slug: 'south-america', league_slug: 'copa-america', season }));
  assert.deepEqual(cadenceGaps(copa), []);
});

test('a future season and a future championship are not complete', () => {
  const season = futureSeasonRow({ country: 'argentina', league: 'liga-profesional', season: '2027' });
  const championship = futureSeasonRow({
    country: 'world', league: 'new-championship', season: '2030', championship: true
  });
  assert.equal(season.coverage_status, 'CANDIDATE');
  assert.equal(championship.coverage_status, 'DISCOVERED');
  assert.equal(season.historical_complete, false);
  assert.equal(championship.historical_complete, false);
  assert.equal(season.expected_match_count, null);
});

test('phase6 gate requires zero missing available seasons and a stable past timestamp', () => {
  const pit = {
    contract: 'fpt-schema-4',
    t0_matches_snapshot: true,
    argentina_t0: 405,
    total_t0: 405,
    total_t0_repeat: 405,
    total_t1: 1000,
    later_dataset_t0: 0,
    later_dataset_t1: 10,
    wrong_contract_t0: 0
  };
  const row = {
    registry_rows: 1027,
    missing_available_seasons: 0,
    historical_complete: 0,
    expected_null: 1027,
    unavailable_marked_complete: 0,
    status_counts: { AVAILABLE: 615, UNAVAILABLE_404: 412 },
    evidence: { pit }
  };
  assert.equal(phase6Gate(row), true);
  assert.equal(phase6Gate({ ...row, missing_available_seasons: 1 }), false);
  assert.equal(phase6Gate({ ...row, evidence: { pit: { ...pit, total_t0_repeat: 404 } } }), false);
  assert.equal(phase6Gate({ ...row, status_counts: { COMPLETE: 412 } }), false);
});
