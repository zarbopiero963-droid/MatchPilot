// MARKET-CORE-04 (#100): result versions and corrections, applied as DEC-002 states. Pure and deterministic.
// The outcome used is the latest validated FINAL version available at the run time (asOf). It carries its version,
// provenance and correction timestamp, and is flagged when it differs from the first validated FINAL. Only the final
// outcome is versioned here: strategy features stay point-in-time (HIST-01a). Settled positions are corrected by #99
// (correctSettlement), and the MM sequence records a correction without advancing again (DEC-013).
// Inputs come only from MatchPilot's two football APIs, through the adapters below; versions of different providers are
// never mixed (no verified match-level FPT<->TC mapping exists).
import {resolve} from './rules.mjs';

const fail = (code, msg) => { const e = new Error(msg); e.code = code; throw e; };
const SCORE_FIELDS = ['status', 'ft_home', 'ft_away', 'ht_home', 'ht_away'];
const sameScore = (a, b) => SCORE_FIELDS.every(f => (a[f] ?? null) === (b[f] ?? null));
const time = (v, f) => { const t = Date.parse(v); if (typeof v !== 'string' || Number.isNaN(t)) fail('BAD_INPUT', `${f} must be an ISO timestamp`); return t; };
const PROVIDERS = new Set(['futpythontrader', 'totalcorner']);
// A goal count as delivered: a non-negative integer or its decimal text; anything else is not a validated score.
const goalsOf = v => (Number.isInteger(v) && v >= 0 ? v : typeof v === 'string' && /^\d{1,3}$/.test(v) ? Number(v) : null);
const versionOf = ({provider, version, acquired_at, provenance, final, home, away, providerStatus}) => {
  const h = goalsOf(home), a = goalsOf(away);
  const validated = final && h !== null && a !== null;
  return Object.freeze({provider, version, kind: final ? 'FINAL' : 'NOT_FINAL', validated, recorded_at: acquired_at, provenance,
    provider_status: providerStatus, match: Object.freeze(validated ? {status: 'FINISHED', ft_home: h, ft_away: a} : {status: 'NOT_FINISHED'})});
};

// FutPythonTrader has no status field: MatchPilot derives FINAL when both Home_Score and Away_Score are present
// (fpt_match_facts.status FINAL / NO_RESULT / NOT_STARTED). No half-time score is delivered, so HT markets stay UNRESOLVED.
export function fromFutPythonTrader({version, status, home_score, away_score, acquired_at, snapshot_id}) {
  return versionOf({provider: 'futpythontrader', version, acquired_at, provenance: `futpythontrader:snapshot:${snapshot_id}`,
    final: status === 'FINAL', home: home_score, away: away_score, providerStatus: status ?? null});
}

// TotalCorner: only the provider's own status "full" is a final result; null, minutes, "half" and any other value are
// not. "FT" is written by MatchPilot's terminal capture, not by TotalCorner, so it is not accepted as a final status.
export function fromTotalCorner({version, status, hg, ag, acquired_at, raw_id}) {
  return versionOf({provider: 'totalcorner', version, acquired_at, provenance: `totalcorner:raw:${raw_id}`,
    final: status === 'full', home: hg, away: ag, providerStatus: status ?? null});
}

// versions: [{version, kind: 'FINAL'|'PROVISIONAL', validated, recorded_at, provenance, match: {status, ft_home, ...}}].
// Returns {status: 'SELECTED', match, outcome_version, ...} or {status: 'NO_FINAL'}: never a guessed or future version.
export function selectOutcome(versions, {asOf}) {
  if (!Array.isArray(versions)) fail('BAD_INPUT', 'versions must be an array');
  const cutoff = time(asOf, 'asOf');
  const seen = new Map();
  const providers = new Set(versions.map(v => v?.provider));
  if (providers.size > 1) fail('MIXED_PROVIDERS', `versions from ${[...providers].join(', ')}: providers are never mixed`);
  for (const v of versions) {
    if (!PROVIDERS.has(v?.provider)) fail('BAD_INPUT', `unknown provider ${v?.provider}`);
    if (!Number.isInteger(v?.version) || v.version < 1) fail('BAD_INPUT', 'version must be a positive integer');
    time(v.recorded_at, 'recorded_at');
    const prior = seen.get(v.version);
    if (prior && JSON.stringify(prior) !== JSON.stringify(v)) fail('CONFLICTING_VERSION', `version ${v.version} recorded twice with different content`);
    seen.set(v.version, v);
  }
  // A later version is a later acquisition: a higher number recorded earlier would make a stale record "latest".
  const ordered = [...seen.values()].sort((a, b) => a.version - b.version);
  for (let i = 1; i < ordered.length; i++) if (Date.parse(ordered[i].recorded_at) < Date.parse(ordered[i - 1].recorded_at))
    fail('NON_MONOTONIC_VERSION', `version ${ordered[i].version} recorded before version ${ordered[i - 1].version}`);
  const finals = [...seen.values()]
    .filter(v => v.kind === 'FINAL' && v.validated === true && Date.parse(v.recorded_at) <= cutoff)
    .sort((a, b) => a.version - b.version);
  if (!finals.length) return Object.freeze({status: 'NO_FINAL', as_of: asOf});
  const first = finals[0], latest = finals.at(-1);
  if (typeof latest.provenance !== 'string' || !latest.provenance) fail('BAD_INPUT', `version ${latest.version} has no provenance`);
  const corrected = !sameScore(first.match ?? {}, latest.match ?? {});
  return Object.freeze({status: 'SELECTED', as_of: asOf, provider: latest.provider, match: Object.freeze({...latest.match}), outcome_version: latest.version,
    provenance: latest.provenance, recorded_at: latest.recorded_at, first_final_version: first.version, corrected,
    correction_timestamp: corrected ? latest.recorded_at : null});
}

// Resolves one selection on the selected outcome version. When the outcome was corrected, the resolution under the first
// FINAL is reported too, so a report can show whether the correction changed this selection.
export function resolveVersioned({versions, asOf, ...selection}) {
  const picked = selectOutcome(versions, {asOf});
  if (picked.status === 'NO_FINAL') return Object.freeze({status: 'UNRESOLVED', reason: 'NO_VALIDATED_FINAL', as_of: asOf});
  const res = resolve({...selection, match: picked.match});
  const out = {...res, provider: picked.provider, outcome_version: picked.outcome_version, provenance: picked.provenance, recorded_at: picked.recorded_at,
    first_final_version: picked.first_final_version, corrected: picked.corrected, correction_timestamp: picked.correction_timestamp, as_of: asOf};
  if (picked.corrected) {
    const first = [...versions].find(v => v.version === picked.first_final_version);
    const before = resolve({...selection, match: first.match});
    out.first_final_outcome = before.status === 'RESOLVED' ? before.outcome : before.status;
    out.outcome_changed = out.first_final_outcome !== (res.status === 'RESOLVED' ? res.outcome : res.status);
  }
  return Object.freeze(out);
}
