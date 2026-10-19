import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { withClient, closePool } from './db.mjs';
import { assertRuntimeSafety } from './runtime-safety.mjs';

// Owner decision D13 (MP-OWNER-D13-MIGRATIONS-AUTODEPLOY-20261019): a migration never reaches the production database
// by itself. render.yaml deploys every merge and the server migrates at startup, so in production mode a pending
// migration is applied only when the owner lists its exact file name in MATCHPILOT_APPROVED_MIGRATIONS (comma
// separated), after backup, compatibility check and recovery plan. Offline and test modes migrate their isolated local
// databases as before. The guard fails closed: an unknown mode is refused, and offline/test refuse a non-local database
// (src/runtime-safety.mjs), so a job or `npm run migrate` against production cannot bypass it.
export function migrationPolicy(env = process.env) {
  const production = assertRuntimeSafety(env).mode === 'production';
  const approved = new Set(String(env.MATCHPILOT_APPROVED_MIGRATIONS || '').split(',').map(name => name.trim()).filter(Boolean));
  return {production, approved};
}

// Pending migrations run in file order. In production the run stops at the first pending file that is not approved:
// a later approved file is never applied ahead of an earlier unapproved one.
export function planMigrations(pending, policy) {
  if (!policy.production) return {apply: pending, held: []};
  const firstHeld = pending.findIndex(file => !policy.approved.has(file));
  return firstHeld === -1 ? {apply: pending, held: []} : {apply: pending.slice(0, firstHeld), held: pending.slice(firstHeld)};
}

export async function migrate({env = process.env, log = console.log, dir = resolve('migrations')} = {}) {
  // The pool always connects to process.env.DATABASE_URL, so that is the URL the host check must see.
  const policy = migrationPolicy({...env, DATABASE_URL: process.env.DATABASE_URL});
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  return withClient(async client => {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set((await client.query('SELECT filename FROM schema_migrations')).rows.map(row => row.filename));
    const pending = files.filter(file => !done.has(file));
    const {apply, held} = planMigrations(pending, policy);
    if (held.length) log('MIGRATIONS_PENDING_NOT_APPROVED ' + JSON.stringify({held}));
    const unused = policy.production ? [...policy.approved].filter(name => !pending.includes(name)) : [];
    if (unused.length) log('MIGRATION_APPROVALS_NOT_PENDING ' + JSON.stringify({unused}));
    for (const file of apply) {
      const sql = await readFile(resolve(dir,file),'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(filename) VALUES($1)',[file]);
        await client.query('COMMIT');
        log('MIGRATION_APPLIED '+file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    return {applied: apply, held};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(closePool).catch(e => { console.error(e); process.exitCode=1; });
}
