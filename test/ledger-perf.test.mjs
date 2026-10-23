// LEDGER-PERF-01: the incremental replay of the paper ledger gives exactly the state of a replay from scratch, after every
// operation of random sequences (open, hedge, settle, correct, scopes, LAY/BACK), and callers' copies never change later.
import assert from 'node:assert/strict';
import test from 'node:test';
import {accountState, correctSettlement, createLedger, exposureOf, hedgePosition, openPosition, replay, settlePosition} from '../src/ledger/paper-ledger.mjs';
import {Decimal, dec} from '../src/math/decimal.mjs';

const SCOPES = ['match', 'market', 'league', 'strategy'];
// The replay of main before LEDGER-PERF-01, verbatim: the independent oracle of the incremental one.
function referenceReplay(ledger) {
  const positions = new Map();
  let cash = Decimal.zero(), realized = Decimal.zero(), commission = Decimal.zero(), allocated = Decimal.zero();
  for (const e of ledger.entries) {
    const a = e.amount === undefined ? null : dec(e.amount);
    switch (e.type) {
      case 'INITIAL_ALLOCATION': cash = cash.add(a); allocated = allocated.add(a); break;
      case 'OPEN': case 'HEDGE': {
        const p = positions.get(e.position_id) || {position_id: e.position_id, legs: [], status: 'OPEN', commission_rate: e.commission_rate,
          settings_snapshot_id: e.settings_snapshot_id, scope: e.scope ?? null, market: e.market ?? null, settlement: null, settlement_version: 0,
          resolution: null, history: []};
        p.legs.push({side: e.side, odds: dec(e.odds), stake: dec(e.stake)});
        positions.set(e.position_id, p); break;
      }
      case 'SETTLEMENT_GROSS': realized = realized.add(a); cash = cash.add(a); break;
      case 'COMMISSION': commission = commission.add(a); cash = cash.sub(a); realized = realized.sub(a); break;
      case 'SETTLEMENT_NET': {
        const p = positions.get(e.position_id);
        p.status = e.outcome === 'WIN' ? 'WON' : e.outcome === 'LOSE' ? 'LOST' : e.outcome;
        p.settlement = e.outcome; p.settlement_version = e.settlement_version; p.resolution = e.resolution ?? null; p.history.push(e.seq); break;
      }
      case 'REVERSAL': {
        cash = cash.sub(dec(e.gross)).add(dec(e.commission));
        realized = realized.sub(dec(e.gross)).add(dec(e.commission));
        commission = commission.sub(dec(e.commission));
        const p = positions.get(e.position_id); p.status = 'SETTLEMENT_PENDING'; p.settlement = null; p.history.push(e.seq); break;
      }
      default: throw new Error(`unknown entry ${e.type}`);
    }
  }
  let reserved = Decimal.zero(), openCount = 0;
  const byScope = Object.fromEntries(SCOPES.map(k => [k, new Map()]));
  for (const p of positions.values()) {
    p.exposure = exposureOf(p.legs);
    if (p.settlement === null) {
      reserved = reserved.add(p.exposure); openCount++;
      for (const [k, id] of Object.entries(p.scope ?? {})) byScope[k].set(id, (byScope[k].get(id) ?? Decimal.zero()).add(p.exposure));
    }
  }
  return {positions, cash, reserved, realized, commission, allocated, openCount, byScope};
}


const rng = seed => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
// A ledger object with the same entries but a new identity has no cached state: its replay starts from scratch.
const fromScratch = ledger => ({...ledger, entries: [...ledger.entries]});
const view = r => ({cash: r.cash.toString(), reserved: r.reserved.toString(), realized: r.realized.toString(), commission: r.commission.toString(),
  allocated: r.allocated.toString(), openCount: r.openCount, byScope: Object.fromEntries(Object.entries(r.byScope).map(([k, m]) => [k, [...m].map(([id, v]) => [id, v.toString()])])),
  positions: [...r.positions.keys()].sort().map(id => { const p = r.positions.get(id); return [id, p.status, p.settlement, p.settlement_version, p.exposure.toString(), p.legs.length, p.history.join(',')]; })});

