
// ================================================================ Strategy Lab (UI-07, #34)
// DEMO library: [{key, active, versions: [{version, at, def}]}]; a save with different rules or name makes a new
// immutable version, the same content saves nothing. Activation is simulated only (copilot, signals): no order.
lib.strategiesRaw = () => store.get('strategiesV2', []);
lib.setStrategiesRaw = list => store.set('strategiesV2', list);
lib.strategies = () => lib.strategiesRaw().map(s => ({...s.versions.at(-1).def, key: s.key, version: s.versions.at(-1).version, active: !!s.active, updated_at: s.versions.at(-1).at, src: 'DEMO'}));
const defContent = d => JSON.stringify({name: d.name.trim(), market: d.market, selection: d.selection, side: d.side, phase: d.phase ?? 'PREMATCH',
  conditions: (d.conditions ?? []).map(c => ({field: c.field, op: c.op, a: Number(c.a), b: c.op === 'between' ? Number(c.b) : null})),
  team: d.team?.trim() ?? '', venue: d.team?.trim() ? d.venue ?? 'ANY' : 'ANY', competitions: [...(d.competitions ?? [])].sort()});
function saveDemoStrategy(def) {
  const list = lib.strategiesRaw();
  let key = def.key;
  if (!key) {
    // A new name whose slug is already taken by a different strategy gets its own key, never a version of the other one.
    const base = slugKey(def.name), sameName = k => list.find(x => x.key === k)?.versions.at(-1)?.def.name.trim() === def.name.trim();
    key = base;
    for (let i = 2; list.some(x => x.key === key) && !sameName(key); i++) key = `${base.slice(0, 59)}-${i}`;
  }
  const clean = JSON.parse(defContent(def));
  let s = list.find(x => x.key === key);
  if (!s) { s = {key, active: false, versions: []}; list.push(s); }
  const cur = s.versions.at(-1);
  if (cur && defContent(cur.def) === defContent(clean)) return {status: 'UNCHANGED', key, version: cur.version};
  s.versions.push({version: (cur?.version ?? 0) + 1, at: new Date().toISOString(), def: clean});
  lib.setStrategiesRaw(list);
  return {status: 'SAVED', key, version: s.versions.at(-1).version};
}
async function strategyList() { return isReal() ? REAL.strategies() : lib.strategies(); }
const BLANK_DEF = {name: '', market: 'MATCH_ODDS', selection: 'FAVOURITE', side: 'BACK', phase: 'PREMATCH', conditions: [{field: 'sel_odds', op: 'between', a: 1.5, b: 2.2}], team: '', venue: 'ANY', competitions: []};
view({id: 'strategies', title: 'Strategy Lab', phase: 'UI-07', issues: ['#34', '#30'], loadingText: 'delle strategie', async render(params) {
  if (params.has('edit') || params.has('new')) return strategyEditor(params);
  if (params.get('versions')) return strategyVersions(params.get('versions'));
  let list, err = null;
  try { list = await strategyList(); } catch (e) { err = e; list = []; }
  const cols = ['Strategia', 'Versione', 'Regole', 'Attiva (simulata)', 'Azioni'];
  const fileIn = h('input', {type: 'file', accept: 'application/json,.json', ctl: 'CTL-STRAT-IMPORT', 'aria-label': 'Importa strategie da file JSON', disabled: isReal(), onchange: async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const arr = Array.isArray(data) ? data : [data];
      let n = 0, bad = 0;
      for (const d of arr) { const def = {...BLANK_DEF, conditions: [], ...d}; if (defIssues(def).length) { bad++; continue; } saveDemoStrategy(def); n++; }
      toast(`Importate ${n} strategie${bad ? `, ${bad} scartate perché non valide` : ''}`, bad && !n ? 'bad' : 'ok'); render();
    } catch { toast('File non valido: serve un JSON di strategie.', 'bad'); }
  }});
  return [head('Strategy Lab', {sub: 'Regole, versioni, attivazione simulata', chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-07', '#34'],
    actions: [h('a', {class: 'btn pri', href: href('strategies', {new: 1}), ctl: 'CTL-STRAT-NEW'}, 'Nuova strategia')]}),
  isReal() ? strip('REAL', 'Strategie dell’archivio del server (1X2, intervalli di quota, squadra). Salvare richiede l’accesso owner e l’archivio attivo.') : dataStrip('DEMO', 'Le strategie restano in questo browser.'),
  err ? h('div', {class: 'state error', role: 'alert', 'data-testid': 'strat-error', 'data-code': err.code}, refusalText(err)) : null,
  h('section', {class: 'card', 'data-testid': 'strat-list'}, h('h2', {}, `Strategie (${list.length})`, h('span', {class: 'right row'},
    h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-STRAT-EXPORT', disabled: !list.length, onclick: () => { download('matchpilot-strategie.json', JSON.stringify(list.map(({src, ...d}) => d), null, 2), 'application/json'); toast('Strategie esportate', 'ok'); }}, 'Esporta JSON'),
    h('label', {class: 'btn sm', style: isReal() ? {opacity: .5} : null}, 'Importa JSON', h('span', {class: 'sr'}, fileIn)))),
  list.length ? h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
    h('tbody', {}, list.map(d => h('tr', {'data-key': d.key}, [
      h('td', {}, h('b', {}, d.name), h('div', {class: 'xs muted'}, d.phase === 'LIVE' ? 'In partita' : 'Pre-partita')),
      h('td', {}, `v${d.version}`),
      h('td', {class: 'small'}, h('ul', {style: {margin: 0, paddingLeft: '16px'}}, rulesText(d).map(t => h('li', {}, t)))),
      h('td', {}, h('button', {class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!d.active), 'aria-label': `Attiva ${d.name} in simulazione`, ctl: 'CTL-STRAT-ACTIVE', disabled: isReal(),
        title: isReal() ? 'Attivazione simulata disponibile solo in DEMO' : null, onclick: () => {
          const raw = lib.strategiesRaw(); const s0 = raw.find(x => x.key === d.key); s0.active = !s0.active; lib.setStrategiesRaw(raw);
          toast(s0.active ? `«${d.name}» attiva in simulazione: Copilot e segnali la usano` : `«${d.name}» disattivata`, 'ok'); render();
        }})),
      h('td', {}, h('div', {class: 'row'},
        h('a', {class: 'btn sm', href: href('strategies', {edit: d.key}), ctl: 'CTL-STRAT-EDIT'}, 'Modifica'),
        h('a', {class: 'btn sm', href: href('backtest', {strategy: d.key}), ctl: 'CTL-STRAT-BT'}, 'Backtest'),
        h('a', {class: 'btn sm', href: href('strategies', {versions: d.key}), ctl: 'CTL-STRAT-VERSIONS'}, 'Versioni'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-STRAT-DUP', disabled: isReal(), onclick: () => { const r = saveDemoStrategy({...d, key: '', name: `${d.name} (copia)`}); toast(`Duplicata come v${r.version}`, 'ok'); render(); }}, 'Duplica'),
        h('button', {class: 'btn sm danger', type: 'button', ctl: 'CTL-STRAT-DELETE', disabled: isReal(), title: isReal() ? 'Le strategie del server non si eliminano' : null, onclick: async () => {
          if (!await confirmDialog('Eliminare la strategia?', `«${d.name}» e tutte le sue ${d.version} versioni verranno eliminate da questo browser.`, {ok: 'Elimina', danger: true})) return;
          lib.setStrategiesRaw(lib.strategiesRaw().filter(x => x.key !== d.key)); toast('Strategia eliminata'); render();
        }}, 'Elimina')))].map((td, i) => (td.setAttribute('data-label', cols[i]), td)))))))
    : emptyState('Nessuna strategia salvata.', h('a', {href: href('strategies', {new: 1}), ctl: 'CTL-STRAT-NEW'}, 'Creane una'))),
  ];
}});
async function strategyEditor(params) {
  const list = await strategyList();
  const key = params.get('edit');
  const base = key ? list.find(d => d.key === key) : null;
  if (key && !base) return [head('Strategia non trovata'), emptyState('Nessuna strategia con questo nome.', h('a', {href: href('strategies'), ctl: 'CTL-STRAT-CANCEL'}, 'Torna alle strategie'))];
  const def = JSON.parse(JSON.stringify(base ?? BLANK_DEF));
  def.conditions = def.conditions ?? [];
  const errs = h('div', {role: 'alert', 'data-testid': 'strat-errors'});
  const preview = h('div', {class: 'small', 'data-testid': 'strat-preview', 'aria-live': 'polite'});
  const condBox = h('div', {});
  const name = h('input', {type: 'text', value: def.name, maxlength: 80, required: true, ctl: 'CTL-STRAT-NAME', placeholder: 'es. Favorito in casa', readonly: !!key && isReal()});
  const market = h('select', {ctl: 'CTL-STRAT-MARKET'}, Object.entries(MARKETS).map(([k, t]) => h('option', {value: k, selected: def.market === k}, t)));
  const selection = h('select', {ctl: 'CTL-STRAT-SEL'});
  const side = h('select', {ctl: 'CTL-STRAT-SIDE'}, Object.entries(SIDE_TEXT).map(([k, t]) => h('option', {value: k, selected: def.side === k}, t)));
  const phase = h('select', {ctl: 'CTL-STRAT-PHASE'}, [['PREMATCH', 'Pre-partita'], ['LIVE', 'In partita (live)']].map(([k, t]) => h('option', {value: k, selected: (def.phase ?? 'PREMATCH') === k}, t)));
  const team = h('input', {type: 'text', value: def.team ?? '', ctl: 'CTL-STRAT-TEAM', placeholder: 'es. Inter', list: 'teamlist'});
  const venue = h('select', {ctl: 'CTL-STRAT-VENUE'}, [['ANY', 'Casa o trasferta'], ['HOME', 'Solo in casa'], ['AWAY', 'Solo in trasferta']].map(([k, t]) => h('option', {value: k, selected: (def.venue ?? 'ANY') === k}, t)));
  const comps = h('fieldset', {}, h('legend', {}, 'Campionati (nessuno = tutti)'), h('div', {class: 'row'}, COMPS.map(c => h('label', {class: 'f inl small'},
    h('input', {type: 'checkbox', value: c.id, checked: (def.competitions ?? []).includes(c.id), ctl: 'CTL-STRAT-COMP', disabled: isReal()}), c.name))));
  const fillSel = () => selection.replaceChildren(...SELECTIONS[market.value].map(([k, t]) => h('option', {value: k, selected: def.selection === k}, t)));
  fillSel();
  const read = () => ({key: base?.key ?? '', name: name.value.trim(), market: market.value, selection: selection.value, side: side.value, phase: phase.value,
    conditions: def.conditions, team: team.value.trim(), venue: venue.value, competitions: $$('input[type=checkbox]', comps).filter(c => c.checked).map(c => c.value)});
  const drawConds = () => condBox.replaceChildren(...(def.conditions.length ? def.conditions.map((c, i) => {
    const fieldSel = h('select', {ctl: 'CTL-COND-FIELD', 'aria-label': `Campo della condizione ${i + 1}`}, Object.entries(FIELDS).map(([k, f]) => h('option', {value: k, selected: c.field === k, disabled: f.phase === 'LIVE' && phase.value !== 'LIVE'}, f.label)));
    const op = h('select', {ctl: 'CTL-COND-OP', 'aria-label': `Operatore della condizione ${i + 1}`}, Object.entries(OPS).map(([k, t]) => h('option', {value: k, selected: c.op === k}, t)));
    const a = h('input', {type: 'number', step: 'any', value: c.a, ctl: 'CTL-COND-A', 'aria-label': `Valore della condizione ${i + 1}`});
    const b = h('input', {type: 'number', step: 'any', value: c.b ?? '', ctl: 'CTL-COND-B', 'aria-label': `Secondo valore della condizione ${i + 1}`, disabled: c.op !== 'between'});
    fieldSel.onchange = () => { c.field = fieldSel.value; changed(); };
    op.onchange = () => { c.op = op.value; b.disabled = c.op !== 'between'; changed(); };
    a.oninput = () => { c.a = a.value; changed(); };
    b.oninput = () => { c.b = b.value; changed(); };
    return h('div', {class: 'rule', 'data-cond': i}, h('label', {class: 'f'}, 'Campo', fieldSel), h('label', {class: 'f'}, 'Operatore', op), h('label', {class: 'f'}, 'Valore', a), h('label', {class: 'f'}, 'e', b),
      h('button', {class: 'btn sm danger del', type: 'button', ctl: 'CTL-COND-DEL', 'aria-label': `Rimuovi la condizione ${i + 1}`, onclick: () => { def.conditions.splice(i, 1); drawConds(); changed(); }}, 'Rimuovi'));
  }) : [h('p', {class: 'muted small'}, 'Nessuna condizione: la strategia opera su ogni partita.')]));
  let pt = null;
  const changed = () => { clearTimeout(pt); pt = setTimeout(doPreview, 250); };
  const doPreview = () => {
    const d = read();
    const issues = defIssues(d);
    errs.replaceChildren(...(issues.length ? [h('ul', {class: 'err', style: {margin: 0}}, issues.map(t => h('li', {}, t)))] : []));
    if (isReal()) { const r = toRealParams(d); preview.replaceChildren(r.params ? h('span', {class: 'ok'}, 'Regole compatibili con il motore reale.') : h('span', {class: 'warn'}, `Non salvabile sul server: ${r.why}`)); return; }
    if (issues.length) { preview.replaceChildren(h('span', {class: 'muted'}, 'Anteprima non disponibile finché le regole non sono valide.')); return; }
    let seen = 0, hits = 0; const ex = [];
    for (let i = 1; i <= 30; i++) for (const m of demoDay(addDays(today(), -i))) {
      seen++;
      const r = d.phase === 'LIVE' ? (() => { for (let mi = 1; mi < 90; mi += 3) { const s0 = stateAt(m, mi); const x = evaluateDef(d, m, {...s0, minute: mi}); if (x.trade) return x; } return {trade: false}; })() : evaluateDef(d, m);
      if (r.trade) { hits++; if (ex.length < 3) ex.push(`${m.home} – ${m.away} (${selectionText(d.market, r.sel)} @ ${odd(r.price)})`); }
    }
    preview.replaceChildren(h('b', {}, `${hits} partite su ${seen}`), ' negli ultimi 30 giorni soddisfano le regole', ex.length ? h('div', {class: 'muted'}, `Esempi: ${ex.join('; ')}`) : null);
  };
  for (const el of [name, team]) el.addEventListener('input', changed);
  for (const el of [selection, side, venue]) el.addEventListener('change', changed);
  market.addEventListener('change', () => { def.selection = SELECTIONS[market.value][0][0]; fillSel(); changed(); });
  phase.addEventListener('change', () => { drawConds(); changed(); });
  comps.addEventListener('change', changed);
  drawConds();
  let busy = false;
  const save = h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-STRAT-SAVE', onclick: async () => {
    if (busy) return;
    const d = read();
    const issues = defIssues(d);
    if (issues.length) { doPreview(); errs.querySelector('ul')?.setAttribute('tabindex', '-1'); toast('Correggi gli errori indicati', 'bad'); name.focus(); return; }
    busy = true; save.disabled = true; save.setAttribute('aria-busy', 'true');
    try {
      let r;
      if (isReal()) { const res = await REAL.saveStrategy({...d, key: d.key || slugKey(d.name)}); r = res.data; }
      else r = saveDemoStrategy(d);
      toast(r.status === 'UNCHANGED' ? `Nessuna modifica: resta la versione ${r.version}` : `Salvata, versione ${r.version}`, 'ok');
      go('strategies', {});
    } catch (e) { errs.replaceChildren(h('p', {class: 'err', 'data-code': e.code}, refusalText(e))); }
    finally { busy = false; save.disabled = false; save.removeAttribute('aria-busy'); }
  }}, 'Salva');
  queueMicrotask(doPreview);
  return [head(key ? `Modifica: ${base.name}` : 'Nuova strategia', {crumbs: h('a', {href: href('strategies'), ctl: 'CTL-STRAT-CANCEL'}, '← Strategy Lab'), chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-07', '#34']}),
    h('datalist', {id: 'teamlist'}, COMPS.flatMap(c => c.teams).map(t => h('option', {value: t}))),
    h('div', {class: 'grid g2'},
      h('section', {class: 'card', 'data-testid': 'strat-editor'}, h('h2', {}, 'Regole'),
        h('div', {class: 'fields'}, h('label', {class: 'f'}, 'Nome', name), h('label', {class: 'f'}, 'Fase', phase), h('label', {class: 'f'}, 'Mercato', market),
          h('label', {class: 'f'}, 'Selezione', selection), h('label', {class: 'f'}, 'Lato', side), h('label', {class: 'f'}, 'Squadra (facoltativa)', team), h('label', {class: 'f'}, 'Sede della squadra', venue)),
        h('h3', {}, 'Condizioni (tutte devono valere)'), condBox,
        h('button', {class: 'btn sm', type: 'button', style: {marginTop: '8px'}, ctl: 'CTL-STRAT-ADDCOND', onclick: () => { def.conditions.push({field: 'sel_odds', op: 'gte', a: 1.5, b: ''}); drawConds(); changed(); }}, '+ Aggiungi condizione'),
        h('div', {style: {marginTop: '12px'}}, comps), errs,
        h('div', {class: 'row', style: {marginTop: '12px'}}, save, h('a', {class: 'btn', href: href('strategies'), ctl: 'CTL-STRAT-CANCEL'}, 'Annulla'),
          h('button', {class: 'btn', type: 'button', ctl: 'CTL-STRAT-TRYBT', onclick: () => { const d = read(); if (defIssues(d).length) { doPreview(); return; } store.set('draftDef', d); go('backtest', {draft: 1}); }}, 'Prova nel backtest'))),
      h('section', {class: 'card'}, h('h2', {}, 'Anteprima'), preview, h('p', {class: 'notice'}, 'L’attivazione è solo simulata: una strategia attiva alimenta segnali e Copilot, non apre ordini reali.')))];
}
function strategyVersions(key) {
  if (isReal()) return [head('Versioni'), strip('UNAVAILABLE', 'In REAL le versioni si consultano dall’API (/api/v1/strategies?key=…&version=…); vista non ancora disponibile.'), h('a', {class: 'btn', href: href('strategies'), ctl: 'CTL-STRAT-CANCEL'}, '← Strategy Lab')];
  const s0 = lib.strategiesRaw().find(x => x.key === key);
  if (!s0) return [head('Strategia non trovata'), emptyState('Nessuna strategia con questo nome.', h('a', {href: href('strategies'), ctl: 'CTL-STRAT-CANCEL'}, 'Torna alle strategie'))];
  const cols = ['Versione', 'Data', 'Nome', 'Regole', ''];
  return [head(`Versioni: ${s0.versions.at(-1).def.name}`, {crumbs: h('a', {href: href('strategies'), ctl: 'CTL-STRAT-CANCEL'}, '← Strategy Lab'), chips: [chip('DEMO')]}),
    h('section', {class: 'card', 'data-testid': 'strat-versions'}, h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))),
      h('tbody', {}, [...s0.versions].reverse().map((v, i) => h('tr', {'data-version': v.version}, [h('td', {}, `v${v.version}`, i === 0 ? h('span', {class: 'chip ok', style: {marginLeft: '6px'}}, 'in uso') : null),
        h('td', {}, when(v.at)), h('td', {}, v.def.name), h('td', {class: 'small'}, rulesText(v.def).join(' · ')),
        h('td', {}, i === 0 ? '' : h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-STRAT-RESTORE', onclick: () => { const r = saveDemoStrategy({...v.def, key}); toast(`Ripristinata come v${r.version}`, 'ok'); render(); }}, 'Ripristina'))]
        .map((td, k) => (td.setAttribute('data-label', cols[k] || 'Azione'), td))))))))];
}

