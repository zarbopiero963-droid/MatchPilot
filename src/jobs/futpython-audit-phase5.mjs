import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { PHASE5_SQL, phase5Gate, rebuildCoverage } from '../providers/futpython/coverage.mjs';

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

export async function runPhase5Audit() {
  await migrate();
  return withClient(async client => {
    const audit = await rebuildCoverage(client);
    const summary = (await client.query(PHASE5_SQL)).rows[0] || null;
    const gate = phase5Gate(summary);
    const examples = await client.query(
      `SELECT field_name, coverage_class, coverage_tags, rows_scoped, nonempty_rows
       FROM fpt_field_coverage
       WHERE dimension = 'global'
         AND field_name IN ('Home','Date','Match_ID','AH_Home_neg_0_5','AH_H_neg_0_5')
       ORDER BY field_name`
    );
    const details = {
      gate,
      summary,
      class_counts: audit.class_counts,
      tag_counts: audit.tag_counts,
      payload_mismatches: audit.payload_mismatches,
      rollup_mismatches: audit.rollup_mismatches,
      class_mismatches: audit.class_mismatches,
      historical_team_unresolved: audit.historical_team_unresolved,
      today_country_unresolved: audit.today_country_unresolved,
      team_census: false,
      team_sample_mismatches: audit.team_sample_mismatches,
      sample_teams: audit.sample_teams,
      sample_fields: ['Home', 'Date', 'Match_ID'],
      diff_sample: audit.sample,
      examples: examples.rows
    };
    await client.query(
      `INSERT INTO fpt_certification_checks(phase, check_code, status, details)
       VALUES('FPT_PHASE5', 'FIELD_COVERAGE', $1, $2::jsonb)`,
      [gate ? 'pass' : 'fail', JSON.stringify(details)]
    );
    return details;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase5Audit()
    .then(result => {
      const summary = {
        gate: result.gate,
        class_counts: result.class_counts,
        tag_counts: result.tag_counts,
        payload_mismatches: result.payload_mismatches,
        rollup_mismatches: result.rollup_mismatches,
        class_mismatches: result.class_mismatches,
        historical_team_unresolved: result.historical_team_unresolved,
        today_country_unresolved: result.today_country_unresolved,
        team_census: false,
        team_sample_mismatches: result.team_sample_mismatches,
        sample_teams: result.sample_teams,
        sample_fields: result.sample_fields,
        registry_fields: result.summary?.registry_fields,
        global_fields: result.summary?.global_fields,
        normalized_rows: result.summary?.normalized_rows,
        team_rows: result.summary?.team_rows,
        dataset_rows: result.summary?.dataset_rows,
        league_rows: result.summary?.league_rows,
        season_rows: result.summary?.season_rows,
        period_rows: result.summary?.period_rows,
        examples: result.examples,
        diff_sample: result.diff_sample
      };
      console.log('FUTPYTHON_PHASE5_AUDIT ' + JSON.stringify(summary));
      if (!result.gate) process.exitCode = 1;
    })
    .catch(error => {
      console.error('FUTPYTHON_PHASE5_AUDIT_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
