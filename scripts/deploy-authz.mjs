// MP-DEPLOY-APPROVAL-02 / MP-DEPLOY-GATE-FINAL-01 (design, not wired): the proof of authorization the VPS should
// require before mp-deploy, so that a deploy cannot come from a run that did not pass the approval of vps-production:
// a run older than the gate, another workflow, another repository, a replayed or stolen proof. It is the reference
// implementation for Grok's phase B (owner GO required): nothing on the VPS, the runner, mp-deploy or the workflow uses
// it yet. Specification and procedure: docs/deploy-approval.md, section 3.
//
// The proof is a GitHub Actions OIDC token: a JWT signed by GitHub, valid for minutes, requested by the deploy job with
// a fixed audience. GitHub puts the claim `environment` and a subject ending in `:environment:vps-production` only in the
// token of a job that uses that environment. Three steps, in mp-deploy v3:
//   1. verify (no side effect): signature and claims, below. Every malformed input is a refusal, never an exception.
//   2. mp-deploy takes its deploy lock (or exits 75: nothing is recorded, and the next try sends a NEW token).
//   3. consume, under that lock, just before deploying: the run attempt and the token id are each recorded once, with
//      an exclusive create (O_CREAT|O_EXCL) and fsync, so two deploys can never consume the same proof, even racing,
//      and a restart keeps the record. A deploy that then fails needs a new run attempt, hence a new approval.
// Claims checked directly: iss, aud, repository, repository_id, repository_owner_id, ref, event_name, environment,
// sub (environment suffix), workflow_ref, job_workflow_ref, workflow_sha (and sha when present), runner_environment,
// run_id, run_attempt, jti, iat, nbf, exp. Not provable from the token: that the reviewer was the owner (optional check
// on the run's approvals from the GitHub API, approvalProblems) and that the environment was protected at that moment
// (the gate job and the post-approval gate check it).
import {createHash, createPublicKey, verify} from 'node:crypto';
import {closeSync, fsyncSync, openSync, readFileSync, realpathSync, statSync, writeSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const EXPECTED = Object.freeze({
  iss: 'https://token.actions.githubusercontent.com',
  aud: 'matchpilot-vps-deploy',
  repository: 'zarbopiero963-droid/MatchPilot',
  repository_id: '1401571874',
  repository_owner_id: '249075720',
  ref: 'refs/heads/main',
  event_name: 'push',
  environment: 'vps-production',
  workflow_ref: 'zarbopiero963-droid/MatchPilot/.github/workflows/deploy-vps.yml@refs/heads/main',
  runner_environment: 'self-hosted',
});
export const OWNER = 'zarbopiero963-droid';
export const MAX_AGE_S = 300;
export const MAX_LIFETIME_S = 900;
export const SKEW_S = 60;
const SHA = /^[0-9a-f]{40}$/;
const DIGITS = /^[1-9][0-9]{0,19}$/;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function decode(part) {
  try {
    const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return plain(value) ? value : null;
  } catch { return null; }
}

// token: the JWT; jwks: {keys: [...]} from GitHub; sha: what mp-deploy is asked to deploy; now: seconds;
// seen(key): whether the ledger already holds a key (read only). Returns {ok, reasons, claims, record}.
export function verifyDeployToken({token, jwks, sha, now, seen = () => false}) {
  const refuse = reasons => ({ok: false, reasons, claims: null, record: []});
  if (typeof token !== 'string' || token.length > 16384) return refuse(['AUTHZ_MALFORMED_TOKEN']);
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]*$/.test(part)) || !parts[0] || !parts[1]) return refuse(['AUTHZ_MALFORMED_TOKEN']);
  const header = decode(parts[0]);
  const claims = decode(parts[1]);
  if (!header || !claims) return refuse(['AUTHZ_MALFORMED_TOKEN']);
  if (!Number.isInteger(now)) return refuse(['AUTHZ_CLOCK']);
  const reasons = [];

  if (header.alg !== 'RS256') reasons.push(`AUTHZ_ALG: ${String(header.alg)}`);
  if (header.crit !== undefined) reasons.push('AUTHZ_CRIT');
  const keys = plain(jwks) && Array.isArray(jwks.keys) ? jwks.keys : [];
  const matching = typeof header.kid === 'string' ? keys.filter(key => plain(key) && key.kid === header.kid && key.kty === 'RSA') : [];
  if (matching.length !== 1) reasons.push(`AUTHZ_UNKNOWN_KEY: ${String(header.kid)}`);
  else if (header.alg === 'RS256') {
    let valid = false;
    try {
      const {kty, n, e} = matching[0];
      valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({key: {kty, n, e}, format: 'jwk'}), Buffer.from(parts[2], 'base64url'));
    } catch { valid = false; }
    if (!valid) reasons.push('AUTHZ_BAD_SIGNATURE');
  }

  // Exact strings only: no coercion of arrays, numbers or objects.
  for (const [claim, value] of Object.entries(EXPECTED)) {
    if (claim === 'aud') {
      const aud = claims.aud;
      const ok = aud === value || (Array.isArray(aud) && aud.length === 1 && aud[0] === value);
      if (!ok) reasons.push(`AUTHZ_CLAIM aud: ${JSON.stringify(aud)}`);
    } else if (claims[claim] !== value) reasons.push(`AUTHZ_CLAIM ${claim}: ${JSON.stringify(claims[claim])}`);
  }
  // The subject names the environment; its repository part has two documented formats (before and after July 2026).
  if (typeof claims.sub !== 'string' || !claims.sub.endsWith(`:environment:${EXPECTED.environment}`)) reasons.push(`AUTHZ_CLAIM sub: ${JSON.stringify(claims.sub)}`);
  if (claims.job_workflow_ref !== undefined && claims.job_workflow_ref !== EXPECTED.workflow_ref) reasons.push(`AUTHZ_CLAIM job_workflow_ref: ${JSON.stringify(claims.job_workflow_ref)}`);

  if (typeof sha !== 'string' || !SHA.test(sha)) reasons.push(`AUTHZ_SHA_ARGUMENT: ${JSON.stringify(sha)}`);
  else {
    if (claims.workflow_sha !== sha) reasons.push(`AUTHZ_SHA: token for ${JSON.stringify(claims.workflow_sha)}, deploy of ${sha}`);
    if (claims.sha !== undefined && claims.sha !== sha) reasons.push(`AUTHZ_SHA: token sha ${JSON.stringify(claims.sha)}, deploy of ${sha}`);
  }

  const {iat, exp, nbf} = claims;
  if (!Number.isInteger(iat) || !Number.isInteger(exp) || (nbf !== undefined && !Number.isInteger(nbf))) reasons.push('AUTHZ_TIME: iat/exp/nbf missing or not integers');
  else {
    if (exp <= now - SKEW_S) reasons.push('AUTHZ_EXPIRED');
    if (iat > now + SKEW_S || (nbf !== undefined && nbf > now + SKEW_S)) reasons.push('AUTHZ_NOT_YET_VALID');
    if (now - iat > MAX_AGE_S) reasons.push('AUTHZ_TOO_OLD: request a new token for every try');
    if (exp - iat > MAX_LIFETIME_S || exp <= iat) reasons.push('AUTHZ_LIFETIME');
  }

  const ids = [claims.run_id, claims.run_attempt].every(value => typeof value === 'string' && DIGITS.test(value))
    && typeof claims.jti === 'string' && claims.jti.length > 0 && claims.jti.length <= 200;
  if (!ids) reasons.push('AUTHZ_REPLAY_ID_MISSING');
  const record = ids ? [`run:${claims.run_id}:${claims.run_attempt}`, `jti:${claims.jti}`] : [];
  for (const key of record) if (seen(key)) reasons.push(`AUTHZ_REPLAY: ${key} already used`);

  const ok = reasons.length === 0;
  return {ok, reasons, claims, record: ok ? record : []};
}

