import './provider-trial-freeze-startup.mjs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { createEverythingRuntime } from './lib/betsapi-everything.mjs';
import { initReconciliation, normalizeTrialRows, persistNormalizedBatch, reconciliationSummary, rebuildOddsV3FromRaw, ensureRawRecordsAppendOnly, rawRecordsAppendOnlyStatus } from './lib/provider-trial-reconciliation.mjs';
import { assessPersistenceHealth } from './lib/provider-trial-health.mjs';
import { createOrReadFreezeBoundary, exportMetadata, streamDatasetNdjsonGzip, isSafeExportDatasetName, isExportAuthorized } from './lib/provider-trial-final-export.mjs';
import { runFinalFileExport } from './provider-trial-final-file-export.mjs';

const PORT = Number(process.env.PORT || 10000);
const BETS_TOKEN = process.env.BETSAPI_TOKEN?.trim();
const TC_TOKEN = process.env.TOTALCORNER_API_TOKEN?.trim();
const OUT = process.env.PROVIDER_TRIAL_FILE || '/tmp/provider-trial.jsonl';
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const INSTANCE_ID = crypto.randomUUID();
const KEEPALIVE_URL = (process.env.PROVIDER_TRIAL_KEEPALIVE_URL || 'https://betsapi-trial-collector.onrender.com/healthz').trim();
const KEEPALIVE_MS = Number(process.env.PROVIDER_TRIAL_KEEPALIVE_MS || 600000);
const EXPORT_TOKEN = process.env.PROVIDER_TRIAL_EXPORT_TOKEN?.trim();

const BETS_LEGACY_ENABLED = String(process.env.BETSAPI_LEGACY_ENABLED || 'true').toLowerCase() === 'true';
const BETS_INPLAY_MS = Number(process.env.BETSAPI_POLL_MS || 30000);
const BETS_DETAIL_MS = Number(process.env.BETSAPI_DETAIL_EVERY_MS || 60000);
const BETS_UPCOMING_MS = Number(process.env.BETSAPI_UPCOMING_EVERY_MS || 300000);
const BETS_MAX_DETAILS = Number(process.env.BETSAPI_MAX_DETAILS || 20);

const TC_INPLAY_MS = Number(process.env.TOTALCORNER_POLL_MS || 30000);
const TC_DETAIL_MS = Number(process.env.TOTALCORNER_DETAIL_EVERY_MS || 60000);
const TC_SLOW_MS = Number(process.env.TOTALCORNER_SLOW_EVERY_MS || 300000);
const TC_MAX_DETAILS = Number(process.env.TOTALCORNER_MAX_DETAILS || 10);

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
  everything_discovery:0,everything_prematch:0,everything_full_catalog:0,recon_census:0,recon_history:0,recon_odds:0
};
let betsEventIds = [];
let tcMatchIds = [];
let everythingFullCatalogRunning = false;
let oddsRebuildRunning = false;
let oddsRebuildLastError = null;
let shuttingDown = false;
const SHUTDOWN_FLUSH_RETRIES = Number(process.env.PROVIDER_TRIAL_SHUTDOWN_FLUSH_RETRIES || 8);
const SHUTDOWN_FLUSH_DELAY_MS = Number(process.env.PROVIDER_TRIAL_SHUTDOWN_FLUSH_DELAY_MS || 500);

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
  await ensureRawRecordsAppendOnly(dbPool);
  dbReady = true;
  oddsRebuildRunning = true;
  rebuildOddsV3FromRaw(dbPool)
    .then(() => { oddsRebuildLastError = null; })
    .catch(error => { oddsRebuildLastError = sanitizeError(error); })
    .finally(() => { oddsRebuildRunning = false; });
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
  if (shuttingDown) return false;
  const row = { ts: new Date().toISOString(), instance_id: INSTANCE_ID, type, payload };
  fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
  records++;
  if (DATABASE_URL) persistQueue.push(row);
  return true;
}


let everythingRuntime=null;

async function loadEverythingRateState() {
  if (!dbReady || !dbPool) return null;
  const {rows}=await dbPool.query(
    `SELECT value FROM provider_trial.reconciliation_state WHERE key='betsapi_rate_state_v1'`
  );
  return rows[0]?.value || null;
}

async function persistEverythingRateState(state) {
  if (!dbReady || !dbPool) throw new Error('rate-state database not ready');
  await dbPool.query(`
    INSERT INTO provider_trial.reconciliation_state(key,value,updated_at)
    VALUES('betsapi_rate_state_v1',$1::jsonb,now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()
  `,[JSON.stringify(state)]);
}

