import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 10000);
const BETS_TOKEN = process.env.BETSAPI_TOKEN?.trim();
const TC_TOKEN = process.env.TOTALCORNER_API_TOKEN?.trim();
const OUT = process.env.PROVIDER_TRIAL_FILE || '/tmp/provider-trial.jsonl';

const BETS_INPLAY_MS = Number(process.env.BETSAPI_POLL_MS || 30000);
const BETS_DETAIL_MS = Number(process.env.BETSAPI_DETAIL_EVERY_MS || 60000);
const BETS_UPCOMING_MS = Number(process.env.BETSAPI_UPCOMING_EVERY_MS || 300000);
const BETS_MAX_DETAILS = Number(process.env.BETSAPI_MAX_DETAILS || 20);

const TC_INPLAY_MS = Number(process.env.TOTALCORNER_POLL_MS || 30000);
const TC_DETAIL_MS = Number(process.env.TOTALCORNER_DETAIL_EVERY_MS || 60000);
const TC_SLOW_MS = Number(process.env.TOTALCORNER_SLOW_EVERY_MS || 300000);
const TC_MAX_DETAILS = Number(process.env.TOTALCORNER_MAX_DETAILS || 10);

const SCORETREND_MS = Number(process.env.SCORETREND_POLL_MS || 30000);
const SCORETREND_SLOW_MS = Number(process.env.SCORETREND_SLOW_EVERY_MS || 300000);

const TC_LIVE_COLUMNS = [
  'events','odds','asian','cornerLine','cornerLineHalf','goalLine','goalLineHalf',
  'asianCorner','attacks','dangerousAttacks','shotOn','shotOff','possession','userRemarks'
].join(',');
const TC_ODDS_COLUMNS = [
  'asianList','goalList','cornerList','oddsList',
  'asianHalfList','goalHalfList','cornerHalfList','oddsHalfList'
].join(',');

let records = 0;
let lastError = null;
let last = {
  bets_inplay:0,bets_detail:0,bets_upcoming:0,
  tc_inplay:0,tc_detail:0,tc_slow:0,
  scoretrend:0,scoretrend_slow:0
};
let betsEventIds = [];
let tcMatchIds = [];

fs.mkdirSync(path.dirname(OUT), { recursive: true });

function write(type, payload) {
  const row = { ts: new Date().toISOString(), type, payload };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  records++;
}

async function fetchJson(url, headers = {}) {
  const started = Date.now();
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 50000) }; }
  return { status: res.status, latency_ms: Date.now() - started, body };
}

async function betsApi(pathname, params = {}) {
  if (!BETS_TOKEN) throw new Error('missing BETSAPI_TOKEN');
  const url = new URL('https://api.b365api.com' + pathname);
  url.searchParams.set('token', BETS_TOKEN);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  return fetchJson(url);
}

