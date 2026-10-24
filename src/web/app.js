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
const DATA_TABS = [['data', 'Panoramica', '#/data'], ['providers', 'Fornitori', '#/providers'], ['endpoints', 'API', '#/endpoints'], ['rules', 'Regole', '#/rules'],
  [null, 'Copertura', '/coverage']];
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
      // The teams open the Match Center of the match (R-07a).
      el('h3', {'aria-label': `${row.home_name || ND} – ${row.away_name || ND}`},
        el('a', {class: 'match-link', href: row.internal_match_id ? matchHref(row.internal_match_id) : null, 'data-action': 'open-match'},
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
    return el('a', {class: `fm ${item.result}`, role: 'listitem', href: matchHref(item.match_id), title: what, 'aria-label': what, 'data-code': item.result}, FORM_LETTER[item.result] ?? '?');
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
      el('td', {'data-field': 'teams'}, el('a', {href: matchHref(id)}, formatScalar(row.home_name), ' – ', formatScalar(row.away_name))),
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
      'Partita non valida: aprila dalla ', el('a', {href: '#/'}, 'Daily Board'), ' o dalla ', el('a', {href: '#/search'}, 'Ricerca'), '.')];
  }
  const scope = choice(params.get('team'), SCOPES, 'both');
  const sample = choice(params.get('window'), WINDOWS, '10');
  const venue = choice(params.get('venue'), VENUES, 'split');
  const body = await getJson(`/api/v1/fpt/match-analysis?${queryString({id})}`);
  const data = body.data ?? {};
  const match = data.match;
  if (!match) {
    return [el('h1', {}, 'Partita non trovata'), el('p', {class: 'state empty', role: 'status', 'data-testid': 'match-not-found', 'data-code': data.reason ?? ''},
      'Questa partita non è nell\'archivio. ', el('a', {href: '#/'}, 'Torna a Oggi'))];
  }
  const names = {home: match.home_name ?? ND, away: match.away_name ?? ND};
  const teamVenue = side => venue === 'split' ? side : venue;
  const stats = side => data.teams?.[side]?.venues?.[teamVenue(side)]?.windows?.[sample] ?? null;
  const rows = side => rowsById(data.teams?.[side]?.venues);
  const recent = side => data.teams?.[side]?.venues?.both?.windows?.['5'] ?? null;
  const shown = side => scope === 'both' || scope === side;
  const link = (key, value) => `#/match?${queryString({id, team: scope, window: sample, venue, [key]: value})}`;
  const filter = (label, key, options, current) => el('nav', {class: 'seg', 'aria-label': label, 'data-filter': key},
    options.map(([value, text]) => el('a', {href: link(key, value), 'aria-current': value === current ? 'true' : null, 'data-value': value}, text)));

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
  return [hero, matchToolLinks(match), postMatchCard(data.post_match), filters, cutoff,
    compareCard(shown('home') ? stats('home') : null, shown('away') ? stats('away') : null, names), ...teamCards, h2hCard];
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
    el('td', {'data-field': 'date'}, row.match_date ? el('a', {href: dayHref(row.match_date), title: 'Apri le partite di quel giorno'}, calendarDay(row.match_date)) : formatScalar(null)),
    el('td', {'data-field': 'kickoff', title: row.kickoff_local_time ? KICKOFF_NOTE : null}, formatScalar(row.kickoff_local_time)),
    el('td', {'data-field': 'teams'}, row.internal_match_id
      ? el('a', {href: matchHref(row.internal_match_id), 'data-action': 'open-match'}, formatScalar(row.home_name), ' – ', formatScalar(row.away_name))
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
  const select = (name, options, fallback) => el('select', {name}, options.map(([v, text]) => el('option', {value: v, selected: (value(name) || fallback) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), ...attrs});
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
  el('button', {type: 'submit'}, 'Simula'), ' ', el('a', {href: '#/sim'}, 'Azzera'));
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
  const head = [el('h1', {}, 'Simulazione'), simTabs('sim'),
    competitionsBody ? null : el('p', {class: 'state partial', role: 'status'}, 'Elenco dei campionati non disponibile: il filtro per campionato è disattivato.'),
    params.get('pit_mode') === 'NON_PIT_RESEARCH' ? researchNotice() : null,
    simForm(params, competitions),
    el('p', {class: 'meta'}, el('a', {href: compareHref(params), 'data-testid': 'sim-compare-link'}, 'Confronta più strategie sugli stessi dati'))];
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
  return [...head, ...simResult(body.data),
    saveBox({title: 'Salva questa simulazione', placeholder: 'Nome della simulazione', testid: 'sim-save', save: name => postJson('/api/v1/backtests/saved', {name, kind: 'BACKTEST', params: api})})];
}

// The result of one simulation (GET /api/v1/hist/backtest data), also shown when a saved simulation is opened.
function simResult(data) {
  const report = data?.report;
  const reader = data?.reader ?? {};
  const body = {data};
  if (!report || typeof report !== 'object') throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza report');
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
        el('dt', {}, 'Non regolate'), el('dd', {'data-field': 'unsettled', title: Object.entries(report.counts?.unsettled_by_reason ?? {}).map(([k, n]) => `${k}: ${n}`).join(' · ') || null}, num(body.data?.totals?.unsettled)))),
    simStrategy(report), noTradeReasons(report),
    simMetrics(report), simBankroll(report, body.data?.totals),
    Array.isArray(report.bets) && report.bets.length ? simBets(report.bets, body.data?.events, body.data?.totals?.bets) : null];
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
  const select = (field, options, fallback) => el('select', {name: name(field)}, options.map(([v, text]) => el('option', {value: v, selected: (value(field) || fallback) === v}, text)));
  const input = (field, attrs) => el('input', {name: name(field), value: value(field), ...attrs});
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
  const select = (name, options, fallback) => el('select', {name}, options.map(([v, text]) => el('option', {value: v, selected: (value(name) || fallback) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), ...attrs});
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
  el('button', {type: 'submit'}, 'Confronta'), ' ', el('a', {href: '#/compare'}, 'Azzera'), ' ', el('a', {href: '#/sim'}, 'Torna alla simulazione'));
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
  const head = [el('h1', {}, 'Confronto di strategie'), simTabs('compare'),
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
  return [...head, ...cmpResult(body.data),
    saveBox({title: 'Salva questo confronto', placeholder: 'Nome del confronto', testid: 'cmp-save', save: name => postJson('/api/v1/backtests/saved', {name, kind: 'COMPARE', params: api})})];
}

