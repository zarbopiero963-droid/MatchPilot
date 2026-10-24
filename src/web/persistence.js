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
  };
}

// The mock: `results` maps a canonical query string to the backtest result the real server would produce for it (the
// mock never computes one). `schema`: the persistence schema exists (else reads answer 503); `auth`: the owner login is
// enforced and the session open (else writes answer 403). Writes check the login first, then the schema, in the order
// of the real server. `now` gives the saved instant, so runs are reproducible.
export function createMemoryPersistence({results = {}, schema = true, auth = true, now = () => '2026-10-20T08:00:00.000Z'} = {}) {
  const backtests = [];
  const strategies = new Map();
  const fail = (status, code) => ({ok: false, status, code});
  const ok = (status, data) => ({ok: true, status, data: structuredClone(data)});
  const KEY = /^[a-z0-9][a-z0-9-]{0,62}$/;
  const visible = text => typeof text === 'string' && text.trim() !== '' && text.length <= 200 && !/[\p{Cc}\p{Cf}]/u.test(text);
  const texts = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => typeof v === 'string');
  const canonical = params => Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  const gate = write => (write && !auth ? fail(403, 'WRITES_REQUIRE_AUTH') : !schema ? fail(503, 'UNAVAILABLE') : null);
  return {
    status: async () => ok(200, {available: schema, writes_enabled: schema && auth}),
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
        strategy_ids: [result.report.config?.strategy ?? null], created_at: now(), params: {...params}, result: structuredClone(result)};
      backtests.push(record);
      return ok(201, {status: 'SAVED', backtest_id: record.backtest_id, kind: 'BACKTEST'});
    },
    listStrategies: async () => gate(false) ?? ok(200, {strategies: [...strategies.values()].map(s => s.at(-1)).sort((a, b) => a.key.localeCompare(b.key))}),
    // The strategy id comes from the result the real server produced for the same rules: the mock never derives one.
    saveStrategy: async ({key, name, rules, strategyId}) => {
      const refused = gate(true);
      if (refused) return refused;
      if (!KEY.test(key ?? '') || !visible(name) || !texts(rules) || typeof strategyId !== 'string') return fail(400, 'BAD_REQUEST');
      const versions = strategies.get(key) ?? [];
      const current = versions.at(-1);
      if (current && current.strategy_id === strategyId && current.name === name.trim()) return ok(200, {status: 'UNCHANGED', key, version: current.version, strategy_id: strategyId});
      const version = (current?.version ?? 0) + 1;
      strategies.set(key, [...versions, {key, version, strategy_id: strategyId, name: name.trim()}]);
      return ok(201, {status: 'SAVED', key, version, strategy_id: strategyId});
    },
  };
}
