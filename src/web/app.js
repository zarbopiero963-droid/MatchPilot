// R-05/R-06b (#3, #30, #97): read-only web site. Every value shown comes from the MatchPilot API v1; the browser computes
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

// Numbers are shown exactly as the API sent them (MP-WEB-011): every digit is kept, the integer part is grouped by
// thousands with a dot and the decimal point becomes a comma, for JSON numbers and for exact decimal text alike
// (PostgreSQL numeric arrives as text, e.g. odds "1.450"). Nothing is rounded in the browser.
function formatDecimalText(text) {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) return text;
  return `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${m[3] === undefined ? '' : `,${m[3]}`}`;
}
const formatNumber = value => formatDecimalText(String(value));

// An instant (an ISO timestamp with a time zone) is shown in Europe/Rome with its offset (D-7, DST included); the exact
// UTC value stays in the datetime attribute and the tooltip. Calendar dates (YYYY-MM-DD) are never touched.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ROME = new Intl.DateTimeFormat('it-IT', {timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset'});
function instant(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return document.createTextNode(value);
  return el('time', {datetime: value, title: `UTC: ${date.toISOString()}`}, `${ROME.format(date)} (ora di Roma)`);
}

export function formatScalar(value) {
  const missing = value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value))
    || (typeof value === 'string' && value.trim() === '');
  if (missing) return el('span', {class: 'nd', title: 'Valore non disponibile'}, ND);
  if (typeof value === 'boolean') return el('span', {class: value ? 'ok' : 'bad'}, value ? 'sì' : 'no');
  if (typeof value === 'number') return document.createTextNode(formatNumber(value));
  if (INSTANT.test(value)) return instant(value);
  return document.createTextNode(String(value));
}

// Enumerated states from the API, shown in Italian; the code itself stays in data-code and the tooltip.
const CODES = {
  FINAL: 'Finale', NO_RESULT: 'Senza risultato', NOT_STARTED: 'Non iniziata', HOME: 'Casa', AWAY: 'Ospite', EVEN: 'Pari',
  HISTORICAL: 'Storico', PREMATCH: 'Pre-partita', AVAILABLE: 'Disponibile', UNAVAILABLE: 'Non disponibile', ONBOARDING: 'In attivazione',
  NO_DATA: 'Nessun dato', ACTIVE: 'Attivo', HARD_VERIFIED: 'Verificato', DEPRECATED: 'Sostituita', KEPT: 'Mantenuta',
};
function code(value) {
  if (typeof value !== 'string' || !Object.hasOwn(CODES, value)) return formatScalar(value);
  return el('span', {class: 'code', title: value, 'data-code': value}, CODES[value]);
}

// A value the API documents as numeric (odds, xG, ratios, counts): exact decimal text gets the same format as a number.
function num(value) {
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return document.createTextNode(formatDecimalText(value));
  return formatScalar(value);
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
  return code(value);
}

const metaLine = body => el('p', {class: 'meta'},
  'Fonte: ', body.meta?.source ?? ND, ' · generato: ', formatScalar(body.meta?.generated_at), ' · versione codice: ', body.meta?.code_version ?? ND);

const loading = what => el('p', {class: 'state loading', role: 'status'}, `Caricamento ${what}…`);

function errorState(error, retry) {
  return el('div', {class: 'state error', role: 'alert'},
    el('p', {}, `Impossibile caricare i dati (${error.code}). `, error.message ? `Dettaglio: ${error.message}.` : ''),
    el('button', {type: 'button', onclick: retry}, 'Riprova'));
}

// ---- Views ----

// ---- Navigation helpers ----

const hashParams = () => new URLSearchParams(location.hash.split('?')[1] || '');
function queryString(params) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== '') out.set(key, value);
  return out.toString();
}
const validDate = text => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))
  && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
