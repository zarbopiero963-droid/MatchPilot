// FPT-FACTS-GATE: the refresh of fpt_match_facts with the onboarding gate applied to the versions, not to the result.
//
// The database function fpt_refresh_match_facts() (migration 018) takes the latest version of every match across all
// datasets (fpt_match_facts_at) and only then drops the matches whose latest version belongs to a dataset not yet ACTIVE.
// So a match that also appears in a dataset still being onboarded disappears from the facts (never inserted), or stays
// frozen on an old version (never updated), as soon as that dataset stores a newer version of it. Here the gate filters
// the candidate versions first: a version is admissible when its dataset has no onboarding row (baseline) or is ACTIVE,
// and each match takes its latest admissible version. With no dataset in onboarding the result is the legacy one.
//
// The fix lives in the application, not in a migration: the legacy functions stay in the database, unused by this code,
// and nothing in fpt_match_versions (the history) is read differently or written. Only the derived fpt_match_facts rows
// change, through the same INSERT ... ON CONFLICT as migration 018, and they are never deleted.

// The rows of fpt_match_facts_at($at), restricted to admissible versions. `$at` is the first query parameter.
export const ADMISSIBLE_FACTS_SQL = `
  WITH latest AS (
    SELECT DISTINCT ON (v.match_key) v.*
    FROM fpt_match_versions v
    WHERE v.acquired_at <= $1::timestamptz
      AND NOT EXISTS (SELECT 1 FROM fpt_onboarding o WHERE o.dataset_key = v.dataset_key AND o.state <> 'ACTIVE')
    ORDER BY v.match_key, v.acquired_at DESC, v.version_id DESC
  ),
  names AS (
    SELECT t.country_slug, a.name, min(a.internal_team_id) AS team_id
    FROM fpt_team_aliases a JOIN fpt_teams t USING (internal_team_id)
    GROUP BY t.country_slug, a.name
    HAVING count(DISTINCT a.internal_team_id) = 1
  )
  SELECT l.match_key AS internal_match_id,
         l.version_id,
         l.dataset_key,
         l.phase,
         l.acquired_at,
         CASE WHEN l.country_slug IS NOT NULL AND l.league_slug IS NOT NULL
           THEN 'fpt:competition:' || md5(l.country_slug || '|' || l.league_slug) END AS internal_competition_id,
         CASE WHEN l.country_slug IS NOT NULL AND l.league_slug IS NOT NULL AND l.season IS NOT NULL
           THEN 'fpt:season:' || md5(l.country_slug || '|' || l.league_slug || '|' || l.season) END AS season_id,
         l.match_date,
         NULLIF(btrim(l.match_time), '') AS kickoff_local_time,
         h.team_id AS home_team_id,
         a.team_id AS away_team_id,
         l.provider_match_id,
         CASE WHEN l.phase = 'HISTORICAL' THEN fpt_score_int(l.payload->>'Home_Score') END AS home_score,
         CASE WHEN l.phase = 'HISTORICAL' THEN fpt_score_int(l.payload->>'Away_Score') END AS away_score,
         CASE
           WHEN l.phase <> 'HISTORICAL' THEN 'NOT_STARTED'
           WHEN fpt_score_int(l.payload->>'Home_Score') IS NOT NULL
            AND fpt_score_int(l.payload->>'Away_Score') IS NOT NULL THEN 'FINAL'
           ELSE 'NO_RESULT'
         END AS result_status
  FROM latest l
  LEFT JOIN names h ON h.country_slug = l.country_slug AND h.name = l.home
  LEFT JOIN names a ON a.country_slug = l.country_slug AND a.name = l.away`;

// The latest admissible version of one match, for the certificate's staleness check (`f` is the facts row).
export const LATEST_ADMISSIBLE_VERSION_SQL = `(SELECT v.version_id FROM fpt_match_versions v
    WHERE v.match_key = f.match_key
      AND NOT EXISTS (SELECT 1 FROM fpt_onboarding o WHERE o.dataset_key = v.dataset_key AND o.state <> 'ACTIVE')
    ORDER BY v.acquired_at DESC, v.version_id DESC LIMIT 1)`;

