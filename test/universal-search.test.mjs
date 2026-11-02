// MP-SEARCH-01: GET /api/v1/search, universal AND/OR/NOT search over the FutPythonTrader archive with a declared test
// double for the database (the SQL is pinned; a PostgreSQL test runs the same statements). No provider call anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { handleV1 } from '../src/api/v1.mjs';
import { FPT_CAPABILITY_SQL } from '../src/api/capabilities-api.mjs';
import { MAX_EXPR_LENGTH, MISSING_RULES_SQL, SEARCH_SQL, storedValue, universalSearch } from '../src/api/universal-search.mjs';

const CATALOG = [
  {field_name: 'Corners_Home_FT', inferred_type: 'integer', nonempty_seen: '120', filterable: true, coverage_ratio: '0.95'},
  {field_name: 'Odd_1_FT', inferred_type: 'number', nonempty_seen: '200', filterable: true, coverage_ratio: '0.80'},
  {field_name: 'Odd_X_FT', inferred_type: 'number', nonempty_seen: '200', filterable: true, coverage_ratio: '0.80'},
  {field_name: 'Over_FT_2_5', inferred_type: 'number', nonempty_seen: '200', filterable: true, coverage_ratio: '0.80'},
  {field_name: 'Referee', inferred_type: 'text', nonempty_seen: '0', filterable: false, coverage_ratio: null},
  {field_name: 'Stadium', inferred_type: 'text', nonempty_seen: '50', filterable: false, coverage_ratio: '0.10'}
];
const RULES = [{field_name: 'Corners_Home_FT', missing_tokens: ['-', 'NA'], zero_is_missing: false}, {field_name: 'Odd_1_FT', missing_tokens: ['-'], zero_is_missing: true}];
const match = (id, fields) => ({internal_match_id: `fpt:id:${id}`, match_date: '2025-03-01', kickoff_utc: null, internal_competition_id: 'fpt:competition:it-a',
  season_id: 'fpt:season:2024', home_name: `H${id}`, away_name: `A${id}`, result_status: 'FINAL', phase: 'HISTORICAL', fields});
const MATCHES = [
  match(1, {Corners_Home_FT: '7', Odd_1_FT: '1.80'}),
  match(2, {Corners_Home_FT: '3', Odd_1_FT: '2.50'}),
  match(3, {Corners_Home_FT: '-', Odd_1_FT: '1.70'}), // missing corners (registry token)
  match(4, {Odd_1_FT: '0'}), // corners absent, zero price is missing
  match(5, {Corners_Home_FT: 'n/d', Odd_1_FT: '1,90'}), // unreadable values
  match(6, {Corners_Home_FT: '9', Odd_1_FT: '3.10', Odd_X_FT: '3.30'})
];
function harness({matches = MATCHES} = {}) {
  const calls = [];
  const client = {query: async (sql, values) => {
    calls.push({sql, values});
    if (sql === FPT_CAPABILITY_SQL) return {rows: CATALOG};
    if (sql === MISSING_RULES_SQL) return {rows: RULES.filter(r => values[0].includes(r.field_name))};
    if (sql === SEARCH_SQL) return {rows: matches.map(m => ({...m, fields: Object.fromEntries(Object.entries(m.fields).filter(([k]) => values[0].includes(k)))}))};
    throw new Error(`unexpected SQL ${sql.slice(0, 40)}`);
  }};
  const deps = {withClient: async fn => fn(client), tc: {}, codeVersion: 'test', now: () => new Date('2026-11-02T12:00:00Z')};
  const get = (expr, extra = '') => handleV1({method: 'GET', url: new URL(`http://localhost/api/v1/search?expr=${encodeURIComponent(typeof expr === 'string' ? expr : JSON.stringify(expr))}${extra}`)}, deps);
  return {calls, get};
}
const W = '&from=2025-01-01&to=2025-06-30';
const C = 'fpt:statistic:Corners_Home_FT', H = 'fpt:market:Odd_1_FT', X = 'fpt:market:Odd_X_FT';

