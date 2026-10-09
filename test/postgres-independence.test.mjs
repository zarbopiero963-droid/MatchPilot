import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

const fixtureUrl = new URL('./fixtures/independent-historical-sample.json', import.meta.url);
const digestUrl = new URL('./fixtures/independent-historical-sample.sha256', import.meta.url);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve(output) : reject(new Error(`node ${args.join(' ')} exited ${code}\n${output}`)));
  });
}

async function waitForServer(child, output, port) {
  const deadline = Date.now() + 30000;
  while (!output.value.includes(`listening on ${port} (test)`) && child.exitCode == null && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(child.exitCode, null, output.value);
  assert.match(output.value, /MATCHPILOT_BACKGROUND_SKIPPED.*runtime_isolated/);
}

test('PostgreSQL 17 independent migration, verified sample replay and API are deterministic', {timeout: 90000}, async t => {
  const fixtureBytes = await readFile(fixtureUrl);
  const expectedDigest = (await readFile(digestUrl, 'utf8')).trim().split(/\s+/)[0];
  assert.match(expectedDigest, /^[0-9a-f]{64}$/);
  assert.equal(sha256(fixtureBytes), expectedDigest);
  const fixtureText = fixtureBytes.toString('utf8');
  assert.doesNotMatch(fixtureText, /postgres(?:ql)?:\/\//i);
  assert.doesNotMatch(fixtureText, /(?:api[_-]?key|token|password|authorization|cookie)\s*[=:]/i);
  const fixture = JSON.parse(fixtureText);
  assert.equal(fixture.futpython.length, 2);
  assert.equal(fixture.totalcorner.length, 2);
  assert.ok(fixture.totalcorner.every(row => /^[0-9a-f]{64}$/.test(row.source_body_sha256)));
  for (const row of [...fixture.futpython, ...fixture.totalcorner]) {
    assert.ok(Number.isFinite(Date.parse(row.acquired_at)), `invalid acquired_at: ${row.acquired_at}`);
  }
  assert.equal(new Set(fixture.totalcorner.map(row => `${row.match_id}:${row.source_body_sha256}`)).size, 2);

  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); }
  catch (cause) {
    await root.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }

  const schema = `postgres_independent_${process.pid}`;
  const version = await root.query("SELECT current_setting('server_version_num')::int AS n");
  assert.ok(version.rows[0].n >= 170000 && version.rows[0].n < 180000, 'PostgreSQL 17 is required');
  await root.query(`CREATE SCHEMA ${schema}`);
  dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
  const isolatedEnv = {
    PATH: process.env.PATH,
    NODE_ENV: 'test',
    DATABASE_URL: dbUrl.toString(),
    MATCHPILOT_RUNTIME_MODE: 'test',
    MATCHPILOT_BACKGROUND_ENABLED: 'false',
  };

  let child;
  let trap;
  try {
    await runNode(['src/migrate.mjs'], isolatedEnv);
    await runNode(['src/migrate.mjs'], isolatedEnv);

    const db = new pg.Client({connectionString: dbUrl.toString()});
    await db.connect();
    try {
      const migrations = await db.query('SELECT filename FROM schema_migrations ORDER BY filename');
      assert.equal(migrations.rowCount, 28);
      assert.equal(migrations.rows[0].filename, '001-futpython-mirror.sql');
      assert.equal(migrations.rows.at(-1).filename, '028-tc-live-v2-terminal.sql');

      const run = await db.query(`INSERT INTO tc_collector_runs(version,status,started_at,finished_at,summary)
        VALUES('fixture-replay-v1','complete','2026-10-09T13:50:00Z','2026-10-09T14:40:00Z',$1) RETURNING run_id`,
      [JSON.stringify({fixture_sha256: expectedDigest, source: fixture.source.mode})]);
      const runId = run.rows[0].run_id;
      for (const row of fixture.totalcorner) {
        const body = JSON.stringify({fixture: true, match_id: row.match_id, status: row.provider_status, score: row.score});
        const raw = await db.query(`INSERT INTO tc_raw_responses(
          endpoint_family,request_key,url_path,match_id,league_id,phase,provenance,http_status,outcome,
          body_sha256,body_bytes,body,first_acquired_at,last_acquired_at,first_run_id,schema_version,parser_version)
          VALUES('fixture_terminal',$1,'/fixture/terminal',$2,$3,'ENDED','HISTORICAL_CAPTURED',200,'ok',$4,$5,$6,$7,$7,NULL,'fixture-v1','fixture-v1')
          RETURNING raw_id`, [`fixture:${row.match_id}`, row.match_id, row.league_id, sha256(body), Buffer.byteLength(body), body, row.acquired_at]);
        const payload = {status: row.provider_status, score: row.score, source_body_sha256: row.source_body_sha256};
        await db.query(`INSERT INTO tc_live_snapshots(
          match_id,league_id,run_id,acquired_at,provider_status,score,snapshot_hash,raw_id,provenance,payload,hash_version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,'HISTORICAL_CAPTURED',$9,'v2')`,
        [row.match_id, row.league_id, runId, row.acquired_at, row.provider_status, row.score,
          sha256(JSON.stringify(canonical(payload))), raw.rows[0].raw_id, JSON.stringify(payload)]);
      }
    } finally { await db.end(); }

    let providerHits = 0;
    trap = http.createServer((req, res) => { providerHits++; res.writeHead(500); res.end(); });
    await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
    const trapUrl = `http://127.0.0.1:${trap.address().port}`;
    const port = 33000 + (process.pid % 10000);
    const output = {value: ''};
    child = spawn(process.execPath, ['src/server.mjs'], {cwd: process.cwd(), env: {
      ...isolatedEnv,
      PORT: String(port),
      MATCHPILOT_BACKGROUND_ENABLED: 'true',
      FUTPYTHON_API_KEY: 'must-not-be-used',
      FUTPYTHON_BASE_URL: trapUrl,
      TOTALCORNER_API_TOKEN: 'must-not-be-used',
      TOTALCORNER_BASE_URL: trapUrl,
    }, stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.on('data', chunk => { output.value += chunk; });
    child.stderr.on('data', chunk => { output.value += chunk; });
    await waitForServer(child, output, port);

    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), {status: 'ok', product: 'MatchPilot Trading OS'});
    const live = await fetch(`http://127.0.0.1:${port}/api/tc/live`);
    assert.equal(live.status, 200);
    const report = await live.json();
    assert.equal(report.snapshots.snapshots, 2);
    assert.equal(report.snapshots.matches, 2);
    assert.equal(report.cursors.cursors, 0);
    assert.equal(providerHits, 0);

    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    child = undefined;

    const replay = async () => {
      const connection = new pg.Client({connectionString: dbUrl.toString()});
      await connection.connect();
      try {
        const rows = await connection.query(`SELECT match_id,league_id,acquired_at,provider_status,score,
          payload->>'source_body_sha256' AS source_body_sha256,hash_version,provenance
          FROM tc_live_snapshots ORDER BY acquired_at,match_id`);
        return sha256(JSON.stringify(canonical(rows.rows.map(row => ({...row, acquired_at: row.acquired_at.toISOString()})))));
      } finally { await connection.end(); }
    };
    const firstReplay = await replay();
    const secondReplay = await replay();
    assert.equal(firstReplay, secondReplay);

    const idempotency = new pg.Client({connectionString: dbUrl.toString()});
    await idempotency.connect();
    try {
      const before = await idempotency.query('SELECT count(*)::int AS n FROM tc_live_snapshots');
      await idempotency.query(`INSERT INTO tc_live_snapshots(
        match_id,league_id,acquired_at,provider_status,score,snapshot_hash,provenance,payload,hash_version)
        SELECT match_id,league_id,acquired_at,provider_status,score,snapshot_hash,provenance,payload,hash_version
        FROM tc_live_snapshots WHERE snapshot_id=(SELECT min(snapshot_id) FROM tc_live_snapshots)
        ON CONFLICT(match_id,snapshot_hash) DO NOTHING`);
      const after = await idempotency.query('SELECT count(*)::int AS n FROM tc_live_snapshots');
      assert.equal(after.rows[0].n, before.rows[0].n);
    } finally { await idempotency.end(); }
  } finally {
    if (child && child.exitCode == null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    if (trap) await new Promise(resolve => trap.close(resolve));
    await root.query(`DROP SCHEMA ${schema} CASCADE`);
    await root.end();
  }
});
