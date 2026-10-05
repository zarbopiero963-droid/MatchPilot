const COUNTED = ['upstream', '429', 'error'];

function positiveInt(value, fallback, name) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new Error(`invalid ${name}`);
  return n;
}

export function budgetConfig(env = process.env) {
  return {
    perMinute: positiveInt(env.FUTPYTHON_REQUESTS_PER_MINUTE, 20, 'FUTPYTHON_REQUESTS_PER_MINUTE'),
    perDay: positiveInt(env.FUTPYTHON_REQUESTS_PER_DAY, 2000, 'FUTPYTHON_REQUESTS_PER_DAY'),
    backfillPerMinute: positiveInt(env.FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE, 8, 'FUTPYTHON_BACKFILL_REQUESTS_PER_MINUTE'),
    maxAttempts: positiveInt(env.FUTPYTHON_MAX_ATTEMPTS, 4, 'FUTPYTHON_MAX_ATTEMPTS'),
    backoffBaseMs: positiveInt(env.FUTPYTHON_BACKOFF_BASE_MS, 500, 'FUTPYTHON_BACKOFF_BASE_MS'),
    backoffCapMs: positiveInt(env.FUTPYTHON_BACKOFF_CAP_MS, 30000, 'FUTPYTHON_BACKOFF_CAP_MS'),
    circuitFailures: positiveInt(env.FUTPYTHON_CIRCUIT_FAILURES, 5, 'FUTPYTHON_CIRCUIT_FAILURES'),
    circuitOpenMs: positiveInt(env.FUTPYTHON_CIRCUIT_OPEN_MS, 60000, 'FUTPYTHON_CIRCUIT_OPEN_MS')
  };
}

export function safeProviderPath(input) {
  const url = new URL(String(input), 'https://provider.invalid');
  for (const name of [...url.searchParams.keys()]) {
    if (/api[_-]?key|token|secret|password/i.test(name)) url.searchParams.delete(name);
  }
  const query = url.searchParams.toString();
  return url.pathname + (query ? `?${query}` : '');
}

export function retryAfterMs(header, nowMs) {
  if (header == null || header === '') return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0 && String(header).trim() !== '') return Math.round(seconds * 1000);
  const when = Date.parse(String(header));
  if (Number.isFinite(when)) return Math.max(0, when - nowMs);
  return null;
}

export function endpointFamily(path) {
  const p = String(path || '');
  if (p.startsWith('/api/download/')) return 'dataset';
  if (p.startsWith('/api/jogos-do-dia')) return 'today';
  if (p.startsWith('/api-docs')) return 'catalog';
  return 'other';
}

function headerValue(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  return headers[name] ?? null;
}

