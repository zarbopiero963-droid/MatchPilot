// R-03 (#98): versioned read-only API v1. One registry describes every endpoint (path, parameters,
// source, provenance), every response uses the same envelope and every error a stable code.
// The API reads only MatchPilot's database: no provider call, no LIVE, no write.
import {QUERY_CATALOG, ROUTES as FPT_LEGACY_ROUTES, buildQuery, runQuery} from '../providers/futpython/query.mjs';

export const API_VERSION = 'v1';
export const MAX_QUERY_LENGTH = 2048;
export const MAX_PARAM_LENGTH = 200;
// R-04 (#23, D12): every v1 route needs an owner session when MATCHPILOT_AUTH=enforce; otherwise it is open.
export const AUTH_NOTE = 'owner session when MATCHPILOT_AUTH=enforce (R-04, docs/auth.md)';

const STATUS = {BAD_REQUEST: 400, UNKNOWN_PARAMETER: 400, NOT_FOUND: 404, METHOD_NOT_ALLOWED: 405, URI_TOO_LONG: 414, UNAVAILABLE: 503, INTERNAL: 500};

export class ApiError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

// `check` (not published) validates and normalizes one value before any database access.
const param = (description, required = false, check = undefined, maxLength = MAX_PARAM_LENGTH) => ({type: 'string', required, description, check, maxLength});
// A pagination cursor carries a provider match id, which can be long: it gets its own length limit.
const MAX_CURSOR_LENGTH = 1000;

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const instant = name => value => {
  if (!ISO_INSTANT.test(value) || Number.isNaN(Date.parse(value))) throw new ApiError('BAD_REQUEST', `${name} must be an ISO-8601 instant with time zone`);
  return new Date(value).toISOString();
};
const integer = (name, min, max) => value => {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(n) || n < min || n > max) throw new ApiError('BAD_REQUEST', `${name} must be an integer between ${min} and ${max}`);
  return n;
};
const oneOf = (name, values) => value => {
  if (!values.includes(value)) throw new ApiError('BAD_REQUEST', `${name} must be one of: ${values.join(', ')}`);
  return value;
};

// Parameters the query layer requires; the catalog describes them only in prose.
const FPT_REQUIRED = {
  teamSearch: ['q'], teamMatches: ['team'], awayMatches: ['team'], favoriteOddsRange: ['min', 'max'], teamMatchesAsOf: ['team', 'as_of'],
  leagueFieldCoverage: ['field'], leaguesWithCoverage: ['field'], teamSummary: ['team'], headToHead: ['team', 'opponent'],
  competitionSeason: ['competition', 'season'], matchesOnDate: ['date'], matchDetail: ['id'], coverageSeasons: ['country', 'league'],
};
// The query layer names its SQL inputs; errors use the API parameter names instead.
const FPT_INPUT_NAMES = {team_id: 'team', opponent_id: 'opponent', competition_id: 'competition', season_id: 'season', match_id: 'id', normalized_name: 'q'};
const apiMessage = message => String(message).replace(/\b(team_id|opponent_id|competition_id|season_id|match_id|normalized_name)\b/g, name => FPT_INPUT_NAMES[name]);

// FutPythonTrader endpoints come from the machine-readable query catalog, so v1 never drifts from it.
const FPT_ENDPOINTS = QUERY_CATALOG.map(entry => ({
  path: entry.route.replace('/api/fpt/', '/api/v1/fpt/'),
  legacy: entry.route,
  source: 'FutPythonTrader',
  summary: entry.question,
  params: Object.fromEntries(Object.entries(entry.params).map(([name, description]) => [name,
    param(String(description), (FPT_REQUIRED[entry.name] ?? []).includes(name), undefined, name === 'cursor' ? MAX_CURSOR_LENGTH : MAX_PARAM_LENGTH)])),
  // Format and ranges are enforced by the query layer; building the query first rejects bad input without a connection.
  precheck: input => buildQuery(entry.name, input),
  read: (client, input) => runQuery(client, entry.name, input),
  provenance: data => data.provenance,
  asOf: data => data.provenance?.as_of ?? null,
}));

const tcProvenance = report => ({source: 'database', source_provider: 'totalcorner', upstream_calls: 0, report_version: report?.version ?? null});

function tcEndpoint(name, summary, params, read, extra = {}) {
  return {path: `/api/v1/tc/${name}`, legacy: `/api/tc/${name}`, source: 'TotalCorner', summary, params, read, provenance: tcProvenance, ...extra};
}

