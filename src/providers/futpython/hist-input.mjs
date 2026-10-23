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
const SELECTIONS = [['HOME', 'odd_home'], ['DRAW', 'odd_draw'], ['AWAY', 'odd_away']];
const MAX_EVENTS = 50000;

const fail = (code, message) => { const error = new Error(message); error.code = code; throw error; };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = value => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
const isoInstant = value => (value instanceof Date ? value : new Date(value)).toISOString();
// numeric(…,3) from pg arrives as text such as '1.850'; it is kept as the provider's price, without trailing zeros.
const price = value => (value === null || value === undefined ? null : String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));

// The contract's identifiers allow letters, digits and _ . : - /; a provider id with other characters is replaced by a
// stable hash of the match key (the id is opaque).
const ID = /^[\w.:\-/]{1,200}$/;
const eventIdOf = matchKey => (ID.test(matchKey) ? matchKey : `fpt:key:${createHash('sha256').update(matchKey).digest('hex').slice(0, 32)}`);
// Team names as the provider gives them; an absent name is shown as N/D, never guessed.
const name = value => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : 'N/D');

// Pure: rows ordered by match, acquisition and version id -> mp-hist-input-2. Exported for tests.
export function buildFptHistInput(rows, {datasetId, description}) {
  const events = new Map(), observations = [], outcomes = [];
  const versionNo = new Map();
  for (const row of rows) {
    const eventId = eventIdOf(row.match_key);
    if (!events.has(eventId)) {
      events.set(eventId, {provider: 'futpythontrader', event_id: eventId, kickoff_utc: row.kickoff_utc ? isoInstant(row.kickoff_utc) : null,
        home: name(row.home), away: name(row.away), match_date: row.match_date ? isoDate(row.match_date) : null});
    }
    const acquired = isoInstant(row.acquired_at);
    for (const [selection, column] of SELECTIONS) {
      const odds = price(row[column]);
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
  return {schema_version: 'mp-hist-input-2', dataset: {id: datasetId, kind: 'REAL', description},
    events: [...events.values()], observations, outcomes};
}

// Reads the matches of a date range (optionally one competition) and every acquired version of them.
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
           COALESCE(fpt_price(v.payload->>'Odd_1_FT'), fpt_price(v.payload->>'Odd_H_FT'))::text AS odd_home,
           COALESCE(fpt_price(v.payload->>'Odd_X_FT'), fpt_price(v.payload->>'Odd_D_FT'))::text AS odd_draw,
           COALESCE(fpt_price(v.payload->>'Odd_2_FT'), fpt_price(v.payload->>'Odd_A_FT'))::text AS odd_away
    FROM matches m JOIN fpt_match_versions v ON v.match_key = m.match_key
    ORDER BY m.match_date, m.match_key, v.acquired_at, v.version_id`, [dateFrom, dateTo, competitionId, maxEvents]);
  return buildFptHistInput(rows, {datasetId: `fpt:${dateFrom}:${dateTo}${competitionId ? `:${competitionId.slice(-12)}` : ''}`,
    description: `FutPythonTrader ${dateFrom}..${dateTo}${competitionId ? ' one competition' : ''} from PostgreSQL (${FPT_HIST_INPUT_VERSION}); prices acquired at ingestion, not PIT`});
}
