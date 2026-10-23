// LEDGER-CORE (#99), paper only: append-only ledger of virtual positions with decimal arithmetic (DEC-013), STOP /
// ADVISORY_ONLY boundary (DEC-001) and idempotent, versioned settlement with reversal. Pure: no DB, no network, no
// clock (the caller passes `at`). Simulated money only; nothing here can place a real order.
import {Decimal, dec, sum} from '../math/decimal.mjs';
import {validateMarketSpec} from '../markets/rules.mjs';

export const LEDGER_VERSION = 'mp-paper-ledger-1';
export const MODES = Object.freeze(['ACTIVE_OPERATIONAL', 'ADVISORY_ONLY', 'PAUSED', 'ARCHIVED']);
export const OUTCOMES = Object.freeze(['WIN', 'LOSE', 'VOID', 'PUSH']);
export const SIDES = Object.freeze(['BACK', 'LAY']);

export class LedgerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, msg) => { throw new LedgerError(code, msg); };

const positive = (field, v) => {
  let d; try { d = dec(v); } catch (e) { fail('BAD_INPUT', `${field}: ${e.message}`); }
  if (!d.gt(0)) fail('BAD_INPUT', `${field} must be > 0`);
  return d;
};
const rate = v => {
  let d; try { d = dec(v); } catch (e) { fail('BAD_INPUT', `commission_rate: ${e.message}`); }
  if (d.lt(0) || d.gte(1)) fail('BAD_INPUT', 'commission_rate must be in [0, 1)');
  return d;
};
const text = (field, v) => (typeof v === 'string' && v.trim() ? v : fail('BAD_INPUT', `${field} is required`));

// P/L of one leg on a single selection: if it wins / if it loses.
function legPl({side, odds, stake}) {
  const profit = stake.mul(odds.sub(1));
  return side === 'BACK' ? {win: profit, lose: stake.neg()} : {win: profit.neg(), lose: stake};
}
function positionPl(legs) {
  return {win: sum(legs.map(l => legPl(l).win)), lose: sum(legs.map(l => legPl(l).lose))};
}
// Worst-case loss of the position (>= 0): the amount that must stay reserved.
export function exposureOf(legs) {
  const {win, lose} = positionPl(legs);
  const worst = win.lt(lose) ? win : lose;
  return worst.isNegative() ? worst.neg() : Decimal.zero();
}

export function createLedger({accountId, initialAllocation, at}) {
  const ledger = {account_id: text('account_id', accountId), version: LEDGER_VERSION, entries: [], keys: new Map()};
  append(ledger, {type: 'INITIAL_ALLOCATION', amount: positive('initial_allocation', initialAllocation), at});
  return ledger;
}

function append(ledger, entry) {
  const e = Object.freeze({seq: ledger.entries.length + 1, ...entry,
    ...(entry.amount !== undefined ? {amount: dec(entry.amount).toString()} : {})});
  ledger.entries.push(e);
  return e;
}