test('incremental replay equals a replay from scratch after every operation (seeded random sequences)', () => {
  const AT = '2026-10-23T12:00:00Z';
  for (let round = 0; round < 60; round++) {
    const next = rng(1000 + round);
    const l = createLedger({accountId: 'perf', initialAllocation: '100000', at: AT});
    const ids = [];
    let k = 0;
    for (let step = 0; step < 60; step++) {
      const r = next();
      const key = `k${k++}`;
      try {
        if (r < 0.45 || ids.length === 0) {
          const id = `p${ids.length}`; ids.push(id);
          const scope = next() < 0.5 ? {match: `m${Math.floor(next() * 4)}`, league: `l${Math.floor(next() * 2)}`} : undefined;
          openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: id, side: next() < 0.5 ? 'BACK' : 'LAY', odds: (1.1 + next() * 8).toFixed(2), stake: (1 + next() * 50).toFixed(2),
            commissionRate: ['0', '0.02', '0.05'][Math.floor(next() * 3)], settingsSnapshotId: 's', idempotencyKey: key, at: AT, scope});
        } else {
          const id = ids[Math.floor(next() * ids.length)];
          const p = replay(l).positions.get(id);
          if (r < 0.6 && p.settlement === null) hedgePosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: id, side: next() < 0.5 ? 'BACK' : 'LAY', odds: (1.1 + next() * 8).toFixed(2), stake: (1 + next() * 20).toFixed(2), idempotencyKey: key, at: AT});
          else if (r < 0.85 && p.settlement === null) settlePosition(l, {positionId: id, outcome: ['WIN', 'LOSE', 'VOID'][Math.floor(next() * 3)], settlementVersion: p.settlement_version + 1, idempotencyKey: key, at: AT});
          else if (p.settlement !== null) correctSettlement(l, {positionId: id, outcome: p.settlement === 'WIN' ? 'LOSE' : 'WIN', reason: 'r', idempotencyKey: key, at: AT});
        }
      } catch (error) { if (!['INSUFFICIENT_AVAILABLE_BANKROLL', 'HEDGE_NOT_REDUCING'].includes(error.code)) throw error; }
      assert.deepEqual(view(replay(l)), view(referenceReplay(l)), `round ${round} step ${step}`);
      assert.deepEqual(view(replay(fromScratch(l))), view(referenceReplay(l)), `scratch ${round} step ${step}`);
      assert.deepEqual(accountState(l), accountState(fromScratch(l)), `account ${round} step ${step}`);
    }
  }
});

test('a position read from a replay is a copy: later operations never change it', () => {
  const AT = '2026-10-23T12:00:00Z';
  const l = createLedger({accountId: 'copy', initialAllocation: '100', at: AT});
  openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'a', side: 'BACK', odds: '2', stake: '10', commissionRate: '0', settingsSnapshotId: 's', idempotencyKey: 'o', at: AT});
  const before = replay(l).positions.get('a');
  settlePosition(l, {positionId: 'a', outcome: 'WIN', idempotencyKey: 's', at: AT});
  assert.deepEqual([before.settlement, before.history.length], [null, 0]);
  before.legs.push({side: 'BACK'});
  assert.equal(replay(l).positions.get('a').legs.length, 1, 'mutating a copy does not touch the ledger state');
  // Entries replaced (not an extension of the cached ones) are rebuilt from scratch.
  const forged = {...l, entries: l.entries.slice(0, 2)};
  assert.equal(replay(forged).positions.get('a').settlement, null);
});

test('scope keys keep the full replay order after a hedge, and a replaced last entry rebuilds the state', () => {
  const AT = '2026-10-23T12:00:00Z';
  const l = createLedger({accountId: 'order', initialAllocation: '100', at: AT});
  openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'a', side: 'BACK', odds: '2', stake: '15', commissionRate: '0', settingsSnapshotId: 's', idempotencyKey: 'oa', at: AT, scope: {match: 'm1'}});
  openPosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'b', side: 'BACK', odds: '2', stake: '10', commissionRate: '0', settingsSnapshotId: 's', idempotencyKey: 'ob', at: AT, scope: {match: 'm2'}});
  replay(l);
  hedgePosition(l, {mode: 'ACTIVE_OPERATIONAL', positionId: 'a', side: 'LAY', odds: '3', stake: '2', idempotencyKey: 'ha', at: AT});
  assert.equal(JSON.stringify(accountState(l).open_exposure_by_scope), JSON.stringify(accountState(fromScratch(l)).open_exposure_by_scope));
  assert.deepEqual([...replay(l).byScope.match.keys()], ['m1', 'm2']);
  // Same length, different last entry: not an extension, so the cached state is not reused.
  const forged = {...l, entries: l.entries.slice(0, 3)};
  replay(forged);
  forged.entries[2] = {...forged.entries[2], stake: '5'};
  assert.deepEqual(view(replay(forged)), view(referenceReplay(forged)));
  assert.equal(replay(forged).reserved.toString(), '20');
});

test('an entry that throws leaves no half-applied state in the cache', () => {
  const AT = '2026-10-23T12:00:00Z';
  const l = createLedger({accountId: 'throw', initialAllocation: '100', at: AT});
  replay(l);
  // A reversal of an unknown position changes the cash before it fails on the position.
  l.entries.push({type: 'REVERSAL', seq: 1, position_id: 'ghost', gross: '30', commission: '0'});
  assert.throws(() => replay(l));
  l.entries.pop();
  assert.equal(replay(l).cash.toString(), referenceReplay(l).cash.toString());
});
