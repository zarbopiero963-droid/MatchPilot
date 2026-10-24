// MP-UI-PR-003 (MP-UI-HARD-GATES-01 §2): the data adapter of the saves. The pages talk to this contract only; which
// implementation answers is a choice made outside them, so moving from a mock to the real backend never touches a page.
// - createPersistence(): the real adapter, over /api/v1/persistence/*, /api/v1/strategies and /api/v1/backtests/saved
//   (PERSIST-API-01): owner session, same origin, JSON; 503 while the persistence schema is not applied.
// - createMemoryPersistence(): a deterministic in-memory mock of the same contract (statuses, codes, idempotency), for
//   contract tests and, later, a DEMO mode the page labels as such. It stores what it is given and computes no result.
// Every method resolves to {ok: true, status, data} or {ok: false, status, code}: never throws, never turns an error
// into a success. The contract is checked against both implementations by test/web-persistence-contract.test.mjs.

export const PERSISTENCE_CONTRACT = Object.freeze({
  status: 'GET /api/v1/persistence/status → {available, writes_enabled}',
  listBacktests: 'GET /api/v1/backtests/saved → {backtests: [{backtest_id, kind, name, report_sha256, input_sha256, strategy_ids, created_at}]}',
  loadBacktest: 'GET /api/v1/backtests/saved?id → {backtest_id, kind, name, result, ...}',
  saveBacktest: 'POST /api/v1/backtests/saved {name, kind: BACKTEST, params} → 201 SAVED | 200 ALREADY_SAVED {backtest_id}',
  listStrategies: 'GET /api/v1/strategies → {strategies: [{key, version, strategy_id, name}]}',
  saveStrategy: 'POST /api/v1/strategies {key, name, rules} → 201 SAVED | 200 UNCHANGED {key, version, strategy_id}',
  loadStrategy: 'GET /api/v1/strategies?key[&version] → {strategy: {key, version, strategy_id, name, definition, created_at, superseded_at}, versions: [{version, strategy_id, name, created_at, superseded_at}], rules}',
});

export function createPersistence({fetch: fetchImpl = (...args) => globalThis.fetch(...args), base = ''} = {}) {
  const call = async (method, path, body) => {
    let response;
    try {
      response = await fetchImpl(`${base}${path}`, {method, credentials: 'same-origin',
        headers: body === undefined ? {accept: 'application/json'} : {accept: 'application/json', 'content-type': 'application/json'},
        body: body === undefined ? undefined : JSON.stringify(body)});
    } catch {
      return {ok: false, status: 0, code: 'NETWORK'};
    }
    const json = await response.json().catch(() => null);
    if (!response.ok) return {ok: false, status: response.status, code: json?.error?.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'HTTP_ERROR')};
    if (!json || typeof json !== 'object' || !('data' in json)) return {ok: false, status: response.status, code: 'BAD_ENVELOPE'};
    return {ok: true, status: response.status, data: json.data};
  };
  return {
    status: () => call('GET', '/api/v1/persistence/status'),
    listBacktests: () => call('GET', '/api/v1/backtests/saved'),
    loadBacktest: id => call('GET', `/api/v1/backtests/saved?id=${encodeURIComponent(id)}`),
    saveBacktest: ({name, params}) => call('POST', '/api/v1/backtests/saved', {name, kind: 'BACKTEST', params}),
    listStrategies: () => call('GET', '/api/v1/strategies'),
    saveStrategy: ({key, name, rules}) => call('POST', '/api/v1/strategies', {key, name, rules}),
    loadStrategy: (key, version = null) => call('GET', `/api/v1/strategies?${new URLSearchParams(version === null ? {key} : {key, version})}`),
  };
}

