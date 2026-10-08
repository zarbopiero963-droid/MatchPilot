import { withClient } from '../db.mjs';
import { createTcClient, createPgStore, redactSecrets, sharedLimiter } from '../providers/totalcorner/client.mjs';
import { LIST_COLUMNS, ODDS_COLUMNS, MOVEMENT_BOOKMAKERS, MOVEMENT_COLUMNS } from './totalcorner-discovery.mjs';
import { ingestBody } from './totalcorner-prematch.mjs';
import { HISTORICAL_VERSION, DEFAULT_PROVIDER_TIME_ZONE, historicalAudit, historicalZoneDecision,
  movementStats, providerLocalToUtc, rowsOf, scheduleMatches, seasonKey } from '../providers/totalcorner/historical.mjs';

// TC-CORE-03B (#20): resumable HISTORICAL_UPSTREAM backfill. Raw is lossless in tc_raw_responses;
// compact normalized/audit state is persisted separately. The first run is a bounded hard-test sample
// (>=5 VERIFIED leagues in distinct countries, up to 4 historical matches each). Later batches resume page-by-page.

export const TC_HISTORICAL_LOCK = 76420323;

export function historicalConfig(env = process.env) {
  return {
    providerTimeZone: env.TOTALCORNER_TIME_ZONE || DEFAULT_PROVIDER_TIME_ZONE,
    sampleLeagues: Math.max(5, Math.min(12, Number(env.TOTALCORNER_HISTORY_SAMPLE_LEAGUES || 5))),
    sampleMatchesPerLeague: Math.max(4, Math.min(12, Number(env.TOTALCORNER_HISTORY_SAMPLE_MATCHES_PER_LEAGUE || 4))),
    batchLeagues: Math.max(1, Math.min(8, Number(env.TOTALCORNER_HISTORY_BATCH_LEAGUES || 2))),
    batchMatchesPerLeague: Math.max(1, Math.min(12, Number(env.TOTALCORNER_HISTORY_BATCH_MATCHES_PER_LEAGUE || 3))),
    batchIntervalMs: Math.max(120000, Number(env.TOTALCORNER_HISTORY_BATCH_INTERVAL_MS || 600000)),
    maxAgeMinutes: Math.max(30, Math.min(720, Number(env.TOTALCORNER_TZ_MAX_AGE_MINUTES || 360)))
  };
}

const ended = r => String(r?.status ?? '').toLowerCase() === 'full';
const uniq = xs => [...new Set(xs)];

async function verifiedLeagueSample(db, limit) {
  const r = await db.query(
    `WITH ranked AS (
       SELECT totalcorner_league_id AS league_id, totalcorner_league_name AS league_name,
              country, canonical_league_name, futpython_country_slug, futpython_league_slug, mapping_confidence,
              row_number() OVER (PARTITION BY country ORDER BY mapping_confidence DESC NULLS LAST, totalcorner_league_id) AS rn
       FROM competition_mapping
       WHERE active AND mapping_status='VERIFIED' AND totalcorner_league_id IS NOT NULL
     )
     SELECT * FROM ranked WHERE rn=1 ORDER BY mapping_confidence DESC NULLS LAST, country LIMIT $1`, [limit]);
  return r.rows;
}

async function allVerifiedForBatch(db, limit) {
  const r = await db.query(
    `SELECT c.totalcorner_league_id AS league_id, c.totalcorner_league_name AS league_name, c.country, c.canonical_league_name,
            c.futpython_country_slug, c.futpython_league_slug, c.mapping_confidence,
            coalesce(h.next_page,1) AS next_page, coalesce(h.complete,false) AS complete
     FROM competition_mapping c
     LEFT JOIN tc_historical_checkpoints h ON h.league_id=c.totalcorner_league_id
     WHERE c.active AND c.mapping_status='VERIFIED' AND c.totalcorner_league_id IS NOT NULL
       AND coalesce(h.complete,false)=false
     ORDER BY coalesce(h.updated_at,'epoch'::timestamptz), c.mapping_confidence DESC NULLS LAST
     LIMIT $1`, [limit]);
  return r.rows;
}

async function tzObservations(db) {
  const r = await db.query(
    `SELECT observation_id, observed_at, status, offset_minutes
     FROM tc_tz_observations ORDER BY observed_at DESC, observation_id DESC LIMIT 20`);
  return r.rows;
}

