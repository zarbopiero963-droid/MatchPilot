import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { createEverythingRuntime } from './lib/betsapi-everything.mjs';
import { initReconciliation, normalizeTrialRows, persistNormalizedBatch, reconciliationSummary } from './lib/provider-trial-reconciliation.mjs';

const PORT = Number(process.env.PORT || 10000);
const BETS_TOKEN = process.env.BETSAPI_TOKEN?.trim();
const TC_TOKEN = process.env.TOTALCORNER_API_TOKEN?.trim();
const OUT = process.env.PROVIDER_TRIAL_FILE || '/tmp/provider-trial.jsonl';
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const INSTANCE_ID = crypto.randomUUID();
const KEEPALIVE_URL = (process.env.PROVIDER_TRIAL_KEEPALIVE_URL || 'https://betsapi-trial-collector.onrender.com/healthz').trim();
const KEEPALIVE_MS = Number(process.env.PROVIDER_TRIAL_KEEPALIVE_MS || 600000);

const BETS_LEGACY_ENABLED = String(process.env.BETSAPI_LEGACY_ENABLED || 'true').toLowerCase() === 'true';
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
const EVERYTHING_ENABLED = String(process.env.BETSAPI_EVERYTHING_ENABLED || '').toLowerCase() === 'true';
const EVERYTHING_DISCOVERY_MS = Number(process.env.BETSAPI_EVERYTHING_DISCOVERY_MS || 60000);
const EVERYTHING_PREMATCH_MS = Number(process.env.BETSAPI_EVERYTHING_PREMATCH_MS || 300000);
const EVERYTHING_FULL_CATALOG_ENABLED = String(process.env.BETSAPI_EVERYTHING_FULL_CATALOG || '').toLowerCase() === 'true';
const EVERYTHING_FULL_CATALOG_MS = Number(process.env.BETSAPI_EVERYTHING_FULL_CATALOG_MS || 300000);
const RECON_CENSUS_ENABLED = String(process.env.PROVIDER_TRIAL_CENSUS_ENABLED || '').toLowerCase() === 'true';
const RECON_CENSUS_MS = Number(process.env.PROVIDER_TRIAL_CENSUS_MS || 60000);
const RECON_HISTORY_ENABLED = String(process.env.PROVIDER_TRIAL_HISTORY_ENABLED || '').toLowerCase() === 'true';
const RECON_HISTORY_MS = Number(process.env.PROVIDER_TRIAL_HISTORY_MS || 60000);
const RECON_ODDS_ENABLED = String(process.env.PROVIDER_TRIAL_ODDS_ENABLED || '').toLowerCase() === 'true';
const RECON_ODDS_MS = Number(process.env.PROVIDER_TRIAL_ODDS_MS || 60000);
const RECON_ODDS_MAX_EVENTS = Number(process.env.PROVIDER_TRIAL_ODDS_MAX_EVENTS || 8);

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
let dbPool = null;
let dbReady = false;
let persistQueue = [];
let persistedRecords = 0;
let persistFailures = 0;
let lastPersistAt = null;
let lastPersistError = null;
let flushing = false;
let cumulativeMetrics = null;
let cumulativeMetricsAt = null;
let cumulativeMetricsError = null;
let keepaliveAttempts = 0;
let keepaliveSuccesses = 0;
let keepaliveFailures = 0;
let lastKeepaliveAt = null;
let lastKeepaliveStatus = null;
let lastKeepaliveError = null;
let last = {
  bets_inplay:0,bets_detail:0,bets_upcoming:0,
  tc_inplay:0,tc_detail:0,tc_slow:0,
  scoretrend:0,scoretrend_slow:0,
  everything_discovery:0,everything_prematch:0,everything_full_catalog:0,recon_census:0,recon_history:0,recon_odds:0
};
let betsEventIds = [];
let tcMatchIds = [];
let everythingFullCatalogRunning = false;

fs.mkdirSync(path.dirname(OUT), { recursive: true });

function sanitizeError(error) {
  return String(error?.message || error)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/token=[^&\s]+/gi, 'token=[REDACTED]');
}

