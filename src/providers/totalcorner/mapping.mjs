// FPT <-> TotalCorner competition mapping by real fixture overlap (#20, TC-CORE-02).
// A competition is VERIFIED only when enough FPT fixtures are found in one TotalCorner league on the same dates
// with matching teams, the pairing is unique in both directions, and the evidence is persisted.

export const MAPPING_METHOD = 'fixture-overlap-v1';
export const THRESHOLDS = Object.freeze({minMatched: 3, minCoverage: 0.5, maxRunnerUpRatio: 0.25, pairAvg: 0.6, pairMin: 0.34, dateToleranceDays: 1});

const STOP = new Set(['fc', 'cf', 'sc', 'ac', 'afc', 'cd', 'sd', 'ud', 'club', 'de', 'da', 'do', 'del', 'the', 'fk', 'sk', 'nk', 'if', 'bk',
  'ca', 'sv', 'vfb', 'vfl', 'tsv', 'cfc', 'calcio', 'football', 'futbol', 'clube', 'esporte', 'sport', 'sporting', 'ec', 'se', 'ss', 'as', 'us', 'ssd']);
const SYN = new Map([['utd', 'united'], ['ii', 'b'], ['2', 'b'], ['st', 'saint'], ['intl', 'international'], ['wanderers', 'wanderers']]);

export function normalizeName(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
    .map(t => SYN.get(t) || t).filter(t => !STOP.has(t));
}

function trigrams(tokens) {
  const s = ` ${tokens.join(' ')} `;
  const out = new Set();
  for (let i = 0; i < s.length - 2; i++) out.add(s.slice(i, i + 3));
  return out;
}

export function teamKey(name) {
  const tokens = normalizeName(name);
  return {tokens: new Set(tokens), grams: trigrams(tokens)};
}

export function similarity(a, b) {
  if (!a.tokens.size || !b.tokens.size) return 0;
  let inter = 0;
  for (const t of a.tokens) if (b.tokens.has(t)) inter++;
  const jaccard = inter / (a.tokens.size + b.tokens.size - inter);
  let g = 0;
  for (const t of a.grams) if (b.grams.has(t)) g++;
  const dice = (2 * g) / (a.grams.size + b.grams.size);
  return Math.max(jaccard, dice);
}

const dayNum = iso => Math.floor(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / 86400000);

