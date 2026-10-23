// STRAT-CFG-01 (#34): configurable strategies as validated data. SYNTHETIC fixtures only (dataset kind FIXTURE): the
// figures test the engine, they are not returns. Two independent checks of the decisions: the definitions equivalent to
// the reference oracles must give byte-identical bets and metrics, and every other definition is compared with a
// separate implementation written on integer thousandths, not with the module's own code.
import assert from 'node:assert/strict';
import test from 'node:test';
import {HistInputError} from '../src/hist/contract.mjs';
import {STATUS, runBacktest, validateConfig} from '../src/hist/engine.mjs';
import {STRATEGY_DEF_VERSION, definitionId, normalizeDefinition} from '../src/hist/strategy-def.mjs';

const P = 'futpythontrader';
const BASE = {bookmaker: 'bk1', lead_minutes: 10, stake: '1', commission: '0'};
const S = ['HOME', 'DRAW', 'AWAY'];
let seq = 0;
const ev = (id, kickoff, home = `Home ${id}`, away = `Away ${id}`) => ({provider: P, event_id: id, kickoff_utc: kickoff, home, away});
const ob = (event, selection, odds, acquired) => ({observation_id: `o${String(++seq).padStart(5, '0')}`, provider: P, event_id: event, bookmaker: 'bk1',
  market: '1X2', selection, odds, provider_time: acquired, acquired_at: acquired});
const out = (event, hs, as, acquired) => ({provider: P, event_id: event, status: 'FINAL', home_score: hs, away_score: as, acquired_at: acquired});
const input = ({events, observations, outcomes = []}) => ({schema_version: 'mp-hist-input-1',
  dataset: {id: 'fixture-strat-cfg-01', kind: 'FIXTURE', description: 'synthetic fixture for configurable strategies'}, events, observations, outcomes});
const def = (selection, side, conditions) => ({selection, side, ...(conditions ? {conditions} : {})});
const run = (data, definition, extra = {}) => runBacktest(data, {...BASE, strategy_definition: definition, ...extra});

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Random events with prices on a 0.05 grid (ties happen), some with a missing price, teams from a small pool.
const TEAMS = ['Ajax', 'PSV', 'Feyenoord', 'AZ', 'Twente', 'Utrecht'];
function randomData(seed, n = 60) {
  const next = rng(seed);
  const events = [], observations = [], outcomes = [];
  for (let i = 0; i < n; i++) {
    const id = `e${i}`;
    const kickoff = new Date(Date.UTC(2026, 1, 1) + i * 3600_000).toISOString().replace('.000', '');
    const acquired = new Date(Date.parse(kickoff) - 15 * 60_000).toISOString().replace('.000', '');
    const home = TEAMS[Math.floor(next() * TEAMS.length)];
    let away = TEAMS[Math.floor(next() * TEAMS.length)];
    if (away === home) away = `${away} B`;
    events.push(ev(id, kickoff, home, away));
    for (const s of S) {
      if (next() < 0.06) continue;
      observations.push(ob(id, s, (1.05 + Math.floor(next() * 120) * 0.05).toFixed(2), acquired));
    }
    outcomes.push(out(id, Math.floor(next() * 4), Math.floor(next() * 3), new Date(Date.parse(kickoff) + 3 * 3600_000).toISOString().replace('.000', '')));
  }
  return input({events, observations, outcomes});
}

