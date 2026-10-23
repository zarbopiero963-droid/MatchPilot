// HIST-01a: strategies of the offline backtest engine. A strategy is a pure function of the decision view of one event
// (teams, kickoff, decision time and the admitted 1X2 prices) and returns {action: 'BACK' | 'LAY', selection} or
// {action: 'NO_TRADE', reason} (LAY since HIST-LAY-01). It never sees an outcome, and it cannot choose a price: the engine takes the price of
// the chosen selection from the same view.
import {Decimal} from '../math/decimal.mjs';
import {SELECTIONS_1X2} from './contract.mjs';

// mp-ref-fav-back-1 (MP-OWNER-HIST-01A-01): a technical test oracle, authorized only for offline tests, never for real
// trading. BACK the 1X2 favourite: the selection with the lowest admitted price among home, draw and away. Without all
// three prices, or with a tie for the lowest, there is no trade.
function favourite(view) {
  const present = SELECTIONS_1X2.filter(selection => Object.hasOwn(view.odds, selection));
  if (present.length === 0) return {reason: 'NO_ADMISSIBLE_ODDS'};
  if (present.length < SELECTIONS_1X2.length) return {reason: 'INCOMPLETE_1X2'};
  const prices = SELECTIONS_1X2.map(selection => ({selection, price: Decimal.from(view.odds[selection].odds)}));
  const lowest = prices.reduce((a, b) => (b.price.lt(a.price) ? b : a));
  if (prices.filter(entry => entry.price.eq(lowest.price)).length > 1) return {reason: 'FAVOURITE_TIE'};
  return {selection: lowest.selection};
}
export function refFavouriteBack(view) {
  const {selection, reason} = favourite(view);
  return selection ? {action: 'BACK', selection} : {action: 'NO_TRADE', reason};
}
// mp-ref-fav-lay-1 (HIST-LAY-01): the LAY counterpart of the same oracle, with the same no-trade rules. A technical test
// oracle for the LAY path, authorized only for offline tests, never for real trading.
export function refFavouriteLay(view) {
  const {selection, reason} = favourite(view);
  return selection ? {action: 'LAY', selection} : {action: 'NO_TRADE', reason};
}

export const STRATEGIES = Object.freeze({
  'mp-ref-fav-back-1': refFavouriteBack,
  'mp-ref-fav-lay-1': refFavouriteLay,
});
