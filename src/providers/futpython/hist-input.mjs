// HIST-PG-01 (#34, #12): builds the backtest input `mp-hist-input-2` from the FutPythonTrader data in PostgreSQL. Read
// only: one SELECT over fpt_match_versions (every acquired version) and fpt_match_facts (the match list), nothing is
// written. Nothing is invented: prices and scores are the provider's own fields of each version, the acquisition time
// is the one recorded at ingestion, and a missing kickoff stays null (the provider's time zone is undocumented, so only
// the match date is passed). FutPythonTrader delivers no provider timestamp for its prices: provider_time is null.
// The stored prices were acquired after kickoff (bulk import), so a PIT run finds no admissible price; only the
// labelled NON_PIT_RESEARCH mode of the engine can use them (owner mandate MP-AUTONOMOUS-AUTOMERGE-20261023).

import {createHash} from 'node:crypto';

export const FPT_HIST_INPUT_VERSION = 'fpt-hist-input-1';
export const FPT_BOOKMAKER = 'futpythontrader-odds';
// Each 1X2 price has two provider spellings, read in the same order as the facts (Odd_1_FT before Odd_H_FT, ...).
const SELECTIONS = [['HOME', ['odd_1', 'odd_h']], ['DRAW', ['odd_x', 'odd_d']], ['AWAY', ['odd_2', 'odd_a']]];
const MAX_EVENTS = 50000;

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = value => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const isoInstant = value => (value instanceof Date ? value : new Date(value)).toISOString();
// The provider's price text, never rounded (review B-2 on PR #223): the same acceptance as fpt_price (digits with an
// optional ',' or '.' decimal part, greater than 1), written as the contract's decimal text (no leading or trailing
// zeros). A price the contract cannot carry exactly (more than 7 integer or 6 decimal digits) is dropped and counted.
// The second spelling is read when the first is absent or unusable, and every unusable spelling is counted, even when
// the other one then gives the price (prices_dropped counts spellings, not missing prices).
export function providerPrice(raw) {
  // Only spaces are trimmed, as btrim() does in fpt_price (a tab or a newline makes the value not a price).
  const text = typeof raw === 'string' ? raw.replace(/^ +| +$/g, '') : '';
  if (!/^\d+([.,]\d+)?$/.test(text)) return {price: null, reason: text ? 'NOT_A_PRICE' : null};
  const [whole, fraction = ''] = text.replace(',', '.').split('.');
  const int = whole.replace(/^0+(?=\d)/, ''), dec = fraction.replace(/0+$/, '');
  if (int === '0' || (int === '1' && !dec)) return {price: null, reason: 'NOT_GREATER_THAN_1'};
  if (int.length > 7 || dec.length > 6) return {price: null, reason: 'PRECISION_OUT_OF_CONTRACT'};
  return {price: dec ? `${int}.${dec}` : int, reason: null};
}

// The contract's identifiers allow letters, digits and _ . : - /; a provider id with other characters is replaced by a
// stable hash of the match key (the id is opaque).
const ID = /^[\w.:\-/]{1,200}$/;
const eventIdOf = matchKey => (ID.test(matchKey) ? matchKey : `fpt:key:${createHash('sha256').update(matchKey).digest('hex').slice(0, 32)}`);
// Team names as the provider gives them; an absent name is shown as N/D, never guessed.
const name = value => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : 'N/D');

