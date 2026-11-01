// MP-AF-01: the API-FOOTBALL client with a fake fetch only. No test reaches the network or spends provider quota.
import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFootballConfig, ApiFootballError, canonicalRequest, createApiFootballClient, createMemoryLedger, ENDPOINTS, paramsHash,
  providerErrors, quotaHeaders } from '../src/providers/apifootball/client.mjs';

const KEY = 'test-key-not-real-0123456789';
const env = (over = {}) => ({APIFOOTBALL_ENABLED: 'true', APIFOOTBALL_KEY: KEY, APIFOOTBALL_REQUESTS_PER_DAY: '50', APIFOOTBALL_REQUESTS_PER_MINUTE: '5', ...over});
const T0 = Date.UTC(2026, 10, 1, 15, 0, 0);

function harness({responses = [], config = apiFootballConfig(env()), start = T0, ...opts} = {}) {
  let clock = start;
  const calls = [];
  const sleeps = [];
  const queue = [...responses];
  const fetchImpl = async (url, init) => {
    calls.push({url, init});
    const next = queue.shift();
    if (!next) throw new Error('unexpected network call');
    if (next.throw) throw next.throw;
    clock += next.latency ?? 10;
    const headers = new Headers(next.headers ?? {});
    return {status: next.status ?? 200, headers, json: async () => { if (next.badJson) throw new SyntaxError('bad'); return next.body ?? {errors: [], results: 0, response: []}; }};
  };
  const ledger = createMemoryLedger();
  const client = createApiFootballClient({config, ledger, fetchImpl, now: () => clock, sleep: async ms => { sleeps.push(ms); clock += ms; }, ...opts});
  return {client, ledger, calls, sleeps, advance: ms => { clock += ms; }};
}
const ok = (body = {}, headers = {}) => ({status: 200, headers, body: {get: 'x', parameters: {}, errors: [], results: 1, paging: {current: 1, total: 1}, response: [{id: 1}], ...body}});
const rejects = (promise, code) => assert.rejects(promise, err => err instanceof ApiFootballError && err.code === code);

test('MP-AF-01 off by default; when on, key and dedicated budgets are explicit, the key is never enumerable', () => {
  assert.deepEqual(apiFootballConfig({}), {enabled: false});
  assert.deepEqual(apiFootballConfig({APIFOOTBALL_ENABLED: '1', APIFOOTBALL_KEY: KEY}), {enabled: false}, 'only the exact text "true" turns it on');
  for (const over of [{APIFOOTBALL_KEY: ''}, {APIFOOTBALL_REQUESTS_PER_DAY: undefined}, {APIFOOTBALL_REQUESTS_PER_MINUTE: '0'},
    {APIFOOTBALL_REQUESTS_PER_DAY: '1e3'}, {APIFOOTBALL_REQUESTS_PER_DAY: '-5'}, {APIFOOTBALL_TIMEOUT_MS: 'fast'}]) {
    assert.throws(() => apiFootballConfig(env(over)), err => err.code === 'NOT_CONFIGURED', JSON.stringify(over));
  }
  const config = apiFootballConfig(env());
  assert.equal(config.apiKey, KEY);
  assert.ok(!JSON.stringify(config).includes(KEY) && !Object.keys(config).includes('apiKey'));
  assert.deepEqual([config.perDay, config.perMinute, config.timeoutMs], [50, 5, 20000]);
});

test('MP-AF-01 a disabled client never calls the network', async () => {
  const h = harness({config: apiFootballConfig({})});
  await rejects(h.client.get('/status', {}, {purpose: 'check'}), 'DISABLED');
  assert.equal(h.calls.length, 0);
  assert.equal(h.ledger.rows.length, 0);
});

