// MARKET-CORE-04 (#100): outcomes computed by MatchPilot from its two football APIs only (owner rectification),
// non-final matches UNRESOLVED (DEC-015), result versions and corrections as DEC-002 states.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, MARKET_RULES} from '../src/markets/rules.mjs';
import {fromFutPythonTrader, fromTotalCorner, selectOutcome, resolveVersioned} from '../src/markets/outcomes.mjs';

const FT = (h, a) => ({status: 'FINISHED', ft_home: h, ft_away: a});
const fpt = (version, home_score, away_score, acquired_at, status = 'FINAL') =>
  fromFutPythonTrader({version, status, home_score, away_score, acquired_at, snapshot_id: `s${version}`});
const MO = {marketType: 'MATCH_ODDS', selection: 'HOME'};

test('no external settlement source: rules are internal and the resolver never returns VOID', () => {
  for (const r of MARKET_RULES) {
    assert.equal(r.venue, 'MATCHPILOT_SIMULATION');
    assert.doesNotMatch(JSON.stringify(r), /betfair|exchange|bookmaker/i);
    assert.match(r.void_policy, /OWNER DECISION REQUIRED/);
    assert.match(r.correction_policy, /DEC-002/);
  }
  for (const file of ['../src/markets/rules.mjs', '../src/markets/outcomes.mjs']) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /venueVoid|fetch\(|process\.env/, file);
    for (const [, target] of source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)) assert.ok(['./rules.mjs'].includes(target), `${file} imports ${target}`);
  }
  for (const status of ['POSTPONED', 'SUSPENDED', 'ABANDONED', 'CANCELLED', 'NOT_FINISHED']) {
    const r = resolve({...MO, match: {status, ft_home: 1, ft_away: 0}});
    assert.equal(r.status, 'UNRESOLVED'); assert.equal(r.reason, `MATCH_STATUS_${status}`);
  }
});

test('FutPythonTrader: FINAL with both scores is a validated final; NO_RESULT, NOT_STARTED or a bad score are not', () => {
  const v = fpt(1, 2, 1, '2026-10-01T21:00:00Z');
  assert.deepEqual({...v}, {provider: 'futpythontrader', version: 1, kind: 'FINAL', validated: true, recorded_at: '2026-10-01T21:00:00Z',
    provenance: 'futpythontrader:snapshot:s1', provider_status: 'FINAL', match: {status: 'FINISHED', ft_home: 2, ft_away: 1}});
  assert.equal(fpt(1, null, null, '2026-10-01T21:00:00Z', 'NO_RESULT').kind, 'NOT_FINAL');
  assert.equal(fpt(1, null, null, '2026-10-01T21:00:00Z', 'NOT_STARTED').kind, 'NOT_FINAL');
  for (const bad of [null, -1, 1.5, 'x', '']) assert.equal(fpt(1, bad, 0, '2026-10-01T21:00:00Z').validated, false, String(bad));
  // no half-time score from FPT: HT markets stay UNRESOLVED, full-time markets resolve
  const picked = resolveVersioned({marketType: 'HT_MATCH_ODDS', selection: 'HOME', versions: [v], asOf: '2026-10-02T00:00:00Z'});
  assert.equal(picked.status, 'UNRESOLVED');
  assert.equal(resolveVersioned({...MO, versions: [v], asOf: '2026-10-02T00:00:00Z'}).outcome, 'WIN');
});

test('TotalCorner: only the provider status "full" is final; minutes, "half", null and MatchPilot\'s own "FT" are not', () => {
  const tc = (status, hg = '2', ag = '0') => fromTotalCorner({version: 1, status, hg, ag, acquired_at: '2026-10-01T21:00:00Z', raw_id: 7});
  const full = tc('full');
  assert.equal(full.provider, 'totalcorner'); assert.equal(full.provenance, 'totalcorner:raw:7');
  assert.deepEqual({...full.match}, {status: 'FINISHED', ft_home: 2, ft_away: 0});
  for (const status of [null, '', '23', 'half', 'FT', 'postponed']) assert.equal(tc(status).kind, 'NOT_FINAL', String(status));
  assert.equal(tc('full', '', '1').validated, false);
  const r = resolveVersioned({marketType: 'OVER_UNDER', selection: 'UNDER', line: '2.5', versions: [full], asOf: '2026-10-02T00:00:00Z'});
  assert.equal(r.outcome, 'WIN'); assert.equal(r.provider, 'totalcorner');
});

test('providers are never mixed and unknown providers are refused', () => {
  const tc = fromTotalCorner({version: 2, status: 'full', hg: 2, ag: 2, acquired_at: '2026-10-02T21:00:00Z', raw_id: 1});
  assert.throws(() => selectOutcome([fpt(1, 2, 1, '2026-10-01T21:00:00Z'), tc], {asOf: '2026-10-03T00:00:00Z'}), {code: 'MIXED_PROVIDERS'});
  assert.throws(() => selectOutcome([{...fpt(1, 2, 1, '2026-10-01T21:00:00Z'), provider: 'other'}], {asOf: '2026-10-03T00:00:00Z'}), {code: 'BAD_INPUT'});
});

