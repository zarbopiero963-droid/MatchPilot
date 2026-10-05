import http from 'node:http';
import { migrate } from './migrate.mjs';
import { startFutpythonCron, stopFutpythonCron } from './jobs/futpython-cron.mjs';
import { runFutpythonSync } from './jobs/futpython-sync.mjs';
import { closePool } from './db.mjs';
import { startDataWatchdog, stopDataWatchdog } from './jobs/data-watchdog.mjs';
import { getDataHealth, configureTelegramOutboundOnly, sendTelegramConnectivityTest } from './alerts.mjs';
import { getFutpythonCertificationStatus } from './futpython-certification.mjs';
import { runPhase1Verification } from './jobs/futpython-certify-phase1.mjs';
import { certificateReport } from './futpython-certificate.mjs';
import { ROUTES, runQuery } from './providers/futpython/query.mjs';
import { withClient } from './db.mjs';

const port = Number(process.env.PORT || 3000);

await migrate();
startFutpythonCron();
startDataWatchdog();
configureTelegramOutboundOnly()
  .then(()=>sendTelegramConnectivityTest())
  .then(r=>console.log('TELEGRAM_OUTBOUND_ONLY '+JSON.stringify({status:r?.status || 'configured'})))
  .catch(e=>console.error('TELEGRAM_SETUP_ERROR', String(e?.message||e).replace(/bot\d+:[A-Za-z0-9_-]+/g,'bot[REDACTED]')));
if (process.env.FUTPYTHON_PHASE1_VERIFY_ON_START === 'true') {
  runPhase1Verification()
    .then(r=>console.log('FUTPYTHON_PHASE1_VERIFY_ON_START '+JSON.stringify({status:r.status,checks:r.checks,failed:r.failed})))
    .catch(e=>console.error('FUTPYTHON_PHASE1_VERIFY_ERROR',String(e?.message||e).replace(/api_key=[^&\\s]+/gi,'api_key=[REDACTED]')));
}
if (process.env.FUTPYTHON_BACKFILL_ON_START === 'true') {
  runFutpythonSync({kind:'backfill',mode:'backfill'})
    .catch(e => console.error('FUTPYTHON_BACKFILL_ERROR', String(e?.message||e).replace(/api_key=[^&\\s]+/gi,'api_key=[REDACTED]')));
}

const app = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const url = new URL(req.url || '/', 'http://localhost');

  if (url.pathname === '/api/futpython-certificate') {
    let result;
    try { result = certificateReport(); }
    catch { result = {state: 'error', report: null}; }
    res.writeHead(result.report ? 200 : 202, {'Content-Type':'application/json'});
    res.end(JSON.stringify(result));
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

  if (req.url === '/') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    return res.end(`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MatchPilot — Sports Trading OS</title><style>body{margin:0;background:#07111f;color:#e6eef8;font-family:system-ui,-apple-system,sans-serif}main{max-width:1050px;margin:auto;padding:48px 20px}h1{font-size:42px;margin:0 0 10px}p{color:#a9bad0;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:32px}.card{background:#0e1d31;border:1px solid #203753;border-radius:18px;padding:20px}strong{display:block;font-size:18px;margin-bottom:8px}.badge{display:inline-block;background:#173652;border-radius:999px;padding:7px 11px;font-size:13px}</style></head><body><main><span class="badge">DATA FOUNDATION</span><h1>MatchPilot</h1><p>Sports Trading OS. Mirror FutPythonTrader con schema discovery automatico e TotalCorner per mercato/live.</p><div class="grid"><div class="card"><strong>Daily Board</strong><p>In costruzione.</p></div><div class="card"><strong>Match Center</strong><p>Tutti i dati FutPythonTrader saranno esposti in card.</p></div><div class="card"><strong>Live Trading</strong><p>TotalCorner sarà il layer live separato.</p></div><div class="card"><strong>Data Mirror</strong><p>Catalogo, raw snapshot, versioni e coverage automatici.</p></div></div></main></body></html>`);
  }

  res.writeHead(404, {'Content-Type':'application/json'});
  res.end(JSON.stringify({error:'not_found'}));
});

app.listen(port,'0.0.0.0',()=>console.log(`MatchPilot Trading OS listening on ${port}`));

async function shutdown() {
  stopFutpythonCron();
  stopDataWatchdog();
  app.close(async()=>{ await closePool().catch(()=>{}); process.exit(0); });
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