// The ledger: one file per used key, named by its SHA-256, created exclusively. A key already there is a replay.
const entry = (dir, key) => join(dir, createHash('sha256').update(key).digest('hex'));
// Only "not found" means unused; any other error (EACCES, EIO) is thrown, so the CLI refuses (AUTHZ_ERROR).
export function ledgerHas(dir, key, {fs = {openSync, closeSync}} = {}) {
  try { fs.closeSync(fs.openSync(entry(dir, key), 'r')); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
// Consume under mp-deploy's deploy lock, just before deploying. All or nothing per key; the first key that exists
// stops the consumption (the run attempt is recorded first, so a second token of the same attempt is refused).
// `fs` is injectable so that a test can see every open, write and fsync (review: fsync of the file and of the directory).
const FS = {openSync, writeSync, fsyncSync, closeSync};
export function consume(dir, record, {now = Math.floor(Date.now() / 1000), fs = FS} = {}) {
  if (!Array.isArray(record) || record.length === 0) return {ok: false, reasons: ['AUTHZ_NOTHING_TO_CONSUME']};
  for (const key of record) {
    let fd;
    try { fd = fs.openSync(entry(dir, key), 'wx', 0o600); }
    catch (error) { return {ok: false, reasons: [error.code === 'EEXIST' ? `AUTHZ_REPLAY: ${key} already used` : `AUTHZ_LEDGER: ${error.code ?? error.message}`]}; }
    // A record that cannot be made durable refuses the deploy (the key stays used: fail closed).
    try { fs.writeSync(fd, `${JSON.stringify({key, at: now})}\n`); fs.fsyncSync(fd); }
    catch (error) { return {ok: false, reasons: [`AUTHZ_LEDGER: ${error.code ?? error.message}`]}; }
    finally { fs.closeSync(fd); }
  }
  let dirFd;
  try { dirFd = fs.openSync(dir, 'r'); fs.fsyncSync(dirFd); } catch (error) { return {ok: false, reasons: [`AUTHZ_LEDGER: ${error.code ?? error.message}`]}; }
  finally { if (dirFd !== undefined) fs.closeSync(dirFd); }
  return {ok: true, reasons: []};
}

// approvals: GET /repos/{repo}/actions/runs/{run_id}/approvals. At least one approval of vps-production by the owner.
export function approvalProblems(approvals) {
  if (!Array.isArray(approvals)) return ['AUTHZ_APPROVALS_UNREADABLE'];
  const ok = approvals.some(item => plain(item) && item.state === 'approved' && item.user?.login === OWNER
    && Array.isArray(item.environments) && item.environments.some(environment => environment?.name === EXPECTED.environment));
  return ok ? [] : ['AUTHZ_NO_OWNER_APPROVAL'];
}

// CLI for mp-deploy v3 (phase B): the token on stdin, never on the command line.
//   node deploy-authz.mjs verify  --sha <sha> --jwks <file> --ledger <dir>   exit 0 = valid and unused
//   node deploy-authz.mjs consume --sha <sha> --jwks <file> --ledger <dir>   exit 0 = valid, unused, now recorded
// Any other outcome, including an exception, exits 1 with the reasons on stdout as JSON.
const entryUrl = (() => { try { return pathToFileURL(realpathSync(process.argv[1])).href; } catch { return null; } })();
if (entryUrl === import.meta.url) {
  const arg = name => { const at = process.argv.indexOf(`--${name}`); return at < 0 ? null : process.argv[at + 1]; };
  const mode = process.argv[2];
  let result;
  try {
    if (mode !== 'verify' && mode !== 'consume') throw new Error('mode must be verify or consume');
    const ledger = arg('ledger');
    if (!ledger) throw new Error('--ledger is required');
    // Review NB-12: a wrong ledger path must not read as "never used": the directory must exist.
    if (!statSync(ledger).isDirectory()) throw new Error(`ledger ${ledger} is not a directory`);
    const jwks = JSON.parse(readFileSync(arg('jwks'), 'utf8'));
    const token = readFileSync(0, 'utf8').trim();
    const verified = verifyDeployToken({token, jwks, sha: arg('sha'), now: Math.floor(Date.now() / 1000), seen: key => ledgerHas(ledger, key)});
    result = {ok: verified.ok, reasons: verified.reasons};
    if (verified.ok && mode === 'consume') result = consume(ledger, verified.record);
    result.run = verified.claims ? {run_id: verified.claims.run_id, run_attempt: verified.claims.run_attempt, workflow_sha: verified.claims.workflow_sha} : null;
  } catch (error) {
    result = {ok: false, reasons: [`AUTHZ_ERROR: ${String(error?.message ?? error).split('\n')[0]}`]};
  }
  console.log(JSON.stringify({authz: 'MP-DEPLOY-AUTHZ', mode, result: result.ok ? 'ACCEPT' : 'REFUSE', ...result}));
  process.exitCode = result.ok ? 0 : 1;
}
