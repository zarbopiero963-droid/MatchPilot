(() => {
'use strict';
// MatchPilot Web App — MP-UI-ROADMAP-01 (parent MP-WEBAPP-FULL-BUILD-01), rule 13: one app that grows, every section
// reachable from the navigation, every control with a stable id (data-control) declared in CONTROL_SPECS and exercised by
// the built-in autotest. Two data adapters: REAL (the MatchPilot API v1, when this file is served by the MatchPilot server)
// and DEMO (deterministic, generated in the browser, always labelled DEMO). Nothing here places a real bet.
// Excluded by the owner: SaaS, billing, subscriptions, multi-tenancy, real-money order execution.

const BUILD = {id: 'MP-UI-ROADMAP-01', version: '2026.10.24', label: 'MatchPilot Web App · build 2026-10-24'};
const ND = 'N/D';
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------------------------------------------------------------- errors captured for Diagnostica
const ERRORS = [];
window.addEventListener('error', e => ERRORS.push({at: new Date().toISOString(), message: String(e.message || e.error || 'errore')}));
window.addEventListener('unhandledrejection', e => ERRORS.push({at: new Date().toISOString(), message: String(e.reason?.message || e.reason || 'promessa rifiutata')}));

// ---------------------------------------------------------------- control registry
// Every interactive element is created with `ctl` (its stable id). The id must be declared in CONTROL_SPECS; an
// undeclared id, or an interactive element without id, is a defect reported by Diagnostica and by the autotest.
const SPECS = new Map();
function C(id, view, label, phase, issues, kind = 'button') { SPECS.set(id, {id, view, label, phase, issues, kind}); }
const SEEN = new Map(); // id -> {count, views:Set}
const UNKNOWN = new Set();
function registerControl(id) {
  if (!SPECS.has(id)) UNKNOWN.add(id);
  const s = SEEN.get(id) ?? {count: 0};
  s.count++;
  SEEN.set(id, s);
}
const INTERACTIVE = 'a[href], button, input, select, textarea, [role="button"], [role="switch"], [role="tab"]';
function auditDom(root = document) {
  const missing = $$(INTERACTIVE, root).filter(n => !n.dataset.control && !n.closest('[data-noaudit]'));
  return {missing: missing.map(n => `${n.tagName.toLowerCase()} «${(n.textContent || n.getAttribute('aria-label') || n.name || '').trim().slice(0, 30)}»`),
    unknown: [...UNKNOWN]};
}

// ---------------------------------------------------------------- DOM builder
const PROPS = new Set(['value', 'checked', 'selected', 'disabled', 'hidden', 'indeterminate']);
function h(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'ctl') { n.dataset.control = v; registerControl(v); }
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (PROPS.has(k)) n[k] = v;
    else n.setAttribute(k, v === true ? '' : String(v));
  }
  add(n, kids);
  return n;
}
function add(n, kids) {
  for (const k of kids) {
    if (k === null || k === undefined || k === false) continue;
    if (Array.isArray(k)) add(n, k);
    else n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return n;
}
const svgNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, ...kids) {
  const n = document.createElementNS(svgNS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) n.setAttribute(k, String(v));
  for (const k of kids.flat()) if (k !== null && k !== undefined) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
}
const ICON_PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', cal: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4',
  live: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7',
  pilot: 'M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z', chart: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6', replay: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M10 9l5 3-5 3z',
  rules: 'M4 6h10M4 12h16M4 18h7M17 4v4M14 16v4', flask: 'M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-10V3',
  wallet: 'M3 7h18v13H3zM16 13h2M3 7l3-4h12l3 4', coins: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  calc: 'M5 3h14v18H5zM8 7h8M8 11h2M12 11h0M16 11h0M8 15h2M12 15h0M16 15h0M8 18h2', gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6', pulse: 'M3 12h4l3-8 4 16 3-8h4',
  check: 'M4 12l5 5L20 6', search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5', menu: 'M4 6h16M4 12h16M4 18h16', x: 'M6 6l12 12M18 6L6 18',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12z', filter: 'M3 5h18l-7 8v6l-4 2v-8z', more: 'M5 12h.01M12 12h.01M19 12h.01',
  db: 'M12 9c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
};
const icon = (name, size = 18) => s('svg', {width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9,
  'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'}, s('path', {d: ICON_PATHS[name] ?? ICON_PATHS.more}));
