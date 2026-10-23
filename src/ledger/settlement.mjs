// LEDGER-CORE-03 (#99 x #100): settles paper positions from the canonical market rules and the versioned match
// result (DEC-002), never from an outcome typed by the caller. A position opened with a market binding is resolved by
// resolveVersioned: UNRESOLVED leaves the ledger untouched (DEC-015: no VOID is invented), the first resolution
// settles it, a later corrected result with a different outcome appends REVERSAL + new settlement (#99 Reversal), and
// a result older than the one already applied is refused. Every applied resolution is recorded on the settlement
// entry (rule id, result version, provenance, correction flag). Pure: no DB, no network, no clock (the caller passes
// `at` and `asOf`).
import {resolveVersioned} from '../markets/outcomes.mjs';
import {LedgerError, correctSettlement, replay, settlePosition} from './paper-ledger.mjs';

const fail = (code, msg) => { throw new LedgerError(code, msg); };

function resolutionOf(res) {
  return Object.freeze({market_rule_id: res.market_rule_id, rule_version: res.rule_version, provider: res.provider,
    outcome_version: res.outcome_version, provenance: res.provenance, recorded_at: res.recorded_at, corrected: res.corrected,
    correction_timestamp: res.correction_timestamp, as_of: res.as_of, winning_selection: res.winning_selection});
}

// Returns {status, ledger_mutation, ...}:
// - PENDING: no validated final result, or the rule cannot resolve the market (reason from #100); nothing written;
// - SETTLED: first settlement applied;
// - CORRECTED: a later result version changed the outcome; REVERSAL + new settlement applied;
// - UNCHANGED: the result version is already applied, or a later version keeps the same outcome; nothing written.
export function settleFromResult(ledger, {positionId, versions, asOf, at}) {
  const p = replay(ledger).positions.get(positionId);
  if (!p) fail('UNKNOWN_POSITION', positionId);
  if (!p.market) fail('MARKET_BINDING_MISSING', `${positionId} was opened without a #100 market binding`);
  const res = resolveVersioned({...p.market, versions, asOf});
  if (res.status !== 'RESOLVED') return Object.freeze({status: 'PENDING', ledger_mutation: false, position_id: positionId, reason: res.reason});
  const resolution = resolutionOf(res);
  const applied = p.resolution;
  if (p.settlement === null && !applied) {
    const r = settlePosition(ledger, {positionId, outcome: res.outcome, settlementVersion: p.settlement_version + 1,
      idempotencyKey: `rules:settle:${positionId}:r${res.outcome_version}`, at, resolution});
    return Object.freeze({status: 'SETTLED', ledger_mutation: r.status === 'APPLIED', position_id: positionId, outcome: res.outcome, resolution, entries: r.entries});
  }
  if (p.settlement === null) fail('SETTLEMENT_PENDING', `${positionId} has a reversed settlement awaiting a manual decision`);
  if (!applied) fail('MANUAL_SETTLEMENT', `${positionId} was settled without a market resolution; correct it explicitly`);
  if (applied.provider !== resolution.provider) fail('PROVIDER_CHANGED', `${positionId} settled from ${applied.provider}, now ${resolution.provider}`);
  if (resolution.outcome_version < applied.outcome_version)
    fail('STALE_RESULT', `${positionId} already settled on result v${applied.outcome_version}, got v${resolution.outcome_version}`);
  // Same version re-applied, or a later version with the same outcome (a same-number duplicate cannot differ: DEC-002).
  if (res.outcome === p.settlement)
    return Object.freeze({status: 'UNCHANGED', ledger_mutation: false, position_id: positionId, outcome: p.settlement,
      applied_outcome_version: applied.outcome_version, latest_outcome_version: resolution.outcome_version});
  const r = correctSettlement(ledger, {positionId, outcome: res.outcome, at, resolution,
    reason: `result correction v${applied.outcome_version} -> v${resolution.outcome_version} (${resolution.provenance})`,
    idempotencyKey: `rules:correct:${positionId}:r${res.outcome_version}`});
  return Object.freeze({status: 'CORRECTED', ledger_mutation: r.status === 'APPLIED', position_id: positionId, outcome: res.outcome,
    previous_outcome: p.settlement, resolution, entries: r.entries});
}
