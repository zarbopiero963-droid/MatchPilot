import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deliveryDue } from '../src/alerts.mjs';
import { budgetPressure, countsTowardCircuit } from '../src/providers/futpython/budget.mjs';
import { phase8Gate, syncIsStale } from '../src/jobs/data-watchdog.mjs';

test('stale detection and alert cooldown are explicit', () => {
  const now = Date.parse('2026-10-05T00:00:00Z');
  assert.equal(syncIsStale('2026-10-04T10:00:00Z', now, 8), true);
  assert.equal(syncIsStale('2026-10-04T20:00:00Z', now, 8), false);
  assert.equal(syncIsStale(null, now, 8), true);
  assert.equal(deliveryDue('2026-10-04T23:00:00Z', now, 180), false);
  assert.equal(deliveryDue('2026-10-04T18:00:00Z', now, 180), true);
  assert.equal(deliveryDue(null, now, 180), true);
});

test('budget crosses warning then critical and a 429 counts toward the circuit', () => {
  assert.equal(budgetPressure({dayUsed: 7, dayLimit: 10, minuteUsed: 0, minuteLimit: 20}), 'warning');
  assert.equal(budgetPressure({dayUsed: 9, dayLimit: 10, minuteUsed: 0, minuteLimit: 20}), 'critical');
  assert.equal(budgetPressure({dayUsed: 1, dayLimit: 10, minuteUsed: 0, minuteLimit: 20}), 'ok');
  assert.equal(countsTowardCircuit({outcome: '429', http_status: 429}), true);
  assert.equal(countsTowardCircuit({outcome: 'error', http_status: 404}), false);
});

test('telegram inbound updates have no handler', () => {
  const server = readFileSync(new URL('../src/server.mjs', import.meta.url), 'utf8');
  const alerts = readFileSync(new URL('../src/alerts.mjs', import.meta.url), 'utf8');
  assert.equal(/getUpdates\s*\(/.test(server), false);
  assert.equal(/getUpdates\s*\(/.test(alerts), false);
  assert.equal(alerts.includes('deleteWebhook'), true);
});

test('phase8 gate accepts one real telegram send or a skipped unconfigured bot', () => {
  const cases = {
    stale: true, recovery: true, dataset_error: true, resolved: true,
    new_field: true, new_dataset: true, row_drop: true, regression: true,
    aggregated: true, suppressed: true, budget_warning: true, budget_critical: true,
    budget_resolved: true, rate_limit: true, circuit: true, real_watchdog_quiet: true
  };
  assert.equal(phase8Gate({
    cases, mirror_unchanged: true, inbound_ignored: true, local_suppression: true,
    telegram: {configured: false, reason: 'missing_config'}
  }), true);
  assert.equal(phase8Gate({
    cases, mirror_unchanged: true, inbound_ignored: true,
    telegram: {configured: true, sent: true, secondSuppressed: true, messages: 1, outbound: true}
  }), true);
  assert.equal(phase8Gate({
    cases, mirror_unchanged: true, inbound_ignored: true,
    telegram: {configured: true, sent: true, secondSuppressed: true, messages: 2, outbound: true}
  }), false);
});