async function refreshCoverage(db, league) {
  await db.query(
    `INSERT INTO tc_historical_league_coverage(
       league_id,country,canonical_league_name,earliest_upstream_date,latest_upstream_date,seasons_seen,matches_seen,
       odds_history_matches,asian_history_matches,goal_history_matches,corner_history_matches,events_matches,
       score_ht_matches,corners_matches,cards_matches,retroactive_live_stats_matches,updated_at)
     SELECT $1,$2,$3,min(kickoff_utc)::date,max(kickoff_utc)::date,count(DISTINCT season_key),count(*),
       count(*) FILTER (WHERE odds_history_present),count(*) FILTER (WHERE asian_history_present),
       count(*) FILTER (WHERE goal_history_present),count(*) FILTER (WHERE corner_history_present),
       count(*) FILTER (WHERE events_count>0),count(*) FILTER (WHERE score_ht_present),
       count(*) FILTER (WHERE corners_present),count(*) FILTER (WHERE cards_present),
       count(*) FILTER (WHERE retroactive_live_stats_present),now()
     FROM tc_historical_match_audit WHERE league_id=$1
     ON CONFLICT(league_id) DO UPDATE SET
       country=EXCLUDED.country, canonical_league_name=EXCLUDED.canonical_league_name,
       earliest_upstream_date=EXCLUDED.earliest_upstream_date, latest_upstream_date=EXCLUDED.latest_upstream_date,
       seasons_seen=EXCLUDED.seasons_seen, matches_seen=EXCLUDED.matches_seen,
       odds_history_matches=EXCLUDED.odds_history_matches, asian_history_matches=EXCLUDED.asian_history_matches,
       goal_history_matches=EXCLUDED.goal_history_matches, corner_history_matches=EXCLUDED.corner_history_matches,
       events_matches=EXCLUDED.events_matches, score_ht_matches=EXCLUDED.score_ht_matches,
       corners_matches=EXCLUDED.corners_matches, cards_matches=EXCLUDED.cards_matches,
       retroactive_live_stats_matches=EXCLUDED.retroactive_live_stats_matches, updated_at=now()`,
    [String(league.league_id), league.country ?? null, league.canonical_league_name ?? league.league_name ?? null]);
}

async function upsertAudit(db, {runId, league, record, view, odds, bookmaker, acquiredAt, timezone}) {
  const start = record?.start || rowsOf(view.body)[0]?.start || rowsOf(odds.body)[0]?.start || rowsOf(bookmaker.body)[0]?.start;
  const z = providerLocalToUtc(start, timezone);
  if (!record?.id || !z) return null;
  const viewRec = rowsOf(view.body)[0] || {};
  const oddsRec = rowsOf(odds.body)[0] || {};
  const bookRec = rowsOf(bookmaker.body)[0] || {};
  const a = historicalAudit(viewRec, oddsRec, bookRec);
  await db.query(
    `INSERT INTO tc_historical_match_audit(
       match_id,league_id,provider_start,kickoff_utc,provider_timezone,provider_offset_minutes,season_key,acquired_at,
       view_raw_id,odds_raw_id,bookmaker_raw_id,view_outcome,odds_outcome,bookmaker_outcome,
       events_count,score_ft_present,score_ht_present,corners_present,cards_present,attacks_present,dangerous_attacks_present,
       shots_present,possession_present,odds_history_present,asian_history_present,goal_history_present,corner_history_present,
       btts_history_present,bookmaker_odds_present,retroactive_live_stats_present,last_run_id,updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,now())
     ON CONFLICT(match_id) DO UPDATE SET
       league_id=EXCLUDED.league_id,provider_start=EXCLUDED.provider_start,kickoff_utc=EXCLUDED.kickoff_utc,
       provider_timezone=EXCLUDED.provider_timezone,provider_offset_minutes=EXCLUDED.provider_offset_minutes,
       season_key=EXCLUDED.season_key,acquired_at=EXCLUDED.acquired_at,view_raw_id=EXCLUDED.view_raw_id,
       odds_raw_id=EXCLUDED.odds_raw_id,bookmaker_raw_id=EXCLUDED.bookmaker_raw_id,
       view_outcome=EXCLUDED.view_outcome,odds_outcome=EXCLUDED.odds_outcome,bookmaker_outcome=EXCLUDED.bookmaker_outcome,
       events_count=EXCLUDED.events_count,score_ft_present=EXCLUDED.score_ft_present,score_ht_present=EXCLUDED.score_ht_present,
       corners_present=EXCLUDED.corners_present,cards_present=EXCLUDED.cards_present,attacks_present=EXCLUDED.attacks_present,
       dangerous_attacks_present=EXCLUDED.dangerous_attacks_present,shots_present=EXCLUDED.shots_present,
       possession_present=EXCLUDED.possession_present,odds_history_present=EXCLUDED.odds_history_present,
       asian_history_present=EXCLUDED.asian_history_present,goal_history_present=EXCLUDED.goal_history_present,
       corner_history_present=EXCLUDED.corner_history_present,btts_history_present=EXCLUDED.btts_history_present,
       bookmaker_odds_present=EXCLUDED.bookmaker_odds_present,retroactive_live_stats_present=EXCLUDED.retroactive_live_stats_present,
       last_run_id=EXCLUDED.last_run_id,updated_at=now()`,
    [String(record.id), String(league.league_id), String(start), z.utc, timezone, z.offsetMinutes, seasonKey(start), acquiredAt,
      view.raw_id, odds.raw_id, bookmaker.raw_id, view.outcome, odds.outcome, bookmaker.outcome,
      a.events_count,a.score_ft_present,a.score_ht_present,a.corners_present,a.cards_present,a.attacks_present,
      a.dangerous_attacks_present,a.shots_present,a.possession_present,a.odds_history_present,a.asian_history_present,
      a.goal_history_present,a.corner_history_present,a.btts_history_present,a.bookmaker_odds_present,
      a.retroactive_live_stats_present,runId]);
  return {z, audit:a};
}

