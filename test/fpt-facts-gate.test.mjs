// FPT-FACTS-GATE: a match must not vanish from fpt_match_facts, nor stay frozen on an old version, because a dataset
// still being onboarded stores a newer version of it. Throwaway PostgreSQL schema, synthetic rows written into the FPT
// tables as ingestion stores them; the history (fpt_match_versions) is never written by the refresh.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {mkdtempSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import test from 'node:test';
import {refreshNormalizedLayer} from '../src/providers/futpython/query.mjs';
import {factsGate, factsSection} from '../src/futpython-certificate.mjs';
import {measureFactsGap} from '../src/providers/futpython/facts-refresh.mjs';
import {parseArgs, runFactsRefresh} from '../src/jobs/futpython-facts-refresh.mjs';
import {readFptHistInput} from '../src/providers/futpython/hist-input.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
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

async function withSchema(t, name, body) {
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
  const schema = `fpt_gate_${name}_${process.pid}`;
  try {
    await root.query(`CREATE SCHEMA ${schema}`);
    dbUrl.searchParams.set('options', `-csearch_path=${schema}`);
    await runNode(['src/migrate.mjs'], {PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: dbUrl.toString(), MATCHPILOT_RUNTIME_MODE: 'test'});
    const db = new pg.Client({connectionString: dbUrl.toString()});
    await db.connect();
    try { await body(db, dbUrl.toString()); }
    finally { await db.end(); }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await root.end();
  }
}

function fixture(db) {
  let n = 0;
  const snapshots = new Map();
  const snapshot = async dataset => {
    if (!snapshots.has(dataset)) {
      const raw = await db.query(`INSERT INTO fpt_raw_snapshots(dataset_key,source_kind,provider_path,acquired_at,sha256,row_count,headers,payload_gzip)
        VALUES($1,'dataset','/fixture','2026-10-01T08:00:00Z',$2,1,'[]',$3) RETURNING snapshot_id`, [dataset, sha256(dataset), gzipSync(dataset)]);
      snapshots.set(dataset, raw.rows[0].snapshot_id);
    }
    return snapshots.get(dataset);
  };
  const version = async (key, dataset, acquired, payload, phase = 'HISTORICAL') => {
    const body = JSON.stringify(payload);
    const row = await db.query(`INSERT INTO fpt_match_versions(match_key,dataset_key,snapshot_id,acquired_at,country_slug,league_slug,season,
        match_date,match_time,home,away,phase,payload,payload_sha256)
      VALUES($1,$2,$3,$4,'england',$5,'2025','2025-09-20','15:00','Arsenal','Chelsea',$8,$6,$7) RETURNING version_id`,
    [key, dataset, await snapshot(dataset), acquired, dataset.split('-').slice(1, -1).join('-'), body, sha256(body + acquired + n++), phase]);
    return Number(row.rows[0].version_id);
  };
  const onboarding = (dataset, state) => db.query(`INSERT INTO fpt_onboarding(dataset_key,country_slug,league_slug,season,kind,promotion,state,
      verified_at,activated_at)
    VALUES($1,'england',$2,'2025','new_league','owner',$3,CASE WHEN $3='ACTIVE' THEN now() END,CASE WHEN $3='ACTIVE' THEN now() END)
    ON CONFLICT (dataset_key) DO UPDATE SET state=excluded.state, verified_at=excluded.verified_at, activated_at=excluded.activated_at`,
  [dataset, dataset.split('-').slice(1, -1).join('-'), state]);
  const facts = async () => Object.fromEntries((await db.query(`SELECT match_key, version_id, dataset_key, home_score, away_score
    FROM fpt_match_facts ORDER BY match_key`)).rows.map(r => [r.match_key, {version: Number(r.version_id), dataset: r.dataset_key, score: `${r.home_score}-${r.away_score}`}]));
  const history = async () => (await db.query(`SELECT count(*)::int AS n, md5(string_agg(version_id || ':' || payload_sha256 || ':' || dataset_key, ',' ORDER BY version_id)) AS h
    FROM fpt_match_versions`)).rows[0];
  return {version, onboarding, facts, history};
}

const score = (h, a) => ({Home_Score: String(h), Away_Score: String(a), Odd_1_FT: '1.85', Odd_X_FT: '3.60', Odd_2_FT: '4.40'});
const BASE = 'england-premier-league-2025', CUP = 'england-pl-cup-2025', NEW = 'england-new-league-2025';

