// PERSIST-API-01 (priority 4, #99 #34): the persistence store over HTTP. Reads follow the rest of /api/v1 (behind the
// owner session when MATCHPILOT_AUTH=enforce), except the saved strategies, which are private: reading them needs the
// owner session also when auth is off (MP-UI-PR-006, #34 "Strategy permissions", D12-18). Writes are POST with a JSON body and need, all together:
// - auth enforced and an owner session with the `write` permission: with auth off there is no anonymous write, ever;
// - a same-origin request (Sec-Fetch-Site / Origin, as for login) and Content-Type application/json, so no other site
//   can submit one (the session cookie is also SameSite=Strict);
// - the persistence schema applied: until the owner-authorized migration, every route answers 503 UNAVAILABLE.
// A saved backtest is never taken from the client: the server runs the same /api/v1/hist/backtest or
// /api/v1/hist/compare request again and stores what it produced (each report sealed by the engine). Saving is
// idempotent: the same rules under the same key, or the same backtest result, write nothing new (ALREADY_SAVED keeps
// the first record's name and parameters, and says which record it is).
// The paper-ledger write operations are not exposed: opening a position needs the operating mode (DEC-001), which has no
// server-side source yet, and a mode declared by the client could bypass STOP. Only the account state is read.
import {accountState} from '../ledger/paper-ledger.mjs';
import {HistInputError} from '../hist/contract.mjs';
import {DEFINITION_PARAMS, definitionOf, rulesOf} from './hist-backtest.mjs';
import {PersistenceError, listBacktests, listStrategies, listStrategyVersions, loadBacktest, loadLedger, loadStrategy, persistenceAvailable, saveBacktest, saveStrategy} from '../persistence/store.mjs';
import {authorize, sameOriginRequest} from '../auth/owner-auth.mjs';

export const PERSISTENCE_ROUTES = Object.freeze({
  '/api/v1/persistence/status': ['GET'],
  '/api/v1/strategies': ['GET', 'POST'],
  '/api/v1/backtests/saved': ['GET', 'POST'],
  '/api/v1/ledger/account': ['GET'],
});
export const MAX_BODY_BYTES = 64 * 1024;
const SAVABLE = {BACKTEST: '/api/v1/hist/backtest', COMPARE: '/api/v1/hist/compare'};

class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const http = (status, code, message) => { throw new HttpError(status, code, message); };
const ok = (status, data) => ({status, body: {api_version: 'v1', data}});
const errorOf = (status, code, message) => ({status, body: {api_version: 'v1', error: {code, message}}});

// Store and validation errors mapped to HTTP; anything else is internal and never shows its message.
const STORE_STATUS = {PERSISTENCE_UNAVAILABLE: [503, 'UNAVAILABLE'], BAD_INPUT: [400, 'BAD_REQUEST'], STRATEGY_ID_COLLISION: [409, 'CONFLICT'],
  LEDGER_CORRUPT: [500, 'DATA_CORRUPT'], STRATEGY_CORRUPT: [500, 'DATA_CORRUPT'], BACKTEST_CORRUPT: [500, 'DATA_CORRUPT']};
function mapError(error) {
  if (error instanceof HttpError) return errorOf(error.status, error.code, error.message);
  if (error instanceof HistInputError) return errorOf(400, 'BAD_REQUEST', error.message);
  if (error instanceof PersistenceError && STORE_STATUS[error.code]) {
    const [status, code] = STORE_STATUS[error.code];
    return errorOf(status, code, status === 500 ? 'stored data failed its integrity check' : error.message);
  }
  // Only a database that cannot be reached is "unavailable" (connection, resources, shutdown SQLSTATE classes and
  // network errors); any other SQL error is a defect and stays INTERNAL.
  if (typeof error?.code === 'string' && /^(08|53|57P)/.test(error.code) || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(error?.code)) {
    return errorOf(503, 'UNAVAILABLE', 'data source unavailable');
  }
  return errorOf(500, 'INTERNAL', 'internal error');
}

// Strict body: a plain object with only the listed fields.
function bodyFields(body, allowed, required) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) http(400, 'BAD_REQUEST', 'the body must be a JSON object');
  for (const key of Object.keys(body)) if (!allowed.includes(key)) http(400, 'UNKNOWN_FIELD', `unknown field ${key}`);
  for (const key of required) if (body[key] === undefined) http(400, 'BAD_REQUEST', `${key} is required`);
  return body;
}

