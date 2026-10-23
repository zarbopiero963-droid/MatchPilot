import { withClient, closePool } from '../db.mjs';
import { measureFactsGap, refreshMatchFacts } from '../providers/futpython/facts-refresh.mjs';

// FPT-FACTS-GATE recovery. One-off owner command, database only: it never calls FutPythonTrader and never runs
// migrations. The sync refreshes the facts only when a run inserts rows, so matches hidden or frozen by the legacy gate
// are recovered at the next productive run; this command does it now.
//   node src/jobs/futpython-facts-refresh.mjs                                    (dry run: read-only measure)
//   node src/jobs/futpython-facts-refresh.mjs --apply --by=<who> --reason=<why>  (writes fpt_match_facts only)
// --apply runs in one transaction: it measures, refreshes, measures again and rolls everything back if the history
// (fpt_match_versions) changed, if a duplicate appeared or if a hidden or stale match is left.

function redact(value) {
  return String(value || '').replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]');
}

function arg(argv, name) {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

export async function runFactsRefresh(client, {apply = false, by = null, reason = null} = {}) {
  if (apply && (!by || !reason)) throw new Error('--apply needs --by=<who> and --reason=<why>');
  // One snapshot for both measures; a concurrent sync that touches the same rows makes the run fail, not lie.
  await client.query(apply ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN READ ONLY');
  try {
    const before = await measureFactsGap(client);
    if (!apply) {
      await client.query('ROLLBACK');
      return {mode: 'dry_run', before};
    }
    const written = await refreshMatchFacts(client);
    const after = await measureFactsGap(client);
    const problems = [];
    if (after.history_versions !== before.history_versions || after.history_digest !== before.history_digest) problems.push('HISTORY_CHANGED');
    if (after.duplicate_ids !== 0) problems.push('DUPLICATE_FACTS');
    if (after.hidden !== 0) problems.push('HIDDEN_LEFT');
    if (after.stale !== 0) problems.push('STALE_LEFT');
    if (problems.length) {
      await client.query('ROLLBACK');
      return {mode: 'apply', status: 'ROLLED_BACK', problems, before, after, written, by, reason};
    }
    await client.query('COMMIT');
    return {mode: 'apply', status: 'COMMITTED', before, after, written, by, reason};
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv;
  withClient(client => runFactsRefresh(client, {apply: argv.includes('--apply'), by: arg(argv, 'by'), reason: arg(argv, 'reason')}))
    .then(result => {
      console.log('FUTPYTHON_FACTS_REFRESH ' + JSON.stringify(result));
      if (result.status === 'ROLLED_BACK') process.exitCode = 2;
    })
    .catch(error => {
      console.error('FUTPYTHON_FACTS_REFRESH_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
