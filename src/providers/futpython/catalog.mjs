const DOCS_PATH = '/api-docs';

function decodeHtml(value='') {
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractSeasons(value='') {
  const seasons = String(value).match(/20\d{2}(?:-20\d{2})?/g) || [];
  return [...new Set(seasons)];
}

function addDataset(found, country, league, season) {
  if (!country || !league || !season) return;
  const datasetKey = `${country}/${league}/${season}`;
  found.set(datasetKey, {
    datasetKey,
    countrySlug: country,
    leagueSlug: league,
    season,
    route: `/api/download/${country}/${league}/${season}`
  });
}

export function parseCatalogHtml(html) {
  const source = String(html || '');
  const found = new Map();

  // Official catalog table: País | Liga | Temporadas | Exemplo de rota.
  // The example route contains canonical country/league slugs; the third cell
  // contains every season actually advertised for that league.
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(source))) {
    const cells = [];
    const cellRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1]))) cells.push(cellMatch[1]);
    if (cells.length < 4) continue;

    const routeText = decodeHtml(cells[3]);
    const routeMatch = routeText.match(
      /\/api\/download\/([a-z0-9-]+)\/([a-z0-9-]+)\/(20\d{2}(?:-20\d{2})?)/i
    );
    if (!routeMatch) continue;

    const [, country, league] = routeMatch;
    const seasons = extractSeasons(decodeHtml(cells[2]));
    for (const season of seasons) addDataset(found, country, league, season);
  }

  // Fallback for a future docs layout where only explicit routes remain
  // machine-readable. This never overwrites expanded table entries.
  const routeRe = /\/api\/download\/([a-z0-9-]+)\/([a-z0-9-]+)\/(20\d{2}(?:-20\d{2})?)/gi;
  let routeMatch;
  while ((routeMatch = routeRe.exec(source))) {
    addDataset(found, routeMatch[1], routeMatch[2], routeMatch[3]);
  }

  return [...found.values()].sort((a, b) => a.datasetKey.localeCompare(b.datasetKey));
}

export async function fetchCatalog({signal, priority='critical', runId=null} = {}) {
  const {requestProviderText} = await import('./client.mjs');
  const result = await requestProviderText({
    path: DOCS_PATH,
    datasetKey: 'catalog',
    priority,
    purpose: 'discovery',
    runId,
    timeoutMs: 30000,
    authenticate: false,
    signal
  });
  if (result.cacheHit || !result.text) throw new Error('FutPython catalog returned no body');
  const catalog = parseCatalogHtml(result.text);
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
