// MP-CAP-01b: GET /api/v1/capabilities with a declared test double for the database (the SQL is pinned here; the real
// PostgreSQL path runs the same statement). No provider call anywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleV1 } from '../src/api/v1.mjs';
import { capabilityCatalog, FPT_CAPABILITY_SQL, FPT_FIELDS_MAX } from '../src/api/capabilities-api.mjs';
import { apiFootballCapabilities, apiFootballDeferred } from '../src/capabilities/apifootball.mjs';
import { buildCatalog, validateCapability } from '../src/capabilities/catalog.mjs';
import { APIFOOTBALL_LIVE, APIFOOTBALL_PREMATCH } from '../src/markets/market-ref.mjs';

const ROWS = [
  {field_name: 'Corners_Home_FT', inferred_type: 'integer', nonempty_seen: '120', filterable: true, coverage_ratio: '0.9500000000'},
  {field_name: 'Odd_1_FT', inferred_type: 'number', nonempty_seen: '200', filterable: true, coverage_ratio: '0.8000000000'},
  {field_name: 'Date', inferred_type: 'date_or_datetime', nonempty_seen: '200', filterable: true, coverage_ratio: null},
  {field_name: 'Referee', inferred_type: 'text', nonempty_seen: '0', filterable: false, coverage_ratio: null}
];
function harness(rows = ROWS) {
  const calls = [];
  const client = {query: async (sql, values) => { calls.push({sql, values}); return {rows}; }};
  const deps = {withClient: async fn => fn(client), tc: {}, codeVersion: 'test', now: () => new Date('2026-11-01T23:00:00Z')};
  return {calls, get: path => handleV1({method: 'GET', url: new URL(`http://localhost${path}`)}, deps)};
}

test('MP-CAP-01b the catalog lists the FPT archive columns and the observed API-FOOTBALL capabilities, all valid', async () => {
  const h = harness();
  const r = await h.get('/api/v1/capabilities');
  assert.equal(r.status, 200);
  const data = r.body.data;
  assert.deepEqual(data.errors, []);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].sql, FPT_CAPABILITY_SQL);
  assert.deepEqual(h.calls[0].values, [FPT_FIELDS_MAX + 1]);
  assert.equal(data.rows.length, ROWS.length + apiFootballCapabilities().length);
  for (const c of data.rows) assert.deepEqual(validateCapability(c), [], c.id);
  assert.deepEqual(data.rows.map(c => c.id), [...data.rows.map(c => c.id)].sort(), 'ordered by id');
  assert.equal(data.counts.by_provider.fpt, 4);
  assert.equal(data.counts.by_provider.apifootball, apiFootballCapabilities().length);
  assert.deepEqual(r.body.meta.provenance, {source: 'fpt_schema_fields + api-football verification 2026-11-01', upstream_calls: 0, catalog_version: 'mp-cap-1'});
  assert.equal(data.truncated, false);
});

test('MP-CAP-01b statuses follow the evidence: never implemented without a collector, never a claim of full coverage', () => {
  const af = apiFootballCapabilities();
  assert.ok(af.every(c => c.status === 'AVAILABLE BUT NOT IMPLEMENTED'), 'observed but not stored: not implemented');
  assert.ok(af.every(c => c.coverage === null), 'a 20-call sample gives no coverage ratio');
  assert.ok(af.every(c => c.provenance.evidence.length && c.provenance.evidence.every(e => e.startsWith('docs/product/mp-263/api-football-verification-2026-11-01.md'))));
  assert.ok(af.every(c => c.limits.some(l => /not a certified coverage/.test(l))));
  const data = capabilityCatalog(ROWS);
  const byId = Object.fromEntries(data.rows.map(c => [c.id, c]));
  assert.equal(byId['fpt:statistic:Referee'].status, 'NOT VERIFIED', 'never seen with a value');
  assert.equal(byId['fpt:market:Odd_1_FT'].coverage, 0.8);
  assert.ok(data.rows.filter(c => c.provider === 'fpt').every(c => c.phases.join() === 'HISTORICAL' && c.limits.some(l => /historical archive only/.test(l))));
  assert.ok(data.notes.some(n => /no capability claims a complete coverage/.test(n)));
});

