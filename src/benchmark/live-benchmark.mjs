// MP-TC-BENCH-01 (#263, MP-OWNER-IMPL-20261101 "TotalCorner"): the LIVE benchmark of TotalCorner against API-FOOTBALL as
// pure, reproducible functions. It reads only what the caller passes (exports of already archived data); it calls no
// provider and starts no collector. The protocol is docs/product/mp-263/README.md, section 3.
//
// Input per provider: normalized series, one per match, built by an adapter from archived rows:
//   {provider, match: {id, league, kickoff, home, away}, snapshots: [{acquired_at, minute, fields: {name: value}}],
//    events: [{type, minute, acquired_at}], requests?: {calls, errors, empty}}
// Every number in the report is derived from those rows; nothing is estimated.
//
// Verdict: KEEP / DROP / INSUFFICIENT EVIDENCE. Thresholds are an input the owner approves; without them, or without
// enough matched matches, the verdict is INSUFFICIENT EVIDENCE. Fields of the two providers are compared only through
// an explicit mapping passed in (never guessed from names).

export const BENCHMARK_VERSION = 'mp-live-bench-1';
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const instant = v => (typeof v === 'string' && ISO_WITH_OFFSET.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);

// Team name for matching: lowercase, accents removed, punctuation and common club tokens dropped.
export function normalizeTeam(name) {
  return String(name ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !['fc', 'cf', 'ac', 'sc', 'afc', 'calcio', 'club'].includes(t)).join(' ');
}

// Matches the two providers' matches: same normalized home and away teams and kickoff within the tolerance. Only a
// pair that is the unique candidate on both sides is VERIFIED; everything else is reported, never forced.
export function matchFixtures(left, right, {kickoffToleranceMs = 15 * 60000} = {}) {
  const key = m => `${normalizeTeam(m.home)}|${normalizeTeam(m.away)}`;
  const candidates = (m, pool) => pool.filter(o => key(o) === key(m) && key(m) !== '|'
    && instant(o.kickoff) !== null && instant(m.kickoff) !== null && Math.abs(instant(o.kickoff) - instant(m.kickoff)) <= kickoffToleranceMs);
  const verified = [];
  const ambiguous = [];
  for (const l of left) {
    const c = candidates(l, right);
    if (c.length === 1 && candidates(c[0], left).length === 1) verified.push({left: l.id, right: c[0].id});
    else if (c.length > 1) ambiguous.push({left: l.id, candidates: c.map(r => r.id)});
  }
  const matchedLeft = new Set(verified.map(v => v.left));
  const matchedRight = new Set(verified.map(v => v.right));
  return {
    verified, ambiguous,
    unmatched_left: left.filter(m => !matchedLeft.has(m.id)).map(m => m.id),
    unmatched_right: right.filter(m => !matchedRight.has(m.id)).map(m => m.id)
  };
}

const quantile = (sorted, q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))] : null);
const present = v => v !== null && v !== undefined && v !== '';

