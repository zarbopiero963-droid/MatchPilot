// t138u/t145: BUDGET_CRITICAL of 23/10 06:25 Rome was a false positive. The internal per-minute pacing (20/min,
// a self-imposed technical protection, enforced by waiting) saturated during a normal sync burst (20 requests in one
// minute, of which several 404) while the day counter was 439/2000; the alert resolved 78s later with evidence=null
// only because the 1-minute window had elapsed. RED on main, GREEN here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProviderAlerts } from '../src/jobs/data-watchdog.mjs';
import { budgetConfig } from '../src/providers/futpython/budget.mjs';
import { telegramText } from '../src/alerts.mjs';
import { fakeAlertsDb } from './helpers/fake-alerts-db.mjs';
process.env.MATCHPILOT_ALERT_RETRY_BASE_MS = '0';

const tg = () => { const sent = []; return {sent, fn: async a => { sent.push(telegramText(a)); return {attempted: true}; }}; };
const usageDb = usage => fakeAlertsDb({minute_used: () => (usage.value ? [usage.value] : [])});
const limits = {perDay: 2000, perMinute: 20};

test('(1) a saturated internal per-minute pacing window is NOT a budget alert (23/10 06:25 replay)', async () => {
  const usage = {value: {minute_used: 20, day_used: 439, recent_429: 0}};
  const db = usageDb(usage); const ch = tg();
  const r = await evaluateProviderAlerts(db.client, {deliver: ch.fn, limits, circuitFailures: 5});
  assert.equal(db.alerts.filter(a => a.code === 'BUDGET_CRITICAL' || a.code === 'BUDGET_WARNING').length, 0);
  assert.equal(r.level, 'ok');
  assert.equal(r.pacing.minuteSaturated, true, 'pacing saturation still reported, as information');
});

test('(2) the internal daily cap still alerts, labelled as an internal protection limit, not a provider quota', async () => {
  const usage = {value: {minute_used: 0, day_used: 1850, recent_429: 0}};
  const db = usageDb(usage); const ch = tg();
  await evaluateProviderAlerts(db.client, {deliver: ch.fn, limits, circuitFailures: 5});
  const a = db.alerts.find(x => x.code === 'BUDGET_CRITICAL');
  assert.ok(a, 'genuine protection kept');
  assert.equal(a.payload.limitKind, 'internal_protection');
  assert.equal(a.payload.providerQuota, 'unlimited');
  assert.match(a.title, /interno/i);
  assert.doesNotMatch(a.message, /esauriment/i);
});

test('(3) resolution needs a positive measurement: missing usage data never resolves an open alert', async () => {
  const usage = {value: {minute_used: 0, day_used: 1850, recent_429: 0}};
  const db = usageDb(usage); const ch = tg();
  await evaluateProviderAlerts(db.client, {deliver: ch.fn, limits, circuitFailures: 5});
  usage.value = null; // counters unreadable
  const r = await evaluateProviderAlerts(db.client, {deliver: ch.fn, limits, circuitFailures: 5});
  assert.equal(r.level, 'unknown');
  assert.equal(db.alerts.find(x => x.code === 'BUDGET_CRITICAL').resolved_at, null);
  usage.value = {minute_used: 0, day_used: 300, recent_429: 0};
  await evaluateProviderAlerts(db.client, {deliver: ch.fn, limits, circuitFailures: 5});
  const a = db.alerts.find(x => x.code === 'BUDGET_CRITICAL');
  assert.ok(a.resolved_at);
  const notice = ch.sent.find(t => /RISOLTO/.test(t));
  assert.match(notice, /300\/2000/, 'RISOLTO carries the measured counter as evidence');
});

test('(4) real provider 429 responses still raise RATE_LIMIT_429 (genuine provider signal kept)', async () => {
  const db = usageDb({value: {minute_used: 1, day_used: 10, recent_429: 2}}); const ch = tg();
  await evaluateProviderAlerts(db.client, {deliver: ch.fn, limits, circuitFailures: 5});
  assert.ok(db.alerts.find(x => x.code === 'RATE_LIMIT_429'));
});

test('(5) provider quota is configurable: unlimited (owner dashboard) / unknown / numeric; invalid rejected', () => {
  assert.equal(budgetConfig({}).providerDailyQuota, 'unlimited');
  assert.equal(budgetConfig({FUTPYTHON_PROVIDER_DAILY_QUOTA: 'unknown'}).providerDailyQuota, 'unknown');
  assert.equal(budgetConfig({FUTPYTHON_PROVIDER_DAILY_QUOTA: '5000'}).providerDailyQuota, 5000);
  assert.throws(() => budgetConfig({FUTPYTHON_PROVIDER_DAILY_QUOTA: 'lots'}));
});
