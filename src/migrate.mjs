import { createHash } from 'node:crypto';
import { readFileSync, unlinkSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './db.mjs';
import { assertRuntimeSafety, runtimeMode } from './runtime-safety.mjs';
import { AuthzError, DEFAULT_AUTHZ_DIR, TEST_AUTHORIZATION_VALUE, decide, loadOwnerApprovals, loadTechnicalToken } from './migration-authz.mjs';

// Owner decision D13 (MP-OWNER-D13-MIGRATIONS-AUTODEPLOY-20261019): in production mode a pending migration is applied
// only when the owner lists its exact file name in MATCHPILOT_APPROVED_MIGRATIONS (comma separated). Since F3
// (MP-MIG-GATE-01) that list is only an extra condition of production mode: in EVERY mode (offline included) a pending
// migration needs the owner approval of db/migration-approvals.json and the technical token of the release
// (src/migration-authz.mjs), and a start with an unauthorized pending migration fails closed without applying anything.
// The guard still refuses an unknown mode, and offline/test refuse a non-local database (src/runtime-safety.mjs).
export function migrationPolicy(env = process.env) {
  const production = assertRuntimeSafety(env).mode === 'production';
  const approved = new Set(String(env.MATCHPILOT_APPROVED_MIGRATIONS || '').split(',').map(name => name.trim()).filter(Boolean));
  return {production, approved};
}

// The D13 planning of production mode, kept as a pure function: a later listed file is never applied ahead of an
// earlier unlisted one. migrate() itself refuses the whole run instead (F3).
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

// Schema and key are fixed once, so a migration that changes search_path can neither make the unlock miss its lock
// nor move the bookkeeping table (PR #158 review NB-1).
async function acquireLock(client, timeoutMs) {
  const {rows: [scope]} = await client.query('SELECT current_schema() AS schema, hashtext(current_schema()) AS key');
  if (scope.schema === null) throw new MigrationError('MIGRATION_NO_SCHEMA', 'no schema of the search_path exists');
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const {rows} = await client.query('SELECT pg_try_advisory_lock($1::int4, $2::int4) AS ok', [MIGRATION_LOCK_CLASS, scope.key]);
    if (rows[0].ok) return scope;
    if (Date.now() >= deadline) throw new MigrationError('MIGRATION_LOCK_TIMEOUT', `another migrate() held the migration lock for more than ${timeoutMs} ms`);
    await new Promise(done => setTimeout(done, Math.min(LOCK_RETRY_MS, Math.max(1, deadline - Date.now()))));
  }
}

// ---- F2 (MP-MIG-CHECKSUMS-01, owner mandate MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01 F2=A) ----
// A persistent checksum register next to schema_migrations, created additively by the runner. Hash rule
// `sha256-file-bytes-v1`: SHA-256 of the exact bytes of the file as read from disk, no normalization (line endings, BOM,
// trailing newline and comments all count). The runner executes those same bytes, so the hash is the hash of what ran
// (and it equals `sha256sum`, the rule of the mp-deploy ledger). Every run verifies the whole history before applying
// anything; a problem is a blocking error, recorded in schema_migration_events, never a warning and never an automatic
// hash update. A database migrated before this register existed is LEGACY: it is refused until an explicit, confirmed
// adoption (adoptLegacy) records UNVERIFIABLE_LEGACY or RECONSTRUCTED_FROM_EVIDENCE hashes. No hash is ever invented.
export const HASH_RULE = 'sha256-file-bytes-v1';
export const HASH_ORIGINS = Object.freeze(['VERIFIED', 'RECONSTRUCTED_FROM_EVIDENCE', 'UNVERIFIABLE_LEGACY']);
export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
const HEX64 = /^[0-9a-f]{64}$/;

// The code version recorded with each row: MATCHPILOT_CODE_VERSION, else the release directory of mp-deploy
// (/srv/mp-deploy/releases/<sha>), else the git HEAD of the checkout, else the package version.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function codeVersion(env = process.env, root = REPO_ROOT) {
  if (env.MATCHPILOT_CODE_VERSION) return String(env.MATCHPILOT_CODE_VERSION).slice(0, 100);
  const release = releaseSha(root);
  if (release) return release;
  try { return `package-${JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version}`; } catch { return null; }
}

