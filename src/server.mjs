import http from 'node:http';
import { migrate } from './migrate.mjs';
import { closePool } from './db.mjs';
import { getDataHealth } from './alerts.mjs';
import { getFutpythonCertificationStatus } from './futpython-certification.mjs';
import { certificateReport } from './futpython-certificate.mjs';
import { ROUTES, runQuery } from './providers/futpython/query.mjs';
import { withClient } from './db.mjs';
import { renderCoverageCompetitions, renderCoverageSeasons } from './coverage-page.mjs';
import { tcDiscoveryReport, tcSchemaRegistry } from './jobs/totalcorner-discovery.mjs';
import { tcMappingReport } from './jobs/totalcorner-mapping.mjs';
import { tcPrematchMatch, tcPrematchReport } from './jobs/totalcorner-prematch.mjs';
import { tcHistoricalReport } from './jobs/totalcorner-historical.mjs';
import { tcLiveReport } from './jobs/totalcorner-live.mjs';
import { assertRuntimeSafety, startBackgroundServices, stopBackgroundServices } from './background.mjs';
import { readFileSync } from 'node:fs';
import { createEndpoints, handleV1, legacyInventory } from './api/v1.mjs';
import { authConfig } from './auth/owner-auth.mjs';
import { createAuthGate } from './auth/http.mjs';
import { serveWeb } from './web/static.mjs';
import { MAX_BODY_BYTES, PERSISTENCE_ROUTES, handlePersistence } from './api/persistence-api.mjs';

const port = Number(process.env.PORT || 3000);

// R-03: read-only API v1 over the same database readers as the legacy routes.
const TC_READERS = {
  discovery: client => tcDiscoveryReport(client), schemaRegistry: tcSchemaRegistry, mapping: tcMappingReport,
  prematch: client => tcPrematchReport(client), prematchMatch: tcPrematchMatch,
  historical: client => tcHistoricalReport(client), live: client => tcLiveReport(client),
  dataHealth: () => getDataHealth(), fptCertification: () => getFutpythonCertificationStatus(),
};
const CODE_VERSION = process.env.MATCHPILOT_CODE_VERSION
  || `package-${JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version}`;
const LEGACY_SUCCESSORS = new Map(legacyInventory(createEndpoints(TC_READERS)).filter(item => item.successor).map(item => [item.route, item.successor]));

const runtime = assertRuntimeSafety();
await migrate();
// The HTTP process must never wait for provider/collector initialization.
void startBackgroundServices().catch(error => {
  console.error('MATCHPILOT_BACKGROUND_ERROR', String(error?.message || error));
});

// R-04b (#23, D12): owner login, off unless MATCHPILOT_AUTH=enforce. An invalid MATCHPILOT_AUTH stops startup.
const authGate = createAuthGate({config: authConfig(), withClient});

const app = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // A request target such as `//` is not a valid relative URL: answer 400 instead of crashing the process
  // (PR #159 review NB-5).
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch {
    res.writeHead(400, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({error: 'bad_request'}));
  }
  if (!authGate) return route(req, res, url);
  authGate(req, res, url).then(handled => { if (!handled) route(req, res, url); }).catch(error => {
    // Fail closed: an auth error never lets the request through.
    console.error('MATCHPILOT_AUTH_ERROR', String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]'));
    if (!res.headersSent) res.writeHead(503, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'unavailable'}));
  });
});

// The request body as text for POST ({text: null} otherwise); past `limit` bytes reading stops and the body is reported
// as too large, without buffering the rest.
function readBody(req, limit) {
  if (req.method !== 'POST') return Promise.resolve({text: null, tooLarge: false});
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { req.pause(); resolve({text: null, tooLarge: true}); return; }
      chunks.push(chunk);
    });
    req.on('end', () => { if (size <= limit) resolve({text: Buffer.concat(chunks).toString('utf8'), tooLarge: false}); });
    req.on('error', reject);
  });
}

