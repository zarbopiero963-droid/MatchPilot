import { parseCsv } from '../../lib/csv.mjs';
import { createRequestBudget, budgetConfig, safeProviderPath } from './budget.mjs';
import { createPgLedger } from './ledger.mjs';

export { safeProviderPath };

let budget;

function providerBase() {
  const raw = process.env.FUTPYTHON_BASE_URL?.trim() || 'https://futpythontrader.com.br';
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.pathname !== '/') {
    throw new Error('FUTPYTHON_BASE_URL must be an origin without credentials, path, or query');
  }
  return url.origin;
}

export function getRequestBudget() {
  if (!budget) {
    budget = createRequestBudget({
      ledger: createPgLedger(),
      fetchImpl: (url, init) => fetch(url, init),
      config: budgetConfig(),
      baseUrl: providerBase()
    });
  }
  return budget;
}

export function setRequestBudgetForTests(next) {
  budget = next || null;
}

export async function requestProviderText(opts) {
  return getRequestBudget().requestText(opts);
}

async function fetchCsv(path, timeoutMs, opts = {}) {
  const result = await requestProviderText({
    path,
    timeoutMs,
    datasetKey: opts.datasetKey || null,
    runId: opts.runId || null,
    priority: opts.priority || 'critical',
    purpose: opts.purpose,
    cacheLookup: opts.cacheLookup,
    authenticate: opts.authenticate !== false
  });
  if (result.cacheHit) {
    return {cacheHit: true, text: '', headers: [], rows: [], providerPath: result.providerPath};
  }
  const parsed = parseCsv(result.text);
  return {cacheHit: false, text: result.text, ...parsed, providerPath: result.providerPath || safeProviderPath(path)};
}

export function fetchDataset(entry, opts = {}) {
  return fetchCsv(entry.route, 60000, {...opts, datasetKey: entry.datasetKey || opts.datasetKey});
}

export function fetchToday(dateIso, opts = {}) {
  return fetchCsv(
    `/api/jogos-do-dia?date=${encodeURIComponent(dateIso)}&format=csv`,
    45000,
    {...opts, purpose: 'today', datasetKey: opts.datasetKey || `today/${dateIso}`}
  );
}
