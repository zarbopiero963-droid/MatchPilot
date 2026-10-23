// HIST-01a (MP-OWNER-HIST-01A-01): the offline backtest engine on SYNTHETIC fixtures only (dataset kind FIXTURE). The
// figures below test the engine; they are not returns. The settlement oracle is an independent exact-fraction
// implementation (BigInt numerator/denominator), not a copy of the engine's code.
import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {settleMarket} from '../src/math/money.mjs';
import {HistInputError, canonicalJson, validateInput} from '../src/hist/contract.mjs';
import {OUTCOME_RULE_VERSION, STATUS, runBacktest} from '../src/hist/engine.mjs';
import {resolve} from '../src/markets/rules.mjs';

const CONFIG = {strategy: 'mp-ref-fav-back-1', bookmaker: 'bk1', lead_minutes: 10, stake: '1', commission: '0'};
const P = 'futpythontrader';

const ev = (id, kickoff, home = `Home ${id}`, away = `Away ${id}`, provider = P) => ({provider, event_id: id, kickoff_utc: kickoff, home, away});
let seq = 0;
const ob = (event, selection, odds, acquired, {provider = P, bookmaker = 'bk1', providerTime = acquired, id = null} = {}) => ({
  observation_id: id ?? `o${String(++seq).padStart(4, '0')}`, provider, event_id: event, bookmaker, market: '1X2', selection, odds,
  provider_time: providerTime, acquired_at: acquired});
const out = (event, status, hs, as, acquired, provider = P) => ({provider, event_id: event, status, home_score: hs, away_score: as, acquired_at: acquired});
const input = ({events, observations, outcomes = []}) => ({schema_version: 'mp-hist-input-1',
  dataset: {id: 'fixture-hist-01a', kind: 'FIXTURE', description: 'synthetic fixture for the HIST-01a engine tests'}, events, observations, outcomes});

// The golden fixture. Decision = kickoff − 10 min.
function golden() {
  seq = 0;
  return input({
    events: [ev('e1', '2026-01-10T15:00:00Z'), ev('e2', '2026-01-10T18:00:00Z'), ev('e3', '2026-01-10T20:00:00Z'), ev('e4', null),
      ev('e5', '2026-01-10T21:00:00Z'), ev('e6', '2026-01-10T22:00:00Z'), ev('e7', '2026-01-10T23:00:00Z')],
    observations: [
      // e1: HOME 1.80 then 1.70 before the decision (14:50); a 1.10 acquired at 14:55 but dated 14:40 by the provider
      // must be ignored: the acquisition, not the provider time, decides availability.
      ob('e1', 'HOME', '1.80', '2026-01-10T14:30:00Z'), ob('e1', 'DRAW', '3.60', '2026-01-10T14:30:00Z'), ob('e1', 'AWAY', '4.50', '2026-01-10T14:30:00Z'),
      ob('e1', 'HOME', '1.70', '2026-01-10T14:45:00Z'),
      ob('e1', 'HOME', '1.10', '2026-01-10T14:55:00Z', {providerTime: '2026-01-10T14:40:00Z'}),
      // another bookmaker: admitted, never used
      ob('e1', 'AWAY', '1.01', '2026-01-10T14:30:00Z', {bookmaker: 'bk2'}),
      // e2: AWAY is the favourite
      ob('e2', 'HOME', '3.00', '2026-01-10T17:00:00Z'), ob('e2', 'DRAW', '3.20', '2026-01-10T17:00:00Z'), ob('e2', 'AWAY', '2.40', '2026-01-10T17:00:00Z'),
      // e3: incomplete 1X2
      ob('e3', 'HOME', '2.10', '2026-01-10T19:00:00Z'), ob('e3', 'AWAY', '3.40', '2026-01-10T19:00:00Z'),
      // e4: unknown kickoff
      ob('e4', 'HOME', '2.00', '2026-01-10T12:00:00Z'),
      // e5: tie for the favourite
      ob('e5', 'HOME', '2.50', '2026-01-10T20:00:00Z'), ob('e5', 'DRAW', '3.00', '2026-01-10T20:00:00Z'), ob('e5', 'AWAY', '2.50', '2026-01-10T20:00:00Z'),
      // e6: HOME favourite, match declared void: no VOID rule is approved (DEC-015), so it stays unsettled
      ob('e6', 'HOME', '1.50', '2026-01-10T21:00:00Z'), ob('e6', 'DRAW', '4.00', '2026-01-10T21:00:00Z'), ob('e6', 'AWAY', '6.00', '2026-01-10T21:00:00Z'),
      // e7: HOME favourite, no outcome
      ob('e7', 'HOME', '2.00', '2026-01-10T22:00:00Z'), ob('e7', 'DRAW', '3.50', '2026-01-10T22:00:00Z'), ob('e7', 'AWAY', '3.80', '2026-01-10T22:00:00Z'),
    ],
    outcomes: [out('e1', 'FINAL', 2, 1, '2026-01-10T17:00:00Z'), out('e2', 'FINAL', 1, 1, '2026-01-10T20:00:00Z'),
      out('e6', 'VOID', null, null, '2026-01-10T23:00:00Z')],
  });
}

