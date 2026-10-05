-- FPT-PR-09 (assistant query layer): typed market and xG columns on fpt_match_facts.
-- Values come from the stored payload of the fact's own version. No raw snapshot or version is rewritten.

ALTER TABLE fpt_match_facts
  ADD COLUMN IF NOT EXISTS odd_home numeric(10,3),
  ADD COLUMN IF NOT EXISTS odd_draw numeric(10,3),
  ADD COLUMN IF NOT EXISTS odd_away numeric(10,3),
  ADD COLUMN IF NOT EXISTS odd_over25 numeric(10,3),
  ADD COLUMN IF NOT EXISTS odd_under25 numeric(10,3),
  ADD COLUMN IF NOT EXISTS odd_btts_yes numeric(10,3),
  ADD COLUMN IF NOT EXISTS favorite_side text,
  ADD COLUMN IF NOT EXISTS favorite_odd numeric(10,3),
  ADD COLUMN IF NOT EXISTS xg_home numeric(8,3),
  ADD COLUMN IF NOT EXISTS xg_away numeric(8,3),
  ADD COLUMN IF NOT EXISTS total_goals integer;

ALTER TABLE fpt_match_facts DROP CONSTRAINT IF EXISTS fpt_match_facts_favorite_side_check;
ALTER TABLE fpt_match_facts ADD CONSTRAINT fpt_match_facts_favorite_side_check
  CHECK (favorite_side IS NULL OR favorite_side IN ('HOME','AWAY','EVEN'));

-- A decimal price is at least 1.01: zero and placeholders are N/D (NULL), never a price.
CREATE OR REPLACE FUNCTION fpt_price(v text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(COALESCE(v, '')) ~ '^\d+([.,]\d+)?$'
     AND replace(btrim(v), ',', '.')::numeric > 1
    THEN round(replace(btrim(v), ',', '.')::numeric, 3)
  END
$$;

CREATE OR REPLACE FUNCTION fpt_num(v text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN btrim(COALESCE(v, '')) ~ '^-?\d+([.,]\d+)?$' THEN replace(btrim(v), ',', '.')::numeric END
$$;

CREATE OR REPLACE FUNCTION fpt_refresh_match_facts()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_rows integer;
BEGIN
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
  FROM fpt_match_facts_at('infinity'::timestamptz) f
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
     OR fpt_match_facts.facts_version IS DISTINCT FROM excluded.facts_version;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;

CREATE INDEX IF NOT EXISTS fpt_match_facts_date_desc_idx ON fpt_match_facts(match_date DESC, internal_match_id);
CREATE INDEX IF NOT EXISTS fpt_match_facts_favorite_idx ON fpt_match_facts(favorite_odd, match_date DESC)
  WHERE favorite_odd IS NOT NULL;
CREATE INDEX IF NOT EXISTS fpt_field_coverage_dataset_field_idx ON fpt_field_coverage(field_name, dimension_key)
  WHERE dimension = 'dataset';

-- Rewrites every fact once to facts_version fpt-facts-2 with the new columns.
SELECT fpt_refresh_match_facts();
ANALYZE fpt_match_facts;
ANALYZE fpt_field_coverage;