// The result of one comparison (GET /api/v1/hist/compare data), also shown when a saved comparison is opened.
function cmpResult(data) {
  const body = {data};
  const variants = Array.isArray(body.data?.variants) ? body.data.variants : [];
  if (variants.length < 2 || variants.some(v => !v.report)) throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza confronto');
  const reader = body.data?.reader ?? {};
  const research = variants.some(v => isResearch(v.report));
  const metric = (v, field) => num(v.report.metrics?.rounded?.[field] ?? (v.report.metrics ? undefined : null));
  const plain = (v, field) => num(v.report.metrics?.[field]);
  const statusText = v => ({INSUFFICIENT_PIT_DATA: 'Nessuna quota utilizzabile', INSUFFICIENT_OUTCOMES: 'Nessun risultato finale'}[v.report.status]
    ?? (v.report.status === 'OK' && !v.report.metrics ? 'Nessuna scommessa' : 'Completata'));
  return [
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

// ---- Writes: saving strategies and simulations (PERSIST-API-01, WEB-SAVE-01) ----

// A same-origin JSON POST to the persistence API. The server decides everything (owner session, origin, schema); the page
// never retries a write by itself and never redirects away from a form the user filled in.
async function postJson(path, body) {
  let response;
  try {
    response = await fetch(path, {method: 'POST', credentials: 'same-origin', body: JSON.stringify(body),
      headers: {'content-type': 'application/json', accept: 'application/json'}});
  } catch {
    throw new ApiFailure(0, 'NETWORK', 'rete non raggiungibile');
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiFailure(response.status, json?.error?.code, json?.error?.message);
  return {status: response.status, data: json?.data ?? null};
}

// Why a write was refused, in plain words; the code stays in data-code and the tooltip.
function writeRefusal(error) {
  const text = {
    WRITES_REQUIRE_AUTH: 'Per salvare serve l’accesso owner, che su questo server non è attivo: niente è stato salvato.',
    UNAUTHENTICATED: 'Sessione scaduta o assente: accedi di nuovo per salvare.',
    FORBIDDEN: 'Il tuo accesso non consente di salvare.',
    ORIGIN_NOT_ALLOWED: 'Richiesta rifiutata per sicurezza: ricarica la pagina e riprova.',
    UNAVAILABLE: 'L’archivio non è ancora attivo su questo server: niente è stato salvato.',
    CONFLICT: 'Esiste già una strategia diversa con lo stesso contenuto: cambia nome e riprova.',
    BUSY: 'È in corso un’altra simulazione: riprova tra qualche secondo.',
    PAYLOAD_TOO_LARGE: 'Troppi dati in una volta sola: riduci le regole e riprova.',
    NETWORK: 'Connessione non disponibile: niente è stato salvato.',
  }[error?.code] ?? (error?.status === 400 ? 'Dati non validi: controlla i campi e riprova.' : 'Salvataggio non riuscito: riprova più tardi.');
  return el('p', {class: 'state error', role: 'alert', 'data-testid': 'save-refused', 'data-code': error?.code ?? '', title: reasonText(error)}, text,
    error?.code === 'UNAUTHENTICATED' ? [' ', el('a', {href: `/login?next=${encodeURIComponent(location.pathname + location.hash)}`}, 'Accedi')] : null);
}

// A small form that saves something under a name. The button is disabled while the request runs (no double submit);
// the outcome replaces the previous one in a status region.
function saveBox({title, placeholder, testid, save, describe = savedText}) {
  const status = el('div', {class: 'save-status', role: 'status', 'data-testid': `${testid}-status`});
  const name = el('input', {name: 'name', type: 'text', required: true, maxlength: '100', autocomplete: 'off', placeholder});
  const button = el('button', {type: 'submit'}, 'Salva');
  const form = el('form', {class: 'card save', 'data-testid': testid, onsubmit: async event => {
    event.preventDefault();
    if (button.disabled) return;
    const text = name.value.trim();
    if (!text) { status.replaceChildren(el('p', {class: 'state error', role: 'alert'}, 'Scrivi un nome prima di salvare.')); return; }
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.replaceChildren(loading('il salvataggio'));
    try {
      const result = await save(text);
      status.replaceChildren(el('p', {class: 'state saved', 'data-testid': `${testid}-done`, 'data-code': result.data?.status ?? ''}, describe(result.data)));
    } catch (error) {
      status.replaceChildren(writeRefusal(error));
    } finally {
      button.disabled = false;
      form.removeAttribute('aria-busy');
    }
  }},
  el('h2', {}, title), el('div', {class: 'inline'}, el('label', {class: 'grow'}, 'Nome ', name), button), status);
  return form;
}
function savedText(data) {
  if (data?.status === 'ALREADY_SAVED') return `Già salvata con il numero ${formatNumber(data.backtest_id)}: niente di nuovo da salvare.`;
  if (data?.status === 'UNCHANGED') return `Già salvata, versione ${formatNumber(data.version)}: nessuna modifica.`;
  if (data?.status === 'SAVED' && data.version !== undefined) return `Salvata, versione ${formatNumber(data.version)}.`;
  if (data?.status === 'SAVED') return `Salvata con il numero ${formatNumber(data.backtest_id)}.`;
  return 'Salvata.';
}

// ---- Strategie: the rule builder and the saved strategies (#34, STRAT-CFG-01, PERSIST-API-01) ----

// The rules of a definition in words, one list item per condition (the definition is the server's normalized one).
function rulesList(d) {
  const c = d?.conditions ?? {};
  const range = (text, lo, hi) => (lo !== undefined || hi !== undefined)
    ? el('li', {}, text, lo !== undefined ? [' da ', num(lo)] : null, hi !== undefined ? [' fino a ', num(hi)] : null) : null;
  return el('ul', {class: 'rules'},
    el('li', {'data-field': 'rule_main'}, labelled(SIDE_TEXT, d?.side), ' · ', labelled(DEF_SELECTION_TEXT, d?.selection)),
    range('Quota della selezione', c.odds_min, c.odds_max), range('Quota 1', c.home_min, c.home_max),
    range('Quota X', c.draw_min, c.draw_max), range('Quota 2', c.away_min, c.away_max),
    c.teams ? el('li', {'data-field': 'rule_teams'}, 'Squadra: ', c.teams.join(', '), ' · ', DEF_VENUE_TEXT[c.venue ?? 'ANY']) : null);
}
// The simulation of a definition: its rules as the form fields of «Simulazione» (one team, as the form has).
function simHrefOf(d) {
  const c = d?.conditions ?? {};
  const out = {strategy: 'custom', selection: d?.selection, side: d?.side};
  for (const name of DEF_FIELDS) if (c[name] !== undefined) out[name] = c[name];
  if (c.teams?.length) out.team = c.teams[0];
  if (c.venue && c.venue !== 'ANY') out.venue = c.venue;
  return `#/sim?${queryString(out)}`;
}
// The key a strategy is saved under: its name in lower case letters, digits and dashes. The same name saves a new version.
const strategyKey = name => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/, '') || 'strategia';

function builderForm(params) {
  const value = name => params.get(name) ?? '';
  const select = (name, options, fallback) => el('select', {name}, options.map(([v, text]) => el('option', {value: v, selected: (value(name) || fallback) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), ...attrs});
  const price = name => input(name, {type: 'number', step: '0.001', min: '1.001', max: '1000'});
  const status = el('div', {class: 'save-status', role: 'status', 'data-testid': 'builder-status'});
  const save = el('button', {type: 'submit', 'data-action': 'save-strategy'}, 'Salva strategia');
  const form = el('form', {class: 'card search', 'data-testid': 'builder-form'},
    el('h2', {}, 'Nuova strategia'),
    el('div', {class: 'fields'},
      el('label', {}, 'Nome ', input('name', {type: 'text', required: true, maxlength: '100', autocomplete: 'off', placeholder: 'es. Favorito in casa'})),
      el('label', {}, 'Selezione ', select('selection', Object.entries(DEF_SELECTION_TEXT), 'FAVOURITE')),
      el('label', {}, 'Lato ', select('side', Object.entries(SIDE_TEXT), 'BACK')),
      el('label', {}, 'Quota selezione da ', price('odds_min')), el('label', {}, 'Quota selezione fino a ', price('odds_max')),
      el('label', {}, 'Quota 1 da ', price('home_min')), el('label', {}, 'Quota 1 fino a ', price('home_max')),
      el('label', {}, 'Quota X da ', price('draw_min')), el('label', {}, 'Quota X fino a ', price('draw_max')),
      el('label', {}, 'Quota 2 da ', price('away_min')), el('label', {}, 'Quota 2 fino a ', price('away_max')),
      el('label', {}, 'Squadra ', input('team', {type: 'text', placeholder: 'es. Ajax', autocomplete: 'off', maxlength: '100'})),
      el('label', {}, 'Sede della squadra ', select('venue', Object.entries(DEF_VENUE_TEXT), 'ANY'))),
    save, ' ', el('button', {type: 'button', 'data-action': 'try-strategy', onclick: () => { location.hash = simHrefOf(definitionFrom(new FormData(form))); }}, 'Prova nella simulazione'),
    status);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled) return;
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) { status.replaceChildren(el('p', {class: 'state error', role: 'alert'}, 'Scrivi un nome prima di salvare.')); return; }
    save.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.replaceChildren(loading('il salvataggio'));
    try {
      const result = await postJson('/api/v1/strategies', {key: strategyKey(name), name, definition: definitionFrom(data)});
      status.replaceChildren(el('p', {class: 'state saved', 'data-testid': 'builder-saved', 'data-code': result.data?.status ?? ''}, savedText(result.data), ' ',
        el('a', {href: `#/strategies?${queryString({key: result.data?.key})}`}, 'Apri la strategia')));
      refreshStrategyList?.();
    } catch (error) {
      status.replaceChildren(writeRefusal(error));
    } finally {
      save.disabled = false;
      form.removeAttribute('aria-busy');
    }
  });
  return form;
}
// The rules of the form as a definition (the server validates and normalizes it).
function definitionFrom(data) {
  const conditions = {};
  for (const name of ['odds_min', 'odds_max', 'home_min', 'home_max', 'draw_min', 'draw_max', 'away_min', 'away_max']) {
    const v = String(data.get(name) ?? '').trim();
    if (v) conditions[name] = v;
  }
  const team = String(data.get('team') ?? '').trim();
  if (team) {
    conditions.teams = [team];
    if (data.get('venue') && data.get('venue') !== 'ANY') conditions.venue = data.get('venue');
  }
  return {selection: data.get('selection'), side: data.get('side'), conditions};
}