// Rebuilds positions and balances from the entries only (the entries are the single source of truth).
// LEDGER-PERF-01: the ledger is append-only, so the state of the first n entries is kept and only the new entries are
// applied; reserved funds, open count and per-scope exposure are maintained as each entry changes a position. When the
// entries are not an extension of the cached ones (fewer entries, or a different last entry), the state is rebuilt from
// scratch. Callers receive copies of the positions, so nothing they hold changes after a later append.
const states = new WeakMap();
function freshState() {
  return {n: 0, last: null, positions: new Map(), cash: Decimal.zero(), realized: Decimal.zero(), commission: Decimal.zero(),
    allocated: Decimal.zero(), reserved: Decimal.zero(), openCount: 0,
    byScope: Object.fromEntries(SCOPES.map(k => [k, new Map()])), scopeOpen: Object.fromEntries(SCOPES.map(k => [k, new Map()]))};
}
// Adds (sign 1) or removes (sign -1) an open position's exposure from the reserved totals.
function reserve(st, p, sign) {
  const x = sign > 0 ? p.exposure : p.exposure.neg();
  st.reserved = st.reserved.add(x); st.openCount += sign;
  // scopeOpen holds, per scope id, the creation ranks of its open positions: the full replay lists the scope ids in the
  // order of their earliest open position, and replay() restores that order.
  for (const [k, id] of Object.entries(p.scope ?? {})) {
    const open = st.scopeOpen[k].get(id) ?? new Set();
    if (sign > 0) open.add(p.rank); else open.delete(p.rank);
    if (open.size === 0) { st.scopeOpen[k].delete(id); st.byScope[k].delete(id); }
    else { st.scopeOpen[k].set(id, open); st.byScope[k].set(id, (st.byScope[k].get(id) ?? Decimal.zero()).add(x)); }
  }
}
function earliest(set) { let m = Infinity; for (const r of set) if (r < m) m = r; return m; }
function applyEntry(st, e) {
  const a = e.amount === undefined ? null : dec(e.amount);
  switch (e.type) {
    case 'INITIAL_ALLOCATION': st.cash = st.cash.add(a); st.allocated = st.allocated.add(a); break;
    case 'OPEN': case 'HEDGE': {
      let p = st.positions.get(e.position_id);
      if (!p) {
        p = {position_id: e.position_id, legs: [], status: 'OPEN', commission_rate: e.commission_rate,
          settings_snapshot_id: e.settings_snapshot_id, scope: e.scope ?? null, market: e.market ?? null, settlement: null, settlement_version: 0,
          resolution: null, history: [], exposure: Decimal.zero()};
        Object.defineProperty(p, 'rank', {value: st.positions.size});
        st.positions.set(e.position_id, p);
      } else if (p.settlement === null) reserve(st, p, -1);
      p.legs.push({side: e.side, odds: dec(e.odds), stake: dec(e.stake)});
      p.exposure = exposureOf(p.legs);
      if (p.settlement === null) reserve(st, p, 1);
      break;
    }
    case 'SETTLEMENT_GROSS': st.realized = st.realized.add(a); st.cash = st.cash.add(a); break;
    case 'COMMISSION': st.commission = st.commission.add(a); st.cash = st.cash.sub(a); st.realized = st.realized.sub(a); break;
    case 'SETTLEMENT_NET': {
      const p = st.positions.get(e.position_id);
      if (p.settlement === null) reserve(st, p, -1);
      p.status = e.outcome === 'WIN' ? 'WON' : e.outcome === 'LOSE' ? 'LOST' : e.outcome;
      p.settlement = e.outcome; p.settlement_version = e.settlement_version; p.resolution = e.resolution ?? null; p.history.push(e.seq); break;
    }
    case 'REVERSAL': {
      st.cash = st.cash.sub(dec(e.gross)).add(dec(e.commission));
      st.realized = st.realized.sub(dec(e.gross)).add(dec(e.commission));
      st.commission = st.commission.sub(dec(e.commission));
      const p = st.positions.get(e.position_id);
      const wasOpen = p.settlement === null;
      p.status = 'SETTLEMENT_PENDING'; p.settlement = null; p.history.push(e.seq);
      if (!wasOpen) reserve(st, p, 1);
      break;
    }
    default: fail('INTERNAL', `unknown entry ${e.type}`);
  }
}
const copyOf = p => ({...p, legs: p.legs.map(l => ({...l})), history: [...p.history]});
export function replay(ledger) {
  let st = states.get(ledger);
  const entries = ledger.entries;
  if (!st || entries.length < st.n || (st.n > 0 && entries[st.n - 1] !== st.last)) st = freshState();
  try { for (let i = st.n; i < entries.length; i++) { applyEntry(st, entries[i]); st.n = i + 1; st.last = entries[i]; } }
  catch (error) { states.delete(ledger); throw error; } // a half-applied entry never stays in the cache
  st.n = entries.length; st.last = entries.at(-1) ?? null;
  states.set(ledger, st);
  // A read-only view: each position is copied when it is read, so a replay costs nothing per unread position.
  const live = st.positions;
  const positions = Object.freeze({get: id => (live.has(id) ? copyOf(live.get(id)) : undefined), has: id => live.has(id), get size() { return live.size; },
    keys: () => live.keys(), values: () => [...live.values()].map(copyOf), entries: () => [...live].map(([id, p]) => [id, copyOf(p)]),
    [Symbol.iterator]() { return this.entries()[Symbol.iterator](); }});
  const byScope = Object.fromEntries(SCOPES.map(k => [k, new Map([...st.byScope[k]].map(([id, v]) => [earliest(st.scopeOpen[k].get(id)), id, v])
    .sort((a, b) => a[0] - b[0]).map(([, id, v]) => [id, v]))]));
  return {positions, cash: st.cash, reserved: st.reserved, realized: st.realized, commission: st.commission, allocated: st.allocated,
    openCount: st.openCount, byScope};
}

