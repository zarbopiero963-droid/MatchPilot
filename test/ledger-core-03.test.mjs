// LEDGER-CORE-03 (#99 x #100): paper positions settled from the canonical market rules and the versioned result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {accountState, createLedger, openPosition, settlePosition} from '../src/ledger/paper-ledger.mjs';
import {settleFromResult} from '../src/ledger/settlement.mjs';
import {fromFutPythonTrader, fromTotalCorner} from '../src/markets/outcomes.mjs';

const AT = '2026-10-23T12:00:00Z';
const fpt = (version, h, a, acquired_at, status = 'FINAL') =>
  fromFutPythonTrader({version, status, home_score: h, away_score: a, acquired_at, snapshot_id: `s${version}`});
const ledger = () => createLedger({accountId: 'paper-1', initialAllocation: '1000', at: AT});
const open = (l, positionId, side, odds, stake, market) => openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId, side, odds, stake,
  commissionRate: '0.05', settingsSnapshotId: 'set-1', idempotencyKey: `open:${positionId}`, at: AT, market});
const settle = (l, positionId, versions, asOf = '2026-10-30T00:00:00Z') => settleFromResult(l, {positionId, versions, asOf, at: AT});
const MO_HOME = {marketType: 'MATCH_ODDS', selection: 'HOME'};
const lastNet = (l, id) => l.entries.filter(e => e.type === 'SETTLEMENT_NET' && e.position_id === id).at(-1);

test('BACK and LAY settle from the #100 rule on a validated FPT final: exact P/L, commission, reconciliation', () => {
  const l = ledger();
  open(l, 'b1', 'BACK', '2.2', '10', MO_HOME);
  open(l, 'l1', 'LAY', '3', '20', {marketType: 'OVER_UNDER', selection: 'OVER', line: '2.5'});
  assert.equal(accountState(l).reserved_funds, '50');                       // 10 + 20*(3-1)
  const b = settle(l, 'b1', [fpt(1, 2, 1, '2026-10-20T21:00:00Z')]);        // HOME wins
  assert.deepEqual([b.status, b.outcome, b.ledger_mutation], ['SETTLED', 'WIN', true]);
  const lay = settle(l, 'l1', [fpt(1, 1, 1, '2026-10-20T21:00:00Z')]);      // 2 goals: OVER 2.5 loses, the LAY wins
  assert.deepEqual([lay.status, lay.outcome], ['SETTLED', 'LOSE']);
  assert.equal(lastNet(l, 'b1').net, '11.4');                                // 12 gross - 0.60 commission
  assert.equal(lastNet(l, 'l1').net, '19');                                  // 20 gross - 1.00 commission
  const s = accountState(l);
  assert.deepEqual([s.cash_balance, s.reserved_funds, s.realized_pnl, s.settled_commission, s.open_position_count, s.reconciled],
    ['1030.4', '0', '30.4', '1.6', 0, true]);
  // provenance of the outcome is kept on the settlement entry
  assert.deepEqual({...lastNet(l, 'b1').resolution}, {market_rule_id: 'MATCH_ODDS@v2', rule_version: 2, provider: 'futpythontrader',
    outcome_version: 1, provenance: 'futpythontrader:snapshot:s1', recorded_at: '2026-10-20T21:00:00Z', corrected: false,
    correction_timestamp: null, as_of: '2026-10-30T00:00:00Z', winning_selection: 'HOME'});
});

test('no validated final, non-final status or an unresolvable market: PENDING and the ledger is untouched (no VOID invented)', () => {
  const l = ledger();
  open(l, 'b1', 'BACK', '2', '10', MO_HOME);
  open(l, 'ht', 'BACK', '2', '10', {marketType: 'HT_MATCH_ODDS', selection: 'HOME'});
  const before = l.entries.length;
  assert.deepEqual({...settle(l, 'b1', [fpt(1, null, null, '2026-10-20T21:00:00Z', 'NO_RESULT')])},
    {status: 'PENDING', ledger_mutation: false, position_id: 'b1', reason: 'NO_VALIDATED_FINAL'});
  const half = fromTotalCorner({version: 1, status: 'half', hg: '1', ag: '0', acquired_at: '2026-10-20T20:00:00Z', raw_id: 9});
  assert.equal(settle(l, 'b1', [half]).reason, 'NO_VALIDATED_FINAL');
  assert.equal(settle(l, 'b1', [fpt(1, 2, 1, '2026-11-01T00:00:00Z')], '2026-10-30T00:00:00Z').status, 'PENDING', 'a result recorded after asOf is not used');
  // FPT has no half-time score: the HT market stays unresolved
  assert.equal(settle(l, 'ht', [fpt(1, 2, 1, '2026-10-20T21:00:00Z')]).reason, 'MISSING_HT_HOME_HT_AWAY');
  assert.equal(l.entries.length, before);
  assert.equal(accountState(l).reserved_funds, '20');
  assert.ok(!l.entries.some(e => e.outcome === 'VOID'));
});

test('idempotent: the same result version applied twice writes nothing the second time', () => {
  const l = ledger();
  open(l, 'b1', 'BACK', '2', '10', MO_HOME);
  const v = [fpt(1, 2, 1, '2026-10-20T21:00:00Z')];
  assert.equal(settle(l, 'b1', v).status, 'SETTLED');
  const n = l.entries.length;
  const again = settle(l, 'b1', v);
  assert.deepEqual([again.status, again.ledger_mutation, again.applied_outcome_version], ['UNCHANGED', false, 1]);
  assert.equal(l.entries.length, n);
});

