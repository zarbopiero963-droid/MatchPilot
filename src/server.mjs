import http from 'node:http';
import { migrate } from './migrate.mjs';
import { startFutpythonCron, stopFutpythonCron } from './jobs/futpython-cron.mjs';
import { closePool } from './db.mjs';

const port = Number(process.env.PORT || 3000);

await migrate();
startFutpythonCron();

const app = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

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
  app.close(async()=>{ await closePool().catch(()=>{}); process.exit(0); });
}
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
