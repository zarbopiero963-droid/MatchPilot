// MP-AF-01 (#263, MP-OWNER-IMPL-20261101 item 1): a read-only API-FOOTBALL client with a dedicated budget, a local
// request ledger, a TTL cache and controlled retries. Nothing calls it yet: no job, no route, no collector. It is off by
// default and refuses to run without an explicit configuration, so importing it never spends quota.
//
// Facts from the real verification of 2026-11-01 (docs/product/mp-263/api-football-verification-2026-11-01.md):
// - the provider key is shared with other clients, so the provider counters are not a reliable accounting: the budget is
//   counted on the local ledger, and a provider counter at zero only ever stops calls (it never grants more);
// - the provider can answer HTTP 200 with a non-empty `errors` field (plan limits, wrong parameters): that is an error;
// - a broad query (live=all) was refused as too large: /fixtures and /odds need a scope parameter and live=all is refused.
//
// The key is read only from the environment, sent only in the x-apisports-key header and never written to the ledger,
// to errors or to results.
import { createHash } from 'node:crypto';
import { retryAfterMs } from '../futpython/budget.mjs';

export const APIFOOTBALL_BASE_URL = 'https://v3.football.api-sports.io';

// Endpoint allowlist: the read-only endpoints MatchPilot needs, each with the parameters it may send. Anything else is
// refused before any network call.
// scope: at least one of these parameters is required, so no request asks for everything at once.
export const ENDPOINTS = Object.freeze({
  '/status': {family: 'status', params: []},
  '/timezone': {family: 'reference', params: []},
  '/countries': {family: 'reference', params: ['name', 'code', 'search']},
  '/leagues': {family: 'reference', params: ['id', 'name', 'country', 'code', 'season', 'team', 'type', 'current', 'search', 'last']},
  '/leagues/seasons': {family: 'reference', params: []},
  '/teams': {family: 'reference', params: ['id', 'name', 'league', 'season', 'country', 'code', 'venue', 'search']},
  '/fixtures': {family: 'fixtures', params: ['id', 'ids', 'live', 'date', 'league', 'season', 'team', 'last', 'next', 'from', 'to', 'round', 'status', 'venue', 'timezone'],
    scope: ['id', 'ids', 'live', 'date', 'league', 'team']},
  '/fixtures/statistics': {family: 'match', params: ['fixture', 'team', 'type', 'half'], scope: ['fixture']},
  '/fixtures/events': {family: 'match', params: ['fixture', 'team', 'player', 'type'], scope: ['fixture']},
  '/fixtures/lineups': {family: 'match', params: ['fixture', 'team', 'type', 'player'], scope: ['fixture']},
  '/predictions': {family: 'match', params: ['fixture'], scope: ['fixture']},
  '/odds': {family: 'odds', params: ['fixture', 'league', 'season', 'date', 'timezone', 'page', 'bookmaker', 'bet'], scope: ['fixture', 'league', 'date']},
  '/odds/live': {family: 'live', params: ['fixture', 'league', 'bet'], scope: ['fixture', 'league']},
  '/odds/bookmakers': {family: 'reference', params: ['id', 'search']},
  '/odds/bets': {family: 'reference', params: ['id', 'search']},
  '/odds/live/bets': {family: 'reference', params: ['id', 'search']}
});

// Cache time-to-live by endpoint family, in seconds. status and in-play data are never cached: a cached in-play price
// would be presented as current. Reference data change rarely; pre-match odds carry their own provider `update`.
export const DEFAULT_TTL_SECONDS = Object.freeze({status: 0, live: 0, fixtures: 60, match: 60, odds: 300, reference: 21600});

// Outcomes that count against the local budget: every request that reached, or may have reached, the provider.
export const COUNTED = Object.freeze(['ok', 'provider_error', 'http_error', 'rate_limited', 'network_error', 'timeout']);

export class ApiFootballError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ApiFootballError';
    this.code = code;
    Object.assign(this, extra);
  }
}

function strictPositiveInt(raw, name) {
  const text = String(raw ?? '').trim();
  if (!/^[1-9]\d{0,6}$/.test(text)) throw new ApiFootballError('NOT_CONFIGURED', `${name} must be a positive integer`);
  return Number(text);
}

