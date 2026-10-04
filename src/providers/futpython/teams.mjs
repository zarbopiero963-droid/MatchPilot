import { createHash } from 'node:crypto';

export function normalizeTeamName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function internalTeamId(countrySlug, competitionSlug, normalized) {
  const raw = [countrySlug || '', competitionSlug || '', normalized || ''].join('|');
  return 'fpt:team:' + createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export function nameKind(name, {canonical = false, historical = false} = {}) {
  if (historical) return 'historical';
  if (canonical) return 'canonical';
  if (/\b(Utd|Ind|L\.P|FC|CF|SC|AFC|AC)\b/i.test(name) || /[A-Za-z]\./.test(name)) return 'abbreviation';
  return 'alias';
}

export function buildTeamEntities(rows) {
  const groups = new Map();
  const historicalLinks = [];
  for (const row of rows) {
    const normalized = normalizeTeamName(row.name);
    if (!normalized) continue;
    if (row.historical === true && row.links_to) {
      historicalLinks.push(row);
      continue;
    }
    const key = `${row.country_slug}|${row.competition_slug}|${normalized}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const row of historicalLinks) {
    const key = `${row.country_slug}|${row.competition_slug}|${normalizeTeamName(row.links_to)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].map(spellings => {
    const ranked = [...spellings].sort((a, b) => (b.seen || 0) - (a.seen || 0) || String(a.name).localeCompare(String(b.name)));
    const canonical = ranked[0];
    const normalized = normalizeTeamName(canonical.name);
    const id = internalTeamId(canonical.country_slug, canonical.competition_slug, normalized);
    const dates = spellings.flatMap(row => [row.first_seen, row.last_seen]).filter(Boolean).sort();
    const aliases = ranked.map((row, index) => ({
      name: row.name,
      normalized_name: normalized,
      kind: nameKind(row.name, {canonical: index === 0, historical: row.historical === true}),
      first_seen: row.first_seen || null,
      last_seen: row.last_seen || null,
      seen: row.seen || 0
    }));
    return {
      internal_team_id: id,
      country_slug: canonical.country_slug,
      competition_slug: canonical.competition_slug,
      canonical_name: canonical.name,
      provider_team_id: canonical.provider_team_id || null,
      abbreviations: aliases.filter(alias => alias.kind === 'abbreviation' || /[A-Za-z]\./.test(alias.name)).map(alias => alias.name),
      first_seen: dates[0] || null,
      last_seen: dates[dates.length - 1] || null,
      provenance: {
        source_provider: 'futpythontrader',
        built_from: 'fpt_match_versions.home/away',
        normalization: 'nfkd-alnum-casefold',
        competition_slug: canonical.competition_slug
      },
      aliases
    };
  });
}

export async function replaceTeamEntities(client, entities) {
  await client.query('BEGIN');
  try {
  await client.query('DELETE FROM fpt_team_aliases');
  await client.query('DELETE FROM fpt_teams');
  const batchSize = 500;
  for (let i = 0; i < entities.length; i += batchSize) {
    const slice = entities.slice(i, i + batchSize);
    await client.query(
      `INSERT INTO fpt_teams(
         internal_team_id, country_slug, competition_slug, canonical_name, provider_team_id,
         abbreviations, first_seen, last_seen, provenance
       )
       SELECT internal_team_id, country_slug, competition_slug, canonical_name, provider_team_id,
              abbreviations, first_seen, last_seen, provenance
       FROM jsonb_to_recordset($1::jsonb) AS x(
         internal_team_id text,
         country_slug text,
         competition_slug text,
         canonical_name text,
         provider_team_id text,
         abbreviations jsonb,
         first_seen date,
         last_seen date,
         provenance jsonb
       )`,
      [JSON.stringify(slice.map(team => ({
        ...team,
        abbreviations: team.abbreviations,
        provenance: team.provenance
      })))]
    );
    const aliases = slice.flatMap(team => team.aliases.map(alias => ({
      internal_team_id: team.internal_team_id,
      ...alias,
      provenance: team.provenance
    })));
    if (!aliases.length) continue;
    await client.query(
      `INSERT INTO fpt_team_aliases(
         internal_team_id, name, normalized_name, kind, first_seen, last_seen, provenance
       )
       SELECT internal_team_id, name, normalized_name, kind, first_seen, last_seen, provenance
       FROM jsonb_to_recordset($1::jsonb) AS x(
         internal_team_id text,
         name text,
         normalized_name text,
         kind text,
         first_seen date,
         last_seen date,
         provenance jsonb
       )`,
      [JSON.stringify(aliases)]
    );
  }
  const result = {teams: entities.length, aliases: entities.reduce((sum, team) => sum + team.aliases.length, 0)};
  await client.query('COMMIT');
  return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already closed */ }
    throw error;
  }
}

export async function loadTeamSpellings(client) {
  const result = await client.query(
    `SELECT country_slug, league_slug AS competition_slug, name,
            min(match_date) AS first_seen, max(match_date) AS last_seen, count(*)::int AS seen
     FROM (
       SELECT country_slug, league_slug, home AS name, match_date
       FROM fpt_match_versions WHERE phase='HISTORICAL' AND home IS NOT NULL AND btrim(home)<>''
       UNION ALL
       SELECT country_slug, league_slug, away AS name, match_date
       FROM fpt_match_versions WHERE phase='HISTORICAL' AND away IS NOT NULL AND btrim(away)<>''
     ) names
     GROUP BY country_slug, league_slug, name`
  );
  return result.rows;
}

export const TEAM_SPLIT_SQL = `SELECT count(*)::int AS n FROM (
  SELECT t.country_slug, t.competition_slug, a.normalized_name
  FROM fpt_team_aliases a
  JOIN fpt_teams t USING (internal_team_id)
  GROUP BY 1, 2, 3
  HAVING count(DISTINCT a.internal_team_id) > 1
) d`;