// ================================================================ Backtest (UI-08, #34)
lib.saved = () => store.get('savedBacktests', []);
lib.setSaved = list => store.set('savedBacktests', list);
function equityChart(series) {
  const W = 640, H = 200, P = 34;
  const all = series.flatMap(([, c]) => c.map(p => p.y));
  const mn = Math.min(0, ...all), mx = Math.max(0, ...all), n = Math.max(2, ...series.map(([, c]) => c.length));
  const y = v => 10 + (H - 30) * (1 - (v - mn) / ((mx - mn) || 1));
  return [s('svg', {class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Curva del profitto netto cumulato'},
    s('line', {x1: P, x2: W, y1: y(0), y2: y(0), stroke: 'var(--line-2)', 'stroke-dasharray': '4 4'}),
    s('text', {x: 2, y: y(mx) + 4}, nf(mx, 0)), s('text', {x: 2, y: y(mn) + 4}, nf(mn, 0)),
    series.map(([, c, col]) => s('polyline', {fill: 'none', stroke: col, 'stroke-width': 2, points: c.map((p, i) => `${P + i * (W - P - 6) / (n - 1)},${y(p.y)}`).join(' ')}))),
  series.length > 1 ? h('div', {class: 'legend'}, series.map(([nm, , col]) => h('span', {}, h('i', {style: {background: col}}), nm))) : null];
}
const SKIP_TEXT = {CONDITIONS: 'Condizioni non soddisfatte', COMPETITION: 'Campionato escluso', TEAM: 'Squadra o sede diversa', NO_SELECTION: 'Selezione non determinabile', MONEY: 'Bloccata dalla gestione del capitale'};
function btResult(res, {saveable = true, query = null} = {}) {
  const page = Number(store.get('btPage', 1)) || 1, size = 20, pages = Math.max(1, Math.ceil(res.bets.length / size)), pg = Math.min(page, pages);
  const months = Object.entries(res.byMonth ?? {}).sort();
  const nameIn = h('input', {type: 'text', maxlength: 80, placeholder: 'Nome della simulazione', ctl: 'CTL-BT-NAME', 'aria-label': 'Nome della simulazione'});
  let busy = false;
  const saveBtn = h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-BT-SAVE', onclick: async () => {
    if (busy) return;
    const nm = nameIn.value.trim();
    if (!nm) { toast('Scrivi un nome prima di salvare', 'bad'); nameIn.focus(); return; }
    busy = true; saveBtn.disabled = true;
    try {
      if (res.src === 'REAL') { const r = await REAL.saveBacktest(nm, query ?? res.query ?? {}); toast(r.data?.status === 'ALREADY_SAVED' ? `Già salvata (n. ${r.data.backtest_id})` : `Salvata sul server (n. ${r.data?.backtest_id})`, 'ok'); }
      else {
        const list = lib.saved();
        const dup = list.find(x => JSON.stringify([x.result.def, x.result.cfg]) === JSON.stringify([res.def, res.cfg]));
        if (dup) toast(`Già salvata come «${dup.name}»`, 'ok');
        else { list.unshift({id: `bt-${Date.now().toString(36)}`, name: nm, at: new Date().toISOString(), result: {...res, bets: res.bets.slice(0, 3000)}}); lib.setSaved(list.slice(0, 40)); toast('Simulazione salvata in questo browser', 'ok'); }
      }
    } catch (e) { toast(refusalText(e), 'bad'); }
    finally { busy = false; saveBtn.disabled = false; }
  }}, 'Salva');
  const csv = () => download(`matchpilot-backtest-${res.cfg.from}-${res.cfg.to}.csv`, ['data;partita;selezione;lato;quota;puntata;minuto;risultato;esito;netto',
    ...res.bets.map(b => [b.date, b.match, b.sel, b.side, b.odds, b.stake, b.minute ?? '', b.score, b.win ? 'vinta' : 'persa', b.net].join(';'))].join('\n'), 'text/csv');
  const cols = ['Data', 'Partita', 'Operazione', 'Quota', 'Puntata', 'Risultato', 'Netto'];
  const shown = res.bets.slice((pg - 1) * size, pg * size);
  return [h('section', {class: 'card', 'data-testid': 'bt-result', 'data-bets': res.bets.length, 'data-src': res.src},
    h('h2', {}, 'Risultato', chip(res.src), h('span', {class: `chip ${(res.pit ?? 'PIT') === 'PIT' ? 'ok' : 'bad'}`, 'data-testid': 'bt-pit', title: (res.pit ?? 'PIT') === 'PIT' ? 'Point-in-time: solo dati noti al momento della decisione' : 'Usa prezzi acquisiti dopo la decisione: risultato esplorativo, non evidenza di redditività'},
      (res.pit ?? 'PIT') === 'PIT' ? 'PIT' : 'NON_PIT'), res.src === 'REAL' ? h('span', {class: 'chip warn'}, 'Non certificato') : h('span', {class: 'chip warn'}, 'Dati DEMO: non è una previsione di guadagno')),
    h('div', {class: 'grid g4'}, kpi('Profitto netto', signed(res.plNet), `lordo ${signed(res.plGross)} · commissioni ${nf(res.commission)}`, {'data-kpi': 'pl'}),
      kpi('Operazioni', nint(res.bets.length), `${res.won} vinte · ${res.lost} perse`, {'data-kpi': 'bets'}), kpi('Rendimento sul rischio', pct(res.roi), `strike rate ${pct(res.strike)}`, {'data-kpi': 'roi'}),
      kpi('Massimo calo', nf(res.maxDrawdown), `quota media ${odd(res.avgOdds)}`, {'data-kpi': 'dd'})),
    res.curve?.length > 1 ? h('div', {style: {marginTop: '12px'}}, equityChart([['P/L', res.curve, 'var(--accent)']])) : null,
    h('p', {class: 'small muted'}, `Partite lette: ${nint(res.events)} · puntato ${nf(res.staked)} · capitale a rischio ${nf(res.exposure)} · cassa finale ${nf(res.finalCash)}.`,
      Object.keys(res.skipped ?? {}).length ? ` Escluse: ${Object.entries(res.skipped).map(([k, v]) => `${SKIP_TEXT[k] ?? k} ${v}`).join(', ')}.` : '')),
  months.length ? h('section', {class: 'card'}, h('h2', {}, 'Per mese'), h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Mese'), h('th', {class: 'n'}, 'Operazioni'), h('th', {class: 'n'}, 'Netto'))),
    h('tbody', {}, months.map(([mo, x]) => h('tr', {}, h('td', {}, mo), h('td', {class: 'n'}, x.bets), h('td', {class: `n ${x.net >= 0 ? 'ok' : 'bad'}`}, signed(x.net)))))))) : null,
  h('section', {class: 'card', 'data-testid': 'bt-bets'}, h('h2', {}, 'Operazioni', h('span', {class: 'right'}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-BT-CSV', disabled: !res.bets.length, onclick: csv}, 'Esporta CSV'))),
    res.bets.length ? [h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, cols.map(c => h('th', {}, c)))), h('tbody', {}, shown.map(b => h('tr', {}, [
      h('td', {}, b.date ? dayShort(b.date) : ND), h('td', {}, String(b.id).startsWith('demo:') ? h('a', {href: href('match', {id: b.id}), ctl: 'CTL-MATCH-OPEN'}, b.match) : b.match),
      h('td', {}, `${SIDE_TEXT[b.side]} ${selectionText(res.def.market, b.sel)}${b.minute ? ` al ${b.minute}'` : ''}`), h('td', {class: 'n'}, odd(b.odds)), h('td', {class: 'n'}, nf(b.stake)),
      h('td', {}, b.score || '', ' ', h('span', {class: b.win ? 'ok' : 'bad'}, b.win ? 'vinta' : 'persa')), h('td', {class: `n ${b.net >= 0 ? 'ok' : 'bad'}`}, signed(b.net))].map((td, i) => (td.setAttribute('data-label', cols[i]), td))))))),
    h('div', {class: 'row', style: {justifyContent: 'space-between', marginTop: '8px'}}, h('span', {class: 'small muted'}, `Pagina ${pg} di ${pages}`),
      h('div', {class: 'row'}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-BT-PREV', disabled: pg <= 1, onclick: () => { store.set('btPage', pg - 1); refreshInPlace(); }}, '←'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-BT-NEXT', disabled: pg >= pages, onclick: () => { store.set('btPage', pg + 1); refreshInPlace(); }}, '→')))]
      : emptyState('La strategia non ha operato nel periodo.')),
  saveable ? h('section', {class: 'card', 'data-testid': 'bt-save'}, h('h2', {}, 'Salva questa simulazione'), h('div', {class: 'row'}, h('label', {class: 'f', style: {flex: '1 1 240px'}}, 'Nome', nameIn), saveBtn)) : null];
}
const BT_TABS = [['run', 'Simula'], ['compare', 'Confronta'], ['saved', 'Salvate']];
const LAST_RUN = {res: null, key: null};
view({id: 'backtest', title: 'Simulazioni e backtest', phase: 'UI-08', issues: ['#34', '#96'], loadingText: 'delle simulazioni', async render(params, ctx) {
  const tab = BT_TABS.some(([t]) => t === params.get('tab')) ? params.get('tab') : 'run';
  const tabs = tabsBar('CTL-BT-TAB', BT_TABS, tab, t => go('backtest', {tab: t}), 'Sezioni');
  const headN = head('Simulazioni e backtest', {chips: [chip(isReal() ? 'REAL' : 'DEMO')], issues: ['UI-08', '#34']});
  let list = [];
  try { list = await strategyList(); } catch { list = []; }
  const draft = params.get('draft') ? store.get('draftDef', null) : null;
  const st = settings();
  if (tab === 'saved') return [headN, tabs, await savedTab(params)];
  if (tab === 'compare') return [headN, tabs, compareTab(list, params)];
  const v = k => params.get(k) ?? '';
  const stratOpts = [...(draft ? [['__draft', `Bozza: ${draft.name || 'senza nome'}`]] : []), ...list.map(d => [d.key, `${d.name} (v${d.version})`])];
  const cur = v('strategy') || (draft ? '__draft' : stratOpts[0]?.[0] ?? '');
  const form = h('form', {class: 'card', 'data-testid': 'bt-form', onsubmit: e => {
    e.preventDefault();
    const out = Object.fromEntries([...new FormData(e.target).entries()].filter(([, x]) => String(x).trim()).map(([k, x]) => [k, String(x).trim()]));
    store.set('btPage', 1);
    go('backtest', {...out, draft: params.get('draft'), run: Date.now().toString(36)});
  }},
  h('div', {class: 'fields'},
    h('label', {class: 'f'}, 'Strategia', stratOpts.length ? h('select', {name: 'strategy', ctl: 'CTL-BT-STRAT'}, stratOpts.map(([k, t]) => h('option', {value: k, selected: k === cur}, t)))
      : h('span', {class: 'muted'}, 'Nessuna strategia: creane una nello Strategy Lab')),
    h('label', {class: 'f'}, 'Dal', h('input', {type: 'date', name: 'from', required: true, value: v('from') || addDays(today(), -60), ctl: 'CTL-BT-FROM'})),
    h('label', {class: 'f'}, 'Al', h('input', {type: 'date', name: 'to', required: true, value: v('to') || addDays(today(), -1), ctl: 'CTL-BT-TO'})),
    h('label', {class: 'f'}, 'Puntata', h('input', {type: 'number', name: 'stake', step: '0.01', min: '0.01', value: v('stake') || st.default_stake, ctl: 'CTL-BT-STAKE'})),
    h('label', {class: 'f'}, 'Commissione %', h('input', {type: 'number', name: 'commission', step: '0.1', min: '0', max: '99', value: v('commission') || st.commission, ctl: 'CTL-BT-COMM'})),
    h('label', {class: 'f'}, 'Capitale iniziale', h('input', {type: 'number', name: 'bankroll', step: '1', min: '1', value: v('bankroll') || st.bankroll, ctl: 'CTL-BT-BANK'})),
    h('label', {class: 'f'}, 'Gestione del capitale', h('select', {name: 'mm_model', ctl: 'CTL-BT-MM'}, h('option', {value: ''}, 'Puntata fissa'),
      MM_MODELS.filter(m => m.status === 'IMPLEMENTED').map(m => h('option', {value: m.id, selected: v('mm_model') === m.id}, m.name)))),
    h('label', {class: 'f'}, 'Valore della gestione', h('input', {type: 'number', name: 'mm_value', step: '0.01', min: '0.01', value: v('mm_value'), ctl: 'CTL-BT-MMV', placeholder: 'es. 2 = 2%'})),
    // DEC-007: PIT is the default; NON_PIT_RESEARCH is an explicit, labelled research run of the server engine.
    h('label', {class: 'f'}, 'Punto nel tempo', h('select', {name: 'pit_mode', ctl: 'CTL-BT-PIT', disabled: !isReal(), title: isReal() ? null : 'In DEMO la simulazione usa solo prezzi noti prima della decisione (PIT)'},
      [['PIT', 'PIT: solo dati noti alla decisione'], ['NON_PIT_RESEARCH', 'NON_PIT: ricerca, non è evidenza']].map(([k, t]) => h('option', {value: k, selected: (v('pit_mode') || 'PIT') === k}, t))))),
  h('div', {class: 'row', style: {marginTop: '12px'}}, h('button', {class: 'btn pri', type: 'submit', ctl: 'CTL-BT-RUN', disabled: !stratOpts.length}, 'Avvia la simulazione'),
    h('a', {class: 'btn', href: href('strategies', {new: 1}), ctl: 'CTL-BT-NEWSTRAT'}, 'Nuova strategia')));
  if (!params.get('run')) return [headN, tabs, dataStrip(isReal() ? 'REAL' : 'DEMO', isReal() ? 'Motore reale /api/v1/hist/backtest (modalità rigorosa).' : 'Archivio DEMO: partite concluse generate nel browser.'), form,
    emptyState('Scegli strategia e periodo, poi avvia la simulazione.')];
  const def = cur === '__draft' ? draft : list.find(d => d.key === cur);
  if (!def) return [headN, tabs, form, h('div', {class: 'state error', role: 'alert'}, 'Strategia non trovata.')];
  const cfg = {from: v('from'), to: v('to'), stake: v('stake') || st.default_stake, commission: v('commission') || '0', bankroll: v('bankroll') || st.bankroll, mm_model: v('mm_model'), mm_value: v('mm_value'), pit_mode: isReal() ? v('pit_mode') || 'PIT' : 'PIT'};
  if (cfg.mm_model && !(Number(cfg.mm_value) > 0)) return [headN, tabs, form, h('div', {class: 'state error', role: 'alert', 'data-testid': 'bt-invalid'}, 'Valore della gestione: obbligatorio con un modello di gestione del capitale.')];
  let res;
  const runKey = JSON.stringify([def, cfg, isReal()]);
  try {
    if (LAST_RUN.key === runKey && ctx.refresh) res = LAST_RUN.res;
    else { res = isReal() ? await REAL.backtest(def, cfg) : demoBacktest(def, cfg); LAST_RUN.key = runKey; LAST_RUN.res = res; }
  } catch (e) { return [headN, tabs, form, h('div', {class: 'state error', role: 'alert', 'data-testid': 'bt-invalid', 'data-code': e.code}, refusalText(e))]; }
  if (!ctx.alive()) return [];
  if (res.error) return [headN, tabs, form, h('div', {class: 'state error', role: 'alert', 'data-testid': 'bt-invalid'}, res.error)];
  return [headN, tabs, form, h('p', {class: 'small muted'}, h('b', {}, def.name), ' · ', rulesText(def).join(' · ')), btResult(res)];
}});
function compareTab(list, params) {
  const v = k => params.get(k) ?? '';
  const st = settings();
  const pick = (k, label, optional) => h('label', {class: 'f'}, label, h('select', {name: k, ctl: `CTL-CMP-${k.toUpperCase()}`}, optional ? h('option', {value: ''}, 'Nessuna') : null,
    list.map((d, i) => h('option', {value: d.key, selected: v(k) ? v(k) === d.key : !optional && i === (k === 'a' ? 0 : 1)}, d.name))));
  const form = h('form', {class: 'card', 'data-testid': 'cmp-form', onsubmit: e => {
    e.preventDefault();
    const out = Object.fromEntries([...new FormData(e.target).entries()].filter(([, x]) => String(x).trim()));
    go('backtest', {tab: 'compare', ...out, run: 1});
  }}, h('div', {class: 'fields'}, pick('a', 'Strategia A'), pick('b', 'Strategia B'), pick('c', 'Strategia C (facoltativa)', true),
    h('label', {class: 'f'}, 'Dal', h('input', {type: 'date', name: 'from', value: v('from') || addDays(today(), -60), ctl: 'CTL-CMP-FROM'})),
    h('label', {class: 'f'}, 'Al', h('input', {type: 'date', name: 'to', value: v('to') || addDays(today(), -1), ctl: 'CTL-CMP-TO'})),
    h('label', {class: 'f'}, 'Puntata', h('input', {type: 'number', name: 'stake', step: '0.01', min: '0.01', value: v('stake') || st.default_stake, ctl: 'CTL-CMP-STAKE'}))),
  h('div', {class: 'row', style: {marginTop: '12px'}}, h('button', {class: 'btn pri', type: 'submit', ctl: 'CTL-CMP-RUN', disabled: list.length < 2}, 'Confronta')));
  if (list.length < 2) return [form, emptyState('Servono almeno due strategie salvate per un confronto.', h('a', {href: href('strategies', {new: 1}), ctl: 'CTL-BT-NEWSTRAT'}, 'Crea una strategia'))];
  if (!params.get('run')) return [form, emptyState('Scegli due o tre strategie e il periodo: girano sugli stessi dati.')];
  if (isReal()) return [form, strip('UNAVAILABLE', 'Il confronto in REAL è nel sito MatchPilot (pagina Simulazione › Confronta); qui è disponibile in DEMO.')];
  const keys = ['a', 'b', 'c'].map(k => v(k)).filter(Boolean);
  if (new Set(keys).size !== keys.length) return [form, h('div', {class: 'state error', role: 'alert', 'data-testid': 'cmp-invalid'}, 'Scegli strategie diverse.')];
  const cfg = {from: v('from'), to: v('to'), stake: v('stake') || st.default_stake, commission: st.commission, bankroll: st.bankroll};
  const runs = keys.map(k => ({d: list.find(x => x.key === k), r: demoBacktest(list.find(x => x.key === k), cfg)}));
  const bad = runs.find(x => x.r.error);
  if (bad) return [form, h('div', {class: 'state error', role: 'alert', 'data-testid': 'cmp-invalid'}, bad.r.error)];
  const colors = ['var(--accent)', 'var(--back)', 'var(--lay)'];
  const rows = [['Operazioni', r => nint(r.bets.length)], ['Vinte', r => nint(r.won)], ['Strike rate', r => pct(r.strike)], ['Quota media', r => odd(r.avgOdds)], ['Profitto netto', r => signed(r.plNet)],
    ['Rendimento sul rischio', r => pct(r.roi)], ['Massimo calo', r => nf(r.maxDrawdown)]];
  return [form, h('section', {class: 'card', 'data-testid': 'cmp-result'}, h('h2', {}, 'Confronto sugli stessi dati', chip('DEMO')),
    h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, ''), runs.map(x => h('th', {}, x.d.name)))),
      h('tbody', {}, rows.map(([l, f]) => h('tr', {}, h('th', {}, l), runs.map(x => h('td', {class: 'n'}, f(x.r)))))))),
    h('div', {style: {marginTop: '12px'}}, equityChart(runs.map((x, i) => [x.d.name, x.r.curve, colors[i]]))),
    h('p', {class: 'notice'}, 'Nessuna classifica: i valori sono quelli di ciascuna simulazione, sugli stessi dati e con la stessa puntata.'))];
}
async function savedTab(params) {
  const id = params.get('id');
  if (isReal()) {
    let list;
    try { list = await REAL.savedList(); } catch (e) { return h('div', {class: 'state partial', 'data-code': e.code, 'data-testid': 'saved-off'}, refusalText(e)); }
    if (id) {
      const s0 = await REAL.savedGet(id);
      return [h('p', {}, h('b', {}, s0.name), ` · salvata il ${when(s0.created_at)}`), s0.kind === 'BACKTEST' ? btResult(fromRealReport(s0.result, {market: 'MATCH_ODDS'}, {}), {saveable: false}) : strip('UNAVAILABLE', 'Confronto salvato: aprilo nel sito MatchPilot.')];
    }
    return list.length ? h('section', {class: 'card'}, h('div', {class: 'stack', style: {gap: '6px'}}, list.map(x => h('div', {class: 'row', style: {justifyContent: 'space-between'}},
      h('span', {}, x.name, h('span', {class: 'muted small'}, ` · ${when(x.created_at)}`)), h('a', {class: 'btn sm', href: href('backtest', {tab: 'saved', id: x.backtest_id}), ctl: 'CTL-BT-OPEN-SAVED'}, 'Apri')))))
      : emptyState('Nessuna simulazione salvata sul server.');
  }
  const list = lib.saved();
  if (id) {
    const s0 = list.find(x => x.id === id);
    if (!s0) return emptyState('Simulazione salvata non trovata.', h('a', {href: href('backtest', {tab: 'saved'}), ctl: 'CTL-BT-OPEN-SAVED'}, 'Tutte le salvate'));
    return [h('p', {'data-testid': 'saved-meta'}, h('b', {}, s0.name), ` · salvata il ${when(s0.at)} · `, rulesText(s0.result.def).join(' · ')), btResult(s0.result, {saveable: false})];
  }
  return list.length ? h('section', {class: 'card', 'data-testid': 'saved-list'}, h('div', {class: 'stack', style: {gap: '6px'}}, list.map(x => h('div', {class: 'row', style: {justifyContent: 'space-between'}, 'data-saved': x.id},
    h('span', {}, h('b', {}, x.name), h('span', {class: 'muted small'}, ` · ${when(x.at)} · P/L ${signed(x.result.plNet)} · ${x.result.bets.length} operazioni`)),
    h('div', {class: 'row'}, h('a', {class: 'btn sm', href: href('backtest', {tab: 'saved', id: x.id}), ctl: 'CTL-BT-OPEN-SAVED'}, 'Apri'),
      h('button', {class: 'btn sm danger', type: 'button', ctl: 'CTL-BT-DEL-SAVED', onclick: async () => {
        if (!await confirmDialog('Eliminare la simulazione salvata?', `«${x.name}» verrà eliminata da questo browser.`, {ok: 'Elimina', danger: true})) return;
        lib.setSaved(lib.saved().filter(y => y.id !== x.id)); toast('Eliminata'); render();
      }}, 'Elimina'))))))
    : emptyState('Nessuna simulazione salvata: avviane una e premi Salva.');
}