let refreshStrategyList = null;
// The saved strategies: the list, then the rules of each one (current version).
function strategyList(mine) {
  const box = el('section', {class: 'card', 'data-testid': 'strategy-list'}, el('h2', {}, 'Strategie salvate'), loading('le strategie'));
  const load = async () => {
    box.replaceChildren(el('h2', {}, 'Strategie salvate'), loading('le strategie'));
    try {
      const list = (await getJson('/api/v1/strategies')).data?.strategies ?? [];
      const full = await Promise.all(list.slice(0, 50).map(item => getJson(`/api/v1/strategies?${queryString({key: item.key})}`)
        .then(body => body.data?.strategy ?? null).catch(() => null)));
      if (mine !== generation) return;
      if (list.length === 0) {
        box.replaceChildren(el('h2', {}, 'Strategie salvate'), el('p', {class: 'state empty', 'data-testid': 'strategies-empty'}, 'Nessuna strategia salvata.'));
        return;
      }
      const columns = ['Nome', 'Versione', 'Regole', ''];
      box.replaceChildren(el('h2', {}, 'Strategie salvate'), el('div', {class: 'tablewrap'}, el('table', {class: 'results'},
        el('thead', {}, el('tr', {}, columns.map(text => el('th', {scope: 'col'}, text)))),
        el('tbody', {}, list.slice(0, 50).map((item, i) => {
          const s = full[i];
          const line = el('tr', {'data-key': item.key, 'data-strategy': item.strategy_id ?? ''},
            el('td', {'data-field': 'name'}, el('a', {href: `#/strategies?${queryString({key: item.key})}`}, formatScalar(item.name))),
            el('td', {'data-field': 'version'}, num(item.version)),
            el('td', {}, s ? rulesList(s.definition) : el('span', {class: 'nd', title: 'Regole non disponibili in questo momento'}, ND)),
            el('td', {}, s ? el('a', {href: simHrefOf(s.definition), 'data-action': 'simulate'}, 'Simula') : null));
          [...line.children].forEach((cell, index) => cell.setAttribute('data-label', columns[index] || 'Azioni'));
          return line;
        })))));
    } catch (error) {
      if (mine !== generation || error?.code === 'UNAUTHENTICATED') return;
      box.replaceChildren(el('h2', {}, 'Strategie salvate'), archiveState(error, load));
    }
  };
  refreshStrategyList = () => { if (mine === generation) load(); };
  load();
  return box;
}
// The archive is not active until its owner-authorized migration: that is a state of the server, not an error of the page.
function archiveState(error, retry) {
  if (error?.code === 'UNAVAILABLE') {
    return el('p', {class: 'state partial', role: 'status', 'data-testid': 'archive-off', 'data-code': error.code, title: reasonText(error)},
      'L’archivio non è ancora attivo su questo server: le regole si possono comunque provare nella simulazione.');
  }
  return errorState(error, retry);
}

async function strategiesView(params, mine) {
  const key = params.get('key');
  if (key) return strategyDetail(key, params);
  return [el('h1', {}, 'Strategie'), builderForm(params), strategyList(mine)];
}

async function strategyDetail(key, params) {
  const head = el('p', {class: 'meta'}, el('a', {href: '#/strategies'}, '← Tutte le strategie'));
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) return [el('h1', {}, 'Strategia'), head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'strategy-invalid'}, 'Strategia non valida.')];
  let current;
  try {
    current = (await getJson(`/api/v1/strategies?${queryString({key})}`)).data?.strategy;
  } catch (error) {
    if (error?.status === 404) return [el('h1', {}, 'Strategia non trovata'), head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'strategy-not-found'}, 'Nessuna strategia salvata con questo nome.')];
    if (error?.code === 'UNAVAILABLE') return [el('h1', {}, 'Strategia'), head, archiveState(error)];
    throw error;
  }
  const versions = await Promise.all(Array.from({length: Math.min(current.version, 50)}, (_, i) => current.version - i).map(version => version === current.version ? current
    : getJson(`/api/v1/strategies?${queryString({key, version})}`).then(body => body.data?.strategy ?? null).catch(() => null)));
  const columns = ['Versione', 'Nome', 'Regole', 'Creata', 'Sostituita'];
  return [el('h1', {}, current.name ?? ND), head,
    el('section', {class: 'card', 'data-testid': 'strategy-current', 'data-key': key, 'data-strategy': current.strategy_id ?? ''},
      el('h2', {}, 'Regole della versione ', num(current.version)), rulesList(current.definition),
      el('p', {}, el('a', {href: simHrefOf(current.definition), 'data-action': 'simulate'}, 'Simula questa strategia'))),
    builderForm(new URLSearchParams(simHrefOf(current.definition).split('?')[1] + `&name=${encodeURIComponent(current.name ?? '')}`)),
    el('section', {class: 'card', 'data-testid': 'strategy-versions'}, el('h2', {}, 'Versioni'),
      el('div', {class: 'tablewrap'}, el('table', {class: 'results'}, el('thead', {}, el('tr', {}, columns.map(text => el('th', {scope: 'col'}, text)))),
        el('tbody', {}, versions.map((v, i) => {
          const line = v ? el('tr', {'data-version': v.version},
            el('td', {}, num(v.version)), el('td', {}, formatScalar(v.name)), el('td', {}, rulesList(v.definition)),
            el('td', {}, formatScalar(v.created_at)), el('td', {}, v.superseded_at ? formatScalar(v.superseded_at) : el('span', {class: 'empty'}, 'in uso')))
            : el('tr', {}, el('td', {}, num(current.version - i)), el('td', {colspan: '4'}, el('span', {class: 'nd', title: 'Versione non disponibile in questo momento'}, ND)));
          [...line.children].forEach((cell, index) => cell.setAttribute('data-label', columns[index] ?? ''));
          return line;
        }))))),
  ];
}

// ---- Simulazioni salvate (PERSIST-API-01, WEB-SAVED-01) ----

const SAVED_KIND = {BACKTEST: 'Simulazione', COMPARE: 'Confronto'};
async function savedView(params) {
  const tabs = simTabs('saved');
  const id = params.get('id');
  if (id) {
    if (!/^[1-9]\d{0,8}$/.test(id)) return [el('h1', {}, 'Simulazione salvata'), tabs, el('p', {class: 'state error', role: 'alert', 'data-testid': 'saved-invalid'}, 'Numero non valido.')];
    let saved;
    try {
      saved = (await getJson(`/api/v1/backtests/saved?${queryString({id})}`)).data;
    } catch (error) {
      if (error?.status === 404) return [el('h1', {}, 'Simulazione non trovata'), tabs, el('p', {class: 'state empty', role: 'status', 'data-testid': 'saved-not-found'}, 'Nessuna simulazione salvata con questo numero.')];
      if (error?.code === 'UNAVAILABLE') return [el('h1', {}, 'Simulazione salvata'), tabs, archiveState(error)];
      throw error;
    }
    return [el('h1', {}, saved.name ?? ND), tabs,
      el('p', {class: 'meta', 'data-testid': 'saved-meta', 'data-kind': saved.kind ?? '', 'data-response': saved.response_sha256 ?? ''},
        labelled(SAVED_KIND, saved.kind), ' salvata il ', formatScalar(saved.created_at), ' · ', el('a', {href: '#/saved'}, 'tutte le simulazioni salvate')),
      ...(saved.kind === 'COMPARE' ? cmpResult(saved.result) : simResult(saved.result))];
  }
  let list;
  try {
    list = (await getJson('/api/v1/backtests/saved')).data?.backtests ?? [];
  } catch (error) {
    if (error?.code === 'UNAVAILABLE') return [el('h1', {}, 'Simulazioni salvate'), tabs, archiveState(error)];
    throw error;
  }
  if (list.length === 0) return [el('h1', {}, 'Simulazioni salvate'), tabs, el('p', {class: 'state empty', 'data-testid': 'saved-empty'}, 'Nessuna simulazione salvata: salvane una dal suo risultato.')];
  const columns = ['Nome', 'Tipo', 'Salvata il'];
  return [el('h1', {}, 'Simulazioni salvate'), tabs,
    el('div', {class: 'tablewrap'}, el('table', {class: 'results', 'data-testid': 'saved-list'}, el('thead', {}, el('tr', {}, columns.map(text => el('th', {scope: 'col'}, text)))),
      el('tbody', {}, list.map(item => {
        const line = el('tr', {'data-id': item.backtest_id},
          el('td', {}, el('a', {href: `#/saved?${queryString({id: item.backtest_id})}`}, formatScalar(item.name))),
          el('td', {}, labelled(SAVED_KIND, item.kind)), el('td', {}, formatScalar(item.created_at)));
        [...line.children].forEach((cell, index) => cell.setAttribute('data-label', columns[index]));
        return line;
      }))))];
}
// The sections of «Simulazione»: a run, a comparison, the saved ones.
const SIM_TABS = [['sim', 'Simula', '#/sim'], ['compare', 'Confronta', '#/compare'], ['saved', 'Salvate', '#/saved']];
const simTabs = current => el('nav', {class: 'tabs', 'aria-label': 'Sezioni della simulazione', 'data-testid': 'sim-tabs'},
  SIM_TABS.map(([view, text, href]) => el('a', {href, 'aria-current': view === current ? 'page' : null}, text)));

