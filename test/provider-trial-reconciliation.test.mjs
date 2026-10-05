import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  BETSAPI_SPORTS,
  normalizeTrialRows,
  providerForSource,
  initReconciliation,
  rebuildOddsV3FromRaw
} from '../scripts/lib/provider-trial-reconciliation.mjs';

test('official BetsAPI R-SportID catalog is versioned', () => {
  assert.ok(BETSAPI_SPORTS.length >= 28);
  assert.equal(BETSAPI_SPORTS.find(x=>x.sport_id===1)?.name,'Soccer');
  assert.equal(BETSAPI_SPORTS.find(x=>x.sport_id===18)?.name,'Basketball');
  assert.equal(BETSAPI_SPORTS.find(x=>x.sport_id===162)?.name,'MMA/UFC');
});

test('provider source classification is deterministic', () => {
  assert.equal(providerForSource('betsapi_documented_events_inplay'),'betsapi');
  assert.equal(providerForSource('totalcorner_match_odds'),'totalcorner');
  assert.equal(providerForSource('scoretrend_games'),'scoretrend');
});

test('normalizer creates sport competition event and coverage facts', () => {
  const rows=[{
    ts:'2026-10-05T10:00:00.000Z',
    type:'betsapi_documented_events_ended',
    payload:{
      request_params:{sport_id:1},
      body:{results:[{
        id:123,time:1472688000,time_status:3,
        league:{id:55,name:'Serie Test',cc:'it'},
        home:{id:1,name:'Home'},away:{id:2,name:'Away'}
      }]}
    }
  }];
  const n=normalizeTrialRows(rows);
  assert.equal(n.sports[0].sport_id,'1');
  assert.equal(n.competitions[0].league_id,'55');
  assert.equal(n.competitions[0].country_code,'it');
  assert.equal(n.events[0].event_id,'123');
  assert.equal(n.events[0].home_name,'Home');
  assert.equal(n.coverage[0].provider_history_floor,'2016-09-01');
  assert.ok(n.coverage[0].earliest_event_time.startsWith('2016-09-01'));
});

test('request event_id is propagated into BetsAPI Event Odds observations', () => {
  const rows=[{
    ts:'2026-10-05T10:00:00.000Z',
    type:'betsapi_documented_event_odds',
    payload:{
      request_params:{event_id:'999',source:'bet365'},
      body:{results:{odds:{
        '1_1':[{home_od:'2.15',draw_od:'3.20',away_od:'3.40',add_time:1791190800}]
      }}}
    }
  }];
  const n=normalizeTrialRows(rows);
  assert.ok(n.odds.length >= 1);
  assert.equal(n.odds[0].event_id,'999');
  assert.ok(n.odds.some(x=>x.market_key==='1_1' && x.selection_key==='home' && x.price===2.15));
  assert.ok(n.odds.every(x=>x.observation_hash?.length===64));
});

test('duplicate odds in one snapshot are deduplicated by observation identity', () => {
  const payload={
    request_params:{event_id:'777'},
    body:{results:[{marketId:'m1',options:[
      {id:'a',price:{odds:1.91}},
      {id:'a',price:{odds:1.91}}
    ]}]}
  };
  const n=normalizeTrialRows([{ts:'2026-10-05T10:00:00.000Z',type:'betsapi_documented_event_odds',payload}]);
  const hashes=new Set(n.odds.map(x=>x.observation_hash));
  assert.equal(hashes.size,n.odds.length);
});


test('league catalog rows become competitions and never fake events', () => {
  const rows=[{
    ts:'2026-10-05T10:00:00.000Z',
    type:'betsapi_documented_league_list',
    payload:{
      request_params:{sport_id:18},
      body:{results:[{id:700,name:'Basket Test',cc:'us'}]}
    }
  }];
  const n=normalizeTrialRows(rows);
  assert.equal(n.competitions.length,1);
  assert.equal(n.competitions[0].sport_id,'18');
  assert.equal(n.competitions[0].league_id,'700');
  assert.equal(n.competitions[0].country_code,'us');
  assert.equal(n.events.length,0);
});


