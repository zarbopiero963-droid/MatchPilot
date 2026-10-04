import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import {
  auditStoredSnapshot,
  backfillProviderMatchIds,
  loadPhase3Sql,
  phase3SqlGate,
  repairShortSnapshots,
  selectHardSample
} from '../providers/futpython/integrity.mjs';
import { buildTeamEntities, loadTeamSpellings, replaceTeamEntities, TEAM_SPLIT_SQL } from '../providers/futpython/teams.mjs';

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

export async function runPhase3Audit() {
  await migrate();
  return withClient(async client => {
    const repaired = await repairShortSnapshots(client);
    const providerIds = await backfillProviderMatchIds(client);
    const entities = buildTeamEntities(await loadTeamSpellings(client));
    const teamWrite = await replaceTeamEntities(client, entities);
    const splits = await client.query(TEAM_SPLIT_SQL);
    const ajaxCompetition = await client.query(
      `SELECT t.competition_slug
       FROM fpt_team_aliases a
       JOIN fpt_teams t USING (internal_team_id)
       WHERE a.name IN ('Ajax (NED)', 'Ajax (Ned)')
       GROUP BY t.competition_slug
       HAVING count(DISTINCT a.name)=2
       ORDER BY t.competition_slug
       LIMIT 1`
    );
    const competition = ajaxCompetition.rows[0]?.competition_slug || null;
    const ajax = await client.query(
      `SELECT a.name, a.kind, a.internal_team_id, t.canonical_name, t.competition_slug,
              t.first_seen, t.last_seen, t.provider_team_id, t.provenance
       FROM fpt_team_aliases a
       JOIN fpt_teams t USING (internal_team_id)
       WHERE t.competition_slug=$1 AND a.name IN ('Ajax (NED)', 'Ajax (Ned)')
       ORDER BY a.name`,
      [competition]
    );
    await client.query('BEGIN');
    let historical = null;
    if (ajax.rows[0]) {
      await client.query(
        `INSERT INTO fpt_team_aliases(internal_team_id, name, normalized_name, kind, provenance)
         VALUES($1, 'AFC Ajax', $2, 'historical', '{"source":"phase3_probe"}'::jsonb)`,
        [ajax.rows[0].internal_team_id, ajax.rows[0] ? 'afcajax' : 'afcajax']
      );
      const linked = await client.query(
        `SELECT count(*)::int AS n
         FROM fpt_team_aliases
         WHERE internal_team_id=$1 AND name='AFC Ajax' AND kind='historical'`,
        [ajax.rows[0].internal_team_id]
      );
      historical = {linked_ids: linked.rows[0].n === 1 ? 1 : linked.rows[0].n, rolled_back: true};
    }
    await client.query('ROLLBACK');
    const historicalLeft = await client.query(
      `SELECT count(*)::int AS n FROM fpt_team_aliases WHERE name='AFC Ajax'`
    );
    const catalog = await client.query(
      `SELECT c.dataset_key, c.country_slug, c.season, r.row_count
       FROM fpt_catalog c
       JOIN fpt_dataset_state s USING (dataset_key)
       JOIN fpt_raw_snapshots r ON r.snapshot_id = s.last_snapshot_id
       WHERE c.active = true AND s.classification = 'AVAILABLE'`
    );
    const sample = selectHardSample(catalog.rows);
    const sampleAudits = [];
    for (const row of sample) sampleAudits.push(await auditStoredSnapshot(client, row.dataset_key));
    const sql = await loadPhase3Sql(client);
    const sampleGate = sampleAudits.every(row => row.reconciled && row.malformed_csv === 0 && row.header_row_mismatch === 0 && row.missing_home === 0 && row.missing_away === 0 && row.missing_date === 0 && row.date_parse_failures === 0 && row.empty_payload === false && row.hash_ok === true);
    const ajaxIds = new Set(ajax.rows.map(row => row.internal_team_id));
    const teamGate = splits.rows[0].n === 0 && ajax.rows.length === 2 && ajaxIds.size === 1 && historical?.linked_ids === 1 && historicalLeft.rows[0].n === 0;
    const gate = phase3SqlGate(sql) && sampleGate && teamGate;
    const countries = [...new Set(sample.map(row => row.country_slug))];
    const seasonFormats = [...new Set(sample.map(row => /^\d{4}-\d{4}$/.test(row.season) ? 'YYYY-YYYY' : Number(row.season) < 2020 ? 'historical-YYYY' : 'YYYY'))];
    const details = {
      gate,
      sql,
      repaired,
      provider_match_ids: providerIds,
      teams: teamWrite,
      team_splits: splits.rows[0].n,
      ajax,
      historical,
      historical_left: historicalLeft.rows[0].n,
      sample: sampleAudits,
      countries,
      season_formats: seasonFormats
    };
    await client.query(
      `INSERT INTO fpt_certification_checks(phase, check_code, status, details)
       VALUES('FPT_PHASE3', 'INTEGRITY_AND_TEAMS', $1, $2::jsonb)`,
      [gate ? 'pass' : 'fail', JSON.stringify(details)]
    );
    return details;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase3Audit()
    .then(result => {
      console.log('FUTPYTHON_PHASE3_AUDIT ' + JSON.stringify(result));
      if (!result.gate) process.exitCode = 1;
    })
    .catch(error => {
      console.error('FUTPYTHON_PHASE3_AUDIT_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