// ---- Strumenti: the trading calculators (#94, WEB-TOOLS-01) ----

// Each tool: its form fields [name, label, attributes] and the renderer of the server's answer. Every value shown is the
// server's `display` value (rounded by the server), the exact one stays in the tooltip.
const NUMBER = {type: 'number', step: 'any', inputmode: 'decimal'};
const SIDE_FIELD = ['side', 'Lato', {select: Object.entries(SIDE_TEXT)}];
const COMMISSION_FIELD = ['commission', 'Commissione %', {...NUMBER, min: '0', max: '99.99', placeholder: '0'}];
const TOOLS = [
  ['odds', 'Margine', [['odds', 'Quote (separate da spazi)', {type: 'text', required: true, placeholder: 'es. 2,10 3,40 3,60', autocomplete: 'off'}]]],
  ['ev', 'Valore atteso', [['odds', 'Quota', {...NUMBER, required: true, min: '1.01'}], ['probability', 'Probabilità stimata %', {...NUMBER, required: true, min: '0.01', max: '99.99'}],
    ['stake', 'Puntata', {...NUMBER, required: true, min: '0.01'}], SIDE_FIELD, COMMISSION_FIELD]],
  ['kelly', 'Kelly', [['odds', 'Quota', {...NUMBER, required: true, min: '1.01'}], ['probability', 'Probabilità stimata %', {...NUMBER, required: true, min: '0.01', max: '99.99'}],
    ['bankroll', 'Capitale', {...NUMBER, required: true, min: '0.01'}], ['fraction', 'Frazione di Kelly %', {...NUMBER, min: '1', max: '100', placeholder: '100'}]]],
  ['position', 'Posizione', [SIDE_FIELD, ['odds', 'Quota', {...NUMBER, required: true, min: '1.01'}], ['stake', 'Puntata', {...NUMBER, min: '0.01'}],
    ['liability', 'oppure responsabilità', {...NUMBER, min: '0.01'}], COMMISSION_FIELD]],
  ['hedge', 'Copertura', [['side', 'Posizione aperta', {select: Object.entries(SIDE_TEXT)}], ['odds', 'Quota di apertura', {...NUMBER, required: true, min: '1.01'}],
    ['stake', 'Puntata di apertura', {...NUMBER, required: true, min: '0.01'}], ['current_odds', 'Quota attuale', {...NUMBER, required: true, min: '1.01'}],
    ['share', 'Quanto coprire %', {...NUMBER, min: '1', max: '100', placeholder: '100'}], COMMISSION_FIELD]],
  ['dutching', 'Dutching', [['odds', 'Quote (separate da spazi)', {type: 'text', required: true, placeholder: 'es. 4 5 6', autocomplete: 'off'}],
    ['total', 'Puntata totale', {...NUMBER, required: true, min: '0.01'}], COMMISSION_FIELD]],
  ['poisson', 'Poisson', [['xg_home', 'Gol attesi casa', {...NUMBER, required: true, min: '0', max: '10'}], ['xg_away', 'Gol attesi ospite', {...NUMBER, required: true, min: '0', max: '10'}],
    ['max_goals', 'Gol nella griglia', {type: 'number', step: '1', min: '1', max: '8', placeholder: '5'}]]],
];
// The notes of the server that the user needs to read; every code stays in data-notes.
const NOTE_TEXT = {
  BOOK_BELOW_ONE: 'Il totale delle probabilità è sotto il 100%: le quote non sono di un unico mercato completo.',
  SINGLE_SELECTION_NO_MARGIN: 'Con una sola quota non si calcola il margine.',
  NO_EDGE_NO_STAKE: 'Nessun vantaggio alla probabilità stimata: Kelly non punta.',
  BACK_ONLY: 'Kelly è calcolato per una puntata (Punta).',
  PROBABILITY_IS_USER_ESTIMATE: 'La probabilità è la tua stima: il risultato vale quanto la stima.',
  BOOK_BELOW_ONE_PROFIT_EVERY_SELECTION: 'Il totale delle probabilità è sotto il 100%: si guadagna con qualunque selezione vincente.',
  BOOK_AT_LEAST_ONE_LOSS_EVERY_SELECTION: 'Il totale delle probabilità è almeno il 100%: si perde con qualunque selezione vincente.',
  LOSES_PLACED_IF_NONE_WINS: 'Se non vince nessuna delle selezioni si perde tutta la puntata.',
  LIQUIDITY_NOT_CHECKED: 'La disponibilità della quota sul mercato non è verificata.',
  MODEL_NOT_A_FORECAST: 'Modello teorico con gol indipendenti: non è una previsione.',
};
const MATCH_ODDS_TEXT = {HOME: '1', DRAW: 'X', AWAY: '2'};

// A value of the answer: the display value, the exact one in the tooltip.
const calcValue = (display, exactValue, testid) => el('b', {'data-field': testid, title: exactValue !== undefined && exactValue !== null ? `Valore esatto: ${formatDecimalText(String(exactValue))}` : null}, num(display));
const moneyLine = (label, display, exactValue, testid) => [el('dt', {}, label), el('dd', {class: Number(display) < 0 ? 'bad' : Number(display) > 0 ? 'ok' : null}, calcValue(display, exactValue, testid))];
const pctOf = (display, exactValue, testid) => el('span', {}, calcValue(display, exactValue, testid), '%');

