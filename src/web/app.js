// R-05/R-06b (#3, #30, #97): read-only web site. Every value shown comes from the MatchPilot API v1; the browser computes
// nothing (MP-WEB-011). Missing values are shown as N/D, never as zero (MP-WEB-005). Every view has explicit loading,
// empty, partial and error states (MP-WEB-010), and a later navigation always wins over an earlier view still
// loading. Text is inserted with textContent only: API data is never parsed as HTML.
// User views show no technical text (MP-OWNER-UI-NO-RAW-TEXT-01, MP-WEB-015): codes, identifiers, dataset keys, routes and
// provenance stay in data-* attributes and tooltips, and in the technical views (docs/qa/ui-text-inventory.md).

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

// Italian labels of the keys the API returns in the data health and the FutPythonTrader certification (Fornitori, a
// technical view: the values stay technical, the names read in Italian; V-B2b, inventory UI-60). A key without a label is
// shown as words and marked, and the Browser QA gate fails a labelled view that shows one (journey providers-endpoints).
const LABELS = {
  // data health and sync runs
  status: 'Stato', product: 'Prodotto', lastRun: 'Ultima sincronizzazione', activeDatasets: 'Dataset attivi', schemaFields: 'Campi di schema',
  datasetsWithErrors: 'Dataset con errori', alerts: 'Avvisi', severity: 'Gravità', code: 'Codice', title: 'Titolo', message: 'Messaggio',
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
    el('button', {type: 'button', onclick: retry}, 'Riprova'));
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
  DATA_TABS.map(([view, text, href]) => el('a', {href, 'aria-current': view === current ? 'page' : null}, text)));

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
            ? el('a', {href: `#/?${queryString({date: row.last_match_date})}`, title: 'Apri le partite di quel giorno'}, row.last_match_date)
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
      el('h3', {'aria-label': `${row.home_name || ND} – ${row.away_name || ND}`},
        el('span', {'data-field': 'home'}, formatScalar(row.home_name)), el('span', {class: 'sep'}, ' – '),
        el('span', {'data-field': 'away'}, formatScalar(row.away_name))),
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
      footer.replaceChildren(el('div', {class: 'state error', role: 'alert', 'data-code': error?.code ?? '', title: reasonText(error)},
        el('p', {}, 'Non è stato possibile caricare altri risultati. Quelli già mostrati restano validi.'),
        el('button', {type: 'button', onclick: loadMore}, 'Riprova')));
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
    return el('a', {href: dayHref(day), 'data-date': day, 'aria-current': shift === 0 ? 'date' : null, 'aria-label': dayText(day, LONG_DAY)},
      el('small', {}, day === today ? 'Oggi' : STRIP_WEEKDAY.format(at)), el('b', {}, STRIP_NUMBER.format(at)));
  }));
}

async function boardView(params, mine) {
  const date = params.get('date') || localToday();
  const picker = el('form', {class: 'controls', 'data-testid': 'board-controls', onsubmit: event => {
    event.preventDefault();
    location.hash = dayHref(new FormData(event.target).get('date'));
  }},
  el('a', {href: validDate(date) ? dayHref(shiftDay(date, -1)) : '#/', 'data-action': 'prev'}, '← Giorno prima'),
  el('label', {}, 'Giorno ', el('input', {type: 'date', name: 'date', value: validDate(date) ? date : '', required: true})),
  el('button', {type: 'submit'}, 'Mostra'),
  el('a', {href: validDate(date) ? dayHref(shiftDay(date, 1)) : '#/', 'data-action': 'next'}, 'Giorno dopo →'),
  el('a', {href: dayHref(localToday()), 'data-action': 'today'}, 'Oggi'));
  const head = [el('h1', {}, date === localToday() ? 'Oggi' : 'Partite del giorno'), validDate(date) ? dayStrip(date) : null, picker];
  if (!validDate(date)) return [...head, el('p', {class: 'state error', role: 'alert', 'data-date': date}, 'Data non valida: scegli un giorno dal calendario.')];
  const path = '/api/v1/fpt/matches';
  const params2 = {date, limit: BOARD_PAGE};
  const first = await getJson(`${path}?${queryString(params2)}`);
  const updated = updatedSlot(mine);
  const rows = first.data?.rows ?? [];
  if (rows.length === 0) {
    return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'board-empty'}, `Nessuna partita ${dayText(date, LONG_DAY)}. `,
      'Fino a quale giorno arrivano i dati di ogni campionato lo trovi in ', el('a', {href: '#/data'}, 'Dati'), '.'), updated];
  }
  // Kickoff order across competitions, as the API returns it; each card names its competition (PR #163 NB-3).
  const render = page => page.map(matchRow);
  return [...head, el('div', {class: 'dayhead'}, el('h2', {class: 'day', 'data-testid': 'board-day'}, calendarDay(date, LONG_DAY)), updated),
    ...pagedList({first, path, params: params2, render, more: 'Carica altre partite', mine,
      list: el('div', {class: 'card board', 'data-testid': 'paged-list'})})];
}

