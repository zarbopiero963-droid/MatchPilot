#!/usr/bin/env node
// PERSIST-PREFLIGHT-01: read-only preflight of the VPS before the priority 4 persistence migration
// (MP-PERSISTENCE-232-NEXT-20261023). The owner runs it as root on the VPS from the deployed release:
//
//   cd /srv/mp-deploy/current && node tools/vps/persistence-preflight.mjs > /root/persistence-preflight.json
//
// It writes nothing: no file, no database row, no service change. Each database statement runs in one
// READ ONLY transaction with a statement timeout. It never prints a password, a token or a full connection
// string: of each DATABASE_URL only scheme, host, port, database and user are reported, and of the env files only
// the keys listed in REPORTED_KEYS (values of every other key are never read into the report).
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {FACTS_GAP_SQL} from '../../src/providers/futpython/facts-refresh.mjs';

export const UNITS = ['matchpilot-app.service', 'matchpilot-fpt-worker.service'];
export const REPORTED_KEYS = ['MATCHPILOT_RUNTIME_MODE', 'MATCHPILOT_BACKGROUND_ENABLED', 'MATCHPILOT_APPROVED_MIGRATIONS',
  'FUTPYTHON_CRON_ENABLED', 'DATA_WATCHDOG_ENABLED', 'TOTALCORNER_ENABLED', 'NODE_ENV'];
const STATE = process.env.MP_STATE || '/var/lib/mp-deploy';
const CURRENT = '/srv/mp-deploy/current';

// KEY=VALUE lines of a systemd EnvironmentFile; quotes are stripped, comments ignored.
export function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

// The non-secret parts of a PostgreSQL URL; the password is never returned.
export function describeDatabaseUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname || new URLSearchParams(u.search).get('host') || '(socket)';
    return {scheme: u.protocol.replace(':', ''), host, port: u.port || '5432', database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      user: decodeURIComponent(u.username), password_set: u.password !== ''};
  } catch {
    return {unparsable: true};
  }
}

function sh(cmd, args) {
  try { return execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000}).trim(); }
  catch (error) { return `ERROR: ${String(error.stderr || error.message).trim().split('\n')[0]}`; }
}

// The paths of systemd's EnvironmentFiles property: `systemctl show` prints one "EnvironmentFiles=/path (ignore_errors=no)"
// line per file, in load order.
export const environmentFiles = raw => String(raw || '').split(/\r?\n/)
  .map(line => /^EnvironmentFiles=(\/\S+) \(ignore_errors=(?:yes|no)\)$/.exec(line.trim())?.[1]).filter(Boolean);

// The unit's own Environment= property: space-separated assignments, an assignment holding a space is double-quoted.
export const unitEnvironment = value => parseEnv([...String(value || '').matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)]
  .map(m => (m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2])).join('\n'));

const SHOW_PROPERTIES = ['LoadState', 'ActiveState', 'SubState', 'WorkingDirectory', 'ExecMainStartTimestamp', 'Environment', 'EnvironmentFiles'];

// The env files a unit loads (systemd's own view), and the reported keys they set; the last file wins, as in systemd.
// A unit systemd cannot show is reported with its error and no mode, never with the code default.
export function unitConfig(unit, {show = u => sh('systemctl', ['show', u, ...SHOW_PROPERTIES.flatMap(p => ['-p', p])])} = {}) {
  const raw = show(unit);
  const props = parseEnv(raw.split(/\r?\n/).filter(line => !line.startsWith('EnvironmentFiles=')).join('\n'));
  if (raw.startsWith('ERROR:') || props.LoadState !== 'loaded') {
    return {unit, error: raw.startsWith('ERROR:') ? raw : `LoadState=${props.LoadState ?? 'unknown'}`, effective_runtime_mode: null, database: null, _url: null};
  }
  const files = environmentFiles(raw);
  // Environment= lines of the unit come first; EnvironmentFile= entries override them, as systemd does.
  // The raw property line: parseEnv would strip the quotes of a single quoted assignment.
  const environmentLine = raw.split(/\r?\n/).find(line => line.startsWith('Environment='));
  const env = unitEnvironment(environmentLine ? environmentLine.slice('Environment='.length) : '');
  const readable = {};
  for (const file of files) {
    try { Object.assign(env, parseEnv(readFileSync(file, 'utf8'))); readable[file] = true; }
    catch (error) { readable[file] = error.code || false; }
  }
  return {
    unit, active: props.ActiveState, sub: props.SubState, working_directory: props.WorkingDirectory, started: props.ExecMainStartTimestamp,
    environment_files: files.map(f => ({path: f, present: existsSync(f), readable: readable[f], mode: existsSync(f) ? (statSync(f).mode & 0o777).toString(8) : null})),
    settings: Object.fromEntries(REPORTED_KEYS.map(k => [k, env[k] ?? null])),
    // src/runtime-safety.mjs: an unset mode is 'offline'.
    effective_runtime_mode: String(env.MATCHPILOT_RUNTIME_MODE || 'offline').trim().toLowerCase(),
    database: describeDatabaseUrl(env.DATABASE_URL),
    _url: env.DATABASE_URL || null
  };
}

