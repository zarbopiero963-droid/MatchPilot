// MP-TC-BENCH-01: the LIVE benchmark functions on synthetic series, and the read-only TotalCorner export on a throwaway
// PostgreSQL schema. No provider is called; no collector is started.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { benchmarkReport, matchFixtures, normalizeTeam, providerMetrics, uniqueFields, verdict } from '../src/benchmark/live-benchmark.mjs';
import { exportTcSeries } from '../src/benchmark/tc-export.mjs';
import { parseArgs, run } from '../tools/benchmark/tc-af-live.mjs';

const K = '2026-11-01T14:00:00Z';
const at = (min, sec = 0) => new Date(Date.parse(K) + min * 60000 + sec * 1000).toISOString();
const series = (provider, id, {home = 'Lazio', away = 'Cagliari', kickoff = K, every = 1, until = 30, fields = {}, events = []} = {}) => ({
  provider, match: {id, league: 'IT1', kickoff, home, away},
  snapshots: Array.from({length: Math.floor(until / every) + 1}, (_, i) => ({acquired_at: at(i * every, 5), minute: String(i * every), fields: {...fields}})),
  events, requests: {calls: 10, errors: 1, empty: 0}
});

test('MP-TC-BENCH-01 matching: only a unique pair on both sides is VERIFIED; names normalized, kickoff within tolerance', () => {
  assert.equal(normalizeTeam('S.S. Lazio'), 's s lazio');
  assert.equal(normalizeTeam('Atlético Madrid'), 'atletico madrid');
  assert.equal(normalizeTeam('Cagliari Calcio'), 'cagliari');
  const left = [{id: 't1', home: 'Lazio', away: 'Cagliari', kickoff: K}, {id: 't2', home: 'Roma', away: 'Inter', kickoff: K}, {id: 't3', home: 'Milan', away: 'Genoa', kickoff: K}];
  const right = [{id: 'a1', home: 'lazio', away: 'Cagliari Calcio', kickoff: '2026-11-01T14:05:00Z'},
    {id: 'a2', home: 'Roma', away: 'Inter', kickoff: '2026-11-01T16:00:00Z'},
    {id: 'a3', home: 'Milan', away: 'Genoa', kickoff: K}, {id: 'a4', home: 'Milan', away: 'Genoa', kickoff: '2026-11-01T14:10:00Z'}];
  const m = matchFixtures(left, right);
  assert.deepEqual(m.verified, [{left: 't1', right: 'a1'}]);
  assert.deepEqual(m.ambiguous, [{left: 't3', candidates: ['a3', 'a4']}], 'two candidates: not forced');
  assert.deepEqual(m.unmatched_left, ['t2', 't3']);
  assert.deepEqual(matchFixtures([{id: 'x', home: '', away: '', kickoff: K}], [{id: 'y', home: '', away: '', kickoff: K}]).verified, [], 'empty names never match');
});

test('MP-TC-BENCH-01 metrics come from the rows only: freshness, gaps, missing ratio, latency lower bound, requests', () => {
  const s = series('tc', 't1', {every: 1, until: 10, fields: {corners: '3', attacks: ''},
    events: [{type: 'goal', minute: '5', acquired_at: at(5, 40)}, {type: 'goal', minute: '70', acquired_at: at(80)}, {type: 'card', minute: 'x', acquired_at: at(6)}]});
  s.snapshots.splice(4, 3);
  s.snapshots.push({acquired_at: 'yesterday', fields: {}});
  const m = providerMetrics([s], {gapMs: 2 * 60000});
  assert.equal(m.snapshots, 8);
  assert.equal(m.unreadable_snapshots, 1);
  assert.deepEqual(m.fields, {attacks: {present: 0, missing_ratio: 1}, corners: {present: 8, missing_ratio: 0}});
  assert.equal(m.freshness_ms.median, 60000);
  assert.equal(m.gaps.count, 1, 'the 4-minute hole is one gap');
  assert.deepEqual([m.latency_ms.median, m.latency_ms.samples], [40000, 1], 'only the first-half event with a readable minute');
  assert.match(m.latency_ms.note, /lower bound/);
  assert.deepEqual(m.requests, {calls: 10, errors: 1, empty: 0});
  assert.deepEqual(providerMetrics([]).freshness_ms, {median: null, p90: null, samples: 0});
});

test('MP-TC-BENCH-01 fields are compared only through an explicit mapping', () => {
  const l = providerMetrics([series('tc', 't1', {fields: {corner: '2', da: '10'}})]);
  const r = providerMetrics([series('af', 'a1', {fields: {'Corner Kicks': 2, 'Total Shots': 4}})]);
  assert.deepEqual(uniqueFields(l, r), {mapped: [], only_left_unmapped: ['corner', 'da'], only_right_unmapped: ['Corner Kicks', 'Total Shots']});
  assert.deepEqual(uniqueFields(l, r, {corner: 'Corner Kicks'}).mapped, [{left: 'corner', right: 'Corner Kicks', left_present: true, right_present: true}]);
});

