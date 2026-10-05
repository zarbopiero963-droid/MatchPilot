import crypto from 'node:crypto';

export const BETSAPI_SPORTS = Object.freeze([
  [1,'Soccer'],[18,'Basketball'],[13,'Tennis'],[91,'Volleyball'],[78,'Handball'],
  [16,'Baseball'],[2,'Horse Racing'],[4,'Greyhounds'],[17,'Ice Hockey'],[14,'Snooker'],
  [12,'American Football'],[3,'Cricket'],[83,'Futsal'],[15,'Darts'],[92,'Table Tennis'],
  [94,'Badminton'],[8,'Rugby Union'],[19,'Rugby League'],[36,'Australian Rules'],
  [66,'Bowls'],[9,'Boxing'],[75,'Gaelic Sports'],[90,'Floorball'],[95,'Beach Volleyball'],
  [110,'Water Polo'],[107,'Squash'],[151,'E-sports'],[162,'MMA/UFC']
].map(([sport_id,name])=>({sport_id,name})));

const SPORT_NAMES=new Map(BETSAPI_SPORTS.map(x=>[String(x.sport_id),x.name]));

export const RECONCILIATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS provider_trial.sports (
  provider text NOT NULL,
  sport_id text NOT NULL,
  sport_name text,
  documented boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  PRIMARY KEY(provider,sport_id)
);
CREATE TABLE IF NOT EXISTS provider_trial.competitions (
  provider text NOT NULL,
  sport_id text NOT NULL,
  country_code text NOT NULL DEFAULT '',
  league_id text NOT NULL,
  league_name text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY(provider,sport_id,country_code,league_id)
);
CREATE TABLE IF NOT EXISTS provider_trial.coverage (
  provider text NOT NULL,
  sport_id text NOT NULL,
  country_code text NOT NULL DEFAULT '',
  league_id text NOT NULL DEFAULT '',
  earliest_event_time timestamptz,
  latest_event_time timestamptz,
  earliest_observed_at timestamptz NOT NULL,
  latest_observed_at timestamptz NOT NULL,
  event_count bigint NOT NULL DEFAULT 0,
  provider_history_floor date,
  PRIMARY KEY(provider,sport_id,country_code,league_id)
);
CREATE TABLE IF NOT EXISTS provider_trial.events (
  provider text NOT NULL,
  event_id text NOT NULL,
  sport_id text,
  country_code text NOT NULL DEFAULT '',
  league_id text,
  league_name text,
  kickoff_utc timestamptz,
  time_status text,
  home_name text,
  away_name text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY(provider,event_id)
);
CREATE INDEX IF NOT EXISTS provider_trial_events_filter_idx
  ON provider_trial.events(provider,sport_id,country_code,league_id,kickoff_utc);
