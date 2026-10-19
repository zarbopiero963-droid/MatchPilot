// Browser QA Gate (MP-OWNER-BROWSER-QA-HARD-GATE-01): the required user journeys. Each journey runs in a real
// Chromium on the real server and the QA archive (test/helpers/fpt-seed.mjs seedQaArchive), on every required viewport.
// A journey asserts what the user sees against the API; the runner adds the generic invariants after every step
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
export const outcomeShownFor = row => RESULT[row.result_status] ?? (row.home_score == null || row.away_score == null ? 'N/D' : `${row.home_score}–${row.away_score}`);

const SIDE = {HOME: 'Casa', AWAY: 'Ospite', EVEN: 'Pari'};

// [view, menu label, page title, area]: the menu label is what the user reads before clicking (QA-03: it was not checked);
// the area decides whether the no-technical-text rule applies (MP-WEB-015). Every view declares one (V-B2): the home page
// Oggi (D-2) and the search are user views; «Dati» holds the technical views, reached through its tabs (DATA_TABS).
const NAV = [['', 'Oggi', 'Oggi', 'user'], ['search', 'Ricerca', 'Ricerca partite', 'user'], ['data', 'Dati', 'Stato dei dati', 'technical']];
const DATA_TABS = [['#/data', 'Panoramica', 'Stato dei dati'], ['#/providers', 'Fornitori', 'Fornitori dati'], ['#/endpoints', 'API', 'API v1']];
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
  assert.ok(state.top >= 0 && state.top < state.height - 20, `outcome on screen: top ${state.top}, viewport ${state.height}`);
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

