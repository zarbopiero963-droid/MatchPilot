
// ================================================================ shared components
const STATUS_TEXT = {NS: 'Da giocare', LIVE: 'Live', HT: 'Intervallo', FT: 'Finale', NR: 'Senza risultato'};
function statusChip(m) {
  if (m.status === 'LIVE') return h('span', {class: 'chip live pulse', title: 'In diretta'}, `${m.minute}'`);
  if (m.status === 'HT') return h('span', {class: 'chip warn'}, 'INT');
  if (m.status === 'FT') return h('span', {class: 'chip'}, 'FIN');
  if (m.status === 'NR') return h('span', {class: 'chip'}, 'S.R.');
  return null;
}
const scoreText = m => m.score ? `${m.score[0]}–${m.score[1]}` : 'vs';
function oddBox(label, v, title, {prev, ctl, onclick, win} = {}) {
  const dir = isNum(prev) && isNum(v) && v !== prev ? (v < prev ? 'dn' : 'up') : '';
  const attrs = {class: `odd ${dir} ${win ? 'win' : ''}`, title: title ?? label};
  const kids = [h('span', {}, label), h('b', {}, odd(v))];
  return onclick && isNum(v) ? h('button', {...attrs, type: 'button', ctl, onclick}, kids) : h('div', attrs, kids);
}
function formChips(form, label) {
  if (!form?.length) return h('span', {class: 'muted xs'}, ND);
  return h('span', {class: 'form', role: 'list', 'aria-label': label}, form.slice(0, 5).map(f => h('span', {class: `fm ${f.result}`, role: 'listitem', title: f.text}, {W: 'V', D: 'N', L: 'P'}[f.result])));
}
function matchRow(m, {showComp = true} = {}) {
  const prices = m.live ?? m.odds;
  return h('div', {class: 'mrow', 'data-match': m.id, 'data-status': m.status},
    h('div', {class: 'ko'}, m.ko, h('br'), statusChip(m)),
    h('div', {class: 'teams'}, h('a', {href: href('match', {id: m.id}), ctl: 'CTL-MATCH-OPEN', 'aria-label': `${m.home} – ${m.away}`}, h('span', {}, m.home), h('span', {}, m.away)),
      showComp ? h('div', {class: 'comp'}, `${m.comp.name} · ${m.comp.country}`, m.fresh && ['DELAYED', 'STALE', 'OFFLINE'].includes(m.fresh.state) ? [' · ', h('span', {class: `fresh ${m.fresh.state}`}, FRESH_TEXT[m.fresh.state])] : null) : null),
    h('div', {class: 'sc'}, settings().hide_scores && m.status === 'FT' ? '•–•' : scoreText(m)),
    h('div', {class: 'odds'}, oddBox('1', prices.h), oddBox('X', prices.d), oddBox('2', prices.a), oddBox('O 2,5', prices.o25, 'Over 2,5'), oddBox('Gol', prices.btts, 'Entrambe segnano')));
}
const FRESH_TEXT = {FRESH: 'Aggiornato', DELAYED: 'In ritardo', STALE: 'Fermo', OFFLINE: 'Disconnesso', FINAL: 'Finale', PREMATCH: 'Pre-partita'};
function seg(ctl, options, current, onpick, label) {
  return h('div', {class: 'seg', role: 'group', 'aria-label': label}, options.map(([v, text]) => h('button', {type: 'button', ctl, 'data-value': v, 'aria-pressed': String(v === current), onclick: () => onpick(v)}, text)));
}
function tabsBar(ctl, options, current, onpick, label) {
  const bar = h('div', {class: 'tabs', role: 'tablist', 'aria-label': label}, options.map(([v, text]) => h('button', {type: 'button', role: 'tab', ctl, 'data-value': v,
    'aria-selected': String(v === current), tabindex: v === current ? '0' : '-1', onclick: () => onpick(v)}, text)));
  bar.addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const tabs = $$('[role="tab"]', bar), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
    n.focus(); n.click();
  });
  return bar;
}
const kpi = (label, value, note, attrs = {}) => h('div', {class: 'kpi', ...attrs}, h('span', {}, label), h('b', {}, value), note ? h('small', {}, note) : null);
function dataStrip(state, extra) {
  const text = state === 'REAL' ? 'Dati dall’API v1 di MatchPilot.' : state === 'DEMO' ? 'Dati dimostrativi generati nel browser (deterministici): non sono partite reali.' : 'Non disponibile in questo ambiente.';
  return strip(state, extra ? `${text} ${extra}` : text);
}
function updateParams(name, params, patch) { go(name, {...Object.fromEntries(params), ...patch}); }