const TOOL_RESULTS = {
  odds: (d, r) => [
    el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['Quota', 'Probabilità implicita', 'Probabilità senza margine', 'Quota equa'].map(t => el('th', {scope: 'col'}, t)))),
      el('tbody', {}, d.selections.map((s, i) => el('tr', {'data-row': i},
        el('td', {}, num(s.odds)), el('td', {}, pctOf(s.implied_percent, r.selections[i].implied_probability)),
        el('td', {}, s.fair_percent === null ? formatScalar(null) : pctOf(s.fair_percent, r.selections[i].fair_probability)),
        el('td', {}, s.fair_odds === null ? formatScalar(null) : calcValue(s.fair_odds, r.selections[i].fair_odds))))))),
    el('dl', {}, el('dt', {}, 'Totale delle probabilità'), el('dd', {}, pctOf(d.book_percent, r.book, 'book')),
      el('dt', {}, 'Margine'), el('dd', {}, d.overround_percent === null ? formatScalar(null) : pctOf(d.overround_percent, r.overround, 'overround')))],
  ev: (d, r) => [el('dl', {},
    ...moneyLine('Valore atteso', d.expected_value, r.expected_value, 'expected_value'),
    el('dt', {}, 'Rendimento atteso sul rischio'), el('dd', {}, pctOf(d.roi_percent, r.roi_on_risk, 'roi')),
    el('dt', {}, 'Vantaggio sulla quota'), el('dd', {}, pctOf(d.edge_percent, r.edge, 'edge')),
    el('dt', {}, 'Quota equa'), el('dd', {}, calcValue(d.fair_odds, r.fair_odds, 'fair_odds')),
    el('dt', {}, 'Responsabilità'), el('dd', {}, calcValue(d.liability, r.liability, 'liability')),
    ...moneyLine('Se la selezione vince', d.if_wins, r.if_wins, 'if_wins'), ...moneyLine('Se la selezione perde', d.if_loses, r.if_loses, 'if_loses'))],
  kelly: (d, r) => [el('dl', {},
    el('dt', {}, 'Puntata consigliata'), el('dd', {}, calcValue(d.stake, r.stake, 'stake')),
    el('dt', {}, 'Kelly pieno'), el('dd', {}, pctOf(d.kelly_percent, r.kelly_fraction, 'kelly')),
    el('dt', {}, 'Frazione applicata del capitale'), el('dd', {}, pctOf(d.applied_percent, r.applied_fraction, 'applied')),
    el('dt', {}, 'Vantaggio sulla quota'), el('dd', {}, pctOf(d.edge_percent, r.edge, 'edge')))],
  position: (d, r) => [el('dl', {},
    el('dt', {}, 'Puntata'), el('dd', {}, calcValue(d.stake, r.stake, 'stake')),
    el('dt', {}, 'Responsabilità'), el('dd', {}, calcValue(d.liability, r.liability, 'liability')),
    ...moneyLine('Se la selezione vince', d.if_wins, r.if_wins, 'if_wins'), ...moneyLine('Se la selezione perde', d.if_loses, r.if_loses, 'if_loses'),
    el('dt', {}, 'Probabilità di pareggio dei conti'), el('dd', {}, pctOf(d.break_even_percent, r.break_even_probability, 'break_even')))],
  hedge: (d, r) => [el('dl', {},
    el('dt', {}, 'Copertura'), el('dd', {}, el('b', {'data-field': 'hedge_side'}, labelled(SIDE_TEXT, d.hedge_side)), ' ', calcValue(d.hedge_stake, r.hedge_stake, 'hedge_stake')),
    el('dt', {}, 'Responsabilità della copertura'), el('dd', {}, calcValue(d.hedge_liability, r.hedge_liability, 'hedge_liability'))),
  el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['', 'Se la selezione vince', 'Se la selezione perde'].map(t => el('th', {scope: 'col'}, t)))),
    el('tbody', {},
      el('tr', {'data-row': 'before'}, el('th', {scope: 'row'}, 'Senza copertura'), el('td', {}, calcValue(d.before.if_wins, r.before.if_wins)), el('td', {}, calcValue(d.before.if_loses, r.before.if_loses))),
      el('tr', {'data-row': 'after'}, el('th', {scope: 'row'}, 'Con la copertura'), el('td', {}, calcValue(d.after.if_wins, r.after.if_wins, 'after_wins')), el('td', {}, calcValue(d.after.if_loses, r.after.if_loses, 'after_loses'))))))],
  dutching: (d, r) => [
    el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['Quota', 'Puntata', 'Se vince'].map(t => el('th', {scope: 'col'}, t)))),
      el('tbody', {}, d.selections.map((s, i) => el('tr', {'data-row': i}, el('td', {}, num(s.odds)), el('td', {}, calcValue(s.stake, r.stakes[i])),
        el('td', {class: Number(s.if_wins) < 0 ? 'bad' : 'ok'}, calcValue(s.if_wins, r.if_wins[i]))))))),
    el('dl', {}, el('dt', {}, 'Puntata totale'), el('dd', {}, calcValue(d.placed, r.placed, 'placed')), el('dt', {}, 'Totale delle probabilità'), el('dd', {}, pctOf(d.book_percent, r.book, 'book')))],
  poisson: (d, r) => {
    const max = d.grid.max_goals;
    const cell = (h, a) => d.grid.cells.find(c => c.home === h && c.away === a);
    return [
      el('h3', {}, 'Esito finale'),
      el('div', {class: 'odds', role: 'group', 'aria-label': 'Probabilità 1 X 2'}, d.match_odds.map(m => el('div', {class: 'odd', 'data-field': `p_${m.selection.toLowerCase()}`},
        el('span', {}, MATCH_ODDS_TEXT[m.selection] ?? ND), el('b', {}, num(m.percent), '%'), el('small', {title: 'Quota equa'}, num(m.fair_odds))))),
      el('h3', {}, 'Gol'),
      el('div', {class: 'tablewrap'}, el('table', {}, el('thead', {}, el('tr', {}, ['Linea', 'Over', 'Quota equa', 'Under', 'Quota equa'].map(t => el('th', {scope: 'col'}, t)))),
        el('tbody', {}, d.lines.map(l => el('tr', {'data-line': l.line}, el('td', {}, num(l.line)), el('td', {}, num(l.over_percent), '%'), el('td', {}, num(l.over_fair_odds)),
          el('td', {}, num(l.under_percent), '%'), el('td', {}, num(l.under_fair_odds))))))),
      el('dl', {}, el('dt', {}, 'Entrambe segnano'), el('dd', {'data-field': 'btts'}, num(d.btts.yes_percent), '% · quota equa ', num(d.btts.yes_fair_odds)),
        el('dt', {}, 'Risultati più probabili'), el('dd', {'data-field': 'top_scores'}, d.top_scores.flatMap((s, i) => [i ? ' · ' : '', s.score.replace('-', '–'), ' ', num(s.percent), '%']))),
      el('h3', {}, 'Risultati esatti'),
      el('div', {class: 'tablewrap'}, el('table', {class: 'grid-table', 'data-testid': 'poisson-grid'},
        el('thead', {}, el('tr', {}, el('th', {scope: 'col'}, 'Casa \\ Ospite'), Array.from({length: max + 1}, (_, a) => el('th', {scope: 'col'}, String(a))))),
        el('tbody', {}, Array.from({length: max + 1}, (_, h) => el('tr', {}, el('th', {scope: 'row'}, String(h)),
          Array.from({length: max + 1}, (_, a) => el('td', {'data-score': `${h}-${a}`}, cell(h, a) ? [num(cell(h, a).percent), '%'] : formatScalar(null)))))))),
      el('p', {class: 'meta'}, 'Copertura della griglia usata per 1 X 2: ', num(d.grid_coverage_percent), '%.')];
  },
};

function toolForm(tool, params) {
  const [id, , fields] = TOOLS.find(([key]) => key === tool);
  const value = name => params.get(name) ?? '';
  return el('form', {class: 'card search', 'data-testid': 'tool-form', 'data-tool': id, onsubmit: event => {
    event.preventDefault();
    const out = {tool: id};
    for (const [key, v] of new FormData(event.target).entries()) if (String(v).trim() !== '') out[key] = String(v).trim();
    revealOutcome = true;
    const target = `#/tools?${queryString({...out, run: '1'})}`;
    if (location.hash === target) render();
    else location.hash = target;
  }},
  el('div', {class: 'fields'}, fields.map(([name, label, attrs]) => el('label', {}, `${label} `, attrs.select
    ? el('select', {name}, attrs.select.map(([v, text]) => el('option', {value: v, selected: (value(name) || attrs.select[0][0]) === v}, text)))
    : el('input', {name, value: value(name), ...attrs})))),
  el('button', {type: 'submit'}, 'Calcola'), ' ', el('a', {href: `#/tools?${queryString({tool: id})}`}, 'Azzera'));
}

async function toolsView(params) {
  const tool = choice(params.get('tool'), TOOLS, 'odds');
  const [, title, fields] = TOOLS.find(([key]) => key === tool);
  const head = [el('h1', {}, 'Strumenti'),
    el('nav', {class: 'seg tool-tabs', 'aria-label': 'Strumenti', 'data-testid': 'tool-tabs'},
      TOOLS.map(([key, text]) => el('a', {href: `#/tools?${queryString({tool: key})}`, 'aria-current': key === tool ? 'true' : null, 'data-value': key}, text))),
    toolForm(tool, params)];
  if (params.get('run') !== '1') return [...head, el('p', {class: 'state empty'}, 'Inserisci i valori e premi Calcola.')];
  const api = {};
  for (const [name] of fields) if (params.get(name)) api[name] = params.get(name);
  let body;
  try {
    body = await getJson(`/api/v1/tools/${tool}?${queryString(api)}`);
  } catch (error) {
    if (error?.status === 400) {
      // The server names the parameter first («odds[1]: …», «stake: …»).
      const name = /^([a-z_]+)/.exec(String(error.message ?? ''))?.[1];
      // The label of that field in this tool's own form (the same name can read differently in another tool).
      const label = fields.find(([field]) => field === name)?.[1];
      return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'tool-invalid', 'data-outcome': '', 'data-fields': name ?? '', title: reasonText(error)},
        label ? `Valore non valido in: ${label}. Correggi il campo e riprova.` : 'Valori non validi. Correggi i campi e riprova.')];
    }
    throw error;
  }
  const data = body.data ?? {};
  if (!data.display || !data.result) throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza risultato');
  const notes = (data.notes ?? []).filter(code => Object.hasOwn(NOTE_TEXT, code));
  return [...head,
    el('section', {class: 'card tool-result', 'data-testid': 'tool-result', 'data-outcome': '', 'data-tool': tool, 'data-notes': (data.notes ?? []).join(' ')},
      el('h2', {}, title), ...TOOL_RESULTS[tool](data.display, data.result),
      notes.length ? el('ul', {class: 'notes'}, notes.map(code => el('li', {'data-code': code}, NOTE_TEXT[code]))) : null,
      el('p', {class: 'meta'}, 'Calcolo del server in decimali esatti; importi al centesimo, percentuali a due decimali. Il valore esatto è nel suggerimento.'))];
}

