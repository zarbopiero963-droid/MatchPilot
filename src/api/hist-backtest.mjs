// HIST-API-01 (#98, #34): the backtest over MatchPilot's stored FutPythonTrader data as a read-only API v1 endpoint.
// Every parameter is validated, and the configuration checked by the engine itself, before any database access. The
// read runs in a READ ONLY transaction with a statement timeout; the range and the number of matches are bounded. The
// report is the engine's: PIT by default (the stored FPT prices were acquired after kickoff, so a PIT run finds none);
// NON_PIT_RESEARCH only when asked, labelled in the report's certification block. Nothing is written, nothing certified.
import {HistInputError} from '../hist/contract.mjs';
import {PIT_MODES, runBacktest, validateConfig} from '../hist/engine.mjs';
import {STRATEGIES} from '../hist/strategies.mjs';
import {DEF_SELECTIONS, DEF_SIDES, DEF_VENUES, PRICE_CONDITIONS} from '../hist/strategy-def.mjs';
import {FPT_BOOKMAKER, readFptHistInput} from '../providers/futpython/hist-input.mjs';

// The engine is synchronous: runs are exclusive (one at a time, others get 429 BUSY) and the computation happens after
// the database client is released (PR #227 review B-1). Since the incremental ledger replay (LEDGER-PERF-01) the cost is
// linear: measured about 0.3 s at 1000 events and 0.5 s at 2000 with two versions per match.
export const HIST_BACKTEST_LIMITS = Object.freeze({maxDays: 366, maxEvents: 1000, defaultEvents: 300, statementTimeoutMs: 20000});
// The #96 models the API exposes, with the single parameter each one takes.
const MM_PARAM = Object.freeze({FIXED_STAKE: 'stake', FIXED_LIABILITY: 'liability', PERCENT_BANKROLL: 'percent', LIABILITY_PERCENT_BANKROLL: 'percent'});
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const badRequest = (ApiError, message) => new ApiError('BAD_REQUEST', message);

function dateOf(ApiError, name, value) {
  // An impossible date (month 13, day 32) is an invalid Date: refused here, never a RangeError (PR #230 review R2-NB-2).
  const time = DATE.test(value) ? Date.parse(`${value}T00:00:00Z`) : NaN;
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) throw badRequest(ApiError, `${name} must be a date YYYY-MM-DD`);
  return value;
}

// The engine configuration of a request: defaults are the tests' (stake 1, commission 0), never a guessed market rate.
// STRAT-CFG-01: `selection` turns the request into a configurable strategy (a strategy_definition the engine validates).
const DEFINITION_PARAMS = ['selection', 'side', ...PRICE_CONDITIONS, 'team', 'venue'];
export function definitionOf(input) {
  const conditions = {};
  for (const name of PRICE_CONDITIONS) if (input[name] !== undefined) conditions[name] = input[name];
  if (input.team !== undefined) conditions.teams = [input.team];
  if (input.venue !== undefined) conditions.venue = input.venue;
  return {selection: input.selection, side: input.side, conditions};
}

export function configOf(input) {
  const strategy = input.selection !== undefined ? {strategy_definition: definitionOf(input)} : {strategy: input.strategy ?? 'mp-ref-fav-back-1'};
  const config = {...strategy, bookmaker: FPT_BOOKMAKER, lead_minutes: 10, commission: input.commission ?? '0',
    pit_mode: input.pit_mode ?? 'PIT'};
  if (input.outcomes_as_of) config.outcomes_as_of = input.outcomes_as_of;
  if (input.bankroll) config.bankroll = input.bankroll;
  if (input.mm_model) config.money_management = {model: input.mm_model, params: {[MM_PARAM[input.mm_model]]: input.mm_value}};
  else config.stake = input.stake ?? '1';
  return config;
}

