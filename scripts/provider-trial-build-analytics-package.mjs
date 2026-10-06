import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DuckDBInstance } from '@duckdb/node-api';

const OUT_DIR=process.env.PROVIDER_TRIAL_FINAL_EXPORT_DIR || '/tmp/provider-trial-final-export';
const PARQUET_DIR=path.join(OUT_DIR,'parquet');
const CANON_DIR=path.join(PARQUET_DIR,'canonical');
const QUALITY_DIR=path.join(PARQUET_DIR,'quality');
const COMP_DIR=path.join(PARQUET_DIR,'comparison');
const DB_PATH=path.join(OUT_DIR,'matchpilot_trial.duckdb');

function sqlString(v) { return "'" + String(v).replaceAll("'","''") + "'"; }

async function sha256File(file) {
  const h=crypto.createHash('sha256');
  const s=fs.createReadStream(file);
  await new Promise((resolve,reject)=>{
    s.on('data',chunk=>h.update(chunk));
    s.on('end',resolve);
    s.on('error',reject);
  });
  return h.digest('hex');
}

async function count(conn, relation) {
  const r=await conn.runAndReadAll('SELECT count(*)::BIGINT AS n FROM '+relation);
  const rows=r.getRowObjectsJson();
  return Number(rows[0]?.n||0);
}

async function scoretrendCount(conn, relation) {
  const r=await conn.runAndReadAll("SELECT count(*)::BIGINT AS n FROM "+relation+" WHERE provider='scoretrend'");
  const rows=r.getRowObjectsJson();
  return Number(rows[0]?.n||0);
}

