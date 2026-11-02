// MP-AF-SCHED-01 (#263, #287): scheduler del collector API-FOOTBALL.
// Disattivato per default: parte solo con MP_AF_SCHEDULER_ENABLED=1 e un limite giornaliero esplicito; ogni altra
// variabile mancante prende il default, ogni valore non valido lascia lo scheduler disattivato (fail-closed).
// Da disattivato non apre il database e non chiama nulla.
// Un solo esecutore attivo: pg_try_advisory_lock sulla stessa sessione (mai un pool) + indice unico su RUNNING.
// Budget persistente e condiviso: riserva atomica in af_scheduler_budget prima di OGNI tentativo (anche i retry).
// Arresto sicuro: SIGTERM/SIGINT fermano tra due richieste; recupero crash: RUNNING orfani -> ABORTED.
// Ogni decisione (DONE, SKIPPED, RETRY) è scritta in af_scheduler_events; il motivo dello stop in af_scheduler_runs.
// Nessuna chiamata di rete qui: la richiesta è iniettata (fetchOne) e nei test è sempre finta.
// Nessuna cancellazione: lo scheduler non esegue DELETE, DROP né TRUNCATE su alcuna tabella.
import {statfs} from 'node:fs/promises';

export const LOCK_KEY = 2630032; // chiave advisory fissa, documentata (per database)
const MB = 1024 * 1024;

// Variabili numeriche: intero decimale stretto (niente '5abc', '1e3', ' 5', '-1'), entro [min, max].
export const LIMITS = Object.freeze({
  MP_AF_DAILY_BUDGET: {min: 1, max: 100000, def: null},          // obbligatorio
  MP_AF_MAX_REQUESTS_PER_RUN: {min: 1, max: 100000, def: null},  // facoltativo: senza, vale solo il budget giornaliero
  MP_AF_MIN_INTERVAL_MS: {min: 100, max: 600000, def: 1000},     // distanza minima tra due tentativi
  MP_AF_REQUEST_TIMEOUT_MS: {min: 1000, max: 120000, def: 15000},
  MP_AF_MAX_RETRIES: {min: 0, max: 5, def: 2},                   // solo errori transitori
  MP_AF_RETRY_BASE_MS: {min: 100, max: 60000, def: 2000},        // backoff base * 2^(n-1), massimo 60 s
  MP_AF_MIN_FREE_DISK_MB: {min: 1, max: 10000000, def: 8192},    // soglia CRIT di odds-retention.md §8
  MP_AF_MAX_ODDS_TABLE_MB: {min: 1, max: 10000000, def: 5120},   // tetto af_odds_snapshots, §8
});
const MAX_BACKOFF_MS = 60000;
const TASK_KEY = /^[A-Za-z0-9_.:=|/-]{1,200}$/;

export const SQL = Object.freeze({
  tryLock: 'SELECT pg_try_advisory_lock($1) AS ok',
  unlock: 'SELECT pg_advisory_unlock($1) AS ok',
  recover: `UPDATE af_scheduler_runs SET status='ABORTED', finished_at=now(), reason_code='CRASH_RECOVERED',
            note='recupero dopo crash' WHERE status='RUNNING' RETURNING id`,
  start: "INSERT INTO af_scheduler_runs(status, host, pid) VALUES ('RUNNING', $1, $2) RETURNING id",
  // Il limite in vigore è quello della configurazione corrente: abbassarlo ha effetto subito, il CHECK impedisce used > limite.
  reserve: `INSERT INTO af_scheduler_budget(day, daily_limit, used) VALUES ($1, $2, 1)
            ON CONFLICT (day) DO UPDATE SET used = af_scheduler_budget.used + 1, daily_limit = EXCLUDED.daily_limit, updated_at = now()
            WHERE af_scheduler_budget.used < EXCLUDED.daily_limit RETURNING used`,
  isDone: 'SELECT 1 AS done FROM af_scheduler_done WHERE day = $1 AND task_key = $2',
  markDone: 'INSERT INTO af_scheduler_done(day, task_key, run_id) VALUES ($1, $2, $3) ON CONFLICT (day, task_key) DO NOTHING',
  event: 'INSERT INTO af_scheduler_events(run_id, task_key, decision, reason_code, detail) VALUES ($1, $2, $3, $4, $5)',
  tableBytes: "SELECT COALESCE(pg_total_relation_size(to_regclass('af_odds_snapshots')), 0)::bigint AS bytes",
  finish: `UPDATE af_scheduler_runs SET status=$2, finished_at=now(), requests=$3, tasks_done=$4, reason_code=$5, note=$6
           WHERE id=$1 AND status='RUNNING'`,
});