// ================================================================ Paper trading (UI-09, #99)
view({id: 'paper', title: 'Paper trading', phase: 'UI-09', issues: ['#99', '#96', '#100'], async render(params, ctx) {
  if (isReal()) {
    const acc = params.get('account') || '';
    const input = h('input', {type: 'text', value: acc, ctl: 'CTL-PAPER-ACCOUNT', 'aria-label': 'Conto simulato', placeholder: 'nome del conto'});
    let body;
    if (!acc) body = emptyState('Scrivi il nome del conto simulato e premi Apri.');
    else {
      try {
        const a = await REAL.account(acc);
        body = h('section', {class: 'card', 'data-testid': 'paper-real'}, h('h2', {}, `Conto ${a.account_id}`), h('dl', {class: 'kv'},
          [['Disponibile', a.available_bankroll], ['Cassa', a.cash_balance], ['Impegnato', a.reserved_funds], ['Profitto realizzato', a.realized_pnl], ['Commissioni', a.settled_commission], ['Posizioni aperte', a.open_position_count]]
            .flatMap(([k, x]) => [h('dt', {}, k), h('dd', {}, nf(Number(x)))]), h('dt', {}, 'Registro in pari'), h('dd', {}, a.reconciled ? 'sì' : 'no')));
      } catch (e) { body = h('div', {class: 'state partial', role: 'status', 'data-code': e.code}, e.status === 404 ? `Nessun conto «${acc}».` : e.code === 'UNAVAILABLE' ? 'Il registro delle posizioni del server non è ancora attivo.' : refusalText(e)); }
    }
    return [head('Paper trading', {chips: [chip('REAL')], issues: ['UI-09', '#99']}),
      strip('REAL', 'Lettura del conto simulato dal server. Aprire posizioni dal web non è disponibile: serve la modalità operativa lato server (DEC-001).'),
      h('div', {class: 'card row', style: {marginBottom: '14px'}}, h('label', {class: 'f inl'}, 'Conto', input), h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-PAPER-LOAD', onclick: () => go('paper', {account: input.value.trim()})}, 'Apri')), body];
  }
  const l = ledgerLoad();
  const settled = ledgerSettleDue(l);
  if (settled) queueMicrotask(() => toast(`${settled} posizioni regolate a fine partita`, 'ok'));
  const st = ledgerState(l);
  const ltype = params.get('ltype') || '';
  const open = Object.values(l.positions).filter(p => p.status === 'OPEN');
  const done = Object.values(l.positions).filter(p => p.status === 'SETTLED').sort((a, b) => b.settledAt.localeCompare(a.settledAt));
  const byMatch = {};
  for (const p of open) byMatch[p.label] = (byMatch[p.label] ?? 0) + positionPL(p).liability;
  const maxExp = Math.max(1, ...Object.values(byMatch));
  if (!ctx.refresh) every(15000, refreshInPlace);
  const modeBtn = (mode, text, ctl, cls = '') => h('button', {class: `btn sm ${cls}`, type: 'button', ctl, disabled: l.mode === mode, onclick: async () => {
    const reason = await promptDialog(`${text}: motivo`, 'Motivo (resta nel registro)', {ctlInput: 'CTL-PAPER-REASON', ctlOk: 'CTL-PAPER-REASON-OK'});
    if (!reason) return;
    const r = ledgerMode(ledgerLoad(), mode, reason);
    toast(r.error ?? `Operatività: ${MODES[mode]}`, r.error ? 'bad' : 'ok'); render();
  }}, text);
  const posCols = ['Posizione', 'Partita', 'Operazione', 'Stato partita', 'Se vince / se perde', 'Azioni'];
  const ledCols = ['#', 'Quando', 'Tipo', 'Descrizione', 'Importo'];
  const entries = [...l.entries].reverse().filter(e => !ltype || e.type === ltype);
  return [head('Paper trading', {sub: 'Conto virtuale, posizioni simulate, registro append-only', chips: [chip('DEMO')], issues: ['UI-09', '#99'],
    actions: [h('a', {class: 'btn pri', href: href('dashboard'), ctl: 'CTL-PAPER-NEW'}, 'Nuova posizione')]}),
  strip('DEMO', 'Denaro simulato, conto in questo browser. Nessun ordine reale.'),
  h('div', {class: 'grid g4', style: {marginBottom: '14px'}, 'data-testid': 'paper-kpi'},
    kpi('Disponibile', money(st.available), `cassa ${money(st.cash)}`, {'data-kpi': 'available'}), kpi('Impegnato', money(st.reserved), `${st.open} posizioni aperte`, {'data-kpi': 'reserved'}),
    kpi('Profitto realizzato', signed(st.realized), `commissioni ${nf(st.commission)}`, {'data-kpi': 'realized'}), kpi('Registro', st.reconciled ? 'In pari' : 'Da verificare', `${st.entries} movimenti · posizioni regolate ${signed(st.fromPositions)}`, {'data-kpi': 'reconciled'})),
  h('div', {class: 'grid g2'},
    h('section', {class: 'card', 'data-testid': 'paper-mode', 'data-mode': l.mode}, h('h2', {}, 'Operatività', h('span', {class: `right chip ${l.mode === 'ACTIVE_OPERATIONAL' ? 'ok' : 'warn'}`}, MODES[l.mode])),
      h('div', {class: 'row'}, modeBtn('ADVISORY_ONLY', 'STOP operazioni', 'CTL-PAPER-STOP', 'danger'), modeBtn('ACTIVE_OPERATIONAL', 'Riprendi', 'CTL-PAPER-RESUME'), modeBtn('PAUSED', 'Pausa', 'CTL-PAPER-PAUSE')),
      l.audit.length ? h('ul', {class: 'small', style: {marginBottom: 0}}, [...l.audit].reverse().slice(0, 5).map(a => h('li', {}, `${when(a.at)} · ${MODES[a.from]} → ${MODES[a.to]} · ${a.reason}`))) : h('p', {class: 'notice'}, 'STOP mette il conto in «solo consiglio»: le proposte non vengono registrate.')),
    h('section', {class: 'card'}, h('h2', {}, 'Esposizione per partita'), Object.keys(byMatch).length ? h('div', {class: 'stack', style: {gap: '8px'}}, Object.entries(byMatch).map(([k, x]) => h('div', {},
      h('div', {class: 'row small', style: {justifyContent: 'space-between'}}, h('span', {}, k), h('b', {class: 'mono'}, money(x))), h('div', {class: 'progress'}, h('i', {style: {width: `${x / maxExp * 100}%`}})))))
      : emptyState('Nessuna esposizione aperta.'))),
  h('section', {class: 'card', 'data-testid': 'paper-open', style: {marginTop: '14px'}}, h('h2', {}, `Posizioni aperte (${open.length})`, h('span', {class: 'right row'},
    h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-PAPER-SETTLE', onclick: () => { const n = ledgerSettleDue(ledgerLoad()); toast(n ? `${n} posizioni regolate` : 'Nessuna partita conclusa da regolare'); render(); }}, 'Regola le concluse'))),
    open.length ? h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, posCols.map(c => h('th', {}, c)))), h('tbody', {}, open.map(p => {
      const m = demoMatchById(p.matchId); const ms = m ? withState(m) : null; const pl = positionPL(p);
      return h('tr', {'data-position': p.id}, [h('td', {}, p.id), h('td', {}, h('a', {href: href('match', {id: p.matchId}), ctl: 'CTL-MATCH-OPEN'}, p.label)),
        h('td', {}, p.legs.map(g => `${SIDE_TEXT[g.side]} ${money(g.stake)} @ ${odd(g.odds)}`).join(' + '), h('div', {class: 'xs muted'}, selectionText(p.market, p.selection))),
        h('td', {}, ms ? `${STATUS_TEXT[ms.status]}${ms.score ? ` ${scoreText(ms)}` : ''}` : ND), h('td', {class: 'n'}, `${signed(pl.win)} / ${signed(pl.lose)}`),
        h('td', {}, h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-PAPER-HEDGE', onclick: () => hedgeDialog(p, ms)}, 'Copri'))].map((td, i) => (td.setAttribute('data-label', posCols[i]), td)));
    })))) : emptyState('Nessuna posizione aperta. Aprila dal Match Center o dalla Live Board.')),
  h('section', {class: 'card', 'data-testid': 'paper-settled'}, h('h2', {}, `Posizioni regolate (${done.length})`), done.length ? h('div', {class: 'tablewrap'}, h('table', {}, h('tbody', {}, done.slice(0, 30).map(p => h('tr', {},
    h('td', {}, p.id), h('td', {}, p.label), h('td', {}, `${SIDE_TEXT[p.side]} ${selectionText(p.market, p.selection)}`), h('td', {}, p.score), h('td', {class: `n ${p.net >= 0 ? 'ok' : 'bad'}`}, signed(p.net)))))))
    : emptyState('Nessuna posizione regolata.')),
  h('section', {class: 'card', 'data-testid': 'paper-ledger'}, h('h2', {}, 'Registro (append-only)', h('span', {class: 'right row'},
    h('select', {ctl: 'CTL-PAPER-LEDGER-TYPE', 'aria-label': 'Tipo di movimento', onchange: e => go('paper', {ltype: e.target.value})}, [['', 'Tutti'], ['ALLOCATE', 'Capitale'], ['OPEN', 'Aperture'], ['HEDGE', 'Coperture'], ['SETTLE', 'Regolamenti'], ['MODE', 'Operatività'], ['RESET', 'Azzeramenti']]
      .map(([k, t]) => h('option', {value: k, selected: ltype === k}, t))),
    h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-PAPER-CSV', onclick: () => download('matchpilot-registro.csv', ['seq;quando;tipo;descrizione;netto', ...l.entries.map(e => [e.seq, e.at, e.type, e.text, e.net ?? e.amount ?? ''].join(';'))].join('\n'), 'text/csv')}, 'Esporta CSV'),
    h('button', {class: 'btn sm danger', type: 'button', ctl: 'CTL-PAPER-RESET', onclick: async () => {
      const amount = await promptDialog('Azzera il conto simulato', 'Nuovo capitale iniziale', {value: String(settings().bankroll), ctlInput: 'CTL-PAPER-RESET-AMOUNT', ctlOk: 'CTL-PAPER-RESET-OK', ok: 'Azzera'});
      if (amount === null) return;
      const n = Number(amount.replace(',', '.'));
      const r = ledgerReset(ledgerLoad(), n);
      toast(r.error ?? 'Conto azzerato: storico conservato nel registro', r.error ? 'bad' : 'ok'); render();
    }}, 'Azzera conto'))),
  h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, ledCols.map(c => h('th', {}, c)))), h('tbody', {}, entries.slice(0, 50).map(e => h('tr', {'data-type': e.type}, [
    h('td', {}, String(e.seq)), h('td', {}, when(e.at)), h('td', {}, e.type), h('td', {}, e.text ?? ''), h('td', {class: 'n'}, e.net !== undefined ? signed(e.net) : e.amount !== undefined ? money(e.amount) : '')]
    .map((td, i) => (td.setAttribute('data-label', ledCols[i]), td))))))))];
}});
function hedgeDialog(p, m) {
  const cur = m?.live?.[PRICE_KEY[p.selection]] ?? null;
  const oddsIn = h('input', {type: 'number', step: '0.01', min: '1.01', value: cur ?? '', ctl: 'CTL-HEDGE-ODDS', 'aria-label': 'Quota di copertura'});
  const shareIn = h('select', {ctl: 'CTL-HEDGE-SHARE', 'aria-label': 'Quanto coprire'}, [[1, 'Tutto (green-up)'], [0.5, 'Metà'], [0.25, 'Un quarto']].map(([v, t]) => h('option', {value: v}, t)));
  const out = h('div', {'aria-live': 'polite', class: 'small'});
  const calc = () => { const o = Number(oddsIn.value); if (!(o > 1)) { out.textContent = 'Inserisci una quota valida.'; return; }
    const r = hedgeCalc(p, o, Number(shareIn.value)); out.replaceChildren(h('dl', {class: 'kv'}, h('dt', {}, 'Copertura'), h('dd', {}, `${SIDE_TEXT[r.side]} ${money(r.stake)}`),
      h('dt', {}, 'Prima'), h('dd', {}, `${signed(r.before.win)} / ${signed(r.before.lose)}`), h('dt', {}, 'Dopo'), h('dd', {}, `${signed(r.after.win)} / ${signed(r.after.lose)}`))); };
  oddsIn.addEventListener('input', calc); shareIn.addEventListener('change', calc);
  const err = h('p', {class: 'err', role: 'alert'});
  dialog({id: 'hedge', title: `Copri ${p.id} · ${p.label}`, body: [cur ? h('p', {class: 'small muted'}, `Quota attuale (DEMO): ${odd(cur)}`) : h('p', {class: 'small muted'}, 'Quota attuale non disponibile: inseriscila.'),
    h('div', {class: 'fields'}, h('label', {class: 'f'}, 'Quota', oddsIn), h('label', {class: 'f'}, 'Quanto', shareIn)), out, err],
  actions: [h('button', {class: 'btn', type: 'button', ctl: 'CTL-DLG-CANCEL', onclick: closeDialog}, 'Annulla'),
    h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-HEDGE-CONFIRM', onclick: () => { const r = ledgerHedge(ledgerLoad(), p.id, Number(oddsIn.value), Number(shareIn.value));
      if (r.error) { err.textContent = r.error; return; } closeDialog(); toast('Copertura registrata', 'ok'); render(); }}, 'Copri')]});
  calc();
}

