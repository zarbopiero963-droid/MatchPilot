const DEFAULT_LIMIT_PER_HOUR = 1800;


export const DOCUMENTED_ENDPOINTS = Object.freeze({
  // Events API
  events_inplay: { group:'events', method:'GET', path:'/v3/events/inplay', required:['sport_id'], defaults:{sport_id:1}, mode:'scheduled' },
  events_upcoming: { group:'events', method:'GET', path:'/v3/events/upcoming', required:['sport_id'], defaults:{sport_id:1,skip_esports:1}, mode:'scheduled' },
  events_ended: { group:'events', method:'GET', path:'/v3/events/ended', required:['sport_id'], defaults:{sport_id:1,skip_esports:1}, mode:'scheduled' },
  events_search: { group:'events', method:'GET', path:'/v1/events/search', required:['sport_id','home','away','time'], defaults:{sport_id:1}, mode:'on_demand' },
  event_view: { group:'events', method:'GET', path:'/v1/event/view', required:['event_id'], mode:'event' },
  event_history: { group:'events', method:'GET', path:'/v1/event/history', required:['event_id'], defaults:{qty:10}, mode:'event' },
  event_odds_summary: { group:'events', method:'GET', path:'/v2/event/odds/summary', required:['event_id'], mode:'event' },
  event_odds: { group:'events', method:'GET', path:'/v2/event/odds', required:['event_id'], mode:'event' },
  event_stats_trend: { group:'events', method:'GET', path:'/v1/event/stats_trend', required:['event_id'], mode:'event' },
  event_lineup: { group:'events', method:'GET', path:'/v1/event/lineup', required:['event_id'], mode:'event' },
  league_list: { group:'events', method:'GET', path:'/v3/league', required:['sport_id'], defaults:{sport_id:1}, mode:'scheduled' },
  league_info: { group:'events', method:'GET', path:'/v1/league/info', required:['league_id'], mode:'league' },
  league_table: { group:'events', method:'GET', path:'/v3/league/table', required:['league_id'], mode:'league' },
  league_toplist: { group:'events', method:'GET', path:'/v1/league/toplist', required:['league_id'], mode:'league' },
  team_list: { group:'events', method:'GET', path:'/v3/team', required:['sport_id'], defaults:{sport_id:1}, mode:'scheduled' },
  team_info: { group:'events', method:'GET', path:'/v1/team/info', required:['team_id'], mode:'team' },
  team_squad: { group:'events', method:'GET', path:'/v1/team/squad', required:['team_id'], mode:'team' },
  team_members: { group:'events', method:'GET', path:'/v1/team/members', required:['team_id'], mode:'team' },
  player: { group:'events', method:'GET', path:'/v1/player', required:['player_id'], mode:'player' },
  tennis_ranking: { group:'events', method:'GET', path:'/v1/tennis/ranking', required:[], defaults:{type_id:1}, mode:'on_demand' },
  event_merge_history: { group:'events', method:'GET', path:'/v1/event/merge_history', required:[], mode:'scheduled' },

  // Bet365 API
  bet365_inplay: { group:'bet365', method:'GET', path:'/v1/bet365/inplay', required:[], mode:'scheduled' },
  bet365_inplay_filter: { group:'bet365', method:'GET', path:'/v1/bet365/inplay_filter', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  bet365_event: { group:'bet365', method:'GET', path:'/v1/bet365/event', required:['FI'], defaults:{stats:1}, mode:'event' },
  bet365_league: { group:'bet365', method:'GET', path:'/v1/bet365/league', required:['sport_id'], defaults:{sport_id:1}, mode:'scheduled' },
  bet365_upcoming: { group:'bet365', method:'GET', path:'/v1/bet365/upcoming', required:['sport_id'], defaults:{sport_id:1}, mode:'scheduled' },
  bet365_prematch: { group:'bet365', method:'GET', path:'/v4/bet365/prematch', required:['FI'], mode:'event' },
  bet365_result: { group:'bet365', method:'GET', path:'/v1/bet365/result', required:['event_id'], mode:'event' },

  // BWin API
  bwin_inplay: { group:'bwin', method:'GET', path:'/v1/bwin/inplay', required:[], defaults:{sport_id:4}, mode:'scheduled' },
  bwin_event: { group:'bwin', method:'GET', path:'/v1/bwin/event', required:['event_id'], mode:'event' },
  bwin_prematch: { group:'bwin', method:'GET', path:'/v1/bwin/prematch', required:[], defaults:{sport_id:4}, mode:'scheduled' },
  bwin_result: { group:'bwin', method:'GET', path:'/v1/bwin/result', required:['event_id'], mode:'event' },

  // Betfair API
  betfair_sb_inplay: { group:'betfair', method:'GET', path:'/v1/betfair/sb/inplay', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  betfair_sb_upcoming: { group:'betfair', method:'GET', path:'/v1/betfair/sb/upcoming', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  betfair_sb_event: { group:'betfair', method:'GET', path:'/v1/betfair/sb/event', required:['event_id'], mode:'event' },
  betfair_ex_inplay: { group:'betfair', method:'GET', path:'/v1/betfair/ex/inplay', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  betfair_ex_upcoming: { group:'betfair', method:'GET', path:'/v1/betfair/ex/upcoming', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  betfair_ex_event: { group:'betfair', method:'GET', path:'/v1/betfair/ex/event', required:['event_id'], mode:'event' },
  betfair_timeline: { group:'betfair', method:'GET', path:'/v1/betfair/timeline', required:['event_id'], mode:'event' },
  betfair_result: { group:'betfair', method:'GET', path:'/v1/betfair/result', required:['event_id'], mode:'event' },

  // SBOBET API
  sbobet_inplay: { group:'sbobet', method:'GET', path:'/v1/sbobet/inplay', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  sbobet_upcoming: { group:'sbobet', method:'GET', path:'/v1/sbobet/upcoming', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  sbobet_event: { group:'sbobet', method:'GET', path:'/v1/sbobet/event', required:['event_id'], mode:'event' },
  sbobet_result: { group:'sbobet', method:'GET', path:'/v1/sbobet/result', required:['event_id'], mode:'event' },

  // 1xBet API
  onexbet_inplay: { group:'1xbet', method:'GET', path:'/v1/1xbet/inplay', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  onexbet_upcoming: { group:'1xbet', method:'GET', path:'/v1/1xbet/upcoming', required:[], defaults:{sport_id:1}, mode:'scheduled' },
  onexbet_event: { group:'1xbet', method:'GET', path:'/v1/1xbet/event', required:['event_id'], mode:'event' },
  onexbet_result: { group:'1xbet', method:'GET', path:'/v1/1xbet/result', required:['event_id'], mode:'event' },

  // Results API
  result_williamhill: { group:'results', method:'GET', path:'/v1/williamhill/result', required:['event_id'], mode:'on_demand' },
  result_sbobet: { group:'results', method:'GET', path:'/v1/sbobet/result', required:['event_id'], mode:'on_demand' },
  result_betsson: { group:'results', method:'GET', path:'/v1/betsson/result', required:['event_id'], mode:'on_demand' }
});

export function documentedEndpointCatalog() {
  return Object.entries(DOCUMENTED_ENDPOINTS).map(([key, value]) => ({ key, ...value }));
}

export function validateEndpointParams(endpoint, params = {}) {
  const merged = { ...(endpoint.defaults || {}), ...params };
  const missing = (endpoint.required || []).filter(k => merged[k] === undefined || merged[k] === null || merged[k] === '');
  return { ok: missing.length === 0, missing, params: merged };
}

export const EVERYTHING_FAMILIES = Object.freeze({
  bet365: {
    label:'Bet365',
    sport_id:1,
    endpoints:[
      { key:'inplay', path:'/v1/bet365/inplay_filter', params:{} },
      { key:'upcoming', path:'/v1/bet365/upcoming', params:{ sport_id:1 } }
    ],
    detail:{ path:'/v1/bet365/event', idParam:'FI', extra:{ stats:1 } }
  },
  bwin: {
    label:'BWin',
    sport_id:4,
    endpoints:[
      { key:'inplay', path:'/v1/bwin/inplay', params:{ sport_id:4 } },
      { key:'prematch', path:'/v1/bwin/prematch', params:{ sport_id:4 } }
    ],
    detail:{ path:'/v1/bwin/event', idParam:'event_id', extra:{} }
  },
  betfair_exchange: {
    label:'Betfair Exchange',
    sport_id:1,
    endpoints:[
      { key:'inplay', path:'/v1/betfair/ex/inplay', params:{ sport_id:1 } },
      { key:'upcoming', path:'/v1/betfair/ex/upcoming', params:{ sport_id:1 } }
    ],
    detail:{ path:'/v1/betfair/ex/event', idParam:'event_id', extra:{} }
  },
  betfair_sportsbook: {
    label:'Betfair Sportsbook',
    sport_id:1,
    endpoints:[
      { key:'inplay', path:'/v1/betfair/sb/inplay', params:{ sport_id:1 } }
    ],
    detail:{ path:'/v1/betfair/sb/event', idParam:'event_id', extra:{} }
  },
  sbobet: {
    label:'Sbobet',
    sport_id:1,
    endpoints:[
      { key:'inplay', path:'/v1/sbobet/inplay', params:{ sport_id:1 } },
      { key:'upcoming', path:'/v1/sbobet/upcoming', params:{ sport_id:1 } }
    ],
    detail:{ path:'/v1/sbobet/event', idParam:'event_id', extra:{} }
  },
  onexbet: {
    label:'1xBet',
    sport_id:1,
    endpoints:[
      { key:'inplay', path:'/v1/1xbet/inplay', params:{ sport_id:1 } }
    ],
    detail:{ path:'/v1/1xbet/event', idParam:'event_id', extra:{} }
  },
  events_soccer: {
    label:'Events / Soccer',
    sport_id:1,
    endpoints:[
      { key:'inplay', path:'/v3/events/inplay', params:{ sport_id:1 } },
      { key:'upcoming', path:'/v3/events/upcoming', params:{ sport_id:1, skip_esports:1 } }
    ],
    detail:{ path:'/v1/event/view', idParam:'event_id', extra:{} }
  }
});


function firstId(set) {
  return set.size ? [...set][0] : null;
}

function harvestDiscoveryContext(body, ctx) {
  const seen=new Set();
  function add(set,value) {
    if (value !== undefined && value !== null && String(value).length) set.add(String(value));
  }
  function walk(v,parentKey='',depth=0) {
    if (!v || depth > 8) return;
    if (typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);

    if (Array.isArray(v)) {
      for (const x of v.slice(0,50)) walk(x,parentKey,depth+1);
      return;
    }

    if (parentKey === 'league') add(ctx.league_ids,v.id ?? v.league_id ?? v.leagueId);
    if (parentKey === 'home' || parentKey === 'away' || parentKey === 'team') add(ctx.team_ids,v.id ?? v.team_id ?? v.teamId);
    if (parentKey === 'player') add(ctx.player_ids,v.id ?? v.player_id ?? v.playerId);

    add(ctx.event_ids,v.event_id ?? v.eventId ?? v.our_event_id);
    if (parentKey === 'results' && (v.home || v.away || v.bet365_id || v.time_status !== undefined)) add(ctx.event_ids,v.id);
    add(ctx.fi_ids,v.FI ?? v.bet365_id);
    add(ctx.league_ids,v.league_id ?? v.leagueId);
    add(ctx.team_ids,v.team_id ?? v.teamId);
    add(ctx.player_ids,v.player_id ?? v.playerId);
    if ((v.type_id !== undefined || v.typeId !== undefined) && v.id !== undefined) add(ctx.player_ids,v.id);
    if (parentKey === 'results' && v.id !== undefined &&
        (v.has_squad !== undefined || (v.sport_id !== undefined && v.name !== undefined &&
          v.position === undefined && v.birthdate === undefined))) {
      add(ctx.team_ids,v.id);
    }
    if (parentKey === 'results' && v.id !== undefined &&
        (v.position !== undefined || v.birthdate !== undefined || v.shirtnumber !== undefined)) {
      add(ctx.player_ids,v.id);
    }

    if (v.home?.name && !ctx.home) ctx.home=String(v.home.name);
    if (v.away?.name && !ctx.away) ctx.away=String(v.away.name);
    if ((v.time ?? v.timestamp) && !ctx.time) ctx.time=String(v.time ?? v.timestamp);

    for (const [k,x] of Object.entries(v)) walk(x,k,depth+1);
  }
  walk(body);
  return ctx;
}

export function resolveEverythingToken(env = process.env) {
  return String(env.BETSAPI_EVERYTHING_TOKEN || env.BETSAPI_TOKEN || '').trim() || null;
}

export function parseEnabledFamilies(value, catalog = EVERYTHING_FAMILIES) {
  if (!value || String(value).trim().toLowerCase() === 'all') return Object.keys(catalog);
  const requested=String(value).split(',').map(x=>x.trim()).filter(Boolean);
  return [...new Set(requested.filter(k=>catalog[k]))];
}

export function extractEventIds(body, max = 10) {
  const candidates = [
    body?.results,
    body?.data,
    body?.events,
    body?.results?.events
  ].find(Array.isArray) || [];
  const ids=[];
  const seen=new Set();
  for (const item of candidates) {
    const id=item?.id ?? item?.event_id ?? item?.FI ?? item?.our_event_id;
    if (id === undefined || id === null || !String(id).length) continue;
    const value=String(id);
    if (seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
    if (ids.length >= max) break;
  }
  return ids;
}

export function createHourlyBudget({ limitPerHour = DEFAULT_LIMIT_PER_HOUR, reserve = 120, now = () => Date.now() } = {}) {
  let windowStart=now();
  let used=0;
  const effectiveLimit=Math.max(1, Number(limitPerHour) - Math.max(0, Number(reserve)));
  function rollover() {
    const t=now();
    if (t - windowStart >= 3600000) {
      windowStart=t;
      used=0;
    }
  }
  return {
    canSpend(cost=1) { rollover(); return used + cost <= effectiveLimit; },
    spend(cost=1) {
      rollover();
      if (used + cost > effectiveLimit) return false;
      used += cost;
      return true;
    },
    snapshot() {
      rollover();
      return {
        configured_limit:Number(limitPerHour),
        reserve:Number(reserve),
        effective_limit:effectiveLimit,
        used,
        remaining:Math.max(0,effectiveLimit-used),
        window_started_at:new Date(windowStart).toISOString()
      };
    }
  };
}

export function discoverFieldPaths(value, { maxPaths = 1000, maxDepth = 8 } = {}) {
  const out=new Set();
  function walk(v, p, depth) {
    if (out.size >= maxPaths || depth > maxDepth) return;
    if (Array.isArray(v)) {
      out.add(p ? p+'[]' : '[]');
      for (const x of v.slice(0,3)) walk(x,p ? p+'[]' : '[]',depth+1);
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k,x] of Object.entries(v)) {
        const q=p ? p+'.'+k : k;
        out.add(q);
        walk(x,q,depth+1);
        if (out.size >= maxPaths) break;
      }
    }
  }
  walk(value,'',0);
  return [...out].sort();
}

export function classifyHttp(status) {
  if (status === 403) return 'PERMISSION_DENIED';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'UPSTREAM_ERROR';
  if (status >= 200 && status < 300) return 'OK';
  return 'HTTP_ERROR';
}

export function buildUrl(base, token, endpoint) {
  const url=new URL(base + endpoint.path);
  url.searchParams.set('token', token);
  for (const [k,v] of Object.entries(endpoint.params || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k,String(v));
  }
  return url;
}

export function createEverythingRuntime({
  env=process.env,
  fetchImpl=fetch,
  baseUrl='https://api.b365api.com',
  write=()=>{},
  now=()=>Date.now()
} = {}) {
  const enabled=String(env.BETSAPI_EVERYTHING_ENABLED || '').toLowerCase() === 'true';
  const token=resolveEverythingToken(env);
  const families=parseEnabledFamilies(env.BETSAPI_EVERYTHING_FAMILIES || 'all');
  const maxDetails=Math.max(0,Number(env.BETSAPI_EVERYTHING_MAX_DETAILS || 5));
  const budget=createHourlyBudget({
    limitPerHour:Number(env.BETSAPI_EVERYTHING_REQS_PER_HOUR || DEFAULT_LIMIT_PER_HOUR),
    reserve:Number(env.BETSAPI_EVERYTHING_RESERVE || 120),
    now
  });
  const catalogContext={
    event_ids:new Set(),
    fi_ids:new Set(),
    league_ids:new Set(),
    team_ids:new Set(),
    player_ids:new Set(),
    home:null,
    away:null,
    time:null
  };
  let fullCatalogPromise=null;
  const catalogProbe={
    cycles:0,last_at:null,attempted:0,ok:0,skipped:0,permission_denied:0,rate_limited:0,http_error:0,last_error:null,
    endpoint_results:{}
  };
  const state=Object.fromEntries(families.map(k=>[k,{
    status:enabled ? (token ? 'READY' : 'NO_TOKEN') : 'DISABLED',
    last_at:null,
    last_http_status:null,
    last_error:null,
    request_count:0,
    event_ids:[],
    fields:[]
  }]));

  async function call(familyKey, endpoint, paramsOverride={}) {
    const family=EVERYTHING_FAMILIES[familyKey];
    if (!enabled || !token || !family) return null;
    if (!budget.spend(1)) {
      state[familyKey].status='BUDGET_HOLD';
      return null;
    }
    const ep={...endpoint,params:{...(endpoint.params||{}),...paramsOverride}};
    const url=buildUrl(baseUrl,token,ep);
    const started=now();
    let status=0, body=null, latency=0;
    try {
      const res=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});
      status=res.status;
      latency=now()-started;
      const text=await res.text();
      try { body=JSON.parse(text); } catch { body={raw:text.slice(0,50000)}; }
      const cls=classifyHttp(status);
      state[familyKey].status=cls;
      state[familyKey].last_http_status=status;
      state[familyKey].last_at=new Date(now()).toISOString();
      state[familyKey].request_count++;
      state[familyKey].last_error=null;
      state[familyKey].fields=discoverFieldPaths(body);
      write('betsapi_everything_'+familyKey+'_'+ep.key,{
        family:familyKey,
        endpoint:ep.path,
        status,
        latency_ms:latency,
        classification:cls,
        rate_limit:{
          limit:res.headers?.get?.('x-ratelimit-limit') || null,
          remaining:res.headers?.get?.('x-ratelimit-remaining') || null,
          reset:res.headers?.get?.('x-ratelimit-reset') || null
        },
        fields:state[familyKey].fields,
        body
      });
      return {status,body,latency_ms:latency};
    } catch (error) {
      latency=now()-started;
      state[familyKey].status='ERROR';
      state[familyKey].last_at=new Date(now()).toISOString();
      state[familyKey].request_count++;
      state[familyKey].last_error=String(error?.message||error);
      write('betsapi_everything_'+familyKey+'_error',{
        family:familyKey,endpoint:ep.path,error:String(error?.message||error),latency_ms:latency
      });
      return null;
    }
  }

  async function discoveryCycle() {
    if (!enabled || !token) return status();
    for (const familyKey of families) {
      const family=EVERYTHING_FAMILIES[familyKey];
      const inplay=family.endpoints.find(e=>e.key==='inplay') || family.endpoints[0];
      const r=await call(familyKey,inplay);
      if (!r || r.status < 200 || r.status >= 300) continue;
      const ids=extractEventIds(r.body,maxDetails);
      state[familyKey].event_ids=ids;
      if (family.detail && ids.length) {
        const batched=family.detail.idParam === 'event_id' ? ids.slice(0,10).join(',') : ids[0];
        await call(familyKey,{key:'detail',path:family.detail.path,params:{}},{
          [family.detail.idParam]:batched,
          ...(family.detail.extra||{})
        });
      }
    }
    return status();
  }

  async function prematchCycle() {
    if (!enabled || !token) return status();
    for (const familyKey of families) {
      const family=EVERYTHING_FAMILIES[familyKey];
      const ep=family.endpoints.find(e=>e.key==='upcoming' || e.key==='prematch');
      if (ep) await call(familyKey,ep);
    }
    return status();
  }

  function status() {
    return {
      enabled,
      token_present:Boolean(token),
      token_source: env.BETSAPI_EVERYTHING_TOKEN ? 'BETSAPI_EVERYTHING_TOKEN' : token ? 'BETSAPI_TOKEN' : null,
      families,
      budget:budget.snapshot(),
      state
    };
  }

  async function callDocumentedEndpoint(endpointKey, params={}) {
    const endpoint=DOCUMENTED_ENDPOINTS[endpointKey];
    if (!endpoint) throw new Error('unknown documented endpoint: '+endpointKey);
    const check=validateEndpointParams(endpoint,params);
    if (!check.ok) {
      return { ok:false, skipped:true, reason:'MISSING_PARAMS', missing:check.missing };
    }
    if (!enabled || !token) {
      return { ok:false, skipped:true, reason:enabled ? 'NO_TOKEN' : 'DISABLED' };
    }
    if (!budget.spend(1)) {
      return { ok:false, skipped:true, reason:'BUDGET_HOLD' };
    }
    const url=buildUrl(baseUrl,token,{path:endpoint.path,params:check.params});
    const started=now();
    try {
      const res=await fetchImpl(url,{signal:AbortSignal.timeout(20000)});
      const latency=now()-started;
      const text=await res.text();
      let body;
      try { body=JSON.parse(text); } catch { body={raw:text.slice(0,50000)}; }
      const classification=classifyHttp(res.status);
      const fields=discoverFieldPaths(body);
      write('betsapi_documented_'+endpointKey,{
        endpoint_key:endpointKey,
        group:endpoint.group,
        mode:endpoint.mode,
        endpoint:endpoint.path,
        status:res.status,
        latency_ms:latency,
        classification,
        rate_limit:{
          limit:res.headers?.get?.('x-ratelimit-limit') || null,
          remaining:res.headers?.get?.('x-ratelimit-remaining') || null,
          reset:res.headers?.get?.('x-ratelimit-reset') || null
        },
        fields,
        body
      });
      harvestDiscoveryContext(body,catalogContext);
      return {ok:res.ok,status:res.status,classification,body,fields,latency_ms:latency};
    } catch (error) {
      const safe=String(error?.message||error);
      write('betsapi_documented_'+endpointKey+'_error',{
        endpoint_key:endpointKey,group:endpoint.group,mode:endpoint.mode,endpoint:endpoint.path,error:safe
      });
      return {ok:false,error:safe};
    }
  }


  function paramsForDocumentedEndpoint(endpointKey, endpoint) {
    const group=endpoint.group;
    let eventId=null;
    if (group === 'betfair') eventId=state.betfair_exchange?.event_ids?.[0] || state.betfair_sportsbook?.event_ids?.[0] || firstId(catalogContext.event_ids);
    else if (group === 'bwin') eventId=state.bwin?.event_ids?.[0] || firstId(catalogContext.event_ids);
    else if (group === 'sbobet') eventId=state.sbobet?.event_ids?.[0] || firstId(catalogContext.event_ids);
    else if (group === '1xbet') eventId=state.onexbet?.event_ids?.[0] || firstId(catalogContext.event_ids);
    else eventId=firstId(catalogContext.event_ids);

    const fi=state.bet365?.event_ids?.[0] || firstId(catalogContext.fi_ids);
    const params={};
    for (const key of endpoint.required || []) {
      if (key === 'event_id' && eventId) params.event_id=eventId;
      else if (key === 'FI' && fi) params.FI=fi;
      else if (key === 'league_id' && firstId(catalogContext.league_ids)) params.league_id=firstId(catalogContext.league_ids);
      else if (key === 'team_id' && firstId(catalogContext.team_ids)) params.team_id=firstId(catalogContext.team_ids);
      else if (key === 'player_id' && firstId(catalogContext.player_ids)) params.player_id=firstId(catalogContext.player_ids);
      else if (key === 'home' && catalogContext.home) params.home=catalogContext.home;
      else if (key === 'away' && catalogContext.away) params.away=catalogContext.away;
      else if (key === 'time' && catalogContext.time) params.time=catalogContext.time;
      else if (key === 'sport_id') params.sport_id=1;
    }
    return params;
  }

  async function fullCatalogCycle() {
    if (!enabled || !token) return { ...catalogProbe, disabled:true };
    if (fullCatalogPromise) return fullCatalogPromise;

    fullCatalogPromise=(async()=>{
    catalogProbe.cycles++;
    catalogProbe.last_at=new Date(now()).toISOString();
    catalogProbe.attempted=0;
    catalogProbe.ok=0;
    catalogProbe.skipped=0;
    catalogProbe.permission_denied=0;
    catalogProbe.rate_limited=0;
    catalogProbe.http_error=0;
    catalogProbe.last_error=null;
    catalogProbe.endpoint_results={};

    const order=['scheduled','event','league','team','player','on_demand'];
    for (const mode of order) {
      for (const [endpointKey,endpoint] of Object.entries(DOCUMENTED_ENDPOINTS)) {
        if (endpoint.mode !== mode) continue;
        const params=paramsForDocumentedEndpoint(endpointKey,endpoint);
        const check=validateEndpointParams(endpoint,params);
        if (!check.ok) {
          catalogProbe.skipped++;
          catalogProbe.endpoint_results[endpointKey]={status:'SKIPPED',reason:'MISSING_PARAMS',missing:check.missing};
          continue;
        }
        catalogProbe.attempted++;
        try {
          const r=await callDocumentedEndpoint(endpointKey,params);
          if (r?.skipped) {
            catalogProbe.skipped++;
            catalogProbe.endpoint_results[endpointKey]={status:'SKIPPED',reason:r.reason||'SKIPPED',missing:r.missing||[]};
            continue;
          }
          catalogProbe.endpoint_results[endpointKey]={
            status:r?.classification||'ERROR',
            http_status:r?.status??null,
            latency_ms:r?.latency_ms??null
          };
          if (r?.classification === 'OK') catalogProbe.ok++;
          else if (r?.classification === 'PERMISSION_DENIED') catalogProbe.permission_denied++;
          else if (r?.classification === 'RATE_LIMITED') catalogProbe.rate_limited++;
          else catalogProbe.http_error++;
        } catch (error) {
          catalogProbe.http_error++;
          catalogProbe.last_error=String(error?.message||error);
          catalogProbe.endpoint_results[endpointKey]={status:'ERROR',error:catalogProbe.last_error};
        }
        if (!budget.canSpend(1)) break;
      }
      if (!budget.canSpend(1)) break;
    }
    return fullCatalogStatus();
    })();
    try {
      return await fullCatalogPromise;
    } finally {
      fullCatalogPromise=null;
    }
  }

  function fullCatalogStatus() {
    return {
      ...catalogProbe,
      context:{
        event_ids:catalogContext.event_ids.size,
        fi_ids:catalogContext.fi_ids.size,
        league_ids:catalogContext.league_ids.size,
        team_ids:catalogContext.team_ids.size,
        player_ids:catalogContext.player_ids.size,
        has_search_tuple:Boolean(catalogContext.home && catalogContext.away && catalogContext.time)
      }
    };
  }

  function catalogStatus() {
    const all=documentedEndpointCatalog();
    return {
      total:all.length,
      groups:Object.fromEntries([...new Set(all.map(x=>x.group))].map(g=>[g,all.filter(x=>x.group===g).length])),
      modes:Object.fromEntries([...new Set(all.map(x=>x.mode))].map(m=>[m,all.filter(x=>x.mode===m).length])),
      endpoints:all.map(x=>({key:x.key,group:x.group,method:x.method,path:x.path,mode:x.mode,required:x.required||[],defaults:x.defaults||{}}))
    };
  }

  return { discoveryCycle, prematchCycle, fullCatalogCycle, fullCatalogStatus, status, call, callDocumentedEndpoint, catalogStatus };
}
