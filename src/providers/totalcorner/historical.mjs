// TC-CORE-03B (#20): pure helpers for historical TotalCorner backfill.
// Historical provider-local timestamps are converted with an IANA zone only after that zone is validated
// against a fresh measured live offset. This avoids hardcoding +120 across DST.

export const HISTORICAL_VERSION = 'tc-core-03b-v3';
export const DEFAULT_PROVIDER_TIME_ZONE = 'Europe/Rome';

const parts = (date, timeZone) => Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, p.value])
);

export function offsetMinutesAt(date, timeZone = DEFAULT_PROVIDER_TIME_ZONE) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(Number(p.year), Number(p.month)-1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - date.getTime()) / 60000);
}

export function providerLocalToUtc(value, timeZone = DEFAULT_PROVIDER_TIME_ZONE) {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0));
  let guess = new Date(naive);
  let off = offsetMinutesAt(guess, timeZone);
  let utc = new Date(naive - off * 60000);
  const off2 = offsetMinutesAt(utc, timeZone);
  if (off2 !== off) { off = off2; utc = new Date(naive - off * 60000); }
  return {utc, offsetMinutes: off};
}

export function historicalZoneDecision({observations, now = new Date(), timeZone = DEFAULT_PROVIDER_TIME_ZONE, maxAgeMinutes = 360}) {
  const measured = (observations || []).find(o => o.status === 'MEASURED');
  if (!measured) return {verified:false, reason:'no_live_measurement'};
  const age = (now - new Date(measured.observed_at)) / 60000;
  if (age > maxAgeMinutes) return {verified:false, reason:'stale_live_measurement', age_minutes:Math.round(age)};
  const zoneNow = offsetMinutesAt(now, timeZone);
  if (Number(measured.offset_minutes) !== zoneNow) {
    return {verified:false, reason:'zone_mismatch', measured:Number(measured.offset_minutes), zone_offset:zoneNow, time_zone:timeZone};
  }
  return {verified:true, reason:'live_measurement_matches_zone', measured:Number(measured.offset_minutes), zone_offset:zoneNow, time_zone:timeZone};
}

export function seasonKey(providerStart) {
  const s = String(providerStart ?? '');
  const m = s.match(/^(\d{4})-(\d{2})-/);
  if (!m) return null;
  const y = Number(m[1]), month = Number(m[2]);
  return month >= 7 ? `${y}/${String(y + 1).slice(-2)}` : `${y - 1}/${String(y).slice(-2)}`;
}

export function rowsOf(body) {
  return Array.isArray(body?.data) ? body.data : body?.data && typeof body.data === 'object' ? [body.data] : [];
}

// /league/schedule is an envelope: data={league,matches:[...]}, unlike match endpoints where data is the rows array.
// Keep the distinction explicit so a successful schedule response can never silently become a zero-match sample.
export function scheduleMatches(body) {
  if (Array.isArray(body?.data?.matches)) return body.data.matches;
  return Array.isArray(body?.data) ? body.data : [];
}

export function historicalAudit(record, oddsRecord, bookmakerRecord) {
  const arr = v => Array.isArray(v) ? v : [];
  const events = arr(record?.events);
  const present = (...keys) => keys.some(k => record?.[k] !== null && record?.[k] !== undefined && record?.[k] !== '');
  const stats = {
    attacks: present('attacks','att'),
    dangerous: present('dangerous_attacks','dang_attacks','dangerousAttacks'),
    shots: present('shot_on','shot_off','shotOn','shotOff'),
    possession: present('possession','possess')
  };
  const has = k => arr(oddsRecord?.[k]).length > 0;
  return {
    events_count: events.length,
    score_ft_present: present('score','ss','ft_score'),
    score_ht_present: present('ht','ht_score','hf_hg','hf_ag'),
    corners_present: present('corner','corners','hc','ac','hf_hc','hf_ac'),
    cards_present: present('yellow','red','cards','home_yellow','away_yellow','hyc','ayc','hrc','arc'),
    attacks_present: stats.attacks,
    dangerous_attacks_present: stats.dangerous,
    shots_present: stats.shots,
    possession_present: stats.possession,
    odds_history_present: has('odds_list'),
    asian_history_present: has('asian_list'),
    goal_history_present: has('goal_list'),
    corner_history_present: has('corner_list'),
    btts_history_present: has('btts_list'),
    bookmaker_odds_present: arr(bookmakerRecord?.bookmakers).length > 0,
    retroactive_live_stats_present: stats.attacks || stats.dangerous || stats.shots || stats.possession
  };
}

export const MOVEMENT_BOOKMAKERS = ['pinnacle', 'betfair', '1xbet', 'bwin', 'snai'];
export const MOVEMENT_COLUMNS = ['oddsList', 'asianList', 'goalList', 'cornerList'];

export function movementColumnsFor(bookmaker) {
  return bookmaker === 'pinnacle' ? MOVEMENT_COLUMNS : ['asianList'];
}

export function expectedMovementKeys(bookmakers = MOVEMENT_BOOKMAKERS) {
  return bookmakers.flatMap(bookmaker => movementColumnsFor(bookmaker).map(columns => `${bookmaker}:${columns}`));
}

// A match still needs movement work until every expected bookmaker/column probe exists.
// Existing no_data probes count as done: they must not be repeated just because rows_seen is 0.
export function matchesNeedingMovement(matchIds, existingKeysByMatch = {}, limit = 1) {
  const needed = [];
  const expected = expectedMovementKeys();
  for (const id of matchIds) {
    const have = new Set(existingKeysByMatch[String(id)] || []);
    if (expected.some(key => !have.has(key))) needed.push(String(id));
    if (needed.length >= limit) break;
  }
  return needed;
}

export function movementStats(body) {
  const match = rowsOf(body)[0] || {};
  // bookmaker movement is nested below data[0].bookmakers[0], while older discovery helpers
  // also encountered direct list fields. Support both shapes losslessly.
  const sources = [match, ...(Array.isArray(match.bookmakers) ? match.bookmakers : [])];
  const lists = ['asian_list','goal_list','corner_list','odds_list'];
  let rows = 0, suspended = 0;
  for (const source of sources) {
    for (const k of lists) {
      for (const x of Array.isArray(source?.[k]) ? source[k] : []) {
        rows++;
        const flag = Array.isArray(x) ? x[7] : null;
        if (flag !== null && flag !== undefined && Number(flag) !== 0) suspended++;
      }
    }
  }
  return {rows, suspended};
}
