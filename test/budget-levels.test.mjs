import test from 'node:test';
import assert from 'node:assert/strict';
import {
  admits, budgetLevel, dayLevel, purposeOf, createMemoryLedger, createRequestBudget, BUDGET_LEVELS, REQUEST_PURPOSES,
  LEDGER_OUTCOMES
} from '../src/providers/futpython/budget.mjs';

test('budget levels follow #31 and admission is a strict priority ladder', () => {
  const lvl = used => budgetLevel({dayUsed: used, dayLimit: 100});
  assert.deepEqual([0, 49, 50, 69, 70, 89, 90, 99, 100, 150].map(lvl),
    ['NORMAL', 'NORMAL', 'ELEVATED', 'ELEVATED', 'CONSERVE', 'CONSERVE', 'CRITICAL', 'CRITICAL', 'EXHAUSTED', 'EXHAUSTED']);
  assert.equal(dayLevel({dayUsed: 1, dayLimit: 100, minuteUsed: 20, minuteLimit: 20}), 'NORMAL', 'minute saturation is pacing, not a level');
  const matrix = Object.fromEntries(BUDGET_LEVELS.map(l => [l, REQUEST_PURPOSES.filter(p => admits(l, p))]));
  assert.deepEqual(matrix, {
    NORMAL: ['today', 'current_season', 'backfill', 'discovery'],
    ELEVATED: ['today', 'current_season', 'backfill', 'discovery'],
    CONSERVE: ['today', 'current_season'],
    CRITICAL: ['today'],
    EXHAUSTED: []
  });
  assert.equal(purposeOf({priority: 'backfill'}), 'backfill');
  assert.equal(purposeOf({priority: 'critical'}), 'current_season');
  assert.equal(purposeOf({purpose: 'discovery', priority: 'critical'}), 'discovery');
  assert.equal(purposeOf({purpose: 'nonsense'}), 'current_season');
});

function budgetAt(dayUsed, perDay = 100) {
  const ledger = createMemoryLedger();
  const t = Date.parse('2026-10-05T12:00:00Z');
  for (let i = 0; i < dayUsed; i++) ledger.rows.push({recorded_at: new Date(t - 3600000), outcome: 'upstream', url_path: '/x', attempt: 1});
  let calls = 0;
  const budget = createRequestBudget({
    ledger, now: () => t, sleep: async () => {}, apiKey: () => 'k', random: () => 0,
    config: {perMinute: 20, perDay, backfillPerMinute: 8, maxAttempts: 1, backoffBaseMs: 1, backoffCapMs: 1, circuitFailures: 5, circuitOpenMs: 1000},
    fetchImpl: async () => { calls++; return {status: 200, ok: true, headers: {}, text: async () => 'Date,Home,Away\n'}; }
  });
  return {budget, ledger, calls: () => calls};
}

async function outcome(budget, opts) {
  try {
    await budget.requestText({path: '/api/download/a/b/2026', datasetKey: 'a/b/2026', ...opts});
    return 'sent';
  } catch (error) {
    return error.code;
  }
}

test('CONSERVE defers discovery and backfill with no upstream call, keeps today and current season', async () => {
  const {budget, ledger, calls} = budgetAt(75);
  assert.equal(await outcome(budget, {purpose: 'discovery', path: '/api-docs'}), 'BUDGET_THROTTLED');
  assert.equal(await outcome(budget, {priority: 'backfill'}), 'BUDGET_THROTTLED');
  assert.equal(calls(), 0, 'a deferred request never reaches the provider');
  const throttled = ledger.rows.filter(r => r.outcome === 'throttled');
  assert.equal(throttled.length, 2);
  assert.ok(throttled.every(r => r.budget_level === 'CONSERVE' && r.attempt === 0 && r.retry_count === 0));
  assert.equal(await outcome(budget, {purpose: 'current_season'}), 'sent');
  assert.equal(await outcome(budget, {purpose: 'today', path: '/api/jogos-do-dia?date=2026-10-05&format=csv'}), 'sent');
  assert.equal(calls(), 2);
});

test('CRITICAL keeps only today; EXHAUSTED keeps nothing; throttled rows do not count as usage', async () => {
  const critical = budgetAt(92);
  assert.equal(await outcome(critical.budget, {purpose: 'current_season'}), 'BUDGET_THROTTLED');
  assert.equal(await outcome(critical.budget, {purpose: 'today', path: '/api/jogos-do-dia?date=2026-10-05&format=csv'}), 'sent');
  assert.equal(critical.calls(), 1);
  const exhausted = budgetAt(100);
  assert.equal(await outcome(exhausted.budget, {purpose: 'today', path: '/api/jogos-do-dia?date=2026-10-05&format=csv'}), 'BUDGET_EXHAUSTED');
  assert.equal(exhausted.calls(), 0);
  const normal = budgetAt(10);
  for (let i = 0; i < 5; i++) await outcome(normal.budget, {purpose: 'discovery', path: `/api-docs?i=${i}`});
  assert.equal(normal.calls(), 5);
  assert.ok(normal.ledger.rows.filter(r => r.outcome === 'upstream' && r.budget_level).every(r => r.budget_level === 'NORMAL'));
});

test('a restarted process still opens the circuit when deferrals, cache hits and dedups follow the failures', async () => {
  const ledger = createMemoryLedger();
  const t = Date.parse('2026-10-05T12:00:00Z');
  for (let i = 0; i < 5; i++) ledger.rows.push({recorded_at: new Date(t - 5000 + i), outcome: 'error', http_status: 503, url_path: '/x', attempt: 1});
  for (const o of ['throttled', 'cache_hit', 'deduped']) ledger.rows.push({recorded_at: new Date(t - 100), outcome: o, url_path: '/x', attempt: 0});
  let calls = 0;
  const budget = createRequestBudget({
    ledger, now: () => t, sleep: async () => {}, apiKey: () => 'k', random: () => 0,
    config: {perMinute: 20, perDay: 1000, backfillPerMinute: 8, maxAttempts: 1, backoffBaseMs: 1, backoffCapMs: 1, circuitFailures: 5, circuitOpenMs: 60000},
    fetchImpl: async () => { calls++; return {status: 200, ok: true, headers: {}, text: async () => 'Date,Home,Away\n'}; }
  });
  assert.equal(await outcome(budget, {purpose: 'today', path: '/api/jogos-do-dia?date=2026-10-05&format=csv'}), 'CIRCUIT_OPEN');
  assert.equal(calls, 0, 'rows that are not provider attempts do not reset the failure streak');
  assert.ok(LEDGER_OUTCOMES.includes('throttled'), 'the certificate knows the deferral outcome');
});
