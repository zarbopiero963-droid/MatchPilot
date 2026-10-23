// PERSIST-STORE-01: the staged persistence schema (db/staged/030-persistence.sql) and its store, on a throwaway
// PostgreSQL schema. The schema is applied here by the test only; migrate() never sees the staged file.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {accountState, correctSettlement, createLedger, hedgePosition, openPosition, replay, settlePosition} from '../src/ledger/paper-ledger.mjs';
import {runBacktest} from '../src/hist/engine.mjs';
import {settleFromResult} from '../src/ledger/settlement.mjs';
import {fromFutPythonTrader} from '../src/markets/outcomes.mjs';
import {applyToLedger, createAccount, listStrategies, loadBacktest, loadLedger, loadStrategy, persistenceAvailable, saveBacktest, saveStrategy} from '../src/persistence/store.mjs';

const STAGED = readFileSync(new URL('../db/staged/030-persistence.sql', import.meta.url), 'utf8');

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', reject);
    child.once('exit', code => (code === 0 ? resolve(output) : reject(new Error(`node ${args.join(' ')} exited ${code}\n${output}`))));
  });
}

async function withSchema(t, name, body, {staged = true} = {}) {
  const pg = (await import('pg')).default;
  const rootUrl = process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt';
  const dbUrl = new URL(rootUrl);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(dbUrl.hostname), 'remote PostgreSQL is forbidden');
  const root = new pg.Client({connectionString: rootUrl, connectionTimeoutMillis: 2000});
  try { await root.connect(); }
  catch (cause) {
    await root.end().catch(() => {});
    if (process.env.CI) throw cause;
    return t.skip('throwaway postgres unavailable');
  }
  const schema = `persist_${name}_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const connect = async () => { const c = new pg.Client({connectionString: dbUrl.toString()}); await c.connect(); return c; };
    const db = await connect();
    try {
      if (staged) await db.query(STAGED);
      await body(db, connect, schema);
    } finally { await db.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
}

const code = async promise => { try { await promise; return 'OK'; } catch (error) { return error.code; } };

test('persistence schema: staged outside migrations/, additive only, idempotent, append-only enforced by the database', {timeout: 90000}, async t => {
  assert.ok(!readdirSync(new URL('../migrations/', import.meta.url)).some(f => /persistence/.test(f)), 'not a migration yet');
  // Additive only: every statement creates something; none drops, alters, deletes, updates, inserts or grants.
  const code0 = STAGED.replace(/--.*$/gm, '');
  assert.doesNotMatch(code0, /^\s*(DROP|ALTER|DELETE|TRUNCATE|UPDATE|INSERT|GRANT|REVOKE|COMMENT)\b/im, 'additive only');
  const statements = code0.split(/\$\$[\s\S]*?\$\$/).join('').split(';').map(x => x.trim()).filter(Boolean);
  for (const statement of statements) assert.match(statement, /^CREATE (TABLE IF NOT EXISTS|UNIQUE INDEX IF NOT EXISTS|OR REPLACE (FUNCTION|TRIGGER))\b/, statement.slice(0, 60));
  await withSchema(t, 'schema', async (db, connect, schema) => {
    const catalog = async () => (await db.query(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = $1 ORDER BY 1, 2`, [schema])).rows;
    const constraints = async () => (await db.query(`SELECT conrelid::regclass::text AS t, conname, pg_get_constraintdef(oid) AS d FROM pg_constraint
      WHERE connamespace = $1::regnamespace ORDER BY 1, 2`, [schema])).rows;
    const before = {columns: await catalog(), constraints: await constraints()};
    assert.equal(await persistenceAvailable(db), false);
    assert.equal(await code(createAccount(db, {accountId: 'a', initialAllocation: '100', at: 't'})), 'PERSISTENCE_UNAVAILABLE');
    await db.query(STAGED);
    await db.query(STAGED); // idempotent
    assert.equal(await persistenceAvailable(db), true);
    const NEW = ['paper_ledger_entries', 'paper_ledger_keys', 'strategy_definitions', 'strategy_versions', 'saved_backtests'];
    const after = {columns: (await catalog()).filter(c => !NEW.includes(c.table_name)), constraints: (await constraints()).filter(c => !NEW.includes(c.t.split('.').at(-1)))};
    assert.deepEqual(after, before, 'no existing column or constraint changes');

    await createAccount(db, {accountId: 'a', initialAllocation: '100', at: '2026-10-23T10:00:00Z'});
    await saveStrategy(db, {key: 's', name: 'S', definition: {selection: 'HOME', side: 'BACK'}});
    // One row in every table, so the row-level triggers have something to refuse.
    await applyToLedger(db, 'a', openPosition, {mode: 'ACTIVE_OPERATIONAL', positionId: 'p', side: 'BACK', odds: '2', stake: '1', commissionRate: '0',
      settingsSnapshotId: 'cfg', idempotencyKey: 'k', at: 't'});
    await saveBacktest(db, {name: 'b', responseText: JSON.stringify({reader: {}, report: report(), events: []})});
    for (const [table, n] of Object.entries({paper_ledger_entries: 2, paper_ledger_keys: 1, strategy_definitions: 1, strategy_versions: 1, saved_backtests: 1})) {
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, n, table);
    }
    for (const sql of [`UPDATE paper_ledger_entries SET entry = entry`, `DELETE FROM paper_ledger_entries`, `TRUNCATE paper_ledger_entries`,
      `UPDATE paper_ledger_keys SET fingerprint = fingerprint`, `DELETE FROM strategy_definitions`, `TRUNCATE strategy_definitions CASCADE`,
      `UPDATE strategy_versions SET name = 'x'`, `DELETE FROM strategy_versions`, `UPDATE saved_backtests SET name = 'x'`,
      `DELETE FROM saved_backtests`, `TRUNCATE saved_backtests`, `DELETE FROM paper_ledger_keys`, `UPDATE strategy_definitions SET definition = definition`]) {
      assert.match(await db.query(sql).then(() => 'OK', e => e.message), /APPEND_ONLY/, sql);
    }
    // seq must be contiguous; superseded_at can be set once only.
    const entry = (await db.query(`SELECT entry, entry_sha256 FROM paper_ledger_entries`)).rows[0];
    assert.match(await db.query(`INSERT INTO paper_ledger_entries(account_id, seq, type, entry, entry_sha256) VALUES('a', 4, 'OPEN', $1, $2)`,
      [entry.entry, entry.entry_sha256]).then(() => 'OK', e => e.message), /LEDGER_SEQ/);
    await db.query(`UPDATE strategy_versions SET superseded_at = now()`);
    assert.match(await db.query(`UPDATE strategy_versions SET superseded_at = now()`).then(() => 'OK', e => e.message), /APPEND_ONLY/);
  }, {staged: false});
});