// ================================================================ Money Management (UI-09, #96)
view({id: 'money', title: 'Money Management', phase: 'UI-09', issues: ['#96'], render(params) {
  const profiles = lib.profiles();
  const showArchived = params.get('archived') === '1';
  const l = ledgerLoad();
  const referenced = new Set(Object.values(l.positions).map(p => p.profile).filter(Boolean));
  const st = ledgerState(l);
  const save = list => { lib.setProfiles(list); render(); };
  const cur = p => p.versions.at(-1);
  const capsText = c => [c.max_stake && `puntata ≤ ${nf(c.max_stake)}`, c.max_liability && `responsabilità ≤ ${nf(c.max_liability)}`, c.min_odds && `quota ≥ ${nf(c.min_odds)}`, c.max_odds && `quota ≤ ${nf(c.max_odds)}`, c.max_open && `max ${c.max_open} aperte`].filter(Boolean).join(' · ') || 'nessun limite';
  const pcols = ['Profilo', 'Modello', 'Limiti', 'Versione', 'Azioni'];
  const visible = profiles.filter(p => showArchived || !p.archived);
  const calcProfile = h('select', {ctl: 'CTL-MMC-PROFILE', 'aria-label': 'Profilo'}, profiles.filter(p => !p.archived).map(p => h('option', {value: p.id, selected: p.default}, p.name)));
  const cSide = h('select', {ctl: 'CTL-MMC-SIDE', 'aria-label': 'Lato'}, Object.entries(SIDE_TEXT).map(([k, t]) => h('option', {value: k}, t)));
  const cOdds = h('input', {type: 'number', step: '0.01', min: '1.01', value: '2.5', ctl: 'CTL-MMC-ODDS', 'aria-label': 'Quota'});
  const cAvail = h('input', {type: 'number', step: '0.01', min: '0', value: String(st.available), ctl: 'CTL-MMC-AVAIL', 'aria-label': 'Capitale disponibile'});
  const cOut = h('div', {'data-testid': 'mm-calc-result', 'aria-live': 'polite'});
  const runCalc = async () => {
    const p = profiles.find(x => x.id === calcProfile.value);
    if (!p) { cOut.replaceChildren(emptyState('Nessun profilo attivo.')); return; }
    const v = cur(p);
    let r;
    if (isReal()) {
      try { const d = await REAL.mmStake({model: v.model, value: v.value, bankroll: cAvail.value, side: cSide.value, odds: cOdds.value, max_stake: v.caps.max_stake, max_liability: v.caps.max_liability});
        r = {decision: d.result.decision, stake: Number(d.display.adjusted_stake), original: Number(d.display.original_stake), liability: Number(d.display.adjusted_liability), capsHit: d.result.caps_triggered, reasons: d.result.reasons, ifWins: Number(d.display.if_wins), ifLoses: Number(d.display.if_loses)}; }
      catch (e) { cOut.replaceChildren(h('div', {class: 'state error', role: 'alert'}, refusalText(e))); return; }
    } else r = mmEvaluate({model: v.model, value: v.value, caps: v.caps, side: cSide.value, odds: cOdds.value, available: cAvail.value, openCount: st.open, mode: l.mode});
    if (r.error) { cOut.replaceChildren(h('div', {class: 'state error', role: 'alert'}, r.error)); return; }
    cOut.replaceChildren(h('div', {class: 'card', style: {background: 'var(--surface-2)'}, 'data-decision': r.decision}, h('h3', {style: {marginTop: 0}}, `Decisione: ${DECISION_TEXT[r.decision]}`, ' ', chip(isReal() ? 'REAL' : 'DEMO')),
      h('dl', {class: 'kv'}, h('dt', {}, 'Puntata del modello'), h('dd', {}, money(r.original)), h('dt', {}, 'Puntata consentita'), h('dd', {'data-testid': 'mm-stake'}, money(r.stake)),
        h('dt', {}, 'Responsabilità'), h('dd', {}, money(r.liability)), h('dt', {}, 'Se vince / se perde'), h('dd', {}, `${signed(r.ifWins)} / ${signed(r.ifLoses)}`),
        h('dt', {}, 'Limiti intervenuti'), h('dd', {}, r.capsHit?.length ? r.capsHit.map(c => CAP_TEXT[c] ?? c).join(', ') : 'nessuno')),
      r.reasons?.length ? h('p', {class: 'small warn'}, r.reasons.join(' · ')) : null));
  };
  return [head('Money Management', {sub: 'Modelli, profili con versioni immutabili, calcolo della puntata', chips: [chip(isReal() ? 'MIXED' : 'DEMO')], issues: ['UI-09', '#96'],
    actions: [h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-MM-NEW', onclick: () => profileDialog(null)}, 'Nuovo profilo')]}),
  isReal() ? strip('MIXED', 'Provenienza mista: i profili sono salvati in questo browser (DEMO, l’API dei profili non esiste ancora); il calcolo della puntata è eseguito dal server (REAL, /api/v1/mm/stake).')
    : strip('DEMO', 'Profili salvati in questo browser. I modelli utilizzabili sono i 4 con formula definita dall’owner; gli altri restano «da definire».'),
  h('section', {class: 'card', 'data-testid': 'mm-profiles'}, h('h2', {}, 'Profili', h('label', {class: 'right f inl small'}, 'Mostra archiviati',
    h('input', {type: 'checkbox', checked: showArchived, ctl: 'CTL-MM-SHOWARCH', onchange: e => go('money', {archived: e.target.checked ? 1 : ''})}))),
  visible.length ? h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, pcols.map(c => h('th', {}, c)))), h('tbody', {}, visible.map(p => {
    const v = cur(p);
    return h('tr', {'data-profile': p.id}, [h('td', {}, h('b', {}, p.name), p.default ? h('span', {class: 'chip ok', style: {marginLeft: '6px'}}, 'predefinito') : null, p.archived ? h('span', {class: 'chip', style: {marginLeft: '6px'}}, 'archiviato') : null),
      h('td', {}, `${MM_BY_ID.get(v.model)?.name} · ${nf(v.value)}${v.model.includes('PERCENT') ? '%' : ''}`), h('td', {class: 'small'}, capsText(v.caps)), h('td', {}, `v${v.v}`, h('div', {class: 'xs muted'}, `${p.versions.length} versioni`)),
      h('td', {}, h('div', {class: 'row'},
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MM-EDIT', disabled: p.archived, onclick: () => profileDialog(p)}, 'Nuova versione'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MM-RENAME', onclick: async () => { const nm = await promptDialog('Rinomina il profilo', 'Nome', {value: p.name, ctlInput: 'CTL-MM-RENAME-INPUT', ctlOk: 'CTL-MM-RENAME-OK'}); if (!nm) return;
          const list = lib.profiles(); list.find(x => x.id === p.id).name = nm; save(list); toast('Rinominato (nessuna nuova versione)', 'ok'); }}, 'Rinomina'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MM-DUP', onclick: () => { const list = lib.profiles(); list.push({...JSON.parse(JSON.stringify(p)), id: `mm-${Date.now().toString(36)}`, name: `${p.name} (copia)`, default: false, archived: false,
          versions: [{...cur(p), v: 1, at: new Date().toISOString()}]}); save(list); toast('Profilo duplicato', 'ok'); }}, 'Duplica'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MM-DEFAULT', disabled: p.default || p.archived, onclick: () => { const list = lib.profiles(); list.forEach(x => { x.default = x.id === p.id; }); save(list); toast(`«${p.name}» è il predefinito`, 'ok'); }}, 'Predefinito'),
        h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-MM-ARCHIVE', disabled: p.default, title: p.default ? 'Il predefinito non si archivia' : null, onclick: () => { const list = lib.profiles(); const x = list.find(y => y.id === p.id); x.archived = !x.archived; save(list); toast(x.archived ? 'Archiviato' : 'Ripristinato', 'ok'); }}, p.archived ? 'Ripristina' : 'Archivia'),
        h('button', {class: 'btn sm danger', type: 'button', ctl: 'CTL-MM-DELETE', disabled: referenced.has(p.id) || p.default, title: referenced.has(p.id) ? 'Usato da posizioni: si può solo archiviare' : p.default ? 'Il predefinito non si elimina' : null,
          onclick: async () => { if (!await confirmDialog('Eliminare il profilo?', `«${p.name}» non è mai stato usato: verrà eliminato.`, {ok: 'Elimina', danger: true})) return; save(lib.profiles().filter(x => x.id !== p.id)); toast('Profilo eliminato'); }}, 'Elimina')))]
      .map((td, i) => (td.setAttribute('data-label', pcols[i]), td)));
  })))) : emptyState('Nessun profilo.')),
  h('div', {class: 'grid g2'},
    h('section', {class: 'card', 'data-testid': 'mm-calc'}, h('h2', {}, 'Calcola la puntata'), h('div', {class: 'fields'}, h('label', {class: 'f'}, 'Profilo', calcProfile), h('label', {class: 'f'}, 'Lato', cSide),
      h('label', {class: 'f'}, 'Quota', cOdds), h('label', {class: 'f'}, 'Capitale disponibile', cAvail)), h('div', {class: 'row', style: {margin: '10px 0'}}, h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-MMC-RUN', onclick: runCalc}, 'Calcola')), cOut),
    h('section', {class: 'card', 'data-testid': 'mm-registry'}, h('h2', {}, `Registro modelli (${MM_MODELS.filter(m => m.status === 'IMPLEMENTED').length} utilizzabili su ${MM_MODELS.length})`),
      h('div', {class: 'tablewrap'}, h('table', {}, h('tbody', {}, MM_MODELS.map(m => h('tr', {'data-model': m.id}, h('td', {}, h('b', {}, m.name), h('div', {class: 'xs muted'}, m.desc)), h('td', {class: 'small'}, m.cat),
        h('td', {}, h('span', {class: `chip ${m.status === 'IMPLEMENTED' ? 'ok' : ''}`}, m.status === 'IMPLEMENTED' ? 'Utilizzabile' : 'Da definire'))))))))),
  ];
}});
function profileDialog(p) {
  const v = p ? p.versions.at(-1) : {model: 'FIXED_STAKE', value: 10, caps: {}};
  const name = h('input', {type: 'text', value: p?.name ?? '', ctl: 'CTL-MMF-NAME', readonly: !!p, 'aria-label': 'Nome del profilo'});
  const model = h('select', {ctl: 'CTL-MMF-MODEL', 'aria-label': 'Modello'}, MM_MODELS.map(m => h('option', {value: m.id, disabled: m.status !== 'IMPLEMENTED', selected: v.model === m.id}, `${m.name}${m.status !== 'IMPLEMENTED' ? ' (da definire)' : ''}`)));
  const value = h('input', {type: 'number', step: '0.01', min: '0.01', value: v.value, ctl: 'CTL-MMF-VALUE', 'aria-label': 'Valore del modello'});
  const cap = (k, label) => h('label', {class: 'f'}, label, h('input', {type: 'number', step: '0.01', min: '0', value: v.caps?.[k] ?? '', 'data-cap': k, ctl: 'CTL-MMF-CAP', 'aria-label': label}));
  const caps = h('div', {class: 'fields'}, cap('max_stake', 'Tetto alla puntata'), cap('max_liability', 'Tetto alla responsabilità'), cap('min_odds', 'Quota minima'), cap('max_odds', 'Quota massima'), cap('max_open', 'Massimo posizioni aperte'));
  const err = h('p', {class: 'err', role: 'alert'});
  const label = h('span', {class: 'small muted'});
  const upd = () => { label.textContent = `Valore: ${MM_BY_ID.get(model.value)?.param ?? ''}`; };
  model.addEventListener('change', upd); upd();
  dialog({id: 'mmprofile', title: p ? `Nuova versione di «${p.name}»` : 'Nuovo profilo', body: [h('div', {class: 'fields'}, h('label', {class: 'f'}, 'Nome', name), h('label', {class: 'f'}, 'Modello', model), h('label', {class: 'f'}, 'Valore', value)), label,
    h('h3', {}, 'Limiti (vuoto = nessuno)'), caps, err, h('p', {class: 'notice'}, 'Ogni salvataggio crea una nuova versione immutabile; le versioni precedenti restano consultabili.')],
  actions: [h('button', {class: 'btn', type: 'button', ctl: 'CTL-DLG-CANCEL', onclick: closeDialog}, 'Annulla'), h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-MMF-SAVE', onclick: () => {
    const nm = name.value.trim(), val = Number(value.value);
    const c = Object.fromEntries($$('input[data-cap]', caps).filter(x => x.value !== '').map(x => [x.dataset.cap, Number(x.value)]));
    if (!nm) { err.textContent = 'Il nome è obbligatorio.'; return; }
    if (!(val > 0)) { err.textContent = 'Il valore deve essere maggiore di zero.'; return; }
    if (model.value.includes('PERCENT') && val > 100) { err.textContent = 'La percentuale non può superare 100.'; return; }
    if (Object.values(c).some(x => !(x > 0))) { err.textContent = 'I limiti devono essere maggiori di zero.'; return; }
    if (c.min_odds && c.max_odds && c.min_odds > c.max_odds) { err.textContent = 'La quota minima supera la massima.'; return; }
    const list = lib.profiles();
    const next = {v: 1, at: new Date().toISOString(), model: model.value, value: val, caps: c};
    if (p) { const x = list.find(y => y.id === p.id); const last = x.versions.at(-1);
      if (JSON.stringify([last.model, last.value, last.caps]) === JSON.stringify([next.model, next.value, next.caps])) { err.textContent = 'Nessuna modifica rispetto alla versione in uso.'; return; }
      x.versions.push({...next, v: last.v + 1}); }
    else list.push({id: `mm-${Date.now().toString(36)}`, name: nm, default: !list.some(x => x.default && !x.archived), archived: false, versions: [next]});
    lib.setProfiles(list); closeDialog(); toast(p ? 'Nuova versione salvata' : 'Profilo creato', 'ok'); render();
  }}, 'Salva')]});
}