test('MP-CAP-01b PIT: pre-match markets are PREMATCH, statistics never pre-match, in-play prices deferred', () => {
  const af = apiFootballCapabilities();
  const markets = af.filter(c => c.kind === 'market');
  assert.deepEqual(markets.map(c => c.provider_ref).sort(), Object.keys(APIFOOTBALL_PREMATCH).map(id => `odds/bet:${id}`).sort());
  assert.ok(markets.every(c => c.timing === 'PREMATCH_MARKET_UNTIMED' && c.phases.join() === 'PREMATCH' && c.unit === 'decimal_odds'));
  assert.ok(markets.every(c => c.limits.some(l => /odds history not guaranteed by the provider/.test(l))), 'no provider odds history is claimed');
  assert.equal(markets.find(c => c.provider_ref === 'odds/bet:5').market_type, 'OVER_UNDER');
  const stats = af.filter(c => c.kind === 'statistic');
  assert.equal(stats.length, 16);
  assert.ok(stats.every(c => c.timing === 'POSTMATCH_OUTCOME'));
  assert.deepEqual(stats.find(c => c.provider_ref === 'Ball Possession').unit, 'percent');
  const deferred = apiFootballDeferred();
  assert.deepEqual(deferred.map(d => d.provider_ref).sort(), Object.keys(APIFOOTBALL_LIVE).map(id => `odds/live/bet:${id}`).sort());
  assert.ok(deferred.every(d => /no MP-PIT-TIMING-01 class/.test(d.reason)));
  // The catalog itself refuses an in-play market and malformed phases.
  const live = {...markets[0], id: 'apifootball:market:odds/live/bet:36', provider_ref: 'odds/live/bet:36', phases: ['LIVE']};
  assert.match(validateCapability(live).join('\n'), /an in-play market has no MP-PIT-TIMING-01 class/);
  for (const phases of [[], ['NOW'], ['PREMATCH', 'PREMATCH'], 'PREMATCH']) {
    assert.match(validateCapability({...markets[0], phases}).join('\n'), /phases is a non-empty list/, JSON.stringify(phases));
  }
  assert.deepEqual(buildCatalog(af).errors, []);
});

test('MP-CAP-01b filters: provider, kind and status; API-FOOTBALL alone reads no database', async () => {
  const h = harness();
  const af = await h.get('/api/v1/capabilities?provider=apifootball');
  assert.equal(af.status, 200);
  assert.equal(h.calls.length, 0, 'no database read for API-FOOTBALL alone');
  assert.ok(af.body.data.rows.every(c => c.provider === 'apifootball'));
  const fpt = await h.get('/api/v1/capabilities?provider=fpt&kind=market');
  assert.deepEqual(fpt.body.data.rows.map(c => c.id), ['fpt:market:Odd_1_FT']);
  assert.deepEqual(fpt.body.data.deferred, []);
  const nv = await h.get('/api/v1/capabilities?status=NOT%20VERIFIED');
  assert.deepEqual(nv.body.data.rows.map(c => c.id), ['fpt:statistic:Referee']);
  for (const q of ['provider=totalcorner', 'kind=odds', 'status=AVAILABLE', 'limit=5']) {
    const bad = await h.get(`/api/v1/capabilities?${q}`);
    assert.equal(bad.status, 400, q);
  }
});

test('MP-CAP-01b a corrupted registry is bounded and reported; a database failure is UNAVAILABLE', async () => {
  const many = Array.from({length: FPT_FIELDS_MAX + 1}, (_, i) => ({field_name: `X_${String(i).padStart(5, '0')}`, inferred_type: 'integer', nonempty_seen: 1, filterable: false}));
  const data = capabilityCatalog(many, {provider: 'fpt'});
  assert.equal(data.rows.length, FPT_FIELDS_MAX);
  assert.equal(data.truncated, true);
  const failing = await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/capabilities')},
    {withClient: async () => { const e = new Error('down'); e.code = 'ECONNREFUSED'; throw e; }, tc: {}, codeVersion: 'test'});
  assert.equal(failing.status, 503);
  assert.equal(failing.body.error.code, 'UNAVAILABLE');
});

test('MP-CAP-01b review: API-FOOTBALL alone answers without a database connection; evidence limits are explicit', async () => {
  let connections = 0;
  const deps = {withClient: async () => { connections += 1; const e = new Error('down'); e.code = 'ECONNREFUSED'; throw e; }, tc: {}, codeVersion: 'test'};
  const call = path => handleV1({method: 'GET', url: new URL(`http://localhost${path}`)}, deps);
  const af = await call('/api/v1/capabilities?provider=apifootball&kind=statistic');
  assert.equal(af.status, 200);
  assert.equal(connections, 0);
  assert.ok(af.body.data.rows.length === 16 && af.body.data.rows.every(c => c.kind === 'statistic'));
  assert.equal((await call('/api/v1/capabilities?provider=fpt')).status, 503);
  assert.equal(connections, 1);
  const caps = apiFootballCapabilities();
  assert.ok(caps.filter(c => c.kind === 'market').every(c => c.limits.some(l => /does not list each id/.test(l))));
  assert.ok(caps.filter(c => c.kind === 'statistic').every(c => c.limits.length === 5 && c.phases.includes('LIVE')));
  assert.deepEqual(validateCapability(caps.find(c => c.provider_ref === 'Corner Kicks')), [], 'a statistic may be offered in play');
});