async function ingestHistoricalMatch({tc, db, runId, league, record, timezone, movement = false}) {
  const ctx = {match_id:String(record.id), league_id:String(league.league_id), phase:'ENDED', provenance:'HISTORICAL_UPSTREAM'};
  const view = await tc.get(`/match/view/${encodeURIComponent(record.id)}`, {columns:LIST_COLUMNS}, {...ctx,endpoint_family:'historical_match_view'});
  const odds = await tc.get(`/match/odds/${encodeURIComponent(record.id)}`, {columns:ODDS_COLUMNS}, {...ctx,endpoint_family:'historical_match_odds'});
  const bookmaker = await tc.get(`/match/bookmaker_odds/${encodeURIComponent(record.id)}`, {}, {...ctx,endpoint_family:'historical_bookmaker_odds'});
  const acquiredAt = bookmaker.acquired_at || odds.acquired_at || view.acquired_at || new Date();
  const z = providerLocalToUtc(record.start, timezone);
  const mapping = {futpython_country_slug:league.futpython_country_slug, futpython_league_slug:league.futpython_league_slug};
  if (z && odds.body) await ingestBody(db,{source:'match_odds',body:odds.body,rawId:odds.raw_id,acquiredAt:odds.acquired_at||acquiredAt,
    offset:z.offsetMinutes,runId:null,mapping,snapshot:false});
  if (z && bookmaker.body) await ingestBody(db,{source:'bookmaker_odds',body:bookmaker.body,rawId:bookmaker.raw_id,acquiredAt:bookmaker.acquired_at||acquiredAt,
    offset:z.offsetMinutes,runId:null,mapping,snapshot:false});
  const audited = await upsertAudit(db,{runId,league,record,view,odds,bookmaker,acquiredAt,timezone});
  if (movement) {
    for (const bookmakerSlug of MOVEMENT_BOOKMAKERS) {
      const cols = bookmakerSlug === 'pinnacle' ? MOVEMENT_COLUMNS : ['asianList'];
      for (const columns of cols) {
        const r = await tc.get(`/match/bookmaker_odds/${encodeURIComponent(record.id)}`, {bookmaker:bookmakerSlug,columns},
          {...ctx,endpoint_family:'historical_bookmaker_movement'});
        const s = movementStats(r.body);
        await db.query(
          `INSERT INTO tc_historical_movement_audit(match_id,bookmaker,columns_name,outcome,rows_seen,suspended_rows,raw_id,acquired_at,run_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT(match_id,bookmaker,columns_name) DO UPDATE SET
             outcome=EXCLUDED.outcome,rows_seen=EXCLUDED.rows_seen,suspended_rows=EXCLUDED.suspended_rows,
             raw_id=EXCLUDED.raw_id,acquired_at=EXCLUDED.acquired_at,run_id=EXCLUDED.run_id`,
          [String(record.id),bookmakerSlug,columns,(r.outcome==='ok'&&s.rows===0)?'no_data':r.outcome,s.rows,s.suspended,r.raw_id,r.acquired_at||new Date(),runId]);
      }
    }
  }
  return {view:view.outcome,odds:odds.outcome,bookmaker:bookmaker.outcome,audited:Boolean(audited)};
}

