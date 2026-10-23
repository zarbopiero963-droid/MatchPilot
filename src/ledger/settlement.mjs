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
  const applied = p.resolution;
  // A position settled from one provider is never re-settled from another, even when that one has no final yet.
  const incoming = Array.isArray(versions) ? versions.find(v => v?.provider)?.provider : undefined;
  if (applied && incoming && incoming !== applied.provider) fail('PROVIDER_CHANGED', `${positionId} settled from ${applied.provider}, now ${incoming}`);
  const res = resolveVersioned({...p.market, versions, asOf});
  if (res.status !== 'RESOLVED') return Object.freeze({status: 'PENDING', ledger_mutation: false, position_id: positionId, reason: res.reason});
  const resolution = resolutionOf(res);
  if (p.settlement === null && !applied) {
    const r = settlePosition(ledger, {positionId, outcome: res.outcome, settlementVersion: p.settlement_version + 1,
      idempotencyKey: `rules:settle:${positionId}:r${res.outcome_version}`, at, resolution});
    return Object.freeze({status: 'SETTLED', ledger_mutation: r.status === 'APPLIED', position_id: positionId, outcome: res.outcome, resolution, entries: r.entries});
  }
  // Defensive: correctSettlement writes REVERSAL and the new settlement in one call, so this state is not reachable
  // through this module; a ledger edited by other code must not be settled here blindly.
  if (p.settlement === null) fail('SETTLEMENT_PENDING', `${positionId} has a reversed settlement awaiting a manual decision`);
  if (!applied) fail('MANUAL_SETTLEMENT', `${positionId} was settled without a market resolution; correct it explicitly`);
  if (applied.provider !== resolution.provider) fail('PROVIDER_CHANGED', `${positionId} settled from ${applied.provider}, now ${resolution.provider}`);
  // A rule version change could change the outcome of the same result: refuse rather than guess (re-settle explicitly).
  if (applied.rule_version !== resolution.rule_version)
    fail('RULE_VERSION_CHANGED', `${positionId} settled with rule v${applied.rule_version}, now v${resolution.rule_version}`);
  // DEC-002: a result version is immutable; the same number with other content is a conflict, never a correction.
  if (resolution.outcome_version === applied.outcome_version && (resolution.provenance !== applied.provenance
    || resolution.recorded_at !== applied.recorded_at || res.outcome !== p.settlement))
    fail('CONFLICTING_VERSION', `${positionId}: result v${applied.outcome_version} already applied with other content`);
  if (resolution.outcome_version < applied.outcome_version)
    fail('STALE_RESULT', `${positionId} already settled on result v${applied.outcome_version}, got v${resolution.outcome_version}`);
  // Same version re-applied, or a later version with the same outcome: nothing to write. The applied resolution stays
  // the one on the ledger (the later version is reported, not recorded).
  if (res.outcome === p.settlement)
    return Object.freeze({status: 'UNCHANGED', ledger_mutation: false, position_id: positionId, outcome: p.settlement,
      applied_outcome_version: applied.outcome_version, latest_outcome_version: resolution.outcome_version});
  // Reaching here means the outcome changed after the applied version: it is a correction whatever the caller passed.
  const corrected = Object.freeze({...resolution, corrected: true, correction_timestamp: resolution.correction_timestamp ?? resolution.recorded_at,
    corrects_outcome_version: applied.outcome_version});
  const r = correctSettlement(ledger, {positionId, outcome: res.outcome, at, resolution: corrected,
    reason: `result correction v${applied.outcome_version} -> v${resolution.outcome_version} (${resolution.provenance})`,
    idempotencyKey: `rules:correct:${positionId}:r${res.outcome_version}`});
  return Object.freeze({status: 'CORRECTED', ledger_mutation: r.status === 'APPLIED', position_id: positionId, outcome: res.outcome,
    previous_outcome: p.settlement, resolution: corrected, entries: r.entries});
}