// Calendar navigation only (previous/next day, today): no data value is derived from it.
function shiftDay(text, days) {
  const d = new Date(`${text}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const field = (text, node, name) => [el('dt', {}, text), el('dd', name ? {'data-field': name} : {}, node)];
const reasonText = error => `${error.code}${error.message ? ` — ${error.message}` : ''}`;

// ---- Dashboard (MP-WEB-013) ----

// Every tile reads one API route; a route that fails turns only its own tile into N/D with the reason (partial).
const DASHBOARD = {
  health: '/api/v1/health',
  providers: '/api/v1/providers',
  coverage: '/api/v1/fpt/coverage-competitions',
  historical: '/api/v1/tc/historical',
  prematch: '/api/v1/tc/prematch',
  live: '/api/v1/tc/live',
};

function tile(title, testid, route, settled, body) {
  const head = el('h2', {}, title);
  const source = body => el('p', {class: 'meta'}, 'Fonte: ', el('code', {}, route), body ? [' · generato: ', formatScalar(body.meta?.generated_at)] : '');
  if (settled.status === 'rejected') {
    return el('section', {class: 'card tile', 'data-testid': testid, 'data-state': 'error'}, head,
      el('p', {class: 'nd', 'data-field': 'value'}, ND),
      el('p', {class: 'state partial', role: 'status'}, `Dato non disponibile. Motivo: ${reasonText(settled.reason)}`), source());
  }
  const content = body(settled.value.data, settled.value);
  return el('section', {class: 'card tile', 'data-testid': testid, 'data-state': 'ok'}, head, content, source(settled.value));
}

const missingSection = what => el('p', {class: 'state partial', role: 'status'}, `N/D — la risposta non contiene ${what}.`);

async function dashboardView() {
  const keys = Object.keys(DASHBOARD);
  const results = await Promise.allSettled(keys.map(key => getJson(DASHBOARD[key])));
  const login = results.find(result => result.status === 'rejected' && result.reason?.code === 'UNAUTHENTICATED');
  if (login) throw login.reason;
  if (results.every(result => result.status === 'rejected')) throw results[0].reason;
  const got = Object.fromEntries(keys.map((key, i) => [key, results[i]]));
  const failed = results.filter(result => result.status === 'rejected').length;
  const gate = value => value === undefined ? null : value;
  return [
    el('h1', {}, 'Dashboard'),
    el('p', {class: 'lead'}, 'Salute dei dati, copertura, freschezza e certificazione, letti dalle route dell’API v1. Nessun valore dimostrativo.'),
    failed ? el('p', {class: 'state partial', role: 'status', 'data-testid': 'dashboard-partial'},
      `Risposta parziale: ${failed} ${failed === 1 ? 'riquadro' : 'riquadri'} su ${keys.length} ${failed === 1 ? 'non è disponibile e mostra' : 'non sono disponibili e mostrano'} N/D con il motivo.`) : null,
    el('div', {class: 'grid'},
      tile('Servizio', 'tile-health', DASHBOARD.health, got.health, (data, body) => el('dl', {},
        field('Stato', formatScalar(data?.status), 'status'), field('Prodotto', formatScalar(data?.product), 'product'),
        field('Versione API', formatScalar(body.api_version), 'api_version'), field('Versione codice', formatScalar(body.meta?.code_version), 'code_version'))),
      tile('Salute dei dati', 'tile-data-health', DASHBOARD.providers, got.providers, data => {
        const health = data?.data_health;
        if (health === null || health === undefined) return missingSection('la salute dei dati');
        return el('dl', {},
          field('Stato', formatScalar(health.status), 'status'), field('Ultimo controllo', formatScalar(health.lastRun), 'lastRun'),
          field('Dataset attivi', num(health.activeDatasets), 'activeDatasets'), field('Dataset con errori', num(health.datasetsWithErrors), 'datasetsWithErrors'),
          field('Avvisi', renderValue(health.alerts), 'alerts'));
      }),
      tile('Certificazione FutPythonTrader', 'tile-certification', DASHBOARD.providers, got.providers, data => {
        const cert = data?.futpython_certification;
        if (cert === null || cert === undefined) return missingSection('la certificazione FutPythonTrader');
        return el('dl', {},
          field('Partite uniche', num(cert.unique_matches), 'unique_matches'), field('Versioni storiche', num(cert.historical_versions), 'historical_versions'),
          field('Snapshot', num(cert.snapshots), 'snapshots'), field('Dataset disponibili', num(cert.datasets?.available), 'datasets_available'),
          field('Ultimo backfill', renderValue(cert.latest_backfill ?? null), 'latest_backfill'),
          ...[2, 3, 4, 5, 6, 8].flatMap(n => field(`Gate fase ${n}`, formatScalar(gate(cert[`phase${n}`]?.gate)), `phase${n}_gate`)));
      }),
      tile('TotalCorner storico', 'tile-tc-historical', DASHBOARD.historical, got.historical, data => el('dl', {},
        field('Partite', num(data?.matches?.matches), 'matches'), field('Campionati', num(data?.matches?.leagues), 'leagues'),
        field('Stagioni', num(data?.matches?.seasons), 'seasons'), field('Prima partita', formatScalar(data?.matches?.earliest), 'earliest'),
        field('Ultima partita', formatScalar(data?.matches?.latest), 'latest'))),
      tile('TotalCorner prematch', 'tile-tc-prematch', DASHBOARD.prematch, got.prematch, data => el('dl', {},
        field('Partite', num(data?.matches?.matches), 'matches'), field('Con snapshot', num(data?.matches?.with_snapshot), 'with_snapshot'),
        field('Campionati', num(data?.matches?.leagues), 'leagues'))),
      tile('TotalCorner live raccolto', 'tile-tc-live', DASHBOARD.live, got.live, data => el('dl', {},
        field('Snapshot', num(data?.snapshots?.snapshots), 'snapshots'), field('Partite', num(data?.snapshots?.matches), 'matches'),
        field('Ultimo snapshot', formatScalar(data?.snapshots?.latest), 'latest'), field('Ultimo polling', formatScalar(data?.cursors?.last_polled_at), 'last_polled_at')))),
    tile('Copertura FutPythonTrader per campionato', 'tile-coverage', DASHBOARD.coverage, got.coverage, data => {
      const rows = Array.isArray(data?.rows) ? data.rows : null;
      if (!rows) return missingSection("l'elenco dei campionati");
      if (rows.length === 0) return el('p', {class: 'state empty'}, 'Nessun campionato nei dati salvati.');
      return el('div', {class: 'tablewrap'}, el('table', {},
        el('thead', {}, el('tr', {}, ['Campionato', 'Stagioni', 'Partite', 'Prima partita', 'Ultima partita', 'Copertura quote', 'Copertura xG', 'Stato']
          .map(text => el('th', {scope: 'col'}, text)))),
        el('tbody', {}, rows.map(row => el('tr', {'data-competition': row.internal_competition_id ?? ''},
          el('td', {}, formatScalar(row.country_slug), ' · ', formatScalar(row.league_slug)),
          el('td', {}, formatScalar(row.first_season), ' → ', formatScalar(row.last_season)),
          el('td', {'data-field': 'matches'}, num(row.matches)),
          el('td', {}, formatScalar(row.first_match_date)),
          el('td', {'data-field': 'last_match_date'}, row.last_match_date
            ? el('a', {href: `#/board?${queryString({date: row.last_match_date})}`, title: 'Apri la Daily Board di quel giorno'}, row.last_match_date)
            : formatScalar(null)),
          el('td', {}, num(row.odds_coverage)), el('td', {}, num(row.xg_coverage)), el('td', {}, code(row.coverage_status)))))),
        el('p', {class: 'meta'}, 'Copertura: rapporto 0–1 calcolato dal server sui fatti salvati.'));
    }),
  ];
}

