// Runtime mode and database-host checks (#144, owner decision D13). Dependency-free so both the server and
// migrate() can enforce them without importing the background services.
const MODES = new Set(['offline', 'test', 'production']);

export function runtimeMode(env = process.env) {
  const mode = String(env.MATCHPILOT_RUNTIME_MODE || 'offline').trim().toLowerCase();
  if (!MODES.has(mode)) throw new Error(`Invalid MATCHPILOT_RUNTIME_MODE: ${mode}`);
  return mode;
}

export function isLocalDatabaseUrl(value) {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

export function assertRuntimeSafety(env = process.env) {
  const mode = runtimeMode(env);
  if (mode !== 'production' && env.DATABASE_URL && !isLocalDatabaseUrl(env.DATABASE_URL)) {
    throw new Error(`${mode} mode rejects non-local DATABASE_URL`);
  }
  return {mode, backgroundEnabled: mode === 'production' && env.MATCHPILOT_BACKGROUND_ENABLED === 'true'};
}