// The validation, the read and one run, shared by the backtest and the comparison (STRAT-CMP-01).
function checkRequest(ApiError, input) {
  const from = dateOf(ApiError, 'from', input.from), to = dateOf(ApiError, 'to', input.to);
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days < 0 || days > HIST_BACKTEST_LIMITS.maxDays) throw badRequest(ApiError, `to must be from..from+${HIST_BACKTEST_LIMITS.maxDays} days`);
  if (input.competition !== undefined && !/^fpt:competition:[0-9a-f]{32}$/.test(input.competition)) throw badRequest(ApiError, 'competition must be an fpt:competition id');
}
function checkStrategy(ApiError, input, prefix = '') {
  const n = name => `${prefix}${name}`;
  if ((input.mm_model === undefined) !== (input.mm_value === undefined)) throw badRequest(ApiError, `${n('mm_model')} and ${n('mm_value')} go together`);
  if (input.mm_model && input.stake !== undefined) throw badRequest(ApiError, `${n('stake')} is not used with ${n('mm_model')}`);
  if (input.selection !== undefined && input.strategy !== undefined) throw badRequest(ApiError, `${n('strategy')} and ${n('selection')} are exclusive`);
  if (input.selection === undefined) {
    const stray = DEFINITION_PARAMS.filter(name => input[name] !== undefined);
    if (stray.length) throw badRequest(ApiError, `${stray.map(n).join(', ')} need ${n('selection')}`);
  } else if (input.side === undefined) throw badRequest(ApiError, `${n('side')} is required with ${n('selection')}`);
  try { validateConfig(configOf(input)); }
  catch (error) {
    // The engine names config fields; a variant's refusal also names the variant's parameter prefix.
    if (error instanceof HistInputError) throw badRequest(ApiError, prefix ? `${prefix.slice(0, -1)}: ${error.message}` : error.message);
    throw error;
  }
}
async function readRequest(client, input) {
  let read;
  const maxEvents = input.max_events ?? HIST_BACKTEST_LIMITS.defaultEvents;
  await client.query('BEGIN READ ONLY');
  try {
    await client.query(`SET LOCAL statement_timeout = ${HIST_BACKTEST_LIMITS.statementTimeoutMs}`);
    // One match more than asked tells whether the limit really cut the list (dropped again in compute).
    read = await readFptHistInput(client, {dateFrom: input.from, dateTo: input.to, competitionId: input.competition ?? null, maxEvents: maxEvents + 1});
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // A row the reader refuses is a data defect (500), not an unavailable database: drop the string code.
    if (error?.code === 'BAD_ROW' || error?.code === 'ROWS_NOT_ORDERED') throw new Error(error.message);
    throw error;
  }
  return {read, maxEvents};
}
function truncate({read, maxEvents}) {
  const truncated = read.input.events.length > maxEvents;
  let histInput = read.input;
  if (truncated) {
    const keep = new Set(histInput.events.slice(0, maxEvents).map(e => e.event_id));
    histInput = {...histInput, events: histInput.events.filter(e => keep.has(e.event_id)),
      observations: histInput.observations.filter(o => keep.has(o.event_id)), outcomes: histInput.outcomes.filter(o => keep.has(o.event_id))};
  }
  return {histInput, reader: {...read.stats, events: histInput.events.length, truncated}};
}
function runOne(ApiError, histInput, input) {
  let report;
  try { report = runBacktest(histInput, configOf(input)); }
  catch (error) {
    // Stored data the contract refuses is reported as such; any other engine error stays INTERNAL.
    if (error instanceof HistInputError) throw badRequest(ApiError, `stored data refused by the backtest contract: ${error.message}`);
    throw error;
  }
  // For the page (HIST-WEB-01): the totals of the reason counters, so the browser shows them without computing anything (MP-WEB-011).
  const total = counts => Object.values(counts ?? {}).reduce((sum, n) => sum + n, 0);
  const totals = {bets: report.bets.length, unsettled: total(report.counts?.unsettled_by_reason), no_trade: total(report.counts?.no_trade_by_reason),
    skipped_by_money_management: report.bankroll ? total(report.bankroll.skipped_by_reason) : null};
  return {report, totals};
}
// The names and date of each match a bet was placed on.
function eventsOf(histInput, reports) {
  const betEvents = new Set(reports.flatMap(report => report.bets.map(bet => bet.event_id)));
  return Object.fromEntries(histInput.events.filter(e => betEvents.has(e.event_id))
    .map(e => [e.event_id, {home: e.home ?? null, away: e.away ?? null, match_date: e.match_date ?? null, kickoff_utc: e.kickoff_utc ?? null}]));
}

