// R-03 Gate B: API v1 over a real HTTP server and a real throwaway PostgreSQL, seeded with the verified
// independent historical sample. No provider is reachable: a trap server counts any upstream call.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import http from 'node:http';
import test from 'node:test';

const sha256 = value => createHash('sha256').update(value).digest('hex');

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

test('API v1 serves real database content with the v1 envelope, matching the legacy routes', {timeout: 90000}, async t => {
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

  const schema = `api_v1_${process.pid}`;
  let child;
  let trap;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    const env = {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test', MATCHPILOT_BACKGROUND_ENABLED: 'false'};
    await runNode(['src/migrate.mjs'], env);

    const fixture = JSON.parse(await readFile(new URL('./fixtures/independent-historical-sample.json', import.meta.url), 'utf8'));
    const db = new pg.Client({connectionString: dbUrl.toString()});
    await db.connect();
    try {
      const run = await db.query(`INSERT INTO tc_collector_runs(version,status,started_at,finished_at,summary)
        VALUES('fixture-replay-v1','complete','2026-10-09T13:50:00Z','2026-10-09T14:40:00Z','{}') RETURNING run_id`);
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
        [row.match_id, row.league_id, run.rows[0].run_id, row.acquired_at, row.provider_status, row.score,
          sha256(JSON.stringify(payload)), raw.rows[0].raw_id, JSON.stringify(payload)]);
      }
    } finally { await db.end(); }

    let providerHits = 0;
    trap = http.createServer((req, res) => { providerHits++; res.writeHead(500); res.end(); });
    await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve));
    const trapUrl = `http://127.0.0.1:${trap.address().port}`;
    const port = 34000 + (process.pid % 10000);
    const output = {value: ''};
    child = spawn(process.execPath, ['src/server.mjs'], {cwd: process.cwd(), env: {
      ...env, PORT: String(port), MATCHPILOT_CODE_VERSION: 'api-v1-test',
      FUTPYTHON_BASE_URL: trapUrl, TOTALCORNER_BASE_URL: trapUrl,
    }, stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.on('data', chunk => { output.value += chunk; });
    child.stderr.on('data', chunk => { output.value += chunk; });
    const deadline = Date.now() + 30000;
    while (!output.value.includes(`listening on ${port}`) && child.exitCode == null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(child.exitCode, null, output.value);
    const base = `http://127.0.0.1:${port}`;
    const call = async path => { const res = await fetch(base + path); return {status: res.status, headers: res.headers, body: await res.json()}; };

    const live = await call('/api/v1/tc/live');
    assert.equal(live.status, 200);
    assert.equal(live.body.api_version, 'v1');
    assert.equal(live.body.meta.code_version, 'api-v1-test');
    assert.equal(live.body.meta.provenance.source_provider, 'totalcorner');
    assert.equal(live.body.data.snapshots.snapshots, 2);
    const legacy = await call('/api/tc/live');
    assert.equal(legacy.status, 200);
    assert.deepEqual(live.body.data, legacy.body, 'v1 data equals the legacy route data');
    assert.equal(legacy.headers.get('deprecation'), 'true');
    assert.equal(legacy.headers.get('link'), '</api/v1/tc/live>; rel="successor-version"');

    const competitions = await call('/api/v1/fpt/competitions');
    assert.equal(competitions.status, 200);
    assert.deepEqual(competitions.body.data.rows, []);
    assert.equal(competitions.body.meta.coverage.rows, 0);
    assert.equal(competitions.body.meta.provenance.upstream_calls, 0);

    const registry = await call('/api/v1/endpoints');
    assert.equal(registry.status, 200);
    assert.ok(registry.body.data.endpoints.length >= 30);

    const bad = await call('/api/v1/fpt/matches?date=2026-13-45');
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'BAD_REQUEST');
    const unknown = await call('/api/v1/fpt/competitions?x=1');
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'UNKNOWN_PARAMETER');
    assert.equal((await call('/api/v1/missing')).status, 404);

    const health = await call('/api/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.data.status, 'ok');
    assert.equal(providerHits, 0, 'API v1 never calls a provider');
  } finally {
    if (child && child.exitCode == null) {
      child.kill('SIGTERM');
      await new Promise(resolve => child.once('exit', resolve));
    }
    if (trap) await new Promise(resolve => trap.close(resolve));
    try { await root.query(`DROP SCHEMA ${schema} CASCADE`); }
    finally { await root.end(); }
  }
});
