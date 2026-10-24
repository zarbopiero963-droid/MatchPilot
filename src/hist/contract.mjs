// HIST-01a (#34; MP-OWNER-HIST-01A-01): the input contract of the offline backtest engine. It is provider-independent: an
// archive extract, captured TotalCorner snapshots or a synthetic fixture all arrive in this shape, with the times the PIT
// policy needs kept apart (kickoff, provider time, acquisition time). Validation is strict and fails with BAD_HIST_INPUT
// naming the field; nothing is guessed or filled in. Pure module: no database, no clock.
// HIST-LINK-01 (#34 x #100): `mp-hist-input-2` carries the result as versions (DEC-002): any number per event, each with
// its version number, acquisition time and provenance, FINAL or NOT_FINAL. There is no VOID (DEC-015). An
// `mp-hist-input-1` input is still accepted: its single outcome becomes version 1, and a VOID becomes a NOT_FINAL
// version flagged `void_declared`, which the engine leaves unsettled. The normalized input is always version 2.
import {createHash} from 'node:crypto';
import {decimalOdds, MathInputError} from '../math/core.mjs';

export const INPUT_VERSION = 'mp-hist-input-2';
export const INPUT_VERSIONS = ['mp-hist-input-1', INPUT_VERSION];
export const DATASET_KINDS = ['FIXTURE', 'REAL'];
export const SELECTIONS_1X2 = ['HOME', 'DRAW', 'AWAY'];
// mp-hist-input-1 outcome: FINAL with scores, or VOID (the source declared the match void: abandoned, cancelled).
export const OUTCOME_STATUSES = ['FINAL', 'VOID'];
// mp-hist-input-2 result version: FINAL with both scores, or NOT_FINAL (postponed, suspended, no result yet) without.
export const RESULT_STATUSES = ['FINAL', 'NOT_FINAL'];

// `refers` names the config fields the refusal is really about when they differ from the field it is raised on (a money
// management that needs config.bankroll); by default the field itself.
export class HistInputError extends Error {
  constructor(field, message, refers = [field]) {
    super(`${field}: ${message}`);
    this.code = 'BAD_HIST_INPUT';
    this.field = field;
    this.refers = refers;
  }
}

const ID = /^[\w.:\-/]{1,200}$/;
// Odds as plain decimal text: no sign, no surrounding space, no leading zero.
const ODDS = /^(0|[1-9]\d{0,6})(\.\d{1,6})?$/;
// Upper bound on each list, checked after parsing: it bounds the work of the engine, not the memory used to parse a file.
export const MAX_ITEMS = 2_000_000;
// An instant in UTC, to the second or millisecond: no offset other than Z, so no time zone is ever assumed.
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function keys(field, value, required, optional = []) {
  if (!isObject(value)) throw new HistInputError(field, 'must be an object');
  for (const key of Object.keys(value)) if (!required.includes(key) && !optional.includes(key)) throw new HistInputError(`${field}.${key}`, 'unknown field');
  for (const key of required) if (!Object.hasOwn(value, key)) throw new HistInputError(`${field}.${key}`, 'is required');
}

function id(field, value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new HistInputError(field, 'must be an identifier (letters, digits, _ . : - /)');
  return value;
}

function text(field, value) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) throw new HistInputError(field, 'must be a non-empty text');
  return value;
}

// A UTC instant, or null when the source does not have it (allowed only where the contract says so).
function instant(field, value, {nullable = false} = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !UTC.test(value) || Number.isNaN(Date.parse(value))) throw new HistInputError(field, 'must be a UTC instant (YYYY-MM-DDTHH:MM:SS[.mmm]Z)');
  const date = new Date(value);
  if (date.toISOString().slice(0, 19) !== value.slice(0, 19)) throw new HistInputError(field, 'is not a real calendar instant');
  return date.toISOString();
}

function calendarDate(field, value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
    throw new HistInputError(field, 'must be a calendar date YYYY-MM-DD');
  return value;
}

function score(field, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new HistInputError(field, 'must be a non-negative integer');
  return value;
}

function oneOf(field, value, allowed) {
  if (!allowed.includes(value)) throw new HistInputError(field, `must be one of ${allowed.join(', ')}`);
  return value;
}

const eventKey = (provider, eventId) => `${provider}\u0000${eventId}`;