export function accountState(ledger) {
  const r = replay(ledger);
  const s = x => x.toString();
  return Object.freeze({account_id: ledger.account_id, ledger_version: LEDGER_VERSION, entries: ledger.entries.length,
    cash_balance: s(r.cash), reserved_funds: s(r.reserved), open_liability: s(r.reserved),
    available_bankroll: s(r.cash.sub(r.reserved)), realized_pnl: s(r.realized), settled_commission: s(r.commission),
    unrealized_pnl: null /* needs live prices: not computed, never invented */, equity: s(r.cash),
    open_position_count: r.openCount,
    // Open exposure per scope tag (only positions opened with a scope). #96 reads it for per-scope caps.
    open_exposure_by_scope: Object.freeze(Object.fromEntries(Object.entries(r.byScope).map(([k, m]) =>
      [k, Object.freeze(Object.fromEntries([...m].map(([id, v]) => [id, v.toString()])))]))),
    // Reconciliation gate (#99): allocation + realized net P/L = cash, to the unit.
    reconciled: r.allocated.add(r.realized).eq(r.cash)});
}

function idempotent(ledger, key, fingerprint) {
  text('idempotency_key', key);
  if (!ledger.keys.has(key)) return null;
  const prev = ledger.keys.get(key);
  if (prev.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', `key ${key} reused with different content`);
  return {status: 'ALREADY_APPLIED', entries: prev.entries};
}
const remember = (ledger, key, fingerprint, entries) => {
  ledger.keys.set(key, {fingerprint, entries: entries.map(e => e.seq)});
  return {status: 'APPLIED', entries: entries.map(e => e.seq)};
};

// New virtual position. DEC-001: refused outside ACTIVE_OPERATIONAL; no entry is written.
const SCOPES = Object.freeze(['match', 'market', 'league', 'strategy']);
// Optional exposure scope tags (#96 "max exposure per partita/mercato/campionato/strategia"). Plain ids, no semantics.
function scopeOf(scope) {
  if (scope === undefined || scope === null) return null;
  for (const k of Object.keys(scope)) if (!SCOPES.includes(k)) fail('BAD_INPUT', `unknown scope ${k}`);
  // In the fixed SCOPES order, so the idempotency fingerprint does not depend on the caller's key order (a persisted key
  // is compared again after a restart).
  const out = {};
  for (const k of SCOPES) if (scope[k] !== undefined && scope[k] !== null) out[k] = text(`scope.${k}`, scope[k]);
  return Object.keys(out).length ? Object.freeze(out) : null;
}
// Optional market binding (LEDGER-CORE-03): the #100 market the position's selection belongs to, so that settlement
// resolves it with the canonical rule instead of an outcome typed by the caller.
function marketOf(market) {
  if (market === undefined || market === null) return null;
  if (typeof market !== 'object' || Array.isArray(market)) fail('BAD_INPUT', 'market must be an object');
  try { validateMarketSpec(market); } catch (e) { fail(e.code || 'BAD_INPUT', `market: ${e.message}`); }
  const out = {marketType: market.marketType, selection: market.selection};
  if (market.line !== undefined && market.line !== null) out.line = text('market.line', market.line);
  if (market.team !== undefined && market.team !== null) out.team = text('market.team', market.team);
  return Object.freeze(out);
}
export function openPosition(ledger, {mode, positionId, side, odds, stake, commissionRate, settingsSnapshotId, idempotencyKey, at, scope, market}) {
  if (!MODES.includes(mode)) fail('BAD_INPUT', `unknown mode ${mode}`);
  if (mode !== 'ACTIVE_OPERATIONAL') fail('OPEN_BLOCKED_BY_MODE', `${mode}: no new virtual position can be opened (DEC-001)`);
  if (!SIDES.includes(side)) fail('BAD_INPUT', `side must be BACK or LAY`);
  const o = positive('odds', odds); if (!o.gt(1)) fail('BAD_INPUT', 'odds must be > 1');
  const leg = {side, odds: o, stake: positive('stake', stake)};
  const cr = rate(commissionRate); text('settings_snapshot_id', settingsSnapshotId); text('position_id', positionId);
  const sc = scopeOf(scope);
  const mk = marketOf(market);
  const fp = JSON.stringify(['OPEN', positionId, side, o, leg.stake, cr, settingsSnapshotId, sc, ...(mk ? [mk] : [])]);
  const again = idempotent(ledger, idempotencyKey, fp); if (again) return again;
  const r = replay(ledger);
  if (r.positions.has(positionId)) fail('POSITION_EXISTS', positionId);
  const need = exposureOf([leg]);
  if (need.gt(r.cash.sub(r.reserved))) fail('INSUFFICIENT_AVAILABLE_BANKROLL', `needs ${need}, available ${r.cash.sub(r.reserved)}`);
  const e = append(ledger, {type: 'OPEN', position_id: positionId, side, odds: o.toString(), stake: leg.stake.toString(),
    commission_rate: cr.toString() /* DEC-013: fixed at the simulated fill */, settings_snapshot_id: settingsSnapshotId,
    reserved: need.toString(), ...(sc ? {scope: sc} : {}), ...(mk ? {market: mk} : {}), at});
  return remember(ledger, idempotencyKey, fp, [e]);
}

// Hedge / close / cash-out leg on an existing open position. Allowed in every mode, but outside ACTIVE_OPERATIONAL only
// when it strictly reduces that position's exposure (DEC-001). The commission rate stays the one fixed at the first fill.
export function hedgePosition(ledger, {mode, positionId, side, odds, stake, idempotencyKey, at}) {
  if (!MODES.includes(mode)) fail('BAD_INPUT', `unknown mode ${mode}`);
  if (!SIDES.includes(side)) fail('BAD_INPUT', 'side must be BACK or LAY');
  const o = positive('odds', odds); if (!o.gt(1)) fail('BAD_INPUT', 'odds must be > 1');
  const leg = {side, odds: o, stake: positive('stake', stake)};
  const fp = JSON.stringify(['HEDGE', positionId, side, o, leg.stake]);
  const again = idempotent(ledger, idempotencyKey, fp); if (again) return again;
  const r = replay(ledger);
  const p = r.positions.get(positionId);
  if (!p) fail('UNKNOWN_POSITION', positionId);
  if (p.settlement !== null) fail('POSITION_SETTLED', positionId);
  const before = p.exposure, after = exposureOf([...p.legs, leg]);
  if (mode !== 'ACTIVE_OPERATIONAL' && !after.lt(before)) fail('HEDGE_NOT_REDUCING', `${mode}: exposure ${before} -> ${after} is not a reduction (DEC-001)`);
  if (after.sub(before).gt(r.cash.sub(r.reserved))) fail('INSUFFICIENT_AVAILABLE_BANKROLL', 'hedge increases exposure beyond available bankroll');
  const e = append(ledger, {type: 'HEDGE', position_id: positionId, side, odds: o.toString(), stake: leg.stake.toString(),
    exposure_before: before.toString(), exposure_after: after.toString(), at});
  return remember(ledger, idempotencyKey, fp, [e]);
}

function settlementEntries(ledger, p, outcome, version, at, extra = {}) {
  const pl = positionPl(p.legs);
  const gross = outcome === 'WIN' ? pl.win : outcome === 'LOSE' ? pl.lose : Decimal.zero(); // VOID/PUSH: stake returned, P/L 0
  // Commission on the position's positive net winnings at the rate fixed at the fill (DEC-013), rounded to the cent.
  const commission = gross.gt(0) ? gross.mul(p.commission_rate).round(2) : Decimal.zero();
  return [
    append(ledger, {type: 'SETTLEMENT_GROSS', position_id: p.position_id, amount: gross, settlement_version: version, at}),
    append(ledger, {type: 'COMMISSION', position_id: p.position_id, amount: commission, commission_rate_used: p.commission_rate,
      settings_snapshot_id: p.settings_snapshot_id, settlement_version: version, at}),
    append(ledger, {type: 'SETTLEMENT_NET', position_id: p.position_id, outcome, net: gross.sub(commission).toString(),
      settlement_version: version, at, ...extra}),
  ];
}

// Final settlement of a position (any mode: STOP never prevents accounting of existing positions, DEC-001).
// Idempotent per (position, version); a second settlement of an already settled position is refused.
// `resolution` (optional) records how the outcome was obtained (rule, result version, provenance): see settlement.mjs.
export function settlePosition(ledger, {positionId, outcome, settlementVersion = 1, idempotencyKey, at, resolution}) {
  if (!OUTCOMES.includes(outcome)) fail('BAD_INPUT', `outcome must be one of ${OUTCOMES}`);
  if (!Number.isSafeInteger(settlementVersion) || settlementVersion < 1) fail('BAD_INPUT', 'settlement_version must be a positive integer');
  const fp = JSON.stringify(['SETTLE', positionId, outcome, settlementVersion, ...(resolution ? [resolution] : [])]);
  const again = idempotent(ledger, idempotencyKey, fp); if (again) return again;
  const p = replay(ledger).positions.get(positionId);
  if (!p) fail('UNKNOWN_POSITION', positionId);
  if (p.settlement !== null || p.settlement_version >= settlementVersion) fail('DOUBLE_SETTLEMENT', `${positionId} already settled (v${p.settlement_version})`);
  return remember(ledger, idempotencyKey, fp, settlementEntries(ledger, p, outcome, settlementVersion, at, resolution ? {resolution} : {}));
}

// Result correction (#99 Reversal): append REVERSAL of the previous settlement, then the new one with version + 1.
// History is never edited.
export function correctSettlement(ledger, {positionId, outcome, reason, idempotencyKey, at, resolution}) {
  if (!OUTCOMES.includes(outcome)) fail('BAD_INPUT', `outcome must be one of ${OUTCOMES}`);
  text('reason', reason);
  const fp = JSON.stringify(['CORRECT', positionId, outcome, ...(resolution ? [resolution] : [])]);
  const again = idempotent(ledger, idempotencyKey, fp); if (again) return again;
  const p = replay(ledger).positions.get(positionId);
  if (!p) fail('UNKNOWN_POSITION', positionId);
  if (p.settlement === null) fail('NOT_SETTLED', positionId);
  if (p.settlement === outcome) fail('NO_CHANGE', `${positionId} already settled as ${outcome}`);
  const prev = ledger.entries.filter(e => e.position_id === positionId && e.settlement_version === p.settlement_version);
  const g = prev.find(e => e.type === 'SETTLEMENT_GROSS').amount, c = prev.find(e => e.type === 'COMMISSION').amount;
  const rev = append(ledger, {type: 'REVERSAL', position_id: positionId, reverses_version: p.settlement_version, gross: g, commission: c, reason, at});
  const next = replay(ledger).positions.get(positionId);
  return remember(ledger, idempotencyKey, fp,
    [rev, ...settlementEntries(ledger, next, outcome, p.settlement_version + 1, at, {corrects_version: p.settlement_version, ...(resolution ? {resolution} : {})})]);
}