// Configuration from the environment. Off unless APIFOOTBALL_ENABLED is exactly "true". When on, the dedicated daily and
// per-minute budgets must be set explicitly: no default spends a share of the plan the owner did not assign.
export function apiFootballConfig(env = process.env) {
  if (String(env.APIFOOTBALL_ENABLED ?? '').trim() !== 'true') return {enabled: false};
  const key = String(env.APIFOOTBALL_KEY ?? '').trim();
  if (!key) throw new ApiFootballError('NOT_CONFIGURED', 'APIFOOTBALL_KEY is required when APIFOOTBALL_ENABLED=true');
  const config = {
    enabled: true,
    perDay: strictPositiveInt(env.APIFOOTBALL_REQUESTS_PER_DAY, 'APIFOOTBALL_REQUESTS_PER_DAY'),
    perMinute: strictPositiveInt(env.APIFOOTBALL_REQUESTS_PER_MINUTE, 'APIFOOTBALL_REQUESTS_PER_MINUTE'),
    timeoutMs: env.APIFOOTBALL_TIMEOUT_MS ? strictPositiveInt(env.APIFOOTBALL_TIMEOUT_MS, 'APIFOOTBALL_TIMEOUT_MS') : 20000
  };
  // The key is kept out of the enumerable config, so a logged or serialised config never carries it.
  Object.defineProperty(config, 'apiKey', {value: key, enumerable: false});
  return config;
}

// A parameter value is a short plain token: digits, letters, dash, colon, dot, slash, underscore or space (dates, ids,
// "1H", "NS-PST", "Europe/Rome", "Regular Season - 10"). No query syntax, no control characters.
const PARAM_VALUE = /^[A-Za-z0-9][A-Za-z0-9 _:./-]{0,79}$/;

// The canonical query: allowlisted names only, sorted, values as validated text. The same request always has the same
// text, which is the cache key and the ledger's params_hash input.
export function canonicalRequest(endpoint, params = {}) {
  const spec = typeof endpoint === 'string' && Object.hasOwn(ENDPOINTS, endpoint) ? ENDPOINTS[endpoint] : null;
  if (!spec) throw new ApiFootballError('ENDPOINT_NOT_ALLOWED', `endpoint not allowed: ${String(endpoint).slice(0, 80)}`);
  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new ApiFootballError('PARAM_INVALID', 'params must be an object');
  const entries = [];
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (!spec.params.includes(name)) throw new ApiFootballError('PARAM_INVALID', `parameter ${String(name).slice(0, 40)} not allowed for ${endpoint}`);
    const text = typeof value === 'number' && Number.isInteger(value) && value >= 0 ? String(value) : typeof value === 'string' ? value : null;
    if (text === null || !PARAM_VALUE.test(text) || text !== text.trim()) throw new ApiFootballError('PARAM_INVALID', `parameter ${name} has an invalid value`);
    // live=all asks for every match in play at once: refused as too large (2026-11-01). Live ids are "id" or "id-id".
    if (name === 'live' && !/^\d{1,6}(?:-\d{1,6}){0,19}$/.test(text)) throw new ApiFootballError('PARAM_INVALID', 'live takes league ids, never all');
    entries.push([name, text]);
  }
  if (spec.scope && !entries.some(([name]) => spec.scope.includes(name))) {
    throw new ApiFootballError('PARAM_INVALID', `${endpoint} needs one of ${spec.scope.join(', ')}`);
  }
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(entries).toString();
  return {endpoint, family: spec.family, query, path: query ? `${endpoint}?${query}` : endpoint};
}

export const paramsHash = path => createHash('sha256').update(path).digest('hex');

const header = (headers, name) => {
  const value = headers && typeof headers.get === 'function' ? headers.get(name) : null;
  return value === null || value === undefined || String(value).trim() === '' ? null : String(value).trim();
};
const intOrNull = value => (value !== null && /^\d{1,9}$/.test(value) ? Number(value) : null);

// The provider's own counters, as reported (shared with other clients: a signal, not an accounting).
export function quotaHeaders(headers) {
  return {
    day_limit: intOrNull(header(headers, 'x-ratelimit-requests-limit')),
    day_remaining: intOrNull(header(headers, 'x-ratelimit-requests-remaining')),
    minute_limit: intOrNull(header(headers, 'x-ratelimit-limit')),
    minute_remaining: intOrNull(header(headers, 'x-ratelimit-remaining'))
  };
}

// A non-empty provider `errors` field: an object with keys or a non-empty list.
export function providerErrors(body) {
  const errors = body && typeof body === 'object' ? body.errors : null;
  if (Array.isArray(errors)) return errors.length ? errors : null;
  if (errors && typeof errors === 'object') return Object.keys(errors).length ? errors : null;
  return null;
}

