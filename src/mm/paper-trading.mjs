// Paper trading glue (#96 -> #99): a proposal is evaluated by Money Management; only a decision with
// execution_permission opens a virtual position. Advisory proposals never mutate the ledger (#99 hard gate, DEC-001).
import {evaluate} from './money-management.mjs';
import {accountState, openPosition} from '../ledger/paper-ledger.mjs';

export function proposePaperTrade(ledger, {profile, operational, proposal, commissionRate, settingsSnapshotId, positionId, idempotencyKey, at}) {
  const decision = evaluate({profile, operational, account: accountState(ledger), proposal, commissionRate, settingsVersion: settingsSnapshotId, at});
  if (!decision.execution_permission) return {decision, ledger_mutation: false};
  const result = openPosition(ledger, {mode: operational.mode, positionId, side: proposal.side, odds: proposal.odds,
    stake: decision.adjusted_stake, commissionRate, settingsSnapshotId, idempotencyKey, at});
  return {decision, ledger_mutation: result.status === 'APPLIED', result};
}