// Metrics of one provider over the given series (already restricted to the matched matches).
export function providerMetrics(series, {gapMs = 5 * 60000} = {}) {
  const leagues = new Set(series.map(s => String(s.match?.league ?? '')));
  const fieldCount = new Map();
  let snapshots = 0;
  const intervals = [];
  let gaps = 0;
  const latencies = [];
  let unreadable = 0;
  const requests = {calls: 0, errors: 0, empty: 0};
  for (const s of series) {
    const times = [];
    for (const snap of s.snapshots ?? []) {
      const at = instant(snap.acquired_at);
      if (at === null) { unreadable += 1; continue; }
      snapshots += 1;
      times.push(at);
      for (const [name, value] of Object.entries(snap.fields ?? {})) {
        const c = fieldCount.get(name) ?? {present: 0};
        if (present(value)) c.present += 1;
        fieldCount.set(name, c);
      }
    }
    times.sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1]);
      if (times[i] - times[i - 1] > gapMs) gaps += 1;
    }
    // Latency: acquisition time of an event minus its nominal time (kickoff + minute). The minute has a one-minute
    // resolution and ignores added time and the half-time break, so first-half events only, and a lower bound.
    const kickoff = instant(s.match?.kickoff);
    for (const e of s.events ?? []) {
      const at = instant(e.acquired_at);
      const minute = Number.parseInt(String(e.minute ?? ''), 10);
      if (kickoff === null || at === null || !Number.isInteger(minute) || minute < 0 || minute > 45) continue;
      latencies.push(at - (kickoff + minute * 60000));
    }
    for (const k of Object.keys(requests)) requests[k] += Number.isSafeInteger(s.requests?.[k]) ? s.requests[k] : 0;
  }
  intervals.sort((a, b) => a - b);
  latencies.sort((a, b) => a - b);
  const fields = Object.fromEntries([...fieldCount.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, c]) => [name, {present: c.present, missing_ratio: snapshots ? Number(((snapshots - c.present) / snapshots).toFixed(4)) : null}]));
  return {
    matches: series.length, leagues: leagues.size, snapshots, unreadable_snapshots: unreadable,
    fields,
    freshness_ms: {median: quantile(intervals, 0.5), p90: quantile(intervals, 0.9), samples: intervals.length},
    gaps: {count: gaps, threshold_ms: gapMs},
    latency_ms: {median: quantile(latencies, 0.5), p90: quantile(latencies, 0.9), samples: latencies.length,
      note: 'first-half events only; minute resolution: a lower bound, not an exact delay'},
    requests
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

// The verdict from owner-approved thresholds. Every threshold must be given; a missing one, too few matched matches or
// missing data give INSUFFICIENT EVIDENCE with the reasons.
export const THRESHOLD_KEYS = Object.freeze(['min_matched_matches', 'max_median_freshness_ms', 'max_gap_ratio', 'max_median_latency_ms']);
export function verdict(report, thresholds) {
  const reasons = [];
  const t = thresholds ?? {};
  for (const k of THRESHOLD_KEYS) if (!(typeof t[k] === 'number' && Number.isFinite(t[k]) && t[k] >= 0)) reasons.push(`threshold ${k} not approved`);
  if (reasons.length) return {verdict: 'INSUFFICIENT EVIDENCE', reasons};
  const m = report.candidate;
  if (report.matching.verified.length < t.min_matched_matches) reasons.push(`${report.matching.verified.length} matched matches, fewer than ${t.min_matched_matches}`);
  if (m.freshness_ms.median === null) reasons.push('no freshness samples');
  if (m.latency_ms.median === null) reasons.push('no latency samples');
  if (reasons.length) return {verdict: 'INSUFFICIENT EVIDENCE', reasons};
  const gapRatio = m.freshness_ms.samples ? m.gaps.count / m.freshness_ms.samples : 1;
  const fails = [];
  if (m.freshness_ms.median > t.max_median_freshness_ms) fails.push(`median freshness ${m.freshness_ms.median} ms > ${t.max_median_freshness_ms}`);
  if (gapRatio > t.max_gap_ratio) fails.push(`gap ratio ${gapRatio.toFixed(4)} > ${t.max_gap_ratio}`);
  if (m.latency_ms.median > t.max_median_latency_ms) fails.push(`median latency ${m.latency_ms.median} ms > ${t.max_median_latency_ms}`);
  return fails.length ? {verdict: 'DROP', reasons: fails} : {verdict: 'KEEP', reasons: ['every approved threshold met']};
}

// The full report: matching, metrics of the candidate (TotalCorner) and of the reference (API-FOOTBALL) on the matched
// matches only, unique fields through the mapping, and the verdict.
export function benchmarkReport({candidate, reference, mapping = {}, thresholds = null, options = {}}) {
  const matching = matchFixtures(candidate.map(s => s.match), reference.map(s => s.match), options);
  const leftIds = new Set(matching.verified.map(v => v.left));
  const rightIds = new Set(matching.verified.map(v => v.right));
  const c = providerMetrics(candidate.filter(s => leftIds.has(s.match.id)), options);
  const r = providerMetrics(reference.filter(s => rightIds.has(s.match.id)), options);
  const report = {version: BENCHMARK_VERSION, matching, candidate: c, reference: r, unique_fields: uniqueFields(c, r, mapping)};
  return {...report, result: verdict(report, thresholds)};
}
