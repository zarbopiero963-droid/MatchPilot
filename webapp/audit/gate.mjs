// Independent audit of the single-file web app (MP-UI-PROTOTYPE-AUDIT-01), DEMO side: real Playwright input on
// webapp/dist/matchpilot-webapp.html opened as a local file; every expected value (oracle) is computed here, never read
// from the app. Run: node webapp/build.mjs && node webapp/audit/gate.mjs  (prints the results as JSON).
import {existsSync} from 'node:fs';
import {chromium} from 'playwright-core';
const FILE = new URL('../dist/matchpilot-webapp.html', import.meta.url).href;
const KNOWN_OPEN = [];
const CHROME = [process.env.MATCHPILOT_E2E_CHROME, '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => p && existsSync(p));
if (!CHROME) { console.error('Chromium non trovato: impostare MATCHPILOT_E2E_CHROME'); process.exit(2); }
const R = [];
const rec = (id, ok, detail) => { R.push({id, result: ok ? 'PASS' : 'FAIL', detail}); };
const browser = await chromium.launch({executablePath: CHROME, args: ['--no-sandbox']});
const ctx = await browser.newContext({viewport: {width: 1366, height: 860}, acceptDownloads: true});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const ready = () => page.waitForFunction(() => { const v = document.querySelector('#view'); return v?.dataset.ready && !document.querySelector('main [data-state="loading"]'); });
const go = async h => { await page.evaluate(x => { location.hash = x; }, h); await page.waitForTimeout(80); await ready(); };
const txt = async s => ((await page.textContent(s)) ?? '').replace(/\s+/g, ' ').trim();
const near = (a, b, eps = 0.0051) => Math.abs(a - b) <= eps;
const itNum = s => Number(String(s).replace(/[^\d,+\-−]/g, '').replace('−', '-').replace(/\./g, '').replace(',', '.'));
await page.goto(FILE); await ready();
// ---------------------------------------------------------------- A. calculators (oracles computed here)
const tool = async (t, p) => { await go(`#/tools?${new URLSearchParams({tool: t, ...p, run: 1})}`); return page.locator('[data-testid="tool-result"], [data-testid="tool-error"]').first(); };
const dd = async label => itNum(await page.locator(`[data-testid="tool-result"] dt:text-is("${label}") + dd`).first().textContent());
// odds
await tool('odds', {odds: '2 4'});
rec('FIN-ODDS-01 margine 2/4 = −25%, equa 1,5/3', (await txt('[data-out="overround"]')) === '-25,00%' && (await txt('[data-testid="tool-result"] tbody tr:nth-child(1) td:nth-child(4)')) === '1,500', await txt('[data-testid="tool-result"]'));
// EV
for (const [p, exp, label] of [[{odds: '2.2', probability: '50', stake: '10', side: 'BACK', commission: '5'}, 0.70, 'BACK c5'], [{odds: '2.2', probability: '50', stake: '10', side: 'LAY', commission: '0'}, -1.00, 'LAY c0'],
  [{odds: '2.2', probability: '50', stake: '10', side: 'LAY', commission: '5'}, 0.5 * 10 * 0.95 - 0.5 * 12, 'LAY c5']]) {
  await tool('ev', p); const v = itNum(await txt('[data-out="ev"]')); rec(`FIN-EV ${label} = ${exp.toFixed(2)}`, near(v, exp), v);
}
// Kelly
await tool('kelly', {odds: '2.2', probability: '50', bankroll: '1000', fraction: '50'}); rec('FIN-KELLY-01 ½ Kelly 2,2/50% su 1000 = 41,66', itNum(await txt('[data-out="stake"]')) === 41.66, await txt('[data-out="stake"]'));
await tool('kelly', {odds: '1.8', probability: '50', bankroll: '1000', fraction: '100'}); rec('FIN-KELLY-02 nessun vantaggio → 0', itNum(await txt('[data-out="stake"]')) === 0, await txt('[data-out="stake"]'));
// position
await tool('position', {side: 'LAY', odds: '4', liability: '30', commission: '0'}); rec('FIN-POS-01 LAY resp. 30 @4 → puntata 10', itNum(await txt('[data-out="stake"]')) === 10 && itNum(await txt('[data-out="liability"]')) === 30, await txt('[data-testid="tool-result"]'));
await tool('position', {side: 'BACK', odds: '3', stake: '10', commission: '5'}); rec('FIN-POS-02 BACK 10 @3 c5 vince +19,00', (await txt('[data-testid="tool-result"]')).includes('+19,00') && (await txt('[data-testid="tool-result"]')).includes('−10,00'), await txt('[data-testid="tool-result"]'));
await tool('position', {side: 'LAY', odds: '4', stake: '10', liability: '30'}); rec('FIN-POS-03 puntata e responsabilità insieme → errore', await page.locator('[data-testid="tool-error"]').count() === 1, '');
// hedge
await tool('hedge', {side: 'BACK', odds: '3', stake: '10', current_odds: '2', share: '100', commission: '0'}); rec('FIN-HEDGE-01 BACK 10@3 → LAY 15 @2, +5/+5', (await txt('[data-out="hedge"]')) === 'Banca 15,00' && (await txt('[data-out="after"]')) === '+5,00 / +5,00', await txt('[data-out="after"]'));
await tool('hedge', {side: 'LAY', odds: '2', stake: '10', current_odds: '3', share: '100', commission: '0'}); rec('FIN-HEDGE-02 LAY 10@2 → BACK 6,67 @3', (await txt('[data-out="hedge"]')) === 'Punta 6,67', await txt('[data-out="after"]'));
await tool('hedge', {side: 'BACK', odds: '3', stake: '10', current_odds: '2', share: '50', commission: '0'});
const half = await txt('[data-out="after"]'); const co = await dd('Cashout teorico');
rec('FIN-HEDGE-03 copertura 50%: +12,50 / −2,50', half === '+12,50 / −2,50', half);
rec('FIN-HEDGE-04 «Cashout teorico» con copertura parziale non deve mostrare il minimo come cashout', !(co === -2.5), `mostra ${co}`);
await tool('hedge', {side: 'BACK', odds: '3', stake: '10', current_odds: '2', share: '100', commission: '5'}); rec('FIN-HEDGE-05 green-up netto commissione 5% = +4,75/+4,75', (await txt('[data-out="after"]')) === '+4,75 / +4,75', await txt('[data-out="after"]'));
// dutching
await tool('dutching', {odds: '4 5 6', total: '100', commission: '0'}); const dut = await txt('[data-testid="tool-result"] tbody');
rec('FIN-DUTCH-01 4/5/6 su 100 → 40,54/32,43/27,03', ['40,54', '32,43', '27,03'].every(x => dut.includes(x)), dut);
// poisson independent
const pmf = (l, k) => Math.exp(-l) * l ** k / [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800][k];
let H = 0, D = 0, A = 0; for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) { const p = pmf(1.6, i) * pmf(1.1, j); if (i > j) H += p; else if (i === j) D += p; else A += p; }
await tool('poisson', {xg_home: '1.6', xg_away: '1.1', max_goals: '5'}); const pz = await txt('[data-testid="tool-result"] .odds');
rec('FIN-POISSON-01 1X2 1,6/1,1', pz.includes(`${(H * 100).toFixed(2).replace('.', ',')}%`) && pz.includes(`${(A * 100).toFixed(2).replace('.', ',')}%`), `${pz} oracolo ${(H*100).toFixed(2)}/${(D*100).toFixed(2)}/${(A*100).toFixed(2)}`);
rec('FIN-POISSON-02 0-0 = e^-2,7', (await txt('[data-score="0-0"]')) === `${(Math.exp(-2.7) * 100).toFixed(1).replace('.', ',')}%`, await txt('[data-score="0-0"]'));
// progression / risk / convert
await tool('progression', {type: 'MARTINGALE', base: '5', odds: '2', steps: '8'}); rec('FIN-PROG-01 martingala 5×2^7 totale 1275', (await txt('[data-out="progression"]')).includes('1.275,00'), await txt('[data-out="progression"]'));
await tool('risk', {probability: '45', losses: '5', stake: '10', bankroll: '500'}); rec('FIN-RISK-01 0,55^5 = 5,03%', (await txt('[data-out="streak"]')) === '5,03%', await txt('[data-out="streak"]'));
await tool('convert', {odds: '2.5'}); rec('FIN-CONV-01 2,5 → 3/2', (await txt('[data-out="fractional"]')) === '3/2', await txt('[data-out="fractional"]'));
// invalid inputs
for (const [t, p, why] of [['ev', {odds: '1', probability: '50', stake: '10'}, 'quota 1'], ['ev', {odds: '2', probability: '100', stake: '10'}, 'probabilità 100'], ['ev', {odds: '2', probability: '50', stake: '-1'}, 'puntata negativa'],
  ['ev', {odds: '2', probability: '50', stake: '10', commission: '100'}, 'commissione 100'], ['odds', {odds: '2 abc'}, 'quota non numerica'], ['dutching', {odds: '4', total: '100'}, 'una sola quota'], ['poisson', {xg_home: '11', xg_away: '1'}, 'xG 11']]) {
  await tool(t, p); rec(`VAL-${t} ${why} rifiutato`, await page.locator('[data-testid="tool-error"]').count() === 1, await txt('main'));
}
await tool('ev', {odds: '1', probability: '50', stake: '10'}); rec('VAL-MSG messaggio di quota minima coerente (non «almeno 1,00»)', !(await txt('[data-testid="tool-error"]')).includes('almeno 1,00'), await txt('[data-testid="tool-error"]'));
// ---------------------------------------------------------------- B. persistence, double click, reload
await go('#/strategies?new=1');
await page.fill('[data-control="CTL-STRAT-NAME"]', 'Audit pre');
await page.fill('[data-control="CTL-COND-A"]', '1.3'); await page.fill('[data-control="CTL-COND-B"]', '3.5');
await page.dblclick('[data-control="CTL-STRAT-SAVE"]'); await page.waitForTimeout(300); await ready();
const versions = await page.evaluate(() => JSON.parse(localStorage.getItem('mp.strategiesV2')).find(s => s.key === 'audit-pre').versions.length);
rec('B-STRAT-DBL doppio clic su Salva → 1 versione', versions === 1, versions);
await page.reload(); await ready(); await go('#/strategies');
rec('B-STRAT-RELOAD strategia presente dopo il ricaricamento', await page.locator('[data-key="audit-pre"]').count() === 1, '');
// import of a strategy without conditions must stay without conditions
await page.evaluate(async () => {
  const input = document.querySelector('[data-control="CTL-STRAT-IMPORT"]'); const dt = new DataTransfer();
  dt.items.add(new File([JSON.stringify([{name: 'Senza condizioni', market: 'MATCH_ODDS', selection: 'HOME', side: 'BACK'}])], 'x.json', {type: 'application/json'}));
  input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles: true}));
});
await page.waitForTimeout(400);
const impConds = await page.evaluate(() => JSON.parse(localStorage.getItem('mp.strategiesV2')).find(s => s.key === 'senza-condizioni')?.versions[0].def.conditions);
rec('B-STRAT-IMPORT strategia importata senza condizioni resta senza condizioni', Array.isArray(impConds) && impConds.length === 0, JSON.stringify(impConds));
// paper: open position, double-click confirm, MM caps enforcement, settings limit enforcement
await go('#/dashboard?status=ns');
const firstNs = await page.getAttribute('.mrow[data-status="NS"] a', 'href');
await go(firstNs);
await page.click('[data-control="CTL-MC-TRADE"]');
await page.selectOption('[data-control="CTL-TRADE-SEL"]', 'HOME');
await page.fill('[data-control="CTL-TRADE-ODDS"]', '2.5'); await page.fill('[data-control="CTL-TRADE-STAKE"]', '500');
await page.dblclick('[data-control="CTL-TRADE-CONFIRM"]'); await page.waitForTimeout(300);
const pos0 = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mp.ledger') ?? '{"positions":{}}').positions));
const blockMsg = await txt('[data-dialog="trade"] .err');
rec('FIN-MM-ENFORCE puntata 500 oltre il tetto del profilo predefinito (50) deve essere ridotta o bloccata', pos0.length === 0 && blockMsg.includes('tetto del profilo'), blockMsg);
rec('FIN-SET-ENFORCE puntata 500 oltre «Puntata massima» delle Impostazioni (100) deve essere rifiutata', pos0.length === 0 && blockMsg.includes('massimo delle impostazioni'), blockMsg);
await page.fill('[data-control="CTL-TRADE-STAKE"]', '50');
await page.dblclick('[data-control="CTL-TRADE-CONFIRM"]'); await page.waitForTimeout(300);
const pos = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mp.ledger')).positions));
rec('B-TRADE-DBL doppio clic su Apri posizione → 1 posizione', pos.length === 1, pos.length);
rec('FIN-COMM-SNAP commissione salvata sulla posizione all’apertura (5%)', pos[0]?.commission === 5, pos[0]?.commission);
await page.reload(); await ready(); await go('#/paper');
rec('B-PAPER-RELOAD posizione presente dopo il ricaricamento', await page.locator('[data-testid="paper-open"] [data-position]').count() === 1, '');
// hedge oracle: BACK 50 @2.5 hedged LAY @2.0 → 62,50, +12,50/+12,50
await page.click('[data-control="CTL-PAPER-HEDGE"]'); await page.fill('[data-control="CTL-HEDGE-ODDS"]', '2'); await page.waitForTimeout(100);
await page.click('[data-control="CTL-HEDGE-CONFIRM"]'); await page.waitForTimeout(300); await ready();
const legs = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mp.ledger')).positions)[0].legs);
rec('FIN-LEDGER-HEDGE BACK 50@2,5 → LAY 62,50 @2', legs[1]?.side === 'LAY' && legs[1]?.stake === 62.5, JSON.stringify(legs[1]));
// commission snapshot: change commission to 0 then settle by moving DEMO clock +2 days
await go('#/settings'); await page.fill('[data-field="commission"]', '0'); await page.click('[data-control="CTL-SET-SAVE"]'); await ready();
await go('#/diagnostics'); await page.evaluate(() => { const d = new Date(Date.now() + 2 * 86400000); document.querySelector('[data-control="CTL-DIAG-CLOCK"]').value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T12:00`; });
await page.click('[data-control="CTL-DIAG-CLOCK-SET"]'); await ready(); await go('#/paper'); await page.waitForTimeout(300);
const settled = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mp.ledger')).positions)[0]);
rec('FIN-SETTLE-01 posizione regolata a fine partita, lordo +12,50 (green-up)', settled.status === 'SETTLED' && near(settled.net / 0.95, 12.5, 0.02), `${settled.status} ${settled.net}`);
rec('FIN-SETTLE-02 commissione bloccata all’apertura (5%): netto atteso 11,88', near(settled.net, 11.88, 0.006), `netto ${settled.net}`);
const ledgerTypes = await page.evaluate(() => JSON.parse(localStorage.getItem('mp.ledger')).entries.map(e => e.type).join(','));
const recon = await page.evaluate(() => { const l = JSON.parse(localStorage.getItem('mp.ledger')); let cash = 0; for (const e of l.entries) cash += e.type === 'ALLOCATE' ? e.amount : e.type === 'SETTLE' ? e.net : e.type === 'RESET' ? e.delta : 0;
  return {cash, fromPos: Object.values(l.positions).filter(p => p.status === 'SETTLED').reduce((x, p) => x + p.net, 0)}; });
rec('FIN-RECON oracolo: cassa = capitale + somma netti delle posizioni regolate', near(recon.cash, 1000 + recon.fromPos, 0.006), JSON.stringify(recon));
// reset must stay append-only
await page.click('[data-control="CTL-PAPER-RESET"]'); await page.fill('[data-control="CTL-PAPER-RESET-AMOUNT"]', '300'); await page.click('[data-control="CTL-PAPER-RESET-OK"]'); await ready();
const after = await page.evaluate(() => JSON.parse(localStorage.getItem('mp.ledger')).entries.length);
rec('FIN-LEDGER-APPEND «Azzera conto» conserva il registro (append-only #99)', after > ledgerTypes.split(',').length, `movimenti prima: ${ledgerTypes}; dopo: ${after}`);
// STOP rule vs DEC-001 server: in PAUSED a reducing hedge is allowed by the server
await go('#/diagnostics'); await page.click('[data-control="CTL-DIAG-CLOCK-RESET"]'); await ready();
await go(firstNs); await page.click('[data-control="CTL-MC-TRADE"]'); await page.fill('[data-control="CTL-TRADE-ODDS"]', '2.5'); await page.fill('[data-control="CTL-TRADE-STAKE"]', '10');
await page.click('[data-control="CTL-TRADE-CONFIRM"]'); await page.waitForTimeout(200);
await go('#/paper'); await page.click('[data-control="CTL-PAPER-PAUSE"]'); await page.fill('[data-control="CTL-PAPER-REASON"]', 'audit'); await page.click('[data-control="CTL-PAPER-REASON-OK"]'); await ready();
await page.click('[data-control="CTL-PAPER-HEDGE"]'); await page.fill('[data-control="CTL-HEDGE-ODDS"]', '2'); await page.click('[data-control="CTL-HEDGE-CONFIRM"]'); await page.waitForTimeout(200);
const pausedHedge = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('mp.ledger')).positions).at(-1).legs.length);
rec('FIN-STOP-01 in PAUSA una copertura che riduce l’esposizione è consentita (regola server DEC-001)', pausedHedge === 2, `gambe ${pausedHedge}`);
await page.keyboard.press('Escape');
// ---------------------------------------------------------------- C. backtest: CSV oracle
await go('#/strategies');
await go('#/backtest?strategy=audit-pre');
await page.fill('[data-control="CTL-BT-FROM"]', await page.evaluate(() => { const d = new Date(Date.now() - 40 * 86400000); return d.toISOString().slice(0, 10); }));
await page.fill('[data-control="CTL-BT-COMM"]', '5'); await page.click('[data-control="CTL-BT-RUN"]'); await ready(); await page.waitForTimeout(200);
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-control="CTL-BT-CSV"]')]);
const csv = (await (await dl.createReadStream()).toArray()).join('');
const rows = csv.trim().split('\n').slice(1).map(l => l.split(';'));
let sum = 0, bad = 0;
for (const r of rows) { const [, , , side, odds, stake, , , esito, net] = r; const o = +odds, s = +stake, win = esito === 'vinta';
  const g = side === 'BACK' ? (win ? s * (o - 1) : -s) : (win ? -s * (o - 1) : s); const n = g > 0 ? g * 0.95 : g; if (Math.abs(n - +net) > 0.011) bad++; sum += n; }
const kpi = itNum(await txt('[data-kpi="pl"] b'));
rec('FIN-BT-01 ogni riga del CSV: netto = formula BACK/LAY con commissione 5%', bad === 0 && rows.length > 0, `${rows.length} righe, ${bad} errate`);
rec('FIN-BT-02 somma dei netti = profitto netto mostrato', near(sum, kpi, 0.05), `somma ${sum.toFixed(2)} kpi ${kpi}`);
rec('FIN-BT-03 nessuna operazione su partite del giorno o future (no look-ahead)', rows.every(r => r[0] < new Date().toISOString().slice(0, 10)), '');
// ---------------------------------------------------------------- D. accessibility and keyboard
const a11y = await page.evaluate(() => {
  const named = el => (el.getAttribute('aria-label') || el.textContent.trim() || el.closest('label')?.textContent.trim() || el.title || el.placeholder) ? true : false;
  const out = [];
  for (const v of ['dashboard', 'strategies', 'tools', 'paper', 'money', 'settings', 'backtest', 'live', 'analysis']) out.push(v);
  return {unnamed: [...document.querySelectorAll('button, a[href], input, select')].filter(e => !named(e)).map(e => e.outerHTML.slice(0, 80)),
    skip: !!document.querySelector('a[href="#view"], .skip'), lang: document.documentElement.lang, h1: document.querySelectorAll('main h1').length};
});
rec('A11Y-01 controlli senza nome accessibile (pagina Paper)', a11y.unnamed.length === 0, a11y.unnamed.join(' | '));
rec('A11Y-02 link «salta al contenuto»', a11y.skip, a11y.skip ? 'presente' : 'assente');
await go('#/dashboard'); await page.focus('#gsearch'); await page.keyboard.type('Calend'); await page.keyboard.press('Enter'); await ready();
rec('A11Y-03 ricerca globale usabile da tastiera', (await page.evaluate(() => document.querySelector('#view').dataset.view)) === 'calendar', '');
await go('#/strategies'); await page.click('[data-control="CTL-STRAT-DELETE"]');
const trapped = await page.evaluate(() => document.activeElement?.closest('.dialog') !== null);
await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
const still = await page.evaluate(() => !!document.activeElement?.closest('.dialog'));
await page.keyboard.press('Escape'); const closed = await page.evaluate(() => !document.querySelector('#overlay'));
rec('A11Y-04 finestra: fuoco iniziale, trappola del Tab, Esc chiude', trapped && still && closed, `${trapped} ${still} ${closed}`);
await go('#/match?id=x'); const focusAfterNav = await page.evaluate(() => document.activeElement?.tagName);
rec('A11Y-05 dopo la navigazione il fuoco va al contenuto', focusAfterNav === 'MAIN', `fuoco su ${focusAfterNav}`);
// ---------------------------------------------------------------- E. back/forward, unknown routes, JS errors
await go('#/calendar'); await go('#/tools'); await page.goBack(); await ready();
rec('B-NAV-BACK indietro del browser', (await page.evaluate(() => document.querySelector('#view').dataset.view)) === 'calendar', '');
await go('#/match?id=demo:xx:2020-01-01:0'); rec('B-NAV-BADID partita inesistente gestita', (await txt('main h1')).includes('non trovata'), await txt('main h1'));
await go('#/backtest?strategy=nessuna&run=1&from=2026-01-01&to=2025-01-01'); rec('B-BT-BADSTRAT strategia inesistente gestita', (await page.locator('main [role="alert"]').count()) > 0, await txt('main'));
rec('B-JS-ERRORS nessun errore JavaScript durante l’audit', errs.length === 0, errs.join(' | '));
console.log(JSON.stringify(R, null, 1));
await browser.close();

// Exit status: 0 only when every check passes, except the findings deliberately left open (listed in KNOWN_OPEN).
const unexpected = R.filter(x => x.result !== 'PASS' && !KNOWN_OPEN.some(k => x.id.startsWith(k)));
if (unexpected.length) process.exitCode = 1;
