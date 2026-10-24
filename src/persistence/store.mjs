// PERSIST-STORE-01 (priority 4, #99 #34): PostgreSQL persistence of the paper ledger, configurable strategies and saved
// backtests, over the staged schema db/staged/030-persistence.sql. The tables are append-only (database triggers). The
// paper ledger stays the pure module it is (src/ledger/paper-ledger.mjs): this store loads the entries, lets the ledger
// function run on them, and appends the new entries and idempotency keys in the same transaction. Positions are never
// stored: they are rebuilt by replay, so the entries remain the single source of truth.
// Until the schema is applied (an owner-authorized migration) every call fails with PERSISTENCE_UNAVAILABLE, which the
// API maps to 503; nothing is created on the fly.
import {canonicalJson, sha256} from '../hist/contract.mjs';
import {LEDGER_VERSION, createLedger} from '../ledger/paper-ledger.mjs';
import {STRATEGY_DEF_VERSION, definitionId, normalizeDefinition} from '../hist/strategy-def.mjs';

export const PERSISTENCE_TABLES = Object.freeze(['paper_ledger_entries', 'paper_ledger_keys', 'strategy_definitions', 'strategy_versions', 'saved_backtests']);

export class PersistenceError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new PersistenceError(code, message); };

// True only when all five tables exist (the staged schema is applied).
export async function persistenceAvailable(client) {
  const {rows} = await client.query(`SELECT count(*)::int AS n FROM unnest($1::text[]) t WHERE to_regclass(t) IS NOT NULL`, [PERSISTENCE_TABLES]);
  return rows[0].n === PERSISTENCE_TABLES.length;
}
async function requireSchema(client) {
  if (!(await persistenceAvailable(client))) fail('PERSISTENCE_UNAVAILABLE', 'the persistence schema is not applied (owner-authorized migration pending)');
}

// One transaction on one dedicated connection; nothing is left half-written. A pool would spread BEGIN, the advisory
// lock and the inserts over different connections, and two transactions on one client would share a session (advisory
// locks are re-entrant there): both are refused instead of silently losing atomicity.
const busy = new WeakSet();
async function inTransaction(client, fn) {
  if (typeof client?.query !== 'function' || typeof client.totalCount === 'number' || typeof client.connect !== 'function' && typeof client.release !== 'function') {
    fail('BAD_CLIENT', 'the store needs one dedicated connection (pg.Client or a client checked out of a pool), not a pool');
  }
  if (busy.has(client)) fail('CLIENT_BUSY', 'this connection is already inside a store transaction');
  busy.add(client);
  try {
    await client.query('BEGIN');
    try {
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  } finally {
    busy.delete(client);
  }
}

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
};

// The stored text of an entry: canonical JSON of the entry as JSON sees it (undefined fields are dropped).
const entryText = entry => canonicalJson(JSON.parse(JSON.stringify(entry)));

// --- paper ledger -------------------------------------------------------------------------------------------------

// Reads an account's ledger back, verifying each row: hash, contiguous seq, seq inside the entry, type column, and that
// every idempotency key points at existing entries.
export async function loadLedger(client, accountId) {
  await requireSchema(client);
  return readLedger(client, accountId);
}
async function readLedger(client, accountId) {
  const entries = (await client.query(`SELECT seq, type, entry, entry_sha256 FROM paper_ledger_entries WHERE account_id = $1 ORDER BY seq`, [accountId])).rows;
  if (entries.length === 0) return null;
  const ledger = {account_id: accountId, version: LEDGER_VERSION, entries: [], keys: new Map()};
  entries.forEach((row, i) => {
    if (row.seq !== i + 1) fail('LEDGER_CORRUPT', `${accountId}: seq ${row.seq} where ${i + 1} was expected`);
    if (sha256(row.entry) !== row.entry_sha256) fail('LEDGER_CORRUPT', `${accountId}: entry ${row.seq} does not match its hash`);
    const entry = JSON.parse(row.entry);
    if (entry.seq !== row.seq || entry.type !== row.type) fail('LEDGER_CORRUPT', `${accountId}: entry ${row.seq} disagrees with its row`);
    ledger.entries.push(deepFreeze(entry));
  });
  for (const row of (await client.query(`SELECT idempotency_key, fingerprint, entry_seqs FROM paper_ledger_keys WHERE account_id = $1`, [accountId])).rows) {
    if (row.entry_seqs.some(seq => seq < 1 || seq > ledger.entries.length)) fail('LEDGER_CORRUPT', `${accountId}: key ${row.idempotency_key} points at a missing entry`);
    ledger.keys.set(row.idempotency_key, {fingerprint: row.fingerprint, entries: row.entry_seqs});
  }
  return ledger;
}

async function appendNew(client, ledger, fromSeq, keysBefore) {
  for (const entry of ledger.entries.slice(fromSeq)) {
    const text = entryText(entry);
    await client.query(`INSERT INTO paper_ledger_entries(account_id, seq, type, entry, entry_sha256) VALUES($1, $2, $3, $4, $5)`,
      [ledger.account_id, entry.seq, entry.type, text, sha256(text)]);
  }
  for (const [key, value] of ledger.keys) {
    if (keysBefore.has(key)) continue;
    await client.query(`INSERT INTO paper_ledger_keys(account_id, idempotency_key, fingerprint, entry_seqs) VALUES($1, $2, $3, $4)`,
      [ledger.account_id, key, value.fingerprint, value.entries]);
  }
}

