// DEC-001 / DEC-013 (#96, #99): paper ledger + Money Management. Simulated money only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createLedger, openPosition, hedgePosition, settlePosition, correctSettlement, accountState, exposureOf} from '../src/ledger/paper-ledger.mjs';
import {createProfile, evaluate, initialOperationalState, stopOperations, resumeOperations, pauseOperations,
  initialSequence, applySettlement, ADVISORY_LABEL} from '../src/mm/money-management.mjs';
import {proposePaperTrade} from '../src/mm/paper-trading.mjs';
import {dec} from '../src/math/decimal.mjs';

const AT = '2026-10-22T20:00:00+02:00';
const who = {who: 'owner', at: AT, reason: 'test'};
const newLedger = () => createLedger({accountId: 'acc-1', initialAllocation: '1000.00', at: AT});
const open = (l, o) => openPosition(l, {mode: 'ACTIVE_OPERATIONAL', commissionRate: '0.05', settingsSnapshotId: 'set-1', at: AT, ...o});

test('BACK WIN / LAY LOSE / VOID settle at the cent with commission fixed at the fill; ledger reconciles', () => {
  const l = newLedger();
  open(l, {positionId: 'p1', side: 'BACK', odds: '2.10', stake: '10', idempotencyKey: 'o1'});
  open(l, {positionId: 'p2', side: 'LAY', odds: '3.00', stake: '10', idempotencyKey: 'o2'}); // liability 20
  open(l, {positionId: 'p3', side: 'BACK', odds: '1.50', stake: '5', idempotencyKey: 'o3'});
  let s = accountState(l);
  assert.equal(s.reserved_funds, '35');
  assert.equal(s.available_bankroll, '965');
  assert.equal(s.open_position_count, 3);
  settlePosition(l, {positionId: 'p1', outcome: 'WIN', idempotencyKey: 's1', at: AT});   // +11 gross, -0.55 commission
  settlePosition(l, {positionId: 'p2', outcome: 'LOSE', idempotencyKey: 's2', at: AT});  // lay wins +10, -0.50
  settlePosition(l, {positionId: 'p3', outcome: 'VOID', idempotencyKey: 's3', at: AT});  // 0
  s = accountState(l);
  assert.equal(s.cash_balance, '1019.95');
  assert.equal(s.realized_pnl, '19.95');
  assert.equal(s.settled_commission, '1.05');
  assert.equal(s.reserved_funds, '0');
  assert.equal(s.reconciled, true);
  assert.equal(s.unrealized_pnl, null);
});

test('DEC-001: STOP/ADVISORY_ONLY blocks new positions but allows reducing hedges and settlement', () => {
  const l = newLedger();
  open(l, {positionId: 'p1', side: 'BACK', odds: '3.00', stake: '10', idempotencyKey: 'o1'});
  const before = l.entries.length;
  assert.throws(() => openPosition(l, {mode: 'ADVISORY_ONLY', positionId: 'p2', side: 'BACK', odds: '2', stake: '1',
    commissionRate: '0.05', settingsSnapshotId: 'set-1', idempotencyKey: 'o2'}), {code: 'OPEN_BLOCKED_BY_MODE'});
  assert.equal(l.entries.length, before);
  // increasing exposure is refused in STOP
  assert.throws(() => hedgePosition(l, {mode: 'ADVISORY_ONLY', positionId: 'p1', side: 'BACK', odds: '3', stake: '5', idempotencyKey: 'h0'}), {code: 'HEDGE_NOT_REDUCING'});
  // lay 10 @ 3.00 fully hedges: exposure 10 -> 0
  hedgePosition(l, {mode: 'ADVISORY_ONLY', positionId: 'p1', side: 'LAY', odds: '3.00', stake: '10', idempotencyKey: 'h1', at: AT});
  assert.equal(accountState(l).reserved_funds, '0');
  settlePosition(l, {positionId: 'p1', outcome: 'WIN', idempotencyKey: 's1', at: AT});
  assert.equal(accountState(l).cash_balance, '1000');
  assert.equal(accountState(l).reconciled, true);
});

test('double settlement refused, same idempotency key is ALREADY_APPLIED, key reuse with other content conflicts', () => {
  const l = newLedger();
  open(l, {positionId: 'p1', side: 'BACK', odds: '2', stake: '10', idempotencyKey: 'o1'});
  assert.equal(settlePosition(l, {positionId: 'p1', outcome: 'WIN', idempotencyKey: 's1'}).status, 'APPLIED');
  const n = l.entries.length;
  assert.equal(settlePosition(l, {positionId: 'p1', outcome: 'WIN', idempotencyKey: 's1'}).status, 'ALREADY_APPLIED');
  assert.throws(() => settlePosition(l, {positionId: 'p1', outcome: 'WIN', idempotencyKey: 's2'}), {code: 'DOUBLE_SETTLEMENT'});
  assert.throws(() => settlePosition(l, {positionId: 'p1', outcome: 'LOSE', idempotencyKey: 's1'}), {code: 'IDEMPOTENCY_CONFLICT'});
  assert.equal(l.entries.length, n);
});

test('correction appends REVERSAL + version 2, never edits history', () => {
  const l = newLedger();
  open(l, {positionId: 'p1', side: 'BACK', odds: '2', stake: '10', idempotencyKey: 'o1'});
  settlePosition(l, {positionId: 'p1', outcome: 'WIN', idempotencyKey: 's1'});
  const snapshot = JSON.stringify(l.entries);
  correctSettlement(l, {positionId: 'p1', outcome: 'LOSE', reason: 'result corrected by provider', idempotencyKey: 'c1'});
  assert.ok(JSON.stringify(l.entries).startsWith(snapshot.slice(0, -1)));
  const s = accountState(l);
  assert.equal(s.cash_balance, '990');
  assert.equal(s.settled_commission, '0');
  assert.equal(s.reconciled, true);
  assert.equal(l.entries.at(-1).settlement_version, 2);
  assert.equal(l.entries.at(-1).corrects_version, 1);
  assert.ok(Object.isFrozen(l.entries[0]));
});

