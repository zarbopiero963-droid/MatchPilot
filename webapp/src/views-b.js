
// ================================================================ Live Board (UI-05, #29)
const PREV_PRICES = new Map();
const LIVE_PREFS = () => ({interval: 5, paused: false, ...store.get('livePrefs', {})});
view({id: 'live', title: 'Live Board', phase: 'UI-05', issues: ['#29', '#20'], loadingText: 'delle partite in diretta', async render(params, ctx) {
  if (isReal()) {
    let c = null, err = null;
    try { c = await REAL.live(); } catch (e) { err = e; }
    return [head('Live Board', {chips: [chip('REAL')], issues: ['UI-05', '#29']}),
      strip('UNAVAILABLE', 'Nessun feed live: la raccolta TotalCorner è sospesa (decisione owner #182). Qui sotto lo stato del raccoglitore.'),
      h('section', {class: 'card', 'data-testid': 'live-collector'}, h('h2', {}, 'Raccolta in diretta'), err ? errorState(err, render)
        : h('dl', {class: 'kv'}, h('dt', {}, 'Partite seguite'), h('dd', {}, nint(c?.snapshots?.matches)), h('dt', {}, 'Rilevazioni'), h('dd', {}, nint(c?.snapshots?.snapshots)),
          h('dt', {}, 'Ultima rilevazione'), h('dd', {}, c?.snapshots?.latest ? when(c.snapshots.latest) : ND), h('dt', {}, 'Ultimo controllo'), h('dd', {}, c?.cursors?.last_polled_at ? when(c.cursors.last_polled_at) : ND)))];
  }
  const prefs = LIVE_PREFS();
  const filter = params.get('filter') || 'all', sort = params.get('sort') || 'minute';
  const set = patch => updateParams('live', params, patch);
  const all = demoDay(today()).map(withState).filter(passesFilter);
  const live = all.filter(m => ['LIVE', 'HT'].includes(m.status));
  const strategies = lib.strategies().filter(d => d.active && d.phase === 'LIVE');
  const copilot = m => strategies.map(d => ({d, ...copilotState(d, m)}));
  let rows = live.filter(m => filter === 'all' || (filter === 'signals' ? copilot(m).some(x => ['ARMED', 'NEAR_MATCH'].includes(x.state)) : ['DELAYED', 'STALE', 'OFFLINE'].includes(m.fresh.state)));
  rows.sort((a, b) => sort === 'comp' ? a.comp.name.localeCompare(b.comp.name) : (b.minute ?? 0) - (a.minute ?? 0));
  if (!ctx.refresh && !prefs.paused) every(prefs.interval * 1000, refreshInPlace);
  const next = all.filter(m => m.status === 'NS').slice(0, 5);
  const events = live.flatMap(m => stateAt(m, m.minute).happened.filter(e => e.type !== 'CORNER').map(e => ({...e, m}))).sort((x, y) => y.min - x.min).slice(0, 10);
  const updated = new Date();
  const cards = rows.map(m => {
    const prev = PREV_PRICES.get(m.id); PREV_PRICES.set(m.id, m.live);
    const cs = copilot(m);
    const best = cs.find(x => x.state === 'ARMED') ?? cs.find(x => x.state === 'NEAR_MATCH');
    const st = m.stats;
    const bar = (label, [x, y]) => h('div', {class: 'stat'}, h('span', {class: 'mono'}, nint(x)), h('div', {}, h('div', {class: 'xs', style: {textAlign: 'center'}}, label),
      h('div', {class: 'bar2'}, h('i', {style: {width: `${x + y ? x / (x + y) * 100 : 50}%`}}), h('i', {style: {width: `${x + y ? y / (x + y) * 100 : 50}%`}}))), h('span', {class: 'mono', style: {textAlign: 'right'}}, nint(y)));
    return h('article', {class: `lcard ${best?.state === 'ARMED' ? 'armed' : ''}`, 'data-match': m.id, 'data-fresh': m.fresh.state},
      h('div', {class: 'top'}, h('span', {}, m.comp.name), h('span', {class: `fresh ${m.fresh.state}`, title: `Ultimo aggiornamento del fornitore ${m.fresh.lag} s fa (DEMO)`}, FRESH_TEXT[m.fresh.state], ` · ${m.fresh.lag} s`)),
      h('div', {class: 'mt'}, h('span', {}, m.home), h('span', {class: 's'}, m.score[0]), h('span', {}, m.away), h('span', {class: 's'}, m.score[1])),
      h('div', {class: 'row', style: {justifyContent: 'space-between'}}, statusChip(m), h('span', {class: 'xs muted'}, `xG ${nf(st.xg[0])} – ${nf(st.xg[1])}`)),
      bar('Possesso %', st.poss), bar('Tiri (in porta)', st.sot), bar('Angoli', st.corners), bar('Attacchi pericolosi', st.da),
      m.live ? h('div', {class: 'odds', style: {gridTemplateColumns: 'repeat(4,minmax(0,1fr))'}}, oddBox('1', m.live.h, null, {prev: prev?.h}), oddBox('X', m.live.d, null, {prev: prev?.d}),
        oddBox('2', m.live.a, null, {prev: prev?.a}), oddBox('O 2,5', m.live.o25, 'Over 2,5', {prev: prev?.o25})) : null,
      best ? h('div', {class: 'row', style: {justifyContent: 'space-between'}}, h('span', {class: `state-pill st-${best.state}`}, best.state), h('span', {class: 'xs'}, best.d.name)) : null,
      h('div', {class: 'row'}, h('a', {class: 'btn sm', href: href('match', {id: m.id}), ctl: 'CTL-LIVE-OPEN'}, 'Apri'),
        h('a', {class: 'btn sm', href: href('match', {id: m.id, tab: 'copilot'}), ctl: 'CTL-LIVE-COPILOT'}, 'Copilot'),
        h('button', {class: 'btn sm pri', type: 'button', ctl: 'CTL-LIVE-TRADE', disabled: m.fresh.state === 'STALE' || m.fresh.state === 'OFFLINE',
          title: ['STALE', 'OFFLINE'].includes(m.fresh.state) ? 'Dati fermi: operatività bloccata' : null, onclick: () => tradeDialog(m)}, 'Opera')));
  });
  return [head('Live Board', {sub: `${live.length} partite in diretta · aggiornato alle ${updated.toLocaleTimeString('it-IT')}`, chips: [chip('DEMO')], issues: ['UI-05', '#29']}),
    dataStrip('DEMO', 'Il feed live dimostrativo segue l’orologio reale; quote e statistiche sono generate.'),
    h('div', {class: 'card row', style: {marginBottom: '14px', justifyContent: 'space-between'}},
      h('div', {class: 'row'}, seg('CTL-LIVE-FILTER', [['all', 'Tutte'], ['signals', 'Con segnali'], ['delay', 'In ritardo']], filter, v => set({filter: v}), 'Filtro'),
        seg('CTL-LIVE-SORT', [['minute', 'Minuto'], ['comp', 'Campionato']], sort, v => set({sort: v}), 'Ordine')),
      h('div', {class: 'row'},
        h('label', {class: 'f inl'}, 'Aggiorna ogni', h('select', {ctl: 'CTL-LIVE-INTERVAL', 'aria-label': 'Intervallo di aggiornamento', onchange: e => { store.set('livePrefs', {...prefs, interval: Number(e.target.value)}); render(); }},
          [5, 10, 30].map(n => h('option', {value: n, selected: prefs.interval === n}, `${n} s`)))),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-LIVE-PAUSE', 'aria-pressed': String(prefs.paused), onclick: () => { store.set('livePrefs', {...prefs, paused: !prefs.paused}); toast(prefs.paused ? 'Aggiornamento automatico ripreso' : 'Aggiornamento automatico in pausa'); render(); }},
          prefs.paused ? 'Riprendi' : 'Pausa'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-LIVE-REFRESH', onclick: () => { refreshInPlace(); toast('Aggiornato'); }}, 'Aggiorna ora'))),
    prefs.paused ? h('div', {class: 'state partial', style: {marginBottom: '14px'}, 'data-testid': 'live-paused'}, 'Aggiornamento automatico in pausa: i dati non cambiano finché non riprendi o aggiorni.') : null,
    h('div', {class: 'grid', style: {gridTemplateColumns: 'minmax(0,1fr)'}},
      cards.length ? h('div', {class: 'lgrid', 'data-testid': 'live-cards'}, cards)
        : emptyState(live.length ? 'Nessuna partita corrisponde al filtro.' : 'Nessuna partita in diretta in questo momento.', next.length ? h('a', {href: href('match', {id: next[0].id}), ctl: 'CTL-MATCH-OPEN'}, `Prossima: ${next[0].ko} ${next[0].home} – ${next[0].away}`) : null),
      h('div', {class: 'grid g2'},
        h('section', {class: 'card', 'data-testid': 'live-events'}, h('h2', {}, 'Ultimi eventi'), events.length ? h('div', {class: 'tl'}, events.map(e => h('div', {},
          h('span', {class: 'min'}, `${e.min}'`), h('span', {}, e.type === 'GOAL' ? '⚽' : e.type === 'RED' ? '🟥' : '🟨'), h('span', {}, `${e.side ? e.m.away : e.m.home} · ${e.m.home} – ${e.m.away}`)))) : emptyState('Nessun evento.')),
        h('section', {class: 'card'}, h('h2', {}, 'Prossimi calci d’inizio'), next.length ? h('div', {class: 'mlist'}, next.map(m => matchRow(m))) : emptyState('Nessuna altra partita oggi.')))),
  ];
}});

// ================================================================ Trading Copilot (UI-11, #102 #28) — advisory only
function copilotState(def, m) {
  if (m.status === 'NS') { const r = def.phase === 'LIVE' ? null : evaluateDef(def, m); return {state: r?.trade ? 'ARMED' : r?.near ? 'NEAR_MATCH' : 'PREMATCH', r, why: def.phase === 'LIVE' ? 'Strategia live: attende il calcio d’inizio.' : r?.trade ? 'Condizioni pre-partita soddisfatte.' : 'Condizioni pre-partita non soddisfatte.'}; }
  if (m.status === 'FT' || m.status === 'NR') return {state: 'EXPIRED', why: 'Partita conclusa.'};
  if (!def.phase || def.phase !== 'LIVE') return {state: 'NO_TRADE', why: 'Strategia pre-partita: non opera in diretta.'};
  if (['STALE', 'OFFLINE'].includes(m.fresh?.state)) return {state: 'BLOCKED', why: 'Dati fermi: nessuna decisione su dati non freschi.'};
  const l = ledgerLoad();
  if (l.mode !== 'ACTIVE_OPERATIONAL') return {state: 'BLOCKED', why: `Operatività: ${MODES[l.mode]}.`};
  if ((m.minute ?? 0) >= 85) return {state: 'EXPIRED', why: 'Oltre l’85°: finestra di ingresso chiusa.'};
  const r = evaluateDef(def, m, {score: m.score, live: m.live, minute: m.minute});
  if (r.reason === 'TEAM' || r.reason === 'COMPETITION') return {state: 'INVALIDATED', why: 'La partita non rientra nella strategia.'};
  return {state: r.trade ? 'ARMED' : r.near ? 'NEAR_MATCH' : 'WATCHING', r, why: r.trade ? 'Tutte le condizioni sono soddisfatte.' : r.near ? 'Condizioni vicine alla soglia.' : 'In osservazione.'};
}
function copilotPanel(m) {
  if (m.src === 'REAL') return strip('UNAVAILABLE', 'Copilot non disponibile in REAL: servono dati live e la modalità operativa lato server.');
  const defs = lib.strategies().filter(d => d.active);
  const l = ledgerLoad();
  const positions = Object.values(l.positions).filter(p => p.matchId === m.id);
  const price = p => (m.live ?? m.odds)[PRICE_KEY[p.selection]];
  return [h('div', {class: 'strip DEMO'}, chip('DEMO'), h('b', {}, 'ADVISORY'), h('span', {}, 'Il Copilot consiglia soltanto: nessun ordine reale, le azioni agiscono sul conto simulato.')),
    h('div', {class: 'grid g2', 'data-testid': 'copilot'},
      h('section', {class: 'card'}, h('h2', {}, 'Strategie attive', issueTag('#102')), defs.length ? h('div', {class: 'stack', style: {gap: '10px'}}, defs.map(d => {
        const c = copilotState(d, m);
        return h('div', {class: 'card', style: {background: 'var(--surface-2)'}, 'data-strategy': d.key, 'data-state': c.state},
          h('div', {class: 'row', style: {justifyContent: 'space-between'}}, h('b', {}, d.name), h('span', {class: `state-pill st-${c.state}`}, c.state)),
          h('div', {class: 'small muted'}, c.why),
          c.r?.checks?.length ? h('ul', {class: 'small', style: {margin: '6px 0 0', paddingLeft: '18px'}}, c.r.checks.map(x => h('li', {class: x.ok ? 'ok' : x.near ? 'warn' : 'muted'},
            `${FIELDS[x.field]?.label} ${OPS[x.op]} ${nf(Number(x.a))}${x.op === 'between' ? ` e ${nf(Number(x.b))}` : ''}: ${x.value === null ? ND : nf(x.value)}`))) : null,
          c.state === 'ARMED' && c.r ? h('button', {class: 'btn sm pri', type: 'button', style: {marginTop: '8px'}, ctl: 'CTL-COP-OPEN',
            onclick: () => tradeDialog(m, {market: d.market, selection: c.r.sel, side: d.side, odds: c.r.price})}, `${SIDE_TEXT[d.side]} ${selectionText(d.market, c.r.sel)} @ ${odd(c.r.price)}`) : null);
      })) : emptyState('Nessuna strategia attiva.', h('a', {href: href('strategies'), ctl: 'CTL-COP-STRATS'}, 'Attivane una nello Strategy Lab'))),
      h('section', {class: 'card'}, h('h2', {}, 'Posizioni su questa partita'), positions.length ? h('div', {class: 'stack', style: {gap: '10px'}}, positions.map(p => {
        const pl = positionPL(p);
        const o = price(p);
        const hc = p.status === 'OPEN' && isNum(o) ? hedgeCalc(p, o) : null;
        const half = p.status === 'OPEN' && isNum(o) ? hedgeCalc(p, o, 0.5) : null;
        const intent = !hc ? null : hc.after.win > 0 && hc.after.lose > 0 && (m.minute ?? 0) >= 70 ? 'FULL_HEDGE' : hc.after.win > 0 && hc.after.lose > 0 ? 'PARTIAL_HEDGE' : 'HOLD';
        return h('div', {class: 'card', style: {background: 'var(--surface-2)'}, 'data-position': p.id},
          h('div', {class: 'row', style: {justifyContent: 'space-between'}}, h('b', {}, `${p.id} · ${SIDE_TEXT[p.side]} ${selectionText(p.market, p.selection)}`), h('span', {class: `chip ${p.status === 'OPEN' ? 'info' : 'ok'}`}, p.status === 'OPEN' ? 'Aperta' : `Regolata ${signed(p.net)}`)),
          h('dl', {class: 'kv small', style: {marginTop: '6px'}}, h('dt', {}, 'Se vince / se perde'), h('dd', {}, `${signed(pl.win)} / ${signed(pl.lose)}`),
            hc ? [h('dt', {}, `Copertura totale @ ${odd(o)}`), h('dd', {}, `${SIDE_TEXT[hc.side]} ${money(hc.stake)} → ${signed(hc.after.win)} / ${signed(hc.after.lose)}`),
              h('dt', {}, 'Copertura metà'), h('dd', {}, `${SIDE_TEXT[half.side]} ${money(half.stake)} → ${signed(half.after.win)} / ${signed(half.after.lose)}`), h('dt', {}, 'Intento consigliato'), h('dd', {'data-testid': 'cop-intent'}, intent)] : null),
          hc ? h('div', {class: 'row', style: {marginTop: '8px'}},
            h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-COP-HEDGE', onclick: () => { const r = ledgerHedge(ledgerLoad(), p.id, o, 1); toast(r.error ?? `Coperta: ${signed(r.after.win)} / ${signed(r.after.lose)}`, r.error ? 'bad' : 'ok'); render(); }}, 'Copri tutto'),
            h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-COP-HALF', onclick: () => { const r = ledgerHedge(ledgerLoad(), p.id, o, 0.5); toast(r.error ?? 'Coperta a metà', r.error ? 'bad' : 'ok'); render(); }}, 'Copri metà')) : null);
      })) : emptyState('Nessuna posizione simulata su questa partita.')))];
}
view({id: 'copilot', title: 'Trading Copilot', phase: 'UI-11', issues: ['#102', '#28'], render(params, ctx) {
  if (isReal()) return [head('Trading Copilot', {chips: [chip('UNAVAILABLE')]}), strip('UNAVAILABLE', 'Il Copilot richiede dati live e la modalità operativa lato server: disponibile solo in DEMO.')];
  const defs = lib.strategies().filter(d => d.active);
  const ms = demoDay(today()).map(withState).filter(passesFilter).filter(m => m.status !== 'FT');
  const rows = ms.flatMap(m => defs.map(d => ({m, d, ...copilotState(d, m)}))).filter(x => !['NO_TRADE', 'INVALIDATED'].includes(x.state));
  const order = {ARMED: 0, NEAR_MATCH: 1, WATCHING: 2, PREMATCH: 3, BLOCKED: 4, EXPIRED: 5};
  rows.sort((a, b) => order[a.state] - order[b.state] || a.m.ko.localeCompare(b.m.ko));
  const counts = Object.fromEntries(Object.keys(order).map(k => [k, rows.filter(r => r.state === k).length]));
  if (!ctx.refresh) every(10000, refreshInPlace);
  const cols = ['Stato', 'Partita', 'Strategia', 'Motivo', ''];
  return [head('Trading Copilot', {sub: 'PREMATCH → LIVE → POSIZIONE → USCITA, solo consiglio', chips: [chip('DEMO')], issues: ['UI-11', '#102']}),
    h('div', {class: 'strip DEMO'}, chip('DEMO'), h('b', {}, 'ADVISORY'), h('span', {}, 'Nessun ordine reale. Gli stati seguono le strategie attive nello Strategy Lab.')),
    h('div', {class: 'grid g4', style: {marginBottom: '14px'}}, kpi('Armate', nint(counts.ARMED), 'condizioni soddisfatte', {'data-kpi': 'armed'}), kpi('Vicine', nint(counts.NEAR_MATCH)),
      kpi('In osservazione', nint(counts.WATCHING + counts.PREMATCH)), kpi('Bloccate', nint(counts.BLOCKED), 'dati fermi o STOP')),
    defs.length ? h('section', {class: 'card'}, h('h2', {}, 'Partite e strategie'), rows.length ? h('div', {class: 'tablewrap'}, h('table', {class: 'cards', 'data-testid': 'copilot-table'},
      h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))), h('tbody', {}, rows.slice(0, 60).map(x => h('tr', {'data-state': x.state}, [
        h('td', {}, h('span', {class: `state-pill st-${x.state}`}, x.state)), h('td', {}, `${x.m.status === 'NS' ? x.m.ko : `${x.m.minute}'`} ${x.m.home} – ${x.m.away}`),
        h('td', {}, x.d.name), h('td', {class: 'small muted'}, x.why), h('td', {}, h('a', {class: 'btn sm', href: href('match', {id: x.m.id, tab: 'copilot'}), ctl: 'CTL-COP-ROW'}, 'Apri'))].map((td, i) => (td.setAttribute('data-label', cols[i] || 'Azione'), td)))))))
      : emptyState('Nessuna partita di oggi interessa le strategie attive.'))
      : emptyState('Nessuna strategia attiva.', h('a', {href: href('strategies'), ctl: 'CTL-COP-STRATS'}, 'Attivane una nello Strategy Lab'))];
}});

// ================================================================ Match Analysis Hub (UI-06, #30)
view({id: 'analysis', title: 'Analysis Hub', phase: 'UI-06', issues: ['#30'], loadingText: 'dell’analisi', async render(params, ctx) {
  const v = k => params.get(k) || '';
  const set = patch => updateParams('analysis', params, patch);
  const win = WIN_OPTS.some(([x]) => x === v('window')) ? v('window') : '10';
  const venue = ['both', 'home', 'away'].includes(v('venue')) ? v('venue') : 'both';
  let teamA = v('team') || v('a'), teamB = v('b');
  let match = null, analysis = null;
  if (v('match')) {
    analysis = await DATA.analysis(v('match'));
    if (!ctx.alive()) return [];
    if (!analysis) return [head('Analysis Hub'), emptyState('Partita non trovata.')];
    match = analysis.match; teamA = match.home; teamB = match.away;
  }
  const teams = COMPS.flatMap(c => c.teams.map(t => [t, `${t} · ${c.name}`]));
  const selA = h('select', {ctl: 'CTL-AN-TEAM-A', 'aria-label': 'Squadra A', disabled: isReal()}, h('option', {value: ''}, 'Scegli una squadra'), teams.map(([t, l]) => h('option', {value: t, selected: t === teamA}, l)));
  const selB = h('select', {ctl: 'CTL-AN-TEAM-B', 'aria-label': 'Squadra B (facoltativa)', disabled: isReal()}, h('option', {value: ''}, 'Nessun confronto'), teams.map(([t, l]) => h('option', {value: t, selected: t === teamB}, l)));
  const picker = h('section', {class: 'card', style: {marginBottom: '14px'}},
    h('div', {class: 'fields'}, h('label', {class: 'f'}, 'Squadra', selA), h('label', {class: 'f'}, 'Confronta con', selB)),
    h('div', {class: 'row', style: {marginTop: '10px', gap: '10px 16px'}}, h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-AN-APPLY', disabled: isReal(), onclick: () => {
      if (!selA.value) { toast('Scegli una squadra', 'bad'); selA.focus(); return; }
      go('analysis', {team: selA.value, b: selB.value, window: win, venue});
    }}, 'Analizza'),
    seg('CTL-AN-WINDOW', WIN_OPTS, win, x => set({window: x}), 'Campione'),
    seg('CTL-AN-VENUE', [['both', 'Tutte'], ['home', 'In casa'], ['away', 'In trasferta']], venue, x => set({venue: x}), 'Campo')));
  const headN = head('Analysis Hub', {sub: match ? `${match.home} – ${match.away} · ${dayLong(match.date)}` : 'Statistiche pre-partita di squadra, Home/Away/Both', chips: [chip(match?.src ?? (isReal() ? 'UNAVAILABLE' : 'DEMO'))], issues: ['UI-06', '#30']});
  if (isReal() && !match) return [headN, strip('UNAVAILABLE', 'In REAL l’analisi si apre da una partita (Match Center → Analisi completa): l’API v1 non ha statistiche per squadra senza partita.')];
  if (!teamA) return [headN, dataStrip('DEMO'), picker, emptyState('Scegli una squadra (e facoltativamente un avversario), poi premi Analizza.')];
  const before = match?.date ?? today();
  const get = (t, side) => analysis ? analysis.teams[side]?.venues?.[venue]?.windows?.[win] : demoTeamAnalysis(t, before).venues[venue].windows[win];
  if (!analysis && !TEAM_COMP.has(teamA)) return [headN, picker, emptyState(`Squadra «${teamA}» non trovata.`)];
  const A = get(teamA, 'home'), B = teamB ? get(teamB, 'away') : null;
  const ptsLine = st => { let acc = 0; return [...st.form].reverse().map(f => (acc += f.result === 'W' ? 3 : f.result === 'D' ? 1 : 0)); };
  const lineChart = series => {
    const W = 520, H = 150, max = Math.max(3, ...series.flatMap(([, v]) => v)), n = Math.max(2, ...series.map(([, v]) => v.length));
    return [s('svg', {class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Punti cumulati'},
      [0, 0.5, 1].map(f => s('line', {x1: 24, x2: W, y1: 10 + (H - 30) * f, y2: 10 + (H - 30) * f, stroke: 'var(--line)'})),
      series.map(([, v, col]) => s('polyline', {fill: 'none', stroke: col, 'stroke-width': 2.2, points: v.map((y, i) => `${24 + i * (W - 34) / (n - 1)},${10 + (H - 30) * (1 - y / max)}`).join(' ')})),
      s('text', {x: 0, y: 14}, String(max)), s('text', {x: 0, y: H - 18}, '0')),
    h('div', {class: 'legend'}, series.map(([name, , col]) => h('span', {}, h('i', {style: {background: col}}), name)))];
  };
  const box = (title, x) => h('section', {class: 'card'}, h('h2', {}, title), x);
  const tableOf = (t, st) => st?.form?.length ? h('ul', {class: 'small', style: {margin: 0, paddingLeft: '18px'}}, st.form.map(f => h('li', {}, f.date ? `${dayShort(f.date)} · ` : '', f.text, ' ',
    h('span', {class: `fm ${f.result}`}, {W: 'V', D: 'N', L: 'P'}[f.result]), ' ', f.id && String(f.id).startsWith('demo:') ? h('a', {href: href('match', {id: f.id}), ctl: 'CTL-AN-MATCH'}, 'apri') : null)))
    : emptyState('Nessuna partita conclusa nel campione.');
  const fake = {home: teamA, away: teamB ?? ''};
  return [headN, match ? dataStrip(match.src) : dataStrip('DEMO'), picker,
    h('p', {class: 'small muted'}, `Campione: ${WIN_OPTS.find(([x]) => x === win)[1]} · ${venue === 'both' ? 'tutte le partite' : venue === 'home' ? 'solo in casa' : 'solo in trasferta'} · partite concluse prima del ${dayShort(before)}.`),
    h('div', {class: 'grid g2', 'data-testid': 'analysis'},
      box('Confronto statistico', cmpRows(fake, A, B)),
      h('div', {class: 'stack'},
        A?.form?.length ? box('Andamento (punti cumulati)', lineChart([[teamA, ptsLine(A), 'var(--back)'], ...(B ? [[teamB, ptsLine(B), 'var(--lay)']] : [])])) : null,
        A?.goalsByBand ? box('Gol segnati per fascia di minuti', barChart(['0–15', '16–30', '31–45', '46–60', '61–75', '76–90'], [[teamA, A.goalsByBand, 'var(--back)'], ...(B?.goalsByBand ? [[teamB, B.goalsByBand, 'var(--lay)']] : [])])) : box('Gol per fascia', strip('UNAVAILABLE', 'Minuti dei gol non disponibili in REAL.')),
        box(`Partite di ${teamA}`, tableOf(teamA, A)), B ? box(`Partite di ${teamB}`, tableOf(teamB, B)) : null))];
}});