async function initPersistence() {
  if (!DATABASE_URL) return;
  dbPool = new pg.Pool({
    connectionString: DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000
  });
  dbPool.on('error', error => {
    lastPersistError = sanitizeError(error);
    persistFailures++;
  });
  await dbPool.query(`
    CREATE SCHEMA IF NOT EXISTS provider_trial;
    CREATE TABLE IF NOT EXISTS provider_trial.records (
      record_id bigserial PRIMARY KEY,
      observed_at timestamptz NOT NULL,
      instance_id text NOT NULL,
      source_type text NOT NULL,
      payload jsonb NOT NULL,
      persisted_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS provider_trial_records_observed_idx
      ON provider_trial.records(observed_at DESC);
    CREATE INDEX IF NOT EXISTS provider_trial_records_source_idx
      ON provider_trial.records(source_type, observed_at DESC);
  `);
  await initReconciliation(dbPool);
  dbReady = true;
  lastPersistError = null;
}

async function flushPersistence() {
  if (!dbReady || !dbPool || flushing || persistQueue.length === 0) return;
  flushing = true;
  const batch = persistQueue.splice(0, 100);
  try {
    await dbPool.query(
      `INSERT INTO provider_trial.records(observed_at, instance_id, source_type, payload)
       SELECT x.ts::timestamptz, x.instance_id, x.type, x.payload
       FROM jsonb_to_recordset($1::jsonb)
         AS x(ts text, instance_id text, type text, payload jsonb)`,
      [JSON.stringify(batch)]
    );
    const normalized=normalizeTrialRows(batch);
    await persistNormalizedBatch(dbPool,normalized);
    persistedRecords += batch.length;
    lastPersistAt = new Date().toISOString();
    cumulativeMetricsAt = null;
    lastPersistError = null;
  } catch (error) {
    persistQueue = batch.concat(persistQueue);
    persistFailures++;
    lastPersistError = sanitizeError(error);
  } finally {
    flushing = false;
  }
}

async function refreshCumulativeMetrics(force = false) {
  if (!dbReady || !dbPool) return null;
  if (!force && cumulativeMetricsAt && Date.now() - Date.parse(cumulativeMetricsAt) < 15000) {
    return cumulativeMetrics;
  }
  try {
    const { rows } = await dbPool.query(`
      SELECT
        count(*)::bigint AS total_records,
        count(DISTINCT instance_id)::bigint AS instances,
        min(observed_at) AS first_observed_at,
        max(observed_at) AS last_observed_at,
        count(*) FILTER (WHERE source_type LIKE 'betsapi_%')::bigint AS betsapi_records,
        count(*) FILTER (WHERE source_type LIKE 'totalcorner_%')::bigint AS totalcorner_records,
        count(*) FILTER (WHERE source_type LIKE 'scoretrend_%')::bigint AS scoretrend_records,
        count(*) FILTER (WHERE source_type = 'collector_error' OR source_type LIKE '%_error')::bigint AS error_records,
        count(*) FILTER (WHERE (payload->>'status')::int = 429)::bigint AS http_429,
        count(*) FILTER (WHERE (payload->>'status')::int >= 500)::bigint AS http_5xx
      FROM provider_trial.records
    `);
    const row = rows[0] || {};
    cumulativeMetrics = {
      total_records:Number(row.total_records || 0),
      instances:Number(row.instances || 0),
      first_observed_at:row.first_observed_at || null,
      last_observed_at:row.last_observed_at || null,
      betsapi_records:Number(row.betsapi_records || 0),
      totalcorner_records:Number(row.totalcorner_records || 0),
      scoretrend_records:Number(row.scoretrend_records || 0),
      error_records:Number(row.error_records || 0),
      http_429:Number(row.http_429 || 0),
      http_5xx:Number(row.http_5xx || 0)
    };
    cumulativeMetricsAt = new Date().toISOString();
    cumulativeMetricsError = null;
    return cumulativeMetrics;
  } catch (error) {
    cumulativeMetricsError = sanitizeError(error);
    return cumulativeMetrics;
  }
}

