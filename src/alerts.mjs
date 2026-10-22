import { createHash } from 'node:crypto';
import { withClient } from './db.mjs';
import { classifyFreshness, readFreshnessFacts } from './providers/futpython/freshness.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

function redact(value) {
  return String(value ?? '')
    .replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]')
    .replace(/token=[^&\s]+/gi,'token=[REDACTED]')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g,'bot[REDACTED]');
}

export function deliveryDue(lastDeliveredAt, now = Date.now(), cooldownMinutes = 180) {
  if (!lastDeliveredAt) return true;
  const elapsed = now - new Date(lastDeliveredAt).getTime();
  return elapsed >= cooldownMinutes * 60000;
}

export function alertFingerprint({source='futpython',code,key=''}) {
  return sha([source,code,key].join('|'));
}

// t131u: data-collection notices carry their own category tag, distinct from mp-deploy's "[MatchPilot deploy]".
export const DATA_CATEGORY = '[MatchPilot dati]';
export function telegramText(alert) {
  if (alert.resolved) return [`${DATA_CATEGORY} MATCHPILOT — RISOLTO`, alert.title, redact(alert.message)].join('\n');
  const head = alert.severity === 'critical' ? '🚨 CRITICAL' : alert.severity === 'warning' ? '⚠️ WARNING' : 'ℹ️ INFO';
  return [`${DATA_CATEGORY} ${head}`, alert.title, redact(alert.message)].join('\n');
}

// t132u FIX-03: component that owns each alert code (shown in the RISOLTO notice).
export const ALERT_COMPONENT = {FPT_WORKER_LIVENESS: 'worker FPT (systemd matchpilot-fpt-worker)', SYNC_STALE: 'scheduler/sync FPT',
  SYNC_FAILURES_AGG: 'sync FPT', DATASET_ERRORS: 'sync FPT (dataset)', DATA_CONTENT_STALE: 'contenuti provider FutPython',
  RECON_GAPS: 'riconciliazione FPT', RECON_FAILED: 'riconciliazione FPT'};

export function resolvedNotice(row, {resolvedAt = new Date(), evidence = null} = {}) {
  const when = new Date(resolvedAt).toISOString();
  return {source: row.source, severity: 'info', code: row.code, title: row.title, resolved: true,
    message: [`Problema: ${row.title} (${row.code})${row.message ? ' — ' + row.message : ''}`,
      `Componente: ${ALERT_COMPONENT[row.code] || row.source}`,
      `Risolto alle: ${when} (UTC)`,
      `Verifica: ${evidence || 'condizione non più rilevata dal controllo automatico'}`].join('\n'),
    payload: {resolved: true, resolvedAt: when, evidence}};
}

// t132u FIX-06: stable id of one notice = alert + exact text. The same event id is never sent twice.
export function eventId(alert) {
  return sha([alert.fingerprint || alertFingerprint(alert), alert.resolved ? 'resolved' : 'open', alert.title, alert.message].join('|')).slice(0, 24);
}

// Transient = the request surely did not reach Telegram or Telegram asked to retry: safe to resend.
// A timeout is ambiguous (the message may have been delivered): it is NOT resent (at-most-once).
export function classifyDeliveryError(error) {
  const status = error?.status ?? Number((/HTTP (\d{3})/.exec(String(error?.message || '')) || [])[1] || NaN);
  if (status === 429 || (status >= 500 && status < 600)) return 'transient';
  if (status >= 400 && status < 500) return 'permanent';
  const name = error?.name || '';
  const code = error?.cause?.code || error?.code || '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'ambiguous';
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ENETUNREACH|EHOSTUNREACH/.test(code)) return 'transient';
  return 'ambiguous';
}

export async function sendWithRetry(fn, alert, {tries = 3, sleep = ms => new Promise(r => setTimeout(r, ms)),
  baseMs = Number(process.env.MATCHPILOT_ALERT_RETRY_BASE_MS ?? 2000)} = {}) {
  for (let i = 1; ; i++) {
    try { return {...await fn(alert), tries: i}; }
    catch (error) {
      const kind = classifyDeliveryError(error);
      if (kind !== 'transient' || i >= tries) { error.kind = kind; error.tries = i; throw error; }
      console.warn('DATA_ALERT_DELIVERY_RETRY ' + JSON.stringify({ts: new Date().toISOString(), code: alert.code, try: i, kind}));
      await sleep(baseMs * i);
    }
  }
}