// ================================================================ Replay (UI-06, #24) — deterministic, DEMO events
view({id: 'replay', title: 'Replay', phase: 'UI-06', issues: ['#24', '#25'], render(params) {
  if (isReal()) return [head('Replay', {chips: [chip('UNAVAILABLE')]}), strip('UNAVAILABLE', 'Il replay richiede gli eventi live storici, non raccolti (TotalCorner sospeso). Disponibile in DEMO.')];
  const id = params.get('id');
  const m0 = id ? demoMatchById(id) : null;
  if (!m0 || liveState(m0).status !== 'FT') {
    const comp = params.get('comp') || '';
    const list = [];
    for (let i = 0; i < 10 && list.length < 30; i++) for (const m of demoDay(addDays(today(), -i)).map(withState)) if (m.status === 'FT' && (!comp || m.comp.id === comp)) list.push(m);
    return [head('Replay', {sub: 'Partite concluse da rivedere minuto per minuto', chips: [chip('DEMO')], issues: ['UI-06', '#24']}), dataStrip('DEMO'),
      id ? h('div', {class: 'state partial', style: {marginBottom: '14px'}}, 'Il replay è disponibile solo per le partite concluse.') : null,
      h('div', {class: 'card row', style: {marginBottom: '14px'}}, h('label', {class: 'f inl'}, 'Campionato', h('select', {ctl: 'CTL-REPLAY-COMP', onchange: e => go('replay', {comp: e.target.value})},
        h('option', {value: ''}, 'Tutti'), COMPS.map(c => h('option', {value: c.id, selected: c.id === comp}, c.name))))),
      list.length ? h('section', {class: 'card', 'data-testid': 'replay-list'}, h('div', {class: 'mlist'}, list.slice(0, 30).map(m => h('div', {class: 'row', style: {justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)'}},
        h('span', {}, h('b', {}, `${m.home} – ${m.away}`), h('span', {class: 'muted small'}, ` · ${m.comp.name} · ${dayShort(m.date)}`)),
        h('a', {class: 'btn sm', href: href('replay', {id: m.id}), ctl: 'CTL-REPLAY-OPEN'}, 'Apri replay')))))
        : emptyState('Nessuna partita conclusa.')];
  }
  const m = m0;
  const defs = lib.strategies().filter(d => d.phase === 'LIVE');
  const st = {minute: Number(params.get('t')) >= 0 && Number(params.get('t')) <= 90 ? Number(params.get('t')) : 0, playing: false, speed: 4, hide: settings().hide_scores, strat: '', entries: []};
  const scoreEl = h('span', {class: 'big', 'data-testid': 'replay-score'});
  const minEl = h('span', {class: 'chip', 'data-testid': 'replay-minute'});
  const finalEl = h('span', {class: 'muted small', 'data-testid': 'replay-final'});
  const slider = h('input', {type: 'range', min: 0, max: 90, step: 1, value: st.minute, ctl: 'CTL-REPLAY-SLIDER', 'aria-label': 'Minuto del replay', style: {width: '100%'}});
  const oddsEl = h('div', {class: 'odds', style: {gridTemplateColumns: 'repeat(4,minmax(0,1fr))'}});
  const statsEl = h('dl', {class: 'kv small'});
  const tl = h('div', {class: 'tl', 'data-testid': 'replay-timeline'});
  const mom = h('div', {});
  const simEl = h('div', {class: 'small', 'data-testid': 'replay-sim'});
  const play = h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-REPLAY-PLAY', 'aria-pressed': 'false'}, 'Riproduci');
  // The simulation of a strategy during the replay: entry at the first minute where it is ARMED, settled on the final score.
  const simulate = () => {
    st.entries = [];
    const d = defs.find(x => x.key === st.strat);
    if (!d) return;
    for (let minute = 1; minute < 90; minute++) { const s0 = stateAt(m, minute); const r = evaluateDef(d, m, {...s0, minute}); if (r.trade) { st.entries.push({minute, sel: r.sel, price: r.price, d}); break; } }
  };
  const update = () => {
    const now = stateAt(m, st.minute);
    slider.value = st.minute;
    scoreEl.textContent = `${now.score[0]}–${now.score[1]}`;
    minEl.textContent = st.minute === 0 ? 'Pre-partita' : st.minute >= 90 ? 'Fine' : `${st.minute}'`;
    finalEl.textContent = st.hide && st.minute < 90 ? 'Risultato finale nascosto' : `Finale ${m.final[0]}–${m.final[1]}`;
    const p = now.live;
    oddsEl.replaceChildren(oddBox('1', p?.h), oddBox('X', p?.d), oddBox('2', p?.a), oddBox('O 2,5', p?.o25, 'Over 2,5'));
    const S = now.stats;
    statsEl.replaceChildren(...[['Possesso %', S.poss], ['Tiri', S.shots], ['Tiri in porta', S.sot], ['Angoli', S.corners], ['Cartellini', S.cards], ['xG', S.xg.map(x => nf(x))]].flatMap(([k, [a, b]]) => [h('dt', {}, k), h('dd', {}, `${a} – ${b}`)]));
    tl.replaceChildren(...m.events.filter(e => e.type !== 'CORNER' && (!st.hide || e.min <= st.minute)).map(e => h('div', {class: e.min > st.minute ? 'future' : ''}, h('span', {class: 'min'}, `${e.min}'`),
      h('span', {}, e.type === 'GOAL' ? '⚽' : e.type === 'RED' ? '🟥' : '🟨'), h('span', {}, e.side ? m.away : m.home))),
    ...st.entries.filter(e => e.minute <= st.minute).map(e => h('div', {style: {background: 'var(--lay-bg)'}}, h('span', {class: 'min'}, `${e.minute}'`), h('span', {}, '▶'), h('span', {}, `ENTRY ${e.d.name}: ${SIDE_TEXT[e.d.side]} ${selectionText(e.d.market, e.sel)} @ ${odd(e.price)}`))));
    mom.replaceChildren(momentumChart(m, Math.max(1, st.minute)));
    const e = st.entries[0];
    simEl.replaceChildren(!st.strat ? h('span', {class: 'muted'}, 'Nessuna strategia: solo replay.') : !e ? h('span', {class: 'muted'}, 'La strategia non entra in questa partita.')
      : e.minute > st.minute ? h('span', {class: 'muted'}, 'Ingresso non ancora avvenuto.')
        : (() => { const stake = settings().default_stake; const win = winsSelection(e.d.market, e.sel, m.final); const pl = legPL({side: e.d.side, odds: e.price, stake}, win);
          return st.minute >= 90 ? h('span', {}, `Ingresso al ${e.minute}' · puntata ${money(stake)} · esito ${win ? 'vinta' : 'persa'} · P/L ${signed(pl)} (simulazione del replay, non registrata)`) : h('span', {}, `Ingresso al ${e.minute}' @ ${odd(e.price)} · in attesa della fine`); })());
    play.textContent = st.playing ? 'Pausa' : st.minute >= 90 ? 'Ricomincia' : 'Riproduci';
    play.setAttribute('aria-pressed', String(st.playing));
  };
  let timer = null;
  const stop = () => { st.playing = false; if (timer) clearInterval(timer); timer = null; };
  const start = () => {
    if (st.minute >= 90) st.minute = 0;
    st.playing = true;
    timer = every(Math.round(1000 / st.speed), () => { st.minute = Math.min(90, st.minute + 1); if (st.minute >= 90) stop(); update(); });
  };
  play.addEventListener('click', () => { if (st.playing) stop(); else start(); update(); });
  slider.addEventListener('input', () => { st.minute = Number(slider.value); update(); });
  const speedSeg = seg('CTL-REPLAY-SPEED', [['1', '1×'], ['4', '4×'], ['16', '16×']], String(st.speed), v => {
    st.speed = Number(v); $$('button', speedSeg).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
    if (st.playing) { stop(); start(); } update();
  }, 'Velocità');
  const spoiler = h('button', {class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(st.hide), 'aria-label': 'Nascondi il finale', ctl: 'CTL-REPLAY-SPOILER',
    onclick: e => { st.hide = !st.hide; e.currentTarget.setAttribute('aria-checked', String(st.hide)); update(); }});
  const stratSel = h('select', {ctl: 'CTL-REPLAY-STRAT', 'aria-label': 'Strategia nel replay', onchange: e => { stop(); st.strat = e.target.value; simulate(); update(); }},
    h('option', {value: ''}, 'Nessuna — solo replay'), defs.map(d => h('option', {value: d.key}, d.name)));
  queueMicrotask(update);
  return [h('div', {class: 'crumbs'}, h('a', {href: href('replay'), ctl: 'CTL-REPLAY-BACK'}, '← Tutte le partite da rivedere')),
    head(`Replay · ${m.home} – ${m.away}`, {sub: `${m.comp.name} · ${dayLong(m.date)}`, chips: [chip('DEMO', 'Eventi dimostrativi, non raccolti live')], issues: ['UI-06', '#24']}),
    strip('DEMO', 'DEMO REPLAY: eventi e quote generati in modo deterministico; nessun dato futuro è mostrato prima del suo minuto.'),
    h('section', {class: 'hero', 'data-testid': 'replay-player'},
      h('div', {class: 'board'}, h('span', {class: 'tm'}, h('b', {}, m.home)), h('span', {class: 'mid'}, scoreEl, h('br'), minEl, h('br'), finalEl), h('span', {class: 'tm r'}, h('b', {}, m.away))),
      slider,
      h('div', {class: 'row', style: {marginTop: '10px', justifyContent: 'space-between'}},
        h('div', {class: 'row'}, h('button', {class: 'btn', type: 'button', ctl: 'CTL-REPLAY-BACKSTEP', 'aria-label': 'Un minuto indietro', onclick: () => { stop(); st.minute = Math.max(0, st.minute - 1); update(); }}, '−1′'),
          play, h('button', {class: 'btn', type: 'button', ctl: 'CTL-REPLAY-FWD', 'aria-label': 'Un minuto avanti', onclick: () => { stop(); st.minute = Math.min(90, st.minute + 1); update(); }}, '+1′'),
          h('button', {class: 'btn', type: 'button', ctl: 'CTL-REPLAY-RESET', onclick: () => { stop(); st.minute = 0; update(); }}, 'Dall’inizio'), speedSeg),
        h('label', {class: 'f inl'}, 'Nascondi il finale', spoiler))),
    h('div', {class: 'grid g2'},
      h('div', {class: 'stack'}, h('section', {class: 'card'}, h('h2', {}, 'Quote al minuto'), oddsEl), h('section', {class: 'card'}, h('h2', {}, 'Statistiche al minuto'), statsEl),
        h('section', {class: 'card'}, h('h2', {}, 'Strategia nel replay'), h('label', {class: 'f'}, 'Strategia live', stratSel), h('div', {style: {marginTop: '8px'}}, simEl),
          defs.length ? null : h('p', {class: 'notice'}, 'Nessuna strategia live: creane una nello Strategy Lab con fase «In partita».'))),
      h('div', {class: 'stack'}, h('section', {class: 'card'}, h('h2', {}, 'Momentum'), mom), h('section', {class: 'card'}, h('h2', {}, 'Cronologia'), tl)))];
}});