// ---- Match cards (Daily Board, search) ----

// The provider's kickoff time has no documented time zone: it is shown as the provider wrote it, never converted (D-7).
const TZ_NOTE = {PROVIDER_TZ_UNDOCUMENTED: ['ora del fornitore', 'Orario locale del fornitore: il fuso orario non è documentato, quindi l’orario non viene convertito.']};

function score(row) {
  if (row.home_score === null || row.home_score === undefined || row.away_score === null || row.away_score === undefined) return formatScalar(null);
  return document.createTextNode(`${formatNumber(row.home_score)}–${formatNumber(row.away_score)}`);
}

function matchCard(row) {
  return el('article', {class: 'card match', 'data-match': row.internal_match_id ?? ''},
    el('p', {class: 'match-head'},
      el('span', {class: 'kick', 'data-field': 'kickoff'}, formatScalar(row.kickoff_local_time)),
      el('span', {class: 'pill', title: TZ_NOTE[row.kickoff_tz_status]?.[1] ?? row.kickoff_tz_status ?? '', 'data-field': 'kickoff_tz_status', 'data-code': row.kickoff_tz_status ?? ''},
        TZ_NOTE[row.kickoff_tz_status]?.[0] ?? formatScalar(row.kickoff_tz_status))),
    el('h3', {}, el('span', {'data-field': 'home'}, formatScalar(row.home_name)), ' – ', el('span', {'data-field': 'away'}, formatScalar(row.away_name))),
    el('p', {class: 'comp', 'data-field': 'competition'}, formatScalar(row.country_slug), ' · ', formatScalar(row.league_slug), ' · ', formatScalar(row.season)),
    el('dl', {class: 'compact'},
      field('Risultato', score(row), 'score'), field('Stato risultato', code(row.result_status), 'result_status'),
      field('Quote 1 · X · 2', el('span', {}, num(row.odd_home), ' · ', num(row.odd_draw), ' · ', num(row.odd_away)), 'odds_1x2'),
      field('Over 2,5', num(row.odd_over25), 'odd_over25'), field('Entrambe segnano', num(row.odd_btts_yes), 'odd_btts_yes'),
      field('Favorito', row.favorite_side ? el('span', {}, code(row.favorite_side), ' ', num(row.favorite_odd)) : formatScalar(null), 'favorite'),
      field('xG casa · ospite', el('span', {}, num(row.xg_home), ' · ', num(row.xg_away)), 'xg')),
    el('p', {class: 'meta'}, 'Fase: ', code(row.phase), ' · dataset: ', formatScalar(row.dataset_key)));
}

