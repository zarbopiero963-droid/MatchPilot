
// ================================================================ shell (UI-02)
// The campionati filter is kept per data source: DEMO and REAL competitions have different ids (F-06).
const FILTER_KEY = () => `compFilter.${APP.mode}`;
const compFilter = () => store.get(FILTER_KEY(), []);
const passesFilter = m => { const f = compFilter(); return !f.length || f.includes(m.comp.id); };
const NAV_ICON = {dashboard: 'home', calendar: 'cal', matches: 'list', competitions: 'trophy', live: 'live', copilot: 'pilot', analysis: 'chart', replay: 'replay',
  strategies: 'rules', backtest: 'flask', paper: 'wallet', money: 'coins', tools: 'calc', settings: 'gear', session: 'user', diagnostics: 'pulse', coverage: 'check'};
const NAV_CTL = id => `CTL-NAV-${id.toUpperCase()}`;

function buildShell() {
  const search = h('input', {id: 'gsearch', type: 'search', placeholder: innerWidth < 640 ? 'Cerca…' : 'Cerca squadre, campionati, partite, pagine…  ( / )', autocomplete: 'off',
    'aria-label': 'Ricerca globale', 'aria-controls': 'gresults', 'aria-autocomplete': 'list', ctl: 'CTL-GSEARCH-INPUT'});
  search.addEventListener('input', () => globalSearch(search));
  search.addEventListener('focus', () => { if (search.value.trim()) globalSearch(search); });
  search.addEventListener('keydown', e => searchKeys(e, search));
  // «Salta al contenuto» (F-20): a button, because a link to #view would be read as a route by the hash router.
  const skip = h('button', {class: 'skip', type: 'button', ctl: 'CTL-SKIP', onclick: () => $('#view').focus()}, 'Salta al contenuto');
  const top = h('header', {class: 'topbar'},
    h('button', {class: 'iconbtn burger', type: 'button', 'aria-label': 'Apri il menu', 'aria-expanded': 'false', ctl: 'CTL-NAV-BURGER', onclick: e => {
      const open = !document.body.classList.contains('navopen');
      document.body.classList.toggle('navopen', open);
      e.currentTarget.setAttribute('aria-expanded', String(open));
      if (open) $('.side a')?.focus();
    }}, icon('menu')),
    h('a', {class: 'brand', href: href('dashboard'), 'aria-label': 'MatchPilot, Dashboard', ctl: 'CTL-NAV-BRAND'}, LOGO(), h('b', {}, 'MATCH', h('span', {}, 'PILOT'))),
    h('div', {class: 'gsearch', role: 'combobox', 'aria-expanded': 'false', 'aria-haspopup': 'listbox'}, icon('search', 16), search),
    h('div', {class: 'topright'},
      h('div', {class: 'rel'}, h('button', {id: 'modebtn', class: `mode ${APP.mode}`, type: 'button', 'data-menu-btn': '', 'aria-expanded': 'false', ctl: 'CTL-TOP-MODE',
        title: 'Origine dei dati', onclick: e => modeMenu(e.currentTarget)}, APP.mode)),
      h('div', {class: 'rel'}, h('button', {id: 'filterbtn', class: 'iconbtn', type: 'button', 'data-menu-btn': '', 'aria-expanded': 'false', 'aria-label': 'Filtro campionati',
        ctl: 'CTL-TOP-FILTER', onclick: e => filterMenu(e.currentTarget)}, icon('filter'))),
      h('span', {class: 'clock', id: 'clock'}, ''),
      h('button', {class: 'iconbtn', type: 'button', 'aria-label': 'Assistente', ctl: 'CTL-TOP-ASSIST', onclick: () => openAssistant()}, icon('chat')),
      h('div', {class: 'rel'}, h('button', {class: 'iconbtn', type: 'button', 'data-menu-btn': '', 'aria-expanded': 'false', 'aria-label': 'Account', ctl: 'CTL-TOP-ACCOUNT',
        onclick: e => accountMenu(e.currentTarget)}, icon('user')))));
  const side = h('nav', {class: 'side', 'aria-label': 'Sezioni', id: 'sidenav'},
    NAV_GROUPS.map(([group, ids]) => [h('div', {class: 'grp'}, group), ids.map(id => {
      const v = VIEWS.get(id);
      return h('a', {href: href(id), 'data-nav': id, ctl: NAV_CTL(id)}, icon(NAV_ICON[id]), h('span', {}, v.title), id === 'live' ? h('span', {class: 'cnt', id: 'livecount', hidden: true}, '') : null);
    })]));
  const bottom = h('nav', {class: 'bottombar', 'aria-label': 'Sezioni principali'},
    [['dashboard', 'Oggi', 'CTL-BOT-DASH'], ['live', 'Live', 'CTL-BOT-LIVE'], ['strategies', 'Strategie', 'CTL-BOT-STRAT'], ['tools', 'Strumenti', 'CTL-BOT-TOOLS']]
      .map(([id, text, c]) => h('a', {href: href(id), 'data-nav': id, ctl: c}, icon(NAV_ICON[id], 20), text)),
    h('button', {type: 'button', ctl: 'CTL-BOT-MORE', 'aria-label': 'Tutte le sezioni', onclick: () => { document.body.classList.add('navopen'); $('.side a')?.focus(); }}, icon('grid', 20), 'Altro'));
  const app = h('div', {class: 'app'}, skip, top, side, h('div', {class: 'scrim', onclick: () => document.body.classList.remove('navopen')}),
    h('main', {id: 'view', tabindex: '-1'}), bottom);
  $('#root').replaceChildren(app);
  const tick = () => { const c = $('#clock'); if (c) { c.textContent = new Date(nowMs()).toLocaleTimeString('it-IT', {timeZone: TZ(), hour: '2-digit', minute: '2-digit', second: '2-digit'}); c.title = APP.clockOffset && !isReal() ? 'Orologio DEMO spostato (Diagnostica)' : 'Ora locale'; c.classList.toggle('warn', !!APP.clockOffset && !isReal()); } };
  tick(); setInterval(tick, 1000);
  updateLiveCount(); setInterval(updateLiveCount, 30000);
  document.body.classList.toggle('dev', !!settings().show_issues);
}
function updateLiveCount() {
  const n = isReal() ? 0 : demoDay(today()).map(withState).filter(m => (m.status === 'LIVE' || m.status === 'HT') && passesFilter(m)).length;
  const c = $('#livecount');
  if (c) { c.hidden = !n; c.textContent = String(n); }
}
function menuAt(btn, content, cls = '') {
  const open = btn.getAttribute('aria-expanded') === 'true';
  closeMenus();
  if (open) return null;
  btn.setAttribute('aria-expanded', 'true');
  const m = h('div', {class: `menu ${cls}`, role: 'menu'}, content);
  btn.parentElement.append(m);
  return m;
}
function modeMenu(btn) {
  menuAt(btn, [h('div', {class: 'small', style: {padding: '6px 10px'}}, h('b', {}, 'Origine dei dati'), h('div', {class: 'muted xs'},
    APP.realAvailable ? 'Questa pagina è servita dal server MatchPilot: puoi usare i dati reali o quelli dimostrativi.' : 'File aperto senza server MatchPilot: solo dati dimostrativi (DEMO), generati nel browser.')),
  h('hr'),
  h('button', {class: 'mi', type: 'button', role: 'menuitemradio', 'aria-checked': String(APP.mode === 'REAL'), disabled: !APP.realAvailable, ctl: 'CTL-MODE-REAL',
    onclick: () => setMode('REAL')}, 'REAL — API v1', APP.mode === 'REAL' ? icon('check', 16) : null),
  h('button', {class: 'mi', type: 'button', role: 'menuitemradio', 'aria-checked': String(APP.mode === 'DEMO'), ctl: 'CTL-MODE-DEMO', onclick: () => setMode('DEMO')},
    'DEMO — dati dimostrativi', APP.mode === 'DEMO' ? icon('check', 16) : null)]);
}
function setMode(mode) {
  if (mode === 'REAL' && !APP.realAvailable) return;
  APP.mode = mode; store.set('mode', mode);
  const b = $('#modebtn'); b.className = `mode ${mode}`; b.textContent = mode;
  closeMenus(); updateLiveCount(); toast(mode === 'REAL' ? 'Dati reali dall’API v1' : 'Dati dimostrativi (DEMO)'); render();
}
async function filterMenu(btn) {
  const sel = new Set(compFilter());
  let comps;
  try { comps = await DATA.competitions(); } catch { toast('Elenco dei campionati non disponibile', 'bad'); return; }
  const key = FILTER_KEY();
  const m = menuAt(btn, [h('div', {class: 'small', style: {padding: '6px 10px'}}, h('b', {}, `Campionati mostrati (${APP.mode})`), h('div', {class: 'muted xs'}, 'Vale per Dashboard, Calendario, Partite e Live.')), h('hr'),
    comps.length ? comps.map(c => h('label', {class: 'mi'}, h('span', {}, c.name, h('span', {class: 'muted xs'}, ` · ${c.country}`)),
      h('input', {type: 'checkbox', checked: !sel.size || sel.has(c.id), ctl: 'CTL-FILTER-COMP', 'data-comp': c.id, onchange: e => {
        const all = new Set(sel.size ? sel : comps.map(x => x.id));
        if (e.target.checked) all.add(c.id); else all.delete(c.id);
        if (!all.size) { e.target.checked = true; toast('Almeno un campionato deve restare selezionato', 'bad'); return; }
        sel.clear(); if (all.size < comps.length) all.forEach(x => sel.add(x));
        store.set(key, [...sel]); updateLiveCount(); render();
      }}))) : h('div', {class: 'muted small', style: {padding: '6px 10px'}}, 'Nessun campionato nei dati.'),
    h('hr'), h('button', {class: 'mi', type: 'button', ctl: 'CTL-FILTER-ALL', onclick: () => { store.set(key, []); closeMenus(); updateLiveCount(); render(); toast('Tutti i campionati'); }}, 'Mostra tutti')]);
  if (m) m.style.maxHeight = '70vh', m.style.overflow = 'auto';
}
function accountMenu(btn) {
  const st = settings();
  menuAt(btn, [h('div', {style: {padding: '6px 10px'}}, h('b', {}, 'Owner'), h('div', {class: 'muted xs'}, isReal() ? 'Sessione gestita dal server' : 'Modalità DEMO: nessuna sessione')), h('hr'),
    h('a', {class: 'mi', href: href('settings'), ctl: 'CTL-ACC-SETTINGS', onclick: closeMenus}, 'Impostazioni'),
    h('a', {class: 'mi', href: href('session'), ctl: 'CTL-ACC-SESSION', onclick: closeMenus}, 'Sessione e permessi'),
    h('a', {class: 'mi', href: href('coverage'), ctl: 'CTL-ACC-COVERAGE', onclick: closeMenus}, 'Roadmap e copertura'),
    h('hr'),
    h('label', {class: 'mi'}, 'Mostra le issue sulle pagine', h('button', {class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!st.show_issues), 'aria-label': 'Mostra le issue',
      ctl: 'CTL-ACC-ISSUES', onclick: e => {
        const on = e.currentTarget.getAttribute('aria-checked') !== 'true';
        e.currentTarget.setAttribute('aria-checked', String(on));
        store.set('settings', {...settings(), show_issues: on});
        document.body.classList.toggle('dev', on);
      }}))]);
}