function route(req, res, url) {
  // R-05: read-only web shell at / (static files; data comes from /api/v1 in the browser).
  if (serveWeb(req, res, url)) return;
  // PERSIST-API-01: persistence routes (reads, and owner-only same-origin JSON writes; 503 until the schema exists).
  if (Object.hasOwn(PERSISTENCE_ROUTES, url.pathname)) {
    const runV1 = target => handleV1({method: 'GET', url: target}, {withClient, tc: TC_READERS, codeVersion: CODE_VERSION});
    let cut = false;
    readBody(req, MAX_BODY_BYTES).then(({text, tooLarge}) => {
      cut = tooLarge;
      return handlePersistence({method: req.method, url, headers: req.headers, rawBody: text, tooLarge},
        {withClient, authEnforced: Boolean(authGate), session: req.authSession ?? null, runV1});
    }).then(({status, body}) => {
      // A body that was not read to the end leaves the connection unusable, whatever the answer (413, or a refusal of
      // the gate): close it after the answer and drop the rest of the upload.
      res.writeHead(status, {'Content-Type': 'application/json', ...(cut ? {Connection: 'close'} : {})});
      res.end(JSON.stringify(body), () => { if (cut) req.destroy(); });
    }).catch(error => {
      if (req.aborted || error?.code === 'ECONNRESET') return; // the client went away: nothing to answer, nothing to log
      console.error('MATCHPILOT_PERSISTENCE_API_ERROR', String(error?.message || error).replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgres://[REDACTED]'));
      if (!res.headersSent) res.writeHead(500, {'Content-Type': 'application/json'});
      res.end();
    });
    return;
  }
  if (url.pathname.startsWith('/api/v1/')) {
    handleV1({method: req.method, url}, {withClient, tc: TC_READERS, codeVersion: CODE_VERSION}).then(({status, body}) => {
      res.writeHead(status, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(body));
    }).catch(error => {
      console.error('MATCHPILOT_API_V1_RESPONSE_ERROR', String(error?.message || error));
      if (!res.headersSent) res.writeHead(500, {'Content-Type': 'application/json'});
      res.end();
    });
    return;
  }
  if (LEGACY_SUCCESSORS.has(url.pathname)) {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${LEGACY_SUCCESSORS.get(url.pathname)}>; rel="successor-version"`);
  }

  if (url.pathname === '/api/futpython-certificate') {
    let result;
    try { result = certificateReport(); }
    catch { result = {state: 'error', report: null}; }
    res.writeHead(result.report ? 200 : 202, {'Content-Type':'application/json'});
    res.end(JSON.stringify(result));
    return;
  }

  // #12 Data Coverage → Competitions (HTML), from the same read-only queries as /api/fpt/coverage-*.
  if (['/api/tc/discovery', '/api/tc/schema-registry', '/api/tc/mapping', '/api/tc/prematch', '/api/tc/prematch/match', '/api/tc/historical', '/api/tc/live'].includes(url.pathname)) {
    const read = url.pathname === '/api/tc/discovery'
      ? client => tcDiscoveryReport(client)
      : url.pathname === '/api/tc/historical'
      ? client => tcHistoricalReport(client)
      : url.pathname === '/api/tc/live'
      ? client => tcLiveReport(client)
      : url.pathname === '/api/tc/prematch'
      ? client => tcPrematchReport(client)
      : url.pathname === '/api/tc/prematch/match'
      ? client => tcPrematchMatch(client, {matchId: url.searchParams.get('id'), asOf: url.searchParams.get('as_of'),
          knowledge: url.searchParams.get('knowledge') === 'captured' ? 'captured' : 'provider'})
      : url.pathname === '/api/tc/mapping'
      ? client => tcMappingReport(client, {status: url.searchParams.get('status')})
      : client => tcSchemaRegistry(client, {family: url.searchParams.get('endpoint_family'), phase: url.searchParams.get('phase'), limit: url.searchParams.get('limit')});
    withClient(read).then(data=>{
      res.writeHead(data === null ? 404 : 200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(data));
    }).catch(()=>{
      res.writeHead(503, {'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'error'}));
    });
    return;
  }

  if (url.pathname === '/coverage') {
    if (req.method !== 'GET') {
      res.writeHead(405, {'Content-Type':'text/plain; charset=utf-8', 'Allow':'GET'});
      res.end('Solo GET');
      return;
    }
    const input = Object.fromEntries(url.searchParams.entries());
    const drill = input.league != null && input.league !== '';
    withClient(client => runQuery(client, drill ? 'coverageSeasons' : 'coverageCompetitions', input)).then(data => {
      res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
      res.end(drill ? renderCoverageSeasons(input.country, input.league, data.rows) : renderCoverageCompetitions(data.rows, input));
    }).catch(error => {
      const bad = error?.code === 'BAD_QUERY_INPUT';
      res.writeHead(bad ? 400 : 503, {'Content-Type':'text/plain; charset=utf-8'});
      res.end(bad ? `Parametro non valido: ${String(error.message).replace(/[<>&]/g, '')}` : 'Coverage non disponibile');
    });
    return;
  }

  if (ROUTES[url.pathname]) {
    if (req.method !== 'GET') {
      res.writeHead(405, {'Content-Type':'application/json'});
      return res.end(JSON.stringify({error:'method_not_allowed'}));
    }
    const input = Object.fromEntries(url.searchParams.entries());
    withClient(client => runQuery(client, ROUTES[url.pathname], input)).then(data=>{
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(data));
    }).catch(error=>{
      const bad = error?.code === 'BAD_QUERY_INPUT';
      res.writeHead(bad ? 400 : 503, {'Content-Type':'application/json'});
      res.end(JSON.stringify(bad ? {error:'bad_request', message:error.message} : {status:'error'}));
    });
    return;
  }

  if (req.url === '/api/futpython-certification') {
    getFutpythonCertificationStatus().then(data=>{
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(data));
    }).catch(()=>{
      res.writeHead(503, {'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'error'}));
    });
    return;
  }

  if (req.url === '/api/data-health') {
    getDataHealth().then(data=>{
      res.writeHead(200, {'Content-Type':'application/json'});
      res.end(JSON.stringify(data));
    }).catch(()=>{
      res.writeHead(503, {'Content-Type':'application/json'});
      res.end(JSON.stringify({status:'error'}));
    });
    return;
  }

  if (req.url === '/healthz') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({status:'ok',product:'MatchPilot Trading OS'}));
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'not_found'}));
}

// PORT=0 binds a free port chosen by the OS; the log line names the port actually bound.
const listener = app.listen(port,process.env.MATCHPILOT_BIND_HOST||'0.0.0.0',()=>console.log(`MatchPilot Trading OS listening on ${listener.address().port} (${runtime.mode})`));

async function shutdown() {
  stopBackgroundServices();
  app.close(async()=>{ await closePool().catch(()=>{}); process.exit(0); });
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