async function runKeepalive() {
  if (!KEEPALIVE_URL || !Number.isFinite(KEEPALIVE_MS) || KEEPALIVE_MS < 60000) return;
  keepaliveAttempts++;
  lastKeepaliveAt = new Date().toISOString();
  try {
    const res = await fetch(KEEPALIVE_URL, {
      headers:{ 'user-agent':'matchpilot-provider-trial-keepalive/1.0' },
      signal:AbortSignal.timeout(20000)
    });
    lastKeepaliveStatus = res.status;
    if (!res.ok) throw new Error('keepalive HTTP ' + res.status);
    keepaliveSuccesses++;
    lastKeepaliveError = null;
  } catch (error) {
    keepaliveFailures++;
    lastKeepaliveError = sanitizeError(error);
  }
}

function write(type, payload) {
  const row = { ts: new Date().toISOString(), instance_id: INSTANCE_ID, type, payload };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  records++;
  if (DATABASE_URL) persistQueue.push(row);
}


const everythingRuntime = createEverythingRuntime({
  env:process.env,
  write:(type,payload)=>write(type,payload)
});

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


async function runHistoryScan() {
  if (!dbReady || !dbPool || !EVERYTHING_ENABLED) return;
  const {rows}=await dbPool.query(`
    SELECT c.provider,c.sport_id,c.country_code,c.league_id,c.league_name,
           COALESCE((s.value->>'page')::int,1) AS page,
           COALESCE((s.value->>'done')::boolean,false) AS done
    FROM provider_trial.competitions c
    LEFT JOIN provider_trial.reconciliation_state s
      ON s.key='history:'||c.provider||':'||c.sport_id||':'||c.country_code||':'||c.league_id
    WHERE c.provider='betsapi'
      AND COALESCE((s.value->>'done')::boolean,false)=false
    ORDER BY s.updated_at NULLS FIRST,c.sport_id,c.country_code,c.league_id
    LIMIT 2
  `);
  for (const item of rows) {
    const key=['history',item.provider,item.sport_id,item.country_code,item.league_id].join(':');
    const page=Math.max(1,Number(item.page||1));
    const r=await everythingRuntime.callDocumentedEndpoint('events_ended',{
      sport_id:item.sport_id,league_id:item.league_id,page
    });
    const results=Array.isArray(r?.body?.results)?r.body.results:[];
    const done=!r?.ok || results.length===0 || page>=100;
    await dbPool.query(`
      INSERT INTO provider_trial.reconciliation_state(key,value,updated_at)
      VALUES($1,$2::jsonb,now())
      ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()
    `,[key,JSON.stringify({page:done?page:page+1,done,last_status:r?.status??null,last_count:results.length})]);
  }
}

async function runOddsTimelineScan() {
  if (!dbReady || !dbPool || !EVERYTHING_ENABLED) return;
  const {rows}=await dbPool.query(`
    SELECT e.event_id,e.sport_id,e.kickoff_utc,
           max(e.last_seen_at) AS event_last_seen,
           extract(epoch from max(o.provider_time))::bigint AS since_time
    FROM provider_trial.events e
    LEFT JOIN provider_trial.odds_observations o
      ON o.provider='betsapi' AND o.event_id=e.event_id
    WHERE e.provider='betsapi'
      AND (
        e.kickoff_utc IS NULL OR
        e.kickoff_utc BETWEEN now()-interval '4 hours' AND now()+interval '48 hours'
      )
    GROUP BY e.event_id,e.sport_id,e.kickoff_utc
    ORDER BY e.kickoff_utc NULLS LAST,event_last_seen DESC
    LIMIT $1
  `,[RECON_ODDS_MAX_EVENTS]);
  for (const item of rows) {
    const params={event_id:item.event_id};
    if (item.since_time) params.since_time=Number(item.since_time);
    await everythingRuntime.callDocumentedEndpoint('event_odds',params);
  }
}

