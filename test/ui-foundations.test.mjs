// MP-UI-PR-007 Fondamenta: the shared states of the pages (badges and HTTP failures), the required viewports and the
// Browser QA rules that keep them honest. One test per requirement, titled with its id (the matrix cites them by name).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {BADGES, badgeSpec, httpErrorState, pitBadgeKind} from '../src/web/states.js';
import {allowHttpErrors, computeVerdict, unexpectedConsoleLines} from '../tools/qa/browser-qa.mjs';
import {JOURNEYS, REQUIRED_JOURNEYS, REQUIRED_VIEWPORTS, VIEWPORTS} from '../tools/qa/journeys.mjs';

const app = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');

test('MP-REQ-UI-1003 MP-REQ-UI-1069: every journey is required on desktop 1280, tablet 820 and mobile 390; a missing viewport is never a PASS', () => {
  assert.deepEqual(VIEWPORTS, {desktop: {width: 1280, height: 800}, tablet: {width: 820, height: 1180}, mobile: {width: 390, height: 844}});
  assert.deepEqual(REQUIRED_VIEWPORTS, ['desktop', 'tablet', 'mobile']);
  const all = REQUIRED_JOURNEYS.flatMap(id => REQUIRED_VIEWPORTS.map(viewport => ({id, viewport, status: 'PASS'})));
  assert.deepEqual(computeVerdict(all).missing, []);
  assert.equal(computeVerdict(all).verdict, 'PASS');
  // A run without the tablet, or with a tablet run skipped, leaves those journeys missing: the verdict is not PASS.
  const noTablet = all.filter(run => run.viewport !== 'tablet');
  assert.deepEqual(computeVerdict(noTablet).missing, REQUIRED_JOURNEYS.map(id => `${id}/tablet`));
  const skipped = all.map(run => (run.viewport === 'tablet' && run.id === 'search' ? {...run, status: 'SKIP'} : run));
  assert.deepEqual(computeVerdict(skipped).missing, ['search/tablet']);
});

test('MP-REQ-UI-1043: one badge table, one component; every kind has its text and title, an unknown kind is refused', () => {
  assert.deepEqual(Object.keys(BADGES), ['DEMO', 'PIT', 'NON_PIT', 'UNAVAILABLE', 'ND']);
  assert.deepEqual(Object.values(BADGES).map(b => b.text), ['DEMO', 'PIT', 'NON PIT', 'NON DISPONIBILE', 'N/D']);
  for (const [kind, spec] of Object.entries(BADGES)) {
    assert.equal(spec.kind, kind);
    assert.ok(spec.title.endsWith('.') && spec.title.length > 12, `${kind}: a title that explains it`);
    assert.equal(badgeSpec(kind), spec);
  }
  assert.throws(() => badgeSpec('REAL'), /unknown badge REAL/);
  // The page renders every badge, N/D included, through badge(): no hand-made N/D or data-badge elsewhere.
  assert.equal((app.match(/'data-badge'/g) ?? []).length, 1, 'data-badge is set in badge() only');
  assert.doesNotMatch(app, /\}, ND\)/, 'no hand-made N/D element: badge(\'ND\') renders it');
  assert.match(app, /import \{badgeSpec, httpErrorState, pitBadgeKind\} from '\.\/states\.js';/);
});

test('MP-REQ-UI-1010 MP-REQ-UI-1043: one wording per HTTP status class, the same on every view', () => {
  const kinds = [0, 400, 403, 404, 409, 413, 414, 429, 500, 503].map(status => httpErrorState(status).kind);
  assert.equal(new Set(kinds).size, kinds.length, 'each status class has its own state');
  assert.equal(httpErrorState(0, 'NETWORK').text, 'Connessione non disponibile: i dati non sono stati caricati.');
  assert.equal(httpErrorState(200, 'NETWORK').kind, 'network');
  assert.equal(httpErrorState(0, 'CLIENT').kind, 'client', 'a page defect is never shown as a lost connection');
  for (const status of [502, 503, 504]) assert.deepEqual([httpErrorState(status).kind, httpErrorState(status).badge], ['unavailable', 'UNAVAILABLE']);
  assert.equal(httpErrorState(418).kind, 'refused', 'an unknown 4xx is a refusal');
  assert.equal(httpErrorState(599).kind, 'server', 'an unknown 5xx is a server error');
  assert.equal(httpErrorState(200, 'BAD_ENVELOPE').kind, 'server');
  for (const status of [400, 403, 404, 409, 414, 429, 500, 503]) assert.doesNotMatch(httpErrorState(status).text, /\b[A-Z]+_[A-Z_]+\b|HTTP \d{3}/, 'no technical code in the words');
  // The negative matrix journey covers every code on every view with an API.
  const matrix = JOURNEYS.find(journey => journey.id === 'http-errors');
  assert.ok(matrix, 'the http-errors journey is required');
  assert.deepEqual([...new Set(matrix.allowHttp.map(rule => rule.status))].sort(), [401, 403, 404, 409, 414, 429, 500, 503]);
  assert.ok(REQUIRED_JOURNEYS.includes('http-errors'));
});