// Validates an input and returns it normalized: instants in ISO form, odds as Decimal text, every list sorted by its
// identifiers, so the same data in any order gives the same normalized input and the same hash.
export function validateInput(input) {
  keys('input', input, ['schema_version', 'dataset', 'events', 'observations', 'outcomes']);
  if (!INPUT_VERSIONS.includes(input.schema_version)) throw new HistInputError('input.schema_version', `must be one of ${INPUT_VERSIONS.join(', ')}`);
  keys('dataset', input.dataset, ['id', 'kind', 'description']);
  const dataset = {id: id('dataset.id', input.dataset.id), kind: oneOf('dataset.kind', input.dataset.kind, DATASET_KINDS),
    description: text('dataset.description', input.dataset.description)};
  for (const list of ['events', 'observations', 'outcomes']) {
    if (!Array.isArray(input[list])) throw new HistInputError(list, 'must be an array');
    if (input[list].length > MAX_ITEMS) throw new HistInputError(list, `has more than ${MAX_ITEMS} items`);
  }

  const events = new Map();
  input.events.forEach((event, i) => {
    const field = `events[${i}]`;
    // match_date (optional, HIST-PG-01): the calendar date of the match as the provider gives it, for sources whose
    // kickoff instant is unknown (FutPythonTrader's time zone is undocumented). It is never turned into an instant.
    keys(field, event, ['provider', 'event_id', 'kickoff_utc', 'home', 'away'], ['match_date']);
    const normalized = {provider: id(`${field}.provider`, event.provider), event_id: id(`${field}.event_id`, event.event_id),
      kickoff_utc: instant(`${field}.kickoff_utc`, event.kickoff_utc, {nullable: true}),
      home: text(`${field}.home`, event.home), away: text(`${field}.away`, event.away),
      match_date: Object.hasOwn(event, 'match_date') ? calendarDate(`${field}.match_date`, event.match_date) : null};
    const key = eventKey(normalized.provider, normalized.event_id);
    if (events.has(key)) throw new HistInputError(`${field}.event_id`, 'duplicate event');
    events.set(key, normalized);
  });

  const observationIds = new Set();
  const observations = input.observations.map((observation, i) => {
    const field = `observations[${i}]`;
    keys(field, observation, ['observation_id', 'provider', 'event_id', 'bookmaker', 'market', 'selection', 'odds', 'provider_time', 'acquired_at']);
    const normalized = {observation_id: id(`${field}.observation_id`, observation.observation_id),
      provider: id(`${field}.provider`, observation.provider), event_id: id(`${field}.event_id`, observation.event_id),
      bookmaker: id(`${field}.bookmaker`, observation.bookmaker), market: oneOf(`${field}.market`, observation.market, ['1X2']),
      selection: oneOf(`${field}.selection`, observation.selection, SELECTIONS_1X2), odds: null,
      provider_time: instant(`${field}.provider_time`, observation.provider_time, {nullable: true}),
      acquired_at: instant(`${field}.acquired_at`, observation.acquired_at, {nullable: true})};
    if (typeof observation.odds !== 'string' || !ODDS.test(observation.odds)) throw new HistInputError(`${field}.odds`, 'must be decimal text such as 2.10');
    try { normalized.odds = decimalOdds(`${field}.odds`, observation.odds).toString(); }
    catch (error) {
      if (error instanceof MathInputError) throw new HistInputError(`${field}.odds`, error.message.replace(/^[^:]*: /, ''));
      throw error;
    }
    if (observationIds.has(normalized.observation_id)) throw new HistInputError(`${field}.observation_id`, 'duplicate observation');
    observationIds.add(normalized.observation_id);
    if (!events.has(eventKey(normalized.provider, normalized.event_id))) throw new HistInputError(`${field}.event_id`, 'no such event for this provider');
    return normalized;
  });

  const outcomes = input.schema_version === INPUT_VERSION ? resultVersions(input.outcomes, events) : legacyOutcomes(input.outcomes, events);

  const byte = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return {
    schema_version: INPUT_VERSION,
    dataset,
    events: [...events.values()].sort((a, b) => byte(a.provider, b.provider) || byte(a.event_id, b.event_id)),
    observations: observations.sort((a, b) => byte(a.observation_id, b.observation_id)),
    outcomes: outcomes.sort((a, b) => byte(a.provider, b.provider) || byte(a.event_id, b.event_id) || a.version - b.version),
  };
}

