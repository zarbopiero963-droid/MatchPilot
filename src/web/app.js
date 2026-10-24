// R-05/R-06b (#3, #30, #97): read-only web site. Every value shown comes from the MatchPilot API v1; the browser computes
// nothing (MP-WEB-011). Missing values are shown as N/D, never as zero (MP-WEB-005). Every view has explicit loading,
// empty, partial and error states (MP-WEB-010), and a later navigation always wins over an earlier view still
// loading. Text is inserted with textContent only: API data is never parsed as HTML.
// User views show no technical text (MP-OWNER-UI-NO-RAW-TEXT-01, MP-WEB-015): codes, identifiers, dataset keys, routes and
// provenance stay in data-* attributes and tooltips, and in the technical views (docs/qa/ui-text-inventory.md).

import {createPersistence} from './persistence.js';

const ND = 'N/D';

class ApiFailure extends Error {
  constructor(status, code, message) {
    super(message || `HTTP ${status}`);
    this.status = status;
    this.code = code || `HTTP_${status}`;
  }
}

// MP-UI-PR-001: every interactive control carries a stable id (`data-control`), listed in docs/qa/control-inventory.json;
// the Browser QA gate fails on a visible control without one or with an id the inventory does not know.
const ctl = (view, name) => `CTL-${view}-${String(name).toUpperCase().replace(/_/g, '-')}`;

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

// Owner login enforced (R-04): go to the login page and come back here. Returns the error the view throws (the render
// ignores it: the page is leaving).
const loginHref = () => `/login?next=${encodeURIComponent(location.pathname + location.hash)}`;
function toLogin() {
  location.assign(loginHref());
  return new ApiFailure(401, 'UNAUTHENTICATED', 'accesso richiesto');
}

async function getJson(path) {
  let response;
  try {
    response = await fetch(path, {headers: {accept: 'application/json'}, credentials: 'same-origin'});
  } catch {
    throw new ApiFailure(0, 'NETWORK', 'rete non raggiungibile');
  }
  if (response.status === 401) throw toLogin();
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(response.status, body?.error?.code, body?.error?.message);
  if (!body || typeof body !== 'object' || !('data' in body)) throw new ApiFailure(response.status, 'BAD_ENVELOPE', 'risposta senza envelope v1');
  return body;
}

// ---- Value rendering ----

// Italian labels of the keys the API returns in the data health and the FutPythonTrader certification (Fornitori, a
// technical view: the values stay technical, the names read in Italian; V-B2b, inventory UI-60). A key without a label is
// shown as words and marked, and the Browser QA gate fails a labelled view that shows one (journey providers-endpoints).
const LABELS = {
  // data health and sync runs
  status: 'Stato', product: 'Prodotto', lastRun: 'Ultima sincronizzazione', activeDatasets: 'Dataset attivi', schemaFields: 'Campi di schema',
  datasetsWithErrors: 'Dataset con errori', contentFreshness: 'Freschezza dei contenuti', maxMatchDate: 'Ultima partita', maxLastChangedAt: 'Ultimo cambiamento', stale: 'Fermi', reasons: 'Motivi',
  alerts: 'Avvisi', severity: 'Gravità', code: 'Codice', title: 'Titolo', message: 'Messaggio',
  last_seen_at: 'Visto l’ultima volta', occurrences: 'Occorrenze', run_id: 'Identificativo', kind: 'Tipo', started_at: 'Inizio', finished_at: 'Fine',
  catalog_entries: 'Voci di catalogo', datasets_attempted: 'Dataset tentati', datasets_changed: 'Dataset cambiati', resumed_skips: 'Saltati alla ripresa',
  available_count: 'Disponibili', error_real_count: 'Errori reali', rows_seen: 'Righe lette', rows_inserted: 'Righe inserite', fields_seen: 'Campi letti',
  catalog_snapshot_id: 'Snapshot del catalogo', check_code: 'Controllo', checked_at: 'Controllato il', details: 'Dettagli',
  // certification summary
  catalog: 'Catalogo', datasets: 'Dataset', snapshots: 'Snapshot', historical_versions: 'Versioni storiche', unique_matches: 'Partite uniche',
  schema_fields: 'Campi di schema', latest_backfill: 'Ultimo backfill', phase1_checks: 'Controlli fase 1', gate: 'Gate superato', total: 'Totale',
  countries: 'Paesi', leagues: 'Campionati', available: 'Disponibili', unavailable_404: 'Non pubblicati (404)', error_real: 'Errori reali',
  error: 'Errore', deprecated: 'Dismessi', removed: 'Rimossi', unknown: 'Sconosciuti', undefined_states: 'Stati non definiti',
  duplicate_catalog_keys: 'Chiavi di catalogo duplicate', computed_at: 'Calcolato il',
  phase2: 'Fase 2 · classificazione', phase3: 'Fase 3 · integrità', phase4: 'Fase 4 · registro dei campi', phase5: 'Fase 5 · copertura',
  phase6: 'Fase 6 · stagioni', phase8: 'Fase 8 · sorveglianza',
  // phase 2
  catalog_total: 'Voci di catalogo', classified_total: 'Classificate', unclassified: 'Non classificate', labels: 'Classificazioni',
  AVAILABLE: 'Disponibili', UNAVAILABLE_404: 'Non pubblicati (404)', ERROR_REAL: 'Errori reali', DEPRECATED: 'Dismessi', REMOVED: 'Rimossi',
  DISCOVERED: 'Scoperte', CANDIDATE: 'Candidate', PARTIAL: 'Parziali', COMPLETE: 'Complete',
  issues: 'Anomalie', available_without_snapshot: 'Disponibili senza snapshot', available_incomplete: 'Disponibili incompleti', samples: 'Esempi',
  initial_404: 'Non pubblicati dall’inizio (404)', regression_404: 'Tornati non pubblicati (404)',
  // phase 2: the anomaly codes of a dataset (src/providers/futpython/classification.mjs) and the fields of a sample
  missing_first_seen: 'Senza prima comparsa', missing_last_seen: 'Senza ultima comparsa', missing_last_synced_at: 'Senza ultima sincronizzazione',
  missing_reason: 'Senza motivo della classificazione', missing_provider_path: 'Senza percorso della fonte', available_inactive: 'Disponibili ma inattivi',
  missing_first_success_at: 'Senza primo scaricamento riuscito', missing_last_success_at: 'Senza ultimo scaricamento riuscito',
  available_http_status: 'Disponibili con stato HTTP diverso da 200', available_http_disposition: 'Disponibili con esito HTTP registrato',
  not_initial_404: '404 iniziali con campi discordanti', initial_404_has_snapshot: '404 iniziali con snapshot',
  initial_404_http_status: '404 iniziali con stato HTTP diverso', initial_404_inactive: '404 iniziali inattivi', missing_last_error_at: 'Senza ultimo errore',
  regression_fields_disagree: '404 di ritorno con campi discordanti', regression_without_snapshot: '404 di ritorno senza snapshot',
  regression_http_status: '404 di ritorno con stato HTTP diverso', removed_still_active: 'Rimossi ancora attivi', removed_reason: 'Rimossi con motivo errato',
  deprecated_marked_initial_404: 'Dismessi segnati come 404 iniziali',
  dataset_key: 'Dataset', classification: 'Classificazione', classification_reason: 'Motivo della classificazione', http_disposition: 'Esito HTTP',
  active: 'Attivo', last_http_status: 'Ultimo stato HTTP', has_snapshot: 'Con snapshot', first_seen_at: 'Visto la prima volta',
  last_synced_at: 'Ultima sincronizzazione', first_success_at: 'Primo scaricamento riuscito', last_success_at: 'Ultimo scaricamento riuscito',
  last_error_at: 'Ultimo errore',
  // phase 1: the deduplication checks (src/jobs/futpython-certify-phase1.mjs)
  rows: 'Righe', changed: 'Cambiato', before: 'Prima', after: 'Dopo', versions: 'Versioni', observed: 'Esito osservato', reason: 'Motivo',
  last_row_count: 'Righe dell’ultimo scaricamento', country_slug: 'Paese', league_slug: 'Campionato', seasons: 'Stagioni',
  available_seasons: 'Stagioni disponibili',
  // phase 3
  match_key_collisions: 'Collisioni della chiave partita', provider_match_id_collisions: 'Collisioni dell’id partita della fonte',
  provider_match_id_shared_same_identity: 'Id partita condivisi dalla stessa partita', duplicate_payload_hashes: 'Contenuti duplicati',
  orphan_versions: 'Versioni orfane', orphan_snapshots: 'Snapshot orfani', snapshot_row_gaps: 'Righe mancanti negli snapshot',
  missing_home: 'Squadra di casa mancante', missing_away: 'Squadra ospite mancante', missing_date: 'Data mancante',
  date_parse_failures: 'Date non leggibili', team_splits: 'Squadre divise', teams: 'Squadre', teams_with_provider_id: 'Squadre con id della fonte',
  // phase 4
  raw_unique_fields: 'Campi distinti nei dati grezzi', registry_unique_fields: 'Campi distinti nel registro', missing_from_registry: 'Assenti dal registro',
  extra_in_registry: 'In più nel registro', missing_normalized: 'Non normalizzati', missing_type_history: 'Senza storia del tipo', transforms: 'Trasformazioni',
  versions_without_lineage: 'Versioni senza provenienza', suppressed_aliases: 'Alias soppressi',
  // phase 5
  dataset_rows: 'Righe per dataset', global_fields: 'Campi globali', league_rows: 'Righe per campionato', missing_global: 'Globali mancanti',
  normalized_names: 'Nomi normalizzati', normalized_rows: 'Righe normalizzate', period_rows: 'Righe per periodo', registry_fields: 'Campi del registro',
  season_rows: 'Righe per stagione', team_rows: 'Righe per squadra', payload_mismatches: 'Contenuti discordanti',
  rollup_mismatches: 'Aggregati discordanti', class_mismatches: 'Classi discordanti', historical_team_unresolved: 'Squadre storiche non risolte',
  today_country_unresolved: 'Paesi di oggi non risolti', class_counts: 'Campi per classe', dense: 'Densi', sparse: 'Radi', 'always-empty': 'Sempre vuoti',
  tag_counts: 'Campi per caratteristica', 'league-specific': 'Solo in alcuni campionati', 'season-specific': 'Solo in alcune stagioni',
  'newly-introduced': 'Introdotti di recente', 'deprecated-field': 'Non più forniti', sample_teams: 'Squadre di esempio', sample_fields: 'Campi di esempio',
  team_census: 'Censimento completo delle squadre', team_sample_mismatches: 'Discordanze nelle squadre di esempio', sample_limit: 'Limite del campione',
  overlap_versions: 'Versioni con campi sovrapposti', diff_sample: 'Esempio di differenze', empty_tokens: 'Valori considerati vuoti',
  dimension: 'Dimensione', dimension_key: 'Chiave della dimensione', field_name: 'Campo', stored_rows: 'Righe salvate', recalc_rows: 'Righe ricalcolate',
  stored_nonempty: 'Valori salvati non vuoti', recalc_nonempty: 'Valori ricalcolati non vuoti',
  // phase 6
  registry_rows: 'Stagioni nel registro', missing_available_seasons: 'Stagioni disponibili mancanti', gap_rows: 'Buchi', status_counts: 'Stagioni per stato',
  expected_null: 'Senza numero atteso di partite', historical_complete: 'Storico completo', unavailable_marked_complete: 'Non disponibili segnate complete',
  evidence: 'Prove', pit: 'Dati noti a un istante (PIT)', t0: 'Istante T0', t1: 'Istante T1', dataset: 'Dataset', contract: 'Contratto',
  t0_matches_snapshot: 'T0 coincide con lo snapshot', total_t0: 'Partite note a T0', total_t1: 'Partite note a T1',
  argentina_t0: 'Partite del dataset argentino note a T0', later_dataset: 'Dataset successivo', total_t0_repeat: 'Partite note a T0, seconda lettura',
  later_dataset_t0: 'Partite del dataset successivo note a T0', later_dataset_t1: 'Partite del dataset successivo note a T1',
  wrong_contract_t0: 'Partite note a T0 con un altro contratto',
  cadence: 'Cadenza', missing_definition: 'Definizione di mancante', expected_match_count: 'Numero atteso di partite',
  // data health v2 (t132u FIX-05): machinery vs new data vs provider, kept apart
  version: 'Versione', overall: 'Stato complessivo', worker: 'Worker', state: 'Condizione', heartbeatAt: 'Ultimo battito',
  heartbeatAgeHours: 'Ore dall\'ultimo battito', scheduler: 'Pianificatore', missedCycles: 'Cicli saltati', cycleHours: 'Ore per ciclo',
  lastCycle: 'Ultimo ciclo', ageHours: 'Ore trascorse', sync: 'Esito tecnico', lastEffectiveUpdate: 'Ultimo aggiornamento effettivo',
  at: 'Quando', newData: 'Dati nuovi', provider: 'Fornitore', providerEvidence: 'Prove sul fornitore',
  datasetFreshness: 'Freschezza dei dataset', staleCurrentSeasons: 'Stagioni correnti ferme', pendingGaps: 'Buchi in sospeso',
  syncErrors: 'Errori di sincronizzazione', localErrors: 'Errori locali',
  RETRY_PENDING: 'In attesa di nuovo tentativo', ALREADY_COMPLETE: 'Già completi', STILL_MISSING: 'Ancora mancanti',
  PROVIDER_UNAVAILABLE: 'Fornitore non disponibile', PERMANENTLY_UNAVAILABLE: 'Non disponibili in modo permanente', RECOVERED: 'Recuperati',
  DETECTED: 'Rilevati', QUEUED: 'In coda', FAILED: 'Falliti', RECOVERING: 'In recupero',
};
const keyWords = key => key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();

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
  return el('time', {datetime: value, title: `Ora italiana · UTC ${date.toISOString()}`}, ROME.format(date));
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
// Lower-case states of the data health (ok, warning, critical) and of a sync run (complete, partial, failed, running);
// mapped only where those fields are shown, so a provider value that happens to read "ok" is never relabelled.
const LOWER_CODES = {ok: 'Regolare', warning: 'Attenzione', critical: 'Critico', complete: 'Completa', partial: 'Parziale', failed: 'Non riuscita', running: 'In corso'};
const lowerCode = value => Object.hasOwn(LOWER_CODES, value) ? el('span', {class: 'code', title: value, 'data-code': value}, LOWER_CODES[value]) : formatScalar(value);
// The last FutPythonTrader sync run is an object (status and times): its state and end are shown, never "[object Object]".
const lastRunText = run => run && typeof run === 'object'
  ? el('span', {}, lowerCode(run.status), ' · ', formatScalar(run.finished_at ?? run.started_at)) : formatScalar(null);

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
    return el('dl', {}, entries.flatMap(([key, item]) => [
      Object.hasOwn(LABELS, key) ? el('dt', {title: key, 'data-key': key}, LABELS[key]) : el('dt', {title: key, 'data-key': key, class: 'unlabelled'}, keyWords(key)),
      el('dd', {}, renderValue(item))]));
  }
  return code(value);
}

const metaLine = body => el('p', {class: 'meta'},
  'Fonte: ', body.meta?.source ?? ND, ' · generato: ', formatScalar(body.meta?.generated_at), ' · versione codice: ', body.meta?.code_version ?? ND);

const loading = what => el('p', {class: 'state loading', role: 'status', 'data-what': what}, 'Caricamento in corso…');

