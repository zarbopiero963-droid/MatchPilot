
// ================================================================ Impostazioni (UI-11, #95)
const SETTING_FIELDS = [
  ['Exchange e commissione', [['exchange', 'Exchange', 'text'], ['commission', 'Commissione %', 'number', {min: 0, max: 99.99, step: 0.1}], ['currency', 'Valuta', 'select', {options: [['EUR', 'Euro (€)'], ['GBP', 'Sterlina (£)'], ['USD', 'Dollaro ($)']]}],
    ['timezone', 'Fuso orario', 'select', {options: [['Europe/Rome', 'Europe/Rome'], ['Europe/London', 'Europe/London'], ['UTC', 'UTC']]}]]],
  ['Capitale e puntate', [['bankroll', 'Capitale del conto simulato', 'number', {min: 1, step: 1}], ['default_stake', 'Puntata predefinita', 'number', {min: 0.01, step: 0.01}], ['min_stake', 'Puntata minima', 'number', {min: 0.01, step: 0.01}]]],
  ['Limiti di rischio', [['max_stake', 'Puntata massima', 'number', {min: 0.01, step: 0.01}], ['max_liability', 'Responsabilità massima', 'number', {min: 0.01, step: 0.01}],
    ['daily_loss', 'Perdita giornaliera massima', 'number', {min: 0.01, step: 0.01}], ['max_open', 'Posizioni aperte al massimo', 'number', {min: 1, step: 1}]]],
  ['Freschezza dei dati live (secondi)', [['fresh_s', 'Aggiornato fino a', 'number', {min: 1, step: 1}], ['delayed_s', 'In ritardo fino a', 'number', {min: 2, step: 1}], ['stale_s', 'Fermo fino a', 'number', {min: 3, step: 1}]]],
  ['Visualizzazione', [['show_issues', 'Mostra le issue sulle pagine', 'checkbox'], ['hide_scores', 'Nascondi i risultati delle partite finite (anti-spoiler)', 'checkbox']]],
];
function settingsErrors(x) {
  const e = [];
  if (!String(x.exchange).trim()) e.push('Exchange: obbligatorio.');
  if (!(x.commission >= 0 && x.commission < 100)) e.push('Commissione: tra 0 e 99,99.');
  for (const k of ['bankroll', 'default_stake', 'min_stake', 'max_stake', 'max_liability', 'daily_loss', 'max_open']) if (!(x[k] > 0)) e.push(`${k.replace('_', ' ')}: deve essere maggiore di zero.`);
  if (x.min_stake > x.default_stake) e.push('La puntata minima supera quella predefinita.');
  if (x.default_stake > x.max_stake) e.push('La puntata predefinita supera la massima.');
  if (!(x.fresh_s < x.delayed_s && x.delayed_s < x.stale_s)) e.push('Freschezza: serve aggiornato < in ritardo < fermo.');
  return e;
}
view({id: 'settings', title: 'Impostazioni', phase: 'UI-11', issues: ['#95'], render() {
  const cur = settings();
  const history = store.get('settingsHistory', []);
  const errs = h('div', {role: 'alert', 'data-testid': 'set-errors'});
  const inputs = [];
  const form = h('form', {class: 'card', 'data-testid': 'settings-form', novalidate: true, onsubmit: e => {
    e.preventDefault();
    const next = {...cur};
    for (const n of inputs) { const k = n.dataset.field; next[k] = n.type === 'checkbox' ? n.checked : n.type === 'number' ? Number(n.value) : n.value; }
    const bad = settingsErrors(next);
    if (bad.length) { errs.replaceChildren(h('ul', {class: 'err'}, bad.map(t => h('li', {}, t)))); return; }
    const changed = Object.keys(next).filter(k => !['version', 'updated_at'].includes(k) && next[k] !== cur[k]);
    if (!changed.length) { errs.replaceChildren(h('p', {class: 'muted'}, 'Nessuna modifica da salvare.')); return; }
    next.version = cur.version + 1; next.updated_at = new Date().toISOString();
    store.set('settings', next);
    store.set('settingsHistory', [{version: next.version, at: next.updated_at, changes: changed.map(k => `${k}: ${cur[k]} → ${next[k]}`)}, ...history].slice(0, 30));
    document.body.classList.toggle('dev', !!next.show_issues);
    toast(`Impostazioni salvate (versione ${next.version})`, 'ok'); render();
  }}, SETTING_FIELDS.map(([title, fields]) => h('fieldset', {}, h('legend', {}, title), h('div', {class: 'fields'}, fields.map(([k, label, type, o = {}]) => {
    const n = type === 'select' ? h('select', {ctl: 'CTL-SET-FIELD', 'data-field': k}, o.options.map(([v, t]) => h('option', {value: v, selected: cur[k] === v}, t)))
      : type === 'checkbox' ? h('input', {type: 'checkbox', checked: !!cur[k], ctl: 'CTL-SET-FIELD', 'data-field': k})
        : h('input', {type, value: cur[k], ctl: 'CTL-SET-FIELD', 'data-field': k, min: o.min, max: o.max, step: o.step});
    inputs.push(n);
    return h('label', {class: type === 'checkbox' ? 'f inl' : 'f'}, type === 'checkbox' ? [n, label] : [label, n]);
  })))), errs,
  h('div', {class: 'row'}, h('button', {class: 'btn pri', type: 'submit', ctl: 'CTL-SET-SAVE'}, 'Salva'),
    h('button', {class: 'btn', type: 'button', ctl: 'CTL-SET-DEFAULTS', onclick: async () => {
      if (!await confirmDialog('Ripristinare i valori predefiniti?', 'Le impostazioni tornano ai valori iniziali; resta traccia nella cronologia.', {ok: 'Ripristina'})) return;
      const v = cur.version + 1; store.set('settings', {...SETTINGS_DEFAULT, version: v, updated_at: new Date().toISOString()});
      store.set('settingsHistory', [{version: v, at: new Date().toISOString(), changes: ['valori predefiniti']}, ...history].slice(0, 30)); toast('Valori predefiniti ripristinati', 'ok'); render();
    }}, 'Valori predefiniti'),
    h('button', {class: 'btn', type: 'button', ctl: 'CTL-SET-EXPORT', onclick: () => download('matchpilot-impostazioni.json', JSON.stringify(cur, null, 2), 'application/json')}, 'Esporta')));
  return [head('Impostazioni', {sub: `Versione ${cur.version}${cur.updated_at ? ` · aggiornate il ${when(cur.updated_at)}` : ''}`, chips: [chip('DEMO', 'Salvate in questo browser')], issues: ['UI-11', '#95']}),
    strip('DEMO', 'Impostazioni salvate in questo browser. L’API delle impostazioni account (#95) non esiste ancora: nessun valore va sul server.'), form,
    h('div', {class: 'grid g2', style: {marginTop: '14px'}},
      h('section', {class: 'card', 'data-testid': 'set-history'}, h('h2', {}, 'Cronologia delle versioni'), history.length ? h('ul', {class: 'small', style: {margin: 0, paddingLeft: '18px'}}, history.slice(0, 10).map(x => h('li', {}, `v${x.version} · ${when(x.at)} · ${x.changes.join('; ')}`))) : emptyState('Nessuna modifica salvata.')),
      h('section', {class: 'card'}, h('h2', {}, 'Dati di questo browser'), h('p', {class: 'small muted'}, 'Strategie, simulazioni salvate, conto simulato, profili e impostazioni DEMO restano solo qui.'),
        h('button', {class: 'btn danger', type: 'button', ctl: 'CTL-SET-WIPE', onclick: async () => {
          if (!await confirmDialog('Cancellare tutti i dati locali?', 'Strategie, simulazioni salvate, conto simulato, profili e impostazioni di questo browser verranno cancellati. Non si può annullare.', {ok: 'Cancella tutto', danger: true})) return;
          store.clearNs(NS); toast('Dati locali cancellati', 'ok'); render();
        }}, 'Cancella i dati locali')))];
}});

// ================================================================ Sessione e permessi (UI-11, #23)
view({id: 'session', title: 'Sessione e permessi', phase: 'UI-11', issues: ['#23'], async render() {
  const perms = h('section', {class: 'card'}, h('h2', {}, 'Ruoli e permessi'), h('div', {class: 'tablewrap'}, h('table', {}, h('thead', {}, h('tr', {}, ['Ruolo', 'Lettura', 'Salvataggi', 'Operatività', 'Stato'].map(x => h('th', {}, x)))),
    h('tbody', {}, h('tr', {}, h('td', {}, 'Owner'), h('td', {}, 'sì'), h('td', {}, 'sì'), h('td', {}, 'solo simulata'), h('td', {}, h('span', {class: 'chip ok'}, 'Attivo'))),
      h('tr', {}, h('td', {}, 'Secondo amministratore'), h('td', {}, 'previsto'), h('td', {}, 'previsto'), h('td', {}, 'previsto'), h('td', {}, h('span', {class: 'chip'}, 'Previsto (#23)'))),
      h('tr', {}, h('td', {}, 'Utenti SaaS'), h('td', {}, '—'), h('td', {}, '—'), h('td', {}, '—'), h('td', {}, h('span', {class: 'chip'}, 'Escluso dall’owner')))))),
    h('p', {class: 'notice'}, 'Multi-utente, abbonamenti e billing sono esclusi da questa fase per decisione owner.'));
  if (!isReal()) return [head('Sessione e permessi', {chips: [chip('UNAVAILABLE')], issues: ['UI-11', '#23']}),
    strip('UNAVAILABLE', 'File aperto senza server: nessuna sessione. L’accesso owner (utente, password, sessione sul server, limite ai tentativi, audit) esiste sul server MatchPilot con MATCHPILOT_AUTH=enforce.'), perms];
  const sess = await REAL.session();
  const per = await REAL.persistence().catch(() => null);
  let busy = false;
  const out = h('div', {role: 'status'});
  return [head('Sessione e permessi', {chips: [chip('REAL')], issues: ['UI-11', '#23']}),
    h('section', {class: 'card', 'data-testid': 'session', 'data-session': sess.state}, h('h2', {}, 'Accesso'),
      sess.state === 'SIGNED_IN' ? [h('dl', {class: 'kv'}, h('dt', {}, 'Utente'), h('dd', {}, sess.principal ?? ND), h('dt', {}, 'Ruoli'), h('dd', {}, (sess.roles ?? []).join(', ') || ND), h('dt', {}, 'Scade'), h('dd', {}, sess.expires_at ? when(sess.expires_at) : ND)),
        h('div', {class: 'row', style: {marginTop: '10px'}}, h('button', {class: 'btn danger', type: 'button', ctl: 'CTL-SESSION-LOGOUT', onclick: async e => {
          if (busy) return; busy = true; e.currentTarget.disabled = true;
          try { const r = await fetch('/auth/logout', {method: 'POST', credentials: 'same-origin'}); if (!r.ok) throw new Error(); location.assign('/login'); }
          catch { out.replaceChildren(h('p', {class: 'err'}, 'Uscita non riuscita: riprova.')); busy = false; e.currentTarget.disabled = false; }
        }}, 'Esci')), out]
        : sess.state === 'SIGNED_OUT' ? h('p', {}, 'Non hai effettuato l’accesso. ', h('a', {href: `/login?next=${encodeURIComponent(location.pathname + location.hash)}`, ctl: 'CTL-SESSION-LOGIN'}, 'Accedi'))
          : h('p', {class: 'muted'}, 'L’accesso owner non è attivo su questo server: il sito è consultabile, i salvataggi sul server sono disattivati.')),
    h('section', {class: 'card'}, h('h2', {}, 'Archivio del server'), h('dl', {class: 'kv'}, h('dt', {}, 'Strategie e simulazioni salvate'), h('dd', {}, per ? (per.available ? 'attivo' : 'non ancora attivo') : ND),
      h('dt', {}, 'Salvataggi'), h('dd', {}, sess.state === 'SIGNED_IN' && per?.available ? 'consentiti' : 'non consentiti'))), perms];
}});