test('odds_summary SQL returns opening latest and closing prices', async (tt) => {
  const url=process.env.FUTPYTHON_TEST_DATABASE_URL;
  if (!url) return tt.skip('FUTPYTHON_TEST_DATABASE_URL not set');
  const pool=new pg.Pool({connectionString:url,max:1});
  try {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.query('CREATE SCHEMA provider_trial');
    await initReconciliation(pool);
    await pool.query(`
      INSERT INTO provider_trial.odds_observations(
        observation_hash,observed_at,provider,source_type,sport_id,country_code,league_id,league_name,event_id,kickoff_utc,phase,bookmaker,market_key,selection_key,line_value,price,provider_time,raw_path
      ) VALUES
      ('h1','2026-10-05T10:00:00Z','betsapi','betsapi_documented_event_odds','1','it','55','Serie Test','e1','2026-10-05T12:00:00Z','prematch','bet365','1_1','home',NULL,2.10,NULL,'a'),
      ('h2','2026-10-05T11:30:00Z','betsapi','betsapi_documented_event_odds','1','it','55','Serie Test','e1','2026-10-05T12:00:00Z','prematch','bet365','1_1','home',NULL,1.95,NULL,'b'),
      ('h3','2026-10-05T12:10:00Z','betsapi','betsapi_documented_event_odds','1','it','55','Serie Test','e1','2026-10-05T12:00:00Z','live_or_post','bet365','1_1','home',NULL,1.80,NULL,'c')
    `);
    const {rows}=await pool.query(`
      SELECT opening_price::float8,latest_price::float8,closing_price::float8,
             change_open_latest::float8,change_open_close::float8,observations
      FROM provider_trial.odds_summary
      WHERE event_id='e1' AND market_key='1_1' AND selection_key='home'
    `);
    assert.equal(rows.length,1);
    assert.equal(rows[0].opening_price,2.10);
    assert.equal(rows[0].latest_price,1.80);
    assert.equal(rows[0].closing_price,1.95);
    assert.equal(rows[0].observations,'3');
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.end();
  }
});


test('BetsAPI Event Odds v3 preserves market keys, selections and provider timeline', () => {
  const rows=[{
    ts:'2026-10-05T12:00:00.000Z',
    type:'betsapi_documented_event_odds',
    payload:{
      request_params:{event_id:'13236644',source:'bet365'},
      body:{results:{odds:{
        '1_1':[
          {id:'a',home_od:'2.10',draw_od:'3.20',away_od:'3.40',add_time:1791190800},
          {id:'b',home_od:'1.95',draw_od:'3.25',away_od:'3.70',add_time:1791192600}
        ],
        '1_2':[
          {id:'c',home_od:'1.90',away_od:'1.96',handicap:'-0.5',add_time:1791192600}
        ],
        '1_3':[
          {id:'d',over_od:'1.88',under_od:'2.00',handicap:'2.5',add_time:1791192600}
        ]
      }}}
    }
  }];
  const n=normalizeTrialRows(rows);
  assert.equal(new Set(n.odds.map(x=>x.event_id)).size,1);
  assert.equal(n.odds[0].event_id,'13236644');
  assert.deepEqual([...new Set(n.odds.map(x=>x.market_key))].sort(),['1_1','1_2','1_3']);
  assert.ok(n.odds.some(x=>x.market_key==='1_1' && x.selection_key==='home' && x.price===2.10));
  assert.ok(n.odds.some(x=>x.market_key==='1_2' && x.line_value==='-0.5'));
  assert.ok(n.odds.some(x=>x.market_key==='1_3' && x.selection_key==='over' && x.price===1.88));
  assert.ok(n.odds.every(x=>x.bookmaker==='bet365'));
  assert.ok(n.odds.every(x=>x.provider_time));
});

test('repeated BetsAPI Event Odds history uses provider time for stable dedupe hashes', () => {
  const payload={
    request_params:{event_id:'e1',source:'bet365'},
    body:{results:{odds:{'1_1':[{home_od:'2.00',draw_od:'3.00',away_od:'4.00',add_time:1791190800}]}}}
  };
  const a=normalizeTrialRows([{ts:'2026-10-05T12:00:00Z',type:'betsapi_documented_event_odds',payload}]);
  const b=normalizeTrialRows([{ts:'2026-10-05T12:01:00Z',type:'betsapi_documented_event_odds',payload}]);
  assert.deepEqual(a.odds.map(x=>x.observation_hash).sort(),b.odds.map(x=>x.observation_hash).sort());
});