// mp-hist-input-1: one outcome per event, FINAL or VOID, normalized to version 1 of mp-hist-input-2.
function legacyOutcomes(list, events) {
  const outcomeKeys = new Set();
  return list.map((outcome, i) => {
    const field = `outcomes[${i}]`;
    keys(field, outcome, ['provider', 'event_id', 'status', 'home_score', 'away_score', 'acquired_at']);
    const status = oneOf(`${field}.status`, outcome.status, OUTCOME_STATUSES);
    const provider = id(`${field}.provider`, outcome.provider), eventId = id(`${field}.event_id`, outcome.event_id);
    const normalized = {provider, event_id: eventId, version: 1, status: status === 'FINAL' ? 'FINAL' : 'NOT_FINAL',
      home_score: status === 'FINAL' ? score(`${field}.home_score`, outcome.home_score) : null,
      away_score: status === 'FINAL' ? score(`${field}.away_score`, outcome.away_score) : null,
      acquired_at: instant(`${field}.acquired_at`, outcome.acquired_at), provenance: `mp-hist-input-1:${provider}:${eventId}`,
      void_declared: status === 'VOID'};
    if (status === 'VOID' && (outcome.home_score !== null || outcome.away_score !== null)) throw new HistInputError(`${field}.home_score`, 'a VOID outcome has no scores');
    const key = eventKey(provider, eventId);
    if (!events.has(key)) throw new HistInputError(`${field}.event_id`, 'no such event for this provider');
    if (outcomeKeys.has(key)) throw new HistInputError(`${field}.event_id`, 'more than one outcome for the event');
    outcomeKeys.add(key);
    return normalized;
  });
}

// mp-hist-input-2: result versions. A version number is unique per event, and a later version is a later acquisition
// (DEC-002: a higher number recorded earlier would make a stale record the latest).
function resultVersions(list, events) {
  const byEvent = new Map();
  const versions = list.map((outcome, i) => {
    const field = `outcomes[${i}]`;
    keys(field, outcome, ['provider', 'event_id', 'version', 'status', 'home_score', 'away_score', 'acquired_at', 'provenance']);
    const status = oneOf(`${field}.status`, outcome.status, RESULT_STATUSES);
    if (!Number.isSafeInteger(outcome.version) || outcome.version < 1) throw new HistInputError(`${field}.version`, 'must be a positive integer');
    const normalized = {provider: id(`${field}.provider`, outcome.provider), event_id: id(`${field}.event_id`, outcome.event_id), version: outcome.version, status,
      home_score: status === 'FINAL' ? score(`${field}.home_score`, outcome.home_score) : null,
      away_score: status === 'FINAL' ? score(`${field}.away_score`, outcome.away_score) : null,
      acquired_at: instant(`${field}.acquired_at`, outcome.acquired_at), provenance: id(`${field}.provenance`, outcome.provenance), void_declared: false};
    if (status === 'NOT_FINAL' && (outcome.home_score !== null || outcome.away_score !== null)) throw new HistInputError(`${field}.home_score`, 'a NOT_FINAL version has no scores');
    const key = eventKey(normalized.provider, normalized.event_id);
    if (!events.has(key)) throw new HistInputError(`${field}.event_id`, 'no such event for this provider');
    if (!byEvent.has(key)) byEvent.set(key, new Map());
    if (byEvent.get(key).has(normalized.version)) throw new HistInputError(`${field}.version`, 'duplicate version for the event');
    byEvent.get(key).set(normalized.version, {field, at: Date.parse(normalized.acquired_at)});
    return normalized;
  });
  for (const perEvent of byEvent.values()) {
    const ordered = [...perEvent.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ordered.length; i++) if (ordered[i][1].at < ordered[i - 1][1].at)
      throw new HistInputError(`${ordered[i][1].field}.acquired_at`, `version ${ordered[i][0]} acquired before version ${ordered[i - 1][0]}`);
  }
  return versions;
}

// Canonical JSON: object keys sorted, no whitespace. Used for every hash of the engine.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export const sha256 = textValue => createHash('sha256').update(textValue).digest('hex');
