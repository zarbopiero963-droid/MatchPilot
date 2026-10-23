// MARKET-CORE-01/02/04 (#100, #104): versioned Market Rules Registry + core football resolvers. Pure, deterministic.
// MatchPilot computes simulated market outcomes itself, from the final score delivered by its two football APIs
// (FutPythonTrader, TotalCorner) and these internal rules; no exchange, bookmaker or external settlement is consulted
// (owner rectification MP-MARKET-CORE-04). A match that is not FINISHED (postponed, suspended, cancelled, unknown) or a
// missing input is UNRESOLVED, never guessed, and #99 must not settle it. No internal VOID rule is approved yet (DEC-015:
// OWNER DECISION REQUIRED), so these resolvers never return VOID. Provider adapters and result versions: outcomes.mjs.
// Dead heat, partial and Asian lines are MARKET-CORE-03.
const fail = (code, msg) => { const e = new Error(msg); e.code = code; throw e; };
export const MARKET_RULES_VERSION = 2; // v2: internal policies, no external source (v1 was never persisted)
const SRC = 'MatchPilot internal simulation rule: settle on the validated final score delivered by the match provider (FutPythonTrader Home_Score/Away_Score, TotalCorner hg/ag)';

const common = Object.freeze({venue: 'MATCHPILOT_SIMULATION', version: MARKET_RULES_VERSION, effective_from: '2026-10-23', effective_to: null,
  void_policy: 'NONE_APPROVED (OWNER DECISION REQUIRED)', postponed_policy: 'UNRESOLVED_UNTIL_FINAL (DEC-015)',
  abandoned_policy: 'UNRESOLVED (DEC-015)', cancelled_policy: 'UNRESOLVED (OWNER DECISION REQUIRED)',
  correction_policy: 'LATEST_VALIDATED_FINAL_FLAGGED (DEC-002)', dead_heat_policy: 'NOT_APPLICABLE',
  extra_time_policy: 'PROVIDER_FINAL_SCORE (extra-time inclusion undocumented by FPT/TC: OWNER DECISION REQUIRED for cup ties)',
  penalty_policy: 'EXCLUDED', partial_policy: 'NOT_APPLICABLE',
  provenance: '#100 MARKET-CORE-02/04', source_reference: SRC, created_at: '2026-10-23T02:15:00+02:00'});
const rule = (market_type, resolution_inputs, result_mapping, extra = {}) =>
  Object.freeze({market_rule_id: `${market_type}@v${MARKET_RULES_VERSION}`, market_type, resolution_inputs: Object.freeze(resolution_inputs), result_mapping, ...common, ...extra});

export const MARKET_RULES = Object.freeze([
  rule('MATCH_ODDS', ['ft_home', 'ft_away'], 'HOME if home>away, DRAW if equal, AWAY if away>home'),
  rule('DOUBLE_CHANCE', ['ft_home', 'ft_away'], 'HOME_DRAW, HOME_AWAY, DRAW_AWAY win when the Match Odds result is in the pair'),
  rule('OVER_UNDER', ['ft_home', 'ft_away', 'line'], 'OVER if total goals > line, else UNDER; line must be n+0.5'),
  rule('BTTS', ['ft_home', 'ft_away'], 'YES if both teams scored at least once, else NO'),
  rule('CORRECT_SCORE', ['ft_home', 'ft_away'], 'selection "h-a" wins on the exact score; ANY_OTHER_HOME/AWAY/DRAW win when the score is not listed'),
  rule('HT_MATCH_ODDS', ['ht_home', 'ht_away'], 'HOME/DRAW/AWAY on the first-half score', {extra_time_policy: 'NOT_APPLICABLE', penalty_policy: 'NOT_APPLICABLE'}),
  rule('HT_OVER_UNDER', ['ht_home', 'ht_away', 'line'], 'OVER/UNDER on first-half goals; line must be n+0.5', {extra_time_policy: 'NOT_APPLICABLE', penalty_policy: 'NOT_APPLICABLE'}),
  rule('TEAM_GOALS_OVER_UNDER', ['ft_home', 'ft_away', 'team', 'line'], 'OVER/UNDER on the goals of team HOME|AWAY; line must be n+0.5'),
]);
export const getMarketRule = type => MARKET_RULES.find(r => r.market_type === type) ?? null;

