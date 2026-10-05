import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_budget_test';

function runSync(env) {
  const child = spawn(process.execPath, ['src/jobs/futpython-sync.mjs'], {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  child.stdout.on('data', c => { out += c; });
  child.stderr.on('data', c => { out += c; });
  return once(child, 'exit').then(([code]) => ({code, out}));
}

test('a real incremental sync under CONSERVE and CRITICAL defers traffic instead of failing', {timeout: 90000}, async t => {
  let pg;
  try {
    pg = (await import('pg')).default;
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.query(`CREATE SCHEMA ${SCHEMA}`);
    await admin.end();
  } catch {
    if (process.env.CI) throw new Error('throwaway postgres unavailable');
    return t.skip('throwaway postgres unavailable');
  }
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c search_path=${SCHEMA}`);
  process.env.DATABASE_URL = url.toString();
  const db = await import('../src/db.mjs');
  const { migrate } = await import('../src/migrate.mjs');
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url.replace(/api_key=[^&]+/, 'api_key=X'));
    if (req.url.startsWith('/api/jogos-do-dia')) {
      res.writeHead(200, {'content-type': 'text/csv'});
      return res.end('Id,Date,Time,Home,Away,League\nt1,2026-10-05,20:00,Home Today,Away Today,X\n');
    }
    res.writeHead(500);
    res.end('should not be called');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const year = new Date().getUTCFullYear();
  const current = `alpha/league/${year}`;
  try {
    await migrate();
    const env = {
      PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url.toString(),
      FUTPYTHON_API_KEY: 'budget-test-key', FUTPYTHON_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      FUTPYTHON_SYNC_DELAY_MS: '0', FUTPYTHON_REQUESTS_PER_MINUTE: '60', FUTPYTHON_REQUESTS_PER_DAY: '100',
      FUTPYTHON_MAX_ATTEMPTS: '1', FUTPYTHON_CIRCUIT_FAILURES: '50'
    };
    const prefill = async (n) => db.withClient(async client => {
      await client.query('DELETE FROM fpt_request_ledger');
      await client.query(`INSERT INTO fpt_request_ledger(recorded_at, url_path, outcome, attempt)
        SELECT now() - interval '2 hours', '/api/download/old/x/2020', 'upstream', 1 FROM generate_series(1, $1)`, [n]);
    });
    await db.withClient(async client => {
      await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route)
        VALUES ($1,'alpha','league',$2,$3), ('beta/league/2020','beta','league','2020','/api/download/beta/league/2020')`,
        [current, String(year), `/api/download/${current}`]);
      // The current-season dataset needs a fetch (error state), so the budget decides whether it is sent.
      await client.query(`INSERT INTO fpt_dataset_state(dataset_key, availability, last_error) VALUES ($1,'error','x'), ('beta/league/2020','available',NULL)`, [current]);
    });

    // CONSERVE (75/100): discovery deferred, catalog read from the DB, today still fetched, dataset 500 = real error.
    await prefill(75);
    let run = await runSync(env);
    assert.equal(run.code, 0, run.out);
    assert.equal(hits.some(h => h.startsWith('/api-docs')), false, 'catalog discovery is not sent under CONSERVE');
    assert.equal(hits.filter(h => h.startsWith('/api/jogos-do-dia')).length, 1);
    let ledger = (await db.withClient(c => c.query(`SELECT outcome, endpoint_family, budget_level FROM fpt_request_ledger WHERE run_id IS NOT NULL ORDER BY ledger_id`))).rows;
    assert.ok(ledger.some(r => r.outcome === 'throttled' && r.endpoint_family === 'catalog' && r.budget_level === 'CONSERVE'));
    const meta = (await db.withClient(c => c.query(`SELECT meta FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1`))).rows[0].meta;
    assert.equal(meta.catalogSource, 'db:budget_conserve');
    assert.ok(meta.deferred.some(d => d.datasetKey === 'catalog'));

    // CRITICAL (92/100): only today goes out; the current-season dataset is deferred, never marked as an error.
    hits.length = 0;
    await db.withClient(c => c.query(`UPDATE fpt_dataset_state SET availability='error', last_error='x' WHERE dataset_key=$1`, [current]));
    const before = (await db.withClient(c => c.query(`SELECT last_error FROM fpt_dataset_state WHERE dataset_key=$1`, [current]))).rows[0];
    await prefill(92);
    run = await runSync(env);
    assert.equal(run.code, 0, run.out);
    assert.equal(hits.some(h => h.startsWith('/api/download/')), false, 'no dataset request under CRITICAL');
    assert.equal(hits.some(h => h.startsWith('/api-docs')), false);
    const after = (await db.withClient(c => c.query(`SELECT last_error FROM fpt_dataset_state WHERE dataset_key=$1`, [current]))).rows[0];
    assert.deepEqual(after, before, 'a deferred dataset keeps its state');
    ledger = (await db.withClient(c => c.query(`SELECT outcome, endpoint_family, budget_level, dataset_key FROM fpt_request_ledger WHERE run_id IS NOT NULL AND budget_level='CRITICAL'`))).rows;
    assert.ok(ledger.some(r => r.outcome === 'throttled' && r.dataset_key === current));
    const last = (await db.withClient(c => c.query(`SELECT status, meta FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1`))).rows[0];
    assert.ok(last.meta.deferred.some(d => d.datasetKey === current && d.level === 'CRITICAL'));
    assert.notEqual(last.status, 'failed');
  } finally {
    server.close();
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
