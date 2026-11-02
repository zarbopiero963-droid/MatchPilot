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

const positiveInt = value => (Number.isSafeInteger(value) && value > 0 ? value : typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : null);
const text = (value, max) => (typeof value === 'string' && value.trim() && value.length <= max ? value : null);

function kickoffOf(fixture) {
  if (Number.isSafeInteger(fixture?.timestamp) && fixture.timestamp > 0) return fixture.timestamp * 1000;
  const parsed = typeof fixture?.date === 'string' ? Date.parse(fixture.date) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
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
    const update = item?.update == null ? null : Date.parse(item.update);
    if (update !== null && !Number.isFinite(update)) { reject('provider update is not a date'); continue; }
    if (update !== null && update >= kickoff) { reject('provider update at or after kickoff: not a pre-match price'); continue; }
    if (update !== null && update > acquired + CLOCK_TOLERANCE_MS) { reject('provider update later than the acquisition'); continue; }
    const hash = payloadSha256(item);
    for (const bookmaker of Array.isArray(item.bookmakers) ? item.bookmakers : []) {
      const bookmakerId = positiveInt(bookmaker?.id);
      if (bookmakerId === null) { reject('bookmaker id missing'); continue; }
      for (const bet of Array.isArray(bookmaker.bets) ? bookmaker.bets : []) {
        const betId = positiveInt(bet?.id);
        if (betId === null) { reject('bet id missing', {bookmaker_id: bookmakerId}); continue; }
        for (const v of Array.isArray(bet.values) ? bet.values : []) {
          const valueText = text(v?.value == null ? null : String(v.value), 120);
          const oddText = typeof v?.odd === 'string' ? v.odd.trim() : typeof v?.odd === 'number' ? String(v.odd) : '';
          const handicapText = v?.handicap == null ? '' : String(v.handicap).trim();
          if (valueText === null) { reject('selection text missing', {bookmaker_id: bookmakerId, bet_id: betId}); continue; }
          if (!ODD_TEXT.test(oddText) || Number(oddText) < 1) { reject('price is not a decimal of at least 1', {bookmaker_id: bookmakerId, bet_id: betId, value: valueText}); continue; }
          if (handicapText.length > 20) { reject('handicap text too long', {bookmaker_id: bookmakerId, bet_id: betId, value: valueText}); continue; }
          const ref = parseMarketRef({source: SNAPSHOT_SOURCE, bet_id: betId, bet_name: bet.name ?? null, value: valueText, handicap: handicapText || null});
          rows.push({
            fixture_id: fixtureId, kickoff_at: new Date(kickoff).toISOString(), acquired_at: new Date(acquired).toISOString(),
            provider_update_at: update === null ? null : new Date(update).toISOString(), phase: 'PREMATCH',
            bookmaker_id: bookmakerId, bookmaker_name: String(bookmaker.name ?? ''), bet_id: betId, bet_name: String(bet.name ?? ''),
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
