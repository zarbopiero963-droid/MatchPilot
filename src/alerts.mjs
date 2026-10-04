import { createHash } from 'node:crypto';
import { withClient } from './db.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');

function redact(value) {
  return String(value ?? '')
    .replace(/api_key=[^&\s]+/gi,'api_key=[REDACTED]')
    .replace(/token=[^&\s]+/gi,'token=[REDACTED]');
}

export function alertFingerprint({source='futpython',code,key=''}) {
  return sha([source,code,key].join('|'));
}

async function deliverTelegram(alert) {
  const token = process.env.MATCHPILOT_TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.MATCHPILOT_TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return {attempted:false,channel:'telegram'};

  const text = [
    alert.severity === 'critical' ? '🚨 MATCHPILOT CRITICAL' :
    alert.severity === 'warning' ? '⚠️ MATCHPILOT WARNING' : 'ℹ️ MATCHPILOT',
    alert.title,
    redact(alert.message)
  ].join('\n');

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

export async function emitAlert(input, clientOverride) {
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
      if (row.last_delivered_at) {
        const elapsed = Date.now() - new Date(row.last_delivered_at).getTime();
        shouldDeliver = elapsed >= cooldownMinutes*60000;
      }
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
    for (const fn of [deliverTelegram,deliverWebhook]) {
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

export async function resolveAlert({source='futpython',code,key=''}, clientOverride) {
  const fingerprint = alertFingerprint({source,code,key});
  const runner = client => client.query(
    'UPDATE data_alerts SET resolved_at=now() WHERE fingerprint=$1 AND resolved_at IS NULL',
    [fingerprint]
  );
  return clientOverride ? runner(clientOverride) : withClient(runner);
}

export async function getDataHealth() {
  return withClient(async client => {
    const [lastRun, openAlerts, catalog, fields, failed] = await Promise.all([
      client.query(`SELECT run_id,kind,status,started_at,finished_at,catalog_entries,datasets_attempted,
                           datasets_changed,rows_seen,rows_inserted,fields_seen
                    FROM fpt_sync_runs ORDER BY started_at DESC LIMIT 1`),
      client.query(`SELECT severity,code,title,message,last_seen_at,occurrences
                    FROM data_alerts WHERE resolved_at IS NULL
                    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,last_seen_at DESC
                    LIMIT 100`),
      client.query('SELECT count(*)::int AS n FROM fpt_catalog WHERE active=true'),
      client.query('SELECT count(*)::int AS n FROM fpt_schema_fields'),
      client.query(`SELECT count(*)::int AS n FROM fpt_dataset_state WHERE last_error IS NOT NULL`)
    ]);
    return {
      status: openAlerts.rows.some(a=>a.severity==='critical') ? 'critical' :
              openAlerts.rows.some(a=>a.severity==='warning') ? 'warning' : 'ok',
      lastRun:lastRun.rows[0] || null,
      activeDatasets:catalog.rows[0]?.n || 0,
      schemaFields:fields.rows[0]?.n || 0,
      datasetsWithErrors:failed.rows[0]?.n || 0,
      alerts:openAlerts.rows
    };
  });
}