// The local request ledger, in memory. A PostgreSQL ledger with the same two methods comes with its migration.
export function createMemoryLedger() {
  const rows = [];
  return {
    rows,
    async insert(row) { rows.push({...row}); },
    async countSince(sinceMs) { return rows.filter(row => row.at_ms >= sinceMs && COUNTED.includes(row.outcome)).length; }
  };
}

const utcDayStart = ms => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };

// createApiFootballClient({config, ledger, fetchImpl, now, sleep, ttlSeconds, maxRetryWaitMs})
// get(endpoint, params, {purpose}) -> {endpoint, path, family, cacheHit, fetched_at, status, quota, results, paging, response}
export function createApiFootballClient({
  config = apiFootballConfig(),
  ledger,
  fetchImpl = (url, init) => fetch(url, init),
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  ttlSeconds = DEFAULT_TTL_SECONDS,
  maxRetryWaitMs = 60000,
  baseUrl = APIFOOTBALL_BASE_URL
} = {}) {
  if (!ledger || typeof ledger.insert !== 'function' || typeof ledger.countSince !== 'function') throw new Error('API-FOOTBALL client requires a request ledger');
  // A hand-built config is checked like the environment one: an enabled client without a key or budgets fails closed.
  const posInt = v => Number.isInteger(v) && v > 0;
  if (config?.enabled === true && !(typeof config.apiKey === 'string' && config.apiKey.trim() && posInt(config.perDay) && posInt(config.perMinute) && posInt(config.timeoutMs))) {
    throw new ApiFootballError('NOT_CONFIGURED', 'an enabled client needs apiKey, perDay, perMinute and timeoutMs');
  }
  const cache = new Map();
  const MAX_CACHE = 500;
  let ledgerFailed = false; // a request that may have reached the provider but has no ledger row: stop, never undercount
  let blockedUntil = 0; // set when the provider itself reports a counter at zero or answers 429
  let chain = Promise.resolve(); // concurrency 1: budget check, call and ledger row happen one request at a time

  async function admit() {
    const t = now();
    if (ledgerFailed) throw new ApiFootballError('LEDGER_UNAVAILABLE', 'a request could not be recorded; calls stopped');
    if (t < blockedUntil) throw new ApiFootballError('PROVIDER_QUOTA', 'provider reported its quota exhausted; calls paused', {retry_at: new Date(blockedUntil).toISOString()});
    if (await ledger.countSince(utcDayStart(t)) >= config.perDay) throw new ApiFootballError('BUDGET_DAY', 'dedicated daily budget used');
    if (await ledger.countSince(t - 60000) >= config.perMinute) throw new ApiFootballError('BUDGET_MINUTE', 'dedicated per-minute budget used');
  }

  async function attempt(req, purpose, n) {
    await admit();
    const started = now();
    const row = {at_ms: started, at: new Date(started).toISOString(), endpoint: req.endpoint, family: req.family, path: req.path,
      params_hash: paramsHash(req.path), purpose, attempt: n, outcome: null, status: null, latency_ms: null, quota: null, error: null};
    const record = async entry => {
      try { await ledger.insert(entry); } catch { ledgerFailed = true; throw new ApiFootballError('LEDGER_UNAVAILABLE', 'a request could not be recorded; calls stopped'); }
    };
    // The timeout covers the whole exchange, body included: a stalled body is aborted, never left hanging the queue.
    const controller = new AbortController();
    let timedOut = false;
    let timer;
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(new Error('timeout')); }, config.timeoutMs); });
    const withDeadline = promise => Promise.race([promise, deadline]);
    deadline.catch(() => {});
    let res;
    try {
      // redirect: 'error': a redirect would carry the key header to another origin and make an unrecorded request.
      res = await withDeadline(fetchImpl(`${baseUrl}${req.path}`, {method: 'GET', redirect: 'error', headers: {'x-apisports-key': config.apiKey, accept: 'application/json'}, signal: controller.signal}));
    } catch {
      clearTimeout(timer);
      await record({...row, outcome: timedOut ? 'timeout' : 'network_error', latency_ms: now() - started, error: timedOut ? 'timeout' : 'network error'});
      return {retry: true, error: new ApiFootballError(timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'request timed out' : 'network error')};
    }
    const quota = quotaHeaders(res.headers);
    const t = now();
    if (quota.day_remaining === 0) blockedUntil = Math.max(blockedUntil, utcDayStart(t) + 86400000);
    if (quota.minute_remaining === 0) blockedUntil = Math.max(blockedUntil, t + 60000);
    const base = {...row, status: res.status, latency_ms: t - started, quota};
    if (res.status === 429) {
      clearTimeout(timer);
      const wait = retryAfterMs(header(res.headers, 'retry-after'), t);
      blockedUntil = Math.max(blockedUntil, t + (wait ?? 60000));
      await record({...base, outcome: 'rate_limited', error: 'HTTP 429'});
      return {retry: wait !== null && wait <= maxRetryWaitMs, waitMs: wait, error: new ApiFootballError('RATE_LIMITED', 'HTTP 429', {status: 429})};
    }
    if (res.status < 200 || res.status > 299) {
      clearTimeout(timer);
      await record({...base, outcome: 'http_error', error: `HTTP ${res.status}`});
      return {retry: res.status >= 500, error: new ApiFootballError('HTTP_ERROR', `HTTP ${res.status}`, {status: res.status})};
    }
    let body;
    try { body = await withDeadline(res.json()); } catch {
      clearTimeout(timer);
      if (timedOut) {
        await record({...base, outcome: 'timeout', latency_ms: now() - started, error: 'timeout reading the body'});
        return {retry: true, error: new ApiFootballError('TIMEOUT', 'request timed out')};
      }
      await record({...base, outcome: 'http_error', error: 'invalid JSON'});
      return {retry: false, error: new ApiFootballError('INVALID_RESPONSE', 'response is not JSON', {status: res.status})};
    }
    clearTimeout(timer);
    const errors = providerErrors(body);
    if (errors) {
      // Error names only, in the ledger and in the error: the provider's own text never leaves the client.
      const names = Array.isArray(errors) ? errors.map((_, i) => String(i)) : Object.keys(errors).map(k => k.slice(0, 40));
      await record({...base, outcome: 'provider_error', error: `provider errors: ${names.join(',')}`});
      return {retry: false, error: new ApiFootballError('PROVIDER_ERROR', 'the provider answered with errors', {status: res.status, provider_error_names: names})};
    }
    await record({...base, outcome: 'ok'});
    return {result: {endpoint: req.endpoint, path: req.path, family: req.family, cacheHit: false, fetched_at: new Date(t).toISOString(), status: res.status, quota,
      results: Number.isInteger(body?.results) ? body.results : null, paging: body?.paging ?? null, response: body?.response ?? null}};
  }

  async function run(req, purpose) {
    // At most one retry: once after a 5xx, a network error or a timeout; after a 429 only with a Retry-After within the
    // limit. A 4xx or a provider `errors` answer is never retried.
    let out = await attempt(req, purpose, 1);
    if (out.result) return out.result;
    if (!out.retry) throw out.error;
    // A small margin past Retry-After, so a timer firing early does not meet the pause set by the 429 itself.
    await sleep(out.waitMs === undefined || out.waitMs === null ? 1000 : out.waitMs + 250);
    out = await attempt(req, purpose, 2);
    if (out.result) return out.result;
    throw out.error;
  }

  return {
    async get(endpoint, params = {}, {purpose} = {}) {
      if (!config.enabled) throw new ApiFootballError('DISABLED', 'API-FOOTBALL client is disabled (APIFOOTBALL_ENABLED is not true)');
      if (typeof purpose !== 'string' || !/^[a-z][a-z0-9_-]{0,39}$/.test(purpose)) throw new ApiFootballError('PARAM_INVALID', 'purpose is a lowercase slug');
      const req = canonicalRequest(endpoint, params);
      const ttl = (ttlSeconds[req.family] ?? 0) * 1000;
      const cached = () => {
        const hit = ttl > 0 ? cache.get(req.path) : null;
        return hit && now() - hit.at < ttl ? {...structuredClone(hit.result), cacheHit: true} : null;
      };
      const early = cached();
      if (early) return early;
      // The cache is checked again inside the queue: identical concurrent requests cost one call, not one each.
      const task = chain.then(async () => {
        const hit = cached();
        if (hit) return hit;
        const result = await run(req, purpose);
        if (ttl > 0) {
          for (const [path, entry] of cache) if (now() - entry.at >= (ttlSeconds[entry.family] ?? 0) * 1000) cache.delete(path);
          while (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
          cache.set(req.path, {at: now(), family: req.family, result: structuredClone(result)});
        }
        return result;
      });
      chain = task.catch(() => {});
      return task;
    }
  };
}
