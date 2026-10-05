import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_recon_test';

function runSync(args, env) {
  const child = spawn(process.execPath, ['src/jobs/futpython-sync.mjs', ...args], {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  child.stdout.on('data', c => { out += c; });
  child.stderr.on('data', c => { out += c; });
  return once(child, 'exit').then(([code]) => ({code, out}));
}

const csv = rows => 'Date,Time,Home,Away,Home_Score,Away_Score\n' + rows.map(r => r.join(',')).join('\n') + '\n';

test('reconciliation detects lost and stale data, recovers it through the normal sync, without duplicates', {timeout: 120000}, async t => {
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
  const { reconcileFpt } = await import('../src/providers/futpython/reconciliation.mjs');
  const { checkDataWatchdog } = await import('../src/jobs/data-watchdog.mjs');
  const { reconciliationSection, fullRawSweep } = await import('../src/futpython-certificate.mjs');
  const { PHASE3_SQL } = await import('../src/providers/futpython/integrity.mjs');

  const year = new Date().getUTCFullYear();
  const current = `alpha/league/${year}`;
  const datasets = {
    'alpha/league/2024': csv([['2024-03-01', '18:00', 'Alpha A', 'Alpha B', 1, 0]]),
    [current]: csv([[`${year}-03-01`, '18:00', 'Alpha A', 'Alpha C', 2, 1]]),
    'beta/cup/2025': csv([['2025-05-01', '20:00', 'Beta One', 'Beta Two', 0, 0], ['2025-05-08', '20:00', 'Beta Two', 'Beta One', 3, 1]]),
    'alpha/league/2023': csv([['2023-03-01', '18:00', 'Alpha B', 'Alpha A', 1, 1]])
  };
  let failing = new Set(['alpha/league/2021']);
  let alphaSeasons = ['2024', String(year)];
  const leagues = () => `<table><tr><td>A</td><td>L</td><td>${alphaSeasons.join(', ')}</td><td>/api/download/alpha/league/2024</td></tr>`
    + `<tr><td>B</td><td>C</td><td>2025</td><td>/api/download/beta/cup/2025</td></tr></table>`;
  const hits = [];
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    hits.push(path);
    if (path === '/api-docs') { res.writeHead(200, {'content-type': 'text/html'}); return res.end(leagues()); }
    if (path.startsWith('/api/jogos-do-dia')) { res.writeHead(200, {'content-type': 'text/csv'}); return res.end('Id,Date,Time,Home,Away,League\n'); }
    const key = path.replace('/api/download/', '');
    if (failing.has(key)) { res.writeHead(500); return res.end('boom'); }
    if (datasets[key]) { res.writeHead(200, {'content-type': 'text/csv'}); return res.end(datasets[key]); }
    res.writeHead(404); res.end('not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url.toString(),
    FUTPYTHON_API_KEY: 'recon-test-key', FUTPYTHON_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    FUTPYTHON_SYNC_DELAY_MS: '0', FUTPYTHON_REQUESTS_PER_MINUTE: '600', FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE: '600',
    FUTPYTHON_REQUESTS_PER_DAY: '1000', FUTPYTHON_MAX_ATTEMPTS: '1', FUTPYTHON_CIRCUIT_FAILURES: '50',
    FUTPYTHON_RECOVERY_MAX_ATTEMPTS: '1'
  };
  const q = (sql, values) => db.withClient(c => c.query(sql, values)).then(r => r.rows);
  const ledger = async () => Object.fromEntries((await q(
    `SELECT gap_kind || ':' || entity AS k, status FROM data_reconciliation_ledger ORDER BY reconciliation_id`)).map(r => [r.k, r.status]));
  const counts = async () => (await q(`SELECT (SELECT count(*)::int FROM fpt_raw_snapshots WHERE source_kind='dataset') AS snapshots,
    (SELECT count(*)::int FROM fpt_match_versions WHERE phase='HISTORICAL') AS versions,
    (SELECT count(*)::int FROM fpt_match_facts WHERE phase='HISTORICAL') AS facts`))[0];
  try {
    await migrate();
    let run = await runSync(['--backfill'], env);
    assert.equal(run.code, 0, run.out);
    run = await runSync([], env);
    assert.equal(run.code, 0, run.out);

    // Startup with nothing wrong: checkpoints written, no gap.
    let catchups = 0;
    let result = await db.withClient(c => checkDataWatchdog({client: c, reconcile: true, phase: 'startup', catchup: () => { catchups++; }, deliver: async () => ({attempted: false})}));
    assert.equal(result.reconciliation.detected, 0, JSON.stringify(result.reconciliation));
    assert.deepEqual((await q(`SELECT scope FROM data_checkpoints ORDER BY scope`)).map(r => r.scope),
      ['backfill', 'catalog', 'current_season', 'incremental', 'today']);

    // Simulated damage:
    // - beta/cup/2025 lost its mirrored rows (snapshot pointer gone, versions and raw deleted on this throwaway DB);
    // - two catalogued datasets were never attempted (2023 served, 2022 answers 404), one keeps failing (2021);
    // - the current season is a day old and changed upstream;
    // - a run was left "running" by a crash; and the last incremental sync is 9 hours old.
    await q(`DELETE FROM fpt_match_facts WHERE dataset_key='beta/cup/2025'`);
    await q(`UPDATE fpt_dataset_state SET last_snapshot_id=NULL WHERE dataset_key='beta/cup/2025'`);
    await q(`DELETE FROM fpt_match_versions WHERE dataset_key='beta/cup/2025'`);
    await q(`DELETE FROM fpt_raw_snapshots WHERE dataset_key='beta/cup/2025'`);
    alphaSeasons = ['2021', '2022', '2023', '2024', String(year)];
    for (const s of ['2023', '2022', '2021']) {
      await q(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'alpha','league',$2,$3)`,
        [`alpha/league/${s}`, s, `/api/download/alpha/league/${s}`]);
      await q(`INSERT INTO fpt_dataset_state(dataset_key) VALUES($1)`, [`alpha/league/${s}`]);
      await q(`INSERT INTO fpt_onboarding(dataset_key,country_slug,league_slug,season,kind,promotion,state,activated_at,verified_at,activated_by)
        VALUES($1,'alpha','league',$2,'baseline','baseline','ACTIVE',now(),now(),'test') ON CONFLICT DO NOTHING`, [`alpha/league/${s}`, s]);
    }
    await q(`UPDATE fpt_dataset_state SET last_success_at = now() - interval '30 hours' WHERE dataset_key=$1`, [current]);
    datasets[current] = csv([[`${year}-03-01`, '18:00', 'Alpha A', 'Alpha C', 2, 1], [`${year}-03-08`, '18:00', 'Alpha C', 'Alpha B', 0, 0]]);
    await q(`INSERT INTO fpt_sync_runs(run_id, kind, status, started_at, meta) VALUES('fpt-crashed', 'cron', 'running', now() - interval '3 hours', '{"mode":"incremental"}')`);
    await q(`UPDATE fpt_sync_runs SET started_at = started_at - interval '9 hours', finished_at = finished_at - interval '9 hours' WHERE run_id <> 'fpt-crashed'`);

    result = await db.withClient(c => checkDataWatchdog({client: c, reconcile: true, phase: 'startup', catchup: () => { catchups++; }, deliver: async () => ({attempted: false})}));
    const r = result.reconciliation;
    assert.equal(r.orphan_runs, 1, JSON.stringify(r));
    assert.equal(catchups, 1, 'a skipped incremental sync starts a catch-up run');
    let l = await ledger();
    assert.equal(l['available_without_snapshot:beta/cup/2025'], 'QUEUED');
    assert.equal(l['never_attempted:alpha/league/2023'], 'QUEUED');
    assert.equal(l['never_attempted:alpha/league/2022'], 'QUEUED');
    assert.equal(l['never_attempted:alpha/league/2021'], 'QUEUED');
    assert.equal(l[`current_season_stale:${current}`], 'QUEUED');
    assert.equal(l['interrupted_run:fpt-crashed'], 'QUEUED');
    assert.equal(l['incremental_sync_skipped:incremental'], 'RECOVERING');
    const alert = await q(`SELECT payload FROM data_alerts WHERE code='RECON_GAPS' AND resolved_at IS NULL`);
    assert.equal(alert.length, 1);

    // The catch-up run itself (here started by the test): recovery targets ride on the incremental sync.
    hits.length = 0;
    run = await runSync([], env);
    assert.equal(run.code, 0, run.out);
    for (const key of ['beta/cup/2025', 'alpha/league/2023', 'alpha/league/2022', 'alpha/league/2021', current]) {
      assert.ok(hits.includes(`/api/download/${key}`), `${key} fetched by the recovery`);
    }
    l = await ledger();
    assert.equal(l['available_without_snapshot:beta/cup/2025'], 'RECOVERED');
    assert.equal(l['never_attempted:alpha/league/2023'], 'RECOVERED');
    assert.equal(l['never_attempted:alpha/league/2022'], 'UNRECOVERABLE', 'the provider answers 404: classified, not invented');
    assert.equal(l['never_attempted:alpha/league/2021'], 'FAILED', 'still failing after the allowed attempts');
    assert.equal(l[`current_season_stale:${current}`], 'RECOVERED');
    assert.equal(l['interrupted_run:fpt-crashed'], 'RECOVERED');
    assert.equal(l['incremental_sync_skipped:incremental'], 'RECOVERED');
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_facts WHERE dataset_key=$1`, [current]))[0].n, 2, 'refreshed current season reaches the facts');
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_facts WHERE dataset_key='beta/cup/2025'`))[0].n, 2, 'lost dataset rebuilt');
    // The refreshed current season has a second snapshot that only wrote its changed row: raw = DB still holds.
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_raw_snapshots WHERE dataset_key=$1`, [current]))[0].n, 2);
    const sweep = await db.withClient(c => fullRawSweep(c));
    assert.equal(sweep.totals.dataset_row_count_vs_db_mismatch, 0, JSON.stringify(sweep.totals));
    assert.equal((await q(PHASE3_SQL.rowGaps))[0].n, 0);
    assert.equal((await q(`SELECT count(*)::int AS n FROM data_alerts WHERE code='RECON_FAILED' AND resolved_at IS NULL`))[0].n, 1);
    let section = await db.withClient(c => reconciliationSection(c));
    assert.equal(section.gate, false, 'a FAILED recovery keeps the certificate gate red');

    // Idempotent replay: the same cycle and the same run again change nothing.
    const before = await counts();
    const rowsBefore = (await q(`SELECT count(*)::int AS n FROM data_reconciliation_ledger`))[0].n;
    await db.withClient(c => reconcileFpt(c, {phase: 'periodic', deliver: async () => ({attempted: false})}));
    run = await runSync([], env);
    assert.equal(run.code, 0, run.out);
    await db.withClient(c => reconcileFpt(c, {phase: 'periodic', deliver: async () => ({attempted: false})}));
    assert.deepEqual(await counts(), before, 'no duplicate snapshot, version or fact');
    assert.equal((await q(`SELECT count(*)::int AS n FROM data_reconciliation_ledger`))[0].n, rowsBefore, 'no duplicate ledger row');
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_versions GROUP BY match_key, payload_sha256 HAVING count(*) > 1`)).length, 0);

    // A FAILED gap is retried after the cool-off; once the provider serves it, it is recovered and the gate is green.
    failing = new Set();
    datasets['alpha/league/2021'] = csv([['2021-03-01', '18:00', 'Alpha A', 'Alpha B', 0, 1]]);
    await q(`UPDATE data_reconciliation_ledger SET recovery_finished_at = now() - interval '25 hours' WHERE status='FAILED'`);
    run = await runSync([], env);
    assert.equal(run.code, 0, run.out);
    l = await ledger();
    assert.equal(l['never_attempted:alpha/league/2021'], 'RECOVERED');
    await db.withClient(c => reconcileFpt(c, {phase: 'periodic', deliver: async () => ({attempted: false})}));
    section = await db.withClient(c => reconciliationSection(c));
    assert.equal(section.gate, true, JSON.stringify(section));

    // Under CRITICAL budget a stale current season is deferred, not counted as a failed attempt.
    await q(`UPDATE fpt_dataset_state SET last_success_at = now() - interval '30 hours' WHERE dataset_key=$1`, [current]);
    await db.withClient(c => reconcileFpt(c, {phase: 'periodic', deliver: async () => ({attempted: false})}));
    // A routine refresh in the queue does not raise the gap alert; one stuck for more than a day does.
    const openAlert = async () => (await q(`SELECT count(*)::int AS n FROM data_alerts WHERE code='RECON_GAPS' AND resolved_at IS NULL`))[0].n;
    assert.equal(await openAlert(), 0);
    await q(`UPDATE data_reconciliation_ledger SET detected_at = now() - interval '25 hours' WHERE gap_kind='current_season_stale' AND status='QUEUED'`);
    await db.withClient(c => reconcileFpt(c, {phase: 'periodic', deliver: async () => ({attempted: false})}));
    assert.equal(await openAlert(), 1);
    const used = (await q(`SELECT count(*)::int AS n FROM fpt_request_ledger WHERE outcome IN ('upstream','429','error') AND recorded_at > now() - interval '1 day'`))[0].n;
    await q(`INSERT INTO fpt_request_ledger(recorded_at, url_path, outcome, attempt)
      SELECT now() - interval '2 hours', '/api/download/old/x/2020', 'upstream', 1 FROM generate_series(1, $1)`, [Math.max(0, 920 - used)]);
    hits.length = 0;
    run = await runSync([], env);
    assert.equal(run.code, 0, run.out);
    assert.equal(hits.includes(`/api/download/${current}`), false);
    const deferred = (await q(`SELECT status, attempts FROM data_reconciliation_ledger WHERE gap_kind='current_season_stale' AND entity=$1 ORDER BY reconciliation_id DESC LIMIT 1`, [current]))[0];
    assert.deepEqual(deferred, {status: 'QUEUED', attempts: 0});
  } finally {
    server.close();
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