// Pure: rows ordered by match, acquisition and version id -> {input: mp-hist-input-2, stats}. Exported for tests.
export function buildFptHistInput(rows, {datasetId, description}) {
  const events = new Map(), observations = [], outcomes = [];
  const versionNo = new Map(), lastAcquired = new Map();
  const dropped = Object.create(null);
  for (const row of rows) {
    const eventId = eventIdOf(row.match_key);
    if (!events.has(eventId)) {
      events.set(eventId, {provider: 'futpythontrader', event_id: eventId, kickoff_utc: row.kickoff_utc ? isoInstant(row.kickoff_utc) : null,
        home: name(row.home), away: name(row.away), match_date: row.match_date ? isoDate(row.match_date) : null});
    }
    const acquired = isoInstant(row.acquired_at);
    // Versions must arrive in acquisition order: numbering them otherwise would make a stale record the latest.
    if (lastAcquired.has(eventId) && acquired < lastAcquired.get(eventId)) fail('ROWS_NOT_ORDERED', `${eventId}: versions out of acquisition order`);
    lastAcquired.set(eventId, acquired);
    for (const [selection, columns] of SELECTIONS) {
      let odds = null;
      for (const column of columns) {
        const {price, reason} = providerPrice(row[column]);
        if (price) { odds = price; break; }
        if (reason) dropped[reason] = (dropped[reason] ?? 0) + 1;
      }
      if (odds) observations.push({observation_id: `fpt:v${row.version_id}:${selection}`, provider: 'futpythontrader', event_id: eventId,
        bookmaker: FPT_BOOKMAKER, market: '1X2', selection, odds, provider_time: null, acquired_at: acquired});
    }
    // Result versions numbered in acquisition order (then version id), so a later number is never an earlier record.
    const number = (versionNo.get(eventId) ?? 0) + 1;
    versionNo.set(eventId, number);
    const final = row.phase === 'HISTORICAL' && Number.isInteger(row.home_score) && Number.isInteger(row.away_score);
    outcomes.push({provider: 'futpythontrader', event_id: eventId, version: number, status: final ? 'FINAL' : 'NOT_FINAL',
      home_score: final ? row.home_score : null, away_score: final ? row.away_score : null, acquired_at: acquired,
      provenance: `futpythontrader:snapshot:${row.snapshot_id}`});
  }
  return {input: {schema_version: 'mp-hist-input-2', dataset: {id: datasetId, kind: 'REAL', description},
    events: [...events.values()], observations, outcomes},
  stats: {events: events.size, versions: outcomes.length, observations: observations.length, prices_dropped: Object.fromEntries(Object.entries(dropped).sort())}};
}

// Reads the matches of a date range (optionally one competition) and every acquired version of them that belongs to an
// ACTIVE dataset: the same onboarding gate as fpt_match_facts (migration 018, review B-1 on PR #223), so a version of a
// dataset still being onboarded never reaches a backtest even when it shares the match key.
export async function readFptHistInput(db, {dateFrom, dateTo, competitionId = null, maxEvents = 5000} = {}) {
  if (!DATE.test(String(dateFrom)) || !DATE.test(String(dateTo)) || dateFrom > dateTo) fail('BAD_INPUT', 'dateFrom and dateTo must be YYYY-MM-DD with dateFrom <= dateTo');
  if (!Number.isSafeInteger(maxEvents) || maxEvents < 1 || maxEvents > MAX_EVENTS) fail('BAD_INPUT', `maxEvents must be 1..${MAX_EVENTS}`);
  if (competitionId !== null && (typeof competitionId !== 'string' || !/^fpt:competition:[0-9a-f]{32}$/.test(competitionId))) fail('BAD_INPUT', 'competitionId must be an fpt:competition id');
  const {rows} = await db.query(`
    WITH matches AS (
      SELECT f.match_key, f.match_date, f.kickoff_utc, f.home_name, f.away_name
      FROM fpt_match_facts f
      WHERE f.match_date BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR f.internal_competition_id = $3)
      ORDER BY f.match_date, f.match_key
      LIMIT $4
    )
    SELECT m.match_key, m.match_date, m.kickoff_utc, COALESCE(m.home_name, v.home) AS home, COALESCE(m.away_name, v.away) AS away,
           v.version_id, v.snapshot_id, v.acquired_at, v.phase,
           fpt_score_int(v.payload->>'Home_Score') AS home_score, fpt_score_int(v.payload->>'Away_Score') AS away_score,
           v.payload->>'Odd_1_FT' AS odd_1, v.payload->>'Odd_H_FT' AS odd_h, v.payload->>'Odd_X_FT' AS odd_x,
           v.payload->>'Odd_D_FT' AS odd_d, v.payload->>'Odd_2_FT' AS odd_2, v.payload->>'Odd_A_FT' AS odd_a
    FROM matches m JOIN fpt_match_versions v ON v.match_key = m.match_key
    WHERE NOT EXISTS (SELECT 1 FROM fpt_onboarding o WHERE o.dataset_key = v.dataset_key AND o.state <> 'ACTIVE')
    ORDER BY m.match_date, m.match_key, v.acquired_at, v.version_id`, [dateFrom, dateTo, competitionId, maxEvents]);
  return buildFptHistInput(rows, {datasetId: `fpt:${dateFrom}:${dateTo}${competitionId ? `:${competitionId.slice(-12)}` : ''}`,
    description: `FutPythonTrader ${dateFrom}..${dateTo}${competitionId ? ' one competition' : ''} from PostgreSQL (${FPT_HIST_INPUT_VERSION}); prices acquired at ingestion, not PIT`});
}
