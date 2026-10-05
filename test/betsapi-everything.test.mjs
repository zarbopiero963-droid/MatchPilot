import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVERYTHING_FAMILIES,
  resolveEverythingToken,
  parseEnabledFamilies,
  extractEventIds,
  createHourlyBudget,
  discoverFieldPaths,
  classifyHttp,
  createEverythingRuntime,
  DOCUMENTED_ENDPOINTS,
  documentedEndpointCatalog,
  validateEndpointParams
} from '../scripts/lib/betsapi-everything.mjs';

test('Everything catalog contains the documented football families', () => {
  assert.deepEqual(
    Object.keys(EVERYTHING_FAMILIES).sort(),
    ['bet365','betfair_exchange','betfair_sportsbook','bwin','events_soccer','onexbet','sbobet'].sort()
  );
});

test('Everything token prefers dedicated override and falls back to current BetsAPI token', () => {
  assert.equal(resolveEverythingToken({BETSAPI_TOKEN:'old'}),'old');
  assert.equal(resolveEverythingToken({BETSAPI_TOKEN:'old',BETSAPI_EVERYTHING_TOKEN:'new'}),'new');
  assert.equal(resolveEverythingToken({}),null);
});

test('family allowlist ignores unknown families and removes duplicates', () => {
  assert.deepEqual(parseEnabledFamilies('bwin,bwin,unknown,sbobet'),['bwin','sbobet']);
});

test('event id extraction is bounded and deduplicated', () => {
  assert.deepEqual(extractEventIds({results:[{id:1},{event_id:2},{id:1},{FI:3}]},3),['1','2','3']);
});

test('hourly budget reserves capacity and rolls over', () => {
  let t=Date.parse('2026-10-05T00:00:00Z');
  const b=createHourlyBudget({limitPerHour:10,reserve:2,now:()=>t});
  for (let i=0;i<8;i++) assert.equal(b.spend(),true);
  assert.equal(b.spend(),false);
  assert.equal(b.snapshot().remaining,0);
  t += 3600001;
  assert.equal(b.spend(),true);
  assert.equal(b.snapshot().used,1);
});

test('field discovery preserves nested and array paths', () => {
  const p=discoverFieldPaths({score:{home:1},events:[{type:'goal',xg:.2}]});
  assert.ok(p.includes('score.home'));
  assert.ok(p.includes('events[]'));
  assert.ok(p.includes('events[].type'));
  assert.ok(p.includes('events[].xg'));
});

test('HTTP status classification is explicit', () => {
  assert.equal(classifyHttp(200),'OK');
  assert.equal(classifyHttp(403),'PERMISSION_DENIED');
  assert.equal(classifyHttp(429),'RATE_LIMITED');
  assert.equal(classifyHttp(503),'UPSTREAM_ERROR');
});

test('disabled Everything runtime performs zero network calls', async () => {
  let calls=0;
  const rt=createEverythingRuntime({
    env:{BETSAPI_TOKEN:'secret',BETSAPI_EVERYTHING_ENABLED:'false'},
    fetchImpl:async()=>{calls++; throw new Error('must not call');}
  });
  await rt.discoveryCycle();
  await rt.prematchCycle();
  assert.equal(calls,0);
  assert.equal(rt.status().enabled,false);
  assert.equal(rt.status().token_present,true);
});