// The parameters of one strategy run (strategy or definition, stake and capital) and those of the data (period,
// competition, mode, commission, cutoff, size).
function strategyParams({param, oneOf}, prefix = '') {
  return {
    strategy: param(`strategia: ${Object.keys(STRATEGIES).join(' | ')}`, false, oneOf(`${prefix}strategy`, Object.keys(STRATEGIES))),
    selection: param(`strategia configurabile: ${DEF_SELECTIONS.join(' | ')} (non con strategy)`, false, oneOf(`${prefix}selection`, DEF_SELECTIONS)),
    side: param(`lato della strategia configurabile: ${DEF_SIDES.join(' | ')} (con selection)`, false, oneOf(`${prefix}side`, DEF_SIDES)),
    ...Object.fromEntries(PRICE_CONDITIONS.map(name => [name, param(`condizione di prezzo ${name.replace('_', ' ')}, es. 1.85 (con selection)`)])),
    team: param('squadra, nome esatto dell\'archivio (con selection)'),
    venue: param(`sede della squadra: ${DEF_VENUES.join(' | ')} (con team)`, false, oneOf(`${prefix}venue`, DEF_VENUES)),
    stake: param('stake fisso, default 1 (non con mm_model)'),
    bankroll: param('bankroll iniziale: simulazione cronologica (opzionale)'),
    mm_model: param(`modello #96: ${Object.keys(MM_PARAM).join(' | ')} (richiede bankroll e mm_value)`, false, oneOf(`${prefix}mm_model`, Object.keys(MM_PARAM))),
    mm_value: param('parametro del modello (stake, liability o percent)'),
  };
}
const STRATEGY_PARAMS = ['strategy', 'selection', 'side', ...PRICE_CONDITIONS, 'team', 'venue', 'stake', 'bankroll', 'mm_model', 'mm_value'];
function dataParams({param, integer, oneOf, instant}) {
  return {
    from: param('data iniziale YYYY-MM-DD (data partita)', true),
    to: param(`data finale YYYY-MM-DD, al massimo ${HIST_BACKTEST_LIMITS.maxDays} giorni dopo from`, true),
    competition: param('id fpt:competition:<md5> (opzionale)'),
    pit_mode: param('PIT (default) | NON_PIT_RESEARCH', false, oneOf('pit_mode', PIT_MODES)),
    commission: param('commissione 0..1, default 0'),
    outcomes_as_of: param('istante ISO-8601: cutoff dei risultati (DEC-002)', false, instant('outcomes_as_of')),
    max_events: param(`integer 1–${HIST_BACKTEST_LIMITS.maxEvents}, default ${HIST_BACKTEST_LIMITS.defaultEvents}`, false, integer('max_events', 1, HIST_BACKTEST_LIMITS.maxEvents)),
  };
}
const provenanceOf = reports => ({source: 'database', source_provider: 'futpythontrader', upstream_calls: 0, writes: 0,
  pit_mode: reports[0].config.pit_mode, certification: reports[0].certification, report_sha256: reports.length === 1 ? reports[0].report_sha256 : reports.map(r => r.report_sha256)});