const SQL = {
  server: `SELECT current_setting('server_version') AS version, current_setting('server_version_num') AS version_num,
      current_database() AS database, current_user AS "user", inet_server_port() AS port, pg_is_in_recovery() AS in_recovery,
      pg_size_pretty(pg_database_size(current_database())) AS size`,
  schemas: `SELECT nspname AS schema FROM pg_namespace WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema' ORDER BY 1`,
  tables: `SELECT n.nspname AS schema, c.relname AS table, c.relkind AS kind, c.reltuples::bigint AS estimated_rows,
      pg_total_relation_size(c.oid) AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p','v','m') AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' ORDER BY 1, 2`,
  foreignKeys: `SELECT conrelid::regclass::text AS from_table, confrelid::regclass::text AS to_table, conname AS name
    FROM pg_constraint WHERE contype = 'f' ORDER BY 1, 2, 3`,
  triggers: `SELECT tgrelid::regclass::text AS table, tgname AS name FROM pg_trigger WHERE NOT tgisinternal ORDER BY 1, 2`,
  migrations: `SELECT filename, applied_at FROM schema_migrations ORDER BY filename`,
  privileges: `SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants WHERE grantee = current_user GROUP BY 1 ORDER BY 1`,
  schemaPrivileges: `SELECT current_schema() AS schema, has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create,
      has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_schema`,
  // FPT-FACTS-GATE recovery on the real data: hidden and stale facts, duplicates, history size and digest.
  factsGap: FACTS_GAP_SQL,
  syncRuns: `SELECT kind, status, started_at, finished_at, rows_inserted FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 5`,
  persistenceTables: `SELECT to_regclass('paper_ledger_entries') IS NOT NULL OR to_regclass('saved_backtests') IS NOT NULL
      OR to_regclass('strategy_definitions') IS NOT NULL AS any_present`
};
// Exact counts only for these tables (the FPT history and the migration ledger); the rest are planner estimates.
export const COUNTED = ['schema_migrations', 'fpt_raw_snapshots', 'fpt_match_versions', 'fpt_match_facts', 'fpt_onboarding', 'fpt_sync_runs'];

export async function inspectDatabase(url, {pg = createRequire(`${CURRENT}/package.json`)('pg')} = {}) {
  const client = new pg.Client({connectionString: url, connectionTimeoutMillis: 10000, application_name: 'mp-persistence-preflight'});
  await client.connect();
  const out = {};
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");
    // Never queue behind a migration or another exclusive lock.
    await client.query("SET LOCAL lock_timeout = '5s'");
    // Each statement in its own savepoint: one failure (missing table, timeout, permission) is reported and the others
    // still run.
    const read = async (sql, params) => {
      await client.query('SAVEPOINT preflight');
      try {
        const rows = (await client.query(sql, params)).rows;
        await client.query('RELEASE SAVEPOINT preflight');
        return rows;
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT preflight');
        return {error: error.code || error.message};
      }
    };
    for (const [name, sql] of Object.entries(SQL)) out[name] = await read(sql);
    out.exact_counts = {};
    for (const table of COUNTED) {
      const exists = await read('SELECT to_regclass($1) IS NOT NULL AS ok', [table]);
      if (!Array.isArray(exists)) out.exact_counts[table] = exists;
      else if (!exists[0].ok) out.exact_counts[table] = null;
      else {
        const rows = await read(`SELECT count(*) AS n FROM ${table}`);
        out.exact_counts[table] = Array.isArray(rows) ? Number(rows[0].n) : rows;
      }
    }
    out.transaction_read_only = (await client.query('SHOW transaction_read_only')).rows[0].transaction_read_only;
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  return out;
}

function listDir(dir, pattern) {
  try { return readdirSync(dir).filter(n => pattern.test(n)).sort(); } catch { return null; }
}

function backups() {
  return {
    pg17_nightly_last: (listDir('/srv/matchpilot/backups/pg', /^2\d{7}T0330/) || []).slice(-1)[0] || null,
    staging_backup_service: sh('systemctl', ['show', 'matchpilot-staging-backup.service', '-p', 'Result', '-p', 'ExecMainStatus', '-p', 'ExecMainExitTimestamp']),
    staging_backup_timer: sh('systemctl', ['is-enabled', 'matchpilot-staging-backup.timer']),
    staging_restore_doc_present: existsSync('/srv/matchpilot/infra/staging-backup/RESTORE-PG18-STAGING.md'),
    postgres_clusters: sh('pg_lsclusters', ['--no-header'])
  };
}

function ledgerLines() {
  try { return readFileSync(`${STATE}/migrations.sha256`, 'utf8').trim().split('\n').length; }
  catch (error) { return error.code === 'ENOENT' ? null : {error: error.code}; }
}

function deployState() {
  let current = null;
  try { current = readlinkSync(CURRENT); } catch {}
  return {
    current_release: current,
    migrations_ledger_present: existsSync(`${STATE}/migrations.sha256`),
    migrations_ledger_files: ledgerLines(),
    allow_files: listDir(STATE, /^allow-(migrations|rollback)-/),
    release_migrations: listDir(`${CURRENT}/migrations`, /\.sql$/),
    freeze: existsSync(`${STATE}/FREEZE`)
  };
}

export async function preflight() {
  const units = UNITS.map(unitConfig);
  const databases = {};
  for (const u of units) {
    if (!u._url) continue;
    const d = u.database;
    const key = `${d.host}:${d.port}/${d.database}`;
    if (!databases[key]) {
      try { databases[key] = {used_by: [u.unit], ...(await inspectDatabase(u._url))}; }
      catch (error) { databases[key] = {used_by: [u.unit], error: error.code || String(error.message).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')}; }
    } else databases[key].used_by.push(u.unit);
  }
  for (const u of units) delete u._url;
  return {preflight: 'mp-persistence-preflight-1', at: new Date().toISOString(), host: sh('hostname', []), units, databases,
    deploy_state: deployState(), backups: backups()};
}

// Run as a script, also through the /srv/mp-deploy/current symlink.
// `--self-check` proves the script starts (used by the tests, which must never read the host they run on).
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  if (process.argv.includes('--self-check')) console.log(JSON.stringify({preflight: 'mp-persistence-preflight-1', self_check: true}));
  else console.log(JSON.stringify(await preflight(), null, 1));
}