test('DEC-002: latest validated FINAL available at run time; non-final, unvalidated and future versions ignored', () => {
  const versions = [
    fpt(1, null, null, '2026-10-01T20:00:00Z', 'NO_RESULT'),
    fpt(2, 1, 0, '2026-10-01T21:00:00Z'),
    fpt(3, 'x', 1, '2026-10-02T09:00:00Z'),
    fpt(4, 1, 2, '2026-10-05T09:00:00Z'),
  ];
  const before = selectOutcome(versions, {asOf: '2026-10-03T00:00:00Z'});
  assert.equal(before.outcome_version, 2); assert.equal(before.corrected, false); assert.equal(before.correction_timestamp, null);
  const after = selectOutcome(versions, {asOf: '2026-10-06T00:00:00Z'});
  assert.equal(after.outcome_version, 4); assert.equal(after.first_final_version, 2); assert.equal(after.provenance, 'futpythontrader:snapshot:s4');
  assert.equal(after.corrected, true); assert.equal(after.correction_timestamp, '2026-10-05T09:00:00Z'); assert.equal(after.provider, 'futpythontrader');
  assert.equal(selectOutcome(versions, {asOf: '2026-10-01T20:30:00Z'}).status, 'NO_FINAL');
  assert.deepEqual(selectOutcome([...versions].reverse(), {asOf: '2026-10-06T00:00:00Z'}), after);
});

test('DEC-002: a re-validated identical FINAL is not a correction; conflicting duplicates and bad input fail closed', () => {
  const same = selectOutcome([fpt(1, 2, 1, '2026-10-01T21:00:00Z'), fpt(2, 2, 1, '2026-10-02T21:00:00Z')], {asOf: '2026-10-03T00:00:00Z'});
  assert.equal(same.outcome_version, 2); assert.equal(same.corrected, false);
  assert.throws(() => selectOutcome([fpt(1, 2, 1, '2026-10-01T21:00:00Z'), fpt(1, 0, 1, '2026-10-01T21:00:00Z')], {asOf: '2026-10-03T00:00:00Z'}), {code: 'CONFLICTING_VERSION'});
  assert.throws(() => selectOutcome([fpt(0, 2, 1, '2026-10-01T21:00:00Z')], {asOf: '2026-10-03T00:00:00Z'}), {code: 'BAD_INPUT'});
  assert.throws(() => selectOutcome([fpt(1, 2, 1, 'yesterday')], {asOf: '2026-10-03T00:00:00Z'}), {code: 'BAD_INPUT'});
  assert.throws(() => selectOutcome([], {asOf: undefined}), {code: 'BAD_INPUT'});
  assert.throws(() => selectOutcome([{...fpt(1, 2, 1, '2026-10-01T21:00:00Z'), provenance: ''}], {asOf: '2026-10-03T00:00:00Z'}), {code: 'BAD_INPUT'});
});

test('corrected result: resolution carries provider, version, provenance and whether the correction changed the selection', () => {
  const versions = [fpt(1, 2, 1, '2026-10-01T21:00:00Z'), fpt(2, 2, 2, '2026-10-02T10:00:00Z')];
  const home = resolveVersioned({...MO, versions, asOf: '2026-10-03T00:00:00Z'});
  assert.equal(home.outcome, 'LOSE'); assert.equal(home.outcome_version, 2); assert.equal(home.corrected, true);
  assert.equal(home.first_final_outcome, 'WIN'); assert.equal(home.outcome_changed, true);
  const over = resolveVersioned({marketType: 'OVER_UNDER', selection: 'OVER', line: '2.5', versions, asOf: '2026-10-03T00:00:00Z'});
  assert.equal(over.outcome, 'WIN'); assert.equal(over.corrected, true); assert.equal(over.outcome_changed, false);
  const early = resolveVersioned({...MO, versions, asOf: '2026-10-01T22:00:00Z'});
  assert.equal(early.outcome, 'WIN'); assert.equal(early.corrected, false); assert.equal('first_final_outcome' in early, false);
  assert.deepEqual(resolveVersioned({...MO, versions, asOf: '2026-09-30T00:00:00Z'}), {status: 'UNRESOLVED', reason: 'NO_VALIDATED_FINAL', as_of: '2026-09-30T00:00:00Z'});
});

test('BTTS (Goal/No Goal) from a validated provider final', () => {
  const v = [fpt(1, 1, 1, '2026-10-01T21:00:00Z')];
  assert.equal(resolveVersioned({marketType: 'BTTS', selection: 'YES', versions: v, asOf: '2026-10-02T00:00:00Z'}).outcome, 'WIN');
  assert.equal(resolveVersioned({marketType: 'BTTS', selection: 'NO', versions: v, asOf: '2026-10-02T00:00:00Z'}).outcome, 'LOSE');
});

test('DEC-002: version numbers must follow acquisition time; a higher version recorded earlier fails closed (review N2)', () => {
  const versions = [fpt(1, 2, 1, '2026-10-05T09:00:00Z'), fpt(2, 0, 0, '2026-10-01T09:00:00Z')];
  assert.throws(() => selectOutcome(versions, {asOf: '2026-10-06T00:00:00Z'}), {code: 'NON_MONOTONIC_VERSION'});
  assert.throws(() => resolveVersioned({...MO, versions, asOf: '2026-10-06T00:00:00Z'}), {code: 'NON_MONOTONIC_VERSION'});
  // equal timestamps stay valid (same acquisition instant, version breaks the tie)
  assert.equal(selectOutcome([fpt(1, 2, 1, '2026-10-05T09:00:00Z'), fpt(2, 2, 2, '2026-10-05T09:00:00Z')], {asOf: '2026-10-06T00:00:00Z'}).outcome_version, 2);
});