// ---- Money: the Money Management registry and the stake calculator (#96, WEB-MM-01) ----

const MM_TEXT = {
  FIXED_STAKE: ['Puntata fissa', 'Ogni operazione ha la stessa puntata.'],
  FIXED_LIABILITY: ['Rischio fisso', 'Ogni operazione rischia lo stesso importo massimo.'],
  PERCENT_BANKROLL: ['Percentuale del capitale', 'La puntata è una percentuale del capitale disponibile.'],
  LIABILITY_PERCENT_BANKROLL: ['Rischio in percentuale del capitale', 'Il rischio massimo è una percentuale del capitale disponibile.'],
  KELLY: ['Kelly', 'Puntata dalla probabilità stimata e dal vantaggio.'],
  FRACTIONAL_KELLY: ['Kelly frazionario', 'Una frazione della puntata di Kelly.'],
  TARGET_PROFIT: ['Profitto obiettivo', 'La puntata che raggiunge un profitto fissato.'],
  RECOVERY_STAKE: ['Recupero', 'La puntata che recupera le perdite precedenti.'],
  RISK_BASED_STAKE: ['Puntata da rischio', 'La puntata dal rischio massimo per operazione.'],
  MARTINGALE: ['Martingala', 'La puntata raddoppia dopo ogni perdita.'],
  FIBONACCI: ['Fibonacci', 'La puntata segue la successione di Fibonacci.'],
  LABOUCHERE: ['Labouchère', 'Progressione a cancellazione su una lista.'],
  CS_PROGRESSIVO: ['Risultato esatto progressivo', 'Progressione sul mercato del risultato esatto.'],
  EXPOSURE_AWARE: ['In base all’esposizione', 'La puntata tiene conto delle posizioni aperte.'],
  COMPOSITE: ['Composto', 'Più modelli e regole insieme.'],
  MANUAL_WITHIN_LIMITS: ['Manuale entro i limiti', 'La puntata la sceglie l’operatore, entro i limiti.'],
};
const MM_CATEGORY = {A: 'Semplice', B: 'Dal capitale', C: 'Obiettivo o recupero', D: 'Progressione', E: 'Dall’esposizione', F: 'Composto'};
const MM_STATUS = {IMPLEMENTED: 'Utilizzabile', DISCOVERED: 'Da definire'};
const MM_VALUE_TEXT = {stake: 'Puntata', liability: 'Responsabilità', percent: 'Percentuale %'};
const MM_DECISION = {ALLOW: 'Consentita', REDUCE: 'Ridotta dai limiti', BLOCK: 'Bloccata', SIMULATION_ONLY: 'Solo simulazione'};
const MM_CAPS = {max_stake: 'tetto alla puntata', max_liability: 'tetto alla responsabilità', available_bankroll: 'capitale disponibile', max_total_exposure: 'esposizione totale'};
const MM_FIELDS = ['model', 'value', 'bankroll', 'side', 'odds', 'max_stake', 'max_liability', 'commission'];
const MM_LABELS = {model: 'Modello', value: 'Valore del modello', bankroll: 'Capitale disponibile', side: 'Lato', odds: 'Quota',
  max_stake: 'Tetto alla puntata', max_liability: 'Tetto alla responsabilità', commission: 'Commissione %'};
const mmName = id => MM_TEXT[id]?.[0] ?? words(String(id ?? '').toLowerCase());

async function moneyView(params) {
  const body = await getJson('/api/v1/mm/models');
  const models = Array.isArray(body.data?.models) ? body.data.models : [];
  const usable = models.filter(m => m.certification_status === 'IMPLEMENTED');
  const value = name => params.get(name) ?? '';
  const columns = ['Modello', 'Tipo', 'Descrizione', 'Stato'];
  const registry = el('section', {class: 'card', 'data-testid': 'mm-registry'}, el('h2', {}, 'Modelli di gestione del capitale (', num(usable.length), ' utilizzabili su ', num(models.length), ')'),
    models.length === 0 ? el('p', {class: 'state empty'}, 'Nessun modello nel registro.') :
      el('div', {class: 'tablewrap'}, el('table', {class: 'results'}, el('thead', {}, el('tr', {}, columns.map(t => el('th', {scope: 'col'}, t)))),
        el('tbody', {}, models.map(m => {
          const line = el('tr', {'data-model': m.type_id ?? '', 'data-status': m.certification_status ?? ''},
            el('td', {}, el('b', {}, mmName(m.type_id))), el('td', {}, MM_CATEGORY[m.category] ?? formatScalar(null)),
            el('td', {}, MM_TEXT[m.type_id]?.[1] ?? formatScalar(null)),
            el('td', {}, el('span', {class: `pill ${m.certification_status === 'IMPLEMENTED' ? 'ok' : ''}`, title: m.certification_status ?? '', 'data-code': m.certification_status ?? ''},
              MM_STATUS[m.certification_status] ?? 'Sconosciuto')));
          [...line.children].forEach((cell, index) => cell.setAttribute('data-label', columns[index]));
          return line;
        })))));
  const select = (name, options, fallback) => el('select', {name}, options.map(([v, text]) => el('option', {value: v, selected: (value(name) || fallback) === v}, text)));
  const input = (name, attrs) => el('input', {name, value: value(name), ...attrs});
  const form = el('form', {class: 'card search', 'data-testid': 'mm-form', onsubmit: event => {
    event.preventDefault();
    const out = {};
    for (const [key, v] of new FormData(event.target).entries()) if (String(v).trim() !== '') out[key] = String(v).trim();
    revealOutcome = true;
    const target = `#/money?${queryString({...out, run: '1'})}`;
    if (location.hash === target) render();
    else location.hash = target;
  }},
  el('h2', {}, 'Calcola la puntata'),
  el('div', {class: 'fields'},
    el('label', {}, 'Modello ', select('model', usable.map(m => [m.type_id, mmName(m.type_id)]), usable[0]?.type_id)),
    el('label', {}, 'Valore del modello (puntata, responsabilità o percentuale) ', input('value', {...NUMBER, required: true, min: '0.01'})),
    el('label', {}, 'Capitale disponibile ', input('bankroll', {...NUMBER, required: true, min: '0.01'})),
    el('label', {}, 'Lato ', select('side', Object.entries(SIDE_TEXT), 'BACK')),
    el('label', {}, 'Quota ', input('odds', {...NUMBER, required: true, min: '1.01'})),
    el('label', {}, 'Tetto alla puntata ', input('max_stake', {...NUMBER, min: '0.01'})),
    el('label', {}, 'Tetto alla responsabilità ', input('max_liability', {...NUMBER, min: '0.01'})),
    el('label', {}, 'Commissione % ', input('commission', {...NUMBER, min: '0', max: '99.99', placeholder: '0'}))),
  el('button', {type: 'submit'}, 'Calcola'), ' ', el('a', {href: '#/money'}, 'Azzera'));
  const head = [el('h1', {}, 'Money Management'), usable.length ? form : null, registry];
  if (params.get('run') !== '1') return head;
  const api = {};
  for (const name of MM_FIELDS) if (params.get(name)) api[name] = params.get(name);
  let result;
  try {
    result = (await getJson(`/api/v1/mm/stake?${queryString(api)}`)).data;
  } catch (error) {
    if (error?.status === 400) {
      const message = String(error.message ?? '').replace(/\bparams\.[a-z_]+/g, 'value');
      const name = MM_FIELDS.find(f => new RegExp(`(?<![a-z_])${f}(?![a-z_])`).test(message));
      return [head[0], form, el('p', {class: 'state error', role: 'alert', 'data-testid': 'mm-invalid', 'data-outcome': '', 'data-fields': name ?? '', title: reasonText(error)},
        name ? `Valore non valido in: ${MM_LABELS[name]}. Correggi il campo e riprova.` : 'Valori non validi. Correggi i campi e riprova.'), registry];
    }
    throw error;
  }
  const d = result?.display ?? {}, r = result?.result ?? {};
  const caps = (r.caps_triggered ?? []).map(c => MM_CAPS[c] ?? 'altro limite');
  return [head[0], form,
    el('section', {class: 'card tool-result', 'data-testid': 'mm-result', 'data-outcome': '', 'data-decision': r.decision ?? ''},
      el('h2', {}, 'Decisione: ', labelled(MM_DECISION, r.decision)),
      el('dl', {},
        el('dt', {}, 'Puntata del modello'), el('dd', {}, calcValue(d.original_stake, r.original_stake, 'original_stake')),
        el('dt', {}, 'Puntata consentita'), el('dd', {}, calcValue(d.adjusted_stake, r.adjusted_stake, 'adjusted_stake')),
        el('dt', {}, 'Responsabilità'), el('dd', {}, calcValue(d.adjusted_liability, r.adjusted_liability, 'adjusted_liability')),
        ...moneyLine('Se la selezione vince', d.if_wins, r.if_wins, 'if_wins'), ...moneyLine('Se la selezione perde', d.if_loses, r.if_loses, 'if_loses'),
        el('dt', {}, 'Limiti intervenuti'), el('dd', {'data-field': 'caps', 'data-codes': (r.caps_triggered ?? []).join(' ')}, caps.length ? caps.join(', ') : 'nessuno')),
      el('p', {class: 'meta'}, 'Conto simulato senza posizioni aperte: niente viene registrato.')),
    registry];
}

