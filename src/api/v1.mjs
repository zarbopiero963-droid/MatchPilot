// R-03 (#98): versioned read-only API v1. One registry describes every endpoint (path, parameters,
// source, provenance), every response uses the same envelope and every error a stable code.
// The API reads only MatchPilot's database: no provider call, no LIVE, no write.
import {QUERY_CATALOG, ROUTES as FPT_LEGACY_ROUTES, runQuery} from '../providers/futpython/query.mjs';

export const API_VERSION = 'v1';
export const MAX_QUERY_LENGTH = 2048;
export const MAX_PARAM_LENGTH = 200;

const STATUS = {BAD_REQUEST: 400, UNKNOWN_PARAMETER: 400, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405, URI_TOO_LONG: 414, UNAVAILABLE: 503, INTERNAL: 500};

export class ApiError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

const param = (description, required = false) => ({type: 'string', required, description});

// FutPythonTrader endpoints come from the machine-readable query catalog, so v1 never drifts from it.
const FPT_ENDPOINTS = QUERY_CATALOG.map(entry => ({
  path: entry.route.replace('/api/fpt/', '/api/v1/fpt/'),
  legacy: entry.route,
  source: 'FutPythonTrader',
  summary: entry.question,
  // Presence and format of each parameter are enforced by the query layer (QueryInputError -> 400).
  params: Object.fromEntries(Object.entries(entry.params).map(([name, description]) => [name, param(String(description), /obbligatorio/.test(String(description)))])),
  read: (client, input) => runQuery(client, entry.name, input),
  provenance: data => data.provenance,
}));

const tcProvenance = report => ({source: 'database', source_provider: 'totalcorner', upstream_calls: 0, report_version: report?.version ?? null});

function tcEndpoint(name, summary, params, read) {
  return {path: `/api/v1/tc/${name}`, legacy: `/api/tc/${name}`, source: 'TotalCorner', summary, params, read, provenance: tcProvenance};
}

export function createEndpoints(tc) {
  return [
    {path: '/api/v1/health', source: 'MatchPilot', summary: 'Process health and API version (no database access)', params: {}, db: false,
      read: () => ({status: 'ok', product: 'MatchPilot Trading OS'}), provenance: () => ({source: 'process'})},
    {path: '/api/v1/endpoints', source: 'MatchPilot', summary: 'Machine-readable registry of every v1 endpoint and of the legacy routes', params: {}, db: false,
      read: () => null, provenance: () => ({source: 'registry'})},
    {path: '/api/v1/providers', source: 'MatchPilot', summary: 'Provider data health and FutPythonTrader certification state', params: {},
      read: async client => ({data_health: await tc.dataHealth(client), futpython_certification: await tc.fptCertification(client)}),
      provenance: () => ({source: 'database', upstream_calls: 0})},
    ...FPT_ENDPOINTS,
    tcEndpoint('discovery', 'TotalCorner discovery report', {}, client => tc.discovery(client)),
    tcEndpoint('schema-registry', 'TotalCorner observed schema registry', {endpoint_family: param('endpoint family'), phase: param('phase'), limit: param('1–500')},
      (client, input) => tc.schemaRegistry(client, {family: input.endpoint_family, phase: input.phase, limit: input.limit})),
    tcEndpoint('mapping', 'FutPythonTrader ↔ TotalCorner competition mapping', {status: param('VERIFIED | other mapping states')},
      (client, input) => tc.mapping(client, {status: input.status})),
    tcEndpoint('prematch', 'TotalCorner prematch collection report', {}, client => tc.prematch(client)),
    tcEndpoint('prematch/match', 'Prematch markets of one match known at a point in time', {
      id: param('TotalCorner match id', true), as_of: param('ISO-8601 instant'), knowledge: param('provider | captured')},
    (client, input) => tc.prematchMatch(client, {matchId: input.id, asOf: input.as_of, knowledge: input.knowledge === 'captured' ? 'captured' : 'provider'})),
    tcEndpoint('historical', 'TotalCorner historical upstream report', {}, client => tc.historical(client)),
    tcEndpoint('live', 'TotalCorner captured live data report (no LIVE acquisition)', {}, client => tc.live(client)),
  ];
}