// t131u: an unchanged open alert is never re-sent with the same text; a failed or never-attempted delivery is retried
// (bounded by the cooldown); a changed text is sent once the cooldown has passed.
export function redeliveryDue(row, alert, now = Date.now(), cooldownMinutes = 180) {
  if (row.delivery_status === 'failed') return true;
  if (!row.last_delivered_at) return true;
  if (row.message === alert.message && row.title === alert.title) return false;
  return deliveryDue(row.last_delivered_at, now, cooldownMinutes);
}

async function deliverTelegram(alert) {
  const token = process.env.MATCHPILOT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.MATCHPILOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return {attempted:false,channel:'telegram'};

  const text = telegramText(alert);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) { const e = new Error(`Telegram HTTP ${response.status}`); e.status = response.status; throw e; }
  // t138: the Bot API result is the delivery proof: ok=true plus a message_id. HTTP 200 without it is not "delivered".
  let body = null;
  try { body = await response.json(); } catch {}
  if (body && body.ok === false) { const e = new Error(`Telegram API ok=false ${body.error_code ?? ''}`.trim()); e.status = body.error_code; throw e; }
  return {attempted:true,channel:'telegram',messageId: body?.result?.message_id ?? null};
}

async function deliverWebhook(alert) {
  const url = process.env.MATCHPILOT_ALERT_WEBHOOK_URL?.trim();
  if (!url) return {attempted:false,channel:'webhook'};
  const response = await fetch(url, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({
      source:alert.source,severity:alert.severity,code:alert.code,
      title:alert.title,message:redact(alert.message),payload:alert.payload
    }),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) { const e = new Error(`Webhook HTTP ${response.status}`); e.status = response.status; throw e; }
  return {attempted:true,channel:'webhook'};
}

export async function emitAlert(input, clientOverride, options = {}) {
  const deliverers = options.deliver
    ? (Array.isArray(options.deliver) ? options.deliver : [options.deliver])
    : [deliverTelegram, deliverWebhook];
  const alert = {
    source:input.source || 'futpython',
    severity:input.severity || 'warning',
    code:input.code,
    title:input.title,
    message:redact(input.message),
    payload:input.payload || {},
    key:input.key || ''
  };
  alert.fingerprint = alertFingerprint(alert);
  const cooldownMinutes = Number(process.env.MATCHPILOT_ALERT_COOLDOWN_MINUTES || 180);

  const runner = async client => {
    const existing = await client.query(
      'SELECT * FROM data_alerts WHERE fingerprint=$1 AND resolved_at IS NULL',
      [alert.fingerprint]
    );
    let row;
    let shouldDeliver = true;
    if (existing.rowCount) {
      row = existing.rows[0];
      await client.query(
        `UPDATE data_alerts SET
          last_seen_at=now(), occurrences=occurrences+1, payload=$2::jsonb,
          title=$3, message=$4
         WHERE alert_id=$1`,
        [row.alert_id,JSON.stringify(alert.payload),alert.title,alert.message]
      );
      shouldDeliver = redeliveryDue(row, alert, Date.now(), cooldownMinutes);
    } else {
      const ins = await client.query(
        `INSERT INTO data_alerts(source,severity,code,fingerprint,title,message,payload)
         VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
         RETURNING *`,
        [alert.source,alert.severity,alert.code,alert.fingerprint,alert.title,alert.message,JSON.stringify(alert.payload)]
      );
      row = ins.rows[0];
    }

    const event = eventId(alert);
    // t132u FIX-06: a send interrupted by a crash/restart ('sending' left behind) or a timeout ('unknown') is not
    // resent for the same event: at-most-once in that window, logged. A changed text is a new event.
    if (row.delivery_status === 'sending' || row.delivery_status === 'unknown') {
      if (row.payload?._event === event) {
        if (row.delivery_status === 'sending') {
          await client.query(`UPDATE data_alerts SET delivery_status='unknown' WHERE alert_id=$1`, [row.alert_id]);
          console.warn('DATA_ALERT_SEND_INTERRUPTED '+JSON.stringify({ts:new Date().toISOString(),code:alert.code,event}));
        }
        return {stored:true,delivered:false,suppressed:true,reason:'interrupted_send_not_repeated'};
      }
      shouldDeliver = true;
    }
    if (!shouldDeliver) return {stored:true,delivered:false,suppressed:true};

    await client.query(
      `UPDATE data_alerts SET delivery_status='sending', payload = payload || jsonb_build_object('_event', $2::text)
       WHERE fingerprint=$1 AND resolved_at IS NULL`, [alert.fingerprint, event]);
    const deliveryErrors = [];
    const sent = [];
    let delivered = false;
    let ambiguous = false;
    for (const fn of deliverers) {
      try {
        const result = await sendWithRetry(fn, alert, options.retry);
        if (result.attempted) { delivered = true; sent.push({channel: result.channel ?? null, messageId: result.messageId ?? null}); logDelivery('open', alert.code, result); }
      } catch (e) {
        if (e?.kind === 'ambiguous') ambiguous = true;
        deliveryErrors.push(redact(e?.message || e));
      }
    }

    await client.query(
      `UPDATE data_alerts SET
        delivery_status=$2,
        last_delivered_at=CASE WHEN $3 THEN now() ELSE last_delivered_at END,
        payload = payload || jsonb_build_object('_delivery', $4::jsonb)
       WHERE fingerprint=$1 AND resolved_at IS NULL`,
      [
        alert.fingerprint,
        delivered ? (deliveryErrors.length ? 'partial' : 'delivered') :
          ambiguous ? 'unknown' : (deliveryErrors.length ? 'failed' : 'stored_only'),
        delivered,
        JSON.stringify({at: new Date().toISOString(), event, sent, errors: deliveryErrors.length})
      ]
    );
    if (deliveryErrors.length) console.error('DATA_ALERT_DELIVERY_ERROR '+JSON.stringify({ts:new Date().toISOString(),code:alert.code,count:deliveryErrors.length,event,ambiguous}));
    return {stored:true,delivered,deliveryErrors,event};
  };

  return clientOverride ? runner(clientOverride) : withClient(runner);
}

