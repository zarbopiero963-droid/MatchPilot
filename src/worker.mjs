// FPT worker entrypoint (systemd matchpilot-fpt-worker). On SIGTERM/SIGINT it stops scheduling new work, waits for an
// in-flight FutPython sync up to a grace period (each dataset is written in its own transaction, so an abort after the
// grace rolls back only the open one; a run left 'running' is reconciled at the next start), closes the pool, exits 0.
import { realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { closePool } from './db.mjs';
import { logEvent } from './log.mjs';
import { futpythonCronBusy } from './jobs/futpython-cron.mjs';
import { startBackgroundServices, stopBackgroundServices } from './background.mjs';

export function createShutdown({stop = stopBackgroundServices, busy = futpythonCronBusy, close = closePool, exit = code => process.exit(code),
  log = console.log, graceMs = Number(process.env.MATCHPILOT_WORKER_STOP_GRACE_MS || 60000), pollMs = 500,
  sleep = ms => new Promise(done => setTimeout(done, ms)), now = () => Date.now()} = {}) {
  let running;
  return signal => running ??= (async () => {
    log('MATCHPILOT_WORKER_STOPPING ' + JSON.stringify({ts: new Date(now()).toISOString(), signal}));
    stop();
    const until = now() + graceMs;
    while (busy() && now() < until) await sleep(pollMs);
    const aborted = busy();
    try { await close(); } catch {}
    log('MATCHPILOT_WORKER_STOPPED ' + JSON.stringify({ts: new Date(now()).toISOString(), signal, inflight: aborted ? 'aborted_after_grace' : 'none_or_finished'}));
    exit(0);
  })();
}

// t131u: every worker log line starts with an ISO-8601 UTC timestamp (journald's own stamp is lost in exported logs).
export function isoTimestamps(target = console, now = () => new Date()) {
  if (target.__isoTimestamps) return target;
  for (const level of ['log', 'info', 'warn', 'error']) {
    const original = target[level].bind(target);
    target[level] = (...args) => original(now().toISOString(), ...args);
  }
  target.__isoTimestamps = true;
  return target;
}

// t138: the worker unit runs from /srv/mp-deploy/current -> releases/<40-hex sha>. MP_RELEASE_SHA wins when set;
// otherwise the release is the resolved working directory name when it is a full SHA (never guessed).
export function releaseSha(env = process.env, cwd = process.cwd(), resolve = realpathSync) {
  const fromEnv = String(env.MP_RELEASE_SHA || '').trim();
  if (/^[0-9a-f]{40}$/.test(fromEnv)) return fromEnv;
  try { const name = basename(resolve(cwd)); return /^[0-9a-f]{40}$/.test(name) ? name : null; } catch { return null; }
}

export async function main({proc = process, start = startBackgroundServices, shutdown = createShutdown()} = {}) {
  for (const signal of ['SIGTERM', 'SIGINT']) proc.on(signal, () => shutdown(signal));
  logEvent('MATCHPILOT_WORKER_STARTED', {pid: proc.pid ?? null, release: releaseSha()});
  await start();
  return setInterval(() => {}, 1 << 30);
}

if (import.meta.url === `file://${process.argv[1]}`) isoTimestamps(), main().catch(error => { console.error('MATCHPILOT_WORKER_START_ERROR', String(error?.message || error)); process.exit(1); });