async function tcApi(pathname, params = {}) {
  if (!TC_TOKEN) throw new Error('missing TOTALCORNER_API_TOKEN');
  const url = new URL('https://api.totalcorner.com/v1' + pathname);
  url.searchParams.set('token', TC_TOKEN);
  for (const [k,v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  return fetchJson(url);
}

async function collectBetsInplay() {
  const r = await betsApi('/v1/bet365/inplay_filter');
  write('betsapi_inplay_filter', { status:r.status, latency_ms:r.latency_ms, body:r.body });
  const arr = Array.isArray(r.body?.results) ? r.body.results : [];
  betsEventIds = arr
    .filter(x => String(x?.sport_id ?? '') === '1')
    .map(x => x?.id ?? x?.FI)
    .filter(Boolean)
    .slice(0, BETS_MAX_DETAILS);
  last.bets_inplay = Date.now();
}

async function collectBetsDetails() {
  for (const FI of betsEventIds) {
    try {
      const r = await betsApi('/v1/bet365/event', { FI, stats:1 });
      write('betsapi_event_stats', { FI, status:r.status, latency_ms:r.latency_ms, body:r.body });
    } catch (e) {
      write('betsapi_event_stats_error', { FI, error:String(e?.message || e) });
    }
  }
  last.bets_detail = Date.now();
}

async function collectBetsUpcoming() {
  const r = await betsApi('/v1/bet365/upcoming', { sport_id:1 });
  write('betsapi_upcoming', { status:r.status, latency_ms:r.latency_ms, body:r.body });
  last.bets_upcoming = Date.now();
}

async function collectTcInplay() {
  const r = await tcApi('/match/today', { type:'inplay', columns:TC_LIVE_COLUMNS });
  write('totalcorner_today_inplay', { status:r.status, latency_ms:r.latency_ms, body:r.body });
  const data = Array.isArray(r.body?.data) ? r.body.data
    : Array.isArray(r.body?.data?.matches) ? r.body.data.matches : [];
  tcMatchIds = data.map(x => x?.id).filter(Boolean).slice(0, TC_MAX_DETAILS);
  last.tc_inplay = Date.now();
}

async function collectTcDetails() {
  for (const id of tcMatchIds) {
    try {
      const v = await tcApi('/match/view/' + encodeURIComponent(id), { columns:TC_LIVE_COLUMNS });
      write('totalcorner_match_view', { id, status:v.status, latency_ms:v.latency_ms, body:v.body });
      const o = await tcApi('/match/odds/' + encodeURIComponent(id), { columns:TC_ODDS_COLUMNS });
      write('totalcorner_match_odds', { id, status:o.status, latency_ms:o.latency_ms, body:o.body });
    } catch (e) {
      write('totalcorner_match_error', { id, error:String(e?.message || e) });
    }
  }
  last.tc_detail = Date.now();
}

async function collectTcSlow() {
  for (const type of ['upcoming','ended']) {
    const r = await tcApi('/match/today', { type, columns:TC_LIVE_COLUMNS });
    write('totalcorner_today_' + type, { status:r.status, latency_ms:r.latency_ms, body:r.body });
  }
  last.tc_slow = Date.now();
}

async function collectScoreTrend() {
  const r = await fetchJson('https://games.scoretrend.net/');
  write('scoretrend_games', { status:r.status, latency_ms:r.latency_ms, body:r.body });
  last.scoretrend = Date.now();
}

async function collectScoreTrendSlow() {
  const day = new Date().toISOString().slice(0,10);
  const endpoints = [
    ['scoretrend_terminated','https://api.scoretrend.net/v1/get_terminated_games?date=' + day],
    ['scoretrend_upcoming','https://api.scoretrend.net/full_upc_games/' + day + '?page=1']
  ];
  for (const [type,url] of endpoints) {
    try {
      const r = await fetchJson(url);
      write(type, { status:r.status, latency_ms:r.latency_ms, body:r.body });
    } catch (e) {
      write(type + '_error', { error:String(e?.message || e) });
    }
  }
  last.scoretrend_slow = Date.now();
}

async function loop() {
  try {
    const now = Date.now();

    if (BETS_TOKEN && now - last.bets_inplay >= BETS_INPLAY_MS) await collectBetsInplay();
    if (BETS_TOKEN && betsEventIds.length && now - last.bets_detail >= BETS_DETAIL_MS) await collectBetsDetails();
    if (BETS_TOKEN && now - last.bets_upcoming >= BETS_UPCOMING_MS) await collectBetsUpcoming();

    if (TC_TOKEN && now - last.tc_inplay >= TC_INPLAY_MS) await collectTcInplay();
    if (TC_TOKEN && tcMatchIds.length && now - last.tc_detail >= TC_DETAIL_MS) await collectTcDetails();
    if (TC_TOKEN && now - last.tc_slow >= TC_SLOW_MS) await collectTcSlow();

    if (now - last.scoretrend >= SCORETREND_MS) await collectScoreTrend();
    if (now - last.scoretrend_slow >= SCORETREND_SLOW_MS) await collectScoreTrendSlow();

    lastError = null;
  } catch (e) {
    lastError = String(e?.message || e);
    write('collector_error', { error:lastError });
  }
}

setInterval(() => loop().catch(() => {}), 5000).unref();
loop().catch(() => {});

http.createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({
      ok: !lastError,
      betsapi_token_present:Boolean(BETS_TOKEN),
      totalcorner_token_present:Boolean(TC_TOKEN),
      records,
      file_bytes:fs.existsSync(OUT) ? fs.statSync(OUT).size : 0,
      last:Object.fromEntries(Object.entries(last).map(([k,v]) => [k, v ? new Date(v).toISOString() : null])),
      bets_detail_events:betsEventIds.length,
      totalcorner_detail_matches:tcMatchIds.length,
      last_error:lastError
    }));
  }
  if (req.url === '/export') {
    if (!fs.existsSync(OUT)) { res.statusCode = 404; return res.end('no data yet'); }
    res.setHeader('content-type', 'application/x-ndjson');
    res.setHeader('content-disposition', 'attachment; filename="provider-trial.jsonl"');
    return fs.createReadStream(OUT).pipe(res);
  }
  res.statusCode = 404;
  res.end('not found');
}).listen(PORT, () => {
  console.log('PROVIDER_TRIAL_COLLECTOR_READY ' + JSON.stringify({
    port:PORT,
    betsapi_token_present:Boolean(BETS_TOKEN),
    totalcorner_token_present:Boolean(TC_TOKEN),
    bets_inplay_ms:BETS_INPLAY_MS,
    tc_inplay_ms:TC_INPLAY_MS,
    scoretrend_ms:SCORETREND_MS,
    tc_max_details:TC_MAX_DETAILS,
    bets_max_details:BETS_MAX_DETAILS
  }));
});
