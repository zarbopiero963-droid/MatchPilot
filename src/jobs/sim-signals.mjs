// MP-VPS-FUNCTIONAL-RECOVERY-01: generate SIMULATED signals for one stored match day. Usage:
//   node src/jobs/sim-signals.mjs --date YYYY-MM-DD [--limit N]
// Refuses to run in production mode; never calls Telegram, an exchange or any upstream API.
import {getPool, closePool} from '../db.mjs';
import {assertRuntimeSafety} from '../runtime-safety.mjs';
import {runForDate} from '../signals/simulated.mjs';

const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i === -1 ? null : args[i + 1]; };
const date = opt('--date');
if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) { console.error('usage: --date YYYY-MM-DD [--limit N]'); process.exit(2); }
if (assertRuntimeSafety(process.env).mode === 'production') { console.error('SIM_SIGNALS_REFUSED production mode'); process.exit(2); }
const runId = `sim-${date}-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`;
const client = await getPool().connect();
try {
  const out = await runForDate(client, {date, runId, limit: Number(opt('--limit') ?? 500)});
  const count = k => out.filter(r => r.decision === k).length;
  const sig = out.filter(r => r.decision === 'SIGNAL');
  console.log(JSON.stringify({run_id: runId, date, matches: out.length, SIGNAL: count('SIGNAL'), NO_SIGNAL: count('NO_SIGNAL'),
    INSUFFICIENT_DATA: count('INSUFFICIENT_DATA'), HIT: sig.filter(r => r.outcome === 'HIT').length,
    MISS: sig.filter(r => r.outcome === 'MISS').length, PENDING: sig.filter(r => r.outcome === 'PENDING').length, telegram: 'disabled'}));
} finally { client.release(); await closePool(); }