// The reason of a failure stays available (data-code and the tooltip), the page says what happened in plain words.
function errorState(error, retry) {
  return el('div', {class: 'state error', role: 'alert', 'data-code': error.code, title: reasonText(error)},
    el('p', {}, error.code === 'NETWORK' ? 'Connessione non disponibile: i dati non sono stati caricati.' : 'I dati non sono disponibili in questo momento.'),
    el('button', {type: 'button', onclick: retry, 'data-control': 'CTL-COMMON-RETRY'}, 'Riprova'));
}

// Archive slugs (country, league) read as words until the API carries display names (ui-text-inventory UI-12).
const words = slug => String(slug).trim().split(/[-_\s]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const nameOf = slug => typeof slug === 'string' && slug.trim() ? document.createTextNode(words(slug)) : formatScalar(null);
const seasonOf = season => typeof season === 'string' && /^\d{4}-\d{4}$/.test(season)
  ? document.createTextNode(`${season.slice(0, 4)}/${season.slice(7)}`) : formatScalar(season);
// A calendar date (YYYY-MM-DD) in Italian words or digits; the day itself is never shifted (D-7).
const LONG_DAY = new Intl.DateTimeFormat('it-IT', {timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
const SHORT_DAY = new Intl.DateTimeFormat('it-IT', {timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric'});
const dayText = (text, format = SHORT_DAY) => format.format(new Date(`${text}T00:00:00Z`));
const calendarDay = (text, format) => validDate(text) ? el('time', {datetime: text}, dayText(text, format)) : formatScalar(text);

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
const reasonText = error => `${error?.code ?? 'CLIENT'}${error?.message ? ` — ${error.message}` : ''}`;

// ---- Dati: the technical area (MP-OWNER-UI-NO-RAW-TEXT-01 §3.7, V-B2) ----

// The technical views share one section of the menu, «Dati», and a strip of tabs, as in the approved mockup.
const DATA_TABS = [['data', 'Panoramica', '#/data'], ['providers', 'Fornitori', '#/providers'], ['endpoints', 'API', '#/endpoints'], [null, 'Copertura', '/coverage']];
const dataTabs = current => el('nav', {class: 'tabs', 'aria-label': 'Sezioni dei dati', 'data-testid': 'data-tabs'},
  DATA_TABS.map(([view, text, href]) => el('a', {href, 'aria-current': view === current ? 'page' : null, 'data-control': ctl('DATA-TAB', view ?? 'coverage')}, text)));

// ---- Stato dei dati, formerly the Dashboard (MP-WEB-013) ----

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
      el('p', {class: 'state partial', role: 'status', 'data-code': settled.reason?.code ?? '', title: reasonText(settled.reason)}, 'Dato non disponibile in questo momento.'), source());
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
    el('h1', {}, 'Stato dei dati'), dataTabs('data'),
    failed ? el('p', {class: 'state partial', role: 'status', 'data-testid': 'dashboard-partial'},
      `${failed} ${failed === 1 ? 'riquadro' : 'riquadri'} su ${keys.length} ${failed === 1 ? 'non è disponibile' : 'non sono disponibili'}: il motivo è nel riquadro.`) : null,
    el('div', {class: 'grid'},
      tile('Servizio', 'tile-health', DASHBOARD.health, got.health, (data, body) => el('dl', {},
        field('Stato', data?.status ? lowerCode(data.status) : formatScalar(null), 'status'), field('Prodotto', formatScalar(data?.product), 'product'),
        field('Versione API', formatScalar(body.api_version), 'api_version'), field('Versione codice', formatScalar(body.meta?.code_version), 'code_version'))),
      tile('Salute dei dati', 'tile-data-health', DASHBOARD.providers, got.providers, data => {
        const health = data?.data_health;
        if (health === null || health === undefined) return missingSection('la salute dei dati');
        return el('dl', {},
          field('Stato', health.status ? lowerCode(health.status) : formatScalar(null), 'status'), field('Ultima sincronizzazione', lastRunText(health.lastRun), 'lastRun'),
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
          el('td', {'data-field': 'competition'}, nameOf(row.country_slug), ' · ', nameOf(row.league_slug)),
          el('td', {}, formatScalar(row.first_season), ' → ', formatScalar(row.last_season)),
          el('td', {'data-field': 'matches'}, num(row.matches)),
          el('td', {}, formatScalar(row.first_match_date)),
          el('td', {'data-field': 'last_match_date'}, row.last_match_date
            ? el('a', {href: `#/?${queryString({date: row.last_match_date})}`, title: 'Apri le partite di quel giorno', 'data-control': 'CTL-DATA-COVERAGE-DAY'}, row.last_match_date)
            : formatScalar(null)),
          el('td', {}, num(row.odds_coverage)), el('td', {}, num(row.xg_coverage)), el('td', {}, code(row.coverage_status)))))),
        el('p', {class: 'meta'}, 'Copertura: rapporto 0–1 calcolato dal server sui fatti salvati.'));
    }),
  ];
}

// ---- Match cards (Daily Board, search) ----

// The provider's kickoff time has no documented time zone: it is shown as the provider wrote it, never converted (D-7),
// and the tooltip says so in plain words.
const KICKOFF_NOTE = 'Orario indicato dalla fonte dei dati: il fuso orario non è specificato.';

function score(row) {
  if (row.home_score === null || row.home_score === undefined || row.away_score === null || row.away_score === undefined) return formatScalar(null);
  return document.createTextNode(`${formatNumber(row.home_score)}–${formatNumber(row.away_score)}`);
}
// A final result shows the score alone; a match without a result says why instead of a score.
const outcome = row => row.result_status && row.result_status !== 'FINAL' && Object.hasOwn(CODES, row.result_status) ? code(row.result_status) : score(row);

const odd = (text, value, name, title) => el('div', {class: 'odd', 'data-field': name, title}, el('span', {}, text), el('b', {}, num(value)));

// A compact row of the approved mockup (V-B4): kickoff, teams one above the other with the competition, score, then the
// markets: 1 X 2, Over 2,5 and Gol, favourite and xG. Every value of the former card is kept; on a phone the markets
// go under the teams instead of being hidden as in the mockup, so no data is lost.
function matchRow(row) {
  return el('article', {class: 'match', 'data-match': row.internal_match_id ?? '', 'data-result': row.result_status ?? '',
    'data-phase': row.phase ?? '', 'data-dataset': row.dataset_key ?? ''},
    el('p', {class: 'kick', 'data-field': 'kickoff', 'data-tz': row.kickoff_tz_status ?? '', title: row.kickoff_local_time ? KICKOFF_NOTE : null},
      formatScalar(row.kickoff_local_time)),
    el('div', {class: 'teams'},
      // The dash between the teams is hidden on screen (one team per line): the heading keeps it for screen readers (PR #173 review NB-2).
      // The teams open the Match Center of the match (R-07a).
      el('h3', {'aria-label': `${row.home_name || ND} – ${row.away_name || ND}`},
        el('a', {class: 'match-link', href: row.internal_match_id ? matchHref(row.internal_match_id) : null, 'data-action': 'open-match', 'data-control': 'CTL-BOARD-OPEN-MATCH'},
          el('span', {'data-field': 'home'}, formatScalar(row.home_name)), el('span', {class: 'sep'}, ' – '),
          el('span', {'data-field': 'away'}, formatScalar(row.away_name)))),
      el('p', {class: 'comp', 'data-field': 'competition'}, nameOf(row.country_slug), ' · ', nameOf(row.league_slug), ' · ', seasonOf(row.season))),
    el('p', {class: 'score', 'data-field': 'score'}, outcome(row)),
    el('div', {class: 'markets'},
      el('div', {class: 'odds', 'data-field': 'odds_1x2', role: 'group', 'aria-label': 'Quote 1 X 2'},
        odd('1', row.odd_home, 'odd_home', 'Vittoria casa'), odd('X', row.odd_draw, 'odd_draw', 'Pareggio'), odd('2', row.odd_away, 'odd_away', 'Vittoria ospite')),
      el('div', {class: 'odds two', role: 'group', 'aria-label': 'Quote gol'},
        odd('Over 2,5', row.odd_over25, 'odd_over25', 'Più di 2,5 gol'), odd('Gol', row.odd_btts_yes, 'odd_btts_yes', 'Entrambe le squadre segnano')),
      el('p', {class: 'facts'},
        el('span', {'data-field': 'favorite'}, 'Favorito ', row.favorite_side ? el('b', {}, code(row.favorite_side), ' ', num(row.favorite_odd)) : formatScalar(null)),
        el('span', {'data-field': 'xg'}, 'xG ', el('b', {}, num(row.xg_home), ' – ', num(row.xg_away))))));
}

// A list that keeps loading the next page with the API cursor. A failed page keeps what is shown and offers a retry.
function pagedList({first, path, params, render, more: moreLabel, mine, list}) {
  const footer = el('div', {class: 'paged-foot'});
  let cursor = first.data?.next_cursor ?? null;
  const append = rows => { for (const node of render(rows)) list.append(node); };
  const showFooter = () => {
    footer.replaceChildren();
    if (cursor) footer.append(el('button', {type: 'button', 'data-action': 'more', onclick: loadMore, 'data-control': 'CTL-LIST-MORE'}, moreLabel));
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
      footer.replaceChildren(el('div', {class: 'state error', role: 'alert', 'data-code': error?.code ?? '', title: reasonText(error)},
        el('p', {}, 'Non è stato possibile caricare altri risultati. Quelli già mostrati restano validi.'),
        el('button', {type: 'button', onclick: loadMore, 'data-control': 'CTL-LIST-RETRY'}, 'Riprova')));
    }
  }
  append(first.data?.rows ?? []);
  showFooter();
  return [list, footer];
}

// ---- Oggi: the Daily Board, home page (MP-WEB-002, D-2) ----

const BOARD_PAGE = 24;
const dayHref = date => `#/?${queryString({date})}`;

// When the archive was last synchronised: the end of the last FutPythonTrader sync run, shown only when that run
// completed (fully or in part) and carries a real time. Nothing is shown otherwise: no time is ever made up (UI-25).
// /api/v1/providers is a heavy diagnostic route: the board never waits for it (the line is filled in when it answers,
// if the page is still the same) and one good answer serves every day viewed for five minutes (PR #170 review B-1).
let freshness = null;
function providersOnce() {
  if (!freshness || Date.now() - freshness.at > 5 * 60 * 1000) {
    // A failed answer is not kept: the next day viewed asks again (PR #170 review R2-NB-1).
    const entry = {at: Date.now()};
    entry.body = getJson('/api/v1/providers').catch(() => { if (freshness === entry) freshness = null; return null; });
    freshness = entry;
  }
  return freshness.body;
}
function updatedSlot(mine) {
  const slot = el('div', {class: 'updated-slot', 'data-testid': 'updated-slot'});
  providersOnce().then(body => { if (mine === generation) slot.replaceChildren(...[updatedLine(body)].filter(Boolean)); });
  return slot;
}
function updatedLine(providers) {
  const run = providers?.data?.data_health?.lastRun;
  if (!run || typeof run !== 'object' || !['complete', 'partial'].includes(run.status) || !INSTANT.test(run.finished_at ?? '')) return null;
  return el('p', {class: 'updated', 'data-testid': 'updated', 'data-status': run.status},
    run.status === 'complete' ? 'Dati aggiornati: ' : 'Dati aggiornati in parte: ', instant(run.finished_at));
}

// The day strip of the approved mockup: the chosen day with the three before and after it. Calendar navigation only:
// it opens another day and derives no data value (MP-WEB-011).
const STRIP_WEEKDAY = new Intl.DateTimeFormat('it-IT', {timeZone: 'UTC', weekday: 'short'});
const STRIP_NUMBER = new Intl.DateTimeFormat('it-IT', {timeZone: 'UTC', day: 'numeric'});
function dayStrip(date) {
  const today = localToday();
  return el('nav', {class: 'dates', 'aria-label': 'Giorni vicini', 'data-testid': 'day-strip'}, [-3, -2, -1, 0, 1, 2, 3].map(shift => {
    const day = shiftDay(date, shift);
    const at = new Date(`${day}T00:00:00Z`);
    return el('a', {href: dayHref(day), 'data-date': day, 'aria-current': shift === 0 ? 'date' : null, 'aria-label': dayText(day, LONG_DAY), 'data-control': 'CTL-BOARD-DAY'},
      el('small', {}, day === today ? 'Oggi' : STRIP_WEEKDAY.format(at)), el('b', {}, STRIP_NUMBER.format(at)));
  }));
}

async function boardView(params, mine) {
  const date = params.get('date') || localToday();
  const picker = el('form', {class: 'controls', 'data-testid': 'board-controls', onsubmit: event => {
    event.preventDefault();
    location.hash = dayHref(new FormData(event.target).get('date'));
  }},
  el('a', {href: validDate(date) ? dayHref(shiftDay(date, -1)) : '#/', 'data-action': 'prev', 'data-control': 'CTL-BOARD-PREV'}, '← Giorno prima'),
  el('label', {}, 'Giorno ', el('input', {type: 'date', name: 'date', value: validDate(date) ? date : '', required: true, 'data-control': 'CTL-BOARD-DATE'})),
  el('button', {type: 'submit', 'data-control': 'CTL-BOARD-SHOW'}, 'Mostra'),
  el('a', {href: validDate(date) ? dayHref(shiftDay(date, 1)) : '#/', 'data-action': 'next', 'data-control': 'CTL-BOARD-NEXT'}, 'Giorno dopo →'),
  el('a', {href: dayHref(localToday()), 'data-action': 'today', 'data-control': 'CTL-BOARD-TODAY'}, 'Oggi'));
  const head = [el('h1', {}, date === localToday() ? 'Oggi' : 'Partite del giorno'), validDate(date) ? dayStrip(date) : null, picker];
  if (!validDate(date)) return [...head, el('p', {class: 'state error', role: 'alert', 'data-date': date}, 'Data non valida: scegli un giorno dal calendario.')];
  const path = '/api/v1/fpt/matches';
  const params2 = {date, limit: BOARD_PAGE};
  const first = await getJson(`${path}?${queryString(params2)}`);
  const updated = updatedSlot(mine);
  const rows = first.data?.rows ?? [];
  if (rows.length === 0) {
    return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'board-empty'}, `Nessuna partita ${dayText(date, LONG_DAY)}. `,
      'Fino a quale giorno arrivano i dati di ogni campionato lo trovi in ', el('a', {href: '#/data', 'data-control': 'CTL-BOARD-EMPTY-DATA'}, 'Dati'), '.'), updated];
  }
  // Kickoff order across competitions, as the API returns it; each card names its competition (PR #163 NB-3).
  const render = page => page.map(matchRow);
  return [...head, el('div', {class: 'dayhead'}, el('h2', {class: 'day', 'data-testid': 'board-day'}, calendarDay(date, LONG_DAY)), updated),
    ...pagedList({first, path, params: params2, render, more: 'Carica altre partite', mine,
      list: el('div', {class: 'card board', 'data-testid': 'paged-list'})})];
}

// ---- Match Center: pre-match analysis of one match (R-07a; MP-WEB-003, MP-WEB-014) ----
// Every figure is the server's (/api/v1/fpt/match-analysis): counts, averages and percentages in exact decimals, from the
// finished matches dated strictly before the match day. The page only chooses which of the API's windows to show.