async function schedulePage(tc, league, page) {
  return tc.get(`/league/schedule/${encodeURIComponent(league.league_id)}`, {page},
    {endpoint_family:'historical_league_schedule',league_id:String(league.league_id),phase:'ENDED',provenance:'HISTORICAL_UPSTREAM'});
}

async function runSample({tc,db,config,runId}) {
  const leagues = await verifiedLeagueSample(db,config.sampleLeagues);
  const stats={leagues:0,countries:new Set(),matches:0,seasons:new Set(),movement_matches:0,outcomes:{}};
  for (const league of leagues) {
    const first=await schedulePage(tc,league,1);
    const pages=Math.max(1,Number(first.body?.pagination?.pages||1));
    const probe=uniq([1,Math.max(1,Math.ceil(pages/2)),pages]);
    const rowsByPage=new Map([[1,scheduleMatches(first.body)]]);
    for(const p of probe.slice(1)){ const r=await schedulePage(tc,league,p); rowsByPage.set(p,scheduleMatches(r.body)); }
    // Hard-test sample must span the available history, not just the newest ended fixtures.
    // Take one ended match from each probed page first (recent/middle/oldest), then fill the remaining slots round-robin.
    const matches=[];
    const ids=new Set();
    const add=r=>{if(!r?.id||ids.has(String(r.id))||!ended(r)) return false; ids.add(String(r.id)); matches.push(r); return true;};
    for(const p of probe){const r=(rowsByPage.get(p)||[]).find(x=>ended(x)&&x?.id&&!ids.has(String(x.id))); if(r) add(r);}
    if(matches.length<config.sampleMatchesPerLeague){
      const pools=probe.map(p=>(rowsByPage.get(p)||[]).filter(ended));
      let idx=0;
      while(matches.length<config.sampleMatchesPerLeague && pools.some(x=>idx<x.length)){
        for(const pool of pools){if(matches.length>=config.sampleMatchesPerLeague) break; if(idx<pool.length) add(pool[idx]);}
        idx++;
      }
    }
    let n=0;
    for(const record of matches){
      const useMovement=stats.movement_matches<3;
      const x=await ingestHistoricalMatch({tc,db,runId,league,record,timezone:config.providerTimeZone,movement:useMovement});
      if(useMovement) stats.movement_matches++;
      n++; stats.matches++; stats.seasons.add(seasonKey(record.start));
      for(const o of [x.view,x.odds,x.bookmaker]) stats.outcomes[o]=(stats.outcomes[o]||0)+1;
    }
    await db.query(
      `INSERT INTO tc_historical_checkpoints(league_id,sampled,next_page,total_pages,matches_seen,matches_ingested,updated_at)
       VALUES($1,true,1,$2,$3,$3,now())
       ON CONFLICT(league_id) DO UPDATE SET sampled=true,total_pages=EXCLUDED.total_pages,
         matches_seen=tc_historical_checkpoints.matches_seen+EXCLUDED.matches_seen,
         matches_ingested=tc_historical_checkpoints.matches_ingested+EXCLUDED.matches_ingested,updated_at=now()`,
      [String(league.league_id),pages,n]);
    await refreshCoverage(db,league);
    stats.leagues++; stats.countries.add(league.country);
  }
  return {leagues:stats.leagues,countries:stats.countries.size,matches:stats.matches,seasons:[...stats.seasons].filter(Boolean).sort(),
    movement_matches:stats.movement_matches,outcomes:stats.outcomes};
}

