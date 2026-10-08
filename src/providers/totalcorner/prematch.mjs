import crypto from 'node:crypto';

// TotalCorner prematch normalization (#20, TC-CORE-03). Pure functions: provider rows -> market rows with the
// point-in-time phase. A row is PREMATCH only when it carries no in-play minute and its provider time, converted to
// UTC, is strictly before the scheduled kickoff. Everything else is INPLAY or QUARANTINE, never PREMATCH.

export const PREMATCH_PARSER_VERSION = 'tc-prematch-v1';

// /match/odds list keys -> [market, period]. Observed 08/10: rows are
// odds  [minute, home, draw, away, time, score_h, score_a]
// asian/goal/corner [minute, line, home|over, away|under, time, score_h, score_a]
// btts  [minute, yes, no, time, score_h, score_a]
export const ODDS_LIST_KEYS = Object.freeze({
  odds_list: ['odds', 'FT'], asian_list: ['asian', 'FT'], goal_list: ['goal', 'FT'], corner_list: ['corner', 'FT'],
  odds_half_list: ['odds', 'HT'], asian_half_list: ['asian', 'HT'], goal_half_list: ['goal', 'HT'], corner_half_list: ['corner', 'HT'],
  btts_list: ['btts', 'FT']
});

const BOOKMAKER_MARKETS = Object.freeze({
  odds: ['home', 'draw', 'away'], asian: ['home', 'away'], goal: ['over', 'under'], corner: ['over', 'under']
});

// Provider-local "YYYY-MM-DD HH:MM:SS" (UTC+offset) -> Date in UTC, or null when unparseable.
export function providerToUtc(text, offsetMinutes) {
  const s = String(text ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  const t = Date.parse(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(t) ? null : new Date(t - offsetMinutes * 60000);
}

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};
const int = v => { const n = num(v); return n === null ? null : Math.trunc(n); };
const str = v => (v === null || v === undefined || v === '' ? null : String(v).trim());

// Phase and provenance of one row. `inPlay` is true when the provider marked the row with a minute.
export function classifyRow({inPlay, providerUtc, kickoffUtc, acquiredAt}) {
  if (inPlay) return {phase: 'INPLAY', quarantine_reason: null, provenance: 'LIVE_UPSTREAM'};
  const late = acquiredAt >= kickoffUtc;
  if (!providerUtc) return {phase: 'QUARANTINE', quarantine_reason: 'unparseable_provider_time', provenance: late ? 'HISTORICAL_UPSTREAM' : 'PREMATCH_CAPTURED'};
  if (providerUtc >= kickoffUtc) return {phase: 'QUARANTINE', quarantine_reason: 'no_minute_at_or_after_scheduled_kickoff', provenance: 'HISTORICAL_UPSTREAM'};
  return {phase: 'PREMATCH', quarantine_reason: null, provenance: late ? 'HISTORICAL_UPSTREAM' : 'PREMATCH_CAPTURED'};
}

function rowHash(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 32);
}

function finish(base, {minuteRaw, offset, kickoffUtc, acquiredAt}) {
  const inPlay = minuteRaw !== null && minuteRaw !== undefined && String(minuteRaw).trim() !== '';
  const providerUtc = providerToUtc(base.provider_time, offset);
  const cls = classifyRow({inPlay, providerUtc, kickoffUtc, acquiredAt});
  const minute = inPlay ? int(minuteRaw) : null;
  const extra = {...(base.extra || {})};
  if (inPlay && minute === null) extra.minute_raw = String(minuteRaw);
  const row = {...base, minute, provider_time_utc: providerUtc ? providerUtc.toISOString() : null,
    extra: Object.keys(extra).length ? extra : null, ...cls};
  row.row_hash = rowHash([row.kind, minuteRaw ?? null, row.line, row.price_1, row.price_2, row.price_3, row.provider_time,
    row.score_home, row.score_away, row.extra]);
  return row;
}

