ALTER TABLE mp_team_memberships ADD CONSTRAINT mp_membership_same_league FOREIGN KEY(team_id,league_id) REFERENCES mp_teams(id,league_id);