test('enabled runtime records permission denied without leaking token into persisted metadata', async () => {
  const writes=[];
  let seenUrl='';
  const rt=createEverythingRuntime({
    env:{
      BETSAPI_EVERYTHING_TOKEN:'topsecret',
      BETSAPI_EVERYTHING_ENABLED:'true',
      BETSAPI_EVERYTHING_FAMILIES:'bwin',
      BETSAPI_EVERYTHING_REQS_PER_HOUR:'1800',
      BETSAPI_EVERYTHING_RESERVE:'120'
    },
    fetchImpl:async url=>{
      seenUrl=String(url);
      return {
        status:403,
        headers:{get:()=>null},
        text:async()=>JSON.stringify({success:0,error:'PERMISSION_DENIED'})
      };
    },
    write:(type,payload)=>writes.push({type,payload})
  });
  await rt.discoveryCycle();
  assert.equal(rt.status().state.bwin.status,'PERMISSION_DENIED');
  assert.equal(writes.length,1);
  assert.equal(writes[0].payload.endpoint,'/v1/bwin/inplay');
  assert.ok(seenUrl.includes('token=topsecret'));
  assert.equal(JSON.stringify(writes).includes('topsecret'),false);
});

test('enabled runtime discovers events and batches detail ids', async () => {
  const calls=[];
  const writes=[];
  const rt=createEverythingRuntime({
    env:{
      BETSAPI_EVERYTHING_TOKEN:'x',
      BETSAPI_EVERYTHING_ENABLED:'true',
      BETSAPI_EVERYTHING_FAMILIES:'sbobet',
      BETSAPI_EVERYTHING_MAX_DETAILS:'3'
    },
    fetchImpl:async url=>{
      const u=new URL(String(url));
      calls.push(u);
      const isDetail=u.pathname.endsWith('/event');
      return {
        status:200,
        headers:{get:k=>k==='x-ratelimit-remaining'?'1700':null},
        text:async()=>JSON.stringify(isDetail
          ? {success:1,results:[{id:'a',markets:[{name:'Asian Handicap'}]}]}
          : {success:1,results:[{id:11},{id:12},{id:13},{id:14}]})
      };
    },
    write:(type,payload)=>writes.push({type,payload})
  });
  await rt.discoveryCycle();
  assert.equal(calls.length,2);
  assert.equal(calls[1].searchParams.get('event_id'),'11,12,13');
  assert.deepEqual(rt.status().state.sbobet.event_ids,['11','12','13']);
  assert.ok(writes[1].payload.fields.some(x=>x.includes('markets')));
});

test('budget hold prevents calls after effective limit', async () => {
  let calls=0;
  const rt=createEverythingRuntime({
    env:{
      BETSAPI_EVERYTHING_TOKEN:'x',
      BETSAPI_EVERYTHING_ENABLED:'true',
      BETSAPI_EVERYTHING_FAMILIES:'bwin',
      BETSAPI_EVERYTHING_REQS_PER_HOUR:'2',
      BETSAPI_EVERYTHING_RESERVE:'1'
    },
    fetchImpl:async()=>{
      calls++;
      return {status:200,headers:{get:()=>null},text:async()=>JSON.stringify({results:[]})};
    }
  });
  await rt.discoveryCycle();
  await rt.prematchCycle();
  assert.equal(calls,1);
  assert.equal(rt.status().state.bwin.status,'BUDGET_HOLD');
});


test('documented catalog covers all 51 API calls shown in BetsAPI docs index', () => {
  const catalog=documentedEndpointCatalog();
  assert.equal(catalog.length,51);
  const groups=Object.groupBy(catalog,x=>x.group);
  assert.equal(groups.events.length,21);
  assert.equal(groups.bet365.length,7);
  assert.equal(groups.bwin.length,4);
  assert.equal(groups.betfair.length,8);
  assert.equal(groups.sbobet.length,4);
  assert.equal(groups['1xbet'].length,4);
  assert.equal(groups.results.length,3);
});

test('documented catalog includes current versioned endpoint paths', () => {
  assert.equal(DOCUMENTED_ENDPOINTS.bet365_prematch.path,'/v4/bet365/prematch');
  assert.equal(DOCUMENTED_ENDPOINTS.events_inplay.path,'/v3/events/inplay');
  assert.equal(DOCUMENTED_ENDPOINTS.events_upcoming.path,'/v3/events/upcoming');
  assert.equal(DOCUMENTED_ENDPOINTS.events_ended.path,'/v3/events/ended');
  assert.equal(DOCUMENTED_ENDPOINTS.event_odds.path,'/v2/event/odds');
  assert.equal(DOCUMENTED_ENDPOINTS.league_list.path,'/v3/league');
  assert.equal(DOCUMENTED_ENDPOINTS.team_list.path,'/v3/team');
  assert.equal(DOCUMENTED_ENDPOINTS.league_table.path,'/v3/league/table');
});

