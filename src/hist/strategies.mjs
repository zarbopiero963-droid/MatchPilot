// HIST-01a: strategies of the offline backtest engine. A strategy is a pure function of the decision view of one event
// (teams, kickoff, decision time and the admitted 1X2 prices) and returns {action: 'BACK', selection} or
// {action: 'NO_TRADE', reason}. It never sees an outcome, and it cannot choose a price: the engine takes the price of
// the chosen selection from the same view.
import {Decimal} from '../math/decimal.mjs';
import {SELECTIONS_1X2} from './contract.mjs';

// mp-ref-fav-back-1 (MP-OWNER-HIST-01A-01): a technical test oracle, authorized only for offline tests, never for real
// trading. BACK the 1X2 favourite: the selection with the lowest admitted price among home, draw and away. Without all
// three prices, or with a tie for the lowest, there is no trade.
export function refFavouriteBack(view) {
  const present = SELECTIONS_1X2.filter(selection => Object.hasOwn(view.odds, selection));
  if (present.length === 0) return {action: 'NO_TRADE', reason: 'NO_ADMISSIBLE_ODDS'};
  if (present.length < SELECTIONS_1X2.length) return {action: 'NO_TRADE', reason: 'INCOMPLETE_1X2'};
  const prices = SELECTIONS_1X2.map(selection => ({selection, price: Decimal.from(view.odds[selection].odds)}));
  const lowest = prices.reduce((a, b) => (b.price.lt(a.price) ? b : a));
  if (prices.filter(entry => entry.price.eq(lowest.price)).length > 1) return {action: 'NO_TRADE', reason: 'FAVOURITE_TIE'};
  return {action: 'BACK', selection: lowest.selection};
}

export const STRATEGIES = Object.freeze({
  'mp-ref-fav-back-1': refFavouriteBack,
});