// Seeded operations applied to an in-memory ledger and, in parallel, through the store: same results, same refusals and
// the same account state after every step, also when the stored ledger is read back on a fresh connection.
function rng(seed) { let x = seed >>> 0 || 1; return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 2 ** 32; }

test('persistence store: replay from the database equals the in-memory ledger (seeded oracle, restarts, idempotency)', {timeout: 120000}, async t => {
  await withSchema(t, 'oracle', async (db, connect) => {
    for (const seed of [1, 2, 3]) {
      const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
      const account = `acct-${seed}`, at = i => `2026-10-23T10:${String(i % 60).padStart(2, '0')}:00Z`;
      const mem = createLedger({accountId: account, initialAllocation: '1000', at: at(0)});
      await createAccount(db, {accountId: account, initialAllocation: '1000', at: at(0)});
      const ids = [], used = [];
      for (let i = 1; i <= 60; i++) {
        let op, args;
        const roll = R();
        if (roll < 0.35 || ids.length === 0) {
          const id = `p${i}`;
          op = openPosition; args = {mode: pick(['ACTIVE_OPERATIONAL', 'ACTIVE_OPERATIONAL', 'PAUSED']), positionId: id, side: pick(['BACK', 'LAY']),
            odds: pick(['1.5', '2.04', '3.3']), stake: pick(['5', '12.5', '40']), commissionRate: '0.05', settingsSnapshotId: 'cfg', at: at(i),
            scope: R() < 0.5 ? {strategy: 's1', match: `m${i % 4}`} : undefined, idempotencyKey: `k${i}`};
        } else if (roll < 0.5) {
          op = hedgePosition; args = {mode: 'ACTIVE_OPERATIONAL', positionId: pick(ids), side: pick(['BACK', 'LAY']), odds: '2.5', stake: '3', at: at(i), idempotencyKey: `k${i}`};
        } else if (roll < 0.75) {
          op = settlePosition; args = {positionId: pick(ids), outcome: pick(['WIN', 'LOSE', 'VOID']), at: at(i), idempotencyKey: `k${i}`};
        } else if (roll < 0.85) {
          op = correctSettlement; args = {positionId: pick(ids), outcome: pick(['WIN', 'LOSE']), reason: 'result corrected', at: at(i), idempotencyKey: `k${i}`};
        } else if (used.length) {
          [op, args] = pick(used); // the same request again: ALREADY_APPLIED on both sides
        } else continue;
        used.push([op, args]);
        let expected;
        try { expected = op(mem, args); } catch (error) { expected = {error: error.code}; }
        let got;
        try { got = (await applyToLedger(db, account, op, args)).result; } catch (error) { got = {error: error.code}; }
        assert.deepEqual(got, expected, `seed ${seed} step ${i}`);
        if (op === openPosition && !expected.error && !ids.includes(args.positionId)) ids.push(args.positionId);
        if (i % 15 === 0) {
          // A restart: a new connection reads the ledger back from the rows.
          const fresh = await connect();
          try { assert.deepEqual(accountState(await loadLedger(fresh, account)), accountState(mem), `seed ${seed} restart at ${i}`); }
          finally { await fresh.end(); }
        }
      }
      const stored = await loadLedger(db, account);
      assert.deepEqual(accountState(stored), accountState(mem));
      // Not only the totals: every entry and every replayed position (legs, resolution, market, scope, history).
      const plain = value => JSON.parse(JSON.stringify(value));
      assert.deepEqual(plain(stored.entries), plain(mem.entries));
      assert.deepEqual(plain(replay(stored).positions.values()), plain(replay(mem).positions.values()));
      assert.deepEqual([...stored.keys], [...mem.keys]);
      assert.equal(stored.entries.length, mem.entries.length);
      assert.equal(accountState(stored).reconciled, true);
    }
  });
});