// ================================================================ Strumenti (UI-10, #94)
const TOOL_DEFS = [
  ['odds', 'Margine', [['odds', 'Quote (separate da spazi)', {type: 'text', placeholder: '2,10 3,40 3,60'}]], true],
  ['ev', 'Valore atteso', [['odds', 'Quota'], ['probability', 'Probabilità stimata %'], ['stake', 'Puntata'], ['side', 'Lato', {select: Object.entries(SIDE_TEXT)}], ['commission', 'Commissione %']], true],
  ['kelly', 'Kelly', [['odds', 'Quota'], ['probability', 'Probabilità stimata %'], ['bankroll', 'Capitale'], ['fraction', 'Frazione di Kelly %']], true],
  ['position', 'Punta / Banca', [['side', 'Lato', {select: Object.entries(SIDE_TEXT)}], ['odds', 'Quota'], ['stake', 'Puntata'], ['liability', 'oppure responsabilità'], ['commission', 'Commissione %']], true],
  ['hedge', 'Copertura e cashout', [['side', 'Posizione aperta', {select: Object.entries(SIDE_TEXT)}], ['odds', 'Quota di apertura'], ['stake', 'Puntata di apertura'], ['current_odds', 'Quota attuale'], ['share', 'Quanto coprire %'], ['commission', 'Commissione %']], true],
  ['dutching', 'Dutching', [['odds', 'Quote (separate da spazi)', {type: 'text', placeholder: '4 5 6'}], ['total', 'Puntata totale'], ['commission', 'Commissione %']], true],
  ['poisson', 'Poisson', [['xg_home', 'Gol attesi casa'], ['xg_away', 'Gol attesi ospite'], ['max_goals', 'Gol nella griglia']], true],
  ['progression', 'Progressioni', [['type', 'Progressione', {select: [['MARTINGALE', 'Martingala'], ['FIBONACCI', 'Fibonacci'], ['RECOVERY', 'Recupero']]}], ['base', 'Puntata base'], ['odds', 'Quota'], ['steps', 'Passi']], false],
  ['risk', 'Rischio', [['probability', 'Probabilità di vincita %'], ['losses', 'Perdite consecutive'], ['stake', 'Puntata'], ['bankroll', 'Capitale']], false],
  ['convert', 'Convertitore quote', [['odds', 'Quota decimale']], false],
];
const TOOL_DEFAULTS = {odds: {odds: '2,10 3,40 3,60'}, ev: {odds: '2.2', probability: '50', stake: '10', side: 'BACK', commission: '5'}, kelly: {odds: '2.2', probability: '50', bankroll: '1000', fraction: '50'},
  position: {side: 'LAY', odds: '4', stake: '10', commission: '5'}, hedge: {side: 'BACK', odds: '3', stake: '10', current_odds: '2', share: '100', commission: '0'},
  dutching: {odds: '4 5 6', total: '100', commission: '0'}, poisson: {xg_home: '1.6', xg_away: '1.1', max_goals: '5'}, progression: {type: 'MARTINGALE', base: '5', odds: '2', steps: '8'},
  risk: {probability: '45', losses: '5', stake: '10', bankroll: '500'}, convert: {odds: '2.5'}};
