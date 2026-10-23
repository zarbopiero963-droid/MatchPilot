import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { withClient, closePool } from '../db.mjs';
import { measureFactsGap, refreshMatchFacts } from '../providers/futpython/facts-refresh.mjs';

// FPT-FACTS-GATE recovery. One-off owner command, database only: it never calls FutPythonTrader and never runs
// migrations. The sync refreshes the facts only when a run inserts rows, so matches hidden or frozen by the legacy gate
// are recovered at the next productive run; this command does it now.
//   node src/jobs/futpython-facts-refresh.mjs                                    (dry run: read-only measure)
//   node src/jobs/futpython-facts-refresh.mjs --apply --by=<who> --reason=<why>  (writes fpt_match_facts only)
// --apply runs in one REPEATABLE READ transaction: it measures, refreshes and measures again in the same snapshot, and
// rolls back if the refresh did anything but write facts (history count or digest changed), if a duplicate appeared or
// if a hidden or stale match is left. Orphan facts (no admissible version left) are reported, never deleted. A sync
// touching the same rows at the same time makes the run fail with 40001 (serialization) or 55P03 (lock timeout): rerun.
// Exit codes: 0 done (dry run or committed), 1 error, 2 rolled back by a check.

const FLAGS = ['--apply'];
const VALUES = ['--by=', '--reason='];

export function parseArgs(argv) {
  const out = {apply: false, by: null, reason: null};
  for (const a of argv) {
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--by=')) out.by = a.slice(5);
    else if (a.startsWith('--reason=')) out.reason = a.slice(9);
    else throw new Error(`unknown argument ${a.split('=')[0]} (accepted: ${[...FLAGS, ...VALUES].join(' ')})`);
  }
  return out;
}

function redact(value) {
  return String(value || '').replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]');
}

export async function runFactsRefresh(client, {apply = false, by = null, reason = null} = {}) {
  if (apply && (!by || !reason)) throw new Error('--apply needs --by=<who> and --reason=<why>');
  // One snapshot for both measures; a concurrent sync that touches the same rows makes the run fail, not lie.
  await client.query(apply ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN READ ONLY');
  try {
    // Never wait behind the worker's row locks for long (nor make it wait behind ours).
    await client.query("SET LOCAL lock_timeout = '5s'");
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

// Run as a script, also through the /srv/mp-deploy/current symlink.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (error) {
    console.error('FUTPYTHON_FACTS_REFRESH_FATAL', error.message);
    process.exit(1);
  }
  withClient(client => runFactsRefresh(client, args))
    .then(result => {
      console.log('FUTPYTHON_FACTS_REFRESH ' + JSON.stringify(result));
      if (result.status === 'ROLLED_BACK') process.exitCode = 2;
    })
    .catch(error => {
      console.error('FUTPYTHON_FACTS_REFRESH_FATAL', error?.code ? `[${error.code}]` : '', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
