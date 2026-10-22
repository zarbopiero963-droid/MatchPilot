import { createHash } from 'node:crypto';
import { withClient } from './db.mjs';

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
  const head = alert.resolved ? '✅ RISOLTO' :
    alert.severity === 'critical' ? '🚨 CRITICAL' : alert.severity === 'warning' ? '⚠️ WARNING' : 'ℹ️ INFO';
  return [`${DATA_CATEGORY} ${head}`, alert.title, redact(alert.message)].join('\n');
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
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  return {attempted:true,channel:'telegram'};
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
  if (!response.ok) throw new Error(`Webhook HTTP ${response.status}`);
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

    if (!shouldDeliver) return {stored:true,delivered:false,suppressed:true};

    const deliveryErrors = [];
    let delivered = false;
    for (const fn of deliverers) {
      try {
        const result = await fn(alert);
        if (result.attempted) delivered = true;
      } catch (e) {
        deliveryErrors.push(redact(e?.message || e));
      }
    }

    await client.query(
      `UPDATE data_alerts SET
        delivery_status=$2,
        last_delivered_at=CASE WHEN $3 THEN now() ELSE last_delivered_at END
       WHERE fingerprint=$1 AND resolved_at IS NULL`,
      [
        alert.fingerprint,
        delivered ? (deliveryErrors.length ? 'partial' : 'delivered') :
          (deliveryErrors.length ? 'failed' : 'stored_only'),
        delivered
      ]
    );
    if (deliveryErrors.length) console.error('DATA_ALERT_DELIVERY_ERROR '+JSON.stringify({code:alert.code,count:deliveryErrors.length}));
    return {stored:true,delivered,deliveryErrors};
  };

  return clientOverride ? runner(clientOverride) : withClient(runner);
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
      `UPDATE data_alerts SET resolved_at=now() WHERE fingerprint=$1 AND resolved_at IS NULL
       RETURNING alert_id, source, severity, code, title, last_delivered_at`,
      [fingerprint]
    );
    const row = res.rows?.[0];
    if (!row || !row.last_delivered_at) return {resolved: Boolean(row), notified: false};
    const notice = {source: row.source, severity: 'info', code: row.code, title: row.title, resolved: true,
      message: `Condizione rientrata (${row.code}).`, payload: {resolved: true}};
    let notified = false;
    for (const fn of deliverers) {
      try { if ((await fn(notice)).attempted) notified = true; }
      catch (e) { console.error('DATA_ALERT_RESOLVE_DELIVERY_ERROR '+JSON.stringify({code: row.code, error: redact(e?.message || e)})); }
    }
    await client.query(`UPDATE data_alerts SET delivery_status=$2 WHERE alert_id=$1`, [row.alert_id, notified ? 'resolved_notified' : 'resolved_unnotified']);
    return {resolved: true, notified};
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
    return {
      status: healthStatus(openAlerts.rows, freshness),
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
