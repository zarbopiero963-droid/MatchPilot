// MP-ODDS-SNAP-01 (#263): one API-FOOTBALL /odds answer as pre-match snapshot rows, a pure function. Each row keeps the
// provider ids and texts as they are, the price as decimal text, the market_ref reading, the acquisition instant and
// the hash of the answer it came from. Rows that cannot be a pre-match price are refused, never adjusted:
// - acquired at or after kickoff (data after kickoff never becomes a pre-match price);
// - a provider update at or after kickoff, or later than the acquisition (beyond a 5-minute clock tolerance);
// - a fixture without a kickoff, a price that is not a decimal of at least 1, or a missing id.
import { createHash } from 'node:crypto';
import { MARKET_REF_VERSION, parseMarketRef } from '../../markets/market-ref.mjs';

export const SNAPSHOT_SOURCE = 'apifootball:prematch';
export const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
const ODD_TEXT = /^[0-9]{1,4}(\.[0-9]{1,4})?$/;
// A bound on one answer: beyond it the answer is refused, not partly stored.
export const MAX_ROWS_PER_ANSWER = 20000;
const INT4_MAX = 2147483647;
// An instant is ISO-8601 with an explicit offset: never a bare number or a local time.
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const instant = value => (typeof value === 'string' && ISO_WITH_OFFSET.test(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);

const positiveInt = (value, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number.isSafeInteger(value) ? value : typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : null;
  return n !== null && n > 0 && n <= max ? n : null;
};
// Text is kept as the provider wrote it, but a NUL character cannot be stored: such a row is refused.
const clean = value => typeof value === 'string' && !value.includes('\u0000');
const text = (value, max) => (clean(value) && value.trim() && value.length <= max ? value : null);

function kickoffOf(fixture) {
  if (Number.isSafeInteger(fixture?.timestamp) && fixture.timestamp > 0) return fixture.timestamp * 1000;
  return instant(fixture?.date);
}

// Stable hash of one answer item: JSON with sorted keys, so the same content always has the same hash.
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}
export const payloadSha256 = value => createHash('sha256').update(canonical(value)).digest('hex');

// body: the parsed /odds answer ({response: [...]}) or the client result ({response: [...]}).
// Returns {rows, rejected}; rejected items carry a reason and the provider ids, never a guessed value.
export function oddsSnapshotRows(body, {acquiredAt, requestId = null} = {}) {
  const acquired = acquiredAt instanceof Date ? acquiredAt.getTime() : Date.parse(acquiredAt);
  if (!Number.isFinite(acquired)) throw new TypeError('acquiredAt is required');
  const rows = [];
  const rejected = [];
  const items = Array.isArray(body?.response) ? body.response : [];
  for (const item of items) {
    const fixtureId = positiveInt(item?.fixture?.id);
    const kickoff = kickoffOf(item?.fixture);
    const reject = (reason, extra = {}) => rejected.push({reason, fixture_id: fixtureId, ...extra});
    if (fixtureId === null) { reject('fixture id missing'); continue; }
    if (kickoff === null) { reject('kickoff unknown'); continue; }
    if (acquired >= kickoff) { reject('acquired at or after kickoff: not a pre-match price'); continue; }
    const update = item?.update == null ? null : instant(item.update);
    if (item?.update != null && update === null) { reject('provider update is not an ISO instant with offset'); continue; }
    if (update !== null && update >= kickoff) { reject('provider update at or after kickoff: not a pre-match price'); continue; }
    if (update !== null && update > acquired + CLOCK_TOLERANCE_MS) { reject('provider update later than the acquisition'); continue; }
    const hash = payloadSha256(item);
    for (const bookmaker of Array.isArray(item.bookmakers) ? item.bookmakers : []) {
      const bookmakerId = positiveInt(bookmaker?.id, INT4_MAX);
      if (bookmakerId === null) { reject('bookmaker id missing or out of range'); continue; }
      const bookmakerName = bookmaker.name == null ? '' : String(bookmaker.name);
      if (!clean(bookmakerName) || bookmakerName.length > 200) { reject('bookmaker name not storable', {bookmaker_id: bookmakerId}); continue; }
      for (const bet of Array.isArray(bookmaker.bets) ? bookmaker.bets : []) {
        const betId = positiveInt(bet?.id, INT4_MAX);
        if (betId === null) { reject('bet id missing or out of range', {bookmaker_id: bookmakerId}); continue; }
        const betName = bet.name == null ? '' : String(bet.name);
        if (!clean(betName) || betName.length > 200) { reject('bet name not storable', {bookmaker_id: bookmakerId, bet_id: betId}); continue; }
        for (const v of Array.isArray(bet.values) ? bet.values : []) {
          const valueText = text(v?.value == null ? null : String(v.value), 120);
          const oddText = typeof v?.odd === 'string' ? v.odd.trim() : typeof v?.odd === 'number' ? String(v.odd) : '';
          const handicapText = v?.handicap == null ? '' : String(v.handicap).trim();
          if (valueText === null) { reject('selection text missing', {bookmaker_id: bookmakerId, bet_id: betId}); continue; }
          if (!ODD_TEXT.test(oddText) || Number(oddText) < 1) { reject('price is not a decimal of at least 1', {bookmaker_id: bookmakerId, bet_id: betId, value: valueText}); continue; }
          if (handicapText.length > 20 || !clean(handicapText)) { reject('handicap text not storable', {bookmaker_id: bookmakerId, bet_id: betId, value: valueText}); continue; }
          if (rows.length >= MAX_ROWS_PER_ANSWER) return {rows: [], rejected: [{reason: `answer larger than ${MAX_ROWS_PER_ANSWER} selections: refused whole`}]};
          const ref = parseMarketRef({source: SNAPSHOT_SOURCE, bet_id: betId, bet_name: betName || null, value: valueText, handicap: handicapText || null});
          rows.push({
            fixture_id: fixtureId, kickoff_at: new Date(kickoff).toISOString(), acquired_at: new Date(acquired).toISOString(),
            provider_update_at: update === null ? null : new Date(update).toISOString(), phase: 'PREMATCH',
            bookmaker_id: bookmakerId, bookmaker_name: bookmakerName, bet_id: betId, bet_name: betName,
            value_text: valueText, handicap_text: handicapText, odd_text: oddText,
            market_ref_status: ref.status, market_key: ref.status === 'PARSED' ? ref.key : null, market_ref_version: MARKET_REF_VERSION,
            request_id: requestId, payload_sha256: hash
          });
        }
      }
    }
  }
  return {rows, rejected};
}

// From a client result (createApiFootballClient().get('/odds', ...)): the acquisition instant is the client's own
// fetched_at, never a time the caller chooses, and a cached result is refused (its instant is the original fetch, and
// storing it again would add nothing).
export function oddsSnapshotsFromResult(result, {requestId = null} = {}) {
  if (!result || result.endpoint !== '/odds') throw new TypeError('an /odds client result is required');
  if (result.cacheHit) return {rows: [], rejected: [{reason: 'cached result: already stored at its original acquisition'}]};
  return oddsSnapshotRows({response: result.response}, {acquiredAt: result.fetched_at, requestId});
}

