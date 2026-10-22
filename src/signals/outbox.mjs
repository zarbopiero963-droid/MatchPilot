// SIM-OUTBOX-01 (#182: Telegram resumes only after verification, tests and an owner GO): the message a signal WOULD
// send, written to sim.outbox with status SIMULATED_NOT_SENT. This module has no network code and imports nothing
// that can reach Telegram; delivery does not exist here by design.
export const OUTBOX_CHANNEL = 'telegram-simulated';
export const OUTBOX_STATUS = 'SIMULATED_NOT_SENT';

export const OUTBOX_DDL = `CREATE SCHEMA IF NOT EXISTS sim;
CREATE TABLE IF NOT EXISTS sim.outbox (
  id bigserial PRIMARY KEY,
  signal_id bigint NOT NULL UNIQUE REFERENCES sim.signals(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL CHECK (channel = 'telegram-simulated'),
  status text NOT NULL CHECK (status = 'SIMULATED_NOT_SENT'),
  text text NOT NULL
);`;

const percent = rate => rate === null || rate === undefined ? 'N/D' : `${(Number(rate) * 100).toFixed(1)}%`;

// Pure: the text of one signal row (exported for the tests).
export function buildMessage(row) {
  const lines = [
    '[SIMULAZIONE — NON INVIATO]',
    `${row.home_name ?? '?'} – ${row.away_name ?? '?'} · ${row.match_date}`,
    `Mercato: Over 2.5 · regola ${row.rule_version}`,
    `Over 2.5 medio ultime 10: ${percent(row.avg_over25_rate)} (N ${row.home_n ?? 0}/${row.away_n ?? 0})`,
    `Quota archiviata: ${row.odd ?? 'N/D'}`,
  ];
  if (row.outcome === 'HIT' || row.outcome === 'MISS') lines.push(`Esito storico: ${row.final_score} · ${row.outcome === 'HIT' ? 'vinto' : 'perso'}`);
  lines.push('Nessuna scommessa, nessun invio reale.');
  return lines.join('\n');
}

export async function queueRun(client, runId) {
  await client.query(OUTBOX_DDL);
  const {rows} = await client.query(`SELECT id, run_id, rule_version, match_date::text AS match_date, home_name, away_name, odd::text AS odd,
      outcome, final_score, inputs->>'avg_over25_rate' AS avg_over25_rate, (inputs->>'home_n')::int AS home_n, (inputs->>'away_n')::int AS away_n
    FROM sim.signals WHERE run_id = $1 AND decision = 'SIGNAL' ORDER BY id`, [runId]);
  let queued = 0;
  for (const row of rows) {
    const result = await client.query(`INSERT INTO sim.outbox (signal_id, run_id, channel, status, text) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (signal_id) DO NOTHING`, [row.id, runId, OUTBOX_CHANNEL, OUTBOX_STATUS, buildMessage(row)]);
    queued += result.rowCount;
  }
  return {signals: rows.length, queued};
}

export async function listOutbox(client, runId, limit = 50) {
  const exists = (await client.query(`SELECT to_regclass('sim.outbox') IS NOT NULL AS ok`)).rows[0].ok;
  if (!exists || !runId) return [];
  return (await client.query(`SELECT id, signal_id, created_at, channel, status, text FROM sim.outbox WHERE run_id = $1 ORDER BY id LIMIT $2`,
    [runId, limit])).rows;
}