const matchHref = id => `#/match?${queryString({id})}`;
const SCOPES = [['both', 'Entrambe'], ['home', 'Casa'], ['away', 'Ospite']];
const WINDOWS = [['5', 'Ultime 5'], ['10', 'Ultime 10'], ['20', 'Ultime 20'], ['season', 'Stagione']];
// «Casa / Trasferta» compares each team where it plays this match: the home team at home, the away team away.
const VENUES = [['split', 'Casa / Trasferta'], ['both', 'Tutte le partite'], ['home', 'Solo in casa'], ['away', 'Solo in trasferta']];
const FORM_LETTER = {W: 'V', D: 'N', L: 'P'};
const FORM_WORD = {W: 'Vittoria', D: 'Pareggio', L: 'Sconfitta'};
const choice = (value, options, fallback) => options.some(([key]) => key === value) ? value : fallback;
const percent = value => value === null || value === undefined ? formatScalar(null) : el('span', {}, num(value), '%');

// The rows the API sent, by match id, so a form chip or a source row can name its match.
const rowsById = venues => new Map(Object.values(venues ?? {}).flatMap(venue => venue.rows ?? []).map(row => [row.internal_match_id, row]));

function formChips(form, rows, label) {
  if (!Array.isArray(form) || form.length === 0) return el('span', {class: 'nd', 'data-field': 'form'}, ND);
  return el('span', {class: 'form', 'data-field': 'form', role: 'list', 'aria-label': label}, form.map(item => {
    const row = rows.get(item.match_id);
    const what = row ? `${FORM_WORD[item.result]}: ${row.home_name} ${row.home_score}–${row.away_score} ${row.away_name}, ${dayText(row.match_date)}` : FORM_WORD[item.result];
    return el('a', {class: `fm ${item.result}`, role: 'listitem', href: matchHref(item.match_id), title: what, 'aria-label': what, 'data-code': item.result, 'data-control': 'CTL-MATCH-FORM-CHIP'}, FORM_LETTER[item.result] ?? '?');
  }));
}

// The «Esito» column is the team's result: the head to head has no single team, so it has no such column (PR #176 review NB-7).
function sourceTable(team, stats, rows) {
  if (!stats || stats.n === 0) return el('p', {class: 'state empty', 'data-testid': 'no-history'}, 'Nessuna partita conclusa prima di questa data.');
  const withResult = team !== 'h2h';
  const columns = ['Data', 'Partita', ...(withResult ? ['Esito'] : []), 'Risultato', 'xG', '1 · X · 2'];
  const results = new Map((stats.form ?? []).map(item => [item.match_id, item.result]));
  const body = el('tbody', {'data-testid': `source-${team}`}, stats.source_match_ids.map(id => {
    const row = rows.get(id) ?? {internal_match_id: id};
    const result = results.get(id);
    const cells = [
      el('td', {'data-field': 'date'}, calendarDay(row.match_date)),
      el('td', {'data-field': 'teams'}, el('a', {href: matchHref(id), 'data-control': 'CTL-MATCH-SOURCE-ROW'}, formatScalar(row.home_name), ' – ', formatScalar(row.away_name))),
      withResult ? el('td', {'data-field': 'result'}, result ? el('span', {class: `fm ${result}`, title: FORM_WORD[result], 'data-code': result}, FORM_LETTER[result]) : formatScalar(null)) : null,
      el('td', {'data-field': 'score'}, score(row)),
      el('td', {'data-field': 'xg'}, num(row.xg_home), ' · ', num(row.xg_away)),
      el('td', {'data-field': 'odds_1x2'}, num(row.odd_home), ' · ', num(row.odd_draw), ' · ', num(row.odd_away))].filter(Boolean);
    cells.forEach((cell, index) => cell.setAttribute('data-label', columns[index]));
    return el('tr', {'data-match': id}, cells);
  }));
  return el('div', {class: 'tablewrap'}, el('table', {class: 'results'}, el('thead', {}, el('tr', {}, columns.map(columnTitle))), body));
}

// One line of the comparison: the home team's value, the label, the away team's value; a hidden side is left empty.
const STAT_ROWS = [
  ['n', 'Partite', s => num(s.n)],
  ['won', 'Vittorie', s => percent(s.percent?.won)],
  ['drawn', 'Pareggi', s => percent(s.percent?.drawn)],
  ['lost', 'Sconfitte', s => percent(s.percent?.lost)],
  ['goals_for_avg', 'Gol fatti a partita', s => num(s.goals_for_avg)],
  ['goals_against_avg', 'Gol subiti a partita', s => num(s.goals_against_avg)],
  ['over25', 'Over 2,5', s => percent(s.percent?.over25)],
  ['btts', 'Gol (entrambe segnano)', s => percent(s.percent?.btts)],
  ['clean_sheet', 'Porta inviolata', s => percent(s.percent?.clean_sheet)],
  ['failed_to_score', 'Senza segnare', s => percent(s.percent?.failed_to_score)],
  ['xg_for_avg', 'xG fatti a partita', s => num(s.xg_for_avg)],
  ['xg_against_avg', 'xG subiti a partita', s => num(s.xg_against_avg)],
  ['xg_n', 'Partite con xG', s => num(s.coverage?.xg_n)],
  ['odds_1x2_n', 'Partite con quote 1X2', s => num(s.coverage?.odds_1x2_n)],
];

function compareCard(home, away, names) {
  const side = (stats, render) => stats ? render(stats) : '';
  return el('section', {class: 'card compare', 'data-testid': 'compare'},
    el('h2', {}, 'Confronto'),
    el('div', {class: 'cmp-head'}, el('b', {'data-side': 'home'}, home ? names.home : ''), el('span', {}, ''), el('b', {'data-side': 'away'}, away ? names.away : '')),
    STAT_ROWS.map(([key, label, render]) => el('div', {class: 'cmp', 'data-stat': key},
      el('span', {class: 'n', 'data-side': 'home'}, side(home, render)), el('span', {class: 'l'}, label), el('span', {class: 'n r', 'data-side': 'away'}, side(away, render)))));
}

async function matchView(params) {
  const id = (params.get('id') ?? '').trim();
  if (!/^fpt:\S{1,396}$/.test(id)) {
    return [el('h1', {}, 'Partita'), el('p', {class: 'state error', role: 'alert', 'data-testid': 'match-invalid'},
      'Partita non valida: aprila dalla ', el('a', {href: '#/', 'data-control': 'CTL-MATCH-INVALID-BOARD'}, 'Daily Board'), ' o dalla ', el('a', {href: '#/search', 'data-control': 'CTL-MATCH-INVALID-SEARCH'}, 'Ricerca'), '.')];
  }
  const scope = choice(params.get('team'), SCOPES, 'both');
  const sample = choice(params.get('window'), WINDOWS, '10');
  const venue = choice(params.get('venue'), VENUES, 'split');
  const body = await getJson(`/api/v1/fpt/match-analysis?${queryString({id})}`);
  const data = body.data ?? {};
  const match = data.match;
  if (!match) {
    return [el('h1', {}, 'Partita non trovata'), el('p', {class: 'state empty', role: 'status', 'data-testid': 'match-not-found', 'data-code': data.reason ?? ''},
      'Questa partita non è nell\'archivio. ', el('a', {href: '#/', 'data-control': 'CTL-MATCH-UNKNOWN-BOARD'}, 'Torna a Oggi'))];
  }
  const names = {home: match.home_name ?? ND, away: match.away_name ?? ND};
  const teamVenue = side => venue === 'split' ? side : venue;
  const stats = side => data.teams?.[side]?.venues?.[teamVenue(side)]?.windows?.[sample] ?? null;
  const rows = side => rowsById(data.teams?.[side]?.venues);
  const recent = side => data.teams?.[side]?.venues?.both?.windows?.['5'] ?? null;
  const shown = side => scope === 'both' || scope === side;
  const link = (key, value) => `#/match?${queryString({id, team: scope, window: sample, venue, [key]: value})}`;
  const filter = (label, key, options, current) => el('nav', {class: 'seg', 'aria-label': label, 'data-filter': key},
    options.map(([value, text]) => el('a', {href: link(key, value), 'aria-current': value === current ? 'true' : null, 'data-value': value, 'data-control': ctl('MATCH-FILTER', key)}, text)));

  const hero = el('section', {class: 'hero', 'data-testid': 'match-hero', 'data-match': match.internal_match_id, 'data-result': match.result_status ?? '',
    'data-phase': match.phase ?? '', 'data-dataset': match.dataset_key ?? '', 'data-pit': data.method?.pit ?? '', 'data-version': data.method?.analysis_version ?? ''},
    el('p', {class: 'meta'},
      el('span', {'data-field': 'competition'}, nameOf(match.country_slug), ' · ', nameOf(match.league_slug), ' · ', seasonOf(match.season)),
      el('span', {'data-field': 'date'}, calendarDay(match.match_date, LONG_DAY))),
    // The board of the mockup is the page title: home side, score or kickoff, away side (one h1, read as «Casa – Ospite»).
    el('h1', {class: 'board', 'aria-label': `${names.home} – ${names.away}`},
      el('span', {class: 'side'}, el('b', {'data-field': 'home'}, formatScalar(match.home_name)),
        formChips(recent('home')?.form, rows('home'), `Ultime partite di ${names.home}`)),
      el('span', {class: 'mid'},
        el('span', {class: 'bigscore', 'data-field': 'score'}, outcome(match)),
        el('span', {class: 'kick', 'data-field': 'kickoff', 'data-tz': match.kickoff_tz_status ?? '', title: match.kickoff_local_time ? KICKOFF_NOTE : null},
          formatScalar(match.kickoff_local_time))),
      el('span', {class: 'side r'}, el('b', {'data-field': 'away'}, formatScalar(match.away_name)),
        formChips(recent('away')?.form, rows('away'), `Ultime partite di ${names.away}`))),
    el('div', {class: 'odds', 'data-field': 'odds_1x2', role: 'group', 'aria-label': 'Quote 1 X 2'},
      odd('1', match.odd_home, 'odd_home', `Vittoria ${names.home}`), odd('X', match.odd_draw, 'odd_draw', 'Pareggio'), odd('2', match.odd_away, 'odd_away', `Vittoria ${names.away}`),
      odd('Over 2,5', match.odd_over25, 'odd_over25', 'Più di 2,5 gol'), odd('Under 2,5', match.odd_under25, 'odd_under25', 'Meno di 2,5 gol'),
      odd('Gol', match.odd_btts_yes, 'odd_btts_yes', 'Entrambe le squadre segnano')),
    el('p', {class: 'facts'},
      el('span', {'data-field': 'favorite'}, 'Favorito ', match.favorite_side ? el('b', {}, code(match.favorite_side), ' ', num(match.favorite_odd)) : formatScalar(null)),
      el('span', {'data-field': 'xg'}, 'xG della partita ', el('b', {}, num(match.xg_home), ' – ', num(match.xg_away)))));

  const filters = el('section', {class: 'card fbar', 'data-testid': 'match-filters'},
    filter('Squadra', 'team', SCOPES, scope), filter('Campione', 'window', WINDOWS, sample), filter('Campo', 'venue', VENUES, venue));
  const cutoff = el('p', {class: 'updated', 'data-testid': 'cutoff', 'data-cutoff': data.method?.cutoff_before ?? ''},
    'Statistiche delle partite concluse prima di ', calendarDay(data.method?.cutoff_before ?? match.match_date, LONG_DAY), '; quelle dello stesso giorno sono escluse.');
  const teamCards = ['home', 'away'].filter(shown).map(side => el('section', {class: 'card source', 'data-testid': `team-${side}`, 'data-team': data.teams?.[side]?.team_id ?? '',
    'data-venue': teamVenue(side), 'data-window': sample},
    el('h2', {}, `Partite considerate: ${names[side]}`), sourceTable(side, stats(side), rows(side))));
  const h2h = data.head_to_head ?? {n: 0, rows: []};
  const h2hRows = new Map(h2h.rows.map(row => [row.internal_match_id, row]));
  const h2hCard = el('section', {class: 'card source', 'data-testid': 'head-to-head'}, el('h2', {}, 'Precedenti'),
    h2h.n ? sourceTable('h2h', {n: h2h.n, source_match_ids: h2h.rows.map(row => row.internal_match_id)}, h2hRows)
      : el('p', {class: 'state empty'}, 'Nessun precedente prima di questa data.'));
  return [hero, filters, cutoff, compareCard(shown('home') ? stats('home') : null, shown('away') ? stats('away') : null, names), ...teamCards, h2hCard];
}

// ---- Search and filters (MP-WEB-007) ----

const SEARCH_PAGE = 25;
// Form fields and the API parameters they map to. Values are checked by the server; the form only constrains types.
const SEARCH_FIELDS = ['team_id', 'venue', 'competition', 'from', 'before', 'result', 'fav_min', 'fav_max', 'min_goals', 'max_goals', 'with_odds', 'with_xg'];
const FIELD_LABELS = {team: 'Squadra', venue: 'Sede', competition: 'Campionato', from: 'Dal', before: 'Prima del', result: 'Risultato',
  fav_min: 'Quota favorito da', fav_max: 'Quota favorito a', min_goals: 'Gol totali da', max_goals: 'Gol totali a'};

function searchForm(params, competitions) {
  const value = name => params.get(name) ?? '';
  const select = (name, options) => el('select', {name, 'data-control': ctl('SEARCH', name)}, options.map(([v, text]) => el('option', {value: v, selected: value(name) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), 'data-control': ctl('SEARCH', name), ...attrs});
  const check = (name, text) => el('label', {class: 'check'}, el('input', {type: 'checkbox', name, value: 'true', checked: value(name) === 'true', 'data-control': ctl('SEARCH', name)}), ' ', text);
  const competitionOptions = [['', 'Tutte'], ...competitions.map(c => [c.internal_competition_id, `${words(c.country_slug ?? '')} · ${words(c.league_slug ?? '')}`])];
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
      : el('span', {class: 'nd', title: 'Nessun campionato disponibile'}, ND)),
    el('label', {}, 'Dal ', input('from', {type: 'date'})),
    el('label', {}, 'Prima del ', input('before', {type: 'date'})),
    el('label', {}, 'Risultato ', select('result', [['', 'Qualsiasi'], ['FINAL', 'Finale'], ['NO_RESULT', 'Senza risultato'], ['NOT_STARTED', 'Non iniziata']])),
    el('label', {}, 'Quota favorito da ', input('fav_min', {type: 'number', step: '0.01', min: '1.01', max: '1000'})),
    el('label', {}, 'a ', input('fav_max', {type: 'number', step: '0.01', min: '1.01', max: '1000'})),
    el('label', {}, 'Gol totali da ', input('min_goals', {type: 'number', step: '1', min: '0', max: '30'})),
    el('label', {}, 'a ', input('max_goals', {type: 'number', step: '1', min: '0', max: '30'}))),
  el('fieldset', {}, el('legend', {}, 'Qualità dei dati'), check('with_odds', 'solo con quote 1X2 complete'), check('with_xg', 'solo con xG')),
  el('button', {type: 'submit', 'data-control': 'CTL-SEARCH-SUBMIT'}, 'Cerca'), ' ', el('a', {href: '#/search', 'data-control': 'CTL-SEARCH-RESET'}, 'Azzera'));
}

