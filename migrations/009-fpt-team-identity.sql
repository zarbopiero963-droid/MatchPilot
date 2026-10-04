CREATE TABLE IF NOT EXISTS fpt_teams (
  internal_team_id text PRIMARY KEY,
  country_slug text NOT NULL,
  competition_slug text NOT NULL,
  canonical_name text NOT NULL,
  provider_team_id text,
  abbreviations jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen date,
  last_seen date,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (country_slug, competition_slug, canonical_name)
);

CREATE TABLE IF NOT EXISTS fpt_team_aliases (
  alias_id bigserial PRIMARY KEY,
  internal_team_id text NOT NULL REFERENCES fpt_teams(internal_team_id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('canonical','alias','abbreviation','historical')),
  first_seen date,
  last_seen date,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (internal_team_id, name)
);

CREATE INDEX IF NOT EXISTS fpt_team_aliases_normalized_idx
  ON fpt_team_aliases(normalized_name);
