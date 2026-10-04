const DOCS_URL = 'https://futpythontrader.com.br/api-docs';

export function parseCatalogHtml(html) {
  const found = new Map();
  const re = /\/api\/download\/([a-z0-9-]+)\/([a-z0-9-]+)\/(20\d{2}(?:-20\d{2})?)/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const [, country, league, season] = m;
    const datasetKey = `${country}/${league}/${season}`;
    found.set(datasetKey, {
      datasetKey,
      countrySlug: country,
      leagueSlug: league,
      season,
      route: `/api/download/${country}/${league}/${season}`
    });
  }
  return [...found.values()].sort((a, b) => a.datasetKey.localeCompare(b.datasetKey));
}

export async function fetchCatalog({ signal } = {}) {
  const response = await fetch(DOCS_URL, {
    headers: {'user-agent': 'MatchPilot/0.1 catalog-sync'},
    signal: signal || AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error(`FutPython catalog HTTP ${response.status}`);
  const html = await response.text();
  const catalog = parseCatalogHtml(html);
  if (!catalog.length) throw new Error('FutPython catalog returned zero datasets');
  return catalog;
}

export function isCurrentSeason(season, now = new Date()) {
  const y = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  if (/^20\d{2}$/.test(season)) return Number(season) === y;
  const m = season.match(/^(20\d{2})-(20\d{2})$/);
  if (!m) return false;
  const start = Number(m[1]), end = Number(m[2]);
  return month >= 7 ? start === y : end === y;
}