// Column titles are set in capitals by the style; «xG» keeps its own case.
const columnTitle = text => el('th', {scope: 'col', class: /xG/.test(text) ? 'keep-case' : null}, text);
// On a phone each result reads as a small card: the column title is repeated before each value (data-label, UI-44).
const RESULT_COLUMNS = ['Data', 'Ora', 'Partita', 'Campionato', 'Risultato', '1 · X · 2', 'Over 2,5', 'xG'];
function resultsTable(rows) {
  return rows.map(row => {
    const line = el('tr', {'data-match': row.internal_match_id ?? ''}, ...resultCells(row));
    [...line.children].forEach((cell, index) => cell.setAttribute('data-label', RESULT_COLUMNS[index]));
    return line;
  });
}
function resultCells(row) {
  return [
    el('td', {'data-field': 'date'}, row.match_date ? el('a', {href: dayHref(row.match_date), title: 'Apri le partite di quel giorno', 'data-control': 'CTL-SEARCH-OPEN-DAY'}, calendarDay(row.match_date)) : formatScalar(null)),
    el('td', {'data-field': 'kickoff', title: row.kickoff_local_time ? KICKOFF_NOTE : null}, formatScalar(row.kickoff_local_time)),
    el('td', {'data-field': 'teams'}, row.internal_match_id
      ? el('a', {href: matchHref(row.internal_match_id), 'data-action': 'open-match', 'data-control': 'CTL-SEARCH-OPEN-MATCH'}, formatScalar(row.home_name), ' – ', formatScalar(row.away_name))
      : [formatScalar(row.home_name), ' – ', formatScalar(row.away_name)]),
    el('td', {'data-field': 'competition'}, nameOf(row.league_slug), ' ', seasonOf(row.season)),
    el('td', {'data-field': 'score'}, outcome(row)),
    el('td', {'data-field': 'odds_1x2'}, num(row.odd_home), ' · ', num(row.odd_draw), ' · ', num(row.odd_away)),
    el('td', {}, num(row.odd_over25)),
    el('td', {'data-field': 'xg'}, num(row.xg_home), ' · ', num(row.xg_away))];
}

async function searchView(params, mine) {
  const competitionsBody = await getJson('/api/v1/fpt/competitions').catch(error => {
    if (error?.code === 'UNAUTHENTICATED') throw error;
    return null;
  });
  const competitions = Array.isArray(competitionsBody?.data?.rows) ? competitionsBody.data.rows : [];
  const head = [el('h1', {}, 'Ricerca partite'),
    competitionsBody ? null : el('p', {class: 'state partial', role: 'status'}, 'Elenco dei campionati non disponibile: il filtro per campionato è disattivato.'),
    searchForm(params, competitions)];
  if (params.get('run') !== '1') return [...head, el('p', {class: 'state empty'}, 'Imposta i filtri e premi Cerca.')];

  // A team name is resolved to its id by the API (exact name, any spelling the archive knows).
  let teamId = params.get('team_id') || '';
  const teamText = (params.get('team') || '').trim();
  if (!teamId && teamText) {
    const teams = (await getJson(`/api/v1/fpt/teams?${queryString({q: teamText})}`)).data?.rows ?? [];
    if (teams.length === 0) return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'team-not-found', 'data-outcome': ''}, `Nessuna squadra trovata con il nome «${teamText}».`)];
    if (teams.length > 1) {
      return [...head, el('div', {class: 'state partial', role: 'status', 'data-testid': 'team-choice', 'data-outcome': ''},
        el('p', {}, `Più squadre si chiamano «${teamText}»: scegline una.`),
        el('ul', {}, teams.map(team => el('li', {}, el('a', {href: `#/search?${queryString({...Object.fromEntries(params), team_id: team.internal_team_id})}`, 'data-control': 'CTL-SEARCH-TEAM-CHOICE'},
          `${team.canonical_name} (${team.country_slug ? words(team.country_slug) : ND})`)))))];
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
      // The server names the parameter in its message: the page names the field the user filled in.
      // A parameter name is a token of its own in the message ("fav_min must be…", "invalid team"); team_id counts as team.
      const fields = Object.keys(FIELD_LABELS).filter(name => new RegExp(`(?<![a-z_])${name}(?:_id)?(?![a-z_])`).test(error.message ?? ''));
      return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'search-invalid', 'data-outcome': '', 'data-fields': fields.join(' '), title: reasonText(error)},
        fields.length ? `Valore non valido in: ${fields.map(name => FIELD_LABELS[name]).join(', ')}. Correggi il campo e riprova.` : 'Filtri non validi. Correggi i campi e riprova.')];
    }
    throw error;
  }
  const rows = first.data?.rows ?? [];
  if (rows.length === 0) return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'search-empty', 'data-outcome': ''}, 'Nessuna partita corrisponde ai filtri.')];
  const [body, footer] = pagedList({first, path, params: api, render: resultsTable, more: 'Altri risultati', mine,
    list: el('tbody', {'data-testid': 'search-results'})});
  const table = el('table', {class: 'results'}, el('thead', {}, el('tr', {}, RESULT_COLUMNS.map(columnTitle))), body);
  // The filters the server applied stay on the outcome (data-filters) for checks and the technical views.
  return [...head, el('h2', {'data-testid': 'search-outcome', 'data-outcome': '', 'data-filters': (first.data?.provenance?.filters_applied ?? []).join(' ')}, 'Risultati'),
    venueIgnored ? el('p', {class: 'state partial', role: 'status', 'data-testid': 'venue-ignored'}, 'La sede vale solo con una squadra: è stata ignorata.') : null,
    el('div', {class: 'tablewrap'}, table), footer];
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
    el('h1', {}, 'Fornitori dati'), dataTabs('providers'),
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
    el('h1', {}, 'API v1'), dataTabs('endpoints'),
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

// ---- Simulazione: the backtest over the stored archive (HIST-WEB-01, #34) ----

// Every figure comes from GET /api/v1/hist/backtest exactly as the engine reported it (MP-WEB-011): the page names the
// fields in Italian and never derives a value. The research mode (prices acquired after kickoff) is labelled on the form
// and on every result; no result is a certification or a proof of return.
const SIM_STRATEGIES = [['mp-ref-fav-back-1', 'Favorito · Punta'], ['mp-ref-fav-lay-1', 'Favorito · Banca'], ['custom', 'Personalizzata']];
// STRAT-CFG-01: the rules of a configurable strategy. The API turns them into a versioned definition and validates them;
// the page only collects them and reads back the definition the report records.
const DEF_SELECTION_TEXT = {FAVOURITE: 'Favorito', UNDERDOG: 'Sfavorito', HOME: 'Casa (1)', DRAW: 'Pareggio (X)', AWAY: 'Ospite (2)'};
const DEF_VENUE_TEXT = {ANY: 'Casa o trasferta', HOME: 'Solo in casa', AWAY: 'Solo in trasferta'};
const DEF_FIELDS = ['selection', 'side', 'odds_min', 'odds_max', 'home_min', 'home_max', 'draw_min', 'draw_max', 'away_min', 'away_max', 'team', 'venue'];
// The no-trade reasons of the engine and of a definition, in words; the code stays in data-code.
const NO_TRADE_TEXT = {NO_ADMISSIBLE_ODDS: 'Nessuna quota utilizzabile', INCOMPLETE_1X2: 'Quote 1X2 incomplete', PRICE_MISSING: 'Quota richiesta mancante',
  FAVOURITE_TIE: 'Favorito non unico', UNDERDOG_TIE: 'Sfavorito non unico', KICKOFF_UNKNOWN: 'Orario di inizio sconosciuto', TEAM_FILTER: 'Squadra o sede diversa',
  ODDS_OUT_OF_RANGE: 'Quota della selezione fuori intervallo', HOME_PRICE_OUT_OF_RANGE: 'Quota 1 fuori intervallo', DRAW_PRICE_OUT_OF_RANGE: 'Quota X fuori intervallo',
  AWAY_PRICE_OUT_OF_RANGE: 'Quota 2 fuori intervallo'};
const SIM_MODES = [['PIT', 'Rigorosa'], ['NON_PIT_RESEARCH', 'Ricerca esplorativa']];
const SIM_MM = [['', 'Puntata fissa'], ['FIXED_STAKE', 'Puntata fissa sul capitale'], ['FIXED_LIABILITY', 'Rischio fisso'],
  ['PERCENT_BANKROLL', 'Percentuale del capitale'], ['LIABILITY_PERCENT_BANKROLL', 'Rischio in percentuale del capitale']];
const SIM_FIELDS = ['from', 'to', 'competition', 'strategy', 'pit_mode', 'stake', 'commission', 'bankroll', 'mm_model', 'mm_value', 'max_events', ...DEF_FIELDS];
const SIM_LABELS = {from: 'Dal', to: 'Al', competition: 'Campionato', strategy: 'Strategia', pit_mode: 'Modalità', stake: 'Puntata',
  commission: 'Commissione', bankroll: 'Capitale iniziale', mm_model: 'Gestione del capitale', mm_value: 'Valore della gestione', max_events: 'Partite al massimo',
  selection: 'Selezione', side: 'Lato', odds_min: 'Quota selezione da', odds_max: 'Quota selezione fino a', home_min: 'Quota 1 da', home_max: 'Quota 1 fino a',
  draw_min: 'Quota X da', draw_max: 'Quota X fino a', away_min: 'Quota 2 da', away_max: 'Quota 2 fino a', team: 'Squadra', venue: 'Sede della squadra'};
const SIDE_TEXT = {BACK: 'Punta', LAY: 'Banca'};
const SELECTION_TEXT = {HOME: '1', DRAW: 'X', AWAY: '2'};
const BET_RESULT_TEXT = {WON: 'Vinta', LOST: 'Persa'};
const isResearch = report => report?.config?.pit_mode === 'NON_PIT_RESEARCH' || report?.certification?.pit_mode === 'NON_PIT_RESEARCH';
const labelled = (map, value) => typeof value === 'string' && Object.hasOwn(map, value)
  ? el('span', {class: 'code', title: value, 'data-code': value}, map[value]) : formatScalar(value);

// The research label: shown on the form when chosen and above every research result, never hidden in a tooltip.
const researchNotice = () => el('p', {class: 'state partial research', role: 'note', 'data-testid': 'sim-research'},
  el('b', {}, 'RICERCA ESPLORATIVA'), ' — le quote sono state acquisite dopo l’inizio delle partite: i risultati servono solo a studiare il motore e non dimostrano alcuna redditività.');

// The comparison opens with the simulation's data and its strategy as configuration A.
function compareHref(params) {
  const out = {};
  for (const name of CMP_DATA) if (params.get(name)) out[name] = params.get(name);
  for (const field of CMP_STRATEGY) if (params.get(field)) out[`a_${field}`] = params.get(field);
  return `#/compare?${queryString(out)}`;
}