test('MP-TC-BENCH-01 verdict: INSUFFICIENT EVIDENCE without approved thresholds or enough matched matches', () => {
  const cand = [series('tc', 't1', {events: [{type: 'goal', minute: '10', acquired_at: at(10, 30)}]})];
  const ref = [series('af', 'a1', {every: 2})];
  const noThresholds = benchmarkReport({candidate: cand, reference: ref});
  assert.equal(noThresholds.result.verdict, 'INSUFFICIENT EVIDENCE');
  assert.equal(noThresholds.result.reasons.length, 4);
  const t = {min_matched_matches: 1, max_median_freshness_ms: 90000, max_gap_ratio: 0.1, max_median_latency_ms: 60000};
  assert.deepEqual(benchmarkReport({candidate: cand, reference: ref, thresholds: t}).result, {verdict: 'KEEP', reasons: ['every approved threshold met']});
  assert.match(benchmarkReport({candidate: cand, reference: ref, thresholds: {...t, min_matched_matches: 30}}).result.reasons[0], /fewer than 30/);
  assert.equal(benchmarkReport({candidate: cand, reference: ref, thresholds: {...t, max_median_latency_ms: 10000}}).result.verdict, 'DROP');
  assert.equal(verdict({matching: {verified: []}, candidate: providerMetrics([])}, {...t, max_gap_ratio: -1}).verdict, 'INSUFFICIENT EVIDENCE');
  // Unmatched matches are left out of the metrics: they are not compared.
  const extra = benchmarkReport({candidate: [...cand, series('tc', 't9', {home: 'Roma', away: 'Inter'})], reference: ref, thresholds: t});
  assert.deepEqual([extra.candidate.matches, extra.matching.unmatched_left], [1, ['t9']]);
});

test('MP-TC-BENCH-01 CLI reads files only and requires both inputs', () => {
  assert.throws(() => parseArgs(['--candidate', 'a.json']), /required/);
  assert.throws(() => parseArgs(['--live', 'x']), /usage/);
  const files = {'c.json': [series('tc', 't1')], 'r.json': [series('af', 'a1')]};
  const report = run(parseArgs(['--candidate', 'c.json', '--reference', 'r.json']), path => files[path]);
  assert.equal(report.result.verdict, 'INSUFFICIENT EVIDENCE');
  assert.throws(() => run({candidate: 'c.json', reference: 'x'}, path => (path === 'x' ? {} : files[path])), /arrays of series/);
});

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', c => { output += c; });
    child.stderr.on('data', c => { output += c; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve(output) : reject(new Error(`node ${args.join(' ')} exited ${code}\n${output}`))));
  });
}

test('MP-TC-BENCH-01 TotalCorner export: archive only, READ ONLY transaction, provider fields kept as written', {timeout: 90000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); } catch (cause) { await root.end().catch(() => {}); if (process.env.CI) throw cause; return t.skip('throwaway postgres unavailable'); }
  const schema = `tcbench_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const db = new pg.Client({connectionString: dbUrl.toString()});
    await db.connect();
    try {
      await db.query(`INSERT INTO tc_matches (match_id, league_id, home, away, start_provider, tz_offset_minutes, kickoff_utc, first_seen_at, last_seen_at)
        VALUES ('m1','IT1','Lazio','Cagliari','14:00',0,'2026-11-01T14:00:00Z',now(),now()), ('m2','IT1','Roma','Inter','16:00',0,'2026-11-01T16:00:00Z',now(),now()),
               ('m3','IT1','Old','Match','12:00',0,'2026-10-01T12:00:00Z',now(),now())`);
      for (const [id, acquired, payload] of [['m1', '2026-11-01T14:10:05Z', {id: 'm1', l_id: 'IT1', status: '10', corner: '2', da: 15, nested: {x: 1}}],
        ['m1', '2026-11-01T14:11:05Z', {id: 'm1', l_id: 'IT1', status: '11', corner: '3', da: 16}], ['m3', '2026-10-01T12:10:00Z', {id: 'm3', corner: '1'}]]) {
        await db.query(`INSERT INTO tc_live_snapshots (match_id, league_id, acquired_at, minute, snapshot_hash, payload) VALUES ($1,'IT1',$2,'10',md5($3::text),$3::jsonb)`, [id, acquired, JSON.stringify(payload)]);
      }
      await db.query(`INSERT INTO tc_live_events (match_id, event_hash, minute, event_type, acquired_at, payload) VALUES ('m1','h1','10','goal','2026-11-01T14:10:40Z','{}')`);
      const out = await exportTcSeries(db, {from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z'});
      assert.equal(out.length, 1, 'only matches with archived LIVE snapshots in the window');
      assert.deepEqual(out[0].match, {id: 'm1', league: 'IT1', kickoff: '2026-11-01T14:00:00Z', home: 'Lazio', away: 'Cagliari'});
      assert.deepEqual(out[0].snapshots.map(s => s.fields), [{corner: '2', da: 15}, {corner: '3', da: 16}], 'scalar provider fields as written; identity and nested keys left out');
      assert.deepEqual(out[0].events, [{type: 'goal', minute: '10', acquired_at: '2026-11-01T14:10:40.000Z'}]);
      const m = providerMetrics(out);
      assert.deepEqual([m.snapshots, m.freshness_ms.median, m.latency_ms.median], [2, 60000, 40000]);
      await assert.rejects(exportTcSeries(db, {from: '2026-01-01T00:00:00Z', to: '2026-03-01T00:00:00Z'}), /longer than 31 days/);
      await assert.rejects(exportTcSeries(db, {from: '2026-11-01', to: '2026-11-02T00:00:00Z'}), /ISO instants/);
      // The transaction is READ ONLY: a write inside it is refused by the database.
      await db.query('BEGIN TRANSACTION READ ONLY');
      await assert.rejects(db.query("INSERT INTO tc_live_events (match_id, event_hash, acquired_at, payload) VALUES ('m1','h2',now(),'{}')"), err => err.code === '25006');
      await db.query('ROLLBACK');
    } finally { await db.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
});
