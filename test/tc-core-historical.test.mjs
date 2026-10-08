import test from 'node:test';
import assert from 'node:assert/strict';

import {
  historicalAudit,
  historicalZoneDecision,
  movementStats,
  offsetMinutesAt,
  providerLocalToUtc,
  scheduleMatches,
  seasonKey
} from '../src/providers/totalcorner/historical.mjs';

test('historical timezone uses IANA DST instead of a fixed +120 offset', () => {
  const summer = new Date('2026-10-08T12:00:00Z');
  const winter = new Date('2026-11-08T12:00:00Z');
  assert.equal(offsetMinutesAt(summer, 'Europe/Rome'), 120);
  assert.equal(offsetMinutesAt(winter, 'Europe/Rome'), 60);

  const s = providerLocalToUtc('2026-10-08 14:00:00', 'Europe/Rome');
  assert.equal(s.offsetMinutes, 120);
  assert.equal(s.utc.toISOString(), '2026-10-08T12:00:00.000Z');

  const w = providerLocalToUtc('2026-11-08 14:00:00', 'Europe/Rome');
  assert.equal(w.offsetMinutes, 60);
  assert.equal(w.utc.toISOString(), '2026-11-08T13:00:00.000Z');
});

test('historical zone is usable only while a fresh live measurement agrees', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const obs = [{status:'MEASURED', offset_minutes:120, observed_at:'2026-10-08T11:50:00Z'}];
  assert.equal(historicalZoneDecision({observations:obs,now,timeZone:'Europe/Rome'}).verified, true);
  assert.equal(historicalZoneDecision({observations:[{...obs[0],offset_minutes:60}],now,timeZone:'Europe/Rome'}).reason, 'zone_mismatch');
  assert.equal(historicalZoneDecision({observations:[{...obs[0],observed_at:'2026-10-08T00:00:00Z'}],now,timeZone:'Europe/Rome',maxAgeMinutes:60}).reason, 'stale_live_measurement');
  assert.equal(historicalZoneDecision({observations:[],now,timeZone:'Europe/Rome'}).verified, false);
});

test('historical audit distinguishes available upstream history from retroactive live-like stats', () => {
  const view = {
    events:[{type:'goal'}], score:'2-1', ht_score:'1-0', corners:'7-3', cards:'2-1',
    attacks:[90,80], dang_attacks:[50,40], shot_on:[5,3], possession:[55,45]
  };
  const odds = {
    odds_list:[[null,2,3,4,'2026-10-08 10:00:00']],
    asian_list:[[null,-0.5,1.9,1.9,'2026-10-08 10:00:00']],
    goal_list:[[null,2.5,1.9,1.9,'2026-10-08 10:00:00']],
    corner_list:[[null,9.5,1.9,1.9,'2026-10-08 10:00:00']],
    btts_list:[[null,1.8,2.0,'2026-10-08 10:00:00']]
  };
  const book = {bookmakers:[{slug:'pinnacle'}]};
  const a = historicalAudit(view,odds,book);
  assert.equal(a.events_count,1);
  assert.equal(a.score_ft_present,true);
  assert.equal(a.score_ht_present,true);
  assert.equal(a.odds_history_present,true);
  assert.equal(a.asian_history_present,true);
  assert.equal(a.goal_history_present,true);
  assert.equal(a.corner_history_present,true);
  assert.equal(a.btts_history_present,true);
  assert.equal(a.bookmaker_odds_present,true);
  assert.equal(a.retroactive_live_stats_present,true);
});

test('movement audit counts rows and nonzero suspension flags without guessing semantics', () => {
  const body={data:[{
    asian_list:[[null,-0.5,1.9,1.9,'2026-10-08 10:00:00',null,null,0],[10,-0.25,1.8,2.0,'2026-10-08 10:10:00',null,null,1]],
    goal_list:[[null,2.5,1.9,1.9,'2026-10-08 10:00:00',null,null,0]]
  }]};
  assert.deepEqual(movementStats(body),{rows:3,suspended:1});
});

test('season key is deterministic for common European season boundaries', () => {
  assert.equal(seasonKey('2026-10-08 20:00:00'),'2026/27');
  assert.equal(seasonKey('2026-03-08 20:00:00'),'2025/26');
  assert.equal(seasonKey('bad'),null);
});


test('league schedule parser reads the real data.matches envelope and never the wrapper object', () => {
  const body = {success:1,pagination:{current:101,pages:101,next:false},data:{
    league:{league_id:'116',name:'China Super League',country:'China'},
    matches:[
      {id:'882964',l_id:'116',start:'2014-03-22 12:30:00',status:'full'},
      {id:'882828',l_id:'116',start:'2014-03-16 09:00:00',status:'full'}
    ]
  }};
  assert.deepEqual(scheduleMatches(body).map(x=>x.id), ['882964','882828']);
  assert.deepEqual(scheduleMatches({success:1,data:[]}), []);
  assert.deepEqual(scheduleMatches({success:1,data:{league:{}}}), []);
});


test('historical audit recognises TotalCorner schedule HT and card field names', () => {
  const a = historicalAudit({hf_hg:'1',hf_ag:'0',hf_hc:'3',hf_ac:'2',hyc:'2',ayc:'1',hrc:'0',arc:'1'}, {}, {});
  assert.equal(a.score_ht_present, true);
  assert.equal(a.corners_present, true);
  assert.equal(a.cards_present, true);
});


test('movement audit reads the real nested bookmaker lists and suspension flags', () => {
  const body={data:[{bookmakers:[{slug:'pinnacle',
    asian_list:[
      [null,1.5,1.9,2.0,'2026-09-20 14:00:00',null,null,0],
      ['03',null,null,null,'2026-09-20 14:35:05',0,0,1]
    ],
    goal_list:[['07',3.5,1.8,2.0,'2026-09-20 14:39:00',0,1,0]]
  }]}]};
  assert.deepEqual(movementStats(body),{rows:3,suspended:1});
});