test('persistence store: idempotency survives a restart, scope order does not matter, a conflict writes nothing', {timeout: 60000}, async t => {
  await withSchema(t, 'idem', async (db, connect) => {
    await createAccount(db, {accountId: 'a', initialAllocation: '100', at: 't0'});
    assert.equal(await code(createAccount(db, {accountId: 'a', initialAllocation: '100', at: 't0'})), 'ACCOUNT_EXISTS');
    const open = {mode: 'ACTIVE_OPERATIONAL', positionId: 'p1', side: 'BACK', odds: '2', stake: '10', commissionRate: '0.05', settingsSnapshotId: 'cfg',
      scope: {strategy: 's', match: 'm'}, idempotencyKey: 'k1', at: 't1'};
    assert.equal((await applyToLedger(db, 'a', openPosition, open)).result.status, 'APPLIED');
    const fresh = await connect();
    try {
      const rows = async () => (await fresh.query(`SELECT (SELECT count(*) FROM paper_ledger_entries)::int AS e, (SELECT count(*) FROM paper_ledger_keys)::int AS k`)).rows[0];
      const n = await rows();
      const again = await applyToLedger(fresh, 'a', openPosition, {...open, scope: {match: 'm', strategy: 's'}});
      assert.deepEqual(again.result, {status: 'ALREADY_APPLIED', entries: [2]});
      assert.deepEqual(await rows(), n, 'no second row');
      assert.equal(await code(applyToLedger(fresh, 'a', openPosition, {...open, stake: '11'})), 'IDEMPOTENCY_CONFLICT');
      assert.equal(await code(applyToLedger(fresh, 'a', openPosition, {...open, idempotencyKey: 'k2', positionId: 'p2', stake: '1000'})), 'INSUFFICIENT_AVAILABLE_BANKROLL');
      assert.deepEqual(await rows(), n, 'refusals write nothing');
      assert.equal(await code(applyToLedger(fresh, 'nobody', openPosition, open)), 'UNKNOWN_ACCOUNT');
    } finally { await fresh.end(); }
  });
});

