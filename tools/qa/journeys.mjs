// Browser QA Gate (MP-OWNER-BROWSER-QA-HARD-GATE-01): the required user journeys. Each journey runs in a real
// Chromium on the real server and the QA archive (test/helpers/fpt-seed.mjs seedQaArchive), on every required viewport.
// A journey asserts what the user sees against the API, and ties each check of an action's result to the controls it
// verifies with asserted(controls, description, check) in the same step (ASSERTED evidence, MP-UI-PR-002); the runner adds
// the generic invariants after every step
// (raw null/undefined/NaN, horizontal overflow, basic accessibility, truncated text, overlapping controls) and fails
// on any JavaScript error, failed request or unexpected HTTP error.
import assert from 'node:assert/strict';

export const VIEWPORTS = {desktop: {width: 1280, height: 800}, mobile: {width: 390, height: 844}};

// The formatting rule of the page, applied to API text in the checks (exact digits, comma decimals, dot thousands).
export const shown = value => {
  if (value === null || value === undefined || value === '') return 'N/D';
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  return m ? `${m[1]}${m[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${m[3] === undefined ? '' : `,${m[3]}`}` : String(value);
};

// How a user view names archive slugs and seasons until the API carries display names (MP-WEB-015, inventory UI-12):
// "spain" → "Spain", "premier-league" → "Premier League", "2024-2025" → "2024/25".
export const words = slug => String(slug).trim().split(/[-_\s]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
export const seasonShown = season => /^\d{4}-\d{4}$/.test(season ?? '') ? `${season.slice(0, 4)}/${season.slice(7)}` : shown(season);
const RESULT = {NO_RESULT: 'Senza risultato', NOT_STARTED: 'Non iniziata'};
// A final result shows the score; a match without one shows its state in Italian; a missing score is N/D.
// Calendar arithmetic of the checks, in UTC like the site's day navigation.
const addDays = (text, days) => new Date(Date.parse(`${text}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const outcomeShownFor = row => RESULT[row.result_status] ?? (row.home_score == null || row.away_score == null ? 'N/D' : `${row.home_score}–${row.away_score}`);

const SIDE = {HOME: 'Casa', AWAY: 'Ospite', EVEN: 'Pari'};

// [view, menu label, page title, area]: the menu label is what the user reads before clicking (QA-03: it was not checked);
// the area decides whether the no-technical-text rule applies (MP-WEB-015). Every view declares one (V-B2): the home page
// Oggi (D-2) and the search are user views; «Dati» holds the technical views, reached through its tabs (DATA_TABS).
const NAV = [['', 'Oggi', 'Oggi', 'user'], ['search', 'Ricerca', 'Ricerca partite', 'user'], ['sim', 'Simulazione', 'Simulazione', 'user'],
  ['tools', 'Strumenti', 'Strumenti', 'user'], ['data', 'Dati', 'Stato dei dati', 'technical']];
const NAV_CONTROL = {'': 'CTL-NAV-OGGI', search: 'CTL-NAV-SEARCH', sim: 'CTL-NAV-SIM', tools: 'CTL-NAV-TOOLS', data: 'CTL-NAV-DATA'};
// In the order the journey clicks them: Panoramica, the view the area opens on, comes last so that its click changes the
// view (review #241 B2).
const DATA_TABS = [['#/providers', 'Fornitori', 'Fornitori dati', 'CTL-DATA-TAB-PROVIDERS'], ['#/endpoints', 'API', 'API v1', 'CTL-DATA-TAB-ENDPOINTS'],
  ['#/data', 'Panoramica', 'Stato dei dati', 'CTL-DATA-TAB-DATA']];
const titled = (page, text) => page.waitForFunction(title => document.querySelector('main h1')?.textContent === title && !document.querySelector('.state.loading'), text);
const unavailable = {api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}};
// A full page load: a hash-only change keeps the previous view on screen until the new one renders, so a check
// could read stale results (PR #164 NB-6).
async function fresh(page, url) {
  await page.goto('about:blank');
  await page.goto(url);
}
// After a search submitted from the form, its outcome (results, empty, error) has the focus and is on screen: on a phone
// it starts below the form and would otherwise go unnoticed (audit A-1).
async function outcomeShown(page, selector) {
  await page.waitForFunction(() => document.activeElement?.hasAttribute('data-outcome'), null, {timeout: 10000}).catch(async () => {
    const focus = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.dataset?.testid ?? ''}`.trim());
    throw new Error(`the search outcome${selector ? ` ${selector}` : ''} did not get the focus (focus on ${focus})`);
  });
  const state = await page.evaluate(() => {
    const el = document.activeElement;
    const r = el.getBoundingClientRect();
    return {testid: el.dataset.testid, top: r.top, bottom: r.bottom, height: innerHeight};
  });
  if (selector) assert.equal(`[data-testid="${state.testid}"]`, selector);
  // scrollIntoView aligns the outcome to the top edge; fractional font metrics may leave it a fraction of a pixel above (V-B3).
  assert.ok(state.top >= -1 && state.top < state.height - 20, `outcome on screen: top ${state.top}, viewport ${state.height}`);
}
const ids = async (page, selector) => page.locator(selector).evaluateAll(nodes => nodes.map(node => node.dataset.match));
// Clicks "more" until the list ends, waiting for each page to arrive.
async function loadAll(page, rows) {
  while (await page.locator('[data-action="more"]').count()) {
    const before = await page.locator(rows).count();
    await page.click('[data-action="more"]');
    await page.waitForFunction(([selector, n]) => document.querySelectorAll(selector).length > n || document.querySelector('.paged-foot .state.error'), [rows, before]);
  }
  await page.waitForSelector('[data-testid="end"]');
}

// MP-UI-PR-005: each Trading Tool of the journey: [tool, tab label, the fields typed (none at its default), the shown
// values checked against the server's display values, an invalid field with its label].
const TOOL_SPECS = [
  ['odds', 'Margine', {odds: '2,10 3,40 3,60'},
    d => [['book', shown(d.book_percent)], ['overround', shown(d.overround_percent)], ['fair_odds_0', shown(d.selections[0].fair_odds)]],
    ['odds', '2 1', 'Quote (separate da spazi)']],
  ['kelly', 'Stake e Kelly', {bankroll: '1000', odds: '2,5', probability: '48', fraction: '50', max_stake: '40', max_bankroll: '3'},
    d => [['stake', shown(d.stake)], ['kelly_full', shown(d.kelly_full_percent)], ['governing_limit', 'Tetto in % del capitale'], ['bankroll_after_win', shown(d.bankroll_after_win)]],
    ['probability', '100', 'Probabilità stimata %']],
  ['ev', 'Valore atteso', {stake: '10', odds: '2,10', probability: '50', commission: '5'},
    d => [['expected_value', shown(d.expected_value)], ['edge', shown(d.edge_percent)], ['break_even', shown(d.break_even_percent)]],
    ['commission', '100', 'Commissione % sulle vincite']],
  ['liability', 'Responsabilità', {stake: '10', odds: '3', commission: '5', bankroll: '15'},
    d => [['liability', shown(d.liability)], ['liability_share', shown(d.liability_percent_of_bankroll)], ['if_selection_loses', shown(d.if_selection_loses)], ['break_even', shown(d.break_even_percent)]],
    ['odds', '1', 'Quota di banca']],
  ['hedge', 'Copertura', {side: 'LAY', stake: '10', odds: '2', exit_odds: '3', commission: '2'},
    d => [['hedge_side', 'Punta'], ['hedge_stake', shown(d.hedge_stake)], ['after_wins', shown(d.after.if_wins)], ['after_loses', shown(d.after.if_loses)], ['residual', shown(d.residual_imbalance)]],
    ['exit_odds', 'abc', 'Quota di uscita']],
  ['dutching', 'Dutching', {total: '100', odds: '4 5 6', commission: '3'},
    d => [['stake_0', shown(d.selections[0].stake)], ['wins_2', shown(d.selections[2].if_wins)], ['placed', shown(d.placed)]],
    ['odds', '4', 'Quote (separate da spazi)']],
  ['poisson', 'Poisson', {xg_home: '1,4', xg_away: '1,1', max_goals: '3'},
    d => [['btts', `${shown(d.btts.yes_percent)}% · quota equa ${shown(d.btts.yes_fair_odds)}`], ['expected_goals', `${shown(d.expected_goals.home)} + ${shown(d.expected_goals.away)} = ${shown(d.expected_goals.total)}`],
      ...d.match_odds.map(m => [`p_${m.selection.toLowerCase()}`, `${{HOME: '1', DRAW: 'X', AWAY: '2'}[m.selection]}${shown(m.percent)}%${shown(m.fair_odds)}`]),
      ['top_scores', d.top_scores.map(s => `${s.score.replace('-', '–')} ${shown(s.percent)}%`).join(' · ')],
      ...d.lines.map(l => [`line_${l.line}`, `${shown(l.line)}${shown(l.over_percent)}%${shown(l.over_fair_odds)}${shown(l.under_percent)}%${shown(l.under_fair_odds)}`]),
      ...d.grid.cells.map(c => [`score_${c.home}-${c.away}`, `${shown(c.percent)}%`])],
    ['xg_home', '12', 'Gol attesi casa']],
];