test('corrected result (DEC-002): a later version with another outcome appends REVERSAL and a new settlement, history kept', () => {
  const l = ledger();
  open(l, 'b1', 'BACK', '2', '10', MO_HOME);
  const v1 = fpt(1, 2, 1, '2026-10-20T21:00:00Z');
  settle(l, 'b1', [v1]);
  assert.equal(accountState(l).cash_balance, '1009.5');                   // +10 - 0.50
  const v2 = fpt(2, 2, 2, '2026-10-21T09:00:00Z');                          // corrected to a draw: HOME loses
  const c = settle(l, 'b1', [v1, v2]);
  assert.deepEqual([c.status, c.outcome, c.previous_outcome, c.resolution.outcome_version, c.resolution.corrected],
    ['CORRECTED', 'LOSE', 'WIN', 2, true]);
  assert.deepEqual(l.entries.slice(-4).map(e => e.type), ['REVERSAL', 'SETTLEMENT_GROSS', 'COMMISSION', 'SETTLEMENT_NET']);
  assert.match(l.entries.at(-4).reason, /result correction v1 -> v2 \(futpythontrader:snapshot:s2\)/);
  assert.deepEqual([lastNet(l, 'b1').settlement_version, lastNet(l, 'b1').corrects_version, lastNet(l, 'b1').resolution.correction_timestamp],
    [2, 1, '2026-10-21T09:00:00Z']);
  const s = accountState(l);
  assert.deepEqual([s.cash_balance, s.realized_pnl, s.settled_commission, s.reconciled], ['990', '-10', '0', true]);
  // the corrected result applied again: nothing new
  const n = l.entries.length;
  assert.equal(settle(l, 'b1', [v1, v2]).status, 'UNCHANGED');
  assert.equal(l.entries.length, n);
});

test('a later version with the same outcome writes nothing; an older result than the applied one is refused', () => {
  const l = ledger();
  open(l, 'b1', 'BACK', '2', '10', MO_HOME);
  const v1 = fpt(1, 2, 1, '2026-10-20T21:00:00Z'), v2 = fpt(2, 3, 1, '2026-10-21T09:00:00Z'), v3 = fpt(3, 1, 1, '2026-10-22T09:00:00Z');
  settle(l, 'b1', [v1]);
  const n = l.entries.length;
  const same = settle(l, 'b1', [v1, v2]);                                    // 3-1: HOME still wins
  assert.deepEqual([same.status, same.ledger_mutation, same.latest_outcome_version], ['UNCHANGED', false, 2]);
  assert.equal(l.entries.length, n);
  settle(l, 'b1', [v1, v2, v3]);                                             // corrected to 1-1
  assert.equal(lastNet(l, 'b1').resolution.outcome_version, 3);
  assert.throws(() => settle(l, 'b1', [v1, v2, v3], '2026-10-21T12:00:00Z'), {code: 'STALE_RESULT'});
});

test('fail closed: no market binding, unknown market, manual settlement, provider change, mixed providers', () => {
  const l = ledger();
  open(l, 'nb', 'BACK', '2', '10');
  assert.throws(() => settle(l, 'nb', [fpt(1, 2, 1, '2026-10-20T21:00:00Z')]), {code: 'MARKET_BINDING_MISSING'});
  assert.throws(() => open(l, 'x', 'BACK', '2', '10', {marketType: 'ASIAN_HANDICAP', selection: 'HOME'}), {code: 'UNKNOWN_MARKET'});
  assert.throws(() => open(l, 'y', 'BACK', '2', '10', {marketType: 'MATCH_ODDS'}), {code: 'BAD_INPUT'});
  assert.throws(() => settle(l, 'missing', []), {code: 'UNKNOWN_POSITION'});
  open(l, 'm', 'BACK', '2', '10', MO_HOME);
  settlePosition(l, {positionId: 'm', outcome: 'WIN', idempotencyKey: 'manual', at: AT});
  assert.throws(() => settle(l, 'm', [fpt(1, 2, 1, '2026-10-20T21:00:00Z')]), {code: 'MANUAL_SETTLEMENT'});
  open(l, 'p', 'BACK', '2', '10', MO_HOME);
  settle(l, 'p', [fpt(1, 2, 1, '2026-10-20T21:00:00Z')]);
  const tc = fromTotalCorner({version: 2, status: 'full', hg: 0, ag: 1, acquired_at: '2026-10-21T21:00:00Z', raw_id: 1});
  assert.throws(() => settle(l, 'p', [tc]), {code: 'PROVIDER_CHANGED'});
  assert.throws(() => settle(l, 'p', [fpt(1, 2, 1, '2026-10-20T21:00:00Z'), tc]), {code: 'MIXED_PROVIDERS'});
  assert.equal(accountState(l).reconciled, true);
});

test('the market binding is part of the open fingerprint: same key with another market is an idempotency conflict', () => {
  const l = ledger();
  open(l, 'b1', 'BACK', '2', '10', MO_HOME);
  assert.equal(open(l, 'b1', 'BACK', '2', '10', MO_HOME).status, 'ALREADY_APPLIED');
  assert.throws(() => open(l, 'b1', 'BACK', '2', '10', {marketType: 'MATCH_ODDS', selection: 'AWAY'}), {code: 'IDEMPOTENCY_CONFLICT'});
});