// The 40-hex commit of this code, from the mp-deploy layout or from git; null when it cannot be established.
export function releaseSha(root = REPO_ROOT) {
  const name = basename(root);
  if (/^[0-9a-f]{40}$/.test(name) && basename(dirname(root)) === 'releases') return name;
  try {
    let gitDir = resolve(root, '.git'); // in a worktree ".git" is a file "gitdir: <path>"
    try { const text = readFileSync(gitDir, 'utf8').trim(); if (text.startsWith('gitdir:')) gitDir = resolve(root, text.slice(7).trim()); } catch {}
    const head = readFileSync(resolve(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = /^ref: (.+)$/.exec(head)?.[1];
    if (!ref) return null;
    const candidates = [resolve(gitDir, ref)];
    try { const common = readFileSync(resolve(gitDir, 'commondir'), 'utf8').trim(); candidates.push(resolve(gitDir, common, ref)); } catch {}
    for (const path of candidates) { try { const sha = readFileSync(path, 'utf8').trim(); if (/^[0-9a-f]{40}$/.test(sha)) return sha; } catch {} }
    const packed = [resolve(gitDir, 'packed-refs')];
    try { packed.push(resolve(gitDir, readFileSync(resolve(gitDir, 'commondir'), 'utf8').trim(), 'packed-refs')); } catch {}
    for (const path of packed) {
      try { const line = readFileSync(path, 'utf8').split('\n').find(l => l.endsWith(` ${ref}`)); if (line && /^[0-9a-f]{40} /.test(line)) return line.slice(0, 40); } catch {}
    }
  } catch {}
  return null;
}

async function ensureBookkeeping(client, schema) {
  const q = name => `${client.escapeIdentifier(schema)}.${name}`;
  await client.query(`CREATE TABLE IF NOT EXISTS ${q('schema_migrations')}(
    filename text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${q('schema_migration_ledger')}(
    filename text PRIMARY KEY CHECK (btrim(filename) <> ''),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    hash_rule text NOT NULL CHECK (hash_rule = '${HASH_RULE}'),
    hash_origin text NOT NULL CHECK (hash_origin IN ('VERIFIED','RECONSTRUCTED_FROM_EVIDENCE','UNVERIFIABLE_LEGACY')),
    status text NOT NULL CHECK (status IN ('APPLIED','REVOKED')),
    applied_at timestamptz NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    code_version text,
    evidence text,
    revoked_at timestamptz,
    revoke_reason text,
    CHECK ((status = 'REVOKED') = (revoked_at IS NOT NULL)),
    CHECK (hash_origin = 'VERIFIED' OR evidence IS NOT NULL)
  )`);
  await client.query(`CREATE TABLE IF NOT EXISTS ${q('schema_migration_events')}(
    event_id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    event text NOT NULL CHECK (event ~ '^[A-Z_]{3,40}$'),
    filename text,
    expected_sha256 text,
    actual_sha256 text,
    code_version text,
    detail text CHECK (detail IS NULL OR length(detail) <= 2000)
  )`);
  // F3: every authorization used (owner approval + technical token, or the TEST authorization), recorded in the
  // transaction of the operation it allowed. The unique indexes make a consumed approval or token unusable.
  await client.query(`CREATE TABLE IF NOT EXISTS ${q('schema_migration_authorizations')}(
    authz_id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    operation text NOT NULL CHECK (operation IN ('apply','reapply','adopt','close')),
    filename text,
    plan_code text,
    sha256 text,
    origin text NOT NULL CHECK (origin IN ('OWNER_AND_TECHNICAL','TEST')),
    mode text NOT NULL CHECK (mode IN ('offline','test','production')),
    release_sha text,
    owner_approval_id text,
    owner_decision text,
    manifest_sha256 text,
    token_nonce text,
    token_sha256 text,
    CHECK (origin = 'TEST' OR (token_nonce IS NOT NULL AND (operation = 'close' OR owner_approval_id IS NOT NULL)))
  )`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS schema_migration_authz_approval_once ON ${q('schema_migration_authorizations')}(owner_approval_id) WHERE owner_approval_id IS NOT NULL`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS schema_migration_authz_token_once ON ${q('schema_migration_authorizations')}(token_nonce, coalesce(filename, plan_code, ''), operation) WHERE token_nonce IS NOT NULL`);
  return {migrations: q('schema_migrations'), ledger: q('schema_migration_ledger'), events: q('schema_migration_events'), authz: q('schema_migration_authorizations')};
}

// The files of `dir` with the hash of their exact bytes; the bytes are kept so the runner executes what it hashed.
export async function readMigrations(dir) {
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  const out = new Map();
  for (const file of files) {
    const bytes = await readFile(resolve(dir, file));
    out.set(file, {bytes, sha256: sha256Hex(bytes)});
  }
  return out;
}

// Pure verification of the history (exported for tests). `applied`: filenames in schema_migrations; `ledger`: Map of
// register rows; `disk`: Map filename -> {sha256}. Returns the problems (each blocking) and the pending files.
export function verifyHistory({applied, ledger, disk}) {
  const problems = [];
  const appliedSet = new Set(applied);
  const missing = [];
  for (const file of applied) {
    const row = ledger.get(file);
    if (!row) { problems.push({code: 'MIGRATION_LEGACY_UNADOPTED', file}); continue; }
    if (row.status !== 'APPLIED') { problems.push({code: 'MIGRATION_STATE_AMBIGUOUS', file, detail: `in schema_migrations but ${row.status} in the register`}); continue; }
    const onDisk = disk.get(file);
    if (!onDisk) { missing.push(row); continue; }
    if (onDisk.sha256 !== row.sha256) problems.push({code: 'MIGRATION_CHECKSUM_MISMATCH', file, expected: row.sha256, actual: onDisk.sha256});
  }
  for (const [file, row] of ledger) {
    if (row.status === 'APPLIED' && !appliedSet.has(file)) problems.push({code: 'MIGRATION_STATE_AMBIGUOUS', file, detail: 'APPLIED in the register but absent from schema_migrations (rollback without its revocation?)'});
    if (!HEX64.test(row.sha256 || '') || !HASH_ORIGINS.includes(row.hash_origin) || row.hash_rule !== HASH_RULE) problems.push({code: 'MIGRATION_STATE_AMBIGUOUS', file, detail: 'malformed register row'});
  }
  const pending = [...disk.keys()].filter(file => !appliedSet.has(file));
  for (const row of missing) {
    const renamed = pending.find(file => disk.get(file).sha256 === row.sha256 && !ledger.has(file));
    problems.push(renamed
      ? {code: 'MIGRATION_RENAMED', file: row.filename, detail: `same content as pending ${renamed}`, expected: row.sha256}
      : {code: 'MIGRATION_MISSING', file: row.filename, detail: 'applied but not on disk', expected: row.sha256});
  }
  // A revoked migration may come back only with the same bytes it had when it was applied.
  for (const file of pending) {
    const row = ledger.get(file);
    if (row?.status === 'REVOKED' && row.sha256 !== disk.get(file).sha256) problems.push({code: 'MIGRATION_CHECKSUM_MISMATCH', file, expected: row.sha256, actual: disk.get(file).sha256, detail: 'revoked migration changed on disk'});
  }
  return {problems, pending};
}

const ORDER = ['MIGRATION_STATE_AMBIGUOUS', 'MIGRATION_CHECKSUM_MISMATCH', 'MIGRATION_RENAMED', 'MIGRATION_MISSING', 'MIGRATION_LEGACY_UNADOPTED'];

async function loadState(client, tables) {
  const applied = (await client.query(`SELECT filename, applied_at FROM ${tables.migrations} ORDER BY filename`)).rows;
  const ledger = new Map((await client.query(`SELECT * FROM ${tables.ledger}`)).rows.map(row => [row.filename, row]));
  return {applied, ledger};
}

// Records the problems (own committed transaction, so the reason survives the failure) and throws the first one.
async function failOnProblems(client, tables, problems, version, log) {
  if (!problems.length) return;
  problems.sort((a, b) => ORDER.indexOf(a.code) - ORDER.indexOf(b.code) || String(a.file).localeCompare(String(b.file)));
  const legacy = problems.filter(p => p.code === 'MIGRATION_LEGACY_UNADOPTED');
  const recorded = [...problems.filter(p => p.code !== 'MIGRATION_LEGACY_UNADOPTED'),
    ...(legacy.length ? [{code: 'MIGRATION_LEGACY_UNADOPTED', file: null, detail: `${legacy.length} applied migrations without checksum: adoption required (docs/migration-checksums.md)`}] : [])];
  try {
    for (const p of recorded) {
      await client.query(`INSERT INTO ${tables.events}(event, filename, expected_sha256, actual_sha256, code_version, detail) VALUES($1,$2,$3,$4,$5,$6)`,
        [p.code, p.file ?? null, p.expected ?? null, p.actual ?? null, version, p.detail ? String(p.detail).slice(0, 2000) : null]);
    }
  } catch (error) { log('MIGRATION_EVENT_NOT_RECORDED ' + JSON.stringify({reason: String(error?.message || error)})); }
  const first = problems[0];
  log('MIGRATION_HISTORY_REFUSED ' + JSON.stringify({problems: problems.slice(0, 50)}));
  const error = new MigrationError(first.code, `${first.code}: ${first.file ?? ''} ${first.detail ?? ''}`.trim() + (problems.length > 1 ? ` (+${problems.length - 1} more)` : ''));
  error.problems = problems;
  throw error;
}

// Connects, takes the migration lock and runs fn(client, scope); releases exactly as migrate() always did.
async function withMigrationLock(env, log, fn) {
  const lockTimeoutMs = migrationLockTimeout(env);
  const client = await getPool().connect();
  // While a client is checked out the pool does not listen for its errors: without this listener a connection cut
  // mid-migration would crash the process instead of failing the query (PR #158 review B-1).
  const onError = error => {
    console.error('PG_CLIENT_ERROR', String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]'));
  };
  client.on('error', onError);
  let scope = null;
  let broken = null;
  try {
    scope = await acquireLock(client, lockTimeoutMs);
    // If this process dies during a long statement, PostgreSQL would otherwise notice only when the statement ends,
    // keeping the transaction open and the lock held. PostgreSQL 14+ checks the client every second instead.
    await client.query("SELECT set_config('client_connection_check_interval', '1000', false)").catch(error => {
      log('MIGRATION_CLIENT_CHECK_UNAVAILABLE ' + JSON.stringify({reason: String(error?.message || error)}));
    });
    return await fn(client, scope);
  } catch (error) {
    broken = error;
    throw error;
  } finally {
    if (scope !== null) {
      try {
        const {rows} = await client.query('SELECT pg_advisory_unlock($1::int4, $2::int4) AS ok', [MIGRATION_LOCK_CLASS, scope.key]);
        if (!rows[0].ok) {
          broken = new MigrationError('MIGRATION_UNLOCK_FAILED', 'migration lock was not held at release');
          log('MIGRATION_UNLOCK_FAILED ' + JSON.stringify({schema: scope.schema}));
        }
      } catch (unlockError) {
        broken = unlockError;
        log('MIGRATION_UNLOCK_FAILED ' + JSON.stringify({schema: scope.schema, reason: String(unlockError?.message || unlockError)}));
      }
    }
    // A connection that held the lock and ended in an unknown state (failed unlock, aborted transaction) is closed,
    // which frees its lock and its session settings. A clean one is returned with the 1 s client check reset.
    if (scope !== null && !broken) {
      await client.query('RESET client_connection_check_interval').catch(error => { broken = error; });
    }
    // The listener stays until release(), where the pool takes error handling back (PR #158 review B-2).
    client.removeListener('error', onError);
    client.release(broken && scope !== null ? true : undefined);
  }
}

// ---- F3: double authorization (src/migration-authz.mjs), in every mode ----
// `authz` is for tests only (programmatic, never read from the environment): paths, token owner uid, release sha, clock.
function authzSettings(env, mode, authz = {}) {
  return {
    approvalsPath: authz.approvalsPath ?? resolve(REPO_ROOT, 'db/migration-approvals.json'),
    decisionsPath: authz.decisionsPath ?? resolve(REPO_ROOT, 'docs/governance/owner-decisions.json'),
    dir: authz.dir ?? (env.MATCHPILOT_MIGRATION_AUTHZ_DIR || DEFAULT_AUTHZ_DIR),
    ownerUid: authz.ownerUid ?? (mode === 'test' && typeof process.getuid === 'function' ? process.getuid() : 0),
    releaseSha: authz.releaseSha ?? releaseSha(),
    repoRoot: authz.repoRoot ?? REPO_ROOT,
    now: authz.now ?? Date.now(),
  };
}

async function recordEvent(client, tables, event, file, detail, version, log) {
  try {
    await client.query(`INSERT INTO ${tables.events}(event, filename, code_version, detail) VALUES($1, $2, $3, $4)`, [event, file ?? null, version, String(detail).slice(0, 2000)]);
  } catch (error) { log('MIGRATION_EVENT_NOT_RECORDED ' + JSON.stringify({reason: String(error?.message || error)})); }
}

// Decides the authorization of `ops` and returns {granted, refused, settings, approvals}. An unusable manifest or token
// is recorded and thrown: everything is refused (fail closed).
async function authorizeOps({client, tables, scope, env, mode, ops, authz, version, log}) {
  const settings = authzSettings(env, mode, authz);
  let testAllowed = false;
  if (mode === 'test' && env.MATCHPILOT_MIGRATION_TEST_AUTHORIZATION === TEST_AUTHORIZATION_VALUE) {
    const real = (await client.query(`SELECT count(*)::int AS n FROM ${tables.authz} WHERE origin <> 'TEST'`)).rows[0].n;
    const adopted = (await client.query(`SELECT count(*)::int AS n FROM ${tables.ledger} WHERE hash_origin <> 'VERIFIED'`)).rows[0].n;
    testAllowed = scope.schema !== 'public' && real === 0 && adopted === 0;
    if (!testAllowed) log('MIGRATION_TEST_AUTHORIZATION_REFUSED ' + JSON.stringify({schema: scope.schema, real, adopted}));
  }
  let approvals = {approvals: [], manifestSha256: null};
  let token = null;
  if (!testAllowed) {
    try {
      approvals = loadOwnerApprovals(settings);
      token = loadTechnicalToken(settings);
    } catch (error) {
      if (!(error instanceof AuthzError)) throw error;
      await recordEvent(client, tables, error.code, null, error.message, version, log);
      throw new MigrationError(error.code, error.message);
    }
  }
  const rows = (await client.query(`SELECT operation, filename, plan_code, owner_approval_id, token_nonce FROM ${tables.authz}`)).rows;
  const consumed = {
    approvals: new Set(rows.map(r => r.owner_approval_id).filter(Boolean)),
    closedNonces: new Set(rows.filter(r => r.operation === 'close').map(r => r.token_nonce)),
    uses: new Set(rows.filter(r => r.token_nonce).map(r => `${r.token_nonce}|${r.filename ?? r.plan_code}|${r.operation}`)),
  };
  const {granted, refused} = decide({ops, mode, env, testAllowed, approvals: approvals.approvals, token, consumed, now: settings.now});
  return {granted, refused, settings, approvals, token};
}

async function recordUse(client, tables, grant, mode, settings, approvals) {
  await client.query(`INSERT INTO ${tables.authz}(operation, filename, plan_code, sha256, origin, mode, release_sha, owner_approval_id, owner_decision,
    manifest_sha256, token_nonce, token_sha256) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
  [grant.operation, grant.file ?? null, grant.planCode ?? null, grant.sha256 ?? null, grant.origin, mode, settings.releaseSha ?? null,
    grant.approval?.id ?? null, grant.approval?.decision ?? null, grant.origin === 'TEST' ? null : approvals.manifestSha256,
    grant.token?.nonce ?? null, grant.token?.tokenSha256 ?? null]);
}

// A token that authorized something is closed once the run succeeded: never usable again, even for an operation it
// listed and that did not run. The file is removed when this process may; otherwise the database record suffices.
async function closeToken(client, tables, token, mode, settings, log) {
  await client.query(`INSERT INTO ${tables.authz}(operation, origin, mode, release_sha, token_nonce, token_sha256) VALUES('close', 'OWNER_AND_TECHNICAL', $1, $2, $3, $4)`,
    [mode, settings.releaseSha, token.nonce, token.tokenSha256]);
  try { unlinkSync(token.path); log('MIGRATION_TOKEN_CONSUMED ' + JSON.stringify({removed: true})); }
  catch (error) { log('MIGRATION_TOKEN_CONSUMED ' + JSON.stringify({removed: false, reason: error.code || String(error.message)})); }
}

export async function migrate({env = process.env, log = console.log, dir = resolve('migrations'), verifyOnly = false, authz} = {}) {
  // Fail closed before any database work. The pool always connects to process.env.DATABASE_URL, so that is the URL
  // the host check must see.
  migrationPolicy({...env, DATABASE_URL: process.env.DATABASE_URL});
  const mode = runtimeMode(env);
  migrationLockTimeout(env);
  const disk = await readMigrations(dir);
  const version = codeVersion(env);
  return withMigrationLock(env, log, async (client, scope) => {
    const tables = await ensureBookkeeping(client, scope.schema);
    const {applied, ledger} = await loadState(client, tables);
    const {problems, pending} = verifyHistory({applied: applied.map(r => r.filename), ledger, disk});
    // An authorization recorded for a file the register does not know is a state nobody can explain.
    const orphans = (await client.query(`SELECT DISTINCT a.filename FROM ${tables.authz} a LEFT JOIN ${tables.ledger} l ON l.filename = a.filename
      WHERE a.operation IN ('apply','reapply') AND l.filename IS NULL`)).rows;
    for (const {filename} of orphans) problems.push({code: 'MIGRATION_STATE_AMBIGUOUS', file: filename, detail: 'authorization recorded without a register row'});
    await failOnProblems(client, tables, problems, version, log);
    if (verifyOnly) return {applied: [], held: pending, verified: applied.length};
    if (!pending.length) return {applied: [], held: []};

    const revocationEvents = new Map((await client.query(`SELECT filename, max(event_id)::int AS id FROM ${tables.events} WHERE event = 'REVOKED' GROUP BY filename`)).rows.map(r => [r.filename, r.id]));
    const ops = pending.map(file => ({file, sha256: disk.get(file).sha256, operation: ledger.get(file)?.status === 'REVOKED' ? 'reapply' : 'apply',
      revocationEvent: revocationEvents.get(file) ?? null}));
    const {granted, refused, settings, approvals, token} = await authorizeOps({client, tables, scope, env, mode, ops, authz, version, log});
    // A revoked migration stays revoked: without its own re-application authorization it is held, never applied, and
    // the start goes on. Any other pending file without both authorizations stops everything, before anything runs.
    const held = refused.filter(op => op.operation === 'reapply');
    const blocked = refused.filter(op => op.operation !== 'reapply');
    for (const op of held) log('MIGRATION_REVOKED_HELD ' + JSON.stringify({file: op.file, reasons: op.reasons}));
    if (blocked.length) {
      for (const op of blocked) await recordEvent(client, tables, 'MIGRATION_NOT_AUTHORIZED', op.file, op.reasons.join(','), version, log);
      log('MIGRATIONS_NOT_AUTHORIZED ' + JSON.stringify({mode, refused: blocked.map(op => ({file: op.file, operation: op.operation, reasons: op.reasons}))}));
      throw new MigrationError('MIGRATION_NOT_AUTHORIZED', `${blocked.length} pending migration(s) without owner and technical authorization (${blocked.map(op => `${op.file}: ${op.reasons.join(',')}`).join('; ')}); nothing applied`);
    }
    const firstHeld = held.map(op => op.file).sort()[0];
    if (firstHeld && granted.some(op => op.file > firstHeld)) {
      throw new MigrationError('MIGRATION_ORDER_BLOCKED', `${firstHeld} is revoked and held; a later migration is not applied ahead of it; nothing applied`);
    }
    const apply = granted.map(op => op.file);
    for (const grant of granted) {
      const file = grant.file;
      const {bytes, sha256} = disk.get(file);
      const revoked = grant.operation === 'reapply';
      await client.query('BEGIN');
      try {
        await client.query(bytes.toString('utf8'));
        await client.query(`INSERT INTO ${tables.migrations}(filename) VALUES($1)`, [file]);
        if (revoked) {
          // Same bytes as when it was first applied (verifyHistory): the row returns to APPLIED, its hash unchanged.
          await client.query(`UPDATE ${tables.ledger} SET status = 'APPLIED', applied_at = now(), revoked_at = NULL, revoke_reason = NULL, code_version = $2
            WHERE filename = $1 AND status = 'REVOKED' AND sha256 = $3`, [file, version, sha256]);
        } else {
          await client.query(`INSERT INTO ${tables.ledger}(filename, sha256, hash_rule, hash_origin, status, applied_at, code_version)
            VALUES($1, $2, $3, 'VERIFIED', 'APPLIED', now(), $4)`, [file, sha256, HASH_RULE, version]);
        }
        await recordUse(client, tables, grant, mode, settings, approvals);
        await client.query(`INSERT INTO ${tables.events}(event, filename, actual_sha256, code_version, detail) VALUES($1, $2, $3, $4, $5)`,
          [revoked ? 'REAPPLIED' : 'APPLIED', file, sha256, version, grant.origin === 'TEST' ? 'TEST authorization' : `${grant.approval.id}; token ${grant.token.nonce.slice(0, 12)}`]);
        await client.query('COMMIT');
        log('MIGRATION_APPLIED ' + file);
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    if (token && granted.some(op => op.origin === 'OWNER_AND_TECHNICAL')) await closeToken(client, tables, token, mode, settings, log);
    return {applied: apply, held: held.map(op => op.file)};
  });
}

// ---- Legacy adoption (explicit, confirmed, never automatic) ----
// A database whose schema_migrations rows have no register row cannot be verified: the hashes of what ran in the
// past are not known. adoptLegacy records, for each such row, the hash of the file on disk today:
//   RECONSTRUCTED_FROM_EVIDENCE when an evidence file (sha256sum format, e.g. the root-owned
//     /var/lib/mp-deploy/migrations.sha256 ledger) gives the same hash for that file; a different hash refuses all;
//   UNVERIFIABLE_LEGACY otherwise, only with allowUnverifiable (the row then says that the past is not verifiable).
// It runs in two steps: `plan` returns the items and a confirmation code bound to schema, files, hashes and origins;
// the adoption is written only with that exact code and an owner decision id (`authorizedBy`). Any change between the
// two steps changes the code. A production adoption needs an owner GO (docs/migration-checksums.md).
export function parseEvidence(text) {
  const map = new Map();
  for (const line of String(text).split('\n')) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)\s*$/.exec(line.trim());
    if (m) {
      const file = m[2].split('/').at(-1);
      if (map.has(file) && map.get(file) !== m[1]) throw new MigrationError('ADOPT_EVIDENCE_AMBIGUOUS', `two hashes for ${file} in the evidence`);
      map.set(file, m[1]);
    } else if (line.trim()) throw new MigrationError('ADOPT_EVIDENCE_MALFORMED', 'evidence lines must be "<sha256> <file>"');
  }
  return map;
}

export async function adoptLegacy({env = process.env, log = console.log, dir = resolve('migrations'), evidence = null, evidenceLabel = null,
  allowUnverifiable = false, confirm = null, authorizedBy = null, plan = false, authz} = {}) {
  migrationPolicy({...env, DATABASE_URL: process.env.DATABASE_URL});
  const mode = runtimeMode(env);
  const disk = await readMigrations(dir);
  const version = codeVersion(env);
  const evidenceMap = evidence === null ? new Map() : parseEvidence(evidence);
  const evidenceRef = evidence === null ? null : `${evidenceLabel || 'evidence'} sha256:${sha256Hex(Buffer.from(String(evidence)))}`;
  return withMigrationLock(env, log, async (client, scope) => {
    const tables = await ensureBookkeeping(client, scope.schema);
    const {applied, ledger} = await loadState(client, tables);
    const items = [];
    for (const {filename, applied_at} of applied) {
      if (ledger.has(filename)) continue;
      const onDisk = disk.get(filename);
      if (!onDisk) throw new MigrationError('ADOPT_FILE_MISSING', `${filename} is applied but not on disk: nothing to adopt it against`);
      const known = evidenceMap.get(filename);
      if (known !== undefined && known !== onDisk.sha256) {
        throw new MigrationError('ADOPT_EVIDENCE_MISMATCH', `${filename}: evidence ${known} differs from the file on disk ${onDisk.sha256}`);
      }
      if (known === undefined && !allowUnverifiable) throw new MigrationError('ADOPT_UNVERIFIABLE_NOT_ALLOWED', `${filename} has no evidence; allowUnverifiable is required to record it as UNVERIFIABLE_LEGACY`);
      items.push({filename, sha256: onDisk.sha256, applied_at, origin: known === undefined ? 'UNVERIFIABLE_LEGACY' : 'RECONSTRUCTED_FROM_EVIDENCE'});
    }
    // The rest of the history must already be sound: adoption never hides another problem.
    const others = verifyHistory({applied: applied.map(r => r.filename), ledger, disk}).problems.filter(p => p.code !== 'MIGRATION_LEGACY_UNADOPTED');
    if (others.length) await failOnProblems(client, tables, others, version, log);
    const code = sha256Hex(Buffer.from(JSON.stringify([scope.schema, evidenceRef, items.map(i => [i.filename, i.sha256, i.origin])]))).slice(0, 16);
    if (plan || !items.length) return {plan: true, code, items, schema: scope.schema};
    if (confirm !== code) throw new MigrationError('ADOPT_CONFIRMATION_MISMATCH', 'the confirmation code does not match the current plan: run the plan again');
    if (!/^[A-Z][A-Z0-9-]{2,99}$/.test(String(authorizedBy || ''))) throw new MigrationError('ADOPT_AUTHORIZATION_REQUIRED', 'authorizedBy must name the owner decision that authorizes this adoption');
    // F3: the adoption of this exact plan needs the owner approval (operation adopt, plan_code) and the technical token.
    const {granted, refused, settings, approvals, token} = await authorizeOps({client, tables, scope, env, mode, ops: [{operation: 'adopt', planCode: code}], authz, version, log});
    if (refused.length) {
      await recordEvent(client, tables, 'MIGRATION_NOT_AUTHORIZED', null, `adopt ${code}: ${refused[0].reasons.join(',')}`, version, log);
      throw new MigrationError('ADOPT_NOT_AUTHORIZED', `adoption ${code} without owner and technical authorization: ${refused[0].reasons.join(',')}`);
    }
    if (granted[0].origin !== 'TEST' && granted[0].approval.decision !== authorizedBy) {
      throw new MigrationError('ADOPT_AUTHORIZATION_REQUIRED', `authorizedBy ${authorizedBy} is not the decision of the owner approval ${granted[0].approval.id}`);
    }
    await client.query('BEGIN');
    try {
      await recordUse(client, tables, granted[0], mode, settings, approvals);
      for (const item of items) {
        const note = item.origin === 'RECONSTRUCTED_FROM_EVIDENCE'
          ? `reconstructed: ${evidenceRef}; authorized by ${authorizedBy}`
          : `unverifiable legacy: hash of the file on disk at adoption, what ran before is not verifiable; authorized by ${authorizedBy}`;
        await client.query(`INSERT INTO ${tables.ledger}(filename, sha256, hash_rule, hash_origin, status, applied_at, code_version, evidence)
          VALUES($1, $2, $3, $4, 'APPLIED', $5, $6, $7)`, [item.filename, item.sha256, HASH_RULE, item.origin, item.applied_at, version, note]);
        await client.query(`INSERT INTO ${tables.events}(event, filename, actual_sha256, code_version, detail) VALUES('ADOPTED', $1, $2, $3, $4)`,
          [item.filename, item.sha256, version, `${item.origin}; ${authorizedBy}`]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    if (token && granted[0].origin === 'OWNER_AND_TECHNICAL') await closeToken(client, tables, token, mode, settings, log);
    log('MIGRATION_LEGACY_ADOPTED ' + JSON.stringify({count: items.length, authorizedBy}));
    return {plan: false, code, items, schema: scope.schema};
  });
}

// CLI: `node src/migrate.mjs` applies; `verify` only verifies; `adopt --plan|--confirm <code> --authorized-by <id>
// [--evidence <file>] [--allow-unverifiable]` adopts a legacy history.
async function main(argv) {
  const [command = 'apply', ...rest] = argv;
  const flag = name => rest.includes(name);
  const value = name => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
  if (command === 'apply') return migrate();
  if (command === 'verify') { const result = await migrate({verifyOnly: true}); console.log('MIGRATION_HISTORY_VERIFIED ' + JSON.stringify(result)); return result; }
  if (command === 'adopt') {
    const path = value('--evidence');
    const result = await adoptLegacy({plan: flag('--plan'), confirm: value('--confirm'), authorizedBy: value('--authorized-by'),
      allowUnverifiable: flag('--allow-unverifiable'), evidence: path ? readFileSync(path, 'utf8') : null, evidenceLabel: path ? basename(path) : null});
    console.log((result.plan ? 'MIGRATION_ADOPTION_PLAN ' : 'MIGRATION_ADOPTION_DONE ') + JSON.stringify(result));
    return result;
  }
  throw new MigrationError('BAD_MIGRATE_COMMAND', `unknown command ${command}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(closePool).catch(e => { console.error(e); process.exitCode=1; return closePool().catch(() => {}); });
}
