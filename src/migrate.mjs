import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getPool, closePool } from './db.mjs';
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

// MIG-GAP-02: one migrator at a time per schema. A session advisory lock (class MIGRATION_LOCK_CLASS, key = hash of
// the current schema) is taken before schema_migrations is even created, so concurrent deploys, jobs and
// `npm run migrate` cannot race. The wait is bounded (MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS, default 120 s) and fails
// closed with MIGRATION_LOCK_TIMEOUT. The lock lives on the connection: it is released in `finally`, and PostgreSQL
// frees it (rolling back the open file) if the process dies; a connection whose unlock failed is destroyed instead of
// returned to the pool.
export const MIGRATION_LOCK_CLASS = 0x4d504d47; // "MPMG"
const DEFAULT_LOCK_TIMEOUT_MS = 120000;
const LOCK_RETRY_MS = 200;

class MigrationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function migrationLockTimeout(env = process.env) {
  const raw = env.MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_LOCK_TIMEOUT_MS;
  if (!/^\d+$/.test(String(raw).trim()) || Number(raw) <= 0) {
    throw new MigrationError('BAD_MIGRATION_LOCK_TIMEOUT', 'MATCHPILOT_MIGRATION_LOCK_TIMEOUT_MS must be a positive integer');
  }
  return Number(raw);
}

async function acquireLock(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const {rows} = await client.query('SELECT pg_try_advisory_lock($1::int4, hashtext(current_schema())) AS ok', [MIGRATION_LOCK_CLASS]);
    if (rows[0].ok) return;
    if (Date.now() >= deadline) throw new MigrationError('MIGRATION_LOCK_TIMEOUT', `another migrate() held the migration lock for more than ${timeoutMs} ms`);
    await new Promise(done => setTimeout(done, Math.min(LOCK_RETRY_MS, Math.max(1, deadline - Date.now()))));
  }
}

export async function migrate({env = process.env, log = console.log, dir = resolve('migrations')} = {}) {
  // Fail closed before any database work. The pool always connects to process.env.DATABASE_URL, so that is the URL
  // the host check must see.
  const policy = migrationPolicy({...env, DATABASE_URL: process.env.DATABASE_URL});
  const lockTimeoutMs = migrationLockTimeout(env);
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const client = await getPool().connect();
  let locked = false;
  let broken = null;
  try {
    await acquireLock(client, lockTimeoutMs);
    locked = true;
    // If this process dies during a long statement, PostgreSQL would otherwise notice only when the statement ends,
    // keeping the transaction open and the lock held. PostgreSQL 14+ checks the client every second instead.
    await client.query("SELECT set_config('client_connection_check_interval', '1000', false)").catch(error => {
      log('MIGRATION_CLIENT_CHECK_UNAVAILABLE ' + JSON.stringify({reason: String(error?.message || error)}));
    });
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
  } catch (error) {
    broken = error;
    throw error;
  } finally {
    if (locked) {
      try { await client.query('SELECT pg_advisory_unlock($1::int4, hashtext(current_schema()))', [MIGRATION_LOCK_CLASS]); }
      catch (unlockError) { broken = unlockError; }
    }
    // A connection left in an unknown state (failed unlock, aborted transaction) is closed, which also frees its lock.
    client.release(broken && locked ? true : undefined);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(closePool).catch(e => { console.error(e); process.exitCode=1; });
}