// The independent decision: prices as integer thousandths, conditions read straight from the definition.
const milli = text => Math.round(Number(text) * 1000);
function oracleDecision(d, event, prices) {
  const c = d.conditions ?? {};
  if (c.teams) {
    const home = c.teams.includes(event.home), away = c.teams.includes(event.away);
    const venue = c.venue ?? 'ANY';
    if (!(venue === 'HOME' ? home : venue === 'AWAY' ? away : home || away)) return 'TEAM_FILTER';
  }
  const have = S.filter(s => prices[s] !== undefined);
  if (have.length === 0) return 'NO_ADMISSIBLE_ODDS';
  const conditioned = S.filter(s => c[`${s.toLowerCase()}_min`] !== undefined || c[`${s.toLowerCase()}_max`] !== undefined);
  const needAll = d.selection === 'FAVOURITE' || d.selection === 'UNDERDOG';
  const need = needAll ? S : [d.selection, ...conditioned];
  if (need.some(s => prices[s] === undefined)) return needAll ? 'INCOMPLETE_1X2' : 'PRICE_MISSING';
  const inside = (v, lo, hi) => (lo === undefined || v >= milli(lo)) && (hi === undefined || v <= milli(hi));
  for (const s of conditioned) if (!inside(prices[s], c[`${s.toLowerCase()}_min`], c[`${s.toLowerCase()}_max`])) return `${s}_PRICE_OUT_OF_RANGE`;
  let selection = d.selection;
  if (needAll) {
    const target = d.selection === 'FAVOURITE' ? Math.min(...S.map(s => prices[s])) : Math.max(...S.map(s => prices[s]));
    const at = S.filter(s => prices[s] === target);
    if (at.length > 1) return `${d.selection}_TIE`;
    selection = at[0];
  }
  if (!inside(prices[selection], c.odds_min, c.odds_max)) return 'ODDS_OUT_OF_RANGE';
  return `${d.side}:${selection}`;
}
function oracleRun(data, d) {
  const noTrade = {}, bets = [];
  for (const event of data.events) {
    const prices = {};
    for (const o of data.observations.filter(x => x.event_id === event.event_id)) prices[o.selection] = milli(o.odds);
    const r = oracleDecision(d, event, prices);
    if (r.includes(':')) bets.push(`${event.event_id}:${r}`);
    else noTrade[r] = (noTrade[r] ?? 0) + 1;
  }
  return {bets: bets.sort(), noTrade};
}
const betsOf = report => report.bets.map(b => `${b.event_id}:${b.side}:${b.selection}`).sort();

