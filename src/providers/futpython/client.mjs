import { parseCsv } from '../../lib/csv.mjs';

const BASE = 'https://futpythontrader.com.br';

function key() {
  const value = process.env.FUTPYTHON_API_KEY?.trim();
  if (!value) throw new Error('FUTPYTHON_API_KEY missing');
  return value;
}

async function fetchCsv(path, timeoutMs = 45000) {
  const url = new URL(path, BASE);
  url.searchParams.set('api_key', key());
  const response = await fetch(url, {
    headers: {'user-agent': 'MatchPilot/0.1 futpython-sync'},
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`FutPython HTTP ${response.status}`);
  const parsed = parseCsv(text);
  return { text, ...parsed, providerPath: url.pathname };
}

export function fetchDataset(entry) {
  return fetchCsv(entry.route, 60000);
}

export function fetchToday(dateIso) {
  return fetchCsv(`/api/jogos-do-dia?date=${encodeURIComponent(dateIso)}&format=csv`, 45000);
}
