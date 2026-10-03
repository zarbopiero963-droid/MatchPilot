CREATE TABLE IF NOT EXISTS mp_catalog_contract (
 id integer PRIMARY KEY CHECK(id=1), version integer NOT NULL, expected_count integer NOT NULL CHECK(expected_count=49),
 digest text NOT NULL, owner_authorization text NOT NULL, evidence_snapshot text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mp_territories (
 id text PRIMARY KEY, name text NOT NULL, kind text NOT NULL CHECK(kind IN ('country','region'))
);
CREATE TABLE IF NOT EXISTS mp_leagues (
 id text PRIMARY KEY CHECK(id IN ('norway 2','germany 1','netherlands 2','netherlands 1','switzerland 1','australia 1','europa champions league','bolivia 1','germany 2','usa 1','denmark 2','england 1','germany 3','belgium 1','china 1','denmark 1','saudi arabia 1','turkey 1','europa league','france 1','ireland 2','europa conference league','finland 1','sweden 1','scotland 1','sweden 2','czech 1','slovenia 1','poland 2','poland 1','turkey 2','peru 1','portugal 1','croatia 1','england 3','italy 1','spain 1','england 2','greece 1','japan 1','south korea 1','ireland 1','italy 2','france 2','brazil 1','spain 2','colombia 1','brazil 2','argentina 1')), name text NOT NULL, territory_id text NOT NULL REFERENCES mp_territories(id),
 contract_id integer NOT NULL REFERENCES mp_catalog_contract(id), source_snapshot text NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_league_aliases (
 source_name text PRIMARY KEY, league_id text NOT NULL REFERENCES mp_leagues(id), evidence_snapshot text NOT NULL
);
CREATE TABLE IF NOT EXISTS mp_teams (
 id text PRIMARY KEY, source_name text NOT NULL, league_id text NOT NULL REFERENCES mp_leagues(id),
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), UNIQUE(league_id,source_name), UNIQUE(id,league_id)
);
CREATE TABLE IF NOT EXISTS mp_team_memberships (
 team_id text NOT NULL REFERENCES mp_teams(id), league_id text NOT NULL REFERENCES mp_leagues(id),
 season text NOT NULL DEFAULT 'unknown', group_name text NOT NULL DEFAULT 'overall',
 first_seen timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(),
 source_snapshot text NOT NULL, PRIMARY KEY(team_id,league_id,season,group_name), FOREIGN KEY(team_id,league_id) REFERENCES mp_teams(id,league_id)
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

CREATE UNIQUE INDEX IF NOT EXISTS mp_teams_identity_league ON mp_teams(id,league_id);