function intVar(env, name) {
  const spec = LIMITS[name];
  const raw = env[name];
  if (raw === undefined || raw === '') return spec.def === null ? {missing: true} : {value: spec.def};
  if (typeof raw !== 'string' || !/^(0|[1-9]\d{0,9})$/.test(raw)) return {error: `${name} non è un intero decimale`};
  const value = Number(raw);
  if (value < spec.min || value > spec.max) return {error: `${name} fuori intervallo [${spec.min}, ${spec.max}]`};
  return {value};
}

export function schedulerConfig(env = {}) {
  if (env.MP_AF_SCHEDULER_ENABLED !== '1') {
    return {enabled: false, code: 'DISABLED_DEFAULT', reason: 'MP_AF_SCHEDULER_ENABLED non è 1 (default: disattivato)'};
  }
  const out = {};
  for (const name of Object.keys(LIMITS)) {
    const r = intVar(env, name);
    if (r.error) return {enabled: false, code: 'CONFIG_INVALID', reason: r.error};
    if (r.missing && name === 'MP_AF_DAILY_BUDGET') return {enabled: false, code: 'CONFIG_INVALID', reason: 'MP_AF_DAILY_BUDGET mancante'};
    out[name] = r.value ?? null;
  }
  const diskPath = env.MP_AF_DISK_PATH ?? '/';
  if (typeof diskPath !== 'string' || !diskPath.startsWith('/') || diskPath.includes('\0')) {
    return {enabled: false, code: 'CONFIG_INVALID', reason: 'MP_AF_DISK_PATH deve essere un percorso assoluto'};
  }
  return {
    enabled: true,
    dailyLimit: out.MP_AF_DAILY_BUDGET,
    maxPerRun: out.MP_AF_MAX_REQUESTS_PER_RUN,
    minIntervalMs: out.MP_AF_MIN_INTERVAL_MS,
    timeoutMs: out.MP_AF_REQUEST_TIMEOUT_MS,
    maxRetries: out.MP_AF_MAX_RETRIES,
    retryBaseMs: out.MP_AF_RETRY_BASE_MS,
    minFreeDiskBytes: out.MP_AF_MIN_FREE_DISK_MB * MB,
    maxOddsTableBytes: out.MP_AF_MAX_ODDS_TABLE_MB * MB,
    diskPath,
  };
}

const TRANSIENT_CODES = new Set(['TIMEOUT', 'NETWORK', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT']);
const QUOTA_CODES = new Set(['RATE_LIMITED', 'PROVIDER_QUOTA', 'BUDGET_DAY', 'BUDGET_MINUTE']);
const FATAL_CODES = new Set(['NOT_CONFIGURED', 'DISABLED', 'LEDGER_UNAVAILABLE']);
const CLIENT_CODES = new Set(['PARAM_INVALID', 'ENDPOINT_NOT_ALLOWED', 'INVALID_RESPONSE', 'PROVIDER_ERROR', 'HTTP_ERROR']);

// Classe dell'errore di una richiesta, sui codici di ApiFootballError (client.mjs) e sugli stati HTTP.
// transient: retry con backoff; quota: stop senza retry; client: task saltato senza retry; fatal: stop senza retry.
// Un errore sconosciuto è fatal (fail-closed), mai ritentato.
export function classifyError(err) {
  const status = Number.isInteger(err?.status) ? err.status : null;
  const code = typeof err?.code === 'string' ? err.code : null;
  const names = Array.isArray(err?.provider_error_names) ? err.provider_error_names : [];
  if (err?.name === 'AbortError' || TRANSIENT_CODES.has(code) || (status !== null && status >= 500)) return 'transient';
  if (status === 429 || QUOTA_CODES.has(code) || names.some((n) => /^(requests|rateLimit)$/i.test(n))) return 'quota';
  if (status === 401 || status === 403 || FATAL_CODES.has(code)) return 'fatal';
  if ((status !== null && status >= 400 && status < 500) || CLIENT_CODES.has(code)) return 'client';
  return 'fatal';
}

// Solo codice e stato: il testo dell'errore del provider non esce dallo scheduler.
const errorTag = (err) => `${typeof err?.code === 'string' ? err.code : err?.name ?? 'Error'}${Number.isInteger(err?.status) ? ` HTTP ${err.status}` : ''}`.slice(0, 80);

function withTimeout(start, ms) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error('timeout della richiesta'), {code: 'TIMEOUT'})); }, ms);
  });
  return Promise.race([Promise.resolve().then(() => start(controller.signal)), deadline]).finally(() => clearTimeout(timer));
}