// ---- Search and filters (MP-WEB-007) ----

const SEARCH_PAGE = 25;
// Form fields and the API parameters they map to. Values are checked by the server; the form only constrains types.
const SEARCH_FIELDS = ['team_id', 'venue', 'competition', 'from', 'before', 'result', 'fav_min', 'fav_max', 'min_goals', 'max_goals', 'with_odds', 'with_xg'];
const FIELD_LABELS = {team: 'Squadra', venue: 'Sede', competition: 'Campionato', from: 'Dal', before: 'Prima del', result: 'Risultato',
  fav_min: 'Quota favorito da', fav_max: 'Quota favorito a', min_goals: 'Gol totali da', max_goals: 'Gol totali a'};

function searchForm(params, competitions) {
  const value = name => params.get(name) ?? '';
  const select = (name, options) => el('select', {name}, options.map(([v, text]) => el('option', {value: v, selected: value(name) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), ...attrs});
  const check = (name, text) => el('label', {class: 'check'}, el('input', {type: 'checkbox', name, value: 'true', checked: value(name) === 'true'}), ' ', text);
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
  el('button', {type: 'submit'}, 'Cerca'), ' ', el('a', {href: '#/search'}, 'Azzera'));
}

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
    el('td', {'data-field': 'date'}, row.match_date ? el('a', {href: dayHref(row.match_date), title: 'Apri le partite di quel giorno'}, calendarDay(row.match_date)) : formatScalar(null)),
    el('td', {'data-field': 'kickoff', title: row.kickoff_local_time ? KICKOFF_NOTE : null}, formatScalar(row.kickoff_local_time)),
    el('td', {'data-field': 'teams'}, formatScalar(row.home_name), ' – ', formatScalar(row.away_name)),
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
        el('ul', {}, teams.map(team => el('li', {}, el('a', {href: `#/search?${queryString({...Object.fromEntries(params), team_id: team.internal_team_id})}`},
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
  const table = el('table', {class: 'results'}, el('thead', {}, el('tr', {}, RESULT_COLUMNS.map(text => el('th', {scope: 'col'}, text)))), body);
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

// [what is loading, view, area]: a 'user' view shows no technical text (MP-WEB-015, checked by the Browser QA gate); a
// 'technical' view is where provenance and diagnostics belong. Every view declares one (V-B2). #/board, the former
// address of the Daily Board, still opens it, and the menu item of each view is its section (NAV_OF).
const VIEWS = {'': ['la pagina', boardView, 'user'], board: ['la pagina', boardView, 'user'], search: ['la ricerca', searchView, 'user'],
  data: ['lo stato dei dati', dashboardView, 'technical'], providers: ['i fornitori dati', providersView, 'technical'],
  endpoints: ['gli endpoint', endpointsView, 'technical']};
const NAV_OF = {board: '', providers: 'data', endpoints: 'data'};

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
    host.replaceChildren(el('h1', {}, 'Pagina non trovata'), el('p', {class: 'state empty'}, 'Questa sezione non esiste. ', el('a', {href: '#/'}, 'Torna a Oggi')));
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

window.addEventListener('hashchange', render);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
else render();
