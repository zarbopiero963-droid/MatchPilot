// MP-MARKET-REF-01 (MP-PRODUCT-100 D.2, MP-CAP-02, #263): a pure parser from a provider's market and selection to a
// MatchPilot market reference. Built on the formats really observed in the API-FOOTBALL verification of 2026-11-01
// (docs/product/mp-263/api-football-verification-2026-11-01.md):
// - pre-match /odds: stable bet id and name, but the line and the side are written inside the selection text
//   ("Home -1.25", "Over 2.5", "1:0", "Home/Draw");
// - in-play /odds/live: different bet ids, a structured {value, handicap} pair and the suspended/main flags.
// The parser never guesses: a market or a selection it does not recognise with certainty is UNCLASSIFIED, keeping the
// raw text, so markets with similar names are never merged. Where a #100 settlement rule exists the reference uses its
// market_type and selection vocabulary (src/markets/rules.mjs) and says settleable: true; other recognised markets get
// an explicit market_type with settleable: false until #100 approves their rule.
import { validateMarketSpec } from './rules.mjs';

export const MARKET_REF_VERSION = 'mp-market-ref-1';

const LINE = '([+-]?\\d+(?:\\.\\d+)?)';
const sideOf = word => ({home: 'HOME', away: 'AWAY', draw: 'DRAW', '1': 'HOME', x: 'DRAW', '2': 'AWAY'})[String(word).toLowerCase()] ?? null;
const ouOf = word => ({over: 'OVER', under: 'UNDER', exactly: 'EXACTLY'})[String(word).toLowerCase()] ?? null;
const yesNo = word => ({yes: 'YES', no: 'NO'})[String(word).toLowerCase()] ?? null;
// A goal or count line kept as the provider's decimal text, normalised ("2.50" -> "2.5", "+0" -> "0"): never a float.
function lineText(raw) {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(String(raw).trim());
  if (!m) return null;
  const frac = (m[3] ?? '').replace(/0+$/, '');
  const body = frac ? `${Number(m[2])}.${frac}` : String(Number(m[2]));
  return body === '0' ? '0' : `${m[1] === '-' ? '-' : ''}${body}`;
}

// Selection parsers. Each returns {selection, line?, team?} or null when the text is not recognised.
const P = {
  side3: v => (sideOf(v) ? {selection: sideOf(v)} : null),
  side2: v => (['HOME', 'AWAY'].includes(sideOf(v)) ? {selection: sideOf(v)} : null),
  yesNo: v => (yesNo(v) ? {selection: yesNo(v)} : null),
  oddEven: v => ({odd: {selection: 'ODD'}, even: {selection: 'EVEN'}})[String(v).toLowerCase()] ?? null,
  // "Over 2.5", "Under 10.5"
  overUnder: v => { const m = new RegExp(`^(Over|Under)\\s+${LINE}$`, 'i').exec(String(v).trim()); return m && lineText(m[2]) !== null ? {selection: ouOf(m[1]), line: lineText(m[2])} : null; },
  // "Home -1.25", "Away +0.5", "Draw -1" (European handicap has a Draw side)
  handicap: v => { const m = new RegExp(`^(Home|Away|Draw)\\s+${LINE}$`, 'i').exec(String(v).trim()); return m && lineText(m[2]) !== null ? {selection: sideOf(m[1]), line: lineText(m[2])} : null; },
  // "Home/Draw", "Home/Away", "Draw/Away"
  // pre-match "Home/Draw", in-play "Away or Draw": the pair is ordered HOME, DRAW, AWAY whatever the provider order
  doubleChance: v => {
    const m = /^(Home|Draw|Away)\s*(?:\/|\s+or\s+)\s*(Home|Draw|Away)$/i.exec(String(v).trim());
    if (!m) return null;
    const order = {HOME: 0, DRAW: 1, AWAY: 2};
    const pair = [sideOf(m[1]), sideOf(m[2])].sort((a, b) => order[a] - order[b]);
    const key = {'HOME,DRAW': 'HOME_DRAW', 'HOME,AWAY': 'HOME_AWAY', 'DRAW,AWAY': 'DRAW_AWAY'}[pair.join(',')];
    return key ? {selection: key} : null;
  },
  // "1:0" -> "1-0", the Correct Score vocabulary of #100
  score: v => { const m = /^(\d{1,2})[:-](\d{1,2})$/.exec(String(v).trim()); return m ? {selection: `${Number(m[1])}-${Number(m[2])}`} : null; },
  // "Home/Draw" for HT/FT: two sides, first half then full time
  htft: v => { const m = /^(Home|Draw|Away)\/(Home|Draw|Away)$/i.exec(String(v).trim()); return m ? {selection: `${sideOf(m[1])}/${sideOf(m[2])}`} : null; }
};

