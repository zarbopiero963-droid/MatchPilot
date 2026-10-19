// Runtime mode and database-host checks (#144, owner decision D13). Free of application imports so both the server
// and migrate() can enforce them without importing the background services.
import pg from 'pg';

const MODES = new Set(['offline', 'test', 'production']);

export function runtimeMode(env = process.env) {
  const mode = String(env.MATCHPILOT_RUNTIME_MODE || 'offline').trim().toLowerCase();
  if (!MODES.has(mode)) throw new Error(`Invalid MATCHPILOT_RUNTIME_MODE: ${mode}`);
  return mode;
}

// Exact loopback literals, or an absolute Unix-socket directory (a socket is always on this machine). Host lists,
// trailing-dot names and other loopback addresses are refused rather than interpreted.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const isLocalHost = host => typeof host === 'string'
  && (LOOPBACK.has(host.toLowerCase()) || (host.startsWith('/') && !host.includes(',')));

// MIG-GAP-01: judge the host pg really connects to, not the URL authority. pg applies the connection-string parser
// (`?host=` overrides the authority, the last value wins; percent-encoded and `socket:` socket paths) and, when the
// string names no host, falls back to PGHOST. `hostaddr` (URL or PGHOSTADDR) is ignored by pg 8.16 but honoured by
// libpq tools, so a non-local value is refused too. Anything that cannot be parsed is not local.
export function isLocalDatabaseUrl(value, env = process.env) {
  if (!value) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  // A string without its own host would leave the choice to PGHOST or pg's default: refuse it.
  if (!url.hostname && !url.searchParams.get('host') && url.protocol !== 'socket:') return false;
  let host;
  try { host = new pg.Client({connectionString: value}).connectionParameters.host; } catch { return false; }
  if (!isLocalHost(host)) return false;
  if (url.searchParams.getAll('hostaddr').some(address => !isLocalHost(address))) return false;
  for (const source of [env, process.env]) {
    if (source.PGHOST !== undefined && !isLocalHost(source.PGHOST)) return false;
    if (source.PGHOSTADDR !== undefined && !isLocalHost(source.PGHOSTADDR)) return false;
  }
  return true;
}

export function assertRuntimeSafety(env = process.env) {
  const mode = runtimeMode(env);
  if (mode !== 'production' && env.DATABASE_URL && !isLocalDatabaseUrl(env.DATABASE_URL, env)) {
    throw new Error(`${mode} mode rejects non-local DATABASE_URL`);
  }
  return {mode, backgroundEnabled: mode === 'production' && env.MATCHPILOT_BACKGROUND_ENABLED === 'true'};
}
