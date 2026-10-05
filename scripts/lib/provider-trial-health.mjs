export function assessPersistenceHealth({
  dbReady,
  lastPersistError,
  lastPersistAt,
  queueLength = 0,
  nowMs = Date.now(),
  maxStaleMs = 5 * 60 * 1000
} = {}) {
  const lastMs = lastPersistAt ? Date.parse(lastPersistAt) : NaN;
  const recentSuccess = Number.isFinite(lastMs) && nowMs - lastMs >= 0 && nowMs - lastMs <= maxStaleMs;
  const queueHealthy = Number(queueLength || 0) < 1000;
  const healthy = Boolean(dbReady) && !lastPersistError && recentSuccess && queueHealthy;
  return {
    healthy,
    db_ready: Boolean(dbReady),
    current_error: lastPersistError || null,
    last_success_at: lastPersistAt || null,
    last_success_age_ms: Number.isFinite(lastMs) ? Math.max(0, nowMs - lastMs) : null,
    max_stale_ms: maxStaleMs,
    queue_length: Number(queueLength || 0),
    queue_healthy: queueHealthy,
    recent_success: recentSuccess
  };
}