// ---- Independent exact-fraction oracle ----
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
const frac = (n, d = 1n) => { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return {n: n / g, d: d / g}; };
const F = text => { const [w, f = ''] = text.replace('-', '').split('.'); const v = frac(BigInt(w + f), 10n ** BigInt(f.length)); return text.startsWith('-') ? frac(-v.n, v.d) : v; };
const fadd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fsub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const fmul = (a, b) => frac(a.n * b.n, a.d * b.d);
const feq = (a, b) => a.n === b.n && a.d === b.d;
// Bettor P/L of one bet, written from the payout: BACK pays S·O on a win (net S·O − S); LAY collects the backer's stake
// on a loss and pays the backer's profit on a win.
function oracleBet({side, stake, odds, outcome}) {
  const S = F(stake), O = F(odds);
  if (outcome === 'VOID') return frac(0n);
  const backerProfit = fsub(fmul(S, O), S);
  if (side === 'BACK') return outcome === 'WIN' ? backerProfit : frac(-S.n, S.d);
  return outcome === 'WIN' ? frac(-backerProfit.n, backerProfit.d) : S;
}
// A non-negative fraction rounded to the cent, HALF_EVEN.
function fcentsHalfEven(f) {
  const n = f.n * 100n, d = f.d;
  let q = n / d;
  const r2 = (n - q * d) * 2n;
  if (r2 > d || (r2 === d && q % 2n === 1n)) q += 1n;
  return frac(q, 100n);
}
function oracleMarket(bets, commission) {
  const gross = bets.map(oracleBet).reduce(fadd, frac(0n));
  const charged = gross.n > 0n ? fmul(gross, F(commission)) : frac(0n);
  return {gross, commission: charged, net: fsub(gross, charged)};
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const cents = (next, lo, hi) => { const v = lo + Math.floor(next() * (hi - lo + 1)); return `${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`; };

test('golden fixture: decisions on admitted prices only, exact settlement and metrics, labelled as a fixture', () => {
  const report = runBacktest(golden(), CONFIG, {codeVersion: 'test'});
  assert.equal(report.status, STATUS.OK);
  assert.deepEqual({...report.certification, notice: undefined}, {data_scope: 'FIXTURE', real_data_verdict: 'NOT_APPLICABLE', certified: false, notice: undefined});
  assert.match(report.certification.notice, /not a real return/);
  assert.ok(report.limits.every(limit => !/NOT.VERIFIED|VERIFIED/.test(limit)), 'the limits never restate a data verdict (PR #178 review)');
  assert.deepEqual(report.counts.decisions, {BACK: 4, NO_TRADE: 3});
  assert.deepEqual(report.counts.no_trade_by_reason, {FAVOURITE_TIE: 1, INCOMPLETE_1X2: 1, KICKOFF_UNKNOWN: 1});
  assert.deepEqual(report.counts.excluded_by_reason, {ACQUIRED_AFTER_DECISION: 1, KICKOFF_UNKNOWN: 1});
  assert.equal(report.counts.usable, 18);
  assert.deepEqual(report.bets.map(bet => [bet.event_id, bet.selection, bet.odds, bet.settlement?.outcome ?? null]),
    [['e1', 'HOME', '1.7', 'WIN'], ['e2', 'AWAY', '2.4', 'LOSE'], ['e6', 'HOME', '1.5', null], ['e7', 'HOME', '2', null]]);
  assert.equal(report.bets[0].observation_id, 'o0004', 'e1 is decided on the 1.70 acquired at 14:45, not the 1.10 acquired after the decision');
  assert.deepEqual(report.counts.unsettled_by_reason, {OUTCOME_MISSING: 1, VOID_NO_APPROVED_RULE: 1});
  // +0.70, −1: staked 2, net −0.30, ROI −0.15; cumulative 0.70 → −0.30, drawdown 1.00.
  assert.deepEqual({...report.metrics, rounded: undefined}, {unit: 'stake units', bets: 2, won: 1, lost: 1, corrected_results: 0, staked: '2', pl_gross: '-0.3',
    commission: '0', pl_net: '-0.3', roi: '-0.15', max_drawdown: '1', rounded: undefined});
  assert.equal(report.metrics.rounded.pl_net, '-0.30');
  assert.equal(report.metrics.rounded.roi, '-0.1500');
  assert.equal(report.config.commission_rate_used, '0');
  assert.match(report.config.settings_snapshot_id, /^[0-9a-f]{64}$/);
  assert.match(report.report_sha256, /^[0-9a-f]{64}$/);
});

test('anti-lookahead: acquisition after the decision excludes a record whatever its provider time; no acquisition time, no admission', () => {
  seq = 0;
  const base = {events: [ev('a', '2026-02-01T15:00:00Z')], outcomes: [out('a', 'FINAL', 0, 1, '2026-02-01T17:00:00Z')]};
  const late = runBacktest(input({...base, observations: ['HOME', 'DRAW', 'AWAY'].map((s, i) =>
    ob('a', s, ['2.00', '3.00', '4.00'][i], '2026-02-01T14:51:00Z', {providerTime: '2026-02-01T14:00:00Z'}))}), CONFIG);
  assert.equal(late.status, STATUS.INSUFFICIENT_PIT_DATA);
  assert.deepEqual(late.counts.excluded_by_reason, {ACQUIRED_AFTER_DECISION: 3});
  const missing = runBacktest(input({...base, observations: ['HOME', 'DRAW', 'AWAY'].map(s => ob('a', s, '2.50', null, {providerTime: '2026-02-01T10:00:00Z'}))}), CONFIG);
  assert.equal(missing.status, STATUS.INSUFFICIENT_PIT_DATA);
  assert.deepEqual(missing.counts.excluded_by_reason, {ACQUISITION_TIME_MISSING: 3});
  // Acquired in time but stamped by the provider after the decision: not PIT-verified, not admitted.
  const stamped = runBacktest(input({...base, observations: ['HOME', 'DRAW', 'AWAY'].map(s => ob('a', s, '2.50', '2026-02-01T14:49:00Z', {providerTime: '2026-02-01T14:52:00Z'}))}), CONFIG);
  assert.deepEqual(stamped.counts.excluded_by_reason, {PROVIDER_TIME_AFTER_DECISION: 3});
  // The decision boundary is inclusive: acquired exactly at kickoff − lead is admitted.
  const boundary = runBacktest(input({...base, observations: ['HOME', 'DRAW', 'AWAY'].map((s, i) => ob('a', s, ['2.00', '3.00', '4.00'][i], '2026-02-01T14:50:00Z'))}), CONFIG);
  assert.equal(boundary.status, STATUS.OK);
  assert.equal(boundary.counts.admitted, 3);
});

test('archive #40 profile: every pre-match observation acquired after kickoff gives INSUFFICIENT_PIT_DATA and no bet, P/L, ROI or drawdown', () => {
  seq = 0;
  const events = Array.from({length: 12}, (_, i) => ev(`k${i}`, `2026-10-05T${String(10 + i).padStart(2, '0')}:00:00Z`));
  const observations = events.flatMap((event, i) => ['HOME', 'DRAW', 'AWAY'].map((s, j) => {
    const kickoff = Date.parse(event.kickoff_utc);
    // acquired 80 minutes to 4 hours after kickoff, while the provider dates the price before kickoff
    const acquired = new Date(kickoff + (80 + (i * 3 + j) * 4) * 60000).toISOString();
    return ob(event.event_id, s, ['1.90', '3.40', '4.20'][j], acquired, {providerTime: new Date(kickoff - 3600000).toISOString()});
  }));
  const outcomes = events.map(event => out(event.event_id, 'FINAL', 1, 0, new Date(Date.parse(event.kickoff_utc) + 3 * 3600000).toISOString()));
  const report = runBacktest(input({events, observations, outcomes}), CONFIG);
  assert.equal(report.status, STATUS.INSUFFICIENT_PIT_DATA);
  assert.equal(report.counts.admitted, 0);
  assert.deepEqual(report.counts.excluded_by_reason, {ACQUIRED_AFTER_DECISION: 36});
  assert.deepEqual(report.bets, []);
  assert.equal(report.metrics, null);
  assert.equal(report.counts.decisions.BACK, 0);
  const text = canonicalJson(report);
  for (const word of ['pl_net', 'pl_gross', 'roi', 'max_drawdown', 'settlement']) assert.ok(!text.includes(`"${word}"`), `${word} must not appear`);
});

test('outcomes are invisible to the decision phase; a strategy cannot read them or invent a price', () => {
  const peek = view => (view.outcome ? {action: 'BACK', selection: 'HOME'} : {action: 'NO_TRADE', reason: 'X'});
  assert.throws(() => runBacktest(golden(), {...CONFIG, strategy: 'peek'}, {strategies: {peek}}), {code: 'VIEW_FIELD_NOT_AVAILABLE'});
  const score = view => (view.home_score >= 0 ? {action: 'NO_TRADE', reason: 'X'} : {action: 'NO_TRADE', reason: 'Y'});
  assert.throws(() => runBacktest(golden(), {...CONFIG, strategy: 'score'}, {strategies: {score}}), {code: 'VIEW_FIELD_NOT_AVAILABLE'});
  const tamper = view => { view.odds.HOME.odds = '9.99'; return {action: 'NO_TRADE', reason: 'X'}; };
  assert.throws(() => runBacktest(golden(), {...CONFIG, strategy: 'tamper'}, {strategies: {tamper}}), TypeError);
  const invent = () => ({action: 'BACK', selection: 'OVER'});
  assert.throws(() => runBacktest(golden(), {...CONFIG, strategy: 'invent'}, {strategies: {invent}}), {code: 'BAD_STRATEGY_DECISION'});
  // A getter that answers HOME to the check and AWAY to the bet is read once (PR #178 review NB-3).
  const shifty = view => { let reads = 0; return {action: 'BACK', get selection() { return reads++ === 0 ? 'HOME' : 'AWAY'; }}; };
  const shiftyReport = runBacktest(golden(), {...CONFIG, strategy: 'shifty'}, {strategies: {shifty}});
  assert.ok(shiftyReport.bets.every(bet => bet.selection === 'HOME'));
  // Any reason is counted, __proto__ included (PR #178 review NB-4).
  const proto = () => ({action: 'NO_TRADE', reason: '__proto__'});
  assert.equal(runBacktest(golden(), {...CONFIG, strategy: 'proto'}, {strategies: {proto}}).counts.no_trade_by_reason.__proto__, 6);
  // What the strategy sees: exactly the view fields, admitted prices of the configured bookmaker only.
  const seen = [];
  const spy = view => { seen.push(JSON.parse(JSON.stringify(view))); return {action: 'NO_TRADE', reason: 'SPY'}; };
  runBacktest(golden(), {...CONFIG, strategy: 'spy'}, {strategies: {spy}});
  const e1 = seen.find(view => view.event_id === 'e1');
  assert.deepEqual(Object.keys(e1).sort(), ['away', 'decision_time', 'event_id', 'home', 'kickoff_utc', 'odds', 'provider']);
  assert.deepEqual(e1.odds.HOME, {odds: '1.7', observation_id: 'o0004', acquired_at: '2026-01-10T14:45:00.000Z'});
  assert.equal(e1.odds.AWAY.odds, '4.5', 'the bk2 price is not seen');
});

test('anti-contamination: records and outcomes after the decision never change a decision', () => {
  const base = runBacktest(golden(), CONFIG);
  const decisions = report => report.bets.map(({event_id, selection, odds, observation_id}) => ({event_id, selection, odds, observation_id}));
  const polluted = golden();
  // extreme prices acquired after each decision, on every selection, and at the very kickoff
  for (const event of polluted.events.filter(event => event.kickoff_utc)) {
    for (const selection of ['HOME', 'DRAW', 'AWAY']) {
      polluted.observations.push(ob(event.event_id, selection, '1.01', new Date(Date.parse(event.kickoff_utc) - 9 * 60000).toISOString(), {providerTime: new Date(Date.parse(event.kickoff_utc) - 3600000).toISOString(), id: `late-${event.event_id}-${selection}`}));
      polluted.observations.push(ob(event.event_id, selection, '50', event.kickoff_utc, {id: `ko-${event.event_id}-${selection}`}));
    }
  }
  const after = runBacktest(polluted, CONFIG);
  assert.deepEqual(decisions(after), decisions(base));
  assert.deepEqual(after.metrics, base.metrics);
  // Every outcome flipped: settlement changes, decisions do not.
  const flipped = golden();
  flipped.outcomes = flipped.outcomes.map(o => (o.status === 'FINAL' ? {...o, home_score: o.away_score, away_score: o.home_score + 3} : o));
  const other = runBacktest(flipped, CONFIG);
  assert.deepEqual(decisions(other), decisions(base));
  assert.notDeepEqual(other.metrics, base.metrics);
});

test('determinism: any input order and repeated runs give the same report bytes; the CLI checks it', () => {
  const reference = canonicalJson(runBacktest(golden(), CONFIG, {codeVersion: 'x'}));
  const next = rng(20261020);
  for (let round = 0; round < 20; round++) {
    const shuffled = golden();
    for (const list of ['events', 'observations', 'outcomes']) shuffled[list] = shuffled[list].map(v => [next(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    assert.equal(canonicalJson(runBacktest(shuffled, CONFIG, {codeVersion: 'x'})), reference);
  }
  const dir = mkdtempSync(join(tmpdir(), 'hist-'));
  writeFileSync(join(dir, 'input.json'), JSON.stringify(golden()));
  writeFileSync(join(dir, 'config.json'), JSON.stringify(CONFIG));
  const line = execFileSync(process.execPath, ['tools/hist/backtest.mjs', '--input', join(dir, 'input.json'), '--config', join(dir, 'config.json'),
    '--out', join(dir, 'report.json'), '--code-version', 'x', '--repeat', '3'], {encoding: 'utf8', env: {PATH: process.env.PATH}});
  const summary = JSON.parse(line);
  assert.equal(readFileSync(join(dir, 'report.json'), 'utf8'), reference + '\n');
  assert.equal(summary.report_sha256, JSON.parse(reference).report_sha256);
  assert.equal(summary.status, 'OK');
  assert.equal(summary.certification.real_data_verdict, 'NOT_APPLICABLE');
  const bad = spawnSync(process.execPath, ['tools/hist/backtest.mjs', '--input', join(dir, 'config.json'), '--config', join(dir, 'config.json'), '--out', join(dir, 'x.json')], {encoding: 'utf8'});
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /BAD_HIST_INPUT/);
});

test('a technically OK run is not certified data: the run status and the certification verdict are separate (PR #178 NB-2)', () => {
  const real = golden();
  real.dataset = {...real.dataset, kind: 'REAL', description: 'synthetic values declared REAL to test the label only'};
  const report = runBacktest(real, CONFIG);
  assert.equal(report.status, STATUS.OK, 'the run itself succeeds');
  assert.deepEqual({...report.certification, notice: undefined}, {data_scope: 'REAL', real_data_verdict: 'NOT_VERIFIED', certified: false, notice: undefined});
  assert.match(report.certification.notice, /not a certification/);
  assert.equal(report.metrics.pl_net, runBacktest(golden(), CONFIG).metrics.pl_net, 'the label changes nothing in the computation');
  for (const name of ['scope', 'real_data_verdict', 'notice']) assert.ok(!Object.hasOwn(report, name), `${name} lives only in the certification block`);
  // No run, whatever its status, data or configuration, is certified; and no input field reaches the block.
  const empty = {...real, observations: []};
  const none = {...real, outcomes: []};
  for (const r of [report, runBacktest(golden(), CONFIG), runBacktest(empty, CONFIG), runBacktest(none, CONFIG), runBacktest(real, {...CONFIG, commission: '0.05'})]) {
    assert.equal(r.certification.certified, false);
    assert.notEqual(r.certification.real_data_verdict, 'VERIFIED');
  }
  assert.deepEqual([runBacktest(empty, CONFIG).status, runBacktest(none, CONFIG).status], [STATUS.INSUFFICIENT_PIT_DATA, STATUS.INSUFFICIENT_OUTCOMES]);
  assert.throws(() => runBacktest({...real, dataset: {...real.dataset, certified: true}}, CONFIG), {code: 'BAD_HIST_INPUT'});
  const engine = readFileSync(new URL('../src/hist/engine.mjs', import.meta.url), 'utf8');
  assert.equal([...engine.matchAll(/certified:/g)].length, 2, 'certified is set only by the two literal false values');
  assert.doesNotMatch(engine, /certified: (?!false)/);
});

test('admissible data but no bet: OK with no metrics, not a row of zeros (PR #178 review NB-1)', () => {
  seq = 0;
  const report = runBacktest(input({events: [ev('z', '2026-04-01T15:00:00Z')], observations: [ob('z', 'HOME', '2.00', '2026-04-01T14:00:00Z')],
    outcomes: [out('z', 'FINAL', 1, 0, '2026-04-01T17:00:00Z')]}), CONFIG);
  assert.equal(report.status, STATUS.OK);
  assert.deepEqual(report.counts.decisions, {BACK: 0, NO_TRADE: 1});
  assert.deepEqual(report.counts.no_trade_by_reason, {INCOMPLETE_1X2: 1});
  assert.equal(report.metrics, null);
  assert.deepEqual(report.bets, []);
});

test('a strategy cannot inject a price through Object.prototype (PR #178 review 6300543152, finding 1)', () => {
  // On the first decision (e1) the strategy plants prices on Object.prototype: a DRAW that e3 does not have, and a
  // HOME whose acquisition time would outrank every real HOME.
  const fake = {odds: '50', observation_id: 'FAKE', acquired_at: '9999-12-31T23:59:59.999Z'};
  const plant = () => { Object.prototype.DRAW = fake; Object.prototype.HOME = fake; };
  const clean = () => { delete Object.prototype.DRAW; delete Object.prototype.HOME; };
  let calls = 0;
  const seen = [];
  const spy = view => {
    if (calls++ === 0) plant();
    seen.push({event_id: view.event_id, odds: JSON.parse(JSON.stringify(view.odds))});
    return {action: 'NO_TRADE', reason: 'SPY'};
  };
  try { runBacktest(golden(), {...CONFIG, strategy: 'spy'}, {strategies: {spy}}); } finally { clean(); }
  assert.ok(seen.every(view => Object.values(view.odds).every(price => price.observation_id !== 'FAKE')), 'no planted price reaches a view');
  assert.deepEqual(Object.keys(seen.find(view => view.event_id === 'e3').odds), ['HOME', 'AWAY']);
  calls = 0;
  const hostile = view => {
    if (calls++ === 0) plant();
    return view.event_id === 'e3' ? {action: 'BACK', selection: 'DRAW'} : {action: 'NO_TRADE', reason: 'X'};
  };
  try { assert.throws(() => runBacktest(golden(), {...CONFIG, strategy: 'hostile'}, {strategies: {hostile}}), {code: 'BAD_STRATEGY_DECISION'}); }
  finally { clean(); }
  // The legitimate run is unchanged once the prototype is clean.
  assert.equal(runBacktest(golden(), CONFIG).bets[0].observation_id, 'o0004');
});

test('only another bookmaker admitted: INSUFFICIENT_PIT_DATA with no bet or metric (PR #178 review, mutation M6)', () => {
  seq = 0;
  const report = runBacktest(input({events: [ev('b', '2026-05-01T15:00:00Z')],
    observations: ['HOME', 'DRAW', 'AWAY'].map((s, i) => ob('b', s, ['1.80', '3.50', '4.50'][i], '2026-05-01T14:00:00Z', {bookmaker: 'bk2'})),
    outcomes: [out('b', 'FINAL', 1, 0, '2026-05-01T17:00:00Z')]}), CONFIG);
  assert.equal(report.counts.admitted, 3);
  assert.equal(report.counts.usable, 0);
  assert.equal(report.status, STATUS.INSUFFICIENT_PIT_DATA);
  assert.deepEqual(report.counts.decisions, {BACK: 0, NO_TRADE: 1});
  assert.deepEqual(report.counts.no_trade_by_reason, {NO_ADMISSIBLE_ODDS: 1});
  assert.deepEqual(report.bets, []);
  assert.equal(report.metrics, null);
});

test('rounded ROI is HALF_EVEN to 4 places on exact ties (PR #178 review, mutation M10)', () => {
  // One winning BACK at stake 1 and zero commission: ROI = odds − 1 exactly.
  const roiOf = odds => {
    seq = 0;
    return runBacktest(input({events: [ev('r', '2026-06-01T15:00:00Z')],
      observations: ['HOME', 'DRAW', 'AWAY'].map((s, i) => ob('r', s, [odds, '30', '40'][i], '2026-06-01T14:00:00Z')),
      outcomes: [out('r', 'FINAL', 1, 0, '2026-06-01T17:00:00Z')]}), CONFIG).metrics;
  };
  // 0.00135 → 0.0014 (DOWN or FLOOR would give 0.0013); 0.00125 → 0.0012 (HALF_UP or CEIL would give 0.0013).
  assert.deepEqual([roiOf('1.00135').roi, roiOf('1.00135').rounded.roi], ['0.00135', '0.0014']);
  assert.deepEqual([roiOf('1.00125').roi, roiOf('1.00125').rounded.roi], ['0.00125', '0.0012']);
});

test('same selection acquired at the same instant: the greater observation id wins, whatever the price (PR #178 review, mutation M12)', () => {
  const homeSeen = (priceA, priceB) => {
    seq = 0;
    const views = [];
    const spy = view => { views.push(JSON.parse(JSON.stringify(view.odds.HOME))); return {action: 'NO_TRADE', reason: 'SPY'}; };
    const at = '2026-07-01T14:00:00Z';
    runBacktest(input({events: [ev('t', '2026-07-01T15:00:00Z')], observations: [
      ob('t', 'HOME', priceB, at, {id: 'tb-b'}), ob('t', 'HOME', priceA, at, {id: 'tb-a'}),
      ob('t', 'DRAW', '3.00', at), ob('t', 'AWAY', '4.00', at)]}), {...CONFIG, strategy: 'spy'}, {strategies: {spy}});
    return views[0];
  };
  assert.deepEqual(homeSeen('1.50', '1.60'), {odds: '1.6', observation_id: 'tb-b', acquired_at: '2026-07-01T14:00:00.000Z'});
  assert.deepEqual(homeSeen('1.60', '1.50'), {odds: '1.5', observation_id: 'tb-b', acquired_at: '2026-07-01T14:00:00.000Z'});
});

test('INSUFFICIENT_OUTCOMES, same-provider settlement and outcomes known before kickoff', () => {
  const none = golden();
  none.outcomes = [];
  const report = runBacktest(none, CONFIG);
  assert.equal(report.status, STATUS.INSUFFICIENT_OUTCOMES);
  assert.equal(report.metrics, null);
  assert.equal(report.counts.settled, 0);
  assert.deepEqual(report.counts.unsettled_by_reason, {OUTCOME_MISSING: 4});
  // The same match under another provider id: its outcome is never used for the first provider's bet.
  seq = 0;
  const cross = input({events: [ev('m', '2026-03-01T15:00:00Z'), ev('m', '2026-03-01T15:00:00Z', 'H', 'A', 'other-provider')],
    observations: ['HOME', 'DRAW', 'AWAY'].map((s, i) => ob('m', s, ['1.60', '3.80', '5.50'][i], '2026-03-01T14:00:00Z')),
    outcomes: [out('m', 'FINAL', 3, 0, '2026-03-01T17:00:00Z', 'other-provider')]});
  assert.deepEqual(runBacktest(cross, CONFIG).counts.unsettled_by_reason, {OUTCOME_MISSING: 1});
  const early = golden();
  early.outcomes[0] = {...early.outcomes[0], acquired_at: '2026-01-10T14:00:00Z'};
  assert.deepEqual(runBacktest(early, CONFIG).counts.unsettled_by_reason, {OUTCOME_ACQUIRED_BEFORE_KICKOFF: 1, OUTCOME_MISSING: 1, VOID_NO_APPROVED_RULE: 1});
});

test('settlement agrees with an independent exact-fraction oracle, with commission on market net winnings', () => {
  const next = rng(4242);
  for (let i = 0; i < 1500; i++) {
    const bets = Array.from({length: 1 + Math.floor(next() * 4)}, () => ({side: next() < 0.5 ? 'BACK' : 'LAY', stake: cents(next, 1, 50000),
      odds: cents(next, 101, 100000), outcome: ['WIN', 'LOSE', 'VOID'][Math.floor(next() * 3)]}));
    const commission = ['0', '0.02', '0.05', '0.065'][Math.floor(next() * 4)];
    const got = settleMarket({bets, commission});
    const want = oracleMarket(bets, commission);
    assert.ok(feq(F(got.result.gross), want.gross), `gross ${i}`);
    assert.ok(feq(F(got.result.commission), want.commission), `commission ${i}`);
    assert.ok(feq(F(got.result.net), want.net), `net ${i}`);
    // Rounded totals reconcile to the cent and stay within half a cent of the exact values.
    assert.ok(feq(F(got.rounded.net), fsub(F(got.rounded.gross), F(got.rounded.commission))), `reconcile ${i}`);
    for (const name of ['gross', 'commission']) {
      const diff = fsub(F(got.rounded[name]), want[name]);
      assert.ok((diff.n < 0n ? -diff.n : diff.n) * 200n <= diff.d, `${name} rounding ${i}`);
    }
  }
  // The engine's metrics with commission, against the oracle over the golden bets. The engine settles through the paper
  // ledger, which charges each position's commission rounded to the cent, HALF_EVEN (DEC-013, HIST-LEDGER-01).
  const report = runBacktest(golden(), {...CONFIG, commission: '0.05', stake: '2.50'});
  const settled = report.bets.filter(bet => bet.settlement);
  const markets = settled.map(bet => {
    const m = oracleMarket([{side: 'BACK', stake: '2.50', odds: bet.odds, outcome: bet.settlement.outcome}], '0.05');
    const c = fcentsHalfEven(m.commission);
    return {gross: m.gross, commission: c, net: fsub(m.gross, c)};
  });
  assert.ok(feq(F(report.metrics.pl_gross), markets.map(m => m.gross).reduce(fadd, frac(0n))));
  assert.ok(feq(F(report.metrics.pl_net), markets.map(m => m.net).reduce(fadd, frac(0n))));
  assert.ok(feq(F(report.metrics.commission), markets.map(m => m.commission).reduce(fadd, frac(0n))));
  assert.equal(report.metrics.commission, '0.09'); // 5 % of the 1.75 won on e1 = 0.0875, charged 0.09
  assert.equal(report.config.commission_rate_used, '0.05');
});

test('invalid inputs and configurations are refused with the field named', () => {
  const g = golden();
  const cases = [
    [{...g, schema_version: 'v0'}, 'input.schema_version'],
    [{...g, extra: 1}, 'input.extra'],
    [{...g, dataset: {...g.dataset, kind: 'LIVE'}}, 'dataset.kind'],
    [{...g, events: [{...g.events[0], kickoff_utc: '2026-01-10T16:00:00+01:00'}, ...g.events.slice(1)]}, 'events[0].kickoff_utc'],
    [{...g, events: [{...g.events[0], kickoff_utc: '2026-02-30T16:00:00Z'}, ...g.events.slice(1)]}, 'events[0].kickoff_utc'],
    [{...g, events: [...g.events, g.events[0]]}, 'events[7].event_id'],
    [{...g, observations: [{...g.observations[0], odds: '1.00'}, ...g.observations.slice(1)]}, 'observations[0].odds'],
    [{...g, observations: [{...g.observations[0], odds: 1.5}, ...g.observations.slice(1)]}, 'observations[0].odds'],
    ...[' 2.00', '2.00 ', '+2', '02.00', '2,00', '2e1', '2.'].map(odds => [{...g, observations: [{...g.observations[0], odds}, ...g.observations.slice(1)]}, 'observations[0].odds']),
    [{...g, observations: [{...g.observations[0], selection: 'OVER'}, ...g.observations.slice(1)]}, 'observations[0].selection'],
    [{...g, observations: [{...g.observations[0], event_id: 'nope'}, ...g.observations.slice(1)]}, 'observations[0].event_id'],
    [{...g, observations: [...g.observations, g.observations[0]]}, `observations[${g.observations.length}].observation_id`],
    [{...g, outcomes: [{...g.outcomes[2], home_score: 1}, ...g.outcomes.slice(0, 2)]}, 'outcomes[0].home_score'],
    [{...g, outcomes: [...g.outcomes, g.outcomes[0]]}, 'outcomes[3].event_id'],
    [{...g, outcomes: [{...g.outcomes[0], home_score: -1}]}, 'outcomes[0].home_score'],
  ];
  for (const [bad, field] of cases) assert.throws(() => validateInput(bad), error => error instanceof HistInputError && error.field === field, field);
  const configs = [[{...CONFIG, lead_minutes: 0}, 'config.lead_minutes'], [{...CONFIG, stake: '0'}, 'config.stake'], [{...CONFIG, commission: '1'}, 'config.commission'],
    [{...CONFIG, strategy: 'martingale'}, 'config.strategy'], [{...CONFIG, extra: true}, 'config.extra'], [{...CONFIG, stake: 0.5}, 'config.stake']];
  for (const [bad, field] of configs) assert.throws(() => runBacktest(golden(), bad), error => error.code === 'BAD_HIST_INPUT' && error.field === field, field);
});

test('isolation from R1: the engine reads no FutPythonTrader path, no match analysis, no SQL and no environment', () => {
  const dir = new URL('../src/hist/', import.meta.url);
  const allowed = new Set(['node:crypto', '../math/core.mjs', '../math/decimal.mjs', '../math/money.mjs', '../pit/policy.mjs',
    '../markets/rules.mjs', '../markets/outcomes.mjs', '../ledger/paper-ledger.mjs', '../ledger/settlement.mjs', './admission.mjs', './contract.mjs', './strategies.mjs']);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.mjs'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    for (const [, target] of source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)) assert.ok(allowed.has(target), `${file} imports ${target}`);
    assert.doesNotMatch(source, /import\(/, `${file}: no dynamic import`);
    assert.doesNotMatch(source, /\bfpt_|\bSELECT\s|process\.env|fetch\(|analysis\//i, `${file}: no SQL, FutPythonTrader table, environment or network`);
  }
  const cli = readFileSync(new URL('../tools/hist/backtest.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(cli, /process\.env/, 'the CLI takes its input from arguments only');
});

test('1X2 settlement reuses the registry MATCH_ODDS resolver, no duplicate rule (DEC-006)', () => {
  seq = 0;
  // Each event has a different favourite, so a wrong selection passed to the resolver changes the result (review NB-1).
  const events = {h: ['2026-02-01T15:00:00Z', ['1.5', '4', '6'], [2, 0]], d: ['2026-02-01T17:00:00Z', ['4', '1.5', '6'], [1, 1]],
    a: ['2026-02-01T19:00:00Z', ['6', '4', '1.5'], [0, 3]], l: ['2026-02-01T21:00:00Z', ['1.5', '4', '6'], [0, 1]]};
  const observations = Object.entries(events).flatMap(([id, [kickoff, prices]]) => {
    const at = new Date(Date.parse(kickoff) - 30 * 60e3).toISOString();
    return ['HOME', 'DRAW', 'AWAY'].map((selection, i) => ob(id, selection, prices[i], at));
  });
  const outcomes = Object.entries(events).map(([id, [, , [hs, as]]]) => out(id, 'FINAL', hs, as, '2026-02-01T23:00:00Z'));
  const report = runBacktest(input({events: Object.entries(events).map(([id, [k]]) => ev(id, k)), observations, outcomes}), CONFIG, {codeVersion: 'test'});
  assert.equal(OUTCOME_RULE_VERSION, 'MATCH_ODDS@v2');
  assert.equal(report.versions.outcome_rule, 'MATCH_ODDS@v2');
  assert.deepEqual(report.bets.map(bet => [bet.event_id, bet.selection, bet.settlement.result, bet.settlement.outcome, bet.settlement.net]),
    [['h', 'HOME', 'HOME', 'WIN', '0.5'], ['d', 'DRAW', 'DRAW', 'WIN', '0.5'], ['a', 'AWAY', 'AWAY', 'WIN', '0.5'], ['l', 'HOME', 'AWAY', 'LOSE', '-1']]);
  for (const bet of report.bets) {
    const [hs, as] = events[bet.event_id][2];
    const ref = resolve({marketType: 'MATCH_ODDS', selection: bet.selection, match: {status: 'FINISHED', ft_home: hs, ft_away: as}});
    assert.deepEqual([bet.settlement.result, bet.settlement.outcome], [ref.winning_selection, ref.outcome]);
  }
  const engine = readFileSync(new URL('../src/hist/engine.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /home_score\s*[<>]/, 'no local 1X2 comparison of scores');
});

// One event, kickoff 15:00, decision 14:50, HOME favourite at 1.01 acquired at 14:30.
const single = ({acquired = '2026-03-01T17:00:00Z', stake = '1', commission = '0', score = [1, 0]} = {}) => {
  seq = 0;
  const at = '2026-03-01T14:30:00Z';
  return runBacktest(input({events: [ev('x', '2026-03-01T15:00:00Z')],
    observations: [ob('x', 'HOME', '1.01', at), ob('x', 'DRAW', '20', at), ob('x', 'AWAY', '30', at)],
    outcomes: [out('x', 'FINAL', score[0], score[1], acquired)]}), {...CONFIG, stake, commission}, {codeVersion: 'test'});
};

test('outcome time boundary: used from the kickoff on, never before it, also between decision and kickoff (review NB-2)', () => {
  assert.equal(single({acquired: '2026-03-01T15:00:00Z'}).bets[0].settlement.outcome, 'WIN', 'acquired exactly at kickoff: used');
  for (const acquired of ['2026-03-01T14:59:59Z', '2026-03-01T14:55:00Z', '2026-03-01T14:50:00Z']) {
    const report = single({acquired});
    assert.equal(report.bets[0].settlement, null, acquired);
    assert.deepEqual(report.counts.unsettled_by_reason, {OUTCOME_ACQUIRED_BEFORE_KICKOFF: 1}, acquired);
  }
});

test('metric rounding: HALF_EVEN to the cent on an exact half cent, net = rounded gross − rounded commission (review NB-3)', () => {
  // stake 0.5 at 1.01 wins 0.005: HALF_EVEN gives 0.00 (HALF_UP would give 0.01).
  const half = single({stake: '0.5'});
  assert.equal(half.metrics.pl_gross, '0.005');
  assert.equal(half.metrics.rounded.pl_gross, '0.00');
  assert.equal(half.metrics.rounded.pl_net, '0.00');
  // stake 1.5 at 1.01 wins 0.015, commission 5% = 0.00075, charged by the ledger rounded to the cent: 0.00 (DEC-013).
  const net = single({stake: '1.5', commission: '0.05'});
  assert.deepEqual([net.metrics.pl_gross, net.metrics.commission, net.metrics.pl_net], ['0.015', '0', '0.015']);
  assert.deepEqual([net.metrics.rounded.pl_gross, net.metrics.rounded.commission, net.metrics.rounded.pl_net], ['0.02', '0.00', '0.02']);
});

// ---- HIST-LINK-01 (#34 x #100): result versions (DEC-002), no VOID (DEC-015) ----
const rv = (event, version, status, hs, as, acquired, provenance = `futpythontrader:snapshot:${event}-v${version}`, provider = P) =>
  ({provider, event_id: event, version, status, home_score: hs, away_score: as, acquired_at: acquired, provenance});
const input2 = parts => ({...input(parts), schema_version: 'mp-hist-input-2'});
// One event x, kickoff 15:00, HOME favourite at 1.50 acquired at 14:30; results as given.
const versioned = (outcomes, config = {}) => {
  seq = 0;
  const at = '2026-03-01T14:30:00Z';
  return runBacktest(input2({events: [ev('x', '2026-03-01T15:00:00Z')],
    observations: [ob('x', 'HOME', '1.50', at), ob('x', 'DRAW', '4', at), ob('x', 'AWAY', '6', at)], outcomes}), {...CONFIG, ...config});
};

test('result versions: the latest validated FINAL settles, a correction is flagged, the cutoff selects what was known (DEC-002)', () => {
  const v1 = rv('x', 1, 'FINAL', 2, 1, '2026-03-01T17:00:00Z'), v2 = rv('x', 2, 'FINAL', 0, 1, '2026-03-02T09:00:00Z');
  const first = versioned([v1]);
  assert.equal(first.bets[0].settlement.outcome, 'WIN');
  assert.deepEqual(first.bets[0].settlement.resolution, {market_rule_id: 'MATCH_ODDS@v2', outcome_version: 1,
    provenance: 'futpythontrader:snapshot:x-v1', recorded_at: '2026-03-01T17:00:00.000Z', corrected: false});
  assert.deepEqual(first.settlement_policy, {outcomes_as_of: '2026-03-01T17:00:00.000Z', outcomes_as_of_source: 'LATEST_IN_INPUT', void_policy: 'NONE_APPROVED (DEC-015)'});
  const corrected = versioned([v2, v1]);
  assert.deepEqual([corrected.bets[0].settlement.result, corrected.bets[0].settlement.outcome, corrected.bets[0].settlement.net], ['AWAY', 'LOSE', '-1']);
  assert.deepEqual(corrected.bets[0].settlement.resolution, {market_rule_id: 'MATCH_ODDS@v2', outcome_version: 2, provenance: 'futpythontrader:snapshot:x-v2',
    recorded_at: '2026-03-02T09:00:00.000Z', corrected: true, first_final_version: 1, first_final_outcome: 'WIN'});
  assert.equal(corrected.metrics.corrected_results, 1);
  // The same input with a cutoff before the correction settles on v1, and the cutoff is part of the settings snapshot.
  const before = versioned([v1, v2], {outcomes_as_of: '2026-03-01T23:00:00Z'});
  assert.deepEqual([before.bets[0].settlement.outcome, before.bets[0].settlement.resolution.outcome_version], ['WIN', 1]);
  assert.equal(before.settlement_policy.outcomes_as_of_source, 'CONFIG');
  assert.notEqual(before.config.settings_snapshot_id, corrected.config.settings_snapshot_id);
  // A cutoff before any final: nothing is settled.
  const early = versioned([v1, v2], {outcomes_as_of: '2026-03-01T16:00:00Z'});
  assert.equal(early.status, STATUS.INSUFFICIENT_OUTCOMES);
  assert.deepEqual(early.counts.unsettled_by_reason, {NO_VALIDATED_FINAL: 1});
});

test('no VOID and no guess: NOT_FINAL, declared void and unsupported providers stay unsettled (DEC-015)', () => {
  const pending = versioned([rv('x', 1, 'NOT_FINAL', null, null, '2026-03-01T17:00:00Z')]);
  assert.deepEqual([pending.status, pending.bets[0].settlement], [STATUS.INSUFFICIENT_OUTCOMES, null]);
  assert.deepEqual(pending.counts.unsettled_by_reason, {NO_VALIDATED_FINAL: 1});
  // A later FINAL after a postponement settles normally.
  const played = versioned([rv('x', 1, 'NOT_FINAL', null, null, '2026-03-01T17:00:00Z'), rv('x', 2, 'FINAL', 1, 0, '2026-03-08T17:00:00Z')]);
  assert.deepEqual([played.bets[0].settlement.outcome, played.bets[0].settlement.resolution.corrected], ['WIN', false]);
  // A FINAL acquired before the kickoff is ignored; a later one is used.
  const mixed = versioned([rv('x', 1, 'FINAL', 0, 2, '2026-03-01T14:59:00Z'), rv('x', 2, 'FINAL', 1, 0, '2026-03-01T17:00:00Z')]);
  assert.deepEqual([mixed.bets[0].settlement.outcome, mixed.bets[0].settlement.resolution.outcome_version], ['WIN', 2]);
  assert.equal(mixed.counts.result_versions_ignored_before_kickoff, 1, 'the ignored pre-kickoff version is counted (review NB-1)');
  assert.equal(played.counts.result_versions_ignored_before_kickoff, 0);
  // A void announced before the match keeps its reason (review NB-2).
  const announced = golden();
  announced.outcomes = announced.outcomes.map(o => (o.event_id === 'e6' ? {...o, acquired_at: '2026-01-10T10:00:00Z'} : o));
  assert.equal(runBacktest(announced, CONFIG).counts.unsettled_by_reason.VOID_NO_APPROVED_RULE, 1);
  // No result at all: no invented cutoff (review NB-4).
  const none = versioned([]);
  assert.deepEqual([none.settlement_policy.outcomes_as_of, none.settlement_policy.outcomes_as_of_source], [null, 'NO_OUTCOMES']);
  // The input-1 VOID is never applied as a refund: no stake is returned, the bet is not in the metrics.
  const legacy = golden();
  const e6 = runBacktest(legacy, CONFIG).bets.find(bet => bet.event_id === 'e6');
  assert.equal(e6.settlement, null);
  // A provider that is not one of MatchPilot's two football APIs has no result rule.
  seq = 0;
  const other = runBacktest(input2({events: [ev('y', '2026-03-01T15:00:00Z', 'H', 'A', 'some-feed')],
    observations: ['HOME', 'DRAW', 'AWAY'].map((s, i) => ob('y', s, ['1.5', '4', '6'][i], '2026-03-01T14:30:00Z', {provider: 'some-feed'})),
    outcomes: [rv('y', 1, 'FINAL', 1, 0, '2026-03-01T17:00:00Z', 'feed:1', 'some-feed')]}), CONFIG);
  assert.deepEqual(other.counts.unsettled_by_reason, {OUTCOME_PROVIDER_UNSUPPORTED: 1});
  const engine = readFileSync(new URL('../src/hist/engine.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /'VOID'\s*\?|outcome === 'VOID'|outcome: 'VOID'/, 'the engine never applies a VOID');
});

test('mp-hist-input-2 validation: versions unique and monotonic, NOT_FINAL without scores, provenance required', () => {
  seq = 0;
  const base = {events: [ev('x', '2026-03-01T15:00:00Z')], observations: []};
  const ok = [rv('x', 1, 'FINAL', 1, 0, '2026-03-01T17:00:00Z'), rv('x', 2, 'FINAL', 1, 1, '2026-03-02T17:00:00Z')];
  assert.equal(validateInput(input2({...base, outcomes: ok})).outcomes.length, 2);
  const cases = [
    [[ok[0], {...ok[1], version: 1}], 'outcomes[1].version'],
    [[ok[0], {...ok[1], acquired_at: '2026-03-01T16:00:00Z'}], 'outcomes[1].acquired_at'],
    [[{...ok[0], status: 'NOT_FINAL'}], 'outcomes[0].home_score'],
    [[{...ok[0], status: 'VOID', home_score: null, away_score: null}], 'outcomes[0].status'],
    [[{...ok[0], version: 0}], 'outcomes[0].version'],
    [[{...ok[0], version: '1'}], 'outcomes[0].version'],
    [[{...ok[0], provenance: ''}], 'outcomes[0].provenance'],
    [[(({provenance, ...rest}) => rest)(ok[0])], 'outcomes[0].provenance'],
  ];
  for (const [outcomes, field] of cases) assert.throws(() => validateInput(input2({...base, outcomes})), error => error instanceof HistInputError && error.field === field, field);
  // An input-1 outcome shape under the input-2 schema is refused, not reinterpreted.
  assert.throws(() => validateInput(input2({...base, outcomes: [out('x', 'FINAL', 1, 0, '2026-03-01T17:00:00Z')]})), {code: 'BAD_HIST_INPUT'});
  assert.throws(() => runBacktest(golden(), {...CONFIG, outcomes_as_of: '2026-03-01'}), error => error.field === 'config.outcomes_as_of');
  // Same data as input-1 and as input-2: the same decisions and P/L.
  const legacy = runBacktest(golden(), CONFIG);
  const g = golden();
  const asV2 = {...g, schema_version: 'mp-hist-input-2', outcomes: g.outcomes.filter(o => o.status === 'FINAL')
    .map(o => rv(o.event_id, 1, 'FINAL', o.home_score, o.away_score, o.acquired_at, `mp-hist-input-1:${P}:${o.event_id}`))};
  const v2 = runBacktest(asV2, CONFIG);
  assert.deepEqual(v2.metrics, legacy.metrics);
  assert.deepEqual(v2.bets.filter(b => b.settlement).map(b => b.settlement), legacy.bets.filter(b => b.settlement).map(b => b.settlement));
});

// ---- HIST-LEDGER-01 (#34 x #99): every bet is a paper-ledger position, the only P/L path ----
test('each bet is a ledger position: opened at its decision, settled by settleFromResult, the report reconciles with the ledger', () => {
  const report = runBacktest(golden(), CONFIG);
  const ledger = report.ledger;
  // 4 BACK bets at stake 1: notional allocation 4 (not a bankroll); 1 allocation + 4 opens + 2 settlements x 3 entries.
  assert.deepEqual({...ledger, entries_sha256: undefined, account_id: undefined}, {ledger_version: 'mp-paper-ledger-1', notional_allocation: '4', entries: 11,
    entries_sha256: undefined, account_id: undefined, state: {cash_balance: '3.7', realized_pnl: '-0.3', settled_commission: '0', reserved_funds: '2',
      open_position_count: 2, reconciled: true}});
  assert.equal(ledger.account_id, `hist:${report.config.settings_snapshot_id}`);
  assert.match(ledger.entries_sha256, /^[0-9a-f]{64}$/);
  // The bet P/L is the ledger's, and the metrics add up to the ledger's realized P/L.
  assert.deepEqual(report.bets.map(bet => [bet.position_id, bet.settlement?.ledger_entries ?? null]),
    [['futpythontrader:e1', [6, 7, 8]], ['futpythontrader:e2', [9, 10, 11]], ['futpythontrader:e6', null], ['futpythontrader:e7', null]]);
  assert.equal(report.metrics.pl_net, ledger.state.realized_pnl);
  // Unsettled bets stay open positions with their exposure reserved: nothing is refunded (DEC-015).
  assert.equal(ledger.state.reserved_funds, '2');
  // With commission: 5 % of the 1.75 won at stake 2.50 on e1 is 0.0875, charged 0.09 by the ledger (DEC-013).
  const fee = runBacktest(golden(), {...CONFIG, commission: '0.05', stake: '2.50'});
  assert.deepEqual([fee.bets[0].settlement.gross, fee.bets[0].settlement.commission, fee.bets[0].settlement.net], ['1.75', '0.09', '1.66']);
  assert.deepEqual([fee.ledger.state.settled_commission, fee.ledger.state.realized_pnl, fee.metrics.pl_net], ['0.09', '-0.84', '-0.84']);
  assert.equal(fee.ledger.state.reconciled, true);
  // No bet: no ledger.
  const none = runBacktest(golden(), {...CONFIG, strategy: 'never'}, {strategies: {never: () => ({action: 'NO_TRADE', reason: 'NEVER'})}});
  assert.equal(none.ledger, undefined);
  const engine = readFileSync(new URL('../src/hist/engine.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(engine, /settleMarket/, 'the ledger is the only P/L path of the engine');
});