test('MP-AF-01 endpoint allowlist and parameter validation happen before any call; the query is canonical', async () => {
  assert.deepEqual(canonicalRequest('/fixtures', {league: 39, date: '2026-11-01', season: undefined}),
    {endpoint: '/fixtures', family: 'fixtures', query: 'date=2026-11-01&league=39', path: '/fixtures?date=2026-11-01&league=39'});
  assert.equal(canonicalRequest('/odds', {fixture: 5, bookmaker: 8}).path, canonicalRequest('/odds', {bookmaker: '8', fixture: '5'}).path);
  assert.equal(canonicalRequest('/fixtures', {timezone: 'Europe/Rome'}).query, 'timezone=Europe%2FRome');
  const h = harness();
  for (const [endpoint, params, code] of [
    ['/players', {}, 'ENDPOINT_NOT_ALLOWED'], ['/fixtures/../status', {}, 'ENDPOINT_NOT_ALLOWED'], ['toString', {}, 'ENDPOINT_NOT_ALLOWED'],
    ['/fixtures', {apikey: 'x'}, 'PARAM_INVALID'], ['/fixtures', {league: '39&live=all'}, 'PARAM_INVALID'], ['/fixtures', {league: -1}, 'PARAM_INVALID'],
    ['/fixtures', {league: 1.5}, 'PARAM_INVALID'], ['/fixtures', {date: ' 2026-11-01'}, 'PARAM_INVALID'], ['/fixtures', {league: ''}, 'PARAM_INVALID'],
    ['/fixtures', {league: 'x'.repeat(81)}, 'PARAM_INVALID'], ['/fixtures', ['league'], 'PARAM_INVALID'], ['/status', {league: 39}, 'PARAM_INVALID']
  ]) await rejects(h.client.get(endpoint, params, {purpose: 'test'}), code);
  await rejects(h.client.get('/status', {}, {}), 'PARAM_INVALID');
  await rejects(h.client.get('/status', {}, {purpose: 'Bad Purpose'}), 'PARAM_INVALID');
  assert.equal(h.calls.length, 0);
  assert.ok(Object.keys(ENDPOINTS).every(e => e.startsWith('/') && !e.includes('?')));
});

test('MP-AF-01 a successful call: key in the header only, a ledger row without the key, quota headers recorded', async () => {
  const h = harness({responses: [ok({results: 2}, {'x-ratelimit-requests-limit': '7500', 'x-ratelimit-requests-remaining': '7400', 'x-ratelimit-limit': '300', 'x-ratelimit-remaining': '299'})]});
  const r = await h.client.get('/fixtures', {league: 39, date: '2026-11-01'}, {purpose: 'prematch'});
  assert.equal(h.calls[0].url, 'https://v3.football.api-sports.io/fixtures?date=2026-11-01&league=39');
  assert.equal(h.calls[0].init.headers['x-apisports-key'], KEY);
  assert.equal(h.calls[0].init.method, 'GET');
  assert.ok(!h.calls[0].url.includes(KEY));
  assert.deepEqual([r.cacheHit, r.status, r.results, r.response, r.paging], [false, 200, 2, [{id: 1}], {current: 1, total: 1}]);
  assert.deepEqual(r.quota, {day_limit: 7500, day_remaining: 7400, minute_limit: 300, minute_remaining: 299});
  assert.equal(h.ledger.rows.length, 1);
  const row = h.ledger.rows[0];
  assert.deepEqual([row.outcome, row.status, row.attempt, row.purpose, row.endpoint, row.family, row.latency_ms], ['ok', 200, 1, 'prematch', '/fixtures', 'fixtures', 10]);
  assert.equal(row.params_hash, paramsHash('/fixtures?date=2026-11-01&league=39'));
  assert.ok(!JSON.stringify(h.ledger.rows).includes(KEY), 'the key never reaches the ledger');
  assert.ok(!JSON.stringify(r).includes(KEY), 'nor the result');
});