// ================================================================ Diagnostica (UI-11, #31 #98)
view({id: 'diagnostics', title: 'Diagnostica', phase: 'UI-11', issues: ['#31', '#98'], async render() {
  const checks = [];
  const add = (name, state, detail) => checks.push({name, state, detail});
  add('Build', 'ok', `${BUILD.label} · ${BUILD.id}`);
  add('Origine dei dati', APP.mode === 'REAL' ? 'ok' : 'warn', APP.mode === 'REAL' ? 'API v1 del server MatchPilot' : APP.realAvailable ? 'DEMO scelta dall’utente (REAL disponibile)' : 'DEMO: file aperto senza server MatchPilot');
  if (APP.realAvailable) {
    try { const b = await REAL.health(); add('API v1', 'ok', `${b.data?.status ?? 'ok'} · codice ${b.meta?.code_version ?? ND}`); } catch (e) { add('API v1', 'bad', refusalText(e)); }
    try { const p = await REAL.providers(); add('Salute dei dati', p?.data_health?.status === 'ok' ? 'ok' : 'warn', `stato ${p?.data_health?.status ?? ND}`); } catch (e) { add('Salute dei dati', 'bad', refusalText(e)); }
  } else add('API v1', 'warn', 'Non raggiungibile da un file locale: le integrazioni reali si attivano servendo questa pagina dal server MatchPilot.');
  add('Memoria del browser', store.available() ? 'ok' : 'bad', store.available() ? 'disponibile' : 'non disponibile: salvataggi locali disattivati');
  const live = demoDay(today()).map(withState).filter(m => ['LIVE', 'HT'].includes(m.status));
  const fresh = ['FRESH', 'DELAYED', 'STALE', 'OFFLINE'].map(s0 => [s0, live.filter(m => m.fresh.state === s0).length]);
  add('Feed live DEMO', fresh.some(([k, n]) => ['STALE', 'OFFLINE'].includes(k) && n) ? 'warn' : 'ok', live.length ? fresh.map(([k, n]) => `${FRESH_TEXT[k]} ${n}`).join(' · ') : 'nessuna partita in diretta');
  const audit = auditDom(document);
  add('Controlli senza identificativo', audit.missing.length ? 'bad' : 'ok', audit.missing.length ? audit.missing.slice(0, 6).join(', ') : 'nessuno nella pagina');
  add('Identificativi non dichiarati', audit.unknown.length ? 'bad' : 'ok', audit.unknown.length ? audit.unknown.join(', ') : 'nessuno');
  add('Errori JavaScript', ERRORS.length ? 'bad' : 'ok', ERRORS.length ? `${ERRORS.length}: ${ERRORS.at(-1).message}` : 'nessuno');
  add('Ultimo rendering', APP.lastRender ? (APP.lastRender.ms < 500 ? 'ok' : 'warn') : 'ok', APP.lastRender ? `${VIEWS.get(APP.lastRender.view)?.title ?? APP.lastRender.view}: ${Math.round(APP.lastRender.ms)} ms` : ND);
  const off = Number(APP.clockOffset) || 0;
  const clockIn = h('input', {type: 'datetime-local', ctl: 'CTL-DIAG-CLOCK', 'aria-label': 'Ora dell’orologio DEMO', value: (() => { const d = new Date(nowMs()); return `${isoDay(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; })()});
  return [head('Diagnostica', {sub: 'Disponibilità e qualità dei dati, integrità dell’interfaccia', chips: [chip(APP.mode)], issues: ['UI-11', '#31'],
    actions: [h('button', {class: 'btn', type: 'button', ctl: 'CTL-DIAG-RECHECK', onclick: () => { render(); toast('Controlli ripetuti'); }}, 'Ricontrolla')]}),
  h('section', {class: 'card', 'data-testid': 'diag-checks'}, h('h2', {}, 'Controlli'), h('div', {class: 'tablewrap'}, h('table', {}, h('tbody', {}, checks.map(c => h('tr', {'data-check': c.name, 'data-state': c.state},
    h('td', {}, h('span', {class: `chip ${c.state}`}, c.state === 'ok' ? 'OK' : c.state === 'warn' ? 'ATTENZIONE' : 'ERRORE')), h('td', {}, h('b', {}, c.name)), h('td', {class: 'small'}, c.detail))))))),
  h('div', {class: 'grid g2'},
    h('section', {class: 'card', 'data-testid': 'diag-clock'}, h('h2', {}, 'Orologio DEMO', chip('DEMO')),
      h('p', {class: 'small muted'}, 'Sposta l’ora vista dai dati DEMO per vedere una giornata di partite in diretta in qualsiasi momento. Non vale per i dati reali.'),
      h('div', {class: 'row'}, clockIn, h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-DIAG-CLOCK-SET', disabled: isReal(), onclick: () => {
        const t = new Date(clockIn.value).getTime();
        if (!Number.isFinite(t)) { toast('Data e ora non valide', 'bad'); return; }
        APP.clockOffset = t - Date.now(); store.set('clockOffset', APP.clockOffset); dayCache.clear(); updateLiveCount(); toast('Orologio DEMO spostato', 'ok'); render();
      }}, 'Imposta'),
      h('button', {class: 'btn', type: 'button', ctl: 'CTL-DIAG-CLOCK-RESET', disabled: !off, onclick: () => { APP.clockOffset = 0; store.set('clockOffset', 0); updateLiveCount(); toast('Orologio reale'); render(); }}, 'Ora reale')),
      h('p', {class: 'small', 'data-testid': 'diag-clock-state'}, off ? `Spostato di ${ago(Math.abs(off))} ${off > 0 ? 'avanti' : 'indietro'}.` : 'Orologio reale.')),
    h('section', {class: 'card'}, h('h2', {}, 'Integrità dei controlli'), h('p', {class: 'small muted'}, `Controlli dichiarati: ${SPECS.size} · visti in questa sessione: ${SEEN.size}.`),
      h('button', {class: 'btn', type: 'button', ctl: 'CTL-DIAG-AUDIT', onclick: e => { const a = auditDom(document); e.currentTarget.nextSibling.textContent = `Controlli senza identificativo nella pagina: ${a.missing.length}; identificativi non dichiarati: ${a.unknown.length}.`; }}, 'Verifica la pagina'),
      h('p', {class: 'small', 'data-testid': 'diag-audit'}, ''),
      h('button', {class: 'btn sm', type: 'button', ctl: 'CTL-DIAG-ERRORS-CLEAR', disabled: !ERRORS.length, onclick: () => { ERRORS.length = 0; render(); }}, 'Svuota gli errori')))];
}});

// ================================================================ Roadmap, inventario, matrice, autotest (UI-01, UI-12)
const PHASES = [
  ['UI-01', 'Fondamenta e certificazione', 'Inventario dei controlli, design system, componenti, routing e stato, autotest nel browser, matrice di copertura'],
  ['UI-02', 'Navigazione', 'Shell, sidebar, topbar, ricerca e filtri globali, navigazione responsive, stati'],
  ['UI-03', 'Dashboard e palinsesto', 'Dashboard, calendario, partite e competizioni, filtri avanzati'],
  ['UI-04', 'Match Center', 'Pre-partita, live, finita, statistiche, quote e mercati, confronti'],
  ['UI-05', 'Live Board', 'Feed live, card trading, clock, freschezza, eventi, quote'],
  ['UI-06', 'Analisi e Replay', 'Analysis Hub Home/Away/Both, grafici, replay deterministico'],
  ['UI-07', 'Strategy Lab', 'Rule builder, condizioni, versioni, salvataggio, attivazione simulata'],
  ['UI-08', 'Simulazioni e backtest', 'Configurazione, risultati, P/L teorico, confronto, salvataggio'],
  ['UI-09', 'Paper trading e Money Management', 'Conto virtuale, posizioni, registro, profili, STOP'],
  ['UI-10', 'Trading Tools', 'EV, Kelly, Punta/Banca, copertura, dutching, Poisson, progressioni, rischio'],
  ['UI-11', 'Copilot e impostazioni', 'Copilot, assistente, impostazioni, sessione, diagnostica'],
  ['UI-12', 'Certificazione globale', 'Inventario finale, autotest completo, regressione, responsive, accessibilità'],
];
// PR registry: [id, phase, title, issues, control prefixes]
const PRS = [
  ['MP-UI-PR-001', 'UI-01', 'Inventario dei controlli e gate di copertura', ['#2', '#91'], ['CTL-DIAG-AUDIT']],
  ['MP-UI-PR-002', 'UI-01', 'Design system e componenti', ['#91'], ['CTL-DLG-']],
  ['MP-UI-PR-003', 'UI-01', 'Routing, stato e gestione errori', ['#97'], ['CTL-STATE-', 'CTL-NOTFOUND-']],
  ['MP-UI-PR-004', 'UI-01', 'Autotest nel browser e matrice', ['#2'], ['CTL-COV-']],
  ['MP-UI-PR-005', 'UI-02', 'Shell: sidebar, topbar, barra mobile', ['#3'], ['CTL-NAV-', 'CTL-BOT-']],
  ['MP-UI-PR-006', 'UI-02', 'Ricerca globale, filtri e origine dei dati', ['#3'], ['CTL-GSEARCH-', 'CTL-TOP-', 'CTL-FILTER-', 'CTL-MODE-', 'CTL-ACC-']],
  ['MP-UI-PR-007', 'UI-03', 'Dashboard del giorno', ['#3'], ['CTL-DASH-', 'CTL-MATCH-OPEN']],
  ['MP-UI-PR-008', 'UI-03', 'Calendario', ['#3'], ['CTL-CAL-']],
  ['MP-UI-PR-009', 'UI-03', 'Partite con filtri avanzati', ['#30'], ['CTL-MATCHES-']],
  ['MP-UI-PR-010', 'UI-03', 'Competizioni e classifiche', ['#3'], ['CTL-COMP-']],
  ['MP-UI-PR-011', 'UI-04', 'Match Center: hero e schede', ['#25'], ['CTL-MC-TAB', 'CTL-MC-BACK', 'CTL-MC-REVEAL', 'CTL-MC-ANALYSIS', 'CTL-MC-REPLAY']],
  ['MP-UI-PR-012', 'UI-04', 'Quote, mercati, statistiche, esito dei mercati', ['#25', '#100'], ['CTL-MC-ODD', 'CTL-MC-TOOL-']],
  ['MP-UI-PR-013', 'UI-04', 'Confronto Home/Away/Both e precedenti', ['#30'], ['CTL-MC-TEAM', 'CTL-MC-WINDOW', 'CTL-MC-VENUE', 'CTL-MC-GOCOMPARE']],
  ['MP-UI-PR-014', 'UI-05', 'Live Board: card, freschezza, quote', ['#29'], ['CTL-LIVE-OPEN', 'CTL-LIVE-COPILOT', 'CTL-LIVE-TRADE']],
  ['MP-UI-PR-015', 'UI-05', 'Live Board: filtri, aggiornamento, pausa', ['#29'], ['CTL-LIVE-FILTER', 'CTL-LIVE-SORT', 'CTL-LIVE-INTERVAL', 'CTL-LIVE-PAUSE', 'CTL-LIVE-REFRESH']],
  ['MP-UI-PR-016', 'UI-06', 'Analysis Hub', ['#30'], ['CTL-AN-']],
  ['MP-UI-PR-017', 'UI-06', 'Replay deterministico', ['#24'], ['CTL-REPLAY-OPEN', 'CTL-REPLAY-COMP', 'CTL-REPLAY-BACK', 'CTL-REPLAY-SLIDER', 'CTL-REPLAY-PLAY', 'CTL-REPLAY-SPEED', 'CTL-REPLAY-BACKSTEP', 'CTL-REPLAY-FWD', 'CTL-REPLAY-RESET', 'CTL-REPLAY-SPOILER']],
  ['MP-UI-PR-018', 'UI-06', 'Replay con strategia', ['#24', '#34'], ['CTL-REPLAY-STRAT']],
  ['MP-UI-PR-019', 'UI-07', 'Rule builder e condizioni', ['#34'], ['CTL-STRAT-NEW', 'CTL-STRAT-NAME', 'CTL-STRAT-MARKET', 'CTL-STRAT-SEL', 'CTL-STRAT-SIDE', 'CTL-STRAT-PHASE', 'CTL-STRAT-TEAM', 'CTL-STRAT-VENUE', 'CTL-STRAT-COMP', 'CTL-COND-', 'CTL-STRAT-ADDCOND', 'CTL-STRAT-SAVE', 'CTL-STRAT-CANCEL']],
  ['MP-UI-PR-020', 'UI-07', 'Versioni, duplica, elimina, import/export', ['#34'], ['CTL-STRAT-EDIT', 'CTL-STRAT-VERSIONS', 'CTL-STRAT-RESTORE', 'CTL-STRAT-DUP', 'CTL-STRAT-DELETE', 'CTL-STRAT-EXPORT', 'CTL-STRAT-IMPORT']],
  ['MP-UI-PR-021', 'UI-07', 'Attivazione simulata e segnali', ['#34', '#28'], ['CTL-STRAT-ACTIVE', 'CTL-STRAT-BT', 'CTL-STRAT-TRYBT']],
  ['MP-UI-PR-022', 'UI-08', 'Configurazione e risultati del backtest', ['#34'], ['CTL-BT-STRAT', 'CTL-BT-FROM', 'CTL-BT-TO', 'CTL-BT-STAKE', 'CTL-BT-COMM', 'CTL-BT-BANK', 'CTL-BT-MM', 'CTL-BT-MMV', 'CTL-BT-RUN', 'CTL-BT-PREV', 'CTL-BT-NEXT', 'CTL-BT-CSV', 'CTL-BT-TAB', 'CTL-BT-NEWSTRAT']],
  ['MP-UI-PR-023', 'UI-08', 'Confronto di strategie', ['#34'], ['CTL-CMP-']],
  ['MP-UI-PR-024', 'UI-08', 'Salvataggio e ricarica delle simulazioni', ['#34', '#99'], ['CTL-BT-NAME', 'CTL-BT-SAVE', 'CTL-BT-OPEN-SAVED', 'CTL-BT-DEL-SAVED']],
  ['MP-UI-PR-025', 'UI-09', 'Conto virtuale e posizioni', ['#99'], ['CTL-PAPER-NEW', 'CTL-PAPER-SETTLE', 'CTL-PAPER-HEDGE', 'CTL-HEDGE-', 'CTL-TRADE-', 'CTL-MC-TRADE', 'CTL-PAPER-ACCOUNT', 'CTL-PAPER-LOAD']],
  ['MP-UI-PR-026', 'UI-09', 'Registro e stati STOP', ['#99', '#96'], ['CTL-PAPER-STOP', 'CTL-PAPER-RESUME', 'CTL-PAPER-PAUSE', 'CTL-PAPER-REASON', 'CTL-PAPER-LEDGER-TYPE', 'CTL-PAPER-CSV', 'CTL-PAPER-RESET']],
  ['MP-UI-PR-027', 'UI-09', 'Profili di Money Management con versioni', ['#96'], ['CTL-MM-', 'CTL-MMF-']],
  ['MP-UI-PR-028', 'UI-09', 'Calcolo della puntata', ['#96'], ['CTL-MMC-']],
  ['MP-UI-PR-029', 'UI-10', 'Strumenti: margine, valore atteso, Kelly', ['#94'], ['CTL-TOOL-TAB', 'CTL-TOOL-RUN']],
  ['MP-UI-PR-030', 'UI-10', 'Strumenti: punta/banca, copertura, dutching', ['#94'], ['CTL-TOOL-FIELD']],
  ['MP-UI-PR-031', 'UI-10', 'Strumenti: Poisson, progressioni, rischio, convertitore', ['#94'], ['CTL-TOOL-RESET']],
  ['MP-UI-PR-032', 'UI-11', 'Trading Copilot', ['#102', '#28'], ['CTL-COP-']],
  ['MP-UI-PR-033', 'UI-11', 'Assistente deterministico', ['#44'], ['CTL-ASSIST-']],
  ['MP-UI-PR-034', 'UI-11', 'Impostazioni owner', ['#95'], ['CTL-SET-']],
  ['MP-UI-PR-035', 'UI-11', 'Sessione e diagnostica', ['#23', '#31'], ['CTL-SESSION-', 'CTL-DIAG-RECHECK', 'CTL-DIAG-CLOCK', 'CTL-DIAG-ERRORS-CLEAR']],
  ['MP-UI-PR-036', 'UI-12', 'Certificazione globale del frontend', ['#3', '#97', '#104'], []],
];
// The PR of a control: the longest prefix that matches its id.
function prOf(id) {
  let best = 'MP-UI-PR-005', len = -1;
  for (const [pid, , , , pre] of PRS) for (const p of pre) if (id.startsWith(p) && p.length > len) { best = pid; len = p.length; }
  return best;
}
// Integrations: component → existing API, future API, adapters, activation, blockers.
const INTEGRATIONS = [
  ['Palinsesto e partite', '/api/v1/fpt/matches, /api/v1/fpt/search', '—', 'demoDay', 'REAL.day', 'Archivio FPT reale certificato (R-02, #40)', 'Fornitore FPT fermo al 20–21/09'],
  ['Match Center, confronto', '/api/v1/fpt/match-analysis', 'statistiche di partita live', 'demoAnalysis', 'REAL.analysis', 'come sopra', 'Statistiche live: TotalCorner sospeso'],
  ['Live Board, Copilot', '/api/v1/tc/live (solo stato)', 'feed live in streaming (SSE)', 'liveState', '—', 'Riattivazione TotalCorner (owner)', 'TotalCorner sospeso (#182)'],
  ['Replay', '—', 'snapshot live storici', 'stateAt', '—', 'Raccolta live storica (#24)', 'Nessuno snapshot live'],
  ['Strategy Lab', '/api/v1/strategies (GET/POST)', 'mercati oltre 1X2, condizioni xG/live', 'store locale', 'REAL.strategies', 'Migrazione persistenza autorizzata (#232)', 'Schema di persistenza non applicato in produzione'],
  ['Backtest', '/api/v1/hist/backtest, /api/v1/backtests/saved', 'backtest live', 'demoBacktest', 'REAL.backtest', 'Decisione PIT e archivio reale', 'Dati reali non certificati'],
  ['Paper trading', '/api/v1/ledger/account (lettura)', 'apertura e copertura posizioni', 'ledger locale', 'REAL.account', 'Modalità operativa lato server (DEC-001)', 'Nessuna API di scrittura del ledger'],
  ['Money Management', '/api/v1/mm/models, /api/v1/mm/stake', 'profili persistenti', 'mmEvaluate', 'REAL.mmStake', 'API profili (#96)', 'Modelli oltre i 4 da definire (owner)'],
  ['Strumenti', '/api/v1/tools/*', 'progressioni, rischio, convertitore', 'LOCAL_TOOLS', 'REAL.tool', 'Pagina servita dal server', '—'],
  ['Impostazioni', '—', 'API impostazioni account (#95)', 'store locale', '—', 'API #95', 'API non esistente'],
  ['Sessione', '/auth/session, /auth/logout', '—', '—', 'REAL.session', 'MATCHPILOT_AUTH=enforce', 'Accesso owner spento per default'],
  ['Assistente', '—', 'assistente AI (#44)', 'answer()', '—', 'Autorizzazione di un fornitore AI (costo)', 'Nessuna API AI autorizzata'],
];
const RESULT_TEXT = {PASS: 'CERTIFIED MOCK', FAIL: 'FAIL', BLOCKED: 'BLOCKED', NOT_RUN: 'IMPLEMENTED'};
function controlStates() {
  const at = readRaw('autotest');
  const res = at?.controls ?? {};
  return [...SPECS.values()].map(sp => ({...sp, pr: prOf(sp.id), result: res[sp.id]?.result ?? 'NOT_RUN', tests: res[sp.id]?.tests ?? [], reason: res[sp.id]?.reason ?? null,
    status: RESULT_TEXT[res[sp.id]?.result ?? 'NOT_RUN']}));
}
function readRaw(k) { try { return JSON.parse(localStorage.getItem(`mp.${k}`)); } catch { return null; } }
function writeRaw(k, v) { try { localStorage.setItem(`mp.${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } }
view({id: 'coverage', title: 'Roadmap e copertura', phase: 'UI-12', issues: ['#239', '#3', '#97', '#104'], render(params) {
  const tab = ['roadmap', 'controls', 'matrix', 'integrations', 'autotest'].includes(params.get('tab')) ? params.get('tab') : 'roadmap';
  const set = patch => updateParams('coverage', params, patch);
  const states = controlStates();
  const at = readRaw('autotest');
  const pass = states.filter(c => c.result === 'PASS').length, total = states.length;
  const byPhase = ph => { const xs = states.filter(c => c.phase === ph); return {n: xs.length, pass: xs.filter(c => c.result === 'PASS').length, fail: xs.filter(c => c.result === 'FAIL').length, blocked: xs.filter(c => c.result === 'BLOCKED').length}; };
  const prState = pr => {
    const xs = states.filter(c => c.pr === pr[0]);
    if (pr[0] === 'MP-UI-PR-036') return pass === total && at ? 'CERTIFIED MOCK' : at ? 'IN PROGRESS' : 'IMPLEMENTED';
    if (!xs.length) return 'IMPLEMENTED';
    if (xs.some(c => c.result === 'FAIL')) return 'FAIL';
    if (xs.every(c => c.result === 'PASS')) return 'CERTIFIED MOCK';
    if (xs.every(c => c.result === 'PASS' || c.result === 'BLOCKED') && xs.some(c => c.result === 'PASS')) return 'TESTED';
    return xs.some(c => c.result === 'PASS') ? 'TESTED' : 'IMPLEMENTED';
  };
  const tabs = tabsBar('CTL-COV-TAB', [['roadmap', 'Roadmap'], ['controls', 'Controlli'], ['matrix', 'Matrice'], ['integrations', 'Integrazioni'], ['autotest', 'Autotest']], tab, t => set({tab: t}), 'Sezioni');
  const summary = h('div', {class: 'grid g4', style: {marginBottom: '14px'}},
    kpi('Controlli verificati', `${pass} / ${total}`, at ? `autotest del ${when(at.at)} (${at.mode})` : 'autotest non ancora eseguito', {'data-kpi': 'verified'}),
    kpi('Completamento', total ? pct(pass / total) : ND, 'da controlli verificati, non da impressioni', {'data-kpi': 'percent'}),
    kpi('Bloccati', nint(states.filter(c => c.result === 'BLOCKED').length), 'richiedono il server o dati reali'),
    kpi('CERTIFIED REAL', '0', 'nessuna verifica su dati reali da questo file'));
  let body;
  if (tab === 'roadmap') {
    body = [h('section', {class: 'card', 'data-testid': 'cov-phases'}, h('h2', {}, 'Fasi'), h('div', {class: 'tablewrap'}, h('table', {class: 'cards'}, h('thead', {}, h('tr', {}, ['Fase', 'Contenuto', 'Controlli', 'Verificati', 'Avanzamento'].map(x => h('th', {}, x)))),
      h('tbody', {}, PHASES.map(([id, name, what]) => { const b = byPhase(id); return h('tr', {'data-phase': id}, [h('td', {}, h('b', {}, id), h('div', {class: 'xs muted'}, name)), h('td', {class: 'small'}, what),
        h('td', {class: 'n'}, b.n), h('td', {class: 'n'}, b.pass), h('td', {}, h('div', {class: 'progress', title: pct(b.n ? b.pass / b.n : 0)}, h('i', {style: {width: `${b.n ? b.pass / b.n * 100 : 0}%`}})))]
        .map((td, i) => (td.setAttribute('data-label', ['Fase', 'Contenuto', 'Controlli', 'Verificati', 'Avanzamento'][i]), td))); }))))),
    h('section', {class: 'card', 'data-testid': 'cov-prs'}, h('h2', {}, 'Registro delle unità (PR)'), h('div', {class: 'tablewrap'}, h('table', {class: 'cards matrix'}, h('thead', {}, h('tr', {}, ['ID', 'Fase', 'Titolo', 'Issue', 'Stato'].map(x => h('th', {}, x)))),
      h('tbody', {}, PRS.map(pr => h('tr', {'data-pr': pr[0]}, [h('td', {class: 'mono'}, pr[0]), h('td', {}, pr[1]), h('td', {}, pr[2]), h('td', {}, pr[3].join(' ')), h('td', {}, h('span', {class: `chip ${prState(pr) === 'CERTIFIED MOCK' ? 'ok' : prState(pr) === 'FAIL' ? 'bad' : ''}`}, prState(pr)))]
        .map((td, i) => (td.setAttribute('data-label', ['ID', 'Fase', 'Titolo', 'Issue', 'Stato'][i]), td))))))),
      h('p', {class: 'notice'}, 'Stati: NOT STARTED, IN PROGRESS, IMPLEMENTED, TESTED, CERTIFIED MOCK, CERTIFIED REAL, BLOCKED. CERTIFIED MOCK = verificato dall’autotest su dati DEMO; CERTIFIED REAL richiede la verifica sui dati reali.'))];
  } else if (tab === 'controls' || tab === 'matrix') {
    const ph = params.get('phase') || '', st = params.get('state') || '', q = (params.get('q') || '').toLowerCase();
    const rows = states.filter(c => (!ph || c.phase === ph) && (!st || c.result === st) && (!q || `${c.id} ${c.label} ${c.view}`.toLowerCase().includes(q)));
    const qIn = h('input', {type: 'search', value: params.get('q') || '', placeholder: 'Cerca un controllo', ctl: 'CTL-COV-Q', 'aria-label': 'Cerca un controllo'});
    qIn.addEventListener('change', () => set({q: qIn.value.trim()}));
    const filters = h('div', {class: 'card row', style: {marginBottom: '14px'}},
      h('label', {class: 'f inl'}, 'Fase', h('select', {ctl: 'CTL-COV-FILTER', onchange: e => set({phase: e.target.value})}, h('option', {value: ''}, 'Tutte'), PHASES.map(([id]) => h('option', {value: id, selected: ph === id}, id)))),
      h('label', {class: 'f inl'}, 'Esito', h('select', {ctl: 'CTL-COV-STATE', onchange: e => set({state: e.target.value})}, [['', 'Tutti'], ['PASS', 'Verificati'], ['FAIL', 'Falliti'], ['BLOCKED', 'Bloccati'], ['NOT_RUN', 'Non eseguiti']].map(([v, t]) => h('option', {value: v, selected: st === v}, t)))),
      qIn, h('span', {class: 'muted small'}, `${rows.length} controlli`));
    const cols = tab === 'controls' ? ['Controllo', 'Pagina', 'Descrizione', 'Fase', 'Stato', 'Test'] : ['Issue', 'Requisito', 'PR', 'Pagina', 'Componente', 'Controllo', 'Test', 'Esito', 'Evidenza'];
    body = [filters, h('section', {class: 'card', 'data-testid': tab === 'controls' ? 'cov-controls' : 'cov-matrix'}, h('div', {class: 'tablewrap'}, h('table', {class: 'cards matrix'}, h('thead', {}, h('tr', {}, cols.map(x => h('th', {}, x)))),
      h('tbody', {}, rows.map(c => {
        const result = h('span', {class: c.result === 'PASS' ? 'pass' : c.result === 'FAIL' ? 'fail' : 'nt', title: c.reason ?? ''}, c.status);
        const cells = tab === 'controls'
          ? [h('td', {class: 'mono'}, c.id), h('td', {}, VIEWS.get(c.view)?.title ?? (c.view === 'shell' ? 'Shell' : c.view)), h('td', {}, c.label), h('td', {}, c.phase), h('td', {}, result), h('td', {class: 'mono xs'}, c.tests.join(' ') || '—')]
          : [h('td', {}, c.issues.join(' ')), h('td', {class: 'mono xs'}, `REQ-${c.id.slice(4)}`), h('td', {class: 'mono xs'}, c.pr), h('td', {}, VIEWS.get(c.view)?.title ?? 'Shell'), h('td', {}, c.kind),
            h('td', {class: 'mono xs'}, c.id), h('td', {class: 'mono xs'}, c.tests.join(' ') || '—'), h('td', {}, result), h('td', {class: 'xs'}, at && c.result !== 'NOT_RUN' ? `autotest ${when(at.at)} · ${at.mode}${c.reason ? ` · ${c.reason}` : ''}` : '—')];
        return h('tr', {'data-control-row': c.id, 'data-result': c.result}, cells.map((td, i) => (td.setAttribute('data-label', cols[i]), td)));
      })))))];
  } else if (tab === 'integrations') {
    const cols = ['Componente', 'API esistente', 'API futura', 'Adapter DEMO', 'Adapter REAL', 'Condizione di attivazione', 'Blocker'];
    const table = h('table', {class: 'cards matrix'}, h('thead', {}, h('tr', {}, cols.map(x => h('th', {}, x)))),
      h('tbody', {}, INTEGRATIONS.map(r => h('tr', {}, r.map((x, k) => h('td', {'data-label': cols[k], class: k === 1 || k === 3 || k === 4 ? 'mono xs' : 'small'}, x))))));
    body = [h('section', {class: 'card', 'data-testid': 'cov-integrations'}, h('h2', {}, 'Integrazioni reali e DEMO'), h('div', {class: 'tablewrap'}, table)),
      h('p', {class: 'notice'}, 'Le integrazioni REAL si attivano servendo questa pagina dal server MatchPilot: il selettore REAL/DEMO in alto diventa disponibile.')];
  } else {
    const last = at;
    body = [h('section', {class: 'card', 'data-testid': 'cov-autotest'}, h('h2', {}, 'Autotest nel browser', chip('DEMO')),
      h('p', {class: 'small muted'}, 'Esegue gli scenari nell’app vera: clic, input, navigazione e controllo del risultato di ogni controllo. Usa uno spazio dati separato e i dati DEMO, poi ripristina il tuo stato. Dura circa un minuto.'),
      h('div', {class: 'row'}, h('button', {class: 'btn pri', type: 'button', ctl: 'CTL-COV-RUN', disabled: APP.testing, onclick: () => runAutotest()}, APP.testing ? 'Autotest in corso…' : 'Esegui l’autotest'),
        h('button', {class: 'btn', type: 'button', ctl: 'CTL-COV-EXPORT', onclick: () => download(`matchpilot-copertura-${new Date().toISOString().slice(0, 19)}.json`, JSON.stringify({build: BUILD, ...last, inventory: controlStates()}, null, 2), 'application/json')}, 'Esporta l’evidenza (JSON)')),
      last ? h('div', {style: {marginTop: '12px'}, 'data-testid': 'autotest-summary', 'data-pass': last.scenarios.filter(x => x.result === 'PASS').length, 'data-fail': last.scenarios.filter(x => x.result === 'FAIL').length},
        h('p', {}, h('b', {}, `${last.scenarios.filter(x => x.result === 'PASS').length} scenari superati, ${last.scenarios.filter(x => x.result === 'FAIL').length} falliti`), ` · ${when(last.at)} · ${last.mode} · ${Math.round(last.ms / 1000)} s · ${last.userAgent}`),
        h('div', {class: 'tablewrap'}, h('table', {class: 'cards matrix'}, h('thead', {}, h('tr', {}, ['Scenario', 'Titolo', 'Esito', 'Controlli', 'Dettaglio'].map(x => h('th', {}, x)))),
          h('tbody', {}, last.scenarios.map(x => h('tr', {'data-scenario': x.id, 'data-result': x.result}, [h('td', {class: 'mono'}, x.id), h('td', {}, x.title), h('td', {}, h('span', {class: x.result === 'PASS' ? 'pass' : 'fail'}, x.result)),
            h('td', {class: 'n'}, x.controls.length), h('td', {class: 'xs'}, x.error ?? '')].map((td, i) => (td.setAttribute('data-label', ['Scenario', 'Titolo', 'Esito', 'Controlli', 'Dettaglio'][i]), td))))))))
        : emptyState('Autotest non ancora eseguito in questo browser.'))];
  }
  return [head('Roadmap e copertura', {sub: 'MP-UI-ROADMAP-01 · issue → requisito → PR → pagina → componente → controllo → test → esito → evidenza', chips: [chip('DEMO', 'Verifiche su dati DEMO')], issues: ['UI-01', 'UI-12', '#239']}), summary, tabs, body];
}});

// ---------------------------------------------------------------- the autotest
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function settle() {
  await sleep(25);
  for (let i = 0; i < 200; i++) { await renderDone; if ($('#view')?.dataset.ready === String(generation)) break; await sleep(20); }
  await sleep(25);
}
const isVisible = n => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(n).visibility !== 'hidden'; };
class Tester {
  constructor() { this.used = new Set(); }
  find(ctl, {nth = 0, where = null, scope = document} = {}) {
    const all = $$(`[data-control="${ctl}"]`, scope).filter(x => !where || where(x));
    const vis = all.filter(isVisible);
    const n = (vis.length ? vis : all)[nth];
    if (!n) throw new Error(`controllo ${ctl}${nth ? ` n. ${nth + 1}` : ''} non trovato`);
    return n;
  }
  count(ctl) { return $$(`[data-control="${ctl}"]`).length; }
  async click(ctl, opts) { const n = this.find(ctl, opts); if (n.disabled) throw new Error(`${ctl} è disabilitato`); n.scrollIntoView({block: 'nearest'}); n.click(); this.used.add(ctl); await settle(); return n; }
  async value(ctl, v, opts) {
    const n = this.find(ctl, opts);
    if (n.disabled) throw new Error(`${ctl} è disabilitato`);
    n.focus(); n.value = v;
    n.dispatchEvent(new Event('input', {bubbles: true})); n.blur(); n.dispatchEvent(new Event('change', {bubbles: true}));
    this.used.add(ctl); await settle(); return n;
  }
  async check(ctl, on, opts) { const n = this.find(ctl, opts); if (n.checked !== on) n.click(); this.used.add(ctl); await settle(); return n; }
  async key(ctl, key, opts) { const n = this.find(ctl, opts); n.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true})); this.used.add(ctl); await settle(); }
  async go(name, params = {}) { go(name, params); await settle(); }
  async wait(fn, what, timeout = 5000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (fn()) return; } catch { /* retry */ } await sleep(40); } throw new Error(`attesa scaduta: ${what}`); }
  ok(c, msg) { if (!c) throw new Error(msg); }
  text(sel) { return ($(sel)?.textContent ?? '').replace(/\s+/g, ' ').trim(); }
  view() { return $('#view').dataset.view; }
  hash() { return location.hash; }
}
const firstDay = (from, dir, pred) => { for (let i = 0; i < 30; i++) { const d = addDays(from, dir * i); if (pred(d)) return d; } return from; };
const BLOCKED_IN_FILE = {'CTL-MODE-REAL': 'Richiede la pagina servita dal server MatchPilot', 'CTL-PAPER-ACCOUNT': 'Solo REAL: lettura del conto dal server', 'CTL-PAPER-LOAD': 'Solo REAL: lettura del conto dal server',
  'CTL-SESSION-LOGOUT': 'Solo REAL con accesso owner attivo', 'CTL-SESSION-LOGIN': 'Solo REAL con accesso owner attivo', 'CTL-COV-RUN': null};
