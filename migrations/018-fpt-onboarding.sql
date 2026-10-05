-- FPT-PR-09 (#12 future league / season onboarding).
-- Every league or season discovered after the baseline follows DISCOVERED -> CANDIDATE -> METADATA_FETCHED ->
-- SEASONS_ENUMERATED -> BACKFILLED -> SCHEMA_AUDITED -> COVERAGE_AUDITED -> HARD_VERIFIED -> ACTIVE.
-- Only ACTIVE datasets reach fpt_match_facts, the layer the site and the assistant read. Raw snapshots and
-- match versions are still written: the raw stays the source of truth and is what the audits check.

CREATE TABLE IF NOT EXISTS fpt_onboarding (
  dataset_key text PRIMARY KEY,
  country_slug text NOT NULL,
  league_slug text NOT NULL,
  season text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('baseline','new_league','new_season')),
  promotion text NOT NULL CHECK (promotion IN ('baseline','auto','owner')),
  state text NOT NULL CHECK (state IN (
    'DISCOVERED','CANDIDATE','METADATA_FETCHED','SEASONS_ENUMERATED','BACKFILLED',
    'SCHEMA_AUDITED','COVERAGE_AUDITED','HARD_VERIFIED','ACTIVE'
  )),
  waiting_for text,
  blocked boolean NOT NULL DEFAULT false,
  blocked_reason text,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  discovered_run_id text,
  verified_at timestamptz,
  activated_at timestamptz,
  activated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (state <> 'ACTIVE' OR activated_at IS NOT NULL),
  CHECK (kind = 'baseline' OR state <> 'ACTIVE' OR verified_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS fpt_onboarding_pending_idx ON fpt_onboarding(state, country_slug, league_slug)
  WHERE state <> 'ACTIVE';

-- Append-only audit trail of every state change and every owner promotion.
CREATE TABLE IF NOT EXISTS fpt_onboarding_events (
  event_id bigserial PRIMARY KEY,
  dataset_key text NOT NULL,
  from_state text,
  to_state text NOT NULL,
  actor text NOT NULL,
  reason text,
  checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  run_id text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fpt_onboarding_events_dataset_idx ON fpt_onboarding_events(dataset_key, recorded_at);

-- Baseline: everything already in the catalog when onboarding starts was covered by the 2026-10-05 certificate.
INSERT INTO fpt_onboarding(dataset_key, country_slug, league_slug, season, kind, promotion, state,
  checks, evidence, discovered_at, verified_at, activated_at, activated_by)
SELECT c.dataset_key, c.country_slug, c.league_slug, c.season, 'baseline', 'baseline', 'ACTIVE',
       '{}'::jsonb,
       jsonb_build_object('baseline', 'catalog at migration 018', 'certificate', 'docs/futpython-certification-2026-10-05.md',
         'availability', s.availability, 'catalog_active', c.active),
       c.first_seen_at, now(), now(), 'migration:018-baseline'
FROM fpt_catalog c
LEFT JOIN fpt_dataset_state s USING (dataset_key)
ON CONFLICT (dataset_key) DO NOTHING;

INSERT INTO fpt_onboarding_events(dataset_key, from_state, to_state, actor, reason)
SELECT o.dataset_key, NULL, 'ACTIVE', 'migration:018-baseline', 'baseline: in the catalog before onboarding existed'
FROM fpt_onboarding o
WHERE o.kind = 'baseline'
  AND NOT EXISTS (SELECT 1 FROM fpt_onboarding_events e WHERE e.dataset_key = o.dataset_key);

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
  -- Production gate (#12 onboarding): a dataset discovered after the baseline enters the facts only once ACTIVE.
  WHERE NOT EXISTS (
    SELECT 1 FROM fpt_onboarding o
    WHERE o.dataset_key = f.dataset_key AND o.state <> 'ACTIVE'
  )
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