// ---- Portafoglio: the simulated account of the paper ledger (#99, PERSIST-API-01) ----

async function portfolioView(params) {
  const account = (params.get('account') ?? '').trim();
  const form = el('form', {class: 'controls', 'data-testid': 'portfolio-form', onsubmit: event => {
    event.preventDefault();
    const name = String(new FormData(event.target).get('account') ?? '').trim();
    location.hash = `#/portfolio?${queryString({account: name})}`;
  }},
  el('label', {}, 'Conto simulato ', el('input', {name: 'account', value: account, required: true, maxlength: '100', autocomplete: 'off', placeholder: 'es. principale'})),
  el('button', {type: 'submit'}, 'Apri'));
  const head = [el('h1', {}, 'Portafoglio'), form];
  if (!account) return [...head, el('p', {class: 'state empty', 'data-testid': 'portfolio-prompt'}, 'Scrivi il nome del conto simulato e premi Apri.')];
  let state;
  try {
    state = (await getJson(`/api/v1/ledger/account?${queryString({account_id: account})}`)).data?.account;
  } catch (error) {
    if (error?.status === 404) return [...head, el('p', {class: 'state empty', role: 'status', 'data-testid': 'portfolio-not-found'}, `Nessun conto simulato si chiama «${account}».`)];
    if (error?.status === 400) return [...head, el('p', {class: 'state error', role: 'alert', 'data-testid': 'portfolio-invalid', title: reasonText(error)}, 'Nome del conto non valido.')];
    if (error?.code === 'UNAVAILABLE') {
      return [...head, el('p', {class: 'state partial', role: 'status', 'data-testid': 'archive-off', 'data-code': error.code, title: reasonText(error)},
        'Il registro delle posizioni simulate non è ancora attivo su questo server.')];
    }
    throw error;
  }
  if (!state) throw new ApiFailure(200, 'BAD_ENVELOPE', 'risposta senza conto');
  return [...head,
    el('section', {class: 'card', 'data-testid': 'portfolio-account', 'data-account': state.account_id ?? '', 'data-version': state.ledger_version ?? ''},
      el('h2', {}, 'Conto ', formatScalar(state.account_id)),
      el('div', {class: 'grid kpis'},
        kpi('Disponibile', state.available_bankroll, 'available_bankroll'), kpi('Cassa', state.cash_balance, 'cash_balance'),
        kpi('Impegnato nelle posizioni', state.reserved_funds, 'reserved_funds'), kpi('Profitto realizzato', state.realized_pnl, 'realized_pnl')),
      el('dl', {},
        field('Commissioni pagate', num(state.settled_commission), 'settled_commission'),
        field('Profitto non realizzato', el('span', {class: 'nd', title: 'Servono i prezzi in tempo reale: non viene stimato'}, ND), 'unrealized_pnl'),
        field('Posizioni aperte', num(state.open_position_count), 'open_position_count'),
        field('Movimenti nel registro', num(state.entries), 'entries'),
        field('Registro in pari', formatScalar(state.reconciled), 'reconciled')),
      el('p', {class: 'meta'}, 'Denaro simulato: nessuna operazione reale.'))];
}
const kpi = (label, value, name) => el('div', {class: 'kpi', 'data-field': name}, el('span', {}, label), el('b', {}, num(value)));

// ---- Live: the matches still to play today and the live collection (#29) ----

async function liveView(params, mine) {
  const today = localToday();
  const [matches, collector] = await Promise.allSettled([getJson(`/api/v1/fpt/matches?${queryString({date: today, limit: 100})}`), getJson('/api/v1/tc/live')]);
  for (const result of [matches, collector]) if (result.status === 'rejected' && result.reason?.code === 'UNAUTHENTICATED') throw result.reason;
  if (matches.status === 'rejected' && collector.status === 'rejected') throw matches.reason;
  const live = collector.status === 'fulfilled' ? collector.value.data : null;
  const captured = live?.snapshots?.snapshots;
  const status = el('section', {class: 'card', 'data-testid': 'live-collector', 'data-state': collector.status === 'fulfilled' ? 'ok' : 'error'}, el('h2', {}, 'Raccolta in diretta'),
    collector.status === 'rejected'
      ? el('p', {class: 'state partial', role: 'status', 'data-code': collector.reason?.code ?? '', title: reasonText(collector.reason)}, 'Stato della raccolta in diretta non disponibile.')
      : [
        !captured ? el('p', {class: 'state empty', 'data-testid': 'live-none'}, 'Nessuna partita in diretta raccolta: la raccolta in diretta è ferma.') : null,
        el('dl', {},
          field('Partite seguite', num(live?.snapshots?.matches), 'matches'), field('Rilevazioni', num(captured), 'captured'),
          field('Ultima rilevazione', formatScalar(live?.snapshots?.latest), 'latest'), field('Ultimo controllo', formatScalar(live?.cursors?.last_polled_at), 'last_polled_at'))]);
  let upcoming;
  if (matches.status === 'rejected') {
    upcoming = el('p', {class: 'state partial', role: 'status', 'data-code': matches.reason?.code ?? '', title: reasonText(matches.reason)}, 'Partite di oggi non disponibili in questo momento.');
  } else {
    // The matches of today without a final result, in the API's kickoff order.
    const rows = (matches.value.data?.rows ?? []).filter(row => row.result_status !== 'FINAL');
    upcoming = rows.length ? el('div', {class: 'card board', 'data-testid': 'live-upcoming'}, rows.map(matchRow))
      : el('p', {class: 'state empty', 'data-testid': 'live-upcoming-empty'}, 'Nessuna partita da giocare oggi nei dati. ', el('a', {href: '#/'}, 'Vai a Oggi'));
  }
  return [el('h1', {}, 'Live'), status, el('h2', {class: 'day'}, 'Da giocare oggi'), upcoming];
}

// ---- Account: session and archive (#23, #95) ----