export const JOURNEYS = [
  {
    id: 'general-navigation', surface: 'Interfaccia generale', title: 'Navigazione, rotte, pagina sconosciuta, tastiera',
    allowRawText: [/^expected null$/, /^null: the provider catalog does not carry a fixture total$/],
    async run({page, base, step}) {
      await step('apertura del sito', async () => {
        const response = await page.goto(`${base}/`);
        assert.equal(response.status(), 200);
        assert.match(response.headers()['content-security-policy'] ?? '', /script-src 'self'/);
        await titled(page, 'Oggi');
      });
      await step('ogni voce del menu è nota e ha la sua area', async () => {
        const views = await page.locator('nav a[data-view]').evaluateAll(links => links.map(link => link.dataset.view));
        assert.deepEqual(views, NAV.map(([view]) => view), 'a new view must be listed here with its area');
      });
      for (const [view, label, title, area] of NAV) {
        await step(`menu: ${title}`, async () => {
          assert.equal((await page.textContent(`nav a[data-view="${view}"]`)).trim(), label);
          await page.click(`nav a[data-view="${view}"]`);
          await page.waitForLoadState('networkidle');
          await page.waitForFunction(text => document.querySelector('main h1')?.textContent === text && !document.querySelector('.state.loading'), title);
          assert.equal(await page.getAttribute(`nav a[data-view="${view}"]`, 'aria-current'), 'page');
          assert.equal(await page.getAttribute('main', 'data-area'), area);
        });
      }
      await step('Dati: le schede aprono le viste tecniche', async () => {
        await fresh(page, `${base}/#/data`);
        await titled(page, 'Stato dei dati');
        for (const [href, label, title] of DATA_TABS) {
          const tab = page.locator(`[data-testid="data-tabs"] a[href="${href}"]`);
          assert.equal((await tab.textContent()).trim(), label);
          await tab.click();
          await titled(page, title);
          assert.equal(await page.getAttribute(`[data-testid="data-tabs"] a[href="${href}"]`, 'aria-current'), 'page');
          assert.equal(await page.getAttribute('nav a[data-view="data"]', 'aria-current'), 'page', `${title} is a section of Dati`);
          assert.equal(await page.getAttribute('main', 'data-area'), 'technical');
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
        await page.click('main a[href="#/"]');
        await titled(page, 'Oggi');
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
        }
      });
      await step('dati assenti mostrati come N/D, mai 0', async () => {
        assert.equal(await page.textContent('[data-testid="tile-certification"] [data-field="latest_backfill"]'), 'N/D');
        assert.equal(await page.textContent('[data-testid="tile-tc-live"] [data-field="latest"]'), 'N/D');
      });
      await step('una route indisponibile: solo il suo riquadro è N/D con il motivo', async () => {
        await page.route('**/api/v1/tc/live', route => route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)}));
        await page.reload();
        await page.waitForSelector('[data-testid="tile-tc-live"][data-state="error"]');
        assert.match(await page.textContent('[data-testid="tile-tc-live"]'), /N\/D[\s\S]*non disponibile/);
        assert.equal(await page.getAttribute('[data-testid="tile-tc-live"] .state.partial', 'data-code'), 'UNAVAILABLE');
        assert.equal(await page.getAttribute('[data-testid="tile-coverage"]', 'data-state'), 'ok');
        assert.match(await page.textContent('[data-testid="dashboard-partial"]'), /1 riquadro su 6/);
        await page.unroute('**/api/v1/tc/live');
      });
    },
  },
  {
    id: 'daily-board', surface: 'Daily Board', title: 'Giorno con più campionati, paginazione, navigazione tra giorni, stati vuoti e data non valida',
    allowHttp: [{path: '/api/v1/fpt/matches', status: 503}],
    async run({page, base, step, api, seed}) {
      const day = seed.busyDay;
      const all = (await api(`/api/v1/fpt/matches?date=${day}&limit=500`)).data.rows;
      assert.ok(all.length > 24, 'the busy day needs more than one page');
      await step('apertura dalla copertura in Dati', async () => {
        await page.goto(`${base}/#/data`);
        await page.waitForSelector('[data-testid="tile-coverage"] tbody tr');
        const laliga = page.locator(`[data-testid="tile-coverage"] tr[data-competition="${seed.laliga.competition}"] [data-field="last_match_date"] a`);
        await laliga.click();
        await page.waitForSelector('[data-testid="board-day"]');
      });
      await step('selezione della data dal campo', async () => {
        await page.fill('input[name="date"]', day);
        await page.click('[data-testid="board-controls"] button[type="submit"]');
        await page.waitForFunction(text => document.querySelector('[data-testid="board-day"] time')?.getAttribute('datetime') === text, day);
        assert.equal(await page.locator('article.match').count(), 24);
        assert.equal(await page.getAttribute('main', 'data-area'), 'user', 'the Daily Board is a user view: no technical text');
        assert.equal(await page.textContent('main h1'), 'Partite del giorno', 'a day other than today');
        assert.equal(await page.getAttribute('nav a[data-view=""]', 'aria-current'), 'page');
        // The QA archive has no sync run: no update time is shown, none is made up (UI-25).
        assert.equal(await page.locator('[data-testid="updated"]').count(), 0);
      });
      await step('paginazione fino alla fine, stesso ordine dell’API', async () => {
        await loadAll(page, 'article.match');
        assert.deepEqual(await ids(page, 'article.match'), all.map(row => row.internal_match_id));
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
        for (const [status, text] of [['complete', 'Dati aggiornati: '], ['partial', 'Dati aggiornati in parte: '], ['failed', null], ['running', null]]) {
          run = {run_id: 'qa', kind: 'incremental', status, started_at: '2026-10-19T18:10:00Z', finished_at: status === 'running' ? null : '2026-10-19T18:15:00Z'};
          await fresh(page, `${base}/#/?date=${day}`);
          await page.waitForSelector('[data-testid="board-day"]');
          const line = page.locator('[data-testid="updated"]');
          if (!text) { assert.equal(await line.count(), 0, status); continue; }
          assert.equal(await line.textContent(), `${text}19/10/2026, 20:15 GMT+2`);
          assert.equal(await line.locator('time').getAttribute('datetime'), '2026-10-19T18:15:00Z');
        }
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
        await page.waitForSelector('[data-testid="board-empty"]');
      });
      await step('giorno dopo: di nuovo il giorno affollato', async () => {
        await page.click('[data-action="next"]');
        await page.waitForFunction(text => document.querySelector('[data-testid="board-day"] time')?.getAttribute('datetime') === text, day);
        assert.equal(await page.locator('article.match').count(), 24);
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
    async run({page, base, step, api, seed}) {
      await step('tutte le partite, pagina dopo pagina, fino alla fine', async () => {
        const expected = (await api('/api/v1/fpt/search?limit=500')).data.rows;
        await page.goto(`${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"]');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="search-results"] tr');
        await outcomeShown(page, '[data-testid="search-outcome"]');
        await loadAll(page, '[data-testid="search-results"] tr');
        assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
        assert.equal(expected.length, seed.matches);
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
        assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
        assert.equal(await page.inputValue('input[name="team"]'), 'Ajax', 'the form keeps its values');
        assert.equal(await page.getAttribute('main', 'data-area'), 'user', 'the search is a user view: no technical text');
        assert.match(await page.getAttribute('[data-testid="search-outcome"]', 'data-filters'), /\bwith_odds\b/, 'the applied filters stay on the outcome');
        const rows = page.locator('[data-testid="search-results"] tr');
        for (const [i, row] of expected.slice(0, 25).entries()) {
          const line = rows.nth(i);
          assert.equal(await line.locator('[data-field="date"] time').getAttribute('datetime'), row.match_date);
          assert.equal(await line.locator('[data-field="competition"]').textContent(), `${words(row.league_slug)} ${seasonShown(row.season)}`);
          assert.equal(await line.locator('[data-field="score"]').textContent(), outcomeShownFor(row));
        }
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
        assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
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
        await page.waitForSelector('[data-testid="team-not-found"]');
        await outcomeShown(page, '[data-testid="team-not-found"]');
        // The same search again: the address does not change, the outcome is shown again.
        await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await outcomeShown(page, '[data-testid="team-not-found"]');
        await page.fill('input[name="team"]', '');
        await page.fill('input[name="min_goals"]', '30');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="search-empty"]');
        await outcomeShown(page, '[data-testid="search-empty"]');
        // A search abandoned before its answer must not move the focus later (PR #168 review NB-1).
        await page.route('**/api/v1/fpt/search?*', async route => { await new Promise(done => setTimeout(done, 1500)); await route.continue().catch(() => {}); });
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.click('nav a[data-view=""]');
        await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Oggi');
        await page.waitForTimeout(1800);
        await page.unroute('**/api/v1/fpt/search?*');
        await page.evaluate(() => scrollTo(0, 0));
        await page.click('nav a[data-view="search"]');
        await page.waitForSelector('[data-testid="search-form"]');
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
        await page.waitForSelector('.paged-foot .state.error');
        assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 25);
        assert.equal(await page.getAttribute('.paged-foot .state.error', 'data-code'), 'UNAVAILABLE');
      });
      await step('Riprova carica la pagina successiva', async () => {
        await page.click('.paged-foot .state.error button');
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="search-results"] tr').length > 25);
        await page.unroute(/\/api\/v1\/fpt\/search\?.*cursor=/);
      });
    },
  },
  {
    id: 'providers-endpoints', surface: 'Interfaccia generale', title: 'Fornitori dati e registro API',
    // Certification prose from the API that legitimately ends with "null" (phase 6 evidence).
    allowRawText: [/^expected null$/, /^null: the provider catalog does not carry a fixture total$/],
    async run({page, base, step, api}) {
      const endpoints = await api('/api/v1/endpoints');
      await step('fornitori dati', async () => {
        await page.goto(`${base}/#/providers`);
        await page.waitForSelector('[data-testid="data-health"]');
        assert.match(await page.textContent('[data-testid="fpt-certification"]'), /Ultimo backfill\s*N\/D/);
      });
      await step('registro API: stesse righe dell’API', async () => {
        await page.goto(`${base}/#/endpoints`);
        await page.waitForSelector('[data-testid="endpoints"] tbody tr');
        assert.equal(await page.locator('[data-testid="endpoints"] tbody tr').count(), endpoints.data.endpoints.length);
      });
    },
  },
];

export const REQUIRED_JOURNEYS = JOURNEYS.map(journey => journey.id);
export const REQUIRED_VIEWPORTS = Object.keys(VIEWPORTS);
