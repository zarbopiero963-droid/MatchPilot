// MP-AF-SCHED-01 (#263): scheduler del collector API-FOOTBALL.
// Disattivato per default: parte solo con MP_AF_SCHEDULER_ENABLED=1 e un limite giornaliero esplicito.
// Un solo esecutore attivo: pg_try_advisory_lock sulla stessa sessione + indice unico su RUNNING.
// Budget persistente e condiviso: riserva atomica in af_scheduler_budget prima di ogni richiesta.
// Arresto sicuro: SIGTERM/SIGINT fermano tra due richieste; recupero crash: RUNNING orfani -> ABORTED.
// Nessuna chiamata di rete qui: la richiesta è iniettata (fetchOne) e nei test è sempre finta.

export const LOCK_KEY = 263_0032; // chiave advisory fissa, documentata
export const SQL = Object.freeze({
  tryLock: 'SELECT pg_try_advisory_lock($1) AS ok',
  unlock: 'SELECT pg_advisory_unlock($1) AS ok',
  recover: "UPDATE af_scheduler_runs SET status='ABORTED', finished_at=now(), note='recupero dopo crash' WHERE status='RUNNING' RETURNING id",
  start: "INSERT INTO af_scheduler_runs(status, host, pid) VALUES ('RUNNING', $1, $2) RETURNING id",
  reserve: `INSERT INTO af_scheduler_budget(day, daily_limit, used) VALUES ($1, $2, 1)
            ON CONFLICT (day) DO UPDATE SET used = af_scheduler_budget.used + 1
            WHERE af_scheduler_budget.used < af_scheduler_budget.daily_limit RETURNING used`,
  finish: 'UPDATE af_scheduler_runs SET status=$2, finished_at=now(), requests=$3, note=$4 WHERE id=$1',
});

export function schedulerConfig(env = {}) {
  const enabled = env.MP_AF_SCHEDULER_ENABLED === '1';
  const limit = Number.parseInt(env.MP_AF_DAILY_BUDGET ?? '', 10);
  if (!enabled) return {enabled: false, reason: 'MP_AF_SCHEDULER_ENABLED non è 1 (default: disattivato)'};
  if (!Number.isInteger(limit) || limit <= 0) return {enabled: false, reason: 'MP_AF_DAILY_BUDGET mancante o non valido'};
  return {enabled: true, dailyLimit: limit};
}

// client: sessione PostgreSQL dedicata ({query(sql, params)}), tenuta per tutta l'esecuzione.
export async function runScheduler({client, env, tasks, fetchOne, log = () => {}, host = 'local', pid = 0,
                                    today = () => new Date().toISOString().slice(0, 10), stopSignal = {stopped: false}}) {
  const cfg = schedulerConfig(env);
  if (!cfg.enabled) { log({event: 'af.scheduler.disabled', reason: cfg.reason}); return {status: 'DISABLED', reason: cfg.reason}; }
  const lock = await client.query(SQL.tryLock, [LOCK_KEY]);
  if (!lock.rows[0]?.ok) { log({event: 'af.scheduler.busy'}); return {status: 'BUSY'}; }
  let runId = null, done = 0, status = 'DONE', note = null;
  try {
    const rec = await client.query(SQL.recover);
    if (rec.rows.length) log({event: 'af.scheduler.recovered', runs: rec.rows.map((r) => r.id)});
    runId = (await client.query(SQL.start, [host, pid])).rows[0].id;
    log({event: 'af.scheduler.start', run: runId, tasks: tasks.length});
    for (const task of tasks) {
      if (stopSignal.stopped) { status = 'STOPPED'; note = 'arresto richiesto'; break; }
      const res = await client.query(SQL.reserve, [today(), cfg.dailyLimit]);
      if (!res.rows.length) { status = 'STOPPED'; note = 'budget giornaliero esaurito'; break; }
      await fetchOne(task);
      done += 1;
    }
  } catch (err) {
    status = 'FAILED'; note = String(err?.message ?? err).slice(0, 200);
  } finally {
    if (runId !== null) await client.query(SQL.finish, [runId, status, done, note]);
    await client.query(SQL.unlock, [LOCK_KEY]);
    log({event: 'af.scheduler.end', run: runId, status, requests: done, note});
  }
  return {status, requests: done, note};
}

export function installStopHandlers(proc, stopSignal) {
  const stop = () => { stopSignal.stopped = true; };
  proc.on('SIGTERM', stop); proc.on('SIGINT', stop);
  return () => { proc.off('SIGTERM', stop); proc.off('SIGINT', stop); };
}