// Rows of a /match/odds body.
export function normalizeOddsRows(record, {offset, kickoffUtc, acquiredAt}) {
  const out = [];
  for (const [key, [market, period]] of Object.entries(ODDS_LIST_KEYS)) {
    const list = record?.[key];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      if (!Array.isArray(r)) continue;
      let base;
      if (market === 'btts') {
        base = {line: null, price_1: num(r[1]), price_2: num(r[2]), price_3: null, provider_time: str(r[3]),
          score_home: int(r[4]), score_away: int(r[5]), extra: r.length > 6 ? {rest: r.slice(6)} : null};
      } else if (market === 'odds') {
        base = {line: null, price_1: num(r[1]), price_2: num(r[2]), price_3: num(r[3]), provider_time: str(r[4]),
          score_home: int(r[5]), score_away: int(r[6]), extra: r.length > 7 ? {rest: r.slice(7)} : null};
      } else {
        base = {line: str(r[1]), price_1: num(r[2]), price_2: num(r[3]), price_3: null, provider_time: str(r[4]),
          score_home: int(r[5]), score_away: int(r[6]), extra: r.length > 7 ? {rest: r.slice(7)} : null};
      }
      out.push(finish({source: 'consensus', market, period, kind: 'movement', ...base}, {minuteRaw: r[0], offset, kickoffUtc, acquiredAt}));
    }
  }
  return out;
}

// Open/close/inplay quotes of a /match/bookmaker_odds body, one source per bookmaker slug.
export function normalizeBookmakerRows(record, {offset, kickoffUtc, acquiredAt}) {
  const out = [];
  for (const b of Array.isArray(record?.bookmakers) ? record.bookmakers : []) {
    const slug = str(b?.slug);
    if (!slug) continue;
    for (const [market, sides] of Object.entries(BOOKMAKER_MARKETS)) {
      const m = b[market];
      if (!m || typeof m !== 'object') continue;
      for (const kind of ['open', 'close', 'inplay']) {
        const q = m[kind];
        if (!q || typeof q !== 'object') continue;
        const known = new Set(['line', 'time', 'minute', ...sides]);
        const rest = Object.fromEntries(Object.entries(q).filter(([k]) => !known.has(k)));
        const base = {source: `bookmaker:${slug}`, market, period: 'FT', kind, line: market === 'odds' ? null : str(q.line),
          price_1: num(q[sides[0]]), price_2: num(q[sides[1]]), price_3: sides[2] ? num(q[sides[2]]) : null,
          provider_time: str(q.time), score_home: null, score_away: null, extra: Object.keys(rest).length ? rest : null};
        // An in-play quote is never prematch even when the provider omits its minute.
        const minuteRaw = kind === 'inplay' ? (q.minute ?? 'inplay') : q.minute ?? null;
        out.push(finish(base, {minuteRaw, offset, kickoffUtc, acquiredAt}));
      }
    }
  }
  return out;
}

// Match identity from any match-level body record.
export function matchIdentity(record, offset) {
  const kickoff = providerToUtc(record?.start, offset);
  if (!record?.id || !record?.l_id || !kickoff) return null;
  return {match_id: String(record.id), league_id: String(record.l_id), league_name: str(record.l), home: str(record.h),
    home_id: str(record.h_id), away: str(record.a), away_id: str(record.a_id), start_provider: String(record.start),
    tz_offset_minutes: offset, kickoff_utc: kickoff, last_status: str(record.status)};
}

// Snapshot cadence: sparse far from kickoff, dense close to it, nothing at or after kickoff.
export function snapshotIntervalMinutes(minutesToKickoff) {
  if (minutesToKickoff > 360) return 180;
  if (minutesToKickoff > 60) return 60;
  if (minutesToKickoff > 15) return 15;
  return 5;
}

export function bookmakerIntervalMinutes(minutesToKickoff) {
  if (minutesToKickoff > 360) return 360;
  if (minutesToKickoff > 60) return 120;
  return 30;
}

// Due when never taken, or when the last snapshot is older than the interval for the current distance (30 s slack).
export function isDue({kickoffUtc, lastAt, now, interval = snapshotIntervalMinutes}) {
  const mtk = (kickoffUtc - now) / 60000;
  if (mtk <= 0) return false;
  if (!lastAt) return true;
  return now - lastAt >= interval(mtk) * 60000 - 30000;
}

// Opening and last-before-cutoff per (source, market, period) over PREMATCH rows only.
export function pitSummary(rows, {kickoffUtc, asOf}) {
  const groups = new Map();
  for (const r of rows) {
    if (r.phase !== 'PREMATCH') continue;
    const t = Date.parse(r.provider_time_utc);
    if (!(t <= asOf.getTime()) || !(t < kickoffUtc.getTime())) continue;
    const k = `${r.source}|${r.market}|${r.period}`;
    const g = groups.get(k) || {source: r.source, market: r.market, period: r.period, rows: 0, opening: null, last: null};
    g.rows++;
    if (!g.opening || t < Date.parse(g.opening.provider_time_utc)) g.opening = r;
    if (!g.last || t > Date.parse(g.last.provider_time_utc)) g.last = r;
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => (a.source + a.market + a.period).localeCompare(b.source + b.market + b.period));
}