async function repairMovementAuditFromRaw(db) {
  const r = await db.query(
    `SELECT a.match_id,a.bookmaker,a.columns_name,a.raw_id,x.body
     FROM tc_historical_movement_audit a
     JOIN tc_raw_responses x ON x.raw_id=a.raw_id
     WHERE a.raw_id IS NOT NULL`);
  let repaired=0, withRows=0, noData=0, suspended=0;
  for (const row of r.rows) {
    let body=null;
    try { body=JSON.parse(row.body); } catch { continue; }
    const s=movementStats(body);
    const outcome=s.rows>0?'ok':'no_data';
    await db.query(
      `UPDATE tc_historical_movement_audit
       SET outcome=$4,rows_seen=$5,suspended_rows=$6,acquired_at=coalesce(acquired_at,now())
       WHERE match_id=$1 AND bookmaker=$2 AND columns_name=$3`,
      [row.match_id,row.bookmaker,row.columns_name,outcome,s.rows,s.suspended]);
    repaired++; if(s.rows>0) withRows++; else noData++; suspended+=s.suspended;
  }
  return {repaired,with_rows:withRows,no_data:noData,suspended_rows:suspended};
}

async function runBatch({tc,db,config,runId}) {
  const leagues=await allVerifiedForBatch(db,config.batchLeagues);
  const stats={leagues:0,matches:0,completed:0,outcomes:{}};
  for(const league of leagues){
    const page=Math.max(1,Number(league.next_page||1));
    const r=await schedulePage(tc,league,page);
    const pages=Math.max(page,Number(r.body?.pagination?.pages||page));
    const matches=scheduleMatches(r.body).filter(ended).slice(0,config.batchMatchesPerLeague);
    for(const record of matches){
      const x=await ingestHistoricalMatch({tc,db,runId,league,record,timezone:config.providerTimeZone,movement:false});
      stats.matches++;
      for(const o of [x.view,x.odds,x.bookmaker]) stats.outcomes[o]=(stats.outcomes[o]||0)+1;
    }
    const done=r.outcome==='auth'||r.outcome==='not_found'||r.outcome==='no_data'||page>=pages||r.body?.pagination?.next===false;
    await db.query(
      `INSERT INTO tc_historical_checkpoints(league_id,next_page,total_pages,complete,matches_seen,matches_ingested,updated_at,last_error)
       VALUES($1,$2,$3,$4,$5,$5,now(),$6)
       ON CONFLICT(league_id) DO UPDATE SET next_page=EXCLUDED.next_page,total_pages=EXCLUDED.total_pages,
         complete=EXCLUDED.complete,matches_seen=tc_historical_checkpoints.matches_seen+EXCLUDED.matches_seen,
         matches_ingested=tc_historical_checkpoints.matches_ingested+EXCLUDED.matches_ingested,updated_at=now(),last_error=EXCLUDED.last_error`,
      [String(league.league_id),done?page:page+1,pages,done,matches.length,r.outcome==='ok'?null:r.outcome]);
    await refreshCoverage(db,league);
    stats.leagues++; if(done) stats.completed++;
  }
  return stats;
}

export async function runHistorical({tc,db,config=historicalConfig(),kind='sample',log=console.log}){
  const run=await db.query(`INSERT INTO tc_historical_runs(version,kind,status) VALUES($1,$2,'running') RETURNING run_id`,[HISTORICAL_VERSION,kind]);
  const runId=Number(run.rows[0].run_id);
  try{
    const zone=historicalZoneDecision({observations:await tzObservations(db),now:new Date(),timeZone:config.providerTimeZone,maxAgeMinutes:config.maxAgeMinutes});
    if(!zone.verified){
      const summary={version:HISTORICAL_VERSION,run_id:runId,kind,hold:true,timezone:zone};
      await db.query(`UPDATE tc_historical_runs SET status='complete',finished_at=now(),summary=$2 WHERE run_id=$1`,[runId,JSON.stringify(summary)]);
      log('TC_HISTORICAL_TZ_HOLD '+JSON.stringify(summary)); return summary;
    }
    const body=kind==='sample'?await runSample({tc,db,config,runId}):await runBatch({tc,db,config,runId});
    const summary={version:HISTORICAL_VERSION,run_id:runId,kind,timezone:zone,...body};
    await db.query(`UPDATE tc_historical_runs SET status='complete',finished_at=now(),summary=$2 WHERE run_id=$1`,[runId,JSON.stringify(summary)]);
    log('TC_HISTORICAL_COMPLETE '+JSON.stringify(summary)); return summary;
  }catch(e){
    await db.query(`UPDATE tc_historical_runs SET status='failed',finished_at=now(),error=$2 WHERE run_id=$1`,
      [runId,redactSecrets(String(e?.message||e)).slice(0,500)]).catch(()=>{});
    throw e;
  }
}

