// Shared test data: one league season ingested through the real FutPythonTrader path (CSV -> storeDataset -> team
// entities -> normalized facts). Matches come three per date, one of them without a kickoff time, so pagination is
// exercised across same-date boundaries and NULL kickoffs. Used by API and browser tests (R-06).
import {parseCsv} from '../../src/lib/csv.mjs';
import {refreshNormalizedLayer} from '../../src/providers/futpython/query.mjs';
import {persistOutcome} from '../../src/providers/futpython/classification.mjs';
import {rebuildSeasonRegistry} from '../../src/providers/futpython/seasons.mjs';
import {storeDataset} from '../../src/providers/futpython/store.mjs';
import {buildTeamEntities, loadTeamSpellings, replaceTeamEntities} from '../../src/providers/futpython/teams.mjs';

export const SEED_TEAMS = ['Ajax', 'PSV', 'Feyenoord', 'AZ', 'Twente', 'Utrecht'];
const HEADERS = ['Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT',
  'Over_FT_2_5', 'BTTS_Yes', 'xG_Home_FT', 'xG_Away_FT'];
const TIMES = ['15:00', '20:45', ''];

export function seedRows(year = 2024, {teams = SEED_TEAMS, perDay = 3} = {}) {
  const rows = [];
  let n = 0;
  for (const home of teams) {
    for (const away of teams) {
      if (home === away) continue;
      const date = new Date(Date.UTC(year, 7, 1) + Math.floor(n / perDay) * 86400000).toISOString().slice(0, 10);
      const hs = (home.length + n) % 4;
      const as = (away.length + n) % 3;
      const oddHome = (1.3 + (n % 9) * 0.15).toFixed(2);
      rows.push({
        Date: date, Time: TIMES[n % 3], Home: home, Away: away, Home_Score: String(hs), Away_Score: String(as),
        Odd_1_FT: n % 11 === 0 ? '0' : oddHome, Odd_X_FT: '3.40', Odd_2_FT: (6.2 - Number(oddHome)).toFixed(2),
        Over_FT_2_5: '1.90', BTTS_Yes: '1.80', xG_Home_FT: (hs * 0.8 + 0.3).toFixed(2), xG_Away_FT: (as * 0.7 + 0.2).toFixed(2),
      });
      n++;
    }
  }
  return rows;
}

const csv = rows => HEADERS.join(',') + '\n' + rows.map(r => HEADERS.map(h => r[h] ?? '').join(',')).join('\n') + '\n';

// Seeds one season (30 matches over 10 dates starting <year>-08-01). Returns ids the tests need.
export const seedEredivisie = (client, {year = 2024, acquiredAt} = {}) => seedLeague(client, {year, acquiredAt});

// One league season through the same path; teams and matches per day are configurable (Browser QA archive).
export async function seedLeague(client, {country = 'netherlands', league = 'eredivisie', teams = SEED_TEAMS, perDay = 3, year = 2024,
  acquiredAt = new Date(`${year + 1}-06-01T00:00:00Z`)} = {}) {
  const season = `${year}-${year + 1}`;
  const key = `${country}/${league}/${season}`;
  const rows = seedRows(year, {teams, perDay});
  const text = csv(rows);
  const parsed = parseCsv(text);
  await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,$2,$3,$4,$5)`,
    [key, country, league, season, `/api/download/${key}`]);
  await storeDataset(client, {datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`,
    countrySlug: country, leagueSlug: league, season, text, headers: parsed.headers, rows: parsed.rows, acquiredAt});
  // A successful download is classified as the sync job does (phase 2), so the season registry lists it.
  await client.query('INSERT INTO fpt_dataset_state(dataset_key) VALUES ($1) ON CONFLICT (dataset_key) DO NOTHING', [key]);
  await persistOutcome(client, key, {kind: 'success', providerPath: `/api/download/${key}`});
  await replaceTeamEntities(client, buildTeamEntities(await loadTeamSpellings(client)));
  await refreshNormalizedLayer(client);
  // The season registry (phase 6 of the real pipeline) feeds the competitions list.
  await rebuildSeasonRegistry(client);
  const {rows: [ids]} = await client.query('SELECT min(internal_competition_id) AS competition, min(season_id) AS season FROM fpt_match_facts WHERE dataset_key = $1', [key]);
  const dates = [...new Set(rows.map(row => row.Date))];
  return {competition: ids.competition, season: ids.season, dates, matches: rows.length, seasonLabel: season};
}

// The Browser QA archive (MP-OWNER-BROWSER-QA-HARD-GATE-01): two competitions sharing dates, one of them with 28 matches
// on a day, so the Daily Board must page ("Carica altre partite") and mixes competitions in kickoff order.
export const QA_LALIGA_TEAMS = ['Barcelona', 'Real Madrid', 'Atletico', 'Sevilla', 'Valencia', 'Betis', 'Villarreal', 'Getafe'];
export async function seedQaArchive(client) {
  const eredivisie = await seedLeague(client);
  const laliga = await seedLeague(client, {country: 'spain', league: 'laliga', teams: QA_LALIGA_TEAMS, perDay: 28});
  return {eredivisie, laliga, busyDay: laliga.dates[0], matches: eredivisie.matches + laliga.matches};
}
