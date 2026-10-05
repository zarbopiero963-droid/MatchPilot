import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldFamily, fieldTiming, marketValueOrNull } from '../src/providers/futpython/schema.mjs';
import { createMemoryLedger, createRequestBudget, endpointFamily, providerQuotaRemaining } from '../src/providers/futpython/budget.mjs';
import { buildQuery, presentPayload, QueryInputError, summarizePlan, perfInputs } from '../src/providers/futpython/query.mjs';
import {
  catalogGate, certificateReport, factsGate, incrementalGate, knownLimitations, ledgerGate, rawSweepGate,
  resetCertificateCacheForTests, sweepTotals, verdictFor
} from '../src/futpython-certificate.mjs';
import { renderCertificateMarkdown } from '../src/futpython-certificate-md.mjs';

// Real FutPythonTrader headers that were unclassified or wrongly "identity" before FPT-PR-09.
const REAL_FIELDS = {
  market: ['AH_H_neg_0_5', 'AH_A_pos_2_5', 'AH_Home_neg_1', 'AH_Away_pos_0_5', 'EH_Home_1', 'EH_Away_neg_3',
    'EH_Draw_1', 'EH_Draw_neg_2', 'Odd_H_FT', 'Odd_CS_0x0', 'Bookie_1X2_FT', 'Over_FT_2_5', 'Under_HT_0_5',
    'BTTS_Yes', 'DC_1X', 'CS_1_1'],
  identity: ['Home', 'Away', 'Date', 'Time', 'League', 'Season', 'Round', 'Id', 'Match_ID', 'Country', 'Div'],
  set_pieces: ['Throw_Ins_Home_FT', 'Throw_Ins_Away_FT'],
  goals: ['Home_Score', 'Away_Score', 'Min_Goals_Home', 'Min_Goals_Away'],
  corners: ['Corners_Home_FT', 'Corners_Away_HT'],
  expected_goals: ['xG_Home_FT', 'xGOT_Faced_Away_FT', 'Big_Chances_Home_2T'],
  shooting: ['Total_Shots_Home_FT', 'Hit_Woodwork_Away_FT'],
  defense: ['Goalkeeper_Saves_Home_HT', 'Goals_Prevented_Away_FT', 'Tackles_Pct_Home_FT'],
  discipline: ['Yellow_Cards_Home_FT', 'Free_Kicks_Away_FT', 'Offsides_Home_2T'],
  possession_creation: ['Possession_Home_FT', 'Through_Passes_Away_FT', 'Touches_Box_Home_FT']
};

test('every real field family is explicit and AH/EH/Country/Div/throw-ins are fixed', () => {
  for (const [family, fields] of Object.entries(REAL_FIELDS)) {
    for (const field of fields) assert.equal(fieldFamily(field), family, field);
  }
});

test('timing class keeps post-match facts out of pre-match analysis', () => {
  assert.equal(fieldTiming('identity'), 'PREMATCH_IDENTITY');
  assert.equal(fieldTiming('market'), 'PREMATCH_MARKET_UNTIMED');
  for (const family of ['goals', 'corners', 'shooting', 'expected_goals', 'set_pieces', 'defense']) {
    assert.equal(fieldTiming(family), 'POSTMATCH_OUTCOME');
  }
  assert.equal(marketValueOrNull('market', '0'), null);
  assert.equal(marketValueOrNull('market', '1.85'), 1.85);
  assert.equal(marketValueOrNull('goals', '0'), 0);
  assert.equal(marketValueOrNull('market', '-'), null);
});

test('payload view marks a market zero as N/D and keeps a goal zero', () => {
  const registry = [
    {field_name: 'Odd_H_FT', zero_is_missing: true, timing_class: 'PREMATCH_MARKET_UNTIMED', prematch_safe: true, missing_tokens: ['', '-']},
    {field_name: 'Home_Score', zero_is_missing: false, timing_class: 'POSTMATCH_OUTCOME', prematch_safe: false, missing_tokens: ['', '-']}
  ];
  const view = presentPayload({Odd_H_FT: '0', Home_Score: '0', Unknown: '-'}, registry);
  assert.deepEqual(view.Odd_H_FT, {value: null, status: 'N/D', timing_class: 'PREMATCH_MARKET_UNTIMED', prematch_safe: true});
  assert.deepEqual(view.Home_Score, {value: '0', status: 'OK', timing_class: 'POSTMATCH_OUTCOME', prematch_safe: false});
  assert.equal(view.Unknown.status, 'N/D');
});

