import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import pg from 'pg';
const keys=['DATABASE_URL','GOAT_USERNAME','GOAT_PASSWORD'];
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const pool=process.env.DATABASE_URL?new pg.Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:8000}):null;
const server=http.createServer(async(req,res)=>{
res.setHeader('Cache-Control','no-store');
res.setHeader('X-Content-Type-Options','nosniff');
res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"status":"ok"}')}
const user=process.env.APP_USERNAME,password=process.env.APP_PASSWORD;
if(!user||!password){res.writeHead(503);return res.end('Accesso privato da configurare.')}
const token=(req.headers.authorization||'').replace(/^Basic /,'');
if(!equal(Buffer.from(token,'base64').toString(),user+':'+password)){
res.writeHead(401,{'WWW-Authenticate':'Basic realm="MatchPilot"'});return res.end('Accesso richiesto.')}
if(req.url!=='/'){res.writeHead(404);return res.end('Pagina non trovata.')}
let database='Non configurato';
if(pool){try{await pool.query('SELECT 1');database='Connessione verificata'}catch{database='Connessione fallita: controllare configurazione'}}
const configured=keys.every(k=>Boolean(process.env[k]));
res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
res.end(`<!doctype html><html lang="it"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MatchPilot — Test</title><style>body{background:#081422;color:#dce8f5;font:17px system-ui;margin:40px auto;max-width:760px;padding:20px}section{background:#112238;padding:24px;border-radius:16px;margin:20px 0}h1{color:#4dd9bd}</style><h1>MatchPilot</h1><p>Verifica iniziale dell'infrastruttura</p><section><h2>Configurazione</h2><p>Variabili di acquisizione: ${configured?'Presenti':'Incomplete'}</p><p>Database: ${database}</p></section><section><h2>Mappatura</h2><p>Accesso e lettura del portale pubblico verificati il 2 ottobre 2026.</p><p>Login, pagine interne e acquisizione automatica: da verificare.</p><p>Il servizio non esegue ancora navigazione automatica o analisi.</p></section></html>`);
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0');
process.on('SIGTERM',()=>server.close(async()=>{if(pool)await pool.end();process.exit(0)}));
