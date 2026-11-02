// F3 (MP-MIG-GATE-01, owner mandate MP-MIGRATIONS-030-031-AND-API-FOOTBALL-P1-FIX-01 F3=A): every migration operation
// (apply, re-apply after a rollback, legacy adoption) needs two independent authorizations, in every runtime mode:
//
//   (a) OWNER — an entry of db/migration-approvals.json, a file of the release itself, changed only by a MANUAL PR the
//       owner merges. It binds operation + filename + sha256 of the exact bytes (or the adoption plan code), cites an
//       IN_FORCE owner decision of docs/governance/owner-decisions.json, expires, and is single use.
//   (b) TECHNICAL — allow-migrations-<release sha>.json in MATCHPILOT_MIGRATION_AUTHZ_DIR (default
//       /etc/matchpilot/migration-authz), outside the release tree: a regular file owned by root (uid 0), not writable
//       by group or others, in a directory with the same properties, bound to the 40-hex commit of the running code,
//       with a nonce, at most 24 h of validity, and the exact operations. Its use is recorded in the database
//       (schema_migration_authorizations): a consumed token is never accepted again, whatever happens to the file.
//
// The two cannot be satisfied by one mechanism: (a) is read only from the release tree, (b) only from a directory
// outside it, with different schemas, and each loader refuses the other's. No environment variable authorizes anything:
// MATCHPILOT_APPROVED_MIGRATIONS (owner decision D13) stays an extra condition in production mode only.
//
// Tests and CI: MATCHPILOT_RUNTIME_MODE=test plus MATCHPILOT_MIGRATION_TEST_AUTHORIZATION=throwaway-schema authorize the
// pending files of a throwaway schema — refused in offline and production modes, on the `public` schema, and on any
// schema that holds an owner/technical authorization or an adopted history. Recorded with origin TEST.
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, sep} from 'node:path';

export const APPROVALS_SCHEMA = 'mp-migration-approvals-v1';
export const TOKEN_SCHEMA = 'mp-migration-technical-authz-v1';
export const OPERATIONS = Object.freeze(['apply', 'reapply', 'adopt']);
export const TEST_AUTHORIZATION_VALUE = 'throwaway-schema';
export const DEFAULT_AUTHZ_DIR = '/etc/matchpilot/migration-authz';
const MAX_TOKEN_TTL_MS = 24 * 3600e3;
const CLOCK_SKEW_MS = 5 * 60e3;
const HEX64 = /^[0-9a-f]{64}$/;
const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');

export class AuthzError extends Error {
  constructor(code, message) { super(`${code}: ${message}`); this.code = code; }
}

const time = value => { const t = Date.parse(value); return Number.isFinite(t) && /^\d{4}-\d{2}-\d{2}T/.test(String(value)) ? t : NaN; };