export function providerQuotaRemaining(headers) {
  for (const name of ['x-ratelimit-remaining', 'ratelimit-remaining']) {
    const raw = headerValue(headers, name);
    if (raw == null || String(raw).trim() === '') continue;
    const n = Number(String(raw).trim());
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

export function exponentialBackoffMs(attempt, config, rand = Math.random) {
  const exp = Math.min(config.backoffCapMs, config.backoffBaseMs * (2 ** Math.max(0, attempt - 1)));
  const jitter = Math.floor(rand() * Math.min(250, exp));
  return Math.min(config.backoffCapMs, exp + jitter);
}

export function shouldYieldToCritical({depth = 0, updatedAt = null, now = Date.now(), staleMs = 120000} = {}) {
  if (!depth) return false;
  const stamp = updatedAt ? new Date(updatedAt).getTime() : 0;
  if (!Number.isFinite(stamp)) return false;
  return now - stamp < staleMs;
}

export function countsTowardCircuit(row = {}) {
  if (row.outcome === '429') return true;
  if (row.outcome === 'error' && (row.http_status == null || Number(row.http_status) >= 500)) return true;
  return false;
}

export function budgetPressure(usage = {}, thresholds = {}) {
  const warning = Number(thresholds.warning ?? 0.7);
  const critical = Number(thresholds.critical ?? 0.9);
  const ratios = [];
  if (usage.dayLimit > 0) ratios.push(Number(usage.dayUsed || 0) / usage.dayLimit);
  if (usage.minuteLimit > 0) ratios.push(Number(usage.minuteUsed || 0) / usage.minuteLimit);
  const ratio = ratios.length ? Math.max(...ratios) : 0;
  if (ratio >= critical) return 'critical';
  if (ratio >= warning) return 'warning';
  return 'ok';
}

export function createMemoryLedger() {
  const rows = [];
  return {
    rows,
    async insert(row) {
      rows.push({...row, recorded_at: row.recorded_at || new Date()});
    },
    async countSince(sinceMs, outcomes) {
      return rows.filter(row => {
        const at = new Date(row.recorded_at).getTime();
        return at >= sinceMs && outcomes.includes(row.outcome);
      }).length;
    },
    async hasUpstreamSuccess(runId, datasetKey) {
      return rows.some(row => row.run_id === runId && row.dataset_key === datasetKey && row.outcome === 'upstream');
    },
    async recent(limit) {
      return [...rows].reverse().slice(0, limit);
    }
  };
}

function httpError(status, providerPath) {
  const error = new Error(`FutPython HTTP ${status}`);
  error.status = status;
  error.providerPath = providerPath;
  return error;
}

export function createRequestBudget({
  ledger,
  fetchImpl,
  config = budgetConfig(),
  baseUrl = 'https://futpythontrader.com.br',
  now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  random = Math.random,
  apiKey = () => process.env.FUTPYTHON_API_KEY?.trim()
} = {}) {
  if (!ledger) throw new Error('request budget requires a ledger');
  if (!fetchImpl) throw new Error('request budget requires a fetch implementation');
  const inflight = new Map();
  const gate = {critical: 0, waiters: []};
  let consecutiveFailures = 0;
  let openUntil = 0;
  let circuitReady = false;

  function wake() {
    const pending = gate.waiters.splice(0);
    for (const resolve of pending) resolve();
  }

  async function usage(priority) {
    const t = now();
    const minuteLimit = priority === 'backfill'
      ? Math.min(config.perMinute, config.backfillPerMinute)
      : config.perMinute;
    const minuteUsed = await ledger.countSince(t - 60000, COUNTED);
    const dayUsed = await ledger.countSince(t - 86400000, COUNTED);
    return {minuteUsed, dayUsed, minuteLimit, dayLimit: config.perDay};
  }

  function budgetFields(u) {
    if (!u) return {};
    return {
      budget_state: budgetPressure(u),
      budget_remaining_day: Math.max(0, u.dayLimit - u.dayUsed),
      budget_remaining_minute: Math.max(0, u.minuteLimit - u.minuteUsed)
    };
  }

  async function insertLedger(row) {
    const safe = safeProviderPath(row.url_path);
    if (safe.toLowerCase().includes('api_key=')) throw new Error('refusing to ledger a provider path with an api key');
    const u = row.usage || await usage(row.priority || 'critical');
    await ledger.insert({
      ...budgetFields(u),
      provider: 'futpythontrader',
      endpoint_family: endpointFamily(safe),
      latency_ms: row.latency_ms ?? null,
      deduped: row.outcome === 'deduped',
      provider_quota_remaining: row.provider_quota_remaining ?? null,
      recorded_at: new Date(now()),
      dataset_key: row.dataset_key || null,
      url_path: safe,
      outcome: row.outcome,
      attempt: row.attempt,
      backoff_ms: row.backoff_ms || 0,
      http_status: row.http_status ?? null,
      run_id: row.run_id || null,
      priority: row.priority || null
    });
  }

  async function cacheAllowsSkip(opts, safe) {
    if (opts.cacheLookup) return opts.cacheLookup({datasetKey: opts.datasetKey || null, path: safe});
    if (opts.runId && opts.datasetKey) return ledger.hasUpstreamSuccess(opts.runId, opts.datasetKey);
    return false;
  }

  async function ensureCircuit() {
    if (circuitReady) return;
    circuitReady = true;
    const rows = await ledger.recent(config.circuitFailures);
    if (rows.length >= config.circuitFailures && rows.every(countsTowardCircuit)) {
      openUntil = now() + config.circuitOpenMs;
      consecutiveFailures = rows.length;
    }
  }

  async function waitTurn(priority) {
    while (priority === 'backfill' && gate.critical > 0) {
      await new Promise(resolve => gate.waiters.push(resolve));
    }
  }

  async function takeSlot(priority) {
    const limit = priority === 'backfill'
      ? Math.min(config.perMinute, config.backfillPerMinute)
      : config.perMinute;
    for (;;) {
      await waitTurn(priority);
      const t = now();
      const minuteUsed = await ledger.countSince(t - 60000, COUNTED);
      const dayUsed = await ledger.countSince(t - 86400000, COUNTED);
      if (dayUsed >= config.perDay) {
        const error = new Error('FutPython daily budget exhausted');
        error.code = 'BUDGET_EXHAUSTED';
        throw error;
      }
      if (minuteUsed < limit) {
        return {minuteUsed: minuteUsed + 1, dayUsed: dayUsed + 1, minuteLimit: limit, dayLimit: config.perDay};
      }
      const wait = Math.max(25, Math.min(1000, 60000 / limit));
      await sleep(wait);
    }
  }

  async function fetchWithRetry(opts, safe) {
    await ensureCircuit();
    const priority = opts.priority || 'critical';
    const authenticate = opts.authenticate !== false;
    let key;
    if (authenticate) {
      key = apiKey();
      if (!key) throw new Error('FUTPYTHON_API_KEY missing');
    }
    const url = new URL(opts.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    if (authenticate) url.searchParams.set('api_key', key);

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      const t = now();
      if (t < openUntil) {
        await insertLedger({
          dataset_key: opts.datasetKey, url_path: safe, outcome: 'error', attempt: 0,
          backoff_ms: openUntil - t, http_status: null, run_id: opts.runId, priority
        });
        const error = new Error('FutPython circuit open');
        error.code = 'CIRCUIT_OPEN';
        error.providerPath = safe;
        throw error;
      }

      const slot = await takeSlot(priority);
      const started = now();
      let response;
      try {
        response = await fetchImpl(url, {
          headers: {'user-agent': 'MatchPilot/0.1 futpython-sync'},
          signal: opts.signal || AbortSignal.timeout(opts.timeoutMs || 45000)
        });
      } catch (cause) {
        if (cause?.code === 'BUDGET_EXHAUSTED' || cause?.code === 'CIRCUIT_OPEN') throw cause;
        const backoff = exponentialBackoffMs(attempt, config, random);
        await insertLedger({
          dataset_key: opts.datasetKey, url_path: safe, outcome: 'error', attempt,
          backoff_ms: backoff, http_status: null, run_id: opts.runId, priority,
          usage: slot, latency_ms: Math.max(0, now() - started)
        });
        consecutiveFailures++;
        if (consecutiveFailures >= config.circuitFailures) openUntil = now() + config.circuitOpenMs;
        if (attempt >= config.maxAttempts) {
          const error = new Error('FutPython network error');
          error.providerPath = safe;
          error.cause = cause;
          throw error;
        }
        await sleep(backoff);
        continue;
      }

      if (response.status === 429) {
        const header = typeof response.headers?.get === 'function' ? response.headers.get('retry-after') : response.headers?.['retry-after'];
        const backoff = retryAfterMs(header, now()) ?? exponentialBackoffMs(attempt, config, random);
        await insertLedger({
          dataset_key: opts.datasetKey, url_path: safe, outcome: '429', attempt,
          backoff_ms: backoff, http_status: 429, run_id: opts.runId, priority,
          usage: slot, latency_ms: Math.max(0, now() - started),
          provider_quota_remaining: providerQuotaRemaining(response.headers)
        });
        consecutiveFailures++;
        if (consecutiveFailures >= config.circuitFailures) openUntil = now() + config.circuitOpenMs;
        if (attempt >= config.maxAttempts) throw httpError(429, safe);
        await sleep(backoff);
        continue;
      }

      if (!response.ok) {
        const retryable = response.status >= 500;
        const backoff = retryable ? exponentialBackoffMs(attempt, config, random) : 0;
        await insertLedger({
          dataset_key: opts.datasetKey, url_path: safe, outcome: 'error', attempt,
          backoff_ms: backoff, http_status: response.status, run_id: opts.runId, priority,
          usage: slot, latency_ms: Math.max(0, now() - started),
          provider_quota_remaining: providerQuotaRemaining(response.headers)
        });
        if (retryable) {
          consecutiveFailures++;
          if (consecutiveFailures >= config.circuitFailures) openUntil = now() + config.circuitOpenMs;
          if (attempt < config.maxAttempts) {
            await sleep(backoff);
            continue;
          }
        }
        throw httpError(response.status, safe);
      }

      const text = await response.text();
      await insertLedger({
        dataset_key: opts.datasetKey, url_path: safe, outcome: 'upstream', attempt,
        backoff_ms: 0, http_status: response.status, run_id: opts.runId, priority,
        usage: slot, latency_ms: Math.max(0, now() - started),
        provider_quota_remaining: providerQuotaRemaining(response.headers)
      });
      consecutiveFailures = 0;
      openUntil = 0;
      return {cacheHit: false, text, providerPath: safe, attempt};
    }
    throw httpError(429, safe);
  }

  return {
    async requestText(opts) {
      const safe = safeProviderPath(opts.path);
      if (await cacheAllowsSkip(opts, safe)) {
        await insertLedger({
          dataset_key: opts.datasetKey, url_path: safe, outcome: 'cache_hit', attempt: 0,
          backoff_ms: 0, http_status: null, run_id: opts.runId, priority: opts.priority || 'critical'
        });
        return {cacheHit: true, text: '', providerPath: safe};
      }
      const existing = inflight.get(safe);
      if (existing) {
        await insertLedger({
          dataset_key: opts.datasetKey, url_path: safe, outcome: 'deduped', attempt: 0,
          backoff_ms: 0, http_status: null, run_id: opts.runId, priority: opts.priority || 'critical'
        });
        return existing;
      }
      const pending = fetchWithRetry(opts, safe).finally(() => inflight.delete(safe));
      inflight.set(safe, pending);
      return pending;
    },
    async holdCritical(fn) {
      gate.critical++;
      try {
        return await fn();
      } finally {
        gate.critical = Math.max(0, gate.critical - 1);
        wake();
      }
    },
    config
  };
}
