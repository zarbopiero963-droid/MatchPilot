// R-05 (#3, #97): read-only web shell. Every value shown comes from the MatchPilot API v1; the browser computes
// nothing (MP-WEB-011). Missing values are shown as N/D, never as zero (MP-WEB-005). Every view has explicit loading,
// empty, partial and error states (MP-WEB-010), and a later navigation always wins over an earlier view still
// loading. Text is inserted with textContent only: API data is never parsed as HTML.

const ND = 'N/D';

class ApiFailure extends Error {
  constructor(status, code, message) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name.startsWith('on')) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

async function getJson(path) {
  let response;
  try {
    response = await fetch(path, {headers: {accept: 'application/json'}, credentials: 'same-origin'});
  } catch {
    throw new ApiFailure(0, 'NETWORK', 'rete non raggiungibile');
  }
  if (response.status === 401) {
    // Owner login enforced (R-04): go to the login page and come back here.
    location.assign(`/login?next=${encodeURIComponent(location.pathname + location.hash)}`);
    throw new ApiFailure(401, 'UNAUTHENTICATED', 'accesso richiesto');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(response.status, body?.error?.code, body?.error?.message);
  if (!body || typeof body !== 'object' || !('data' in body)) throw new ApiFailure(response.status, 'BAD_ENVELOPE', 'risposta senza envelope v1');
  return body;
}

// ---- Value rendering ----

const LABELS = {
  status: 'Stato', product: 'Prodotto', lastRun: 'Ultimo controllo', activeDatasets: 'Dataset attivi', schemaFields: 'Campi di schema',
  datasetsWithErrors: 'Dataset con errori', alerts: 'Avvisi', catalog: 'Catalogo', datasets: 'Dataset', snapshots: 'Snapshot',
  historical_versions: 'Versioni storiche', unique_matches: 'Partite uniche', schema_fields: 'Campi di schema', latest_backfill: 'Ultimo backfill',
  phase1_checks: 'Controlli fase 1', gate: 'Gate superato', total: 'Totale', countries: 'Paesi', leagues: 'Campionati',
};
const label = key => LABELS[key] || key.replace(/_/g, ' ');

// Numbers are shown exactly as the API sent them (MP-WEB-011): integers get Italian digit grouping, other numbers keep
// every digit and only swap the decimal point for a comma. Nothing is rounded in the browser.
function formatNumber(value) {
  if (Number.isSafeInteger(value)) return value.toLocaleString('it-IT', {maximumFractionDigits: 0});
  return String(value).replace('.', ',');
}

export function formatScalar(value) {
  const missing = value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))
    || (typeof value === 'string' && value.trim() === '');
  if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, ND);
  if (typeof value === 'boolean') return el('span', {class: value ? 'ok' : 'bad'}, value ? 'sì' : 'no');
  if (typeof value === 'number') return document.createTextNode(formatNumber(value));
  return document.createTextNode(String(value));
}

function renderValue(value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return el('span', {class: 'empty'}, 'nessuno');
    return el('ol', {}, value.map(item => el('li', {}, renderValue(item))));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return el('span', {class: 'empty'}, 'nessuno');
    return el('dl', {}, entries.flatMap(([key, item]) => [el('dt', {}, label(key)), el('dd', {}, renderValue(item))]));
  }
  return formatScalar(value);
}

const metaLine = body => el('p', {class: 'meta'},
  'Fonte: ', body.meta?.source ?? ND, ' · generato: ', body.meta?.generated_at ?? ND, ' · versione codice: ', body.meta?.code_version ?? ND);

const loading = what => el('p', {class: 'state loading', role: 'status'}, `Caricamento ${what}…`);

function errorState(error, retry) {
  return el('div', {class: 'state error', role: 'alert'},
    el('p', {}, `Impossibile caricare i dati (${error.code}). `, error.message ? `Dettaglio: ${error.message}.` : ''),
    el('button', {type: 'button', onclick: retry}, 'Riprova'));
}

// ---- Views ----

async function statusView() {
  const body = await getJson('/api/v1/health');
  const data = body.data || {};
  return [
    el('h1', {}, 'MatchPilot'),
    el('p', {class: 'lead'}, 'Sports Trading OS. Sito in sola lettura sui dati raccolti da MatchPilot.'),
    el('section', {class: 'card', 'data-testid': 'health'},
      el('h2', {}, 'Stato del servizio'),
      el('dl', {},
        el('dt', {}, 'Stato'), el('dd', {'data-field': 'status'}, formatScalar(data.status)),
        el('dt', {}, 'Prodotto'), el('dd', {'data-field': 'product'}, formatScalar(data.product)),
        el('dt', {}, 'Versione API'), el('dd', {'data-field': 'api_version'}, formatScalar(body.api_version))),
      metaLine(body)),
    el('div', {class: 'grid'},
      ['Daily Board', 'Match Center', 'Replay storico', 'Backtest PIT'].map(name => el('div', {class: 'card'},
        el('h2', {}, name), el('p', {class: 'state empty'}, 'In costruzione: nessun dato mostrato finché il backend non è certificato.')))),
  ];
}

