import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_onboarding_test';

function runNode(args, env) {
  const child = spawn(process.execPath, args, {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
  let out = '';
  child.stdout.on('data', c => { out += c; });
  child.stderr.on('data', c => { out += c; });
  return once(child, 'exit').then(([code]) => ({code, out}));
}

function catalogHtml(leagues) {
  const rows = leagues.map(([country, league, seasons]) =>
    `<tr><td>${country}</td><td>${league}</td><td>${seasons.join(', ')}</td><td>/api/download/${country}/${league}/${seasons[0]}</td></tr>`);
  return `<html><body><table><tr><th>País</th><th>Liga</th><th>Temporadas</th><th>Rota</th></tr>${rows.join('')}</table></body></html>`;
}

function csv(rows) {
  return 'Date,Time,Home,Away,Home_Score,Away_Score,Odd_1_FT\n' + rows.map(r => r.join(',')).join('\n') + '\n';
}

test('a simulated new league waits for the owner, a new season of an active league goes live by itself', {timeout: 120000}, async t => {
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
  const { runQuery } = await import('../src/providers/futpython/query.mjs');
  const { onboardingSection } = await import('../src/futpython-certificate.mjs');

  const year = new Date().getUTCFullYear();
  const current = String(year);
  let leagues = [['alpha', 'league', ['2025']]];
  const datasets = {
    'alpha/league/2025': csv([['2025-03-01', '18:00', 'Alpha A', 'Alpha B', 1, 0, '2.10'], ['2025-03-08', '18:00', 'Alpha B', 'Alpha A', 2, 2, '1.90']]),
    [`alpha/league/${current}`]: csv([[`${current}-03-01`, '18:00', 'Alpha A', 'Alpha C', 3, 1, '1.70'], [`${current}-03-08`, '18:00', 'Alpha C', 'Alpha B', 0, 0, '2.40']]),
    // A season of the active league whose rows fall years outside the season: stopped before production.
    'alpha/league/2019': csv([['2025-05-01', '18:00', 'Alpha A', 'Alpha B', 1, 1, '2.00']]),
    'gamma/cup/2024': csv([['2024-04-01', '20:00', 'Gamma One', 'Gamma Two', 2, 0, '1.80'], ['2024-04-08', '20:00', 'Gamma Two', 'Gamma Three', 1, 3, '2.60']]),
    'gamma/cup/2025': csv([['2025-04-01', '20:00', 'Gamma Three', 'Gamma One', 0, 1, '2.20']]),
    [`gamma/cup/${current}`]: csv([[`${current}-04-01`, '20:00', 'Gamma One', 'Gamma Two', 1, 1, '2.00'],
      [`${current}-04-02`, '20:00', 'Gamma Three', 'Gamma Two', 0, 2, '2.10']])
    // gamma/cup/2023 is listed but the provider answers 404.
  };
  const hits = [];
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    hits.push(path);
    if (path === '/api-docs') {
      res.writeHead(200, {'content-type': 'text/html'});
      return res.end(catalogHtml(leagues));
    }
    if (path.startsWith('/api/jogos-do-dia')) {
      res.writeHead(200, {'content-type': 'text/csv'});
      return res.end('Id,Date,Time,Home,Away,League\n');
    }
    const key = path.replace('/api/download/', '');
    if (datasets[key]) {
      res.writeHead(200, {'content-type': 'text/csv'});
      return res.end(datasets[key]);
    }
    res.writeHead(404);
    res.end('not found');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: url.toString(),
    FUTPYTHON_API_KEY: 'onboarding-test-key', FUTPYTHON_BASE_URL: `http://127.0.0.1:${server.address().port}`,
    FUTPYTHON_SYNC_DELAY_MS: '0', FUTPYTHON_REQUESTS_PER_MINUTE: '600', FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE: '600',
    FUTPYTHON_REQUESTS_PER_DAY: '1000', FUTPYTHON_MAX_ATTEMPTS: '1', FUTPYTHON_CIRCUIT_FAILURES: '50'
  };
  const q = (sql, values) => db.withClient(c => c.query(sql, values)).then(r => r.rows);
  try {
    await migrate();

    // 1. First import on an empty database: the baseline.
    let run = await runNode(['src/jobs/futpython-sync.mjs', '--backfill'], env);
    assert.equal(run.code, 0, run.out);
    let rows = await q(`SELECT dataset_key, kind, state, activated_by FROM fpt_onboarding ORDER BY dataset_key`);
    assert.deepEqual(rows, [{dataset_key: 'alpha/league/2025', kind: 'baseline', state: 'ACTIVE', activated_by: 'bootstrap'}]);
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_facts WHERE dataset_key='alpha/league/2025'`))[0].n, 2);

    // 2. The provider now lists a new season of alpha, an old alpha season and a new league gamma.
    leagues = [['alpha', 'league', ['2019', '2025', current]], ['gamma', 'cup', ['2023', '2024', '2025', current]]];
    hits.length = 0;
    run = await runNode(['src/jobs/futpython-sync.mjs'], env);
    assert.equal(run.code, 0, run.out);
    for (const key of ['alpha/league/2019', 'gamma/cup/2023', 'gamma/cup/2024', 'gamma/cup/2025']) {
      assert.ok(hits.includes(`/api/download/${key}`), `${key} fetched as onboarding backfill inside the incremental run`);
    }
    const state = Object.fromEntries((await q(`SELECT dataset_key, kind, promotion, state, waiting_for, blocked_reason, activated_by
      FROM fpt_onboarding`)).map(r => [r.dataset_key, r]));
    assert.equal(state[`alpha/league/${current}`].kind, 'new_season');
    assert.equal(state[`alpha/league/${current}`].state, 'ACTIVE');
    assert.equal(state[`alpha/league/${current}`].activated_by, 'auto:new_season_of_active_league');
    assert.equal(state['alpha/league/2019'].state, 'COVERAGE_AUDITED');
    assert.equal(state['alpha/league/2019'].blocked_reason, 'dates_outside_season');
    for (const key of ['gamma/cup/2024', 'gamma/cup/2025', `gamma/cup/${current}`]) {
      assert.equal(state[key].kind, 'new_league');
      assert.equal(state[key].state, 'HARD_VERIFIED', key);
      assert.equal(state[key].waiting_for, 'owner_promotion');
    }
    assert.equal(state['gamma/cup/2023'].blocked_reason, 'unavailable_404');
    assert.equal(state['gamma/cup/2023'].state, 'SEASONS_ENUMERATED');

    const facts = Object.fromEntries((await q(`SELECT dataset_key, count(*)::int AS n FROM fpt_match_facts GROUP BY 1`))
      .map(r => [r.dataset_key, r.n]));
    assert.equal(facts[`alpha/league/${current}`], 2, 'the verified new season is in production in the same run');
    assert.equal(facts['gamma/cup/2024'], undefined, 'a new league never enters production by itself');
    assert.equal(facts['alpha/league/2019'], undefined, 'a blocked season stays out');
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_versions WHERE dataset_key LIKE 'gamma/%'`))[0].n, 5,
      'the raw and the versions are mirrored anyway');
    const teams = await q(`SELECT canonical_name FROM fpt_teams WHERE country_slug='gamma' ORDER BY 1`);
    assert.deepEqual(teams.map(r => r.canonical_name), ['Gamma One', 'Gamma Three', 'Gamma Two']);
    const steps = (await q(`SELECT to_state FROM fpt_onboarding_events WHERE dataset_key='gamma/cup/2024' ORDER BY event_id`)).map(r => r.to_state);
    assert.deepEqual(steps, ['DISCOVERED', 'HARD_VERIFIED']);
    const alerts = Object.fromEntries((await q(`SELECT code, payload FROM data_alerts WHERE resolved_at IS NULL AND code LIKE 'ONBOARDING%'`))
      .map(r => [r.code, r.payload]));
    assert.deepEqual(alerts.ONBOARDING_OWNER_PROMOTION.datasets.sort(), ['gamma/cup/2024', 'gamma/cup/2025', `gamma/cup/${current}`].sort());
    assert.deepEqual(alerts.ONBOARDING_BLOCKED.blocked.map(b => b.datasetKey), ['alpha/league/2019']);

    const pending = await db.withClient(c => runQuery(c, 'onboarding', {}));
    const gamma = pending.rows.find(r => r.country_slug === 'gamma');
    assert.equal(gamma.ready_for_owner, true);
    assert.equal(pending.provenance.upstream_calls, 0);
    let section = await db.withClient(c => onboardingSection(c));
    assert.equal(section.gate, true, JSON.stringify(section));
    assert.equal(section.facts_from_non_active, 0);

    // 2b. While gamma waits for the owner, its current season changes upstream (one score fixed, one match added).
    // The new snapshot only adds versions for the changed rows; the raw = DB check must still hold.
    // Row 1 unchanged (its version belongs to the first snapshot), row 2 corrected, row 3 new.
    datasets[`gamma/cup/${current}`] = csv([[`${current}-04-01`, '20:00', 'Gamma One', 'Gamma Two', 1, 1, '2.00'],
      [`${current}-04-02`, '20:00', 'Gamma Three', 'Gamma Two', 1, 2, '2.10'],
      [`${current}-04-08`, '20:00', 'Gamma Two', 'Gamma Three', 0, 0, '2.30']]);
    // An available dataset is a cache hit for the incremental run: an error state makes this run fetch it again.
    await q(`UPDATE fpt_dataset_state SET availability='error', last_error='x' WHERE dataset_key=$1`, [`gamma/cup/${current}`]);
    run = await runNode(['src/jobs/futpython-sync.mjs'], env);
    assert.equal(run.code, 0, run.out);
    const gammaNow = (await q(`SELECT state, blocked_reason, checks FROM fpt_onboarding WHERE dataset_key=$1`, [`gamma/cup/${current}`]))[0];
    assert.equal(gammaNow.state, 'HARD_VERIFIED', JSON.stringify(gammaNow));
    assert.equal(gammaNow.checks.hard.matches, 3);
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_versions v JOIN fpt_dataset_state s ON s.last_snapshot_id = v.snapshot_id
      WHERE s.dataset_key=$1`, [`gamma/cup/${current}`]))[0].n, 2, 'the latest snapshot itself only wrote the two changed rows');
    assert.equal(gammaNow.checks.hard.reconciled, true);
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_raw_snapshots WHERE dataset_key=$1`, [`gamma/cup/${current}`]))[0].n, 2);

    // 3. Owner promotion: an actor and a reason are mandatory; then gamma enters production, 404 season left out.
    let promote = await runNode(['src/jobs/futpython-onboarding.mjs', '--promote=gamma/cup', '--reason=ok'], env);
    assert.notEqual(promote.code, 0);
    assert.match(promote.out, /promotion needs an actor/);
    promote = await runNode(['src/jobs/futpython-onboarding.mjs', '--promote=alpha/league', '--by=owner', '--reason=ok'], env);
    assert.notEqual(promote.code, 0, 'a league with a blocked season is not promotable');
    assert.match(promote.out, /alpha\/league\/2019=COVERAGE_AUDITED/);
    promote = await runNode(['src/jobs/futpython-onboarding.mjs', '--promote=gamma/cup', '--by=owner', '--reason=checked'], env);
    assert.equal(promote.code, 0, promote.out);
    rows = await q(`SELECT dataset_key, state, activated_by FROM fpt_onboarding WHERE country_slug='gamma' ORDER BY dataset_key`);
    assert.deepEqual(rows.map(r => [r.dataset_key, r.state, r.activated_by]), [
      ['gamma/cup/2023', 'SEASONS_ENUMERATED', null],
      ['gamma/cup/2024', 'ACTIVE', 'owner:owner'],
      ['gamma/cup/2025', 'ACTIVE', 'owner:owner'],
      [`gamma/cup/${current}`, 'ACTIVE', 'owner:owner']
    ].sort((a, b) => a[0].localeCompare(b[0])));
    assert.equal((await q(`SELECT count(*)::int AS n FROM fpt_match_facts WHERE dataset_key LIKE 'gamma/%'`))[0].n, 6);
    const fixed = await q(`SELECT home_score FROM fpt_match_facts WHERE dataset_key=$1 AND match_date=$2`, [`gamma/cup/${current}`, `${current}-04-02`]);
    assert.equal(fixed[0].home_score, 1, 'the facts carry the latest version of a corrected row');
    const homeIds = await q(`SELECT count(*)::int AS n FROM fpt_match_facts WHERE dataset_key LIKE 'gamma/%' AND home_team_id IS NULL`);
    assert.equal(homeIds[0].n, 0, 'promoted facts carry the onboarding team ids');
    section = await db.withClient(c => onboardingSection(c));
    assert.equal(section.gate, true);
    assert.equal(section.new_league_active_without_owner, 0);

    // 4. Leakage is what the certificate gate looks for.
    await q(`UPDATE fpt_onboarding SET state='HARD_VERIFIED', activated_at=NULL, activated_by=NULL WHERE dataset_key='gamma/cup/2025'`);
    section = await db.withClient(c => onboardingSection(c));
    assert.equal(section.facts_from_non_active, 1);
    assert.equal(section.gate, false);
  } finally {
    server.close();
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