// The server answer of a tool in the shape of the local calculators (REAL).
const FROM_SERVER = {
  odds: d => ({rows: d.selections.map(x => ({odds: Number(x.odds), implied: Number(x.implied_percent) / 100, fair: x.fair_percent === null ? null : Number(x.fair_percent) / 100, fairOdds: x.fair_odds === null ? null : Number(x.fair_odds)})),
    book: Number(d.book_percent) / 100, over: d.overround_percent === null ? null : Number(d.overround_percent) / 100}),
  ev: d => ({ev: Number(d.expected_value), roi: Number(d.roi_percent) / 100, edge: Number(d.edge_percent) / 100, fair: Number(d.fair_odds), liab: Number(d.liability), win: Number(d.if_wins), lose: Number(d.if_loses)}),
  kelly: d => ({full: Number(d.kelly_percent) / 100, applied: Number(d.applied_percent) / 100, stake: Number(d.stake), edge: Number(d.edge_percent) / 100}),
  position: d => ({stake: Number(d.stake), liab: Number(d.liability), win: Number(d.if_wins), lose: Number(d.if_loses), be: Number(d.break_even_percent) / 100}),
  hedge: d => ({side: d.hedge_side, stake: Number(d.hedge_stake), liab: Number(d.hedge_liability), before: {win: Number(d.before.if_wins), lose: Number(d.before.if_loses)}, after: {win: Number(d.after.if_wins), lose: Number(d.after.if_loses)}}),
  dutching: d => ({rows: d.selections.map(x => ({odds: Number(x.odds), stake: Number(x.stake), win: Number(x.if_wins)})), placed: Number(d.placed), book: Number(d.book_percent) / 100}),
  poisson: d => ({H: Number(d.match_odds[0].percent) / 100, D: Number(d.match_odds[1].percent) / 100, A: Number(d.match_odds[2].percent) / 100, cov: Number(d.grid_coverage_percent) / 100,
    cells: d.grid.cells.map(c => ({h: c.home, a: c.away, p: Number(c.percent) / 100})), lines: d.lines.map(l => ({line: Number(l.line), over: Number(l.over_percent) / 100, under: Number(l.under_percent) / 100})),
    btts: Number(d.btts.yes_percent) / 100, top: d.top_scores.map(t => { const [x, y] = t.score.split('-').map(Number); return {h: x, a: y, p: Number(t.percent) / 100}; }), max: d.grid.max_goals}),
};
const TOOL_OUT = {
  odds: r => [h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, ['Quota', 'Prob. implicita', 'Prob. senza margine', 'Quota equa'].map(x => h('th', {class: 'n'}, x)))),
    h('tbody', {}, r.rows.map(x => h('tr', {}, h('td', {class: 'n'}, odd(x.odds)), h('td', {class: 'n'}, pct(x.implied, 2)), h('td', {class: 'n'}, pct(x.fair, 2)), h('td', {class: 'n'}, isNum(x.fairOdds) ? nf(x.fairOdds, 3) : ND)))))),
    h('dl', {class: 'kv', style: {marginTop: '10px'}}, h('dt', {}, 'Totale delle probabilità'), h('dd', {}, pct(r.book, 2)), h('dt', {}, 'Margine'), h('dd', {'data-out': 'overround'}, pct(r.over, 2)))],
  ev: r => [h('dl', {class: 'kv'}, h('dt', {}, 'Valore atteso'), h('dd', {'data-out': 'ev', class: r.ev >= 0 ? 'ok' : 'bad'}, signed(r.ev)), h('dt', {}, 'Rendimento atteso sul rischio'), h('dd', {}, pct(r.roi, 2)),
    h('dt', {}, 'Vantaggio sulla quota'), h('dd', {}, pct(r.edge, 2)), h('dt', {}, 'Quota equa'), h('dd', {}, nf(r.fair, 3)), h('dt', {}, 'Responsabilità'), h('dd', {}, nf(r.liab)),
    h('dt', {}, 'Se la selezione vince'), h('dd', {}, signed(r.win)), h('dt', {}, 'Se la selezione perde'), h('dd', {}, signed(r.lose)))],
  kelly: r => [h('dl', {class: 'kv'}, h('dt', {}, 'Puntata consigliata'), h('dd', {'data-out': 'stake'}, nf(r.stake)), h('dt', {}, 'Kelly pieno'), h('dd', {}, pct(r.full, 2)),
    h('dt', {}, 'Frazione applicata'), h('dd', {}, pct(r.applied, 2)), h('dt', {}, 'Vantaggio'), h('dd', {}, pct(r.edge, 2))), r.full <= 0 ? h('p', {class: 'warn small'}, 'Nessun vantaggio alla probabilità stimata: Kelly non punta.') : null],
  position: r => [h('dl', {class: 'kv'}, h('dt', {}, 'Puntata'), h('dd', {'data-out': 'stake'}, nf(r.stake)), h('dt', {}, 'Responsabilità'), h('dd', {'data-out': 'liability'}, nf(r.liab)),
    h('dt', {}, 'Se la selezione vince'), h('dd', {}, signed(r.win)), h('dt', {}, 'Se la selezione perde'), h('dd', {}, signed(r.lose)), h('dt', {}, 'Probabilità di pareggio'), h('dd', {}, pct(r.be, 2)))],
  hedge: r => [h('dl', {class: 'kv'}, h('dt', {}, 'Copertura'), h('dd', {'data-out': 'hedge'}, `${SIDE_TEXT[r.side]} ${nf(r.stake)}`), h('dt', {}, 'Responsabilità della copertura'), h('dd', {}, nf(r.liab)),
    h('dt', {}, 'Prima: vince / perde'), h('dd', {}, `${signed(r.before.win)} / ${signed(r.before.lose)}`), h('dt', {}, 'Dopo: vince / perde'), h('dd', {'data-out': 'after'}, `${signed(r.after.win)} / ${signed(r.after.lose)}`),
    ...(Math.abs(r.after.win - r.after.lose) < 0.01 ? [h('dt', {}, 'Cashout teorico'), h('dd', {'data-out': 'cashout'}, signed(Math.min(r.after.win, r.after.lose)))]
      : [h('dt', {}, 'Cashout teorico'), h('dd', {'data-out': 'cashout'}, 'solo con copertura totale')])), h('p', {class: 'notice'}, 'La disponibilità della quota sul mercato non è verificata.')],
  dutching: r => [h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, ['Quota', 'Puntata', 'Se vince'].map(x => h('th', {class: 'n'}, x)))),
    h('tbody', {}, r.rows.map(x => h('tr', {}, h('td', {class: 'n'}, odd(x.odds)), h('td', {class: 'n'}, nf(x.stake)), h('td', {class: `n ${x.win >= 0 ? 'ok' : 'bad'}`}, signed(x.win))))))),
    h('dl', {class: 'kv', style: {marginTop: '10px'}}, h('dt', {}, 'Puntata totale'), h('dd', {'data-out': 'placed'}, nf(r.placed)), h('dt', {}, 'Totale delle probabilità'), h('dd', {}, pct(r.book, 2)))],
  poisson: r => [h('div', {class: 'odds', style: {gridTemplateColumns: 'repeat(3,minmax(0,1fr))', maxWidth: '380px'}}, [['1', r.H], ['X', r.D], ['2', r.A]].map(([l, p]) => h('div', {class: 'odd'}, h('span', {}, l), h('b', {}, pct(p, 2)), h('span', {}, `equa ${nf(1 / p, 2)}`)))),
    h('div', {class: 'tablewrap', style: {marginTop: '10px'}}, h('table', {}, h('thead', {}, h('tr', {}, ['Linea', 'Over', 'Under'].map(x => h('th', {class: 'n'}, x)))),
      h('tbody', {}, r.lines.map(l => h('tr', {}, h('td', {class: 'n'}, nf(l.line, 1)), h('td', {class: 'n'}, pct(l.over, 2)), h('td', {class: 'n'}, pct(l.under, 2))))))),
    h('p', {class: 'small'}, `Entrambe segnano: ${pct(r.btts, 2)} · Più probabili: ${r.top.map(t => `${t.h}–${t.a} ${pct(t.p, 1)}`).join(', ')}`),
    h('div', {class: 'tablewrap'}, h('table', {'data-testid': 'poisson-grid'}, h('thead', {}, h('tr', {}, h('th', {}, 'C \\ O'), Array.from({length: r.max + 1}, (_, a) => h('th', {class: 'n'}, String(a))))),
      h('tbody', {}, Array.from({length: r.max + 1}, (_, i) => h('tr', {}, h('th', {}, String(i)), Array.from({length: r.max + 1}, (_, j) => { const c = r.cells.find(x => x.h === i && x.a === j); return h('td', {class: 'n', 'data-score': `${i}-${j}`}, c ? pct(c.p, 1) : ND); })))))),
    h('p', {class: 'notice'}, `Modello teorico con gol indipendenti, non una previsione. Copertura della griglia ${pct(r.cov, 2)}.`)],
  progression: r => [h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, ['Passo', 'Puntata', 'Esposto cumulato', 'Se vince ora'].map(x => h('th', {class: 'n'}, x)))),
    h('tbody', {}, r.rows.map(x => h('tr', {}, h('td', {class: 'n'}, x.step), h('td', {class: 'n'}, nf(x.stake)), h('td', {class: 'n'}, nf(x.cumulative)), h('td', {class: 'n'}, signed(x.ifWins))))))),
    h('p', {class: 'warn small', 'data-out': 'progression'}, `Dopo ${r.rows.length} perdite consecutive l’esposizione totale è ${nf(r.total)}. Calcolo teorico: non è un modello di Money Management attivo (#96).`)],
  risk: r => [h('dl', {class: 'kv'}, h('dt', {}, 'Probabilità della serie di perdite'), h('dd', {'data-out': 'streak'}, pct(r.streak, 2)), h('dt', {}, 'Perdite consecutive per azzerare il capitale'), h('dd', {}, nint(r.ruinN)),
    h('dt', {}, 'Probabilità di quella serie'), h('dd', {}, pct(r.ruinStreak, 4))),
    h('div', {class: 'tablewrap', style: {marginTop: '10px'}}, h('table', {}, h('thead', {}, h('tr', {}, ['Perdite di fila', 'Probabilità', 'Calo', 'Quota del capitale'].map(x => h('th', {class: 'n'}, x)))),
      h('tbody', {}, r.rows.map(x => h('tr', {}, h('td', {class: 'n'}, x.k), h('td', {class: 'n'}, pct(x.p, 3)), h('td', {class: 'n'}, nf(x.dd)), h('td', {class: 'n'}, pct(x.share, 1)))))))],
  convert: r => [h('dl', {class: 'kv'}, h('dt', {}, 'Decimale'), h('dd', {}, nf(r.decimal)), h('dt', {}, 'Frazionaria'), h('dd', {'data-out': 'fractional'}, r.fractional), h('dt', {}, 'Americana'), h('dd', {}, r.american),
    h('dt', {}, 'Hong Kong'), h('dd', {}, nf(r.hk)), h('dt', {}, 'Probabilità implicita'), h('dd', {}, pct(r.implied, 2)))],
};
view({id: 'tools', title: 'Strumenti di trading', phase: 'UI-10', issues: ['#94'], async render(params) {
  const tool = TOOL_DEFS.some(([t]) => t === params.get('tool')) ? params.get('tool') : 'odds';
  const [, title, fields, server] = TOOL_DEFS.find(([t]) => t === tool);
  const vals = params.get('run') ? Object.fromEntries(fields.map(([k]) => [k, params.get(k) ?? ''])) : TOOL_DEFAULTS[tool];
  const useServer = isReal() && server;
  const form = h('form', {class: 'card', 'data-testid': 'tool-form', 'data-tool': tool, onsubmit: e => {
    e.preventDefault();
    const out = Object.fromEntries([...new FormData(e.target).entries()].map(([k, x]) => [k, String(x).trim()]).filter(([, x]) => x));
    go('tools', {tool, ...out, run: 1});
  }}, h('div', {class: 'fields'}, fields.map(([k, label, opt = {}]) => h('label', {class: 'f'}, label, opt.select
    ? h('select', {name: k, ctl: 'CTL-TOOL-FIELD', 'data-field': k}, opt.select.map(([x, t]) => h('option', {value: x, selected: (vals[k] || opt.select[0][0]) === x}, t)))
    : h('input', {name: k, type: opt.type ?? 'text', inputmode: 'decimal', value: vals[k] ?? '', placeholder: opt.placeholder ?? '', ctl: 'CTL-TOOL-FIELD', 'data-field': k, autocomplete: 'off'})))),
  h('div', {class: 'row', style: {marginTop: '12px'}}, h('button', {class: 'btn pri', type: 'submit', ctl: 'CTL-TOOL-RUN'}, 'Calcola'),
    h('button', {class: 'btn', type: 'button', ctl: 'CTL-TOOL-RESET', onclick: () => go('tools', {tool})}, 'Valori di esempio')));
  let result = null, error = null;
  if (params.get('run')) {
    try {
      if (useServer) { const p = {...vals}; for (const k of Object.keys(p)) if (p[k] === '') delete p[k]; result = FROM_SERVER[tool]((await REAL.tool(tool, p)).display); }
      else result = LOCAL_TOOLS[tool](vals);
    } catch (e) { error = e instanceof ApiFailure ? (e.status === 400 ? `Valore non valido: ${e.message}` : refusalText(e)) : e.message; }
  }
  return [head('Strumenti di trading', {sub: 'Calcolatori per trading sportivo su exchange', chips: [chip(useServer ? 'REAL' : 'DEMO', useServer ? 'Calcolo del server (decimali esatti)' : 'Calcolo locale nel browser, non certificato')], issues: ['UI-10', '#94']}),
    tabsBar('CTL-TOOL-TAB', TOOL_DEFS.map(([k, t]) => [k, t]), tool, t => go('tools', {tool: t}), 'Strumenti'),
    strip(useServer ? 'REAL' : 'DEMO', useServer ? 'Calcolo eseguito dal server MatchPilot in decimali esatti.' : server ? 'Calcolo locale nel browser (numeri in virgola mobile, arrotondati al centesimo): con il server MatchPilot lo stesso calcolo è esatto.' : 'Calcolo locale nel browser: strumento non ancora presente sul server.'),
    form,
    !params.get('run') ? emptyState('Modifica i valori e premi Calcola.') : error ? h('div', {class: 'state error', role: 'alert', 'data-testid': 'tool-error'}, error)
      : h('section', {class: 'card', 'data-testid': 'tool-result', 'data-tool': tool}, h('h2', {}, title), TOOL_OUT[tool](result))];
}});
