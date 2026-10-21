// MP-DEPLOY-APPROVAL-02: the VPS-side proof of authorization (scripts/deploy-authz.mjs), a design not yet wired.
// Simulated: tokens signed here with a throwaway RSA key standing in for GitHub's; real GitHub tokens on the VPS are
// verified only in phase B/D of docs/deploy-approval.md.
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import test from 'node:test';
import {EXPECTED, approvalProblems, verifyDeployToken} from '../scripts/deploy-authz.mjs';

const SHA = 'c'.repeat(40);
const NOW = 1_800_000_000;
const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const other = generateKeyPairSync('rsa', {modulusLength: 2048});
const JWKS = {keys: [{...publicKey.export({format: 'jwk'}), kid: 'k1', alg: 'RS256', use: 'sig'}]};

const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function token(overrides = {}, {header = {}, key = privateKey, drop = []} = {}) {
  const claims = {...EXPECTED, sub: `repo:${EXPECTED.repository}:environment:${EXPECTED.environment}`, job_workflow_ref: EXPECTED.workflow_ref,
    workflow_sha: SHA, sha: SHA, run_id: '424242', run_attempt: '1', jti: 'jti-1', iat: NOW - 30, nbf: NOW - 30, exp: NOW + 270, ...overrides};
  for (const claim of drop) delete claims[claim];
  const head = b64({alg: 'RS256', typ: 'JWT', kid: 'k1', ...header});
  const body = b64(claims);
  const signature = header.alg === 'none' ? '' : sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${signature}`;
}
const check = (jwt, {sha = SHA, now = NOW, seen = new Set()} = {}) => verifyDeployToken({token: jwt, jwks: JWKS, sha, now, seen});

test('a token of the approved deploy job for this SHA is accepted once, and recorded', () => {
  const result = check(token());
  assert.deepEqual(result.reasons, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.record, ['jti:jti-1', 'run:424242:1']);
  // The immutable subject format of repositories created after July 2026 names the environment too.
  assert.equal(check(token({sub: 'repo:zarbopiero963-droid@249075720/MatchPilot@1401571874:environment:vps-production'})).ok, true);
});

test('replay: the same token, or another token of an attempt already deployed, is refused', () => {
  const seen = new Set();
  const first = check(token(), {seen});
  for (const item of first.record) seen.add(item);
  assert.match(check(token(), {seen}).reasons.join(), /AUTHZ_REPLAY: token jti-1 already used/);
  assert.match(check(token({jti: 'jti-2'}), {seen}).reasons.join(), /AUTHZ_REPLAY: run:424242:1 already deployed/);
  // A re-run is a new attempt: it needs its own approval, and so its own token.
  assert.equal(check(token({jti: 'jti-3', run_attempt: '2'}), {seen}).ok, true);
  assert.match(check(token({}, {drop: ['jti']})).reasons.join(), /AUTHZ_REPLAY_ID_MISSING/);
});

test('a token for another SHA, or a deploy of an SHA the token does not name, is refused', () => {
  assert.match(check(token(), {sha: 'd'.repeat(40)}).reasons.join(), /AUTHZ_SHA: token for c+, deploy of d+/);
  assert.match(check(token({sha: 'd'.repeat(40)})).reasons.join(), /AUTHZ_SHA: token sha d+/);
  assert.match(check(token(), {sha: 'main'}).reasons.join(), /AUTHZ_SHA_ARGUMENT/);
  assert.match(check(token({}, {drop: ['workflow_sha']})).reasons.join(), /AUTHZ_SHA: token for undefined/);
});

test('a job that did not pass vps-production, a run older than the gate, another workflow or repository is refused', () => {
  // A run older than the gate: its job has no environment, so the subject is the branch.
  const preGate = check(token({sub: `repo:${EXPECTED.repository}:ref:refs/heads/main`}, {drop: ['environment']}));
  assert.match(preGate.reasons.join('\n'), /AUTHZ_CLAIM environment: undefined[\s\S]*AUTHZ_CLAIM sub/);
  const cases = [
    [{environment: 'staging', sub: `repo:${EXPECTED.repository}:environment:staging`}, /environment: staging/],
    [{workflow_ref: 'zarbopiero963-droid/MatchPilot/.github/workflows/sneak.yml@refs/heads/main', job_workflow_ref: 'zarbopiero963-droid/MatchPilot/.github/workflows/sneak.yml@refs/heads/main'}, /workflow_ref/],
    [{job_workflow_ref: 'attacker/x/.github/workflows/w.yml@main'}, /job_workflow_ref/],
    [{repository: 'someone/MatchPilot'}, /repository: someone/],
    [{repository_id: '1'}, /repository_id/],
    [{repository_owner_id: '2'}, /repository_owner_id/],
    [{ref: 'refs/heads/dev'}, /ref: refs\/heads\/dev/],
    [{event_name: 'workflow_dispatch'}, /event_name: workflow_dispatch/],
    [{runner_environment: 'github-hosted'}, /runner_environment/],
    [{aud: 'https://github.com/zarbopiero963-droid'}, /aud/],
    [{iss: 'https://evil.example'}, /iss/],
  ];
  for (const [overrides, expected] of cases) assert.match(check(token(overrides)).reasons.join(), expected, JSON.stringify(overrides));
});

test('a forged, unsigned or foreign-key token is refused', () => {
  const good = token();
  const [head, , sig] = good.split('.');
  const forged = `${head}.${b64({...JSON.parse(Buffer.from(good.split('.')[1], 'base64url')), workflow_sha: 'e'.repeat(40)})}.${sig}`;
  assert.match(check(forged, {sha: 'e'.repeat(40)}).reasons.join(), /AUTHZ_BAD_SIGNATURE/);
  assert.match(check(token({}, {key: other.privateKey})).reasons.join(), /AUTHZ_BAD_SIGNATURE/);
  assert.match(check(token({}, {header: {alg: 'none'}})).reasons.join(), /AUTHZ_ALG: none/);
  assert.match(check(token({}, {header: {alg: 'HS256'}})).reasons.join(), /AUTHZ_ALG: HS256/);
  assert.match(check(token({}, {header: {kid: 'nope'}})).reasons.join(), /AUTHZ_UNKNOWN_KEY/);
  for (const bad of ['', 'a.b', 'x.y.z', null]) assert.match(check(bad).reasons.join(), /AUTHZ_MALFORMED_TOKEN/);
});

test('an expired, future, old or long-lived token is refused', () => {
  assert.match(check(token({iat: NOW - 400, nbf: NOW - 400, exp: NOW - 100})).reasons.join(), /AUTHZ_EXPIRED/);
  assert.match(check(token({iat: NOW + 300, nbf: NOW + 300, exp: NOW + 600})).reasons.join(), /AUTHZ_NOT_YET_VALID/);
  assert.match(check(token({iat: NOW - 700, nbf: NOW - 700, exp: NOW + 100})).reasons.join(), /AUTHZ_TOO_OLD/);
  assert.match(check(token({exp: NOW + 3600})).reasons.join(), /AUTHZ_LIFETIME/);
  assert.match(check(token({}, {drop: ['iat']})).reasons.join(), /AUTHZ_TIME/);
});

test('the approvals of the run must include the owner approving vps-production', () => {
  const approval = (state, login, name) => ({state, user: {login}, environments: [{name}]});
  assert.deepEqual(approvalProblems([approval('approved', 'zarbopiero963-droid', 'vps-production')]), []);
  assert.deepEqual(approvalProblems([approval('rejected', 'zarbopiero963-droid', 'vps-production')]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([approval('approved', 'someone', 'vps-production')]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([approval('approved', 'zarbopiero963-droid', 'staging')]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems(null), ['AUTHZ_APPROVALS_UNREADABLE']);
});