async function loop() {
  try {
    const now = Date.now();

    if (BETS_LEGACY_ENABLED && BETS_TOKEN && now - last.bets_inplay >= BETS_INPLAY_MS) await collectBetsInplay();
    if (BETS_LEGACY_ENABLED && BETS_TOKEN && betsEventIds.length && now - last.bets_detail >= BETS_DETAIL_MS) await collectBetsDetails();
    if (BETS_LEGACY_ENABLED && BETS_TOKEN && now - last.bets_upcoming >= BETS_UPCOMING_MS) await collectBetsUpcoming();

    if (TC_TOKEN && now - last.tc_inplay >= TC_INPLAY_MS) await collectTcInplay();
    if (TC_TOKEN && tcMatchIds.length && now - last.tc_detail >= TC_DETAIL_MS) await collectTcDetails();
    if (TC_TOKEN && now - last.tc_slow >= TC_SLOW_MS) await collectTcSlow();

    if (now - last.scoretrend >= SCORETREND_MS) await collectScoreTrend();
    if (now - last.scoretrend_slow >= SCORETREND_SLOW_MS) await collectScoreTrendSlow();

    if (EVERYTHING_ENABLED && now - last.everything_discovery >= EVERYTHING_DISCOVERY_MS) {
      await everythingRuntime.discoveryCycle();
      last.everything_discovery = Date.now();
    }
    if (EVERYTHING_ENABLED && now - last.everything_prematch >= EVERYTHING_PREMATCH_MS) {
      await everythingRuntime.prematchCycle();
      last.everything_prematch = Date.now();
    }
    if (RECON_CENSUS_ENABLED && EVERYTHING_ENABLED && now-last.recon_census>=RECON_CENSUS_MS) {
      await everythingRuntime.censusCycle({pagesPerSport:2});
      last.recon_census=Date.now();
    }
    if (RECON_HISTORY_ENABLED && EVERYTHING_ENABLED && now-last.recon_history>=RECON_HISTORY_MS) {
      await runHistoryScan();
      last.recon_history=Date.now();
    }
    if (RECON_ODDS_ENABLED && EVERYTHING_ENABLED && now-last.recon_odds>=RECON_ODDS_MS) {
      await runOddsTimelineScan();
      last.recon_odds=Date.now();
    }
    if (EVERYTHING_ENABLED && EVERYTHING_FULL_CATALOG_ENABLED && !everythingFullCatalogRunning && now - last.everything_full_catalog >= EVERYTHING_FULL_CATALOG_MS) {
      everythingFullCatalogRunning = true;
      last.everything_full_catalog = now;
      try {
        await everythingRuntime.fullCatalogCycle();
      } finally {
        everythingFullCatalogRunning = false;
      }
    }

    lastError = null;
  } catch (e) {
    lastError = String(e?.message || e);
    write('collector_error', { error:lastError });
  }
}

setInterval(() => loop().catch(() => {}), 5000).unref();
setInterval(() => flushPersistence().catch(error => {
  persistFailures++;
  lastPersistError = sanitizeError(error);
}), 2000).unref();
setInterval(() => runKeepalive().catch(error => {
  keepaliveFailures++;
  lastKeepaliveError = sanitizeError(error);
}), KEEPALIVE_MS).unref();

await initPersistence().catch(error => {
  dbReady = false;
  persistFailures++;
  lastPersistError = sanitizeError(error);
});
loop().catch(() => {});