export function histBacktestEndpoint({param, integer, oneOf, instant, ApiError}) {
  // ApiError is the v1 class, so compute() can raise a 400 after the client is released.
  const data = dataParams({param, integer, oneOf, instant});
  return {
    path: '/api/v1/hist/backtest', source: 'MatchPilot',
    summary: 'Backtest BACK/LAY sui dati FutPythonTrader salvati: PIT (default) o NON_PIT_RESEARCH etichettato; ledger paper, bankroll e Money Management opzionali. Sola lettura, nessuna certificazione.',
    // The published order of HIST-API-01 is kept (the endpoint registry and UNKNOWN_PARAMETER details list them in order).
    params: (({stake, bankroll, mm_model, mm_value, ...rule}) => ({from: data.from, to: data.to, competition: data.competition, ...rule, pit_mode: data.pit_mode,
      stake, commission: data.commission, bankroll, mm_model, mm_value, outcomes_as_of: data.outcomes_as_of, max_events: data.max_events}))(strategyParams({param, oneOf})),
    precheck: input => { checkRequest(ApiError, input); checkStrategy(ApiError, input); },
    read: readRequest,
    exclusive: true, exclusiveKey: 'hist',
    compute: (read, input) => {
      const {histInput, reader} = truncate(read);
      const {report, totals} = runOne(ApiError, histInput, input);
      return {reader, report, events: eventsOf(histInput, [report]), totals};
    },
    provenance: data => provenanceOf([data.report]),
    asOf: data => data.report.settlement_policy?.outcomes_as_of ?? null,
  };
}

// STRAT-CMP-01 (#34 backtest comparison): two or three strategy configurations (a_, b_, c_ parameters) run on the same
// read of the same data, one after another, with the same data parameters (period, competition, mode, commission, cutoff,
// size), so their figures differ only by the strategy, its stake and its capital. Every report is the engine's, unchanged;
// the response says the input hash they share. No ranking and no difference is computed: the reports sit side by side.
export const COMPARE_VARIANTS = Object.freeze(['a', 'b', 'c']);
export function variantInput(input, key) {
  const own = {};
  for (const name of STRATEGY_PARAMS) if (input[`${key}_${name}`] !== undefined) own[name] = input[`${key}_${name}`];
  return own;
}
export function histCompareEndpoint({param, integer, oneOf, instant, ApiError}) {
  const data = dataParams({param, integer, oneOf, instant});
  const variants = input => COMPARE_VARIANTS.filter(key => Object.keys(variantInput(input, key)).length > 0);
  const shared = input => Object.fromEntries(Object.keys(data).filter(name => input[name] !== undefined).map(name => [name, input[name]]));
  return {
    path: '/api/v1/hist/compare', source: 'MatchPilot',
    summary: 'Confronto di 2–3 configurazioni di strategia (parametri a_, b_, c_) sulla stessa lettura dei dati FutPythonTrader salvati, con gli stessi parametri di periodo e modalità; report affiancati, nessuna classifica. Sola lettura, nessuna certificazione.',
    params: {...data, ...Object.fromEntries(COMPARE_VARIANTS.flatMap(key => Object.entries(strategyParams({param, oneOf}, `${key}_`)).map(([name, spec]) =>
      [`${key}_${name}`, {...spec, description: `configurazione ${key.toUpperCase()}: ${spec.description}`}])))},
    precheck: input => {
      checkRequest(ApiError, input);
      const keys = variants(input);
      if (!keys.includes('a') || !keys.includes('b')) throw badRequest(ApiError, 'a comparison needs configurations a and b (a_ and b_ parameters)');
      // The shared parameters are checked once, unprefixed (a wrong commission is not configuration A's).
      try { validateConfig(configOf(shared(input))); }
      catch (error) {
        if (error instanceof HistInputError) throw badRequest(ApiError, error.message);
        throw error;
      }
      for (const key of keys) checkStrategy(ApiError, {...shared(input), ...variantInput(input, key)}, `${key}_`);
    },
    read: readRequest,
    exclusive: true, exclusiveKey: 'hist',
    compute: (read, input) => {
      const {histInput, reader} = truncate(read);
      const runs = variants(input).map(key => ({key, ...runOne(ApiError, histInput, {...shared(input), ...variantInput(input, key)})}));
      return {reader, input_sha256: runs[0].report.dataset.input_sha256, variants: runs, events: eventsOf(histInput, runs.map(r => r.report))};
    },
    provenance: data => provenanceOf(data.variants.map(v => v.report)),
    asOf: data => data.variants[0].report.settlement_policy?.outcomes_as_of ?? null,
  };
}