// Serializes the writers of one account (transaction-scoped advisory lock), so the seq check never races.
const lockAccount = (client, accountId) => client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mp-paper-ledger:' || $1, 0))`, [accountId]);

export async function createAccount(client, {accountId, initialAllocation, at}) {
  await requireSchema(client);
  return inTransaction(client, async () => {
    await lockAccount(client, accountId);
    if (await readLedger(client, accountId)) fail('ACCOUNT_EXISTS', accountId);
    const ledger = createLedger({accountId, initialAllocation, at});
    await appendNew(client, ledger, 0, new Map());
    return ledger;
  });
}

// Runs one ledger operation (openPosition, hedgePosition, settlePosition, correctSettlement, or a settlement.mjs helper)
// on the stored ledger and persists what it appended. An operation that throws writes nothing; an idempotent replay
// (ALREADY_APPLIED) appends nothing.
export async function applyToLedger(client, accountId, operation, args) {
  await requireSchema(client);
  return inTransaction(client, async () => {
    await lockAccount(client, accountId);
    const ledger = await readLedger(client, accountId);
    if (!ledger) fail('UNKNOWN_ACCOUNT', accountId);
    const fromSeq = ledger.entries.length, keysBefore = new Map(ledger.keys);
    const result = operation(ledger, args);
    await appendNew(client, ledger, fromSeq, keysBefore);
    return {result, ledger};
  });
}

// --- strategies ---------------------------------------------------------------------------------------------------

const STRATEGY_KEY = /^[a-z0-9][a-z0-9-]{0,62}$/;
const visibleName = (field, value) => {
  const text = typeof value === 'string' ? value.normalize('NFC').trim() : '';
  if (!text || text.length > 200 || /[\p{Cc}\p{Cf}]/u.test(text)) fail('BAD_INPUT', `${field} must be a visible text of at most 200 characters`);
  return text;
};