// A list that keeps loading the next page with the API cursor. A failed page keeps what is shown and offers a retry.
function pagedList({first, path, params, render, more: moreLabel, mine, list = el('div', {class: 'paged', 'data-testid': 'paged-list'})}) {
  const footer = el('div', {class: 'paged-foot'});
  let cursor = first.data?.next_cursor ?? null;
  const append = rows => { for (const node of render(rows)) list.append(node); };
  const showFooter = () => {
    footer.replaceChildren();
    if (cursor) footer.append(el('button', {type: 'button', 'data-action': 'more', onclick: loadMore}, moreLabel));
    else footer.append(el('p', {class: 'meta', 'data-testid': 'end'}, 'Fine dei risultati.'));
  };
  async function loadMore() {
    footer.replaceChildren(loading('la pagina successiva'));
    try {
      const body = await getJson(`${path}?${queryString({...params, cursor})}`);
      if (mine !== generation) return;
      append(body.data?.rows ?? []);
      cursor = body.data?.next_cursor ?? null;
      showFooter();
    } catch (error) {
      if (mine !== generation || error?.code === 'UNAUTHENTICATED') return;
      footer.replaceChildren(el('div', {class: 'state error', role: 'alert'},
        el('p', {}, `Impossibile caricare altri risultati (${reasonText(error)}). I risultati già mostrati restano validi.`),
        el('button', {type: 'button', onclick: loadMore}, 'Riprova')));
    }
  }
  append(first.data?.rows ?? []);
  showFooter();
  return [list, footer];
}

// ---- Daily Board (MP-WEB-002) ----

const BOARD_PAGE = 24;

