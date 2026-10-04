import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { parseCsv } from '../src/lib/csv.mjs';

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';

function redact(value) {
  return String(value || '').replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]').replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]');
}

function csvFor(key) {
  return `Date,Home,Away\n2024-05-01,Home ${key},Away ${key}\n`;
}

function catalogHtml(keys) {
  return '<table>' + keys.map(key => {
    const [country, league, season] = key.split('/');
    return `<tr><td>${country}</td><td>${league}</td><td>${season}</td><td>/api/download/${key}</td></tr>`;
  }).join('') + '</table>';
}

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

function runNode(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  let err = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.stderr.on('data', chunk => { err += chunk; });
  const exited = once(child, 'exit').then(([code, signal]) => ({code, signal, out: redact(out), err: redact(err)}));
  return {child, exited};
}

test('resume drill survives a real SIGTERM without duplicating the mirror', {timeout: 30000}, async t => {
  process.env.DATABASE_URL = databaseUrl;
  let db;
  let migrate;
  let store;
  try {
    db = await import('../src/db.mjs');
    await db.withClient(client => client.query('SELECT 1'));
    migrate = await import('../src/migrate.mjs');
    store = await import('../src/providers/futpython/store.mjs');
  } catch {
    if (process.env.CI) throw new Error('throwaway postgres unavailable');
    return t.skip('throwaway postgres unavailable');
  }

  const keys = ['alpha/league/2024', 'beta/league/2024', 'gamma/league/2024', 'delta/league/2024'];
  const texts = Object.fromEntries(keys.map(key => [key, csvFor(key)]));
  try {
    await migrate.migrate();
    await db.withClient(async client => {
      await client.query(`TRUNCATE TABLE
        fpt_match_versions, fpt_dataset_state, fpt_sync_runs, fpt_request_ledger,
        fpt_certification_checks, fpt_schema_fields, fpt_raw_snapshots, fpt_catalog,
        fpt_catalog_snapshots, fpt_provider_hold
        RESTART IDENTITY CASCADE`);
      await client.query('INSERT INTO fpt_provider_hold(hold_id, critical_depth) VALUES (1, 0)');
      for (const key of keys) {
        const [country, league, season] = key.split('/');
        await client.query(
          `INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route)
           VALUES($1,$2,$3,$4,$5)`,
          [key, country, league, season, `/api/download/${key}`]
        );
        await client.query('INSERT INTO fpt_dataset_state(dataset_key) VALUES($1)', [key]);
        if (key === 'beta/league/2024') {
          await client.query(`UPDATE fpt_dataset_state SET availability='unavailable_404', unavailable_reason='HTTP 404' WHERE dataset_key=$1`, [key]);
          continue;
        }
        const parsed = parseCsv(texts[key]);
        await store.storeDataset(client, {
          datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`,
          countrySlug: country, leagueSlug: league, season, ...parsed, text: texts[key]
        });
        await client.query(`UPDATE fpt_dataset_state SET availability='available' WHERE dataset_key=$1`, [key]);
      }

      const beforeSecond = await client.query(`SELECT count(*)::int AS n FROM fpt_raw_snapshots WHERE dataset_key='gamma/league/2024'`);
      const parsed = parseCsv(texts['gamma/league/2024']);
      const again = await store.storeDataset(client, {
        datasetKey: 'gamma/league/2024', sourceKind: 'dataset', providerPath: '/api/download/gamma/league/2024',
        countrySlug: 'gamma', leagueSlug: 'league', season: '2024', ...parsed, text: texts['gamma/league/2024']
      });
      const afterSecond = await client.query(`SELECT count(*)::int AS n FROM fpt_raw_snapshots WHERE dataset_key='gamma/league/2024'`);
      const gammaVersions = await client.query(`SELECT count(*)::int AS n FROM fpt_match_versions WHERE dataset_key='gamma/league/2024'`);
      assert.equal(again.changed, false);
      assert.equal(beforeSecond.rows[0].n, 1);
      assert.equal(afterSecond.rows[0].n, 1);
      assert.equal(gammaVersions.rows[0].n, 1);

      await client.query(`DELETE FROM fpt_match_versions WHERE dataset_key='alpha/league/2024'`);
      await client.query(`UPDATE fpt_raw_snapshots SET ingest_complete=false WHERE dataset_key='alpha/league/2024'`);
      await client.query(`UPDATE fpt_dataset_state SET availability='error', last_error='partial' WHERE dataset_key='alpha/league/2024'`);
      const repaired = await store.storeDataset(client, {
        datasetKey: 'alpha/league/2024', sourceKind: 'dataset', providerPath: '/api/download/alpha/league/2024',
        countrySlug: 'alpha', leagueSlug: 'league', season: '2024',
        ...parseCsv(texts['alpha/league/2024']), text: texts['alpha/league/2024']
      });
      const alphaState = await client.query(`SELECT availability, (SELECT count(*)::int FROM fpt_raw_snapshots WHERE dataset_key='alpha/league/2024') AS snapshots, (SELECT count(*)::int FROM fpt_match_versions WHERE dataset_key='alpha/league/2024') AS versions, (SELECT bool_and(ingest_complete) FROM fpt_raw_snapshots WHERE dataset_key='alpha/league/2024') AS complete FROM fpt_dataset_state WHERE dataset_key='alpha/league/2024'`);
      assert.equal(repaired.changed, false);
      assert.equal(repaired.rowsInserted, 1);
      assert.equal(alphaState.rows[0].snapshots, 1);
      assert.equal(alphaState.rows[0].versions, 1);
      assert.equal(alphaState.rows[0].complete, true);
      assert.equal(alphaState.rows[0].availability, 'error');
      await client.query(`UPDATE fpt_dataset_state SET availability='available', last_error=NULL WHERE dataset_key='alpha/league/2024'`);

      const eta = 'eta/league/2024';
      await client.query(
        `INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'eta','league','2024',$2)`,
        [eta, `/api/download/${eta}`]
      );
      await client.query('INSERT INTO fpt_dataset_state(dataset_key) VALUES($1)', [eta]);
      const etaText = csvFor(eta);
      await assert.rejects(() => store.storeDataset(client, {
        datasetKey: eta, sourceKind: 'dataset', providerPath: `/api/download/${eta}`,
        countrySlug: 'eta', leagueSlug: 'league', season: '2024', ...parseCsv(etaText), text: etaText
      }, {afterSnapshotInserted: async () => { throw new Error('kill before match rows'); }}));
      const etaLeft = await client.query('SELECT count(*)::int AS n FROM fpt_raw_snapshots WHERE dataset_key=$1', [eta]);
      assert.equal(etaLeft.rows[0].n, 0);

      const theta = 'theta/league/2024';
      await client.query(
        `INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'theta','league','2024',$2)`,
        [theta, `/api/download/${theta}`]
      );
      await client.query('INSERT INTO fpt_dataset_state(dataset_key) VALUES($1)', [theta]);
      const thetaText = csvFor(theta);
      const pid = await client.query('SELECT pg_backend_pid() AS pid');
      await assert.rejects(() => store.storeDataset(client, {
        datasetKey: theta, sourceKind: 'dataset', providerPath: `/api/download/${theta}`,
        countrySlug: 'theta', leagueSlug: 'league', season: '2024', ...parseCsv(thetaText), text: thetaText
      }, {afterSnapshotInserted: async () => {
        await db.withClient(admin => admin.query('SELECT pg_terminate_backend($1)', [pid.rows[0].pid]));
      }}));
    });

    await db.withClient(async client => {
      const thetaLeft = await client.query(`SELECT count(*)::int AS n FROM fpt_raw_snapshots WHERE dataset_key='theta/league/2024'`);
      assert.equal(thetaLeft.rows[0].n, 0);
      const before = await client.query(`SELECT dataset_key, last_snapshot_id FROM fpt_dataset_state WHERE dataset_key IN ('gamma/league/2024','delta/league/2024') ORDER BY dataset_key`);
      const {requeueDatasetsForResumeDrill} = await import('../src/jobs/futpython-sync.mjs');
      const updated = await requeueDatasetsForResumeDrill(client, ['gamma/league/2024', 'delta/league/2024']);
      assert.deepEqual(updated.map(row => row.dataset_key).sort(), ['delta/league/2024', 'gamma/league/2024']);
      assert.deepEqual(updated.map(row => String(row.last_snapshot_id)).sort(), before.rows.map(row => String(row.last_snapshot_id)).sort());
    });

    const hits = [];
    const server = await listen((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      hits.push(url.pathname);
      if (url.pathname === '/api-docs') {
        res.end(catalogHtml(keys));
        return;
      }
      if (!url.searchParams.get('api_key')) {
        res.writeHead(401);
        res.end('missing');
        return;
      }
      if (url.pathname.startsWith('/api/download/')) {
        const key = url.pathname.slice('/api/download/'.length);
        if (!texts[key]) {
          res.writeHead(404);
          res.end('missing dataset');
          return;
        }
        res.end(texts[key]);
        return;
      }
      if (url.pathname === '/api/jogos-do-dia') {
        res.end('Date,Home,Away\n2026-10-04,Today Home,Today Away\n');
        return;
      }
      res.writeHead(404);
      res.end('no');
    });

    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      DATABASE_URL: databaseUrl,
      FUTPYTHON_API_KEY: 'drill-test-key',
      FUTPYTHON_BASE_URL: `http://127.0.0.1:${server.address().port}`,
      FUTPYTHON_SYNC_DELAY_MS: '800',
      FUTPYTHON_REQUESTS_PER_MINUTE: '60',
      FUTPYTHON_REQUESTS_PER_DAY: '5000',
      FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE: '60',
      FUTPYTHON_MAX_ATTEMPTS: '2',
      FUTPYTHON_BACKOFF_BASE_MS: '10',
      FUTPYTHON_CIRCUIT_FAILURES: '10'
    };

    try {
      const first = runNode(['src/jobs/futpython-sync.mjs', '--backfill'], env);
      const started = Date.now();
      while (!hits.includes('/api/download/delta/league/2024')) {
        if (Date.now() - started > 8000) {
          first.child.kill('SIGTERM');
          const failed = await first.exited;
          throw new Error(`drill did not reach delta\n${failed.out}\n${failed.err}`);
        }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      first.child.kill('SIGTERM');
      const stopped = await first.exited;
      assert.equal(stopped.code, 0, stopped.err || stopped.out);
      assert.equal(hits.includes('/api/download/alpha/league/2024'), false);
      assert.equal(hits.includes('/api/download/beta/league/2024'), false);
      assert.equal(hits.includes('/api/download/delta/league/2024'), true);
      assert.equal(hits.includes('/api/download/gamma/league/2024'), false);

      await db.withClient(async client => {
        const running = await client.query(`SELECT count(*)::int AS n FROM fpt_sync_runs WHERE status='running'`);
        const partial = await client.query(`SELECT status, meta->>'interrupted' AS interrupted, meta->>'signal' AS signal FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1`);
        assert.equal(running.rows[0].n, 0);
        assert.equal(partial.rows[0].status, 'partial');
        assert.equal(partial.rows[0].interrupted, 'true');
        assert.equal(partial.rows[0].signal, 'SIGTERM');
      });

      const firstRequests = hits.length;
hits.splice(0);
      const second = runNode(['src/jobs/futpython-sync.mjs', '--backfill'], env);
      const resumed = await second.exited;
      assert.equal(resumed.code, 0, resumed.err || resumed.out);
      assert.equal(hits.includes('/api/download/gamma/league/2024'), true);
      assert.equal(hits.includes('/api/download/delta/league/2024'), false);
      assert.equal(hits.includes('/api/download/alpha/league/2024'), false);
      assert.equal(hits.includes('/api/download/beta/league/2024'), false);

      await db.withClient(async client => {
        const running = await client.query(`SELECT count(*)::int AS n FROM fpt_sync_runs WHERE status='running'`);
        const dupSnapshots = await client.query(`SELECT count(*)::int AS n FROM (SELECT dataset_key, sha256 FROM fpt_raw_snapshots GROUP BY 1,2 HAVING count(*)>1) d`);
        const dupVersions = await client.query(`SELECT count(*)::int AS n FROM (SELECT match_key, payload_sha256 FROM fpt_match_versions GROUP BY 1,2 HAVING count(*)>1) d`);
        const counts = await client.query(`SELECT dataset_key, count(*)::int AS n FROM fpt_raw_snapshots GROUP BY dataset_key ORDER BY dataset_key`);
        const versions = await client.query(`SELECT dataset_key, count(*)::int AS n FROM fpt_match_versions GROUP BY dataset_key`);
        const states = await client.query(`SELECT availability, count(*)::int AS n FROM fpt_dataset_state WHERE dataset_key = ANY($1::text[]) GROUP BY availability`, [keys]);
        const ledger = await client.query(`SELECT outcome, url_path FROM fpt_request_ledger`);
        assert.equal(running.rows[0].n, 0);
        assert.equal(dupSnapshots.rows[0].n, 0);
        assert.equal(dupVersions.rows[0].n, 0);
        const byKey = Object.fromEntries(counts.rows.map(row => [row.dataset_key, row.n]));
        assert.equal(byKey['alpha/league/2024'], 1);
        assert.equal(byKey['gamma/league/2024'], 1);
        assert.equal(byKey['delta/league/2024'], 1);
        assert.equal(byKey['beta/league/2024'], undefined);
        const versionByKey = Object.fromEntries(versions.rows.map(row => [row.dataset_key, row.n]));
        assert.equal(versionByKey['alpha/league/2024'], 1);
        assert.equal(versionByKey['gamma/league/2024'], 1);
        assert.equal(versionByKey['delta/league/2024'], 1);
        assert.equal(states.rows.find(row => row.availability === 'error'), undefined);
        if (JSON.stringify(ledger.rows).toLowerCase().includes('api_key=')) throw new Error('ledger stored an api key parameter');
        const upstream = ledger.rows.filter(row => row.outcome === 'upstream').length;
        assert.equal(upstream, firstRequests + hits.length);
      });
    } finally {
      server.close();
      await once(server, 'close');
    }
  } finally {
    await db.closePool();
  }
});
