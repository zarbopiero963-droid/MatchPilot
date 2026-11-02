// MP-TC-BENCH-01 (#263, MP-OWNER-IMPL-20261101 "TotalCorner"): the LIVE benchmark of TotalCorner against API-FOOTBALL as
// pure, reproducible functions. It reads only what the caller passes (exports of already archived data); it calls no
// provider and starts no collector. The protocol is docs/product/mp-263/README.md, section 3.
//
// Input per provider: normalized series, one per match, built by an adapter from archived rows:
//   {provider, deduplicated: boolean, match: {id, league, kickoff, home, away},
//    snapshots: [{acquired_at, minute, fields: {name: value}}], events: [{type, minute, acquired_at}],
//    requests?: {calls, errors, empty}}
// deduplicated: true when the archive stores a snapshot only when the payload changes (TotalCorner does): then the
// intervals between rows are the cadence of changes, not of polls, and are never compared with a non-deduplicated series.
// Every number in the report is derived from those rows; nothing is estimated or filled in.
//
// Verdict: KEEP / DROP / INSUFFICIENT EVIDENCE. Thresholds are an input the owner approves; without them, without live
// data on both sides of enough matched matches, or with metrics that are not comparable, it is INSUFFICIENT EVIDENCE.
// Fields of the two providers are compared only through an explicit mapping passed in (never guessed from names).

export const BENCHMARK_VERSION = 'mp-live-bench-2';
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const instant = v => (typeof v === 'string' && ISO_WITH_OFFSET.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);
// A plain match minute ("0".."130"): "45+2", "HT" or "" are not read.
const plainMinute = v => (/^\d{1,3}$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : null);