// Migration 018's refresh, columns and conflict rule unchanged, over the admissible rows.
const REFRESH_SQL = `
  INSERT INTO fpt_match_facts(
    internal_match_id, match_key, version_id, snapshot_id, dataset_key, phase, acquired_at,
    internal_competition_id, season_id, country_slug, league_slug, season, match_date,
    kickoff_local_time, kickoff_utc, kickoff_tz_status, home_team_id, away_team_id, home_name, away_name,
    provider_match_id, provider_competition_id, home_score, away_score, result_status,
    odd_home, odd_draw, odd_away, odd_over25, odd_under25, odd_btts_yes, favorite_side, favorite_odd,
    xg_home, xg_away, total_goals,
    source_provider, parser_version, schema_version, transform_version, facts_version, refreshed_at
  )
  SELECT f.internal_match_id, f.internal_match_id, f.version_id, v.snapshot_id, f.dataset_key, f.phase, f.acquired_at,
         f.internal_competition_id, f.season_id, v.country_slug, v.league_slug, v.season, f.match_date,
         f.kickoff_local_time, NULL, 'PROVIDER_TZ_UNDOCUMENTED', f.home_team_id, f.away_team_id, v.home, v.away,
         f.provider_match_id, NULL, f.home_score, f.away_score, f.result_status,
         m.odd_home, m.odd_draw, m.odd_away, m.odd_over25, m.odd_under25, m.odd_btts_yes,
         CASE WHEN m.odd_home IS NULL OR m.odd_away IS NULL THEN NULL
              WHEN m.odd_home < m.odd_away THEN 'HOME'
              WHEN m.odd_home > m.odd_away THEN 'AWAY'
              ELSE 'EVEN' END,
         CASE WHEN m.odd_home IS NULL OR m.odd_away IS NULL THEN NULL ELSE least(m.odd_home, m.odd_away) END,
         CASE WHEN f.phase = 'HISTORICAL' THEN fpt_num(v.payload->>'xG_Home_FT') END,
         CASE WHEN f.phase = 'HISTORICAL' THEN fpt_num(v.payload->>'xG_Away_FT') END,
         CASE WHEN f.home_score IS NOT NULL AND f.away_score IS NOT NULL THEN f.home_score + f.away_score END,
         v.source_provider, v.parser_version, v.schema_version, v.transform_version, 'fpt-facts-2', now()
  FROM (${ADMISSIBLE_FACTS_SQL}) f
  JOIN fpt_match_versions v ON v.version_id = f.version_id
  CROSS JOIN LATERAL (
    SELECT COALESCE(fpt_price(v.payload->>'Odd_1_FT'), fpt_price(v.payload->>'Odd_H_FT')) AS odd_home,
           COALESCE(fpt_price(v.payload->>'Odd_X_FT'), fpt_price(v.payload->>'Odd_D_FT')) AS odd_draw,
           COALESCE(fpt_price(v.payload->>'Odd_2_FT'), fpt_price(v.payload->>'Odd_A_FT')) AS odd_away,
           COALESCE(fpt_price(v.payload->>'Over_FT_2_5'), fpt_price(v.payload->>'Odd_Over25_FT')) AS odd_over25,
           COALESCE(fpt_price(v.payload->>'Under_FT_2_5'), fpt_price(v.payload->>'Odd_Under25_FT')) AS odd_under25,
           COALESCE(fpt_price(v.payload->>'BTTS_Yes'), fpt_price(v.payload->>'Odd_BTTS_Yes')) AS odd_btts_yes
  ) m
  ON CONFLICT (internal_match_id) DO UPDATE SET
    version_id = excluded.version_id,
    snapshot_id = excluded.snapshot_id,
    dataset_key = excluded.dataset_key,
    phase = excluded.phase,
    acquired_at = excluded.acquired_at,
    internal_competition_id = excluded.internal_competition_id,
    season_id = excluded.season_id,
    country_slug = excluded.country_slug,
    league_slug = excluded.league_slug,
    season = excluded.season,
    match_date = excluded.match_date,
    kickoff_local_time = excluded.kickoff_local_time,
    home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id,
    home_name = excluded.home_name,
    away_name = excluded.away_name,
    provider_match_id = excluded.provider_match_id,
    home_score = excluded.home_score,
    away_score = excluded.away_score,
    result_status = excluded.result_status,
    odd_home = excluded.odd_home,
    odd_draw = excluded.odd_draw,
    odd_away = excluded.odd_away,
    odd_over25 = excluded.odd_over25,
    odd_under25 = excluded.odd_under25,
    odd_btts_yes = excluded.odd_btts_yes,
    favorite_side = excluded.favorite_side,
    favorite_odd = excluded.favorite_odd,
    xg_home = excluded.xg_home,
    xg_away = excluded.xg_away,
    total_goals = excluded.total_goals,
    source_provider = excluded.source_provider,
    parser_version = excluded.parser_version,
    schema_version = excluded.schema_version,
    transform_version = excluded.transform_version,
    facts_version = excluded.facts_version,
    refreshed_at = excluded.refreshed_at
  WHERE fpt_match_facts.version_id IS DISTINCT FROM excluded.version_id
     OR fpt_match_facts.home_team_id IS DISTINCT FROM excluded.home_team_id
     OR fpt_match_facts.away_team_id IS DISTINCT FROM excluded.away_team_id
     OR fpt_match_facts.facts_version IS DISTINCT FROM excluded.facts_version`;

