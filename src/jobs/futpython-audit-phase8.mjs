import { readFile } from 'node:fs/promises';
import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { emitAlert, resolveAlert, configureTelegramOutboundOnly } from '../alerts.mjs';
import { emitRunSummaryAlerts } from './futpython-sync.mjs';
import { checkDataWatchdog, evaluateProviderAlerts, phase8Gate } from './data-watchdog.mjs';

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]')
    .replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot[REDACTED]');
}

function recorder(sent) {
  return async alert => {
    sent.push(alert.code);
    return {attempted: true, channel: 'recorded'};
  };
}

async function mirrorCounts(client) {
  const result = await client.query(`
    SELECT
      (SELECT count(*)::int FROM fpt_raw_snapshots) AS snapshots,
      (SELECT count(*)::int FROM fpt_match_versions) AS versions,
      (SELECT count(*)::int FROM fpt_catalog WHERE active) AS catalog,
      (SELECT count(*)::int FROM fpt_request_ledger) AS ledger,
      (SELECT count(*)::int FROM data_alerts WHERE resolved_at IS NULL) AS open_alerts
  `);
  return result.rows[0];
}

async function rolled(client, fn) {
  await client.query('BEGIN');
  try {
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function runPhase8Audit() {
  await migrate();
  return withClient(async client => {
    const before = await mirrorCounts(client);
    const cases = await rolled(client, async () => {
      const found = {};
      const staleSent = [];
      await client.query(
        `INSERT INTO fpt_sync_runs(run_id, kind, status, started_at, finished_at)
         VALUES ('fpt-phase8-stale','manual','failed', now() + interval '1 minute', now() - interval '10 hours')`
      );
      const stale = await checkDataWatchdog({client, deliver: recorder(staleSent)});
      found.stale = stale.stale === true && staleSent.includes('SYNC_STALE');
      await client.query(
        `UPDATE fpt_dataset_state SET last_error='phase8-fixture'
         WHERE dataset_key = (SELECT dataset_key FROM fpt_dataset_state WHERE last_error IS NULL LIMIT 1)`
      );
      const errorSent = [];
      await checkDataWatchdog({client, deliver: recorder(errorSent)});
      found.dataset_error = errorSent.includes('DATASET_ERRORS') && !errorSent.includes('SYNC_STALE');
      await client.query(
        `INSERT INTO fpt_sync_runs(run_id, kind, status, started_at, finished_at)
         VALUES ('fpt-phase8-fresh','manual','complete', now() + interval '2 minutes', now())`
      );
      await client.query(`UPDATE fpt_dataset_state SET last_error=NULL WHERE last_error='phase8-fixture'`);
      const recoveredSent = [];
      const recovered = await checkDataWatchdog({client, deliver: recorder(recoveredSent)});
      const open = await client.query(
        `SELECT count(*)::int AS n FROM data_alerts
         WHERE code IN ('SYNC_STALE','DATASET_ERRORS') AND resolved_at IS NULL`
      );
      found.recovery = recovered.stale === false && recovered.datasetErrors === 0 && recoveredSent.length === 0;
      found.resolved = found.recovery && open.rows[0].n === 0 && found.stale && found.dataset_error;
      return found;
    });

    const summary = await rolled(client, async () => {
      const sent = [];
      const stats = {
        newFields: new Set(['CertA', 'CertB', 'CertC']),
        newDatasets: new Set(['fixture/league/2099', 'fixture/league/2098']),
        rowDrops: [{datasetKey: 'fixture/league/2099', previousRows: 100, currentRows: 10}],
        failures: [{datasetKey: 'fixture/league/2099', error: 'fixture', status: 404, regression404: true}]
      };
      await emitRunSummaryAlerts(client, stats, {bootstrap: false, deliver: recorder(sent)});
      const again = [];
      await emitRunSummaryAlerts(client, stats, {bootstrap: false, deliver: recorder(again)});
      const failure = await client.query(
        `SELECT severity, payload FROM data_alerts
         WHERE code='SYNC_FAILURES_AGG' AND resolved_at IS NULL
         ORDER BY first_seen_at DESC LIMIT 1`
      );
      return {
        new_field: sent.filter(code => code === 'NEW_FIELDS_AGG').length === 1,
        new_dataset: sent.filter(code => code === 'NEW_DATASETS_AGG').length === 1,
        row_drop: sent.filter(code => code === 'ROW_COUNT_DROPS_AGG').length === 1,
        regression: sent.filter(code => code === 'SYNC_FAILURES_AGG').length === 1
          && failure.rows[0]?.severity === 'critical'
          && Number(failure.rows[0]?.payload?.regressions) === 1,
        aggregated: sent.length === 4,
        suppressed: again.length === 0
      };
    });

    const budget = await rolled(client, async () => {
      const sent = [];
      const deliver = recorder(sent);
      const base = await client.query(
        `SELECT count(*)::int AS n FROM fpt_request_ledger
         WHERE outcome = ANY('{upstream,429,error}'::text[])
           AND recorded_at > now() - interval '1 day'`
      );
      const existing = base.rows[0].n;
      let perDay = null;
      for (let candidate = existing + 9; candidate >= 1; candidate -= 1) {
        const warning = (existing + 7) / candidate;
        const critical = (existing + 9) / candidate;
        if (warning >= 0.7 && warning < 0.9 && critical >= 0.9) { perDay = candidate; break; }
      }
      if (!perDay) throw new Error('no isolated budget fixture limit');
      const limits = {perDay, perMinute: 1000};
      const insert = (outcome, status, n) => client.query(
        `INSERT INTO fpt_request_ledger(recorded_at, dataset_key, url_path, outcome, attempt, http_status, run_id)
         SELECT now(), 'phase8-fixture', '/api/download/fixture', $1, 1, $2, 'phase8-fixture'
         FROM generate_series(1, $3)`,
        [outcome, status, n]
      );
      await insert('upstream', 200, 7);
      const warning = await evaluateProviderAlerts(client, {deliver, limits, circuitFailures: 5});
      const warningSent = sent.splice(0);
      await insert('upstream', 200, 2);
      const critical = await evaluateProviderAlerts(client, {deliver, limits, circuitFailures: 5});
      const criticalSent = sent.splice(0);
      await client.query(`DELETE FROM fpt_request_ledger WHERE run_id='phase8-fixture'`);
      const cleared = await evaluateProviderAlerts(client, {deliver, limits, circuitFailures: 5});
      const clearedSent = sent.splice(0);
      await insert('429', 429, 1);
      const limited = await evaluateProviderAlerts(client, {deliver, limits, circuitFailures: 5});
      const limitedSent = sent.splice(0);
      await client.query(`DELETE FROM fpt_request_ledger WHERE run_id='phase8-fixture'`);
      await insert('error', 500, 5);
      const circuit = await evaluateProviderAlerts(client, {deliver, limits, circuitFailures: 5});
      const circuitSent = sent.splice(0);
      return {
        budget_warning: warning.level === 'warning' && warningSent.includes('BUDGET_WARNING') && !warningSent.includes('BUDGET_CRITICAL'),
        budget_critical: critical.level === 'critical' && criticalSent.includes('BUDGET_CRITICAL'),
        rate_limit: limited.recent429 === 1 && limitedSent.includes('RATE_LIMIT_429'),
        circuit: circuit.circuitOpen === true && circuitSent.includes('CIRCUIT_OPEN'),
        budget_resolved: cleared.level === 'ok' && cleared.recent429 === 0 && cleared.circuitOpen === false && clearedSent.length === 0
      };
    });

    const realSent = [];
    const real = await checkDataWatchdog({deliver: recorder(realSent)});
    const after = await mirrorCounts(client);
    const mirrorUnchanged = JSON.stringify(before) === JSON.stringify(after);

    const telegramConfigured = Boolean(
      process.env.MATCHPILOT_TELEGRAM_BOT_TOKEN?.trim()
      && process.env.MATCHPILOT_TELEGRAM_CHAT_ID?.trim()
    );
    let telegram;
    if (!telegramConfigured) {
      telegram = {configured: false, sent: false, messages: 0, reason: 'missing_config'};
    } else {
      const outbound = await configureTelegramOutboundOnly();
      const input = {
        source: 'futpython',
        severity: 'info',
        code: 'WATCHDOG_CERT',
        key: 'phase8',
        title: 'Watchdog certificato',
        message: 'Certificazione FASE 8. Un solo avviso. La ripetizione è soppressa.'
      };
      const first = await emitAlert(input);
      const second = first.delivered ? await emitAlert(input) : {suppressed: false};
      await resolveAlert({source: 'futpython', code: 'WATCHDOG_CERT', key: 'phase8'});
      telegram = {
        configured: true,
        outbound: outbound.configured === true,
        sent: first.delivered === true && second.suppressed === true,
        secondSuppressed: second.suppressed === true,
        messages: first.delivered === true ? 1 : 0
      };
    }

    const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
    const alerts = await readFile(new URL('../alerts.mjs', import.meta.url), 'utf8');
    const inboundIgnored = !/getUpdates\s*\(/.test(server) && !/getUpdates\s*\(/.test(alerts);
    const details = {
      cases: {...cases, ...summary, ...budget, real_watchdog_quiet: realSent.length === 0 && real.status === 'ok'},
      real: {status: real.status, budget: real.budget, sends: realSent.length},
      telegram,
      inbound_ignored: inboundIgnored,
      mirror_unchanged: mirrorUnchanged,
      before,
      after,
      local_suppression: summary.suppressed === true
    };
    const gate = phase8Gate(details);
    await client.query(
      `INSERT INTO fpt_certification_checks(phase, check_code, status, details)
       VALUES('FPT_PHASE8','WATCHDOG',$1,$2::jsonb)`,
      [gate ? 'pass' : 'fail', JSON.stringify(details)]
    );
    return {gate, details};
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase8Audit()
    .then(result => {
      console.log('FUTPYTHON_PHASE8_AUDIT ' + JSON.stringify({gate: result.gate, ...result.details}));
      if (!result.gate) process.exitCode = 1;
    })
    .catch(error => {
      console.error(redact(error.stack || error.message));
      process.exitCode = 1;
    })
    .finally(closePool);
}