test('MP-AF-01 TTL cache by family: reference cached, status and in-play odds never cached', async () => {
  const h = harness({responses: [ok(), ok(), ok(), ok(), ok()]});
  await h.client.get('/leagues', {id: 39}, {purpose: 'catalog'});
  const again = await h.client.get('/leagues', {id: 39}, {purpose: 'catalog'});
  assert.equal(again.cacheHit, true);
  assert.equal(h.calls.length, 1);
  await h.client.get('/odds/live', {fixture: 7}, {purpose: 'live'});
  await h.client.get('/odds/live', {fixture: 7}, {purpose: 'live'});
  assert.equal(h.calls.length, 3, 'in-play prices are always fetched');
  await h.client.get('/status', {}, {purpose: 'check'});
  h.advance(21600 * 1000);
  await h.client.get('/leagues', {id: 39}, {purpose: 'catalog'});
  assert.equal(h.calls.length, 5, 'reference cache expires after its TTL');
});

test('MP-AF-01 the dedicated budget is counted on the local ledger before any network call', async () => {
  const config = apiFootballConfig(env({APIFOOTBALL_REQUESTS_PER_DAY: '3', APIFOOTBALL_REQUESTS_PER_MINUTE: '2'}));
  const h = harness({config, responses: [ok(), ok(), ok(), ok()]});
  await h.client.get('/fixtures', {id: 1}, {purpose: 'p'});
  await h.client.get('/fixtures', {id: 2}, {purpose: 'p'});
  await rejects(h.client.get('/fixtures', {id: 3}, {purpose: 'p'}), 'BUDGET_MINUTE');
  h.advance(61000);
  await h.client.get('/fixtures', {id: 3}, {purpose: 'p'});
  await rejects(h.client.get('/fixtures', {id: 4}, {purpose: 'p'}), 'BUDGET_DAY');
  assert.equal(h.calls.length, 3);
  // A new UTC day gives back the daily budget.
  h.advance(Date.UTC(2026, 10, 2) - (T0 + 61000 + 30));
  await h.client.get('/fixtures', {id: 4}, {purpose: 'p'});
  assert.equal(h.calls.length, 4);
});

test('MP-AF-01 a provider counter at zero pauses calls; it never grants more than the local budget', async () => {
  const h = harness({responses: [ok({}, {'x-ratelimit-requests-remaining': '0'}), ok()]});
  await h.client.get('/fixtures', {id: 1}, {purpose: 'p'});
  await rejects(h.client.get('/fixtures', {id: 2}, {purpose: 'p'}), 'PROVIDER_QUOTA');
  h.advance(Date.UTC(2026, 10, 2) - T0);
  await h.client.get('/fixtures', {id: 2}, {purpose: 'p'});
  const m = harness({responses: [ok({}, {'x-ratelimit-remaining': '0'}), ok()]});
  await m.client.get('/fixtures', {id: 1}, {purpose: 'p'});
  await rejects(m.client.get('/fixtures', {id: 2}, {purpose: 'p'}), 'PROVIDER_QUOTA');
  m.advance(60000);
  await m.client.get('/fixtures', {id: 2}, {purpose: 'p'});
  assert.equal(m.calls.length, 2);
});

test('MP-AF-01 controlled retries: one retry after 5xx, network error or timeout; none after 4xx or provider errors', async () => {
  const a = harness({responses: [{status: 503}, ok()]});
  assert.equal((await a.client.get('/fixtures', {id: 1}, {purpose: 'p'})).status, 200);
  assert.deepEqual(a.ledger.rows.map(r => [r.outcome, r.attempt]), [['http_error', 1], ['ok', 2]]);
  const b = harness({responses: [{status: 500}, {status: 502}]});
  await rejects(b.client.get('/fixtures', {id: 1}, {purpose: 'p'}), 'HTTP_ERROR');
  assert.equal(b.calls.length, 2, 'at most one retry');
  const c = harness({responses: [{throw: new TypeError('fetch failed')}, ok()]});
  await c.client.get('/fixtures', {id: 1}, {purpose: 'p'});
  assert.deepEqual(c.ledger.rows.map(r => r.outcome), ['network_error', 'ok']);
  for (const status of [400, 401, 403, 404, 499]) {
    const d = harness({responses: [{status}, ok()]});
    await rejects(d.client.get('/fixtures', {id: 1}, {purpose: 'p'}), 'HTTP_ERROR');
    assert.equal(d.calls.length, 1, `no retry on ${status}`);
  }
  // HTTP 200 with a non-empty errors field is an error, counted, never retried.
  const e = harness({responses: [ok({errors: {requests: 'You have reached the request limit for the day'}, response: []}), ok()]});
  await assert.rejects(e.client.get('/fixtures', {id: 1}, {purpose: 'p'}), err => err.code === 'PROVIDER_ERROR' && typeof err.provider_errors.requests === 'string');
  assert.equal(e.calls.length, 1);
  assert.deepEqual([e.ledger.rows[0].outcome, e.ledger.rows[0].error], ['provider_error', 'provider errors: requests']);
  const f = harness({responses: [{status: 200, badJson: true}, ok()]});
  await rejects(f.client.get('/fixtures', {id: 1}, {purpose: 'p'}), 'INVALID_RESPONSE');
  assert.equal(f.calls.length, 1);
});

