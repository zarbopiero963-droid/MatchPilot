// MP-CAP-01a: the provider-neutral capability catalog (pure module, no route). Timing is TIMING_CLASSES of MP-PIT-TIMING-01.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, capabilityId, fptFieldCapability, OPERATORS_BY_TYPE, STATUSES, TIMINGS, validateCapability } from '../src/capabilities/catalog.mjs';
import { TIMING_CLASSES } from '../src/providers/futpython/schema.mjs';

const valid = (over = {}) => ({
  id: 'apifootball:market:bet-5:Over 2.5', provider: 'apifootball', kind: 'market', provider_ref: 'bet-5:Over 2.5',
  value_type: 'number', unit: null, operators: ['gte', 'lte'], timing: 'PREMATCH_MARKET_UNTIMED', coverage: null,
  status: 'NOT VERIFIED', provenance: {source: 'documentation', evidence: []}, limits: null, ...over
});

test('MP-CAP-01a a capability has a stable id, a known type, operators of that type, a timing and a status', () => {
  assert.equal(capabilityId('fpt', 'statistic', 'Corners_Home_FT'), 'fpt:statistic:Corners_Home_FT');
  assert.deepEqual(validateCapability(valid()), []);
  assert.equal(STATUSES.length, 6);
  assert.deepEqual(TIMINGS, TIMING_CLASSES, 'no timing vocabulary beyond MP-PIT-TIMING-01');
  const bad = [
    [{provider: 'API Football'}, /provider must be a lowercase slug/],
    [{kind: 'odds'}, /kind must be one of/],
    [{id: 'apifootball:market:other'}, /id must be provider:kind:provider_ref/],
    [{id: undefined}, /id is required/],
    [{provider_ref: '   '}, /provider_ref is the provider's own name/],
    [{provider_ref: 'Odd\u0000x', id: 'apifootball:market:Odd\u0000x'}, /provider_ref is the provider's own name/],
    [{value_type: 'money'}, /value_type must be one of/],
    [{operators: []}, /operators must be a non-empty list/],
    [{operators: ['contains']}, /operator contains is not valid for number/],
    [{timing: 'LIVE'}, /timing must be one of/],
    [{coverage: 1.2}, /coverage is a ratio/],
    [{coverage: '0.5'}, /coverage is a ratio/],
    [{coverage: Number.NaN}, /coverage is a ratio/],
    [{unit: undefined}, /unit is a text or null/],
    [{status: 'AVAILABLE'}, /status must be one of/],
    [{provenance: {source: ''}}, /provenance.source is required/],
    [{limits: 'none'}, /limits is a list/],
    [{limits: ['ok', 3]}, /limits is a list/]
  ];
  for (const [over, message] of bad) assert.match(validateCapability(valid(over)).join('\n'), message, JSON.stringify(over));
  for (const value of [null, 'x', [], 3]) assert.deepEqual(validateCapability(value), ['capability must be an object'], String(value));
});

test('MP-CAP-01a real provider names are kept as they are (spaces, brackets, slashes)', () => {
  for (const ref of ['Unnamed: 0', 'Home Team', 'Over 2.5', '_x', 'Odd_1 (FT)', 'Goals/Min']) {
    assert.deepEqual(validateCapability(valid({provider_ref: ref, id: `apifootball:market:${ref}`})), [], ref);
  }
});

test('MP-CAP-01a the MP-PIT-TIMING-01 rule holds for every provider: a statistic is never pre-match', () => {
  assert.match(validateCapability(valid({kind: 'statistic', id: 'apifootball:statistic:bet-5:Over 2.5'})).join('\n'),
    /a statistic has timing POSTMATCH_OUTCOME, not PREMATCH_MARKET_UNTIMED/);
  assert.match(validateCapability(valid({kind: 'statistic', id: 'apifootball:statistic:bet-5:Over 2.5', timing: 'PREMATCH_IDENTITY'})).join('\n'),
    /a statistic has timing POSTMATCH_OUTCOME/);
  assert.match(validateCapability(valid({timing: 'POSTMATCH_OUTCOME'})).join('\n'), /a market has timing PREMATCH_MARKET_UNTIMED/);
  assert.deepEqual(validateCapability(valid({kind: 'statistic', id: 'apifootball:statistic:bet-5:Over 2.5', timing: 'POSTMATCH_OUTCOME'})), []);
});

test('MP-CAP-01a a status that says the provider offers it needs evidence, never documentation alone', () => {
  for (const status of ['AVAILABLE AND IMPLEMENTED', 'AVAILABLE BUT NOT IMPLEMENTED', 'PARTIALLY IMPLEMENTED']) {
    assert.match(validateCapability(valid({status})).join('\n'), /needs provenance.evidence/, status);
    assert.deepEqual(validateCapability(valid({status, provenance: {source: 'api', evidence: ['status call 2026-11-01']}})), [], status);
  }
  for (const status of ['NOT VERIFIED', 'PLAN RESTRICTED', 'PROVIDER NOT SUPPORTED']) assert.deepEqual(validateCapability(valid({status})), [], status);
});

test('MP-CAP-01a the catalog is ordered, refuses duplicates and reports malformed input instead of throwing', () => {
  const a = valid();
  const b = valid({id: 'apifootball:statistic:Corner Kicks', kind: 'statistic', provider_ref: 'Corner Kicks', timing: 'POSTMATCH_OUTCOME'});
  const catalog = buildCatalog([b, a]);
  assert.deepEqual(catalog.capabilities.map(c => c.id), [a.id, b.id].sort());
  assert.deepEqual(catalog.errors, []);
  assert.equal(catalog.version, 'mp-cap-1');
  assert.match(buildCatalog([a, a]).errors.join('\n'), /duplicate id/);
  assert.deepEqual(buildCatalog([a, valid({timing: 'POSTMATCH_OUTCOME', id: 'apifootball:market:x', provider_ref: 'x'})]).errors,
    ['capability apifootball:market:x: a market has timing PREMATCH_MARKET_UNTIMED, not POSTMATCH_OUTCOME']);
  const broken = buildCatalog([null, null, valid({id: undefined}), valid({id: undefined})]);
  assert.ok(broken.errors.includes('capability must be an object'));
  assert.ok(broken.errors.some(e => /id is required/.test(e)));
  assert.ok(!broken.errors.some(e => /duplicate id/.test(e)), 'missing ids are reported as missing, not as duplicates');
  assert.deepEqual(buildCatalog('x').errors, ['entries must be a list']);
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
  const odd = cap({field_name: 'Odd_1_FT', inferred_type: 'number', nonempty_seen: 5, filterable: true, coverage_ratio: '0.7500000000'});
  assert.deepEqual([odd.id, odd.kind, odd.timing, odd.coverage, odd.status], ['fpt:market:Odd_1_FT', 'market', 'PREMATCH_MARKET_UNTIMED', 0.75, 'AVAILABLE AND IMPLEMENTED']);
  assert.deepEqual(odd.operators, [...OPERATORS_BY_TYPE.number]);
  const date = cap({field_name: 'Date', inferred_type: 'date_or_datetime', nonempty_seen: 5, filterable: true});
  assert.deepEqual([date.kind, date.timing, date.value_type], ['identity', 'PREMATCH_IDENTITY', 'datetime']);
  for (const c of [odd, date]) assert.match(c.limits.join(' '), /historical archive only/);
  // Status follows the evidence: a column never seen with a value is NOT VERIFIED; one seen but not filterable is not implemented.
  assert.equal(cap({field_name: 'Corners_Home_FT', inferred_type: 'integer', nonempty_seen: 0}).status, 'NOT VERIFIED');
  assert.equal(cap({field_name: 'Corners_Home_FT', inferred_type: 'integer', nonempty_seen: 3, filterable: false}).status, 'AVAILABLE BUT NOT IMPLEMENTED');
  // An unknown name is unclassified, post-match, and an unknown type offers only presence checks.
  const unknown = cap({field_name: 'Referee', inferred_type: 'weird', nonempty_seen: 2});
  assert.deepEqual([unknown.family, unknown.timing, unknown.value_type, unknown.operators], ['unclassified', 'POSTMATCH_OUTCOME', 'unknown', ['is_null', 'not_null']]);
  // Unknown coverage stays null, never 0: missing, empty text or not a number.
  for (const coverage_ratio of [undefined, null, '', '  ', 'n/a']) assert.equal(cap({field_name: 'Odd_1_FT', coverage_ratio}).coverage, null, String(coverage_ratio));
  // A real column name with spaces or brackets still gives a valid capability.
  assert.deepEqual(validateCapability(cap({field_name: 'Unnamed: 0', inferred_type: 'integer', nonempty_seen: 1})), []);
  assert.deepEqual(buildCatalog([odd, date, unknown]).errors, []);
});
