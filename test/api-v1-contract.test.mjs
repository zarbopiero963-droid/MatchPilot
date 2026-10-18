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
  assert.equal(pit.body.meta.as_of, '2026-10-08T18:00:00.000Z');
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

test('meta.as_of is the instant the reader applied, never an echo of the raw input (review B-1)', async () => {
  assertError(await get('/api/v1/tc/prematch/match?id=42&as_of=garbage'), 400, 'BAD_REQUEST');
  assertError(await get('/api/v1/tc/prematch/match?id=42&as_of=2026-10-08T18:00:00'), 400, 'BAD_REQUEST');
  const kickoff = await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/tc/prematch/match?id=42')},
    {...deps, tc: {...tc, prematchMatch: async () => ({as_of: '2026-10-09T19:45:00.000Z'})}});
  assert.equal(kickoff.body.meta.as_of, '2026-10-09T19:45:00.000Z', 'default as_of is the kickoff the reader used');
  assert.equal((await get('/api/v1/tc/live')).body.meta.as_of, null, 'no point in time on a report endpoint');
  assert.equal((await get('/api/v1/fpt/competitions')).body.meta.as_of, null);
});

test('point-in-time answers expose their PIT label in meta.pit; other endpoints report null (MP-PIT-005)', async () => {
  const label = {policy_version: 'mp-pit-v1', label: 'NON_PIT', why: ['PROVIDER_KNOWLEDGE'], records: 0};
  const result = await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/tc/prematch/match?id=42&knowledge=provider')},
    {...deps, tc: {...tc, prematchMatch: async () => ({as_of: '2026-10-09T19:45:00.000Z', pit: label})}});
  assert.deepEqual(result.body.meta.pit, label);
  assert.equal((await get('/api/v1/tc/live')).body.meta.pit, null);
});

test('TotalCorner parameters are validated, never silently capped or defaulted (review B-2)', async () => {
  const seen = [];
  const spy = {...tc, schemaRegistry: async (_c, input) => { seen.push(input); return []; }, prematchMatch: async (_c, input) => { seen.push(input); return {as_of: null}; }};
  const call = path => handleV1({method: 'GET', url: new URL(`http://localhost${path}`)}, {...deps, tc: spy});
  for (const bad of ['99999', '5001', '0', 'abc', '1.5', '-1', '']) assertError(await call(`/api/v1/tc/schema-registry?limit=${bad}`), 400, 'BAD_REQUEST');
  assertError(await call('/api/v1/tc/prematch/match?id=1&knowledge=anything'), 400, 'BAD_REQUEST');
  assert.equal(seen.length, 0, 'rejected input never reaches the reader');
  const capped = await call('/api/v1/tc/schema-registry?limit=5000');
  assert.equal(capped.status, 200);
  assert.equal(capped.body.meta.coverage.limit, 5000);
  const byDefault = await call('/api/v1/tc/schema-registry');
  assert.equal(byDefault.body.meta.coverage.limit, 2000);
  assert.deepEqual(seen.map(input => input.limit), [5000, 2000]);
  await call('/api/v1/tc/prematch/match?id=1&knowledge=captured');
  assert.equal(seen.at(-1).knowledge, 'captured');
});

test('the registry marks the parameters the query layer requires and errors use API parameter names (review NB-1, NB-7)', async () => {
  const {endpoints} = (await get('/api/v1/endpoints')).body.data;
  const required = path => Object.entries(endpoints.find(e => e.path === path).params).filter(([, spec]) => spec.required).map(([name]) => name);
  assert.deepEqual(required('/api/v1/fpt/team-matches'), ['team']);
  assert.deepEqual(required('/api/v1/fpt/h2h'), ['team', 'opponent']);
  assert.deepEqual(required('/api/v1/tc/prematch/match'), ['id']);
  for (const e of endpoints) {
    const names = Object.keys(e.params).filter(n => e.params[n].required);
    if (!names.length) continue;
    const r = await get(e.path);
    assertError(r, 400, 'BAD_REQUEST');
    assert.equal(r.body.error.message, `missing required parameter: ${names[0]}`, e.path);
  }
  const bad = await get('/api/v1/fpt/team-matches?team=nope');
  assert.match(bad.body.error.message, /invalid team$/);
  assert.equal(legacyInventory(createEndpoints(tc)).find(item => item.route === '/healthz').status, 'KEPT');
});

test('input is validated before a connection is taken and only database failures are UNAVAILABLE (review NB-3)', async () => {
  const down = {...deps, withClient: async () => { throw new Error('connection refused'); }};
  const bad = await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/fpt/matches?date=2026-13-45')}, down);
  assertError(bad, 400, 'BAD_REQUEST');
  const pgError = Object.assign(new Error('terminating connection'), {code: '57P01'});
  assertError(await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/tc/live')},
    {...deps, tc: {...tc, live: async () => { throw pgError; }}}), 503, 'UNAVAILABLE');
  assertError(await handleV1({method: 'GET', url: new URL('http://localhost/api/v1/tc/live')},
    {...deps, tc: {...tc, live: async () => { throw new TypeError('cannot read properties of undefined'); }}}), 500, 'INTERNAL');
});
