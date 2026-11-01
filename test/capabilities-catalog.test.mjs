// MP-CAP-01a: the provider-neutral capability catalog (pure module, no route). Timing comes from MP-PIT-TIMING-01.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, capabilityId, fptFieldCapability, OPERATORS_BY_TYPE, STATUSES, TIMINGS, validateCapability } from '../src/capabilities/catalog.mjs';

const valid = (over = {}) => ({
  id: 'apifootball:market:bet-5:Over_2.5', provider: 'apifootball', kind: 'market', provider_ref: 'bet-5:Over_2.5',
  value_type: 'number', unit: null, operators: ['gte', 'lte'], timing: 'PREMATCH_MARKET_UNTIMED',
  availability: {historical: null, prematch: true, live: null}, coverage: null, status: 'NOT VERIFIED',
  provenance: {source: 'documentation', evidence: []}, limits: null, ...over
});

test('MP-CAP-01a a capability has a stable id, a known type, operators of that type, a timing and a status', () => {
  assert.equal(capabilityId('fpt', 'statistic', 'Corners_Home_FT'), 'fpt:statistic:Corners_Home_FT');
  assert.deepEqual(validateCapability(valid()), []);
  assert.deepEqual(STATUSES.length, 6);
  assert.ok(TIMINGS.includes('UNCLASSIFIED') && TIMINGS.includes('LIVE'));
  const bad = [
    [{provider: 'API Football'}, /provider must be a lowercase slug/],
    [{kind: 'odds'}, /kind must be one of/],
    [{id: 'apifootball:market:other'}, /id must be provider:kind:provider_ref/],
    [{value_type: 'money'}, /value_type must be one of/],
    [{operators: []}, /operators must be a non-empty list/],
    [{operators: ['contains']}, /operator contains is not valid for number/],
    [{timing: 'BEFORE'}, /timing must be one of/],
    [{availability: {historical: true, prematch: 'yes', live: false}}, /availability needs/],
    [{coverage: 1.2}, /coverage is a ratio/],
    [{status: 'AVAILABLE'}, /status must be one of/],
    [{provenance: {source: ''}}, /provenance.source is required/],
    [{limits: 'none'}, /limits is a list/]
  ];
  for (const [over, message] of bad) assert.match(validateCapability(valid(over)).join('\n'), message, JSON.stringify(over));
});

test('MP-CAP-01a integrity in time: a post-match, live or unclassified value is never offered before the match', () => {
  for (const timing of ['POSTMATCH_OUTCOME', 'LIVE', 'UNCLASSIFIED']) {
    assert.match(validateCapability(valid({timing})).join('\n'), new RegExp(`timing ${timing} cannot be available before the match`), timing);
  }
  assert.deepEqual(validateCapability(valid({timing: 'POSTMATCH_OUTCOME', availability: {historical: true, prematch: false, live: null}})), [],
    'a post-match statistic is fine as history');
  assert.match(validateCapability(valid({timing: 'UNCLASSIFIED', availability: {historical: true, prematch: false, live: true}})).join('\n'), /unclassified value cannot be offered live/);
});

test('MP-CAP-01a a status that says the provider offers it needs evidence, never documentation alone', () => {
  for (const status of ['AVAILABLE AND IMPLEMENTED', 'AVAILABLE BUT NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED']) {
    assert.match(validateCapability(valid({status})).join('\n'), /needs provenance.evidence/, status);
    assert.deepEqual(validateCapability(valid({status, provenance: {source: 'api', evidence: ['status call 2026-11-01']}})), [], status);
  }
  for (const status of ['NOT VERIFIED', 'PLAN RESTRICTED', 'PROVIDER NOT SUPPORTED']) assert.deepEqual(validateCapability(valid({status})), [], status);
});

test('MP-CAP-01a the catalog is ordered, refuses duplicates and collects every error', () => {
  const a = valid();
  const b = valid({id: 'apifootball:statistic:Corner_Kicks', kind: 'statistic', provider_ref: 'Corner_Kicks', timing: 'POSTMATCH_OUTCOME',
    availability: {historical: true, prematch: false, live: true}});
  const catalog = buildCatalog([b, a]);
  assert.deepEqual(catalog.capabilities.map(c => c.id), [a.id, b.id].sort());
  assert.deepEqual(catalog.errors, []);
  assert.equal(catalog.version, 'mp-cap-1');
  assert.match(buildCatalog([a, a]).errors.join('\n'), /duplicate id/);
  assert.match(buildCatalog([a, valid({timing: 'LIVE'})]).errors.join('\n'), /cannot be available before the match/);
});

test('MP-CAP-01a FutPythonTrader columns: timing from MP-PIT-TIMING-01, history only (provider retired), status from evidence', () => {
  const cap = row => fptFieldCapability(row);
  // Post-match statistics, the old regex made them identity (BE-08): post-match statistics now.
  for (const name of ['Dribbles_Home_FT', 'Aerials_Won_Away_FT', 'Blocks_Home_FT']) {
    const c = cap({field_name: name, inferred_type: 'integer', nonempty_seen: 10, filterable: true});
    assert.equal(c.kind, 'statistic', name);
    assert.equal(c.timing, 'POSTMATCH_OUTCOME', name);
    assert.deepEqual(validateCapability(c), [], name);
  }
  const odd = cap({field_name: 'Odd_1_FT', inferred_type: 'number', nonempty_seen: 5, filterable: true, coverage_ratio: '0.75'});
  assert.deepEqual([odd.id, odd.kind, odd.timing, odd.coverage, odd.status], ['fpt:market:Odd_1_FT', 'market', 'PREMATCH_MARKET_UNTIMED', 0.75, 'AVAILABLE AND IMPLEMENTED']);
  assert.deepEqual(odd.operators, [...OPERATORS_BY_TYPE.number]);
  const date = cap({field_name: 'Date', inferred_type: 'date_or_datetime', nonempty_seen: 5, filterable: true});
  assert.deepEqual([date.kind, date.timing, date.value_type], ['identity', 'PREMATCH_IDENTITY', 'datetime']);
  // Retired provider: the frozen archive only, never upcoming or live, whatever the timing.
  for (const c of [odd, date]) assert.deepEqual(c.availability, {historical: true, prematch: false, live: false});
  // Status follows the evidence: a column never seen with a value is NOT VERIFIED; one seen but not filterable is not implemented.
  assert.equal(cap({field_name: 'Corners_Home_FT', inferred_type: 'integer', nonempty_seen: 0}).status, 'NOT VERIFIED');
  assert.equal(cap({field_name: 'Corners_Home_FT', inferred_type: 'integer', nonempty_seen: 3, filterable: false}).status, 'AVAILABLE BUT NOT IMPLEMENTED');
  // An unknown name is unclassified, post-match, and an unknown type offers only presence checks.
  const unknown = cap({field_name: 'Referee', inferred_type: 'weird', nonempty_seen: 2});
  assert.deepEqual([unknown.family, unknown.timing, unknown.value_type, unknown.operators], ['unclassified', 'POSTMATCH_OUTCOME', 'unknown', ['is_null', 'not_null']]);
  assert.equal(unknown.coverage, null, 'unknown coverage stays null, never 0');
  assert.deepEqual(buildCatalog([odd, date, unknown]).errors, []);
});
