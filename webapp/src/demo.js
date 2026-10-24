
// ================================================================ DEMO data (deterministic)
// The same day always gives the same matches, odds, xG and results; live matches follow the real clock. Everything
// produced here is DEMO and is labelled as such on screen.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }

const COMPS = [
  {id: 'ita-serie-a', name: 'Serie A', country: 'Italia', teams: ['Inter', 'Milan', 'Juventus', 'Napoli', 'Roma', 'Lazio', 'Atalanta', 'Fiorentina', 'Bologna', 'Torino']},
  {id: 'eng-premier-league', name: 'Premier League', country: 'Inghilterra', teams: ['Arsenal', 'Liverpool', 'Man City', 'Chelsea', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham', 'Brentford']},
  {id: 'esp-laliga', name: 'LaLiga', country: 'Spagna', teams: ['Real Madrid', 'Barcelona', 'Atletico', 'Sevilla', 'Valencia', 'Betis', 'Villarreal', 'Real Sociedad', 'Athletic', 'Getafe']},
  {id: 'ger-bundesliga', name: 'Bundesliga', country: 'Germania', teams: ['Bayern', 'Dortmund', 'Leverkusen', 'Leipzig', 'Stuttgart', 'Frankfurt', 'Wolfsburg', 'Freiburg', 'Union Berlin', 'Mainz']},
  {id: 'fra-ligue-1', name: 'Ligue 1', country: 'Francia', teams: ['PSG', 'Marseille', 'Monaco', 'Lyon', 'Lille', 'Nice', 'Lens', 'Rennes', 'Nantes', 'Reims']},
  {id: 'ned-eredivisie', name: 'Eredivisie', country: 'Olanda', teams: ['Ajax', 'PSV', 'Feyenoord', 'AZ', 'Twente', 'Utrecht', 'Heerenveen', 'Sparta', 'NEC', 'Go Ahead']},
  {id: 'por-primeira', name: 'Primeira Liga', country: 'Portogallo', teams: ['Benfica', 'Porto', 'Sporting', 'Braga', 'Vitoria', 'Boavista', 'Famalicao', 'Gil Vicente', 'Rio Ave', 'Estoril']},
  {id: 'ita-serie-b', name: 'Serie B', country: 'Italia', teams: ['Sassuolo', 'Palermo', 'Sampdoria', 'Cremonese', 'Spezia', 'Bari', 'Pisa', 'Brescia', 'Modena', 'Catanzaro']},
];
const COMP_BY_ID = new Map(COMPS.map(c => [c.id, c]));
const TEAM_COMP = new Map(COMPS.flatMap(c => c.teams.map(t => [t, c])));
// Team strength: attack and defence (higher defence concedes less).
const STRENGTH = new Map(COMPS.flatMap(c => c.teams.map((t, i) => {
  const r = rng(hash(`strength:${t}`));
  const tier = 1 - i / 14;
  return [t, {att: 0.75 + tier * 0.45 + r() * 0.25, def: 0.75 + tier * 0.45 + r() * 0.25}];
})));

// Poisson
const fact = [1]; for (let i = 1; i < 40; i++) fact[i] = fact[i - 1] * i;
const pmf = (l, k) => Math.exp(-l) * l ** k / fact[k];
const pmfArr = (l, max = 12) => Array.from({length: max + 1}, (_, k) => pmf(l, k));
// Probabilities of the final outcome given expected remaining goals and the current score.
function outcomeProbs(lh, la, cur = [0, 0]) {
  const ph = pmfArr(lh), pa = pmfArr(la);
  let H = 0, D = 0, A = 0, O = 0, B = 0, tot = 0;
  for (let i = 0; i < ph.length; i++) for (let j = 0; j < pa.length; j++) {
    const p = ph[i] * pa[j]; tot += p;
    const gh = cur[0] + i, ga = cur[1] + j;
    if (gh > ga) H += p; else if (gh === ga) D += p; else A += p;
    if (gh + ga >= 3) O += p;
    if (gh > 0 && ga > 0) B += p;
  }
  return {h: H / tot, d: D / tot, a: A / tot, over25: O / tot, btts: B / tot};
}
// Exchange-like price ladder.
function ladder(o) {
  if (!Number.isFinite(o) || o <= 1.01) return 1.01;
  if (o >= 1000) return 1000;
  const step = o < 2 ? 0.01 : o < 3 ? 0.02 : o < 4 ? 0.05 : o < 6 ? 0.1 : o < 10 ? 0.2 : o < 20 ? 0.5 : o < 30 ? 1 : o < 50 ? 2 : o < 100 ? 5 : 10;
  return Math.round(Math.round(o / step) * step * 100) / 100;
}
const priced = (p, margin) => ladder(1 / Math.max(p * margin, 0.001));

// Fixtures: each competition plays a round on Saturday (3 matches) and Sunday (2); the first four also on Wednesday.
const dayNum = t => { const [y, m, d] = t.split('-').map(Number); return Math.floor(Date.UTC(y, m - 1, d) / 86400000); };
const KO = {6: ['15:00', '18:00', '20:45'], 0: ['15:00', '20:45'], 3: ['18:30', '18:30', '20:45', '20:45', '20:45']};
function roundPairs(n, round) {
  const others = Array.from({length: n - 1}, (_, i) => i + 1);
  const k = round % (n - 1);
  const rot = [...others.slice(k), ...others.slice(0, k)];
  const arr = [0, ...rot];
  return Array.from({length: n / 2}, (_, i) => round % 2 ? [arr[n - 1 - i], arr[i]] : [arr[i], arr[n - 1 - i]]);
}
const dayCache = new Map();
function demoDay(date) {
  if (dayCache.has(date)) return dayCache.get(date);
  const w = parseDay(date).getDay();
  const week = Math.floor((dayNum(date) + 3) / 7);
  const out = [];
  COMPS.forEach((comp, ci) => {
    if (!KO[w] || (w === 3 && (ci > 3 || week % 2))) return;
    const round = w === 3 ? week * 2 + 1 + ci : week * 2 + ci;
    const pairs = roundPairs(comp.teams.length, round);
    const slice = w === 6 ? pairs.slice(0, 3) : w === 0 ? pairs.slice(3, 5) : pairs;
    slice.forEach(([hi, ai], slot) => out.push(demoMatch(comp, date, slot, comp.teams[hi], comp.teams[ai], KO[w][slot % KO[w].length])));
  });
  out.sort((a, b) => a.ko.localeCompare(b.ko) || a.comp.name.localeCompare(b.comp.name) || a.home.localeCompare(b.home));
  dayCache.set(date, out);
  return out;
}
function demoMatch(comp, date, slot, home, away, ko) {
  const id = `demo:${comp.id}:${date}:${slot}`;
  const r = rng(hash(id));
  const H = STRENGTH.get(home), A = STRENGTH.get(away);
  const lh = 1.32 * H.att / A.def * 1.12, la = 1.1 * A.att / H.def;
  const p = outcomeProbs(lh, la);
  const odds = {h: priced(p.h, 1.04), d: priced(p.d, 1.04), a: priced(p.a, 1.04), o25: priced(p.over25, 1.03), u25: priced(1 - p.over25, 1.03),
    btts: priced(p.btts, 1.03), bttsNo: priced(1 - p.btts, 1.03)};
  const xg = [r2(lh * (0.82 + r() * 0.36)), r2(la * (0.82 + r() * 0.36))];
  // Goals and other events across 90 minutes (deterministic).
  const events = [];
  const draw = l => { let k = 0, t = Math.exp(-l), acc = t; const u = r(); while (u > acc && k < 12) { k++; t *= l / k; acc += t; } return k; };
  const gh = draw(lh * (0.8 + r() * 0.4)), ga = draw(la * (0.8 + r() * 0.4));
  for (let i = 0; i < gh; i++) events.push({min: 1 + Math.floor(r() * 90), type: 'GOAL', side: 0});
  for (let i = 0; i < ga; i++) events.push({min: 1 + Math.floor(r() * 90), type: 'GOAL', side: 1});
  const cards = Math.floor(r() * 6);
  for (let i = 0; i < cards; i++) events.push({min: 5 + Math.floor(r() * 85), type: r() < 0.9 ? 'YELLOW' : 'RED', side: r() < 0.5 ? 0 : 1});
  const corners = 6 + Math.floor(r() * 7);
  for (let i = 0; i < corners; i++) events.push({min: 1 + Math.floor(r() * 90), type: 'CORNER', side: r() < lh / (lh + la) ? 0 : 1});
  events.sort((x, y) => x.min - y.min || (x.type === 'GOAL' ? -1 : 1));
  const fav = odds.h < odds.a ? 'HOME' : odds.a < odds.h ? 'AWAY' : null;
  const statSeed = r();
  const m = {id, src: 'DEMO', date, ko, comp: {id: comp.id, name: comp.name, country: comp.country}, home, away, lambdas: [lh, la], odds, xg, fav,
    favOdds: fav === 'HOME' ? odds.h : fav === 'AWAY' ? odds.a : null, events, final: [gh, ga], statSeed, lagSeed: hash(`${id}:lag`)};
  return m;
}
// The state of a match now (status, minute, score, live odds, freshness), from the real clock.
function liveState(m, now = nowMs()) {
  const [y, mo, d] = m.date.split('-').map(Number);
  const [hh, mm] = m.ko.split(':').map(Number);
  const kick = new Date(y, mo - 1, d, hh, mm).getTime();
  const el = (now - kick) / 60000;
  let status, minute = null;
  if (el < 0) status = 'NS';
  else if (el < 47) { status = 'LIVE'; minute = Math.min(45, Math.floor(el) + 1); }
  else if (el < 62) { status = 'HT'; minute = 45; }
  else if (el < 110) { status = 'LIVE'; minute = Math.min(90, 45 + Math.floor(el - 62) + 1); }
  else status = 'FT';
  return {...stateAt(m, status === 'FT' ? 90 : status === 'NS' ? 0 : minute), status, minute, kickoffAt: kick,
    fresh: freshness(m, now, status)};
}
// The match as known at a minute (0 = before kickoff, 90 = end): score, stats and live prices. Used by live and replay.
function stateAt(m, minute) {
  const happened = m.events.filter(e => e.min <= minute);
  const score = [0, 1].map(side => happened.filter(e => e.type === 'GOAL' && e.side === side).length);
  const f = Math.max(0, (90 - minute) / 90);
  const lh = m.lambdas[0] * f, la = m.lambdas[1] * f;
  const p = outcomeProbs(lh, la, score);
  const done = minute >= 90;
  const live = done ? null : {h: priced(p.h, 1.02), d: priced(p.d, 1.02), a: priced(p.a, 1.02), o25: priced(p.over25, 1.02), u25: priced(1 - p.over25, 1.02),
    btts: priced(p.btts, 1.02), bttsNo: priced(1 - p.btts, 1.02)};
  const r = rng(hash(`${m.id}:stats`));
  const share = m.lambdas[0] / (m.lambdas[0] + m.lambdas[1]);
  const prog = minute / 90;
  const shots = [Math.round((8 + r() * 10) * share * 1.6 * prog), Math.round((8 + r() * 10) * (1 - share) * 1.6 * prog)];
  const sot = shots.map((x, i) => Math.max(score[i], Math.round(x * (0.3 + r() * 0.15))));
  const corners = [0, 1].map(side => happened.filter(e => e.type === 'CORNER' && e.side === side).length);
  const cards = [0, 1].map(side => happened.filter(e => (e.type === 'YELLOW' || e.type === 'RED') && e.side === side).length);
  const poss = Math.round(clamp(share * 100 + (r() - 0.5) * 12, 30, 70));
  const da = [Math.round((40 + r() * 30) * share * 2 * prog), Math.round((40 + r() * 30) * (1 - share) * 2 * prog)];
  const xgNow = [r2(m.xg[0] * prog), r2(m.xg[1] * prog)];
  return {score, live, stats: {shots, sot, corners, cards, poss: [poss, 100 - poss], da, xg: xgNow}, probs: p, happened};
}
function freshness(m, now, status) {
  if (status !== 'LIVE' && status !== 'HT') return {state: status === 'FT' ? 'FINAL' : 'PREMATCH', lag: null};
  const r = rng(m.lagSeed ^ Math.floor(now / 60000));
  const u = r();
  const st = settings();
  const lag = u < 0.82 ? 1 + Math.floor(r() * 7) : u < 0.94 ? st.fresh_s + 2 + Math.floor(r() * 15) : st.delayed_s + 5 + Math.floor(r() * 60);
  return {state: lag <= st.fresh_s ? 'FRESH' : lag <= st.delayed_s ? 'DELAYED' : lag <= st.stale_s ? 'STALE' : 'OFFLINE', lag};
}
// A match with its current state, as the views use it.
function withState(m) {
  const st = liveState(m);
  return {...m, status: st.status, minute: st.minute, score: st.status === 'NS' ? null : st.score, live: st.live, stats: st.stats, fresh: st.fresh, probs: st.probs};
}
function demoMatchById(id) {
  const [, compId, date, slot] = String(id).split(':');
  if (!COMP_BY_ID.has(compId) || !validDay(date)) return null;
  return demoDay(date).find(m => m.id === id) ?? null;
}

// ---------------------------------------------------------------- statistics (Match Analysis Hub, #30)
// Finished matches of a team strictly before a day (the same rule as the server: same-day matches excluded).
function seasonStart(date) { const d = parseDay(date); const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-08-01`; }
function teamHistory(team, before, maxDays = 220) {
  const out = [];
  const comp = TEAM_COMP.get(team);
  for (let i = 1; i <= maxDays; i++) {
    const day = addDays(before, -i);
    for (const m of demoDay(day)) if (m.comp.id === comp?.id && (m.home === team || m.away === team) && liveState(m).status === 'FT') out.push(m);
  }
  return out;
}
const WINDOWS = ['5', '10', '20', 'season'];
function windowStats(team, rows) {
  const s = {n: rows.length, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, over15: 0, over25: 0, over35: 0, btts: 0, cs: 0, fts: 0, xgf: 0, xga: 0, xgn: 0,
    goalsByBand: [0, 0, 0, 0, 0, 0], concededByBand: [0, 0, 0, 0, 0, 0], firstGoal: 0, form: [], ids: []};
  for (const m of rows) {
    const home = m.home === team, side = home ? 0 : 1;
    const [a, b] = home ? m.final : [m.final[1], m.final[0]];
    if (a > b) s.won++; else if (a === b) s.drawn++; else s.lost++;
    s.gf += a; s.ga += b;
    if (a + b >= 2) s.over15++; if (a + b >= 3) s.over25++; if (a + b >= 4) s.over35++;
    if (a > 0 && b > 0) s.btts++; if (b === 0) s.cs++; if (a === 0) s.fts++;
    s.xgf += home ? m.xg[0] : m.xg[1]; s.xga += home ? m.xg[1] : m.xg[0]; s.xgn++;
    const goals = m.events.filter(e => e.type === 'GOAL');
    for (const g of goals) { const band = Math.min(5, Math.floor((g.min - 1) / 15)); if (g.side === side) s.goalsByBand[band]++; else s.concededByBand[band]++; }
    if (goals.length && goals[0].side === side) s.firstGoal++;
    s.form.push({id: m.id, result: a > b ? 'W' : a === b ? 'D' : 'L', text: `${m.home} ${m.final[0]}–${m.final[1]} ${m.away}`, date: m.date});
    s.ids.push(m.id);
  }
  const n = s.n || null;
  return {...s, pWon: n && s.won / n, pDrawn: n && s.drawn / n, pLost: n && s.lost / n, gfAvg: n && s.gf / n, gaAvg: n && s.ga / n,
    pOver15: n && s.over15 / n, pOver25: n && s.over25 / n, pOver35: n && s.over35 / n, pBtts: n && s.btts / n, pCs: n && s.cs / n, pFts: n && s.fts / n,
    xgfAvg: s.xgn ? s.xgf / s.xgn : null, xgaAvg: s.xgn ? s.xga / s.xgn : null, pFirstGoal: n && s.firstGoal / n};
}
function demoTeamAnalysis(team, before) {
  const all = teamHistory(team, before);
  const start = seasonStart(before);
  const venues = {};
  for (const venue of ['both', 'home', 'away']) {
    const rows = all.filter(m => venue === 'both' || (venue === 'home' ? m.home === team : m.away === team));
    venues[venue] = {windows: Object.fromEntries(WINDOWS.map(w => [w, windowStats(team, w === 'season' ? rows.filter(m => m.date >= start) : rows.slice(0, Number(w)))]))};
  }
  return {team, venues};
}
function demoAnalysis(id) {
  const m = demoMatchById(id);
  if (!m) return null;
  const h2h = [];
  for (let i = 1; i <= 400 && h2h.length < 6; i++) for (const x of demoDay(addDays(m.date, -i))) {
    if (((x.home === m.home && x.away === m.away) || (x.home === m.away && x.away === m.home)) && liveState(x).status === 'FT') h2h.push(x);
  }
  return {match: withState(m), teams: {home: demoTeamAnalysis(m.home, m.date), away: demoTeamAnalysis(m.away, m.date)}, h2h, cutoff: m.date, src: 'DEMO'};
}
// Settled markets of a finished match (#25): the same internal rules as the server's post_match.
function settleMarkets(m) {
  const [a, b] = m.score ?? m.final;
  const w = a > b ? 'HOME' : a === b ? 'DRAW' : 'AWAY';
  return [
    {market: 'MATCH_ODDS', label: 'Esito finale', win: w, text: {HOME: '1', DRAW: 'X', AWAY: '2'}[w], price: {HOME: m.odds.h, DRAW: m.odds.d, AWAY: m.odds.a}[w]},
    ...[1.5, 2.5, 3.5].map(l => ({market: 'OVER_UNDER', line: l, label: `Gol ${nf(l, 1)}`, win: a + b > l ? 'OVER' : 'UNDER', text: `${a + b > l ? 'Over' : 'Under'} ${nf(l, 1)}`,
      price: l === 2.5 ? (a + b > l ? m.odds.o25 : m.odds.u25) : null})),
    {market: 'BTTS', label: 'Entrambe segnano', win: a > 0 && b > 0 ? 'YES' : 'NO', text: a > 0 && b > 0 ? 'Sì' : 'No', price: a > 0 && b > 0 ? m.odds.btts : m.odds.bttsNo},
    {market: 'CORRECT_SCORE', label: 'Risultato esatto', win: `${a}-${b}`, text: `${a}–${b}`, price: null},
  ];
}

// ---------------------------------------------------------------- strategies (#34) — rule definitions
const MARKETS = {MATCH_ODDS: 'Esito finale 1X2', OVER_UNDER_25: 'Over/Under 2,5', BTTS: 'Entrambe segnano'};
const SELECTIONS = {MATCH_ODDS: [['FAVOURITE', 'Favorito'], ['UNDERDOG', 'Sfavorito'], ['HOME', 'Casa (1)'], ['DRAW', 'Pareggio (X)'], ['AWAY', 'Ospite (2)']],
  OVER_UNDER_25: [['OVER', 'Over 2,5'], ['UNDER', 'Under 2,5']], BTTS: [['YES', 'Sì'], ['NO', 'No']]};
const SIDE_TEXT = {BACK: 'Punta', LAY: 'Banca'};
const FIELDS = {
  sel_odds: {label: 'Quota della selezione', phase: 'ANY'}, odd_home: {label: 'Quota 1', phase: 'ANY'}, odd_draw: {label: 'Quota X', phase: 'ANY'},
  odd_away: {label: 'Quota 2', phase: 'ANY'}, fav_odds: {label: 'Quota del favorito', phase: 'ANY'}, odd_o25: {label: 'Quota Over 2,5', phase: 'ANY'},
  xg_home: {label: 'xG casa (pre-partita)', phase: 'ANY'}, xg_away: {label: 'xG ospite (pre-partita)', phase: 'ANY'}, xg_total: {label: 'xG totali (pre-partita)', phase: 'ANY'},
  minute: {label: 'Minuto', phase: 'LIVE'}, goal_diff: {label: 'Differenza reti (casa − ospite)', phase: 'LIVE'}, total_goals: {label: 'Gol segnati', phase: 'LIVE'},
};
const OPS = {gte: '≥', lte: '≤', between: 'tra'};
function selectionOf(def, prices) {
  if (def.market === 'MATCH_ODDS') {
    const {h, d, a} = prices;
    if (def.selection === 'FAVOURITE') return h === a ? null : h < a ? 'HOME' : 'AWAY';
    if (def.selection === 'UNDERDOG') return h === a ? null : h > a ? 'HOME' : 'AWAY';
    return def.selection;
  }
  return def.selection;
}
const PRICE_KEY = {HOME: 'h', DRAW: 'd', AWAY: 'a', OVER: 'o25', UNDER: 'u25', YES: 'btts', NO: 'bttsNo'};
function fieldValue(field, m, prices, sel, now) {
  switch (field) {
    case 'sel_odds': return sel ? prices[PRICE_KEY[sel]] : null;
    case 'odd_home': return prices.h; case 'odd_draw': return prices.d; case 'odd_away': return prices.a;
    case 'fav_odds': return Math.min(prices.h, prices.a);
    case 'odd_o25': return prices.o25;
    case 'xg_home': return m.xg[0]; case 'xg_away': return m.xg[1]; case 'xg_total': return r2(m.xg[0] + m.xg[1]);
    case 'minute': return now?.minute ?? null;
    case 'goal_diff': return now ? now.score[0] - now.score[1] : null;
    case 'total_goals': return now ? now.score[0] + now.score[1] : null;
    default: return null;
  }
}
// Evaluates a definition on a match (prematch prices, or the state at a minute for LIVE). Returns the decision and every
// condition with its value, so the page can explain it.
function evaluateDef(def, m, now = null) {
  const prices = now?.live ?? m.odds;
  if (def.competitions?.length && !def.competitions.includes(m.comp.id)) return {trade: false, reason: 'COMPETITION', checks: []};
  if (def.team) {
    const t = def.team.trim().toLowerCase();
    const ok = def.venue === 'HOME' ? m.home.toLowerCase() === t : def.venue === 'AWAY' ? m.away.toLowerCase() === t : [m.home, m.away].some(x => x.toLowerCase() === t);
    if (!ok) return {trade: false, reason: 'TEAM', checks: []};
  }
  const sel = selectionOf(def, prices);
  if (!sel) return {trade: false, reason: 'NO_SELECTION', checks: []};
  const checks = (def.conditions ?? []).map(c => {
    const v = fieldValue(c.field, m, prices, sel, now);
    const a = Number(c.a), b = Number(c.b);
    const ok = v !== null && (c.op === 'gte' ? v >= a : c.op === 'lte' ? v <= a : v >= Math.min(a, b) && v <= Math.max(a, b));
    const near = !ok && v !== null && (c.op === 'gte' ? v >= a * 0.9 : c.op === 'lte' ? v <= a * 1.1 : v >= Math.min(a, b) * 0.9 && v <= Math.max(a, b) * 1.1);
    return {...c, value: v, ok, near};
  });
  const trade = checks.every(c => c.ok);
  return {trade, near: !trade && checks.every(c => c.ok || c.near), sel, price: prices[PRICE_KEY[sel]], checks, reason: trade ? null : 'CONDITIONS'};
}
function defIssues(def) {
  const out = [];
  if (!def.name?.trim()) out.push('Il nome è obbligatorio.');
  if (!MARKETS[def.market]) out.push('Mercato non valido.');
  if (!SELECTIONS[def.market]?.some(([v]) => v === def.selection)) out.push('Selezione non valida per il mercato.');
  if (!SIDE_TEXT[def.side]) out.push('Lato non valido.');
  for (const [i, c] of (def.conditions ?? []).entries()) {
    if (!FIELDS[c.field]) out.push(`Condizione ${i + 1}: campo non valido.`);
    else if (FIELDS[c.field].phase === 'LIVE' && def.phase !== 'LIVE') out.push(`Condizione ${i + 1}: «${FIELDS[c.field].label}» vale solo per le strategie live.`);
    if (!OPS[c.op]) out.push(`Condizione ${i + 1}: operatore non valido.`);
    if (c.a === '' || !Number.isFinite(Number(c.a))) out.push(`Condizione ${i + 1}: valore non valido.`);
    if (c.op === 'between' && (c.b === '' || !Number.isFinite(Number(c.b)))) out.push(`Condizione ${i + 1}: secondo valore non valido.`);
  }
  if (def.venue && def.venue !== 'ANY' && !def.team?.trim()) out.push('La sede richiede una squadra.');
  return out;
}
function rulesText(def) {
  const parts = [`${SIDE_TEXT[def.side] ?? ND} · ${(SELECTIONS[def.market] ?? []).find(([v]) => v === def.selection)?.[1] ?? ND} · ${MARKETS[def.market] ?? ND}`];
  for (const c of def.conditions ?? []) parts.push(`${FIELDS[c.field]?.label ?? c.field} ${OPS[c.op]} ${nf(Number(c.a), 2)}${c.op === 'between' ? ` e ${nf(Number(c.b), 2)}` : ''}`);
  if (def.team) parts.push(`Squadra ${def.team}${def.venue && def.venue !== 'ANY' ? (def.venue === 'HOME' ? ' in casa' : ' in trasferta') : ''}`);
  if (def.competitions?.length) parts.push(`Campionati: ${def.competitions.map(id => COMP_BY_ID.get(id)?.name ?? id).join(', ')}`);
  if (def.phase === 'LIVE') parts.push('In partita (live)');
  return parts;
}
// The REAL backtest API takes 1X2 price ranges, one team and its venue: anything else stays DEMO.
function toRealParams(def) {
  if (def.market !== 'MATCH_ODDS') return {params: null, why: 'Il motore reale gestisce solo il mercato 1X2.'};
  if (def.phase === 'LIVE') return {params: null, why: 'Il motore reale non ha dati live storici.'};
  if ((def.competitions ?? []).length) return {params: null, why: 'Il filtro per campionato si imposta nella simulazione reale.'};
  const map = {sel_odds: 'odds', odd_home: 'home', odd_draw: 'draw', odd_away: 'away'};
  const p = {selection: def.selection, side: def.side};
  for (const c of def.conditions ?? []) {
    const k = map[c.field];
    if (!k) return {params: null, why: `«${FIELDS[c.field]?.label}» non è supportata dal motore reale.`};
    if (c.op === 'gte' || c.op === 'between') p[`${k}_min`] = String(c.op === 'between' ? Math.min(c.a, c.b) : c.a);
    if (c.op === 'lte' || c.op === 'between') p[`${k}_max`] = String(c.op === 'between' ? Math.max(c.a, c.b) : c.a);
  }
  if (def.team) { p.team = def.team; if (def.venue && def.venue !== 'ANY') p.venue = def.venue; }
  return {params: p, why: null};
}

// ---------------------------------------------------------------- settlement and P/L
function winsSelection(market, sel, score) {
  const [a, b] = score;
  if (market === 'MATCH_ODDS') return sel === (a > b ? 'HOME' : a === b ? 'DRAW' : 'AWAY');
  if (market === 'OVER_UNDER_25') return sel === (a + b > 2.5 ? 'OVER' : 'UNDER');
  if (market === 'BTTS') return sel === (a > 0 && b > 0 ? 'YES' : 'NO');
  return false;
}
const legPL = (leg, win) => leg.side === 'BACK' ? (win ? leg.stake * (leg.odds - 1) : -leg.stake) : (win ? -leg.stake * (leg.odds - 1) : leg.stake);
const liabilityOf = (side, odds, stake) => side === 'LAY' ? stake * (odds - 1) : stake;

// ---------------------------------------------------------------- Money Management (#96) — the 4 implemented models
const MM_MODELS = [
  {id: 'FIXED_STAKE', name: 'Puntata fissa', cat: 'Semplice', status: 'IMPLEMENTED', param: 'Puntata', desc: 'Ogni operazione ha la stessa puntata.'},
  {id: 'FIXED_LIABILITY', name: 'Rischio fisso', cat: 'Semplice', status: 'IMPLEMENTED', param: 'Responsabilità', desc: 'Ogni operazione rischia lo stesso importo massimo.'},
  {id: 'PERCENT_BANKROLL', name: 'Percentuale del capitale', cat: 'Dal capitale', status: 'IMPLEMENTED', param: 'Percentuale %', desc: 'La puntata è una percentuale del capitale disponibile.'},
  {id: 'LIABILITY_PERCENT_BANKROLL', name: 'Rischio in percentuale del capitale', cat: 'Dal capitale', status: 'IMPLEMENTED', param: 'Percentuale %', desc: 'Il rischio massimo è una percentuale del capitale disponibile.'},
  {id: 'KELLY', name: 'Kelly', cat: 'Dal capitale', status: 'DISCOVERED', desc: 'Puntata da probabilità stimata e vantaggio.'},
  {id: 'FRACTIONAL_KELLY', name: 'Kelly frazionario', cat: 'Dal capitale', status: 'DISCOVERED', desc: 'Una frazione della puntata di Kelly.'},
  {id: 'TARGET_PROFIT', name: 'Profitto obiettivo', cat: 'Obiettivo o recupero', status: 'DISCOVERED', desc: 'La puntata che raggiunge un profitto fissato.'},
  {id: 'RECOVERY_STAKE', name: 'Recupero', cat: 'Obiettivo o recupero', status: 'DISCOVERED', desc: 'La puntata che recupera le perdite precedenti.'},
  {id: 'RISK_BASED_STAKE', name: 'Puntata da rischio', cat: 'Dal capitale', status: 'DISCOVERED', desc: 'La puntata dal rischio massimo per operazione.'},
  {id: 'MARTINGALE', name: 'Martingala', cat: 'Progressione', status: 'DISCOVERED', desc: 'La puntata raddoppia dopo ogni perdita.'},
  {id: 'FIBONACCI', name: 'Fibonacci', cat: 'Progressione', status: 'DISCOVERED', desc: 'La puntata segue la successione di Fibonacci.'},
  {id: 'LABOUCHERE', name: 'Labouchère', cat: 'Progressione', status: 'DISCOVERED', desc: 'Progressione a cancellazione su una lista.'},
  {id: 'CS_PROGRESSIVO', name: 'Risultato esatto progressivo', cat: 'Progressione', status: 'DISCOVERED', desc: 'Progressione sul risultato esatto.'},
  {id: 'EXPOSURE_AWARE', name: 'In base all’esposizione', cat: 'Dall’esposizione', status: 'DISCOVERED', desc: 'La puntata tiene conto delle posizioni aperte.'},
  {id: 'COMPOSITE', name: 'Composto', cat: 'Composto', status: 'DISCOVERED', desc: 'Più modelli e regole insieme.'},
  {id: 'MANUAL_WITHIN_LIMITS', name: 'Manuale entro i limiti', cat: 'Semplice', status: 'DISCOVERED', desc: 'La puntata la sceglie l’operatore, entro i limiti.'},
];
const MM_BY_ID = new Map(MM_MODELS.map(m => [m.id, m]));
// The stake a profile allows for one proposal: the same order of caps as the server (src/mm/money-management.mjs).
function mmEvaluate({model, value, caps = {}, side, odds, available, openLiability = 0, openCount = 0, mode = 'ACTIVE_OPERATIONAL'}) {
  const v = Number(value), o = Number(odds), avail = Number(available);
  if (!MM_BY_ID.has(model) || MM_BY_ID.get(model).status !== 'IMPLEMENTED') return {error: 'Modello non utilizzabile: formula non ancora definita dall’owner.'};
  if (!(v > 0)) return {error: 'Il valore del modello deve essere maggiore di zero.'};
  if (!(o > 1)) return {error: 'La quota deve essere maggiore di 1.'};
  if (!(avail >= 0)) return {error: 'Capitale non valido.'};
  if ((model === 'PERCENT_BANKROLL' || model === 'LIABILITY_PERCENT_BANKROLL') && v > 100) return {error: 'La percentuale non può superare 100.'};
  const fromL = L => floor2(side === 'LAY' ? L / (o - 1) : L);
  let stake = model === 'FIXED_STAKE' ? v : model === 'PERCENT_BANKROLL' ? floor2(avail * v / 100) : model === 'FIXED_LIABILITY' ? fromL(v) : fromL(avail * v / 100);
  const original = stake, capsHit = [], reasons = [];
  if (caps.max_stake && stake > caps.max_stake) { stake = Number(caps.max_stake); capsHit.push('max_stake'); }
  if (caps.max_liability && liabilityOf(side, o, stake) > caps.max_liability) { stake = fromL(Number(caps.max_liability)); capsHit.push('max_liability'); }
  if (liabilityOf(side, o, stake) > avail) { stake = fromL(avail); capsHit.push('available_bankroll'); }
  let decision = capsHit.length ? 'REDUCE' : 'ALLOW';
  if (!(stake > 0)) { decision = 'BLOCK'; reasons.push('Puntata nulla dopo i limiti'); stake = 0; }
  if (caps.max_open && openCount >= caps.max_open) { decision = 'BLOCK'; reasons.push('Troppe posizioni aperte'); }
  if (caps.min_odds && o < caps.min_odds) { decision = 'BLOCK'; reasons.push('Quota sotto il minimo del profilo'); }
  if (caps.max_odds && o > caps.max_odds) { decision = 'BLOCK'; reasons.push('Quota sopra il massimo del profilo'); }
  if (mode === 'ADVISORY_ONLY') { decision = 'SIMULATION_ONLY'; reasons.push('Operatività ferma (STOP): solo consiglio'); }
  if (mode === 'PAUSED') { decision = 'BLOCK'; reasons.push('Operatività in pausa'); }
  return {decision, stake: r2(stake), original: r2(original), liability: r2(liabilityOf(side, o, stake)), capsHit, reasons,
    ifWins: r2(side === 'BACK' ? stake * (o - 1) : -stake * (o - 1)), ifLoses: r2(side === 'BACK' ? -stake : stake)};
}
const CAP_TEXT = {max_stake: 'tetto alla puntata', max_liability: 'tetto alla responsabilità', available_bankroll: 'capitale disponibile'};
const DECISION_TEXT = {ALLOW: 'Consentita', REDUCE: 'Ridotta dai limiti', BLOCK: 'Bloccata', SIMULATION_ONLY: 'Solo consiglio'};

// ---------------------------------------------------------------- backtest engine (#34) — DEMO archive
// Runs a definition over the finished DEMO matches of a period. Prematch strategies use the prematch prices; LIVE ones
// enter at the first minute where every condition holds (deterministic replay of the DEMO events).
function demoBacktest(def, cfg) {
  const issues = defIssues(def);
  if (issues.length) return {error: issues.join(' ')};
  const from = cfg.from, to = cfg.to;
  if (!validDay(from) || !validDay(to)) return {error: 'Periodo non valido.'};
  if (from > to) return {error: 'La data iniziale deve precedere quella finale.'};
  if ((parseDay(to) - parseDay(from)) / 86400000 > 400) return {error: 'Il periodo massimo è di 400 giorni.'};
  const c = Number(cfg.commission ?? 0) / 100, stakeFixed = Number(cfg.stake ?? 10), bankroll0 = Number(cfg.bankroll ?? 1000);
  if (!(stakeFixed > 0)) return {error: 'La puntata deve essere maggiore di zero.'};
  if (!(c >= 0 && c < 1)) return {error: 'Commissione non valida.'};
  let cash = bankroll0, peak = bankroll0, maxDd = 0;
  const bets = [], skipped = {}, byMonth = {}, curve = [{x: 0, y: 0}];
  let events = 0, plNet = 0, plGross = 0, comm = 0, staked = 0, exposure = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (d >= today()) break;
    for (const m of demoDay(d)) {
      events++;
      let ev, entryMinute = null;
      if (def.phase === 'LIVE') {
        for (let minute = 1; minute < 90; minute++) {
          const st = stateAt(m, minute);
          const r = evaluateDef(def, m, {...st, minute});
          if (r.trade) { ev = r; entryMinute = minute; break; }
        }
        if (!ev) { skipped.CONDITIONS = (skipped.CONDITIONS ?? 0) + 1; continue; }
      } else {
        ev = evaluateDef(def, m);
        if (!ev.trade) { skipped[ev.reason] = (skipped[ev.reason] ?? 0) + 1; continue; }
      }
      let stake = stakeFixed;
      if (cfg.mm_model) {
        const r = mmEvaluate({model: cfg.mm_model, value: cfg.mm_value, side: def.side, odds: ev.price, available: cash});
        if (r.error) return {error: r.error};
        if (r.decision === 'BLOCK') { skipped.MONEY = (skipped.MONEY ?? 0) + 1; continue; }
        stake = r.stake;
      }
      const win = winsSelection(def.market, ev.sel, m.final);
      const gross = legPL({side: def.side, odds: ev.price, stake}, win);
      const fee = gross > 0 ? gross * c : 0;
      const net = gross - fee;
      cash += net; plNet += net; plGross += gross; comm += fee; staked += stake; exposure += liabilityOf(def.side, ev.price, stake);
      peak = Math.max(peak, cash); maxDd = Math.max(maxDd, peak - cash);
      const month = d.slice(0, 7);
      byMonth[month] = byMonth[month] ?? {bets: 0, net: 0}; byMonth[month].bets++; byMonth[month].net += net;
      bets.push({date: d, id: m.id, match: `${m.home} – ${m.away}`, comp: m.comp.name, sel: ev.sel, side: def.side, odds: ev.price, stake: r2(stake),
        minute: entryMinute, score: m.final.join('–'), win, net: r2(net)});
      curve.push({x: bets.length, y: r2(plNet)});
    }
  }
  const won = bets.filter(b => b.win).length;
  return {kind: 'BACKTEST', src: 'DEMO', def: JSON.parse(JSON.stringify(def)), cfg: {...cfg}, events, bets, won, lost: bets.length - won, skipped,
    staked: r2(staked), exposure: r2(exposure), plGross: r2(plGross), commission: r2(comm), plNet: r2(plNet), roi: exposure ? plNet / exposure : null,
    strike: bets.length ? won / bets.length : null, avgOdds: bets.length ? bets.reduce((x, b) => x + b.odds, 0) / bets.length : null,
    maxDrawdown: r2(maxDd), finalCash: r2(cash), byMonth, curve, pit: 'PIT', ranAt: new Date().toISOString()};
}

// ---------------------------------------------------------------- paper ledger (#99) — DEMO, append-only
const MODES = {ACTIVE_OPERATIONAL: 'Operativo', ADVISORY_ONLY: 'Fermo (solo consiglio)', PAUSED: 'In pausa', ARCHIVED: 'Archiviato'};
function ledgerLoad() {
  return store.get('ledger', null) ?? ledgerCreate(settings().bankroll);
}
function ledgerCreate(allocation) {
  const l = {account: 'demo', created_at: new Date().toISOString(), seq: 1, entries: [{seq: 1, at: new Date().toISOString(), type: 'ALLOCATE', amount: allocation, text: 'Capitale iniziale'}],
    positions: {}, mode: 'ACTIVE_OPERATIONAL', audit: []};
  store.set('ledger', l);
  return l;
}
function ledgerAppend(l, entry) { l.seq++; l.entries.push({seq: l.seq, at: new Date().toISOString(), ...entry}); }
function positionPL(p) {
  const win = p.legs.reduce((x, leg) => x + legPL(leg, true), 0), lose = p.legs.reduce((x, leg) => x + legPL(leg, false), 0);
  return {win: r2(win), lose: r2(lose), liability: r2(Math.max(0, -Math.min(win, lose)))};
}
function ledgerState(l) {
  let cash = 0, realized = 0, commission = 0, allocated = 0;
  for (const e of l.entries) {
    if (e.type === 'ALLOCATE') { cash += e.amount; allocated += e.amount; }
    if (e.type === 'RESET') { cash += e.delta; allocated += e.delta; }
    if (e.type === 'SETTLE') { cash += e.net; realized += e.net; commission += e.commission; }
  }
  const all = Object.values(l.positions);
  const open = all.filter(p => p.status === 'OPEN');
  const reserved = open.reduce((x, p) => x + positionPL(p).liability, 0);
  // Independent check: the settled positions themselves (not the SETTLE entries) must add up to the realized profit,
  // and capital + realized must give the cash.
  const fromPositions = all.filter(p => p.status === 'SETTLED').reduce((x, p) => x + p.net, 0);
  const reconciled = Math.abs(fromPositions - realized) < 0.005 && Math.abs(allocated + realized - cash) < 0.005;
  return {cash: r2(cash), reserved: r2(reserved), available: r2(cash - reserved), realized: r2(realized), commission: r2(commission), open: open.length,
    settled: all.filter(p => p.status === 'SETTLED').length, reconciled, fromPositions: r2(fromPositions), entries: l.entries.length, todayLoss: r2(ledgerTodayLoss(l))};
}
// Net loss of the positions settled today (Europe/Rome or the configured time zone), as a positive number.
function ledgerTodayLoss(l) {
  const day = d => new Date(d).toLocaleDateString('sv-SE', {timeZone: TZ()});
  const today = day(nowMs());
  const net = l.entries.filter(e => e.type === 'SETTLE' && day(e.at) === today).reduce((x, e) => x + e.net, 0);
  return Math.max(0, -net);
}
// Every limit that applies to a new position: the settings (#95) and the caps of the profile in use (#96).
function ledgerLimits(l, {side, odds, stake, profile}) {
  const st = ledgerState(l), s = settings(), liab = liabilityOf(side, odds, stake);
  const v = profile ? lib.profiles().find(p => p.id === profile)?.versions.at(-1) : null, caps = v?.caps ?? {};
  const out = [];
  if (s.min_stake && stake < s.min_stake) out.push(`puntata sotto il minimo delle impostazioni (${money(s.min_stake)})`);
  if (s.max_stake && stake > s.max_stake) out.push(`puntata oltre il massimo delle impostazioni (${money(s.max_stake)})`);
  if (s.max_liability && liab > s.max_liability) out.push(`responsabilità oltre il massimo delle impostazioni (${money(s.max_liability)})`);
  if (s.max_open && st.open >= s.max_open) out.push(`già ${st.open} posizioni aperte (massimo ${s.max_open})`);
  if (s.daily_loss && st.todayLoss >= s.daily_loss) out.push(`perdita di oggi ${money(st.todayLoss)}: raggiunto il limite giornaliero (${money(s.daily_loss)})`);
  if (caps.max_stake && stake > caps.max_stake) out.push(`puntata oltre il tetto del profilo (${money(caps.max_stake)})`);
  if (caps.max_liability && liab > caps.max_liability) out.push(`responsabilità oltre il tetto del profilo (${money(caps.max_liability)})`);
  if (caps.min_odds && odds < caps.min_odds) out.push(`quota sotto il minimo del profilo (${odd(caps.min_odds)})`);
  if (caps.max_odds && odds > caps.max_odds) out.push(`quota oltre il massimo del profilo (${odd(caps.max_odds)})`);
  if (caps.max_open && st.open >= caps.max_open) out.push(`posizioni aperte oltre il massimo del profilo (${caps.max_open})`);
  return out;
}
function ledgerOpen(l, {match, market, selection, side, odds, stake, profile}) {
  if (l.mode !== 'ACTIVE_OPERATIONAL') return {error: l.mode === 'ADVISORY_ONLY' ? 'Operatività ferma (STOP): la proposta resta un consiglio, niente viene registrato.' : 'Operatività in pausa: nessuna nuova posizione.'};
  if (!(odds > 1) || !(stake > 0)) return {error: 'Quota e puntata devono essere valide.'};
  const st = ledgerState(l);
  const liab = liabilityOf(side, odds, stake);
  if (liab > st.available + 1e-9) return {error: `Capitale disponibile insufficiente: servono ${money(liab)}, disponibili ${money(st.available)}.`};
  const limits = ledgerLimits(l, {side, odds, stake, profile});
  if (limits.length) return {error: `Bloccata dai limiti: ${limits.join('; ')}.`};
  const id = `P${String(l.seq + 1).padStart(4, '0')}`;
  l.positions[id] = {id, matchId: match.id, label: `${match.home} – ${match.away}`, comp: match.comp.name, market, selection, side, legs: [{side, odds, stake, at: new Date().toISOString()}],
    status: 'OPEN', openedAt: new Date().toISOString(), profile: profile ?? null, commission: settings().commission};
  ledgerAppend(l, {type: 'OPEN', position: id, text: `${SIDE_TEXT[side]} ${selectionText(market, selection)} @ ${odd(odds)} · puntata ${money(stake)}`, reserve: r2(liab)});
  store.set('ledger', l);
  return {id};
}
function ledgerHedge(l, id, odds, share = 1) {
  const p = l.positions[id];
  if (!p || p.status !== 'OPEN') return {error: 'Posizione non aperta.'};
  if (l.mode === 'ARCHIVED') return {error: 'Conto archiviato.'};
  if (!(odds > 1)) return {error: 'Quota non valida.'};
  const h = hedgeCalc(p, odds, share);
  if (!(h.stake > 0)) return {error: 'Niente da coprire.'};
  const before = positionPL(p).liability, after = r2(Math.max(0, -Math.min(h.after.win, h.after.lose)));
  // DEC-001: outside ACTIVE_OPERATIONAL a hedge is allowed only when it reduces the exposure.
  if (l.mode !== 'ACTIVE_OPERATIONAL' && after > before - 0.005) return {error: `Operatività ${MODES[l.mode].toLowerCase()}: la copertura è ammessa solo se riduce l’esposizione (${money(before)} → ${money(after)}).`};
  if (after - before > ledgerState(l).available + 1e-9) return {error: 'Capitale disponibile insufficiente per la copertura.'};
  p.legs.push({side: h.side, odds, stake: h.stake, at: new Date().toISOString()});
  ledgerAppend(l, {type: 'HEDGE', position: id, text: `Copertura ${SIDE_TEXT[h.side]} @ ${odd(odds)} · puntata ${money(h.stake)}`});
  store.set('ledger', l);
  return {ok: true, ...h};
}
// Reset (#99): never deletes history; appends a RESET entry that brings the cash to the new capital.
function ledgerReset(l, amount) {
  const st = ledgerState(l);
  if (!(amount > 0)) return {error: 'Capitale non valido.'};
  if (amount < st.reserved) return {error: `Il nuovo capitale non copre l’impegnato delle posizioni aperte (${money(st.reserved)}).`};
  ledgerAppend(l, {type: 'RESET', amount, delta: r2(amount - st.cash), text: `Azzeramento: cassa ${money(st.cash)} → ${money(amount)} (storico conservato)`});
  store.set('ledger', l);
  return {ok: true};
}
// The opposite trade that equalises a position at a price (green-up); share < 1 covers part of it.
function hedgeCalc(p, odds, share = 1) {
  const pl = positionPL(p);
  // Back exposure B = win − lose; a lay of s at odds o moves win by −s(o−1) and lose by +s: equal when s = (win − lose) / o.
  const diff = pl.win - pl.lose;
  const side = diff > 0 ? 'LAY' : 'BACK';
  const stake = r2(Math.abs(diff) / odds * share);
  const leg = {side, odds, stake};
  const win = pl.win + legPL(leg, true), lose = pl.lose + legPL(leg, false);
  return {side, stake, after: {win: r2(win), lose: r2(lose)}, before: {win: pl.win, lose: pl.lose}};
}
function ledgerSettleDue(l) {
  let n = 0;
  for (const p of Object.values(l.positions)) {
    if (p.status !== 'OPEN') continue;
    const c = (p.commission ?? settings().commission) / 100;
    const m = demoMatchById(p.matchId);
    if (!m || liveState(m).status !== 'FT') continue;
    const win = winsSelection(p.market, p.selection, m.final);
    const gross = cents(p.legs.reduce((x, leg) => x + legPL(leg, win), 0));
    const commission = gross > 0 ? cents(gross * c) : 0;
    p.status = 'SETTLED'; p.outcome = win ? 'WIN' : 'LOSE'; p.score = m.final.join('–'); p.net = r2(gross - commission); p.settledAt = new Date().toISOString();
    ledgerAppend(l, {type: 'SETTLE', position: p.id, net: p.net, gross, commission, text: `Regolata ${p.score}: ${win ? 'selezione vincente' : 'selezione perdente'}`});
    n++;
  }
  if (n) store.set('ledger', l);
  return n;
}
function ledgerMode(l, mode, reason) {
  if (l.mode === 'ARCHIVED') return {error: 'Conto archiviato.'};
  l.audit.push({from: l.mode, to: mode, at: new Date().toISOString(), who: 'owner', reason});
  ledgerAppend(l, {type: 'MODE', text: `${MODES[l.mode]} → ${MODES[mode]}: ${reason}`});
  l.mode = mode;
  store.set('ledger', l);
  return {ok: true};
}
const selectionText = (market, sel) => (SELECTIONS[market] ?? []).find(([v]) => v === sel)?.[1] ?? {HOME: '1', DRAW: 'X', AWAY: '2'}[sel] ?? sel;

// ---------------------------------------------------------------- calculators (#94) — local, DEMO
const PoissonCalc = (lh, la, max = 5) => {
  const GRID = 15, ph = pmfArr(lh, GRID), pa = pmfArr(la, GRID);
  let H = 0, D = 0, A = 0, cov = 0; const cells = [];
  for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) { const p = ph[i] * pa[j]; cov += p; if (i > j) H += p; else if (i === j) D += p; else A += p; if (i <= max && j <= max) cells.push({h: i, a: j, p}); }
  const tot = pmfArr(lh + la, 6);
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5].map((l, n) => { const u = tot.slice(0, n + 1).reduce((x, y) => x + y, 0); return {line: l, over: 1 - u, under: u}; });
  const btts = (1 - ph[0]) * (1 - pa[0]);
  return {H, D, A, cov, cells, lines, btts, top: [...cells].sort((x, y) => y.p - x.p).slice(0, 5)};
};
const LOCAL_TOOLS = {
  odds({odds}) {
    const list = String(odds).trim().split(/[\s;]+/).filter(Boolean).map(x => Number(x.replace(',', '.')));
    if (!list.length || list.length > 20 || list.some(o => !(o > 1))) throw new Error('Quote: servono da 1 a 20 quote decimali maggiori di 1, separate da spazi.');
    const imp = list.map(o => 1 / o), book = imp.reduce((a, b) => a + b, 0);
    return {rows: list.map((o, i) => ({odds: o, implied: imp[i], fair: list.length > 1 ? imp[i] / book : null, fairOdds: list.length > 1 ? book / imp[i] : null})), book, over: list.length > 1 ? book - 1 : null};
  },
  ev({odds, probability, stake, side = 'BACK', commission = 0}) {
    const o = num(odds, 'Quota', 1.0001), p = num(probability, 'Probabilità', 0.0001, 99.9999) / 100, s = num(stake, 'Puntata', 0.01), c = num(commission || 0, 'Commissione', 0, 99.99) / 100;
    const win = side === 'BACK' ? s * (o - 1) : -s * (o - 1), lose = side === 'BACK' ? -s : s;
    const net = x => x > 0 ? x * (1 - c) : x;
    const ev = p * net(win) + (1 - p) * net(lose), liab = liabilityOf(side, o, s);
    const edge = side === 'BACK' ? p * o - 1 : (1 - p) / (1 - 1 / o) - 1;
    return {ev, roi: ev / liab, edge, fair: 1 / p, liab, win: net(win), lose: net(lose)};
  },
  kelly({odds, probability, bankroll, fraction = 100}) {
    const o = num(odds, 'Quota', 1.0001), p = num(probability, 'Probabilità', 0.0001, 99.9999) / 100, b = num(bankroll, 'Capitale', 0.01), f = num(fraction || 100, 'Frazione', 0.01, 100) / 100;
    const full = ((o - 1) * p - (1 - p)) / (o - 1);
    const applied = full > 0 ? full * f : 0;
    return {full, applied, stake: floor2(b * applied), edge: p * o - 1};
  },
  position({side = 'BACK', odds, stake, liability, commission = 0}) {
    const o = num(odds, 'Quota', 1.0001), c = num(commission || 0, 'Commissione', 0, 99.99) / 100;
    if ((stake === '' || stake == null) === (liability === '' || liability == null)) throw new Error('Puntata: indica la puntata oppure la responsabilità, non entrambe.');
    const s = stake !== '' && stake != null ? num(stake, 'Puntata', 0.01) : side === 'LAY' ? floor2(num(liability, 'Responsabilità', 0.01) / (o - 1)) : num(liability, 'Responsabilità', 0.01);
    const win = side === 'BACK' ? s * (o - 1) : -s * (o - 1), lose = side === 'BACK' ? -s : s;
    const net = x => x > 0 ? x * (1 - c) : x;
    return {stake: s, liab: liabilityOf(side, o, s), win: net(win), lose: net(lose), be: 1 / o};
  },
  hedge({side = 'BACK', odds, stake, current_odds, share = 100, commission = 0}) {
    const o1 = num(odds, 'Quota di apertura', 1.0001), s1 = num(stake, 'Puntata di apertura', 0.01), o2 = num(current_odds, 'Quota attuale', 1.0001);
    const part = num(share || 100, 'Quanto coprire', 0.01, 100) / 100, c = num(commission || 0, 'Commissione', 0, 99.99) / 100;
    const p = {legs: [{side, odds: o1, stake: s1}]};
    const h = hedgeCalc(p, o2, part);
    const net = x => x > 0 ? x * (1 - c) : x;
    return {side: h.side, stake: h.stake, liab: liabilityOf(h.side, o2, h.stake), before: {win: net(h.before.win), lose: net(h.before.lose)}, after: {win: net(h.after.win), lose: net(h.after.lose)}};
  },
  dutching({odds, total, commission = 0}) {
    const list = String(odds).trim().split(/[\s;]+/).filter(Boolean).map(x => Number(x.replace(',', '.')));
    if (list.length < 2 || list.length > 10 || list.some(o => !(o > 1))) throw new Error('Quote: servono da 2 a 10 quote maggiori di 1.');
    const t = num(total, 'Puntata totale', 0.01), c = num(commission || 0, 'Commissione', 0, 99.99) / 100;
    const inv = list.map(o => 1 / o), book = inv.reduce((a, b) => a + b, 0);
    const stakes = inv.map(p => r2(t * p / book)); const placed = r2(stakes.reduce((a, b) => a + b, 0));
    return {rows: list.map((o, i) => { const g = stakes[i] * o - placed; return {odds: o, stake: stakes[i], win: g > 0 ? g * (1 - c) : g}; }), placed, book};
  },
  poisson({xg_home, xg_away, max_goals = 5}) {
    const lh = num(xg_home, 'Gol attesi casa', 0, 10), la = num(xg_away, 'Gol attesi ospite', 0, 10);
    const max = Math.round(num(max_goals || 5, 'Gol nella griglia', 1, 8));
    return {...PoissonCalc(lh, la, max), max};
  },
  progression({type = 'MARTINGALE', base, odds, steps = 8}) {
    const b = num(base, 'Puntata base', 0.01), o = num(odds, 'Quota', 1.0001), n = Math.round(num(steps || 8, 'Passi', 1, 20));
    const fib = [1, 1]; while (fib.length < n + 2) fib.push(fib[fib.length - 1] + fib[fib.length - 2]);
    const rows = []; let lost = 0;
    for (let i = 0; i < n; i++) {
      const stake = type === 'MARTINGALE' ? b * 2 ** i : type === 'FIBONACCI' ? b * fib[i] : r2((lost + b) / (o - 1));
      rows.push({step: i + 1, stake: r2(stake), cumulative: r2(lost + stake), ifWins: r2(stake * (o - 1) - lost)});
      lost += stake;
    }
    return {rows, total: r2(lost)};
  },
  risk({probability, losses = 5, stake, bankroll}) {
    const p = num(probability, 'Probabilità di vincita', 0.01, 99.99) / 100, n = Math.round(num(losses || 5, 'Perdite consecutive', 1, 50));
    const s = num(stake, 'Puntata', 0.01), bk = num(bankroll, 'Capitale', 0.01);
    const streak = (1 - p) ** n;
    const ruinN = Math.floor(bk / s);
    return {streak, ruinN, ruinStreak: (1 - p) ** ruinN, rows: [3, 5, 8, 10, 15, 20].map(k => ({k, p: (1 - p) ** k, dd: k * s, share: k * s / bk}))};
  },
  convert({odds}) {
    const o = num(odds, 'Quota decimale', 1.0001);
    const frac = (() => { const x = o - 1; for (let den = 1; den <= 100; den++) { const n = Math.round(x * den); if (Math.abs(n / den - x) < 0.005) return `${n}/${den}`; } return `${r2(x)}/1`; })();
    const us = o >= 2 ? `+${Math.round((o - 1) * 100)}` : `${Math.round(-100 / (o - 1))}`;
    return {decimal: o, fractional: frac, american: us, implied: 1 / o, hk: o - 1};
  },
};
function num(v, label, min = -Infinity, max = Infinity) {
  const x = Number(String(v ?? '').trim().replace(',', '.'));
  if (String(v ?? '').trim() === '' || !Number.isFinite(x)) throw new Error(`${label}: valore obbligatorio.`);
  // Lower bounds like 1.0001 or 0.0001 stand for "strictly greater than"; say so instead of showing the epsilon.
  const strict = min % 1 && String(min).length > 4;
  if (x < min) throw new Error(strict ? `${label}: deve essere maggiore di ${nf(Math.floor(min), 0)}.` : `${label}: deve essere almeno ${nf(min, min % 1 ? 2 : 0)}.`);
  if (x > max) throw new Error(max % 1 && String(max).length > 5 ? `${label}: deve essere minore di ${nf(Math.ceil(max), 0)}.` : `${label}: deve essere al massimo ${nf(max, max % 1 ? 2 : 0)}.`);
  return x;
}