test('persistence store: concurrent writers of one account are serialized, a tampered row is detected', {timeout: 60000}, async t => {
  await withSchema(t, 'race', async (db, connect) => {
    await createAccount(db, {accountId: 'a', initialAllocation: '1000', at: 't0'});
    const clients = await Promise.all([1, 2, 3, 4].map(() => connect()));
    try {
      const results = await Promise.all(clients.map((c, i) => applyToLedger(c, 'a', openPosition, {mode: 'ACTIVE_OPERATIONAL', positionId: `p${i}`,
        side: 'BACK', odds: '2', stake: '10', commissionRate: '0', settingsSnapshotId: 'cfg', idempotencyKey: `k${i}`, at: 't1'})));
      assert.ok(results.every(r => r.result.status === 'APPLIED'));
    } finally { await Promise.all(clients.map(c => c.end())); }
    const seqs = (await db.query(`SELECT seq FROM paper_ledger_entries WHERE account_id = 'a' ORDER BY seq`)).rows.map(r => r.seq);
    assert.deepEqual(seqs, [1, 2, 3, 4, 5]);
    assert.equal(accountState(await loadLedger(db, 'a')).open_position_count, 4);
    // A row changed behind the store's back (owner of the table disabling the trigger) is refused on read.
    await db.query(`ALTER TABLE paper_ledger_entries DISABLE TRIGGER paper_ledger_entries_append_only`);
    await db.query(`UPDATE paper_ledger_entries SET entry = replace(entry, '"10"', '"1"') WHERE seq = 2`);
    await db.query(`ALTER TABLE paper_ledger_entries ENABLE TRIGGER paper_ledger_entries_append_only`);
    assert.equal(await code(loadLedger(db, 'a')), 'LEDGER_CORRUPT');
  });
});

