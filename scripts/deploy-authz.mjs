// MP-DEPLOY-APPROVAL-02 (design, not wired): the proof of authorization the VPS should require before mp-deploy, so
// that a deploy cannot come from a run that did not pass the approval of vps-production — a run older than the gate,
// another workflow, another repository, a replayed or stolen proof. It is the reference implementation proposed for
// Grok's phase B (owner GO required): nothing on the VPS, the runner, mp-deploy or the workflow uses it yet.
//
// The proof is a GitHub Actions OIDC token (a JWT signed by GitHub, valid for minutes) requested by the deploy job with
// a fixed audience. GitHub adds the claim `environment` and the subject `repo:…:environment:vps-production` only for a
// job that uses that environment, and such a job runs only after the approval. The VPS checks:
//   - the RS256 signature against GitHub's published keys (no static secret anywhere);
//   - issuer, audience, repository and its numeric id, ref main, event push, workflow deploy-vps.yml on main, environment
//     vps-production, a self-hosted runner;
//   - the commit: `workflow_sha` (and `sha` when present) equal to the SHA mp-deploy is asked to deploy;
//   - time: not before nbf, before exp, issued at most 10 minutes ago, lifetime at most 15 minutes;
//   - replay: a token id (jti) is accepted once, and so is a run attempt (run_id:run_attempt).
// Optionally, also the approvals of the run read from GitHub (approvalProblems): an approval of vps-production by the owner.
import {createPublicKey, verify} from 'node:crypto';

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
const MAX_AGE_S = 600;
const MAX_LIFETIME_S = 900;
const SKEW_S = 60;
const SHA = /^[0-9a-f]{40}$/;

const b64json = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

// token: the JWT; jwks: {keys: [...]} from GitHub; sha: what mp-deploy is asked to deploy; now: seconds;
// seen: Set of already used jti and run attempts (the caller persists it atomically, before deploying).
export function verifyDeployToken({token, jwks, sha, now, seen}) {
  const reasons = [];
  let header, claims;
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return {ok: false, reasons: ['AUTHZ_MALFORMED_TOKEN'], claims: null};
  try { header = b64json(parts[0]); claims = b64json(parts[1]); } catch { return {ok: false, reasons: ['AUTHZ_MALFORMED_TOKEN'], claims: null}; }
  if (header.alg !== 'RS256') reasons.push(`AUTHZ_ALG: ${header.alg}`);
  const jwk = (jwks?.keys ?? []).find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) reasons.push(`AUTHZ_UNKNOWN_KEY: ${header.kid}`);
  else if (header.alg === 'RS256') {
    let valid = false;
    try { valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({key: jwk, format: 'jwk'}), Buffer.from(parts[2], 'base64url')); } catch { valid = false; }
    if (!valid) reasons.push('AUTHZ_BAD_SIGNATURE');
  }
  for (const [claim, value] of Object.entries(EXPECTED)) {
    if (String(claims[claim]) !== value) reasons.push(`AUTHZ_CLAIM ${claim}: ${claims[claim]}`);
  }
  // The subject names the environment; its repository part has two documented formats (before and after July 2026),
  // and the repository itself is pinned above by name and numeric id.
  if (typeof claims.sub !== 'string' || !claims.sub.endsWith(`:environment:${EXPECTED.environment}`)) reasons.push(`AUTHZ_CLAIM sub: ${claims.sub}`);
  if (claims.job_workflow_ref !== undefined && claims.job_workflow_ref !== EXPECTED.workflow_ref) reasons.push(`AUTHZ_CLAIM job_workflow_ref: ${claims.job_workflow_ref}`);
  if (!SHA.test(sha ?? '')) reasons.push(`AUTHZ_SHA_ARGUMENT: ${sha}`);
  else {
    if (claims.workflow_sha !== sha) reasons.push(`AUTHZ_SHA: token for ${claims.workflow_sha}, deploy of ${sha}`);
    if (claims.sha !== undefined && claims.sha !== sha) reasons.push(`AUTHZ_SHA: token sha ${claims.sha}, deploy of ${sha}`);
  }
  const {iat, exp, nbf} = claims;
  if (![iat, exp].every(Number.isInteger)) reasons.push('AUTHZ_TIME: iat/exp missing');
  else {
    if (exp <= now - SKEW_S) reasons.push('AUTHZ_EXPIRED');
    if (iat > now + SKEW_S || (Number.isInteger(nbf) && nbf > now + SKEW_S)) reasons.push('AUTHZ_NOT_YET_VALID');
    if (now - iat > MAX_AGE_S) reasons.push('AUTHZ_TOO_OLD');
    if (exp - iat > MAX_LIFETIME_S) reasons.push('AUTHZ_LIFETIME');
  }
  const attempt = `run:${claims.run_id}:${claims.run_attempt}`;
  if (!claims.jti || !claims.run_id || !claims.run_attempt) reasons.push('AUTHZ_REPLAY_ID_MISSING');
  else {
    if (seen.has(`jti:${claims.jti}`)) reasons.push(`AUTHZ_REPLAY: token ${claims.jti} already used`);
    if (seen.has(attempt)) reasons.push(`AUTHZ_REPLAY: ${attempt} already deployed`);
  }
  const ok = reasons.length === 0;
  // Only an accepted proof is recorded; the caller writes `record` to its ledger before running the deploy.
  return {ok, reasons, claims, record: ok ? [`jti:${claims.jti}`, attempt] : []};
}

// approvals: GET /repos/{repo}/actions/runs/{run_id}/approvals. At least one approval of vps-production by the owner.
export function approvalProblems(approvals) {
  if (!Array.isArray(approvals)) return ['AUTHZ_APPROVALS_UNREADABLE'];
  const ok = approvals.some(item => item?.state === 'approved' && item?.user?.login === OWNER
    && (item.environments ?? []).some(environment => environment?.name === EXPECTED.environment));
  return ok ? [] : ['AUTHZ_NO_OWNER_APPROVAL'];
}
