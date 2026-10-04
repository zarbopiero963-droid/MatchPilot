import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 10000);
const TOKEN = process.env.BETSAPI_TOKEN?.trim();
const OUT = process.env.BETSAPI_COLLECTOR_FILE || '/tmp/betsapi-trial.jsonl';
const POLL_MS = Number(process.env.BETSAPI_POLL_MS || 30000);
const DETAIL_EVERY_MS = Number(process.env.BETSAPI_DETAIL_EVERY_MS || 60000);
const UPCOMING_EVERY_MS = Number(process.env.BETSAPI_UPCOMING_EVERY_MS || 300000);
const MAX_DETAILS = Number(process.env.BETSAPI_MAX_DETAILS || 20);

let lastInplay = 0;
let lastDetails = 0;
let lastUpcoming = 0;
let lastError = null;
let records = 0;
let lastEventIds = [];

fs.mkdirSync(path.dirname(OUT), { recursive: true });

function write(type, payload) {
  const row = { ts: new Date().toISOString(), type, payload };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  records++;
}

async function api(pathname, params = {}) {
  if (!TOKEN) throw new Error('missing BETSAPI_TOKEN');
  const url = new URL('https://api.b365api.com' + pathname);
  url.searchParams.set('token', TOKEN);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const started = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 20000) }; }
  return { status: res.status, latency_ms: Date.now() - started, body };
}

async function collectInplay() {
  const r = await api('/v1/bet365/inplay_filter');
  write('inplay_filter', { status: r.status, latency_ms: r.latency_ms, body: r.body });
  lastInplay = Date.now();
  const arr = Array.isArray(r.body?.results) ? r.body.results : [];
  lastEventIds = arr
    .filter(x => String(x?.sport_id ?? '') === '1')
    .map(x => x?.id ?? x?.FI)
    .filter(Boolean)
    .slice(0, MAX_DETAILS);
}

async function collectDetails() {
  for (const FI of lastEventIds) {
    try {
      const r = await api('/v1/bet365/event', { FI, stats: 1 });
      write('bet365_event_stats', { FI, status: r.status, latency_ms: r.latency_ms, body: r.body });
    } catch (e) {
      write('bet365_event_stats_error', { FI, error: String(e?.message || e) });
    }
  }
  lastDetails = Date.now();
}

async function collectUpcoming() {
  const r = await api('/v1/bet365/upcoming', { sport_id: 1 });
  write('bet365_upcoming', { status: r.status, latency_ms: r.latency_ms, body: r.body });
  lastUpcoming = Date.now();
}

async function loop() {
  if (!TOKEN) {
    lastError = 'missing BETSAPI_TOKEN';
    return;
  }
  try {
    const now = Date.now();
    if (now - lastInplay >= POLL_MS) await collectInplay();
    if (lastEventIds.length && now - lastDetails >= DETAIL_EVERY_MS) await collectDetails();
    if (now - lastUpcoming >= UPCOMING_EVERY_MS) await collectUpcoming();
    lastError = null;
  } catch (e) {
    lastError = String(e?.message || e);
    write('collector_error', { error: lastError });
  }
}

setInterval(() => loop().catch(() => {}), 5000).unref();
loop().catch(() => {});

http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({
      ok: Boolean(TOKEN) && !lastError,
      token_present: Boolean(TOKEN),
      records,
      file_bytes: fs.existsSync(OUT) ? fs.statSync(OUT).size : 0,
      last_inplay_at: lastInplay ? new Date(lastInplay).toISOString() : null,
      last_details_at: lastDetails ? new Date(lastDetails).toISOString() : null,
      last_upcoming_at: lastUpcoming ? new Date(lastUpcoming).toISOString() : null,
      last_error: lastError,
      detail_events: lastEventIds.length
    }));
  }
  if (req.url === '/export') {
    if (!fs.existsSync(OUT)) {
      res.statusCode = 404;
      return res.end('no data yet');
    }
    res.setHeader('content-type', 'application/x-ndjson');
    res.setHeader('content-disposition', 'attachment; filename="betsapi-trial.jsonl"');
    return fs.createReadStream(OUT).pipe(res);
  }
  res.statusCode = 404;
  res.end('not found');
}).listen(PORT, () => {
  console.log('BETSAPI_TRIAL_COLLECTOR_READY ' + JSON.stringify({
    port: PORT,
    token_present: Boolean(TOKEN),
    poll_ms: POLL_MS,
    detail_every_ms: DETAIL_EVERY_MS,
    upcoming_every_ms: UPCOMING_EVERY_MS,
    max_details: MAX_DETAILS
  }));
});