const queryOnly = (url, allowed) => {
  for (const key of url.searchParams.keys()) if (!allowed.includes(key)) http(400, 'UNKNOWN_PARAMETER', `unknown parameter ${key}`);
};
// Query texts are checked before the database sees them: the strategy key rule of the store, and an account id of at
// most 100 visible characters (the paper ledger's ids are free text).
const STRATEGY_KEY = /^[a-z0-9][a-z0-9-]{0,62}$/;
const strategyKey = value => {
  if (!STRATEGY_KEY.test(value)) http(400, 'BAD_REQUEST', 'key must be lowercase letters, digits and dashes (1 to 63)');
  return value;
};
const accountId = value => {
  if (!value || value.length > 100 || /[\p{Cc}\p{Cf}]/u.test(value) || !value.trim()) http(400, 'BAD_REQUEST', 'account_id must be a visible text of at most 100 characters');
  return value;
};
const positiveInt = (field, value) => {
  if (!/^[1-9][0-9]{0,8}$/.test(value)) http(400, 'BAD_REQUEST', `${field} must be a positive integer`);
  return Number(value);
};

// The gate for a write: checked before the body is parsed and before any database access.
export function writeAllowed({headers, authEnforced, session}) {
  if (!authEnforced) return errorOf(403, 'WRITES_REQUIRE_AUTH', 'writes need MATCHPILOT_AUTH=enforce and an owner session');
  if (!session) return errorOf(401, 'UNAUTHENTICATED', 'authentication required');
  if (!authorize(session, 'write')) return errorOf(403, 'FORBIDDEN', 'not allowed');
  if (!sameOriginRequest(headers)) return errorOf(403, 'ORIGIN_NOT_ALLOWED', 'cross-site request refused');
  const type = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return errorOf(415, 'UNSUPPORTED_MEDIA_TYPE', 'the body must be application/json');
  return null;
}

// The gate for reading the saved strategies: never public (#34 «Non rendere pubbliche automaticamente»). With auth off
// there is no owner session, so nobody reads them; checked before any database access.
export function strategyReadAllowed({authEnforced, session}) {
  if (!authEnforced) return errorOf(403, 'READS_REQUIRE_AUTH', 'saved strategies are private: reading them needs MATCHPILOT_AUTH=enforce and an owner session');
  if (!session) return errorOf(401, 'UNAUTHENTICATED', 'authentication required');
  if (!authorize(session, 'read')) return errorOf(403, 'FORBIDDEN', 'not allowed');
  return null;
}