test('MP-AF-01 429: retried once only with a Retry-After within the limit; otherwise calls pause', async () => {
  const a = harness({responses: [{status: 429, headers: {'retry-after': '2'}}, ok()]});
  await a.client.get('/fixtures', {id: 1}, {purpose: 'p'});
  assert.deepEqual(a.sleeps, [2000]);
  assert.deepEqual(a.ledger.rows.map(r => r.outcome), ['rate_limited', 'ok']);
  const b = harness({responses: [{status: 429, headers: {'retry-after': '3600'}}, ok()]});
  await rejects(b.client.get('/fixtures', {id: 1}, {purpose: 'p'}), 'RATE_LIMITED');
  assert.equal(b.calls.length, 1, 'a long Retry-After is not waited');
  await rejects(b.client.get('/fixtures', {id: 2}, {purpose: 'p'}), 'PROVIDER_QUOTA');
  const c = harness({responses: [{status: 429}, ok()]});
  await rejects(c.client.get('/fixtures', {id: 1}, {purpose: 'p'}), 'RATE_LIMITED');
  assert.equal(c.calls.length, 1, 'no Retry-After, no retry');
});

test('MP-AF-01 timeout aborts the request and is counted', async () => {
  const config = apiFootballConfig(env({APIFOOTBALL_TIMEOUT_MS: '5'}));
  let n = 0;
  const ledger = createMemoryLedger();
  const fetchImpl = (url, init) => new Promise((resolve, reject) => {
    n += 1;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  const client = createApiFootballClient({config, ledger, fetchImpl, sleep: async () => {}});
  await rejects(client.get('/fixtures', {id: 1}, {purpose: 'p'}), 'TIMEOUT');
  assert.equal(n, 2, 'one retry after a timeout');
  assert.deepEqual(ledger.rows.map(r => r.outcome), ['timeout', 'timeout']);
});

test('MP-AF-01 requests run one at a time, so concurrent callers cannot overrun the budget', async () => {
  const config = apiFootballConfig(env({APIFOOTBALL_REQUESTS_PER_MINUTE: '2'}));
  const h = harness({config, responses: [ok(), ok(), ok()]});
  const results = await Promise.allSettled([1, 2, 3].map(id => h.client.get('/fixtures', {id}, {purpose: 'p'})));
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'fulfilled', 'rejected']);
  assert.equal(results[2].reason.code, 'BUDGET_MINUTE');
  assert.equal(h.calls.length, 2);
});

test('MP-AF-01 helpers: quota headers and provider errors', () => {
  assert.deepEqual(quotaHeaders(new Headers({'x-ratelimit-requests-remaining': 'abc'})), {day_limit: null, day_remaining: null, minute_limit: null, minute_remaining: null});
  assert.equal(providerErrors({errors: []}), null);
  assert.equal(providerErrors({errors: {}}), null);
  assert.deepEqual(providerErrors({errors: ['x']}), ['x']);
  assert.equal(providerErrors(null), null);
  assert.throws(() => createApiFootballClient({config: {enabled: false}}), /requires a request ledger/);
});
