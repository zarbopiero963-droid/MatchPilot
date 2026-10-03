CREATE TABLE IF NOT EXISTS mp_catalog_contract (
 id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL, expected_count integer NOT NULL CHECK(expected_count=49),
 digest text NOT NULL, owner_authorization text NOT NULL, evidence_snapshot text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mp_territories (
 id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('country','region'))
);
CREATE TABLE IF NOT EXISTS mp_leagues (
 id text PRIMARY KEY, name text NOT NULL, territory_id text NOT NULL REFERENCES mp_territories(id),
 contract_id integer NOT NULL REFERENCES mp_catalog_contract(id), source_snapshot text NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_league_aliases (
 source_name text PRIMARY KEY, league_id text NOT NULL REFERENCES mp_leagues(id), evidence_snapshot text NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_teams (
 id text PRIMARY KEY, source_name text NOT NULL, league_id text NOT NULL REFERENCES mp_leagues(id),
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), UNIQUE(league_id,source_name)
);
CREATE TABLE IF NOT EXISTS mp_team_memberships (
 team_id text NOT NULL REFERENCES mp_teams(id), league_id text NOT NULL REFERENCES mp_leagues(id),
 season text NOT NULL DEFAULT 'unknown', group_name text NOT NULL DEFAULT 'overall',
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
 source_snapshot text NOT NULL, PRIMARY KEY(team_id,league_id,season,group_name)
);
CREATE TABLE IF NOT EXISTS mp_roster_observations (
 snapshot_id text PRIMARY KEY, league_id text NOT NULL REFERENCES mp_leagues(id), group_name text NOT NULL,
 season text NOT NULL DEFAULT 'unknown', team_count integer NOT NULL CHECK(team_count>0), observed_at timestamptz NOT NULL DEFAULT now(),
 coverage text NOT NULL CHECK(coverage IN ('observed_group','observed_all_exposed_groups')), source_match_id text NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_catalog_quarantine (
 id bigserial PRIMARY KEY, snapshot_id text NOT NULL, reason text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW mp_catalog_coverage AS
 SELECT l.id,l.name,t.name AS territory,t.kind,
 (SELECT count(*) FROM mp_teams x WHERE x.league_id=l.id) AS team_count,
 (SELECT max(o.observed_at) FROM mp_roster_observations o WHERE o.league_id=l.id) AS last_observed,
 CASE WHEN EXISTS(SELECT 1 FROM mp_roster_observations o WHERE o.league_id=l.id)
 THEN 'partial_observed' ELSE 'pending_unavailable' END AS status
 FROM mp_leagues l JOIN mp_territories t ON t.id=l.territory_id;
