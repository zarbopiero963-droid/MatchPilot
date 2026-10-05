import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { reprocessRaw } from '../providers/futpython/reprocess.mjs';
import { refreshNormalizedLayer } from '../providers/futpython/query.mjs';

// One-off owner command. Database only: it re-parses the stored raw, it never calls FutPythonTrader.
//   node src/jobs/futpython-reprocess.mjs --by=<who> --reason=<why> [--dataset=<key>]            (dry run)
//   node src/jobs/futpython-reprocess.mjs --apply --by=<who> --reason=<why> [--dataset=<key>]

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

function arg(argv, name) {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

export async function runReprocessCommand(argv = process.argv) {
  await migrate();
  const mode = argv.includes('--apply') ? 'apply' : 'dry_run';
  const datasets = argv.filter(a => a.startsWith('--dataset=')).map(a => a.slice('--dataset='.length));
  return withClient(async client => {
    const result = await reprocessRaw(client, {mode, actor: arg(argv, 'by'), reason: arg(argv, 'reason'),
      datasetKeys: datasets.length ? datasets : null});
    // New outputs reach the facts now; nothing changes when the run was a dry run or found no difference.
    if (mode === 'apply' && result.inserted > 0) result.normalizedLayer = await refreshNormalizedLayer(client);
    return result;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runReprocessCommand()
    .then(result => console.log('FUTPYTHON_REPROCESS ' + JSON.stringify(result)))
    .catch(error => {
      console.error('FUTPYTHON_REPROCESS_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