test('MP-REQ-UI-1032: the PIT badge says PIT only for an explicit PIT; anything else declared is NON PIT; nothing is never guessed', () => {
  assert.equal(pitBadgeKind('PIT'), 'PIT');
  for (const value of ['NON_PIT_RESEARCH', 'PIT_NOT_VERIFIED', 'NON_PIT']) assert.equal(pitBadgeKind(value), 'NON_PIT', value);
  for (const value of [null, undefined, '', '  ']) assert.equal(pitBadgeKind(value), null);
  // The simulation, the comparison and the Match Center render it.
  assert.equal((app.match(/pitBadge\(report\.config\?\.pit_mode\)/g) ?? []).length, 1, 'simulation result');
  assert.equal((app.match(/pitBadge\(variants\[0\]\.report\.config\?\.pit_mode\)/g) ?? []).length, 1, 'comparison result');
  assert.match(app, /const pit = pitBadgeKind\(data\.method\?\.pit\);/, 'Match Center cutoff');
});

test('MP-REQ-UI-1045: the views import no DEMO generator; the real adapter and the memory mock share one contract test', () => {
  const imports = [...app.matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1]);
  assert.deepEqual(imports, ['./persistence.js', './states.js']);
  assert.doesNotMatch(app, /demo\.js|createDemo|Math\.random/);
  const contract = readFileSync(new URL('./web-persistence-contract.test.mjs', import.meta.url), 'utf8');
  assert.match(contract, /import \{createMemoryPersistence, createPersistence\} from '\.\.\/src\/web\/persistence\.js';/);
  assert.match(contract, /test\('the real adapter and the mock satisfy the same persistence contract'/);
});

test('Browser QA: every 5xx allowance is bound to the step that provokes it, and each allowed response excuses one console line of its own resource', () => {
  for (const journey of JOURNEYS) assert.deepEqual(allowHttpErrors(journey), [], journey.id);
  assert.deepEqual(allowHttpErrors({allowHttp: [{path: '/x', status: 503}]}), ['allowHttp /x 503: a 503 is allowed only in the step that provokes it']);
  assert.deepEqual(allowHttpErrors({allowHttp: [{path: '/x', status: 503, step: ['a', 'b']}]}), []);
  assert.deepEqual(allowHttpErrors({allowHttp: [{path: '/x', status: 503, step: []}]}), ['allowHttp /x 503: step must be a step name or a list of them']);
  const line = (status, path) => ({text: `Failed to load resource: the server responded with a status of ${status} (X)`, url: `http://127.0.0.1:1${path}`});
  const allowed = [{status: 404, path: '/a', step: 's'}];
  assert.deepEqual(unexpectedConsoleLines([line(404, '/a')], allowed), []);
  assert.deepEqual(unexpectedConsoleLines([line(404, '/a'), line(404, '/a')], allowed).length, 1, 'one line per allowed response');
  assert.deepEqual(unexpectedConsoleLines([line(404, '/favicon.ico')], allowed), ['Failed to load resource: the server responded with a status of 404 (X) (/favicon.ico)'],
    'an allowed 404 on /a never excuses a 404 of another resource');
  assert.deepEqual(unexpectedConsoleLines([line(500, '/a')], allowed).length, 1, 'nor another status');
  assert.deepEqual(unexpectedConsoleLines([{text: 'Failed to load resource: net::ERR_TIMED_OUT', url: ''}], [], new Set(['net::ERR_TIMED_OUT'])), []);
});

test('MP-REQ-UI-1028: every control of the inventory is ASSERTED by a journey step, and the negative matrix is required', async () => {
  const {loadInventory} = await import('../tools/qa/control-inventory.mjs');
  const inventory = loadInventory();
  const weak = inventory.controls.filter(control => control.status !== 'TESTED' || control.evidence !== 'ASSERTED').map(control => `${control.id} ${control.status}/${control.evidence}`);
  assert.deepEqual(weak, [], 'a control only seen or actuated is not verified: a new control needs an asserted step');
  assert.ok(inventory.controls.length >= 205);
  for (const id of ['controls-coverage', 'http-errors']) assert.ok(REQUIRED_JOURNEYS.includes(id), `${id} is a required journey`);
});
