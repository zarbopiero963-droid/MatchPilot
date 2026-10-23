// PERSIST-PREFLIGHT-01: the VPS preflight is read-only and never reports a secret.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {COUNTED, REPORTED_KEYS, describeDatabaseUrl, environmentFiles, inspectDatabase, parseEnv, unitConfig, unitEnvironment} from '../tools/vps/persistence-preflight.mjs';
import {FACTS_GAP_SQL} from '../src/providers/futpython/facts-refresh.mjs';

const SOURCE = readFileSync(new URL('../tools/vps/persistence-preflight.mjs', import.meta.url), 'utf8');

test('preflight: env parsing and URL description never carry the password', () => {
  const env = parseEnv('# comment\nDATABASE_URL="postgres://app:s3cr3t@127.0.0.1:5434/matchpilot_staging"\nexport MATCHPILOT_RUNTIME_MODE=offline\nBAD LINE\n');
  assert.deepEqual(Object.keys(env), ['DATABASE_URL', 'MATCHPILOT_RUNTIME_MODE']);
  assert.equal(env.MATCHPILOT_RUNTIME_MODE, 'offline');
  const d = describeDatabaseUrl(env.DATABASE_URL);
  assert.deepEqual(d, {scheme: 'postgres', host: '127.0.0.1', port: '5434', database: 'matchpilot_staging', user: 'app', password_set: true});
  assert.ok(!JSON.stringify(d).includes('s3cr3t'));
  assert.deepEqual(describeDatabaseUrl('not a url'), {unparsable: true});
  assert.equal(describeDatabaseUrl(undefined), null);
  // systemctl show prints one EnvironmentFiles= line per file.
  assert.deepEqual(environmentFiles('LoadState=loaded\nEnvironmentFiles=/srv/matchpilot/secrets/worker.env (ignore_errors=no)\nEnvironmentFiles=/srv/matchpilot/secrets/fpt.env (ignore_errors=yes)\n'),
    ['/srv/matchpilot/secrets/worker.env', '/srv/matchpilot/secrets/fpt.env']);
  assert.deepEqual(unitEnvironment('NODE_ENV=production "MSG=a b" MATCHPILOT_RUNTIME_MODE=offline'),
    {NODE_ENV: 'production', MSG: 'a b', MATCHPILOT_RUNTIME_MODE: 'offline'});
  assert.ok(!REPORTED_KEYS.some(k => /URL|PASSWORD|TOKEN|SECRET|KEY$/.test(k)), 'no secret-bearing key is reported');
});

test('preflight: a unit reads every env file in order, and a unit systemd cannot show has no mode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
  writeFileSync(join(dir, 'worker.env'), 'DATABASE_URL=postgres://w:pw1@127.0.0.1:5434/matchpilot_staging\nMATCHPILOT_RUNTIME_MODE=production\n');
  writeFileSync(join(dir, 'fpt.env'), 'FUTPYTHON_CRON_ENABLED=true\nFUTPYTHON_TOKEN=tok\n');
  const show = () => ['LoadState=loaded', 'ActiveState=active', 'Environment=NODE_ENV=production',
    `EnvironmentFiles=${dir}/worker.env (ignore_errors=no)`, `EnvironmentFiles=${dir}/fpt.env (ignore_errors=no)`,
    `EnvironmentFiles=${dir}/missing.env (ignore_errors=yes)`].join('\n');
  const u = unitConfig('matchpilot-fpt-worker.service', {show});
  assert.equal(u.effective_runtime_mode, 'production');
  assert.equal(u.settings.FUTPYTHON_CRON_ENABLED, 'true');
  assert.equal(u.settings.NODE_ENV, 'production');
  assert.deepEqual(u.database, {scheme: 'postgres', host: '127.0.0.1', port: '5434', database: 'matchpilot_staging', user: 'w', password_set: true});
  assert.deepEqual(u.environment_files.map(f => [f.path, f.readable]), [[`${dir}/worker.env`, true], [`${dir}/fpt.env`, true], [`${dir}/missing.env`, 'ENOENT']]);
  // A single quoted Environment= assignment keeps its whole value.
  const quoted = unitConfig('x.service', {show: () => 'LoadState=loaded\nEnvironment="NODE_ENV=a b"'});
  assert.equal(quoted.settings.NODE_ENV, 'a b');
  const {_url, ...shown} = u;
  assert.ok(!/pw1|tok/.test(JSON.stringify(shown)));
  for (const raw of ['ERROR: System has not been booted with systemd', 'LoadState=not-found\nActiveState=inactive']) {
    const failed = unitConfig('matchpilot-app.service', {show: () => raw});
    assert.equal(failed.effective_runtime_mode, null, 'no default mode for a unit that is not loaded');
    assert.ok(failed.error);
  }
});