test('odds_summary orders same-response history by provider_time, not fetch time', async (tt) => {
  const url=process.env.FUTPYTHON_TEST_DATABASE_URL;
  if (!url) return tt.skip('FUTPYTHON_TEST_DATABASE_URL not set');
  const pool=new pg.Pool({connectionString:url,max:1});
  try {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.query('CREATE SCHEMA provider_trial');
    await initReconciliation(pool);
    await pool.query(`
      INSERT INTO provider_trial.odds_observations(
        observation_hash,observed_at,provider,source_type,sport_id,country_code,league_id,league_name,event_id,kickoff_utc,phase,bookmaker,market_key,selection_key,line_value,price,provider_time,raw_path
      ) VALUES
      ('pt1','2026-10-05T12:30:00Z','betsapi','betsapi_documented_event_odds','1','it','55','Serie Test','e2','2026-10-05T12:00:00Z','prematch','bet365','1_1','home',NULL,2.20,'2026-10-05T09:00:00Z','a'),
      ('pt2','2026-10-05T12:30:00Z','betsapi','betsapi_documented_event_odds','1','it','55','Serie Test','e2','2026-10-05T12:00:00Z','prematch','bet365','1_1','home',NULL,1.90,'2026-10-05T11:59:00Z','b'),
      ('pt3','2026-10-05T12:30:00Z','betsapi','betsapi_documented_event_odds','1','it','55','Serie Test','e2','2026-10-05T12:00:00Z','live_or_post','bet365','1_1','home',NULL,1.70,'2026-10-05T12:10:00Z','c')
    `);
    const {rows}=await pool.query(`
      SELECT opening_price::float8,latest_price::float8,closing_price::float8
      FROM provider_trial.odds_summary
      WHERE event_id='e2' AND market_key='1_1' AND selection_key='home'
    `);
    assert.equal(rows[0].opening_price,2.20);
    assert.equal(rows[0].closing_price,1.90);
    assert.equal(rows[0].latest_price,1.70);
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.end();
  }
});

test('raw odds v3 rebuild replays immutable provider_trial.records', async (tt) => {
  const url=process.env.FUTPYTHON_TEST_DATABASE_URL;
  if (!url) return tt.skip('FUTPYTHON_TEST_DATABASE_URL not set');
  const pool=new pg.Pool({connectionString:url,max:1});
  try {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.query('CREATE SCHEMA provider_trial');
    await initReconciliation(pool);
    await pool.query(`
      INSERT INTO provider_trial.events(provider,event_id,sport_id,country_code,league_id,league_name,kickoff_utc,first_seen_at,last_seen_at)
      VALUES('betsapi','raw1','1','it','55','Serie Test','2026-10-05T12:00:00Z',now(),now())
    `);
    await pool.query(`
      INSERT INTO provider_trial.records(observed_at,instance_id,source_type,payload)
      VALUES(
        '2026-10-05T12:30:00Z','test','betsapi_documented_event_odds',
        $1::jsonb
      )
    `,[JSON.stringify({
      request_params:{event_id:'raw1',source:'bet365'},
      body:{results:{odds:{'1_1':[
        {home_od:'2.20',draw_od:'3.1',away_od:'3.5',add_time:1791187200},
        {home_od:'1.90',draw_od:'3.2',away_od:'3.8',add_time:1791191940},
        {home_od:'1.70',draw_od:'3.4',away_od:'4.2',add_time:1791192600}
      ]}}}
    })]);
    const result=await rebuildOddsV3FromRaw(pool,{batchSize:10});
    assert.equal(result.complete,true);
    assert.equal(result.raw_rows,1);
    const {rows}=await pool.query(`
      SELECT opening_price::float8,latest_price::float8,closing_price::float8,observations
      FROM provider_trial.odds_summary
      WHERE event_id='raw1' AND market_key='1_1' AND selection_key='home'
    `);
    assert.equal(rows.length,1);
    assert.equal(rows[0].opening_price,2.20);
    assert.equal(rows[0].closing_price,1.90);
    assert.equal(rows[0].latest_price,1.70);
    assert.equal(rows[0].observations,'3');
  } finally {
    await pool.query('DROP SCHEMA IF EXISTS provider_trial CASCADE');
    await pool.end();
  }
});