// TotalCorner `start` is provider-local (UTC+2 observed on 08/10); the UTC date is start - offset.
export function tcUtcDate(start, offsetMinutes) {
  const t = Date.parse(String(start).replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return null;
  return new Date(t - offsetMinutes * 60000).toISOString().slice(0, 10);
}

// fpt: [{league_key, date, home, away}], tc: [{league_id, league_name, date, home, away, id}]
export function pairFixtures(fpt, tc, t = THRESHOLDS) {
  const byDay = new Map();
  for (const m of tc) {
    const d = dayNum(m.date);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push({...m, hk: teamKey(m.home), ak: teamKey(m.away)});
  }
  const pairs = [];
  for (const f of fpt) {
    const hk = teamKey(f.home), ak = teamKey(f.away), d = dayNum(f.date);
    // Best candidate per TotalCorner league: a fixture found in two leagues counts for both, so competition is visible.
    const perLeague = new Map();
    for (let k = -t.dateToleranceDays; k <= t.dateToleranceDays; k++) {
      for (const m of byDay.get(d + k) || []) {
        const sh = similarity(hk, m.hk), sa = similarity(ak, m.ak);
        const avg = (sh + sa) / 2;
        if (avg < t.pairAvg || Math.min(sh, sa) < t.pairMin) continue;
        const cur = perLeague.get(m.league_id);
        if (!cur || avg > cur.score) perLeague.set(m.league_id, {tc: m, score: avg});
      }
    }
    for (const c of perLeague.values()) pairs.push({fpt: f, tc: c.tc, score: c.score});
  }
  return pairs;
}

// Mapping states per FPT competition from the fixture pairs.
export function classifyMappings({fptLeagues, fpt, tc, pairs, t = THRESHOLDS}) {
  const fptCount = new Map();
  for (const f of fpt) fptCount.set(f.league_key, (fptCount.get(f.league_key) || 0) + 1);
  const tcNames = new Map(tc.map(m => [m.league_id, m.league_name]));
  const tcCount = new Map();
  for (const m of tc) tcCount.set(m.league_id, (tcCount.get(m.league_id) || 0) + 1);
  const counts = new Map(); // league_key -> Map(tc_league -> pairs[])
  for (const p of pairs) {
    if (!counts.has(p.fpt.league_key)) counts.set(p.fpt.league_key, new Map());
    const m = counts.get(p.fpt.league_key);
    if (!m.has(p.tc.league_id)) m.set(p.tc.league_id, []);
    m.get(p.tc.league_id).push(p);
  }
  // Reverse view: for each TC league, matched counts per FPT league.
  const reverse = new Map();
  for (const [lk, m] of counts) for (const [tid, ps] of m) {
    if (!reverse.has(tid)) reverse.set(tid, []);
    reverse.get(tid).push({league_key: lk, n: ps.length});
  }
  for (const list of reverse.values()) list.sort((a, b) => b.n - a.n);

  return fptLeagues.map(L => {
    const n = fptCount.get(L.league_key) || 0;
    const ranked = [...(counts.get(L.league_key) || new Map())].map(([tid, ps]) => ({tid, ps})).sort((a, b) => b.ps.length - a.ps.length);
    const best = ranked[0], second = ranked[1];
    const evidence = {method: MAPPING_METHOD, thresholds: t, fpt_fixtures: n, tc_fixtures: best ? tcCount.get(best.tid) : 0,
      matched: best ? best.ps.length : 0, runner_up: second ? {totalcorner_league_id: second.tid, totalcorner_league_name: tcNames.get(second.tid), matched: second.ps.length} : null,
      sample: best ? best.ps.slice(0, 5).map(p => ({date: p.fpt.date, fpt: `${p.fpt.home} - ${p.fpt.away}`, tc: `${p.tc.home} - ${p.tc.away}`, tc_match_id: p.tc.id, tc_date: p.tc.date, score: Number(p.score.toFixed(3))})) : []};
    if (!n) return {...L, status: 'UNMAPPED', confidence: null, evidence: {...evidence, reason: 'no_fpt_fixtures_in_window'}};
    if (!best) return {...L, status: 'UNMAPPED', confidence: 0, evidence: {...evidence, reason: 'no_tc_fixture_match'}};
    const m1 = best.ps.length, m2 = second ? second.ps.length : 0;
    const coverage = m1 / n;
    const rev = reverse.get(best.tid) || [];
    const reverseUnique = rev[0]?.league_key === L.league_key && (!rev[1] || rev[1].n <= t.maxRunnerUpRatio * m1);
    const reverseOthers = rev.filter(r => r.league_key !== L.league_key).map(r => ({league_key: r.league_key, matched: r.n}));
    const base = {...L, totalcorner_league_id: best.tid, totalcorner_league_name: tcNames.get(best.tid), confidence: Number(coverage.toFixed(4)),
      evidence: {...evidence, coverage: Number(coverage.toFixed(4)), reverse_unique: reverseUnique, reverse_others: reverseOthers.slice(0, 5)}};
    if (m1 >= t.minMatched && coverage >= t.minCoverage && m2 <= t.maxRunnerUpRatio * m1 && reverseUnique) return {...base, status: 'VERIFIED'};
    if (m1 >= 2 && (m2 > t.maxRunnerUpRatio * m1 || !reverseUnique)) return {...base, status: 'AMBIGUOUS'};
    return {...base, status: 'CANDIDATE'};
  });
}

// Naming differs when the FPT league slug words are not all contained in the TotalCorner league name.
export function namingDiffers(fptLeagueSlug, tcName) {
  const tcTokens = new Set(normalizeName(tcName));
  return normalizeName(String(fptLeagueSlug).replace(/-/g, ' ')).some(t => !tcTokens.has(t));
}
