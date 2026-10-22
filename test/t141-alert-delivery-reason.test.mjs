// t141: alert 73 (SYNC_STALE) ended 'failed' with only {"count":1} logged: the reason was lost. A failed delivery now
// records kind/status/tries and Telegram's own description (redacted, bounded), in the log and in payload._delivery.
import test from 'node:test';
import assert from 'node:assert/strict';
import { emitAlert } from '../src/alerts.mjs';
import { fakeAlertsDb } from './helpers/fake-alerts-db.mjs';

process.env.MATCHPILOT_ALERT_RETRY_BASE_MS = '0';

test('a failed Telegram send says why (Bot API description), without token or text; the next cycle retries', async () => {
  const TOKEN = '123456789:AAFakeTokenForTestOnly_abcdefghijklmnopqr';
  const env = {...process.env};
  process.env.MATCHPILOT_TELEGRAM_BOT_TOKEN = TOKEN; process.env.MATCHPILOT_TELEGRAM_CHAT_ID = '-100';
  delete process.env.MATCHPILOT_ALERT_WEBHOOK_URL;
  const origFetch = globalThis.fetch; const errs = []; const origErr = console.error; const origLog = console.log;
  let fail = true; let calls = 0;
  globalThis.fetch = async (url) => { calls++; assert.match(String(url), /api\.telegram\.org/);
    return fail ? new Response(JSON.stringify({ok: false, error_code: 400, description: 'Bad Request: chat not found'}), {status: 400})
                : new Response(JSON.stringify({ok: true, result: {message_id: 77}}), {status: 200}); };
  console.error = l => errs.push(String(l)); console.log = () => {};
  try {
    const db = fakeAlertsDb();
    const a = {source: 'futpython', code: 'SYNC_STALE', severity: 'critical', key: '', title: 'Sync ferma', message: 'segreto-testo'};
    const r = await emitAlert(a, db.client);
    assert.equal(r.delivered, false);
    const line = errs.find(l => l.startsWith('DATA_ALERT_DELIVERY_ERROR'));
    assert.ok(line, 'error line');
    const j = JSON.parse(line.slice('DATA_ALERT_DELIVERY_ERROR '.length));
    assert.equal(j.failures[0].kind, 'permanent');
    assert.equal(j.failures[0].status, 400);
    assert.match(j.failures[0].error, /chat not found/);
    assert.doesNotMatch(line, /AAFakeToken|segreto-testo/);
    assert.equal(db.alerts[0].delivery_status, 'failed');
    fail = false;
    const r2 = await emitAlert(a, db.client);
    assert.equal(r2.delivered, true);
    assert.equal(db.alerts[0].delivery_status, 'delivered');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = origFetch; console.error = origErr; console.log = origLog;
    for (const k of ['MATCHPILOT_TELEGRAM_BOT_TOKEN', 'MATCHPILOT_TELEGRAM_CHAT_ID']) { if (k in env) process.env[k] = env[k]; else delete process.env[k]; }
  }
});
