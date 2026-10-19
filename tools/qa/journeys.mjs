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

const NAV = [['', 'Dashboard'], ['board', 'Daily Board'], ['search', 'Ricerca partite'], ['providers', 'Fornitori dati'], ['endpoints', 'API v1']];
const unavailable = {api_version: 'v1', error: {code: 'UNAVAILABLE', message: 'data source unavailable'}};
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
    async run({page, base, step}) {
      await step('apertura del sito', async () => {
        const response = await page.goto(`${base}/`);
        assert.equal(response.status(), 200);
        assert.match(response.headers()['content-security-policy'] ?? '', /script-src 'self'/);
        await page.waitForSelector('[data-testid="tile-health"]');
      });
      for (const [view, title] of NAV) {
        await step(`menu: ${title}`, async () => {
          await page.click(`nav a[data-view="${view}"]`);
          await page.waitForLoadState('networkidle');
          await page.waitForFunction(text => document.querySelector('main h1')?.textContent === text && !document.querySelector('.state.loading'), title);
          assert.equal(await page.getAttribute(`nav a[data-view="${view}"]`, 'aria-current'), 'page');
        });
      }
      await step('rotta sconosciuta', async () => {
        await page.goto(`${base}/#/non-esiste`);
        await page.waitForSelector('text=Pagina non trovata');
        await page.click('main a[href="#/"]');
        await page.waitForSelector('[data-testid="tile-health"]');
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
        await page.goto(`${base}/`);
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
        assert.match(await page.textContent('[data-testid="tile-tc-live"]'), /N\/D[\s\S]*UNAVAILABLE/);
        assert.equal(await page.getAttribute('[data-testid="tile-coverage"]', 'data-state'), 'ok');
        assert.match(await page.textContent('[data-testid="dashboard-partial"]'), /1 riquadro su 6/);
        await page.unroute('**/api/v1/tc/live');
      });
    },
  },
  {
    id: 'daily-board', surface: 'Daily Board', title: 'Giorno con più campionati, paginazione, navigazione tra giorni, stati vuoti e data non valida',
    async run({page, base, step, api, seed}) {
      const day = seed.busyDay;
      const all = (await api(`/api/v1/fpt/matches?date=${day}&limit=500`)).data.rows;
      assert.ok(all.length > 24, 'the busy day needs more than one page');
      await step('apertura dalla copertura della Dashboard', async () => {
        await page.goto(`${base}/`);
        await page.waitForSelector('[data-testid="tile-coverage"] tbody tr');
        const laliga = page.locator(`[data-testid="tile-coverage"] tr[data-competition="${seed.laliga.competition}"] [data-field="last_match_date"] a`);
        await laliga.click();
        await page.waitForSelector('[data-testid="board-day"]');
      });
      await step('selezione della data dal campo', async () => {
        await page.fill('input[name="date"]', day);
        await page.click('[data-testid="board-controls"] button[type="submit"]');
        await page.waitForFunction(text => document.querySelector('[data-testid="board-day"]')?.textContent.endsWith(text), day);
        assert.equal(await page.locator('article.match').count(), 24);
      });
      await step('paginazione fino alla fine, stesso ordine dell’API', async () => {
        await loadAll(page, 'article.match');
        assert.deepEqual(await ids(page, 'article.match'), all.map(row => row.internal_match_id));
      });
      await step('schede: valori, campionato e N/D come nell’API', async () => {
        const cards = page.locator('article.match');
        for (const [i, row] of all.entries()) {
          const card = cards.nth(i);
          assert.equal(await card.locator('[data-field="competition"]').textContent(), `${row.country_slug} · ${row.league_slug} · ${row.season}`);
          assert.equal(await card.locator('[data-field="kickoff"]').textContent(), shown(row.kickoff_local_time));
          assert.equal(await card.locator('[data-field="odds_1x2"]').textContent(), `${shown(row.odd_home)} · ${shown(row.odd_draw)} · ${shown(row.odd_away)}`);
          assert.equal(await card.locator('[data-field="xg"]').textContent(), `${shown(row.xg_home)} · ${shown(row.xg_away)}`);
        }
        assert.ok(new Set(all.map(row => row.league_slug)).size === 2, 'both competitions on the day');
      });
      await step('giorno prima: nessuna partita salvata', async () => {
        await page.click('[data-action="prev"]');
        await page.waitForSelector('[data-testid="board-empty"]');
      });
      await step('giorno dopo: di nuovo partite', async () => {
        await page.click('[data-action="next"]');
        await page.waitForSelector('article.match');
      });
      await step('data non valida rifiutata senza richieste', async () => {
        await page.goto(`${base}/#/board?date=2024-02-30`);
        await page.waitForSelector('.state.error[role="alert"]');
        assert.match(await page.textContent('.state.error'), /Data non valida/);
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
        await loadAll(page, '[data-testid="search-results"] tr');
        assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
        assert.equal(expected.length, seed.matches);
      });
      await step('squadra per nome, sede e qualità combinate', async () => {
        const ajax = (await api('/api/v1/fpt/teams?q=Ajax')).data.rows[0].internal_team_id;
        const expected = (await api(`/api/v1/fpt/search?team=${encodeURIComponent(ajax)}&venue=home&with_odds=true&limit=500`)).data.rows;
        await page.goto(`${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"]');
        await page.fill('input[name="team"]', 'Ajax');
        await page.selectOption('select[name="venue"]', 'home');
        await page.check('input[name="with_odds"]');
        await page.click('[data-testid="search-form"] button[type="submit"]');
        await page.waitForSelector('[data-testid="search-results"] tr');
        assert.deepEqual(await ids(page, '[data-testid="search-results"] tr'), expected.map(row => row.internal_match_id));
        assert.equal(await page.inputValue('input[name="team"]'), 'Ajax', 'the form keeps its values');
      });
      await step('campionato e intervallo di date', async () => {
        const expected = (await api(`/api/v1/fpt/search?competition=${encodeURIComponent(seed.laliga.competition)}&from=2024-08-02&before=2024-08-03&limit=500`)).data.rows;
        assert.ok(expected.length > 0);
        await page.goto(`${base}/#/search`);
        await page.waitForSelector('[data-testid="search-form"] select[name="competition"]');
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
        await page.goto(`${base}/#/search?run=1&with_xg=true&result=FINAL&min_goals=4`);
        await page.waitForSelector('[data-testid="search-results"] tr, [data-testid="search-empty"]');
        assert.equal(await page.locator('[data-testid="search-results"] tr').count(), Math.min(expected.length, 25));
        assert.equal(await page.isChecked('input[name="with_xg"]'), true);
      });
      await step('errore di validazione dal server', async () => {
        await page.goto(`${base}/#/search?run=1&fav_min=abc`);
        await page.waitForSelector('[data-testid="search-invalid"]');
        assert.match(await page.textContent('[data-testid="search-invalid"]'), /fav_min/);
      });
      await step('squadra sconosciuta, nessun risultato, sede senza squadra', async () => {
        await page.goto(`${base}/#/search?run=1&team=Nessuno`);
        await page.waitForSelector('[data-testid="team-not-found"]');
        await page.goto(`${base}/#/search?run=1&min_goals=30`);
        await page.waitForSelector('[data-testid="search-empty"]');
        await page.goto(`${base}/#/search?run=1&venue=home`);
        await page.waitForSelector('[data-testid="venue-ignored"]');
      });
      await step('pagina successiva in errore: le righe restano, Riprova funziona', async () => {
        let fail = true;
        await page.route(/\/api\/v1\/fpt\/search\?.*cursor=/, route => {
          if (!fail) return route.continue();
          fail = false;
          return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify(unavailable)});
        });
        await page.goto(`${base}/#/search?run=1`);
        await page.waitForSelector('[data-testid="search-results"] tr');
        await page.click('[data-action="more"]');
        await page.waitForSelector('.paged-foot .state.error');
        assert.equal(await page.locator('[data-testid="search-results"] tr').count(), 25);
        await page.click('.paged-foot .state.error button');
        await page.waitForFunction(() => document.querySelectorAll('[data-testid="search-results"] tr').length > 25);
        await page.unroute(/\/api\/v1\/fpt\/search\?.*cursor=/);
      });
    },
  },
  {
    id: 'providers-endpoints', surface: 'Interfaccia generale', title: 'Fornitori dati e registro API',
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