// Team name for matching: letters and digits of any script, lowercase, accents removed, spaces collapsed. No club token is
// dropped ("Club America" stays apart from "America"): a missed match is safer than a false one.
const FOLD = {'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'ı': 'i'};
export function normalizeTeam(name) {
  return String(name ?? '').toLowerCase().replace(/[øłđðþæœßı]/g, c => FOLD[c]).normalize('NFKD').replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

// Matches the two providers' matches: same normalized home and away teams (both non-empty) and kickoff within the
// tolerance. Only a pair that is the unique candidate on both sides is VERIFIED; ambiguous pairs, swapped home/away
// and unmatched matches are reported, never forced. Duplicate ids in an input are refused.
export function matchFixtures(left, right, {kickoffToleranceMs = 15 * 60000} = {}) {
  for (const [side, list] of [['candidate', left], ['reference', right]]) {
    const ids = list.map(m => String(m?.id ?? ''));
    if (ids.some(id => !id)) throw new TypeError(`${side}: every match needs an id`);
    if (new Set(ids).size !== ids.length) throw new TypeError(`${side}: duplicate match ids`);
  }
  const named = m => normalizeTeam(m.home) !== '' && normalizeTeam(m.away) !== '';
  const near = (a, b) => instant(a.kickoff) !== null && instant(b.kickoff) !== null && Math.abs(instant(a.kickoff) - instant(b.kickoff)) <= kickoffToleranceMs;
  const same = (a, b) => named(a) && named(b) && normalizeTeam(a.home) === normalizeTeam(b.home) && normalizeTeam(a.away) === normalizeTeam(b.away) && near(a, b);
  const verified = [];
  const ambiguous = [];
  const swapped = [];
  for (const l of left) {
    const c = right.filter(r => same(l, r));
    if (c.length === 1 && left.filter(o => same(o, c[0])).length === 1) verified.push({left: l.id, right: c[0].id});
    else if (c.length > 1) ambiguous.push({left: l.id, candidates: c.map(r => r.id)});
    else if (named(l)) {
      const s = right.filter(r => named(r) && normalizeTeam(l.home) === normalizeTeam(r.away) && normalizeTeam(l.away) === normalizeTeam(r.home) && near(l, r));
      if (s.length) swapped.push({left: l.id, candidates: s.map(r => r.id)});
    }
  }
  const matchedLeft = new Set(verified.map(v => v.left));
  const matchedRight = new Set(verified.map(v => v.right));
  return {
    verified, ambiguous, swapped_home_away: swapped,
    unmatched_left: left.filter(m => !matchedLeft.has(m.id)).map(m => m.id),
    unmatched_right: right.filter(m => !matchedRight.has(m.id)).map(m => m.id)
  };
}

// Nearest-rank quantile on sorted values: the element at index round(q * (n - 1)). For an even count the median is the
// upper of the two middle values. Documented here so that every report uses the same definition.
const quantile = (sorted, q) => (sorted.length ? sorted[Math.round(q * (sorted.length - 1))] : null);

// Metrics of one provider over the given series (already restricted to the matched matches).
export function providerMetrics(series, {gapMs = 5 * 60000} = {}) {
  const leagues = new Set(series.map(s => String(s.match?.league ?? '')));
  const fieldCount = new Map();
  let snapshots = 0;
  const intervals = [];
  let excludedIntervals = 0;
  let gaps = 0;
  const delays = [];
  let excludedEvents = 0;
  let unreadable = 0;
  let requests = null;
  const dedup = new Set(series.map(s => s.deduplicated === true));
  for (const s of series) {
    const kickoff = instant(s.match?.kickoff);
    const rows = [];
    for (const snap of s.snapshots ?? []) {
      const at = instant(snap.acquired_at);
      if (at === null) { unreadable += 1; continue; }
      snapshots += 1;
      rows.push({at, minute: plainMinute(snap.minute)});
      for (const [name, value] of Object.entries(snap.fields ?? {})) {
        const c = fieldCount.get(name) ?? {present: 0, empty: 0};
        if (value === null || value === undefined || value === '') c.empty += 1; else c.present += 1;
        fieldCount.set(name, c);
      }
    }
    rows.sort((a, b) => a.at - b.at);
    // Intervals only inside play: both rows after kickoff, both with a plain minute, not across the half-time break.
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      const inPlay = kickoff !== null && a.at >= kickoff && a.minute !== null && b.minute !== null && !(a.minute <= 45 && b.minute > 45);
      if (!inPlay) { excludedIntervals += 1; continue; }
      intervals.push(b.at - a.at);
      if (b.at - a.at > gapMs) gaps += 1;
    }
    // Sighting delay: first archived sighting of an event minus its nominal time (scheduled kickoff + minute). This is
    // NOT the provider's latency: a later real kickoff or a minute label that is a floor make it larger, an early
    // kickoff can make it negative. First half and plain minutes only ("45+2" is not read).
    for (const e of s.events ?? []) {
      const at = instant(e.acquired_at);
      const minute = plainMinute(e.minute);
      if (kickoff === null || at === null || minute === null || minute > 45) { excludedEvents += 1; continue; }
      delays.push(at - (kickoff + minute * 60000));
    }
    if (s.requests && typeof s.requests === 'object') {
      requests ??= {calls: 0, errors: 0, empty: 0};
      for (const k of Object.keys(requests)) requests[k] += Number.isSafeInteger(s.requests[k]) ? s.requests[k] : 0;
    }
  }
  intervals.sort((a, b) => a - b);
  delays.sort((a, b) => a - b);
  const fields = Object.fromEntries([...fieldCount.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, c]) => [name, {
    present: c.present, empty: c.empty, absent: snapshots - c.present - c.empty,
    missing_ratio: snapshots ? Number(((snapshots - c.present) / snapshots).toFixed(4)) : null
  }]));
  return {
    matches: series.length, matches_with_snapshots: series.filter(s => (s.snapshots ?? []).some(x => instant(x.acquired_at) !== null)).length,
    leagues: leagues.size, snapshots, unreadable_snapshots: unreadable,
    deduplicated: dedup.size === 1 ? [...dedup][0] : series.length ? 'mixed' : null,
    fields,
    interval_ms: {median: quantile(intervals, 0.5), p90: quantile(intervals, 0.9), samples: intervals.length, excluded: excludedIntervals,
      note: dedup.has(true) ? 'interval between stored rows of a deduplicated archive: cadence of changes, not of polls' : 'interval between stored rows'},
    gaps: {count: gaps, threshold_ms: gapMs},
    sighting_delay_ms: {median: quantile(delays, 0.5), p90: quantile(delays, 0.9), min: delays.length ? delays[0] : null,
      negative: delays.filter(d => d < 0).length, samples: delays.length, excluded: excludedEvents,
      note: 'first archived sighting minus scheduled kickoff + minute; not provider latency, biased upward by a late kickoff and minute floors'},
    requests,
    quantile: 'nearest-rank: index round(q * (n - 1))'
  };
}