const LOGO = () => s('svg', {width: 30, height: 30, viewBox: '0 0 32 32', 'aria-hidden': 'true'}, s('rect', {width: 32, height: 32, rx: 8, fill: '#FFB547'}),
  s('path', {d: 'M7 22 L12.5 11 L16 17 L19.5 11 L25 22', fill: 'none', stroke: '#1A1205', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'}),
  s('circle', {cx: 16, cy: 25.5, r: 1.8, fill: '#1A1205'}));

// ---------------------------------------------------------------- formatting (Italian; missing values are N/D, never 0)
const isNum = v => typeof v === 'number' && Number.isFinite(v);
// Italian number format: thousands always grouped with a dot (1.275,00), decimal comma, fixed decimals (F-21).
function nf(v, dp = 2) {
  if (!isNum(v)) return ND;
  const [int, dec] = Math.abs(v).toFixed(dp).split('.');
  const neg = v < 0 && Number(Math.abs(v).toFixed(dp)) !== 0;
  return `${neg ? '-' : ''}${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
}
const nint = v => isNum(v) ? nf(Math.round(v), 0) : ND;
const pct = (p, dp = 1) => isNum(p) ? `${nf(p * 100, dp)}%` : ND;
const odd = v => isNum(v) ? nf(v, 2) : ND;
const money = v => isNum(v) ? `${v < 0 ? '−' : ''}${CURRENCY()} ${nf(Math.abs(v), 2)}` : ND;
const signed = v => isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 2)}` : ND;
const r2 = x => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;
const r4 = x => Math.round(x * 10000) / 10000;
const floor2 = x => Math.floor(x * 100 + 1e-9) / 100;
// Cents with ties to even, as the server's money (src/math/money.mjs, ROUNDING.HALF_EVEN): 0,625 → 0,62.
const cents = x => { const v = x * 100, f = Math.floor(v), d = v - f; return (Math.abs(d - 0.5) < 1e-7 ? (f % 2 === 0 ? f : f + 1) : Math.round(v)) / 100; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// The DEMO clock can be moved (Diagnostica › Orologio DEMO) to show a match day at any hour; REAL always uses the real clock.
const nowMs = () => Date.now() + (APP.mode === 'DEMO' ? Number(APP.clockOffset) || 0 : 0);
const today = () => isoDay(new Date(nowMs()));
const parseDay = t => { const [y, m, d] = t.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (t, n) => { const d = parseDay(t); d.setDate(d.getDate() + n); return isoDay(d); };
const validDay = t => /^\d{4}-\d{2}-\d{2}$/.test(t || '') && isoDay(parseDay(t)) === t;
const LONG = new Intl.DateTimeFormat('it-IT', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
const SHORT = new Intl.DateTimeFormat('it-IT', {day: '2-digit', month: '2-digit', year: 'numeric'});
const WDAY = new Intl.DateTimeFormat('it-IT', {weekday: 'short'});
const MONTH = new Intl.DateTimeFormat('it-IT', {month: 'long', year: 'numeric'});
const dayLong = t => LONG.format(parseDay(t));
const dayShort = t => SHORT.format(parseDay(t));
// Instants are shown in the time zone of the Impostazioni (F-08).
const TZ = () => settings().timezone || 'Europe/Rome';
const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? ND : d.toLocaleString('it-IT', {timeZone: TZ(), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'}); };
const ago = ms => ms < 60000 ? `${Math.round(ms / 1000)} s` : ms < 3600000 ? `${Math.round(ms / 60000)} min` : `${Math.round(ms / 3600000)} h`;
const words = t => String(t ?? '').split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const esc = t => String(t);

// ---------------------------------------------------------------- storage (namespaced: the autotest uses its own)
let NS = 'mp.';
const store = {
  get(k, d) { try { const v = localStorage.getItem(NS + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(NS + k); } catch { /* storage unavailable */ } },
  available() { try { localStorage.setItem('mp.__t', '1'); localStorage.removeItem('mp.__t'); return true; } catch { return false; } },
  clearNs(ns) { try { for (const k of Object.keys(localStorage)) if (k.startsWith(ns)) localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

// ---------------------------------------------------------------- settings (#95) — versioned, kept in this browser
const SETTINGS_DEFAULT = {version: 1, updated_at: null, exchange: 'Betfair Exchange', commission: 5, currency: 'EUR', timezone: 'Europe/Rome',
  bankroll: 1000, default_stake: 10, min_stake: 2, mm_profile: null,
  max_stake: 100, max_liability: 150, daily_loss: 80, max_open: 10,
  fresh_s: 10, delayed_s: 30, stale_s: 60, show_issues: false, hide_scores: false, reduced_motion: false, accounts: 'demo'};
const settings = () => ({...SETTINGS_DEFAULT, ...store.get('settings', {})});
const CURRENCY = () => ({EUR: '€', GBP: '£', USD: '$'})[settings().currency] ?? '€';

// ---------------------------------------------------------------- app state and data mode
const APP = {mode: 'DEMO', realAvailable: false, real: null, booted: false};
const MODE_TEXT = {REAL: 'REAL', DEMO: 'DEMO', MIXED: 'REAL + DEMO', UNAVAILABLE: 'NON DISPONIBILE'};
const chip = (state, note) => h('span', {class: `chip ${state}`, title: note ?? (state === 'DEMO' ? 'Dati dimostrativi generati nel browser, deterministici' : state === 'REAL' ? 'Dati dall’API v1 di MatchPilot' : state === 'MIXED' ? 'Parte dal server (REAL), parte da questo browser (DEMO)' : 'Funzione non disponibile in questo ambiente')}, MODE_TEXT[state] ?? state);
// F-18: an xG not read from the server is synthetic (generated in the browser): it is always labelled DEMO.
const xgLab = src => src === 'REAL' ? 'xG' : 'xG DEMO';
const issueTag = (...ids) => h('span', {class: 'issue'}, ids.join(' '));
function strip(state, text) {
  return h('div', {class: `strip ${state}`, 'data-state': state}, chip(state), h('span', {}, text));
}

// ---------------------------------------------------------------- toasts, dialogs, drawer
function toast(text, kind = '') {
  const n = h('div', {class: `toast ${kind}`, role: kind === 'bad' ? 'alert' : 'status'}, text);
  $('#toasts').append(n);
  setTimeout(() => n.remove(), kind === 'bad' ? 6000 : 3500);
}
let lastFocus = null;
function dialog({title, body, actions, onclose, id = 'dlg'}) {
  closeDialog();
  lastFocus = document.activeElement;
  const box = h('div', {class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-t`, 'data-dialog': id},
    h('h2', {id: `${id}-t`}, title), body, h('div', {class: 'row end', style: {marginTop: '14px'}}, actions));
  const ov = h('div', {class: 'ov', id: 'overlay', onmousedown: e => { if (e.target === ov) { closeDialog(); onclose?.(); } }}, box);
  ov.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDialog(); onclose?.(); }
    if (e.key === 'Tab') {
      const f = $$('button, input, select, textarea, a[href]', box).filter(x => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  document.body.append(ov);
  ($('input, select, textarea', box) ?? $('button', box))?.focus();
  return box;
}
function closeDialog() { $('#overlay')?.remove(); if (lastFocus?.isConnected) lastFocus.focus(); lastFocus = null; }
function confirmDialog(title, text, {ok = 'Conferma', danger = false, ctlOk, ctlCancel} = {}) {
  return new Promise(resolve => {
    dialog({title, body: h('p', {}, text), onclose: () => resolve(false), actions: [
      h('button', {class: 'btn', type: 'button', ctl: ctlCancel ?? 'CTL-DLG-CANCEL', onclick: () => { closeDialog(); resolve(false); }}, 'Annulla'),
      h('button', {class: `btn ${danger ? 'danger' : 'pri'}`, type: 'button', ctl: ctlOk ?? 'CTL-DLG-OK', onclick: () => { closeDialog(); resolve(true); }}, ok)]});
  });
}
function promptDialog(title, label, {value = '', required = true, ctlInput = 'CTL-DLG-INPUT', ctlOk = 'CTL-DLG-OK', ok = 'Conferma'} = {}) {
  return new Promise(resolve => {
    const input = h('input', {type: 'text', value, ctl: ctlInput, maxlength: 200, 'aria-label': label});
    const err = h('p', {class: 'err', role: 'alert'});
    const submit = () => {
      const v = input.value.trim();
      if (required && !v) { err.textContent = 'Campo obbligatorio.'; input.focus(); return; }
      closeDialog(); resolve(v);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    dialog({title, body: [h('label', {class: 'f'}, label, input), err], onclose: () => resolve(null), actions: [
      h('button', {class: 'btn', type: 'button', ctl: 'CTL-DLG-CANCEL', onclick: () => { closeDialog(); resolve(null); }}, 'Annulla'),
      h('button', {class: 'btn pri', type: 'button', ctl: ctlOk, onclick: submit}, ok)]});
  });
}

// ---------------------------------------------------------------- router
const VIEWS = new Map();
// view: {id, title, group, icon, phase, issues, nav(bool), render(params, ctx) -> nodes | Promise<nodes>}
function view(def) { VIEWS.set(def.id, def); }
const NAV_GROUPS = [
  ['Panoramica', ['dashboard', 'calendar', 'matches', 'competitions']],
  ['Live', ['live', 'copilot']],
  ['Analisi', ['analysis', 'replay']],
  ['Trading', ['strategies', 'backtest', 'paper', 'money', 'tools']],
  ['Sistema', ['settings', 'session', 'diagnostics', 'coverage']],
];
const parseHash = () => {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, q] = raw.split('?');
  return {name: path || 'dashboard', params: new URLSearchParams(q || '')};
};
const qs = obj => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== '') p.set(k, v); const t = p.toString(); return t ? `?${t}` : ''; };
const href = (name, params = {}) => `#/${name}${qs(params)}`;
function go(name, params = {}) {
  const target = href(name, params);
  if (location.hash === target) render(); else location.hash = target;
}
let generation = 0;
let timers = [];
const every = (ms, fn) => { const t = setInterval(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearInterval); timers = []; };
let renderDone = Promise.resolve();
let currentName = null;

function loadingState(what) {
  return h('div', {class: 'state loading', role: 'status', 'data-state': 'loading'}, `Caricamento ${what}…`, h('div', {class: 'skel', style: {width: '70%'}}), h('div', {class: 'skel', style: {width: '45%'}}));
}
function errorState(error, retry) {
  return h('div', {class: 'state error', role: 'alert', 'data-state': 'error', 'data-code': error?.code ?? 'CLIENT', title: `${error?.code ?? ''} ${error?.message ?? ''}`.trim()},
    h('p', {style: {margin: '0 0 10px'}}, error?.code === 'NETWORK' ? 'Connessione non disponibile: i dati non sono stati caricati.' : 'I dati non sono disponibili in questo momento.'),
    h('button', {class: 'btn', type: 'button', ctl: 'CTL-STATE-RETRY', onclick: retry}, 'Riprova'));
}
const emptyState = (text, ...extra) => h('div', {class: 'empty', 'data-state': 'empty'}, text, extra.length ? [' ', ...extra] : null);

async function render() {
  const {name, params} = parseHash();
  const v = VIEWS.get(name);
  const mine = ++generation;
  clearTimers();
  closeMenus();
  document.body.classList.remove('navopen');
  const host = $('#view');
  currentName = name;
  const section = v?.navAs ?? name;
  for (const a of $$('[data-nav]')) {
    if (a.dataset.nav === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (!v) {
    host.replaceChildren(h('div', {class: 'phead'}, h('h1', {}, 'Pagina non trovata')),
      emptyState('Questa sezione non esiste.', h('a', {href: href('dashboard'), ctl: 'CTL-NOTFOUND-HOME'}, 'Torna alla Dashboard')));
    document.title = 'Pagina non trovata — MatchPilot';
    host.dataset.view = 'notfound';
    renderDone = Promise.resolve();
    return renderDone;
  }
  host.dataset.view = v.id;
  document.title = `${v.title} — MatchPilot`;
  host.dataset.ready = '';
  host.replaceChildren(h('div', {class: 'phead'}, h('h1', {}, v.title)), loadingState(v.loadingText ?? 'della pagina'));
  const started = performance.now();
  renderDone = (async () => {
    try {
      // Test hook of the built-in autotest: the next render fails once, to exercise the error state and «Riprova».
      if (APP.failNext) { APP.failNext = false; throw Object.assign(new Error('errore simulato dall’autotest'), {code: 'UNAVAILABLE'}); }
      const nodes = await v.render(params, {mine, alive: () => mine === generation});
      if (mine !== generation) return;
      host.replaceChildren(...[nodes].flat(Infinity).filter(Boolean));
      host.dataset.ready = String(mine);
      // After a navigation the keyboard focus moves to the content (F-20); the first load keeps the page focus.
      if (APP.booted && !$('#overlay') && !host.contains(document.activeElement)) host.focus({preventScroll: true});
      APP.lastRender = {view: v.id, ms: performance.now() - started};
    } catch (error) {
      if (mine !== generation) return;
      host.replaceChildren(h('div', {class: 'phead'}, h('h1', {}, 'Dati non disponibili')), errorState(error, render));
      host.dataset.ready = String(mine);
    }
  })();
  return renderDone;
}
// A page head: title, optional subtitle, chips and actions on the right.
function head(title, {sub, chips = [], actions = [], issues = [], crumbs} = {}) {
  return h('div', {class: 'phead'}, h('div', {},
    crumbs ? h('div', {class: 'crumbs'}, crumbs) : null,
    h('h1', {}, title, issues.length ? issueTag(...issues) : null), sub ? h('div', {class: 'sub'}, sub) : null),
  h('div', {class: 'row'}, chips, actions));
}

// ---------------------------------------------------------------- menus (topbar)
function closeMenus() { $$('.menu, .gresults').forEach(m => m.remove()); $$('[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
document.addEventListener('mousedown', e => { if (!e.target.closest('.menu, .gresults, [data-menu-btn], .gsearch')) closeMenus(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeMenus(); document.body.classList.remove('navopen'); if ($('.drawer')) closeDrawer(); }
  if (e.key === '/' && !e.target.closest('input, textarea, select')) { e.preventDefault(); $('#gsearch')?.focus(); }
});