test('FPT facts gate: a newer version in a dataset not yet ACTIVE neither hides a match nor freezes it', {timeout: 90000}, async t => {
  await withSchema(t, 'hide', async db => {
    const {version, onboarding, facts, history} = fixture(db);
    await onboarding(CUP, 'DISCOVERED');
    // S1: m1 is in the baseline (v1) and later in the DISCOVERED cup dataset (v2): it must enter the facts on v1.
    const m1v1 = await version('fpt:id:m1', BASE, '2026-10-02T08:00:00Z', score(2, 1));
    await version('fpt:id:m1', CUP, '2026-10-03T08:00:00Z', score(0, 3));
    // S4: m4 exists only in the DISCOVERED dataset: held back.
    const m4v1 = await version('fpt:id:m4', CUP, '2026-10-02T08:00:00Z', score(1, 0));
    // S2: m2 is already in the facts on v1, then gets a newer baseline correction (v2) and an even newer cup version
    // (v3): it must move to v2.
    const m2v1 = await version('fpt:id:m2', BASE, '2026-10-02T08:00:00Z', score(1, 1));
    await refreshNormalizedLayer(db);
    assert.equal((await facts())['fpt:id:m2'].version, m2v1);
    const m2v2 = await version('fpt:id:m2', BASE, '2026-10-04T08:00:00Z', score(2, 1));
    await version('fpt:id:m2', CUP, '2026-10-05T08:00:00Z', score(0, 0));
    const before = await history();

    await refreshNormalizedLayer(db);
    let f = await facts();
    assert.deepEqual(f['fpt:id:m1'], {version: m1v1, dataset: BASE, score: '2-1'}, 'S1: the match does not disappear');
    assert.deepEqual(f['fpt:id:m2'], {version: m2v2, dataset: BASE, score: '2-1'}, 'S2: the match does not stay frozen');
    assert.equal(f['fpt:id:m4'], undefined, 'S4: a match only in a non-ACTIVE dataset is held back');
    assert.deepEqual(await history(), before, 'the history is not written');

    // The certificate counts the same facts and finds none stale.
    const section = await factsSection(db);
    assert.deepEqual([section.facts_rows, section.distinct_match_keys, section.facts_at_now, section.facts_at_now_repeat, section.facts_stale], [2, 2, 2, 2, 0]);
    // The fixture has no team registry, so only the team-id condition of the gate fails.
    assert.equal(factsGate({...section, historical_without_team_ids: 0}), true);

    // S3: once the cup dataset is ACTIVE its newer versions win, and m4 enters.
    await onboarding(CUP, 'ACTIVE');
    await refreshNormalizedLayer(db);
    f = await facts();
    assert.equal(f['fpt:id:m1'].dataset, CUP);
    assert.equal(f['fpt:id:m1'].score, '0-3');
    assert.equal(f['fpt:id:m2'].score, '0-0');
    assert.deepEqual(f['fpt:id:m4'], {version: m4v1, dataset: CUP, score: '1-0'});
    assert.deepEqual(await history(), before);
    const after = await factsSection(db);
    assert.deepEqual([after.facts_rows, after.distinct_match_keys, after.facts_at_now, after.facts_stale], [3, 3, 3, 0]);

    // Another dataset entering onboarding later never removes or rewinds a fact.
    await onboarding(NEW, 'DISCOVERED');
    await version('fpt:id:m1', NEW, '2026-10-06T08:00:00Z', score(5, 5));
    await refreshNormalizedLayer(db);
    assert.deepEqual(await facts(), f);
  });
});

