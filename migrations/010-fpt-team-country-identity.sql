ALTER TABLE fpt_teams
  ADD COLUMN IF NOT EXISTS competitions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE fpt_teams
  DROP CONSTRAINT IF EXISTS fpt_teams_country_slug_competition_slug_canonical_name_key;

ALTER TABLE fpt_teams
  ALTER COLUMN competition_slug DROP NOT NULL;
