import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BETSAPI_SPORTS,
  normalizeTrialRows,
  providerForSource
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

test('request event_id is propagated into odds observations', () => {
  const rows=[{
    ts:'2026-10-05T10:00:00.000Z',
    type:'betsapi_documented_event_odds',
    payload:{
      request_params:{event_id:'999'},
      body:{results:[{
        marketId:'1_1',
        runnerDetails:[{selectionId:'home',runnerOdds:{decimalDisplayOdds:{decimalOdds:2.15}}}]
      }]}
    }
  }];
  const n=normalizeTrialRows(rows);
  assert.ok(n.odds.length >= 1);
  assert.equal(n.odds[0].event_id,'999');
  assert.ok(n.odds.some(x=>x.price===2.15));
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