// (a) The owner manifest. Any structural problem refuses the whole file (fail closed), never a partial reading.
export function loadOwnerApprovals({approvalsPath, decisionsPath}) {
  let bytes;
  try { bytes = readFileSync(approvalsPath); } catch { throw new AuthzError('APPROVALS_UNREADABLE', `${approvalsPath} cannot be read`); }
  let doc, decisions;
  try { doc = JSON.parse(bytes.toString('utf8')); } catch { throw new AuthzError('APPROVALS_INVALID', 'the owner approval manifest is not valid JSON'); }
  try { decisions = JSON.parse(readFileSync(decisionsPath, 'utf8')); } catch { throw new AuthzError('DECISIONS_UNREADABLE', 'the owner decision register cannot be read'); }
  if (doc?.schema !== APPROVALS_SCHEMA || !Array.isArray(doc.approvals)) throw new AuthzError('APPROVALS_INVALID', `schema must be ${APPROVALS_SCHEMA} with an approvals array`);
  if (doc.release_sha !== undefined || doc.nonce !== undefined) throw new AuthzError('APPROVALS_INVALID', 'a technical token is not an owner approval');
  const inForce = new Set((decisions.decisions || []).filter(d => d.status === 'IN_FORCE').map(d => d.id));
  const ids = new Set();
  for (const a of doc.approvals) {
    const at = `approval ${a?.id}`;
    if (!/^MA-[A-Z0-9-]{3,80}$/.test(String(a?.id || '')) || ids.has(a.id)) throw new AuthzError('APPROVALS_INVALID', `${at}: id missing, malformed or duplicated`);
    ids.add(a.id);
    if (!OPERATIONS.includes(a.operation)) throw new AuthzError('APPROVALS_INVALID', `${at}: unknown operation`);
    if (a.operation === 'adopt' ? !/^[0-9a-f]{16}$/.test(String(a.plan_code || '')) : !(typeof a.filename === 'string' && a.filename.endsWith('.sql') && HEX64.test(String(a.sha256 || '')))) {
      throw new AuthzError('APPROVALS_INVALID', `${at}: filename + sha256 (or plan_code for adopt) required`);
    }
    if (a.operation === 'reapply' && !Number.isInteger(a.revocation_event)) throw new AuthzError('APPROVALS_INVALID', `${at}: reapply needs the revocation_event it answers`);
    if (!Number.isFinite(time(a.expires_at))) throw new AuthzError('APPROVALS_INVALID', `${at}: expires_at required`);
    if (!inForce.has(a.decision)) throw new AuthzError('APPROVALS_INVALID', `${at}: decision ${a.decision} is not an IN_FORCE owner decision`);
  }
  return {approvals: doc.approvals, manifestSha256: sha256Hex(bytes)};
}

function assertSafeOwner(path, stat, ownerUid, what) {
  if (stat.isSymbolicLink()) throw new AuthzError('TOKEN_UNSAFE', `${what} is a symbolic link`);
  if (stat.uid !== ownerUid) throw new AuthzError('TOKEN_UNSAFE', `${what} is owned by uid ${stat.uid}, not ${ownerUid}`);
  if (stat.mode & 0o022) throw new AuthzError('TOKEN_UNSAFE', `${what} is writable by group or others`);
}

// (b) The technical token of this release. Returns null when there is none; throws when one exists but is unusable.
export function loadTechnicalToken({dir, releaseSha, ownerUid, repoRoot, now}) {
  if (!/^[0-9a-f]{40}$/.test(String(releaseSha || ''))) throw new AuthzError('RELEASE_UNKNOWN', 'the commit of the running code cannot be established');
  let dirStat;
  try { dirStat = lstatSync(dir); } catch { return null; }
  if (!dirStat.isDirectory() && !dirStat.isSymbolicLink()) throw new AuthzError('TOKEN_UNSAFE', 'the authorization path is not a directory');
  assertSafeOwner(dir, dirStat, ownerUid, 'the authorization directory');
  const real = realpathSync(dir);
  const root = realpathSync(repoRoot);
  if (real === root || real.startsWith(root + sep)) throw new AuthzError('TOKEN_UNSAFE', 'the technical authorization must live outside the release tree');
  const path = resolve(dir, `allow-migrations-${releaseSha}.json`);
  let stat;
  try { stat = lstatSync(path); } catch { return null; }
  if (!stat.isFile() && !stat.isSymbolicLink()) throw new AuthzError('TOKEN_UNSAFE', 'the token is not a regular file');
  assertSafeOwner(path, stat, ownerUid, 'the token');
  let bytes, token;
  try { bytes = readFileSync(path); } catch { throw new AuthzError('TOKEN_UNREADABLE', 'the token cannot be read'); }
  try { token = JSON.parse(bytes.toString('utf8')); } catch { throw new AuthzError('TOKEN_INVALID', 'the token is not valid JSON'); }
  if (token?.schema !== TOKEN_SCHEMA || token.approvals !== undefined) throw new AuthzError('TOKEN_INVALID', `schema must be ${TOKEN_SCHEMA}`);
  if (token.release_sha !== releaseSha) throw new AuthzError('TOKEN_RELEASE_MISMATCH', `token for ${token.release_sha}, running ${releaseSha}`);
  if (!/^[0-9a-f]{32,128}$/.test(String(token.nonce || ''))) throw new AuthzError('TOKEN_INVALID', 'nonce of at least 32 hex characters required');
  const issued = time(token.issued_at), expires = time(token.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued || expires - issued > MAX_TOKEN_TTL_MS) throw new AuthzError('TOKEN_INVALID', 'issued_at/expires_at missing or validity above 24 h');
  if (issued > now + CLOCK_SKEW_MS) throw new AuthzError('TOKEN_INVALID', 'issued in the future');
  if (expires <= now) throw new AuthzError('TOKEN_EXPIRED', `expired at ${token.expires_at}`);
  if (!Array.isArray(token.operations) || !token.operations.length) throw new AuthzError('TOKEN_INVALID', 'operations required');
  for (const op of token.operations) {
    if (!OPERATIONS.includes(op?.operation)) throw new AuthzError('TOKEN_INVALID', 'unknown operation');
    if (op.operation === 'adopt' ? !/^[0-9a-f]{16}$/.test(String(op.plan_code || '')) : !(typeof op.filename === 'string' && HEX64.test(String(op.sha256 || '')))) {
      throw new AuthzError('TOKEN_INVALID', 'each operation needs filename + sha256 (plan_code for adopt)');
    }
  }
  return {...token, path, tokenSha256: sha256Hex(bytes)};
}

