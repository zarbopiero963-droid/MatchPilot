import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import {
  createMemoryLedger, createRequestBudget, safeProviderPath, retryAfterMs,
  shouldYieldToCritical, budgetConfig
} from '../src/providers/futpython/budget.mjs';
import { parseResumeDrillKeys, backfillResumeDecision } from '../src/jobs/futpython-sync.mjs';

function listen(handler) {
  const server = http.createServer(handler);
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('safe provider paths never keep an api key', () => {
  const safe = safeProviderPath('/api/download/a/b/2024?format=csv&api_key=not-a-real-secret&date=2024-01-01');
  assert.equal(safe, '/api/download/a/b/2024?format=csv&date=2024-01-01');
  assert.equal(safe.includes('api_key='), false);
  assert.equal(retryAfterMs('1', 0), 1000);
  assert.equal(shouldYieldToCritical({depth: 1, updatedAt: new Date(), now: Date.now()}), true);
  assert.equal(shouldYieldToCritical({depth: 1, updatedAt: new Date(Date.now() - 300000), now: Date.now()}), false);
  assert.equal(shouldYieldToCritical({depth: 0, updatedAt: new Date(), now: Date.now()}), false);
});

test('resume drill keys are explicit and capped', () => {
  assert.deepEqual(parseResumeDrillKeys(['node', 'sync'], {}), []);
  assert.deepEqual(
    parseResumeDrillKeys(['node', 'sync', '--resume-drill-requeue=alpha/league/2024,beta/cup/2020-2021'], {}),
    ['alpha/league/2024', 'beta/cup/2020-2021']
  );
  assert.throws(() => parseResumeDrillKeys(['node', 'sync', '--resume-drill-requeue=not a key'], {}), /catalog key/);
  assert.throws(() => parseResumeDrillKeys(
    ['node', 'sync', '--resume-drill-requeue=a/b/2020,a/b/2021,a/b/2022,a/b/2023,a/b/2024,a/b/2025'],
    {}
  ), /at most 5/);
  assert.deepEqual(backfillResumeDecision({availability: 'unknown', last_snapshot_id: 4, ingest_complete: false}), {
    skip: false, reconcileToAvailable: false
  });
  assert.equal(backfillResumeDecision({availability: 'available', last_snapshot_id: 4, ingest_complete: false}).skip, false);
  assert.equal(budgetConfig({}).perMinute, 20);
  assert.equal(budgetConfig({}).backfillPerMinute, 8);
});

test('cache hit performs zero upstream requests', async () => {
  let hits = 0;
  const server = await listen((req, res) => { hits++; res.end('nope'); });
  try {
    const ledger = createMemoryLedger();
    const budget = createRequestBudget({
      ledger,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      fetchImpl: (url, init) => fetch(url, init),
      apiKey: () => 'drill-test-key',
      config: {...budgetConfig({}), maxAttempts: 2}
    });
    const result = await budget.requestText({
      path: '/api/download/alpha/league/2024',
      datasetKey: 'alpha/league/2024',
      cacheLookup: async () => true
    });
    assert.equal(result.cacheHit, true);
    assert.equal(hits, 0);
    assert.equal(ledger.rows.filter(row => row.outcome === 'upstream').length, 0);
    assert.equal(ledger.rows[0].outcome, 'cache_hit');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('two identical concurrent requests share one upstream call', async () => {
  let hits = 0;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const server = await listen(async (req, res) => {
    hits++;
    await gate;
    res.end('Date,Home,Away\n2024-01-01,A,B\n');
  });
  try {
    const ledger = createMemoryLedger();
    const budget = createRequestBudget({
      ledger,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      fetchImpl: (url, init) => fetch(url, init),
      apiKey: () => 'drill-test-key',
      config: {...budgetConfig({}), maxAttempts: 2}
    });
    const opts = {path: '/api/download/alpha/league/2024', datasetKey: 'alpha/league/2024', cacheLookup: async () => false};
    const pending = Promise.all([budget.requestText(opts), budget.requestText(opts)]);
    const started = Date.now();
    while (hits < 1 && Date.now() - started < 2000) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(hits, 1);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(hits, 1);
    release();
    const [a, b] = await pending;
    assert.equal(a.text, b.text);
    assert.equal(hits, 1);
    assert.equal(ledger.rows.filter(row => row.outcome === 'upstream').length, 1);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('restart does not repeat a ledgered success that is already stored', async () => {
  let hits = 0;
  const server = await listen((req, res) => {
    hits++;
    res.end('Date,Home,Away\n2024-01-01,A,B\n');
  });
  try {
    const ledger = createMemoryLedger();
    const common = {
      ledger,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      fetchImpl: (url, init) => fetch(url, init),
      apiKey: () => 'drill-test-key',
      config: {...budgetConfig({}), maxAttempts: 2, perMinute: 30, perDay: 100, backfillPerMinute: 30}
    };
    const first = createRequestBudget(common);
    await first.requestText({
      path: '/api/download/alpha/league/2024',
      datasetKey: 'alpha/league/2024',
      runId: 'run-1',
      cacheLookup: async () => false
    });
    const restarted = createRequestBudget(common);
    const again = await restarted.requestText({
      path: '/api/download/alpha/league/2024',
      datasetKey: 'alpha/league/2024',
      runId: 'run-1',
      cacheLookup: async () => true
    });
    assert.equal(again.cacheHit, true);
    assert.equal(hits, 1);
    const missing = await restarted.requestText({
      path: '/api/download/alpha/league/2024',
      datasetKey: 'alpha/league/2024',
      runId: 'run-1',
      cacheLookup: async () => false
    });
    assert.equal(missing.cacheHit, false);
    assert.equal(hits, 2);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('429 waits for Retry-After and the ledger matches attempts', async () => {
  let hits = 0;
  const server = await listen((req, res) => {
    hits++;
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    assert.equal(path.includes('api_key'), false);
    if (hits === 1) {
      res.writeHead(429, {'retry-after': '1'});
      res.end('slow down');
      return;
    }
    res.end('Date,Home,Away\n2024-01-01,A,B\n');
  });
  try {
    const ledger = createMemoryLedger();
    const budget = createRequestBudget({
      ledger,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      fetchImpl: (url, init) => fetch(url, init),
      apiKey: () => 'drill-test-key',
      config: {...budgetConfig({}), maxAttempts: 3, perMinute: 30, perDay: 100, backfillPerMinute: 30, circuitFailures: 10}
    });
    const started = Date.now();
    const result = await budget.requestText({
      path: '/api/download/alpha/league/2024?format=csv',
      datasetKey: 'alpha/league/2024'
    });
    const elapsed = Date.now() - started;
    assert.equal(result.cacheHit, false);
    assert.ok(elapsed >= 900, `expected Retry-After wait, elapsed ${elapsed}`);
    assert.equal(hits, 2);
    const attempts = ledger.rows.filter(row => row.outcome === '429' || row.outcome === 'upstream' || row.outcome === 'error');
    assert.equal(attempts.length, hits);
    assert.equal(attempts[0].outcome, '429');
    assert.equal(attempts[0].attempt, 1);
    assert.equal(attempts[0].backoff_ms, 1000);
    assert.equal(attempts[1].outcome, 'upstream');
    assert.equal(attempts[1].attempt, 2);
    const dumped = JSON.stringify(ledger.rows);
    if (dumped.toLowerCase().includes('api_key=')) throw new Error('ledger stored an api key parameter');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('repeated upstream failures open the circuit and stop the burst', async () => {
  let hits = 0;
  const server = await listen((req, res) => {
    hits++;
    res.writeHead(503);
    res.end('down');
  });
  try {
    const ledger = createMemoryLedger();
    const budget = createRequestBudget({
      ledger,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      fetchImpl: (url, init) => fetch(url, init),
      apiKey: () => 'drill-test-key',
      config: {...budgetConfig({}), maxAttempts: 1, circuitFailures: 2, circuitOpenMs: 60000, perMinute: 30, perDay: 100}
    });
    await assert.rejects(budget.requestText({path: '/api/a', datasetKey: 'a/b/2024'}), /HTTP 503/);
    await assert.rejects(budget.requestText({path: '/api/b', datasetKey: 'a/c/2024'}), /HTTP 503/);
    await assert.rejects(budget.requestText({path: '/api/c', datasetKey: 'a/d/2024'}), /circuit open/);
    assert.equal(hits, 2);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('historical backfill waits while critical work holds the provider', async () => {
  let hits = 0;
  const server = await listen((req, res) => {
    hits++;
    res.end('ok');
  });
  try {
    const budget = createRequestBudget({
      ledger: createMemoryLedger(),
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      fetchImpl: (url, init) => fetch(url, init),
      apiKey: () => 'drill-test-key',
      config: {...budgetConfig({}), maxAttempts: 1, perMinute: 30, perDay: 100, backfillPerMinute: 30}
    });
    let pending;
    await budget.holdCritical(async () => {
      pending = budget.requestText({
        path: '/api/download/alpha/league/2024',
        datasetKey: 'alpha/league/2024',
        priority: 'backfill',
        authenticate: false
      });
      await new Promise(resolve => setTimeout(resolve, 40));
      assert.equal(hits, 0);
    });
    await pending;
    assert.equal(hits, 1);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