// t138: every successful send is logged with its channel and Bot API message_id (no token, no text).
export function logDelivery(kind, code, result, out = console.log) {
  out('DATA_ALERT_DELIVERED ' + JSON.stringify({ts: new Date().toISOString(), kind, code, channel: result?.channel ?? null,
    messageId: result?.messageId ?? null, tries: result?.tries ?? null}));
}

// t131u: resolving an alert that had reached a channel sends one '✅ RISOLTO' notice. The UPDATE ... WHERE resolved_at IS
// NULL RETURNING makes the notice exactly-once: a second resolve finds no open row and sends nothing.
export async function resolveAlert({source='futpython',code,key=''}, clientOverride, options = {}) {
  const fingerprint = alertFingerprint({source,code,key});
  const deliverers = options.deliver
    ? (Array.isArray(options.deliver) ? options.deliver : [options.deliver])
    : [deliverTelegram, deliverWebhook];
  const runner = async client => {
    const res = await client.query(
      `UPDATE data_alerts SET resolved_at=now(), delivery_status='resolved_sending' WHERE fingerprint=$1 AND resolved_at IS NULL
       RETURNING alert_id, source, severity, code, title, message, last_delivered_at, resolved_at, payload`,
      [fingerprint]
    );
    const row = res.rows?.[0];
    if (!row) return {resolved: false, notified: false};
    if (!row.last_delivered_at) {
      // Never reached a channel: nothing to close on Telegram, recorded (not silent) in the store.
      await client.query(`UPDATE data_alerts SET delivery_status='resolved_silent_never_notified' WHERE alert_id=$1`, [row.alert_id]);
      return {resolved: true, notified: false};
    }
    return sendResolution(client, row, deliverers, options);
  };
  return clientOverride ? runner(clientOverride) : withClient(runner);
}