// Legacy routes stay reachable for compatibility; each is mapped to its v1 successor (MP-API-006).
// Authentication of every route is decided in R-04 (MP-SEC-001).
export function legacyInventory(endpoints) {
  const successor = new Map(endpoints.filter(e => e.legacy).map(e => [e.legacy, e.path]));
  const legacy = [...Object.keys(FPT_LEGACY_ROUTES), '/api/tc/discovery', '/api/tc/schema-registry', '/api/tc/mapping', '/api/tc/prematch', '/api/tc/prematch/match', '/api/tc/historical', '/api/tc/live',
    '/api/futpython-certificate', '/api/futpython-certification', '/api/data-health', '/healthz', '/coverage'];
  const named = {'/api/futpython-certification': '/api/v1/providers', '/api/data-health': '/api/v1/providers', '/healthz': '/api/v1/health', '/api/fpt/catalog': '/api/v1/endpoints'};
  return legacy.map(route => ({route, successor: successor.get(route) ?? named[route] ?? null, status: successor.get(route) || named[route] ? 'DEPRECATED' : 'KEPT', auth: 'pending R-04 (MP-SEC-001)'}));
}

function describe(endpoints) {
  return {
    api_version: API_VERSION,
    endpoints: endpoints.map(e => ({path: e.path, method: 'GET', source: e.source, summary: e.summary, params: e.params, legacy: e.legacy ?? null, auth: 'pending R-04 (MP-SEC-001)'})),
    legacy_routes: legacyInventory(endpoints),
    errors: Object.entries(STATUS).map(([code, status]) => ({code, status})),
  };
}

function validateInput(endpoint, url) {
  if (url.search.length > MAX_QUERY_LENGTH) throw new ApiError('URI_TOO_LONG', `query string longer than ${MAX_QUERY_LENGTH} characters`);
  const input = {};
  for (const [name, value] of url.searchParams) {
    if (!Object.hasOwn(endpoint.params, name)) throw new ApiError('UNKNOWN_PARAMETER', `unknown parameter: ${name.slice(0, 40)}`, {allowed: Object.keys(endpoint.params)});
    if (Object.hasOwn(input, name)) throw new ApiError('BAD_REQUEST', `parameter repeated: ${name}`);
    if (value.length > MAX_PARAM_LENGTH) throw new ApiError('BAD_REQUEST', `parameter ${name} longer than ${MAX_PARAM_LENGTH} characters`);
    input[name] = value;
  }
  for (const [name, spec] of Object.entries(endpoint.params)) {
    if (spec.required && !Object.hasOwn(input, name)) throw new ApiError('BAD_REQUEST', `missing required parameter: ${name}`);
  }
  return input;
}

function rowCount(data) {
  if (Array.isArray(data?.rows)) return data.rows.length;
  if (Array.isArray(data)) return data.length;
  return null;
}

export function envelope(endpoint, data, {codeVersion, now = new Date(), input = {}} = {}) {
  return {
    api_version: API_VERSION,
    endpoint: endpoint.path,
    data,
    meta: {
      source: endpoint.source,
      provenance: endpoint.provenance(data) ?? null,
      as_of: input.as_of ?? now.toISOString(),
      generated_at: now.toISOString(),
      code_version: codeVersion,
      coverage: {rows: rowCount(data), limit: input.limit ? Number(input.limit) : null},
    },
  };
}

export function errorBody(error) {
  return {api_version: API_VERSION, error: {code: error.code, message: error.message, ...(error.details ? {details: error.details} : {})}};
}

// Returns {status, body}. Never throws; internal errors are reduced to a stable code without details.
export async function handleV1({method, url}, {withClient, tc, codeVersion = 'unknown', now = () => new Date()}) {
  const endpoints = createEndpoints(tc);
  try {
    const endpoint = endpoints.find(e => e.path === url.pathname);
    if (!endpoint) throw new ApiError('NOT_FOUND', 'unknown v1 endpoint; see /api/v1/endpoints');
    if (method !== 'GET') throw new ApiError('METHOD_NOT_ALLOWED', 'only GET is supported');
    const input = validateInput(endpoint, url);
    let data;
    if (endpoint.path === '/api/v1/endpoints') data = describe(endpoints);
    else if (endpoint.db === false) data = await endpoint.read(null, input);
    else {
      try { data = await withClient(client => endpoint.read(client, input)); }
      catch (error) {
        if (error?.code === 'BAD_QUERY_INPUT') throw new ApiError('BAD_REQUEST', String(error.message));
        throw new ApiError('UNAVAILABLE', 'data source unavailable');
      }
    }
    if (data === null || data === undefined) throw new ApiError('NOT_FOUND', 'no data for this request');
    return {status: 200, body: envelope(endpoint, data, {codeVersion, now: now(), input})};
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError('INTERNAL', 'internal error');
    return {status: safe.status, body: errorBody(safe)};
  }
}