// ---------------------------------------------------------------- global search (UI-02)
let searchItems = [];
let searchSel = -1;
function searchIndex() {
  const pages = [...VIEWS.values()].filter(v => !v.hiddenFromSearch).map(v => ({kind: 'Pagina', label: v.title, go: () => go(v.id)}));
  const comps = COMPS.map(c => ({kind: 'Campionato', label: `${c.name} · ${c.country}`, go: () => go('competitions', {id: c.id})}));
  const teams = COMPS.flatMap(c => c.teams.map(t => ({kind: 'Squadra', label: `${t} · ${c.name}`, go: () => go('analysis', {team: t})})));
  const matches = demoDay(today()).map(m => ({kind: 'Partita di oggi', label: `${m.home} – ${m.away} · ${m.ko}`, go: () => go('match', {id: m.id})}));
  return [...pages, ...(isReal() ? [] : [...comps, ...teams, ...matches])];
}
function globalSearch(input) {
  const q = input.value.trim().toLowerCase();
  $('#gresults')?.remove();
  input.parentElement.setAttribute('aria-expanded', 'false');
  if (!q) return;
  searchItems = searchIndex().filter(x => x.label.toLowerCase().includes(q)).slice(0, 12);
  searchSel = searchItems.length ? 0 : -1;
  const box = h('div', {class: 'gresults', id: 'gresults', role: 'listbox', 'aria-label': 'Risultati della ricerca'},
    searchItems.length ? searchItems.map((x, i) => h('button', {type: 'button', role: 'option', 'aria-selected': String(i === searchSel), ctl: 'CTL-GSEARCH-RESULT',
      onmousedown: e => e.preventDefault(), onclick: () => pick(i)}, h('span', {}, x.label), h('span', {class: 'k'}, x.kind)))
      : h('div', {class: 'muted small', style: {padding: '8px 10px'}}, isReal() ? 'Nessuna pagina trovata. In modalità REAL la ricerca di squadre è nella pagina Partite.' : 'Nessun risultato.'));
  input.parentElement.append(box);
  input.parentElement.setAttribute('aria-expanded', 'true');
}
function searchKeys(e, input) {
  const box = $('#gresults');
  if (!box) return;
  const opts = $$('[role="option"]', box);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    searchSel = (searchSel + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
    opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === searchSel)));
    opts[searchSel]?.scrollIntoView({block: 'nearest'});
  } else if (e.key === 'Enter' && searchSel >= 0) { e.preventDefault(); pick(searchSel); }
  else if (e.key === 'Escape') { box.remove(); input.blur(); }
}
function pick(i) {
  const x = searchItems[i];
  $('#gresults')?.remove();
  const input = $('#gsearch');
  input.value = ''; input.blur();
  x?.go();
}

