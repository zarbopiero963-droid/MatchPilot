// MP-VPS-FUNCTIONAL-RECOVERY-01: SIMULATED pre-match signal on stored FutPythonTrader data. Nothing leaves the process:
// no Telegram, no exchange, no betting. The rule reads the server's own match analysis (src/analysis/match-analysis.mjs,
// cutoff strictly before the match day) and, for a match already FINAL, settles the signal against the stored score so a
// historical day can be replayed. Results are written to the sim schema of the database the process is connected to.
import {matchAnalysis} from '../analysis/match-analysis.mjs';
import {Decimal, ROUNDING} from '../math/decimal.mjs';

export const RULE_VERSION = 'mp-sim-over25-v1';
export const RULE = {market: 'OVER_2_5', window: 10, venue: 'both', min_n: 10, min_avg_over25_rate: 0.6};

export const SIM_DDL = `CREATE SCHEMA IF NOT EXISTS sim;
CREATE TABLE IF NOT EXISTS sim.signals (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL DEFAULT 'SIMULATION' CHECK (mode = 'SIMULATION'),
  rule_version text NOT NULL,
  internal_match_id text NOT NULL,
  match_date date NOT NULL,
  home_name text, away_name text,
  market text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('SIGNAL','NO_SIGNAL','INSUFFICIENT_DATA')),
  inputs jsonb NOT NULL,
  odd numeric,
  outcome text NOT NULL CHECK (outcome IN ('HIT','MISS','PENDING','NOT_APPLICABLE')),
  final_score text,
  sim_profit numeric,
  UNIQUE (run_id, internal_match_id)
);`;

// Pure decision from an analysis result: exported for the unit tests.
export function decide(analysis) {
  const side = s => analysis.teams?.[s]?.venues?.[RULE.venue]?.windows?.[RULE.window] ?? null;
  const home = side('home'), away = side('away');
  const inputs = {rule: RULE, home_n: home?.n ?? 0, away_n: away?.n ?? 0,
    home_over25_rate: home?.over25_rate ?? null, away_over25_rate: away?.over25_rate ?? null,
    home_source_match_ids: home?.source_match_ids ?? [], away_source_match_ids: away?.source_match_ids ?? [],
    cutoff_before: analysis.method?.cutoff_before ?? null, pit: analysis.method?.pit ?? null};
  if (!home || !away || home.n < RULE.min_n || away.n < RULE.min_n || home.over25_rate === null || away.over25_rate === null) {
    return {decision: 'INSUFFICIENT_DATA', inputs};
  }
  // Exact arithmetic (Math Core Decimal), rounded HALF_EVEN like the analysis rates.
  const avg = Decimal.from(home.over25_rate).add(away.over25_rate).div(2).round(4, ROUNDING.HALF_EVEN);
  inputs.avg_over25_rate = avg.toString(4);
  return {decision: avg.cmp(Decimal.from(String(RULE.min_avg_over25_rate))) >= 0 ? 'SIGNAL' : 'NO_SIGNAL', inputs};
}

export function settle(match, decision) {
  if (decision !== 'SIGNAL') return {outcome: 'NOT_APPLICABLE', profit: null};
  if (match.result_status !== 'FINAL' || match.home_score === null || match.away_score === null) return {outcome: 'PENDING', profit: null};
  const hit = match.home_score + match.away_score >= 3;
  const odd = match.odd_over25 === null || match.odd_over25 === undefined ? null : Number(match.odd_over25);
  // Flat simulated stake of 1 unit at the stored pre-match odd; no odd, no profit figure.
  return {outcome: hit ? 'HIT' : 'MISS', profit: odd === null ? null : (hit ? odd - 1 : -1).toFixed(2)};
}

export async function runForDate(client, {date, runId, limit = 500}) {
  await client.query(SIM_DDL);
  const {rows: ids} = await client.query(
    `SELECT internal_match_id FROM fpt_match_facts WHERE match_date = $1::date ORDER BY internal_match_id COLLATE "C" LIMIT $2`, [date, limit]);
  const out = [];
  for (const {internal_match_id: id} of ids) {
    const analysis = await matchAnalysis(client, {id});
    if (!analysis.match) continue;
    const m = analysis.match;
    const {decision, inputs} = decide(analysis);
    const {outcome, profit} = settle(m, decision);
    const score = m.home_score === null || m.away_score === null ? null : `${m.home_score}-${m.away_score}`;
    await client.query(`INSERT INTO sim.signals (run_id, rule_version, internal_match_id, match_date, home_name, away_name, market,
        decision, inputs, odd, outcome, final_score, sim_profit)
      VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (run_id, internal_match_id) DO UPDATE SET decision = EXCLUDED.decision, inputs = EXCLUDED.inputs,
        odd = EXCLUDED.odd, outcome = EXCLUDED.outcome, final_score = EXCLUDED.final_score, sim_profit = EXCLUDED.sim_profit`,
      [runId, RULE_VERSION, id, m.match_date, m.home_name, m.away_name, RULE.market, decision, JSON.stringify(inputs),
        m.odd_over25 ?? null, outcome, score, profit]);
    out.push({id, decision, outcome});
  }
  return out;
}

// Read side for the API: a missing sim schema is an empty answer, never an error.
export async function listSignals(client, {date = null, runId = null} = {}) {
  const exists = (await client.query(`SELECT to_regclass('sim.signals') IS NOT NULL AS ok`)).rows[0].ok;
  if (!exists) return {mode: 'SIMULATION', rule_version: RULE_VERSION, rule: RULE, rows: [], summary: null, runs: []};
  const runs = (await client.query(`SELECT run_id, min(match_date)::text AS match_date, count(*)::int AS n, max(created_at) AS created_at
    FROM sim.signals GROUP BY run_id ORDER BY max(created_at) DESC LIMIT 20`)).rows;
  const run = runId ?? runs[0]?.run_id ?? null;
  const {rows} = await client.query(`SELECT id, run_id, created_at, mode, rule_version, internal_match_id, match_date::text AS match_date,
      home_name, away_name, market, decision, odd::text AS odd, outcome, final_score, sim_profit::text AS sim_profit,
      inputs->>'avg_over25_rate' AS avg_over25_rate, (inputs->>'home_n')::int AS home_n, (inputs->>'away_n')::int AS away_n
    FROM sim.signals WHERE run_id = $1 AND ($2::date IS NULL OR match_date = $2::date)
    ORDER BY (decision = 'SIGNAL') DESC, internal_match_id COLLATE "C" LIMIT 500`, [run, date]);
  const signals = rows.filter(r => r.decision === 'SIGNAL');
  const settled = signals.filter(r => r.outcome === 'HIT' || r.outcome === 'MISS');
  const priced = settled.filter(r => r.sim_profit !== null);
  const summary = {matches: rows.length, signals: signals.length, hit: settled.filter(r => r.outcome === 'HIT').length,
    miss: settled.filter(r => r.outcome === 'MISS').length, pending: signals.filter(r => r.outcome === 'PENDING').length,
    priced: priced.length, sim_profit_units: priced.reduce((s, r) => s + Number(r.sim_profit), 0).toFixed(2)};
  return {mode: 'SIMULATION', rule_version: RULE_VERSION, rule: RULE, run_id: run, runs, rows, summary};
}
