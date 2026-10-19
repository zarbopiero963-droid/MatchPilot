// Shared test data: one league season ingested through the real FutPythonTrader path (CSV -> storeDataset -> team
// entities -> normalized facts). Matches come three per date, one of them without a kickoff time, so pagination is
// exercised across same-date boundaries and NULL kickoffs. Used by API and browser tests (R-06).
import {parseCsv} from '../../src/lib/csv.mjs';
import {refreshNormalizedLayer} from '../../src/providers/futpython/query.mjs';
import {storeDataset} from '../../src/providers/futpython/store.mjs';
import {buildTeamEntities, loadTeamSpellings, replaceTeamEntities} from '../../src/providers/futpython/teams.mjs';

export const SEED_TEAMS = ['Ajax', 'PSV', 'Feyenoord', 'AZ', 'Twente', 'Utrecht'];
const HEADERS = ['Date', 'Time', 'Home', 'Away', 'Home_Score', 'Away_Score', 'Odd_1_FT', 'Odd_X_FT', 'Odd_2_FT',
  'Over_FT_2_5', 'BTTS_Yes', 'xG_Home_FT', 'xG_Away_FT'];
const TIMES = ['15:00', '20:45', ''];

export function seedRows(year = 2024) {
  const rows = [];
  let n = 0;
  for (const home of SEED_TEAMS) {
    for (const away of SEED_TEAMS) {
      if (home === away) continue;
      const date = new Date(Date.UTC(year, 7, 1) + Math.floor(n / 3) * 86400000).toISOString().slice(0, 10);
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
export async function seedEredivisie(client, {year = 2024, acquiredAt = new Date(`${year + 1}-06-01T00:00:00Z`)} = {}) {
  const season = `${year}-${year + 1}`;
  const key = `netherlands/eredivisie/${season}`;
  const rows = seedRows(year);
  const text = csv(rows);
  const parsed = parseCsv(text);
  await client.query(`INSERT INTO fpt_catalog(dataset_key,country_slug,league_slug,season,route) VALUES($1,'netherlands','eredivisie',$2,$3)`,
    [key, season, `/api/download/${key}`]);
  await storeDataset(client, {datasetKey: key, sourceKind: 'dataset', providerPath: `/api/download/${key}`,
    countrySlug: 'netherlands', leagueSlug: 'eredivisie', season, text, headers: parsed.headers, rows: parsed.rows, acquiredAt});
  await replaceTeamEntities(client, buildTeamEntities(await loadTeamSpellings(client)));
  await refreshNormalizedLayer(client);
  const {rows: [ids]} = await client.query('SELECT min(internal_competition_id) AS competition, min(season_id) AS season FROM fpt_match_facts');
  const dates = [...new Set(rows.map(row => row.Date))];
  return {competition: ids.competition, season: ids.season, dates, matches: rows.length, seasonLabel: season};
}
