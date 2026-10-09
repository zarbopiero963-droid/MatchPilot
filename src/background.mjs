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

const MODES = new Set(['offline', 'test', 'production']);

export function runtimeMode(env = process.env) {
  const mode = String(env.MATCHPILOT_RUNTIME_MODE || 'offline').trim().toLowerCase();
  if (!MODES.has(mode)) throw new Error(`Invalid MATCHPILOT_RUNTIME_MODE: ${mode}`);
  return mode;
}

export function isLocalDatabaseUrl(value) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

export function assertRuntimeSafety(env = process.env) {
  const mode = runtimeMode(env);
  if (mode !== 'production' && env.DATABASE_URL && !isLocalDatabaseUrl(env.DATABASE_URL)) {
    throw new Error(`${mode} mode rejects non-local DATABASE_URL`);
  }
  return {mode, backgroundEnabled: mode === 'production' && env.MATCHPILOT_BACKGROUND_ENABLED === 'true'};
}

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

  if (env.FUTPYTHON_PHASE1_VERIFY_ON_START === 'true') {
    services.runPhase1Verification()
      .then(result => log('FUTPYTHON_PHASE1_VERIFY_ON_START ' + JSON.stringify({status: result.status, checks: result.checks, failed: result.failed})))
      .catch(cause => error('FUTPYTHON_PHASE1_VERIFY_ERROR', String(cause?.message || cause).replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]')));
  }

  await services.maybeStartTcDiscovery().catch(cause => error('TC_DISCOVERY_ERROR', redactSecrets(String(cause?.message || cause))));
  await services.maybeStartTcMapping().catch(cause => error('TC_MAPPING_ERROR', redactSecrets(String(cause?.message || cause))));
  await services.maybeStartTcPrematch().catch(cause => error('TC_PREMATCH_ERROR', redactSecrets(String(cause?.message || cause))));
  await services.maybeStartTcHistorical().catch(cause => error('TC_HISTORICAL_ERROR', redactSecrets(String(cause?.message || cause))));
  await services.maybeStartTcLive().catch(cause => error('TC_LIVE_START_ERROR', redactSecrets(String(cause?.message || cause))));

  if (env.FUTPYTHON_BACKFILL_ON_START === 'true') {
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
