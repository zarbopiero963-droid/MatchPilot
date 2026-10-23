// MM-PR-01 (#96): registry + liability models + exposure/concurrency caps + decision output fields. Simulated money only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger, openPosition, accountState} from '../src/ledger/paper-ledger.mjs';
import {createProfile, evaluate, initialOperationalState, MODELS} from '../src/mm/money-management.mjs';
import {REGISTRY, IMPLEMENTED_TYPES, getMoneyManagementType} from '../src/mm/registry.mjs';

const AT = '2026-10-23T02:00:00+02:00';
const ledger = () => createLedger({accountId: 'acc', initialAllocation: '1000', at: AT});
const ev = (profile, l, proposal) => evaluate({profile, operational: initialOperationalState(), account: accountState(l), proposal});
const FIELDS = ['type_id', 'name', 'category', 'description', 'formula', 'formula_version', 'required_inputs', 'optional_inputs', 'capabilities',
  'settlement_dependency', 'supported_markets', 'supported_sides', 'risk_constraints', 'void_policy', 'reset_policy', 'test_vectors', 'certification_status'];
const FLAGS = ['requires_bankroll', 'requires_available_bankroll', 'requires_previous_settlement', 'requires_sequence_state', 'requires_open_exposure',
  'requires_liability', 'supports_back', 'supports_lay', 'supports_dutch', 'supports_live', 'supports_prematch', 'supports_void',
  'supports_partial_settlement', 'reset_on_win', 'reset_on_loss', 'reset_on_void', 'can_run_without_settlement_history'];

test('registry: full #96 census with every field and the 17 #96 capability flags', () => {
  assert.equal(REGISTRY.length, 16);
  for (const t of REGISTRY) {
    for (const f of FIELDS) assert.ok(f in t, `${t.type_id}.${f}`);
    assert.deepEqual(Object.keys(t.capabilities).sort(), [...FLAGS].sort());
  }
  assert.deepEqual([...IMPLEMENTED_TYPES].sort(), ['FIXED_LIABILITY', 'FIXED_STAKE', 'LIABILITY_PERCENT_BANKROLL', 'PERCENT_BANKROLL']);
  assert.deepEqual(Object.keys(MODELS).sort(), [...IMPLEMENTED_TYPES].sort());
});

test('no invented formulas: non-implemented models have formula=null and are refused', () => {
  for (const id of ['KELLY', 'MARTINGALE', 'FIBONACCI', 'LABOUCHERE', 'CS_PROGRESSIVO', 'RECOVERY_STAKE']) {
    const t = getMoneyManagementType(id);
    assert.equal(t.certification_status, 'DISCOVERED'); assert.equal(t.formula, null); assert.equal(t.test_vectors, null);
    assert.throws(() => createProfile({profileId: 'x', model: id, params: {}}), {code: 'MODEL_NOT_IMPLEMENTED'});
  }
  assert.throws(() => createProfile({profileId: 'x', model: 'NOPE', params: {}}), {code: 'UNKNOWN_MODEL'});
});

test('FIXED_LIABILITY: LAY stake = L/(odds-1), BACK stake = L; registry test vectors hold', () => {
  const p = createProfile({profileId: 'fl', model: 'FIXED_LIABILITY', params: {liability: '20'}});
  const lay = ev(p, ledger(), {side: 'LAY', odds: '3'});
  assert.equal(lay.decision, 'ALLOW'); assert.equal(lay.adjusted_stake, '10'); assert.equal(lay.adjusted_liability, '20');
  assert.equal(ev(p, ledger(), {side: 'BACK', odds: '3'}).adjusted_stake, '20');
  assert.throws(() => createProfile({profileId: 'fl', model: 'FIXED_LIABILITY', params: {}}), {code: 'BAD_INPUT'});
});

test('LIABILITY_PERCENT_BANKROLL: liability = % of available bankroll after open exposure', () => {
  const p = createProfile({profileId: 'lp', model: 'LIABILITY_PERCENT_BANKROLL', params: {percent: '2'}});
  assert.equal(ev(p, ledger(), {side: 'LAY', odds: '5'}).adjusted_stake, '5'); // L=20
  const l = ledger();
  openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'o', side: 'LAY', odds: '5', stake: '50', commissionRate: '0.05', settingsSnapshotId: 's', idempotencyKey: 'o', at: AT});
  assert.equal(ev(p, l, {side: 'LAY', odds: '5'}).adjusted_liability, '16'); // available 800 → L=16
});

test('max_total_exposure REDUCEs to the remaining room and BLOCKs when none is left', () => {
  const l = ledger();
  openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'o', side: 'LAY', odds: '5', stake: '50', commissionRate: '0.05', settingsSnapshotId: 's', idempotencyKey: 'o', at: AT});
  const p = createProfile({profileId: 'e', model: 'FIXED_LIABILITY', params: {liability: '100'}, caps: {max_total_exposure: '250'}});
  const r = ev(p, l, {side: 'LAY', odds: '3'});
  assert.equal(r.decision, 'REDUCE'); assert.equal(r.adjusted_liability, '50'); assert.deepEqual(r.hard_caps_triggered, ['max_total_exposure']);
  const full = createProfile({profileId: 'e', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_total_exposure: '200'}});
  assert.equal(ev(full, l, {side: 'BACK', odds: '2'}).decision, 'BLOCK');
});

test('max_concurrent_trades BLOCKs at the limit; unknown caps refused; output carries exposure ref, rules and filters', () => {
  const l = ledger();
  openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'o', side: 'BACK', odds: '2', stake: '10', commissionRate: '0.05', settingsSnapshotId: 's', idempotencyKey: 'o', at: AT});
  const p = createProfile({profileId: 'c', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_concurrent_trades: 1}});
  const d = ev(p, l, {side: 'BACK', odds: '2'});
  assert.equal(d.decision, 'BLOCK'); assert.ok(d.structured_reasons.includes('MAX_CONCURRENT_TRADES')); assert.equal(d.execution_permission, false);
  assert.equal(d.exposure_snapshot_ref, 'acc@2:open_liability=10');
  assert.deepEqual(d.matched_rules, []); assert.deepEqual(d.failed_filters, []);
  assert.equal(ev(createProfile({profileId: 'c', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_concurrent_trades: 2}}), l, {side: 'BACK', odds: '2'}).decision, 'ALLOW');
  assert.throws(() => createProfile({profileId: 'c', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_daily_loss: '1'}}), {code: 'BAD_INPUT'});
  assert.throws(() => createProfile({profileId: 'c', model: 'FIXED_STAKE', params: {stake: '5'}, caps: {max_concurrent_trades: 0}}), {code: 'BAD_INPUT'});
});