export async function buildAnalyticsPackage() {
  fs.mkdirSync(CANON_DIR,{recursive:true});
  fs.mkdirSync(QUALITY_DIR,{recursive:true});
  fs.mkdirSync(COMP_DIR,{recursive:true});
  if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH,{force:true});

  const src={
    sports:path.join(OUT_DIR,'canonical_without_scoretrend','sports.ndjson.gz'),
    competitions:path.join(OUT_DIR,'canonical_without_scoretrend','competitions.ndjson.gz'),
    coverage:path.join(OUT_DIR,'canonical_without_scoretrend','coverage.ndjson.gz'),
    events:path.join(OUT_DIR,'canonical_without_scoretrend','events.ndjson.gz'),
    odds_observations:path.join(OUT_DIR,'odds_observations.ndjson.gz'),
    odds_summary:path.join(OUT_DIR,'odds_summary.ndjson.gz'),
    reconciliation_state:path.join(OUT_DIR,'reconciliation_state.ndjson.gz')
  };
  for (const [name,file] of Object.entries(src)) {
    if (!fs.existsSync(file)) throw new Error('missing_source_'+name);
  }

  console.log('PROVIDER_TRIAL_ANALYTICS_PACKAGE_START '+JSON.stringify({db_path:DB_PATH,threads:1,max_memory:'192MB'}));
  const instance=await DuckDBInstance.create(DB_PATH,{threads:'1',max_memory:'192MB'});
  const conn=await instance.connect();

  const specs=[
    ['sports',src.sports,path.join(CANON_DIR,'sports.parquet')],
    ['competitions',src.competitions,path.join(CANON_DIR,'competitions.parquet')],
    ['coverage',src.coverage,path.join(CANON_DIR,'coverage.parquet')],
    ['events',src.events,path.join(CANON_DIR,'events.parquet')],
    ['odds_observations',src.odds_observations,path.join(CANON_DIR,'odds_observations.parquet')],
    ['odds_summary',src.odds_summary,path.join(CANON_DIR,'odds_summary.parquet')]
  ];

  for (const [,input,output] of specs) {
    await conn.run(`COPY (SELECT * FROM read_json_auto(${sqlString(input)}, format='newline_delimited')) TO ${sqlString(output)} (FORMAT PARQUET, COMPRESSION ZSTD)`);
  }

  const pq=Object.fromEntries(specs.map(([name,,output])=>[name,output]));
  await conn.run(`
    CREATE OR REPLACE VIEW canonical_sports AS SELECT * FROM read_parquet(${sqlString(pq.sports)});
    CREATE OR REPLACE VIEW canonical_competitions AS SELECT * FROM read_parquet(${sqlString(pq.competitions)});
    CREATE OR REPLACE VIEW canonical_coverage AS SELECT * FROM read_parquet(${sqlString(pq.coverage)});
    CREATE OR REPLACE VIEW canonical_events AS SELECT * FROM read_parquet(${sqlString(pq.events)});
    CREATE OR REPLACE VIEW canonical_odds_observations AS SELECT * FROM read_parquet(${sqlString(pq.odds_observations)});
    CREATE OR REPLACE VIEW canonical_odds_summary AS SELECT * FROM read_parquet(${sqlString(pq.odds_summary)});

    CREATE OR REPLACE VIEW v_events AS SELECT * FROM canonical_events;
    CREATE OR REPLACE VIEW v_coverage AS SELECT * FROM canonical_coverage;

    CREATE OR REPLACE VIEW v_odds_timeline AS
      SELECT *,
        observed_at AS acquisition_time,
        coalesce(provider_time,observed_at) AS effective_at
      FROM canonical_odds_observations;

    CREATE OR REPLACE VIEW v_prematch AS
      SELECT *
      FROM v_odds_timeline
      WHERE phase LIKE 'prematch%'
         OR (kickoff_utc IS NOT NULL AND effective_at <= kickoff_utc);

    CREATE OR REPLACE VIEW v_live AS
      SELECT *
      FROM v_odds_timeline
      WHERE phase LIKE 'live%';

    CREATE OR REPLACE VIEW v_replay_asof AS
      SELECT *,
        effective_at AS valid_from,
        lead(effective_at) OVER (
          PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value
          ORDER BY effective_at,observed_at,observation_id
        ) AS valid_to,
        row_number() OVER (
          PARTITION BY provider,event_id,bookmaker,market_key,selection_key,line_value
          ORDER BY effective_at,observed_at,observation_id
        ) AS revision
      FROM v_odds_timeline;

    CREATE OR REPLACE VIEW v_market_movement AS
      SELECT * FROM canonical_odds_summary;

    CREATE OR REPLACE VIEW v_provider_comparison AS
      SELECT provider,sport_id,country_code,league_id,
             sum(CAST(event_count AS BIGINT))::BIGINT AS event_count,
             min(earliest_event_time) AS earliest_event_time,
             max(latest_event_time) AS latest_event_time,
             'IDENTITY_JOIN_UNRESOLVED'::VARCHAR AS identity_join_status
      FROM canonical_coverage
      GROUP BY provider,sport_id,country_code,league_id;

    CREATE OR REPLACE TABLE strategy_field_catalog(
      field_name VARCHAR,
      source_view VARCHAR,
      data_type VARCHAR,
      phases VARCHAR,
      operators VARCHAR,
      null_semantics VARCHAR,
      temporal_semantics VARCHAR,
      readiness VARCHAR
    );
    INSERT INTO strategy_field_catalog VALUES
      ('price','v_odds_timeline','DOUBLE','prematch,live','eq,ne,gt,gte,lt,lte,between,changed_by,increased_by,decreased_by','NULL=not observed','as-of by acquisition/effective time','STRATEGY_RESEARCH_READY'),
      ('market_key','v_odds_timeline','VARCHAR','prematch,live','eq,ne,in,not_in,is_null,is_not_null','NULL=unknown','snapshot field','STRATEGY_RESEARCH_READY'),
      ('selection_key','v_odds_timeline','VARCHAR','prematch,live','eq,ne,in,not_in','NULL=unknown','snapshot field','STRATEGY_RESEARCH_READY'),
      ('line_value','v_odds_timeline','VARCHAR','prematch,live','eq,ne,in,not_in,is_null,is_not_null','NULL=no line','snapshot field','STRATEGY_RESEARCH_READY'),
      ('kickoff_utc','v_events','TIMESTAMP','prematch,live','eq,gt,gte,lt,lte,between','NULL=unknown kickoff','event field','REPLAY_RESEARCH_READY'),
      ('event_count','v_coverage','BIGINT','all','eq,gt,gte,lt,lte,between','0=no observed events','coverage aggregate','QUERY_READY');

    CREATE OR REPLACE VIEW v_strategy_fields AS SELECT * FROM strategy_field_catalog;

    CREATE OR REPLACE VIEW v_indicator_inputs AS
      SELECT provider,event_id,market_key,selection_key,line_value,price,
             acquisition_time,effective_at,kickoff_utc,
             'UNAVAILABLE'::VARCHAR AS liquidity_status,
             'INDICATOR_INPUT_READY'::VARCHAR AS readiness
      FROM v_odds_timeline;

    CREATE OR REPLACE VIEW v_math_inputs AS
      SELECT provider,event_id,bookmaker,market_key,selection_key,line_value,price,
             acquisition_time,effective_at,kickoff_utc,
             'UNAVAILABLE'::VARCHAR AS liquidity_status,
             NULL::DOUBLE AS available_liquidity,
             NULL::DOUBLE AS matched_fill_price,
             'MATH_INPUT_READY'::VARCHAR AS readiness
      FROM v_odds_timeline;

    CREATE OR REPLACE VIEW v_backtest_observations AS
      SELECT *,
             kickoff_utc AS kickoff_cutoff,
             'last valid observation <= kickoff'::VARCHAR AS closing_rule,
             'BACKTEST_RESEARCH_READY'::VARCHAR AS readiness
      FROM v_prematch
      WHERE kickoff_utc IS NULL OR effective_at <= kickoff_utc;

    CREATE OR REPLACE VIEW v_outcomes AS
      SELECT provider,event_id,kickoff_utc,time_status,
             NULL::VARCHAR AS outcome_label,
             FALSE AS outcome_available,
             'RESULT_LABEL_NOT_MATERIALIZED'::VARCHAR AS limitation
      FROM canonical_events;
  `);

  await conn.run(`
    COPY (SELECT * FROM read_json_auto(${sqlString(src.reconciliation_state)}, format='newline_delimited'))
    TO ${sqlString(path.join(QUALITY_DIR,'reconciliation_state.parquet'))}
    (FORMAT PARQUET, COMPRESSION ZSTD);

    COPY (SELECT * FROM v_provider_comparison)
    TO ${sqlString(path.join(COMP_DIR,'provider_comparison.parquet'))}
    (FORMAT PARQUET, COMPRESSION ZSTD);
  `);

  const expected={sports:28,competitions:23400,coverage:1336,events:401349,odds_observations:821877,odds_summary:64446};
  const counts={};
  const contamination={};
  for (const name of Object.keys(expected)) {
    counts[name]=await count(conn,'canonical_'+name);
    contamination[name]=name==='odds_summary' ? 0 : await scoretrendCount(conn,'canonical_'+name);
    if (counts[name]!==expected[name]) throw new Error('count_mismatch_'+name+'_'+counts[name]+'_expected_'+expected[name]);
    if (contamination[name]!==0) throw new Error('scoretrend_contamination_'+name+'_'+contamination[name]);
  }

  const viewNames=['v_prematch','v_live','v_replay_asof','v_events','v_odds_timeline','v_market_movement','v_coverage','v_provider_comparison','v_strategy_fields','v_indicator_inputs','v_math_inputs','v_backtest_observations','v_outcomes'];
  const viewCounts={};
  for (const v of viewNames) viewCounts[v]=await count(conn,v);

  conn.closeSync();

  const files=[];
  for (const dir of [CANON_DIR,QUALITY_DIR,COMP_DIR]) {
    for (const name of fs.readdirSync(dir)) {
      const file=path.join(dir,name);
      files.push({file:path.relative(OUT_DIR,file),bytes:fs.statSync(file).size,sha256:await sha256File(file)});
    }
  }
  files.push({file:path.basename(DB_PATH),bytes:fs.statSync(DB_PATH).size,sha256:await sha256File(DB_PATH)});

  const manifest={
    package_version:'matchpilot-trial-analytics-v1',
    created_at:new Date().toISOString(),
    scoretrend_excluded:true,
    liquidity_status:'UNAVAILABLE',
    counts,
    contamination,
    views:viewCounts,
    files
  };
  const manifestPath=path.join(OUT_DIR,'analytics_manifest.json');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  manifest.manifest_sha256=await sha256File(manifestPath);

  console.log('PROVIDER_TRIAL_ANALYTICS_PACKAGE_COMPLETE '+JSON.stringify(manifest));
  return manifest;
}