function simForm(params, competitions) {
  const value = name => params.get(name) ?? '';
  const select = (name, options, fallback) => el('select', {name, 'data-control': ctl('SIM', name)}, options.map(([v, text]) => el('option', {value: v, selected: (value(name) || fallback) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), 'data-control': ctl('SIM', name), ...attrs});
  const competitionOptions = [['', 'Tutti'], ...competitions.map(c => [c.internal_competition_id, `${words(c.country_slug ?? '')} · ${words(c.league_slug ?? '')}`])];
  // The meaning of the research mode is shown as soon as it is chosen, before any run.
  const modeHint = el('p', {class: 'state partial', role: 'note', 'data-testid': 'sim-mode-hint', hidden: (value('pit_mode') || 'PIT') !== 'NON_PIT_RESEARCH'},
    'Ricerca esplorativa: usa le quote acquisite dopo l’inizio delle partite, solo per studio.');
  const modeSelect = select('pit_mode', SIM_MODES, 'PIT');
  modeSelect.addEventListener('change', () => { modeHint.hidden = modeSelect.value !== 'NON_PIT_RESEARCH'; });
  // The rules of a personalised strategy appear only when it is chosen; their fields are sent only then.
  const strategySelect = select('strategy', SIM_STRATEGIES, 'mp-ref-fav-back-1');
  const price = name => input(name, {type: 'number', step: '0.001', min: '1.001', max: '1000'});
  const rules = el('fieldset', {'data-testid': 'sim-rules', hidden: value('strategy') !== 'custom'}, el('legend', {}, 'Regole della strategia'),
    el('div', {class: 'fields'},
      el('label', {}, 'Selezione ', select('selection', Object.entries(DEF_SELECTION_TEXT), 'FAVOURITE')),
      el('label', {}, 'Lato ', select('side', Object.entries(SIDE_TEXT), 'BACK')),
      el('label', {}, 'Quota selezione da ', price('odds_min')), el('label', {}, 'Quota selezione fino a ', price('odds_max')),
      el('label', {}, 'Quota 1 da ', price('home_min')), el('label', {}, 'Quota 1 fino a ', price('home_max')),
      el('label', {}, 'Quota X da ', price('draw_min')), el('label', {}, 'Quota X fino a ', price('draw_max')),
      el('label', {}, 'Quota 2 da ', price('away_min')), el('label', {}, 'Quota 2 fino a ', price('away_max')),
      el('label', {}, 'Squadra ', input('team', {type: 'text', placeholder: 'es. Ajax', autocomplete: 'off', maxlength: '100'})),
      el('label', {}, 'Sede della squadra ', select('venue', Object.entries(DEF_VENUE_TEXT), 'ANY'))));
  strategySelect.addEventListener('change', () => { rules.hidden = strategySelect.value !== 'custom'; });
  return el('form', {class: 'card search', 'data-testid': 'sim-form', onsubmit: event => {
    event.preventDefault();
    const out = {};
    for (const [key, v] of new FormData(event.target).entries()) if (String(v).trim() !== '') out[key] = String(v).trim();
    if (out.strategy !== 'custom') for (const name of DEF_FIELDS) delete out[name];
    else if (!out.team || out.venue === 'ANY') delete out.venue;
    revealOutcome = true;
    const target = `#/sim?${queryString({...out, run: '1'})}`;
    if (location.hash === target) render();
    else location.hash = target;
  }},
  el('div', {class: 'fields'},
    el('label', {}, 'Dal ', input('from', {type: 'date', required: true})),
    el('label', {}, 'Al ', input('to', {type: 'date', required: true})),
    el('label', {}, 'Campionato ', competitions.length ? select('competition', competitionOptions, '')
      : el('span', {class: 'nd', title: 'Nessun campionato disponibile'}, ND)),
    el('label', {}, 'Strategia ', strategySelect),
    el('label', {}, 'Modalità ', modeSelect),
    el('label', {}, 'Puntata ', input('stake', {type: 'number', step: '0.01', min: '0.01', placeholder: '1'})),
    el('label', {}, 'Commissione (es. 0,05 = 5%) ', input('commission', {type: 'number', step: '0.001', min: '0', max: '0.999', placeholder: '0'})),
    el('label', {}, 'Partite al massimo ', input('max_events', {type: 'number', step: '1', min: '1', max: '1000', placeholder: '300'}))),
  rules,
  el('fieldset', {}, el('legend', {}, 'Capitale (facoltativo)'),
    el('div', {class: 'fields'},
      el('label', {}, 'Capitale iniziale ', input('bankroll', {type: 'number', step: '0.01', min: '0.01'})),
      el('label', {}, 'Gestione del capitale ', select('mm_model', SIM_MM, '')),
      el('label', {}, 'Valore della gestione (importo, o percentuale: 2 = 2%) ', input('mm_value', {type: 'number', step: '0.01', min: '0.01'})))),
  modeHint,
  el('button', {type: 'submit', 'data-control': 'CTL-SIM-SUBMIT'}, 'Simula'), ' ', el('a', {href: '#/sim', 'data-control': 'CTL-SIM-RESET'}, 'Azzera'));
}

// The strategy the report ran: a reference strategy by name, a personalised one by the rules its definition records.
function simStrategy(report) {
  const d = report.config?.strategy_definition;
  const reference = SIM_STRATEGIES.find(([id]) => id === report.config?.strategy);
  if (!d) return reference ? el('p', {class: 'meta', 'data-testid': 'sim-strategy', 'data-strategy': reference[0]}, 'Strategia: ', reference[1]) : null;
  const c = d.conditions ?? {};
  const range = (text, lo, hi) => (lo !== undefined || hi !== undefined)
    ? el('li', {}, text, ' ', lo !== undefined ? ['da ', num(lo)] : null, lo !== undefined && hi !== undefined ? ' ' : null, hi !== undefined ? ['fino a ', num(hi)] : null) : null;
  return el('section', {class: 'card', 'data-testid': 'sim-strategy', 'data-strategy': report.config.strategy ?? '', 'data-definition': d.version ?? ''},
    el('h2', {}, 'Strategia personalizzata'),
    el('ul', {class: 'rules'},
      el('li', {'data-field': 'rule_main'}, labelled(SIDE_TEXT, d.side), ' · ', labelled(DEF_SELECTION_TEXT, d.selection)),
      range('Quota della selezione', c.odds_min, c.odds_max), range('Quota 1', c.home_min, c.home_max),
      range('Quota X', c.draw_min, c.draw_max), range('Quota 2', c.away_min, c.away_max),
      c.teams ? el('li', {'data-field': 'rule_teams'}, 'Squadra: ', c.teams.join(', '), ' · ', DEF_VENUE_TEXT[c.venue ?? 'ANY']) : null));
}

// Why the strategy did not trade, as the engine counted it.
function noTradeReasons(report) {
  const reasons = Object.entries(report.counts?.no_trade_by_reason ?? {});
  if (!reasons.length) return null;
  return el('section', {class: 'card', 'data-testid': 'sim-no-trade'}, el('h2', {}, 'Motivi delle mancate operazioni'),
    el('dl', {}, reasons.flatMap(([code, n]) => [el('dt', {'data-code': code, title: code}, NO_TRADE_TEXT[code] ?? 'Altro motivo'), el('dd', {'data-reason': code}, num(n))])));
}

function simMetrics(report) {
  const m = report.metrics;
  if (!m) return null;
  const r = m.rounded ?? {};
  const side = name => m.by_side?.[name] ? [num(m.by_side[name].bets), ' scommesse · netto ', num(m.by_side[name].pl_net)] : formatScalar(null);
  return el('section', {class: 'card', 'data-testid': 'sim-metrics'}, el('h2', {}, 'Risultato'),
    el('dl', {},
      field('Scommesse regolate', num(m.bets), 'bets'), field('Vinte', num(m.won), 'won'), field('Perse', num(m.lost), 'lost'),
      field('Puntato', num(m.staked), 'staked'), field('Capitale a rischio', num(m.exposure), 'exposure'),
      field('Profitto lordo', num(r.pl_gross), 'pl_gross'), field('Commissioni', num(r.commission), 'commission'),
      field('Profitto netto', num(r.pl_net), 'pl_net'), field('Rendimento sul capitale a rischio', num(r.roi), 'roi'),
      field('Massimo calo', num(r.max_drawdown), 'max_drawdown'),
      field('Punta', side('BACK'), 'by_side_back'), field('Banca', side('LAY'), 'by_side_lay'),
      field('Risultati corretti dopo la fine', num(m.corrected_results), 'corrected_results')),
    el('p', {class: 'meta'}, 'Profitto lordo, commissioni, profitto netto e massimo calo sono arrotondati al centesimo, il rendimento a quattro decimali (0,0500 = 5%). Gli altri importi, anche per Punta e Banca e per ogni scommessa, sono esatti.'));
}

function simBankroll(report, totals) {
  const b = report.bankroll;
  if (!b) return null;
  return el('section', {class: 'card', 'data-testid': 'sim-bankroll'}, el('h2', {}, 'Capitale'),
    el('dl', {},
      field('Capitale iniziale', num(b.initial), 'initial'), field('Cassa finale', num(b.final_cash), 'final_cash'),
      field('Disponibile', num(b.available), 'available'), field('Profitto realizzato', num(b.realized_pnl), 'realized_pnl'),
      field('Rendimento sul capitale', num(b.return_on_bankroll), 'return_on_bankroll'), field('Massimo calo della cassa', num(b.max_drawdown), 'max_drawdown'),
      field('Scommesse piazzate', num(b.placed), 'placed'), field('Ridotte dalla gestione', num(b.reduced), 'reduced'),
      el('dt', {}, 'Saltate dalla gestione'), el('dd', {'data-field': 'skipped', title: Object.entries(b.skipped_by_reason ?? {}).map(([k, n]) => `${k}: ${n}`).join(' · ') || null},
        num(totals?.skipped_by_money_management))),
    el('p', {class: 'meta'}, 'Importi esatti, senza arrotondamenti.'));
}

const SIM_COLUMNS = ['Data', 'Partita', 'Lato', 'Segno', 'Quota', 'Puntata', 'Risultato', 'Netto'];
function simBets(bets, events, total) {
  const rows = bets.map(bet => {
    const event = events?.[bet.event_id] ?? {};
    const s = bet.settlement;
    const line = el('tr', {'data-event': bet.event_id ?? '', 'data-side': bet.side ?? ''},
      el('td', {}, event.match_date ? calendarDay(event.match_date) : formatScalar(bet.decision_time)),
      el('td', {}, formatScalar(event.home), ' – ', formatScalar(event.away)),
      el('td', {}, labelled(SIDE_TEXT, bet.side)),
      el('td', {}, labelled(SELECTION_TEXT, bet.selection)),
      el('td', {}, num(bet.odds)), el('td', {}, num(bet.stake)),
      el('td', {}, s ? labelled(BET_RESULT_TEXT, s.bet_result) : el('span', {class: 'nd', title: 'Risultato non disponibile alla data scelta'}, 'Non regolata')),
      el('td', {}, s ? num(s.net) : formatScalar(null)));
    [...line.children].forEach((cell, index) => cell.setAttribute('data-label', SIM_COLUMNS[index]));
    return line;
  });
  return el('section', {class: 'card', 'data-testid': 'sim-bets'}, el('h2', {}, 'Scommesse (', num(total), ')'),
    el('div', {class: 'tablewrap'}, el('table', {class: 'results'}, el('thead', {}, el('tr', {}, SIM_COLUMNS.map(text => el('th', {scope: 'col'}, text)))),
      el('tbody', {}, rows))));
}

async function simView(params) {
  const competitionsBody = await getJson('/api/v1/fpt/competitions').catch(error => {
    if (error?.code === 'UNAUTHENTICATED') throw error;
    return null;
  });
  const competitions = Array.isArray(competitionsBody?.data?.rows) ? competitionsBody.data.rows : [];
  const head = [el('h1', {}, 'Simulazione'),
    competitionsBody ? null : el('p', {class: 'state partial', role: 'status'}, 'Elenco dei campionati non disponibile: il filtro per campionato è disattivato.'),
    params.get('pit_mode') === 'NON_PIT_RESEARCH' ? researchNotice() : null,
    simForm(params, competitions),
    el('p', {class: 'meta'}, el('a', {href: compareHref(params), 'data-testid': 'sim-compare-link', 'data-control': 'CTL-SIM-COMPARE'}, 'Confronta più strategie sugli stessi dati'),
      ' · ', el('a', {href: '#/saved', 'data-testid': 'sim-saved-link', 'data-control': 'CTL-SIM-SAVED-LIST'}, 'Backtest salvati'))];
  if (params.get('run') !== '1') return [...head, el('p', {class: 'state empty'}, 'Scegli il periodo e premi Simula.')];
  const api = {};
  for (const key of SIM_FIELDS) if (params.get(key)) api[key] = params.get(key);
  // «Personalizzata» is the page's name for a definition: the API receives the rules, not a strategy id.
  if (api.strategy === 'custom') delete api.strategy;
  else for (const name of DEF_FIELDS) delete api[name];
  let body;
  try {
    body = await getJson(`/api/v1/hist/backtest?${queryString(api)}`);
  } catch (error) {
    if (error?.status === 400) {
      // The money management refusals name the model's own parameter (params.stake, params.percent…): that is «Valore della gestione».
      // An engine refusal names its field before the colon (config.<path>: …): only that path is read, so words of the
      // explanation (e.g. «1 to 100») are never taken for fields.
      const raw = String(error.message ?? '');
      const scoped = /^config\.([\w.]+):/.exec(raw);
      // A money-management refusal names the model's parameter or the missing capital after it, so its text is read whole.
      const message = (scoped && scoped[1] !== 'money_management' ? scoped[1] : raw).replace(/\bparams\.[a-z_]+/g, 'mm_value').replace(/\bconditions\.teams\b/g, 'team');
      const fields = Object.keys(SIM_LABELS).filter(name => new RegExp(`(?<![a-z_])${name}(?![a-z_])`).test(message));
      return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'sim-invalid', 'data-outcome': '', 'data-fields': fields.join(' '), title: reasonText(error)},
        fields.length ? `Valore non valido in: ${fields.map(name => SIM_LABELS[name]).join(', ')}. Correggi il campo e riprova.` : 'Impostazioni non valide. Correggi i campi e riprova.')];
    }
    if (error?.status === 429) {
      return [...head, el('p', {class: 'state partial', role: 'status', 'data-testid': 'sim-busy', 'data-outcome': '', title: reasonText(error)},
        'È già in corso un’altra simulazione: riprova tra qualche secondo.')];
    }
    throw error;
  }
  const report = body.data?.report;
  if (!report || typeof report !== 'object') throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza report');
  return [...head, ...simResult(body.data), await simSave(api, report)];
}

// The result of a backtest as the API returned it ({report, reader, events, totals}): shown the same way after a run and
// when a saved backtest is opened (MP-UI-PR-003).
function simResult(data) {
  const report = data.report;
  const reader = data.reader ?? {};
  const research = isResearch(report);
  const outcome = el('h2', {'data-testid': 'sim-outcome', 'data-outcome': '', 'data-status': report.status ?? '', 'data-certified': report.certification ? String(report.certification.certified) : '',
    'data-pit-mode': report.config?.pit_mode ?? '', 'data-report': report.report_sha256 ?? ''}, 'Esito della simulazione');
  const status = {
    INSUFFICIENT_PIT_DATA: el('p', {class: 'state empty', role: 'status', 'data-testid': 'sim-no-pit'}, research
      ? 'Nessuna quota utilizzabile nel periodo scelto: non c’è nulla da simulare.'
      : 'Nessuna quota nota prima dell’inizio delle partite nel periodo scelto: con la modalità rigorosa non c’è nulla da simulare. La modalità «Ricerca esplorativa» usa le quote acquisite dopo l’inizio, solo per studio.'),
    INSUFFICIENT_OUTCOMES: el('p', {class: 'state partial', role: 'status', 'data-testid': 'sim-no-outcomes'}, 'Scommesse decise, ma nessun risultato finale disponibile: nessun profitto calcolato.'),
  }[report.status] ?? (report.status === 'OK' && !report.metrics
    ? el('p', {class: 'state empty', role: 'status', 'data-testid': 'sim-no-bets'}, 'La strategia non ha scommesso su nessuna partita del periodo.') : null);
  const decisions = report.counts?.decisions ?? {};
  return [outcome,
    research ? researchNotice() : null,
    el('p', {class: 'state partial', role: 'note', 'data-testid': 'sim-certification', 'data-code': report.certification?.real_data_verdict ?? ''},
      'Non certificato: risultato tecnico su dati reali non verificati, non una previsione di guadagno.'),
    reader.truncated ? el('p', {class: 'state partial', role: 'status', 'data-testid': 'sim-truncated'},
      `Simulate solo le prime ${formatNumber(reader.events)} partite del periodo: aumenta «Partite al massimo» o riduci il periodo.`) : null,
    status,
    el('section', {class: 'card', 'data-testid': 'sim-counts'}, el('h2', {}, 'Partite'),
      el('dl', {}, field('Partite lette', num(report.counts?.events), 'events'), field('Puntate', num(decisions.BACK), 'decisions_back'),
        field('Bancate', num(decisions.LAY), 'decisions_lay'),
        el('dt', {}, 'Nessuna operazione'), el('dd', {'data-field': 'decisions_no_trade', title: Object.entries(report.counts?.no_trade_by_reason ?? {}).map(([k, n]) => `${k}: ${n}`).join(' · ') || null}, num(decisions.NO_TRADE)),
        el('dt', {}, 'Non regolate'), el('dd', {'data-field': 'unsettled', title: Object.entries(report.counts?.unsettled_by_reason ?? {}).map(([k, n]) => `${k}: ${n}`).join(' · ') || null}, num(data.totals?.unsettled)))),
    simStrategy(report), noTradeReasons(report),
    simMetrics(report), simBankroll(report, data.totals),
    Array.isArray(report.bets) && report.bets.length ? simBets(report.bets, data.events, data.totals?.bets) : null];
}

// ---- Salvataggi: results and strategies kept by the persistence API (MP-UI-PR-003, #34, #99) ----

// The pages use the adapter only (src/web/persistence.js): the real one here.
const persistence = createPersistence();

// Why a save is not offered, in plain words: no archive of saves yet (the schema is not applied, 503), or no owner
// access (writes need MATCHPILOT_AUTH=enforce and an owner session). Never a button that cannot work (rule 13).
async function saveAvailability() {
  const status = await persistence.status();
  // A session that expired is a login to redo, like every other view; not an unavailable archive (review #242 NB-3).
  if (status.code === 'UNAUTHENTICATED') throw toLogin();
  if (!status.ok || !status.data?.available) return {ok: false, code: status.ok ? 'UNAVAILABLE' : status.code, text: 'Salvataggio non disponibile: l’archivio dei salvataggi non è ancora attivo.'};
  if (!status.data.writes_enabled) return {ok: false, code: 'WRITES_DISABLED', text: 'Salvataggio non disponibile: serve l’accesso del proprietario.'};
  return {ok: true};
}

// The outcome of a save, in words; the code stays in data-status.
const SAVE_REFUSED = {UNAUTHENTICATED: 'Accesso scaduto: accedi di nuovo e riprova.', FORBIDDEN: 'Questo account non può salvare.',
  WRITES_REQUIRE_AUTH: 'Salvataggio non disponibile: serve l’accesso del proprietario.', UNAVAILABLE: 'Salvataggio non disponibile in questo momento: riprova più tardi.',
  BUSY: 'È già in corso un’altra simulazione: riprova tra qualche secondo.', NETWORK: 'Rete non raggiungibile: riprova.'};
const refusedText = (result, invalid) => SAVE_REFUSED[result.code] ?? (result.status === 400 ? invalid : 'Salvataggio non riuscito: riprova.');
// After an expired session, the way back: the login page, then this same page.
const loginAgain = result => (result.code === 'UNAUTHENTICATED'
  ? [' ', el('a', {href: loginHref(), 'data-testid': 'save-login', 'data-control': 'CTL-SIM-SAVE-LOGIN'}, 'Vai all’accesso')] : null);

// A save form: one request at a time (a double click sends one), the outcome announced next to it.
function saveForm({testid, fields, button, control, submit}) {
  const outcome = el('p', {class: 'state', role: 'status', 'data-testid': `${testid}-outcome`, hidden: true});
  const action = el('button', {type: 'submit', 'data-control': control}, button);
  let busy = false;
  const form = el('form', {class: 'save', 'data-testid': testid, onsubmit: async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    action.disabled = true;
    outcome.hidden = false;
    outcome.className = 'state';
    outcome.dataset.status = 'PENDING';
    outcome.replaceChildren('Salvataggio in corso…');
    try {
      const {status, nodes, ok} = await submit(new FormData(form));
      outcome.className = ok ? 'state' : 'state error';
      outcome.dataset.status = status;
      outcome.replaceChildren(...nodes.flat().filter(node => node !== null && node !== undefined));
    } finally {
      busy = false;
      action.disabled = false;
    }
  }}, ...fields, action, outcome);
  return form;
}

