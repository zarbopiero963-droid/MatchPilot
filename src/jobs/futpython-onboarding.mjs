import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { advanceOnboarding, promoteLeague } from '../providers/futpython/onboarding.mjs';
import { refreshNormalizedLayer } from '../providers/futpython/query.mjs';

// One-off owner command. Database only: it never calls FutPythonTrader.
//   node src/jobs/futpython-onboarding.mjs --status
//   node src/jobs/futpython-onboarding.mjs --advance
//   node src/jobs/futpython-onboarding.mjs --promote=<country>/<league> --by=<who> --reason=<why>

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

function arg(argv, name) {
  const hit = argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

export async function runOnboardingCommand(argv = process.argv) {
  await migrate();
  return withClient(async client => {
    if (argv.includes('--advance')) return {advance: await advanceOnboarding(client, {runId: 'onboarding-cli'})};
    const target = arg(argv, 'promote');
    if (target) {
      const [country, league, extra] = target.split('/');
      if (!country || !league || extra) throw new Error('--promote expects <country>/<league>');
      await client.query('BEGIN');
      let promoted;
      try {
        promoted = await promoteLeague(client, {country, league, actor: arg(argv, 'by'), reason: arg(argv, 'reason')});
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
      // The promoted seasons enter the facts now, not at the next cron.
      return {promoted, normalizedLayer: await refreshNormalizedLayer(client)};
    }
    const rows = await client.query(
      `SELECT dataset_key, kind, promotion, state, waiting_for, blocked_reason FROM fpt_onboarding
       WHERE state <> 'ACTIVE' ORDER BY discovered_at, dataset_key`);
    return {pending: rows.rows};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOnboardingCommand()
    .then(result => console.log('FUTPYTHON_ONBOARDING ' + JSON.stringify(result)))
    .catch(error => {
      console.error('FUTPYTHON_ONBOARDING_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