test('persistence store: strategies are versioned by key, immutable by content id, a forged id collision is refused', {timeout: 60000}, async t => {
  await withSchema(t, 'strat', async db => {
    const v1 = await saveStrategy(db, {key: 'fav-home', name: 'Casa favorita', definition: {selection: 'HOME', side: 'BACK', conditions: {odds_max: '2.50'}}});
    assert.equal(v1.status, 'SAVED');
    assert.equal(v1.version, 1);
    // The same rules written differently: same content id, no new version.
    const same = await saveStrategy(db, {key: 'fav-home', name: 'Casa favorita', definition: {side: 'BACK', selection: 'HOME', conditions: {odds_max: '2.5'}}});
    assert.deepEqual([same.status, same.version, same.strategy_id], ['UNCHANGED', 1, v1.strategy_id]);
    const v2 = await saveStrategy(db, {key: 'fav-home', name: 'Casa favorita', definition: {selection: 'HOME', side: 'BACK', conditions: {odds_max: '2.2'}}});
    assert.deepEqual([v2.status, v2.version], ['SAVED', 2]);
    assert.notEqual(v2.strategy_id, v1.strategy_id);
    const current = await loadStrategy(db, 'fav-home');
    assert.deepEqual([current.version, current.strategy_id, current.superseded_at], [2, v2.strategy_id, null]);
    const old = await loadStrategy(db, 'fav-home', {version: 1});
    assert.equal(old.strategy_id, v1.strategy_id);
    assert.ok(old.superseded_at);
    assert.deepEqual(old.definition, {version: 'mp-strategy-def-1', market: 'MATCH_ODDS', selection: 'HOME', side: 'BACK', conditions: {odds_max: '2.5'}});
    assert.deepEqual((await listStrategies(db)).map(s => [s.key, s.version]), [['fav-home', 2]]);
    assert.equal(await loadStrategy(db, 'missing'), null);
    for (const bad of [{key: 'Bad Key', name: 'x', definition: {selection: 'HOME', side: 'BACK'}}, {key: 'k', name: ' ', definition: {selection: 'HOME', side: 'BACK'}},
      {key: 'k', name: 'x', definition: {selection: 'NOPE', side: 'BACK'}}]) {
      await assert.rejects(saveStrategy(db, bad));
    }
    // A different definition stored under the id another one hashes to: refused, never merged.
    const target = {selection: 'DRAW', side: 'LAY'};
    const {definitionId, normalizeDefinition} = await import('../src/hist/strategy-def.mjs');
    await db.query(`INSERT INTO strategy_definitions(strategy_id, definition, definition_sha256, definition_version) VALUES($1, '{}', $2, 'mp-strategy-def-1')`,
      [definitionId(normalizeDefinition(target)), '0'.repeat(64)]);
    assert.equal(await code(saveStrategy(db, {key: 'draw-lay', name: 'Pareggio', definition: target})), 'STRATEGY_ID_COLLISION');
    assert.equal(await loadStrategy(db, 'draw-lay'), null, 'nothing saved');
  });
});

// A real engine report (golden-style fixture), sealed by the engine.
function report(strategy = 'mp-ref-fav-back-1') {
  const ev = (id, kickoff) => ({provider: 'fpt', event_id: id, kickoff_utc: kickoff, home: `H${id}`, away: `A${id}`});
  const ob = (event, selection, odds, acquired, n) => ({observation_id: `o${event}${n}`, provider: 'fpt', event_id: event, bookmaker: 'bk1', market: '1X2', selection,
    odds, provider_time: acquired, acquired_at: acquired});
  const input = {schema_version: 'mp-hist-input-1', dataset: {id: 'persist-fixture', kind: 'FIXTURE', description: 'persistence test'},
    events: [ev('e1', '2026-01-10T15:00:00Z')],
    observations: [ob('e1', 'HOME', '1.80', '2026-01-10T14:30:00Z', 1), ob('e1', 'DRAW', '3.60', '2026-01-10T14:30:00Z', 2), ob('e1', 'AWAY', '4.50', '2026-01-10T14:30:00Z', 3)],
    outcomes: [{provider: 'fpt', event_id: 'e1', status: 'FINAL', home_score: 2, away_score: 1, acquired_at: '2026-01-10T17:00:00Z'}]};
  return runBacktest(input, {strategy, bookmaker: 'bk1', lead_minutes: 10, stake: '1', commission: '0'}, {codeVersion: 'test'});
}