test('a definition is closed and validated field by field; every refusal names its field', () => {
  const bad = [
    [null, 'config.strategy_definition'], [[], 'config.strategy_definition'], [{selection: 'HOME', side: 'BACK', code: 'x'}, 'config.strategy_definition.code'],
    [{selection: 'HOME', side: 'BACK', market: 'OVER_UNDER_25'}, 'config.strategy_definition.market'],
    [{selection: 'HOME', side: 'BACK', version: 'mp-strategy-def-0'}, 'config.strategy_definition.version'],
    [{selection: 'FIRST_GOAL', side: 'BACK'}, 'config.strategy_definition.selection'], [{selection: 'HOME', side: 'DUTCH'}, 'config.strategy_definition.side'],
    [def('HOME', 'BACK', []), 'config.strategy_definition.conditions'], [def('HOME', 'BACK', {eval: '1'}), 'config.strategy_definition.conditions.eval'],
    [def('HOME', 'BACK', {odds_min: 1.5}), 'config.strategy_definition.conditions.odds_min'],
    [def('HOME', 'BACK', {odds_min: '1'}), 'config.strategy_definition.conditions.odds_min'],
    [def('HOME', 'BACK', {odds_max: '1000.5'}), 'config.strategy_definition.conditions.odds_max'],
    [def('HOME', 'BACK', {draw_min: '1e2'}), 'config.strategy_definition.conditions.draw_min'],
    [def('HOME', 'BACK', {home_min: '3', home_max: '2'}), 'config.strategy_definition.conditions.home_min'],
    [def('HOME', 'BACK', {teams: []}), 'config.strategy_definition.conditions.teams'],
    [def('HOME', 'BACK', {teams: 'Ajax'}), 'config.strategy_definition.conditions.teams'],
    [def('HOME', 'BACK', {teams: Array.from({length: 21}, (_, i) => `T${i}`)}), 'config.strategy_definition.conditions.teams'],
    [def('HOME', 'BACK', {teams: ['  ']}), 'config.strategy_definition.conditions.teams'],
    [def('HOME', 'BACK', {venue: 'HOME'}), 'config.strategy_definition.conditions.venue'],
    [def('HOME', 'BACK', {teams: ['Ajax'], venue: 'NEUTRAL'}), 'config.strategy_definition.conditions.venue'],
    [Object.assign(Object.create({selection: 'HOME'}), {side: 'BACK'}), 'config.strategy_definition'],
  ];
  for (const [d, field] of bad) {
    assert.throws(() => validateConfig({...BASE, strategy_definition: d}), error => error instanceof HistInputError && error.field === field, JSON.stringify(d));
  }
  // null is not «absent»: a closed definition refuses it (PR #230 review NB-4).
  for (const [d, field] of [[{selection: 'HOME', side: 'BACK', market: null}, 'config.strategy_definition.market'], [{selection: 'HOME', side: 'BACK', conditions: null}, 'config.strategy_definition.conditions'],
    [def('HOME', 'BACK', {teams: ['Ajax'], venue: null}), 'config.strategy_definition.conditions.venue'], [def('HOME', 'BACK', {odds_min: null}), 'config.strategy_definition.conditions.odds_min'],
    [def('HOME', 'BACK', {teams: ['\u200b']}), 'config.strategy_definition.conditions.teams'], [def('HOME', 'BACK', {teams: ['Aj\u200bax']}), 'config.strategy_definition.conditions.teams']]) {
    assert.throws(() => validateConfig({...BASE, strategy_definition: d}), error => error instanceof HistInputError && error.field === field, JSON.stringify(d));
  }
  // A definition is the strategy: a registered id beside it is refused, and none of the two is a refusal too.
  assert.throws(() => validateConfig({...BASE, strategy: 'mp-ref-fav-back-1', strategy_definition: def('HOME', 'BACK')}), {field: 'config.strategy'});
  assert.throws(() => validateConfig({...BASE}), {field: 'config.strategy'});
});

test('identity: the same rules written differently are one strategy; any change is another; the report records both', () => {
  const a = normalizeDefinition({selection: 'HOME', side: 'BACK', conditions: {odds_min: '1.50', teams: [' PSV', 'Ajax', 'Ajax']}});
  const b = normalizeDefinition({version: STRATEGY_DEF_VERSION, market: 'MATCH_ODDS', selection: 'HOME', side: 'BACK', conditions: {teams: ['Ajax', 'PSV'], odds_min: '1.5', venue: 'ANY'}});
  assert.deepEqual(a, b);
  assert.equal(definitionId(a), definitionId(b));
  assert.match(definitionId(a), /^def:[0-9a-f]{16}$/);
  for (const changed of [{selection: 'AWAY', side: 'BACK', conditions: a.conditions}, {selection: 'HOME', side: 'LAY', conditions: a.conditions},
    {selection: 'HOME', side: 'BACK', conditions: {...a.conditions, odds_min: '1.51'}}, {selection: 'HOME', side: 'BACK', conditions: {teams: ['Ajax']}}]) {
    assert.notEqual(definitionId(normalizeDefinition(changed)), definitionId(a), JSON.stringify(changed));
  }
  const data = randomData(7, 12);
  const report = run(data, {selection: 'HOME', side: 'BACK', conditions: {odds_min: '1.50'}});
  assert.equal(report.config.strategy, definitionId(normalizeDefinition(def('HOME', 'BACK', {odds_min: '1.5'}))));
  assert.deepEqual(report.config.strategy_definition, {version: STRATEGY_DEF_VERSION, market: 'MATCH_ODDS', selection: 'HOME', side: 'BACK', conditions: {odds_min: '1.5'}});
  assert.equal(report.versions.strategy, report.config.strategy);
  assert.equal(report.versions.strategy_definition, STRATEGY_DEF_VERSION);
  // The report's configuration runs again as it is (PR #230 review NB-1): its strategy is the definition's id.
  const {settings_snapshot_id: _s, commission_rate_used: _c, ...again} = report.config;
  assert.equal(runBacktest(data, again).report_sha256, report.report_sha256);
  assert.throws(() => validateConfig({...BASE, strategy: 'def:0000000000000000', strategy_definition: def('HOME', 'BACK')}), {field: 'config.strategy'});
  // Team names compare in Unicode NFC: a decomposed «Café» is the same team as the archive's composed one (review NB-3).
  assert.equal(definitionId(normalizeDefinition(def('HOME', 'BACK', {teams: ['Cafe\u0301']}))), definitionId(normalizeDefinition(def('HOME', 'BACK', {teams: ['Caf\u00e9']}))));
  // A run with a registered strategy keeps its report shape: no definition field appears.
  const reference = runBacktest(randomData(7, 12), {...BASE, strategy: 'mp-ref-fav-back-1'});
  assert.equal(Object.hasOwn(reference.config, 'strategy_definition'), false);
  assert.equal(Object.hasOwn(reference.versions, 'strategy_definition'), false);
});