let timer=null,busy=false;
async function guarded(fn){
  return withClient(async db=>{
    const l=await db.query('SELECT pg_try_advisory_lock($1,hashtext(current_schema())) AS ok',[TC_HISTORICAL_LOCK]);
    if(!l.rows[0]?.ok) return null;
    try{return await fn(db);}finally{await db.query('SELECT pg_advisory_unlock($1,hashtext(current_schema()))',[TC_HISTORICAL_LOCK]).catch(()=>{});}
  });
}

export async function maybeStartTcHistorical({env=process.env,log=console.log}={}){
  const token=env.TOTALCORNER_API_TOKEN?.trim();
  if(env.TOTALCORNER_HISTORY_ENABLED==='false') return log('TC_HISTORICAL_SKIPPED '+JSON.stringify({reason:'disabled'}));
  if(!token||!env.DATABASE_URL) return log('TC_HISTORICAL_SKIPPED '+JSON.stringify({reason:token?'no_database':'no_token',token_present:Boolean(token)}));
  const config=historicalConfig(env);
  const tc=createTcClient({token,store:createPgStore(withClient),limiter:sharedLimiter(env)});
  const tick=async()=>{
    if(busy) return; busy=true;
    try{
      await guarded(async db=>{
        await db.query(`UPDATE tc_historical_runs SET status='interrupted',finished_at=now() WHERE status='running'`);
        const movement_repair=await repairMovementAuditFromRaw(db);
        if(movement_repair.repaired) log('TC_HISTORICAL_MOVEMENT_REPAIRED '+JSON.stringify(movement_repair));
        const sample=await db.query(`SELECT run_id FROM tc_historical_runs WHERE version=$1 AND kind='sample' AND status='complete' AND coalesce((summary->>'hold')::boolean,false)=false LIMIT 1`,[HISTORICAL_VERSION]);
        return runHistorical({tc,db,config,kind:sample.rowCount?'batch':'sample',log});
      });
    }catch(e){console.error('TC_HISTORICAL_ERROR',redactSecrets(String(e?.message||e)));}
    finally{busy=false;}
  };
  log('TC_HISTORICAL_START '+JSON.stringify({version:HISTORICAL_VERSION,provider_time_zone:config.providerTimeZone,batch_interval_ms:config.batchIntervalMs}));
  setTimeout(tick,0).unref?.();
  timer=setInterval(tick,config.batchIntervalMs); timer.unref?.();
}

export function stopTcHistorical(){if(timer) clearInterval(timer); timer=null;}

export async function tcHistoricalReport(db){
  const [runs,coverage,checkpoint,matches,movement]=await Promise.all([
    db.query(`SELECT run_id,version,kind,status,started_at,finished_at,summary,error FROM tc_historical_runs ORDER BY run_id DESC LIMIT 10`),
    db.query(`SELECT * FROM tc_historical_league_coverage ORDER BY matches_seen DESC,league_id LIMIT 500`),
    db.query(`SELECT count(*)::int AS leagues,count(*) FILTER(WHERE sampled)::int AS sampled,
      count(*) FILTER(WHERE complete)::int AS complete,sum(matches_ingested)::bigint AS matches_ingested FROM tc_historical_checkpoints`),
    db.query(`SELECT count(*)::int AS matches,count(DISTINCT league_id)::int AS leagues,count(DISTINCT season_key)::int AS seasons,
      min(kickoff_utc) AS earliest,max(kickoff_utc) AS latest,
      count(*) FILTER(WHERE odds_history_present)::int AS odds_history,
      count(*) FILTER(WHERE asian_history_present)::int AS asian_history,
      count(*) FILTER(WHERE goal_history_present)::int AS goal_history,
      count(*) FILTER(WHERE corner_history_present)::int AS corner_history,
      count(*) FILTER(WHERE events_count>0)::int AS events,
      count(*) FILTER(WHERE retroactive_live_stats_present)::int AS retroactive_live_stats
      FROM tc_historical_match_audit`),
    db.query(`SELECT bookmaker,columns_name,outcome,count(*)::int AS probes,sum(rows_seen)::int AS rows_seen,
      sum(suspended_rows)::int AS suspended_rows FROM tc_historical_movement_audit GROUP BY 1,2,3 ORDER BY 1,2,3`)
  ]);
  return {version:HISTORICAL_VERSION,runs:runs.rows,checkpoint:checkpoint.rows[0],matches:matches.rows[0],coverage:coverage.rows,movement:movement.rows};
}
