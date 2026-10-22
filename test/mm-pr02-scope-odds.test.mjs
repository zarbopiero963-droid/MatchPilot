// MM-PR-02 (#96 "Parametri policy / risk"): per-scope exposure caps and min/max odds filters. Simulated money only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger, openPosition, accountState} from '../src/ledger/paper-ledger.mjs';
import {createProfile, evaluate, initialOperationalState} from '../src/mm/money-management.mjs';

const AT = '2026-10-23T02:00:00+02:00';
const open = (l, id, scope, stake = '50') => openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: id, side: 'LAY', odds: '3', stake,
  commissionRate: '0.05', settingsSnapshotId: 's', idempotencyKey: id, at: AT, scope});
const ev = (profile, l, proposal) => evaluate({profile, operational: initialOperationalState(), account: accountState(l), proposal});

test('ledger: scope tags aggregate open exposure per match/market/league/strategy; settled release is reflected', () => {
  const l = createLedger({accountId: 'a', initialAllocation: '1000', at: AT});
  open(l, 'p1', {match: 'm1', league: 'SA', strategy: 'st'});
  open(l, 'p2', {match: 'm2', league: 'SA'});
  open(l, 'p3');
  const s = accountState(l);
  assert.equal(s.open_exposure_by_scope.match.m1, '100'); assert.equal(s.open_exposure_by_scope.league.SA, '200');
  assert.equal(s.open_exposure_by_scope.strategy.st, '100'); assert.deepEqual(s.open_exposure_by_scope.market, {});
  assert.equal(s.open_liability, '300');
  assert.throws(() => open(l, 'p4', {team: 'x'}), {code: 'BAD_INPUT'});
  assert.equal(open(l, 'p1', {match: 'm1', league: 'SA', strategy: 'st'}).status, 'ALREADY_APPLIED');
  assert.throws(() => open(l, 'p1', {match: 'OTHER'}), {code: 'IDEMPOTENCY_CONFLICT'});
});

test('per-match cap REDUCEs to the room on that match only; other matches unaffected; full match BLOCKs', () => {
  const l = createLedger({accountId: 'a', initialAllocation: '1000', at: AT});
  open(l, 'p1', {match: 'm1'});
  const p = createProfile({profileId: 'x', model: 'FIXED_LIABILITY', params: {liability: '80'}, caps: {max_exposure_per_match: '150'}});
  const r = ev(p, l, {side: 'LAY', odds: '3', scope: {match: 'm1'}});
  assert.equal(r.decision, 'REDUCE'); assert.equal(r.adjusted_liability, '50'); assert.deepEqual(r.hard_caps_triggered, ['max_exposure_per_match']);
  assert.equal(ev(p, l, {side: 'LAY', odds: '3', scope: {match: 'm2'}}).decision, 'ALLOW');
  const full = createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_exposure_per_match: '100'}});
  assert.equal(ev(full, l, {side: 'BACK', odds: '2', scope: {match: 'm1'}}).decision, 'BLOCK');
});

test('a per-scope cap without the scope id on the proposal fails closed (BLOCK, structured reason)', () => {
  const l = createLedger({accountId: 'a', initialAllocation: '1000', at: AT});
  const p = createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_exposure_per_league: '100', max_exposure_per_strategy: '100'}});
  const d = ev(p, l, {side: 'BACK', odds: '2', scope: {league: 'SA'}});
  assert.equal(d.decision, 'BLOCK'); assert.equal(d.execution_permission, false);
  assert.deepEqual(d.structured_reasons, ['SCOPE_ID_MISSING:strategy']);
});

test('min/max odds: outcome is the profile filter_fail_action, never a default; failed_filters is reported', () => {
  const l = createLedger({accountId: 'a', initialAllocation: '1000', at: AT});
  assert.throws(() => createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {min_odds: '1.8'}}), {code: 'BAD_INPUT'});
  assert.throws(() => createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {filter_fail_action: 'BLOCK'}}), {code: 'BAD_INPUT'});
  assert.throws(() => createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {min_odds: '3', max_odds: '2', filter_fail_action: 'BLOCK'}}), {code: 'BAD_INPUT'});
  const b = createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {min_odds: '1.80', max_odds: '3.20', filter_fail_action: 'BLOCK'}});
  const lo = ev(b, l, {side: 'BACK', odds: '1.5'});
  assert.equal(lo.decision, 'BLOCK'); assert.deepEqual(lo.failed_filters, ['min_odds']); assert.equal(lo.execution_permission, false);
  assert.deepEqual(ev(b, l, {side: 'BACK', odds: '4'}).failed_filters, ['max_odds']);
  const inside = ev(b, l, {side: 'BACK', odds: '3.20'});
  assert.equal(inside.decision, 'ALLOW'); assert.deepEqual(inside.failed_filters, []);
  const s = createProfile({profileId: 'x', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {min_odds: '1.80', filter_fail_action: 'SIMULATION_ONLY'}});
  const so = ev(s, l, {side: 'BACK', odds: '1.5'});
  assert.equal(so.decision, 'SIMULATION_ONLY'); assert.equal(so.execution_permission, false); assert.equal(so.adjusted_stake, '5');
});