test('ledger rows carry provider, endpoint, latency, budget state and quota; a concurrent duplicate is a deduped row', async () => {
  const ledger = createMemoryLedger();
  let t = Date.parse('2026-10-05T10:00:00Z');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const budget = createRequestBudget({
    ledger,
    now: () => t,
    sleep: async () => {},
    random: () => 0,
    apiKey: () => 'secret-key',
    config: {perMinute: 10, perDay: 10, backfillPerMinute: 5, maxAttempts: 2, backoffBaseMs: 10, backoffCapMs: 100, circuitFailures: 5, circuitOpenMs: 1000},
    fetchImpl: async () => {
      calls++;
      await gate;
      t += 37;
      return {status: 200, ok: true, headers: {'x-ratelimit-remaining': '41'}, text: async () => 'Date,Home,Away\n'};
    }
  });
  const a = budget.requestText({path: '/api/download/x/y/2024', datasetKey: 'x/y/2024', runId: 'r1'});
  const b = budget.requestText({path: '/api/download/x/y/2024', datasetKey: 'x/y/2024', runId: 'r1'});
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  release();
  await Promise.all([a, b]);
  assert.equal(calls, 1);
  const upstream = ledger.rows.find(row => row.outcome === 'upstream');
  const deduped = ledger.rows.find(row => row.outcome === 'deduped');
  assert.ok(deduped, 'deduped row written');
  assert.equal(deduped.deduped, true);
  assert.equal(deduped.attempt, 0);
  assert.equal(upstream.provider, 'futpythontrader');
  assert.equal(upstream.endpoint_family, 'dataset');
  assert.equal(upstream.latency_ms, 37);
  assert.equal(upstream.provider_quota_remaining, 41);
  assert.equal(upstream.budget_state, 'ok');
  assert.equal(upstream.budget_remaining_day, 9);
  assert.equal(upstream.budget_remaining_minute, 9);
  assert.ok(ledger.rows.every(row => !String(row.url_path).includes('secret-key')));
  assert.equal(endpointFamily('/api/jogos-do-dia?date=2026-10-05&format=csv'), 'today');
  assert.equal(endpointFamily('/api-docs'), 'catalog');
  assert.equal(providerQuotaRemaining({}), null);
  assert.equal(providerQuotaRemaining({get: () => 'abc'}), null);
});

test('budget state reaches critical near the daily cap and a cache hit is ledgered with budget state', async () => {
  const ledger = createMemoryLedger();
  const t = Date.parse('2026-10-05T10:00:00Z');
  for (let i = 0; i < 9; i++) await ledger.insert({recorded_at: new Date(t - 3600000), outcome: 'upstream', url_path: '/api/download/a/b/c', attempt: 1});
  const budget = createRequestBudget({
    ledger, now: () => t, sleep: async () => {}, apiKey: () => 'k',
    config: {perMinute: 20, perDay: 10, backfillPerMinute: 5, maxAttempts: 1, backoffBaseMs: 1, backoffCapMs: 1, circuitFailures: 5, circuitOpenMs: 1000},
    fetchImpl: async () => { throw new Error('must not be called'); }
  });
  const hit = await budget.requestText({path: '/api/download/a/b/c', datasetKey: 'a/b/c', cacheLookup: async () => true});
  assert.equal(hit.cacheHit, true);
  const row = ledger.rows.at(-1);
  assert.equal(row.outcome, 'cache_hit');
  assert.equal(row.budget_state, 'critical');
  assert.equal(row.budget_remaining_day, 1);
});

test('query inputs are validated and history is strictly before the cut-off', () => {
  const team = 'fpt:team:' + 'a'.repeat(24);
  const q = buildQuery('teamMatches', {team}, {now: new Date('2026-10-05T12:00:00Z')});
  assert.deepEqual(q.values, [team, '2026-10-05', 50]);
  assert.match(q.sql, /match_date < \$2::date/);
  assert.match(buildQuery('headToHead', {team, opponent: team, before: '2024-01-01'}).sql, /match_date < \$3::date/);
  assert.throws(() => buildQuery('teamMatches', {team: 'x'}), QueryInputError);
  assert.throws(() => buildQuery('teamMatches', {team, before: '2024-13-45'}), QueryInputError);
  assert.throws(() => buildQuery('teamMatches', {team, limit: '1000'}), QueryInputError);
  assert.throws(() => buildQuery('nope', {}), QueryInputError);
  assert.equal(buildQuery('teamSearch', {q: 'Ajax (NED)'}).values[0], 'ajax');
  assert.equal(perfInputs(null).length, 0);
});

