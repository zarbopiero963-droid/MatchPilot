
// ================================================================ data facade: REAL (API v1) or DEMO
class ApiFailure extends Error {
  constructor(status, code, message) { super(message || `HTTP ${status}`); this.status = status; this.code = code || `HTTP_${status}`; }
}
async function apiGet(path, {timeout = 15000} = {}) {
  let res;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try { res = await fetch(path, {headers: {accept: 'application/json'}, credentials: 'same-origin', signal: ctrl.signal}); }
  catch { throw new ApiFailure(0, 'NETWORK', 'rete non raggiungibile'); }
  finally { clearTimeout(t); }
  const body = await res.json().catch(() => null);
  if (res.status === 401) goLogin();
  if (!res.ok) throw new ApiFailure(res.status, body?.error?.code, body?.error?.message);
  return body;
}
// A 401 means the owner session is missing or expired (F-05): go to the login page and come back here, as on main.
function goLogin() {
  if (APP.testing) return;
  location.assign(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
}
async function apiPost(path, data) {
  let res;
  try { res = await fetch(path, {method: 'POST', credentials: 'same-origin', headers: {'content-type': 'application/json', accept: 'application/json'}, body: JSON.stringify(data)}); }
  catch { throw new ApiFailure(0, 'NETWORK', 'rete non raggiungibile'); }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiFailure(res.status, body?.error?.code, body?.error?.message);
  return {status: res.status, data: body?.data ?? null};
}
// REAL when this page is served by the MatchPilot server. A 401 is still the MatchPilot server, with the owner login
// enforced: it is REAL and leads to the login page, never a silent switch to DEMO (F-04).
async function detectReal() {
  if (!/^https?:$/.test(location.protocol)) return null;
  let res;
  try { res = await fetch('/api/v1/health', {headers: {accept: 'application/json'}, credentials: 'same-origin'}); } catch { return null; }
  if (res.status === 401) { const b = await res.json().catch(() => null); if (b?.api_version === 'v1' || b?.error) { goLogin(); return {authRequired: true}; } return null; }
  const b = await res.json().catch(() => null);
  return res.ok && b?.api_version === 'v1' ? b : null;
}
const isReal = () => APP.mode === 'REAL';
const n0 = v => v === null || v === undefined || v === '' ? null : Number(v);
const RESULT_TO_STATUS = {FINAL: 'FT', NO_RESULT: 'NR', NOT_STARTED: 'NS'};
function fromRealRow(r) {
  return {id: r.internal_match_id, src: 'REAL', date: r.match_date, ko: r.kickoff_local_time ?? '--:--',
    comp: {id: r.internal_competition_id ?? `${r.country_slug}/${r.league_slug}`, name: words(r.league_slug), country: words(r.country_slug), season: r.season},
    home: r.home_name ?? ND, away: r.away_name ?? ND, status: RESULT_TO_STATUS[r.result_status] ?? 'NS', minute: null,
    score: r.home_score === null || r.home_score === undefined ? null : [Number(r.home_score), Number(r.away_score)],
    odds: {h: n0(r.odd_home), d: n0(r.odd_draw), a: n0(r.odd_away), o25: n0(r.odd_over25), u25: n0(r.odd_under25), btts: n0(r.odd_btts_yes), bttsNo: null},
    xg: [n0(r.xg_home), n0(r.xg_away)], fav: r.favorite_side === 'HOME' || r.favorite_side === 'AWAY' ? r.favorite_side : null, favOdds: n0(r.favorite_odd),
    fresh: {state: r.result_status === 'FINAL' ? 'FINAL' : 'PREMATCH', lag: null}, live: null, stats: null, events: null};
}
function fromRealWindow(w) {
  if (!w) return null;
  const p = k => w.percent?.[k] === null || w.percent?.[k] === undefined ? null : Number(w.percent[k]) / 100;
  return {n: w.n, won: w.won, drawn: w.drawn, lost: w.lost, pWon: p('won'), pDrawn: p('drawn'), pLost: p('lost'), gfAvg: n0(w.goals_for_avg), gaAvg: n0(w.goals_against_avg),
    pOver15: null, pOver25: p('over25'), pOver35: null, pBtts: p('btts'), pCs: p('clean_sheet'), pFts: p('failed_to_score'), xgfAvg: n0(w.xg_for_avg), xgaAvg: n0(w.xg_against_avg),
    pFirstGoal: null, goalsByBand: null, concededByBand: null, form: (w.form ?? []).map(f => ({id: f.match_id, result: f.result, text: f.result, date: null})), ids: w.source_match_ids ?? []};
}
const REAL = {
  async day(date) { const b = await apiGet(`/api/v1/fpt/matches${qs({date, limit: 200})}`); return (b.data?.rows ?? []).map(fromRealRow); },
  async analysis(id) {
    const b = await apiGet(`/api/v1/fpt/match-analysis${qs({id})}`);
    const d = b.data ?? {};
    if (!d.match) return null;
    const team = side => d.teams?.[side] ? {team: side, venues: Object.fromEntries(['both', 'home', 'away'].map(v => [v, {windows: Object.fromEntries(WINDOWS.map(w => [w, fromRealWindow(d.teams[side].venues?.[v]?.windows?.[w])]))}]))} : null;
    const match = fromRealRow(d.match);
    return {match, teams: {home: team('home'), away: team('away')}, h2h: (d.head_to_head?.rows ?? []).map(fromRealRow).map(x => ({...x, final: x.score})), cutoff: d.method?.cutoff_before ?? match.date,
      post: d.post_match?.status === 'SETTLED' ? d.post_match.markets.map(mk => ({market: mk.market_type, label: mk.market_type === 'OVER_UNDER' ? `Gol ${nf(Number(mk.line), 1)}` : {MATCH_ODDS: 'Esito finale', BTTS: 'Entrambe segnano', CORRECT_SCORE: 'Risultato esatto'}[mk.market_type],
        win: mk.winning_selection, text: {HOME: '1', DRAW: 'X', AWAY: '2', YES: 'Sì', NO: 'No', OVER: `Over ${nf(Number(mk.line), 1)}`, UNDER: `Under ${nf(Number(mk.line), 1)}`}[mk.winning_selection] ?? String(mk.winning_selection).replace('-', '–'), price: n0(mk.price)})) : null,
      src: 'REAL'};
  },
  async competitions() { const b = await apiGet('/api/v1/fpt/competitions'); return (b.data?.rows ?? []).map(c => ({id: c.internal_competition_id, name: words(c.league_slug), country: words(c.country_slug)})); },
  async live() { const b = await apiGet('/api/v1/tc/live'); return b.data; },
  async providers() { return (await apiGet('/api/v1/providers')).data; },
  async health() { return apiGet('/api/v1/health'); },
  async persistence() { return (await apiGet('/api/v1/persistence/status')).data; },
  async session() {
    try { const r = await fetch('/auth/session', {credentials: 'same-origin', headers: {accept: 'application/json'}}); if (r.status === 200) return {state: 'SIGNED_IN', ...(await r.json())}; return {state: r.status === 401 ? 'SIGNED_OUT' : 'AUTH_OFF'}; }
    catch { return {state: 'NETWORK'}; }
  },
  async tool(name, params) { return (await apiGet(`/api/v1/tools/${name}${qs(params)}`)).data; },
  async mmStake(params) { return (await apiGet(`/api/v1/mm/stake${qs(params)}`)).data; },
  async strategies() {
    const list = (await apiGet('/api/v1/strategies')).data?.strategies ?? [];
    const full = await Promise.all(list.slice(0, 50).map(s => apiGet(`/api/v1/strategies${qs({key: s.key})}`).then(b => b.data?.strategy).catch(() => null)));
    return full.filter(Boolean).map(s => fromRealStrategy(s));
  },
  async saveStrategy(def) {
    const {params, why} = toRealParams(def);
    if (!params) throw new ApiFailure(400, 'NOT_SUPPORTED_REAL', why);
    const conditions = {};
    for (const k of ['odds', 'home', 'draw', 'away']) for (const e of ['min', 'max']) if (params[`${k}_${e}`]) conditions[`${k}_${e}`] = String(params[`${k}_${e}`]);
    if (params.team) { conditions.teams = [params.team]; if (params.venue) conditions.venue = params.venue; }
    return apiPost('/api/v1/strategies', {key: def.key, name: def.name, definition: {selection: def.selection, side: def.side, conditions}});
  },
  async backtest(def, cfg) {
    const {params, why} = toRealParams(def);
    if (!params) throw new ApiFailure(400, 'NOT_SUPPORTED_REAL', why);
    const q = {...params, from: cfg.from, to: cfg.to, stake: cfg.stake, commission: cfg.commission ? String(Number(cfg.commission) / 100) : undefined,
      bankroll: cfg.mm_model ? cfg.bankroll : undefined, mm_model: cfg.mm_model || undefined, mm_value: cfg.mm_model ? cfg.mm_value : undefined, max_events: 1000, pit_mode: cfg.pit_mode === 'NON_PIT_RESEARCH' ? 'NON_PIT_RESEARCH' : undefined};
    const b = await apiGet(`/api/v1/hist/backtest${qs(q)}`, {timeout: 60000});
    return {...fromRealReport(b.data, def, cfg), query: q};
  },
  async savedList() { return (await apiGet('/api/v1/backtests/saved')).data?.backtests ?? []; },
  async savedGet(id) { return (await apiGet(`/api/v1/backtests/saved${qs({id})}`)).data; },
  async saveBacktest(name, query) { return apiPost('/api/v1/backtests/saved', {name, kind: 'BACKTEST', params: Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))}); },
  async account(id) { return (await apiGet(`/api/v1/ledger/account${qs({account_id: id})}`)).data?.account; },
  async rules() { return (await apiGet('/api/v1/markets/rules')).data; },
};
function fromRealStrategy(s) {
  const c = s.definition?.conditions ?? {};
  const conditions = [];
  for (const [k, f] of [['odds', 'sel_odds'], ['home', 'odd_home'], ['draw', 'odd_draw'], ['away', 'odd_away']]) {
    const lo = c[`${k}_min`], hi = c[`${k}_max`];
    if (lo && hi) conditions.push({field: f, op: 'between', a: Number(lo), b: Number(hi)});
    else if (lo) conditions.push({field: f, op: 'gte', a: Number(lo), b: ''});
    else if (hi) conditions.push({field: f, op: 'lte', a: Number(hi), b: ''});
  }
  return {key: s.key, name: s.name, version: s.version, market: 'MATCH_ODDS', selection: s.definition?.selection, side: s.definition?.side, phase: 'PREMATCH',
    conditions, team: c.teams?.[0] ?? '', venue: c.venue ?? 'ANY', competitions: [], src: 'REAL', strategy_id: s.strategy_id, updated_at: s.created_at};
}
function fromRealReport(data, def, cfg) {
  const rep = data?.report ?? {};
  const m = rep.metrics ?? {};
  const events = data?.events ?? {};
  let cum = 0;
  const bets = (rep.bets ?? []).filter(b => b.settlement).map(b => {
    const ev = events[b.event_id] ?? {};
    const net = Number(b.settlement.net);
    return {date: ev.match_date ?? '', id: b.event_id, match: `${ev.home ?? ND} – ${ev.away ?? ND}`, comp: '', sel: b.selection, side: b.side, odds: Number(b.odds), stake: Number(b.stake),
      minute: null, score: '', win: b.settlement.bet_result === 'WON', net};
  });
  const curve = [{x: 0, y: 0}, ...bets.map((b, i) => ({x: i + 1, y: r2(cum += b.net)}))];
  return {kind: 'BACKTEST', src: 'REAL', def, cfg, events: rep.counts?.events ?? null, bets, won: m.won ?? 0, lost: m.lost ?? 0, skipped: rep.counts?.no_trade_by_reason ?? {},
    staked: n0(m.staked), exposure: n0(m.exposure), plGross: n0(m.rounded?.pl_gross), commission: n0(m.rounded?.commission), plNet: n0(m.rounded?.pl_net), roi: n0(m.rounded?.roi),
    strike: m.bets ? m.won / m.bets : null, avgOdds: bets.length ? bets.reduce((x, b) => x + b.odds, 0) / bets.length : null, maxDrawdown: n0(m.rounded?.max_drawdown),
    finalCash: n0(rep.bankroll?.final_cash), byMonth: {}, curve, pit: data?.pit_mode ?? rep.config?.pit_mode ?? 'PIT', status: rep.status, certified: rep.certification?.certified ?? false, report_sha256: rep.report_sha256, ranAt: new Date().toISOString()};
}
// DEMO adapter with the same interface (synchronous data wrapped in promises, to keep one code path).
const DEMO = {
  async day(date) { return demoDay(date).map(withState); },
  async analysis(id) { const a = demoAnalysis(id); if (a && a.match.status === 'FT') a.post = settleMarkets(a.match); return a; },
  async competitions() { return COMPS.map(c => ({id: c.id, name: c.name, country: c.country})); },
};
const DATA = {day: d => (isReal() ? REAL : DEMO).day(d), analysis: id => (isReal() ? REAL : DEMO).analysis(id),
  competitions: () => (isReal() ? REAL : DEMO).competitions()};