test('persistence store: a saved backtest or comparison reloads byte-identical; forged reports are refused', {timeout: 60000}, async t => {
  await withSchema(t, 'bt', async db => {
    const single = JSON.stringify({reader: {events: 1}, report: report(), events: [], totals: {bets: 1}});
    const saved = await saveBacktest(db, {name: 'Prova', responseText: single, params: {from: '2026-01-01', to: '2026-01-31'}});
    assert.deepEqual([saved.status, saved.kind], ['SAVED', 'BACKTEST']);
    const back = await loadBacktest(db, saved.backtest_id);
    assert.equal(back.responseText, single, 'byte-identical');
    assert.deepEqual(back.report_sha256, [JSON.parse(single).report.report_sha256]);
    assert.deepEqual(back.params, {from: '2026-01-01', to: '2026-01-31'});
    assert.equal((await saveBacktest(db, {name: 'Prova', responseText: single})).status, 'ALREADY_SAVED');
    const a = report('mp-ref-fav-back-1'), b = report('mp-ref-fav-lay-1');
    const compare = JSON.stringify({reader: {}, input_sha256: a.dataset.input_sha256, variants: [{key: 'a', report: a}, {key: 'b', report: b}], events: []});
    const savedCompare = await saveBacktest(db, {name: 'Confronto', responseText: compare});
    const backCompare = await loadBacktest(db, savedCompare.backtest_id);
    assert.equal(backCompare.kind, 'COMPARE');
    assert.equal(backCompare.responseText, compare);
    assert.deepEqual(backCompare.report_sha256, [a.report_sha256, b.report_sha256]);
    assert.deepEqual(backCompare.strategy_ids, ['mp-ref-fav-back-1', 'mp-ref-fav-lay-1']);
    const forged = JSON.parse(single);
    forged.report.metrics = {...forged.report.metrics, roi: '9.99'};
    assert.equal(await code(saveBacktest(db, {name: 'Falso', responseText: JSON.stringify(forged)})), 'BAD_INPUT');
    assert.equal(await code(saveBacktest(db, {name: 'x', responseText: '{"nope":1}'})), 'BAD_INPUT');
    assert.equal(await loadBacktest(db, 999), null);
  });
});

test('paper ledger: the idempotency fingerprint does not depend on the order of the scope keys', () => {
  const ledger = createLedger({accountId: 'a', initialAllocation: '100', at: 't0'});
  const open = {mode: 'ACTIVE_OPERATIONAL', positionId: 'p1', side: 'BACK', odds: '2', stake: '10', commissionRate: '0', settingsSnapshotId: 'cfg',
    idempotencyKey: 'k1', at: 't1'};
  assert.equal(openPosition(ledger, {...open, scope: {strategy: 's', match: 'm', league: 'l'}}).status, 'APPLIED');
  assert.equal(openPosition(ledger, {...open, scope: {league: 'l', match: 'm', strategy: 's'}}).status, 'ALREADY_APPLIED');
  assert.deepEqual(Object.keys(ledger.entries[1].scope), ['match', 'league', 'strategy']);
});