// ---------------------------------------------------------------- AI Assistant (#44) — deterministic, no AI model
// Owner constraint: no paid AI API is authorised. The assistant answers a fixed set of questions from the data of the
// app (deterministic tools), always names its source and says it is not an AI model.
function openAssistant() {
  if ($('.drawer')) return closeDrawer();
  const log = h('div', {class: 'db', id: 'assistlog', 'aria-live': 'polite'});
  const input = h('input', {type: 'text', placeholder: 'Es. «partite live», «forma Inter», «kelly quota 2,2 prob 50»', 'aria-label': 'Domanda', ctl: 'CTL-ASSIST-INPUT', style: {flex: '1'}});
  const send = () => { const q = input.value.trim(); if (!q) return; input.value = ''; ask(q, log); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  const d = h('aside', {class: 'drawer', role: 'dialog', 'aria-label': 'Assistente'},
    h('div', {class: 'dh'}, icon('chat'), h('b', {}, 'Assistente'), chip('DEMO', 'Assistente deterministico: nessun modello AI'), h('span', {style: {flex: '1'}}),
      h('button', {class: 'iconbtn', type: 'button', 'aria-label': 'Chiudi', ctl: 'CTL-ASSIST-CLOSE', onclick: closeDrawer}, icon('x'))),
    log,
    h('div', {class: 'df'}, h('div', {class: 'row', style: {marginBottom: '8px'}},
      ['partite live', 'partite di oggi', 'stato del conto', 'strategie salvate', 'aiuto'].map(t => h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-ASSIST-SUGGEST', onclick: () => ask(t, log)}, t))),
    h('div', {class: 'row'}, input, h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-ASSIST-SEND', onclick: send}, 'Invia'))));
  document.body.append(d);
  log.append(h('div', {class: 'msg'}, 'Assistente deterministico di MatchPilot: risponde con i dati dell’app, senza modelli AI (nessuna API AI autorizzata, #44). Scrivi «aiuto» per l’elenco delle domande.'));
  input.focus();
}
function closeDrawer() { $('.drawer')?.remove(); }
function ask(q, log) {
  log.append(h('div', {class: 'msg me'}, q));
  const a = answer(q.toLowerCase());
  log.append(h('div', {class: 'msg', 'data-intent': a.intent}, a.text, a.link ? [' ', h('a', {href: a.link, ctl: 'CTL-ASSIST-LINK', onclick: closeDrawer}, a.linkText ?? 'Apri')] : null,
    h('span', {class: 'src'}, `fonte: ${a.source}`)));
  log.scrollTop = log.scrollHeight;
}
function answer(q) {
  const live = () => demoDay(today()).map(withState).filter(m => m.status === 'LIVE' || m.status === 'HT');
  const numIn = re => { const m = re.exec(q); return m ? Number(m[1].replace(',', '.')) : null; };
  if (/aiuto|help|cosa puoi/.test(q)) return {intent: 'help', source: 'assistente', text: 'Domande: «partite live», «partite di oggi», «forma <squadra>», «quote <squadra>», «stato del conto», «strategie salvate», «kelly quota X prob Y», «vai a <pagina>».'};
  if (isReal() && !/vai a|apri|kelly/.test(q)) return {intent: 'real', source: 'assistente', text: 'In modalità REAL l’assistente risponde solo a «vai a <pagina>» e «kelly»: le altre risposte usano i dati DEMO.'};
  if (/live|in diretta/.test(q)) { const l = live(); return {intent: 'live', source: 'demo.liveState', text: l.length ? `${l.length} partite in diretta: ${l.slice(0, 5).map(m => `${m.home} ${m.score.join('–')} ${m.away} (${m.status === 'HT' ? 'int.' : `${m.minute}'`})`).join('; ')}.` : 'Nessuna partita in diretta in questo momento.', link: href('live'), linkText: 'Apri Live'}; }
  if (/oggi|palinsesto/.test(q)) { const d = demoDay(today()); return {intent: 'today', source: 'demo.day', text: `${d.length} partite oggi in ${new Set(d.map(m => m.comp.id)).size} campionati.`, link: href('dashboard'), linkText: 'Apri la Dashboard'}; }
  if (/kelly/.test(q)) {
    const o = numIn(/quota\s*([\d.,]+)/), p = numIn(/prob\w*\s*([\d.,]+)/);
    if (!o || !p) return {intent: 'kelly', source: 'tools.kelly', text: 'Scrivi ad esempio «kelly quota 2,2 prob 50».'};
    try { const r = LOCAL_TOOLS.kelly({odds: o, probability: p, bankroll: settings().bankroll}); return {intent: 'kelly', source: 'tools.kelly (calcolo locale)', text: `Kelly pieno ${pct(r.full)}: su ${money(settings().bankroll)} la puntata è ${money(r.stake)}.`, link: href('tools', {tool: 'kelly', odds: o, probability: p, bankroll: settings().bankroll, run: 1}), linkText: 'Apri in Strumenti'}; }
    catch (e) { return {intent: 'kelly', source: 'tools.kelly', text: e.message}; }
  }
  if (/conto|portafoglio|bankroll/.test(q)) { const st = ledgerState(ledgerLoad()); return {intent: 'account', source: 'ledger (DEMO)', text: `Disponibile ${money(st.available)}, impegnato ${money(st.reserved)}, profitto realizzato ${money(st.realized)}, ${st.open} posizioni aperte.`, link: href('paper'), linkText: 'Apri il conto'}; }
  if (/strategi/.test(q)) { const l = lib.strategies(); return {intent: 'strategies', source: 'strategy lab (DEMO)', text: l.length ? `${l.length} strategie: ${l.map(x => `${x.name} v${x.version}`).join(', ')}.` : 'Nessuna strategia salvata.', link: href('strategies'), linkText: 'Apri Strategy Lab'}; }
  const team = COMPS.flatMap(c => c.teams).find(t => q.includes(t.toLowerCase()));
  if (team && /forma|statistic|come va/.test(q)) {
    const w = demoTeamAnalysis(team, today()).venues.both.windows['5'];
    return {intent: 'form', source: 'analysis.windowStats (DEMO)', text: `${team}, ultime ${w.n}: ${w.form.map(f => ({W: 'V', D: 'N', L: 'P'})[f.result]).join(' ')} · gol fatti ${nf(w.gfAvg)} e subiti ${nf(w.gaAvg)} a partita.`, link: href('analysis', {team}), linkText: 'Apri l’analisi'};
  }
  if (team && /quot/.test(q)) {
    const m = [0, 1, 2, 3, 4, 5, 6].flatMap(i => demoDay(addDays(today(), i))).find(x => x.home === team || x.away === team);
    return m ? {intent: 'odds', source: 'demo.day', text: `${m.home} – ${m.away} (${dayShort(m.date)} ${m.ko}): 1 ${odd(m.odds.h)} · X ${odd(m.odds.d)} · 2 ${odd(m.odds.a)}.`, link: href('match', {id: m.id}), linkText: 'Apri la partita'}
      : {intent: 'odds', source: 'demo.day', text: `Nessuna partita di ${team} nei prossimi 7 giorni.`};
  }
  const page = [...VIEWS.values()].find(v => q.includes(v.title.toLowerCase()));
  if (page) return {intent: 'nav', source: 'navigazione', text: `Pagina «${page.title}».`, link: href(page.id), linkText: 'Apri'};
  return {intent: 'unknown', source: 'assistente', text: 'Non so rispondere a questa domanda. Scrivi «aiuto» per vedere cosa posso fare.'};
}
