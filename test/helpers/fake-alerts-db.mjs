// In-memory data_alerts for the t131u/t132u alert tests, plus canned answers (substring -> rows) for other reads.
export function fakeAlertsDb(canned = {}) {
  const alerts = [];
  let id = 0;
  const one = aid => alerts.find(x => x.alert_id === aid);
  const query = async (sql, params = []) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT * FROM data_alerts WHERE fingerprint=$1 AND resolved_at IS NULL')) {
      const rows = alerts.filter(a => a.fingerprint === params[0] && !a.resolved_at).map(a => structuredClone(a));
      return {rows, rowCount: rows.length};
    }
    if (q.startsWith('INSERT INTO data_alerts')) {
      const [source, severity, code, fingerprint, title, message] = params;
      const row = {alert_id: ++id, source, severity, code, fingerprint, title, message, payload: JSON.parse(params[6] || '{}'),
        delivery_status: 'pending', last_delivered_at: null, resolved_at: null};
      alerts.push(row); return {rows: [structuredClone(row)], rowCount: 1};
    }
    if (q.startsWith('UPDATE data_alerts SET last_seen_at')) {
      const a = one(params[0]); a.title = params[2]; a.message = params[3];
      a.payload = {...JSON.parse(params[1] || '{}'), ...(a.payload?._event ? {_event: a.payload._event} : {})};
      return {rows: [], rowCount: 1};
    }
    if (q.startsWith("UPDATE data_alerts SET delivery_status='unknown' WHERE alert_id=$1")) { one(params[0]).delivery_status = 'unknown'; return {rowCount: 1, rows: []}; }
    if (q.startsWith("UPDATE data_alerts SET delivery_status='sending'")) {
      for (const a of alerts.filter(x => x.fingerprint === params[0] && !x.resolved_at)) { a.delivery_status = 'sending'; a.payload = {...a.payload, _event: params[1]}; }
      return {rows: [], rowCount: 1};
    }
    if (q.startsWith('UPDATE data_alerts SET delivery_status=$2, last_delivered_at')) {
      for (const a of alerts.filter(x => x.fingerprint === params[0] && !x.resolved_at)) { a.delivery_status = params[1]; if (params[2]) a.last_delivered_at = new Date(); }
      return {rows: [], rowCount: 1};
    }
    if (q.startsWith('UPDATE data_alerts SET resolved_at=now()')) {
      const rows = alerts.filter(a => a.fingerprint === params[0] && !a.resolved_at);
      for (const a of rows) { a.resolved_at = new Date(); a.delivery_status = 'resolved_sending'; }
      return {rows: rows.map(a => structuredClone(a)), rowCount: rows.length};
    }
    if (q.startsWith("UPDATE data_alerts SET delivery_status='resolved_silent_never_notified'")) { one(params[0]).delivery_status = 'resolved_silent_never_notified'; return {rowCount: 1, rows: []}; }
    if (q.startsWith('UPDATE data_alerts SET delivery_status=$2, payload = payload ||')) {
      const a = one(params[0]); a.delivery_status = params[1]; a.payload = {...a.payload, _resolution: JSON.parse(params[2])}; return {rowCount: 1, rows: []};
    }
    if (q.includes("WHERE delivery_status='resolved_unnotified' AND last_delivered_at IS NOT NULL")) {
      const rows = alerts.filter(a => a.delivery_status === 'resolved_unnotified' && a.last_delivered_at && (a.payload?._resolution?.tries || 0) < 5).map(a => structuredClone(a));
      return {rows, rowCount: rows.length};
    }
    if (q.startsWith("UPDATE data_alerts SET delivery_status='resolved_sending' WHERE alert_id=$1 AND delivery_status='resolved_unnotified'")) {
      const a = one(params[0]); if (a.delivery_status !== 'resolved_unnotified') return {rowCount: 0, rows: []};
      a.delivery_status = 'resolved_sending'; return {rowCount: 1, rows: []};
    }
    for (const [needle, rows] of Object.entries(canned)) if (q.includes(needle)) return {rows: typeof rows === 'function' ? rows(params) : rows, rowCount: 1};
    return {rows: [], rowCount: 0};
  };
  return {alerts, canned, client: {query}};
}