test('endpoint parameter validation applies defaults and fails closed', () => {
  const ok=validateEndpointParams(DOCUMENTED_ENDPOINTS.events_inplay,{});
  assert.equal(ok.ok,true);
  assert.equal(ok.params.sport_id,1);
  const bad=validateEndpointParams(DOCUMENTED_ENDPOINTS.event_view,{});
  assert.equal(bad.ok,false);
  assert.deepEqual(bad.missing,['event_id']);
});

test('all documented endpoint calls remain dormant when Everything flag is off', async () => {
  let calls=0;
  const rt=createEverythingRuntime({
    env:{BETSAPI_TOKEN:'secret',BETSAPI_EVERYTHING_ENABLED:'false'},
    fetchImpl:async()=>{calls++; throw new Error('must stay dormant');}
  });
  for (const endpoint of documentedEndpointCatalog()) {
    const params={event_id:'1',FI:'1',league_id:'1',team_id:'1',player_id:'1',home:'A',away:'B',time:'20261005',sport_id:1};
    const r=await rt.callDocumentedEndpoint(endpoint.key,params);
    assert.equal(r.skipped,true);
    assert.equal(r.reason,'DISABLED');
  }
  assert.equal(calls,0);
});

test('generic documented caller validates required params before spending budget or networking', async () => {
  let calls=0;
  const rt=createEverythingRuntime({
    env:{BETSAPI_EVERYTHING_TOKEN:'x',BETSAPI_EVERYTHING_ENABLED:'true'},
    fetchImpl:async()=>{calls++; throw new Error('must not call');}
  });
  const before=rt.status().budget.used;
  const r=await rt.callDocumentedEndpoint('event_view',{});
  assert.equal(r.reason,'MISSING_PARAMS');
  assert.deepEqual(r.missing,['event_id']);
  assert.equal(calls,0);
  assert.equal(rt.status().budget.used,before);
});

test('generic documented caller persists metadata but never token', async () => {
  const writes=[];
  let seen='';
  const rt=createEverythingRuntime({
    env:{BETSAPI_EVERYTHING_TOKEN:'secret-token',BETSAPI_EVERYTHING_ENABLED:'true'},
    fetchImpl:async url=>{
      seen=String(url);
      return {status:200,ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({results:[{id:1}]})};
    },
    write:(type,payload)=>writes.push({type,payload})
  });
  const r=await rt.callDocumentedEndpoint('events_inplay',{});
  assert.equal(r.ok,true);
  assert.ok(seen.includes('token=secret-token'));
  assert.equal(JSON.stringify(writes).includes('secret-token'),false);
  assert.equal(writes[0].payload.endpoint_key,'events_inplay');
});


test('full catalog cycle stays dormant unless Everything is enabled', async () => {
  let calls=0;
  const rt=createEverythingRuntime({
    env:{BETSAPI_TOKEN:'x',BETSAPI_EVERYTHING_ENABLED:'false'},
    fetchImpl:async()=>{calls++; throw new Error('must not call');}
  });
  const r=await rt.fullCatalogCycle();
  assert.equal(r.disabled,true);
  assert.equal(calls,0);
});