CREATE TABLE IF NOT EXISTS provider_trial.odds_observations (
  observation_id bigserial PRIMARY KEY,
  observation_hash text NOT NULL UNIQUE,
  observed_at timestamptz NOT NULL,
  provider text NOT NULL,
  source_type text NOT NULL,
  sport_id text,
  country_code text,
  league_id text,
  league_name text,
  event_id text,
  kickoff_utc timestamptz,
  phase text NOT NULL,
  bookmaker text,
  market_key text NOT NULL,
  selection_key text NOT NULL,
  line_value text,
  price numeric,
  provider_time timestamptz,
  raw_path text NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_trial_odds_filter_idx
  ON provider_trial.odds_observations(provider,sport_id,country_code,league_id,event_id,market_key,observed_at);
CREATE TABLE IF NOT EXISTS provider_trial.reconciliation_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW provider_trial.odds_summary AS
WITH ranked AS (
  SELECT *,
    row_number() OVER (PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value ORDER BY observed_at) AS rn_open,
    row_number() OVER (PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value ORDER BY observed_at DESC) AS rn_latest,
    row_number() OVER (
      PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value
      ORDER BY CASE WHEN kickoff_utc IS NOT NULL AND observed_at <= kickoff_utc THEN observed_at END DESC NULLS LAST
    ) AS rn_close
  FROM provider_trial.odds_observations
), agg AS (
  SELECT provider,event_id,bookmaker,market_key,selection_key,line_value,
    max(sport_id) AS sport_id,max(country_code) AS country_code,max(league_id) AS league_id,max(league_name) AS league_name,
    max(kickoff_utc) AS kickoff_utc,
    max(price) FILTER (WHERE rn_open=1) AS opening_price,
    max(price) FILTER (WHERE rn_latest=1) AS latest_price,
    max(price) FILTER (WHERE rn_close=1 AND kickoff_utc IS NOT NULL AND observed_at <= kickoff_utc) AS closing_price,
    min(price) AS min_price,max(price) AS max_price,
    min(observed_at) AS first_observed_at,max(observed_at) AS last_observed_at,
    count(*)::bigint AS observations
  FROM ranked
  GROUP BY provider,event_id,bookmaker,market_key,selection_key,line_value
)
SELECT *,
  CASE WHEN opening_price IS NOT NULL AND latest_price IS NOT NULL THEN latest_price-opening_price END AS change_open_latest,
  CASE WHEN opening_price IS NOT NULL AND closing_price IS NOT NULL THEN closing_price-opening_price END AS change_open_close
FROM agg;
`;

export function providerForSource(sourceType='') {
  if (sourceType.startsWith('betsapi_')) return 'betsapi';
  if (sourceType.startsWith('totalcorner_')) return 'totalcorner';
  if (sourceType.startsWith('scoretrend_')) return 'scoretrend';
  return 'unknown';
}

function isoFromEpoch(value) {
  if (value===undefined || value===null || value==='') return null;
  const n=Number(value);
  if (!Number.isFinite(n)) return null;
  const ms=n > 1e12 ? n : n*1000;
  const d=new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clean(value) {
  return value===undefined || value===null ? null : String(value);
}

function eventFact(obj, observedAt, provider) {
  if (!obj || typeof obj!=='object' || Array.isArray(obj)) return null;
  const leagueObj=obj.league && typeof obj.league==='object' ? obj.league : null;
  const sportId=clean(obj.sport_id ?? obj.SportId ?? obj.sportId);
  const leagueId=clean(leagueObj?.id ?? obj.league_id ?? obj.LeagueId ?? obj.competitionId);
  const leagueName=clean(leagueObj?.name ?? obj.league_name ?? obj.LeagueName);
  const countryCode=clean(leagueObj?.cc ?? obj.cc ?? obj.country_code ?? obj.RegionName) || '';
  const looksLikeEvent=Boolean(
    obj.home || obj.away || obj.HomeTeam || obj.AwayTeam ||
    obj.time !== undefined || obj.time_status !== undefined || obj.Date || obj.ss
  );
  const eventId=clean(obj.our_event_id ?? obj.event_id ?? obj.eventId ?? (looksLikeEvent ? (obj.id ?? obj.Id) : null));
  const kickoff=isoFromEpoch(obj.time ?? obj.start_time ?? obj.timestamp) ||
    (obj.Date && !Number.isNaN(Date.parse(obj.Date)) ? new Date(obj.Date).toISOString() : null);
  if (!sportId && !leagueId && !eventId) return null;
  return {
    provider,sport_id:sportId,country_code:countryCode,league_id:leagueId,league_name:leagueName,event_id:eventId,kickoff_utc:kickoff,observed_at:observedAt,
    time_status:clean(obj.time_status ?? obj.status),
    home_name:clean(obj.home?.name ?? obj.HomeTeam),
    away_name:clean(obj.away?.name ?? obj.AwayTeam)
  };
}

function walkObjects(value, cb, path='', depth=0) {
  if (depth>10 || value===null || value===undefined) return;
  if (Array.isArray(value)) {
    for (let i=0;i<Math.min(value.length,500);i++) walkObjects(value[i],cb,path+'[]',depth+1);
    return;
  }
  if (typeof value!=='object') return;
  cb(value,path);
  for (const [k,v] of Object.entries(value)) walkObjects(v,cb,path ? path+'.'+k : k,depth+1);
}

const PRICE_KEYS=/^(price|odds|decimalOdds|decimal_odds|home_od|draw_od|away_od|over_od|under_od|o1|o2|p)$/i;
const ODDS_CONTEXT=/(odds|market|runner|option|exchange|price)/i;
const LINE_KEYS=/^(handicap|line|spread|total|points)$/i;

function oddsFacts(body, sourceType, observedAt, provider) {
  const out=[];
  const seen=new Set();
  let rootEvent=null;
  walkObjects(body,(obj)=>{
    if (!rootEvent) {
      const f=eventFact(obj,observedAt,provider);
      if (f?.event_id) rootEvent=f;
    }
  });
  walkObjects(body,(obj,path)=>{
    if (!ODDS_CONTEXT.test(path)) return;
    const marketFromPath=path.match(/(?:^|\.)(\d+_\d+)(?:\.|$)/)?.[1] || null;
    const fallbackMarket=path.split('.').slice(-2,-1)[0] || null;
    const market=clean(obj.market_key ?? obj.marketId ?? obj.market_id ?? obj.marketType ?? obj.marketName ?? marketFromPath ?? fallbackMarket);
    if (!market) return;
    const selection=clean(obj.selection_key ?? obj.selectionId ?? obj.id ?? obj.name ?? obj.runnerName ?? path.split('.').at(-1)) || 'unknown';
    const lineEntry=Object.entries(obj).find(([k])=>LINE_KEYS.test(k));
    const line=lineEntry ? clean(lineEntry[1]) : null;
    for (const [k,v] of Object.entries(obj)) {
      if (!PRICE_KEYS.test(k)) continue;
      const price=Number(v);
      if (!Number.isFinite(price) || price<=1 || price>10000) continue;
      const fact=eventFact(obj,observedAt,provider) || rootEvent || {};
      const phase=fact.kickoff_utc && Date.parse(observedAt) < Date.parse(fact.kickoff_utc) ? 'prematch' : 'live_or_unknown';
      const row={
        observed_at:observedAt,provider,source_type:sourceType,
        sport_id:fact.sport_id||null,country_code:fact.country_code||'',league_id:fact.league_id||null,league_name:fact.league_name||null,
        event_id:fact.event_id||null,kickoff_utc:fact.kickoff_utc||null,phase,
        bookmaker:clean(obj.source ?? obj.bookmaker ?? obj.provider) || null,
        market_key:market,selection_key:selection,line_value:line,price,
        provider_time:isoFromEpoch(obj.add_time ?? obj.updated_at ?? obj.odds_update),raw_path:path+'.'+k
      };
      const key=[row.provider,row.source_type,row.event_id,row.market_key,row.selection_key,row.line_value,row.price,row.observed_at,row.raw_path].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      row.observation_hash=crypto.createHash('sha256').update(key).digest('hex');
      out.push(row);
      if (out.length>=5000) return;
    }
  });
  return out;
}

export function normalizeTrialRows(rows) {
  const sports=new Map();
  const competitions=new Map();
  const coverage=new Map();
  const events=new Map();
  const odds=[];
  for (const row of rows) {
    const provider=providerForSource(row.type);
    const body=row.payload?.body ?? row.payload;
    const observedAt=row.ts;
    const requestParams=row.payload?.request_params || {};
    const contextSport=clean(requestParams.sport_id ?? row.payload?.sport_id);
    const contextEvent=clean(requestParams.event_id ?? requestParams.FI ?? row.payload?.event_id);

    if (contextSport && /league_list|census_leagues/.test(row.type)) {
      const leagueRows=Array.isArray(body?.results)?body.results:[];
      for (const league of leagueRows) {
        const leagueId=clean(league?.id ?? league?.league_id);
        if (!leagueId) continue;
        const countryCode=clean(league?.cc ?? league?.country_code) || '';
        const leagueName=clean(league?.name ?? league?.league_name);
        const key=[provider,contextSport,countryCode,leagueId].join('|');
        const prev=competitions.get(key);
        competitions.set(key,{
          provider,sport_id:contextSport,country_code:countryCode,league_id:leagueId,league_name:leagueName||prev?.league_name||null,
          first_seen_at:prev?.first_seen_at||observedAt,last_seen_at:observedAt
        });
        if (!sports.has(provider+'|'+contextSport)) {
          sports.set(provider+'|'+contextSport,{
            provider,sport_id:contextSport,sport_name:SPORT_NAMES.get(contextSport)||null,
            first_seen_at:observedAt,last_seen_at:observedAt
          });
        }
      }
    }

    walkObjects(body,(obj)=>{
      const f=eventFact(obj,observedAt,provider);
      if (!f) return;
      if (!f.sport_id && contextSport) f.sport_id=contextSport;
      if (!f.event_id && contextEvent) f.event_id=contextEvent;
      if (f.sport_id) {
        const key=provider+'|'+f.sport_id;
        sports.set(key,{provider,sport_id:f.sport_id,sport_name:SPORT_NAMES.get(f.sport_id)||null,first_seen_at:observedAt,last_seen_at:observedAt});
      }
      if (f.event_id) {
        const ekey=provider+'|'+f.event_id;
        const prevEvent=events.get(ekey);
        events.set(ekey,{
          provider,event_id:f.event_id,sport_id:f.sport_id||prevEvent?.sport_id||null,
          country_code:f.country_code||prevEvent?.country_code||'',league_id:f.league_id||prevEvent?.league_id||null,
          league_name:f.league_name||prevEvent?.league_name||null,kickoff_utc:f.kickoff_utc||prevEvent?.kickoff_utc||null,
          time_status:f.time_status||prevEvent?.time_status||null,home_name:f.home_name||prevEvent?.home_name||null,away_name:f.away_name||prevEvent?.away_name||null,
          first_seen_at:prevEvent?.first_seen_at||observedAt,last_seen_at:observedAt
        });
      }
      if (f.sport_id && f.league_id) {
        const key=[provider,f.sport_id,f.country_code,f.league_id].join('|');
        const prev=competitions.get(key);
        competitions.set(key,{provider,sport_id:f.sport_id,country_code:f.country_code,league_id:f.league_id,league_name:f.league_name||prev?.league_name||null,first_seen_at:prev?.first_seen_at||observedAt,last_seen_at:observedAt});
        const cov=coverage.get(key) || {provider,sport_id:f.sport_id,country_code:f.country_code,league_id:f.league_id,earliest_event_time:null,latest_event_time:null,earliest_observed_at:observedAt,latest_observed_at:observedAt,event_count:0,provider_history_floor:provider==='betsapi'?'2016-09-01':null};
        if (f.kickoff_utc) {
          if (!cov.earliest_event_time || f.kickoff_utc<cov.earliest_event_time) cov.earliest_event_time=f.kickoff_utc;
          if (!cov.latest_event_time || f.kickoff_utc>cov.latest_event_time) cov.latest_event_time=f.kickoff_utc;
        }
        cov.latest_observed_at=observedAt;
        cov.event_count++;
        coverage.set(key,cov);
      }
    });
    if (row.type === 'betsapi_documented_event_odds' || row.type === 'totalcorner_match_odds') {
      const extracted=oddsFacts(body,row.type,observedAt,provider);
      for (const o of extracted) {
        if (!o.sport_id && contextSport) o.sport_id=contextSport;
        if (!o.event_id && contextEvent) o.event_id=contextEvent;
        if (!o.event_id && row.payload?.id) o.event_id=clean(row.payload.id);
        if (!o.bookmaker && requestParams.source) o.bookmaker=clean(requestParams.source);
      }
      odds.push(...extracted);
    }
  }
  return {sports:[...sports.values()],competitions:[...competitions.values()],coverage:[...coverage.values()],events:[...events.values()],odds};
}

export async function initReconciliation(pool) {
  await pool.query(RECONCILIATION_SCHEMA_SQL);
  await pool.query(`
    DELETE FROM provider_trial.odds_observations
    WHERE source_type NOT IN ('betsapi_documented_event_odds','totalcorner_match_odds')
       OR event_id IS NULL
       OR market_key IS NULL
       OR market_key=''
       OR market_key='unknown'
  `);
  for (const sport of BETSAPI_SPORTS) {
    await pool.query(`
      INSERT INTO provider_trial.sports(provider,sport_id,sport_name,documented)
      VALUES('betsapi',$1,$2,true)
      ON CONFLICT(provider,sport_id) DO UPDATE SET sport_name=EXCLUDED.sport_name,documented=true
    `,[String(sport.sport_id),sport.name]);
  }
}

export async function persistNormalizedBatch(pool, normalized) {
  if (normalized.sports.length) {
    await pool.query(`
      INSERT INTO provider_trial.sports(provider,sport_id,sport_name,first_seen_at,last_seen_at)
      SELECT provider,sport_id,sport_name,first_seen_at::timestamptz,last_seen_at::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS x(provider text,sport_id text,sport_name text,first_seen_at text,last_seen_at text)
      ON CONFLICT(provider,sport_id) DO UPDATE SET
        sport_name=COALESCE(EXCLUDED.sport_name,provider_trial.sports.sport_name),
        first_seen_at=LEAST(provider_trial.sports.first_seen_at,EXCLUDED.first_seen_at),
        last_seen_at=GREATEST(provider_trial.sports.last_seen_at,EXCLUDED.last_seen_at)
    `,[JSON.stringify(normalized.sports)]);
  }
  if (normalized.competitions.length) {
    await pool.query(`
      INSERT INTO provider_trial.competitions(provider,sport_id,country_code,league_id,league_name,first_seen_at,last_seen_at)
      SELECT provider,sport_id,country_code,league_id,league_name,first_seen_at::timestamptz,last_seen_at::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS x(provider text,sport_id text,country_code text,league_id text,league_name text,first_seen_at text,last_seen_at text)
      ON CONFLICT(provider,sport_id,country_code,league_id) DO UPDATE SET
        league_name=COALESCE(EXCLUDED.league_name,provider_trial.competitions.league_name),
        first_seen_at=LEAST(provider_trial.competitions.first_seen_at,EXCLUDED.first_seen_at),
        last_seen_at=GREATEST(provider_trial.competitions.last_seen_at,EXCLUDED.last_seen_at)
    `,[JSON.stringify(normalized.competitions)]);
  }
  if (normalized.events.length) {
    await pool.query(`
      INSERT INTO provider_trial.events(provider,event_id,sport_id,country_code,league_id,league_name,kickoff_utc,time_status,home_name,away_name,first_seen_at,last_seen_at)
      SELECT provider,event_id,sport_id,country_code,league_id,league_name,kickoff_utc::timestamptz,time_status,home_name,away_name,first_seen_at::timestamptz,last_seen_at::timestamptz
      FROM jsonb_to_recordset($1::jsonb) AS x(provider text,event_id text,sport_id text,country_code text,league_id text,league_name text,kickoff_utc text,time_status text,home_name text,away_name text,first_seen_at text,last_seen_at text)
      ON CONFLICT(provider,event_id) DO UPDATE SET
        sport_id=COALESCE(EXCLUDED.sport_id,provider_trial.events.sport_id),
        country_code=COALESCE(NULLIF(EXCLUDED.country_code,''),provider_trial.events.country_code),
        league_id=COALESCE(EXCLUDED.league_id,provider_trial.events.league_id),
        league_name=COALESCE(EXCLUDED.league_name,provider_trial.events.league_name),
        kickoff_utc=COALESCE(EXCLUDED.kickoff_utc,provider_trial.events.kickoff_utc),
        time_status=COALESCE(EXCLUDED.time_status,provider_trial.events.time_status),
        home_name=COALESCE(EXCLUDED.home_name,provider_trial.events.home_name),
        away_name=COALESCE(EXCLUDED.away_name,provider_trial.events.away_name),
        first_seen_at=LEAST(provider_trial.events.first_seen_at,EXCLUDED.first_seen_at),
        last_seen_at=GREATEST(provider_trial.events.last_seen_at,EXCLUDED.last_seen_at)
    `,[JSON.stringify(normalized.events)]);
  }
  if (normalized.coverage.length) {
    await pool.query(`
      INSERT INTO provider_trial.coverage(provider,sport_id,country_code,league_id,earliest_event_time,latest_event_time,earliest_observed_at,latest_observed_at,event_count,provider_history_floor)
      SELECT provider,sport_id,country_code,league_id,earliest_event_time::timestamptz,latest_event_time::timestamptz,earliest_observed_at::timestamptz,latest_observed_at::timestamptz,event_count,provider_history_floor::date
      FROM jsonb_to_recordset($1::jsonb) AS x(provider text,sport_id text,country_code text,league_id text,earliest_event_time text,latest_event_time text,earliest_observed_at text,latest_observed_at text,event_count bigint,provider_history_floor text)
      ON CONFLICT(provider,sport_id,country_code,league_id) DO UPDATE SET
        earliest_event_time=LEAST(provider_trial.coverage.earliest_event_time,EXCLUDED.earliest_event_time),
        latest_event_time=GREATEST(provider_trial.coverage.latest_event_time,EXCLUDED.latest_event_time),
        earliest_observed_at=LEAST(provider_trial.coverage.earliest_observed_at,EXCLUDED.earliest_observed_at),
        latest_observed_at=GREATEST(provider_trial.coverage.latest_observed_at,EXCLUDED.latest_observed_at),
        event_count=provider_trial.coverage.event_count+EXCLUDED.event_count,
        provider_history_floor=COALESCE(provider_trial.coverage.provider_history_floor,EXCLUDED.provider_history_floor)
    `,[JSON.stringify(normalized.coverage)]);
  }
  if (normalized.odds.length) {
    for (let i=0;i<normalized.odds.length;i+=500) {
      const chunk=normalized.odds.slice(i,i+500);
      await pool.query(`
        INSERT INTO provider_trial.odds_observations(
          observation_hash,observed_at,provider,source_type,sport_id,country_code,league_id,league_name,event_id,kickoff_utc,phase,bookmaker,market_key,selection_key,line_value,price,provider_time,raw_path
        )
        SELECT observation_hash,observed_at::timestamptz,provider,source_type,sport_id,country_code,league_id,league_name,event_id,kickoff_utc::timestamptz,phase,bookmaker,market_key,selection_key,line_value,price,provider_time::timestamptz,raw_path
        FROM jsonb_to_recordset($1::jsonb) AS x(observation_hash text,observed_at text,provider text,source_type text,sport_id text,country_code text,league_id text,league_name text,event_id text,kickoff_utc text,phase text,bookmaker text,market_key text,selection_key text,line_value text,price numeric,provider_time text,raw_path text)
        ON CONFLICT(observation_hash) DO NOTHING
      `,[JSON.stringify(chunk)]);
    }
    await pool.query(`
      UPDATE provider_trial.odds_observations o
      SET sport_id=COALESCE(o.sport_id,e.sport_id),
          country_code=COALESCE(NULLIF(o.country_code,''),e.country_code),
          league_id=COALESCE(o.league_id,e.league_id),
          league_name=COALESCE(o.league_name,e.league_name),
          kickoff_utc=COALESCE(o.kickoff_utc,e.kickoff_utc),
          phase=CASE
            WHEN COALESCE(o.kickoff_utc,e.kickoff_utc) IS NOT NULL
             AND o.observed_at < COALESCE(o.kickoff_utc,e.kickoff_utc) THEN 'prematch'
            WHEN COALESCE(o.kickoff_utc,e.kickoff_utc) IS NOT NULL THEN 'live_or_post'
            ELSE o.phase
          END
      FROM provider_trial.events e
      WHERE e.provider=o.provider AND e.event_id=o.event_id
    `);
  }
}

export async function reconciliationSummary(pool) {
  const [sports,competitions,coverage,odds]=await Promise.all([
    pool.query(`SELECT provider,count(*)::int AS sports,count(*) FILTER(WHERE documented)::int AS documented FROM provider_trial.sports GROUP BY provider ORDER BY provider`),
    pool.query(`SELECT provider,count(*)::int AS competitions,count(DISTINCT NULLIF(country_code,''))::int AS countries FROM provider_trial.competitions GROUP BY provider ORDER BY provider`),
    pool.query(`SELECT provider,min(earliest_event_time) AS earliest_event_time,max(latest_event_time) AS latest_event_time,min(provider_history_floor) AS provider_history_floor,sum(event_count)::bigint AS event_facts FROM provider_trial.coverage GROUP BY provider ORDER BY provider`),
    pool.query(`SELECT provider,count(*)::bigint AS observations,count(DISTINCT event_id)::bigint AS events,count(DISTINCT market_key)::bigint AS markets,min(observed_at) AS first_observed_at,max(observed_at) AS last_observed_at FROM provider_trial.odds_observations GROUP BY provider ORDER BY provider`)
  ]);
  return {sports:sports.rows,competitions:competitions.rows,coverage:coverage.rows,odds:odds.rows};
}
