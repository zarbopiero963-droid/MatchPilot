// HIST-API-01 (#98, #34): the backtest over MatchPilot's stored FutPythonTrader data as a read-only API v1 endpoint.
// Every parameter is validated, and the configuration checked by the engine itself, before any database access. The
// read runs in a READ ONLY transaction with a statement timeout; the range and the number of matches are bounded. The
// report is the engine's: PIT by default (the stored FPT prices were acquired after kickoff, so a PIT run finds none);
// NON_PIT_RESEARCH only when asked, labelled in the report's certification block. Nothing is written, nothing certified.
import {HistInputError} from '../hist/contract.mjs';
import {PIT_MODES, runBacktest, validateConfig} from '../hist/engine.mjs';
import {STRATEGIES} from '../hist/strategies.mjs';
import {FPT_BOOKMAKER, readFptHistInput} from '../providers/futpython/hist-input.mjs';

export const HIST_BACKTEST_LIMITS = Object.freeze({maxDays: 366, maxEvents: 2000, defaultEvents: 500, statementTimeoutMs: 20000});
// The #96 models the API exposes, with the single parameter each one takes.
const MM_PARAM = Object.freeze({FIXED_STAKE: 'stake', FIXED_LIABILITY: 'liability', PERCENT_BANKROLL: 'percent', LIABILITY_PERCENT_BANKROLL: 'percent'});
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const badRequest = (ApiError, message) => new ApiError('BAD_REQUEST', message);

function dateOf(ApiError, name, value) {
  if (!DATE.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw badRequest(ApiError, `${name} must be a date YYYY-MM-DD`);
  return value;
}

// The engine configuration of a request: defaults are the tests' (stake 1, commission 0), never a guessed market rate.
export function configOf(input) {
  const config = {strategy: input.strategy ?? 'mp-ref-fav-back-1', bookmaker: FPT_BOOKMAKER, lead_minutes: 10, commission: input.commission ?? '0',
    pit_mode: input.pit_mode ?? 'PIT'};
  if (input.outcomes_as_of) config.outcomes_as_of = input.outcomes_as_of;
  if (input.bankroll) config.bankroll = input.bankroll;
  if (input.mm_model) config.money_management = {model: input.mm_model, params: {[MM_PARAM[input.mm_model]]: input.mm_value}};
  else config.stake = input.stake ?? '1';
  return config;
}

export function histBacktestEndpoint({param, integer, oneOf, instant, ApiError}) {
  return {
    path: '/api/v1/hist/backtest', source: 'MatchPilot',
    summary: 'Backtest BACK/LAY sui dati FutPythonTrader salvati: PIT (default) o NON_PIT_RESEARCH etichettato; ledger paper, bankroll e Money Management opzionali. Sola lettura, nessuna certificazione.',
    params: {
      from: param('data iniziale YYYY-MM-DD (data partita)', true),
      to: param(`data finale YYYY-MM-DD, al massimo ${HIST_BACKTEST_LIMITS.maxDays} giorni dopo from`, true),
      competition: param('id fpt:competition:<md5> (opzionale)'),
      strategy: param(`strategia: ${Object.keys(STRATEGIES).join(' | ')}`, false, oneOf('strategy', Object.keys(STRATEGIES))),
      pit_mode: param('PIT (default) | NON_PIT_RESEARCH', false, oneOf('pit_mode', PIT_MODES)),
      stake: param('stake fisso, default 1 (non con mm_model)'),
      commission: param('commissione 0..1, default 0'),
      bankroll: param('bankroll iniziale: simulazione cronologica (opzionale)'),
      mm_model: param(`modello #96: ${Object.keys(MM_PARAM).join(' | ')} (richiede bankroll e mm_value)`, false, oneOf('mm_model', Object.keys(MM_PARAM))),
      mm_value: param('parametro del modello (stake, liability o percent)'),
      outcomes_as_of: param('istante ISO-8601: cutoff dei risultati (DEC-002)', false, instant('outcomes_as_of')),
      max_events: param(`integer 1–${HIST_BACKTEST_LIMITS.maxEvents}, default ${HIST_BACKTEST_LIMITS.defaultEvents}`, false, integer('max_events', 1, HIST_BACKTEST_LIMITS.maxEvents)),
    },
    precheck: input => {
      const from = dateOf(ApiError, 'from', input.from), to = dateOf(ApiError, 'to', input.to);
      const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
      if (days < 0 || days > HIST_BACKTEST_LIMITS.maxDays) throw badRequest(ApiError, `to must be from..from+${HIST_BACKTEST_LIMITS.maxDays} days`);
      if (input.competition !== undefined && !/^fpt:competition:[0-9a-f]{32}$/.test(input.competition)) throw badRequest(ApiError, 'competition must be an fpt:competition id');
      if ((input.mm_model === undefined) !== (input.mm_value === undefined)) throw badRequest(ApiError, 'mm_model and mm_value go together');
      if (input.mm_model && input.stake !== undefined) throw badRequest(ApiError, 'stake is not used with mm_model');
      try { validateConfig(configOf(input)); }
      catch (error) {
        if (error instanceof HistInputError) throw badRequest(ApiError, error.message);
        throw error;
      }
    },
    read: async (client, input) => {
      let read;
      await client.query('BEGIN READ ONLY');
      try {
        await client.query(`SET LOCAL statement_timeout = ${HIST_BACKTEST_LIMITS.statementTimeoutMs}`);
        read = await readFptHistInput(client, {dateFrom: input.from, dateTo: input.to, competitionId: input.competition ?? null,
          maxEvents: input.max_events ?? HIST_BACKTEST_LIMITS.defaultEvents});
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      }
      let report;
      try { report = runBacktest(read.input, configOf(input)); }
      catch (error) {
        // Stored data the contract refuses is reported as such, never as an unavailable database.
        if (error instanceof HistInputError) throw Object.assign(new Error(`stored data refused by the backtest contract: ${error.message}`), {code: 'BAD_QUERY_INPUT'});
        throw error;
      }
      return {reader: read.stats, report};
    },
    provenance: data => ({source: 'database', source_provider: 'futpythontrader', upstream_calls: 0, writes: 0,
      pit_mode: data.report.config.pit_mode, certification: data.report.certification, report_sha256: data.report.report_sha256}),
    asOf: data => data.report.settlement_policy?.outcomes_as_of ?? null,
  };
}