test('MP-SEARCH-01 end to end: AND, OR and NOT on catalog fields; only TRUE matches; missing data counted, never matched', async () => {
  const h = harness();
  const r = await h.get({any: [{all: [{field: C, op: 'gte', value: 5}, {field: H, op: 'lt', value: '2'}]}, {field: X, op: 'gt', value: '3'}]}, `${W}&decision=POSTMATCH`);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.data;
  assert.deepEqual(d.rows.map(m => m.id), ['fpt:id:1', 'fpt:id:6']);
  // Match 2 is FALSE OR UNKNOWN (no draw price) = UNKNOWN: three-valued logic, never a guess. 3, 4 and 5 lack readable values.
  assert.deepEqual(d.counts, {TRUE: 2, FALSE: 0, UNKNOWN: 4});
  assert.deepEqual(d.rows[0].values, {[C]: '7', [H]: '1.80'});
  assert.equal(d.pit.label, 'RESEARCH_POSTMATCH');
  assert.equal(d.truncated, false);
  assert.deepEqual(h.calls.map(c => c.sql), [FPT_CAPABILITY_SQL, MISSING_RULES_SQL, SEARCH_SQL]);
  assert.deepEqual(h.calls[2].values, [['Corners_Home_FT', 'Odd_1_FT', 'Odd_X_FT'], '2025-01-01', '2025-06-30', null, null, 5001], 'only the used payload keys, bounded scan');
  assert.equal(r.body.meta.provenance.upstream_calls, 0);
  // NOT never turns missing data into a match.
  const not = await harness().get({not: {field: C, op: 'gte', value: 5}}, `${W}&decision=POSTMATCH`);
  assert.deepEqual(not.body.data.rows.map(m => m.id), ['fpt:id:2']);
  assert.equal(not.body.data.counts.UNKNOWN, 3);
  const isNull = await harness().get({field: C, op: 'is_null'}, `${W}&decision=POSTMATCH`);
  assert.deepEqual(isNull.body.data.rows.map(m => m.id), ['fpt:id:3', 'fpt:id:4'], 'registry token and absence are missing; an unreadable value is UNKNOWN');
});

test('MP-SEARCH-01 PIT: PREMATCH refuses post-kickoff fields before reading any match; archive prices are never PIT verified', async () => {
  const h = harness();
  const r = await h.get({all: [{field: C, op: 'gte', value: 5}, {field: H, op: 'lt', value: '2'}]}, `${W}&decision=PREMATCH`);
  assert.equal(r.status, 400);
  assert.match(r.body.error.message, /cannot use fields known only after kickoff: fpt:statistic:Corners_Home_FT/);
  assert.deepEqual(r.body.error.fields, ['expr', 'decision']);
  assert.deepEqual(h.calls.map(c => c.sql), [FPT_CAPABILITY_SQL], 'no match read after a refusal');
  const ok = await harness().get({field: H, op: 'lt', value: '2'}, `${W}&decision=PREMATCH`);
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.data.pit.pit_verifiable, ok.body.data.pit.label, ok.body.data.pit.untimed], [false, 'NOT_PIT_VERIFIED', [H]]);
});

test('MP-SEARCH-01 field states: only AVAILABLE AND IMPLEMENTED fields search; the others are refused with their state', async () => {
  for (const [expr, re] of [
    [{field: 'fpt:statistic:Referee', op: 'eq', value: 'x'}, /fpt:statistic:Referee \(NOT VERIFIED\)/],
    [{field: 'fpt:statistic:Stadium', op: 'eq', value: 'x'}, /fpt:statistic:Stadium \(AVAILABLE BUT NOT IMPLEMENTED\)/],
    [{field: 'apifootball:market:odds/bet:5', op: 'gt', value: '1'}, /expr: .*unknown|expr: .*not in the catalog|expr:/],
    [{field: 'fpt:statistic:Nope', op: 'gt', value: 1}, /expr:/]
  ]) {
    const h = harness();
    const r = await h.get(expr, `${W}&decision=POSTMATCH`);
    assert.equal(r.status, 400, JSON.stringify(expr));
    assert.match(r.body.error.message, re);
    assert.equal(h.calls.length, 1, 'no match read');
  }
  const r = await harness().get({field: 'fpt:statistic:Stadium', op: 'eq', value: 'x'}, `${W}&decision=POSTMATCH`);
  assert.deepEqual(r.body.error.details.fields, [{id: 'fpt:statistic:Stadium', status: 'AVAILABLE BUT NOT IMPLEMENTED'}]);
});

