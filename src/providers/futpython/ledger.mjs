import { withClient } from '../../db.mjs';

const INSERT = `INSERT INTO fpt_request_ledger(
  recorded_at,dataset_key,url_path,outcome,attempt,backoff_ms,http_status,run_id,priority,
  provider,endpoint_family,latency_ms,deduped,budget_state,budget_remaining_day,budget_remaining_minute,
  provider_quota_remaining,budget_level,retry_count
) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`;

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
        row.priority || null,
        row.provider || 'futpythontrader',
        row.endpoint_family || null,
        row.latency_ms ?? null,
        row.deduped === true,
        row.budget_state || null,
        row.budget_remaining_day ?? null,
        row.budget_remaining_minute ?? null,
        row.provider_quota_remaining ?? null,
        row.budget_level || null,
        row.retry_count ?? 0
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
        // Only real provider attempts: a cache hit, dedup or deferral says nothing about provider health.
        `SELECT outcome, http_status
         FROM fpt_request_ledger
         WHERE outcome = ANY('{upstream,429,error}'::text[])
         ORDER BY recorded_at DESC, ledger_id DESC
         LIMIT $1`,
        [limit]
      ));
      return result.rows;
    }
  };
}