test('FPT facts gate: with no dataset in onboarding the refresh equals the legacy database function', {timeout: 90000}, async t => {
  await withSchema(t, 'legacy', async db => {
    const {version} = fixture(db);
    // Team registry: Arsenal resolves to one team, Chelsea's alias is ambiguous (two teams), so the names CTE is exercised.
    await db.query(`INSERT INTO fpt_teams(internal_team_id,country_slug,competition_slug,canonical_name)
      VALUES('t:ars','england','premier-league','Arsenal'),('t:che1','england','premier-league','Chelsea'),('t:che2','england','pl-cup','Chelsea B')`);
    await db.query(`INSERT INTO fpt_team_aliases(internal_team_id,name,normalized_name,kind)
      VALUES('t:ars','Arsenal','arsenal','canonical'),('t:che1','Chelsea','chelsea','canonical'),('t:che2','Chelsea','chelsea','alias')`);
    await version('fpt:id:a', BASE, '2026-10-02T08:00:00Z', score(1, 0));
    await version('fpt:id:a', BASE, '2026-10-03T08:00:00Z', score(2, 0));
    await version('fpt:id:b', CUP, '2026-10-02T08:00:00Z', {Home_Score: '', Away_Score: '', Odd_H_FT: '2,10', Odd_D_FT: '3.40', Odd_A_FT: '3.30', xG_Home_FT: '1.2'});
    await version('fpt:id:c', BASE, '2026-10-02T08:00:00Z', {Odd_1_FT: '2.00', Odd_X_FT: '3.10', Odd_2_FT: '3.90'}, 'PREMATCH');
    const columns = `internal_match_id, match_key, version_id, snapshot_id, dataset_key, phase, acquired_at, internal_competition_id,
      season_id, country_slug, league_slug, season, match_date, kickoff_local_time, kickoff_utc, kickoff_tz_status, home_team_id,
      away_team_id, home_name, away_name, provider_match_id, provider_competition_id, home_score, away_score, result_status,
      odd_home, odd_draw, odd_away, odd_over25, odd_under25, odd_btts_yes, favorite_side, favorite_odd, xg_home, xg_away,
      total_goals, source_provider, parser_version, schema_version, transform_version, facts_version`;
    const rows = async () => (await db.query(`SELECT ${columns} FROM fpt_match_facts ORDER BY internal_match_id`)).rows;
    await db.query('SELECT fpt_refresh_match_facts()');
    const legacy = await rows();
    assert.equal(legacy.length, 3);
    assert.deepEqual(legacy.map(r => [r.home_team_id, r.away_team_id, r.result_status]),
      [['t:ars', null, 'FINAL'], ['t:ars', null, 'NO_RESULT'], ['t:ars', null, 'NOT_STARTED']]);
    await db.query('DELETE FROM fpt_match_facts');
    const written = await refreshNormalizedLayer(db);
    assert.equal(written.facts, 3);
    assert.deepEqual(await rows(), legacy);
    assert.equal((await refreshNormalizedLayer(db)).facts, 0, 'an unchanged layer writes nothing');
  });
});

// Recovery of a database refreshed by the legacy function (the state production had before FPT-FACTS-GATE): the owner
// command measures without writing, then recovers every hidden and stale match without touching the history.
test('FPT facts recovery: dry run writes nothing, apply recovers hidden and stale matches, history unchanged', {timeout: 90000}, async t => {
  await withSchema(t, 'recover', async db => {
    const {version, onboarding, facts, history} = fixture(db);
    await onboarding(CUP, 'DISCOVERED');
    await version('fpt:id:m2', BASE, '2026-10-02T08:00:00Z', score(1, 1));
    await db.query('SELECT fpt_refresh_match_facts()');
    const m1v1 = await version('fpt:id:m1', BASE, '2026-10-02T08:00:00Z', score(2, 1));
    await version('fpt:id:m1', CUP, '2026-10-03T08:00:00Z', score(0, 3));
    const m2v2 = await version('fpt:id:m2', BASE, '2026-10-04T08:00:00Z', score(2, 1));
    await version('fpt:id:m2', CUP, '2026-10-05T08:00:00Z', score(0, 0));
    await db.query('SELECT fpt_refresh_match_facts()');
    const legacy = await facts();
    assert.equal(legacy['fpt:id:m1'], undefined, 'legacy state: m1 hidden');
    assert.notEqual(legacy['fpt:id:m2'].version, m2v2, 'legacy state: m2 frozen');
    const hist = await history();
    // The backtest reader takes its match list from the facts: in the legacy state it silently misses m1.
    const missing = await readFptHistInput(db, {dateFrom: '2025-09-01', dateTo: '2025-09-30'});
    assert.deepEqual(missing.input.events.map(e => e.event_id), ['fpt:id:m2']);

    const dry = await runFactsRefresh(db);
    assert.equal(dry.mode, 'dry_run');
    assert.deepEqual([dry.before.hidden, dry.before.stale, dry.before.duplicate_ids], [1, 1, 0]);
    assert.deepEqual(await facts(), legacy, 'the dry run writes nothing');

    await assert.rejects(runFactsRefresh(db, {apply: true}), /--by=<who> and --reason=<why>/);
    const applied = await runFactsRefresh(db, {apply: true, by: 'owner', reason: 'FPT-FACTS-GATE recovery'});
    assert.equal(applied.status, 'COMMITTED');
    assert.equal(applied.written, 2);
    assert.deepEqual([applied.after.hidden, applied.after.stale, applied.after.duplicate_ids], [0, 0, 0]);
    assert.equal(applied.after.history_digest, applied.before.history_digest);
    const f = await facts();
    assert.deepEqual(f['fpt:id:m1'], {version: m1v1, dataset: BASE, score: '2-1'});
    assert.deepEqual(f['fpt:id:m2'], {version: m2v2, dataset: BASE, score: '2-1'});
    assert.deepEqual(await history(), hist, 'the history is not written');
    const found = await readFptHistInput(db, {dateFrom: '2025-09-01', dateTo: '2025-09-30'});
    assert.deepEqual(found.input.events.map(e => e.event_id), ['fpt:id:m1', 'fpt:id:m2'], 'the reader no longer misses m1');
    assert.equal((await runFactsRefresh(db, {apply: true, by: 'owner', reason: 'again'})).written, 0, 'idempotent');
  });
});