async function boardView(params, mine) {
  const date = params.get('date') || localToday();
  const picker = el('form', {class: 'controls', 'data-testid': 'board-controls', onsubmit: event => {
    event.preventDefault();
    const value = new FormData(event.target).get('date');
    location.hash = `#/board?${queryString({date: value})}`;
  }},
  el('a', {href: validDate(date) ? `#/board?${queryString({date: shiftDay(date, -1)})}` : '#/board', 'data-action': 'prev'}, '← Giorno prima'),
  el('label', {}, 'Giorno ', el('input', {type: 'date', name: 'date', value: validDate(date) ? date : '', required: true})),
  el('button', {type: 'submit'}, 'Mostra'),
  el('a', {href: validDate(date) ? `#/board?${queryString({date: shiftDay(date, 1)})}` : '#/board', 'data-action': 'next'}, 'Giorno dopo →'),
  el('a', {href: `#/board?${queryString({date: localToday()})}`}, 'Oggi'));
  const head = [el('h1', {}, 'Daily Board'),
    el('p', {class: 'lead'}, 'Le partite di un giorno nei dati salvati, in ordine di orario, con campionato, quote, xG e stato dei dati. Orari come forniti dal fornitore.'), picker];
  if (!validDate(date)) return [...head, el('p', {class: 'state error', role: 'alert'}, `Data non valida: "${date}". Usa il formato AAAA-MM-GG.`)];
  const path = '/api/v1/fpt/matches';
  const params2 = {date, limit: BOARD_PAGE};
  const first = await getJson(`${path}?${queryString(params2)}`);
  const rows = first.data?.rows ?? [];
  if (rows.length === 0) {
    return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'board-empty'}, `Nessuna partita il ${date} nei dati salvati. `,
      'La Dashboard indica per ogni campionato l’ultimo giorno con dati. ', el('a', {href: '#/'}, 'Apri la Dashboard')), metaLine(first)];
  }
  // Kickoff order across competitions, as the API returns it; each card names its competition (PR #163 NB-3).
  const render = page => page.map(matchCard);
  return [...head, el('h2', {class: 'day', 'data-testid': 'board-day'}, `Partite del ${date}`),
    ...pagedList({first, path, params: params2, render, more: 'Carica altre partite', mine}), metaLine(first)];
}

// ---- Search and filters (MP-WEB-007) ----

const SEARCH_PAGE = 25;
// Form fields and the API parameters they map to. Values are checked by the server; the form only constrains types.
const SEARCH_FIELDS = ['team_id', 'venue', 'competition', 'from', 'before', 'result', 'fav_min', 'fav_max', 'min_goals', 'max_goals', 'with_odds', 'with_xg'];

function searchForm(params, competitions) {
  const value = name => params.get(name) ?? '';
  const select = (name, options) => el('select', {name}, options.map(([v, text]) => el('option', {value: v, selected: value(name) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), ...attrs});
  const check = (name, text) => el('label', {class: 'check'}, el('input', {type: 'checkbox', name, value: 'true', checked: value(name) === 'true'}), ' ', text);
  const competitionOptions = [['', 'Tutte'], ...competitions.map(c => [c.internal_competition_id, `${c.country_slug} · ${c.league_slug}`])];
  return el('form', {class: 'card search', 'data-testid': 'search-form', onsubmit: event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const out = {};
    for (const [key, v] of data.entries()) if (String(v).trim() !== '') out[key] = String(v).trim();
    // The outcome is shown below the form: after a submit it gets the focus and is scrolled into view (audit A-1).
    revealOutcome = true;
    const target = `#/search?${queryString({...out, run: '1'})}`;
    if (location.hash === target) render();
    else location.hash = target;
  }},
  el('div', {class: 'fields'},
    el('label', {}, 'Squadra ', input('team', {type: 'search', placeholder: 'es. Ajax', autocomplete: 'off'})),
    el('label', {}, 'Sede ', select('venue', [['', 'Casa o trasferta'], ['home', 'Casa'], ['away', 'Trasferta']])),
    el('label', {}, 'Campionato ', competitions.length ? select('competition', competitionOptions)
      : el('span', {class: 'nd', title: 'Il registro dei campionati è vuoto'}, ND)),
    el('label', {}, 'Dal ', input('from', {type: 'date'})),
    el('label', {}, 'Prima del ', input('before', {type: 'date'})),
    el('label', {}, 'Risultato ', select('result', [['', 'Qualsiasi'], ['FINAL', 'Finale'], ['NO_RESULT', 'Senza risultato'], ['NOT_STARTED', 'Non iniziata']])),
    el('label', {}, 'Quota favorito da ', input('fav_min', {type: 'number', step: '0.01', min: '1.01', max: '1000'})),
    el('label', {}, 'a ', input('fav_max', {type: 'number', step: '0.01', min: '1.01', max: '1000'})),
    el('label', {}, 'Gol totali da ', input('min_goals', {type: 'number', step: '1', min: '0', max: '30'})),
    el('label', {}, 'a ', input('max_goals', {type: 'number', step: '1', min: '0', max: '30'}))),
  el('fieldset', {}, el('legend', {}, 'Qualità dei dati'), check('with_odds', 'solo con quote 1X2 complete'), check('with_xg', 'solo con xG')),
  el('button', {type: 'submit'}, 'Cerca'), ' ', el('a', {href: '#/search'}, 'Azzera'));
}