export const TC_SCHEMA_REGISTRY_LIMIT = {default: 2000, max: 5000};

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
    tcEndpoint('schema-registry', 'TotalCorner observed schema registry', {endpoint_family: param('endpoint family'), phase: param('phase'),
      limit: param(`integer 1–${TC_SCHEMA_REGISTRY_LIMIT.max}, default ${TC_SCHEMA_REGISTRY_LIMIT.default}`, false, integer('limit', 1, TC_SCHEMA_REGISTRY_LIMIT.max))},
    (client, input) => tc.schemaRegistry(client, {family: input.endpoint_family, phase: input.phase, limit: input.limit ?? TC_SCHEMA_REGISTRY_LIMIT.default}),
    {limit: input => input.limit ?? TC_SCHEMA_REGISTRY_LIMIT.default}),
    tcEndpoint('mapping', 'FutPythonTrader ↔ TotalCorner competition mapping', {status: param('VERIFIED | other mapping states')},
      (client, input) => tc.mapping(client, {status: input.status})),
    tcEndpoint('prematch', 'TotalCorner prematch collection report', {}, client => tc.prematch(client)),
    tcEndpoint('prematch/match', 'Prematch markets of one match known at a point in time', {
      id: param('TotalCorner match id', true), as_of: param('ISO-8601 instant with time zone, default kickoff', false, instant('as_of')),
      knowledge: param('provider | captured, default provider', false, oneOf('knowledge', ['provider', 'captured']))},
    (client, input) => tc.prematchMatch(client, {matchId: input.id, asOf: input.as_of ?? null, knowledge: input.knowledge ?? 'provider'}),
    // The instant the reader actually used (the kickoff when as_of is omitted).
    {asOf: data => data.as_of ?? null}),
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
  // /healthz stays KEPT without a successor: it is the hosting platform's health-check path.
  const named = {'/api/futpython-certification': '/api/v1/providers', '/api/data-health': '/api/v1/providers', '/api/fpt/catalog': '/api/v1/endpoints'};
  return legacy.map(route => ({route, successor: successor.get(route) ?? named[route] ?? null, status: successor.get(route) || named[route] ? 'DEPRECATED' : 'KEPT', auth: AUTH_NOTE}));
}

function describe(endpoints) {
  return {
    api_version: API_VERSION,
    endpoints: endpoints.map(e => ({path: e.path, method: 'GET', source: e.source, summary: e.summary,
      params: Object.fromEntries(Object.entries(e.params).map(([name, {type, required, description}]) => [name, {type, required, description}])),
      legacy: e.legacy ?? null, auth: AUTH_NOTE})),
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
    const maxLength = endpoint.params[name].maxLength ?? MAX_PARAM_LENGTH;
    if (value.length > maxLength) throw new ApiError('BAD_REQUEST', `parameter ${name} longer than ${maxLength} characters`);
    input[name] = endpoint.params[name].check ? endpoint.params[name].check(value) : value;
  }
  for (const [name, spec] of Object.entries(endpoint.params)) {
    if (spec.required && !Object.hasOwn(input, name)) throw new ApiError('BAD_REQUEST', `missing required parameter: ${name}`);
  }
  try { endpoint.precheck?.(input); }
  catch (error) {
    if (error?.code === 'BAD_QUERY_INPUT') throw new ApiError('BAD_REQUEST', apiMessage(error.message));
    throw error;
  }
  return input;
}

function rowCount(data) {
  if (Array.isArray(data?.rows)) return data.rows.length;
  if (Array.isArray(data)) return data.length;
  return null;
}

// meta.as_of is the point in time the reader actually applied, or null when the endpoint has none.
// coverage.limit is the row limit applied when it is known (null: the query's own default).
export function envelope(endpoint, data, {codeVersion, now = new Date(), input = {}} = {}) {
  return {
    api_version: API_VERSION,
    endpoint: endpoint.path,
    data,
    meta: {
      source: endpoint.source,
      provenance: endpoint.provenance(data) ?? null,
      as_of: endpoint.asOf?.(data) ?? null,
      generated_at: now.toISOString(),
      code_version: codeVersion,
      // R-08: PIT label of point-in-time answers (MP-PIT-005); null for endpoints without a decision time.
      pit: data?.pit ?? null,
      coverage: {rows: rowCount(data), limit: endpoint.limit ? endpoint.limit(input) : input.limit != null ? Number(input.limit) : null},
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
      let connected = false;
      try { data = await withClient(client => { connected = true; return endpoint.read(client, input); }); }
      catch (error) {
        if (error?.code === 'BAD_QUERY_INPUT') throw new ApiError('BAD_REQUEST', apiMessage(error.message));
        // No connection, or a database/driver error (string code such as ECONNRESET or 57P01): the source is
        // unavailable. Any other exception raised while reading is a defect and stays INTERNAL.
        if (!connected || typeof error?.code === 'string') throw new ApiError('UNAVAILABLE', 'data source unavailable');
        throw error;
      }
    }
    if (data === null || data === undefined) throw new ApiError('NOT_FOUND', 'no data for this request');
    return {status: 200, body: envelope(endpoint, data, {codeVersion, now: now(), input})};
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError('INTERNAL', 'internal error');
    return {status: safe.status, body: errorBody(safe)};
  }
}