async function providersView() {
  const body = await getJson('/api/v1/providers');
  const data = body.data || {};
  const section = (title, value, testid) => el('section', {class: 'card', 'data-testid': testid}, el('h2', {}, title),
    value === null || value === undefined
      ? el('p', {class: 'state empty', role: 'status'}, 'Dati non disponibili per questa sezione.')
      : renderValue(value));
  const missing = [data.data_health, data.futpython_certification].filter(value => value === null || value === undefined).length;
  return [
    el('h1', {}, 'Fornitori dati'),
    el('p', {class: 'lead'}, 'Salute dei dati e certificazione FutPythonTrader, letti da /api/v1/providers.'),
    missing === 1 ? el('p', {class: 'state partial', role: 'status'}, 'Risposta parziale: una sezione non è disponibile.') : null,
    section('Stato dei dati', data.data_health, 'data-health'),
    section('Certificazione FutPythonTrader', data.futpython_certification, 'fpt-certification'),
    metaLine(body),
  ];
}

async function endpointsView() {
  const body = await getJson('/api/v1/endpoints');
  const endpoints = Array.isArray(body.data?.endpoints) ? body.data.endpoints : [];
  const legacy = Array.isArray(body.data?.legacy_routes) ? body.data.legacy_routes : [];
  const table = (head, rows) => el('div', {class: 'tablewrap'}, el('table', {},
    el('thead', {}, el('tr', {}, head.map(text => el('th', {scope: 'col'}, text)))),
    el('tbody', {}, rows)));
  return [
    el('h1', {}, 'API v1'),
    el('p', {class: 'lead'}, 'Registro degli endpoint in sola lettura, letto da /api/v1/endpoints.'),
    el('section', {class: 'card', 'data-testid': 'endpoints'}, el('h2', {}, `Endpoint (${endpoints.length})`),
      endpoints.length === 0 ? el('p', {class: 'state empty'}, 'Nessun endpoint pubblicato.') :
        table(['Percorso', 'Fonte', 'Descrizione', 'Parametri'], endpoints.map(endpoint => el('tr', {'data-path': endpoint.path},
          el('td', {}, el('code', {}, endpoint.path ?? ND)), el('td', {}, formatScalar(endpoint.source)), el('td', {}, formatScalar(endpoint.summary)),
          el('td', {}, Object.keys(endpoint.params || {}).length ? Object.entries(endpoint.params).map(([name, spec]) => `${name}${spec?.required ? '*' : ''}`).join(', ') : '—'))))),
    el('section', {class: 'card'}, el('h2', {}, `Route storiche (${legacy.length})`),
      legacy.length === 0 ? el('p', {class: 'state empty'}, 'Nessuna route storica.') :
        table(['Route', 'Stato', 'Successore'], legacy.map(route => el('tr', {},
          el('td', {}, el('code', {}, route.route ?? ND)), el('td', {}, formatScalar(route.status)), el('td', {}, formatScalar(route.successor)))))),
    metaLine(body),
  ];
}

const VIEWS = {'': ['lo stato', statusView], providers: ['i fornitori dati', providersView], endpoints: ['gli endpoint', endpointsView]};

let generation = 0;
async function render() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  const [what, view] = VIEWS[name] || [null, null];
  const host = document.getElementById('view');
  for (const link of document.querySelectorAll('nav a[data-view]')) {
    if (link.dataset.view === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // Every navigation starts a new generation, so an earlier view still loading can never replace this one.
  const mine = ++generation;
  if (!view) {
    host.replaceChildren(el('h1', {}, 'Pagina non trovata'), el('p', {class: 'state empty'}, 'Questa sezione non esiste. ', el('a', {href: '#/'}, 'Torna allo stato')));
    return;
  }
  host.replaceChildren(loading(what));
  try {
    const nodes = await view();
    if (mine === generation) host.replaceChildren(...nodes);
  } catch (error) {
    if (mine !== generation || error?.code === 'UNAUTHENTICATED') return;
    host.replaceChildren(errorState(error instanceof ApiFailure ? error : new ApiFailure(0, 'CLIENT', 'errore nella pagina'), render));
  }
}

window.addEventListener('hashchange', render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