test('full catalog cycle harvests real ids and probes dependent endpoints', async () => {
  const called=[];
  const rt=createEverythingRuntime({
    env:{
      BETSAPI_EVERYTHING_TOKEN:'x',
      BETSAPI_EVERYTHING_ENABLED:'true',
      BETSAPI_EVERYTHING_FAMILIES:'events_soccer,bet365,bwin,betfair_exchange,betfair_sportsbook,sbobet,onexbet',
      BETSAPI_EVERYTHING_REQS_PER_HOUR:'1800',
      BETSAPI_EVERYTHING_RESERVE:'120'
    },
    fetchImpl:async url=>{
      const u=new URL(String(url));
      called.push(u.pathname);
      let body={success:1,results:[]};
      if (u.pathname==='/v3/events/inplay') {
        body={success:1,results:[{id:123,bet365_id:456,time:1791158400,home:{id:10,name:'Home'},away:{id:11,name:'Away'},league:{id:20,name:'League'}}]};
      } else if (u.pathname==='/v3/league') {
        body={success:1,results:[{id:20,name:'League'}]};
      } else if (u.pathname==='/v3/team') {
        body={success:1,results:[{id:10,name:'Home'}]};
      } else if (u.pathname==='/v1/event/lineup') {
        body={success:1,results:[{player_id:99}]};
      }
      return {status:200,ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
    }
  });
  const r=await rt.fullCatalogCycle();
  assert.ok(r.attempted > 20);
  assert.ok(r.ok > 20);
  assert.ok(called.includes('/v1/event/view'));
  assert.ok(called.includes('/v1/league/info'));
  assert.ok(called.includes('/v1/team/info'));
  assert.ok(called.includes('/v1/player'));
  assert.ok(called.includes('/v1/events/search'));
  assert.ok(called.includes('/v4/bet365/prematch'));
  assert.ok(r.context.event_ids >= 1);
  assert.ok(r.context.fi_ids >= 1);
  assert.ok(r.context.league_ids >= 1);
  assert.ok(r.context.team_ids >= 1);
  assert.ok(r.context.player_ids >= 1);
  assert.equal(r.context.has_search_tuple,true);
});


test('concurrent full catalog probes collapse to one upstream cycle', async () => {
  let calls=0;
  const rt=createEverythingRuntime({
    env:{
      BETSAPI_EVERYTHING_TOKEN:'x',
      BETSAPI_EVERYTHING_ENABLED:'true',
      BETSAPI_EVERYTHING_REQS_PER_HOUR:'1800',
      BETSAPI_EVERYTHING_RESERVE:'120'
    },
    fetchImpl:async url=>{
      calls++;
      await new Promise(r=>setTimeout(r,2));
      const u=new URL(String(url));
      let body={success:1,results:[]};
      if (u.pathname==='/v3/events/inplay') {
        body={success:1,results:[{id:123,bet365_id:456,time:1791158400,home:{id:10,name:'Home'},away:{id:11,name:'Away'},league:{id:20,name:'League'}}]};
      }
      return {status:200,ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
    }
  });
  const [a,b]=await Promise.all([rt.fullCatalogCycle(),rt.fullCatalogCycle()]);
  assert.equal(a.cycles,1);
  assert.equal(b.cycles,1);
  assert.equal(rt.fullCatalogStatus().cycles,1);
  assert.ok(calls > 0);
});


test('full catalog harvest recognizes squad player rows by id/type_id', async () => {
  const rt=createEverythingRuntime({
    env:{BETSAPI_EVERYTHING_TOKEN:'x',BETSAPI_EVERYTHING_ENABLED:'true'},
    fetchImpl:async url=>{
      const u=new URL(String(url));
      let body={success:1,results:[]};
      if (u.pathname==='/v3/events/inplay') {
        body={success:1,results:[{id:123,time:1791158400,home:{id:10,name:'Home'},away:{id:11,name:'Away'},league:{id:20,name:'League'}}]};
      } else if (u.pathname==='/v1/team/squad') {
        body={success:1,results:[{id:6019,type_id:1,name:'Player'}]};
      }
      return {status:200,ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(body)};
    }
  });
  const r=await rt.fullCatalogCycle();
  assert.ok(r.context.player_ids >= 1);
});