function resultsTable(rows) {
  return rows.map(row => el('tr', {'data-match': row.internal_match_id ?? ''},
    el('td', {'data-field': 'date'}, row.match_date ? el('a', {href: `#/board?${queryString({date: row.match_date})}`}, row.match_date) : formatScalar(null)),
    el('td', {}, formatScalar(row.kickoff_local_time)),
    el('td', {'data-field': 'teams'}, formatScalar(row.home_name), ' – ', formatScalar(row.away_name)),
    el('td', {}, formatScalar(row.league_slug), ' ', formatScalar(row.season)),
    el('td', {'data-field': 'score'}, score(row)),
    el('td', {'data-field': 'odds_1x2'}, num(row.odd_home), ' · ', num(row.odd_draw), ' · ', num(row.odd_away)),
    el('td', {}, num(row.odd_over25)),
    el('td', {'data-field': 'xg'}, num(row.xg_home), ' · ', num(row.xg_away))));
}

async function searchView(params, mine) {
  const competitionsBody = await getJson('/api/v1/fpt/competitions').catch(error => {
    if (error?.code === 'UNAUTHENTICATED') throw error;
    return null;
  });
  const competitions = Array.isArray(competitionsBody?.data?.rows) ? competitionsBody.data.rows : [];
  const head = [el('h1', {}, 'Ricerca partite'),
    el('p', {class: 'lead'}, 'Filtri combinati sulle partite storiche salvate. Risultati in ordine di data, dal più recente, con paginazione stabile.'),
    competitionsBody ? null : el('p', {class: 'state partial', role: 'status'}, 'Elenco dei campionati non disponibile: il filtro per campionato è disattivato.'),
    searchForm(params, competitions)];
  if (params.get('run') !== '1') return [...head, el('p', {class: 'state empty'}, 'Imposta i filtri e premi Cerca.')];

  // A team name is resolved to its id by the API (exact name, any spelling the archive knows).
  let teamId = params.get('team_id') || '';
  const teamText = (params.get('team') || '').trim();
  if (!teamId && teamText) {
    const teams = (await getJson(`/api/v1/fpt/teams?${queryString({q: teamText})}`)).data?.rows ?? [];
    if (teams.length === 0) return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'team-not-found', 'data-outcome': ''}, `Nessuna squadra chiamata "${teamText}" nei dati salvati.`)];
    if (teams.length > 1) {
      return [...head, el('div', {class: 'state partial', role: 'status', 'data-testid': 'team-choice', 'data-outcome': ''},
        el('p', {}, `Più squadre si chiamano "${teamText}": scegline una.`),
        el('ul', {}, teams.map(team => el('li', {}, el('a', {href: `#/search?${queryString({...Object.fromEntries(params), team_id: team.internal_team_id})}`},
          `${team.canonical_name} (${team.country_slug ?? ND})`)))))];
    }
    teamId = teams[0].internal_team_id;
  }
  const api = {limit: SEARCH_PAGE};
  for (const key of SEARCH_FIELDS) if (key !== 'team_id' && params.get(key)) api[key] = params.get(key);
  if (teamId) api.team = teamId;
  // The venue only applies to a team: without one it is dropped, and the page says so (PR #163 NB-7).
  const venueIgnored = !teamId && Boolean(api.venue);
  if (!teamId) delete api.venue;
  const path = '/api/v1/fpt/search';
  let first;
  try {
    first = await getJson(`${path}?${queryString(api)}`);
  } catch (error) {
    if (error?.status === 400) {
      return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'search-invalid', 'data-outcome': ''}, `Filtri non validi: ${error.message}. Correggi i campi e riprova.`)];
    }
    throw error;
  }
  const rows = first.data?.rows ?? [];
  if (rows.length === 0) return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'search-empty', 'data-outcome': ''}, 'Nessuna partita corrisponde ai filtri.'), metaLine(first)];
  const [body, footer] = pagedList({first, path, params: api, render: resultsTable, more: 'Altri risultati', mine,
    list: el('tbody', {'data-testid': 'search-results'})});
  const table = el('table', {}, el('thead', {}, el('tr', {}, ['Data', 'Ora', 'Partita', 'Campionato', 'Risultato', '1 · X · 2', 'Over 2,5', 'xG']
    .map(text => el('th', {scope: 'col'}, text)))), body);
  return [...head, el('h2', {'data-testid': 'search-outcome', 'data-outcome': ''}, 'Risultati'),
    venueIgnored ? el('p', {class: 'state partial', role: 'status', 'data-testid': 'venue-ignored'}, 'La sede vale solo con una squadra: è stata ignorata.') : null,
    el('p', {class: 'meta', 'data-testid': 'filters-applied'}, 'Filtri applicati dal server: ', formatScalar((first.data?.provenance?.filters_applied ?? []).join(', '))),
    el('div', {class: 'tablewrap'}, table), footer, metaLine(first)];
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
          el('td', {}, el('code', {}, route.route ?? ND)), el('td', {}, code(route.status)),
          el('td', {}, route.successor ?? (route.status === 'KEPT' ? el('span', {class: 'empty', title: 'La route resta: non ha un successore'}, 'nessuno') : formatScalar(null))))))),
    metaLine(body),
  ];
}

