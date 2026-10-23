// HIST-PG-01: the FutPythonTrader backtest reader over a real throwaway PostgreSQL. The data are synthetic rows written
// into the FPT tables exactly as ingestion stores them (raw snapshot, versions, refreshed facts); the reader only reads.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import test from 'node:test';
import {FPT_BOOKMAKER, buildFptHistInput, providerPrice, readFptHistInput} from '../src/providers/futpython/hist-input.mjs';
import {STATUS, runBacktest} from '../src/hist/engine.mjs';
import {validateInput} from '../src/hist/contract.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve(output) : reject(new Error(`node ${args.join(' ')} exited ${code}\n${output}`))));
  });
}

const CONFIG = {strategy: 'mp-ref-fav-back-1', bookmaker: FPT_BOOKMAKER, lead_minutes: 10, stake: '1', commission: '0.05'};

test('FPT reader: versions, prices and results from PostgreSQL; PIT finds nothing, NON_PIT_RESEARCH simulates, nothing is written', {timeout: 90000}, async t => {
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
  const schema = `hist_pg_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const db = new pg.Client({connectionString: dbUrl.toString()});
    await db.connect();
    try {
      const raw = await db.query(`INSERT INTO fpt_raw_snapshots(dataset_key,source_kind,provider_path,acquired_at,sha256,row_count,headers,payload_gzip)
        VALUES('england-premier-league-2025','dataset','/fixture','2026-10-04T08:00:00Z',$1,3,'[]',$2) RETURNING snapshot_id`, [sha256('fixture'), gzipSync('fixture')]);
      const snapshot = raw.rows[0].snapshot_id;
      const version = async (key, date, home, away, payload, acquired, phase = 'HISTORICAL') => db.query(`INSERT INTO fpt_match_versions(
          match_key,dataset_key,snapshot_id,acquired_at,country_slug,league_slug,season,match_date,match_time,home,away,phase,payload,payload_sha256)
        VALUES($1,'england-premier-league-2025',$2,$3,'england','premier-league','2025',$4,'15:00',$5,$6,$7,$8,$9)`,
      [key, snapshot, acquired, date, home, away, phase, JSON.stringify(payload), sha256(JSON.stringify(payload) + acquired)]);
      // m1: HOME favourite 1.85, home win 2-1. m2: AWAY favourite 2.10 (comma decimal as the provider writes it), first
      // stored without a result, then 0-1. m3: corrected result 1-1 -> 2-1 (HOME favourite). m4: out of range.
      await version('fpt:id:m1', '2025-09-20', 'Arsenal', 'Chelsea', {Home_Score: '2', Away_Score: '1', Odd_1_FT: '1.85', Odd_X_FT: '3.60', Odd_2_FT: '4.40'}, '2026-10-04T08:00:00Z');
      await version('fpt:id:m2', '2025-09-21', 'Everton', 'Fulham', {Home_Score: '', Away_Score: '', Odd_1_FT: '3.30', Odd_X_FT: '3.40', Odd_2_FT: '2,10'}, '2026-10-04T08:00:00Z');
      await version('fpt:id:m2', '2025-09-21', 'Everton', 'Fulham', {Home_Score: '0', Away_Score: '1', Odd_1_FT: '3.30', Odd_X_FT: '3.40', Odd_2_FT: '2,10'}, '2026-10-05T08:00:00Z');
      await version('fpt:id:m3', '2025-09-22', 'Leeds', 'Wolves', {Home_Score: '1', Away_Score: '1', Odd_1_FT: '1.70', Odd_X_FT: '3.80', Odd_2_FT: '5.00'}, '2026-10-04T08:00:00Z');
      await version('fpt:id:m3', '2025-09-22', 'Leeds', 'Wolves', {Home_Score: '2', Away_Score: '1', Odd_1_FT: '1.70', Odd_X_FT: '3.80', Odd_2_FT: '5.00'}, '2026-10-06T08:00:00Z');
      await version('fpt:id:m4', '2025-10-30', 'Spurs', 'Villa', {Home_Score: '0', Away_Score: '0', Odd_1_FT: '2.00', Odd_X_FT: '3.40', Odd_2_FT: '3.80'}, '2026-10-04T08:00:00Z');
      await db.query('SELECT fpt_refresh_match_facts()');
      // After the facts refresh, a dataset still being onboarded adds a version under m1's key with another result and
      // price: the reader must never read it (review B-1).
      await db.query(`INSERT INTO fpt_onboarding(dataset_key,country_slug,league_slug,season,kind,promotion,state)
        VALUES('england-pl-cup-2025','england','pl-cup','2025','new_league','owner','DISCOVERED')`);
      await db.query(`INSERT INTO fpt_match_versions(match_key,dataset_key,snapshot_id,acquired_at,country_slug,league_slug,season,match_date,match_time,home,away,phase,payload,payload_sha256)
        VALUES('fpt:id:m1','england-pl-cup-2025',$1,'2026-10-07T08:00:00Z','england','pl-cup','2025','2025-09-20','15:00','Arsenal','Chelsea','HISTORICAL',$2,$3)`,
      [snapshot, JSON.stringify({Home_Score: '0', Away_Score: '3', Odd_1_FT: '1.50', Odd_X_FT: '4.00', Odd_2_FT: '6.00'}), sha256('discovered')]);
      const before = (await db.query(`SELECT (SELECT count(*) FROM fpt_match_versions) v, (SELECT count(*) FROM fpt_match_facts) f`)).rows[0];

      const {input, stats} = await readFptHistInput(db, {dateFrom: '2025-09-01', dateTo: '2025-09-30'});
      validateInput(input);
      assert.deepEqual([stats.events, stats.versions, stats.prices_dropped], [3, 5, {}], 'the DISCOVERED dataset version is not read');
      assert.ok(!input.outcomes.some(o => o.provenance.endsWith(':snapshot:' + snapshot) && o.home_score === 0 && o.away_score === 3));
      assert.deepEqual(input.events.map(e => [e.event_id, e.match_date, e.kickoff_utc, e.home]),
        [['fpt:id:m1', '2025-09-20', null, 'Arsenal'], ['fpt:id:m2', '2025-09-21', null, 'Everton'], ['fpt:id:m3', '2025-09-22', null, 'Leeds']]);
      assert.equal(input.observations.find(o => o.event_id === 'fpt:id:m2' && o.selection === 'AWAY').odds, '2.1');
      assert.ok(input.observations.every(o => o.provider_time === null && o.bookmaker === FPT_BOOKMAKER));
      assert.deepEqual(input.outcomes.filter(o => o.event_id !== 'fpt:id:m1').map(o => [o.event_id, o.version, o.status, o.home_score, o.away_score]),
        [['fpt:id:m2', 1, 'NOT_FINAL', null, null], ['fpt:id:m2', 2, 'FINAL', 0, 1], ['fpt:id:m3', 1, 'FINAL', 1, 1], ['fpt:id:m3', 2, 'FINAL', 2, 1]]);

      // PIT: no kickoff and every price acquired after the match, so nothing is decided.
      const pit = runBacktest(input, CONFIG);
      assert.equal(pit.status, STATUS.INSUFFICIENT_PIT_DATA);
      assert.equal(pit.counts.decisions.NO_TRADE, 3);
      // NON_PIT_RESEARCH: decided by match date, labelled, never certified.
      const research = runBacktest(input, {...CONFIG, pit_mode: 'NON_PIT_RESEARCH'});
      assert.equal(research.status, STATUS.OK);
      assert.deepEqual(research.certification, {...research.certification, data_scope: 'REAL', real_data_verdict: 'NOT_VERIFIED', certified: false, pit_mode: 'NON_PIT_RESEARCH'});
      assert.deepEqual(research.bets.map(b => [b.event_id, b.selection, b.odds, b.settlement.outcome, b.settlement.net, b.settlement.resolution.corrected]),
        [['fpt:id:m1', 'HOME', '1.85', 'WIN', '0.81', false], ['fpt:id:m2', 'AWAY', '2.1', 'WIN', '1.04', false], ['fpt:id:m3', 'HOME', '1.7', 'WIN', '0.66', true]]);
      // 0.85 − 0.04 (0.0425 HALF_EVEN), 1.10 − 0.06 (0.055 → 0.06), 0.70 − 0.04 (0.035 → 0.04)
      assert.deepEqual([research.metrics.pl_net, research.metrics.corrected_results, research.ledger.state.reconciled], ['2.51', 1, true]);
      // A cutoff before m3's correction settles it on the first final (1-1: HOME loses).
      const early = runBacktest(input, {...CONFIG, pit_mode: 'NON_PIT_RESEARCH', outcomes_as_of: '2026-10-05T12:00:00Z'});
      assert.equal(early.bets.find(b => b.event_id === 'fpt:id:m3').settlement.outcome, 'LOSE');

      // The CLI: same data through DATABASE_URL, read-only session, report written.
      const dir = mkdtempSync(join(tmpdir(), 'fpt-bt-'));
      writeFileSync(join(dir, 'config.json'), JSON.stringify({...CONFIG, pit_mode: 'NON_PIT_RESEARCH'}));
      const line = await runNode(['tools/hist/fpt-backtest.mjs', '--from', '2025-09-01', '--to', '2025-09-30', '--config', join(dir, 'config.json'),
        '--out', join(dir, 'report.json')], {PATH: process.env.PATH, DATABASE_URL: dbUrl.toString()});
      const summary = JSON.parse(line.trim().split('\n').at(-1));
      assert.deepEqual([summary.status, summary.pit_mode, summary.bets, summary.pl_net], ['OK', 'NON_PIT_RESEARCH', 3, '2.51']);
      assert.equal(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')).report_sha256, summary.report_sha256);
      const remote = spawnSync(process.execPath, ['tools/hist/fpt-backtest.mjs', '--from', '2025-09-01', '--to', '2025-09-30', '--config', join(dir, 'config.json'),
        '--out', join(dir, 'x.json')], {env: {PATH: process.env.PATH, DATABASE_URL: 'postgres://u:p@db.example.com:5432/x'}, encoding: 'utf8'});
      assert.equal(remote.status, 4);
      assert.match(remote.stderr, /DB_NOT_LOCAL/);

      const after = (await db.query(`SELECT (SELECT count(*) FROM fpt_match_versions) v, (SELECT count(*) FROM fpt_match_facts) f`)).rows[0];
      assert.deepEqual(after, before, 'the reader writes nothing');
      assert.equal(summary.reader.events, 3);
      await assert.rejects(readFptHistInput(db, {dateFrom: '2025-10-01', dateTo: '2025-09-01'}), {code: 'BAD_INPUT'});
      await assert.rejects(readFptHistInput(db, {dateFrom: '2025-09-01', dateTo: '2025-09-30', competitionId: "x' OR 1=1"}), {code: 'BAD_INPUT'});
    } finally { await db.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await root.end();
  }
});

test('FPT reader (pure): ids outside the contract alphabet are hashed, absent names are N/D, prices keep the provider value', () => {
  const rows = [{match_key: 'fpt:id:a b', match_date: '2025-09-20', kickoff_utc: null, home: null, away: ' Away ', version_id: 7, snapshot_id: 3,
    acquired_at: '2026-10-04T08:00:00Z', phase: 'PREMATCH', home_score: null, away_score: null, odd_1: '2.000', odd_x: null, odd_d: '1,00', odd_2: 'n/a', odd_a: '1.050'}];
  const {input, stats} = buildFptHistInput(rows, {datasetId: 'fpt:test', description: 'pure'});
  assert.deepEqual(stats.prices_dropped, {NOT_A_PRICE: 1, NOT_GREATER_THAN_1: 1});
  assert.match(input.events[0].event_id, /^fpt:key:[0-9a-f]{32}$/);
  assert.deepEqual([input.events[0].home, input.events[0].away], ['N/D', 'Away']);
  assert.deepEqual(input.observations.map(o => [o.selection, o.odds]), [['HOME', '2'], ['AWAY', '1.05']]);
  assert.deepEqual([input.outcomes[0].status, input.outcomes[0].provenance], ['NOT_FINAL', 'futpythontrader:snapshot:3']);
  validateInput(input);
});

test('provider prices are kept exactly, never rounded; unusable prices are dropped and counted (review B-2)', () => {
  const cases = [['1.0004', '1.0004'], ['2.1234', '2.1234'], ['2,10', '2.1'], ['10.000', '10'], ['007.50', '7.5'], [' 3.4 ', '3.4']];
  for (const [raw, price] of cases) assert.equal(providerPrice(raw).price, price, raw);
  for (const [raw, reason] of [['1.000', 'NOT_GREATER_THAN_1'], ['0.95', 'NOT_GREATER_THAN_1'], ['1.1234567', 'PRECISION_OUT_OF_CONTRACT'],
    ['12345678', 'PRECISION_OUT_OF_CONTRACT'], ['-2', 'NOT_A_PRICE'], ['2e1', 'NOT_A_PRICE'], ['', null], [null, null]]) {
    assert.deepEqual(providerPrice(raw), {price: null, reason}, String(raw));
  }
  // A price that fpt_price would round to 1 does not stop the run: it is kept as 1.0004 (> 1).
  const {input} = buildFptHistInput([{match_key: 'k', match_date: '2025-09-20', kickoff_utc: null, home: 'H', away: 'A', version_id: 1, snapshot_id: 1,
    acquired_at: '2026-10-04T08:00:00Z', phase: 'HISTORICAL', home_score: 1, away_score: 0, odd_1: '1.0004', odd_x: '9', odd_2: '30'}], {datasetId: 'fpt:t', description: 'd'});
  validateInput(input);
  assert.equal(input.observations[0].odds, '1.0004');
  assert.throws(() => buildFptHistInput([{match_key: 'k', acquired_at: '2026-10-05T00:00:00Z', version_id: 2, snapshot_id: 1, home: 'H', away: 'A'},
    {match_key: 'k', acquired_at: '2026-10-04T00:00:00Z', version_id: 1, snapshot_id: 1, home: 'H', away: 'A'}], {datasetId: 'x', description: 'd'}), {code: 'ROWS_NOT_ORDERED'});
});