export const JOURNEYS = [
  {
    id: 'general-navigation', surface: 'Interfaccia generale', title: 'Navigazione, rotte, pagina sconosciuta, tastiera',
    allowRawText: [/^null: the provider catalog does not carry a fixture total$/],
    async run({page, base, step, asserted}) {
      await step('apertura del sito', async () => {
        const response = await page.goto(`${base}/`);
        assert.equal(response.status(), 200);
        assert.equal(response.headers()['x-matchpilot-auth'], undefined, 'owner login off, as in production today');
        assert.match(response.headers()['content-security-policy'] ?? '', /script-src 'self'/);
        await titled(page, 'Oggi');
        await page.waitForSelector('[data-testid="session"][data-checked="true"]', {state: 'attached'});
        assert.equal(await page.isVisible('[data-testid="session"]'), false, 'no session and no «Esci» with the login off');
        // On a phone the menu is a bar fixed at the bottom, and the page leaves room for it; on a desktop it is in the header.
        const bar = await page.evaluate(() => {
          const nav = document.querySelector('.mainnav');
          const r = nav.getBoundingClientRect();
          return {phone: innerWidth <= 560, position: getComputedStyle(nav).position, bottom: Math.round(r.bottom), height: r.height, viewport: innerHeight,
            room: parseFloat(getComputedStyle(document.body).paddingBottom), inHeader: Boolean(nav.closest('header'))};
        });
        if (bar.phone) {
          assert.equal(bar.position, 'fixed');
          assert.equal(bar.bottom, bar.viewport, 'the bar sits at the bottom of the screen');
          assert.ok(bar.room >= bar.height, `the page leaves room for the bar: ${bar.room} < ${bar.height}`);
        } else {
          assert.notEqual(bar.position, 'fixed');
          assert.ok(bar.inHeader);
        }
      });
      await step('identità del mockup: font locali, ambra, logo', async () => {
        // V-B3, D-1: the three typefaces come from this origin and are really used; the accent is the mockup's amber.
        assert.match((await page.request.get(`${base}/`)).headers()['content-security-policy'] ?? '', /font-src 'self'/);
        for (const name of ['manrope-latin-wght', 'barlow-condensed-latin-700', 'barlow-condensed-latin-800', 'jetbrains-mono-latin-wght']) {
          const font = await page.request.get(`${base}/assets/fonts/${name}.woff2`);
          assert.equal(font.status(), 200, name);
          assert.equal(font.headers()['content-type'], 'font/woff2', name);
        }
        const look = await page.evaluate(async () => {
          await document.fonts.ready;
          const css = el => getComputedStyle(el);
          const used = [...document.fonts].filter(face => face.status === 'loaded').map(face => `${face.family.replace(/"/g, '')} ${face.weight}`);
          return {used, body: css(document.body).fontFamily, h1: css(document.querySelector('main h1')).fontFamily,
            accent: css(document.querySelector('.mainnav a[aria-current="page"]')).borderBottomColor, logo: document.querySelector('.brand b')?.textContent,
            external: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).origin !== location.origin).map(entry => entry.name)};
        });
        assert.ok(look.used.some(face => face.startsWith('Manrope')), `Manrope loaded: ${look.used}`);
        assert.ok(look.used.some(face => face.startsWith('Barlow Condensed')), `Barlow Condensed loaded: ${look.used}`);
        assert.match(look.body, /^Manrope/);
        assert.match(look.h1, /^"?Barlow Condensed/);
        assert.equal(look.accent, 'rgb(255, 181, 71)', 'the amber accent #FFB547');
        assert.equal(look.logo, 'MATCHPILOT');
        assert.deepEqual(look.external, [], 'no resource from another origin');
        // Every face is a valid file the browser can use, not only the ones this page happens to need (PR #172 review NB-3).
        // The face that answers must be the one declared for that weight: without its rule, Barlow 700 would be served by
        // the 800 face (PR #172 review R2-NB-1).
        const faces = await page.evaluate(async () => {
          const out = {};
          for (const spec of ['400 15px Manrope', '700 34px "Barlow Condensed"', '800 23px "Barlow Condensed"', '600 14px "JetBrains Mono"']) {
            out[spec] = (await document.fonts.load(spec)).map(face => face.weight);
          }
          return out;
        });
        for (const [spec, weights] of Object.entries(faces)) {
          assert.equal(weights.length, 1, `${spec} loads one face`);
          const wanted = Number(spec.split(' ')[0]);
          const [low, high = low] = weights[0].split(' ').map(Number);
          assert.ok(low <= wanted && wanted <= high, `${spec} is served by its own face, not by weight ${weights[0]}`);
        }
        // The keyboard focus is the amber ring of the mockup (PR #172 review NB-3).
        await page.evaluate(() => { document.activeElement?.blur(); });
        await page.keyboard.press('Tab');
        const ring = await page.evaluate(() => {
          const s = getComputedStyle(document.activeElement);
          return {tag: document.activeElement.tagName, style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor};
        });
        assert.deepEqual(ring, {tag: 'A', style: 'solid', width: '2px', color: 'rgb(255, 181, 71)'});
      });
      await step('ogni voce del menu è nota e ha la sua area', async () => {
        const views = await page.locator('nav a[data-view]').evaluateAll(links => links.map(link => link.dataset.view));
        assert.deepEqual(views, NAV.map(([view]) => view), 'a new view must be listed here with its area');
      });
      for (const [view, label, title, area] of NAV) {
        await step(`menu: ${title}`, async () => {
          // The click must change the view: start from another one, where this entry is not current (review #241 B1).
          const [from, fromTitle] = view === 'search' ? ['sim', 'Simulazione'] : ['search', 'Ricerca partite'];
          await fresh(page, `${base}/#/${from}`);
          await titled(page, fromTitle);
          assert.equal(await page.getAttribute(`nav a[data-view="${view}"]`, 'aria-current'), null, 'not current before the click');
          assert.equal((await page.textContent(`nav a[data-view="${view}"]`)).trim(), label);
          await page.click(`nav a[data-view="${view}"]`);
          await asserted(NAV_CONTROL[view], `the menu opens ${title}, marks it current and declares its area`, async () => {
            await page.waitForLoadState('networkidle');
            await page.waitForFunction(text => document.querySelector('main h1')?.textContent === text && !document.querySelector('.state.loading'), title);
            assert.equal(await page.getAttribute(`nav a[data-view="${view}"]`, 'aria-current'), 'page');
            assert.equal(await page.getAttribute('main', 'data-area'), area);
          });
        });
      }
      await step('Dati: le schede aprono le viste tecniche', async () => {
        await fresh(page, `${base}/#/data`);
        await titled(page, 'Stato dei dati');
        for (const [href, label, title, control] of DATA_TABS) {
          const tab = page.locator(`[data-testid="data-tabs"] a[href="${href}"]`);
          assert.equal((await tab.textContent()).trim(), label);
          assert.equal(await tab.getAttribute('aria-current'), null, `${label} is not current before the click`);
          await tab.click();
          await asserted(control, `the tab opens ${title} as a technical section of Dati`, async () => {
            await titled(page, title);
            assert.equal(await page.getAttribute(`[data-testid="data-tabs"] a[href="${href}"]`, 'aria-current'), 'page');
            assert.equal(await page.getAttribute('nav a[data-view="data"]', 'aria-current'), 'page', `${title} is a section of Dati`);
            assert.equal(await page.getAttribute('main', 'data-area'), 'technical');
          });
        }
        assert.equal(await page.getAttribute('[data-testid="data-tabs"] a:last-child', 'href'), '/coverage');
      });
      await step('indirizzo precedente della Daily Board: apre Oggi', async () => {
        await fresh(page, `${base}/#/board`);
        await titled(page, 'Oggi');
        assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
        assert.equal(await page.getAttribute('main', 'data-area'), 'user');
      });
      await step('rotta sconosciuta', async () => {
        await page.goto(`${base}/#/non-esiste`);
        await page.waitForSelector('text=Pagina non trovata');
        assert.equal(await page.getAttribute('main', 'data-area'), 'user');
        assert.equal(await page.textContent('main a[href="#/"]'), 'Torna a Oggi', 'UI-09');
        await page.click('main a[href="#/"]');
        await asserted('CTL-NOTFOUND-BOARD', 'the link of the unknown page brings back to Oggi', async () => {
          await titled(page, 'Oggi');
          assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
        });
      });
      await step('tastiera: il primo Tab raggiunge un link del sito', async () => {
        await page.keyboard.press('Tab');
        const tag = await page.evaluate(() => document.activeElement?.tagName);
        assert.equal(tag, 'A');
      }, {screenshot: true});
    },
  },
  {
    id: 'dashboard', surface: 'Dashboard', title: 'Riquadri, copertura per campionato, N/D, indisponibilità di una route',
    allowHttp: [{path: '/api/v1/tc/live', status: 503}],
    async run({page, base, step, api}) {
      const providers = await api('/api/v1/providers');
      const coverage = (await api('/api/v1/fpt/coverage-competitions')).data.rows;
      await step('caricamento e valori uguali all’API', async () => {
        await page.goto(`${base}/#/data`);
        await page.waitForSelector('[data-testid="tile-coverage"] tbody tr');
        for (const testid of ['tile-health', 'tile-data-health', 'tile-certification', 'tile-tc-historical', 'tile-tc-prematch', 'tile-tc-live', 'tile-coverage']) {
          assert.equal(await page.getAttribute(`[data-testid="${testid}"]`, 'data-state'), 'ok', testid);
        }
        assert.equal(await page.textContent('[data-testid="tile-certification"] [data-field="unique_matches"]'), shown(providers.data.futpython_certification.unique_matches));
        assert.equal(await page.locator('[data-testid="tile-coverage"] tbody tr').count(), coverage.length);
        assert.equal(coverage.length, 2, 'the QA archive has two competitions');
        for (const row of coverage) {
          const line = page.locator(`[data-testid="tile-coverage"] tr[data-competition="${row.internal_competition_id}"]`);
          assert.equal(await line.locator('[data-field="matches"]').textContent(), shown(row.matches));
          assert.equal(await line.locator('[data-field="last_match_date"]').textContent(), row.last_match_date);
          assert.equal(await line.locator('[data-field="competition"]').textContent(), `${words(row.country_slug)} · ${words(row.league_slug)}`, 'UI-57');
        }
        // UI-53: the data-health state in Italian, the code kept.
        const state = page.locator('[data-testid="tile-data-health"] [data-field="status"]');
        assert.equal(await state.textContent(), {ok: 'Regolare', warning: 'Attenzione', critical: 'Critico'}[providers.data.data_health.status]);
        assert.equal(await state.locator('[data-code]').getAttribute('data-code'), providers.data.data_health.status);
      });
      await step('dati assenti mostrati come N/D, mai 0', async () => {
        assert.equal(await page.textContent('[data-testid="tile-certification"] [data-field="latest_backfill"]'), 'N/D');
        assert.equal(await page.textContent('[data-testid="tile-tc-live"] [data-field="latest"]'), 'N/D');
      });
      await step('ultima sincronizzazione: stato e fine, mai l’oggetto grezzo', async () => {
        // The QA archive has no sync run: the answer of /api/v1/providers is changed in the browser (PR #170 review M10).
        await page.route('**/api/v1/providers', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.data_health.lastRun = {run_id: 'qa', kind: 'incremental', status: 'complete', started_at: '2026-10-19T18:10:00Z', finished_at: '2026-10-19T18:15:00Z'};
          // No date in the alert: only the nested-list rule can give it the full width.
          body.data.data_health.alerts = [{severity: 'warning', code: 'X', title: 'Esempio', message: 'Esempio', last_seen_at: null, occurrences: 1}];
          await route.fulfill({response, json: body});
        });
        // Real instants in every tile that can hold one (PR #171 review B-1): the TotalCorner archive is empty in QA.
        const at = '2027-01-01T00:59:00Z';
        await page.route('**/api/v1/tc/live', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.snapshots = {...body.data.snapshots, latest: at};
          body.data.cursors = {...body.data.cursors, last_polled_at: at};
          await route.fulfill({response, json: body});
        });
        await page.route('**/api/v1/tc/historical', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.matches = {...body.data.matches, earliest: at, latest: at};
          await route.fulfill({response, json: body});
        });
        await page.reload();
        await page.waitForSelector('[data-testid="tile-data-health"] [data-field="lastRun"] time');
        await page.waitForSelector('[data-testid="tile-tc-live"] [data-field="latest"] time');
        assert.equal(await page.textContent('[data-testid="tile-data-health"] [data-field="lastRun"]'), 'Completa · 19/10/2026, 20:15 GMT+2');
        // Every date stays whole on one line and inside its tile.
        const dates = await page.locator('.tile time').evaluateAll(nodes => nodes.map(node => {
          const tile = node.closest('.tile').getBoundingClientRect();
          const r = node.getBoundingClientRect();
          return {text: node.textContent, lines: node.getClientRects().length, inside: r.left >= tile.left - 1 && r.right <= tile.right + 1};
        }));
        assert.ok(dates.length >= 5, `dates in the tiles: ${dates.length}`);
        // A nested list (the alerts) takes the full width of its tile, never a squeezed column (PR #171 review NB-c).
        const nested = await page.locator('[data-testid="tile-data-health"] [data-field="alerts"]').evaluate(node => {
          const tile = node.closest('.tile').getBoundingClientRect();
          return node.getBoundingClientRect().width / tile.width;
        });
        assert.ok(nested > 0.8, `the alerts take ${Math.round(nested * 100)}% of their tile`);
        for (const date of dates) {
          assert.equal(date.lines, 1, `${date.text} breaks across lines`);
          assert.ok(date.inside, `${date.text} leaves its tile`);
        }
        await page.unroute('**/api/v1/providers');
        await page.unroute('**/api/v1/tc/live');
        await page.unroute('**/api/v1/tc/historical');
      });
      await step('una route indisponibile: solo il suo riquadro è N/D con il motivo', async () => {
        await page.route('**/api/v1/tc/live', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await page.reload();
        await page.waitForSelector('[data-testid="tile-tc-live"][data-state="error"]');
        assert.match(await page.textContent('[data-testid="tile-tc-live"]'), /N\/D[\s\S]*non disponibile/);
        assert.equal(await page.getAttribute('[data-testid="tile-tc-live"] .state.partial', 'data-code'), 'UNAVAILABLE');
        assert.equal(await page.getAttribute('[data-testid="tile-coverage"]', 'data-state'), 'ok');
        assert.equal(await page.textContent('[data-testid="dashboard-partial"]'), '1 riquadro su 6 non è disponibile: il motivo è nel riquadro.', 'UI-58');
        await page.unroute('**/api/v1/tc/live');
      });
    },
  },
  {
    id: 'daily-board', surface: 'Daily Board', title: 'Giorno con più campionati, paginazione, navigazione tra giorni, stati vuoti e data non valida',
    allowHttp: [{path: '/api/v1/fpt/matches', status: 503}, {path: '/api/v1/providers', status: 503}],
    async run({page, base, step, asserted, api, seed}) {
      const day = seed.busyDay;
      const boardDay = () => page.getAttribute('[data-testid="board-day"] time', 'datetime');
      const all = (await api(`/api/v1/fpt/matches?date=${day}&limit=500`)).data.rows;
      assert.ok(all.length > 24, 'the busy day needs more than one page');
      await step('apertura dalla copertura in Dati', async () => {
        await page.goto(`${base}/#/data`);
        await page.waitForSelector('[data-testid="tile-coverage"] tbody tr');
        const laliga = page.locator(`[data-testid="tile-coverage"] tr[data-competition="${seed.laliga.competition}"] [data-field="last_match_date"] a`);
        const last = new URLSearchParams((await laliga.getAttribute('href')).split('?')[1]).get('date');
        const coverage = (await api('/api/v1/fpt/coverage-competitions')).data.rows.find(row => row.internal_competition_id === seed.laliga.competition);
        assert.equal(last, coverage.last_match_date, 'the link carries the last match day of the API');
        await laliga.click();
        await asserted('CTL-DATA-COVERAGE-DAY', 'the last day of the competition opens the Daily Board on that day', async () => {
          await page.waitForSelector('[data-testid="board-day"]');
          assert.equal(await boardDay(), last);
          assert.ok(await page.locator('article.match').count() > 0, 'that day has matches');
        });
      });
      await step('striscia dei giorni del mockup: tre giorni prima e dopo, Oggi solo per oggi', async () => {
        // V-B4 (UI-22): calendar navigation only; the strip fits its row on every viewport.
        const strip = async () => page.evaluate(() => {
          const nav = document.querySelector('[data-testid="day-strip"]');
          return {shown: document.querySelector('[data-testid="board-day"] time')?.getAttribute('datetime'),
            days: [...nav.querySelectorAll('a')].map(a => ({date: a.dataset.date, href: a.getAttribute('href'), current: a.getAttribute('aria-current'),
              label: a.getAttribute('aria-label'), small: a.querySelector('small').textContent})),
            fits: nav.scrollWidth <= nav.clientWidth + 1};
        });
        const at = await strip();
        assert.deepEqual(at.days.map(d => d.date), [-3, -2, -1, 0, 1, 2, 3].map(shift => addDays(at.shown, shift)));
        assert.deepEqual(at.days.map(d => d.href), at.days.map(d => `#/?date=${d.date}`));
        assert.deepEqual(at.days.map(d => d.current), [null, null, null, 'date', null, null, null]);
        assert.ok(at.days.every(d => /^\p{L}+ \d{1,2} \p{L}+ \d{4}$/u.test(d.label)), `full day names: ${at.days.map(d => d.label)}`);
        assert.ok(!at.days.some(d => d.small === 'Oggi'), 'a past day is not called Oggi');
        assert.ok(at.fits, 'the strip fits its row');
        await page.click(`[data-testid="day-strip"] a[data-date="${at.days[4].date}"]`);
        await asserted('CTL-BOARD-DAY', 'a day of the strip shows that day and becomes the current one', async () => {
          await page.waitForFunction(text => document.querySelector('[data-testid="day-strip"] a[aria-current="date"]')?.dataset.date === text, at.days[4].date);
          assert.equal(await boardDay(), at.days[4].date);
        });
        await page.goto(`${base}/#/`);
        await page.waitForFunction(() => document.querySelector('[data-testid="day-strip"] a[aria-current="date"] small')?.textContent === 'Oggi');
        assert.equal(await page.textContent('main h1'), 'Oggi');
      });
      await step('selezione della data dal campo', async () => {
        await page.fill('input[name="date"]', day);
        await page.click('[data-testid="board-controls"] button[type="submit"]');
        await asserted(['CTL-BOARD-DATE', 'CTL-BOARD-SHOW'], 'the chosen date is shown with its first page of matches', async () => {
          await page.waitForFunction(text => document.querySelector('[data-testid="board-day"] time')?.getAttribute('datetime') === text, day);
          assert.equal(await page.locator('article.match').count(), 24);
          assert.deepEqual(await ids(page, 'article.match'), all.slice(0, 24).map(row => row.internal_match_id), 'the first page of the API');
        });
        assert.equal(await page.getAttribute('main', 'data-area'), 'user', 'the Daily Board is a user view: no technical text');
        assert.equal(await page.textContent('main h1'), 'Partite del giorno', 'a day other than today');
        assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
        // The QA archive has no sync run: no update time is shown, none is made up (UI-25).
        assert.equal(await page.locator('[data-testid="updated"]').count(), 0);
      });
      await step('paginazione fino alla fine, stesso ordine dell’API', async () => {
        await loadAll(page, 'article.match');
        await asserted('CTL-LIST-MORE', 'every page is loaded, in the order of the API, up to the end', async () => {
          assert.deepEqual(await ids(page, 'article.match'), all.map(row => row.internal_match_id));
        });
      });
      await step('schede: valori, campionato e N/D come nell’API', async () => {
        const cards = page.locator('article.match');
        for (const [i, row] of all.entries()) {
          const card = cards.nth(i);
          assert.equal(await card.locator('[data-field="competition"]').textContent(), `${words(row.country_slug)} · ${words(row.league_slug)} · ${seasonShown(row.season)}`);
          assert.equal(await card.locator('[data-field="kickoff"]').textContent(), shown(row.kickoff_local_time));
          for (const name of ['odd_home', 'odd_draw', 'odd_away', 'odd_over25', 'odd_btts_yes']) {
            assert.equal(await card.locator(`[data-field="${name}"] b`).textContent(), shown(row[name]), name);
          }
          for (const [name, text] of [['odd_home', '1'], ['odd_draw', 'X'], ['odd_away', '2'], ['odd_over25', 'Over 2,5'], ['odd_btts_yes', 'Gol']]) {
            assert.equal(await card.locator(`[data-field="${name}"] > span`).textContent(), text, `label of ${name}`);
          }
          const favorite = card.locator('[data-field="favorite"]');
          assert.equal(await favorite.textContent(), row.favorite_side ? `Favorito ${SIDE[row.favorite_side]} ${shown(row.favorite_odd)}` : 'Favorito N/D');
          if (row.favorite_side) assert.equal(await favorite.locator('[data-code]').getAttribute('data-code'), row.favorite_side);
          assert.equal(await card.locator('[data-field="xg"] b').textContent(), `${shown(row.xg_home)} – ${shown(row.xg_away)}`);
          assert.equal(await card.locator('[data-field="score"]').textContent(), outcomeShownFor(row));
          assert.equal(await card.locator('h3').getAttribute('aria-label'), `${row.home_name || 'N/D'} – ${row.away_name || 'N/D'}`, 'the teams read as one pair');
          // Nothing of the API row is lost: what the card no longer prints stays on it, for checks and technical views.
          assert.equal(await card.getAttribute('data-result'), row.result_status ?? '');
          assert.equal(await card.getAttribute('data-phase'), row.phase ?? '');
          assert.equal(await card.getAttribute('data-dataset'), row.dataset_key ?? '');
          assert.equal(await card.locator('[data-field="kickoff"]').getAttribute('data-tz'), row.kickoff_tz_status ?? '');
          // The provider time is shown as written, not converted (D-7); the tooltip says so in plain words.
          if (row.kickoff_local_time) assert.match(await card.locator('[data-field="kickoff"]').getAttribute('title'), /fuso orario non è specificato/);
        }
        // No provenance line in a user view (MP-WEB-015): source, generation time and code version live in the technical views.
        assert.equal(await page.locator('main p.meta:not([data-testid="end"])').count(), 0);
        assert.ok(all.some(row => row.favorite_side) && all.some(row => !row.favorite_side), 'the busy day has matches with and without a favourite');
        assert.ok(new Set(all.map(row => row.league_slug)).size === 2, 'both competitions on the day');
      });
      await step('righe compatte del mockup: mercati sulla riga, sotto le squadre sul telefono', async () => {
        // V-B4 (UI-14): one compact row per match; on a phone the markets go under the teams, never hidden (no data lost).
        const look = await page.evaluate(() => {
          const box = node => node.getBoundingClientRect();
          return {phone: innerWidth <= 560, board: document.querySelector('[data-testid="paged-list"]').classList.contains('board'),
            rows: [...document.querySelectorAll('article.match')].map(row => {
              const r = box(row), teams = box(row.querySelector('.teams')), odds = box(row.querySelector('[data-field="odds_1x2"]'));
              const parts = ['.teams', '.score', '[data-field="odds_1x2"]', '[data-field="odd_over25"]', '[data-field="odd_btts_yes"]', '.facts'].map(s => box(row.querySelector(s)));
              return {height: r.height, inside: parts.every(b => b.width > 0 && b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.bottom <= r.bottom + 0.5),
                sameLine: odds.top < teams.bottom && odds.bottom > teams.top, below: odds.top >= teams.bottom - 0.5};
            })};
        });
        assert.ok(look.board, 'the rows sit in one list card');
        for (const [i, row] of look.rows.entries()) {
          assert.ok(row.inside, `row ${i}: every part shown inside its row`);
          if (look.phone) assert.ok(row.below, `row ${i}: the markets under the teams on a phone`);
          else {
            assert.ok(row.sameLine, `row ${i}: teams and markets on one line`);
            assert.ok(row.height <= 96, `row ${i}: compact (${row.height}px)`);
          }
        }
      });
      await step('partite senza risultato finale: lo stato al posto del punteggio', async () => {
        // The QA archive holds final results only: the API answer is changed in the browser to show the other states.
        await page.route('**/api/v1/fpt/matches?*', async route => {
          const response = await route.fetch();
          const body = await response.json();
          Object.assign(body.data.rows[0], {result_status: 'NOT_STARTED', home_score: null, away_score: null});
          Object.assign(body.data.rows[1], {result_status: 'NO_RESULT', home_score: null, away_score: null});
          Object.assign(body.data.rows[2], {result_status: 'FINAL', home_score: null, away_score: null});
          await route.fulfill({response, json: body});
        });
        await fresh(page, `${base}/#/board?date=${day}`);
        await page.waitForSelector('article.match');
        const scores = page.locator('article.match [data-field="score"]');
        assert.deepEqual([await scores.nth(0).textContent(), await scores.nth(1).textContent(), await scores.nth(2).textContent()],
          ['Non iniziata', 'Senza risultato', 'N/D']);
        assert.equal(await page.getAttribute('article.match >> nth=1', 'data-result'), 'NO_RESULT');
        await page.unroute('**/api/v1/fpt/matches?*');
      });
      await step('aggiornamento dei dati: solo con una sincronizzazione reale conclusa', async () => {
        // The QA archive has no sync run: the answer of /api/v1/providers is changed in the browser, one state at a time.
        let run = null;
        await page.route('**/api/v1/providers', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.data_health.lastRun = run;
          await route.fulfill({response, json: body});
        });
        const cases = [['complete', '2026-10-19T18:15:00Z', 'Dati aggiornati: '], ['partial', '2026-10-19T18:15:00Z', 'Dati aggiornati in parte: '],
          ['failed', '2026-10-19T18:15:00Z', null], ['running', null, null], ['complete', null, null], ['complete', '19/10/2026', null]];
        for (const [status, finished, text] of cases) {
          run = {run_id: 'qa', kind: 'incremental', status, started_at: '2026-10-19T18:10:00Z', finished_at: finished};
          await fresh(page, `${base}/#/?date=${day}`);
          await page.waitForSelector('[data-testid="board-day"]');
          await page.waitForLoadState('networkidle');
          const line = page.locator('[data-testid="updated"]');
          if (!text) { assert.equal(await line.count(), 0, `${status} ${finished}`); continue; }
          assert.equal(await line.textContent(), `${text}19/10/2026, 20:15 GMT+2`);
          assert.equal(await line.locator('time').getAttribute('datetime'), '2026-10-19T18:15:00Z');
        }
        // The empty day shows it too.
        run = {run_id: 'qa', kind: 'incremental', status: 'complete', started_at: '2026-10-19T18:10:00Z', finished_at: '2026-10-19T18:15:00Z'};
        await fresh(page, `${base}/#/?date=2024-01-01`);
        await page.waitForSelector('[data-testid="board-empty"]');
        await page.waitForSelector('[data-testid="updated"]');
        await page.unroute('**/api/v1/providers');
      });
      await step('un errore della route di aggiornamento non resta in memoria', async () => {
        // The first answer fails; the next day viewed asks again and shows the line (PR #170 review R2-NB-1).
        let calls = 0;
        await page.route('**/api/v1/providers', async route => {
          calls += 1;
          if (calls === 1) return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)});
          const response = await route.fetch();
          const body = await response.json();
          body.data.data_health.lastRun = {run_id: 'qa', kind: 'incremental', status: 'complete', started_at: '2026-10-19T18:10:00Z', finished_at: '2026-10-19T18:15:00Z'};
          await route.fulfill({response, json: body});
        });
        await fresh(page, `${base}/#/?date=${day}`);
        await page.waitForSelector('[data-testid="board-day"]');
        await page.waitForLoadState('networkidle');
        assert.equal(await page.locator('[data-testid="updated"]').count(), 0, 'no line after the failure');
        await page.click('[data-action="next"]');
        await asserted('CTL-BOARD-NEXT', 'the next day is shown and asks the update route again', async () => {
          await page.waitForSelector('[data-testid="updated"]');
          assert.equal(await boardDay(), addDays(day, 1));
          assert.equal(calls, 2);
        });
        await page.unroute('**/api/v1/providers');
      });
      await step('la pagina non aspetta la route diagnostica dell’aggiornamento', async () => {
        // /api/v1/providers held until the matches are on screen: the board must not wait for it (PR #170 review B-1).
        let release;
        const held = new Promise(done => { release = done; });
        await page.route('**/api/v1/providers', async route => {
          await held;
          const response = await route.fetch();
          const body = await response.json();
          body.data.data_health.lastRun = {run_id: 'qa', kind: 'incremental', status: 'complete', started_at: '2026-10-19T18:10:00Z', finished_at: '2026-10-19T18:15:00Z'};
          await route.fulfill({response, json: body}).catch(() => {});
        });
        await fresh(page, `${base}/#/?date=${day}`);
        await page.waitForSelector('article.match', {timeout: 10000});
        assert.equal(await page.locator('[data-testid="updated"]').count(), 0, 'not yet');
        release();
        await page.waitForSelector('[data-testid="updated"]');
        await page.unroute('**/api/v1/providers');
      });
      await step('errore dell’API: messaggio semplice, codice conservato, Riprova', async () => {
        await page.route('**/api/v1/fpt/matches?*', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await fresh(page, `${base}/#/board?date=${day}`);
        await page.waitForSelector('.state.error[role="alert"]');
        assert.equal(await page.getAttribute('.state.error', 'data-code'), 'UNAVAILABLE');
        assert.equal((await page.textContent('.state.error p')).trim(), 'I dati non sono disponibili in questo momento.');
        assert.equal(await page.textContent('.state.error button'), 'Riprova');
        await page.unroute('**/api/v1/fpt/matches?*');
      });
      await step('giorno prima: nessuna partita salvata', async () => {
        await fresh(page, `${base}/#/board?date=${day}`);
        await page.waitForSelector('[data-testid="board-day"]');
        await page.click('[data-action="prev"]');
        await asserted('CTL-BOARD-PREV', 'the previous day is shown, empty in the archive', async () => {
          await page.waitForSelector('[data-testid="board-empty"]');
          assert.equal(await page.inputValue('input[name="date"]'), addDays(day, -1));
          assert.equal(await page.getAttribute('[data-testid="day-strip"] a[aria-current="date"]', 'data-date'), addDays(day, -1));
          assert.equal(await page.locator('article.match').count(), 0);
        });
        const link = page.locator('[data-testid="board-empty"] a');
        assert.equal(await link.textContent(), 'Dati');
        assert.equal(await link.getAttribute('href'), '#/data');
      });
      await step('giorno dopo: di nuovo il giorno affollato', async () => {
        await page.click('[data-action="next"]');
        await asserted('CTL-BOARD-NEXT', 'the next day is the busy day again, with its first page', async () => {
          await page.waitForFunction(text => document.querySelector('[data-testid="board-day"] time')?.getAttribute('datetime') === text, day);
          assert.equal(await page.locator('article.match').count(), 24);
        });
      });
      await step('data non valida rifiutata senza richieste', async () => {
        const requests = [];
        const listen = request => { if (new URL(request.url()).pathname === '/api/v1/fpt/matches') requests.push(request.url()); };
        page.on('request', listen);
        await fresh(page, `${base}/#/board?date=2024-02-30`);
        await page.waitForSelector('.state.error[role="alert"]');
        await page.waitForLoadState('networkidle');
        page.off('request', listen);
        assert.match(await page.textContent('.state.error'), /Data non valida/);
        assert.deepEqual(requests, [], 'no API request for an invalid date');
      });
    },
  },
  {
    id: 'search', surface: 'Ricerca', title: 'Squadra, filtri singoli e combinati, date, qualità, paginazione, validazione',
    allowHttp: [{path: '/api/v1/fpt/search', status: 400}, {path: '/api/v1/fpt/search', status: 503}],
    async run({page, base, step, asserted, api, seed}) {
      await step('tutte le partite, pagina dopo pagina, fino alla fine', async () => {
        const expected = (await api('/api/v1/fpt/search?limit=500')).data.rows;
        await page.goto(`${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"]');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="search-results"] tr');
        await outcomeShown(page, '[data-testid="search-outcome"]');
        await loadAll(page, '[data-testid="search-results"] tr');
        await asserted(['CTL-SEARCH-SUBMIT', 'CTL-LIST-MORE'], 'an empty search lists every match of the archive, page after page, in the order of the API', async () => {
          assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
          assert.equal(expected.length, seed.matches);
        });
      });
      await step('squadra per nome, sede e qualità combinate', async () => {
        const ajax = (await api('/api/v1/fpt/teams?q=Ajax')).data.rows[0].internal_team_id;
        const expected = (await api(`/api/v1/fpt/search?team=${encodeURIComponent(ajax)}&venue=home&with_odds=true&limit=500`)).data.rows;
        await fresh(page, `${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"]');
        await page.fill('input[name="team"]', 'Ajax');
        await page.selectOption('select[name="venue"]', 'home');
        await page.check('input[name="with_odds"]');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="search-results"] tr');
        await outcomeShown(page, '[data-testid="search-outcome"]');
        await asserted(['CTL-SEARCH-TEAM', 'CTL-SEARCH-VENUE', 'CTL-SEARCH-WITH-ODDS', 'CTL-SEARCH-SUBMIT'],
          'team, venue and odds filters combined give the rows of the API for the same filters, and stay in the form', async () => {
            assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
            assert.equal(await page.inputValue('input[name="team"]'), 'Ajax', 'the form keeps its values');
            assert.equal(await page.inputValue('select[name="venue"]'), 'home');
            assert.equal(await page.isChecked('input[name="with_odds"]'), true);
          });
        assert.equal(await page.getAttribute('main', 'data-area'), 'user', 'the search is a user view: no technical text');
        assert.match(await page.getAttribute('[data-testid="search-outcome"]', 'data-filters'), /\bwith_odds\b/, 'the applied filters stay on the outcome');
        const rows = page.locator('[data-testid="search-results"] tr');
        for (const [i, row] of expected.slice(0, 25).entries()) {
          const line = rows.nth(i);
          assert.equal(await line.locator('[data-field="date"] time').getAttribute('datetime'), row.match_date);
          assert.equal(await line.locator('[data-field="competition"]').textContent(), `${words(row.league_slug)} ${seasonShown(row.season)}`);
          assert.equal(await line.locator('[data-field="score"]').textContent(), outcomeShownFor(row));
        }
        // UI-44: on a phone each result reads as a small card, every value after its column title; on a desktop, a table.
        const layout = await page.evaluate(() => {
          const table = document.querySelector('table.results');
          const wrap = table.parentElement;
          // The title is drawn before the value (::before) in its own space: the value starts after it (PR #173 review NB-1).
          const drawn = [...table.tBodies[0].rows[0].cells].map(td => {
            const before = getComputedStyle(td, '::before');
            return {content: before.content, clear: parseFloat(getComputedStyle(td).paddingLeft) >= parseFloat(before.left) + parseFloat(before.width)};
          });
          return {phone: innerWidth <= 560, titles: [...table.tHead.rows[0].cells].map(th => th.textContent), head: getComputedStyle(table.tHead).display,
            labels: [...table.tBodies[0].rows].map(tr => [...tr.cells].map(td => td.dataset.label)), fits: wrap.scrollWidth <= wrap.clientWidth + 1, drawn};
        });
        assert.ok(layout.labels.every(labels => JSON.stringify(labels) === JSON.stringify(layout.titles)), 'every value carries its column title');
        if (layout.phone) {
          assert.equal(layout.head, 'none', 'the titles move next to each value');
          assert.deepEqual(layout.drawn.map(cell => cell.content), layout.titles.map(title => JSON.stringify(title)), 'each title is drawn on the card');
          assert.ok(layout.drawn.every(cell => cell.clear), 'each value starts after its title, no overlap');
          assert.ok(layout.fits, 'no sideways scroll of the results on a phone');
        } else assert.equal(layout.head, 'table-header-group');
      });
      await step('campionato e intervallo di date', async () => {
        const expected = (await api(`/api/v1/fpt/search?competition=${encodeURIComponent(seed.laliga.competition)}&from=2024-08-02&before=2024-08-03&limit=500`)).data.rows;
        assert.ok(expected.length > 0);
        await fresh(page, `${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"] select[name="competition"]');
        const competitions = (await api('/api/v1/fpt/competitions')).data.rows;
        assert.deepEqual(await page.locator('select[name="competition"] option').allTextContents(),
          ['Tutte', ...competitions.map(c => `${words(c.country_slug)} · ${words(c.league_slug)}`)], 'competition names read as words, not slugs');
        await page.selectOption('select[name="competition"]', seed.laliga.competition);
        await page.fill('input[name="from"]', '2024-08-02');
        await page.fill('input[name="before"]', '2024-08-03');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="search-results"] tr');
        await loadAll(page, '[data-testid="search-results"] tr');
        await asserted(['CTL-SEARCH-COMPETITION', 'CTL-SEARCH-FROM', 'CTL-SEARCH-BEFORE', 'CTL-SEARCH-SUBMIT', 'CTL-LIST-MORE'],
          'competition and date range give every row of the API for the same filters', async () => {
            assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
          });
      });
      await step('qualità: solo con xG', async () => {
        const expected = (await api('/api/v1/fpt/search?with_xg=true&result=FINAL&min_goals=4&limit=500')).data.rows;
        await fresh(page, `${base}/#/search?run=1&with_xg=true&result=FINAL&min_goals=4`);
        await page.waitForSelector('[data-testid="search-results"] tr, [data-testid="search-empty"]');
        assert.equal(await page.locator('[data-testid="search-results"] tr').count(), Math.min(expected.length, 25));
        assert.equal(await page.isChecked('input[name="with_xg"]'), true);
      });
      await step('errore di validazione dal server', async () => {
        await fresh(page, `${base}/#/search?run=1&fav_min=abc`);
        await page.waitForSelector('[data-testid="search-invalid"]');
        assert.match(await page.textContent('[data-testid="search-invalid"]'), /Quota favorito da/);
        assert.equal(await page.getAttribute('[data-testid="search-invalid"]', 'data-fields'), 'fav_min');
      });
      await step('esito vuoto o di errore dal modulo: in vista e con il focus, anche ripetendo la stessa ricerca', async () => {
        await fresh(page, `${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"]');
        await page.fill('input[name="team"]', 'Nessuno');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await asserted(['CTL-SEARCH-TEAM', 'CTL-SEARCH-SUBMIT'], 'an unknown team gives the team-not-found outcome, in view and focused', async () => {
          await page.waitForSelector('[data-testid="team-not-found"]');
          await outcomeShown(page, '[data-testid="team-not-found"]');
          assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 0);
        });
        // The same search again: the address does not change, the outcome is shown again.
        await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await outcomeShown(page, '[data-testid="team-not-found"]');
        await page.fill('input[name="team"]', '');
        await page.fill('input[name="min_goals"]', '30');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await asserted('CTL-SEARCH-MIN-GOALS', 'a minimum of 30 goals matches nothing: the empty outcome, in view and focused', async () => {
          await page.waitForSelector('[data-testid="search-empty"]');
          await outcomeShown(page, '[data-testid="search-empty"]');
          assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 0);
        });
        // A search abandoned before its answer must not move the focus later (PR #168 review NB-1).
        await page.route('**/api/v1/fpt/search?*', async route => { await new Promise(done => setTimeout(done, 1500)); await route.continue().catch(() => {}); });
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.click('nav a[data-view=""]');
        await asserted('CTL-NAV-OGGI', 'the menu leaves the pending search for Oggi', async () => {
          await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Oggi');
          assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
          assert.equal(await page.getAttribute('main', 'data-area'), 'user');
        });
        await page.waitForTimeout(1800);
        await page.unroute('**/api/v1/fpt/search?*');
        await page.evaluate(() => scrollTo(0, 0));
        await page.click('nav a[data-view="search"]');
        await asserted('CTL-NAV-SEARCH', 'the menu opens the search form again', async () => {
          await page.waitForSelector('[data-testid="search-form"]');
          assert.equal(await page.getAttribute('nav a[data-view="search"]', 'aria-current'), 'page');
        });
        await page.waitForTimeout(300);
        assert.equal(await page.evaluate(() => document.querySelector('main').contains(document.activeElement)), false, 'no focus jump into the page without a submit');
        assert.equal(await page.evaluate(() => scrollY), 0, 'no scroll without a submit');
      });
      await step('più squadre con lo stesso nome: scelta leggibile', async () => {
        // The QA archive has no homonyms: the answer of the teams route is changed in the browser to show the choice.
        const ajax = (await api('/api/v1/fpt/teams?q=Ajax')).data.rows[0];
        const twin = {...ajax, internal_team_id: `${ajax.internal_team_id}-twin`, country_slug: 'south-africa'};
        await page.route('**/api/v1/fpt/teams?*', async route => {
          const response = await route.fetch();
          const body = await response.json();
          body.data.rows = [ajax, twin];
          await route.fulfill({response, json: body});
        });
        await fresh(page, `${base}/#/search?run=1&team=Ajax`);
        await page.waitForSelector('[data-testid="team-choice"]');
        assert.deepEqual(await page.locator('[data-testid="team-choice"] li').allTextContents(),
          [`${ajax.canonical_name} (${words(ajax.country_slug)})`, `${ajax.canonical_name} (South Africa)`]);
        await page.unroute('**/api/v1/fpt/teams?*');
      });
      await step('tastiera: il campo con il fuoco resta sopra la barra del telefono', async () => {
        await fresh(page, `${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"]');
        await page.focus('input[name="min_goals"]');
        await page.keyboard.press('Tab');
        const clear = await page.evaluate(() => {
          const field = document.activeElement.getBoundingClientRect();
          const nav = document.querySelector('.mainnav');
          if (getComputedStyle(nav).position !== 'fixed') return {ok: true};
          return {ok: field.bottom <= nav.getBoundingClientRect().top, field: field.bottom, bar: nav.getBoundingClientRect().top, name: document.activeElement.name};
        });
        assert.ok(clear.ok, `focused ${clear.name} at ${clear.field} under the bar at ${clear.bar}`);
      });
      await step('squadra sconosciuta, nessun risultato, sede senza squadra', async () => {
        await fresh(page, `${base}/#/search?run=1&team=Nessuno`);
        await page.waitForSelector('[data-testid="team-not-found"]');
        await fresh(page, `${base}/#/search?run=1&min_goals=30`);
        await page.waitForSelector('[data-testid="search-empty"]');
        await fresh(page, `${base}/#/search?run=1&venue=home`);
        await page.waitForSelector('[data-testid="venue-ignored"]');
      });
      // Two steps: the generic invariants (plain text too) run while the error of the later page is on screen.
      await step('pagina successiva in errore: le righe restano', async () => {
        let fail = true;
        await page.route(/\/api\/v1\/fpt\/search\?.*cursor=/, route => {
          if (!fail) return route.continue();
          fail = false;
          return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)});
        });
        await fresh(page, `${base}/#/search?run=1`);
        await page.waitForSelector('[data-testid="search-results"] tr');
        await page.click('[data-action="more"]');
        await asserted('CTL-LIST-MORE', 'a failed next page keeps the rows already shown and says the data is unavailable', async () => {
          await page.waitForSelector('.paged-foot .state.error');
          assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 25);
          assert.equal(await page.getAttribute('.paged-foot .state.error', 'data-code'), 'UNAVAILABLE');
        });
      });
      await step('Riprova carica la pagina successiva', async () => {
        await page.click('.paged-foot .state.error button');
        await asserted('CTL-LIST-RETRY', 'Riprova loads the next page after the failure and clears the error', async () => {
          await page.waitForFunction(() => document.querySelectorAll('[data-testid="search-results"] tr').length > 25);
          assert.equal(await page.locator('.paged-foot .state.error').count(), 0);
        });
        await page.unroute(/\/api\/v1\/fpt\/search\?.*cursor=/);
      });
    },
  },
  {
    id: 'match-center', surface: 'Match Center', title: 'Analisi pre-partita: apertura da Oggi e Ricerca, filtri, valori uguali all’API, N/D, precedenti, PIT',
    async run({page, base, step, asserted, api, seed}) {
      const analysis = async id => (await api(`/api/v1/fpt/match-analysis?id=${encodeURIComponent(id)}`)).data;
      const pct = value => value == null ? 'N/D' : `${shown(value)}%`;
      // What the comparison shows for one team and one statistic, from the API (the page does no arithmetic).
      const STATS = {n: s => shown(s.n), won: s => pct(s.percent.won), drawn: s => pct(s.percent.drawn), lost: s => pct(s.percent.lost),
        goals_for_avg: s => shown(s.goals_for_avg), goals_against_avg: s => shown(s.goals_against_avg), over25: s => pct(s.percent.over25),
        btts: s => pct(s.percent.btts), clean_sheet: s => pct(s.percent.clean_sheet), failed_to_score: s => pct(s.percent.failed_to_score),
        xg_for_avg: s => shown(s.xg_for_avg), xg_against_avg: s => shown(s.xg_against_avg), xg_n: s => shown(s.coverage.xg_n),
        odds_1x2_n: s => shown(s.coverage.odds_1x2_n)};
      const checkStats = async (data, venueOf, sample, sides = ['home', 'away']) => {
        for (const side of ['home', 'away']) {
          const stats = data.teams[side].venues[venueOf(side)].windows[sample];
          for (const [key, render] of Object.entries(STATS)) {
            const cell = await page.textContent(`[data-stat="${key}"] .n[data-side="${side}"]`);
            assert.equal(cell, sides.includes(side) ? render(stats) : '', `${side} ${key} (${venueOf(side)}, ${sample})`);
          }
          if (!sides.includes(side)) { assert.equal(await page.locator(`[data-testid="team-${side}"]`).count(), 0); continue; }
          const table = page.locator(`[data-testid="team-${side}"]`);
          assert.equal(await table.getAttribute('data-venue'), venueOf(side));
          assert.equal(await table.getAttribute('data-window'), sample);
          if (stats.n === 0) assert.equal(await table.locator('[data-testid="no-history"]').count(), 1, `${side}: no earlier match, an explicit empty state`);
          else {
            assert.deepEqual(await ids(page, `[data-testid="source-${side}"] tr`), stats.source_match_ids, `${side}: the source rows are the API's`);
            await checkRows(`[data-testid="source-${side}"]`, rowsOf(data, side), new Map(stats.form.map(item => [item.match_id, item.result])));
          }
        }
      };
      const settled = () => page.waitForFunction(() => document.querySelector('[data-testid="match-hero"]') && !document.querySelector('.state.loading'));
      const rowsOf = (data, side) => new Map(Object.values(data.teams[side].venues).flatMap(venue => venue.rows).map(row => [row.internal_match_id, row]));
      const LETTER = {W: 'V', D: 'N', L: 'P'};
      // Every cell of a source table equals the API row; the result chip is the team's result from the API's form (PR #176 review NB-1).
      const checkRows = async (selector, rows, results) => {
        const cells = await page.locator(`${selector} tr`).evaluateAll(lines => lines.map(line => ({id: line.dataset.match,
          date: line.querySelector('[data-field="date"] time')?.getAttribute('datetime'), teams: line.querySelector('[data-field="teams"]').textContent,
          href: line.querySelector('[data-field="teams"] a')?.getAttribute('href'), result: line.querySelector('[data-field="result"]')?.textContent ?? null,
          score: line.querySelector('[data-field="score"]').textContent, xg: line.querySelector('[data-field="xg"]').textContent,
          odds: line.querySelector('[data-field="odds_1x2"]').textContent})));
        for (const cell of cells) {
          const row = rows.get(cell.id);
          assert.ok(row, `${cell.id} is a row of the API`);
          assert.equal(cell.date, row.match_date);
          assert.equal(cell.teams, `${row.home_name} – ${row.away_name}`);
          assert.equal(cell.href, `#/match?id=${encodeURIComponent(cell.id)}`);
          assert.equal(cell.result, results ? LETTER[results.get(cell.id)] : null, `${cell.id}: result`);
          assert.equal(cell.score, outcomeShownFor({...row, result_status: 'FINAL'}));
          assert.equal(cell.xg, `${shown(row.xg_home)} · ${shown(row.xg_away)}`);
          assert.equal(cell.odds, `${shown(row.odd_home)} · ${shown(row.odd_draw)} · ${shown(row.odd_away)}`);
        }
      };
      // The last day of the QA archive: its teams have a history before it (the busy day is the first one, with none).
      const all = (await api('/api/v1/fpt/search?limit=500')).data.rows;
      const day = all.reduce((a, b) => (b.match_date > a.match_date ? b : a)).match_date;
      const first = (await api(`/api/v1/fpt/matches?date=${day}&limit=1`)).data.rows[0];
      let data;
      await step('apertura dalla Daily Board', async () => {
        await page.goto(`${base}/#/?date=${day}`);
        await page.waitForSelector('article.match');
        await page.click(`article.match[data-match="${first.internal_match_id}"] [data-action="open-match"]`);
        await asserted('CTL-BOARD-OPEN-MATCH', 'a board row opens the Match Center of that match, with the values of the API', async () => {
          await settled();
          data = await analysis(first.internal_match_id);
          assert.equal(await page.getAttribute('main', 'data-area'), 'user', 'the Match Center is a user view: no technical text');
          assert.equal(await page.getAttribute('main h1', 'aria-label'), `${first.home_name} – ${first.away_name}`);
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="home"]'), first.home_name);
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="away"]'), first.away_name);
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="competition"]'), `${words(first.country_slug)} · ${words(first.league_slug)} · ${seasonShown(first.season)}`);
          assert.equal(await page.getAttribute('[data-testid="match-hero"] [data-field="date"] time', 'datetime'), first.match_date);
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="score"]'), outcomeShownFor(first));
          for (const name of ['odd_home', 'odd_draw', 'odd_away', 'odd_over25', 'odd_under25', 'odd_btts_yes']) {
            assert.equal(await page.textContent(`[data-testid="match-hero"] [data-field="${name}"] b`), shown(data.match[name]), name);
          }
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="xg"] b'), `${shown(data.match.xg_home)} – ${shown(data.match.xg_away)}`);
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="kickoff"]'), shown(data.match.kickoff_local_time));
          assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="favorite"]'),
            data.match.favorite_side ? `Favorito ${SIDE[data.match.favorite_side]} ${shown(data.match.favorite_odd)}` : 'Favorito N/D');
          // Provenance and the PIT status stay on the page for checks, not as text (MP-WEB-015).
          assert.equal(await page.getAttribute('[data-testid="match-hero"]', 'data-pit'), data.method.pit);
          assert.equal(await page.getAttribute('[data-testid="match-hero"]', 'data-version'), data.method.analysis_version);
          assert.equal(await page.getAttribute('nav.mainnav a[aria-current="page"]', 'href').catch(() => null), null, 'no menu entry is current on a match');
        });
      });
      await step('filtri predefiniti: casa/trasferta, ultime 10, valori uguali all’API', async () => {
        assert.equal(await page.getAttribute('[data-filter="venue"] a[aria-current="true"]', 'data-value'), 'split');
        assert.equal(await page.getAttribute('[data-filter="window"] a[aria-current="true"]', 'data-value'), '10');
        assert.equal(await page.getAttribute('[data-filter="team"] a[aria-current="true"]', 'data-value'), 'both');
        assert.equal(await page.getAttribute('[data-testid="cutoff"]', 'data-cutoff'), first.match_date, 'only matches before the match day');
        await checkStats(data, side => side, '10');
        // The form chips of the board are the last five of each team, every venue, from the API.
        for (const side of ['home', 'away']) {
          const form = data.teams[side].venues.both.windows['5'].form;
          const chips = await page.locator(`.board [data-field="form"]`).nth(side === 'home' ? 0 : 1).locator('a')
            .evaluateAll(nodes => nodes.map(node => ({code: node.dataset.code, href: node.getAttribute('href')})));
          assert.deepEqual(chips, form.map(item => ({code: item.result, href: `#/match?id=${encodeURIComponent(item.match_id)}`})), `${side} form and its links`);
        }
      });
      await step('filtri: stagione, tutte le partite, solo la squadra di casa', async () => {
        // Every venue first (split → both): the values change, with the default sample of 10.
        await page.click('[data-filter="venue"] a[data-value="both"]');
        await asserted('CTL-MATCH-FILTER-VENUE', 'every venue shows the API statistics of all matches', async () => {
          await page.waitForFunction(() => document.querySelector('[data-filter="venue"] a[aria-current="true"]')?.dataset.value === 'both');
          await settled();
          await checkStats(data, () => 'both', '10');
        });
        // The last 5 of every venue: a sample whose API values differ from the 10 on screen, so that the check proves the
        // filter took effect (review #241 B4: in the QA archive the season equals the last 10).
        const windowOf = (side, sample) => data.teams[side].venues.both.windows[sample];
        assert.ok(['home', 'away'].some(side => windowOf(side, '5').n !== windowOf(side, '10').n), 'the last 5 differ from the last 10 in the API');
        await page.click('[data-filter="window"] a[data-value="5"]');
        await asserted('CTL-MATCH-FILTER-WINDOW', 'the last 5 show the API statistics of that sample, different from the last 10 shown before', async () => {
          await page.waitForFunction(() => document.querySelector('[data-filter="window"] a[aria-current="true"]')?.dataset.value === '5');
          await settled();
          await checkStats(data, () => 'both', '5');
        });
        await page.click('[data-filter="window"] a[data-value="season"]');
        await page.waitForFunction(() => document.querySelector('[data-filter="window"] a[aria-current="true"]')?.dataset.value === 'season');
        await settled();
        await checkStats(data, () => 'both', 'season');
        await page.click('[data-filter="team"] a[data-value="home"]');
        await asserted('CTL-MATCH-FILTER-TEAM', 'the home team only: its API statistics, the filter kept in the address', async () => {
          await page.waitForFunction(() => document.querySelector('[data-filter="team"] a[aria-current="true"]')?.dataset.value === 'home');
          await settled();
          await checkStats(data, () => 'both', 'season', ['home']);
          assert.match(page.url(), /team=home/, 'the filters are in the address: the view can be shared and reopened');
        });
        await page.click('[data-filter="venue"] a[data-value="away"]');
        await asserted('CTL-MATCH-FILTER-VENUE', 'away matches only: the API statistics away', async () => {
          await page.waitForFunction(() => document.querySelector('[data-filter="venue"] a[aria-current="true"]')?.dataset.value === 'away');
          await settled();
          await checkStats(data, () => 'away', 'season', ['home']);
        });
      });
      await step('nessuna partita futura o dello stesso giorno nelle statistiche (PIT)', async () => {
        const rows = new Map(Object.values(data.teams).flatMap(team => Object.values(team.venues).flatMap(venue => venue.rows)).map(row => [row.internal_match_id, row]));
        assert.ok(rows.size > 0, 'the last day has earlier matches');
        for (const row of rows.values()) assert.ok(row.match_date < first.match_date, `${row.internal_match_id} on ${row.match_date} is before ${first.match_date}`);
        for (const row of data.head_to_head.rows) assert.ok(row.match_date < first.match_date);
      });
      await step('precedenti uguali all’API', async () => {
        if (data.head_to_head.n) {
          assert.deepEqual(await ids(page, '[data-testid="source-h2h"] tr'), data.head_to_head.rows.map(row => row.internal_match_id));
          await checkRows('[data-testid="source-h2h"]', new Map(data.head_to_head.rows.map(row => [row.internal_match_id, row])), null);
        }
        else assert.equal(await page.locator('[data-testid="head-to-head"] .state.empty').count(), 1);
      });
      await step('una partita della prima giornata: nessuna partita precedente, N/D', async () => {
        const earliest = all.reduce((a, b) => (b.match_date < a.match_date ? b : a));
        const empty = await analysis(earliest.internal_match_id);
        assert.equal(empty.teams.home.venues.home.windows['10'].n, 0, 'the fixture really has no earlier match for this team');
        await fresh(page, `${base}/#/match?id=${encodeURIComponent(earliest.internal_match_id)}`);
        await settled();
        await checkStats(empty, side => side, '10');
        assert.equal(await page.textContent('[data-stat="goals_for_avg"] .n[data-side="home"]'), 'N/D', 'no match: N/D, never 0');
      });
      await step('apertura dalla Ricerca e da una riga sorgente', async () => {
        await fresh(page, `${base}/#/search?run=1&competition=${encodeURIComponent(seed.laliga.competition)}`);
        await page.waitForSelector('[data-testid="search-results"] tr');
        const target = await page.getAttribute('[data-testid="search-results"] tr', 'data-match');
        await page.click('[data-testid="search-results"] tr [data-action="open-match"]');
        await asserted('CTL-SEARCH-OPEN-MATCH', 'a search result opens the Match Center of that match', async () => {
          await page.waitForFunction(id => document.querySelector('[data-testid="match-hero"]')?.dataset.match === id, target);
          assert.equal(await page.getAttribute('[data-testid="match-hero"]', 'data-version'), (await analysis(target)).method.analysis_version);
        });
        const next = await page.getAttribute('[data-testid="source-home"] tr, [data-testid="source-away"] tr', 'data-match').catch(() => null);
        if (next) {
          await page.click(`tr[data-match="${next}"] [data-field="teams"] a`);
          await asserted('CTL-MATCH-SOURCE-ROW', 'a source match opens its own Match Center, with its teams from the API', async () => {
            await page.waitForFunction(id => document.querySelector('[data-testid="match-hero"]')?.dataset.match === id, next);
            const match = (await analysis(next)).match;
            assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="home"]'), match.home_name);
            assert.equal(await page.textContent('[data-testid="match-hero"] [data-field="away"]'), match.away_name);
          });
        }
      });
      await step('partita non valida o non trovata', async () => {
        const requests = [];
        const listen = request => { if (new URL(request.url()).pathname === '/api/v1/fpt/match-analysis') requests.push(request.url()); };
        page.on('request', listen);
        await fresh(page, `${base}/#/match?id=xyz`);
        await page.waitForSelector('[data-testid="match-invalid"]');
        await page.waitForLoadState('networkidle');
        page.off('request', listen);
        assert.deepEqual(requests, [], 'an invalid id is refused before any request');
        await fresh(page, `${base}/#/match?id=${encodeURIComponent('fpt:hash:missing')}`);
        await page.waitForSelector('[data-testid="match-not-found"]');
        assert.equal(await page.getAttribute('[data-testid="match-not-found"]', 'data-code'), 'MATCH_NOT_FOUND');
      });
    },
  },
  {
    id: 'simulation', surface: 'Simulazione', title: 'Backtest: modalità rigorosa e ricerca etichettata, valori uguali all’API, capitale, troncamento, errori',
    allowHttp: [{path: '/api/v1/hist/backtest', status: 400}, {path: '/api/v1/hist/backtest', status: 429}, {path: '/api/v1/hist/backtest', status: 503}],
    async run({page, base, step, asserted, api, seed}) {
      const backtest = query => api(`/api/v1/hist/backtest?${new URLSearchParams(query)}`);
      const submit = async () => {
        await page.click('[data-testid="sim-form"] button[type="submit"]');
        await outcomeShown(page);
      };
      const fieldText = name => page.textContent(`[data-field="${name}"]`);
      await step('modulo vuoto: nessuna simulazione finché non si preme Simula', async () => {
        await fresh(page, `${base}/#/sim`);
        await titled(page, 'Simulazione');
        assert.equal(await page.getAttribute('main', 'data-area'), 'user');
        assert.equal(await page.inputValue('select[name="pit_mode"]'), 'PIT', 'the rigorous mode is the default');
        assert.equal(await page.locator('[data-testid="sim-research"]').count(), 0);
        await page.waitForSelector('text=Scegli il periodo e premi Simula.');
      });
      await step('modalità rigorosa: le quote archiviate sono successive all’inizio, nulla da simulare', async () => {
        const expected = (await backtest({from: '2024-08-01', to: '2024-08-31'})).data.report;
        assert.equal(expected.status, 'INSUFFICIENT_PIT_DATA');
        await page.fill('input[name="from"]', '2024-08-01');
        await page.fill('input[name="to"]', '2024-08-31');
        await submit();
        await asserted(['CTL-SIM-FROM', 'CTL-SIM-TO', 'CTL-SIM-SUBMIT'], 'the rigorous backtest of the period shows the report of the API: nothing to simulate, not certified', async () => {
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-status'), 'INSUFFICIENT_PIT_DATA');
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), expected.report_sha256, 'the same report as the API');
          await page.waitForSelector('[data-testid="sim-no-pit"]');
          assert.equal(await page.locator('[data-testid="sim-research"]').count(), 0, 'no research label in the rigorous mode');
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-certified'), 'false');
          await page.waitForSelector('[data-testid="sim-certification"]');
          assert.equal(await fieldText('events'), shown(expected.counts.events));
        });
      });
      await step('ricerca esplorativa: etichetta visibile e valori uguali all’API', async () => {
        const query = {from: '2024-08-01', to: '2024-08-31', competition: seed.eredivisie.competition, pit_mode: 'NON_PIT_RESEARCH', commission: '0.05', stake: '10'};
        const data = (await backtest(query)).data;
        const report = data.report;
        assert.equal(report.status, 'OK');
        assert.ok(report.metrics && report.bets.length > 0, 'the QA archive gives settled bets in research mode');
        await fresh(page, `${base}/#/sim`);
        await page.waitForSelector('[data-testid="sim-form"]');
        await page.fill('input[name="from"]', query.from);
        await page.fill('input[name="to"]', query.to);
        await page.selectOption('select[name="competition"]', query.competition);
        assert.ok(!(await page.locator('[data-testid="sim-mode-hint"]').isVisible()), 'no hint in the rigorous mode');
        await page.selectOption('select[name="pit_mode"]', query.pit_mode);
        assert.ok(await page.locator('[data-testid="sim-mode-hint"]').isVisible(), 'the research mode is explained as soon as it is chosen');
        await page.fill('input[name="commission"]', query.commission);
        await page.fill('input[name="stake"]', query.stake);
        await submit();
        await asserted(['CTL-SIM-FROM', 'CTL-SIM-TO', 'CTL-SIM-COMPETITION', 'CTL-SIM-PIT-MODE', 'CTL-SIM-STAKE', 'CTL-SIM-COMMISSION', 'CTL-SIM-SUBMIT'],
          'the research backtest with stake, commission and competition shows the same report, metrics and bets as the API, labelled as research', async () => {
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), report.report_sha256);
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-pit-mode'), 'NON_PIT_RESEARCH');
          // The label is on the form and above the result, in plain words, never only in a tooltip.
          assert.equal(await page.locator('[data-testid="sim-research"]').count(), 2);
          assert.match(await page.textContent('[data-testid="sim-research"] >> nth=1'), /^RICERCA ESPLORATIVA — .*non dimostrano alcuna redditività/);
          assert.ok(await page.locator('[data-testid="sim-research"] >> nth=1').isVisible());
          const m = report.metrics;
          for (const [name, value] of [['bets', m.bets], ['won', m.won], ['lost', m.lost], ['staked', m.staked], ['exposure', m.exposure],
            ['pl_gross', m.rounded.pl_gross], ['commission', m.rounded.commission], ['pl_net', m.rounded.pl_net], ['roi', m.rounded.roi],
            ['max_drawdown', m.rounded.max_drawdown], ['corrected_results', m.corrected_results], ['events', report.counts.events],
            ['decisions_back', report.counts.decisions.BACK], ['decisions_lay', report.counts.decisions.LAY], ['decisions_no_trade', report.counts.decisions.NO_TRADE],
            ['unsettled', data.totals.unsettled]]) {
            assert.equal(await fieldText(name), shown(value), name);
          }
          assert.equal(await fieldText('by_side_back'), `${shown(m.by_side.BACK.bets)} scommesse · netto ${shown(m.by_side.BACK.pl_net)}`);
          assert.equal(await fieldText('by_side_lay'), `${shown(m.by_side.LAY.bets)} scommesse · netto ${shown(m.by_side.LAY.pl_net)}`);
          assert.equal(await page.textContent('[data-testid="sim-bets"] h2'), `Scommesse (${shown(data.totals.bets)})`);
          const rows = page.locator('[data-testid="sim-bets"] tbody tr');
          assert.equal(await rows.count(), report.bets.length);
          const cells = await rows.evaluateAll(trs => trs.map(tr => ({event: tr.dataset.event, date: tr.cells[0].querySelector('time')?.getAttribute('datetime') ?? null,
            text: [...tr.cells].map(td => td.textContent)})));
          for (const [i, bet] of report.bets.entries()) {
            const event = data.events[bet.event_id];
            assert.equal(cells[i].event, bet.event_id);
            assert.equal(cells[i].date, event.match_date, `row ${i} date`);
            assert.deepEqual(cells[i].text.slice(1), [`${event.home} – ${event.away}`, {BACK: 'Punta', LAY: 'Banca'}[bet.side], {HOME: '1', DRAW: 'X', AWAY: '2'}[bet.selection],
              shown(bet.odds), shown(bet.stake), {WON: 'Vinta', LOST: 'Persa'}[bet.settlement.bet_result], shown(bet.settlement.net)], `row ${i}`);
          }
          assert.equal(await page.inputValue('select[name="pit_mode"]'), 'NON_PIT_RESEARCH', 'the form keeps its values');
        });
      });
      await step('strategia personalizzata: regole nel modulo, definizione registrata, valori e motivi uguali all’API', async () => {
        await fresh(page, `${base}/#/sim`);
        await page.waitForSelector('[data-testid="sim-form"]');
        assert.ok(!(await page.locator('[data-testid="sim-rules"]').isVisible()), 'the rules are hidden for a reference strategy');
        await page.selectOption('select[name="strategy"]', 'custom');
        assert.ok(await page.locator('[data-testid="sim-rules"]').isVisible(), 'the rules appear when «Personalizzata» is chosen');
        const query = {from: '2024-08-01', to: '2024-08-31', pit_mode: 'NON_PIT_RESEARCH', selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME'};
        const data = (await backtest(query)).data;
        const report = data.report;
        assert.match(report.config.strategy, /^def:[0-9a-f]{16}$/);
        assert.ok(report.bets.length > 0, 'the QA archive gives bets for this definition');
        await page.fill('input[name="from"]', query.from);
        await page.fill('input[name="to"]', query.to);
        await page.selectOption('select[name="pit_mode"]', query.pit_mode);
        await page.selectOption('select[name="selection"]', query.selection);
        await page.selectOption('select[name="side"]', query.side);
        await page.fill('input[name="odds_max"]', query.odds_max);
        await page.fill('input[name="team"]', query.team);
        await page.selectOption('select[name="venue"]', query.venue);
        await submit();
        await asserted(['CTL-SIM-FROM', 'CTL-SIM-TO', 'CTL-SIM-STRATEGY', 'CTL-SIM-PIT-MODE', 'CTL-SIM-SELECTION', 'CTL-SIM-SIDE', 'CTL-SIM-ODDS-MAX', 'CTL-SIM-TEAM', 'CTL-SIM-VENUE', 'CTL-SIM-SUBMIT'],
          'the custom rules give the report of the API for the same definition: rules, bets and no-trade reasons', async () => {
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), report.report_sha256, 'the same report as the API');
          assert.equal(await page.getAttribute('[data-testid="sim-strategy"]', 'data-strategy'), report.config.strategy);
          assert.equal(await page.textContent('[data-testid="sim-strategy"] [data-field="rule_main"]'), 'Banca · Casa (1)');
          assert.equal(await page.textContent('[data-testid="sim-strategy"] [data-field="rule_teams"]'), 'Squadra: Ajax · Solo in casa');
          assert.match(await page.textContent('[data-testid="sim-strategy"] ul'), /Quota della selezione fino a 2,5/);
          const rows = await page.locator('[data-testid="sim-bets"] tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
          assert.equal(rows.length, report.bets.length);
          for (const [i, bet] of report.bets.entries()) {
            assert.equal(rows[i][1], `${data.events[bet.event_id].home} – ${data.events[bet.event_id].away}`);
            assert.ok(rows[i][1].startsWith('Ajax – '), 'Ajax at home only');
            assert.deepEqual([rows[i][2], rows[i][3], rows[i][4]], ['Banca', '1', shown(bet.odds)]);
          }
          for (const [code, n] of Object.entries(report.counts.no_trade_by_reason)) {
            assert.equal(await page.textContent(`[data-testid="sim-no-trade"] [data-reason="${code}"]`), shown(n), code);
          }
          assert.ok(report.counts.no_trade_by_reason.TEAM_FILTER > 0, 'the team filter is counted');
          assert.match(await page.textContent('[data-testid="sim-no-trade"]'), /Squadra o sede diversa/);
          // The form keeps the rules; a reference strategy sends none of them.
          assert.equal(await page.inputValue('input[name="team"]'), 'Ajax');
          assert.ok(await page.locator('[data-testid="sim-rules"]').isVisible());
        });
      });
      await step('regole rifiutate dal server: è nominato il campo della regola', async () => {
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-31&strategy=custom&selection=HOME&side=BACK&odds_min=3&odds_max=2`);
        await page.waitForSelector('[data-testid="sim-invalid"]');
        assert.equal(await page.getAttribute('[data-testid="sim-invalid"]', 'data-fields'), 'odds_min');
        assert.match(await page.textContent('[data-testid="sim-invalid"]'), /^Valore non valido in: Quota selezione da\./);
        // The explanation of a refusal never names a field by chance («1 to 100» is not «Al»).
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-31&strategy=custom&selection=HOME&side=BACK&team=${'a'.repeat(101)}`);
        await page.waitForSelector('[data-testid="sim-invalid"]');
        assert.equal(await page.getAttribute('[data-testid="sim-invalid"]', 'data-fields'), 'team');
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-31&strategy=mp-ref-fav-back-1&selection=HOME&side=BACK&odds_min=3&odds_max=2`);
        await page.waitForSelector('[data-testid="sim-outcome"]');
        assert.equal(await page.locator('[data-testid="sim-invalid"]').count(), 0, 'rules are not sent with a reference strategy');
      });
      await step('capitale e gestione: blocco capitale uguale all’API', async () => {
        const query = {from: '2024-08-01', to: '2024-08-31', pit_mode: 'NON_PIT_RESEARCH', strategy: 'mp-ref-fav-lay-1', bankroll: '100', mm_model: 'PERCENT_BANKROLL', mm_value: '2'};
        const data = (await backtest(query)).data;
        const b = data.report.bankroll;
        assert.ok(b.placed > 0, 'the capital run places bets');
        await fresh(page, `${base}/#/sim?${new URLSearchParams({...query, run: '1'})}`);
        await page.waitForSelector('[data-testid="sim-bankroll"]');
        assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), data.report.report_sha256);
        for (const [name, value] of [['initial', b.initial], ['final_cash', b.final_cash], ['available', b.available], ['realized_pnl', b.realized_pnl],
          ['return_on_bankroll', b.return_on_bankroll], ['max_drawdown', b.max_drawdown], ['placed', b.placed], ['reduced', b.reduced], ['skipped', data.totals.skipped_by_money_management]]) {
          assert.equal(await page.textContent(`[data-testid="sim-bankroll"] [data-field="${name}"]`), shown(value), name);
        }
        assert.equal(await page.inputValue('select[name="strategy"]'), 'mp-ref-fav-lay-1');
      });
      await step('troncamento: la pagina dice quante partite ha simulato', async () => {
        const data = (await backtest({from: '2024-08-01', to: '2024-08-31', max_events: '3'})).data;
        assert.equal(data.reader.truncated, true);
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-31&max_events=3`);
        await page.waitForSelector('[data-testid="sim-truncated"]');
        assert.match(await page.textContent('[data-testid="sim-truncated"]'), /^Simulate solo le prime 3 partite/);
      });
      await step('periodo rifiutato dal server: i campi sono nominati in italiano', async () => {
        await fresh(page, `${base}/#/sim`);
        await page.waitForSelector('[data-testid="sim-form"]');
        await page.fill('input[name="from"]', '2024-08-31');
        await page.fill('input[name="to"]', '2024-08-01');
        await submit();
        await asserted(['CTL-SIM-FROM', 'CTL-SIM-TO', 'CTL-SIM-SUBMIT'], 'a reversed period is refused by the server and the field is named in Italian', async () => {
          await page.waitForSelector('[data-testid="sim-invalid"]');
          assert.match(await page.textContent('[data-testid="sim-invalid"]'), /^Valore non valido in: .*\bAl\b.*Correggi il campo e riprova\.$/);
        });
      });
      await step('gestione del capitale rifiutata: è nominato il suo valore, non la puntata', async () => {
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-31&bankroll=100&mm_model=FIXED_STAKE&mm_value=0`);
        await page.waitForSelector('[data-testid="sim-invalid"]');
        assert.equal(await page.getAttribute('[data-testid="sim-invalid"]', 'data-fields'), 'mm_value');
        assert.match(await page.textContent('[data-testid="sim-invalid"]'), /^Valore non valido in: Valore della gestione\./);
      });
      await step('gestione senza capitale e puntata non valida: sono nominati i loro campi', async () => {
        for (const [query, fields, text] of [['bankroll=&mm_model=FIXED_STAKE&mm_value=1', 'bankroll', 'Capitale iniziale'], ['stake=0', 'stake', 'Puntata']]) {
          await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-31&${query}`);
          await page.waitForSelector('[data-testid="sim-invalid"]');
          assert.equal(await page.getAttribute('[data-testid="sim-invalid"]', 'data-fields'), fields, query);
          assert.match(await page.textContent('[data-testid="sim-invalid"]'), new RegExp(`^Valore non valido in: ${text}\\.`), query);
        }
      });
      await step('un’altra simulazione in corso: avviso, non errore', async () => {
        await page.route('**/api/v1/hist/backtest?*', route => route.fulfill({status: 429, contentType: 'application/json',
          body: JSON.stringify({api_version: 'v1', error: {code: 'BUSY', message: 'another backtest is running'}})}));
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-02`);
        await page.waitForSelector('[data-testid="sim-busy"]');
        assert.ok(await page.locator('[data-testid="sim-form"]').isVisible(), 'the form stays');
        assert.equal(await page.locator('.state.error').count(), 0, 'busy is a notice, not an error');
        await page.unroute('**/api/v1/hist/backtest?*');
      });
      await step('servizio non disponibile: stato di errore con Riprova', async () => {
        await page.route('**/api/v1/hist/backtest?*', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await fresh(page, `${base}/#/sim?run=1&from=2024-08-01&to=2024-08-02`);
        await titled(page, 'Dati non disponibili');
        await page.waitForSelector('.state.error button');
        await page.unroute('**/api/v1/hist/backtest?*');
      }, {screenshot: true});
    },
  },
  {
    id: 'compare', surface: 'Simulazione', title: 'Confronto di strategie: dalla simulazione, stessi dati, valori uguali all’API, ricerca etichettata, rifiuti',
    allowHttp: [{path: '/api/v1/hist/compare', status: 400}],
    async run({page, base, step, asserted, api, seed}) {
      const compare = query => api(`/api/v1/hist/compare?${new URLSearchParams(query)}`);
      await step('dalla simulazione: dati e strategia diventano la configurazione A', async () => {
        await fresh(page, `${base}/#/sim?from=2024-08-01&to=2024-08-31&pit_mode=NON_PIT_RESEARCH&strategy=mp-ref-fav-lay-1&stake=5`);
        await titled(page, 'Simulazione');
        await page.click('[data-testid="sim-compare-link"]');
        await asserted('CTL-SIM-COMPARE', 'the comparison opens with the data and the strategy of the simulation as configuration A', async () => {
          await titled(page, 'Confronto di strategie');
          assert.equal(await page.getAttribute('main', 'data-area'), 'user');
          assert.equal(await page.getAttribute('nav a[data-view="sim"]', 'aria-current'), 'page', 'the comparison is a section of Simulazione');
          assert.deepEqual([await page.inputValue('input[name="from"]'), await page.inputValue('select[name="pit_mode"]'), await page.inputValue('select[name="a_strategy"]'),
            await page.inputValue('input[name="a_stake"]'), await page.inputValue('select[name="c_strategy"]')], ['2024-08-01', 'NON_PIT_RESEARCH', 'mp-ref-fav-lay-1', '5', '']);
          assert.ok(!(await page.locator('[data-testid="cmp-money-c"]').isVisible()), 'an empty configuration C shows no fields');
        });
        // A personalised strategy carries its rules into configuration A (PR #231 review NB-5).
        await fresh(page, `${base}/#/sim?from=2024-08-01&to=2024-08-31&strategy=custom&selection=UNDERDOG&side=LAY&odds_max=6&team=Ajax&venue=HOME`);
        await titled(page, 'Simulazione');
        await page.click('[data-testid="sim-compare-link"]');
        await titled(page, 'Confronto di strategie');
        assert.ok(await page.locator('[data-testid="cmp-rules-a"]').isVisible());
        assert.deepEqual([await page.inputValue('select[name="a_strategy"]'), await page.inputValue('select[name="a_selection"]'), await page.inputValue('select[name="a_side"]'),
          await page.inputValue('input[name="a_odds_max"]'), await page.inputValue('input[name="a_team"]'), await page.inputValue('select[name="a_venue"]')],
          ['custom', 'UNDERDOG', 'LAY', '6', 'Ajax', 'HOME']);
      });
      await step('tre configurazioni sugli stessi dati: ogni valore è quello dell’API, nessuna classifica', async () => {
        const query = {from: '2024-08-01', to: '2024-08-31', pit_mode: 'NON_PIT_RESEARCH', commission: '0.05',
          a_strategy: 'mp-ref-fav-lay-1', b_selection: 'HOME', b_side: 'LAY', b_odds_max: '2.5', c_strategy: 'mp-ref-fav-lay-1', c_bankroll: '100', c_mm_model: 'PERCENT_BANKROLL', c_mm_value: '2'};
        const data = (await compare(query)).data;
        assert.equal(data.variants.length, 3);
        await fresh(page, `${base}/#/compare`);
        await page.waitForSelector('[data-testid="cmp-form"]');
        await page.fill('input[name="from"]', query.from);
        await page.fill('input[name="to"]', query.to);
        await page.selectOption('select[name="pit_mode"]', query.pit_mode);
        await page.fill('input[name="commission"]', query.commission);
        // A value other than the default, so that the result shows the choice took effect (review #241 B3).
        assert.equal(await page.inputValue('select[name="a_strategy"]'), 'mp-ref-fav-back-1', 'the default of configuration A');
        await page.selectOption('select[name="a_strategy"]', query.a_strategy);
        await page.selectOption('select[name="b_strategy"]', 'custom');
        assert.ok(await page.locator('[data-testid="cmp-rules-b"]').isVisible());
        await page.selectOption('select[name="b_selection"]', 'HOME');
        await page.selectOption('select[name="b_side"]', 'LAY');
        await page.fill('input[name="b_odds_max"]', '2.5');
        await page.selectOption('select[name="c_strategy"]', 'mp-ref-fav-lay-1');
        await page.fill('input[name="c_bankroll"]', '100');
        await page.selectOption('select[name="c_mm_model"]', 'PERCENT_BANKROLL');
        await page.fill('input[name="c_mm_value"]', '2');
        await page.click('[data-testid="cmp-form"] button[type="submit"]');
        await asserted(['CTL-CMP-FROM', 'CTL-CMP-TO', 'CTL-CMP-PIT-MODE', 'CTL-CMP-COMMISSION', 'CTL-CMP-A-STRATEGY', 'CTL-CMP-B-STRATEGY', 'CTL-CMP-B-SELECTION',
          'CTL-CMP-B-SIDE', 'CTL-CMP-B-ODDS-MAX', 'CTL-CMP-C-STRATEGY', 'CTL-CMP-C-BANKROLL', 'CTL-CMP-C-MM-MODEL', 'CTL-CMP-C-MM-VALUE', 'CTL-CMP-SUBMIT'],
          'three configurations give the reports of the API on the same data, value by value', async () => {
          await outcomeShown(page, '[data-testid="cmp-outcome"]');
          assert.equal(await page.getAttribute('[data-testid="cmp-outcome"]', 'data-reports'), data.variants.map(v => v.report.report_sha256).join(' '), 'the same reports as the API');
          assert.equal(await page.getAttribute('[data-testid="cmp-outcome"]', 'data-input'), data.input_sha256);
          await page.waitForSelector('[data-testid="sim-research"]');
          const cell = (key, name) => page.textContent(`[data-testid="cmp-table"] [data-field="${key}_${name}"]`);
          for (const v of data.variants) {
            const m = v.report.metrics;
            assert.equal(await cell(v.key, 'bets'), shown(v.totals.bets), `${v.key} bets`);
            assert.equal(await cell(v.key, 'no_trade'), shown(v.totals.no_trade), `${v.key} no_trade`);
            assert.equal(await cell(v.key, 'events'), shown(v.report.counts.events), `${v.key} events`);
            assert.equal(await cell(v.key, 'won'), shown(m?.won), `${v.key} won`);
            assert.equal(await cell(v.key, 'exposure'), shown(m?.exposure), `${v.key} exposure`);
            assert.equal(await cell(v.key, 'pl_net'), shown(m?.rounded.pl_net), `${v.key} pl_net`);
            assert.equal(await cell(v.key, 'roi'), shown(m?.rounded.roi), `${v.key} roi`);
            assert.equal(await cell(v.key, 'max_drawdown'), shown(m?.rounded.max_drawdown), `${v.key} max_drawdown`);
          }
          assert.equal(await cell('c', 'final_cash'), shown(data.variants[2].report.bankroll.final_cash));
          assert.equal(await cell('a', 'final_cash'), '—', 'no capital, no cash');
          assert.match(await cell('b', 'strategy'), /^Personalizzata: Banca · Casa \(1\) · quota fino a 2,5$/);
          assert.equal(await cell('a', 'strategy'), 'Favorito · Banca');
          assert.equal(data.variants[0].report.config.strategy, query.a_strategy);
        });
      });
      await step('configurazione rifiutata dal server: è nominato il suo campo', async () => {
        await fresh(page, `${base}/#/compare?run=1&from=2024-08-01&to=2024-08-31&a_strategy=mp-ref-fav-back-1&b_strategy=mp-ref-fav-lay-1&b_stake=0`);
        await page.waitForSelector('[data-testid="cmp-invalid"]');
        assert.equal(await page.getAttribute('[data-testid="cmp-invalid"]', 'data-fields'), 'b_stake');
        assert.match(await page.textContent('[data-testid="cmp-invalid"]'), /^Valore non valido in: Configurazione B · Puntata\./);
        await fresh(page, `${base}/#/compare?run=1&from=2024-08-01&to=2024-08-31&a_strategy=custom&a_selection=HOME&a_side=BACK&a_odds_min=3&a_odds_max=2&b_strategy=mp-ref-fav-lay-1`);
        await page.waitForSelector('[data-testid="cmp-invalid"]');
        assert.equal(await page.getAttribute('[data-testid="cmp-invalid"]', 'data-fields'), 'a_odds_min');
      }, {screenshot: true});
    },
  },
  {
    id: 'providers-endpoints', surface: 'Interfaccia generale', title: 'Fornitori dati e registro API',
    // Certification prose from the API that legitimately ends with "null" (phase 6 evidence).
    allowRawText: [/^null: the provider catalog does not carry a fixture total$/],
    async run({page, base, step, api}) {
      const endpoints = await api('/api/v1/endpoints');
      await step('fornitori dati', async () => {
        await page.goto(`${base}/#/providers`);
        await page.waitForSelector('[data-testid="data-health"]');
        assert.match(await page.textContent('[data-testid="fpt-certification"]'), /Ultimo backfill\s*N\/D/);
        // Every key of the provider tree reads in Italian (V-B2b, UI-60): the raw key stays in data-key and the tooltip.
        const keys = await page.locator('main dt[data-key]').evaluateAll(nodes => nodes.map(node => [node.dataset.key, node.textContent, node.classList.contains('unlabelled')]));
        assert.ok(keys.length > 50, `the provider tree has its keys: ${keys.length}`);
        assert.deepEqual(keys.filter(([, , unlabelled]) => unlabelled).map(([key]) => key), [], 'keys without an Italian label');
        assert.ok(keys.every(([key, text]) => text !== key), 'no key is shown as it is');
        assert.equal(await page.textContent('main dt[data-key="phase2"]'), 'Fase 2 · classificazione');
        assert.equal(await page.textContent('main dt[data-key="UNAVAILABLE_404"]'), 'Non pubblicati (404)');
      });
      await step('fornitori dati: le chiavi di un database reale', async () => {
        // The QA archive does not reach every branch of the server: the answer is completed in the browser with the keys the
        // server code can return (classification issues and samples, phase 1 checks, phase 5 audit, season states, sync runs,
        // alerts), so a key added there without a label fails here (PR #171 review B-2).
        const run = {run_id: 'qa', kind: 'backfill', status: 'complete', started_at: '2026-10-19T18:10:00Z', finished_at: '2026-10-19T18:15:00Z',
          catalog_entries: 1, datasets_attempted: 1, datasets_changed: 1, resumed_skips: 0, available_count: 1, unavailable_404: 0, error_real_count: 0,
          rows_seen: 1, rows_inserted: 1, fields_seen: 1, catalog_snapshot_id: 1};
        const sample = {dataset_key: 'x', classification: 'AVAILABLE', classification_reason: 'x', http_disposition: null, active: true, last_http_status: 200,
          has_snapshot: true, first_seen_at: run.started_at, last_seen_at: run.started_at, last_synced_at: run.started_at, first_success_at: run.started_at,
          last_success_at: run.started_at, last_error_at: null};
        const ISSUES = ['unclassified', 'missing_first_seen', 'missing_last_seen', 'missing_last_synced_at', 'missing_reason', 'missing_provider_path',
          'available_inactive', 'available_without_snapshot', 'available_incomplete', 'missing_first_success_at', 'missing_last_success_at',
          'available_http_status', 'available_http_disposition', 'not_initial_404', 'initial_404_has_snapshot', 'initial_404_http_status',
          'initial_404_inactive', 'missing_last_error_at', 'regression_fields_disagree', 'regression_without_snapshot', 'regression_http_status',
          'removed_still_active', 'removed_reason', 'deprecated_marked_initial_404'];
        const STATES = ['DISCOVERED', 'CANDIDATE', 'AVAILABLE', 'PARTIAL', 'COMPLETE', 'UNAVAILABLE_404', 'ERROR_REAL', 'DEPRECATED', 'REMOVED'];
        await page.route('**/api/v1/providers', async route => {
          const response = await route.fetch();
          const body = await response.json();
          const health = body.data.data_health;
          const cert = body.data.futpython_certification;
          health.lastRun = run;
          health.alerts = [{severity: 'warning', code: 'X', title: 'x', message: 'x', last_seen_at: run.started_at, occurrences: 1}];
          cert.latest_backfill = run;
          // The four shapes of check details written by src/jobs/futpython-certify-phase1.mjs.
          cert.phase1_checks = [
            {check_code: 'DEDUP_x', status: 'pass', checked_at: run.started_at,
              details: {dataset_key: 'x', rows: 1, changed: false, before: {snapshots: 1, versions: 1}, after: {snapshots: 1, versions: 1}, error: null}},
            {check_code: 'UNAVAILABLE_404_SAMPLE', status: 'pass', checked_at: run.started_at, details: {dataset_key: 'x', observed: 404}},
            {check_code: 'UNAVAILABLE_404_SAMPLE', status: 'blocked', checked_at: run.started_at, details: {reason: 'x'}},
            {check_code: 'AVAILABLE_DATASET_SAMPLE', status: 'pass', checked_at: run.started_at, details: {dataset_key: 'x', last_row_count: 1}},
            {check_code: 'MULTI_SEASON_SAMPLE', status: 'pass', checked_at: run.started_at,
              details: {country_slug: 'x', league_slug: 'x', seasons: 2, available_seasons: 2}}];
          cert.phase2.issues = Object.fromEntries(ISSUES.map(code => [code, 1]));
          cert.phase2.samples = {available: sample, initial_404: sample, regression_404: sample, error: sample, removed: sample, deprecated: sample};
          cert.phase5 = {dataset_rows: 1, league_rows: 1, season_rows: 1, period_rows: 1, team_rows: 1, normalized_rows: 1, global_fields: 1, registry_fields: 1,
            missing_global: 0, normalized_names: 1, unclassified: 0, payload_mismatches: 0, rollup_mismatches: 0, class_mismatches: 0,
            historical_team_unresolved: 0, today_country_unresolved: 0, class_counts: {dense: 1, sparse: 1, 'always-empty': 1},
            tag_counts: {'league-specific': 1, 'season-specific': 1, 'newly-introduced': 1, 'deprecated-field': 1},
            // The audit evidence written by src/providers/futpython/coverage.mjs.
            evidence: {team_census: false, team_sample_mismatches: 0, sample_teams: ['x'], sample_fields: ['x'], sample_limit: 'x', overlap_versions: 0,
              diff_sample: [{dimension: 'league', dimension_key: 'x', field_name: 'x', stored_rows: 1, recalc_rows: 1, stored_nonempty: 1, recalc_nonempty: 1}],
              empty_tokens: ['']},
            computed_at: run.started_at, gate: false};
          cert.phase6.status_counts = Object.fromEntries(STATES.map(state => [state, 1]));
          cert.phase6.evidence.pit.t0_matches_snapshot = true;
          cert.phase8 = {status: 'pass', gate: false};
          await route.fulfill({response, json: body});
        });
        await fresh(page, `${base}/#/providers`);
        await page.waitForSelector('[data-testid="fpt-certification"] dt[data-key="tag_counts"]');
        const keys = await page.locator('main dt[data-key]').evaluateAll(nodes => nodes.map(node => [node.dataset.key, node.classList.contains('unlabelled')]));
        assert.deepEqual(keys.filter(([, unlabelled]) => unlabelled).map(([key]) => key), [], 'keys of a real database without an Italian label');
        await page.unroute('**/api/v1/providers');
      });
      await step('registro API: stesse righe dell’API', async () => {
        await page.goto(`${base}/#/endpoints`);
        await page.waitForSelector('[data-testid="endpoints"] tbody tr');
        assert.equal(await page.locator('[data-testid="endpoints"] tbody tr').count(), endpoints.data.endpoints.length);
      });
    },
  },
  {
    // MP-UI-PR-003: saves of the simulation through the real persistence API, on the throwaway schema with the staged
    // persistence schema. The second server (`owner`) enforces the owner login, as writes require; the first one keeps
    // it off, as production does today, so its page offers no save. Each viewport saves its own result (a different
    // stake) and its own strategy key: the checks compare the list before and after, never an absolute count.
    id: 'sim-save', surface: 'Simulazione', title: 'Salvataggi: risultato e strategia salvati e riaperti, nessun duplicato, errori e accesso',
    allowHttp: [{path: '/api/v1/persistence/status', status: 503}, {path: '/api/v1/backtests/saved', status: 503}, {path: '/api/v1/backtests/saved', status: 401}, {path: '/auth/logout', status: 500, step: 'esci: la sessione si chiude e si torna all’accesso'},
      {path: '/api/v1/strategies', status: 403}, {path: '/api/v1/strategies', status: 404}, {path: '/api/v1/strategies', status: 500, step: 'strategie: indirizzo non valido, inesistente, archivio non attivo, dati corrotti, permesso mancante, salvataggio spento, private senza accesso'}, {path: '/api/v1/strategies', status: 503}],
    async run({page, base, step, asserted, seed, owner}) {
      const phone = page.viewportSize().width <= 560;
      const stake = phone ? '11' : '10';
      const research = {from: '2024-08-01', to: '2024-08-31', competition: seed.eredivisie.competition, pit_mode: 'NON_PIT_RESEARCH', commission: '0.05', stake};
      const custom = {from: '2024-08-01', to: '2024-08-31', pit_mode: 'NON_PIT_RESEARCH', strategy: 'custom', selection: 'HOME', side: 'LAY', odds_max: '2.5', team: 'Ajax', venue: 'HOME', stake};
      const simAt = (at, query) => fresh(page, `${at}/#/sim?run=1&${new URLSearchParams(query)}`);
      const authed = async path => {
        const response = await page.request.get(`${owner.base}${path}`);
        assert.equal(response.status(), 200, `${path}: ${response.status()}`);
        return (await response.json()).data;
      };
      const saved = async () => (await authed('/api/v1/backtests/saved')).backtests;
      const outcomeOf = async testid => {
        await page.waitForFunction(id => !['PENDING', undefined].includes(document.querySelector(`[data-testid="${id}-outcome"]`)?.dataset.status), testid);
        return page.getAttribute(`[data-testid="${testid}-outcome"]`, 'data-status');
      };
      await step('senza accesso del proprietario: nessun salvataggio offerto, archivio non attivo detto in chiaro', async () => {
        await simAt(base, research);
        await page.waitForSelector('[data-testid="sim-save-unavailable"]');
        assert.equal(await page.getAttribute('[data-testid="sim-save-unavailable"]', 'data-code'), 'WRITES_DISABLED');
        assert.match(await page.textContent('[data-testid="sim-save-unavailable"]'), /^Salvataggio non disponibile: serve l’accesso del proprietario\.$/);
        assert.equal(await page.locator('[data-testid="sim-save-result"]').count(), 0, 'no save button that cannot work');
        // As in production today, where the persistence schema is not applied.
        await page.route('**/api/v1/persistence/status', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await simAt(base, research);
        await page.waitForSelector('[data-testid="sim-save-unavailable"][data-code="UNAVAILABLE"]');
        assert.match(await page.textContent('[data-testid="sim-save-unavailable"]'), /l’archivio dei salvataggi non è ancora attivo/);
        await page.unroute('**/api/v1/persistence/status');
      });
      await step('backtest salvati dalla simulazione: l’elenco dell’API, oppure non disponibile', async () => {
        await fresh(page, `${base}/#/sim`);
        await titled(page, 'Simulazione');
        const expected = (await (await page.request.get(`${base}/api/v1/backtests/saved`)).json()).data.backtests;
        await page.click('[data-testid="sim-saved-link"]');
        await asserted('CTL-SIM-SAVED-LIST', 'the link opens the saved backtests, the same list as the API (or its empty state)', async () => {
          await titled(page, 'Backtest salvati');
          assert.equal(await page.getAttribute('nav a[data-view="sim"]', 'aria-current'), 'page', 'a section of Simulazione');
          if (expected.length) assert.deepEqual(await page.locator('[data-testid="saved-list"] tbody tr').evaluateAll(trs => trs.map(tr => Number(tr.dataset.id))), expected.map(b => b.backtest_id));
          else await page.waitForSelector('[data-testid="saved-empty"]');
        });
        await page.route('**/api/v1/backtests/saved', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await fresh(page, `${base}/#/saved`);
        await page.waitForSelector('[data-testid="saved-unavailable"]');
        assert.match(await page.textContent('[data-testid="saved-unavailable"]'), /^Non disponibile: l’archivio dei salvataggi non è ancora attivo\.$/);
        await page.unroute('**/api/v1/backtests/saved');
      });
      await step('accesso del proprietario dalla pagina di accesso', async () => {
        await page.goto(`${owner.base}/login?next=${encodeURIComponent('/#/sim')}`);
        // The password is the per-run test owner's (see withQaEnvironment): never a real credential.
        await page.fill('input[name="username"]', owner.username);
        await page.fill('input[name="password"]', owner.password);
        await page.click('button[type="submit"]');
        await asserted(['CTL-LOGIN-USERNAME', 'CTL-LOGIN-PASSWORD', 'CTL-LOGIN-SUBMIT'], 'the owner credentials open the simulation with an owner session, shown in the header', async () => {
          await titled(page, 'Simulazione');
          const session = await page.request.get(`${owner.base}/auth/session`);
          assert.equal(session.status(), 200);
          assert.equal((await session.json()).authenticated, true);
          await page.waitForSelector('[data-testid="session"]:not([hidden])');
          assert.equal(await page.textContent('[data-testid="session"] [data-field="principal"]'), 'Proprietario');
        });
      });
      await step('salva il risultato: lo stesso report dell’API, una sola richiesta anche con il doppio click', async () => {
        const before = await saved();
        await simAt(owner.base, research);
        await page.waitForSelector('[data-testid="sim-save-result"]');
        const report = await page.getAttribute('[data-testid="sim-outcome"]', 'data-report');
        const posts = [];
        const listen = request => { if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/backtests/saved') posts.push(request.postDataJSON()); };
        page.on('request', listen);
        await page.fill('input[name="name"]', `Eredivisie agosto ${stake}`);
        await page.dblclick('[data-testid="sim-save-result"] button[type="submit"]');
        await asserted(['CTL-SIM-SAVE-NAME', 'CTL-SIM-SAVE'], 'the result is saved once, with the name given and the report shown, from the request of the page', async () => {
          assert.equal(await outcomeOf('sim-save-result'), 'SAVED');
          await page.waitForLoadState('networkidle');
          assert.equal(posts.length, 1, 'a double click sends one request');
          assert.deepEqual(posts[0], {name: `Eredivisie agosto ${stake}`, kind: 'BACKTEST', params: research}, 'the page sends the request, not the result');
          const after = await saved();
          assert.equal(after.length, before.length + 1);
          const id = Number(await page.getAttribute('[data-testid="sim-save-open"]', 'data-id'));
          assert.deepEqual([after[0].backtest_id, after[0].name, after[0].kind, after[0].report_sha256], [id, `Eredivisie agosto ${stake}`, 'BACKTEST', [report]]);
        });
        page.off('request', listen);
      });
      await step('lo stesso risultato di nuovo: già salvato, poi aperto dal salvataggio', async () => {
        const before = await saved();
        const id = Number(await page.getAttribute('[data-testid="sim-save-open"]', 'data-id'));
        await page.fill('input[name="name"]', `Eredivisie agosto ${stake} bis`);
        await page.click('[data-testid="sim-save-result"] button[type="submit"]');
        await asserted('CTL-SIM-SAVE', 'the same result again is not saved twice: already saved, the same record', async () => {
          await page.waitForSelector('[data-testid="sim-save-result-outcome"][data-status="ALREADY_SAVED"]');
          assert.equal(Number(await page.getAttribute('[data-testid="sim-save-open"]', 'data-id')), id);
          assert.deepEqual((await saved()).map(b => b.backtest_id), before.map(b => b.backtest_id));
        });
        const report = await page.getAttribute('[data-testid="sim-outcome"]', 'data-report');
        await page.click('[data-testid="sim-save-open"]');
        await asserted('CTL-SIM-SAVE-OPEN', 'the saved record opens with its name and the same report, values as stored', async () => {
          await titled(page, 'Backtest salvato');
          assert.equal(Number(await page.getAttribute('[data-testid="saved-meta"]', 'data-id')), id);
          assert.equal(await page.textContent('[data-field="saved_name"]'), `Eredivisie agosto ${stake}`);
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), report);
          const stored = await authed(`/api/v1/backtests/saved?id=${id}`);
          const m = stored.result.report.metrics;
          for (const [name, value] of [['bets', m.bets], ['pl_net', m.rounded.pl_net], ['roi', m.rounded.roi], ['staked', m.staked]]) {
            assert.equal(await page.textContent(`[data-field="${name}"]`), shown(value), name);
          }
        });
      });
      await step('errore del server al salvataggio: messaggio, nessun falso successo, si può riprovare', async () => {
        const before = await saved();
        await simAt(owner.base, research);
        await page.waitForSelector('[data-testid="sim-save-result"]');
        await page.route('**/api/v1/backtests/saved', route => (route.request().method() === 'POST'
          ? route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}) : route.continue()));
        await page.fill('input[name="name"]', 'Tentativo');
        await page.click('[data-testid="sim-save-result"] button[type="submit"]');
        await asserted('CTL-SIM-SAVE', 'a refused save says so, links nothing and leaves the action usable', async () => {
          assert.equal(await outcomeOf('sim-save-result'), 'UNAVAILABLE');
          assert.match(await page.textContent('[data-testid="sim-save-result-outcome"]'), /^Salvataggio non disponibile in questo momento: riprova più tardi\.$/);
          assert.equal(await page.getAttribute('[data-testid="sim-save-result-outcome"]', 'class'), 'state error');
          assert.equal(await page.locator('[data-testid="sim-save-open"]').count(), 0);
          assert.equal(await page.isEnabled('[data-testid="sim-save-result"] button[type="submit"]'), true);
          assert.equal((await saved()).length, before.length);
        });
        await page.unroute('**/api/v1/backtests/saved');
      });
      await step('elenco dei salvati: le righe dell’API, apertura e ritorno alla simulazione', async () => {
        const expected = await saved();
        await fresh(page, `${owner.base}/#/sim`);
        await titled(page, 'Simulazione');
        await page.click('[data-testid="sim-saved-link"]');
        await asserted('CTL-SIM-SAVED-LIST', 'the list shows the saved backtests of the API, newest first, with their names', async () => {
          await page.waitForSelector('[data-testid="saved-list"]');
          const rows = await page.locator('[data-testid="saved-list"] tbody tr').evaluateAll(trs => trs.map(tr => [Number(tr.dataset.id), tr.cells[0].textContent, tr.cells[1].textContent]));
          assert.deepEqual(rows, expected.map(b => [b.backtest_id, b.name, b.kind === 'BACKTEST' ? 'Simulazione' : 'Confronto']));
        });
        await page.click(`[data-testid="saved-list"] tr[data-id="${expected[0].backtest_id}"] a`);
        await asserted('CTL-SAVED-OPEN', 'a row opens that saved backtest', async () => {
          await titled(page, 'Backtest salvato');
          assert.equal(Number(await page.getAttribute('[data-testid="saved-meta"]', 'data-id')), expected[0].backtest_id);
          assert.equal(await page.getAttribute('[data-testid="sim-outcome"]', 'data-report'), expected[0].report_sha256[0]);
        });
        await page.click('main a[href="#/sim"]');
        await asserted('CTL-SAVED-BACK-SIM', 'the link brings back to the simulation form', async () => {
          await titled(page, 'Simulazione');
          await page.waitForSelector('[data-testid="sim-form"]');
        });
      });
      await step('strategia personalizzata salvata con le regole simulate, poi di nuovo: nessuna nuova versione', async () => {
        const key = `qa-ajax-${phone ? 'telefono' : 'desktop'}`;
        await simAt(owner.base, custom);
        await page.waitForSelector('[data-testid="sim-save-strategy"]');
        const simulated = await page.getAttribute('[data-testid="sim-strategy"]', 'data-strategy');
        assert.match(simulated, /^def:[0-9a-f]{16}$/);
        await page.fill('[data-testid="sim-save-strategy"] input[name="name"]', 'Ajax in casa, banca');
        await page.fill('[data-testid="sim-save-strategy"] input[name="key"]', key);
        await page.click('[data-testid="sim-save-strategy"] button[type="submit"]');
        await asserted(['CTL-SIM-SAVE-STRATEGY-NAME', 'CTL-SIM-SAVE-STRATEGY-KEY', 'CTL-SIM-SAVE-STRATEGY'], 'the strategy is saved as version 1 with the definition the backtest simulated', async () => {
          assert.equal(await outcomeOf('sim-save-strategy'), 'SAVED');
          assert.equal(await page.getAttribute('[data-testid="sim-save-strategy-outcome"] [data-strategy]', 'data-strategy'), simulated);
          const stored = (await authed(`/api/v1/strategies?key=${key}`)).strategy;
          assert.deepEqual([stored.version, stored.strategy_id, stored.name], [1, simulated, 'Ajax in casa, banca']);
          assert.deepEqual(stored.definition.conditions, {odds_max: '2.5', teams: ['Ajax'], venue: 'HOME'});
        });
        await page.click('[data-testid="sim-save-strategy"] button[type="submit"]');
        await asserted('CTL-SIM-SAVE-STRATEGY', 'the same rules and name again change nothing: unchanged, still version 1', async () => {
          await page.waitForSelector('[data-testid="sim-save-strategy-outcome"][data-status="UNCHANGED"]');
          assert.equal(await page.textContent('[data-testid="sim-save-strategy-outcome"] [data-strategy]'), 'Strategia già salvata con queste regole (versione 1).');
          assert.match(await page.getAttribute('[data-testid="sim-strategy-open"]', 'href'), new RegExp(`^#/strategies\\?key=${key}$`));
          assert.equal((await authed(`/api/v1/strategies?key=${key}`)).strategy.version, 1);
        });
      });
      // MP-UI-PR-006 (#34): the saved strategies — detail in words, versions, the way back to the Simulazione, a clone.
      const stratKey = `qa-ajax-${phone ? 'telefono' : 'desktop'}`;
      const rulesShown = async () => ({selection: (await page.textContent('[data-testid="strategy-rules"] [data-field="selection"]')).trim(),
        side: (await page.textContent('[data-testid="strategy-rules"] [data-field="side"]')).trim(),
        odds: (await page.textContent('[data-testid="strategy-rules"] [data-field="odds_range"]')).trim(),
        teams: (await page.textContent('[data-testid="strategy-rules"] [data-field="teams"]')).trim(),
        venue: (await page.textContent('[data-testid="strategy-rules"] [data-field="venue"]')).trim()});
      const AJAX_SHOWN = {selection: 'Casa (1)', side: 'Banca', odds: 'fino a 2,5', teams: 'Ajax', venue: 'Solo in casa'};
      await step('strategie: la strategia salvata si apre, regole in parole e versioni', async () => {
        await page.click('[data-testid="sim-strategy-open"]');
        await asserted('CTL-SIM-SAVE-STRATEGY-OPEN', 'the saved strategy opens: name, code, version and rules of the API, in words', async () => {
          await titled(page, 'Ajax in casa, banca');
          const api = await authed(`/api/v1/strategies?key=${stratKey}`);
          assert.equal(await page.getAttribute('[data-testid="strategy-meta"]', 'data-strategy'), api.strategy.strategy_id);
          assert.equal(await page.getAttribute('[data-testid="strategy-meta"]', 'data-version'), String(api.strategy.version));
          assert.deepEqual(await rulesShown(), AJAX_SHOWN);
          assert.deepEqual(await page.locator('[data-testid="strategy-versions"] tbody tr').evaluateAll(trs => trs.map(tr => Number(tr.dataset.version))), api.versions.map(v => v.version));
          assert.equal(await page.getAttribute('nav a[data-view="sim"]', 'aria-current'), 'page', 'a section of Simulazione');
        });
      });
      await step('strategie: una nuova versione, la precedente resta e si apre', async () => {
        const before = await authed(`/api/v1/strategies?key=${stratKey}`);
        const next = await page.request.post(`${owner.base}/api/v1/strategies`, {headers: {origin: owner.base, 'content-type': 'application/json'},
          data: {key: stratKey, name: 'Ajax in casa, banca (rivista)', rules: before.rules}});
        assert.equal(next.status(), 201, 'a new name is a new version');
        await fresh(page, `${owner.base}/#/strategies?key=${stratKey}`);
        await titled(page, 'Ajax in casa, banca (rivista)');
        assert.equal(await page.getAttribute('[data-testid="strategy-meta"]', 'data-version'), '2');
        await page.click('[data-testid="strategy-versions"] tr[data-version="1"] a');
        await asserted('CTL-STRAT-VERSION', 'an earlier version opens as it was: its name, its number, superseded, the same rules', async () => {
          await titled(page, 'Ajax in casa, banca');
          assert.equal(await page.getAttribute('[data-testid="strategy-meta"]', 'data-version'), '1');
          await page.waitForSelector('[data-testid="strategy-superseded"]');
          assert.equal(await page.getAttribute('[data-testid="strategy-versions"] tr[data-version="1"]', 'aria-current'), 'true');
          assert.deepEqual(await rulesShown(), AJAX_SHOWN);
        });
      });
      await step('strategie: apri in simulazione con le stesse regole', async () => {
        const rules = (await authed(`/api/v1/strategies?key=${stratKey}`)).rules;
        await page.click('[data-testid="strategy-simulate"]');
        await asserted('CTL-STRAT-SIMULATE', 'the Simulazione opens on the rules of the strategy, as the server gives them', async () => {
          await titled(page, 'Simulazione');
          await page.waitForSelector('[data-testid="sim-form"] select[name="competition"]');
          assert.equal(await page.inputValue('select[name="strategy"]'), 'custom');
          for (const name of ['selection', 'side', 'venue']) assert.equal(await page.inputValue(`select[name="${name}"]`), rules[name], name);
          for (const name of ['odds_max', 'team']) assert.equal(await page.inputValue(`input[name="${name}"]`), rules[name], name);
          assert.ok(await page.locator('[data-testid="sim-rules"]').isVisible(), 'the rules of a personalised strategy are shown');
        });
      });
      await step('strategie: la versione 1 clonata come nuova versione diventa corrente; di nuovo, nulla cambia', async () => {
        const first = await authed(`/api/v1/strategies?key=${stratKey}&version=1`);
        const before = await authed(`/api/v1/strategies?key=${stratKey}`);
        await fresh(page, `${owner.base}/#/strategies?key=${stratKey}`);
        await page.waitForSelector('[data-testid="strategy-versions"]');
        assert.equal(await page.locator('[data-testid="strategy-clone"]').count(), 0, 'the current version is not cloned onto itself');
        await fresh(page, `${owner.base}/#/strategies?key=${stratKey}&version=1`);
        await page.waitForSelector('[data-testid="strategy-clone-form"]');
        assert.equal(await page.inputValue('[data-testid="strategy-clone-form"] input[name="name"]'), first.strategy.name, 'the name of the cloned version is proposed');
        await page.fill('[data-testid="strategy-clone-form"] input[name="name"]', first.strategy.name);
        await page.click('[data-testid="strategy-clone-form"] button[type="submit"]');
        await asserted(['CTL-STRAT-CLONE-NAME', 'CTL-STRAT-CLONE'], 'version 1 becomes the next version of the same strategy: its definition and name, the history kept', async () => {
          assert.equal(await outcomeOf('strategy-clone-form'), 'SAVED');
          const after = await authed(`/api/v1/strategies?key=${stratKey}`);
          assert.deepEqual([after.strategy.version, after.strategy.strategy_id, after.strategy.name], [before.strategy.version + 1, first.strategy.strategy_id, first.strategy.name]);
          assert.deepEqual(after.rules, first.rules);
          assert.deepEqual(after.versions.map(v => v.version), [...before.versions.map(v => v.version), before.strategy.version + 1]);
          assert.equal(await page.textContent('[data-testid="strategy-clone-form-outcome"]'), `Versione ${after.strategy.version} creata con le regole della versione 1: è la versione corrente. Apri la versione corrente`);
        });
        await page.click('[data-testid="strategy-clone-open"]');
        await asserted('CTL-STRAT-CLONE-OPEN', 'the link opens the current version, the clone', async () => {
          await page.waitForSelector(`[data-testid="strategy-meta"][data-version="${before.strategy.version + 1}"]`);
          assert.deepEqual(await rulesShown(), AJAX_SHOWN);
        });
        await fresh(page, `${owner.base}/#/strategies?key=${stratKey}&version=1`);
        await page.waitForSelector('[data-testid="strategy-clone-form"]');
        await page.click('[data-testid="strategy-clone-form"] button[type="submit"]');
        await asserted('CTL-STRAT-CLONE', 'cloning again the rules and name the current version already has changes nothing, and says so', async () => {
          assert.equal(await outcomeOf('strategy-clone-form'), 'UNCHANGED');
          assert.match(await page.textContent('[data-testid="strategy-clone-form-outcome"]'), /^La versione corrente ha già queste regole e questo nome \(versione \d+\)\./);
          assert.equal((await authed(`/api/v1/strategies?key=${stratKey}`)).strategy.version, before.strategy.version + 1);
        });
      });
      await step('strategie: modifica dalla simulazione, salvata con lo stesso codice come versione successiva', async () => {
        const before = await authed(`/api/v1/strategies?key=${stratKey}`);
        await fresh(page, `${owner.base}/#/strategies?key=${stratKey}`);
        await page.click('[data-testid="strategy-simulate"]');
        await page.waitForSelector('[data-testid="sim-form"] select[name="competition"]');
        await page.fill('[data-testid="sim-form"] input[name="from"]', custom.from);
        await page.fill('[data-testid="sim-form"] input[name="to"]', custom.to);
        await page.selectOption('[data-testid="sim-form"] select[name="pit_mode"]', custom.pit_mode);
        await page.fill('[data-testid="sim-form"] input[name="odds_max"]', '2.4');
        await page.click('[data-testid="sim-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="sim-save-strategy"]');
        await asserted('CTL-STRAT-SIMULATE', 'opened from the current version, the save form keeps the code and the name of the strategy', async () => {
          assert.equal(await page.inputValue('[data-testid="sim-save-strategy"] input[name="key"]'), stratKey);
          assert.equal(await page.inputValue('[data-testid="sim-save-strategy"] input[name="name"]'), before.strategy.name);
        });
        await page.click('[data-testid="sim-save-strategy"] button[type="submit"]');
        await asserted('CTL-SIM-SAVE-STRATEGY', 'the changed rules, saved with the pre-filled code and name, are the next version of the same strategy; the earlier one stays in the history', async () => {
          assert.equal(await outcomeOf('sim-save-strategy'), 'SAVED');
          const after = await authed(`/api/v1/strategies?key=${stratKey}`);
          assert.equal(after.strategy.version, before.strategy.version + 1);
          assert.equal(after.rules.odds_max, '2.4');
          assert.equal((await authed(`/api/v1/strategies?key=${stratKey}&version=${before.strategy.version}`)).rules.odds_max, before.rules.odds_max);
        });
      });
      await step('strategie: elenco dalla simulazione, apertura e ritorno', async () => {
        await fresh(page, `${owner.base}/#/sim`);
        await titled(page, 'Simulazione');
        await page.click('[data-testid="sim-strategies-link"]');
        await asserted('CTL-SIM-STRATEGIES', 'the link opens the saved strategies, the same list as the API', async () => {
          await titled(page, 'Strategie');
          const api = (await authed('/api/v1/strategies')).strategies;
          assert.deepEqual(await page.locator('[data-testid="strategies-list"] tbody tr').evaluateAll(trs => trs.map(tr => tr.dataset.key)), api.map(s => s.key));
          assert.equal((await page.textContent(`[data-testid="strategies-list"] tr[data-key="${stratKey}"] [data-field="version"]`)).trim(), String(api.find(s => s.key === stratKey).version));
        });
        await page.click(`[data-testid="strategies-list"] tr[data-key="${stratKey}"] a`);
        await asserted('CTL-STRAT-OPEN', 'a row opens its strategy at its current version (the one modified from the Simulazione)', async () => {
          await page.waitForSelector(`[data-testid="strategy-meta"][data-key="${stratKey}"]`);
          assert.deepEqual(await rulesShown(), {...AJAX_SHOWN, odds: 'fino a 2,4'});
        });
        await page.click('[data-control="CTL-STRAT-BACK-LIST"]');
        await asserted('CTL-STRAT-BACK-LIST', 'back to the list of strategies', async () => {
          await titled(page, 'Strategie');
          await page.waitForSelector('[data-testid="strategies-list"]');
        });
        await page.click('[data-control="CTL-STRAT-BACK-SIM"]');
        await asserted('CTL-STRAT-BACK-SIM', 'back to the Simulazione', async () => {
          await titled(page, 'Simulazione');
        });
      });
      await step('strategie: indirizzo non valido, inesistente, archivio non attivo, dati corrotti, permesso mancante, salvataggio spento, private senza accesso', async () => {
        await fresh(page, `${owner.base}/#/strategies?key=Bad%20Key`);
        await page.waitForSelector('[data-testid="strategy-invalid"]');
        await fresh(page, `${owner.base}/#/strategies?key=qa-missing`);
        await page.waitForSelector('[data-testid="strategy-error"][data-code="NOT_FOUND"]');
        assert.equal(await page.textContent('[data-testid="strategy-error"]'), 'Questa strategia, o questa versione, non esiste.');
        await page.route('**/api/v1/strategies', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await fresh(page, `${owner.base}/#/strategies`);
        await page.waitForSelector('[data-testid="strategies-unavailable"][data-code="UNAVAILABLE"]');
        assert.match(await page.textContent('[data-testid="strategies-unavailable"]'), /^Non disponibile: l’archivio delle strategie non è ancora attivo\.$/);
        assert.equal(await page.locator('[data-testid="strategies-list"]').count(), 0, 'no list is invented');
        await page.unroute('**/api/v1/strategies');
        // A stored strategy that fails its integrity check, and an account without the read permission: the page
        // speaks of reading, not of saving, and shows nothing of the strategy (review #251 NB-1).
        for (const [status, code, text] of [[500, 'DATA_CORRUPT', 'Dati della strategia non validi: non vengono mostrati.'],
          [403, 'FORBIDDEN', 'Questo account non può consultare le strategie.']]) {
          await page.route('**/api/v1/strategies?*', route => route.fulfill({status, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', error: {code, message: code}})}));
          await fresh(page, `${owner.base}/#/strategies?key=${stratKey}`);
          await page.waitForSelector(`[data-testid="strategy-error"][data-code="${code}"]`);
          assert.equal(await page.textContent('[data-testid="strategy-error"]'), text);
          assert.equal(await page.locator('[data-testid="strategy-rules"]').count(), 0, 'nothing of the strategy is shown');
          await page.unroute('**/api/v1/strategies?*');
        }
        // A version the request cannot express (two teams): shown in words, but neither opened in the Simulazione nor
        // cloned, and the page says why (review #251 NB-3).
        const twoTeams = {strategy_key: 'qa-derby', key: 'qa-derby', version: 1, strategy_id: 'def:00000000000000bb', name: 'Derby', created_at: '2026-10-01T10:00:00.000Z',
          superseded_at: '2026-10-02T10:00:00.000Z', definition: {selection: 'HOME', side: 'BACK', conditions: {teams: ['Ajax', 'PSV']}}};
        const derby = {strategy: twoTeams, rules: null, versions: [{version: 1, strategy_id: twoTeams.strategy_id, name: 'Derby', created_at: twoTeams.created_at, superseded_at: twoTeams.superseded_at},
          {version: 2, strategy_id: 'def:00000000000000cc', name: 'Derby', created_at: twoTeams.superseded_at, superseded_at: null}]};
        await page.route('**/api/v1/strategies?*', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', data: derby})}));
        // Saving is declared possible, so the only reason left not to clone is the rules themselves (not the archive's state).
        await page.route('**/api/v1/persistence/status', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', data: {available: true, writes_enabled: true, reads_enabled: true, writes: 'owner session'}})}));
        await fresh(page, `${owner.base}/#/strategies?key=qa-derby&version=1`);
        await page.waitForSelector('[data-testid="strategy-no-request"]');
        assert.equal(await page.textContent('[data-testid="strategy-no-request"]'), 'Queste regole non si possono aprire in Simulazione: la simulazione accetta una sola squadra.');
        assert.equal(await page.getAttribute('[data-testid="strategy-clone-unavailable"]', 'data-code'), 'NOT_A_REQUEST');
        assert.deepEqual([await page.locator('[data-testid="strategy-simulate"]').count(), await page.locator('[data-testid="strategy-clone-form"]').count()], [0, 0]);
        await page.unroute('**/api/v1/persistence/status');
        await page.unroute('**/api/v1/strategies?*');
        // A version whose rules can be cloned, while saving is off: the state says so, no button that cannot work (rule 13).
        await page.route('**/api/v1/persistence/status', route => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({api_version: 'v1', data: {available: true, writes_enabled: false, reads_enabled: true, writes: 'disabled'}})}));
        await fresh(page, `${owner.base}/#/strategies?key=${stratKey}&version=1`);
        await page.waitForSelector('[data-testid="strategy-clone-unavailable"]');
        assert.equal(await page.locator('[data-testid="strategy-clone-form"]').count(), 0);
        await page.unroute('**/api/v1/persistence/status');
        // The Simulazione links the saved strategies only where they open (MP-REQ-UI-0290): not without the owner login,
        // not with the archive down; the rest of the page is unchanged.
        await fresh(page, `${base}/#/sim`);
        await page.waitForSelector('[data-testid="sim-compare-link"]');
        assert.equal(await page.locator('[data-testid="sim-strategies-link"]').count(), 0, 'no link to strategies that cannot be read');
        await page.route('**/api/v1/persistence/status', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await fresh(page, `${owner.base}/#/sim`);
        await page.waitForSelector('[data-testid="sim-compare-link"]');
        assert.equal(await page.locator('[data-testid="sim-strategies-link"]').count(), 0, 'no link while the archive is down');
        await page.unroute('**/api/v1/persistence/status');
        // Without the owner login the saved strategies are private: the server refuses to read them and the page says so.
        await fresh(page, `${base}/#/strategies`);
        await page.waitForSelector('[data-testid="strategies-unavailable"][data-code="READS_REQUIRE_AUTH"]');
        assert.equal(await page.textContent('[data-testid="strategies-unavailable"]'), 'Le strategie salvate sono private: si consultano solo con l’accesso del proprietario attivo.');
        await fresh(page, `${base}/#/strategies?key=${stratKey}`);
        await page.waitForSelector('[data-testid="strategy-error"][data-code="READS_REQUIRE_AUTH"]');
        assert.equal(await page.locator('[data-testid="strategy-rules"]').count(), 0, 'nothing of the strategy is shown');
      });
      await step('sessione chiusa: la scrittura è rifiutata e detta, nulla viene salvato', async () => {
        const before = await saved();
        await simAt(owner.base, {...research, commission: '0.02'});
        await page.waitForSelector('[data-testid="sim-save-result"]');
        const out = await page.request.post(`${owner.base}/auth/logout`, {headers: {origin: owner.base}});
        assert.equal(out.status(), 204);
        await page.fill('input[name="name"]', 'Dopo l’uscita');
        await page.click('[data-testid="sim-save-result"] button[type="submit"]');
        await asserted('CTL-SIM-SAVE', 'without a session the save is refused and the page says the access expired', async () => {
          assert.equal(await outcomeOf('sim-save-result'), 'UNAUTHENTICATED');
          assert.match(await page.textContent('[data-testid="sim-save-result-outcome"]'), /^Accesso scaduto: accedi di nuovo e riprova\. Vai all’accesso$/);
        });
        const back = await page.url();
        await page.click('[data-testid="save-login"]');
        await asserted('CTL-SIM-SAVE-LOGIN', 'the link opens the login page with the way back to this simulation', async () => {
          await page.waitForSelector('form[action="/auth/login"] input[name="username"]');
          const next = await page.getAttribute('input[name="next"]', 'value');
          assert.equal(`${owner.base}${next}`, back);
        });
        // Back in with a new owner session: the page returns to the simulation, nothing was saved.
        await page.fill('input[name="username"]', owner.username);
        await page.fill('input[name="password"]', owner.password);
        await page.click('button[type="submit"]');
        await titled(page, 'Simulazione');
        assert.equal(page.url(), back);
        assert.equal((await saved()).length, before.length);
      });
      await step('esci: la sessione si chiude e si torna all’accesso', async () => {
        await fresh(page, `${owner.base}/#/sim`);
        await page.waitForSelector('[data-testid="session"]:not([hidden])');
        // A failed logout is said next to the role, which stays; the session and the page stay too.
        await page.route('**/auth/logout', route => route.fulfill({status: 500, contentType: 'application/json', body: '{"error":{"code":"INTERNAL"}}'}));
        const here = page.url();
        await page.click('[data-testid="logout"]');
        await asserted('CTL-NAV-LOGOUT', 'a failed logout is reported, the role and the session stay', async () => {
          await page.waitForSelector('[data-testid="logout-status"]:has-text("Uscita non riuscita")');
          assert.equal(await page.textContent('[data-testid="session"] [data-field="principal"]'), 'Proprietario');
          assert.equal(await page.isEnabled('[data-testid="logout"]'), true, 'the button can be used again');
          assert.equal(page.url(), here);
          assert.equal((await page.request.get(`${owner.base}/auth/session`)).status(), 200, 'the session is still open');
        });
        await page.unroute('**/auth/logout');
        await page.click('[data-testid="logout"]');
        await page.waitForURL(url => new URL(url).pathname === '/login'); // the page leaves for the login: assert on it
        await asserted('CTL-NAV-LOGOUT', '«Esci» closes the session on the server and opens the login page', async () => {
          await page.waitForSelector('form[action="/auth/login"] input[name="username"]');
          assert.equal((await page.request.get(`${owner.base}/auth/session`)).status(), 401, 'the session is closed');
          assert.equal((await page.request.get(`${owner.base}/api/v1/backtests/saved`)).status(), 401, 'no read without a session');
        });
        // Back in (the per-run test owner), so the step ends on the application.
        await page.fill('input[name="username"]', owner.username);
        await page.fill('input[name="password"]', owner.password);
        await page.click('button[type="submit"]');
        await titled(page, 'Oggi');
      });
    },
  },
  {
    // MP-UI-PR-005 (#94): the Trading Tools. Every value shown is the server's display value for exactly what was typed;
    // every refusal names the field; a failing or unreachable server is said; the API needs the owner session when the
    // login is enforced. Each tool's step types every field, so a field that the page ignored would change the request
    // and the answer.
    id: 'trading-tools', surface: 'Strumenti', title: 'Calcolatori di #94: valori uguali all’API, campi rifiutati, azzera, errori del server, accesso',
    allowHttp: TOOL_SPECS.map(([tool]) => ({path: `/api/v1/tools/${tool}`, status: 400})).concat([{path: '/api/v1/tools/ev', status: 503}]),
    allowNetwork: [{path: '/api/v1/tools/ev', error: 'net::ERR_INTERNET_DISCONNECTED'}],
    async run({page, base, step, asserted, api, owner}) {
      const result = '[data-testid="tool-result"]';
      const field = name => page.textContent(`${result} [data-field="${name}"]`);
      await step('strumenti: inserimento manuale dichiarato, schede, nessun calcolo senza Calcola', async () => {
        await fresh(page, `${base}/#/tools`);
        await titled(page, 'Strumenti');
        assert.equal(await page.getAttribute('main', 'data-area'), 'user');
        assert.match(await page.textContent('[data-testid="tools-manual"]'), /^INSERIMENTO MANUALE — /, '#94: manual input is labelled');
        assert.match(await page.textContent('[data-testid="tools-soon"]'), /^Non ancora disponibili: .*Progressioni/, 'what is not built is said, not offered');
        assert.equal(await page.locator(result).count(), 0);
        assert.equal(await page.getAttribute('[data-testid="tool-form"]', 'data-tool'), 'odds', 'the first tool by default');
        // From the last tab back to the first, so that every click changes the tool.
        for (const [tool, label] of [...TOOL_SPECS].reverse()) {
          const tab = page.locator(`[data-testid="tool-tabs"] a[data-control="CTL-TOOLS-TAB-${tool.toUpperCase()}"]`);
          assert.equal((await tab.textContent()).trim(), label);
          await tab.click();
          await asserted(`CTL-TOOLS-TAB-${tool.toUpperCase()}`, `the tab opens the form of ${tool}, marked current, with no result`, async () => {
            await page.waitForSelector(`[data-testid="tool-form"][data-tool="${tool}"]`);
            assert.equal(await tab.getAttribute('aria-current'), 'page');
            assert.equal(await page.locator('[data-testid="tool-tabs"] a[aria-current="page"]').count(), 1);
            assert.equal(await page.locator(result).count(), 0);
          });
        }
      });
      for (const [tool, , fields, checks, bad] of TOOL_SPECS) {
        await step(`${tool}: il risultato è quello del server, un campo errato è indicato, Azzera svuota`, async () => {
          const id = name => `CTL-TOOLS-${tool.toUpperCase()}-${name.toUpperCase().replace(/_/g, '-')}`;
          await fresh(page, `${base}/#/tools?tool=${tool}`);
          await page.waitForSelector(`[data-testid="tool-form"][data-tool="${tool}"]`);
          for (const [name, value] of Object.entries(fields)) {
            if (await page.locator(`[data-testid="tool-form"] select[name="${name}"]`).count()) await page.selectOption(`select[name="${name}"]`, value);
            else await page.fill(`[data-testid="tool-form"] input[name="${name}"]`, value);
          }
          await page.click('[data-testid="tool-form"] button[type="submit"]');
          await outcomeShown(page, result);
          const body = await api(`/api/v1/tools/${tool}?${new URLSearchParams(fields)}`);
          await asserted([...Object.keys(fields).map(id), id('submit')], `every field of ${tool} reaches the server and the page shows its answer`, async () => {
            const sent = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
            for (const [name, value] of Object.entries(fields)) assert.equal(sent.get(name), value, `${name} is in the request`);
            assert.equal(await page.getAttribute(result, 'data-tool'), tool);
            assert.equal(await page.getAttribute(result, 'data-warnings'), body.data.warnings.join(' '));
            assert.equal(await page.getAttribute(result, 'data-formula'), `${body.data.formula} ${body.data.formula_version}`);
            for (const [name, value] of checks(body.data.display)) assert.equal((await field(name)).trim(), value, `${tool} ${name}`);
          });
          // One field made invalid: the server refuses it and the page names that field.
          const [badName, badValue, badLabel] = bad;
          await page.fill(`[data-testid="tool-form"] input[name="${badName}"]`, badValue);
          await page.click('[data-testid="tool-form"] button[type="submit"]');
          await outcomeShown(page, '[data-testid="tool-invalid"]');
          await asserted([id(badName), id('submit')], `an invalid ${badName} is refused by the server and named on the page`, async () => {
            assert.equal(await page.getAttribute('[data-testid="tool-invalid"]', 'data-fields'), badName);
            assert.equal(await page.textContent('[data-testid="tool-invalid"]'), `Valore non valido in: ${badLabel}. Correggi il campo e riprova.`);
            assert.equal(await page.getAttribute(`[data-testid="tool-form"] [name="${badName}"]`, 'aria-invalid'), 'true');
            assert.equal(await page.locator(result).count(), 0, 'no result next to a refusal');
          });
          await page.click(`[data-control="${id('reset')}"]`);
          await asserted(id('reset'), `Azzera empties the form of ${tool} and removes the outcome`, async () => {
            await page.waitForFunction(() => !location.hash.includes('run=1') && document.querySelector('[data-testid="tool-form"]') && !document.querySelector('[data-testid="tool-invalid"]'));
            for (const name of Object.keys(fields)) {
              if (await page.locator(`[data-testid="tool-form"] input[name="${name}"]`).count()) assert.equal(await page.inputValue(`input[name="${name}"]`), '', `${name} is empty`);
            }
            assert.equal(await page.getAttribute('[data-testid="tool-form"]', 'data-tool'), tool, 'the same tool stays open');
          });
        });
      }
      await step('indirizzo diretto e ricarica: lo stesso calcolo senza ridigitare', async () => {
        const query = {tool: 'liability', stake: '25', odds: '4,2', commission: '2', run: '1'};
        await fresh(page, `${base}/#/tools?${new URLSearchParams(query)}`);
        await page.waitForSelector(result);
        const display = (await api('/api/v1/tools/liability?stake=25&odds=4,2&commission=2')).data.display;
        assert.equal((await field('liability')).trim(), shown(display.liability));
        await page.reload();
        await page.waitForSelector(result);
        assert.equal((await field('liability')).trim(), shown(display.liability), 'the address carries the calculation');
        assert.equal(await page.inputValue('input[name="odds"]'), '4,2', 'the form shows what was typed');
      });
      await step('server in errore o irraggiungibile: detto, con Riprova', async () => {
        await page.route('**/api/v1/tools/ev?*', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await fresh(page, `${base}/#/tools?tool=ev&stake=10&odds=2&probability=55&run=1`);
        await page.waitForSelector('.state.error[data-code="UNAVAILABLE"]');
        assert.equal(await page.locator(result).count(), 0, 'no result is invented');
        await page.unroute('**/api/v1/tools/ev?*');
        await page.click('button[data-control="CTL-COMMON-RETRY"]');
        await asserted('CTL-COMMON-RETRY', 'Riprova asks the server again and shows its answer', async () => {
          await page.waitForSelector(result);
          const display = (await api('/api/v1/tools/ev?stake=10&odds=2&probability=55')).data.display;
          assert.equal((await field('expected_value')).trim(), shown(display.expected_value));
        });
        await page.route('**/api/v1/tools/ev?*', route => route.abort('internetdisconnected'));
        await fresh(page, `${base}/#/tools?tool=ev&stake=10&odds=2&probability=55&run=1`);
        await page.waitForSelector('.state.error[data-code="NETWORK"]');
        assert.match(await page.textContent('.state.error'), /Connessione non disponibile/);
        await page.unroute('**/api/v1/tools/ev?*');
      });
      await step('accesso: con il login del proprietario gli strumenti richiedono la sessione', async () => {
        const anonymous = await page.context().browser().newContext();
        try {
          const refused = await anonymous.request.get(`${owner.base}/api/v1/tools/odds?odds=2%203`);
          assert.equal(refused.status(), 401, 'no calculation without the owner session');
        } finally { await anonymous.close(); }
        assert.equal((await page.request.get(`${base}/api/v1/tools/odds?odds=2%203`)).status(), 200, 'with the login off (production today) the tools answer');
      });
    },
  },
];

export const REQUIRED_JOURNEYS = JOURNEYS.map(journey => journey.id);
export const REQUIRED_VIEWPORTS = Object.keys(VIEWPORTS);
