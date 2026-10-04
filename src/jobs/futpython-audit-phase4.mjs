import { withClient, closePool } from '../db.mjs';
import { migrate } from '../migrate.mjs';
import { loadLineageProof, PHASE4_SQL, phase4Gate, refreshAliasCandidates } from '../providers/futpython/registry.mjs';

function redact(value) {
  return String(value || '')
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]')
    .replace(/api_key=[^&\s]+/gi, 'api_key=[REDACTED]');
}

export async function runPhase4Audit() {
  await migrate();
  return withClient(async client => {
    const aliases = await refreshAliasCandidates(client);
    const summary = (await client.query(PHASE4_SQL)).rows[0];
    const gate = phase4Gate(summary, {suppressedAliases: 0});
    const lineage = await loadLineageProof(client);
    const rowsSeen = await client.query(
      `SELECT field_name, rows_seen, unique_rows_seen, seasons_seen, source_kinds, type_collision, queryable, filterable
       FROM fpt_schema_fields WHERE field_name IN ('Home','Match_ID','AH_Home_neg_0_5','AH_H_neg_0_5')
       ORDER BY field_name`
    );
    const candidatePairs = await client.query(
      `SELECT field_name, alias_candidates
       FROM fpt_schema_fields
       WHERE jsonb_array_length(alias_candidates) > 0
       ORDER BY field_name
       LIMIT 8`
    );
    const lineageOk = Boolean(lineage.home?.raw_matches_normalized)
      && lineage.home?.snapshot_present === true
      && lineage.home?.source_provider === 'futpythontrader'
      && lineage.home?.parser_version === 'fpt-csv-1'
      && lineage.home?.schema_version === 'fpt-schema-4'
      && lineage.home?.transform_version === 'fpt-norm-1'
      && lineage.date?.transform === 'dmy_or_iso_date'
      && lineage.date?.normalized_field === 'match_date'
      && lineage.date?.snapshot_present === true;
    const passed = gate && lineageOk;
    const details = {
      gate: passed,
      summary,
      suppressed_aliases: [],
      alias_fields: aliases,
      candidate_examples: candidatePairs.rows,
      rows_seen_versus_unique: rowsSeen.rows,
      lineage
    };
    await client.query(
      `INSERT INTO fpt_certification_checks(phase, check_code, status, details)
       VALUES('FPT_PHASE4', 'SCHEMA_REGISTRY_AND_LINEAGE', $1, $2::jsonb)`,
      [passed ? 'pass' : 'fail', JSON.stringify(details)]
    );
    return details;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPhase4Audit()
    .then(result => {
      console.log('FUTPYTHON_PHASE4_AUDIT ' + JSON.stringify(result));
      if (!result.gate) process.exitCode = 1;
    })
    .catch(error => {
      console.error('FUTPYTHON_PHASE4_AUDIT_FATAL', redact(error?.message || error));
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