async function shutdown(signal) {
  try {
    await flushPersistence();
    if (dbPool) await dbPool.end();
  } finally {
    console.log('PROVIDER_TRIAL_COLLECTOR_STOP ' + JSON.stringify({
      signal,
      records,
      persisted_records:persistedRecords,
      queued_records:persistQueue.length,
      persist_failures:persistFailures
    }));
    process.exit(0);
  }
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

http.createServer(async (req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    const cumulative = await refreshCumulativeMetrics();
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({
      ok: !lastError,
      betsapi_token_present:Boolean(BETS_TOKEN),
    betsapi_everything_enabled:EVERYTHING_ENABLED,
    betsapi_everything_token_present:everythingRuntime.status().token_present,
      totalcorner_token_present:Boolean(TC_TOKEN),
      records,
      file_bytes:fs.existsSync(OUT) ? fs.statSync(OUT).size : 0,
      last:Object.fromEntries(Object.entries(last).map(([k,v]) => [k, v ? new Date(v).toISOString() : null])),
      bets_detail_events:betsEventIds.length,
      totalcorner_detail_matches:tcMatchIds.length,
      last_error:lastError,
      betsapi_legacy_enabled:BETS_LEGACY_ENABLED,
      betsapi_everything:everythingRuntime.status(),
      reconciliation_census:everythingRuntime.censusStatus(),
      betsapi_everything_full_catalog:{...everythingRuntime.fullCatalogStatus(),running:everythingFullCatalogRunning},
      keepalive:{
        enabled:Boolean(KEEPALIVE_URL) && Number.isFinite(KEEPALIVE_MS) && KEEPALIVE_MS >= 60000,
        interval_ms:KEEPALIVE_MS,
        attempts:keepaliveAttempts,
        successes:keepaliveSuccesses,
        failures:keepaliveFailures,
        last_at:lastKeepaliveAt,
        last_status:lastKeepaliveStatus,
        last_error:lastKeepaliveError
      },
      persistence:{
        database_configured:Boolean(DATABASE_URL),
    keepalive_enabled:Boolean(KEEPALIVE_URL) && Number.isFinite(KEEPALIVE_MS) && KEEPALIVE_MS >= 60000,
    keepalive_ms:KEEPALIVE_MS,
        database_ready:dbReady,
        schema:'provider_trial',
        table:'records',
        instance_id:INSTANCE_ID,
        queued_records:persistQueue.length,
        persisted_records:persistedRecords,
        persist_failures:persistFailures,
        last_persist_at:lastPersistAt,
        last_persist_error:lastPersistError,
        cumulative,
        cumulative_metrics_at:cumulativeMetricsAt,
        cumulative_metrics_error:cumulativeMetricsError
      }
    }));
  }
  if (req.url === '/everything-catalog') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(everythingRuntime.catalogStatus()));
  }
  if (req.url === '/everything-probe-status') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(everythingRuntime.fullCatalogStatus()));
  }
  if (req.url === '/everything-status') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify(everythingRuntime.status()));
  }
  if (req.url === '/reconciliation/summary') {
    res.setHeader('content-type', 'application/json');
    if (!dbReady || !dbPool) { res.statusCode=503; return res.end(JSON.stringify({ok:false,error:'database_not_ready'})); }
    try {
      return res.end(JSON.stringify({ok:true,summary:await reconciliationSummary(dbPool)}));
    } catch (error) {
      res.statusCode=500;
      return res.end(JSON.stringify({ok:false,error:sanitizeError(error)}));
    }
  }
  if (new URL(req.url,'http://localhost').pathname === '/reconciliation/competitions') {
    res.setHeader('content-type', 'application/json');
    if (!dbReady || !dbPool) { res.statusCode=503; return res.end(JSON.stringify({ok:false,error:'database_not_ready'})); }
    const url=new URL(req.url,'http://localhost');
    const provider=url.searchParams.get('provider');
    const sportId=url.searchParams.get('sport_id');
    const country=url.searchParams.get('country');
    const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit')||200)));
    const params=[]; const where=[];
    if (provider) { params.push(provider); where.push(`c.provider=${params.length}`); }
    if (sportId) { params.push(sportId); where.push(`c.sport_id::text=${params.length}`); }
    if (country) { params.push(country); where.push(`c.country_code=${params.length}`); }
    params.push(limit);
    const q=`
      SELECT c.provider,c.sport_id,s.sport_name,c.country_code,c.league_id,c.league_name,
             v.earliest_event_time,v.latest_event_time,v.provider_history_floor,v.event_count,
             c.first_seen_at,c.last_seen_at
      FROM provider_trial.competitions c
      LEFT JOIN provider_trial.sports s ON s.provider=c.provider AND s.sport_id::text=c.sport_id::text
      LEFT JOIN provider_trial.coverage v ON v.provider=c.provider AND v.sport_id::text=c.sport_id::text AND v.country_code=c.country_code AND v.league_id::text=c.league_id::text
      ${where.length?'WHERE '+where.join(' AND '):''}
      ORDER BY c.provider,s.sport_name,c.country_code,c.league_name
      LIMIT ${params.length}`;
    try {
      const {rows}=await dbPool.query(q,params);
      return res.end(JSON.stringify({ok:true,count:rows.length,rows}));
    } catch(error) {
      res.statusCode=500;
      return res.end(JSON.stringify({ok:false,error:sanitizeError(error)}));
    }
  }
  if (new URL(req.url,'http://localhost').pathname === '/reconciliation/odds') {
    res.setHeader('content-type', 'application/json');
    if (!dbReady || !dbPool) { res.statusCode=503; return res.end(JSON.stringify({ok:false,error:'database_not_ready'})); }
    const url=new URL(req.url,'http://localhost');
    const eventId=url.searchParams.get('event_id');
    const provider=url.searchParams.get('provider');
    const sportId=url.searchParams.get('sport_id');
    const leagueId=url.searchParams.get('league_id');
    const market=url.searchParams.get('market');
    const limit=Math.min(1000,Math.max(1,Number(url.searchParams.get('limit')||200)));
    const params=[]; const where=[];
    for (const [col,val] of [['event_id',eventId],['provider',provider],['sport_id',sportId],['league_id',leagueId],['market_key',market]]) {
      if (val) {
        params.push(val);
        const cast = (col==='sport_id' || col==='league_id' || col==='event_id') ? '::text' : '';
        where.push(`${col}${cast}=${params.length}`);
      }
    }
    params.push(limit);
    try {
      const {rows}=await dbPool.query(`
        SELECT * FROM provider_trial.odds_summary
        ${where.length?'WHERE '+where.join(' AND '):''}
        ORDER BY last_observed_at DESC
        LIMIT ${params.length}`,params);
      return res.end(JSON.stringify({ok:true,count:rows.length,rows}));
    } catch(error) {
      res.statusCode=500;
      return res.end(JSON.stringify({ok:false,error:sanitizeError(error)}));
    }
  }
  if (new URL(req.url,'http://localhost').pathname === '/reconciliation/odds-timeline') {
    res.setHeader('content-type', 'application/json');
    if (!dbReady || !dbPool) { res.statusCode=503; return res.end(JSON.stringify({ok:false,error:'database_not_ready'})); }
    const url=new URL(req.url,'http://localhost');
    const eventId=url.searchParams.get('event_id');
    if (!eventId) { res.statusCode=400; return res.end(JSON.stringify({ok:false,error:'event_id_required'})); }
    const limit=Math.min(5000,Math.max(1,Number(url.searchParams.get('limit')||1000)));
    try {
      const {rows}=await dbPool.query(`
        SELECT observed_at,provider,source_type,sport_id,country_code,league_id,league_name,event_id,kickoff_utc,phase,bookmaker,market_key,selection_key,line_value,price,provider_time,raw_path
        FROM provider_trial.odds_observations
        WHERE event_id=$1
        ORDER BY observed_at,market_key,selection_key
        LIMIT $2`,[eventId,limit]);
      return res.end(JSON.stringify({ok:true,count:rows.length,rows}));
    } catch(error) {
      res.statusCode=500;
      return res.end(JSON.stringify({ok:false,error:sanitizeError(error)}));
    }
  }
  if (req.url === '/metrics') {
    const cumulative = await refreshCumulativeMetrics(true);
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({
      ok:Boolean(cumulative) && !cumulativeMetricsError,
      persistence:{
        database_configured:Boolean(DATABASE_URL),
        database_ready:dbReady,
        schema:'provider_trial',
        table:'records'
      },
      cumulative,
      refreshed_at:cumulativeMetricsAt,
      error:cumulativeMetricsError
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
    database_configured:Boolean(DATABASE_URL),
    tc_max_details:TC_MAX_DETAILS,
    bets_max_details:BETS_MAX_DETAILS
  }));
});
