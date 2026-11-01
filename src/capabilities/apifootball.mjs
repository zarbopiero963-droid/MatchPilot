// MP-CAP-01b (#263, MP-OWNER-IMPL-20261101 item 2): the API-FOOTBALL capabilities really observed in the verification of
// 2026-11-01 (docs/product/mp-263/api-football-verification-2026-11-01.md), as catalog entries. Only what a real call
// returned is listed; nothing comes from the provider documentation alone. No collector stores these data yet, so the
// status is AVAILABLE BUT NOT IMPLEMENTED, never AVAILABLE AND IMPLEMENTED, and nothing claims 100% coverage: the sample
// was 20 calls on two competitions.
import { capabilityId, OPERATORS_BY_TYPE } from './catalog.mjs';
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
      ...(normalisation ? [normalisation] : [])]
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
      'line and side parsed from the selection text by market_ref; unrecognised selections stay UNCLASSIFIED']
  };
}

// In-play markets are observed but not catalogued: MP-PIT-TIMING-01 has no class for a price known only during the
// match, and a market entry would read as pre-match. They are listed apart, with the reason, until a live class exists.
export function apiFootballDeferred() {
  return Object.entries(APIFOOTBALL_LIVE).map(([betId, spec]) => ({
    provider: 'apifootball', provider_ref: `odds/live/bet:${betId}`, market_type: spec.market_type, phases: ['LIVE'],
    reason: 'in-play price: no MP-PIT-TIMING-01 class for data known only during the match',
    evidence: [`${VERIFICATION_DOC}: /odds/live on an in-play match`]
  }));
}

export function apiFootballCapabilities() {
  return [
    ...STATISTICS.map(statisticCapability),
    ...Object.entries(APIFOOTBALL_PREMATCH).map(([betId, spec]) => prematchMarketCapability(betId, spec))
  ];
}