test('the query layer never reaches the provider client', () => {
  const source = readFileSync(new URL('../src/providers/futpython/query.mjs', import.meta.url), 'utf8');
  assert.equal(/client\.mjs|fetch\(|budget\.mjs/.test(source), false);
  const cert = readFileSync(new URL('../src/futpython-certificate.mjs', import.meta.url), 'utf8');
  assert.equal(/client\.mjs|fetch\(/.test(cert), false);
});

test('plan summary rejects sequential scans on large tables and slow plans', () => {
  const indexPlan = [{
    'Execution Time': 3.2,
    'Planning Time': 0.4,
    Plan: {'Node Type': 'Limit', Plans: [{'Node Type': 'Bitmap Heap Scan', 'Relation Name': 'fpt_match_facts', 'Actual Rows': 50, 'Actual Loops': 1, 'Rows Removed by Index Recheck': 0,
      Plans: [{'Node Type': 'BitmapOr', Plans: [
        {'Node Type': 'Bitmap Index Scan', 'Index Name': 'fpt_match_facts_home_idx', 'Actual Rows': 30, 'Actual Loops': 1},
        {'Node Type': 'Bitmap Index Scan', 'Index Name': 'fpt_match_facts_away_idx', 'Actual Rows': 25, 'Actual Loops': 1}
      ]}]}]}
  }];
  const ok = summarizePlan(indexPlan);
  assert.equal(ok.pass, true);
  assert.equal(ok.rows_scanned, 50);
  assert.deepEqual(ok.indexes.sort(), ['fpt_match_facts_away_idx', 'fpt_match_facts_home_idx']);
  const seq = summarizePlan([{'Execution Time': 2, 'Planning Time': 0.1, Plan: {'Node Type': 'Seq Scan', 'Relation Name': 'fpt_match_facts', 'Actual Rows': 10, 'Rows Removed by Filter': 161000, 'Actual Loops': 1}}]);
  assert.equal(seq.pass, false);
  assert.deepEqual(seq.seq_scan_on_large_table, ['fpt_match_facts']);
  const slow = summarizePlan([{'Execution Time': 900, 'Planning Time': 0.1, Plan: {'Node Type': 'Index Scan', 'Relation Name': 'fpt_match_facts', 'Index Name': 'i', 'Actual Rows': 1, 'Actual Loops': 1}}]);
  assert.equal(slow.pass, false);
  const smallSeq = summarizePlan([{'Execution Time': 1, 'Planning Time': 0.1, Plan: {'Node Type': 'Seq Scan', 'Relation Name': 'fpt_filter_registry', 'Actual Rows': 325, 'Actual Loops': 1}}]);
  assert.equal(smallSeq.pass, true);
});

test('gates fail closed and the verdict is one of the three allowed outcomes', () => {
  assert.equal(catalogGate({catalog_total: 3, classified_total: 3, unclassified: 0, duplicate_catalog_keys: 0, classification_sum: 3}), true);
  assert.equal(catalogGate({catalog_total: 3, classified_total: 2, unclassified: 1, duplicate_catalog_keys: 0, classification_sum: 3}), false);
  const run = {status: 'complete', mode: 'incremental', dataset_upstream: 0, cache_hit: 165};
  assert.equal(incrementalGate([run, run]), true);
  assert.equal(incrementalGate([run]), false);
  assert.equal(incrementalGate([run, {...run, dataset_upstream: 1}]), false);
  const facts = {facts_rows: 10, distinct_match_keys: 10, facts_at_now: 10, facts_at_now_repeat: 10, facts_stale: 0,
    historical_without_team_ids: 0, without_competition: 2, today_rows: 2, kickoff_utc_set: 0};
  assert.equal(factsGate(facts), true);
  assert.equal(factsGate({...facts, kickoff_utc_set: 1}), false);
  assert.deepEqual(verdictFor({a: true, b: true}, []), {verdict: 'CERTIFIED', failed_gates: []});
  assert.equal(verdictFor({a: true}, [{code: 'x'}]).verdict, 'CERTIFIED WITH KNOWN LIMITATIONS');
  assert.deepEqual(verdictFor({a: true, b: false}, []), {verdict: 'NOT CERTIFIED', failed_gates: ['b']});
  assert.equal(verdictFor({a: undefined}, []).verdict, 'NOT CERTIFIED');
  const sweepRow = {hash_ok: true, malformed_csv: 0, header_row_mismatch: 0, empty_payload: false, parser_rows: 2, row_count: 2, db_rows: 2,
    source_kind: 'dataset', duplicate_match_keys: 0, missing_home: 0, missing_away: 0, missing_date: 0, date_parse_failures: 0};
  assert.equal(rawSweepGate(sweepTotals([sweepRow])), true);
  assert.equal(rawSweepGate(sweepTotals([{...sweepRow, db_rows: 1}])), false);
  assert.equal(rawSweepGate(sweepTotals([{...sweepRow, source_kind: 'today', db_rows: 1}])), true);
  assert.equal(rawSweepGate(sweepTotals([sweepRow]), [{snapshot_id: 1}]), false);
  const emptyToday = {...sweepRow, source_kind: 'today', parser_rows: 0, row_count: 0, db_rows: 0, empty_payload: true};
  const withEmptyToday = sweepTotals([sweepRow, emptyToday]);
  assert.equal(rawSweepGate(withEmptyToday), true, 'an empty jogos-do-dia feed is a provider state');
  assert.equal(withEmptyToday.today_empty_snapshots, 1);
  assert.equal(withEmptyToday.empty_payload, 0);
  assert.equal(rawSweepGate(sweepTotals([{...sweepRow, parser_rows: 0, row_count: 0, db_rows: 0, empty_payload: true}])), false, 'an empty dataset is a defect');
  const ledger = {api_key_paths: 0, unknown_outcomes: 0, rows_without_endpoint_family: 0, config: {perDay: 2000},
    rows_after_014: 5, rows_after_014_upstream: 2, rows_after_014_missing_fields: 0};
  assert.equal(ledgerGate(ledger), true);
  assert.equal(ledgerGate({...ledger, rows_after_014: 0, rows_after_014_upstream: 0}), false, 'tests alone do not prove the ledger');
  assert.equal(ledgerGate({...ledger, rows_after_014_missing_fields: 1}), false);
  assert.equal(rawSweepGate(sweepTotals([])), false);
  const limits = knownLimitations({entity_resolution: {links_total: 5, link_status: {LINKED: 3}}, request_ledger: {rows: 10, rows_with_latency: 10}, filter_registry: {zero_is_missing: 0}});
  assert.ok(limits.some(l => l.code === 'team_links'));
  assert.ok(!limits.some(l => l.code === 'ledger_history'));
});

test('certificate route builds in the background and then serves the report', async () => {
  resetCertificateCacheForTests();
  let resolveBuild;
  const build = () => new Promise(resolve => { resolveBuild = resolve; });
  let t = 1000;
  const first = certificateReport({build, now: () => t});
  assert.equal(first.state, 'building');
  assert.equal(certificateReport({build, now: () => t}).state, 'building');
  resolveBuild({verdict: 'NOT CERTIFIED'});
  await new Promise(resolve => setImmediate(resolve));
  const ready = certificateReport({build, now: () => t});
  assert.equal(ready.state, 'ready');
  assert.equal(ready.report.verdict, 'NOT CERTIFIED');
  t += 16 * 60 * 1000;
  assert.equal(certificateReport({build: () => new Promise(() => {}), now: () => t}).state, 'stale');
  resetCertificateCacheForTests();
});

export function fixtureReport() {
  const gate = {gate: true};
  return {
    identity: {generated_at: '2026-10-05T12:00:00.000Z', commit_sha: 'abc', node_version: 'v22', last_migration: '014-fpt-normalized-layer.sql'},
    catalog: {catalog_total: 3, countries: 1, leagues: 1, classified_total: 3, unclassified: 0, duplicate_catalog_keys: 0, inactive_rows: 0,
      classification: {AVAILABLE: 2, UNAVAILABLE_404: 1, ERROR_REAL: 0, DEPRECATED: 0, REMOVED: 0, unknown: 0}, classification_sum: 3, http_disposition: {}, gate: true},
    data: {snapshots: 2, per_dataset: [{dataset_key: 'a/b/2024', versions: 2, matches: 2}], per_league: [], per_season: []},
    integrity: {raw_sweep: {totals: {snapshots: 2}, failures: [], today: []}, phase3: {}, gate: true},
    schema: gate,
    coverage: {global_classes: {}, normalized_classes: {}, global_tags: {}, rows_per_dimension: {}, phase5: {}, gate: true},
    seasons: {gaps: [], gate: true},
    point_in_time: gate,
    entity_resolution: {codes: [], link_status: {}, gate: true},
    lineage: {version_sets: [], gate: true},
    request_ledger: {by_outcome: [], mechanisms: {cache_first: 't'}, gate: true},
    incremental_sync: {certified_runs: [], later_runs: [], gate: true},
    watchdog: {phase8: {gate: true}, open_alerts: [], alerts: {}},
    normalized_layer: {columns: ['internal_match_id'], gate: true},
    filter_registry: gate,
    assistant_query_layer: {routes: {'/api/fpt/teams': 'teamSearch'}, answers: [], gate: true},
    query_performance: {limits: {maxExecutionMs: 250, maxRowsScanned: 20000}, queries: [], gate: true},
    gates: {catalog: true},
    known_limitations: [{code: 'kickoff_timezone', text: 'tz'}],
    verdict: 'CERTIFIED WITH KNOWN LIMITATIONS',
    failed_gates: []
  };
}

test('markdown certificate has the 17 sections and the single verdict', () => {
  const md = renderCertificateMarkdown(fixtureReport(), {deploy: 'dep-x', verification: ['Neon count matches']});
  for (let i = 1; i <= 17; i++) assert.match(md, new RegExp(`^## ${i}\\. `, 'm'), `section ${i}`);
  assert.match(md, /\*\*Esito: CERTIFIED WITH KNOWN LIMITATIONS\*\*/);
  assert.match(md, /dep-x/);
  assert.match(md, /Neon count matches/);
  assert.match(md, /La issue #12 resta aperta/);
  assert.equal(/postgres:\/\/|api_key=/.test(md), false);
});

const databaseUrl = process.env.FUTPYTHON_TEST_DATABASE_URL
  || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
const SCHEMA = 'fpt_phase9_test';

function csv(rows) {
  const headers = ['Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_H_FT', 'AH_Home_neg_0_5', 'Country', 'Div'];
  return headers.join(',') + '\n' + rows.map(r => headers.map(h => r[h] ?? '').join(',')).join('\n') + '\n';
}

test('normalized layer, team links, raw sweep and query answers on a real Postgres', {timeout: 60000}, async t => {
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
  const store = await import('../src/providers/futpython/store.mjs');
  const teams = await import('../src/providers/futpython/teams.mjs');
  const query = await import('../src/providers/futpython/query.mjs');
  const cert = await import('../src/futpython-certificate.mjs');
  const { parseCsv } = await import('../src/lib/csv.mjs');
  try {
    await migrate();
    await db.withClient(async client => {
      const datasets = [
        ['netherlands', 'eredivisie', '2024', [
          {Date: '2024-08-10', Time: '18:45', Home: 'Ajax', Away: 'PSV', Home_Score: '2', Away_Score: '1', Odd_H_FT: '2.1', AH_Home_neg_0_5: '2.05', Country: 'NETHERLANDS', Div: 'Eredivisie 2024'},
          {Date: '2024-09-01', Time: '14:30', Home: 'PSV', Away: 'Ajax', Home_Score: '0', Away_Score: '0', Odd_H_FT: '1.9', AH_Home_neg_0_5: '1.95', Country: 'NETHERLANDS', Div: 'Eredivisie 2024'},
          {Date: '2024-10-05', Time: '20:00', Home: 'Ajax', Away: 'Feyenoord', Home_Score: '', Away_Score: '', Odd_H_FT: '2.5', AH_Home_neg_0_5: '2.4', Country: 'NETHERLANDS', Div: 'Eredivisie 2024'}
        ]],
        ['europe', 'champions-league', '2024', [
          {Date: '2024-09-18', Time: '21:00', Home: 'Ajax (NED)', Away: 'Inter (ITA)', Home_Score: '1', Away_Score: '3', Odd_H_FT: '3.1', AH_Home_neg_0_5: '3.0', Country: 'EUROPE', Div: 'Champions League 2024'}
        ]]
      ];
      for (const [country, league, season, rows] of datasets) {
        const text = csv(rows);
        const parsed = parseCsv(text);
        const key = `${country}/${league}/${season}`;
        await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,$2,$3,$4,$5)`,
          [key, country, league, season, `/api/download/${key}`]);
        await store.storeDataset(client, {
          datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`,
          countrySlug: country, leagueSlug: league, season, text, headers: parsed.headers, rows: parsed.rows,
          acquiredAt: new Date('2024-10-06T00:00:00Z')
        });
      }
      const entities = teams.buildTeamEntities(await teams.loadTeamSpellings(client));
      await teams.replaceTeamEntities(client, entities);
      await client.query('SELECT fpt_refresh_team_links()');
      const refreshed = await query.refreshNormalizedLayer(client);
      assert.equal(refreshed.facts, 4);
      assert.equal((await query.refreshNormalizedLayer(client)).facts, 0, 'a second refresh writes nothing');

      const facts = (await client.query('SELECT * FROM fpt_match_facts ORDER BY match_date')).rows;
      assert.equal(facts.length, 4);
      assert.ok(facts.every(f => f.home_team_id && f.away_team_id && f.internal_competition_id && f.season_id));
      assert.ok(facts.every(f => f.kickoff_utc === null && f.kickoff_tz_status === 'PROVIDER_TZ_UNDOCUMENTED'));
      assert.deepEqual(facts.map(f => f.result_status), ['FINAL', 'FINAL', 'FINAL', 'NO_RESULT']);
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM fpt_match_facts_at('2024-10-05T00:00:00Z')`)).rows[0].n, 0);
      assert.equal((await client.query(`SELECT count(*)::int AS n FROM fpt_match_facts_at(now())`)).rows[0].n, 4);

      const links = (await client.query('SELECT * FROM fpt_team_links ORDER BY country_code')).rows;
      assert.equal(links.length, 2);
      const ajax = links.find(l => l.country_code === 'NED');
      assert.equal(ajax.link_status, 'LINKED');
      assert.equal(ajax.code_country_slug, 'netherlands');
      assert.equal(links.find(l => l.country_code === 'ITA').link_status, 'CODE_UNRESOLVED');

      const families = Object.fromEntries((await client.query('SELECT field_name, family FROM fpt_schema_fields')).rows.map(r => [r.field_name, r.family]));
      assert.equal(families.AH_Home_neg_0_5, 'market');
      assert.equal(families.Country, 'identity');
      assert.equal(families.Div, 'identity');
      const registry = (await client.query('SELECT * FROM fpt_filter_registry')).rows;
      assert.equal(registry.length, Object.keys(families).length);
      const score = registry.find(r => r.field_name === 'Home_Score');
      assert.equal(score.timing_class, 'POSTMATCH_OUTCOME');
      assert.equal(score.prematch_safe, false);
      assert.equal(registry.find(r => r.field_name === 'Odd_H_FT').zero_is_missing, true);

      const search = await query.runQuery(client, 'teamSearch', {q: 'AJAX'});
      const domesticAjax = search.rows.find(r => r.country_slug === 'netherlands').internal_team_id;
      assert.equal(search.provenance.upstream_calls, 0);
      const before = await query.runQuery(client, 'teamMatches', {team: domesticAjax, before: '2024-09-01'});
      assert.deepEqual(before.rows.map(r => r.match_date.toISOString().slice(0, 10)), ['2024-08-10'], 'the cut-off day itself is excluded');
      const summary = await query.runQuery(client, 'teamSummary', {team: domesticAjax, before: '2100-01-01'});
      assert.deepEqual({p: summary.rows[0].played, w: summary.rows[0].won, d: summary.rows[0].drawn, gf: summary.rows[0].goals_for, ga: summary.rows[0].goals_against},
        {p: 2, w: 1, d: 1, gf: 2, ga: 1});
      const detail = await query.runQuery(client, 'matchDetail', {id: facts[0].internal_match_id});
      assert.equal(detail.rows[0].payload.Home_Score.timing_class, 'POSTMATCH_OUTCOME');

      const sweep = await cert.fullRawSweep(client);
      assert.equal(sweep.gate, true);
      assert.equal(sweep.totals.snapshots, 2);
      assert.equal(sweep.totals.db_rows, 4);

      const perf = await query.runPerfGate(client);
      assert.equal(perf.sample_found, true);
      assert.equal(perf.queries.length, 7);
      assert.ok(perf.queries.every(q => Number.isFinite(q.execution_ms)));
    });
  } finally {
    await db.closePool();
    const admin = new pg.Client({connectionString: databaseUrl});
    await admin.connect();
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await admin.end();
  }
});