// Saves a configurable strategy under a stable key. The same rules and name saved again under the same key are a no-op;
// new rules, or a new name for the same rules, make a new version and supersede the previous one (the name is part of
// the version record, never edited in place). Definitions are immutable and keyed by their content id.
export async function saveStrategy(client, {key, name, definition}) {
  if (typeof key !== 'string' || !STRATEGY_KEY.test(key)) fail('BAD_INPUT', 'key must be lowercase letters, digits and dashes (1 to 63)');
  const label = visibleName('name', name);
  const normalized = normalizeDefinition(definition);
  const strategyId = definitionId(normalized);
  const text = canonicalJson(normalized), digest = sha256(text);
  await requireSchema(client);
  return inTransaction(client, async () => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended('mp-strategy:' || $1, 0))`, [key]);
    await client.query(`INSERT INTO strategy_definitions(strategy_id, definition, definition_sha256, definition_version) VALUES($1, $2, $3, $4)
      ON CONFLICT (strategy_id) DO NOTHING`, [strategyId, text, digest, STRATEGY_DEF_VERSION]);
    const stored = (await client.query(`SELECT definition_sha256 FROM strategy_definitions WHERE strategy_id = $1`, [strategyId])).rows[0];
    // The id is a 64-bit prefix of the hash: a different definition under the same id is refused, never merged.
    if (stored.definition_sha256 !== digest) fail('STRATEGY_ID_COLLISION', `${strategyId} already holds a different definition`);
    const current = (await client.query(`SELECT version, strategy_id, name FROM strategy_versions WHERE strategy_key = $1 AND superseded_at IS NULL`, [key])).rows[0];
    if (current && current.strategy_id === strategyId && current.name === label) return {status: 'UNCHANGED', key, version: current.version, strategy_id: strategyId};
    if (current) await client.query(`UPDATE strategy_versions SET superseded_at = now() WHERE strategy_key = $1 AND version = $2`, [key, current.version]);
    const version = (current?.version ?? 0) + 1;
    await client.query(`INSERT INTO strategy_versions(strategy_key, version, strategy_id, name) VALUES($1, $2, $3, $4)`, [key, version, strategyId, label]);
    return {status: 'SAVED', key, version, strategy_id: strategyId};
  });
}

// The current version of a saved strategy (or a given version), with its definition re-verified against its hash.
export async function loadStrategy(client, key, {version = null} = {}) {
  await requireSchema(client);
  const row = (await client.query(`SELECT v.strategy_key, v.version, v.strategy_id, v.name, v.created_at, v.superseded_at, d.definition, d.definition_sha256
    FROM strategy_versions v JOIN strategy_definitions d USING (strategy_id)
    WHERE v.strategy_key = $1 AND (CASE WHEN $2::int IS NULL THEN v.superseded_at IS NULL ELSE v.version = $2::int END)`, [key, version])).rows[0];
  if (!row) return null;
  if (sha256(row.definition) !== row.definition_sha256) fail('STRATEGY_CORRUPT', `${row.strategy_id} does not match its hash`);
  const definition = JSON.parse(row.definition);
  if (definitionId(normalizeDefinition(definition)) !== row.strategy_id) fail('STRATEGY_CORRUPT', `${row.strategy_id} does not match its definition`);
  return {key: row.strategy_key, version: row.version, strategy_id: row.strategy_id, name: row.name, definition,
    created_at: row.created_at.toISOString(), superseded_at: row.superseded_at ? row.superseded_at.toISOString() : null};
}

export async function listStrategies(client) {
  await requireSchema(client);
  return (await client.query(`SELECT strategy_key AS key, version, strategy_id, name FROM strategy_versions WHERE superseded_at IS NULL ORDER BY strategy_key`)).rows;
}

// --- saved backtests ----------------------------------------------------------------------------------------------

// Saves the result of /api/v1/hist/backtest ({reader, report, ...}) or /api/v1/hist/compare ({reader, input_sha256,
// variants, ...}) exactly as it was produced (text, not jsonb, which
// would reorder keys). Saving the same response again returns the existing record.
export async function saveBacktest(client, {name, responseText, params}) {
  const label = visibleName('name', name);
  if (typeof responseText !== 'string' || !responseText) fail('BAD_INPUT', 'responseText must be the response body');
  let response;
  try { response = JSON.parse(responseText); } catch { fail('BAD_INPUT', 'responseText is not JSON'); }
  const reports = Array.isArray(response?.variants) ? response.variants.map(v => v.report) : response?.report ? [response.report] : [];
  if (!reports.length || reports.some(r => typeof r?.report_sha256 !== 'string')) fail('BAD_INPUT', 'not a backtest or comparison response');
  // Each report must carry the engine's own seal (report_sha256 over the rest of the report): a forged or edited report
  // is refused, never stored.
  for (const r of reports) {
    const {report_sha256: seal, ...body} = r;
    if (sha256(canonicalJson(body)) !== seal) fail('BAD_INPUT', 'a report does not match its report_sha256');
  }
  const kind = Array.isArray(response.variants) ? 'COMPARE' : 'BACKTEST';
  const input = response.input_sha256 ?? reports[0].dataset?.input_sha256;
  if (typeof input !== 'string' || reports.some(r => r.dataset?.input_sha256 !== input)) fail('BAD_INPUT', 'the reports do not share one input');
  const strategyIds = reports.map(r => r.config?.strategy);
  if (strategyIds.some(id => typeof id !== 'string' || !id)) fail('BAD_INPUT', 'a report has no strategy id');
  const digest = sha256(responseText);
  await requireSchema(client);
  return inTransaction(client, async () => {
    // A concurrent save of the same response wins once; the other one reads it back as ALREADY_SAVED.
    const row = (await client.query(`INSERT INTO saved_backtests(kind, name, response, response_sha256, report_sha256, input_sha256, strategy_ids, code_version, params)
      VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (response_sha256) DO NOTHING RETURNING backtest_id`,
    [kind, label, responseText, digest, reports.map(r => r.report_sha256), input, strategyIds, reports[0].code_version ?? null, canonicalJson(params ?? {})])).rows[0];
    if (row) return {status: 'SAVED', backtest_id: Number(row.backtest_id), kind, response_sha256: digest};
    const existing = (await client.query(`SELECT backtest_id FROM saved_backtests WHERE response_sha256 = $1`, [digest])).rows[0];
    return {status: 'ALREADY_SAVED', backtest_id: Number(existing.backtest_id), kind, response_sha256: digest};
  });
}

// The saved response, byte-identical, re-verified against its hash.
export async function loadBacktest(client, backtestId) {
  await requireSchema(client);
  const row = (await client.query(`SELECT backtest_id, kind, name, response, response_sha256, report_sha256, input_sha256, strategy_ids, code_version, params, created_at
    FROM saved_backtests WHERE backtest_id = $1`, [backtestId])).rows[0];
  if (!row) return null;
  if (sha256(row.response) !== row.response_sha256) fail('BACKTEST_CORRUPT', `backtest ${row.backtest_id} does not match its hash`);
  return {backtest_id: Number(row.backtest_id), kind: row.kind, name: row.name, responseText: row.response, response_sha256: row.response_sha256,
    report_sha256: row.report_sha256, input_sha256: row.input_sha256, strategy_ids: row.strategy_ids, code_version: row.code_version,
    params: JSON.parse(row.params), created_at: row.created_at.toISOString()};
}

// The saved backtests, newest first, without their responses (WEB-SAVED-01): the page lists them and opens one by id.
export async function listBacktests(client, {limit = 50} = {}) {
  await requireSchema(client);
  return (await client.query(`SELECT backtest_id, kind, name, strategy_ids, input_sha256, created_at FROM saved_backtests
    ORDER BY created_at DESC, backtest_id DESC LIMIT $1`, [limit])).rows
    .map(row => ({backtest_id: Number(row.backtest_id), kind: row.kind, name: row.name, strategy_ids: row.strategy_ids, input_sha256: row.input_sha256,
      created_at: row.created_at.toISOString()}));
}
