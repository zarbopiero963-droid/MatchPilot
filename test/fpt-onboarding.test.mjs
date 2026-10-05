import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSteps, seasonWindow, ONBOARDING_STEPS } from '../src/providers/futpython/onboarding.mjs';
import { onboardingGate } from '../src/futpython-certificate.mjs';

const full = {
  dataset_key: 'gamma/cup/2024', season: '2024', in_catalog: true, route: '/api/download/gamma/cup/2024',
  internal_competition_id: 'fpt:competition:x', has_state: true, league_seasons: ['2023', '2024'], seasons_without_state: 0,
  availability: 'available', last_snapshot_id: 7, ingest_complete: true, snapshot_rows: 2,
  headers: ['Date', 'Home', 'Away'], unregistered_fields: [], unclassified_fields: [],
  coverage: {Date: {ratio: 1}, Home: {ratio: 1}, Away: {ratio: 1}},
  hard: {matches: 2, no_date: 0, out_of_season: 0, unresolved_teams: 0, duplicate_keys: 0}
};

test('the steps are the #12 onboarding flow, in order', () => {
  assert.deepEqual(ONBOARDING_STEPS, ['DISCOVERED', 'CANDIDATE', 'METADATA_FETCHED', 'SEASONS_ENUMERATED', 'BACKFILLED',
    'SCHEMA_AUDITED', 'COVERAGE_AUDITED', 'HARD_VERIFIED', 'ACTIVE']);
});

test('a dataset stops at the last step whose checks pass, with what it waits for', () => {
  assert.equal(evaluateSteps(full).state, 'HARD_VERIFIED');
  const cases = [
    [{in_catalog: false}, 'DISCOVERED', 'not_in_active_catalog'],
    [{route: '/api/download/other'}, 'DISCOVERED', 'invalid_catalog_entry'],
    [{has_state: false}, 'CANDIDATE', null],
    [{league_seasons: ['2023']}, 'METADATA_FETCHED', null],
    [{last_snapshot_id: null}, 'SEASONS_ENUMERATED', null],
    [{availability: 'unavailable_404'}, 'SEASONS_ENUMERATED', 'unavailable_404'],
    [{unclassified_fields: ['Weird']}, 'BACKFILLED', 'fields_not_classified'],
    [{coverage: {Date: {ratio: 1}, Home: {ratio: 0.5}, Away: {ratio: 1}}}, 'SCHEMA_AUDITED', 'identity_coverage_below_100'],
    [{hard: {...full.hard, matches: 1}}, 'COVERAGE_AUDITED', 'raw_db_mismatch'],
    [{hard: {...full.hard, out_of_season: 1}}, 'COVERAGE_AUDITED', 'dates_outside_season'],
    [{hard: {...full.hard, unresolved_teams: 1}}, 'COVERAGE_AUDITED', 'unresolved_teams'],
    [{hard: {...full.hard, duplicate_keys: 1}}, 'COVERAGE_AUDITED', 'duplicate_match_keys'],
    [{hard: undefined}, 'COVERAGE_AUDITED', 'no_matches']
  ];
  for (const [patch, state, reason] of cases) {
    const r = evaluateSteps({...full, ...patch});
    assert.equal(r.state, state, JSON.stringify(patch));
    assert.equal(r.blocked_reason, reason, JSON.stringify(patch));
    assert.equal(r.blocked, reason != null);
  }
  assert.equal(evaluateSteps({...full, last_snapshot_id: null}).waiting_for, 'backfill');
});

test('season window allows one year of slack on each side', () => {
  assert.deepEqual(seasonWindow('2024'), {from: '2023-01-01', to: '2025-12-31'});
  assert.deepEqual(seasonWindow('2024-2025'), {from: '2023-01-01', to: '2026-12-31'});
  assert.equal(seasonWindow('x'), null);
});

test('onboarding gate: tracked catalog, no leakage, owner-only new leagues, audit trail', () => {
  const ok = {onboarding_rows: 10, catalog_without_onboarding: 0, facts_from_non_active: 0,
    new_league_active_without_owner: 0, non_baseline_active_unverified: 0, rows_without_event: 0};
  assert.equal(onboardingGate(ok), true);
  for (const k of Object.keys(ok)) assert.equal(onboardingGate({...ok, [k]: k === 'onboarding_rows' ? 0 : 1}), false, k);
});