// Fields with a value in one provider only, through the explicit mapping {leftField: rightField}. Without a mapping
// nothing is compared across providers.
export function uniqueFields(left, right, mapping = {}) {
  const has = m => new Set(Object.entries(m.fields).filter(([, f]) => f.present > 0).map(([n]) => n));
  const l = has(left), r = has(right);
  const mappedLeft = new Set(Object.keys(mapping));
  const mappedRight = new Set(Object.values(mapping));
  return {
    mapped: Object.entries(mapping).map(([lf, rf]) => ({left: lf, right: rf, left_present: l.has(lf), right_present: r.has(rf)})),
    only_left_unmapped: [...l].filter(n => !mappedLeft.has(n)).sort(),
    only_right_unmapped: [...r].filter(n => !mappedRight.has(n)).sort()
  };
}

// The verdict from owner-approved thresholds. Every threshold must be given; a missing one, too few matched matches with
// live data on both sides, missing samples or metrics that are not comparable give INSUFFICIENT EVIDENCE with reasons.
export const THRESHOLD_KEYS = Object.freeze(['min_matched_matches', 'max_median_interval_ms', 'max_gap_ratio', 'max_median_sighting_delay_ms']);
export function verdict(report, thresholds) {
  const reasons = [];
  const t = thresholds && typeof thresholds === 'object' && !Array.isArray(thresholds) ? thresholds : {};
  for (const k of THRESHOLD_KEYS) if (!(typeof t[k] === 'number' && Number.isFinite(t[k]) && t[k] >= 0)) reasons.push(`threshold ${k} not approved`);
  if (reasons.length) return {verdict: 'INSUFFICIENT EVIDENCE', reasons};
  const c = report.candidate, r = report.reference;
  const both = report.matched_with_data ?? 0;
  if (both < t.min_matched_matches) reasons.push(`${both} matched matches with live data on both sides, fewer than ${t.min_matched_matches}`);
  if (!r || r.snapshots === 0) reasons.push('no reference (API-FOOTBALL) live data on the matched matches');
  if (c.interval_ms.median === null) reasons.push('no interval samples');
  if (c.sighting_delay_ms.median === null) reasons.push('no sighting delay samples');
  if (r && c.deduplicated !== r.deduplicated) reasons.push(`intervals not comparable: candidate deduplicated=${c.deduplicated}, reference deduplicated=${r.deduplicated}`);
  if (reasons.length) return {verdict: 'INSUFFICIENT EVIDENCE', reasons};
  const gapRatio = c.gaps.count / c.interval_ms.samples;
  const fails = [];
  if (c.interval_ms.median > t.max_median_interval_ms) fails.push(`median interval ${c.interval_ms.median} ms > ${t.max_median_interval_ms}`);
  if (gapRatio > t.max_gap_ratio) fails.push(`gap ratio ${gapRatio.toFixed(4)} > ${t.max_gap_ratio}`);
  if (c.sighting_delay_ms.median > t.max_median_sighting_delay_ms) fails.push(`median sighting delay ${c.sighting_delay_ms.median} ms > ${t.max_median_sighting_delay_ms}`);
  return fails.length ? {verdict: 'DROP', reasons: fails} : {verdict: 'KEEP', reasons: ['every approved threshold met']};
}

const hasSnapshots = s => (s.snapshots ?? []).some(x => instant(x.acquired_at) !== null);

// The full report: matching, metrics of the candidate (TotalCorner) and of the reference (API-FOOTBALL) on the matched
// matches only, unique fields through the mapping, and the verdict.
export function benchmarkReport({candidate, reference, mapping = {}, thresholds = null, options = {}}) {
  for (const [side, list] of [['candidate', candidate], ['reference', reference]]) {
    if (!Array.isArray(list) || list.some(s => !s || typeof s !== 'object' || !s.match || typeof s.match !== 'object')) throw new TypeError(`${side} must be a list of series with a match`);
  }
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new TypeError('mapping must be an object');
  const matching = matchFixtures(candidate.map(s => s.match), reference.map(s => s.match), options);
  const byId = list => new Map(list.map(s => [s.match.id, s]));
  const cs = byId(candidate), rs = byId(reference);
  const leftIds = new Set(matching.verified.map(v => v.left));
  const rightIds = new Set(matching.verified.map(v => v.right));
  const matched_with_data = matching.verified.filter(v => hasSnapshots(cs.get(v.left)) && hasSnapshots(rs.get(v.right))).length;
  const c = providerMetrics(candidate.filter(s => leftIds.has(s.match.id)), options);
  const r = providerMetrics(reference.filter(s => rightIds.has(s.match.id)), options);
  const report = {version: BENCHMARK_VERSION, matching, matched_with_data, candidate: c, reference: r, unique_fields: uniqueFields(c, r, mapping)};
  return {...report, result: verdict(report, thresholds)};
}