test('FPT facts recovery: a history change inside the run rolls everything back', {timeout: 90000}, async t => {
  await withSchema(t, 'guard', async db => {
    const {version, onboarding, facts, history} = fixture(db);
    await onboarding(CUP, 'DISCOVERED');
    await version('fpt:id:m1', BASE, '2026-10-02T08:00:00Z', score(2, 1));
    await version('fpt:id:m1', CUP, '2026-10-03T08:00:00Z', score(0, 3));
    await db.query('SELECT fpt_refresh_match_facts()');
    const before = {facts: await facts(), history: await history()};
    // A client that also writes a version right after the refresh, inside the same transaction.
    const snapshot = (await db.query('SELECT snapshot_id FROM fpt_raw_snapshots LIMIT 1')).rows[0].snapshot_id;
    const tampering = {query: async (sql, params) => {
      const result = await db.query(sql, params);
      if (typeof sql === 'string' && sql.includes('INSERT INTO fpt_match_facts')) {
        await db.query(`INSERT INTO fpt_match_versions(match_key,dataset_key,snapshot_id,acquired_at,phase,payload,payload_sha256)
          VALUES('fpt:id:x',$1,$2,now(),'HISTORICAL','{}','tamper')`, [BASE, snapshot]);
      }
      return result;
    }};
    const result = await runFactsRefresh(tampering, {apply: true, by: 'owner', reason: 'negative test'});
    assert.equal(result.status, 'ROLLED_BACK');
    assert.ok(result.problems.includes('HISTORY_CHANGED'));
    assert.deepEqual(await facts(), before.facts, 'no fact written');
    assert.deepEqual(await history(), before.history, 'the injected version is rolled back too');
    assert.equal((await measureFactsGap(db)).hidden, 1);
  });
});

test('FPT facts recovery: an orphan fact (no admissible version left) is reported, not stale, and never blocks the run', {timeout: 90000}, async t => {
  await withSchema(t, 'orphan', async db => {
    const {version, onboarding, facts} = fixture(db);
    await version('fpt:id:m9', NEW, '2026-10-02T08:00:00Z', score(1, 0));
    await refreshNormalizedLayer(db);
    // The dataset is registered in onboarding after its match reached the facts.
    await onboarding(NEW, 'DISCOVERED');
    const gap = await measureFactsGap(db);
    assert.deepEqual([gap.orphans, gap.stale, gap.hidden], [1, 0, 0]);
    assert.equal((await factsSection(db)).facts_stale, 0, 'the certificate counts it in the onboarding gate, not as stale');
    const run = await runFactsRefresh(db, {apply: true, by: 'owner', reason: 'orphan'});
    assert.equal(run.status, 'COMMITTED');
    assert.equal(run.written, 0);
    assert.ok((await facts())['fpt:id:m9'], 'nothing is deleted');
  });
});

test('FPT facts recovery command: strict arguments, exit codes, runs through a symlink', {timeout: 90000}, async t => {
  assert.throws(() => parseArgs(['--apply=true']), /unknown argument --apply/);
  assert.throws(() => parseArgs(['--dry']), /unknown argument --dry/);
  assert.deepEqual(parseArgs(['--apply', '--by=o', '--reason=r w']), {apply: true, by: 'o', reason: 'r w'});
  await withSchema(t, 'cli', async (db, url) => {
    const link = join(mkdtempSync(join(tmpdir(), 'facts-cli-')), 'current');
    symlinkSync(process.cwd(), link);
    const run = args => spawnSync(process.execPath, [join(link, 'src/jobs/futpython-facts-refresh.mjs'), ...args],
      {cwd: tmpdir(), encoding: 'utf8', env: {PATH: process.env.PATH, DATABASE_URL: url}});
    const dry = run([]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /^FUTPYTHON_FACTS_REFRESH \{"mode":"dry_run"/);
    const bad = run(['--apply=true']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /unknown argument/);
    const noReason = run(['--apply', '--by=owner']);
    assert.equal(noReason.status, 1);
    assert.match(noReason.stderr, /--by=<who> and --reason=<why>/);
    assert.ok(!(noReason.stderr + dry.stdout).includes(new URL(url).password), 'the password never appears');
    const applied = run(['--apply', '--by=owner', '--reason=cli test']);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /"status":"COMMITTED"/);
  });
});
