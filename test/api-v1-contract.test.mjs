// R-03 contract tests for API v1. The database client is a declared test double: these tests pin the
// HTTP contract (envelope, errors, validation); the real PostgreSQL path is in test/api-v1-postgres.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {API_VERSION, MAX_PARAM_LENGTH, createEndpoints, handleV1, legacyInventory} from '../src/api/v1.mjs';
import {QUERY_CATALOG, ROUTES} from '../src/providers/futpython/query.mjs';

const now = () => new Date('2026-10-18T22:00:00Z');
const calls = [];
const fakeClient = {query: async (sql, values) => { calls.push({sql, values}); return {rows: [{id: 'fpt:competition:1', name: 'Serie A'}]}; }};
const tc = {
  discovery: async () => ({version: 'tc-core-01', families: 3}), schemaRegistry: async () => ({rows: []}), mapping: async () => ({rows: []}),
  prematch: async () => ({version: 'tc-core-03'}), prematchMatch: async (_c, input) => input.matchId === 'missing' ? null : {match_id: input.matchId, as_of: input.asOf},
  historical: async () => ({version: 'tc-core-03b'}), live: async () => ({version: 'tc-core-04', snapshots: {snapshots: 2}}),
  dataHealth: async () => ({status: 'ok'}), fptCertification: async () => ({state: 'historical'}),
};
const deps = {withClient: async fn => fn(fakeClient), tc, codeVersion: 'test-sha', now};
const get = (path, method = 'GET') => handleV1({method, url: new URL(`http://localhost${path}`)}, deps);

function assertEnvelope(body, endpoint) {
  assert.equal(body.api_version, API_VERSION);
  assert.equal(body.endpoint, endpoint);
  assert.ok('data' in body);
  for (const key of ['source', 'provenance', 'as_of', 'generated_at', 'code_version', 'coverage']) assert.ok(key in body.meta, `meta.${key} missing on ${endpoint}`);
  assert.equal(body.meta.code_version, 'test-sha');
  assert.ok(body.meta.provenance, `provenance missing on ${endpoint}`);
}

function assertError(result, status, code) {
  assert.equal(result.status, status);
  assert.deepEqual(Object.keys(result.body), ['api_version', 'error']);
  assert.equal(result.body.error.code, code);
  assert.equal(typeof result.body.error.message, 'string');
  assert.doesNotMatch(JSON.stringify(result.body), /at .*\.mjs|stack|Error:/, 'no internals in errors');
}

test('the endpoint registry describes every v1 endpoint with a parameter schema (MP-API-001, MP-API-005)', async () => {
  const result = await get('/api/v1/endpoints');
  assert.equal(result.status, 200);
  assertEnvelope(result.body, '/api/v1/endpoints');
  const {endpoints} = result.body.data;
  assert.equal(endpoints.length, createEndpoints(tc).length);
  for (const e of endpoints) {
    assert.match(e.path, /^\/api\/v1\//);
    assert.equal(e.method, 'GET');
    for (const spec of Object.values(e.params)) assert.deepEqual(Object.keys(spec).sort(), ['description', 'required', 'type']);
  }
  for (const entry of QUERY_CATALOG) assert.ok(endpoints.some(e => e.legacy === entry.route), `FPT query ${entry.name} has no v1 endpoint`);
});

test('every legacy route is inventoried with a successor or an explicit KEPT status and a pending auth decision (MP-API-006)', () => {
  const inventory = legacyInventory(createEndpoints(tc));
  for (const route of Object.keys(ROUTES)) assert.ok(inventory.some(item => item.route === route), route);
  for (const item of inventory) {
    assert.ok(item.successor === null ? item.status === 'KEPT' : item.status === 'DEPRECATED', item.route);
    assert.equal(item.auth, 'pending R-04 (MP-SEC-001)');
  }
});

test('responses carry the envelope with provenance, coverage, as_of and versions (MP-API-003)', async () => {
  const fpt = await get('/api/v1/fpt/competitions');
  assert.equal(fpt.status, 200);
  assertEnvelope(fpt.body, '/api/v1/fpt/competitions');
  assert.equal(fpt.body.meta.provenance.source_provider, 'futpythontrader');
  assert.equal(fpt.body.meta.provenance.upstream_calls, 0);
  assert.equal(fpt.body.meta.coverage.rows, 1);
  const live = await get('/api/v1/tc/live');
  assertEnvelope(live.body, '/api/v1/tc/live');
  assert.equal(live.body.meta.provenance.source_provider, 'totalcorner');
  const pit = await get('/api/v1/tc/prematch/match?id=42&as_of=2026-10-08T18:00:00Z');
  assert.equal(pit.body.meta.as_of, '2026-10-08T18:00:00Z');
  const health = await get('/api/v1/health');
  assertEnvelope(health.body, '/api/v1/health');
});

test('deterministic error envelope and status codes (MP-API-002)', async () => {
  assertError(await get('/api/v1/nope'), 404, 'NOT_FOUND');
  assertError(await get('/api/v1/fpt/competitions', 'POST'), 405, 'METHOD_NOT_ALLOWED');
  assertError(await get('/api/v1/tc/prematch/match'), 400, 'BAD_REQUEST');
  assertError(await get('/api/v1/tc/prematch/match?id=missing'), 404, 'NOT_FOUND');
  const failing = await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/fpt/competitions')},
    {...deps, withClient: async () => { throw new Error('connection refused at db.internal:5432 password=x'); }});
  assertError(failing, 503, 'UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(failing.body), /db\.internal|password/);
});

test('unknown, repeated, oversized and malformed parameters are rejected before database access (MP-API-004, MP-SEC-006)', async () => {
  calls.length = 0;
  const unknown = await get('/api/v1/fpt/competitions?drop=1');
  assertError(unknown, 400, 'UNKNOWN_PARAMETER');
  assert.deepEqual(unknown.body.error.details.allowed, []);
  assertError(await get('/api/v1/fpt/onboarding?limit=1&limit=2'), 400, 'BAD_REQUEST');
  assertError(await get(`/api/v1/fpt/teams?q=${'a'.repeat(MAX_PARAM_LENGTH + 1)}`), 400, 'BAD_REQUEST');
  assertError(await get(`/api/v1/fpt/teams?q=${'a'.repeat(150)}&${'x'.repeat(2100)}=1`), 414, 'URI_TOO_LONG');
  assert.equal(calls.length, 0, 'no database call for rejected input');
  assertError(await get('/api/v1/fpt/onboarding?limit=100000'), 400, 'BAD_REQUEST');
  assertError(await get("/api/v1/fpt/team-matches?team=fpt:team:1'%20OR%201=1"), 400, 'BAD_REQUEST');
  assertError(await get('/api/v1/fpt/matches?date=2026-13-45'), 400, 'BAD_REQUEST');
});

test('validated input reaches the query layer only as bound parameters', async () => {
  calls.length = 0;
  const ok = await get('/api/v1/fpt/onboarding?limit=7');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.meta.coverage.limit, 7);
  assert.ok(calls.length === 1 && calls[0].values.includes(7) && !calls[0].sql.includes('7'), 'limit must be a bound parameter');
});
