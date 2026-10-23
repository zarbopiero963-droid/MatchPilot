// PERSIST-PREFLIGHT-01: the VPS preflight is read-only and never reports a secret.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {COUNTED, REPORTED_KEYS, describeDatabaseUrl, environmentFiles, inspectDatabase, parseEnv} from '../tools/vps/persistence-preflight.mjs';

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
  assert.deepEqual(environmentFiles('/srv/matchpilot/app.env (ignore_errors=no) /srv/matchpilot/secrets/fpt.env (ignore_errors=yes)'),
    ['/srv/matchpilot/app.env', '/srv/matchpilot/secrets/fpt.env']);
  assert.ok(!REPORTED_KEYS.some(k => /URL|PASSWORD|TOKEN|SECRET|KEY$/.test(k)), 'no secret-bearing key is reported');
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
    assert.match(sql, /^(SELECT|SHOW|BEGIN READ ONLY|ROLLBACK|SET LOCAL statement_timeout)/, sql.slice(0, 60));
    // Keywords outside string literals (privilege names such as 'CREATE' are only read).
    assert.doesNotMatch(sql.replace(/'[^']*'/g, "''"), /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|COPY|VACUUM|COMMIT)\b/i, sql.slice(0, 60));
  }
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
  assert.equal(report.transaction_read_only, 'on');
  assert.match(report.server[0].version, /^\d+/);
  assert.equal(report.server[0].database, new URL(url).pathname.slice(1));
  assert.ok(Array.isArray(report.tables) && Array.isArray(report.schemas));
  assert.ok(Object.keys(report.exact_counts).every(k => COUNTED.includes(k)));
  const password = decodeURIComponent(new URL(url).password);
  if (password) assert.ok(!JSON.stringify(report).includes(password), 'the password never appears in the report');
});