async function sendResolution(client, row, deliverers, options = {}) {
  const notice = resolvedNotice(row, {resolvedAt: row.resolved_at || new Date(), evidence: options.evidence});
  let notified = false;
  let ambiguous = false;
  const deliveries = [];
  for (const fn of deliverers) {
    try {
      const result = await sendWithRetry(fn, notice, options.retry);
      if (result.attempted) { notified = true; deliveries.push({channel: result.channel ?? null, messageId: result.messageId ?? null}); logDelivery('resolved', row.code, result); }
    }
    catch (e) {
      if (e?.kind === 'ambiguous') ambiguous = true;
      console.error('DATA_ALERT_RESOLVE_DELIVERY_ERROR '+JSON.stringify({ts:new Date().toISOString(),code: row.code, error: redact(e?.message || e)}));
    }
  }
  const status = notified ? 'resolved_notified' : ambiguous ? 'resolved_unknown' : 'resolved_unnotified';
  await client.query(`UPDATE data_alerts SET delivery_status=$2,
      payload = payload || jsonb_build_object('_resolution', $3::jsonb) WHERE alert_id=$1`,
    [row.alert_id, status, JSON.stringify({evidence: options.evidence || null, at: new Date().toISOString(), deliveries,
      tries: (row.payload?._resolution?.tries || 0) + 1})]);
  return {resolved: true, notified, status};
}

// t132u FIX-06: a RISOLTO that failed on a sure-not-delivered error is retried by the next cycle (max 5 cycles, 7 days).
export async function retryPendingResolutions(clientOverride, options = {}) {
  const deliverers = options.deliver
    ? (Array.isArray(options.deliver) ? options.deliver : [options.deliver])
    : [deliverTelegram, deliverWebhook];
  const runner = async client => {
    const rows = (await client.query(
      `SELECT alert_id, source, severity, code, title, message, last_delivered_at, resolved_at, payload FROM data_alerts
       WHERE delivery_status='resolved_unnotified' AND last_delivered_at IS NOT NULL AND resolved_at > now() - interval '7 days'
         AND COALESCE((payload->'_resolution'->>'tries')::int, 0) < 5 ORDER BY resolved_at LIMIT 20`)).rows;
    const out = [];
    for (const row of rows) {
      const claimed = await client.query(`UPDATE data_alerts SET delivery_status='resolved_sending'
        WHERE alert_id=$1 AND delivery_status='resolved_unnotified'`, [row.alert_id]);
      if (!claimed.rowCount) continue;
      out.push(await sendResolution(client, row, deliverers, {...options, evidence: row.payload?._resolution?.evidence || options.evidence}));
    }
    return out;
  };
  return clientOverride ? runner(clientOverride) : withClient(runner);
}

// t131u: content freshness — the sync can run on time while the provider publishes nothing new.
export function contentStaleness({maxChangedAt, maxMatchDate, now = Date.now(), changedHours = 72, matchDays = 7}) {
  const changedAge = maxChangedAt ? (now - new Date(maxChangedAt).getTime()) / 3600000 : Infinity;
  const matchAge = maxMatchDate ? (now - new Date(`${String(maxMatchDate).slice(0, 10)}T00:00:00Z`).getTime()) / 86400000 : Infinity;
  const reasons = [];
  if (changedAge > changedHours) reasons.push(`nessun contenuto cambiato da oltre ${changedHours}h`);
  if (matchAge > matchDays) reasons.push(`ultima partita oltre ${matchDays} giorni fa`);
  return {stale: reasons.length > 0, reasons,
    maxLastChangedAt: maxChangedAt ? new Date(maxChangedAt).toISOString() : null,
    maxMatchDate: maxMatchDate ? String(maxMatchDate instanceof Date ? maxMatchDate.toISOString() : maxMatchDate).slice(0, 10) : null};
}

export async function readContentFreshness(client, now = Date.now()) {
  const r = await client.query(`SELECT (SELECT max(last_changed_at) FROM fpt_dataset_state) AS max_changed,
    (SELECT max(match_date) FROM fpt_match_facts) AS max_match_date`);
  return contentStaleness({maxChangedAt: r.rows[0]?.max_changed, maxMatchDate: r.rows[0]?.max_match_date, now});
}

export function healthStatus(alerts, freshness) {
  return alerts.some(a=>a.severity==='critical') ? 'critical' :
    (alerts.some(a=>a.severity==='warning') || freshness?.stale) ? 'warning' : 'ok';
}