async function loadEverythingCensusState() {
  if (!dbReady || !dbPool) return null;
  const {rows}=await dbPool.query(
    `SELECT value FROM provider_trial.reconciliation_state WHERE key='betsapi_census_state_v1'`
  );
  return rows[0]?.value || null;
}

async function persistEverythingCensusState(state) {
  if (!dbReady || !dbPool) throw new Error('census-state database not ready');
  await dbPool.query(`
    INSERT INTO provider_trial.reconciliation_state(key,value,updated_at)
    VALUES('betsapi_census_state_v1',$1::jsonb,now())
    ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()
  `,[JSON.stringify(state)]);
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


async function reconciliationCertificate() {
  if (!dbReady || !dbPool) return {result:'NOT_CERTIFIED',version:2,gates:{database_query_ok:false}};

  const databaseProbe=await dbPool.query('SELECT 1 AS ok');
  const rawStatus=await rawRecordsAppendOnlyStatus(dbPool);
  const [
    summary,
    sports,
    competitions,
    coverage,
    odds,
    oddsSummary,
    states,
    classification
  ]=await Promise.all([
    reconciliationSummary(dbPool),
    dbPool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE documented)::int AS documented FROM provider_trial.sports WHERE provider='betsapi'`),
    dbPool.query(`SELECT count(*)::int AS total,count(DISTINCT NULLIF(country_code,''))::int AS countries,count(*) FILTER(WHERE country_code='')::int AS unknown_country FROM provider_trial.competitions WHERE provider='betsapi'`),
    dbPool.query(`SELECT count(*)::int AS rows,count(*) FILTER(WHERE earliest_event_time IS NOT NULL)::int AS with_real_history,min(earliest_event_time) AS earliest,max(latest_event_time) AS latest,min(provider_history_floor) AS documented_floor FROM provider_trial.coverage WHERE provider='betsapi'`),
    dbPool.query(`SELECT count(*)::bigint AS observations,count(DISTINCT event_id)::bigint AS events,count(DISTINCT market_key)::bigint AS markets,count(*) FILTER(WHERE sport_id IS NULL)::bigint AS missing_sport,count(*) FILTER(WHERE league_id IS NULL)::bigint AS missing_league,count(*) FILTER(WHERE bookmaker IS NULL)::bigint AS missing_bookmaker,count(*) FILTER(WHERE provider_time IS NULL)::bigint AS missing_provider_time FROM provider_trial.odds_observations WHERE provider='betsapi'`),
    dbPool.query(`SELECT count(*)::bigint AS rows,count(*) FILTER(WHERE opening_price IS NOT NULL)::bigint AS with_opening,count(*) FILTER(WHERE closing_price IS NOT NULL)::bigint AS with_closing,count(*) FILTER(WHERE change_open_latest IS NOT NULL)::bigint AS with_change FROM provider_trial.odds_summary WHERE provider='betsapi'`),
    dbPool.query(`SELECT key,value,updated_at FROM provider_trial.reconciliation_state WHERE key IN ('odds_parser_version','odds_v3_raw_rebuild','betsapi_rate_state_v1')`),
    dbPool.query(`
      SELECT
        count(*) FILTER (WHERE country_status NOT IN ('known','unknown_unverified'))::int AS bad_country_status,
        count(*) FILTER (WHERE history_status NOT IN ('observed','pending_scan'))::int AS bad_history_status
      FROM (
        SELECT
          CASE WHEN country_code='' THEN 'unknown_unverified' ELSE 'known' END AS country_status,
          CASE WHEN EXISTS (
            SELECT 1 FROM provider_trial.coverage v
            WHERE v.provider=c.provider
              AND v.sport_id::text=c.sport_id::text
              AND v.country_code=c.country_code
              AND v.league_id::text=c.league_id::text
              AND v.earliest_event_time IS NOT NULL
          ) THEN 'observed' ELSE 'pending_scan' END AS history_status
        FROM provider_trial.competitions c
        WHERE c.provider='betsapi'
      ) q
    `)
  ]);

  const sportRow=sports.rows[0]||{};
  const compRow=competitions.rows[0]||{};
  const covRow=coverage.rows[0]||{};
  const oddsRow=odds.rows[0]||{};
  const os=oddsSummary.rows[0]||{};
  const classRow=classification.rows[0]||{};
  const state=Object.fromEntries(states.rows.map(r=>[r.key,{...r.value,updated_at:r.updated_at}]));
  const documentedFloor=covRow.documented_floor
    ? new Date(covRow.documented_floor).toISOString().slice(0,10)
    : null;
  const oddsStructureClassified=
    Number(oddsRow.missing_sport||0)===0 &&
    Number(oddsRow.missing_bookmaker||0)===0 &&
    Number(oddsRow.missing_provider_time||0)===0 &&
    Number(oddsRow.markets||0)>1;
  const trialRuntimeConfigured=
    String(process.env.PROVIDER_TRIAL_MODE||'').toLowerCase()==='true' &&
    String(process.env.BETSAPI_PRODUCTION_ENABLED||'false').toLowerCase()!=='true';
  const census=everythingRuntime?.censusStatus?.() || {};
  const coverageFraction=Number(compRow.total||0)>0
    ? Number(covRow.with_real_history||0)/Number(compRow.total||1)
    : 0;

  const persistenceHealth=assessPersistenceHealth({
    dbReady,
    lastPersistError,
    lastPersistAt,
    queueLength:persistQueue.length
  });

  const gates={
    database_query_ok:databaseProbe.rows[0]?.ok===1,
    documented_sport_registry_seeded:Number(sportRow.documented||0)===28,
    competition_registry_present:Number(compRow.total||0)>0,
    country_values_present:Number(compRow.countries||0)>0,
    history_scanner_has_real_evidence:Number(covRow.with_real_history||0)>0,
    documented_history_floor_recorded:documentedFloor==='2016-09-01',
    odds_parser_v3:state.odds_parser_version?.version==='3',
    raw_odds_rebuild_complete:!oddsRebuildRunning && oddsRebuildLastError===null && state.odds_v3_raw_rebuild?.complete===true && state.odds_v3_raw_rebuild?.version===3,
    odds_present:Number(oddsRow.observations||0)>0,
    real_market_keys:Number(oddsRow.markets||0)>1,
    odds_opening_present:Number(os.with_opening||0)>0,
    odds_change_present:Number(os.with_change||0)>0,
    odds_structure_classified:oddsStructureClassified,
    unknown_dimensions_classified:
      Number(classRow.bad_country_status||0)===0 &&
      Number(classRow.bad_history_status||0)===0,
    persistence_healthy:persistenceHealth.healthy,
    raw_table_exists:rawStatus.raw_table_exists===true,
    raw_append_only_enforced:rawStatus.append_only_trigger_enabled===true,
    persistent_rate_state_present:Boolean(state.betsapi_rate_state_v1?.budget?.window_started_at),
    legacy_bet365_disabled:!BETS_LEGACY_ENABLED,
    full_catalog_probe_disabled:!EVERYTHING_FULL_CATALOG_ENABLED,
    trial_runtime_configured:trialRuntimeConfigured
  };

  const required=Object.values(gates).every(Boolean);
  return {
    result:required?'CERTIFIED_FOR_PASSIVE_COLLECTION_V2':'NOT_CERTIFIED',
    version:2,
    generated_at:new Date().toISOString(),
    commit:process.env.RENDER_GIT_COMMIT||null,
    gates,
    non_gate_metrics:{
      census_completed_sports:Number(census.completed_sports||0),
      census_total_sports:Number(census.total_sports||28),
      competition_history_coverage_fraction:coverageFraction,
      competition_history_coverage_complete:
        Number(covRow.with_real_history||0)===Number(compRow.total||0),
      unknown_country_competitions:Number(compRow.unknown_country||0),
      runtime_service_name:process.env.RENDER_SERVICE_NAME||null,
      runtime_git_branch:process.env.RENDER_GIT_BRANCH||null
    },
    metrics:{
      sports:{...sportRow,meaning:'documented registry seed, not completed census'},
      competitions:compRow,
      coverage:{...covRow,documented_floor_date:documentedFloor},
      odds:{
        ...oddsRow,
        missing_league_status:Number(oddsRow.missing_league||0)>0?'unknown_unverified_present':'none',
        structure_classified:oddsStructureClassified
      },
      odds_summary:os,
      raw:rawStatus,
      rate_state:state.betsapi_rate_state_v1||null,
      state,
      collector:{
        everything_enabled:EVERYTHING_ENABLED,
        census_enabled:RECON_CENSUS_ENABLED,
        history_enabled:RECON_HISTORY_ENABLED,
        odds_enabled:RECON_ODDS_ENABLED,
        full_catalog_enabled:EVERYTHING_FULL_CATALOG_ENABLED,
        legacy_bet365_enabled:BETS_LEGACY_ENABLED,
        persist_failures_historical:persistFailures,
        last_persist_error:lastPersistError,
        last_persist_at:lastPersistAt,
        queued_records:persistQueue.length,
        persistence_health:persistenceHealth
      }
    },
    summary
  };
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

const persistedEverythingRateState=await loadEverythingRateState().catch(error=>{
  lastPersistError=sanitizeError(error);
  return null;
});
const persistedEverythingCensusState=await loadEverythingCensusState().catch(error=>{
  lastPersistError=sanitizeError(error);
  return null;
});
everythingRuntime=createEverythingRuntime({
  env:process.env,
  write:(type,payload)=>write(type,payload),
  initialRateState:persistedEverythingRateState,
  persistRateState:persistEverythingRateState,
  initialCensusState:persistedEverythingCensusState,
  persistCensusState:persistEverythingCensusState
});

loop().catch(() => {});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function drainPersistenceQueue() {
  let attempts = 0;
  let stableFailure = null;
  while (persistQueue.length > 0 && attempts < SHUTDOWN_FLUSH_RETRIES) {
    const before = persistQueue.length;
    const failuresBefore = persistFailures;
    await flushPersistence();
    if (persistQueue.length === 0) break;
    if (persistFailures > failuresBefore || persistQueue.length >= before) {
      stableFailure = lastPersistError || 'persistence queue did not drain';
    } else {
      stableFailure = null;
    }
    attempts++;
    if (persistQueue.length > 0) await sleep(SHUTDOWN_FLUSH_DELAY_MS);
  }
  return {
    drained: persistQueue.length === 0,
    attempts,
    remaining: persistQueue.length,
    last_error: stableFailure || lastPersistError
  };
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  let drain = { drained: persistQueue.length === 0, attempts: 0, remaining: persistQueue.length, last_error: null };
  try {
    drain = await drainPersistenceQueue();
    if (dbPool) await dbPool.end();
  } finally {
    console.log('PROVIDER_TRIAL_COLLECTOR_STOP ' + JSON.stringify({
      signal,
      records,
      persisted_records:persistedRecords,
      queued_records:persistQueue.length,
      persist_failures:persistFailures,
      shutdown_drain:drain
    }));
    process.exit(drain.drained ? 0 : 1);
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
      reconciliation_odds_rebuild:{
        running:oddsRebuildRunning,
        last_error:oddsRebuildLastError
      },
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
  const bind=n=>String.fromCharCode(36)+n;
  const params=[]; const where=[];
  if (provider) { params.push(provider); where.push('c.provider='+bind(params.length)); }
  if (sportId) { params.push(sportId); where.push('c.sport_id::text='+bind(params.length)); }
  if (country) { params.push(country); where.push('c.country_code='+bind(params.length)); }
  params.push(limit);
  const q=[
    'SELECT c.provider,c.sport_id,s.sport_name,c.country_code,c.league_id,c.league_name,',
    "       CASE WHEN c.country_code='' THEN 'unknown_unverified' ELSE 'known' END AS country_status,",
    "       CASE WHEN v.earliest_event_time IS NULL THEN 'pending_scan' ELSE 'observed' END AS history_status,",
    '       extract(year from v.earliest_event_time)::int AS earliest_year,',
    '       extract(year from v.latest_event_time)::int AS latest_year,',
    '       v.earliest_event_time,v.latest_event_time,v.provider_history_floor,v.event_count,',
    '       c.first_seen_at,c.last_seen_at',
    'FROM provider_trial.competitions c',
    'LEFT JOIN provider_trial.sports s ON s.provider=c.provider AND s.sport_id::text=c.sport_id::text',
    'LEFT JOIN provider_trial.coverage v ON v.provider=c.provider AND v.sport_id::text=c.sport_id::text AND v.country_code=c.country_code AND v.league_id::text=c.league_id::text',
    where.length?'WHERE '+where.join(' AND '):'',
    'ORDER BY c.provider,s.sport_name,c.country_code,c.league_name',
    'LIMIT '+bind(params.length)
  ].filter(Boolean).join('\n');
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
  const bind=n=>String.fromCharCode(36)+n;
  const params=[]; const where=[];
  for (const [col,val] of [['event_id',eventId],['provider',provider],['sport_id',sportId],['league_id',leagueId],['market_key',market]]) {
    if (!val) continue;
    params.push(val);
    const cast=(col==='sport_id'||col==='league_id'||col==='event_id')?'::text':'';
    where.push('s.'+col+cast+'='+bind(params.length));
  }
  params.push(limit);
  const q=[
    "SELECT s.*, CASE WHEN COALESCE(s.country_code,'')='' THEN 'unknown_unverified' ELSE 'known' END AS country_status, CASE WHEN s.league_id IS NULL THEN 'unknown_unverified' ELSE 'known' END AS league_status FROM provider_trial.odds_summary s",
    where.length?'WHERE '+where.join(' AND '):'',
    'ORDER BY last_observed_at DESC',
    'LIMIT '+bind(params.length)
  ].filter(Boolean).join('\n');
  try {
    const {rows}=await dbPool.query(q,params);
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
        SELECT observed_at,provider,source_type,sport_id,country_code,league_id,league_name,event_id,kickoff_utc,phase,bookmaker,market_key,selection_key,line_value,price,provider_time,raw_path,
               CASE WHEN COALESCE(country_code,'')='' THEN 'unknown_unverified' ELSE 'known' END AS country_status,
               CASE WHEN league_id IS NULL THEN 'unknown_unverified' ELSE 'known' END AS league_status
        FROM provider_trial.odds_observations
        WHERE event_id=$1
        ORDER BY COALESCE(provider_time,observed_at),market_key,selection_key
        LIMIT $2`,[eventId,limit]);
      return res.end(JSON.stringify({ok:true,count:rows.length,rows}));
    } catch(error) {
      res.statusCode=500;
      return res.end(JSON.stringify({ok:false,error:sanitizeError(error)}));
    }
  }
  if (new URL(req.url,'http://localhost').pathname === '/reconciliation/certificate') {
    res.setHeader('content-type','application/json');
    try {
      return res.end(JSON.stringify(await reconciliationCertificate()));
    } catch(error) {
      res.statusCode=500;
      return res.end(JSON.stringify({result:'NOT_CERTIFIED',error:sanitizeError(error)}));
    }
  }
  const requestUrl = new URL(req.url,'http://localhost');
  const exportAuthorized = isExportAuthorized(req.headers, EXPORT_TOKEN);
  if (requestUrl.pathname.startsWith('/final-export/')) {
    res.setHeader('cache-control','no-store');
    if (!exportAuthorized) {
      res.statusCode=401;
      res.setHeader('content-type','application/json');
      return res.end(JSON.stringify({ok:false,error:'unauthorized'}));
    }
    if (!dbReady || !dbPool) {
      res.statusCode=503;
      res.setHeader('content-type','application/json');
      return res.end(JSON.stringify({ok:false,error:'database_not_ready'}));
    }
    try {
      if (requestUrl.pathname === '/final-export/freeze') {
        const freeze=await createOrReadFreezeBoundary(dbPool,{
          collector_commit:process.env.RENDER_GIT_COMMIT||null,
          render_service:process.env.RENDER_SERVICE_NAME||null,
          export_contract:'2026-10-06-v1'
        });
        res.setHeader('content-type','application/json');
        return res.end(JSON.stringify({ok:true,freeze}));
      }
      if (requestUrl.pathname === '/final-export/meta') {
        res.setHeader('content-type','application/json');
        return res.end(JSON.stringify({ok:true,...await exportMetadata(dbPool)}));
      }
      if (requestUrl.pathname === '/final-export/stream') {
        const name=requestUrl.searchParams.get('name')||'';
        if (!isSafeExportDatasetName(name)) {
          res.statusCode=400;
          res.setHeader('content-type','application/json');
          return res.end(JSON.stringify({ok:false,error:'invalid_dataset'}));
        }
        const excludeScoretrend=requestUrl.searchParams.get('exclude_scoretrend')==='true';
        return await streamDatasetNdjsonGzip(dbPool,res,name,{excludeScoretrend});
      }
      res.statusCode=404;
      res.setHeader('content-type','application/json');
      return res.end(JSON.stringify({ok:false,error:'not_found'}));
    } catch(error) {
      res.statusCode=500;
      res.setHeader('content-type','application/json');
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
    database_configured:Boolean(DATABASE_URL),
    tc_max_details:TC_MAX_DETAILS,
    bets_max_details:BETS_MAX_DETAILS
  }));
  if (dbReady && dbPool) {
    setTimeout(() => runFinalFileExport(dbPool).catch(error => {
      console.error('PROVIDER_TRIAL_EXPORT_ERROR ' + sanitizeError(error));
    }), 1000).unref();
  }
});