async function accountView() {
  const archive = await getJson('/api/v1/persistence/status').then(body => body.data).catch(error => {
    if (error?.code === 'UNAUTHENTICATED') throw error;
    return {error};
  });
  // The session exists only when the server enforces the owner login: an open server answers every route without one.
  let session = null, sessionCode = 'AUTH_OFF';
  const enforced = typeof archive?.writes === 'string' && archive.writes.startsWith('owner');
  if (enforced || archive?.error) {
    try {
      const response = await fetch('/auth/session', {headers: {accept: 'application/json'}, credentials: 'same-origin'});
      if (response.status === 200) session = await response.json().catch(() => null);
      else sessionCode = response.status === 401 ? 'SIGNED_OUT' : 'AUTH_OFF';
    } catch {
      sessionCode = 'NETWORK';
    }
  }
  const out = el('div', {class: 'save-status', role: 'status'});
  const logout = el('button', {type: 'button', 'data-action': 'logout', onclick: async () => {
    if (logout.disabled) return;
    logout.disabled = true;
    try {
      const response = await fetch('/auth/logout', {method: 'POST', credentials: 'same-origin'});
      if (!response.ok) throw new ApiFailure(response.status, `HTTP_${response.status}`);
      location.assign('/login');
    } catch (error) {
      out.replaceChildren(el('p', {class: 'state error', role: 'alert', 'data-code': error?.code ?? '', title: reasonText(error)}, 'Uscita non riuscita: riprova.'));
      logout.disabled = false;
    }
  }}, 'Esci');
  const access = el('section', {class: 'card', 'data-testid': 'account-session', 'data-session': session?.authenticated ? 'signed-in' : sessionCode}, el('h2', {}, 'Accesso'),
    session?.authenticated
      ? [el('dl', {}, field('Utente', formatScalar(session.principal), 'principal'), field('Ruoli', formatScalar((session.roles ?? []).join(', ')), 'roles'),
        field('Scade', formatScalar(session.expires_at), 'expires_at')), el('p', {}, logout), out]
      : sessionCode === 'SIGNED_OUT'
        ? el('p', {class: 'state empty'}, 'Non hai effettuato l’accesso. ', el('a', {href: `/login?next=${encodeURIComponent('/#/account')}`}, 'Accedi'))
        : el('p', {class: 'state empty', 'data-testid': 'auth-off'}, sessionCode === 'NETWORK' ? 'Connessione non disponibile.' : 'L’accesso owner non è attivo su questo server: il sito è consultabile, i salvataggi sono disattivati.'));
  const store = el('section', {class: 'card', 'data-testid': 'account-archive', 'data-available': archive?.available === undefined ? '' : String(archive.available)}, el('h2', {}, 'Archivio'),
    archive?.error ? el('p', {class: 'state partial', role: 'status', 'data-code': archive.error.code ?? '', title: reasonText(archive.error)}, 'Stato dell’archivio non disponibile.')
      : el('dl', {}, field('Strategie e simulazioni salvate', archive?.available ? 'attivo' : 'non ancora attivo', 'available'),
        field('Salvataggi', session?.authenticated && archive?.available ? 'consentiti' : 'non consentiti', 'writes')),
    el('p', {class: 'linkrow'}, el('a', {href: '#/strategies'}, 'Strategie'), el('a', {href: '#/saved'}, 'Simulazioni salvate'), el('a', {href: '#/money'}, 'Money Management')));
  return [el('h1', {}, 'Account'), access, store];
}

// ---- Regole dei mercati: the settlement rules registry (#100), a technical view of «Dati» ----

async function rulesView() {
  const body = await getJson('/api/v1/markets/rules');
  const rules = Array.isArray(body.data?.rules) ? body.data.rules : [];
  return [el('h1', {}, 'Regole dei mercati'), dataTabs('rules'),
    el('section', {class: 'card', 'data-testid': 'market-rules'}, el('h2', {}, `Regole (versione ${body.data?.version ?? ND})`),
      rules.length === 0 ? el('p', {class: 'state empty'}, 'Nessuna regola nel registro.') :
        el('div', {class: 'tablewrap'}, el('table', {class: 'nowrap-head'}, el('thead', {}, el('tr', {}, ['Mercato', 'Identificativo', 'Dati usati', 'Esito', 'Annullamento', 'Rinvio', 'In vigore dal']
          .map(t => el('th', {scope: 'col'}, t)))),
        el('tbody', {}, rules.map(rule => el('tr', {'data-market': rule.market_type ?? ''},
          el('td', {}, el('code', {}, rule.market_type ?? ND)), el('td', {}, el('code', {}, rule.market_rule_id ?? ND)),
          el('td', {}, (rule.resolution_inputs ?? []).join(', ') || ND), el('td', {}, formatScalar(rule.result_mapping)),
          el('td', {}, formatScalar(rule.void_policy)), el('td', {}, formatScalar(rule.postponed_policy)), el('td', {}, formatScalar(rule.effective_from)))))))),
    metaLine(body)];
}

// ---- Match Center additions: settled markets of a finished match (#25) and links to the tools (#94) ----

const OU_TEXT = {OVER: 'Over', UNDER: 'Under'};
const BTTS_TEXT = {YES: 'Sì', NO: 'No'};
const CS_OTHER = {ANY_OTHER_HOME: 'Altro risultato (vince la casa)', ANY_OTHER_AWAY: 'Altro risultato (vince l’ospite)', ANY_OTHER_DRAW: 'Altro pareggio'};
function postMatchCard(post) {
  if (!post || post.status !== 'SETTLED') return null;
  const price = market => market.price === null || market.price === undefined ? [] : [' · quota ', num(market.price)];
  const line = market => {
    if (market.market_type === 'MATCH_ODDS') return ['Esito finale', [labelled(MATCH_ODDS_TEXT, market.winning_selection), ...price(market)]];
    if (market.market_type === 'OVER_UNDER') return [['Gol ', num(market.line)], [labelled(OU_TEXT, market.winning_selection), ' ', num(market.line), ...price(market)]];
    if (market.market_type === 'BTTS') return ['Entrambe segnano', [labelled(BTTS_TEXT, market.winning_selection), ...price(market)]];
    if (market.market_type === 'CORRECT_SCORE') return ['Risultato esatto', CS_OTHER[market.winning_selection] ?? String(market.winning_selection ?? ND).replace('-', '–')];
    return null;
  };
  const fav = post.favourite ?? {};
  return el('section', {class: 'card', 'data-testid': 'post-match'}, el('h2', {}, 'Esito dei mercati'),
    el('dl', {}, post.markets.map(market => [market, line(market)]).filter(([, pair]) => pair).flatMap(([market, [label, value]]) => [el('dt', {}, label),
      el('dd', {'data-market': market.market_type, 'data-rule': market.market_rule_id ?? '', 'data-winner': market.winning_selection ?? ''}, value)]),
    el('dt', {}, 'Il favorito'), el('dd', {'data-field': 'favourite_won'}, fav.won === null || fav.won === undefined ? formatScalar(null) : fav.won ? 'ha vinto' : 'non ha vinto')),
    el('p', {class: 'meta'}, 'Mercati regolati sul risultato finale con le regole interne di MatchPilot.'));
}
function matchToolLinks(match) {
  const links = [];
  if (match.odd_home && match.odd_draw && match.odd_away) links.push(el('a', {href: `#/tools?${queryString({tool: 'odds', odds: `${match.odd_home} ${match.odd_draw} ${match.odd_away}`, run: '1'})}`, 'data-action': 'tool-odds'}, 'Margine delle quote 1 X 2'));
  if (match.xg_home !== null && match.xg_home !== undefined && match.xg_away !== null && match.xg_away !== undefined) {
    links.push(el('a', {href: `#/tools?${queryString({tool: 'poisson', xg_home: match.xg_home, xg_away: match.xg_away, run: '1'})}`, 'data-action': 'tool-poisson'}, 'Poisson dagli xG della partita'));
  }
  if (match.favorite_odd) links.push(el('a', {href: `#/tools?${queryString({tool: 'ev', odds: match.favorite_odd})}`, 'data-action': 'tool-ev'}, 'Valore atteso sul favorito'));
  if (!links.length) return null;
  return el('p', {class: 'toollinks linkrow', 'data-testid': 'match-tools'}, el('span', {}, 'Strumenti:'), links);
}

// [what is loading, view, area]: a 'user' view shows no technical text (MP-WEB-015, checked by the Browser QA gate); a
// 'technical' view is where provenance and diagnostics belong. Every view declares one (V-B2). #/board, the former
// address of the Daily Board, still opens it, and the menu item of each view is its section (NAV_OF).

const VIEWS = {'': ['la pagina', boardView, 'user'], board: ['la pagina', boardView, 'user'], search: ['la ricerca', searchView, 'user'],
  match: ['la partita', matchView, 'user'], live: ['le partite in diretta', liveView, 'user'],
  data: ['lo stato dei dati', dashboardView, 'technical'], providers: ['i fornitori dati', providersView, 'technical'],
  sim: ['la simulazione', simView, 'user'], compare: ['il confronto', compareView, 'user'], saved: ['le simulazioni salvate', savedView, 'user'],
  strategies: ['le strategie', strategiesView, 'user'], tools: ['gli strumenti', toolsView, 'user'], money: ['il money management', moneyView, 'user'],
  portfolio: ['il portafoglio', portfolioView, 'user'], account: ['l’account', accountView, 'user'],
  endpoints: ['gli endpoint', endpointsView, 'technical'], rules: ['le regole dei mercati', rulesView, 'technical']};
const NAV_OF = {board: '', providers: 'data', endpoints: 'data', rules: 'data', match: null, compare: 'sim', saved: 'sim'};

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
  const reveal = revealOutcome && ['search', 'sim', 'compare', 'tools', 'money'].includes(name);
  revealOutcome = false;
  const [what, view, area] = Object.hasOwn(VIEWS, name) ? VIEWS[name] : [null, null, 'user'];
  const host = document.getElementById('view');
  if (area) host.dataset.area = area;
  else delete host.dataset.area;
  const section = Object.hasOwn(NAV_OF, name) ? NAV_OF[name] : name;
  for (const link of document.querySelectorAll('header a[data-view]')) {
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
