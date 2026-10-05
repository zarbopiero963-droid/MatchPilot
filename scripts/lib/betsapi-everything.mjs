const DEFAULT_LIMIT_PER_HOUR = 1800;

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
  for (const item of candidates) {
    const id=item?.id ?? item?.event_id ?? item?.FI ?? item?.our_event_id;
    if (id !== undefined && id !== null && String(id).length) ids.push(String(id));
    if (ids.length >= max) break;
  }
  return [...new Set(ids)].slice(0,max);
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

  return { discoveryCycle, prematchCycle, status, call };
}