// ---- Provider timezone gate (TC-CORE-03 fix) ----
// TotalCorner timestamps are provider-local. UTC+2 was measured on 08/10/2026, but it is not assumed forever (DST,
// provider change). Every prematch cycle relies on a fresh, persisted measurement: first-half in-play rows give
// offset ~= start_as_utc - (acquired_at - minute). The configured offset is used only while a measurement agrees.
export const TZ_GATE_VERSION = 'tc-tz-gate-v1';
const NOT_REAL_TIME = /e-?soccer|cyber|virtual|mins? play|e-?football|fifa|pes\b/i;

// samples: [{row, acquiredAt}] — each list row with the acquisition time of the page it came from.
export function measureProviderOffset(samples, {roundTo = 15, maxSpread = 20, minSamples = 2} = {}) {
  const estimates = [];
  let excluded = 0;
  for (const {row: r, acquiredAt} of Array.isArray(samples) ? samples : []) {
    if (!(acquiredAt instanceof Date)) continue;
    const status = String(r?.status ?? '').trim();
    if (!/^\d+$/.test(status)) continue;
    const minute = Number(status);
    if (minute < 1 || minute > 45) continue;
    if (NOT_REAL_TIME.test(String(r?.l ?? ''))) { excluded++; continue; }
    const s = String(r?.start ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) continue;
    const startAsUtc = Date.parse(s.replace(' ', 'T') + 'Z');
    if (Number.isNaN(startAsUtc)) continue;
    estimates.push((startAsUtc - (acquiredAt.getTime() - minute * 60000)) / 60000);
  }
  estimates.sort((a, b) => a - b);
  const n = estimates.length;
  const median = n ? (n % 2 ? estimates[(n - 1) / 2] : (estimates[n / 2 - 1] + estimates[n / 2]) / 2) : null;
  const base = {samples: n, excluded_not_real_time: excluded, median_minutes: median === null ? null : Math.round(median * 10) / 10,
    min_minutes: n ? Math.round(estimates[0] * 10) / 10 : null, max_minutes: n ? Math.round(estimates[n - 1] * 10) / 10 : null};
  if (n < minSamples) return {...base, status: 'INSUFFICIENT', offset_minutes: null};
  if (estimates[n - 1] - estimates[0] > maxSpread) return {...base, status: 'INCONSISTENT', offset_minutes: null};
  return {...base, status: 'MEASURED', offset_minutes: Math.round(median / roundTo) * roundTo};
}

// Measure again when there is no fresh MEASURED observation (older than checkMinutes) and the last attempt of any kind
// is at least retryMinutes old: a thin in-play list (INSUFFICIENT) is retried on the next cycle, not after checkMinutes.
export function tzNeedsMeasure({observations, now, checkMinutes = 30, retryMinutes = 5}) {
  const obs = observations || [];
  if (!obs.length) return true;
  const age = o => (now - new Date(o.observed_at)) / 60000;
  const measured = obs.find(o => o.status === 'MEASURED');
  if (measured && age(measured) < checkMinutes) return false;
  return age(obs[0]) >= retryMinutes;
}

// Decision for one cycle. observations: newest first, each {status, offset_minutes, observed_at}. Verified only when the
// newest usable measurement (MEASURED) is fresh and equals the configured offset; any newer mismatch holds the cycle.
export function tzDecision({observations, configuredOffset, now, maxAgeMinutes = 360}) {
  const usable = (observations || []).find(o => o.status === 'MEASURED');
  if (!usable) return {verified: false, offset: null, reason: 'no_measurement'};
  const ageMin = (now - new Date(usable.observed_at)) / 60000;
  if (Number(usable.offset_minutes) !== Number(configuredOffset)) {
    return {verified: false, offset: null, reason: 'mismatch', measured: Number(usable.offset_minutes), configured: Number(configuredOffset)};
  }
  if (ageMin > maxAgeMinutes) return {verified: false, offset: null, reason: 'stale', age_minutes: Math.round(ageMin)};
  return {verified: true, offset: Number(configuredOffset), reason: 'agree', age_minutes: Math.round(ageMin)};
}
