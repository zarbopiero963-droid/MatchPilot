import crypto from 'node:crypto';

// TotalCorner API client (#20, TC-CORE-01): one shared rate limiter, bounded retries, outcome classification,
// request ledger and lossless raw retention. The token travels only in the outgoing URL and is never stored or logged.

export const TC_BASE_URL = 'https://api.totalcorner.com/v1';
export const TC_SCHEMA_VERSION = 'tc-raw-v1';
export const TC_PARSER_VERSION = 'tc-discovery-v1';

// Observed upstream limit (trial #40, 05/10): "allowed 5 request in 10 seconds". Default stays below it.
export function limiterConfig(env = process.env) {
  const max = Number(env.TOTALCORNER_MAX_REQUESTS_PER_WINDOW || 4);
  const windowMs = Number(env.TOTALCORNER_RATE_WINDOW_MS || 10000);
  return {maxRequests: Math.max(1, Math.min(5, max)), windowMs: Math.max(1000, windowMs)};
}

export function redactSecrets(text) {
  return String(text ?? '').replace(/([?&]token=)[^&\s"']+/gi, '$1[REDACTED]');
}

// Path + sorted query without the token: the stable identity of a request.
export function requestKey(path, params = {}) {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== 'token' && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => [k, String(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const qs = new URLSearchParams(entries).toString();
  return path + (qs ? '?' + qs : '');
}

export function createLimiter({maxRequests, windowMs, now = () => Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms))}) {
  const stamps = [];
  let pausedUntil = 0;
  let chain = Promise.resolve();
  async function wait() {
    for (;;) {
      const t = now();
      if (pausedUntil > t) { await sleep(pausedUntil - t); continue; }
      while (stamps.length && t - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length < maxRequests) { stamps.push(t); return; }
      await sleep(windowMs - (t - stamps[0]) + 5);
    }
  }
  return {
    // Serialised so concurrent callers cannot both take the last slot.
    acquire() { const next = chain.then(wait); chain = next.catch(() => {}); return next; },
    pause(ms) { pausedUntil = Math.max(pausedUntil, now() + ms); },
    get pausedUntil() { return pausedUntil; }
  };
}

const RETRYABLE = new Set(['rate_limited', 'server_error', 'timeout', 'network']);

export function classifyResponse({status = null, text = null, error = null}) {
  if (error) {
    const name = error?.name || '';
    return {outcome: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network', body: null, errorClass: name || 'error'};
  }
  let body = null;
  try { body = JSON.parse(text); } catch { body = undefined; }
  const code = body?.error?.code ? String(body.error.code) : null;
  if (status === 429 || code === 'TOO_MANY_REQUEST') return {outcome: 'rate_limited', body, errorClass: code};
  if (status === 401 || status === 403 || /TOKEN|AUTH|PERMISSION|MEMBER/i.test(code || '')) return {outcome: 'auth', body, errorClass: code};
  if (status === 404) return {outcome: 'not_found', body, errorClass: code};
  if (status === 400) return {outcome: 'bad_request', body, errorClass: code};
  if (status >= 500) return {outcome: 'server_error', body, errorClass: code};
  if (body === undefined) return {outcome: 'malformed', body: null, errorClass: 'invalid_json'};
  if (body?.success === false || body?.error) return {outcome: 'upstream_error', body, errorClass: code};
  const data = body?.data;
  if (data == null || (Array.isArray(data) && data.length === 0)) return {outcome: 'no_data', body, errorClass: null};
  return {outcome: 'ok', body, errorClass: null};
}

function rateHeaders(headers) {
  if (!headers?.get) return null;
  const out = {limit: headers.get('x-rate-limit-limit'), remaining: headers.get('x-rate-limit-remaining'),
    reset: headers.get('x-rate-limit-reset'), retry_after: headers.get('retry-after')};
  return Object.values(out).some(v => v != null) ? out : null;
}

export function createPgStore(withClient) {
  return {
    async insertRaw(row) {
      return withClient(async c => {
        const r = await c.query(
          `INSERT INTO tc_raw_responses(endpoint_family,request_key,url_path,match_id,league_id,phase,provenance,http_status,outcome,
             body_sha256,body_bytes,body,first_acquired_at,last_acquired_at,first_run_id,schema_version,parser_version)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13,$14,$15,$16)
           ON CONFLICT (request_key, body_sha256) DO UPDATE SET last_acquired_at=EXCLUDED.last_acquired_at, seen_count=tc_raw_responses.seen_count+1
           RETURNING raw_id, (xmax = 0) AS inserted`,
          [row.endpoint_family, row.request_key, row.url_path, row.match_id, row.league_id, row.phase, row.provenance, row.http_status,
            row.outcome, row.body_sha256, row.body_bytes, row.body, row.acquired_at, row.run_id, TC_SCHEMA_VERSION, TC_PARSER_VERSION]);
        return r.rows[0];
      });
    },
    async insertLedger(row) {
      await withClient(c => c.query(
        `INSERT INTO tc_request_ledger(recorded_at,run_id,endpoint_family,url_path,match_id,league_id,attempt,outcome,http_status,latency_ms,backoff_ms,rate_limit,raw_id,error_class)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [row.recorded_at, row.run_id, row.endpoint_family, row.url_path, row.match_id, row.league_id, row.attempt, row.outcome,
          row.http_status, row.latency_ms, row.backoff_ms, row.rate_limit ? JSON.stringify(row.rate_limit) : null, row.raw_id, row.error_class]));
    }
  };
}

export function createTcClient({token, fetchImpl = fetch, limiter, store, maxRetries = 2, timeoutMs = 20000,
  baseUrl = TC_BASE_URL, sleep = ms => new Promise(r => setTimeout(r, ms)), random = Math.random}) {
  if (!token) throw new Error('TOTALCORNER_API_TOKEN missing');
  return {
    async get(path, params = {}, ctx = {}) {
      const key = requestKey(path, params);
      let backoff = 0;
      for (let attempt = 1; ; attempt++) {
        await limiter.acquire();
        const url = new URL(baseUrl + path);
        for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
        url.searchParams.set('token', token);
        const started = Date.now();
        const acquiredAt = new Date();
        let status = null, text = null, error = null, headers = null;
        try {
          const res = await fetchImpl(url, {signal: AbortSignal.timeout(timeoutMs), headers: {accept: 'application/json'}});
          status = res.status; headers = res.headers; text = await res.text();
        } catch (e) { error = e; }
        const latency = Date.now() - started;
        const cls = classifyResponse({status, text, error});
        let raw = null;
        if (text != null) {
          const sha = crypto.createHash('sha256').update(text).digest('hex');
          raw = await store.insertRaw({endpoint_family: ctx.endpoint_family, request_key: key, url_path: key, match_id: ctx.match_id ?? null,
            league_id: ctx.league_id ?? null, phase: ctx.phase ?? null, provenance: ctx.provenance || 'DISCOVERY', http_status: status,
            outcome: cls.outcome, body_sha256: sha, body_bytes: Buffer.byteLength(text), body: text, acquired_at: acquiredAt, run_id: ctx.run_id ?? null});
        }
        const rate = rateHeaders(headers);
        const retry = RETRYABLE.has(cls.outcome) && attempt <= maxRetries;
        if (retry) {
          const retryAfter = Number(rate?.retry_after || rate?.reset || 0) * 1000;
          backoff = cls.outcome === 'rate_limited'
            ? Math.max(10000, retryAfter)
            : Math.min(30000, 1000 * 2 ** attempt) + Math.floor(random() * 500);
          if (cls.outcome === 'rate_limited') limiter.pause(backoff);
        } else backoff = 0;
        await store.insertLedger({recorded_at: acquiredAt, run_id: ctx.run_id ?? null, endpoint_family: ctx.endpoint_family, url_path: key,
          match_id: ctx.match_id ?? null, league_id: ctx.league_id ?? null, attempt, outcome: cls.outcome, http_status: status,
          latency_ms: latency, backoff_ms: backoff, rate_limit: rate, raw_id: raw?.raw_id ?? null,
          error_class: cls.errorClass ? redactSecrets(cls.errorClass) : null});
        if (retry) { if (cls.outcome !== 'rate_limited') await sleep(backoff); continue; }
        return {outcome: cls.outcome, status, body: cls.body, raw_id: raw?.raw_id ?? null, acquired_at: acquiredAt, latency_ms: latency, attempts: attempt, request_key: key};
      }
    }
  };
}
