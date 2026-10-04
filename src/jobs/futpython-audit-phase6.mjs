import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { PHASE6_SQL, phase6Gate, rebuildSeasonRegistry } from '../providers/futpython/seasons.mjs';

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

export async function runPhase6Audit() {
  await migrate();
  return withClient(async client => {
    await rebuildSeasonRegistry(client);
    const summary = (await client.query(PHASE6_SQL)).rows[0] || null;
    const gate = phase6Gate(summary);
    const gaps = await client.query(
      `SELECT country_slug, league_slug, season FROM fpt_season_gaps ORDER BY country_slug, league_slug, season`
    );
    const details = { gate, summary, gaps: gaps.rows };
    await client.query(
      `INSERT INTO fpt_certification_checks(phase, check_code, status, details)
       VALUES('FPT_PHASE6', 'SEASON_REGISTRY', $1, $2::jsonb)`,
      [gate ? 'pass' : 'fail', JSON.stringify(details)]
    );
    return details;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase6Audit()
    .then(result => {
      const summary = result.summary || {};
      console.log('FUTPYTHON_PHASE6_AUDIT ' + JSON.stringify({
        gate: result.gate,
        registry_rows: summary.registry_rows,
        missing_available_seasons: summary.missing_available_seasons,
        gap_rows: summary.gap_rows,
        status_counts: summary.status_counts,
        expected_null: summary.expected_null,
        historical_complete: summary.historical_complete,
        unavailable_marked_complete: summary.unavailable_marked_complete,
        pit: summary.evidence?.pit,
        gaps: result.gaps
      }));
      if (!result.gate) process.exitCode = 1;
    })
    .catch(error => {
      console.error(redact(error.stack || error.message));
      process.exitCode = 1;
    })
    .finally(closePool);
}