test('FAVOURITE BACK and FAVOURITE LAY decide exactly like the reference oracles: same bets, settlement, ledger and metrics', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const data = randomData(seed);
    for (const [side, reference] of [['BACK', 'mp-ref-fav-back-1'], ['LAY', 'mp-ref-fav-lay-1']]) {
      for (const extra of [{}, {commission: '0.05'}, {pit_mode: 'NON_PIT_RESEARCH'}]) {
        const mine = run(data, def('FAVOURITE', side), extra);
        const ref = runBacktest(data, {...BASE, strategy: reference, ...extra});
        assert.deepEqual(mine.bets.map(({position_id: _, ...b}) => b), ref.bets.map(({position_id: _, ...b}) => b), `seed ${seed} ${side}`);
        assert.deepEqual([mine.counts, mine.metrics, mine.status, mine.ledger.state], [ref.counts, ref.metrics, ref.status, ref.ledger.state], `seed ${seed} ${side}`);
      }
    }
  }
});

test('every selection and condition agrees with an independent implementation (seeded random definitions)', () => {
  const next = rng(424242);
  const price = () => (1.05 + Math.floor(next() * 120) * 0.05).toFixed(2);
  const range = (name, c) => {
    const r = next();
    if (r < 0.25) c[`${name}_min`] = price();
    else if (r < 0.5) c[`${name}_max`] = price();
    else if (r < 0.7) { const [lo, hi] = [price(), price()].sort((x, y) => Number(x) - Number(y)); c[`${name}_min`] = lo; c[`${name}_max`] = hi; }
  };
  let bets = 0;
  for (let round = 0; round < 150; round++) {
    const data = randomData(1000 + round);
    const c = {};
    for (const name of ['odds', 'home', 'draw', 'away']) if (next() < 0.5) range(name, c);
    if (next() < 0.3) { c.teams = TEAMS.filter(() => next() < 0.4).slice(0, 3); if (!c.teams.length) c.teams = ['Ajax']; c.venue = ['ANY', 'HOME', 'AWAY'][Math.floor(next() * 3)]; }
    const d = def(['FAVOURITE', 'UNDERDOG', 'HOME', 'DRAW', 'AWAY'][Math.floor(next() * 5)], next() < 0.5 ? 'BACK' : 'LAY', c);
    const report = run(data, d);
    const expected = oracleRun(data, d);
    assert.deepEqual(betsOf(report), expected.bets, `round ${round} ${JSON.stringify(d)}`);
    assert.deepEqual(report.counts.no_trade_by_reason, Object.fromEntries(Object.entries(expected.noTrade).sort()), `round ${round} reasons`);
    bets += expected.bets.length;
    if (report.metrics) assert.equal(report.ledger.state.reconciled, true);
  }
  assert.ok(bets > 1000, `the random definitions place bets (${bets})`);
});