// Explicit tables. The key is the provider's own bet id: a name alone never identifies a market (pre-match and in-play
// ids differ, names repeat with small changes). period: FT, 1H, 2H. team: HOME/AWAY when the market is about one team.
const def = (market_type, period, parse, extra = {}) => Object.freeze({market_type, period, parse, ...extra});
export const APIFOOTBALL_PREMATCH = Object.freeze({
  1: def('MATCH_ODDS', 'FT', P.side3),
  2: def('HOME_AWAY', 'FT', P.side2),
  3: def('MATCH_ODDS_2H', '2H', P.side3),
  4: def('ASIAN_HANDICAP', 'FT', P.handicap),
  5: def('OVER_UNDER', 'FT', P.overUnder),
  6: def('HT_OVER_UNDER', '1H', P.overUnder),
  7: def('HT_FT', 'FT', P.htft),
  8: def('BTTS', 'FT', P.yesNo),
  9: def('EUROPEAN_HANDICAP', 'FT', P.handicap),
  10: def('CORRECT_SCORE', 'FT', P.score),
  12: def('DOUBLE_CHANCE', 'FT', P.doubleChance),
  13: def('HT_MATCH_ODDS', '1H', P.side3),
  16: def('TEAM_GOALS_OVER_UNDER', 'FT', P.overUnder, {team: 'HOME'}),
  17: def('TEAM_GOALS_OVER_UNDER', 'FT', P.overUnder, {team: 'AWAY'}),
  19: def('ASIAN_HANDICAP_1H', '1H', P.handicap),
  21: def('ODD_EVEN', 'FT', P.oddEven),
  26: def('OVER_UNDER_2H', '2H', P.overUnder),
  31: def('CORRECT_SCORE_1H', '1H', P.score),
  45: def('CORNERS_OVER_UNDER', 'FT', P.overUnder),
  // Goal Line carries whole and quarter lines (1.75, 2.25): a market of its own, never merged with Goals Over/Under (5)
  50: def('GOAL_LINE', 'FT', P.overUnder),
  80: def('CARDS_OVER_UNDER', 'FT', P.overUnder)
});
// In-play: the line comes in the handicap field, the side in value.
const liveOU = (value, handicap) => (ouOf(value) && ouOf(value) !== 'EXACTLY' && lineText(handicap) !== null ? {selection: ouOf(value), line: lineText(handicap)} : null);
const liveOUX = (value, handicap) => (ouOf(value) && lineText(handicap) !== null ? {selection: ouOf(value), line: lineText(handicap)} : null);
const liveSide3 = value => P.side3(value);
const liveAH = (value, handicap) => {
  const side = sideOf(String(value).split(/\s+/)[0]);
  return ['HOME', 'AWAY'].includes(side) && lineText(handicap) !== null ? {selection: side, line: lineText(handicap)} : null;
};
export const APIFOOTBALL_LIVE = Object.freeze({
  59: def('MATCH_ODDS', 'FT', liveSide3),
  36: def('OVER_UNDER', 'FT', liveOU),
  25: def('OVER_UNDER', 'FT', liveOU),
  33: def('ASIAN_HANDICAP', 'FT', liveAH),
  72: def('DOUBLE_CHANCE', 'FT', value => P.doubleChance(value)),
  // 'Draw No Bet' is kept apart from the pre-match 'Home/Away' (2): the two names are not proven to be the same market
  48: def('DRAW_NO_BET', 'FT', value => P.side2(value)),
  23: def('CORRECT_SCORE', 'FT', value => P.score(value)),
  20: def('CORNERS_OVER_UNDER_3WAY', 'FT', liveOUX),
  43: def('BTTS_2H', '2H', value => P.yesNo(value))
});

const TABLES = Object.freeze({'apifootball:prematch': APIFOOTBALL_PREMATCH, 'apifootball:live': APIFOOTBALL_LIVE});
export const SOURCES = Object.freeze(Object.keys(TABLES));

// Settleable only when #100 has a rule that accepts exactly this market, selection, line and team (for example only
// n+0.5 goal lines): a parsed quarter line is a valid reference but not settleable until MARKET-CORE-03.
function settleable({market_type, selection, line, team}) {
  try { validateMarketSpec({marketType: market_type, selection, line: line ?? undefined, team: team ?? undefined}); return true; }
  catch { return false; }
}

// The canonical text of a reference: market_type|period|team|selection|line, with empty parts for what does not apply.
export function marketRefKey(ref) {
  return [ref.market_type, ref.period, ref.team ?? '', ref.selection, ref.line ?? ''].join('|');
}

// Parses one provider selection. input = {source, bet_id, bet_name, value, handicap?}. Returns either
// {status: 'PARSED', market_type, period, team, selection, line, settleable, key, ...} or
// {status: 'UNCLASSIFIED', reason, ...} with the raw provider fields always kept.
export function parseMarketRef({source, bet_id, bet_name = null, value, handicap = null}) {
  const raw = {source, bet_id, bet_name, value, handicap};
  const table = TABLES[source];
  if (!table) return {status: 'UNCLASSIFIED', reason: 'unknown source', raw, version: MARKET_REF_VERSION};
  const spec = table[Number(bet_id)];
  if (!spec || !Number.isInteger(Number(bet_id))) return {status: 'UNCLASSIFIED', reason: 'market not in the explicit table', raw, version: MARKET_REF_VERSION};
  const parsed = spec.parse(value, handicap);
  if (!parsed) return {status: 'UNCLASSIFIED', reason: `selection not recognised for ${spec.market_type}`, raw, version: MARKET_REF_VERSION};
  const ref = {market_type: spec.market_type, period: spec.period, team: spec.team ?? null, selection: parsed.selection, line: parsed.line ?? null};
  return {status: 'PARSED', ...ref, settleable: settleable(ref), key: marketRefKey(ref), raw, version: MARKET_REF_VERSION};
}