const SCENARIOS = [
  ['T-NAV-01', 'Ogni voce della barra laterale apre la sua pagina', async t => {
    for (const [, ids] of NAV_GROUPS) for (const id of ids) { await t.click(NAV_CTL(id)); t.ok(t.view() === id, `${id}: aperta ${t.view()}`); t.ok($(`[data-nav="${id}"]`).getAttribute('aria-current') === 'page', `${id} non è evidenziata`); }
  }],
  ['T-NAV-02', 'Logo, pagina inesistente, errore e Riprova', async t => {
    await t.go('inesistente'); t.ok(t.text('main h1') === 'Pagina non trovata', 'manca la pagina non trovata');
    await t.click('CTL-NOTFOUND-HOME'); t.ok(t.view() === 'dashboard', 'non torna alla dashboard');
    await t.go('calendar'); await t.click('CTL-NAV-BRAND'); t.ok(t.view() === 'dashboard', 'il logo non apre la dashboard');
    APP.failNext = true; await t.go('calendar'); t.ok($('[data-state="error"]'), 'stato di errore assente');
    await t.click('CTL-STATE-RETRY'); t.ok(t.view() === 'calendar' && $('[data-testid="calendar"]'), 'Riprova non ricarica');
  }],
  ['T-NAV-03', 'Menu mobile e barra in basso', async t => {
    await t.click('CTL-NAV-BURGER'); t.ok(document.body.classList.contains('navopen'), 'il menu non si apre');
    await t.click('CTL-NAV-BURGER'); t.ok(!document.body.classList.contains('navopen'), 'il menu non si chiude');
    await t.click('CTL-BOT-MORE'); t.ok(document.body.classList.contains('navopen'), 'Altro non apre il menu');
    for (const [c, v] of [['CTL-BOT-LIVE', 'live'], ['CTL-BOT-STRAT', 'strategies'], ['CTL-BOT-TOOLS', 'tools'], ['CTL-BOT-DASH', 'dashboard']]) { await t.click(c); t.ok(t.view() === v, `${c} apre ${t.view()}`); }
    t.ok(!document.body.classList.contains('navopen'), 'il menu resta aperto dopo la navigazione');
  }],
  ['T-NAV-04', 'Ricerca globale con mouse e tastiera', async t => {
    await t.value('CTL-GSEARCH-INPUT', 'Inter'); t.ok($('#gresults [role="option"]'), 'nessun risultato');
    await t.click('CTL-GSEARCH-RESULT'); t.ok(['analysis', 'match', 'competitions'].includes(t.view()), `il risultato apre ${t.view()}`);
    await t.value('CTL-GSEARCH-INPUT', 'Calendario'); await t.key('CTL-GSEARCH-INPUT', 'ArrowDown'); await t.key('CTL-GSEARCH-INPUT', 'ArrowUp'); await t.key('CTL-GSEARCH-INPUT', 'Enter');
    t.ok(t.view() === 'calendar', 'Invio non apre il risultato');
  }],
  ['T-NAV-05', 'Origine dei dati, filtro campionati, menu account', async t => {
    await t.click('CTL-TOP-MODE'); t.ok($('[data-control="CTL-MODE-REAL"]').disabled === !APP.realAvailable, 'REAL non rispetta la disponibilità');
    await t.click('CTL-MODE-DEMO'); t.ok(APP.mode === 'DEMO', 'modo non DEMO');
    await t.go('dashboard');
    await t.click('CTL-TOP-FILTER'); await t.check('CTL-FILTER-COMP', false, {nth: 0});
    t.ok(compFilter().length === COMPS.length - 1, 'il filtro non esclude il campionato');
    t.ok(!$$('.mrow .comp').some(x => x.textContent.startsWith(`${COMPS[0].name} `)), 'il campionato escluso è ancora visibile');
    await t.click('CTL-TOP-FILTER'); await t.click('CTL-FILTER-ALL'); t.ok(!compFilter().length, 'Mostra tutti non azzera');
    await t.click('CTL-TOP-ACCOUNT'); await t.click('CTL-ACC-ISSUES'); t.ok(document.body.classList.contains('dev'), 'le issue non compaiono');
    await t.click('CTL-ACC-ISSUES'); t.ok(!document.body.classList.contains('dev'), 'le issue non spariscono');
    for (const [c, v] of [['CTL-ACC-SETTINGS', 'settings'], ['CTL-ACC-SESSION', 'session'], ['CTL-ACC-COVERAGE', 'coverage']]) { closeMenus(); await t.click('CTL-TOP-ACCOUNT'); await t.click(c); t.ok(t.view() === v, `${c} apre ${t.view()}`); }
  }],
  ['T-ASSIST-01', 'Assistente deterministico', async t => {
    await t.click('CTL-TOP-ASSIST'); t.ok($('.drawer'), 'assistente non aperto');
    await t.click('CTL-ASSIST-SUGGEST', {nth: 0}); t.ok($('.msg[data-intent="live"]'), 'risposta live assente');
    await t.value('CTL-ASSIST-INPUT', 'forma Inter'); await t.click('CTL-ASSIST-SEND'); t.ok($('.msg[data-intent="form"]'), 'risposta sulla forma assente');
    const links = $$('[data-control="CTL-ASSIST-LINK"]'); await t.click('CTL-ASSIST-LINK', {nth: links.length - 1}); t.ok(t.view() === 'analysis' && !$('.drawer'), 'il link non apre l’analisi');
    await t.click('CTL-TOP-ASSIST'); await t.click('CTL-ASSIST-CLOSE'); t.ok(!$('.drawer'), 'non si chiude');
  }],
  ['T-DASH-01', 'Dashboard: navigazione tra i giorni', async t => {
    await t.go('dashboard');
    await t.click('CTL-DASH-NEXT'); t.ok(t.hash().includes(`date=${addDays(today(), 1)}`), 'giorno dopo');
    await t.click('CTL-DASH-PREV'); t.ok(t.hash().includes(`date=${today()}`), 'giorno prima');
    await t.click('CTL-DASH-DAY', {nth: 6}); t.ok(t.hash().includes(`date=${addDays(today(), 3)}`), 'striscia dei giorni');
    await t.click('CTL-DASH-TODAY'); t.ok(t.hash().includes(`date=${today()}`), 'Oggi');
    await t.value('CTL-DASH-DATE', addDays(today(), -2)); t.ok(t.hash().includes(`date=${addDays(today(), -2)}`), 'selettore di data');
    await t.click('CTL-DASH-CAL'); t.ok(t.view() === 'calendar', 'link al calendario');
  }],
  ['T-DASH-02', 'Dashboard: stato, ordine, filtro e collegamenti', async t => {
    await t.go('dashboard');
    await t.click('CTL-DASH-STATUS', {where: x => x.dataset.value === 'live'});
    t.ok($$('.mrow').every(r => ['LIVE', 'HT'].includes(r.dataset.status)), 'il filtro live mostra altre partite');
    await t.click('CTL-DASH-SORT', {where: x => x.dataset.value === 'comp'}); t.ok(t.hash().includes('sort=comp'), 'ordine per campionato');
    await t.click('CTL-DASH-STATUS', {where: x => x.dataset.value === 'all'});
    await t.value('CTL-DASH-Q', 'zzzz'); t.ok($('[data-testid="dash-list"] [data-state="empty"]'), 'filtro senza risultati');
    await t.click('CTL-DASH-CLEAR'); t.ok(!t.hash().includes('q='), 'Azzera i filtri');
    await t.click('CTL-MATCH-OPEN'); t.ok(t.view() === 'match', 'la riga non apre la partita');
    await t.go('dashboard'); await t.click('CTL-DASH-LIVE'); t.ok(t.view() === 'live', 'link Live');
    await t.go('dashboard'); await t.click('CTL-DASH-STRAT'); t.ok(t.view() === 'strategies', 'link Strategy Lab');
  }],
  ['T-CAL-01', 'Calendario', async t => {
    await t.go('calendar'); const m0 = t.hash();
    await t.click('CTL-CAL-NEXT'); t.ok(t.hash() !== m0, 'mese dopo');
    await t.click('CTL-CAL-PREV'); await t.click('CTL-CAL-TODAY'); t.ok(!t.hash().includes('month='), 'questo mese');
    await t.click('CTL-CAL-DAY', {where: x => x.dataset.date === today()}); t.ok(t.view() === 'dashboard' && t.hash().includes(`date=${today()}`), 'il giorno apre la dashboard');
  }],
  ['T-MATCHES-01', 'Partite: filtri combinati, ordinamento, pagine, CSV, errori', async t => {
    await t.go('matches');
    await t.value('CTL-MATCHES-FROM', addDays(today(), -14)); await t.value('CTL-MATCHES-TO', addDays(today(), -1));
    await t.value('CTL-MATCHES-COMP', ''); await t.value('CTL-MATCHES-TEAM', ''); await t.value('CTL-MATCHES-STATUS', 'FT');
    await t.value('CTL-MATCHES-FAVMIN', '1.1'); await t.value('CTL-MATCHES-FAVMAX', '10'); await t.value('CTL-MATCHES-GMIN', '0'); await t.value('CTL-MATCHES-GMAX', '20');
    await t.value('CTL-MATCHES-XG', '0'); await t.value('CTL-MATCHES-SIZE', '25');
    await t.click('CTL-MATCHES-SUBMIT');
    const n = Number($('[data-testid="matches-results"]')?.dataset.count); t.ok(n > 25, `servono più di 25 partite per le pagine: ${n}`);
    await t.click('CTL-MATCHES-NEXT'); t.ok(t.text('[data-testid="matches-page"]').startsWith('Pagina 2'), 'pagina successiva');
    await t.click('CTL-MATCHES-PREV'); t.ok(t.text('[data-testid="matches-page"]').startsWith('Pagina 1'), 'pagina precedente');
    await t.click('CTL-MATCHES-SORT', {where: x => x.dataset.key === 'fav'}); t.ok($('th[aria-sort="ascending"]'), 'ordinamento');
    const before = APP.downloads.length; await t.click('CTL-MATCHES-CSV'); t.ok(APP.downloads.length === before + 1, 'CSV non generato');
    await t.value('CTL-MATCHES-COMP', COMPS[1].id); await t.value('CTL-MATCHES-TEAM', COMPS[1].teams[0]); await t.click('CTL-MATCHES-SUBMIT');
    t.ok($$('[data-testid="matches-results"] tbody tr').every(r => r.textContent.includes(COMPS[1].teams[0])), 'filtro squadra');
    await t.value('CTL-MATCHES-FAVMIN', '3'); await t.value('CTL-MATCHES-FAVMAX', '2'); await t.click('CTL-MATCHES-SUBMIT'); t.ok($('[data-testid="matches-invalid"]'), 'errore di validazione assente');
    await t.click('CTL-MATCHES-RESET'); t.ok(!t.hash().includes('fav_min'), 'Azzera');
  }],
  ['T-COMP-01', 'Competizioni e classifica', async t => {
    await t.go('competitions'); await t.click('CTL-COMP-OPEN'); t.ok($('[data-testid="standings"] tbody tr'), 'classifica assente');
    const id = new URLSearchParams(t.hash().split('?')[1]).get('id');
    await t.click('CTL-COMP-TEAM'); t.ok(t.view() === 'analysis', 'la squadra non apre l’analisi');
    await t.go('competitions', {id}); await t.click('CTL-COMP-MATCHES'); t.ok(t.view() === 'matches' && t.hash().includes(id), 'partite della competizione');
    await t.go('competitions', {id}); await t.click('CTL-COMP-BACK'); t.ok(t.view() === 'competitions' && !t.hash().includes('id='), 'indietro');
  }],
  ['T-MC-01', 'Match Center: schede, filtri e strumenti', async t => {
    const live = demoDay(today()).map(withState).find(m => m.status === 'LIVE');
    t.ok(live, 'nessuna partita live con l’orologio di test');
    await t.go('match', {id: live.id});
    for (const [tab] of MC_TABS) { await t.click('CTL-MC-TAB', {where: x => x.dataset.value === tab}); t.ok($(`[data-tab="${tab}"]`), `scheda ${tab}`); }
    await t.click('CTL-MC-TAB', {where: x => x.dataset.value === 'compare'});
    await t.click('CTL-MC-TEAM', {where: x => x.dataset.value === 'home'}); t.ok(t.hash().includes('team=home'), 'filtro squadra');
    await t.click('CTL-MC-WINDOW', {where: x => x.dataset.value === '5'}); await t.click('CTL-MC-VENUE', {where: x => x.dataset.value === 'both'});
    t.ok($('[data-stat="n"] .v').textContent.trim() !== '', 'confronto vuoto');
    await t.click('CTL-MC-TAB', {where: x => x.dataset.value === 'overview'}); await t.click('CTL-MC-GOCOMPARE'); t.ok(t.hash().includes('tab=compare'), 'Confronto completo');
    await t.click('CTL-MC-TAB', {where: x => x.dataset.value === 'overview'}); await t.click('CTL-MC-TOOL-POISSON'); t.ok($('[data-testid="tool-result"][data-tool="poisson"]'), 'Poisson');
    await t.go('match', {id: live.id}); await t.click('CTL-MC-TOOL-ODDS'); t.ok($('[data-testid="tool-result"][data-tool="odds"]'), 'Margine');
    await t.go('match', {id: live.id}); await t.click('CTL-MC-ANALYSIS'); t.ok(t.view() === 'analysis', 'Analisi completa');
    await t.go('match', {id: live.id}); await t.click('CTL-MC-BACK'); t.ok(t.view() === 'dashboard', 'indietro');
  }],
  ['T-MC-02', 'Partita finita: esito dei mercati, replay, anti-spoiler', async t => {
    const day = firstDay(addDays(today(), -1), -1, d => demoDay(d).length > 0);
    const m = demoDay(day)[0];
    await t.go('match', {id: m.id}); t.ok($('[data-testid="mc-post"] [data-market="MATCH_ODDS"]'), 'esito dei mercati assente');
    t.ok($('[data-testid="mc-post"] [data-market="MATCH_ODDS"]').dataset.winner === (m.final[0] > m.final[1] ? 'HOME' : m.final[0] < m.final[1] ? 'AWAY' : 'DRAW'), 'vincitore errato');
    t.ok($('[data-control="CTL-MC-TRADE"]').disabled, 'si può operare su una partita finita');
    await t.click('CTL-MC-REPLAY'); t.ok(t.view() === 'replay' && $('[data-testid="replay-player"]'), 'replay');
    store.set('settings', {...settings(), hide_scores: true});
    await t.go('match', {id: m.id}); t.ok($('.hero.spoiler'), 'risultato non nascosto');
    await t.click('CTL-MC-REVEAL'); t.ok(!$('.hero.spoiler'), 'Mostra il risultato');
    store.set('settings', {...settings(), hide_scores: false});
  }],
  ['T-STRAT-01', 'Strategy Lab: nuova strategia, condizioni, validazione', async t => {
    await t.go('strategies'); await t.click('CTL-STRAT-NEW'); t.ok($('[data-testid="strat-editor"]'), 'editor assente');
    await t.value('CTL-STRAT-NAME', ''); await t.click('CTL-STRAT-SAVE'); t.ok(t.text('[data-testid="strat-errors"]').includes('nome'), 'nome vuoto accettato');
    await t.value('CTL-STRAT-NAME', 'Favorito pre'); await t.value('CTL-STRAT-PHASE', 'PREMATCH'); await t.value('CTL-STRAT-MARKET', 'MATCH_ODDS');
    await t.value('CTL-STRAT-SEL', 'FAVOURITE'); await t.value('CTL-STRAT-SIDE', 'BACK');
    await t.value('CTL-COND-OP', 'between'); await t.value('CTL-COND-A', '1.2'); await t.value('CTL-COND-B', '3.5');
    await t.click('CTL-STRAT-ADDCOND'); t.ok($$('[data-cond]').length === 2, 'condizione non aggiunta');
    await t.value('CTL-COND-FIELD', 'xg_home', {nth: 1}); await t.value('CTL-COND-OP', 'gte', {nth: 1}); await t.value('CTL-COND-A', '0.3', {nth: 1});
    await t.click('CTL-COND-DEL', {nth: 1}); t.ok($$('[data-cond]').length === 1, 'condizione non rimossa');
    await t.value('CTL-STRAT-TEAM', ''); await t.value('CTL-STRAT-VENUE', 'ANY');
    await t.check('CTL-STRAT-COMP', true, {nth: 0}); await t.check('CTL-STRAT-COMP', false, {nth: 0});
    await t.wait(() => t.text('[data-testid="strat-preview"]').includes('partite su'), 'anteprima');
    await t.click('CTL-STRAT-SAVE'); t.ok(t.view() === 'strategies' && $('[data-key="favorito-pre"]'), 'strategia non salvata');
    await t.click('CTL-STRAT-NEW'); await t.click('CTL-STRAT-CANCEL'); t.ok(!t.hash().includes('new'), 'Annulla');
  }],
  ['T-STRAT-02', 'Versioni, attivazione, duplica, elimina, import/export', async t => {
    await t.go('strategies');
    await t.click('CTL-STRAT-ACTIVE', {where: x => x.closest('[data-key="favorito-pre"]')}); t.ok(lib.strategies().find(d => d.key === 'favorito-pre').active, 'non attivata');
    await t.click('CTL-STRAT-EDIT', {where: x => x.closest('[data-key="favorito-pre"]')}); await t.click('CTL-STRAT-SAVE');
    t.ok(lib.strategies().find(d => d.key === 'favorito-pre').version === 1, 'salvataggio senza modifiche crea una versione');
    await t.click('CTL-STRAT-EDIT', {where: x => x.closest('[data-key="favorito-pre"]')}); await t.value('CTL-COND-B', '3.6'); await t.click('CTL-STRAT-SAVE');
    t.ok(lib.strategies().find(d => d.key === 'favorito-pre').version === 2, 'versione 2 assente');
    await t.click('CTL-STRAT-VERSIONS', {where: x => x.closest('[data-key="favorito-pre"]')}); t.ok($$('[data-testid="strat-versions"] tbody tr').length === 2, 'elenco versioni');
    await t.click('CTL-STRAT-RESTORE'); t.ok(lib.strategies().find(d => d.key === 'favorito-pre').version === 3, 'ripristino');
    await t.click('CTL-STRAT-CANCEL');
    await t.click('CTL-STRAT-DUP', {where: x => x.closest('[data-key="favorito-pre"]')}); t.ok(lib.strategies().length === 2, 'duplica');
    await t.click('CTL-STRAT-DELETE', {where: x => x.closest('[data-key="favorito-pre-copia"]')}); await t.click('CTL-DLG-OK'); t.ok(lib.strategies().length === 1, 'elimina');
    const before = APP.downloads.length; await t.click('CTL-STRAT-EXPORT'); t.ok(APP.downloads.length === before + 1, 'esporta');
    const input = t.find('CTL-STRAT-IMPORT');
    const dt = new DataTransfer();
    dt.items.add(new File([JSON.stringify([{name: 'Banca pareggio live', market: 'MATCH_ODDS', selection: 'DRAW', side: 'LAY', phase: 'LIVE',
      conditions: [{field: 'minute', op: 'between', a: 5, b: 80}, {field: 'goal_diff', op: 'between', a: 0, b: 0}]}, {name: ''}])], 'strategie.json', {type: 'application/json'}));
    input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true})); t.used.add('CTL-STRAT-IMPORT');
    await t.wait(() => lib.strategies().some(d => d.key === 'banca-pareggio-live'), 'importazione');
    await settle();
    await t.click('CTL-STRAT-ACTIVE', {where: x => x.closest('[data-key="banca-pareggio-live"]')});
    await t.click('CTL-STRAT-BT', {where: x => x.closest('[data-key="favorito-pre"]')}); t.ok(t.view() === 'backtest' && t.hash().includes('strategy=favorito-pre'), 'link backtest');
    await t.go('strategies', {edit: 'favorito-pre'}); await t.click('CTL-STRAT-TRYBT'); t.ok(t.hash().includes('draft=1'), 'Prova nel backtest');
  }],
  ['T-DASH-03', 'Segnali delle strategie attive', async t => {
    await t.go('dashboard'); t.ok($('[data-control="CTL-DASH-SIGNAL"]'), 'nessun segnale per la strategia attiva');
    await t.click('CTL-DASH-SIGNAL'); t.ok(t.view() === 'match', 'il segnale non apre la partita');
  }],
  ['T-BT-01', 'Backtest: esecuzione, pagine, CSV, salvataggio e ricarica', async t => {
    await t.go('backtest', {strategy: 'favorito-pre'});
    await t.value('CTL-BT-STRAT', 'favorito-pre'); await t.value('CTL-BT-FROM', addDays(today(), -45)); await t.value('CTL-BT-TO', addDays(today(), -1));
    await t.value('CTL-BT-STAKE', '10'); await t.value('CTL-BT-COMM', '5'); await t.value('CTL-BT-BANK', '1000'); await t.value('CTL-BT-MM', 'PERCENT_BANKROLL'); await t.value('CTL-BT-MMV', '');
    await t.click('CTL-BT-RUN'); t.ok($('[data-testid="bt-invalid"]'), 'manca l’errore sul valore della gestione');
    await t.value('CTL-BT-MMV', '2'); await t.click('CTL-BT-RUN');
    const bets = Number($('[data-testid="bt-result"]')?.dataset.bets); t.ok(bets > 20, `poche operazioni: ${bets}`);
    await t.click('CTL-BT-NEXT'); await t.click('CTL-BT-PREV');
    const d0 = APP.downloads.length; await t.click('CTL-BT-CSV'); t.ok(APP.downloads.length === d0 + 1, 'CSV');
    await t.click('CTL-BT-SAVE'); t.ok(!lib.saved().length, 'salvata senza nome');
    await t.value('CTL-BT-NAME', 'Prova 45 giorni'); await t.click('CTL-BT-SAVE'); t.ok(lib.saved().length === 1, 'non salvata');
    await t.click('CTL-BT-SAVE'); t.ok(lib.saved().length === 1, 'doppio salvataggio');
    await t.click('CTL-BT-TAB', {where: x => x.dataset.value === 'saved'}); await t.click('CTL-BT-OPEN-SAVED'); t.ok($('[data-testid="saved-meta"]') && $('[data-testid="bt-result"]'), 'ricarica');
    t.ok(Number($('[data-testid="bt-result"]').dataset.bets) === bets, 'la simulazione ricaricata è diversa');
    await t.go('backtest', {tab: 'saved'}); await t.click('CTL-BT-DEL-SAVED'); await t.click('CTL-DLG-OK'); t.ok(!lib.saved().length, 'eliminazione');
    await t.click('CTL-BT-TAB', {where: x => x.dataset.value === 'run'}); await t.click('CTL-BT-NEWSTRAT'); t.ok(t.hash().includes('new=1'), 'Nuova strategia');
  }],
  ['T-BT-02', 'Confronto di strategie', async t => {
    await t.go('backtest', {tab: 'compare'});
    await t.value('CTL-CMP-A', 'favorito-pre'); await t.value('CTL-CMP-B', 'banca-pareggio-live'); await t.value('CTL-CMP-C', '');
    await t.value('CTL-CMP-FROM', addDays(today(), -20)); await t.value('CTL-CMP-TO', addDays(today(), -1)); await t.value('CTL-CMP-STAKE', '10');
    await t.click('CTL-CMP-RUN'); t.ok($('[data-testid="cmp-result"]'), 'confronto assente');
    await t.value('CTL-CMP-B', 'favorito-pre'); await t.click('CTL-CMP-RUN'); t.ok($('[data-testid="cmp-invalid"]'), 'strategie uguali accettate');
  }],
  ['T-PAPER-01', 'Posizione simulata dal Match Center, copertura dal Copilot', async t => {
    const ns = demoDay(today()).map(withState).find(m => m.status === 'NS');
    t.ok(ns, 'nessuna partita da giocare');
    await t.go('match', {id: ns.id}); await t.click('CTL-MC-TRADE'); t.ok($('[data-dialog="trade"]'), 'finestra assente');
    await t.value('CTL-TRADE-MARKET', 'MATCH_ODDS'); await t.value('CTL-TRADE-SEL', 'HOME'); await t.value('CTL-TRADE-SIDE', 'BACK');
    await t.value('CTL-TRADE-ODDS', '2.5'); await t.value('CTL-TRADE-STAKE', '10'); await t.click('CTL-TRADE-CONFIRM');
    t.ok(ledgerState(ledgerLoad()).open === 1, 'posizione non aperta');
    await t.click('CTL-MC-TAB', {where: x => x.dataset.value === 'markets'}); await t.click('CTL-MC-ODD'); t.ok($('[data-dialog="trade"]'), 'la quota non apre la finestra');
    await t.click('CTL-DLG-CANCEL'); t.ok(!$('#overlay'), 'Annulla');
    await t.click('CTL-MC-TAB', {where: x => x.dataset.value === 'copilot'});
    await t.click('CTL-COP-HALF'); t.ok(Object.values(ledgerLoad().positions)[0].legs.length === 2, 'copertura a metà non registrata');
    await t.click('CTL-COP-HEDGE'); const pl = positionPL(Object.values(ledgerLoad().positions)[0]);
    t.ok(Object.values(ledgerLoad().positions)[0].legs.length === 3 && Math.abs(pl.win - pl.lose) < 0.05, 'green-up non registrato');
    if ($('[data-control="CTL-COP-OPEN"]')) { await t.click('CTL-COP-OPEN'); await t.click('CTL-DLG-CANCEL'); }
  }],
  ['T-COPILOT-01', 'Pagina Copilot e strategie disattivate', async t => {
    await t.go('copilot'); t.ok($('[data-testid="copilot-table"] tbody tr'), 'nessuna riga');
    await t.click('CTL-COP-ROW'); t.ok(t.view() === 'match' && t.hash().includes('tab=copilot'), 'Apri');
    t.ok($('[data-strategy]'), 'il Copilot non mostra le strategie');
    const armed = $('[data-control="CTL-COP-OPEN"]');
    if (!armed) {
      const ns = demoDay(today()).map(withState).filter(m => m.status === 'NS').find(m => lib.strategies().some(d => d.active && copilotState(d, m).state === 'ARMED'));
      t.ok(ns, 'nessuna strategia armata'); await t.go('match', {id: ns.id, tab: 'copilot'});
    }
    await t.click('CTL-COP-OPEN'); t.ok($('[data-dialog="trade"]'), 'apri dal Copilot'); await t.click('CTL-DLG-CANCEL');
    const raw = lib.strategiesRaw(); lib.setStrategiesRaw(raw.map(x => ({...x, active: false})));
    await t.go('copilot'); await t.click('CTL-COP-STRATS'); t.ok(t.view() === 'strategies', 'link allo Strategy Lab');
    lib.setStrategiesRaw(raw);
  }],
  ['T-LIVE-01', 'Live Board: card, filtri, aggiornamento, pausa', async t => {
    await t.go('live'); t.ok($$('[data-testid="live-cards"] .lcard').length > 0, 'nessuna card live');
    await t.click('CTL-LIVE-FILTER', {where: x => x.dataset.value === 'signals'}); await t.click('CTL-LIVE-FILTER', {where: x => x.dataset.value === 'delay'});
    await t.click('CTL-LIVE-FILTER', {where: x => x.dataset.value === 'all'});
    await t.click('CTL-LIVE-SORT', {where: x => x.dataset.value === 'comp'}); t.ok(t.hash().includes('sort=comp'), 'ordine');
    await t.value('CTL-LIVE-INTERVAL', '10'); t.ok(LIVE_PREFS().interval === 10, 'intervallo');
    await t.click('CTL-LIVE-PAUSE'); t.ok($('[data-testid="live-paused"]'), 'pausa'); await t.click('CTL-LIVE-PAUSE'); t.ok(!$('[data-testid="live-paused"]'), 'ripresa');
    await t.click('CTL-LIVE-REFRESH');
    await t.click('CTL-LIVE-OPEN'); t.ok(t.view() === 'match', 'Apri'); await t.go('live');
    await t.click('CTL-LIVE-COPILOT'); t.ok(t.hash().includes('tab=copilot'), 'Copilot'); await t.go('live');
    await t.click('CTL-LIVE-TRADE', {where: x => !x.disabled}); t.ok($('[data-dialog="trade"]'), 'Opera'); await t.click('CTL-DLG-CANCEL');
  }],
  ['T-AN-01', 'Analysis Hub', async t => {
    await t.go('analysis'); await t.click('CTL-AN-APPLY'); t.ok(t.view() === 'analysis' && !t.hash().includes('team='), 'analisi senza squadra');
    await t.value('CTL-AN-TEAM-A', 'Inter'); await t.value('CTL-AN-TEAM-B', 'Milan'); await t.click('CTL-AN-APPLY'); t.ok($('[data-testid="analysis"]'), 'analisi assente');
    await t.click('CTL-AN-WINDOW', {where: x => x.dataset.value === '5'}); await t.click('CTL-AN-VENUE', {where: x => x.dataset.value === 'home'}); t.ok(t.hash().includes('venue=home'), 'campo');
    await t.click('CTL-AN-MATCH'); t.ok(t.view() === 'match', 'partita del campione');
  }],
  ['T-REPLAY-01', 'Replay: elenco, comandi, anti-spoiler, strategia', async t => {
    await t.go('replay'); await t.value('CTL-REPLAY-COMP', COMPS[0].id); t.ok(t.hash().includes(COMPS[0].id), 'filtro');
    await t.click('CTL-REPLAY-OPEN'); t.ok($('[data-testid="replay-player"]'), 'player');
    await t.click('CTL-REPLAY-FWD'); t.ok(t.text('[data-testid="replay-minute"]') === "1'", 'avanti');
    await t.click('CTL-REPLAY-BACKSTEP'); t.ok(t.text('[data-testid="replay-minute"]') === 'Pre-partita', 'indietro');
    await t.value('CTL-REPLAY-SLIDER', '60'); t.ok(t.text('[data-testid="replay-minute"]') === "60'", 'cursore');
    await t.click('CTL-REPLAY-SPEED', {where: x => x.dataset.value === '16'});
    await t.click('CTL-REPLAY-PLAY'); await sleep(400); await t.click('CTL-REPLAY-PLAY');
    t.ok(Number(t.text('[data-testid="replay-minute"]').replace("'", '')) > 60 || t.text('[data-testid="replay-minute"]') === 'Fine', 'la riproduzione non avanza');
    await t.click('CTL-REPLAY-RESET'); t.ok(t.text('[data-testid="replay-minute"]') === 'Pre-partita', 'dall’inizio');
    const f0 = t.text('[data-testid="replay-final"]'); await t.click('CTL-REPLAY-SPOILER'); t.ok(t.text('[data-testid="replay-final"]') !== f0, 'anti-spoiler');
    await t.value('CTL-REPLAY-STRAT', 'banca-pareggio-live'); t.ok(t.text('[data-testid="replay-sim"]') !== '', 'strategia nel replay');
    await t.click('CTL-REPLAY-BACK'); t.ok($('[data-testid="replay-list"]'), 'elenco');
  }],
  ['T-PAPER-02', 'Conto: STOP, ripresa, pausa, registro, azzeramento', async t => {
    const other = demoDay(today()).map(withState).filter(m => m.status === 'NS')[1];
    await t.go('match', {id: other.id}); await t.click('CTL-MC-TRADE'); await t.value('CTL-TRADE-SIDE', 'LAY'); await t.value('CTL-TRADE-ODDS', '3'); await t.value('CTL-TRADE-STAKE', '5'); await t.click('CTL-TRADE-CONFIRM');
    const pid = Object.values(ledgerLoad().positions).find(p => p.matchId === other.id)?.id; t.ok(pid, 'seconda posizione non aperta');
    await t.go('paper'); t.ok($(`[data-testid="paper-open"] [data-position="${pid}"]`), 'posizione aperta assente');
    await t.click('CTL-PAPER-HEDGE', {where: x => x.closest(`[data-position="${pid}"]`)}); await t.value('CTL-HEDGE-ODDS', '2.4'); await t.value('CTL-HEDGE-SHARE', '0.5'); await t.click('CTL-HEDGE-CONFIRM');
    t.ok(ledgerLoad().positions[pid].legs.length === 2, 'copertura dal conto');
    await t.click('CTL-PAPER-STOP'); await t.value('CTL-PAPER-REASON', 'verifica'); await t.click('CTL-PAPER-REASON-OK'); t.ok(ledgerLoad().mode === 'ADVISORY_ONLY', 'STOP');
    const ns = demoDay(today()).map(withState).find(m => m.status === 'NS');
    await t.go('match', {id: ns.id}); await t.click('CTL-MC-TRADE'); await t.click('CTL-TRADE-CONFIRM'); t.ok(t.text('[data-dialog="trade"] .err').includes('STOP'), 'STOP non blocca');
    await t.click('CTL-DLG-CANCEL'); await t.go('paper');
    await t.click('CTL-PAPER-PAUSE'); await t.value('CTL-PAPER-REASON', 'pausa'); await t.click('CTL-PAPER-REASON-OK'); t.ok(ledgerLoad().mode === 'PAUSED', 'pausa');
    await t.click('CTL-PAPER-RESUME'); await t.value('CTL-PAPER-REASON', 'ripresa'); await t.click('CTL-PAPER-REASON-OK'); t.ok(ledgerLoad().mode === 'ACTIVE_OPERATIONAL', 'ripresa');
    await t.click('CTL-PAPER-SETTLE');
    await t.value('CTL-PAPER-LEDGER-TYPE', 'MODE'); t.ok($$('[data-testid="paper-ledger"] tbody tr').every(r => r.dataset.type === 'MODE'), 'filtro del registro');
    const d0 = APP.downloads.length; await t.click('CTL-PAPER-CSV'); t.ok(APP.downloads.length === d0 + 1, 'CSV');
    await t.click('CTL-PAPER-RESET'); await t.value('CTL-PAPER-RESET-AMOUNT', '500'); await t.click('CTL-PAPER-RESET-OK'); t.ok(ledgerState(ledgerLoad()).available === 500, 'azzeramento');
    await t.click('CTL-PAPER-NEW'); t.ok(t.view() === 'dashboard', 'Nuova posizione');
  }],
  ['T-MM-01', 'Money Management: profili con versioni e calcolo', async t => {
    await t.go('money');
    await t.click('CTL-MM-NEW'); await t.value('CTL-MMF-NAME', 'Aggressivo'); await t.value('CTL-MMF-MODEL', 'FIXED_STAKE'); await t.value('CTL-MMF-VALUE', '20');
    await t.value('CTL-MMF-CAP', '15', {nth: 0}); await t.click('CTL-MMF-SAVE'); const p = lib.profiles().find(x => x.name === 'Aggressivo'); t.ok(p, 'profilo non creato');
    const row = x => x.closest(`[data-profile="${p.id}"]`);
    await t.click('CTL-MM-EDIT', {where: row}); await t.value('CTL-MMF-VALUE', '25'); await t.click('CTL-MMF-SAVE'); t.ok(lib.profiles().find(x => x.id === p.id).versions.length === 2, 'nuova versione');
    await t.click('CTL-MM-RENAME', {where: row}); await t.value('CTL-MM-RENAME-INPUT', 'Aggressivo 2'); await t.click('CTL-MM-RENAME-OK');
    t.ok(lib.profiles().find(x => x.id === p.id).name === 'Aggressivo 2' && lib.profiles().find(x => x.id === p.id).versions.length === 2, 'rinomina crea una versione');
    await t.click('CTL-MM-DUP', {where: row}); const copy = lib.profiles().find(x => x.name === 'Aggressivo 2 (copia)'); t.ok(copy, 'duplica');
    await t.click('CTL-MM-DEFAULT', {where: row}); t.ok(lib.profiles().find(x => x.id === p.id).default, 'predefinito');
    await t.click('CTL-MM-ARCHIVE', {where: x => x.closest(`[data-profile="${copy.id}"]`)}); t.ok(!$(`[data-profile="${copy.id}"]`), 'archiviato ancora visibile');
    await t.check('CTL-MM-SHOWARCH', true); t.ok($(`[data-profile="${copy.id}"]`), 'Mostra archiviati');
    await t.click('CTL-MM-DELETE', {where: x => x.closest(`[data-profile="${copy.id}"]`)}); await t.click('CTL-DLG-OK'); t.ok(!lib.profiles().some(x => x.id === copy.id), 'elimina');
    await t.value('CTL-MMC-PROFILE', p.id); await t.value('CTL-MMC-SIDE', 'LAY'); await t.value('CTL-MMC-ODDS', '3'); await t.value('CTL-MMC-AVAIL', '1000'); await t.click('CTL-MMC-RUN');
    t.ok($('[data-testid="mm-calc-result"] [data-decision="REDUCE"]') && t.text('[data-testid="mm-stake"]').includes('15,00'), `calcolo: ${t.text('[data-testid="mm-calc-result"]')}`);
  }],
  ['T-TOOLS-01', 'Strumenti: ogni calcolatore, valori attesi, errori, valori di esempio', async t => {
    await t.go('tools');
    for (const [tool] of TOOL_DEFS) {
      await t.click('CTL-TOOL-TAB', {where: x => x.dataset.value === tool}); t.ok($(`[data-testid="tool-form"][data-tool="${tool}"]`), `scheda ${tool}`);
      await t.click('CTL-TOOL-RUN'); t.ok($(`[data-testid="tool-result"][data-tool="${tool}"]`), `${tool}: nessun risultato (${t.text('[data-testid="tool-error"]')})`);
    }
    await t.click('CTL-TOOL-TAB', {where: x => x.dataset.value === 'ev'}); await t.click('CTL-TOOL-RUN'); t.ok(t.text('[data-out="ev"]') === '+0,70', `EV ${t.text('[data-out="ev"]')}`);
    await t.click('CTL-TOOL-TAB', {where: x => x.dataset.value === 'hedge'}); await t.click('CTL-TOOL-RUN'); t.ok(t.text('[data-out="after"]') === '+5,00 / +5,00', `copertura ${t.text('[data-out="after"]')}`);
    await t.value('CTL-TOOL-FIELD', '0.5', {where: x => x.dataset.field === 'odds'}); await t.click('CTL-TOOL-RUN'); t.ok($('[data-testid="tool-error"]'), 'quota non valida accettata');
    await t.click('CTL-TOOL-RESET'); t.ok(t.find('CTL-TOOL-FIELD', {where: x => x.dataset.field === 'odds'}).value === '3', 'valori di esempio');
  }],
  ['T-SET-01', 'Impostazioni: salvataggio con versione, validazione, predefiniti, esporta', async t => {
    await t.go('settings'); const v0 = settings().version;
    await t.value('CTL-SET-FIELD', '4', {where: x => x.dataset.field === 'commission'}); await t.click('CTL-SET-SAVE'); t.ok(settings().commission === 4 && settings().version === v0 + 1, 'salvataggio');
    await t.value('CTL-SET-FIELD', '150', {where: x => x.dataset.field === 'commission'}); await t.click('CTL-SET-SAVE'); t.ok(t.text('[data-testid="set-errors"]').includes('Commissione'), 'validazione');
    await t.click('CTL-SET-DEFAULTS'); await t.click('CTL-DLG-OK'); t.ok(settings().commission === 5, 'predefiniti');
    const d0 = APP.downloads.length; await t.click('CTL-SET-EXPORT'); t.ok(APP.downloads.length === d0 + 1, 'esporta');
  }],
  ['T-DIAG-01', 'Diagnostica: controlli, verifica della pagina, orologio DEMO', async t => {
    await t.go('diagnostics'); t.ok($('[data-check="Controlli senza identificativo"][data-state="ok"]'), 'controlli senza identificativo');
    await t.click('CTL-DIAG-RECHECK'); await t.click('CTL-DIAG-AUDIT'); t.ok(t.text('[data-testid="diag-audit"]').includes(': 0;'), `verifica: ${t.text('[data-testid="diag-audit"]')}`);
    const keep = APP.clockOffset;
    await t.value('CTL-DIAG-CLOCK', `${addDays(today(), 1)}T10:00`); await t.click('CTL-DIAG-CLOCK-SET'); t.ok(today() === addDays(isoDay(new Date(Date.now() + keep)), 1), 'orologio spostato');
    await t.click('CTL-DIAG-CLOCK-RESET'); t.ok(!APP.clockOffset, 'ora reale');
    APP.clockOffset = keep;
    ERRORS.push({at: new Date().toISOString(), message: 'errore di prova dell’autotest'}); await t.go('diagnostics');
    await t.click('CTL-DIAG-ERRORS-CLEAR'); t.ok(!ERRORS.length, 'errori non svuotati');
  }],
  ['T-COV-01', 'Roadmap e copertura: schede, filtri, esportazione', async t => {
    await t.go('coverage');
    for (const tab of ['roadmap', 'controls', 'matrix', 'integrations', 'autotest']) { await t.click('CTL-COV-TAB', {where: x => x.dataset.value === tab}); t.ok(t.hash().includes(`tab=${tab}`), tab); }
    await t.click('CTL-COV-TAB', {where: x => x.dataset.value === 'controls'});
    await t.value('CTL-COV-FILTER', 'UI-10'); t.ok($$('[data-control-row]').every(r => SPECS.get(r.dataset.controlRow).phase === 'UI-10'), 'filtro per fase');
    await t.value('CTL-COV-STATE', ''); await t.value('CTL-COV-Q', 'CTL-TOOL-RUN'); t.ok($$('[data-control-row]').length === 1, 'ricerca');
    const d0 = APP.downloads.length; await t.click('CTL-COV-EXPORT', {where: () => true}).catch(async () => { await t.click('CTL-COV-TAB', {where: x => x.dataset.value === 'autotest'}); await t.click('CTL-COV-EXPORT'); });
    t.ok(APP.downloads.length === d0 + 1, 'esportazione dell’evidenza');
  }],
  ['T-SET-02', 'Cancellazione dei dati locali (spazio di test)', async t => {
    await t.go('settings'); await t.click('CTL-SET-WIPE'); await t.click('CTL-DLG-CANCEL'); t.ok(lib.strategies().length > 0, 'Annulla cancella');
    await t.click('CTL-SET-WIPE'); await t.click('CTL-DLG-OK'); t.ok(lib.strategies().length === 0, 'i dati non sono stati cancellati');
  }],
];
async function runAutotest() {
  if (APP.testing) return;
  const real = {mode: APP.mode, ns: NS, offset: APP.clockOffset, hash: location.hash};
  APP.testing = true; APP.downloads = [];
  const t0 = performance.now();
  store.clearNs('mp.test.'); NS = 'mp.test.';
  APP.mode = 'DEMO';
  // A fixed match day: next Saturday at 16:10 local time (first-half 15:00 matches live, 18:00 and 20:45 to play).
  const now = new Date(); const sat = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((6 - now.getDay() + 7) % 7 || 7), 16, 10);
  APP.clockOffset = sat.getTime() - Date.now(); dayCache.clear();
  const results = [], controls = {};
  const progress = h('div', {class: 'toast', role: 'status', style: {position: 'fixed', bottom: '16px', right: '16px', left: 'auto', zIndex: 95}}, 'Autotest in corso…');
  document.body.append(progress);
  for (const [id, title, fn] of SCENARIOS) {
    progress.textContent = `Autotest: ${id} — ${title}`;
    const t = new Tester();
    let error = null;
    try { closeDialog(); closeDrawer(); closeMenus(); await fn(t); } catch (e) { error = e.message; }
    closeDialog(); closeDrawer(); closeMenus();
    results.push({id, title, result: error ? 'FAIL' : 'PASS', error, controls: [...t.used]});
    for (const c of t.used) {
      const x = controls[c] ?? {result: 'PASS', tests: []};
      x.tests.push(id);
      if (error) x.result = 'FAIL';
      controls[c] = x;
    }
  }
  controls['CTL-COV-RUN'] = {result: 'PASS', tests: ['avvio manuale']};
  for (const [c, why] of Object.entries(BLOCKED_IN_FILE)) if (why && !controls[c]) controls[c] = {result: 'BLOCKED', tests: [], reason: why};
  // Controls a scenario failed on before reaching them stay NOT_RUN; controls never rendered are listed by the test page.
  store.clearNs('mp.test.');
  NS = real.ns; APP.mode = real.mode; APP.clockOffset = real.offset; dayCache.clear();
  const record = {at: new Date().toISOString(), mode: 'DEMO', build: BUILD.version, ms: performance.now() - t0, userAgent: navigator.userAgent.replace(/\s*\(.*?\)\s*/g, ' ').slice(0, 120),
    viewport: `${innerWidth}×${innerHeight}`, scenarios: results, controls, downloads: APP.downloads.length, unknownIds: [...UNKNOWN]};
  writeRaw('autotest', record);
  APP.testing = false;
  progress.remove();
  const failed = results.filter(r => r.result === 'FAIL').length;
  toast(failed ? `Autotest: ${failed} scenari falliti su ${results.length}` : `Autotest superato: ${results.length} scenari`, failed ? 'bad' : 'ok');
  location.hash = href('coverage', {tab: 'autotest'});
  if (real.hash === location.hash) render();
  window.__autotest = record;
  return record;
}
window.MatchPilot = {runAutotest, specs: () => [...SPECS.values()], seen: () => [...SEEN.keys()], unknown: () => [...UNKNOWN], audit: () => auditDom(document), build: BUILD};