export async function getDataHealth() {
  return withClient(async client => {
    const [lastRun, openAlerts, catalog, fields, failed, freshness] = await Promise.all([
      client.query(`SELECT run_id,kind,status,started_at,finished_at,catalog_entries,datasets_attempted,
                           datasets_changed,rows_seen,rows_inserted,fields_seen
                    FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1`),
      client.query(`SELECT severity,code,title,message,last_seen_at,occurrences
                    FROM data_alerts WHERE resolved_at IS NULL
                    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,last_seen_at DESC
                    LIMIT 100`),
      client.query('SELECT count(*)::int AS n FROM fpt_catalog WHERE active=true'),
      client.query('SELECT count(*)::int AS n FROM fpt_schema_fields'),
      client.query(`SELECT count(*)::int AS n FROM fpt_dataset_state WHERE last_error IS NOT NULL`),
      readContentFreshness(client)
    ]);
    const facts = await readFreshnessFacts(client);
    const fr = classifyFreshness(facts);
    const gaps = (await client.query(`SELECT COALESCE(details->>'classification', status) AS state, count(*)::int AS n
      FROM data_reconciliation_ledger WHERE source='futpython' AND status IN ('DETECTED','QUEUED','RECOVERING','PARTIAL','FAILED')
      GROUP BY 1 ORDER BY 1`)).rows;
    return {
      // v1 fields kept (status ok|warning|critical); v2 adds the separated view (t132u FIX-05). Never "ok" with stale data.
      version: 2,
      overall: {status: fr.overall, reason: fr.reason},
      worker: {state: fr.worker, heartbeatAt: facts.watchdogCheckedAt, heartbeatAgeHours: fr.heartbeatAgeHours},
      scheduler: {state: fr.scheduler, missedCycles: fr.missedCycles, cycleHours: 6},
      lastCycle: {...(facts.lastRun || {}), ageHours: fr.lastCycleAgeHours, sync: fr.sync},
      lastEffectiveUpdate: {at: freshness.maxLastChangedAt, ageHours: fr.lastChangedAgeHours, newData: fr.newData,
        provider: fr.provider, providerEvidence: fr.providerEvidence},
      datasetFreshness: {staleCurrentSeasons: fr.staleDatasets, maxMatchDate: freshness.maxMatchDate},
      pendingGaps: Object.fromEntries(gaps.map(g => [g.state, g.n])),
      syncErrors: {datasetsWithErrors: facts.datasetErrors, localErrors: fr.localErrors},
      status: fr.overall === 'CRITICAL' ? 'critical' : fr.overall === 'DEGRADED' && healthStatus(openAlerts.rows, freshness) === 'ok' ? 'warning'
        : healthStatus(openAlerts.rows, freshness),
      contentFreshness: freshness,
      maxMatchDate: freshness.maxMatchDate,
      lastRun:lastRun.rows[0] || null,
      activeDatasets:catalog.rows[0]?.n || 0,
      schemaFields:fields.rows[0]?.n || 0,
      datasetsWithErrors:failed.rows[0]?.n || 0,
      alerts:openAlerts.rows
    };
  });
}


export async function configureTelegramOutboundOnly() {
  const token = process.env.MATCHPILOT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.MATCHPILOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return {configured:false,reason:'missing_config'};

  // Ensure Telegram does not deliver updates to any webhook. MatchPilot never calls getUpdates,
  // so inbound messages are intentionally ignored.
  const response = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify({drop_pending_updates:true}),
    signal:AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`Telegram deleteWebhook HTTP ${response.status}`);
  return {configured:true};
}

export async function sendTelegramConnectivityTest() {
  const token = process.env.MATCHPILOT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.MATCHPILOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId || !process.env.DATABASE_URL) {
    return {status:'skipped',reason:'missing_config'};
  }

  return withClient(async client => {
    const state = await client.query(
      `SELECT meta FROM data_watchdog_state WHERE source='telegram'`
    );
    if (state.rows[0]?.meta?.connectivity_test_sent === true) {
      return {status:'already_sent'};
    }

    const text = [
      '✅ MatchPilot avvisi collegati correttamente',
      'Bot configurato in modalità outbound-only.',
      'Questo gruppo è l’unico destinatario configurato.'
    ].join('\n');

    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true}),
      signal:AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Telegram test HTTP ${response.status}`);

    await client.query(
      `INSERT INTO data_watchdog_state(source,last_checked_at,last_success_at,meta)
       VALUES('telegram',now(),now(),$1::jsonb)
       ON CONFLICT(source) DO UPDATE SET
         last_checked_at=now(),
         last_success_at=now(),
         meta=excluded.meta`,
      [JSON.stringify({connectivity_test_sent:true,mode:'outbound_only'})]
    );
    return {status:'sent'};
  });
}