// Inserts or updates the facts of every match from its latest admissible version; returns the rows written.
export async function refreshMatchFacts(client) {
  const result = await client.query(REFRESH_SQL, ['infinity']);
  return result.rowCount;
}

// Read-only measure of the facts against the admissible versions (FPT-FACTS-GATE recovery check):
// - hidden: matches with an admissible version and no facts row (what the legacy gate dropped);
// - stale: facts rows not on their match's latest admissible version (what the legacy gate froze);
// - duplicate_ids: facts rows beyond one per internal_match_id (0 by the primary key; measured, not assumed);
// - history: number of versions and an order-independent digest of (version_id, payload_sha256, dataset_key), so a
//   caller can prove a refresh left the history untouched.
export const FACTS_GAP_SQL = `SELECT
    (SELECT count(*)::bigint FROM fpt_match_facts) AS facts_rows,
    (SELECT count(*)::bigint - count(DISTINCT internal_match_id) FROM fpt_match_facts) AS duplicate_ids,
    (SELECT count(DISTINCT v.match_key)::bigint FROM fpt_match_versions v
       WHERE NOT EXISTS (SELECT 1 FROM fpt_onboarding o WHERE o.dataset_key = v.dataset_key AND o.state <> 'ACTIVE')
         AND NOT EXISTS (SELECT 1 FROM fpt_match_facts f WHERE f.internal_match_id = v.match_key)) AS hidden,
    (SELECT count(*)::bigint FROM fpt_match_facts f
       WHERE f.version_id IS DISTINCT FROM ${LATEST_ADMISSIBLE_VERSION_SQL}) AS stale,
    (SELECT count(*)::bigint FROM fpt_match_versions) AS history_versions,
    (SELECT md5(string_agg(version_id || ':' || payload_sha256 || ':' || dataset_key, ',' ORDER BY version_id)) FROM fpt_match_versions)
      AS history_digest,
    (SELECT max(refreshed_at) FROM fpt_match_facts) AS last_refreshed_at`;

export async function measureFactsGap(client) {
  const row = (await client.query(FACTS_GAP_SQL)).rows[0];
  return {facts_rows: Number(row.facts_rows), duplicate_ids: Number(row.duplicate_ids), hidden: Number(row.hidden), stale: Number(row.stale),
    history_versions: Number(row.history_versions), history_digest: row.history_digest,
    last_refreshed_at: row.last_refreshed_at ? new Date(row.last_refreshed_at).toISOString() : null};
}