test('PIT: a price acquired after the decision never satisfies a condition; NON_PIT_RESEARCH admits it and labels the run', () => {
  seq = 0;
  const kickoff = '2026-02-01T15:00:00Z';
  const data = input({events: [ev('a', kickoff, 'Ajax', 'PSV')], outcomes: [out('a', 2, 0, '2026-02-01T17:00:00Z')],
    observations: [ob('a', 'HOME', '3.00', '2026-02-01T14:40:00Z'), ob('a', 'DRAW', '3.20', '2026-02-01T14:40:00Z'), ob('a', 'AWAY', '2.40', '2026-02-01T14:40:00Z'),
      // after the decision (kickoff − 10 min): the home price that the condition wants
      ob('a', 'HOME', '1.80', '2026-02-01T14:55:00Z')]});
  const d = def('HOME', 'BACK', {odds_max: '2.00'});
  const pit = run(data, d);
  assert.deepEqual([pit.bets.length, pit.counts.no_trade_by_reason], [0, {ODDS_OUT_OF_RANGE: 1}], 'PIT sees 3.00 only');
  const research = run(data, d, {pit_mode: 'NON_PIT_RESEARCH'});
  assert.deepEqual(research.bets.map(b => [b.selection, b.odds]), [['HOME', '1.8']]);
  assert.equal(research.certification.certified, false);
  assert.equal(research.certification.pit_mode, 'NON_PIT_RESEARCH');
  // A strategy definition cannot reach an outcome: the decision view refuses any field outside it.
  assert.equal(research.status, STATUS.OK);
});

test('determinism: input order and repeated runs give the same report bytes', () => {
  const data = randomData(77);
  const d = def('UNDERDOG', 'LAY', {odds_max: '6', draw_min: '2.5'});
  const first = run(data, d);
  const shuffled = {...data, events: [...data.events].reverse(), observations: [...data.observations].reverse(), outcomes: [...data.outcomes].reverse()};
  assert.equal(JSON.stringify(run(shuffled, d)), JSON.stringify(first));
  assert.equal(run(data, d).report_sha256, first.report_sha256);
});

test('LAY liability and P/L of a definition go through the paper ledger and reconcile', () => {
  seq = 0;
  // Away underdog laid at 5.00 (liability 4 per unit) and it wins: −4; laid at 4.00 and it loses: +1 less 5 % commission.
  const data = input({events: [ev('a', '2026-02-01T15:00:00Z'), ev('b', '2026-02-01T18:00:00Z')],
    observations: [...['1.80', '3.50', '5.00'].map((o, i) => ob('a', S[i], o, '2026-02-01T14:00:00Z')), ...['2.00', '3.20', '4.00'].map((o, i) => ob('b', S[i], o, '2026-02-01T17:00:00Z'))],
    outcomes: [out('a', 0, 1, '2026-02-01T17:00:00Z'), out('b', 1, 0, '2026-02-01T20:00:00Z')]});
  const report = run(data, def('UNDERDOG', 'LAY'), {commission: '0.05'});
  assert.deepEqual(report.bets.map(b => [b.event_id, b.selection, b.settlement.bet_result, b.settlement.net]), [['a', 'AWAY', 'LOST', '-4'], ['b', 'AWAY', 'WON', '0.95']]);
  assert.deepEqual([report.metrics.exposure, report.metrics.pl_net, report.metrics.rounded.roi], ['7', '-3.05', '-0.4357']);
  assert.equal(report.ledger.state.reconciled, true);
  assert.equal(report.ledger.state.realized_pnl, '-3.05');
});

test('performance: 2000 events with a conditioned definition stay linear', () => {
  const data = randomData(5, 2000);
  const started = performance.now();
  const report = run(data, def('HOME', 'BACK', {home_max: '4', draw_min: '2'}));
  const ms = performance.now() - started;
  assert.ok(report.bets.length > 100);
  assert.ok(ms < 5000, `2000 events in ${Math.round(ms)} ms`);
});