const savedHref = id => `#/saved?${queryString({id})}`;

async function simSave(api, report) {
  const section = el('section', {class: 'card', 'data-testid': 'sim-save'}, el('h2', {}, 'Salva'));
  const availability = await saveAvailability();
  if (!availability.ok) {
    section.append(el('p', {class: 'state partial', role: 'status', 'data-testid': 'sim-save-unavailable', 'data-code': availability.code}, availability.text));
    return section;
  }
  section.append(saveForm({testid: 'sim-save-result', control: 'CTL-SIM-SAVE', button: 'Salva risultato',
    fields: [el('label', {}, 'Nome del risultato ', el('input', {name: 'name', required: true, maxlength: '200', autocomplete: 'off', 'data-control': 'CTL-SIM-SAVE-NAME'}))],
    submit: async form => {
      // The server runs the same request again and stores what it produced: the page sends the request, not the result.
      const result = await persistence.saveBacktest({name: String(form.get('name') ?? ''), params: api});
      if (!result.ok) return {ok: false, status: result.code, nodes: [refusedText(result, 'Nome non valido: scrivi un nome di al massimo 200 caratteri.'), loginAgain(result)]};
      const again = result.data.status === 'ALREADY_SAVED';
      return {ok: true, status: result.data.status, nodes: [again ? 'Questo risultato era già salvato. ' : 'Risultato salvato. ',
        el('a', {href: savedHref(result.data.backtest_id), 'data-testid': 'sim-save-open', 'data-id': String(result.data.backtest_id), 'data-control': 'CTL-SIM-SAVE-OPEN'}, 'Apri il salvataggio')]};
    }}));
  // A «Personalizzata» strategy can be kept by name: the server builds its definition from the same rules it simulated.
  if (report.config?.strategy?.startsWith('def:')) {
    const rules = Object.fromEntries(DEF_FIELDS.filter(name => api[name] !== undefined).map(name => [name, api[name]]));
    section.append(saveForm({testid: 'sim-save-strategy', control: 'CTL-SIM-SAVE-STRATEGY', button: 'Salva strategia',
      fields: [el('label', {}, 'Nome della strategia ', el('input', {name: 'name', required: true, maxlength: '200', autocomplete: 'off', 'data-control': 'CTL-SIM-SAVE-STRATEGY-NAME'})),
        el('label', {}, 'Codice breve ', el('input', {name: 'key', required: true, maxlength: '63', pattern: '[a-z0-9][a-z0-9\\-]*', autocomplete: 'off',
          title: 'lettere minuscole, cifre e trattini', 'data-control': 'CTL-SIM-SAVE-STRATEGY-KEY'}))],
      submit: async form => {
        const result = await persistence.saveStrategy({key: String(form.get('key') ?? ''), name: String(form.get('name') ?? ''), rules});
        if (!result.ok) return {ok: false, status: result.code, nodes: [refusedText(result, 'Nome o codice non validi: il codice usa lettere minuscole, cifre e trattini.'), loginAgain(result)]};
        const {status, version, strategy_id: id} = result.data;
        // A code already in use gets a new version: said, so earlier rules are never replaced silently (review #242 NB-4).
        const text = status === 'UNCHANGED' ? `Strategia già salvata con queste regole (versione ${version}).`
          : version > 1 ? `Nuova versione ${version} della strategia con questo codice: la versione ${version - 1} resta nello storico.` : `Strategia salvata (versione ${version}).`;
        return {ok: true, status, nodes: [el('span', {'data-strategy': id, 'data-version': String(version)}, text)]};
      }}));
  }
  return section;
}

const SAVED_KIND = {BACKTEST: 'Simulazione', COMPARE: 'Confronto'};

// «Backtest salvati»: the list, newest first, and one saved result opened as it was produced.
async function savedView(params) {
  const back = el('p', {class: 'meta'}, el('a', {href: '#/sim', 'data-control': 'CTL-SAVED-BACK-SIM'}, 'Torna alla simulazione'));
  const id = params.get('id');
  if (id !== null) {
    if (!/^[1-9][0-9]{0,8}$/.test(id)) return [el('h1', {}, 'Backtest salvato'), el('p', {class: 'state error', role: 'alert', 'data-testid': 'saved-invalid'}, 'Salvataggio non valido.'), back];
    const loaded = await persistence.loadBacktest(id);
    if (loaded.code === 'UNAUTHENTICATED') throw toLogin();
    if (!loaded.ok) {
      const text = loaded.status === 404 ? 'Questo salvataggio non esiste.' : refusedText(loaded, 'Salvataggio non valido.');
      return [el('h1', {}, 'Backtest salvato'), el('p', {class: 'state error', role: 'alert', 'data-testid': 'saved-error', 'data-code': loaded.code}, text), back];
    }
    const saved = loaded.data;
    const head = [el('h1', {}, 'Backtest salvato'),
      el('p', {class: 'meta', 'data-testid': 'saved-meta', 'data-id': String(saved.backtest_id), 'data-kind': saved.kind},
        el('b', {'data-field': 'saved_name'}, saved.name), ' · salvato il ', instant(saved.created_at)), back];
    if (saved.kind !== 'BACKTEST' || !saved.result?.report) {
      return [...head, el('p', {class: 'state partial', role: 'status', 'data-testid': 'saved-kind-unavailable'}, 'Non disponibile: l’apertura dei confronti salvati arriverà con la pagina del confronto.')];
    }
    return [...head, ...simResult(saved.result)];
  }
  const list = await persistence.listBacktests();
  if (list.code === 'UNAUTHENTICATED') throw toLogin();
  const title = el('h1', {}, 'Backtest salvati');
  if (!list.ok) {
    const text = list.status === 503 ? 'Non disponibile: l’archivio dei salvataggi non è ancora attivo.' : refusedText(list, 'Elenco non disponibile.');
    return [title, el('p', {class: 'state partial', role: 'status', 'data-testid': 'saved-unavailable', 'data-code': list.code}, text), back];
  }
  const rows = list.data.backtests ?? [];
  if (!rows.length) return [title, el('p', {class: 'state empty', 'data-testid': 'saved-empty'}, 'Nessun backtest salvato: salva un risultato dalla simulazione.'), back];
  return [title, el('div', {class: 'tablewrap'}, el('table', {class: 'results', 'data-testid': 'saved-list'},
    el('thead', {}, el('tr', {}, ['Nome', 'Tipo', 'Salvato il'].map(text => el('th', {scope: 'col'}, text)))),
    el('tbody', {}, rows.map(row => el('tr', {'data-id': String(row.backtest_id), 'data-report': (row.report_sha256 ?? []).join(' ')},
      el('td', {'data-label': 'Nome'}, el('a', {href: savedHref(row.backtest_id), 'data-control': 'CTL-SAVED-OPEN'}, row.name)),
      el('td', {'data-label': 'Tipo'}, SAVED_KIND[row.kind] ?? ND),
      el('td', {'data-label': 'Salvato il'}, instant(row.created_at))))))), back];
}

// ---- Confronto: two or three strategy configurations on the same data (STRAT-CMP-01, #34) ----

// The page sends the configurations to GET /api/v1/hist/compare, which reads the data once and runs each one with the
// same period, competition, mode, commission and size. The reports sit side by side: the browser computes no
// difference and no ranking (MP-WEB-011).
const CMP_KEYS = ['a', 'b', 'c'];
const CMP_DATA = ['from', 'to', 'competition', 'pit_mode', 'commission', 'max_events'];
const CMP_STRATEGY = ['strategy', ...DEF_FIELDS, 'stake', 'bankroll', 'mm_model', 'mm_value'];
const CMP_STRATEGY_LABELS = {strategy: 'Strategia', stake: 'Puntata', bankroll: 'Capitale iniziale', mm_model: 'Gestione del capitale', mm_value: 'Valore della gestione',
  ...Object.fromEntries(DEF_FIELDS.map(name => [name, SIM_LABELS[name]]))};

// The strategy fields of one configuration, every name prefixed by its key; C may stay empty («Nessuna»).
function cmpConfiguration(params, key) {
  const name = field => `${key}_${field}`;
  const value = field => params.get(name(field)) ?? '';
  const select = (field, options, fallback) => el('select', {name: name(field), 'data-control': ctl('CMP', name(field))}, options.map(([v, text]) => el('option', {value: v, selected: (value(field) || fallback) === v}, text)));
  const input = (field, attrs) => el('input', {name: name(field), value: value(field), 'data-control': ctl('CMP', name(field)), ...attrs});
  const price = field => input(field, {type: 'number', step: '0.001', min: '1.001', max: '1000'});
  const optional = key === 'c';
  const strategies = optional ? [['', 'Nessuna'], ...SIM_STRATEGIES] : SIM_STRATEGIES;
  const strategySelect = select('strategy', strategies, optional ? '' : 'mp-ref-fav-back-1');
  const rules = el('div', {class: 'fields', 'data-testid': `cmp-rules-${key}`, hidden: value('strategy') !== 'custom'},
    el('label', {}, 'Selezione ', select('selection', Object.entries(DEF_SELECTION_TEXT), 'FAVOURITE')),
    el('label', {}, 'Lato ', select('side', Object.entries(SIDE_TEXT), 'BACK')),
    el('label', {}, 'Quota selezione da ', price('odds_min')), el('label', {}, 'Quota selezione fino a ', price('odds_max')),
    el('label', {}, 'Quota 1 da ', price('home_min')), el('label', {}, 'Quota 1 fino a ', price('home_max')),
    el('label', {}, 'Quota X da ', price('draw_min')), el('label', {}, 'Quota X fino a ', price('draw_max')),
    el('label', {}, 'Quota 2 da ', price('away_min')), el('label', {}, 'Quota 2 fino a ', price('away_max')),
    el('label', {}, 'Squadra ', input('team', {type: 'text', placeholder: 'es. Ajax', autocomplete: 'off', maxlength: '100'})),
    el('label', {}, 'Sede della squadra ', select('venue', Object.entries(DEF_VENUE_TEXT), 'ANY')));
  const money = el('div', {class: 'fields', 'data-testid': `cmp-money-${key}`, hidden: optional && !value('strategy')},
    el('label', {}, 'Puntata ', input('stake', {type: 'number', step: '0.01', min: '0.01', placeholder: '1'})),
    el('label', {}, 'Capitale iniziale ', input('bankroll', {type: 'number', step: '0.01', min: '0.01'})),
    el('label', {}, 'Gestione del capitale ', select('mm_model', SIM_MM, '')),
    el('label', {}, 'Valore della gestione (importo, o percentuale: 2 = 2%) ', input('mm_value', {type: 'number', step: '0.01', min: '0.01'})));
  strategySelect.addEventListener('change', () => { rules.hidden = strategySelect.value !== 'custom'; money.hidden = optional && !strategySelect.value; });
  return el('fieldset', {'data-testid': `cmp-config-${key}`}, el('legend', {}, `Configurazione ${key.toUpperCase()}${optional ? ' (facoltativa)' : ''}`),
    el('div', {class: 'fields'}, el('label', {}, 'Strategia ', strategySelect)), rules, money);
}

// The form values as the page's address: a reference strategy drops the rules, an empty C drops everything of C.
function cmpOut(entries) {
  const out = {};
  for (const [key, v] of entries) if (String(v).trim() !== '') out[key] = String(v).trim();
  for (const key of CMP_KEYS) {
    const strategy = out[`${key}_strategy`];
    if (!strategy) for (const field of CMP_STRATEGY) delete out[`${key}_${field}`];
    else if (strategy !== 'custom') for (const field of DEF_FIELDS) delete out[`${key}_${field}`];
    else if (!out[`${key}_team`] || out[`${key}_venue`] === 'ANY') delete out[`${key}_venue`];
  }
  return out;
}

