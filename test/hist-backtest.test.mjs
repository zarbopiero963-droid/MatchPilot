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
import {STATUS, runBacktest} from '../src/hist/engine.mjs';

const CONFIG = {strategy: 'mp-ref-fav-back-1', bookmaker: 'bk1', lead_minutes: 10, stake: '1', commission: '0'};
const P = 'fixture-provider';

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
      // e6: HOME favourite, match voided
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
  assert.equal(report.scope, 'FIXTURE');
  assert.equal(report.real_data_verdict, 'NOT VERIFIED');
  assert.match(report.notice, /not a real return/);
  assert.deepEqual(report.counts.decisions, {BACK: 4, NO_TRADE: 3});
  assert.deepEqual(report.counts.no_trade_by_reason, {FAVOURITE_TIE: 1, INCOMPLETE_1X2: 1, KICKOFF_UNKNOWN: 1});
  assert.deepEqual(report.counts.excluded_by_reason, {ACQUIRED_AFTER_DECISION: 1, KICKOFF_UNKNOWN: 1});
  assert.equal(report.counts.usable, 18);
  assert.deepEqual(report.bets.map(bet => [bet.event_id, bet.selection, bet.odds, bet.settlement?.outcome ?? null]),
    [['e1', 'HOME', '1.7', 'WIN'], ['e2', 'AWAY', '2.4', 'LOSE'], ['e6', 'HOME', '1.5', 'VOID'], ['e7', 'HOME', '2', null]]);
  assert.equal(report.bets[0].observation_id, 'o0004', 'e1 is decided on the 1.70 acquired at 14:45, not the 1.10 acquired after the decision');
  assert.deepEqual(report.counts.unsettled_by_reason, {OUTCOME_MISSING: 1});
  // +0.70, −1, void: staked 2, net −0.30, ROI −0.15; cumulative 0.70 → −0.30 → −0.30, drawdown 1.00.
  assert.deepEqual({...report.metrics, rounded: undefined}, {unit: 'stake units', bets: 3, won: 1, lost: 1, void: 1, staked: '2', pl_gross: '-0.3',
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
  const bad = spawnSync(process.execPath, ['tools/hist/backtest.mjs', '--input', join(dir, 'config.json'), '--config', join(dir, 'config.json'), '--out', join(dir, 'x.json')], {encoding: 'utf8'});
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /BAD_HIST_INPUT/);
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
  assert.deepEqual(runBacktest(early, CONFIG).counts.unsettled_by_reason, {OUTCOME_ACQUIRED_BEFORE_KICKOFF: 1, OUTCOME_MISSING: 1});
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
  // The engine's metrics with commission, against the oracle over the golden bets.
  const report = runBacktest(golden(), {...CONFIG, commission: '0.05', stake: '2.50'});
  const settled = report.bets.filter(bet => bet.settlement);
  const markets = settled.map(bet => oracleMarket([{side: 'BACK', stake: '2.50', odds: bet.odds, outcome: bet.settlement.outcome}], '0.05'));
  assert.ok(feq(F(report.metrics.pl_net), markets.map(m => m.net).reduce(fadd, frac(0n))));
  assert.ok(feq(F(report.metrics.commission), markets.map(m => m.commission).reduce(fadd, frac(0n))));
  assert.equal(report.metrics.commission, '0.0875'); // 5 % of the 1.75 won on e1
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
    './admission.mjs', './contract.mjs', './strategies.mjs']);
  for (const file of readdirSync(dir).filter(name => name.endsWith('.mjs'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    for (const [, target] of source.matchAll(/^\s*import\s[^;]*?from\s+'([^']+)'/gm)) assert.ok(allowed.has(target), `${file} imports ${target}`);
    assert.doesNotMatch(source, /import\(/, `${file}: no dynamic import`);
    assert.doesNotMatch(source, /\bfpt_|\bSELECT\s|process\.env|fetch\(|analysis\//i, `${file}: no SQL, FutPythonTrader table, environment or network`);
  }
  const cli = readFileSync(new URL('../tools/hist/backtest.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(cli, /process\.env/, 'the CLI takes its input from arguments only');
});