// Local libraries of the DEMO mode (strategies, saved simulations, MM profiles), in this browser only.
const lib = {
  profiles: () => store.get('profiles', null) ?? defaultProfiles(),
  setProfiles: list => store.set('profiles', list),
};
function defaultProfiles() {
  const p = [{id: 'mm-1', name: 'Prudente', default: true, archived: false, versions: [{v: 1, at: new Date().toISOString(), model: 'PERCENT_BANKROLL', value: 1, caps: {max_stake: 50, max_liability: 80}}]}];
  store.set('profiles', p);
  return p;
}
const slugKey = name => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/, '') || 'strategia';
// The refusal of a write in plain words (REAL mode).
function refusalText(e) {
  return ({WRITES_REQUIRE_AUTH: 'Per salvare sul server serve l’accesso owner, che non è attivo.', UNAUTHENTICATED: 'Sessione assente o scaduta: accedi di nuovo.',
    FORBIDDEN: 'Il tuo accesso non consente di salvare.', ORIGIN_NOT_ALLOWED: 'Richiesta rifiutata per sicurezza: ricarica la pagina.',
    UNAVAILABLE: 'L’archivio del server non è ancora attivo: niente è stato salvato.', CONFLICT: 'Conflitto con una strategia esistente.',
    BUSY: 'È in corso un’altra simulazione: riprova tra poco.', NOT_SUPPORTED_REAL: e.message, NETWORK: 'Connessione non disponibile.'})[e?.code]
    ?? (e?.status === 400 ? `Dati non validi: ${e.message}` : 'Operazione non riuscita.');
}