test('preflight: run through a symlink from another directory, it still prints its report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'preflight-link-'));
  symlinkSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'vps'), join(dir, 'vps'));
  // --self-check only: the test never reads the host it runs on (on the VPS the deploy runs these tests).
  const out = execFileSync(process.execPath, [join(dir, 'vps', 'persistence-preflight.mjs'), '--self-check'], {cwd: tmpdir(), encoding: 'utf8', env: {PATH: process.env.PATH}});
  assert.deepEqual(JSON.parse(out), {preflight: 'mp-persistence-preflight-1', self_check: true});
});

test('preflight: the source writes nothing and runs only read-only commands', () => {
  // No file writes, no shell, no process spawning other than the fixed read-only commands.
  assert.doesNotMatch(SOURCE, /writeFile|appendFile|createWriteStream|unlink|rmSync|mkdir|renameSync|copyFile|(?<![.\w])exec\(|execSync|spawn|child_process.exec\b/);
  const commands = [...SOURCE.matchAll(/sh\('([^']+)', \[([^\]]*)\]/g)].map(m => `${m[1]} ${m[2].split(',')[0].trim()}`);
  for (const c of commands) assert.match(c, /^(systemctl ('show'|unit|'is-enabled')|pg_lsclusters '--no-header'|hostname )$/, c);
  // Every SQL statement is a SELECT, SHOW or the read-only transaction frame.
  const statements = [...SOURCE.matchAll(/query\(([`'"])([\s\S]*?)\1/g)].map(m => m[2].trim());
  const sqlConstants = [...SOURCE.matchAll(/^\s+\w+: `([\s\S]*?)`,?$/gm)].map(m => m[1].trim());
  assert.ok(statements.length >= 5 && sqlConstants.length >= 8, `statements ${statements.length}, constants ${sqlConstants.length}`);
  for (const sql of [...statements, ...sqlConstants]) {
    assert.match(sql, /^(SELECT|SHOW|BEGIN READ ONLY|ROLLBACK|SET LOCAL (statement|lock)_timeout|SAVEPOINT preflight|RELEASE SAVEPOINT preflight|ROLLBACK TO SAVEPOINT preflight)/, sql.slice(0, 60));
    // Keywords outside string literals (privilege names such as 'CREATE' are only read).
    assert.doesNotMatch(sql.replace(/'[^']*'/g, "''"), /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|COMMIT)\b/i, sql.slice(0, 60));
  }
  // The facts recovery measure is imported from the application: it must be a read too.
  assert.match(FACTS_GAP_SQL.trim(), /^SELECT/);
  assert.doesNotMatch(FACTS_GAP_SQL.replace(/'[^']*'/g, "''"), /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|COMMIT)\b/i);
  assert.match(SOURCE, /factsGap: FACTS_GAP_SQL/);
  assert.match(SOURCE, /BEGIN READ ONLY/);
  assert.deepEqual(COUNTED.filter(t => !/^[a-z_]+$/.test(t)), []);
});

test('preflight: the database inspection runs in a read-only transaction on a real PostgreSQL', {timeout: 60000}, async t => {
  const pg = (await import('pg')).default;
  const url = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const probe = new pg.Client({connectionString: url, connectionTimeoutMillis: 2000});
  try { await probe.connect(); }
  catch (cause) {
    await probe.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  await probe.end();
  const report = await inspectDatabase(url, {pg});
  // One failing statement does not abort the others: a schema without the MatchPilot tables still gets every catalog read.
  const empty = new URL(url);
  empty.searchParams.set('options', '-csearch_path=preflight_empty_schema');
  const partial = await inspectDatabase(empty.toString(), {pg});
  assert.equal(partial.migrations.error, '42P01');
  assert.ok(Array.isArray(partial.schemas) && Array.isArray(partial.tables) && Array.isArray(partial.server));
  assert.equal(partial.exact_counts.schema_migrations, null);
  assert.equal(partial.transaction_read_only, 'on');
  assert.equal(report.transaction_read_only, 'on');
  assert.match(report.server[0].version, /^\d+/);
  assert.equal(report.server[0].database, new URL(url).pathname.slice(1));
  assert.ok(Array.isArray(report.tables) && Array.isArray(report.schemas));
  assert.ok(Object.keys(report.exact_counts).every(k => COUNTED.includes(k)));
  const password = decodeURIComponent(new URL(url).password);
  if (password) assert.ok(!JSON.stringify(report).includes(password), 'the password never appears in the report');
});