// The mock: `results` maps a canonical query string to the backtest result the real server would produce for it, and
// `strategies` maps the canonical rules to the strategy id the server derives from them, or to {strategy_id, definition}
// with the stored definition too (the mock never computes either; rules it does not know are refused). `schema`: the persistence schema exists (else 503); `auth`: the owner
// login is enforced (else writes 403); `session`: with the login enforced, an owner session is open (else every call
// 401, as the auth gate answers). Checks run in the order of the real server. `now` gives the saved instant.
export function createMemoryPersistence({results = {}, strategies: knownStrategies = {}, schema = true, auth = true, session = true,
  now = () => '2026-10-20T08:00:00.000Z'} = {}) {
  const backtests = [];
  const strategies = new Map();
  const fail = (status, code) => ({ok: false, status, code});
  const ok = (status, data) => ({ok: true, status, data: structuredClone(data)});
  const KEY = /^[a-z0-9][a-z0-9-]{0,62}$/;
  const visible = text => typeof text === 'string' && text.trim() !== '' && text.length <= 200 && !/[\p{Cc}\p{Cf}]/u.test(text);
  const texts = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string');
  const canonical = params => Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const RULES = ['selection', 'side', 'odds_min', 'odds_max', 'home_min', 'home_max', 'draw_min', 'draw_max', 'away_min', 'away_max', 'team', 'venue'];
  const gate = write => (auth && !session ? fail(401, 'UNAUTHENTICATED') : write && !auth ? fail(403, 'WRITES_REQUIRE_AUTH') : !schema ? fail(503, 'UNAVAILABLE') : null);
  // The saved strategies are private (MP-UI-PR-006): with the login off nobody reads them, before any schema check.
  const strategyGate = () => (auth && !session ? fail(401, 'UNAUTHENTICATED') : !auth ? fail(403, 'READS_REQUIRE_AUTH') : !schema ? fail(503, 'UNAVAILABLE') : null);
  return {
    status: async () => (auth && !session ? fail(401, 'UNAUTHENTICATED') : ok(200, {available: schema, writes_enabled: schema && auth})),
    listBacktests: async () => gate(false) ?? ok(200, {backtests: [...backtests].reverse().map(({result, response_text: _, params: __, ...meta}) => meta)}),
    loadBacktest: async id => {
      const refused = gate(false);
      if (refused) return refused;
      if (!/^[1-9][0-9]{0,8}$/.test(String(id))) return fail(400, 'BAD_REQUEST');
      const found = backtests.find(b => b.backtest_id === Number(id));
      return found ? ok(200, found) : fail(404, 'NOT_FOUND');
    },
    saveBacktest: async ({name, params}) => {
      const refused = gate(true);
      if (refused) return refused;
      if (!visible(name) || !texts(params)) return fail(400, 'BAD_REQUEST');
      const result = results[canonical(params)];
      if (!result) return fail(400, 'BAD_REQUEST');
      const sha = result.report.report_sha256;
      const existing = backtests.find(b => b.report_sha256[0] === sha && canonical(b.params) === canonical(params));
      if (existing) return ok(200, {status: 'ALREADY_SAVED', backtest_id: existing.backtest_id, kind: 'BACKTEST'});
      const record = {backtest_id: backtests.length + 1, kind: 'BACKTEST', name: name.trim(), report_sha256: [sha], input_sha256: result.report.dataset?.input_sha256 ?? null,
        strategy_ids: [result.report.config?.strategy ?? null], created_at: now(), params: {...params}, response_text: JSON.stringify(result), result: structuredClone(result)};
      backtests.push(record);
      return ok(201, {status: 'SAVED', backtest_id: record.backtest_id, kind: 'BACKTEST'});
    },
    listStrategies: async () => strategyGate() ?? ok(200, {strategies: [...strategies.values()].map(s => s.at(-1))
      .map(({key, version, strategy_id, name}) => ({key, version, strategy_id, name})).sort((a, b) => a.key.localeCompare(b.key))}),
    // Called with the page's arguments only: the strategy id is the one the server derives from the same rules.
    saveStrategy: async ({key, name, rules}) => {
      const refused = gate(true);
      if (refused) return refused;
      if (!texts(rules)) return fail(400, 'BAD_REQUEST');
      if (Object.keys(rules).some(rule => !RULES.includes(rule))) return fail(400, 'UNKNOWN_FIELD');
      const known = knownStrategies[canonical(rules)];
      const strategyId = typeof known === 'string' ? known : known?.strategy_id;
      if (!KEY.test(key ?? '') || !visible(name) || typeof strategyId !== 'string') return fail(400, 'BAD_REQUEST');
      const versions = strategies.get(key) ?? [];
      const current = versions.at(-1);
      if (current && current.strategy_id === strategyId && current.name === name.trim()) return ok(200, {status: 'UNCHANGED', key, version: current.version, strategy_id: strategyId});
      const version = (current?.version ?? 0) + 1;
      if (current) current.superseded_at = now();
      strategies.set(key, [...versions, {key, version, strategy_id: strategyId, name: name.trim(), created_at: now(), superseded_at: null,
        rules: {...rules}, definition: typeof known === 'object' ? structuredClone(known.definition) : null}]);
      return ok(201, {status: 'SAVED', key, version, strategy_id: strategyId});
    },
    loadStrategy: async (key, version = null) => {
      const refused = strategyGate();
      if (refused) return refused;
      if (!KEY.test(String(key ?? '')) || (version !== null && !/^[1-9][0-9]{0,8}$/.test(String(version)))) return fail(400, 'BAD_REQUEST');
      const versions = strategies.get(key) ?? [];
      const found = version === null ? versions.find(v => v.superseded_at === null) : versions.find(v => v.version === Number(version));
      if (!found) return fail(404, 'NOT_FOUND');
      const {rules, ...strategy} = found;
      return ok(200, {strategy, versions: versions.map(({key: _, rules: __, definition: ___, ...v}) => v), rules});
    },
  };
}