const goals = (v, f) => { if (!Number.isInteger(v) || v < 0) fail('BAD_INPUT', `${f} must be a non-negative integer`); return v; };
const halfLine = line => {
  const n = Number(line);
  if (typeof line !== 'string' || !/^\d+\.5$/.test(line)) fail('UNSUPPORTED_LINE', `line ${line}: only n+0.5 lines (whole/quarter lines are MARKET-CORE-03)`);
  return n;
};
const mo = (h, a) => (h > a ? 'HOME' : h < a ? 'AWAY' : 'DRAW');
// The Correct Score grid for "any other" (default 0-0..3-3). The simulated market's grid is an input.
export const DEFAULT_CS_GRID = Object.freeze(['0-0', '0-1', '0-2', '0-3', '1-0', '1-1', '1-2', '1-3', '2-0', '2-1', '2-2', '2-3', '3-0', '3-1', '3-2', '3-3']);

// Resolves one selection. match = {status, ft_home, ft_away, ht_home, ht_away}. Returns {status: RESOLVED, outcome:
// WIN|LOSE, market_rule_id, winning_selection} or {status: UNRESOLVED, reason}. Same input + same rule version => same output.
export function resolve({marketType, selection, line, team, match, csGrid = DEFAULT_CS_GRID}) {
  const r = getMarketRule(marketType);
  if (!r) fail('UNKNOWN_MARKET', `no rule for ${marketType}`);
  const base = {market_rule_id: r.market_rule_id, rule_version: r.version};
  if (!match || match.status !== 'FINISHED') return Object.freeze({...base, status: 'UNRESOLVED', reason: `MATCH_STATUS_${match?.status ?? 'MISSING'}`});
  const ht = r.resolution_inputs.includes('ht_home');
  const [hk, ak] = ht ? ['ht_home', 'ht_away'] : ['ft_home', 'ft_away'];
  if (match[hk] === undefined || match[hk] === null || match[ak] === undefined || match[ak] === null)
    return Object.freeze({...base, status: 'UNRESOLVED', reason: `MISSING_${hk.toUpperCase()}_${ak.toUpperCase()}`});
  const h = goals(match[hk], hk), a = goals(match[ak], ak);
  let winners;
  switch (marketType) {
    case 'MATCH_ODDS': case 'HT_MATCH_ODDS': winners = [mo(h, a)]; break;
    case 'DOUBLE_CHANCE': { const m = mo(h, a); winners = ['HOME_DRAW', 'HOME_AWAY', 'DRAW_AWAY'].filter(s => s.split('_').includes(m)); break; }
    case 'OVER_UNDER': case 'HT_OVER_UNDER': winners = [h + a > halfLine(line) ? 'OVER' : 'UNDER']; break;
    case 'TEAM_GOALS_OVER_UNDER': {
      if (team !== 'HOME' && team !== 'AWAY') fail('BAD_INPUT', 'team must be HOME or AWAY');
      winners = [(team === 'HOME' ? h : a) > halfLine(line) ? 'OVER' : 'UNDER']; break;
    }
    case 'BTTS': winners = [h > 0 && a > 0 ? 'YES' : 'NO']; break;
    case 'CORRECT_SCORE': {
      const s = `${h}-${a}`;
      winners = [csGrid.includes(s) ? s : `ANY_OTHER_${mo(h, a)}`]; break;
    }
    default: fail('INTERNAL', marketType);
  }
  if (typeof selection !== 'string' || !selection) fail('BAD_INPUT', 'selection');
  return Object.freeze({...base, status: 'RESOLVED', outcome: winners.includes(selection) ? 'WIN' : 'LOSE', winning_selection: winners.join('|')});
}