function cmpForm(params, competitions) {
  const value = name => params.get(name) ?? '';
  const select = (name, options, fallback) => el('select', {name, 'data-control': ctl('CMP', name)}, options.map(([v, text]) => el('option', {value: v, selected: (value(name) || fallback) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), 'data-control': ctl('CMP', name), ...attrs});
  const competitionOptions = [['', 'Tutti'], ...competitions.map(c => [c.internal_competition_id, `${words(c.country_slug ?? '')} · ${words(c.league_slug ?? '')}`])];
  const modeHint = el('p', {class: 'state partial', role: 'note', 'data-testid': 'sim-mode-hint', hidden: (value('pit_mode') || 'PIT') !== 'NON_PIT_RESEARCH'},
    'Ricerca esplorativa: usa le quote acquisite dopo l’inizio delle partite, solo per studio.');
  const modeSelect = select('pit_mode', SIM_MODES, 'PIT');
  modeSelect.addEventListener('change', () => { modeHint.hidden = modeSelect.value !== 'NON_PIT_RESEARCH'; });
  return el('form', {class: 'card search', 'data-testid': 'cmp-form', onsubmit: event => {
    event.preventDefault();
    revealOutcome = true;
    const target = `#/compare?${queryString({...cmpOut(new FormData(event.target).entries()), run: '1'})}`;
    if (location.hash === target) render();
    else location.hash = target;
  }},
  el('fieldset', {}, el('legend', {}, 'Dati in comune'),
    el('div', {class: 'fields'},
      el('label', {}, 'Dal ', input('from', {type: 'date', required: true})),
      el('label', {}, 'Al ', input('to', {type: 'date', required: true})),
      el('label', {}, 'Campionato ', competitions.length ? select('competition', competitionOptions, '')
        : el('span', {class: 'nd', title: 'Nessun campionato disponibile'}, ND)),
      el('label', {}, 'Modalità ', modeSelect),
      el('label', {}, 'Commissione (es. 0,05 = 5%) ', input('commission', {type: 'number', step: '0.001', min: '0', max: '0.999', placeholder: '0'})),
      el('label', {}, 'Partite al massimo ', input('max_events', {type: 'number', step: '1', min: '1', max: '1000', placeholder: '300'})))),
  CMP_KEYS.map(key => cmpConfiguration(params, key)),
  modeHint,
  el('button', {type: 'submit', 'data-control': 'CTL-CMP-SUBMIT'}, 'Confronta'), ' ', el('a', {href: '#/compare', 'data-control': 'CTL-CMP-RESET'}, 'Azzera'), ' ',
  el('a', {href: '#/sim', 'data-control': 'CTL-CMP-BACK-SIM'}, 'Torna alla simulazione'));
}

// A refusal names its configuration («a_side…», «b: config.stake…») and its field.
function cmpRefusedFields(message) {
  const raw = String(message ?? '');
  const scoped = /^([abc]): config\.([\w.]+):/.exec(raw);
  if (scoped) {
    const path = scoped[2] === 'money_management' ? raw.slice(raw.indexOf(':', 3) + 1) : scoped[2];
    const text = path.replace(/\bparams\.[a-z_]+/g, 'mm_value').replace(/\bconditions\.teams\b/g, 'team');
    return Object.keys(CMP_STRATEGY_LABELS).filter(f => new RegExp(`(?<![a-z_])${f}(?![a-z_])`).test(text)).map(f => `${scoped[1]}_${f}`);
  }
  const data = CMP_DATA.filter(f => new RegExp(`(?<![a-z_])${f}(?![a-z_])`).test(raw));
  const own = [...raw.matchAll(/\b([abc])_([a-z_]+)\b/g)].map(([, key, field]) => `${key}_${field}`).filter(n => CMP_STRATEGY.includes(n.slice(2)));
  return [...new Set([...data, ...own])];
}
const cmpFieldLabel = name => /^[abc]_/.test(name) ? `Configurazione ${name[0].toUpperCase()} · ${CMP_STRATEGY_LABELS[name.slice(2)] ?? name.slice(2)}` : SIM_LABELS[name];

// One line of the side-by-side table: a label and, for each configuration, the API's value.
function cmpRow(label, name, variants, valueOf) {
  return el('tr', {'data-row': name}, el('th', {scope: 'row'}, label), variants.map(v => el('td', {'data-field': `${v.key}_${name}`, 'data-label': `Configurazione ${v.key.toUpperCase()}`}, valueOf(v))));
}
function cmpStrategyText(report) {
  const d = report.config?.strategy_definition;
  const reference = SIM_STRATEGIES.find(([id]) => id === report.config?.strategy);
  if (!d) return reference ? reference[1] : formatScalar(null);
  const c = d.conditions ?? {};
  // el() flattens one level of children: each part is a flat list.
  const range = (text, lo, hi) => (lo !== undefined || hi !== undefined) ? [' · ', text, ...(lo !== undefined ? [' da ', num(lo)] : []), ...(hi !== undefined ? [' fino a ', num(hi)] : [])] : null;
  return el('span', {'data-strategy': report.config.strategy ?? ''}, 'Personalizzata: ', labelled(SIDE_TEXT, d.side), ' · ', labelled(DEF_SELECTION_TEXT, d.selection),
    range('quota', c.odds_min, c.odds_max), range('1', c.home_min, c.home_max), range('X', c.draw_min, c.draw_max), range('2', c.away_min, c.away_max),
    c.teams ? [' · ', c.teams.join(', '), ' ', DEF_VENUE_TEXT[c.venue ?? 'ANY'].toLowerCase()] : null);
}

async function compareView(params) {
  const competitionsBody = await getJson('/api/v1/fpt/competitions').catch(error => {
    if (error?.code === 'UNAUTHENTICATED') throw error;
    return null;
  });
  const competitions = Array.isArray(competitionsBody?.data?.rows) ? competitionsBody.data.rows : [];
  const head = [el('h1', {}, 'Confronto di strategie'),
    competitionsBody ? null : el('p', {class: 'state partial', role: 'status'}, 'Elenco dei campionati non disponibile: il filtro per campionato è disattivato.'),
    params.get('pit_mode') === 'NON_PIT_RESEARCH' ? researchNotice() : null,
    cmpForm(params, competitions)];
  if (params.get('run') !== '1') return [...head, el('p', {class: 'state empty'}, 'Scegli il periodo e almeno le configurazioni A e B, poi premi Confronta.')];
  const api = {};
  for (const name of CMP_DATA) if (params.get(name)) api[name] = params.get(name);
  for (const key of CMP_KEYS) {
    const strategy = params.get(`${key}_strategy`);
    if (!strategy) continue;
    for (const field of CMP_STRATEGY) if (params.get(`${key}_${field}`)) api[`${key}_${field}`] = params.get(`${key}_${field}`);
    // «Personalizzata» is the page's name for a definition: the API receives the rules, not a strategy id.
    if (strategy === 'custom') delete api[`${key}_strategy`];
    else for (const field of DEF_FIELDS) delete api[`${key}_${field}`];
  }
  let body;
  try {
    body = await getJson(`/api/v1/hist/compare?${queryString(api)}`);
  } catch (error) {
    if (error?.status === 400) {
      const fields = cmpRefusedFields(error.message);
      return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'cmp-invalid', 'data-outcome': '', 'data-fields': fields.join(' '), title: reasonText(error)},
        fields.length ? `Valore non valido in: ${fields.map(cmpFieldLabel).join(', ')}. Correggi il campo e riprova.` : 'Impostazioni non valide. Correggi i campi e riprova.')];
    }
    if (error?.status === 429) {
      return [...head, el('p', {class: 'state partial', role: 'status', 'data-testid': 'sim-busy', 'data-outcome': '', title: reasonText(error)},
        'È già in corso un’altra simulazione: riprova tra qualche secondo.')];
    }
    if (error?.status === 414) {
      return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'cmp-too-long', 'data-outcome': '', title: reasonText(error)},
        'Troppe regole insieme: togli qualche condizione o accorcia i nomi delle squadre e riprova.')];
    }
    throw error;
  }
  const variants = Array.isArray(body.data?.variants) ? body.data.variants : [];
  if (variants.length < 2 || variants.some(v => !v.report)) throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza confronto');
  const reader = body.data?.reader ?? {};
  const research = variants.some(v => isResearch(v.report));
  const metric = (v, field) => num(v.report.metrics?.rounded?.[field] ?? (v.report.metrics ? undefined : null));
  const plain = (v, field) => num(v.report.metrics?.[field]);
  const statusText = v => ({INSUFFICIENT_PIT_DATA: 'Nessuna quota utilizzabile', INSUFFICIENT_OUTCOMES: 'Nessun risultato finale'}[v.report.status]
    ?? (v.report.status === 'OK' && !v.report.metrics ? 'Nessuna scommessa' : 'Completata'));
  return [...head,
    el('h2', {'data-testid': 'cmp-outcome', 'data-outcome': '', 'data-input': body.data?.input_sha256 ?? '', 'data-reports': variants.map(v => v.report.report_sha256).join(' '),
      'data-pit-mode': variants[0].report.config?.pit_mode ?? ''}, 'Esito del confronto'),
    research ? researchNotice() : null,
    el('p', {class: 'state partial', role: 'note', 'data-testid': 'sim-certification'},
      'Non certificato: risultati tecnici su dati reali non verificati, non una previsione di guadagno. Stessi dati, stesso periodo e stessa modalità per tutte le configurazioni.'),
    reader.truncated ? el('p', {class: 'state partial', role: 'status', 'data-testid': 'sim-truncated'},
      `Confrontate solo le prime ${formatNumber(reader.events)} partite del periodo: aumenta «Partite al massimo» o riduci il periodo.`) : null,
    el('section', {class: 'card', 'data-testid': 'cmp-table'}, el('h2', {}, 'Configurazioni a confronto'),
      el('div', {class: 'tablewrap'}, el('table', {class: 'compare'},
        el('thead', {}, el('tr', {}, el('td', {}), variants.map(v => el('th', {scope: 'col', 'data-key': v.key}, `Configurazione ${v.key.toUpperCase()}`)))),
        el('tbody', {},
          cmpRow('Strategia', 'strategy', variants, v => cmpStrategyText(v.report)),
          cmpRow('Esito', 'status', variants, v => el('span', {'data-code': v.report.status ?? ''}, statusText(v))),
          cmpRow('Partite lette', 'events', variants, v => num(v.report.counts?.events)),
          cmpRow('Scommesse', 'bets', variants, v => num(v.totals?.bets)),
          cmpRow('Nessuna operazione', 'no_trade', variants, v => num(v.totals?.no_trade)),
          cmpRow('Non regolate', 'unsettled', variants, v => num(v.totals?.unsettled)),
          cmpRow('Vinte', 'won', variants, v => plain(v, 'won')),
          cmpRow('Perse', 'lost', variants, v => plain(v, 'lost')),
          cmpRow('Capitale a rischio', 'exposure', variants, v => plain(v, 'exposure')),
          cmpRow('Profitto netto', 'pl_net', variants, v => metric(v, 'pl_net')),
          cmpRow('Rendimento sul capitale a rischio', 'roi', variants, v => metric(v, 'roi')),
          cmpRow('Massimo calo', 'max_drawdown', variants, v => metric(v, 'max_drawdown')),
          cmpRow('Cassa finale', 'final_cash', variants, v => v.report.bankroll ? num(v.report.bankroll.final_cash) : el('span', {class: 'empty', title: 'Configurazione senza capitale'}, '—'))))),
      el('p', {class: 'meta'}, 'Profitto netto e massimo calo arrotondati al centesimo, rendimento a quattro decimali (0,0500 = 5%); gli altri importi sono esatti. Nessuna classifica: i valori sono quelli di ciascuna simulazione.'))];
}

// ---- Strumenti: the Trading Tools of #94 (MP-UI-PR-005) ----

// Each tool: its tab text and its form fields [name, label, attributes]. The page sends what the user typed (a decimal
// comma is fine) and shows the server's display values; the exact value is in the tooltip (MP-WEB-011). Manual input
// only, as #94 requires it to be labelled; the tools outside this perimeter are named, not offered as controls.
const DECIMAL = {type: 'text', inputmode: 'decimal', autocomplete: 'off', maxlength: '40'};
const TOOL_COMMISSION = ['commission', 'Commissione % sulle vincite', {...DECIMAL, placeholder: '0'}];
const TOOL_LIST = [
  ['odds', 'Margine', [['odds', 'Quote (separate da spazi)', {...DECIMAL, inputmode: 'text', maxlength: '200', required: true, placeholder: 'es. 2,10 3,40 3,60'}]]],
  ['kelly', 'Stake e Kelly', [['bankroll', 'Capitale', {...DECIMAL, required: true}], ['odds', 'Quota', {...DECIMAL, required: true}],
    ['probability', 'Probabilità stimata %', {...DECIMAL, required: true}], ['fraction', 'Frazione di Kelly %', {...DECIMAL, placeholder: '100'}],
    ['max_stake', 'Tetto alla puntata', DECIMAL], ['max_bankroll', 'Tetto in % del capitale', DECIMAL]]],
  ['ev', 'Valore atteso', [['stake', 'Puntata', {...DECIMAL, required: true}], ['odds', 'Quota', {...DECIMAL, required: true}],
    ['probability', 'Probabilità stimata %', {...DECIMAL, required: true}], TOOL_COMMISSION]],
  ['liability', 'Responsabilità', [['stake', 'Puntata di banca', {...DECIMAL, required: true}], ['odds', 'Quota di banca', {...DECIMAL, required: true}],
    TOOL_COMMISSION, ['bankroll', 'Capitale', DECIMAL]]],
  ['hedge', 'Copertura', [['side', 'Posizione aperta', {select: [['BACK', 'Punta (copri bancando)'], ['LAY', 'Banca (copri puntando)']]}],
    ['stake', 'Puntata aperta', {...DECIMAL, required: true}], ['odds', 'Quota di apertura', {...DECIMAL, required: true}],
    ['exit_odds', 'Quota di uscita', {...DECIMAL, required: true}], TOOL_COMMISSION]],
  ['dutching', 'Dutching', [['total', 'Puntata totale', {...DECIMAL, required: true}],
    ['odds', 'Quote (separate da spazi)', {...DECIMAL, inputmode: 'text', maxlength: '200', required: true, placeholder: 'es. 4 5 6'}], TOOL_COMMISSION]],
  ['poisson', 'Poisson', [['xg_home', 'Gol attesi casa', {...DECIMAL, required: true}], ['xg_away', 'Gol attesi ospite', {...DECIMAL, required: true}],
    ['max_goals', 'Gol per squadra nella griglia', {type: 'number', step: '1', min: '1', max: '8', placeholder: '5'}]]],
];
const TOOL_SOON = 'Cash-out su più posizioni, Dutching in banca, Arbitraggio, Each Way, Draw No Bet, Progressioni, Esposizione del portafoglio, Ottimizzatore delle commissioni';
// The warnings of the server the user needs to read; every code stays in data-warnings.
const WARNING_TEXT = {
  NO_BET: 'Nessun vantaggio alla probabilità stimata: Kelly non punta.',
  CAPPED_BY_MAX_STAKE: 'La puntata è limitata dal tetto alla puntata.',
  CAPPED_BY_MAX_BANKROLL: 'La puntata è limitata dal tetto in percentuale del capitale.',
  PROBABILITY_IS_USER_ESTIMATE: 'La probabilità è la tua stima: il risultato vale quanto la stima.',
  STAKE_ROUNDED_DOWN_TO_CENT: 'La puntata è arrotondata per difetto al centesimo.',
  NEGATIVE_EV: 'Valore atteso negativo alla probabilità stimata.',
  BOOK_BELOW_ONE: 'Il totale delle probabilità è sotto il 100%.',
  SINGLE_SELECTION_NO_MARGIN: 'Con una sola quota non si calcola il margine.',
  LIABILITY_ABOVE_BANKROLL: 'La responsabilità supera il capitale indicato.',
  RED: 'La copertura chiude in perdita in entrambi i casi.',
  LIQUIDITY_UNAVAILABLE: 'Liquidità non disponibile: la puntata indicata è teorica, non è verificato che sia eseguibile.',
  BOOK_AT_LEAST_ONE: 'Il totale delle probabilità è almeno il 100%: si perde con qualunque selezione vincente.',
  STAKES_ROUNDED_TO_CENT: 'Le puntate sono arrotondate al centesimo: le vincite differiscono di pochi centesimi.',
  MODEL_NOT_A_FORECAST: 'Modello teorico con gol indipendenti: non è una previsione.',
};
const LIMIT_TEXT = {KELLY: 'Kelly', MAX_STAKE: 'Tetto alla puntata', MAX_BANKROLL: 'Tetto in % del capitale'};
const SCORE_TEXT = {HOME: '1', DRAW: 'X', AWAY: '2'};

// A value of the answer: the server's display value, its exact value in the tooltip.
const calc = (shown, exact, name) => el('b', {'data-field': name, title: exact === undefined || exact === null ? null : `Valore esatto: ${formatDecimalText(String(exact))}`}, num(shown));
const signed = (shown, exact, name) => el('span', {class: Number(shown) < 0 ? 'bad' : Number(shown) > 0 ? 'ok' : null}, calc(shown, exact, name));
const percentOf = (shown, exact, name) => [calc(shown, exact, name), '%'];
const row = (label, ...value) => [el('dt', {}, label), el('dd', {}, ...value)];

