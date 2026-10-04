import { withClient } from './db.mjs';

export async function getFutpythonCertificationStatus() {
  return withClient(async client => {
    const [
      catalog,
      states,
      snapshots,
      versions,
      matches,
      fields,
      latestBackfill,
      undefinedStates,
      duplicateCatalog
    ] = await Promise.all([
      client.query(`SELECT
        count(*)::int AS total,
        count(DISTINCT country_slug)::int AS countries,
        count(DISTINCT country_slug || '/' || league_slug)::int AS leagues
        FROM fpt_catalog WHERE active=true`),
      client.query(`SELECT availability,count(*)::int AS n
        FROM fpt_dataset_state s
        JOIN fpt_catalog c USING(dataset_key)
        WHERE c.active=true
        GROUP BY availability ORDER BY availability`),
      client.query(`SELECT count(*)::bigint AS n FROM fpt_raw_snapshots WHERE source_kind='dataset'`),
      client.query(`SELECT count(*)::bigint AS n FROM fpt_match_versions WHERE phase='HISTORICAL'`),
      client.query(`SELECT count(DISTINCT match_key)::bigint AS n FROM fpt_match_versions WHERE phase='HISTORICAL'`),
      client.query(`SELECT count(*)::int AS n FROM fpt_schema_fields`),
      client.query(`SELECT run_id,status,started_at,finished_at,catalog_entries,datasets_attempted,
        resumed_skips,available_count,unavailable_404,error_real_count,rows_seen,rows_inserted,fields_seen,
        catalog_snapshot_id
        FROM fpt_sync_runs WHERE kind='backfill' ORDER BY started_at DESC LIMIT 1`),
      client.query(`SELECT count(*)::int AS n
        FROM fpt_dataset_state s JOIN fpt_catalog c USING(dataset_key)
        WHERE c.active=true AND availability NOT IN ('available','unavailable_404','error','deprecated')`),
      client.query(`SELECT count(*)::int AS n FROM (
        SELECT country_slug,league_slug,season,count(*) AS c
        FROM fpt_catalog WHERE active=true
        GROUP BY 1,2,3 HAVING count(*)>1
      ) d`)
    ]);

    const byAvailability=Object.fromEntries(states.rows.map(r=>[r.availability,r.n]));
    return {
      catalog:{
        total:catalog.rows[0]?.total||0,
        countries:catalog.rows[0]?.countries||0,
        leagues:catalog.rows[0]?.leagues||0
      },
      datasets:{
        available:byAvailability.available||0,
        unavailable_404:byAvailability.unavailable_404||0,
        error_real:byAvailability.error||0,
        deprecated:byAvailability.deprecated||0,
        unknown:(byAvailability.unknown||0)+(byAvailability['']||0),
        undefined_states:undefinedStates.rows[0]?.n||0,
        duplicate_catalog_keys:duplicateCatalog.rows[0]?.n||0
      },
      snapshots:Number(snapshots.rows[0]?.n||0),
      historical_versions:Number(versions.rows[0]?.n||0),
      unique_matches:Number(matches.rows[0]?.n||0),
      schema_fields:fields.rows[0]?.n||0,
      latest_backfill:latestBackfill.rows[0]||null
    };
  });
}