const matches = (entry, op) => entry.operation === op.operation
  && (op.operation === 'adopt' ? entry.plan_code === op.planCode : entry.filename === op.file && entry.sha256 === op.sha256);

// Decides, for each requested operation, whether it is authorized. `ops`: [{file, sha256, operation, revocationEvent,
// planCode}]. `consumed`: what the database already recorded (approval ids, token nonces closed, nonce+file+operation).
// Returns {granted: [{...op, origin, approval, token}], refused: [{...op, reasons}]}; never throws for a missing
// authorization, only for an unusable manifest or token (fail closed for everything).
export function decide({ops, mode, env, testAllowed, approvals, token, consumed, now}) {
  const granted = [], refused = [];
  for (const op of ops) {
    if (mode === 'test' && testAllowed) { granted.push({...op, origin: 'TEST', approval: null, token: null}); continue; }
    const reasons = [];
    const approval = approvals.find(entry => matches(entry, op));
    if (!approval) reasons.push('OWNER_APPROVAL_MISSING');
    else {
      if (time(approval.expires_at) <= now) reasons.push('OWNER_APPROVAL_EXPIRED');
      if (consumed.approvals.has(approval.id)) reasons.push('OWNER_APPROVAL_CONSUMED');
      if (op.operation === 'reapply' && approval.revocation_event !== op.revocationEvent) reasons.push('OWNER_APPROVAL_FOR_ANOTHER_REVOCATION');
    }
    if (!token) reasons.push('TECHNICAL_AUTHORIZATION_MISSING');
    else if (consumed.closedNonces.has(token.nonce) || consumed.uses.has(`${token.nonce}|${op.file ?? op.planCode}|${op.operation}`)) reasons.push('TECHNICAL_AUTHORIZATION_CONSUMED');
    else if (!token.operations.some(entry => matches(entry, op))) reasons.push('TECHNICAL_AUTHORIZATION_NOT_FOR_THIS_OPERATION');
    if (mode === 'production' && op.operation !== 'adopt') {
      const listed = new Set(String(env.MATCHPILOT_APPROVED_MIGRATIONS || '').split(',').map(name => name.trim()).filter(Boolean));
      if (!listed.has(op.file)) reasons.push('D13_PRODUCTION_LIST_MISSING');
    }
    if (reasons.length) refused.push({...op, reasons});
    else granted.push({...op, origin: 'OWNER_AND_TECHNICAL', approval, token});
  }
  return {granted, refused};
}