const TOOL_RESULTS = {
  odds: (d, r) => [
    el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['Quota', 'Probabilità implicita', 'Probabilità senza margine', 'Quota equa'].map(t => el('th', {scope: 'col'}, t)))),
      el('tbody', {}, d.selections.map((s, i) => el('tr', {'data-row': i}, el('td', {}, num(s.odds)),
        el('td', {}, percentOf(s.implied_percent, r.implied_probabilities?.[i] ?? r.probability, `implied_${i}`)),
        el('td', {}, s.fair_percent === null ? formatScalar(null) : percentOf(s.fair_percent, r.fair_probabilities[i], `fair_${i}`)),
        el('td', {}, s.fair_odds === null ? formatScalar(null) : calc(s.fair_odds, r.fair_odds[i], `fair_odds_${i}`))))))),
    el('dl', {}, row('Totale delle probabilità', percentOf(d.book_percent, r.book ?? r.probability, 'book')),
      row('Margine', d.overround_percent === null ? formatScalar(null) : percentOf(d.overround_percent, r.overround, 'overround')))],
  kelly: (d, r) => [el('dl', {}, row('Puntata suggerita', calc(d.stake, r.stake, 'stake')), row('Limite che la determina', el('span', {'data-field': 'governing_limit', 'data-code': d.governing_limit}, LIMIT_TEXT[d.governing_limit] ?? ND)),
    row('Kelly pieno', percentOf(d.kelly_full_percent, r.kelly_full, 'kelly_full')), row('Kelly frazionario', percentOf(d.kelly_fractional_percent, r.kelly_fractional, 'kelly_fractional')),
    row('Probabilità implicita della quota', percentOf(d.implied_percent, r.implied_probability, 'implied')), row('Probabilità stimata', percentOf(d.model_percent, r.model_probability, 'model')),
    row('Vantaggio', percentOf(d.edge_percent, r.edge, 'edge')), row('Perdita nel caso peggiore', calc(d.worst_case_loss, r.worst_case_loss, 'worst_case_loss')),
    row('Capitale se perde', calc(d.bankroll_after_loss, r.bankroll_after_loss, 'bankroll_after_loss')), row('Capitale se vince', calc(d.bankroll_after_win, r.bankroll_after_win, 'bankroll_after_win')))],
  ev: (d, r) => [el('dl', {}, row('Valore atteso', signed(d.expected_value, r.expected_value, 'expected_value')), row('Rendimento atteso', percentOf(d.roi_percent, r.roi, 'roi')),
    row('Quota equa', calc(d.fair_odds, r.fair_odds, 'fair_odds')), row('Quota di mercato', calc(d.market_odds, r.market_odds, 'market_odds')),
    row('Vantaggio sulla quota', percentOf(d.edge_percent, r.edge, 'edge')), row('Probabilità di pareggio', percentOf(d.break_even_percent, r.break_even_probability, 'break_even')),
    row('Se vince (netto)', signed(d.profit_if_wins, r.profit_if_wins, 'profit_if_wins')), row('Se perde', signed(d.loss_if_loses, null, 'loss_if_loses')),
    row('Commissione considerata', percentOf(d.commission_percent, null, 'commission')))],
  liability: (d, r) => [el('dl', {}, row('Responsabilità', calc(d.liability, r.liability, 'liability')),
    row('Responsabilità sul capitale', d.liability_percent_of_bankroll === null ? formatScalar(null) : percentOf(d.liability_percent_of_bankroll, r.liability_share_of_bankroll, 'liability_share')),
    row('Se la selezione perde (netto)', signed(d.if_selection_loses, r.net_profit_if_selection_loses, 'if_selection_loses')),
    row('Se la selezione vince', signed(d.if_selection_wins, null, 'if_selection_wins')),
    row('Probabilità di pareggio della selezione', percentOf(d.break_even_percent, r.break_even_probability, 'break_even')))],
  hedge: (d, r) => [el('dl', {}, row('Copertura', el('span', {'data-field': 'hedge_side', 'data-code': d.hedge_side}, SIDE_TEXT[d.hedge_side] ?? ND), ' ', calc(d.hedge_stake, r.hedge_stake_theoretical, 'hedge_stake')),
    row('Responsabilità della copertura', calc(d.hedge_liability, r.hedge_liability, 'hedge_liability')), row('Squilibrio da arrotondamento', calc(d.residual_imbalance, r.residual_imbalance, 'residual'))),
  el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['', 'Se la selezione vince', 'Se la selezione perde'].map(t => el('th', {scope: 'col'}, t)))),
    el('tbody', {},
      el('tr', {'data-row': 'before'}, el('th', {scope: 'row'}, 'Senza copertura'), el('td', {}, signed(d.before.if_wins, r.before.if_wins, 'before_wins')), el('td', {}, signed(d.before.if_loses, r.before.if_loses, 'before_loses'))),
      el('tr', {'data-row': 'after'}, el('th', {scope: 'row'}, 'Con la copertura'), el('td', {}, signed(d.after.if_wins, r.after.if_wins, 'after_wins')), el('td', {}, signed(d.after.if_loses, r.after.if_loses, 'after_loses'))))))],
  dutching: (d, r) => [
    el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['Quota', 'Puntata', 'Se vince (netto)'].map(t => el('th', {scope: 'col'}, t)))),
      el('tbody', {}, d.selections.map((s, i) => el('tr', {'data-row': i}, el('td', {}, num(s.odds)), el('td', {}, calc(s.stake, r.stakes_theoretical[i], `stake_${i}`)),
        el('td', {}, signed(s.if_wins, r.if_wins[i], `wins_${i}`))))))),
    el('dl', {}, row('Puntata totale', calc(d.placed, r.placed, 'placed')), row('Se non vince nessuna', signed(d.if_none_wins, r.if_none_wins, 'none')),
      row('Totale delle probabilità', percentOf(d.book_percent, r.book, 'book')))],
  poisson: d => {
    const max = d.grid.max_goals;
    const cell = (h, a) => d.grid.cells.find(c => c.home === h && c.away === a);
    return [el('h3', {}, 'Esito finale'),
      el('div', {class: 'odds', role: 'group', 'aria-label': 'Probabilità 1 X 2'}, d.match_odds.map(m => el('div', {class: 'odd', 'data-field': `p_${m.selection.toLowerCase()}`},
        el('span', {}, SCORE_TEXT[m.selection] ?? ND), el('b', {}, num(m.percent), '%'), el('small', {title: 'Quota equa'}, num(m.fair_odds))))),
      el('h3', {}, 'Gol'),
      el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['Linea', 'Over', 'Quota equa', 'Under', 'Quota equa'].map(t => el('th', {scope: 'col'}, t)))),
        el('tbody', {}, d.lines.map(l => el('tr', {'data-line': l.line, 'data-field': `line_${l.line}`}, el('td', {}, num(l.line)), el('td', {}, num(l.over_percent), '%'), el('td', {}, num(l.over_fair_odds)),
          el('td', {}, num(l.under_percent), '%'), el('td', {}, num(l.under_fair_odds))))))),
      el('dl', {}, row('Entrambe segnano', el('span', {'data-field': 'btts'}, num(d.btts.yes_percent), '% · quota equa ', num(d.btts.yes_fair_odds))),
        row('Gol attesi', el('span', {'data-field': 'expected_goals'}, num(d.expected_goals.home), ' + ', num(d.expected_goals.away), ' = ', num(d.expected_goals.total))),
        row('Risultati più probabili', el('span', {'data-field': 'top_scores'}, d.top_scores.flatMap((s, i) => [i ? ' · ' : '', s.score.replace('-', '–'), ' ', num(s.percent), '%'])))),
      el('h3', {}, 'Risultati esatti'),
      el('div', {class: 'tablewrap'}, el('table', {'data-testid': 'poisson-grid'},
        el('thead', {}, el('tr', {}, el('th', {scope: 'col'}, 'Casa \\ Ospite'), Array.from({length: max + 1}, (_, a) => el('th', {scope: 'col'}, String(a))))),
        el('tbody', {}, Array.from({length: max + 1}, (_, h) => el('tr', {}, el('th', {scope: 'row'}, String(h)),
          Array.from({length: max + 1}, (_, a) => el('td', {'data-score': `${h}-${a}`, 'data-field': `score_${h}-${a}`}, cell(h, a) ? [num(cell(h, a).percent), '%'] : formatScalar(null)))))))),
      el('p', {class: 'meta'}, 'Probabilità di 1 X 2 calcolate fino a 40 gol per squadra: copertura ', num(d.grid_coverage_percent), '%. Linee gol esatte.')];
  },
};

function toolForm(id, fields, params) {
  const value = name => params.get(name) ?? '';
  const control = name => ctl(`TOOLS-${id.toUpperCase()}`, name);
  return el('form', {class: 'card search', 'data-testid': 'tool-form', 'data-tool': id, novalidate: true, onsubmit: event => {
    event.preventDefault();
    const out = {tool: id};
    for (const [key, v] of new FormData(event.target).entries()) if (String(v).trim() !== '') out[key] = String(v).trim();
    revealOutcome = true;
    const target = `#/tools?${queryString({...out, run: '1'})}`;
    if (location.hash === target) render();
    else location.hash = target;
  }},
  el('div', {class: 'fields'}, fields.map(([name, label, attrs]) => el('label', {}, `${label} `, attrs.select
    ? el('select', {name, 'data-control': control(name)}, attrs.select.map(([v, text]) => el('option', {value: v, selected: (value(name) || attrs.select[0][0]) === v}, text)))
    : el('input', {name, value: value(name), 'data-control': control(name), ...attrs})))),
  el('button', {type: 'submit', 'data-control': control('submit')}, 'Calcola'), ' ',
  el('a', {href: `#/tools?${queryString({tool: id})}`, 'data-control': control('reset')}, 'Azzera'));
}

async function toolsView(params) {
  const tool = choice(params.get('tool'), TOOL_LIST, 'odds');
  const [, title, fields] = TOOL_LIST.find(([key]) => key === tool);
  const head = [el('h1', {}, 'Strumenti'),
    el('p', {class: 'state partial', role: 'note', 'data-testid': 'tools-manual'}, el('b', {}, 'INSERIMENTO MANUALE'),
      ' — i valori li scrivi tu, non sono dati live né quote dell’archivio. Ogni calcolo è del server; nessuno strumento piazza o prepara ordini.'),
    el('nav', {class: 'seg tool-tabs', 'aria-label': 'Strumenti', 'data-testid': 'tool-tabs'},
      TOOL_LIST.map(([key, text]) => el('a', {href: `#/tools?${queryString({tool: key})}`, 'aria-current': key === tool ? 'page' : null, 'data-control': ctl('TOOLS-TAB', key)}, text))),
    toolForm(tool, fields, params)];
  const soon = el('p', {class: 'meta', 'data-testid': 'tools-soon'}, 'Non ancora disponibili: ', TOOL_SOON, '.');
  if (params.get('run') !== '1') return [...head, el('p', {class: 'state empty'}, 'Inserisci i valori e premi Calcola.'), soon];
  const api = {};
  for (const [name] of fields) if (params.get(name)) api[name] = params.get(name);
  let body;
  try {
    body = await getJson(`/api/v1/tools/${tool}?${queryString(api)}`);
  } catch (error) {
    if (error?.status !== 400) throw error;
    // The server names the parameter first («odds[1]: …», «stake: …»): the label of that field in this form is shown.
    const name = /^([a-z_]+)/.exec(String(error.message ?? ''))?.[1];
    const label = fields.find(([field]) => field === name)?.[1];
    const form = head.at(-1);
    form.querySelector(`[name="${name}"]`)?.setAttribute('aria-invalid', 'true');
    return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'tool-invalid', 'data-outcome': '', 'data-fields': name ?? '', title: reasonText(error)},
      label ? `Valore non valido in: ${label}. Correggi il campo e riprova.` : 'Valori mancanti o non validi. Correggi i campi e riprova.'), soon];
  }
  const data = body.data ?? {};
  if (data.tool !== tool || !data.display || !data.result) throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza risultato');
  const warnings = (data.warnings ?? []).filter(code => Object.hasOwn(WARNING_TEXT, code));
  return [...head,
    el('section', {class: 'card tool-result', 'data-testid': 'tool-result', 'data-outcome': '', 'data-tool': tool, 'data-warnings': (data.warnings ?? []).join(' '),
      'data-formula': `${data.formula} ${data.formula_version}`},
    el('h2', {}, title), ...TOOL_RESULTS[tool](data.display, data.result),
    warnings.length ? el('ul', {class: 'notes', 'data-testid': 'tool-warnings'}, warnings.map(code => el('li', {'data-code': code}, WARNING_TEXT[code]))) : null,
    el('p', {class: 'meta'}, 'Calcolo del server in decimali esatti: importi al centesimo, percentuali a due decimali, quote a tre. Il valore esatto è nel suggerimento.')),
    soon];
}

// [what is loading, view, area]: a 'user' view shows no technical text (MP-WEB-015, checked by the Browser QA gate); a
// 'technical' view is where provenance and diagnostics belong. Every view declares one (V-B2). #/board, the former
// address of the Daily Board, still opens it, and the menu item of each view is its section (NAV_OF).

const VIEWS = {'': ['la pagina', boardView, 'user'], board: ['la pagina', boardView, 'user'], search: ['la ricerca', searchView, 'user'],
  match: ['la partita', matchView, 'user'],
  data: ['lo stato dei dati', dashboardView, 'technical'], providers: ['i fornitori dati', providersView, 'technical'],
  sim: ['la simulazione', simView, 'user'], tools: ['gli strumenti', toolsView, 'user'], compare: ['il confronto', compareView, 'user'], saved: ['i backtest salvati', savedView, 'user'],
  endpoints: ['gli endpoint', endpointsView, 'technical']};
const NAV_OF = {board: '', providers: 'data', endpoints: 'data', match: null, compare: 'sim', saved: 'sim'};

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
  const reveal = revealOutcome && (name === 'search' || name === 'sim' || name === 'compare' || name === 'tools');
  revealOutcome = false;
  const [what, view, area] = Object.hasOwn(VIEWS, name) ? VIEWS[name] : [null, null, 'user'];
  const host = document.getElementById('view');
  if (area) host.dataset.area = area;
  else delete host.dataset.area;
  const section = Object.hasOwn(NAV_OF, name) ? NAV_OF[name] : name;
  for (const link of document.querySelectorAll('nav a[data-view]')) {
    if (link.dataset.view === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  // Every navigation starts a new generation, so an earlier view still loading can never replace this one.
  const mine = ++generation;
  if (!view) {
    host.replaceChildren(el('h1', {}, 'Pagina non trovata'), el('p', {class: 'state empty'}, 'Questa sezione non esiste. ', el('a', {href: '#/', 'data-control': 'CTL-NOTFOUND-BOARD'}, 'Torna a Oggi')));
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
    // The page keeps a title when its data fail, so it never reads as a blank or broken screen.
    host.replaceChildren(el('h1', {}, 'Dati non disponibili'),
      errorState(error instanceof ApiFailure ? error : new ApiFailure(0, 'CLIENT', 'errore nella pagina'), render));
    if (reveal) showOutcome(host);
  }
}

// ---- Shell: the owner session (MP-UI-PR-004, #23) ----

// With the owner login enforced (the server marks its answers with X-MatchPilot-Auth), the header shows who is signed
// in and «Esci». With the login off nothing is shown: there is no session and no button that could not work.
// The role is named in words; the principal id stays in a data attribute (MP-WEB-015).
async function showSession() {
  const box = document.querySelector('[data-testid="session"]');
  if (!box) return;
  try {
    const health = await fetch('/api/v1/health', {headers: {accept: 'application/json'}, credentials: 'same-origin'}).catch(() => null);
    await health?.arrayBuffer().catch(() => null); // the body is read, so the request ends
    if (health?.headers.get('x-matchpilot-auth') !== 'enforce') return;
    const session = await fetch('/auth/session', {headers: {accept: 'application/json'}, credentials: 'same-origin'})
      .then(response => (response.ok ? response.json() : null)).catch(() => null);
    if (!session?.authenticated) return;
    const name = box.querySelector('[data-field="principal"]');
    name.textContent = (session.roles ?? []).includes('owner') ? 'Proprietario' : 'Utente';
    name.dataset.principal = session.principal;
    box.hidden = false;
  } finally {
    box.dataset.checked = 'true'; // the session check is over, shown or not
  }
}

// «Esci» closes the session on the server (same origin), then the login page; a failure is said, never hidden.
document.querySelector('[data-testid="logout"]')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  const status = document.querySelector('[data-testid="logout-status"]');
  button.disabled = true;
  status.textContent = '';
  const response = await fetch('/auth/logout', {method: 'POST', credentials: 'same-origin'}).catch(() => null);
  if (response?.ok) { location.assign('/login'); return; }
  button.disabled = false;
  status.textContent = 'Uscita non riuscita: riprova'; // the role label stays as it is
});

showSession();
window.addEventListener('hashchange', render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