export async function freeDiskBytesFs(path) {
  const s = await statfs(path);
  return Number(s.bavail) * Number(s.bsize);
}

const taskKey = (task) => (typeof task === 'string' ? task : task?.key);
// Un pool distribuisce le query su connessioni diverse: lock e unlock finirebbero su sessioni diverse.
const isSessionClient = (c) => c && typeof c.query === 'function' && !('totalCount' in c) && !('idleCount' in c);

// client: sessione PostgreSQL dedicata ({query(sql, params)}), tenuta per tutta l'esecuzione.
// tasks: stringhe o {key}, chiave stabile per giorno (es. 'odds:fixture=123:T-6h'): la stessa chiave non si ripete nello stesso giorno UTC.
export async function runScheduler({client, env, tasks, fetchOne, log = () => {}, host = 'local', pid = 0,
                                    today = () => new Date().toISOString().slice(0, 10), stopSignal = {stopped: false},
                                    now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
                                    freeDiskBytes = freeDiskBytesFs}) {
  const cfg = schedulerConfig(env);
  if (!cfg.enabled) { log({event: 'af.scheduler.disabled', code: cfg.code, reason: cfg.reason}); return {status: 'DISABLED', code: cfg.code, reason: cfg.reason}; }
  const reject = (code, reason) => { log({event: 'af.scheduler.rejected', code, reason}); return {status: 'REJECTED', code, reason}; };
  if (!isSessionClient(client)) return reject('CLIENT_NOT_SESSION', 'serve una sessione PostgreSQL dedicata, non un pool');
  if (typeof fetchOne !== 'function') return reject('TASKS_INVALID', 'fetchOne mancante');
  if (!Array.isArray(tasks) || !tasks.every((t) => typeof taskKey(t) === 'string' && TASK_KEY.test(taskKey(t)))) {
    return reject('TASKS_INVALID', 'ogni task ha una chiave [A-Za-z0-9_.:=|/-]{1,200}');
  }
  const lock = await client.query(SQL.tryLock, [LOCK_KEY]);
  if (!lock.rows[0]?.ok) { log({event: 'af.scheduler.busy'}); return {status: 'BUSY', code: 'LOCK_HELD'}; }
  const day = today();
  let runId = null, attempts = 0, done = 0, lastAttemptAt = -Infinity;
  let status = 'DONE', code = 'COMPLETED', note = null;
  const stop = (s, c, n) => { status = s; code = c; note = n; };
  const event = (key, decision, reason, detail = null) => client.query(SQL.event, [runId, key, decision, reason, detail]);
  try {
    const rec = await client.query(SQL.recover);
    if (rec.rows.length) log({event: 'af.scheduler.recovered', runs: rec.rows.map((r) => r.id)});
    runId = (await client.query(SQL.start, [host, pid])).rows[0].id;
    log({event: 'af.scheduler.start', run: runId, tasks: tasks.length});
    const seen = new Set();
    tasks: for (const task of tasks) {
      const key = taskKey(task);
      if (stopSignal.stopped) { stop('STOPPED', 'STOP_REQUESTED', 'arresto richiesto'); break; }
      if (seen.has(key)) { await event(key, 'SKIPPED', 'DUPLICATE_IN_RUN'); continue; }
      seen.add(key);
      if ((await client.query(SQL.isDone, [day, key])).rows.length) { await event(key, 'SKIPPED', 'ALREADY_DONE_TODAY'); continue; }
      // Spazio prima di scrivere: un controllo che fallisce o non dà un numero ferma tutto (fail-closed).
      let free;
      try { free = await freeDiskBytes(cfg.diskPath); } catch (err) { stop('STOPPED', 'DISK_CHECK_FAILED', errorTag(err)); break; }
      if (!Number.isFinite(free)) { stop('STOPPED', 'DISK_CHECK_FAILED', 'spazio libero non numerico'); break; }
      if (free < cfg.minFreeDiskBytes) { stop('STOPPED', 'DISK_LOW', `spazio libero ${Math.floor(free / MB)} MB sotto la soglia ${cfg.minFreeDiskBytes / MB} MB`); break; }
      const tableBytes = Number((await client.query(SQL.tableBytes)).rows[0]?.bytes);
      if (!Number.isFinite(tableBytes)) { stop('STOPPED', 'DISK_CHECK_FAILED', 'dimensione af_odds_snapshots non numerica'); break; }
      if (tableBytes > cfg.maxOddsTableBytes) { stop('STOPPED', 'TABLE_CAP', `af_odds_snapshots ${Math.floor(tableBytes / MB)} MB oltre il tetto ${cfg.maxOddsTableBytes / MB} MB`); break; }
      for (let attempt = 1; ; attempt += 1) {
        if (cfg.maxPerRun !== null && attempts >= cfg.maxPerRun) { stop('STOPPED', 'RUN_QUOTA', `quota per esecuzione ${cfg.maxPerRun} raggiunta`); break tasks; }
        const wait = lastAttemptAt + cfg.minIntervalMs - now();
        if (wait > 0) await sleep(wait);
        if (stopSignal.stopped) { stop('STOPPED', 'STOP_REQUESTED', 'arresto richiesto'); break tasks; }
        if (!(await client.query(SQL.reserve, [day, cfg.dailyLimit])).rows.length) { stop('STOPPED', 'BUDGET_EXHAUSTED', 'budget giornaliero esaurito'); break tasks; }
        attempts += 1;
        lastAttemptAt = now();
        try {
          await withTimeout((signal) => fetchOne(task, {signal, attempt}), cfg.timeoutMs);
        } catch (err) {
          const kind = classifyError(err);
          if (kind === 'transient' && attempt <= cfg.maxRetries) {
            await event(key, 'RETRY', 'TRANSIENT', errorTag(err));
            await sleep(Math.min(cfg.retryBaseMs * 2 ** (attempt - 1), MAX_BACKOFF_MS));
            continue;
          }
          if (kind === 'client') { await event(key, 'SKIPPED', 'CLIENT_ERROR', errorTag(err)); continue tasks; }
          if (kind === 'quota') stop('STOPPED', 'PROVIDER_QUOTA', errorTag(err));
          else if (kind === 'transient') stop('FAILED', 'PROVIDER_UNAVAILABLE', `${errorTag(err)} dopo ${attempt} tentativi`);
          else stop('FAILED', 'PROVIDER_FATAL', errorTag(err));
          break tasks;
        }
        await client.query(SQL.markDone, [day, key, runId]);
        await event(key, 'DONE', 'OK', attempt > 1 ? `tentativi ${attempt}` : null);
        done += 1;
        break;
      }
    }
  } catch (err) {
    // Database o budget non disponibili: nessuna richiesta oltre questo punto.
    stop('FAILED', 'INTERNAL_ERROR', String(err?.message ?? err).slice(0, 200));
  } finally {
    if (runId !== null) {
      try { await client.query(SQL.finish, [runId, status, attempts, done, code, note]); }
      catch (err) { log({event: 'af.scheduler.finish_failed', run: runId, error: errorTag(err)}); }
    }
    // Se la sessione è caduta il lock è già stato rilasciato da PostgreSQL; il RUNNING rimasto sarà recuperato.
    try { await client.query(SQL.unlock, [LOCK_KEY]); }
    catch (err) { log({event: 'af.scheduler.unlock_failed', error: errorTag(err)}); }
    log({event: 'af.scheduler.end', run: runId, status, code, requests: attempts, done, note});
  }
  return {status, code, requests: attempts, done, note, run: runId};
}

export function installStopHandlers(proc, stopSignal) {
  const stop = () => { stopSignal.stopped = true; };
  proc.on('SIGTERM', stop); proc.on('SIGINT', stop);
  return () => { proc.off('SIGTERM', stop); proc.off('SIGINT', stop); };
}