// Returns null for a path outside the persistence routes; otherwise {status, body}. Never throws.
// `rawBody` is the request body as text (POST only, read by the caller up to MAX_BODY_BYTES; `tooLarge` when it was cut).
// `runV1(url)` answers a GET /api/v1 request in process (handleV1), used to produce a backtest before saving it.
export async function handlePersistence({method, url, headers = {}, rawBody = null, tooLarge = false}, {withClient, authEnforced, session = null, runV1}) {
  const methods = PERSISTENCE_ROUTES[url.pathname];
  if (!methods) return null;
  try {
    if (!methods.includes(method)) http(405, 'METHOD_NOT_ALLOWED', `allowed: ${methods.join(', ')}`);
    let body = null;
    if (method === 'POST') {
      const refused = writeAllowed({headers, authEnforced, session});
      if (refused) return refused;
      queryOnly(url, []);
      if (tooLarge || (rawBody !== null && Buffer.byteLength(rawBody) > MAX_BODY_BYTES)) http(413, 'PAYLOAD_TOO_LARGE', `the body must be at most ${MAX_BODY_BYTES} bytes`);
      if (rawBody === null || rawBody === '') http(400, 'BAD_REQUEST', 'a JSON body is required');
      try { body = JSON.parse(rawBody); } catch { http(400, 'BAD_REQUEST', 'the body is not valid JSON'); }
    }
    switch (`${method} ${url.pathname}`) {
      case 'GET /api/v1/persistence/status': {
        queryOnly(url, []);
        const available = await withClient(client => persistenceAvailable(client));
        // writes_enabled: what a page reads to offer a save at all (MP-UI-PR-003); `writes` keeps the operator's wording.
        return ok(200, {available, writes_enabled: available && authEnforced, writes: authEnforced ? 'owner session' : 'disabled (MATCHPILOT_AUTH is not enforce)'});
      }
      case 'GET /api/v1/strategies': {
        const refused = strategyReadAllowed({authEnforced, session});
        if (refused) return refused;
        queryOnly(url, ['key', 'version']);
        const key = url.searchParams.get('key');
        const version = url.searchParams.has('version') ? positiveInt('version', url.searchParams.get('version')) : null;
        if (version !== null && key === null) http(400, 'BAD_REQUEST', 'version needs key');
        if (key === null) return ok(200, {strategies: await withClient(client => listStrategies(client))});
        const checked = strategyKey(key);
        const found = await withClient(async client => {
          const strategy = await loadStrategy(client, checked, {version});
          return strategy && {strategy, versions: await listStrategyVersions(client, checked)};
        });
        if (!found) http(404, 'NOT_FOUND', 'no such strategy');
        // MP-UI-PR-006: the history of the strategy and the request fields of this version (null when the request
        // cannot express the definition), so the page opens it in the Simulazione or clones it without converting it.
        return ok(200, {...found, rules: rulesOf(found.strategy.definition)});
      }
      case 'POST /api/v1/strategies': {
        // The rules come either as a definition or as `rules`, the request fields of a configurable backtest (selection,
        // side, prices, team, venue as text): the server builds the definition the backtest itself would use, so a page
        // saves exactly what it simulated and computes nothing (MP-WEB-011, MP-UI-PR-003).
        const fields = bodyFields(body, ['key', 'name', 'definition', 'rules'], ['key', 'name']);
        if ((fields.definition === undefined) === (fields.rules === undefined)) http(400, 'BAD_REQUEST', 'give either definition or rules');
        let definition = fields.definition;
        if (fields.rules !== undefined) {
          const rules = fields.rules;
          if (rules === null || typeof rules !== 'object' || Array.isArray(rules) || Object.values(rules).some(v => typeof v !== 'string')) http(400, 'BAD_REQUEST', 'rules must be an object of text values');
          for (const name of Object.keys(rules)) if (!DEFINITION_PARAMS.includes(name)) http(400, 'UNKNOWN_FIELD', `unknown rule ${name}`);
          definition = definitionOf(rules);
        }
        const {key, name} = fields;
        const saved = await withClient(client => saveStrategy(client, {key, name, definition}));
        return ok(saved.status === 'SAVED' ? 201 : 200, saved);
      }
      case 'GET /api/v1/backtests/saved': {
        queryOnly(url, ['id', 'limit']);
        // Without an id: the list of saved backtests, newest first, without their responses.
        if (!url.searchParams.has('id')) {
          const limit = url.searchParams.has('limit') ? positiveInt('limit', url.searchParams.get('limit')) : 50;
          if (limit > 200) http(400, 'BAD_REQUEST', 'limit must be at most 200');
          return ok(200, {backtests: await withClient(client => listBacktests(client, {limit}))});
        }
        if (url.searchParams.has('limit')) http(400, 'BAD_REQUEST', 'limit applies to the list, not to one backtest');
        const saved = await withClient(client => loadBacktest(client, positiveInt('id', url.searchParams.get('id'))));
        if (!saved) http(404, 'NOT_FOUND', 'no such saved backtest');
        // response_text is the stored text, byte for byte; `result` is the same value parsed.
        const {responseText, ...meta} = saved;
        return ok(200, {...meta, response_text: responseText, result: JSON.parse(responseText)});
      }
      case 'POST /api/v1/backtests/saved': {
        const {name, kind, params} = bodyFields(body, ['name', 'kind', 'params'], ['name', 'kind', 'params']);
        if (!Object.hasOwn(SAVABLE, kind)) http(400, 'BAD_REQUEST', `kind must be one of ${Object.keys(SAVABLE).join(', ')}`);
        if (params === null || typeof params !== 'object' || Array.isArray(params) || Object.values(params).some(v => typeof v !== 'string')) {
          http(400, 'BAD_REQUEST', 'params must be an object of text values (the query parameters of the request)');
        }
        // Checked before running anything: nothing is computed for a database that cannot store it.
        if (!(await withClient(client => persistenceAvailable(client)))) http(503, 'UNAVAILABLE', 'the persistence schema is not applied (owner-authorized migration pending)');
        const target = new URL(SAVABLE[kind], 'http://localhost');
        for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
        const run = await runV1(target);
        if (run.status !== 200) return run; // the same refusal the backtest itself gives (400, 429 BUSY, 503, ...)
        const saved = await withClient(client => saveBacktest(client, {name, responseText: JSON.stringify(run.body.data), params}));
        return ok(saved.status === 'SAVED' ? 201 : 200, saved);
      }
      case 'GET /api/v1/ledger/account': {
        queryOnly(url, ['account_id']);
        if (!url.searchParams.has('account_id')) http(400, 'BAD_REQUEST', 'account_id is required');
        const id = accountId(url.searchParams.get('account_id'));
        const ledger = await withClient(client => loadLedger(client, id));
        if (!ledger) http(404, 'NOT_FOUND', 'no such account');
        return ok(200, {account: accountState(ledger)});
      }
      default: return http(405, 'METHOD_NOT_ALLOWED', `allowed: ${methods.join(', ')}`);
    }
  } catch (error) {
    return mapError(error);
  }
}
