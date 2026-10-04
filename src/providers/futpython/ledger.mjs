import { withClient } from '../../db.mjs';

const INSERT = `INSERT INTO fpt_request_ledger(
  recorded_at,dataset_key,url_path,outcome,attempt,backoff_ms,http_status,run_id,priority
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`;

export function createPgLedger() {
  return {
    async insert(row) {
      await withClient(client => client.query(INSERT, [
        row.recorded_at || new Date(),
        row.dataset_key || null,
        row.url_path,
        row.outcome,
        row.attempt,
        row.backoff_ms || 0,
        row.http_status ?? null,
        row.run_id || null,
        row.priority || null
      ]));
    },
    async countSince(sinceMs, outcomes) {
      const result = await withClient(client => client.query(
        `SELECT count(*)::int AS n
         FROM fpt_request_ledger
         WHERE recorded_at >= $1 AND outcome = ANY($2::text[])`,
        [new Date(sinceMs), outcomes]
      ));
      return result.rows[0]?.n || 0;
    },
    async hasUpstreamSuccess(runId, datasetKey) {
      const result = await withClient(client => client.query(
        `SELECT 1 FROM fpt_request_ledger
         WHERE run_id=$1 AND dataset_key=$2 AND outcome='upstream' LIMIT 1`,
        [runId, datasetKey]
      ));
      return result.rowCount > 0;
    },
    async recent(limit) {
      const result = await withClient(client => client.query(
        `SELECT outcome, http_status
         FROM fpt_request_ledger
         ORDER BY recorded_at DESC, ledger_id DESC
         LIMIT $1`,
        [limit]
      ));
      return result.rows;
    }
  };
}