const VIEWS = {'': ['la dashboard', dashboardView], board: ['la Daily Board', boardView], search: ['la ricerca', searchView],
  providers: ['i fornitori dati', providersView], endpoints: ['gli endpoint', endpointsView]};

let generation = 0;
// Set by the search form: the next search render moves the focus to its outcome and scrolls it into view, so the result,
// the empty state or the error is perceived on a phone too, where it starts below the form (audit A-1).
let revealOutcome = false;
function showOutcome(host) {
  const target = host.querySelector('[data-outcome]') || host.querySelector('.state');
  if (!target) return;
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({preventScroll: true});
  target.scrollIntoView({block: 'start'});
}

async function render() {
  const name = location.hash.replace(/^#\/?/, '').split('?')[0];
  // The submit flag belongs to this render only: any navigation consumes it, so a search abandoned before its answer
  // never moves the focus later, when the page is opened again without a submit (PR #168 review NB-1).
  const reveal = revealOutcome && name === 'search';
  revealOutcome = false;
  const [what, view] = VIEWS[name] || [null, null];
  const host = document.getElementById('view');
  for (const link of document.querySelectorAll('nav a[data-view]')) {
    if (link.dataset.view === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // Every navigation starts a new generation, so an earlier view still loading can never replace this one.
  const mine = ++generation;
  if (!view) {
    host.replaceChildren(el('h1', {}, 'Pagina non trovata'), el('p', {class: 'state empty'}, 'Questa sezione non esiste. ', el('a', {href: '#/'}, 'Torna alla dashboard')));
    return;
  }
  host.replaceChildren(loading(what));
  try {
    const nodes = await view(hashParams(), mine);
    // Optional sections are null when absent: they are left out, never shown as text.
    if (mine === generation) {
      host.replaceChildren(...nodes.filter(node => node !== null && node !== undefined && node !== false));
      if (reveal) showOutcome(host);
    }
  } catch (error) {
    if (mine !== generation || error?.code === 'UNAUTHENTICATED') return;
    host.replaceChildren(errorState(error instanceof ApiFailure ? error : new ApiFailure(0, 'CLIENT', 'errore nella pagina'), render));
    if (reveal) showOutcome(host);
  }
}

window.addEventListener('hashchange', render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
