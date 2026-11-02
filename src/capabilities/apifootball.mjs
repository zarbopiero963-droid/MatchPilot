// MP-CAP-01b (#263, MP-OWNER-IMPL-20261101 item 2): the API-FOOTBALL capabilities really observed in the verification of
// 2026-11-01 (docs/product/mp-263/api-football-verification-2026-11-01.md), as catalog entries. Only what a real call
// returned is listed; nothing comes from the provider documentation alone. No collector stores these data yet, so the
// status is AVAILABLE BUT NOT IMPLEMENTED, never AVAILABLE AND IMPLEMENTED, and nothing claims 100% coverage: the sample
// was 20 calls on two competitions.
import { capabilityId, LIVE_TIMING, OPERATORS_BY_TYPE } from './catalog.mjs';
import { APIFOOTBALL_LIVE, APIFOOTBALL_PREMATCH } from '../markets/market-ref.mjs';

export const VERIFICATION_DOC = 'docs/product/mp-263/api-football-verification-2026-11-01.md';
const COMMON_LIMITS = [
  'observed on a 20-call sample (Premier League, Serie A) on 2026-11-01: not a certified coverage',
  'no collector yet: MatchPilot does not store this data'
];

// The 17 statistic types returned by /fixtures/statistics, identical after the match and in play. Values arrive as
// integers, as decimal text ("1.87") or as a percentage text ("45%"): unit and normalisation are declared here.
const STATISTICS = [
  ['expected_goals', 'number', null, 'decimal text normalised to a number'],
  ['Shots on Goal', 'integer'], ['Shots off Goal', 'integer'], ['Total Shots', 'integer'], ['Blocked Shots', 'integer'],
  ['Shots insidebox', 'integer'], ['Shots outsidebox', 'integer'], ['Fouls', 'integer'], ['Corner Kicks', 'integer'],
  ['Offsides', 'integer'], ['Ball Possession', 'number', 'percent', 'percentage text ("45%") normalised to a number'],
  ['Yellow Cards', 'integer'], ['Red Cards', 'integer'], ['Goalkeeper Saves', 'integer'], ['Total passes', 'integer'],
  ['Passes accurate', 'integer']
];
// The verification report counts 17 types per team but names these 16: only the named ones are listed. The passes
// percentage is absent from the provider answer.

function statisticCapability([ref, valueType, unit = null, normalisation = null]) {
  return {
    id: capabilityId('apifootball', 'statistic', ref), provider: 'apifootball', kind: 'statistic', provider_ref: ref,
    value_type: valueType, unit, operators: [...OPERATORS_BY_TYPE[valueType]], timing: 'POSTMATCH_OUTCOME', coverage: null,
    status: 'AVAILABLE BUT NOT IMPLEMENTED', phases: ['HISTORICAL', 'LIVE'],
    provenance: {source: 'api-football verification 2026-11-01', evidence: [`${VERIFICATION_DOC}: /fixtures/statistics on a finished and on an in-play match`]},
    limits: [...COMMON_LIMITS, 'no provider timestamp: a value is known from MatchPilot acquisition time (mp-pit-v1)',
      'historical depth follows the per-season coverage flags (statistics from 2014 in the Premier League sample)',
      normalisation ?? 'value type as observed in the 2026-11-01 sample (integer or numeric text); other forms stay unnormalised']
  };
}

// Pre-match markets: the bet ids of the explicit market_ref table, each parsed from the selection text. The value is a
// decimal price. The provider declares no odds for past seasons (odds:false flag, not tested with a call): the
// history is the one MatchPilot builds from its own snapshots, never a provider history.
function prematchMarketCapability(betId, spec) {
  const ref = `odds/bet:${betId}`;
  return {
    id: capabilityId('apifootball', 'market', ref), provider: 'apifootball', kind: 'market', provider_ref: ref,
    market_type: spec.market_type, period: spec.period, team: spec.team ?? null,
    value_type: 'number', unit: 'decimal_odds', operators: [...OPERATORS_BY_TYPE.number], timing: 'PREMATCH_MARKET_UNTIMED', coverage: null,
    status: 'AVAILABLE BUT NOT IMPLEMENTED', phases: ['PREMATCH'],
    provenance: {source: 'api-football verification 2026-11-01', evidence: [`${VERIFICATION_DOC}: /odds on a not-started match (bookmaker 8)`]},
    limits: [...COMMON_LIMITS, 'odds history not guaranteed by the provider: MatchPilot snapshots from acquisition time on',
      'one provider update per fixture observed: not a certain closing price',
      'line and side parsed from the selection text by market_ref; unrecognised selections stay UNCLASSIFIED',
      'bet id from the market_ref table, built on the 2026-11-01 /odds answer; the verification report counts the markets, it does not list each id']
  };
}

// In-play markets (MP-PIT-LIVE-01): timing LIVE_ACQUIRED, offered in play only. A price is usable only from the instant
// MatchPilot acquired it (src/pit/phase.mjs), never by a decision taken before kickoff, and never to rebuild a moment that
// was not observed. In-play ids differ from the pre-match ones: an in-play market is a separate capability, never the
// same entry as a pre-match bet id.
function liveMarketCapability(betId, spec) {
  const ref = `odds/live/bet:${betId}`;
  return {
    id: capabilityId('apifootball', 'market', ref), provider: 'apifootball', kind: 'market', provider_ref: ref,
    market_type: spec.market_type, period: spec.period, team: spec.team ?? null,
    value_type: 'number', unit: 'decimal_odds', operators: [...OPERATORS_BY_TYPE.number], timing: LIVE_TIMING, coverage: null,
    status: 'AVAILABLE BUT NOT IMPLEMENTED', phases: ['LIVE'],
    provenance: {source: 'api-football verification 2026-11-01', evidence: [`${VERIFICATION_DOC}: /odds/live on an in-play match`]},
    limits: [...COMMON_LIMITS, 'usable only from MatchPilot acquisition time (mp-pit-live-1); never in a decision before kickoff',
      'no bookmaker named by the provider; suspended selections are flagged by the provider and are not prices',
      'line from the structured handicap field, parsed by market_ref; unrecognised selections stay UNCLASSIFIED',
      'bet id from the market_ref table, built on the 2026-11-01 /odds/live answer; the verification report counts the markets, it does not list each id']
  };
}

// Nothing is deferred any more: kept for the API contract (an empty list).
export function apiFootballDeferred() {
  return [];
}

export function apiFootballCapabilities() {
  return [
    ...STATISTICS.map(statisticCapability),
    ...Object.entries(APIFOOTBALL_PREMATCH).map(([betId, spec]) => prematchMarketCapability(betId, spec)),
    ...Object.entries(APIFOOTBALL_LIVE).map(([betId, spec]) => liveMarketCapability(betId, spec))
  ];
}