test('insufficient available bankroll refuses the open; money inputs refuse binary floats', () => {
  const l = newLedger();
  assert.throws(() => open(l, {positionId: 'p', side: 'LAY', odds: '11', stake: '101', idempotencyKey: 'o'}), {code: 'INSUFFICIENT_AVAILABLE_BANKROLL'});
  assert.throws(() => open(l, {positionId: 'p', side: 'BACK', odds: 2.1, stake: '1', idempotencyKey: 'o'}), {code: 'BAD_INPUT'});
  assert.equal(exposureOf([{side: 'LAY', odds: dec('2.5'), stake: dec('4')}]).toString(), '6');
});

test('DEC-013 defaults: SHARED_ACCOUNT_BANKROLL, VOID/PUSH do not advance, no arbitrary caps', () => {
  const p = createProfile({profileId: 'mm', model: 'PERCENT_BANKROLL', params: {percent: '1'}});
  assert.equal(p.bankroll_mode, 'SHARED_ACCOUNT_BANKROLL');
  assert.equal(p.void_push_advances_progression, false);
  assert.deepEqual(p.caps, {max_stake: null, max_liability: null, max_total_exposure: null, max_concurrent_trades: null});
  assert.throws(() => createProfile({profileId: 'x', model: 'PERCENT_BANKROLL', params: {percent: '1'}, bankrollMode: 'SEGREGATED'}), {code: 'NOT_IMPLEMENTED'});
  let q = initialSequence();
  q = applySettlement(q, p, {positionId: 'a', outcome: 'VOID'});
  q = applySettlement(q, p, {positionId: 'b', outcome: 'PUSH'});
  assert.equal(q.steps, 0);
  q = applySettlement(q, p, {positionId: 'c', outcome: 'LOSE'});
  q = applySettlement(q, p, {positionId: 'c', outcome: 'LOSE'}); // duplicated event: once only (DEC-001)
  assert.equal(q.steps, 1); assert.equal(q.losing_streak, 1);
  q = applySettlement(q, p, {positionId: 'c', outcome: 'WIN', settlementVersion: 2});
  assert.equal(q.steps, 1); assert.equal(q.corrections.length, 1);
  const v = createProfile({profileId: 'v', model: 'FIXED_STAKE', params: {stake: '5'}, voidPushAdvancesProgression: true});
  assert.equal(applySettlement(initialSequence(), v, {positionId: 'a', outcome: 'VOID'}).steps, 1);
});

test('shared bankroll: % stake uses available bankroll after exposure of all open positions; caps REDUCE', () => {
  const l = newLedger();
  open(l, {positionId: 'other-profile', side: 'LAY', odds: '5', stake: '50', idempotencyKey: 'o'}); // liability 200
  const p = createProfile({profileId: 'mm', model: 'PERCENT_BANKROLL', params: {percent: '1'}});
  const d = evaluate({profile: p, operational: initialOperationalState(), account: accountState(l), proposal: {side: 'BACK', odds: '2'}, commissionRate: '0.05', settingsVersion: 'set-1', at: AT});
  assert.equal(d.decision, 'ALLOW'); assert.equal(d.adjusted_stake, '8'); assert.equal(d.execution_permission, true);
  const c = createProfile({profileId: 'mm', model: 'FIXED_STAKE', params: {stake: '30'}, caps: {max_liability: '20'}});
  const r = evaluate({profile: c, operational: initialOperationalState(), account: accountState(l), proposal: {side: 'LAY', odds: '3'}});
  assert.equal(r.decision, 'REDUCE'); assert.equal(r.adjusted_stake, '10'); assert.equal(r.adjusted_liability, '20');
  assert.deepEqual(r.hard_caps_triggered, ['max_liability']);
});

test('advisory proposal never mutates the ledger; STOP/RESUME audited; PAUSED blocks', () => {
  const l = newLedger();
  const p = createProfile({profileId: 'mm', model: 'FIXED_STAKE', params: {stake: '10'}});
  let op = stopOperations(initialOperationalState(), who);
  const n = l.entries.length;
  const r = proposePaperTrade(l, {profile: p, operational: op, proposal: {side: 'BACK', odds: '2'}, commissionRate: '0.05', settingsSnapshotId: 's', positionId: 'x', idempotencyKey: 'k', at: AT});
  assert.equal(r.decision.decision, 'SIMULATION_ONLY'); assert.equal(r.decision.label, ADVISORY_LABEL);
  assert.equal(r.decision.adjusted_stake, '10'); assert.equal(r.ledger_mutation, false); assert.equal(l.entries.length, n);
  op = resumeOperations(op, who);
  assert.deepEqual(op.audit.map(a => a.to), ['ADVISORY_ONLY', 'ACTIVE_OPERATIONAL']);
  assert.equal(proposePaperTrade(l, {profile: p, operational: op, proposal: {side: 'BACK', odds: '2'}, commissionRate: '0.05', settingsSnapshotId: 's', positionId: 'x', idempotencyKey: 'k', at: AT}).ledger_mutation, true);
  assert.throws(() => stopOperations(op, {who: 'owner'}), {code: 'BAD_INPUT'});
  const paused = evaluate({profile: p, operational: pauseOperations(op, who), account: accountState(l), proposal: {side: 'BACK', odds: '2'}});
  assert.equal(paused.decision, 'BLOCK'); assert.equal(paused.execution_permission, false);
});
