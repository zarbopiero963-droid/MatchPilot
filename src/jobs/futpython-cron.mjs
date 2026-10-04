import { Cron } from 'croner';
import { runFutpythonSync } from './futpython-sync.mjs';

let job;

export function startFutpythonCron() {
  if (process.env.FUTPYTHON_CRON_ENABLED === 'false') return null;
  if (!process.env.FUTPYTHON_API_KEY || !process.env.DATABASE_URL) return null;

  const expression = process.env.FUTPYTHON_CRON || '17 */6 * * *';
  const timezone = process.env.FUTPYTHON_CRON_TZ || 'Europe/Rome';

  job = new Cron(expression, { timezone, protect: true }, async () => {
    try { await runFutpythonSync({kind:'cron',mode:'incremental'}); }
    catch (e) {
      console.error('FUTPYTHON_CRON_ERROR', String(e?.message||e).replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]'));
    }
  });

  console.log('FUTPYTHON_CRON_READY '+JSON.stringify({expression,timezone}));
  return job;
}

export function stopFutpythonCron() {
  if (job) job.stop();
  job = undefined;
}