test('MP-SEARCH-01 no fixed market: any market of the catalog is searched the same way (Over 2.5 has no privilege)', async () => {
  const over = await harness({matches: [match(1, {Over_FT_2_5: '1.90'}), match(2, {Odd_X_FT: '3.30'})]}).get({field: 'fpt:market:Over_FT_2_5', op: 'lt', value: '2'}, `${W}&decision=POSTMATCH`);
  const draw = await harness({matches: [match(1, {Over_FT_2_5: '1.90'}), match(2, {Odd_X_FT: '3.30'})]}).get({field: X, op: 'gt', value: '3'}, `${W}&decision=POSTMATCH`);
  assert.deepEqual([over.body.data.rows.map(m => m.id), draw.body.data.rows.map(m => m.id)], [['fpt:id:1'], ['fpt:id:2']]);
  const {readFileSync} = await import('node:fs');
  assert.doesNotMatch(readFileSync('src/api/universal-search.mjs', 'utf8'), /over25|Over_FT_2_5|odd_over/i);
  // The existing search and the endpoint registry are unchanged.
  const reg = await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/endpoints')}, {withClient: async () => { throw new Error('no db'); }, tc: {}});
  const paths = reg.body.data.endpoints?.map?.(e => e.path) ?? JSON.stringify(reg.body.data);
  assert.ok(String(paths).includes('/api/v1/fpt/search') && String(paths).includes('/api/v1/search'));
});

test('MP-SEARCH-01 input is validated before any database access', async () => {
  const cases = [
    ['not json', `${W}&decision=POSTMATCH`, /expr must be a JSON expression/],
    ['[1]', `${W}&decision=POSTMATCH`, /JSON object/],
    [{field: H, op: 'lt', value: '2'}, `${W}&decision=LIVE`, /decision must be one of/],
    [{field: H, op: 'lt', value: '2'}, '&from=2025-01-01&to=2026-06-30&decision=POSTMATCH', /longer than 366 days/],
    [{field: H, op: 'lt', value: '2'}, '&from=2025-06-01&to=2025-01-01&decision=POSTMATCH', /must not be before/],
    [{field: H, op: 'lt', value: '2'}, '&from=2025-02-30&to=2025-03-01&decision=POSTMATCH', /calendar date/],
    [{field: H, op: 'lt', value: '2'}, `${W}`, /missing required parameter: decision/],
    [{field: H, op: 'lt', value: '2'}, `${W}&decision=POSTMATCH&limit=500`, /limit must be an integer/]
  ];
  for (const [expr, extra, re] of cases) {
    const h = harness();
    const r = await h.get(expr, extra);
    assert.equal(r.status, 400, extra);
    assert.match(r.body.error.message, re, extra);
    assert.equal(h.calls.length, 0, extra);
  }
  const long = {any: Array.from({length: 40}, (_, i) => ({field: H, op: 'eq', value: String(i)}))};
  assert.ok(JSON.stringify(long).length > MAX_EXPR_LENGTH);
  assert.equal((await harness().get(long, `${W}&decision=POSTMATCH`)).status, 414, 'over the v1 query length');
});

test('MP-SEARCH-01 bounded scan reports truncation; stored values follow the registry missing rules', () => {
  const rows = Array.from({length: 4}, (_, i) => match(i, {Odd_1_FT: '1.5'}));
  const d = universalSearch({catalogRows: CATALOG, missingRules: [], rows, input: {expr: {field: H, op: 'lt', value: '2'}, decision: 'POSTMATCH', from: 'a', to: 'b', limit: 2},
    ApiError: class extends Error {}, scanLimit: 3});
  assert.deepEqual([d.scanned, d.truncated, d.counts.TRUE, d.rows.length], [3, true, 3, 2]);
  assert.match(d.notes.at(-1), /truncated to the 3 most recent/);
  assert.equal(storedValue(' - ', {missing_tokens: ['-']}), null);
  assert.equal(storedValue('0.00', {missing_tokens: [], zero_is_missing: true}), null);
  assert.equal(storedValue('0', {missing_tokens: [], zero_is_missing: false}), '0');
  assert.equal(storedValue('', null), null);
  assert.equal(storedValue({a: 1}, null), null);
});

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {env, stdio: ['ignore', 'pipe', 'pipe']});
    let out = '';
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { out += c; });
    child.once('exit', code => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}

test('MP-SEARCH-01 the pinned SQL runs on the real schema (PostgreSQL)', {timeout: 90000}, async t => {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const url = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); } catch (cause) { await root.end().catch(() => {}); if (process.env.CI) throw cause; return t.skip('throwaway postgres unavailable'); }
  const schema = `usearch_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    url.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: url.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const db = new pg.Client({connectionString: url.toString()});
    await db.connect();
    try {
      assert.ok(Array.isArray((await db.query(MISSING_RULES_SQL, [['Odd_1_FT']])).rows));
      assert.deepEqual((await db.query(SEARCH_SQL, [['Odd_1_FT'], '2025-01-01', '2025-06-30', null, null, 10])).rows, []);
      const plan = await db.query(`EXPLAIN ${SEARCH_SQL}`, [['Odd_1_FT'], '2025-01-01', '2025-06-30', 'x', null, 10]);
      assert.ok(plan.rows.length > 0);
    } finally { await db.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
});