// ================================================================ Dashboard (UI-03)
view({id: 'dashboard', title: 'Dashboard', phase: 'UI-03', issues: ['#3', '#97'], loadingText: 'del palinsesto', async render(params, ctx) {
  const date = validDay(params.get('date')) ? params.get('date') : today();
  const status = params.get('status') || 'all', sort = params.get('sort') || 'time', q = (params.get('q') || '').trim().toLowerCase();
  const all = (await DATA.day(date)).filter(passesFilter);
  if (!ctx.alive()) return [];
  const rows = all.filter(m => status === 'all' || (status === 'live' ? ['LIVE', 'HT'].includes(m.status) : status === 'ns' ? m.status === 'NS' : ['FT', 'NR'].includes(m.status)))
    .filter(m => !q || `${m.home} ${m.away} ${m.comp.name}`.toLowerCase().includes(q))
    .sort((a, b) => sort === 'comp' ? a.comp.name.localeCompare(b.comp.name) || a.ko.localeCompare(b.ko) : a.ko.localeCompare(b.ko) || a.comp.name.localeCompare(b.comp.name));
  const set = patch => updateParams('dashboard', params, patch);
  const live = all.filter(m => ['LIVE', 'HT'].includes(m.status));
  const ledger = isReal() ? null : ledgerState(ledgerLoad());
  const strategies = isReal() ? [] : lib.strategies().filter(d => d.active && d.phase !== 'LIVE');
  const signals = strategies.flatMap(d => all.filter(m => m.status === 'NS').map(m => ({d, m, r: evaluateDef(d, m)})).filter(x => x.r.trade));
  const strip7 = h('div', {class: 'dates', role: 'group', 'aria-label': 'Giorni vicini'}, [-3, -2, -1, 0, 1, 2, 3].map(k => {
    const d = addDays(date, k);
    const n = isReal() ? null : demoDay(d).filter(passesFilter).length;
    return h('button', {type: 'button', ctl: 'CTL-DASH-DAY', 'data-date': d, 'aria-current': k === 0 ? 'date' : null, 'aria-label': dayLong(d), onclick: () => set({date: d})},
      h('small', {}, d === today() ? 'Oggi' : WDAY.format(parseDay(d))), h('b', {}, String(parseDay(d).getDate())), n !== null ? h('span', {class: 'n'}, `${n}`) : null);
  }));
  const qInput = h('input', {type: 'search', value: params.get('q') || '', placeholder: 'Filtra squadra o campionato', 'aria-label': 'Filtra le partite', ctl: 'CTL-DASH-Q'});
  qInput.addEventListener('change', () => set({q: qInput.value.trim()}));
  const dateInput = h('input', {type: 'date', value: date, 'aria-label': 'Scegli il giorno', ctl: 'CTL-DASH-DATE', onchange: e => { if (validDay(e.target.value)) set({date: e.target.value}); }});
  if (!isReal() && !ctx.refresh) every(5000, () => { if (live.length || all.some(m => m.status === 'NS')) refreshInPlace(); });
  const list = rows.length ? (sort === 'comp'
    ? [...new Set(rows.map(m => m.comp.name))].map(c => [h('h3', {class: 'muted', style: {padding: '0 12px'}}, c), rows.filter(m => m.comp.name === c).map(m => matchRow(m, {showComp: false}))])
    : rows.map(m => matchRow(m)))
    : emptyState(all.length ? 'Nessuna partita corrisponde ai filtri.' : `Nessuna partita ${dayLong(date)}.`,
      h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-DASH-CLEAR', onclick: () => go('dashboard', {date})}, 'Azzera i filtri'));
  return [
    head(date === today() ? 'Oggi' : 'Palinsesto', {sub: dayLong(date), chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-03', '#3']}),
    dataStrip(isReal() ? 'REAL' : 'DEMO', compFilter().length ? `Filtro campionati attivo (${compFilter().length}).` : ''),
    h('div', {class: 'grid g4', style: {marginBottom: '14px'}},
      kpi('Partite', nint(all.length), `${new Set(all.map(m => m.comp.id)).size} campionati`, {'data-kpi': 'matches'}),
      kpi('In diretta', isReal() ? ND : nint(live.length), isReal() ? 'live non disponibile (TotalCorner sospeso)' : null, {'data-kpi': 'live'}),
      kpi('Finite', nint(all.filter(m => m.status === 'FT').length), null, {'data-kpi': 'finished'}),
      isReal() ? kpi('Conto simulato', ND, 'vedi Paper trading') : kpi('Conto simulato', money(ledger.available), `P/L realizzato ${signed(ledger.realized)}`, {'data-kpi': 'account'})),
    h('div', {class: 'card', style: {marginBottom: '14px'}},
      h('div', {class: 'row', style: {justifyContent: 'space-between', marginBottom: '10px'}},
        h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-DASH-PREV', onclick: () => set({date: addDays(date, -1)})}, '← Giorno prima'),
          dateInput, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-DASH-NEXT', onclick: () => set({date: addDays(date, 1)})}, 'Giorno dopo →'),
          h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-DASH-TODAY', disabled: date === today(), onclick: () => set({date: today()})}, 'Oggi')),
        h('a', {class: 'btn sm ghost', href: href('calendar', {month: date.slice(0, 7)}), ctl: 'CTL-DASH-CAL'}, 'Calendario')),
      strip7),
    h('div', {class: 'grid', style: {gridTemplateColumns: 'minmax(0,1fr)', gap: '14px'}},
      h('section', {class: 'card', style: {padding: '0'}, 'data-testid': 'dash-list'},
        h('div', {class: 'row', style: {padding: '12px', borderBottom: '1px solid var(--line)', justifyContent: 'space-between'}},
          seg('CTL-DASH-STATUS', [['all', 'Tutte'], ['ns', 'Da giocare'], ['live', 'Live'], ['ft', 'Finite']], status, v => set({status: v}), 'Stato'),
          h('div', {class: 'row'}, seg('CTL-DASH-SORT', [['time', 'Orario'], ['comp', 'Campionato']], sort, v => set({sort: v}), 'Ordine'), qInput)),
        h('div', {class: 'mlist', 'data-count': rows.length}, list)),
      h('div', {class: 'grid g2'},
        h('section', {class: 'card', 'data-testid': 'dash-live'}, h('h2', {}, 'In diretta ora', h('a', {class: 'right small', href: href('live'), ctl: 'CTL-DASH-LIVE'}, 'Live Board →')),
          isReal() ? emptyState('Dati live non disponibili: la raccolta TotalCorner è sospesa.') : live.length
            ? h('div', {class: 'stack', style: {gap: '6px'}}, live.slice(0, 6).map(m => h('div', {class: 'row', style: {justifyContent: 'space-between'}},
              h('a', {href: href('match', {id: m.id}), ctl: 'CTL-MATCH-OPEN'}, `${m.home} – ${m.away}`), h('span', {class: 'mono'}, scoreText(m), ' ', statusChip(m)))))
            : emptyState('Nessuna partita in diretta in questo momento.')),
        h('section', {class: 'card', 'data-testid': 'dash-signals'}, h('h2', {}, 'Segnali delle strategie attive', h('a', {class: 'right small', href: href('strategies'), ctl: 'CTL-DASH-STRAT'}, 'Strategy Lab →')),
          isReal() ? emptyState('Segnali non disponibili in modalità REAL: l’attivazione è solo simulata (DEMO).')
            : !strategies.length ? emptyState('Nessuna strategia pre-partita attiva in simulazione.')
              : signals.length ? h('div', {class: 'stack', style: {gap: '6px'}}, signals.slice(0, 8).map(({d, m, r}) => h('div', {class: 'row', style: {justifyContent: 'space-between'}},
                h('a', {href: href('match', {id: m.id}), ctl: 'CTL-DASH-SIGNAL'}, `${m.ko} ${m.home} – ${m.away}`),
                h('span', {class: `chip ${d.side === 'BACK' ? 'back' : 'lay'}`}, `${d.name}: ${SIDE_TEXT[d.side]} ${selectionText(d.market, r.sel)} @ ${odd(r.price)}`))))
                : emptyState('Nessuna partita del giorno soddisfa le strategie attive.')))),
  ];
}});
// Re-render the current view in place (live data), without the loading state and only if nothing else happened.
let refreshing = false;
async function refreshInPlace() {
  if (refreshing || $('#overlay') || document.activeElement?.matches('input, select, textarea')) return;
  const {name, params} = parseHash();
  const v = VIEWS.get(name);
  if (!v) return;
  refreshing = true;
  const mine = generation;
  try {
    const nodes = await v.render(params, {mine, alive: () => mine === generation, refresh: true});
    if (mine === generation) { const y = window.scrollY; $('#view').replaceChildren(...[nodes].flat(Infinity).filter(Boolean)); window.scrollTo(0, y); }
  } catch { /* the next tick tries again */ } finally { refreshing = false; }
}

// ================================================================ Calendario (UI-03)
view({id: 'calendar', title: 'Calendario', phase: 'UI-03', issues: ['#3'], async render(params) {
  const month = /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : today().slice(0, 7);
  const first = parseDay(`${month}-01`);
  const start = addDays(`${month}-01`, -((first.getDay() + 6) % 7));
  const days = Array.from({length: 42}, (_, i) => addDays(start, i));
  const shift = k => { const d = new Date(first); d.setMonth(d.getMonth() + k); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const counts = d => isReal() ? null : demoDay(d).filter(passesFilter);
  return [
    head('Calendario', {sub: MONTH.format(first), chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-03']}),
    isReal() ? dataStrip('REAL', 'Il numero di partite per giorno si vede aprendo il giorno.') : dataStrip('DEMO'),
    h('div', {class: 'row', style: {marginBottom: '12px'}},
      h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-CAL-PREV', onclick: () => go('calendar', {month: shift(-1)})}, '← Mese prima'),
      h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-CAL-TODAY', onclick: () => go('calendar', {})}, 'Questo mese'),
      h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-CAL-NEXT', onclick: () => go('calendar', {month: shift(1)})}, 'Mese dopo →')),
    h('div', {class: 'card'}, h('div', {class: 'cal', 'data-testid': 'calendar'},
      ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'].map(d => h('div', {class: 'dow'}, d)),
      days.map(d => {
        const ms = counts(d);
        const live = ms?.map(withState).filter(m => ['LIVE', 'HT'].includes(m.status)).length ?? 0;
        return h('button', {type: 'button', ctl: 'CTL-CAL-DAY', 'data-date': d, class: d.slice(0, 7) !== month ? 'out' : '', 'aria-current': d === today() ? 'date' : null,
          'aria-label': `${dayLong(d)}${ms ? `, ${ms.length} partite` : ''}`, onclick: () => go('dashboard', {date: d})},
        h('b', {}, String(parseDay(d).getDate())), ms ? h('small', {}, ms.length ? `${ms.length} partite` : '—') : null,
        ms?.length ? h('span', {class: 'dots'}, Array.from({length: Math.min(ms.length, 8)}, (_, i) => h('i', {class: i < live ? 'live' : ''}))) : null);
      }))),
  ];
}});

// ================================================================ Partite: advanced search (UI-03, #30 filters)
const MATCH_FIELDS = ['from', 'to', 'comp', 'team', 'status', 'fav_min', 'fav_max', 'goals_min', 'goals_max', 'xg_min', 'size'];
view({id: 'matches', title: 'Partite', phase: 'UI-03', issues: ['#3', '#30'], loadingText: 'delle partite', async render(params) {
  const v = k => params.get(k) ?? '';
  const comps = await DATA.competitions();
  const from = validDay(v('from')) ? v('from') : addDays(today(), -7), to = validDay(v('to')) ? v('to') : addDays(today(), 7);
  const errors = [];
  if (from > to) errors.push('La data iniziale deve precedere quella finale.');
  if ((parseDay(to) - parseDay(from)) / 86400000 > 62) errors.push('Il periodo massimo è di 62 giorni.');
  for (const [k, lab] of [['fav_min', 'Quota favorito da'], ['fav_max', 'Quota favorito a']]) if (v(k) && !(Number(v(k)) > 1)) errors.push(`${lab}: deve essere maggiore di 1.`);
  for (const [k, lab] of [['xg_min', 'xG totali da'], ['goals_min', 'Gol finali da'], ['goals_max', 'Gol finali a']]) if (v(k) && !(Number(v(k)) >= 0)) errors.push(`${lab}: valore non valido.`);
  if (v('fav_min') && v('fav_max') && Number(v('fav_min')) > Number(v('fav_max'))) errors.push('Quota favorito: il minimo supera il massimo.');
  const sortKey = v('sort') || 'date', dir = v('dir') === 'desc' ? -1 : 1, page = Math.max(1, Number(v('page')) || 1), size = [25, 50, 100].includes(Number(v('size'))) ? Number(v('size')) : 25;
  const form = h('form', {class: 'card', 'data-testid': 'matches-form', novalidate: true, onsubmit: e => {
    e.preventDefault();
    const out = {}; for (const [k, val] of new FormData(e.target).entries()) if (String(val).trim()) out[k] = String(val).trim();
    go('matches', {...out, run: 1});
  }},
  h('div', {class: 'fields'},
    h('label', {class: 'f'}, 'Dal', h('input', {type: 'date', name: 'from', value: from, ctl: 'CTL-MATCHES-FROM'})),
    h('label', {class: 'f'}, 'Al', h('input', {type: 'date', name: 'to', value: to, ctl: 'CTL-MATCHES-TO'})),
    h('label', {class: 'f'}, 'Campionato', h('select', {name: 'comp', ctl: 'CTL-MATCHES-COMP'}, h('option', {value: ''}, 'Tutti'), comps.map(c => h('option', {value: c.id, selected: v('comp') === c.id}, `${c.name} · ${c.country}`)))),
    h('label', {class: 'f'}, 'Squadra', h('input', {type: 'search', name: 'team', value: v('team'), placeholder: 'es. Inter', ctl: 'CTL-MATCHES-TEAM'})),
    h('label', {class: 'f'}, 'Stato', h('select', {name: 'status', ctl: 'CTL-MATCHES-STATUS'}, [['', 'Tutti'], ['NS', 'Da giocare'], ['LIVE', 'Live'], ['FT', 'Finite']].map(([x, t]) => h('option', {value: x, selected: v('status') === x}, t)))),
    h('label', {class: 'f'}, 'Quota favorito da', h('input', {type: 'number', step: '0.01', min: '1.01', name: 'fav_min', value: v('fav_min'), ctl: 'CTL-MATCHES-FAVMIN'})),
    h('label', {class: 'f'}, 'Quota favorito a', h('input', {type: 'number', step: '0.01', min: '1.01', name: 'fav_max', value: v('fav_max'), ctl: 'CTL-MATCHES-FAVMAX'})),
    h('label', {class: 'f'}, 'Gol finali da', h('input', {type: 'number', step: '1', min: '0', name: 'goals_min', value: v('goals_min'), ctl: 'CTL-MATCHES-GMIN'})),
    h('label', {class: 'f'}, 'Gol finali a', h('input', {type: 'number', step: '1', min: '0', name: 'goals_max', value: v('goals_max'), ctl: 'CTL-MATCHES-GMAX'})),
    h('label', {class: 'f'}, 'xG totali da', h('input', {type: 'number', step: '0.1', min: '0', name: 'xg_min', value: v('xg_min'), ctl: 'CTL-MATCHES-XG'})),
    h('label', {class: 'f'}, 'Righe per pagina', h('select', {name: 'size', ctl: 'CTL-MATCHES-SIZE'}, [25, 50, 100].map(n => h('option', {value: n, selected: size === n}, String(n)))))),
  h('div', {class: 'row', style: {marginTop: '12px'}}, h('button', {class: 'btn pri', type: 'submit', ctl: 'CTL-MATCHES-SUBMIT'}, 'Cerca'),
    h('button', {class: 'btn', type: 'button', ctl: 'CTL-MATCHES-RESET', onclick: () => go('matches', {})}, 'Azzera')));
  const headNodes = [head('Partite', {sub: 'Ricerca avanzata con filtri combinati', chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-03', '#30']}), dataStrip(isReal() ? 'REAL' : 'DEMO'), form];
  if (errors.length) return [...headNodes, h('div', {class: 'state error', role: 'alert', 'data-testid': 'matches-invalid'}, errors.join(' '))];
  let rows = [], truncated = false;
  if (isReal()) {
    const q = {from, before: addDays(to, 1), competition: v('comp'), fav_min: v('fav_min'), fav_max: v('fav_max'), min_goals: v('goals_min'), max_goals: v('goals_max'),
      min_xg_total: v('xg_min'), result: {FT: 'FINAL', NS: 'NOT_STARTED'}[v('status')], limit: 500};
    if (v('team')) { const t = (await apiGet(`/api/v1/fpt/teams${qs({q: v('team')})}`)).data?.rows ?? []; if (!t.length) return [...headNodes, emptyState(`Nessuna squadra «${v('team')}».`)]; q.team = t[0].internal_team_id; }
    // Keyset pagination (MP-WEB-007): follow next_cursor up to a bound and say so when the result is cut.
    const MAX_PAGES = 10;
    for (let n = 0, cursor; n < MAX_PAGES; n++) {
      const d = (await apiGet(`/api/v1/fpt/search${qs({...q, cursor})}`)).data;
      rows.push(...(d?.rows ?? []).map(fromRealRow));
      cursor = d?.next_cursor;
      if (!cursor) break;
      if (n === MAX_PAGES - 1) truncated = true;
    }
  } else {
    for (let d = from; d <= to; d = addDays(d, 1)) rows.push(...demoDay(d).map(withState));
  }
  const t = v('team').toLowerCase();
  rows = rows.filter(passesFilter).filter(m => (!v('comp') || m.comp.id === v('comp')) && (!t || `${m.home} ${m.away}`.toLowerCase().includes(t))
    && (!v('status') || (v('status') === 'LIVE' ? ['LIVE', 'HT'].includes(m.status) : m.status === v('status')))
    && (!v('fav_min') || (m.favOdds ?? Infinity) >= Number(v('fav_min'))) && (!v('fav_max') || (m.favOdds ?? 0) <= Number(v('fav_max')))
    && (!v('goals_min') || (m.score && m.score[0] + m.score[1] >= Number(v('goals_min')))) && (!v('goals_max') || (m.score && m.score[0] + m.score[1] <= Number(v('goals_max'))))
    && (!v('xg_min') || (isNum(m.xg[0]) && m.xg[0] + m.xg[1] >= Number(v('xg_min')))));
  const keyOf = {date: m => `${m.date} ${m.ko}`, comp: m => m.comp.name, home: m => m.home, fav: m => m.favOdds ?? 999, xg: m => (m.xg[0] ?? -1) + (m.xg[1] ?? 0), goals: m => m.score ? m.score[0] + m.score[1] : -1};
  rows.sort((a, b) => { const x = keyOf[sortKey]?.(a), y = keyOf[sortKey]?.(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  const pages = Math.max(1, Math.ceil(rows.length / size)), pg = Math.min(page, pages);
  const shown = rows.slice((pg - 1) * size, pg * size);
  const set = patch => updateParams('matches', params, patch);
  const sortTh = (k, text, cls = '') => h('th', {class: `sortable ${cls}`, 'aria-sort': sortKey === k ? (dir === 1 ? 'ascending' : 'descending') : 'none'},
    h('button', {type: 'button', ctl: 'CTL-MATCHES-SORT', 'data-key': k, onclick: () => set({sort: k, dir: sortKey === k && dir === 1 ? 'desc' : 'asc', page: 1})}, text, sortKey === k ? (dir === 1 ? ' ▲' : ' ▼') : ''));
  const cols = ['Data', 'Partita', 'Campionato', 'Ris.', '1', 'X', '2', 'Fav.', xgLab(isReal() ? 'REAL' : 'DEMO')];
  const csv = () => {
    const lines = [['data', 'ora', 'campionato', 'casa', 'ospite', 'stato', 'gol_casa', 'gol_ospite', 'q1', 'qx', 'q2', ...(isReal() ? ['xg_casa', 'xg_ospite'] : ['xg_casa_demo', 'xg_ospite_demo'])].join(';'),
      ...rows.map(m => [m.date, m.ko, m.comp.name, m.home, m.away, m.status, m.score?.[0] ?? '', m.score?.[1] ?? '', m.odds.h ?? '', m.odds.d ?? '', m.odds.a ?? '', m.xg[0] ?? '', m.xg[1] ?? ''].join(';'))];
    download(`matchpilot-partite-${from}-${to}.csv`, lines.join('\n'), 'text/csv');
    toast(`Esportate ${rows.length} partite`, 'ok');
  };
  return [...headNodes,
    truncated ? h('div', {class: 'state partial', role: 'status', 'data-testid': 'matches-truncated'}, `Risultato troncato alle prime ${nint(rows.length)} partite lette dal server: restringi il periodo o i filtri.`) : null,
    h('section', {class: 'card', 'data-testid': 'matches-results', 'data-count': rows.length},
      h('h2', {}, `${nint(rows.length)} partite`, h('span', {class: 'right row'}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MATCHES-CSV', disabled: !rows.length, onclick: csv}, 'Esporta CSV'))),
      rows.length ? [h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, sortTh('date', 'Data'), sortTh('home', 'Partita'), sortTh('comp', 'Campionato'),
        sortTh('goals', 'Ris.', 'n'), h('th', {class: 'n'}, '1'), h('th', {class: 'n'}, 'X'), h('th', {class: 'n'}, '2'), sortTh('fav', 'Fav.', 'n'), sortTh('xg', xgLab(isReal() ? 'REAL' : 'DEMO'), 'n'))),
      h('tbody', {}, shown.map(m => h('tr', {'data-match': m.id}, [
        h('td', {}, dayShort(m.date), ' ', h('span', {class: 'muted'}, m.ko)), h('td', {}, h('a', {href: href('match', {id: m.id}), ctl: 'CTL-MATCH-OPEN'}, `${m.home} – ${m.away}`)),
        h('td', {}, m.comp.name), h('td', {class: 'n'}, m.score ? scoreText(m) : STATUS_TEXT[m.status]), h('td', {class: 'n'}, odd(m.odds.h)), h('td', {class: 'n'}, odd(m.odds.d)), h('td', {class: 'n'}, odd(m.odds.a)),
        h('td', {class: 'n'}, odd(m.favOdds)), h('td', {class: 'n'}, isNum(m.xg[0]) ? `${nf(m.xg[0])} – ${nf(m.xg[1])}` : ND)].map((td, i) => (td.setAttribute('data-label', cols[i]), td))))))),
      h('div', {class: 'row', style: {justifyContent: 'space-between', marginTop: '10px'}},
        h('span', {class: 'muted small', 'data-testid': 'matches-page'}, `Pagina ${pg} di ${pages}`),
        h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MATCHES-PREV', disabled: pg <= 1, onclick: () => set({page: pg - 1})}, '← Precedente'),
          h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MATCHES-NEXT', disabled: pg >= pages, onclick: () => set({page: pg + 1})}, 'Successiva →')))]
        : emptyState('Nessuna partita corrisponde ai filtri.'))];
}});
function download(name, text, type) {
  if (APP.testing) { APP.downloads.push({name, size: text.length, type}); return; }
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = h('a', {href: url, download: name, 'data-noaudit': ''});
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ================================================================ Competizioni (UI-03)
function standings(comp, upTo) {
  const t = new Map(comp.teams.map(x => [x, {team: x, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: []}]));
  const start = seasonStart(upTo);
  for (let d = start; d <= upTo; d = addDays(d, 1)) for (const m of demoDay(d)) {
    if (m.comp.id !== comp.id) continue;
    const st = liveState(m); if (st.status !== 'FT') continue;
    const [a, b] = m.final, H = t.get(m.home), A = t.get(m.away);
    H.p++; A.p++; H.gf += a; H.ga += b; A.gf += b; A.ga += a;
    if (a > b) { H.w++; A.l++; H.pts += 3; H.form.unshift({result: 'W', text: `${m.home} ${a}–${b} ${m.away}`}); A.form.unshift({result: 'L', text: `${m.home} ${a}–${b} ${m.away}`}); }
    else if (a < b) { A.w++; H.l++; A.pts += 3; H.form.unshift({result: 'L', text: `${m.home} ${a}–${b} ${m.away}`}); A.form.unshift({result: 'W', text: `${m.home} ${a}–${b} ${m.away}`}); }
    else { H.d++; A.d++; H.pts++; A.pts++; H.form.unshift({result: 'D', text: `${m.home} ${a}–${b} ${m.away}`}); A.form.unshift({result: 'D', text: `${m.home} ${a}–${b} ${m.away}`}); }
  }
  return [...t.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || x.team.localeCompare(y.team));
}
view({id: 'competitions', title: 'Competizioni', phase: 'UI-03', issues: ['#3', '#12'], async render(params) {
  const comps = await DATA.competitions();
  const id = params.get('id');
  if (!id) {
    return [head('Competizioni', {chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-03']}), dataStrip(isReal() ? 'REAL' : 'DEMO'),
      comps.length ? h('div', {class: 'grid g3', 'data-testid': 'comp-list'}, comps.map(c => h('a', {class: 'card', href: href('competitions', {id: c.id}), ctl: 'CTL-COMP-OPEN', style: {textDecoration: 'none', color: 'inherit'}},
        h('h2', {}, c.name), h('div', {class: 'muted small'}, c.country), !isReal() ? h('div', {class: 'small', style: {marginTop: '8px'}}, `Capolista: ${standings(COMP_BY_ID.get(c.id), addDays(today(), -1))[0].team}`) : null)))
        : emptyState('Nessuna competizione nei dati.')];
  }
  const comp = comps.find(c => c.id === id);
  if (!comp) return [head('Competizione non trovata'), emptyState('Questa competizione non esiste.', h('a', {href: href('competitions'), ctl: 'CTL-COMP-BACK'}, 'Tutte le competizioni'))];
  const back = h('a', {href: href('competitions'), ctl: 'CTL-COMP-BACK'}, '← Tutte le competizioni');
  if (isReal()) return [head(comp.name, {sub: comp.country, crumbs: back, chips: [chip('REAL')]}), strip('UNAVAILABLE', 'Classifica non disponibile: l’API v1 non pubblica le classifiche.'),
    h('a', {class: 'btn', href: href('matches', {comp: comp.id, run: 1}), ctl: 'CTL-COMP-MATCHES'}, 'Partite di questa competizione')];
  const c = COMP_BY_ID.get(id);
  const table = standings(c, addDays(today(), -1));
  const recent = [], next = [];
  for (let i = 0; i < 21 && (recent.length < 8 || next.length < 8); i++) {
    for (const m of demoDay(addDays(today(), -i)).map(withState)) if (m.comp.id === id && m.status === 'FT' && recent.length < 8) recent.push(m);
    for (const m of demoDay(addDays(today(), i)).map(withState)) if (m.comp.id === id && m.status !== 'FT' && next.length < 8) next.push(m);
  }
  const all = table.reduce((x, r) => x + r.gf, 0), games = table.reduce((x, r) => x + r.p, 0) / 2;
  const cols = ['#', 'Squadra', 'G', 'V', 'N', 'P', 'Gol', 'DR', 'Punti', 'Forma'];
  return [head(c.name, {sub: `${c.country} · stagione dal ${dayShort(seasonStart(today()))}`, crumbs: back, chips: [chip('DEMO')], issues: ['UI-03']}), dataStrip('DEMO'),
    h('div', {class: 'grid g4', style: {marginBottom: '14px'}}, kpi('Partite giocate', nint(games)), kpi('Gol a partita', games ? nf(all / games) : ND), kpi('Squadre', nint(c.teams.length)),
      h('a', {class: 'kpi', href: href('matches', {comp: id, from: seasonStart(today()), to: today(), run: 1}), ctl: 'CTL-COMP-MATCHES', style: {textDecoration: 'none', color: 'inherit'}}, h('span', {}, 'Tutte le partite'), h('b', {}, '→'))),
    h('div', {class: 'grid g2'},
      h('section', {class: 'card', 'data-testid': 'standings'}, h('h2', {}, 'Classifica'), h('div', {class: 'tablewrap'}, h('table', {class: 'cards'},
        h('thead', {}, h('tr', {}, cols.map((x, i) => h('th', {class: i > 1 && i < 9 ? 'n' : ''}, x)))),
        h('tbody', {}, table.map((r, i) => h('tr', {}, [h('td', {}, String(i + 1)), h('td', {}, h('a', {href: href('analysis', {team: r.team}), ctl: 'CTL-COMP-TEAM'}, r.team)),
          h('td', {class: 'n'}, r.p), h('td', {class: 'n'}, r.w), h('td', {class: 'n'}, r.d), h('td', {class: 'n'}, r.l), h('td', {class: 'n'}, `${r.gf}:${r.ga}`),
          h('td', {class: 'n'}, String(r.gf - r.ga)), h('td', {class: 'n'}, h('b', {}, r.pts)), h('td', {}, formChips(r.form, `Forma di ${r.team}`))].map((td, k) => (td.setAttribute('data-label', cols[k]), td)))))))),
      h('div', {class: 'stack'},
        h('section', {class: 'card'}, h('h2', {}, 'Prossime partite'), next.length ? h('div', {class: 'mlist'}, next.map(m => matchRow(m, {showComp: false}))) : emptyState('Nessuna partita in programma.')),
        h('section', {class: 'card'}, h('h2', {}, 'Ultimi risultati'), recent.length ? h('div', {class: 'mlist'}, recent.map(m => matchRow(m, {showComp: false}))) : emptyState('Nessun risultato.'))))];
}});

// ================================================================ Match Center (UI-04, #25 #28 #30 #102)
const MC_TABS = [['overview', 'Panoramica'], ['stats', 'Statistiche'], ['markets', 'Quote e mercati'], ['compare', 'Confronto'], ['h2h', 'Precedenti'], ['copilot', 'Copilot'], ['info', 'Info']];
const VENUE_OPTS = [['split', 'Casa / Trasferta'], ['both', 'Tutte'], ['home', 'Solo casa'], ['away', 'Solo trasferta']];
const WIN_OPTS = [['5', 'Ultime 5'], ['10', 'Ultime 10'], ['20', 'Ultime 20'], ['season', 'Stagione']];
view({id: 'match', title: 'Match Center', navAs: 'dashboard', hiddenFromSearch: true, phase: 'UI-04', issues: ['#25', '#30'], loadingText: 'della partita', async render(params, ctx) {
  const id = params.get('id') || '';
  if (!id) return [head('Match Center'), emptyState('Apri una partita dalla Dashboard o da Partite.', h('a', {href: href('dashboard'), ctl: 'CTL-NOTFOUND-HOME'}, 'Vai alla Dashboard'))];
  const a = await DATA.analysis(id);
  if (!ctx.alive()) return [];
  if (!a) return [head('Partita non trovata'), emptyState('Questa partita non è nei dati.', h('a', {href: href('dashboard'), ctl: 'CTL-NOTFOUND-HOME'}, 'Torna alla Dashboard'))];
  const m = a.match;
  const tab = MC_TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'overview';
  const set = patch => updateParams('match', params, patch);
  if (!isReal() && !ctx.refresh && ['LIVE', 'HT', 'NS'].includes(m.status)) every(5000, refreshInPlace);
  const prices = m.live ?? m.odds;
  const spoil = settings().hide_scores && m.status === 'FT' && params.get('reveal') !== '1';
  const recent = side => a.teams[side]?.venues?.both?.windows?.['5']?.form;
  const hero = h('section', {class: `hero ${spoil ? 'spoiler' : ''}`, 'data-testid': 'mc-hero', 'data-status': m.status},
    h('div', {class: 'meta'}, h('span', {}, `${m.comp.name} · ${m.comp.country}`), h('span', {}, dayLong(m.date)), m.fresh && m.src === 'DEMO' ? h('span', {class: `fresh ${m.fresh.state}`}, FRESH_TEXT[m.fresh.state], m.fresh.lag ? ` · ${m.fresh.lag} s` : '') : null, chip(m.src)),
    h('h1', {class: 'board', 'aria-label': `${m.home} – ${m.away}`},
      h('span', {class: 'tm'}, h('b', {}, m.home), formChips(recent('home'), `Forma di ${m.home}`)),
      h('span', {class: 'mid'}, h('span', {class: 'big', 'data-testid': 'mc-score'}, m.status === 'NS' ? m.ko : scoreText(m)), h('br'),
        m.status === 'NS' ? h('span', {class: 'muted small'}, 'Calcio d’inizio') : statusChip(m) ?? h('span', {class: 'muted small'}, STATUS_TEXT[m.status])),
      h('span', {class: 'tm r'}, h('b', {}, m.away), formChips(recent('away'), `Forma di ${m.away}`))),
    h('div', {class: 'odds'}, oddBox('1', prices.h), oddBox('X', prices.d), oddBox('2', prices.a), oddBox('Over 2,5', prices.o25), oddBox('Under 2,5', prices.u25), oddBox('Gol', prices.btts)),
    h('div', {class: 'row', style: {marginTop: '10px', justifyContent: 'space-between'}},
      h('span', {class: 'small muted'}, 'Favorito ', h('b', {style: {color: 'var(--text)'}}, m.fav ? `${m.fav === 'HOME' ? m.home : m.away} ${odd(m.favOdds)}` : ND), ` · ${xgLab(m.src)} `, h('b', {style: {color: 'var(--text)'}}, isNum(m.xg[0]) ? `${nf(m.xg[0])} – ${nf(m.xg[1])}` : ND)),
      h('div', {class: 'row'},
        spoil ? h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MC-REVEAL', onclick: () => set({reveal: 1})}, 'Mostra il risultato') : null,
        h('a', {class: 'btn sm', href: href('analysis', {match: m.id}), ctl: 'CTL-MC-ANALYSIS'}, 'Analisi completa'),
        m.status === 'FT' && m.src === 'DEMO' ? h('a', {class: 'btn sm', href: href('replay', {id: m.id}), ctl: 'CTL-MC-REPLAY'}, 'Replay') : null,
        h('button', {class: 'btn sm pri', type: 'button', ctl: 'CTL-MC-TRADE', disabled: m.src === 'REAL' || m.status === 'FT' || m.status === 'NR',
          title: m.src === 'REAL' ? 'Apertura non disponibile: serve la modalità operativa lato server (DEC-001)' : m.status === 'FT' ? 'Partita finita' : 'Apri una posizione simulata',
          onclick: () => tradeDialog(m)}, 'Apri posizione simulata'))));
  const tabs = tabsBar('CTL-MC-TAB', MC_TABS, tab, t => set({tab: t}), 'Sezioni della partita');
  const body = {overview: () => mcOverview(a, set), stats: () => mcStats(m), markets: () => mcMarkets(m), compare: () => mcCompare(a, params, set), h2h: () => mcH2h(a), copilot: () => copilotPanel(m), info: () => mcInfo(m, a)}[tab]();
  return [h('div', {class: 'crumbs'}, h('a', {href: href('dashboard', {date: m.date}), ctl: 'CTL-MC-BACK'}, `← Palinsesto del ${dayShort(m.date)}`)), hero, tabs, h('div', {'data-tab': tab}, body)];
}});
function mcOverview(a, set) {
  const m = a.match;
  const w = side => a.teams[side]?.venues?.[side === 'home' ? 'home' : 'away']?.windows?.['10'];
  const H = w('home'), A = w('away');
  const post = a.post;
  const cards = [];
  if (post) cards.push(h('section', {class: 'card', 'data-testid': 'mc-post'}, h('h2', {}, 'Esito dei mercati', issueTag('#25')),
    h('dl', {class: 'kv'}, post.flatMap(x => [h('dt', {}, x.label), h('dd', {'data-market': x.market, 'data-winner': x.win}, x.text, isNum(x.price) ? h('span', {class: 'muted'}, ` · quota ${odd(x.price)}`) : null)]),
      h('dt', {}, 'Il favorito'), h('dd', {'data-testid': 'mc-fav'}, m.fav && m.score ? ((m.score[0] > m.score[1] ? 'HOME' : m.score[0] < m.score[1] ? 'AWAY' : 'DRAW') === m.fav ? 'ha vinto' : 'non ha vinto') : ND)),
    h('p', {class: 'notice'}, 'Mercati regolati sul risultato finale con le regole interne di MatchPilot (#100).')));
  if (m.src === 'DEMO' && m.status !== 'NS') {
    const goals = (m.events ?? []).filter(e => e.type === 'GOAL' && e.min <= (m.status === 'FT' ? 90 : m.minute));
    cards.push(h('section', {class: 'card', 'data-testid': 'mc-goals'}, h('h2', {}, 'Marcature'), goals.length ? h('div', {class: 'tl'}, goals.map(g => h('div', {}, h('span', {class: 'min'}, `${g.min}'`), h('span', {}, '⚽'), h('span', {}, g.side ? m.away : m.home)))) : emptyState('Nessun gol.')));
  }
  cards.push(h('section', {class: 'card', 'data-testid': 'mc-preview'}, h('h2', {}, 'Pre-partita: ultime 10 (casa/trasferta)'),
    H || A ? cmpRows(m, H, A) : emptyState('Statistiche non disponibili.'),
    h('div', {class: 'row', style: {marginTop: '10px'}}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MC-GOCOMPARE', onclick: () => set({tab: 'compare'})}, 'Confronto completo'),
      isNum(m.xg[0]) ? h('a', {class: 'btn sm', href: href('tools', {tool: 'poisson', xg_home: m.xg[0], xg_away: m.xg[1], run: 1}), ctl: 'CTL-MC-TOOL-POISSON'}, `Poisson dagli ${xgLab(m.src)}`) : null,
      isNum(m.odds.h) ? h('a', {class: 'btn sm', href: href('tools', {tool: 'odds', odds: `${m.odds.h} ${m.odds.d} ${m.odds.a}`, run: 1}), ctl: 'CTL-MC-TOOL-ODDS'}, 'Margine 1X2') : null)));
  return h('div', {class: 'grid g2'}, cards);
}
function cmpRows(m, H, A) {
  const rows = [['n', 'Partite', s => nint(s.n)], ['pWon', 'Vittorie', s => pct(s.pWon)], ['pDrawn', 'Pareggi', s => pct(s.pDrawn)], ['pLost', 'Sconfitte', s => pct(s.pLost)],
    ['gfAvg', 'Gol fatti a partita', s => nf(s.gfAvg)], ['gaAvg', 'Gol subiti a partita', s => nf(s.gaAvg)], ['pOver15', 'Over 1,5', s => pct(s.pOver15)], ['pOver25', 'Over 2,5', s => pct(s.pOver25)],
    ['pOver35', 'Over 3,5', s => pct(s.pOver35)], ['pBtts', 'Entrambe segnano', s => pct(s.pBtts)], ['pCs', 'Porta inviolata', s => pct(s.pCs)], ['pFts', 'Senza segnare', s => pct(s.pFts)],
    ['xgfAvg', `${xgLab(m.src)} fatti a partita`, s => nf(s.xgfAvg)], ['xgaAvg', `${xgLab(m.src)} subiti a partita`, s => nf(s.xgaAvg)], ['pFirstGoal', 'Primo gol segnato', s => pct(s.pFirstGoal)]];
  const higherIsBetter = new Set(['pWon', 'gfAvg', 'xgfAvg', 'pCs', 'pFirstGoal']);
  const lowerIsBetter = new Set(['pLost', 'gaAvg', 'xgaAvg', 'pFts']);
  return h('div', {'data-testid': 'cmp-rows'}, h('div', {class: 'cmp'}, h('b', {}, H ? m.home : ''), h('span', {class: 'l'}, ''), h('b', {style: {textAlign: 'right'}}, A ? m.away : '')),
    rows.map(([k, l, f]) => {
      const x = H?.[k], y = A?.[k];
      const best = isNum(x) && isNum(y) && x !== y ? (higherIsBetter.has(k) ? (x > y ? 0 : 1) : lowerIsBetter.has(k) ? (x < y ? 0 : 1) : -1) : -1;
      return h('div', {class: 'cmp', 'data-stat': k}, h('span', {class: `v ${best === 0 ? 'best' : ''}`}, H ? f(H) : ''), h('span', {class: 'l'}, l), h('span', {class: `v r ${best === 1 ? 'best' : ''}`}, A ? f(A) : ''));
    }));
}
function mcStats(m) {
  if (m.src === 'REAL' || !m.stats) return [strip('UNAVAILABLE', 'Statistiche di partita non disponibili: richiedono i dati live TotalCorner (sospeso).')];
  if (m.status === 'NS') return [emptyState('Le statistiche compaiono dal calcio d’inizio.')];
  const st = m.stats;
  const line = (label, [a, b], fmt = nint) => h('div', {class: 'stat', style: {gridTemplateColumns: '48px minmax(0,1fr) 48px', marginBottom: '10px'}, 'data-stat': label},
    h('b', {class: 'mono'}, fmt(a)), h('div', {}, h('div', {class: 'small muted', style: {textAlign: 'center'}}, label), h('div', {class: 'bar2'}, h('i', {style: {width: `${a + b ? a / (a + b) * 100 : 50}%`}}), h('i', {style: {width: `${a + b ? b / (a + b) * 100 : 50}%`}}))),
    h('b', {class: 'mono', style: {textAlign: 'right'}}, fmt(b)));
  return [chip('DEMO'), h('section', {class: 'card', 'data-testid': 'mc-stats', style: {marginTop: '10px'}}, h('h2', {}, `Statistiche ${m.status === 'FT' ? 'finali' : `al ${m.minute}'`}`),
    line('Possesso %', st.poss), line('Tiri', st.shots), line('Tiri in porta', st.sot), line('Attacchi pericolosi', st.da), line('Calci d’angolo', st.corners), line('Cartellini', st.cards), line(xgLab('DEMO'), st.xg, x => nf(x))),
  h('section', {class: 'card'}, h('h2', {}, 'Momentum'), momentumChart(m, m.status === 'FT' ? 90 : m.minute))];
}
function momentumChart(m, upTo) {
  const W = 600, H = 90, mid = H / 2;
  const r = rng(hash(`${m.id}:mom`));
  const share = m.lambdas[0] / (m.lambdas[0] + m.lambdas[1]);
  const vals = []; let v = 0;
  for (let i = 1; i <= 90; i++) { v = v * 0.55 + (r() - 1 + share) * 1.1; const goal = m.events.find(e => e.type === 'GOAL' && e.min === i); if (goal) v = goal.side ? -1 : 1; vals.push(clamp(v, -1, 1)); }
  const bw = W / 90;
  return s('svg', {class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Momentum della partita (DEMO)', preserveAspectRatio: 'none', height: 90},
    s('line', {x1: 0, x2: W, y1: mid, y2: mid, stroke: 'var(--line-2)'}), s('line', {x1: 45 * bw, x2: 45 * bw, y1: 0, y2: H, stroke: 'var(--line-2)', 'stroke-dasharray': '3 3'}),
    vals.slice(0, upTo).map((x, i) => s('rect', {x: i * bw + 0.5, y: x > 0 ? mid - x * (mid - 4) : mid, width: Math.max(1, bw - 1), height: Math.abs(x) * (mid - 4), fill: x > 0 ? 'var(--back)' : 'var(--lay)', opacity: 0.4 + Math.abs(x) * 0.6})),
    m.events.filter(e => e.type === 'GOAL' && e.min <= upTo).map(e => s('circle', {cx: (e.min - 0.5) * bw, cy: e.side ? H - 6 : 6, r: 4, fill: '#fff'})));
}
function mcMarkets(m) {
  const pr = m.live ?? m.odds;
  const groups = [['MATCH_ODDS', 'Esito finale 1X2', [['HOME', '1', pr.h], ['DRAW', 'X', pr.d], ['AWAY', '2', pr.a]]],
    ['OVER_UNDER_25', 'Over/Under 2,5', [['OVER', 'Over', pr.o25], ['UNDER', 'Under', pr.u25]]], ['BTTS', 'Entrambe segnano', [['YES', 'Sì', pr.btts], ['NO', 'No', pr.bttsNo]]]];
  const canTrade = m.src === 'DEMO' && !['FT', 'NR'].includes(m.status);
  return [h('p', {class: 'small muted'}, m.live ? 'Quote in diretta (DEMO).' : 'Quote pre-partita.', canTrade ? ' Tocca una quota per aprire una posizione simulata.' : ''),
    h('div', {class: 'grid g3', 'data-testid': 'mc-markets'}, groups.map(([mk, title, sels]) => {
      const valid = sels.filter(([, , o]) => isNum(o));
      const book = valid.length === sels.length ? valid.reduce((x, [, , o]) => x + 1 / o, 0) : null;
      return h('section', {class: 'card', 'data-market': mk}, h('h2', {}, title, h('span', {class: 'right chip', title: 'Totale delle probabilità implicite'}, book ? `Libro ${pct(book)}` : 'Libro N/D')),
        h('div', {class: 'odds', style: {gridTemplateColumns: `repeat(${sels.length}, minmax(0,1fr))`}}, sels.map(([sel, lab, o]) => oddBox(lab, o, `${title}: ${lab}`,
          canTrade ? {ctl: 'CTL-MC-ODD', onclick: () => tradeDialog(m, {market: mk, selection: sel, odds: o})} : {}))),
        h('dl', {class: 'kv', style: {marginTop: '10px'}}, sels.flatMap(([, lab, o]) => [h('dt', {}, `Prob. implicita ${lab}`), h('dd', {}, isNum(o) ? pct(1 / o) : ND), h('dt', {}, `Prob. senza margine ${lab}`), h('dd', {}, book && isNum(o) ? pct(1 / o / book) : ND)])));
    })), m.src === 'REAL' ? strip('UNAVAILABLE', 'Apertura di posizioni non disponibile in REAL: serve la modalità operativa lato server (DEC-001).') : null];
}
function mcCompare(a, params, set) {
  const m = a.match;
  const venue = VENUE_OPTS.some(([x]) => x === params.get('venue')) ? params.get('venue') : 'split';
  const win = WIN_OPTS.some(([x]) => x === params.get('window')) ? params.get('window') : '10';
  const team = ['both', 'home', 'away'].includes(params.get('team')) ? params.get('team') : 'both';
  const stats = side => { const v = venue === 'split' ? side : venue; return a.teams[side]?.venues?.[v]?.windows?.[win] ?? null; };
  const H = team === 'away' ? null : stats('home'), A = team === 'home' ? null : stats('away');
  const goalBands = (title, sel) => {
    const data = [H, A].map(x => x?.[sel]);
    if (data.every(x => !x)) return null;
    return h('section', {class: 'card'}, h('h2', {}, title), barChart(['0–15', '16–30', '31–45', '46–60', '61–75', '76–90'], [[m.home, data[0], 'var(--back)'], [m.away, data[1], 'var(--lay)']].filter(x => x[1])));
  };
  return [h('div', {class: 'card row', style: {marginBottom: '14px', gap: '10px 16px'}},
    seg('CTL-MC-TEAM', [['both', 'Entrambe'], ['home', 'Casa'], ['away', 'Ospite']], team, v => set({team: v}), 'Squadra'),
    seg('CTL-MC-WINDOW', WIN_OPTS, win, v => set({window: v}), 'Campione'),
    seg('CTL-MC-VENUE', VENUE_OPTS, venue, v => set({venue: v}), 'Campo')),
  h('p', {class: 'small muted', 'data-testid': 'mc-cutoff'}, `Partite concluse prima del ${dayShort(a.cutoff)}; quelle dello stesso giorno sono escluse.`),
  h('div', {class: 'grid g2'}, h('section', {class: 'card', 'data-testid': 'mc-compare'}, h('h2', {}, 'Confronto', issueTag('#30')), cmpRows(m, H, A)),
    h('div', {class: 'stack'}, goalBands('Gol segnati per fascia di minuti', 'goalsByBand'), goalBands('Gol subiti per fascia di minuti', 'concededByBand'),
      h('section', {class: 'card'}, h('h2', {}, 'Partite considerate'), [['home', H], ['away', A]].filter(([, x]) => x).map(([side, x]) => h('div', {}, h('h3', {}, side === 'home' ? m.home : m.away),
        x.form.length ? h('ul', {class: 'small', style: {margin: 0, paddingLeft: '18px'}}, x.form.map(f => h('li', {}, f.date ? `${dayShort(f.date)} · ` : '', f.text, ' ', h('span', {class: `fm ${f.result}`}, {W: 'V', D: 'N', L: 'P'}[f.result])))) : emptyState('Nessuna partita conclusa prima di questa data.'))))))];
}
function barChart(labels, series) {
  const W = 520, H = 160, pad = 24, max = Math.max(1, ...series.flatMap(([, v]) => v));
  const gw = (W - pad) / labels.length, bw = (gw - 8) / series.length;
  return [s('svg', {class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': series.map(([n, v]) => `${n}: ${v.join(', ')}`).join('; ')},
    labels.map((l, i) => [s('text', {x: pad + i * gw + gw / 2, y: H - 6, 'text-anchor': 'middle'}, l),
      series.map(([, v, col], k) => { const bh = (v[i] / max) * (H - 34); return [s('rect', {x: pad + i * gw + 4 + k * bw, y: H - 20 - bh, width: bw - 2, height: bh, rx: 2, fill: col}),
        v[i] ? s('text', {x: pad + i * gw + 4 + k * bw + bw / 2, y: H - 23 - bh, 'text-anchor': 'middle'}, String(v[i])) : null]; })])),
  h('div', {class: 'legend'}, series.map(([n, , col]) => h('span', {}, h('i', {style: {background: col}}), n)))];
}
function mcH2h(a) {
  const rows = a.h2h ?? [];
  return h('section', {class: 'card', 'data-testid': 'mc-h2h'}, h('h2', {}, 'Precedenti'), rows.length ? h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, ['Data', 'Partita', 'Risultato', xgLab(rows.every(x => x.src === 'REAL') ? 'REAL' : 'DEMO')].map(x => h('th', {}, x)))),
    h('tbody', {}, rows.map(x => h('tr', {}, h('td', {}, dayShort(x.date)), h('td', {}, h('a', {href: href('match', {id: x.id}), ctl: 'CTL-MATCH-OPEN'}, `${x.home} – ${x.away}`)),
      h('td', {class: 'n'}, x.final ? `${x.final[0]}–${x.final[1]}` : ND), h('td', {class: 'n'}, isNum(x.xg?.[0]) ? `${nf(x.xg[0])} – ${nf(x.xg[1])}` : ND))))))
    : emptyState('Nessun precedente prima di questa data.'));
}
function mcInfo(m, a) {
  return h('section', {class: 'card', 'data-testid': 'mc-info'}, h('h2', {}, 'Informazioni'), h('dl', {class: 'kv'},
    [['Competizione', `${m.comp.name} · ${m.comp.country}`], ['Data', dayLong(m.date)], ['Calcio d’inizio', m.ko], ['Stato', STATUS_TEXT[m.status] ?? ND], ['Origine dei dati', MODE_TEXT[m.src]],
      ['Freschezza', m.fresh ? `${FRESH_TEXT[m.fresh.state]}${m.fresh.lag ? ` (${m.fresh.lag} s)` : ''}` : ND], ['Statistiche fino al', dayShort(a.cutoff) + ' escluso'], ['Identificativo', m.id]]
      .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])));
}

// ---------------------------------------------------------------- trade dialog (paper trading, #99 #96)
function tradeDialog(m, pre = {}) {
  if (m.src === 'REAL') { toast('Apertura non disponibile in REAL (DEC-001).', 'bad'); return; }
  const l = ledgerLoad();
  const st = ledgerState(l);
  const profiles = lib.profiles().filter(p => !p.archived);
  const prof = profiles.find(p => p.default) ?? profiles[0];
  const market = h('select', {ctl: 'CTL-TRADE-MARKET', 'aria-label': 'Mercato'}, Object.entries(MARKETS).map(([k, t]) => h('option', {value: k, selected: k === (pre.market ?? 'MATCH_ODDS')}, t)));
  const sel = h('select', {ctl: 'CTL-TRADE-SEL', 'aria-label': 'Selezione'});
  const side = h('select', {ctl: 'CTL-TRADE-SIDE', 'aria-label': 'Lato'}, Object.entries(SIDE_TEXT).map(([k, t]) => h('option', {value: k, selected: k === (pre.side ?? 'BACK')}, t)));
  const oddsIn = h('input', {type: 'number', step: '0.01', min: '1.01', ctl: 'CTL-TRADE-ODDS', 'aria-label': 'Quota'});
  const stakeIn = h('input', {type: 'number', step: '0.01', min: '0.01', ctl: 'CTL-TRADE-STAKE', 'aria-label': 'Puntata'});
  const out = h('div', {class: 'small', 'data-testid': 'trade-eval', 'aria-live': 'polite'});
  const fillSel = () => {
    const opts = SELECTIONS[market.value].filter(([v]) => !['FAVOURITE', 'UNDERDOG'].includes(v));
    sel.replaceChildren(...opts.map(([v, t]) => h('option', {value: v, selected: v === pre.selection}, t)));
  };
  const price = () => { const p = m.live ?? m.odds; return p[PRICE_KEY[sel.value]]; };
  const evaluate = (fromProfile = false) => {
    if (fromProfile || !oddsIn.value) oddsIn.value = isNum(price()) ? String(price()) : '';
    const v = prof?.versions.at(-1);
    if (fromProfile && v) {
      const r = mmEvaluate({model: v.model, value: v.value, caps: v.caps, side: side.value, odds: oddsIn.value, available: st.available, openCount: st.open, mode: l.mode});
      if (!r.error) stakeIn.value = String(r.stake);
    }
    const o = Number(oddsIn.value), s0 = Number(stakeIn.value);
    out.replaceChildren(o > 1 && s0 > 0
      ? h('dl', {class: 'kv'}, h('dt', {}, 'Responsabilità'), h('dd', {}, money(liabilityOf(side.value, o, s0))), h('dt', {}, 'Se la selezione vince'), h('dd', {}, signed(legPL({side: side.value, odds: o, stake: s0}, true))),
        h('dt', {}, 'Se la selezione perde'), h('dd', {}, signed(legPL({side: side.value, odds: o, stake: s0}, false))), h('dt', {}, 'Disponibile'), h('dd', {}, money(st.available)),
        h('dt', {}, 'Commissione'), h('dd', {}, `${nf(settings().commission)}% (${settings().exchange})`))
      : h('span', {class: 'muted'}, 'Inserisci quota e puntata.'));
    const lim = o > 1 && s0 > 0 ? ledgerLimits(l, {side: side.value, odds: o, stake: s0, profile: prof?.id}) : [];
    if (lim.length) out.append(h('div', {class: 'state partial', 'data-testid': 'trade-limits', style: {marginTop: '8px'}}, `Bloccata dai limiti: ${lim.join('; ')}.`));
  };
  market.addEventListener('change', () => { fillSel(); evaluate(true); });
  sel.addEventListener('change', () => evaluate(true));
  side.addEventListener('change', () => evaluate(true));
  oddsIn.addEventListener('input', () => evaluate());
  stakeIn.addEventListener('input', () => evaluate());
  fillSel();
  const err = h('p', {class: 'err', role: 'alert'});
  let busy = false;
  dialog({id: 'trade', title: `Posizione simulata · ${m.home} – ${m.away}`, body: [
    l.mode !== 'ACTIVE_OPERATIONAL' ? h('div', {class: 'state partial', style: {marginBottom: '10px'}}, `Operatività: ${MODES[l.mode]}. ${l.mode === 'ADVISORY_ONLY' ? 'La proposta resta un consiglio: niente viene registrato.' : 'Nessuna nuova posizione.'}`) : null,
    h('div', {class: 'fields'}, h('label', {class: 'f'}, 'Mercato', market), h('label', {class: 'f'}, 'Selezione', sel), h('label', {class: 'f'}, 'Lato', side),
      h('label', {class: 'f'}, 'Quota', oddsIn), h('label', {class: 'f'}, `Puntata (profilo «${prof?.name ?? ND}»)`, stakeIn)), h('div', {style: {marginTop: '10px'}}, out), err,
    h('p', {class: 'notice'}, 'Denaro simulato (DEMO): nessun ordine reale viene inviato.')],
  actions: [h('button', {class: 'btn', type: 'button', ctl: 'CTL-DLG-CANCEL', onclick: closeDialog}, 'Annulla'),
    h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-TRADE-CONFIRM', onclick: e => {
      if (busy) return;
      busy = true; e.currentTarget.disabled = true;
      const r = ledgerOpen(ledgerLoad(), {match: m, market: market.value, selection: sel.value, side: side.value, odds: Number(oddsIn.value), stake: Number(stakeIn.value), profile: prof?.id});
      if (r.error) { err.textContent = r.error; busy = false; e.currentTarget.disabled = false; return; }
      closeDialog(); toast(`Posizione ${r.id} aperta (simulata)`, 'ok');
      if (parseHash().name === 'paper') render();
    }}, 'Apri posizione')]});
  if (pre.side) side.value = pre.side;
  evaluate(true);
}