test('persistence store: result-based settlement and its corrections survive a restart (market, resolution, versions)', {timeout: 60000}, async t => {
  await withSchema(t, 'settle', async (db, connect) => {
    const AT = '2026-10-23T12:00:00Z', MO_HOME = {marketType: 'MATCH_ODDS', selection: 'HOME'};
    const fpt = (version, h, a, acquired) => fromFutPythonTrader({version, status: 'FINAL', home_score: h, away_score: a, acquired_at: acquired, snapshot_id: `s${version}`});
    const mem = createLedger({accountId: 'r', initialAllocation: '1000', at: AT});
    await createAccount(db, {accountId: 'r', initialAllocation: '1000', at: AT});
    const steps = [
      [openPosition, {mode: 'ACTIVE_OPERATIONAL', positionId: 'b1', side: 'BACK', odds: '2', stake: '10', commissionRate: '0.05', settingsSnapshotId: 's',
        idempotencyKey: 'open:b1', at: AT, market: MO_HOME, scope: {match: 'm1', strategy: 'x'}}],
      [settleFromResult, {positionId: 'b1', versions: [fpt(1, 2, 1, '2026-10-20T21:00:00Z')], asOf: '2026-10-30T00:00:00Z', at: AT}],
      [settleFromResult, {positionId: 'b1', versions: [fpt(1, 2, 1, '2026-10-20T21:00:00Z')], asOf: '2026-10-30T00:00:00Z', at: AT}],
      [settleFromResult, {positionId: 'b1', versions: [fpt(1, 2, 1, '2026-10-20T21:00:00Z'), fpt(2, 2, 2, '2026-10-21T09:00:00Z')], asOf: '2026-10-30T00:00:00Z', at: AT}],
      [settleFromResult, {positionId: 'b1', versions: [fpt(1, 2, 1, '2026-10-20T21:00:00Z'), fpt(2, 2, 2, '2026-10-21T09:00:00Z'), fpt(3, 3, 2, '2026-10-22T09:00:00Z')],
        asOf: '2026-10-30T00:00:00Z', at: AT}],
    ];
    for (const [op, args] of steps) {
      const expected = op(mem, args);
      // Each step on a fresh connection: the stored ledger is read back every time.
      const c = await connect();
      try { assert.deepEqual((await applyToLedger(c, 'r', op, args)).result, expected); }
      finally { await c.end(); }
    }
    const stored = await loadLedger(db, 'r');
    const plain = value => JSON.parse(JSON.stringify(value));
    assert.deepEqual(plain(stored.entries), plain(mem.entries));
    assert.deepEqual(plain(replay(stored).positions.get('b1')), plain(replay(mem).positions.get('b1')));
    assert.equal(replay(stored).positions.get('b1').resolution.outcome_version, 3);
    assert.ok(Object.isFrozen(stored.entries[1].market), 'reloaded entries are frozen deeply');
  });
});

test('persistence store: a pool or a busy connection is refused; concurrent saves of one response are ALREADY_SAVED', {timeout: 60000}, async t => {
  await withSchema(t, 'clients', async (db, connect, schema) => {
    const pg = (await import('pg')).default;
    const url = new URL(process.env.FUTPYTHON_TEST_DATABASE_URL || 'postgres://matchpilot:matchpilot_local_test@127.0.0.1:5432/matchpilot_fpt');
    url.searchParams.set('options', `-csearch_path=${schema}`);
    const pool = new pg.Pool({connectionString: url.toString(), max: 2});
    try { assert.equal(await code(createAccount(pool, {accountId: 'p', initialAllocation: '1', at: 't'})), 'BAD_CLIENT'); }
    finally { await pool.end(); }
    await createAccount(db, {accountId: 'a', initialAllocation: '100', at: 't'});
    const open = i => ({mode: 'ACTIVE_OPERATIONAL', positionId: `p${i}`, side: 'BACK', odds: '2', stake: '1', commissionRate: '0', settingsSnapshotId: 'c',
      idempotencyKey: `k${i}`, at: 't'});
    const both = await Promise.allSettled([applyToLedger(db, 'a', openPosition, open(1)), applyToLedger(db, 'a', openPosition, open(2))]);
    assert.deepEqual(both.map(r => r.status === 'fulfilled' ? 'OK' : r.reason.code), ['OK', 'CLIENT_BUSY']);
    // A strategy renamed with the same rules: a new version, same content id.
    const s1 = await saveStrategy(db, {key: 'k', name: 'Uno', definition: {selection: 'HOME', side: 'BACK'}});
    const s2 = await saveStrategy(db, {key: 'k', name: 'Due', definition: {selection: 'HOME', side: 'BACK'}});
    assert.deepEqual([s2.status, s2.version, s2.strategy_id], ['SAVED', 2, s1.strategy_id]);
    const text = JSON.stringify({reader: {}, report: report(), events: []});
    const [c1, c2] = [await connect(), await connect()];
    try {
      const saves = await Promise.all([c1, c2].map(c => saveBacktest(c, {name: 'x', responseText: text})));
      assert.deepEqual(saves.map(r => r.status).sort(), ['ALREADY_SAVED', 'SAVED']);
      assert.equal(saves[0].backtest_id, saves[1].backtest_id);
    } finally { await c1.end(); await c2.end(); }
  });
});
