import { configureTelegramOutboundOnly, sendTelegramConnectivityTest } from './alerts.mjs';
import { startDataWatchdog, stopDataWatchdog } from './jobs/data-watchdog.mjs';
import { runPhase1Verification } from './jobs/futpython-certify-phase1.mjs';
import { startFutpythonCron, stopFutpythonCron } from './jobs/futpython-cron.mjs';
import { runFutpythonSync } from './jobs/futpython-sync.mjs';
import { maybeStartTcDiscovery } from './jobs/totalcorner-discovery.mjs';
import { maybeStartTcHistorical, stopTcHistorical } from './jobs/totalcorner-historical.mjs';
import { maybeStartTcLive, stopTcLive } from './jobs/totalcorner-live.mjs';
import { maybeStartTcMapping } from './jobs/totalcorner-mapping.mjs';
import { maybeStartTcPrematch, stopTcPrematch } from './jobs/totalcorner-prematch.mjs';
import { redactSecrets } from './providers/totalcorner/client.mjs';
import { fptRetired } from './providers/futpython/retired.mjs';

// Re-exported for existing callers; the checks live in src/runtime-safety.mjs, which imports no application module,
// so migrate() can use them too.
import { runtimeMode, isLocalDatabaseUrl, assertRuntimeSafety } from './runtime-safety.mjs';
export { runtimeMode, isLocalDatabaseUrl, assertRuntimeSafety };

const DEFAULT_SERVICES = {
  startFutpythonCron,
  startDataWatchdog,
  configureTelegramOutboundOnly,
  sendTelegramConnectivityTest,
  runPhase1Verification,
  maybeStartTcDiscovery,
  maybeStartTcMapping,
  maybeStartTcPrematch,
  maybeStartTcHistorical,
  maybeStartTcLive,
  runFutpythonSync,
};


export const tcEnabled = (env = process.env) => String(env.MATCHPILOT_TOTALCORNER ?? '').trim() === 'on';

async function startTotalCorner(services, error) {
  await services.maybeStartTcDiscovery().catch(cause => error('TC_DISCOVERY_ERROR', redactSecrets(String(cause?.message || cause))));
  await services.maybeStartTcMapping().catch(cause => error('TC_MAPPING_ERROR', redactSecrets(String(cause?.message || cause))));
  await services.maybeStartTcPrematch().catch(cause => error('TC_PREMATCH_ERROR', redactSecrets(String(cause?.message || cause))));
  try {
    await services.maybeStartTcHistorical();
    await services.maybeStartTcLive();
  } catch (cause) {
    // Preserve the existing production chain: live starts only after historical startup succeeds.
    error('TC_HISTORICAL_ERROR', redactSecrets(String(cause?.message || cause)));
  }
}

export async function startBackgroundServices({env = process.env, log = console.log, error = console.error, services = DEFAULT_SERVICES} = {}) {
  const policy = assertRuntimeSafety(env);
  if (!policy.backgroundEnabled) {
    log('MATCHPILOT_BACKGROUND_SKIPPED ' + JSON.stringify({mode: policy.mode, reason: policy.mode === 'production' ? 'not_enabled' : 'runtime_isolated'}));
    return policy;
  }

  services.startFutpythonCron();
  services.startDataWatchdog();
  services.configureTelegramOutboundOnly()
    .then(() => services.sendTelegramConnectivityTest())
    .then(result => log('TELEGRAM_OUTBOUND_ONLY ' + JSON.stringify({status: result?.status || 'configured'})))
    .catch(cause => error('TELEGRAM_SETUP_ERROR', String(cause?.message || cause).replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]')));

  // MP-FPT-RETIRE-01: with FutPythonTrader retired, the start-up jobs that call it never run, whatever their own flags.
  const retired = fptRetired(env);
  log('FUTPYTHON_' + (retired ? 'RETIRED' : 'ACTIVE') + ' ' + JSON.stringify({setting: env.FUTPYTHON_RETIRED ?? null}));
  if (env.FUTPYTHON_PHASE1_VERIFY_ON_START === 'true' && !retired) {
    services.runPhase1Verification()
      .then(result => log('FUTPYTHON_PHASE1_VERIFY_ON_START ' + JSON.stringify({status: result.status, checks: result.checks, failed: result.failed})))
      .catch(cause => error('FUTPYTHON_PHASE1_VERIFY_ERROR', String(cause?.message || cause).replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]')));
  }

  // TC-OFF-01 (#20, owner decision MP-VPS-ONLY-OPERATIONS-2026-10-21): TotalCorner collection, polling and backfill
  // are suspended. No TotalCorner job starts unless MATCHPILOT_TOTALCORNER is "on" (surrounding spaces ignored); any other value, or none, is off.
  const totalcorner = tcEnabled(env);
  log('TOTALCORNER_' + (totalcorner ? 'ON' : 'OFF') + ' ' + JSON.stringify({setting: env.MATCHPILOT_TOTALCORNER ?? null}));
  if (totalcorner) await startTotalCorner(services, error);

  if (env.FUTPYTHON_BACKFILL_ON_START === 'true' && !retired) {
    services.runFutpythonSync({kind: 'backfill', mode: 'backfill'})
      .catch(cause => error('FUTPYTHON_BACKFILL_ERROR', String(cause?.message || cause).replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]')));
  }

  log('MATCHPILOT_BACKGROUND_STARTED ' + JSON.stringify({mode: policy.mode}));
  return policy;
}

export function stopBackgroundServices() {
  stopFutpythonCron();
  stopDataWatchdog();
  stopTcPrematch();
  stopTcHistorical();
  stopTcLive();
}
