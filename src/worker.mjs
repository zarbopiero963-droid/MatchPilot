// FPT worker entrypoint (systemd matchpilot-fpt-worker). On SIGTERM/SIGINT it stops scheduling new work, waits for an
// in-flight FutPython sync up to a grace period (each dataset is written in its own transaction, so an abort after the
// grace rolls back only the open one; a run left 'running' is reconciled at the next start), closes the pool, exits 0.
import { closePool } from './db.mjs';
import { futpythonCronBusy } from './jobs/futpython-cron.mjs';
import { startBackgroundServices, stopBackgroundServices } from './background.mjs';

export function createShutdown({stop = stopBackgroundServices, busy = futpythonCronBusy, close = closePool, exit = code => process.exit(code),
  log = console.log, graceMs = Number(process.env.MATCHPILOT_WORKER_STOP_GRACE_MS || 60000), pollMs = 500,
  sleep = ms => new Promise(done => setTimeout(done, ms)), now = () => Date.now()} = {}) {
  let running;
  return signal => running ??= (async () => {
    log('MATCHPILOT_WORKER_STOPPING ' + JSON.stringify({signal}));
    stop();
    const until = now() + graceMs;
    while (busy() && now() < until) await sleep(pollMs);
    const aborted = busy();
    try { await close(); } catch {}
    log('MATCHPILOT_WORKER_STOPPED ' + JSON.stringify({signal, inflight: aborted ? 'aborted_after_grace' : 'none_or_finished'}));
    exit(0);
  })();
}

export async function main({proc = process, start = startBackgroundServices, shutdown = createShutdown()} = {}) {
  for (const signal of ['SIGTERM', 'SIGINT']) proc.on(signal, () => shutdown(signal));
  await start();
  return setInterval(() => {}, 1 << 30);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(error => { console.error('MATCHPILOT_WORKER_START_ERROR', String(error?.message || error)); process.exit(1); });
