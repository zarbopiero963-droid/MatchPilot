// MP-DEPLOY-APPROVAL-02 / MP-DEPLOY-GATE-FINAL-01: the VPS-side proof of authorization (scripts/deploy-authz.mjs), a
// design not yet wired. Simulated: tokens signed here with a throwaway RSA key standing in for GitHub's; real GitHub
// tokens on the VPS are verified only in phases B and D of docs/deploy-approval.md.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {generateKeyPairSync, sign} from 'node:crypto';
import {mkdtempSync, readdirSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {EXPECTED, MAX_AGE_S, approvalProblems, consume, ledgerHas, verifyDeployToken} from '../scripts/deploy-authz.mjs';

const SHA = 'c'.repeat(40);
const NOW = 1_800_000_000;
const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const other = generateKeyPairSync('rsa', {modulusLength: 2048});
const JWKS = {keys: [{...publicKey.export({format: 'jwk'}), kid: 'k1', alg: 'RS256', use: 'sig'}]};

const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
function token(overrides = {}, {header = {}, key = privateKey, drop = [], rawHeader, rawClaims} = {}) {
  const claims = {...EXPECTED, sub: `repo:${EXPECTED.repository}:environment:${EXPECTED.environment}`, job_workflow_ref: EXPECTED.workflow_ref,
    workflow_sha: SHA, sha: SHA, run_id: '424242', run_attempt: '1', jti: 'jti-1', iat: NOW - 30, nbf: NOW - 30, exp: NOW + 270, ...overrides};
  for (const claim of drop) delete claims[claim];
  const head = rawHeader !== undefined ? b64(rawHeader) : b64({alg: 'RS256', typ: 'JWT', kid: 'k1', ...header});
  const body = rawClaims !== undefined ? b64(rawClaims) : b64(claims);
  const signature = header.alg === 'none' ? '' : sign('RSA-SHA256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${signature}`;
}
const check = (jwt, {sha = SHA, now = NOW, seen = () => false, jwks = JWKS} = {}) => verifyDeployToken({token: jwt, jwks, sha, now, seen});

test('a token of the approved deploy job for this SHA is accepted, and names what to record', () => {
  const result = check(token());
  assert.deepEqual(result.reasons, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.record, ['run:424242:1', 'jti:jti-1']);
  // The immutable subject format of repositories created after July 2026 names the environment too.
  assert.equal(check(token({sub: 'repo:zarbopiero963-droid@249075720/MatchPilot@1401571874:environment:vps-production'})).ok, true);
  assert.equal(check(token({aud: ['matchpilot-vps-deploy']})).ok, true);
});

test('NB-7: malformed tokens are refused, never thrown', () => {
  const malformed = [
    '', 'a.b', 'x.y.z', null, undefined, 42, {}, 'a'.repeat(20000), `${b64('x')}..${b64('y')}`, 'a.b.c.d', 'é.é.é',
    token({}, {rawHeader: 'null'}), token({}, {rawClaims: 'null'}), token({}, {rawHeader: '[]'}), token({}, {rawClaims: '"x"'}),
    token({}, {rawHeader: '{'}), token({}, {rawClaims: '7'}),
  ];
  for (const bad of malformed) {
    let result;
    assert.doesNotThrow(() => { result = check(bad); }, String(bad).slice(0, 40));
    assert.equal(result.ok, false);
    assert.match(result.reasons.join(), /AUTHZ_MALFORMED_TOKEN/, String(bad).slice(0, 40));
  }
  for (const jwks of [null, {}, {keys: null}, {keys: [null, 1]}]) assert.match(check(token(), {jwks}).reasons.join(), /AUTHZ_UNKNOWN_KEY/);
  assert.match(check(token(), {now: 'x'}).reasons.join(), /AUTHZ_CLOCK/);
});

test('NB-7: claims must be exact strings: arrays, numbers and objects are not coerced', () => {
  const cases = [
    [{ref: ['refs/heads/main']}, /AUTHZ_CLAIM ref/],
    [{repository_id: 1401571874}, /AUTHZ_CLAIM repository_id/],
    [{environment: ['vps-production']}, /AUTHZ_CLAIM environment/],
    [{aud: ['matchpilot-vps-deploy', 'other']}, /AUTHZ_CLAIM aud/],
    [{aud: {toString: 'matchpilot-vps-deploy'}}, /AUTHZ_CLAIM aud/],
    [{sub: ['repo:x:environment:vps-production']}, /AUTHZ_CLAIM sub/],
    [{workflow_sha: [SHA]}, /AUTHZ_SHA/],
    [{run_id: 424242}, /AUTHZ_REPLAY_ID_MISSING/],
    [{run_attempt: '01'}, /AUTHZ_REPLAY_ID_MISSING/],
    [{jti: ''}, /AUTHZ_REPLAY_ID_MISSING/],
    [{iat: String(NOW)}, /AUTHZ_TIME/],
    [{nbf: 'soon'}, /AUTHZ_TIME/],
  ];
  for (const [overrides, expected] of cases) assert.match(check(token(overrides)).reasons.join(), expected, JSON.stringify(overrides));
});

test('a token for another SHA, or a deploy of an SHA the token does not name, is refused', () => {
  assert.match(check(token(), {sha: 'd'.repeat(40)}).reasons.join(), /AUTHZ_SHA: token for "c+", deploy of d+/);
  assert.match(check(token({sha: 'd'.repeat(40)})).reasons.join(), /AUTHZ_SHA: token sha "d+"/);
  assert.match(check(token(), {sha: 'main'}).reasons.join(), /AUTHZ_SHA_ARGUMENT/);
  assert.match(check(token({}, {drop: ['workflow_sha']})).reasons.join(), /AUTHZ_SHA: token for undefined/);
});

test('a job that did not pass vps-production, a run older than the gate, another workflow or repository is refused', () => {
  // A run older than the gate: its job has no environment, so the subject is the branch.
  const preGate = check(token({sub: `repo:${EXPECTED.repository}:ref:refs/heads/main`}, {drop: ['environment']}));
  assert.match(preGate.reasons.join('\n'), /AUTHZ_CLAIM environment: undefined[\s\S]*AUTHZ_CLAIM sub/);
  const cases = [
    [{environment: 'staging', sub: `repo:${EXPECTED.repository}:environment:staging`}, /environment: "staging"/],
    [{workflow_ref: 'zarbopiero963-droid/MatchPilot/.github/workflows/sneak.yml@refs/heads/main', job_workflow_ref: 'zarbopiero963-droid/MatchPilot/.github/workflows/sneak.yml@refs/heads/main'}, /workflow_ref/],
    [{job_workflow_ref: 'attacker/x/.github/workflows/w.yml@main'}, /job_workflow_ref/],
    [{repository: 'someone/MatchPilot'}, /repository: "someone/],
    [{repository_id: '1'}, /repository_id/],
    [{repository_owner_id: '2'}, /repository_owner_id/],
    [{ref: 'refs/heads/dev'}, /ref: "refs\/heads\/dev"/],
    [{event_name: 'workflow_dispatch'}, /event_name: "workflow_dispatch"/],
    [{runner_environment: 'github-hosted'}, /runner_environment/],
    [{aud: 'https://github.com/zarbopiero963-droid'}, /aud/],
    [{iss: 'https://evil.example'}, /iss/],
  ];
  for (const [overrides, expected] of cases) assert.match(check(token(overrides)).reasons.join(), expected, JSON.stringify(overrides));
});

test('a forged, unsigned, critical-header or foreign-key token is refused', () => {
  const good = token();
  const [head, , sig] = good.split('.');
  const forged = `${head}.${b64({...JSON.parse(Buffer.from(good.split('.')[1], 'base64url')), workflow_sha: 'e'.repeat(40)})}.${sig}`;
  assert.match(check(forged, {sha: 'e'.repeat(40)}).reasons.join(), /AUTHZ_BAD_SIGNATURE/);
  assert.match(check(token({}, {key: other.privateKey})).reasons.join(), /AUTHZ_BAD_SIGNATURE/);
  assert.match(check(token({}, {header: {alg: 'none'}})).reasons.join(), /AUTHZ_ALG: none/);
  assert.match(check(token({}, {header: {alg: 'HS256'}})).reasons.join(), /AUTHZ_ALG: HS256/);
  assert.match(check(token({}, {header: {kid: 'nope'}})).reasons.join(), /AUTHZ_UNKNOWN_KEY/);
  assert.match(check(token({}, {header: {crit: ['b64']}})).reasons.join(), /AUTHZ_CRIT/);
  // Two keys with the same kid: ambiguous, refused.
  assert.match(check(token(), {jwks: {keys: [...JWKS.keys, {...JWKS.keys[0]}]}}).reasons.join(), /AUTHZ_UNKNOWN_KEY/);
});

test('time: expired, future, older than one try, or long-lived tokens are refused; a retry needs a new token', () => {
  assert.match(check(token({iat: NOW - 400, nbf: NOW - 400, exp: NOW - 100})).reasons.join(), /AUTHZ_EXPIRED/);
  assert.match(check(token({iat: NOW + 300, nbf: NOW + 300, exp: NOW + 600})).reasons.join(), /AUTHZ_NOT_YET_VALID/);
  // The workflow retries every 60 s up to 10 times on exit 75: a token kept across tries ages out.
  assert.match(check(token({iat: NOW - MAX_AGE_S - 1, nbf: NOW - MAX_AGE_S - 1, exp: NOW + 100})).reasons.join(), /AUTHZ_TOO_OLD/);
  assert.match(check(token({exp: NOW + 3600})).reasons.join(), /AUTHZ_LIFETIME/);
  assert.match(check(token({exp: NOW - 40, iat: NOW - 30})).reasons.join(), /AUTHZ_LIFETIME/);
  assert.match(check(token({}, {drop: ['iat']})).reasons.join(), /AUTHZ_TIME/);
});

test('anti-replay: consumption is exclusive and persistent; a busy lock records nothing; a re-run is a new attempt', () => {
  const dir = mkdtempSync(join(tmpdir(), 'authz-ledger-'));
  const seen = key => ledgerHas(dir, key);
  // Exit 75 (lock busy): verify only, nothing recorded; the next try sends a new token of the same attempt.
  assert.equal(check(token(), {seen}).ok, true);
  assert.deepEqual(readdirSync(dir), []);
  const first = check(token({jti: 'jti-try-2'}), {seen});
  assert.equal(first.ok, true);
  assert.deepEqual(consume(dir, first.record), {ok: true, reasons: []});
  assert.equal(readdirSync(dir).length, 2);
  // Replays: the same token, another token of the same attempt, the record consumed twice.
  assert.match(check(token({jti: 'jti-try-2'}), {seen}).reasons.join(), /AUTHZ_REPLAY: run:424242:1 already used[\s\S]*AUTHZ_REPLAY: jti:jti-try-2/);
  assert.match(check(token({jti: 'jti-3'}), {seen}).reasons.join(), /AUTHZ_REPLAY: run:424242:1 already used/);
  assert.deepEqual(consume(dir, first.record), {ok: false, reasons: ['AUTHZ_REPLAY: run:424242:1 already used']});
  // A re-run is a new attempt: it needs its own approval, and so its own token.
  assert.equal(check(token({jti: 'jti-4', run_attempt: '2'}), {seen}).ok, true);
  // Nothing to consume, or an unwritable ledger, is a refusal.
  assert.equal(consume(dir, []).ok, false);
  assert.match(consume(join(dir, 'missing'), ['run:1:1']).reasons.join(), /AUTHZ_LEDGER: ENOENT/);
});

// ---- the CLI, as mp-deploy v3 would call it: token on stdin ----
const SCRIPT = new URL('../scripts/deploy-authz.mjs', import.meta.url).pathname;
const cli = (mode, jwt, {dir, sha = SHA, jwksFile}) => new Promise(resolve => {
  const child = spawn(process.execPath, [SCRIPT, mode, '--sha', sha, '--jwks', jwksFile, '--ledger', dir]);
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.on('close', status => resolve({status, report: JSON.parse(out)}));
  child.stdin.end(jwt);
});

test('CLI: verify has no side effect; consume records once, even when two processes race; any error refuses', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'authz-cli-'));
  const jwksFile = join(dir, '..', `${dir.split('/').pop()}-jwks.json`);
  writeFileSync(jwksFile, JSON.stringify(JWKS));
  const now = Math.floor(Date.now() / 1000);
  const live = (overrides = {}) => token({iat: now - 5, nbf: now - 5, exp: now + 295, ...overrides});
  const verified = await cli('verify', live(), {dir, jwksFile});
  assert.equal(verified.status, 0, JSON.stringify(verified.report));
  assert.equal(verified.report.result, 'ACCEPT');
  assert.deepEqual(readdirSync(dir), []);
  // Two deploys racing with the same token: exactly one consumes it.
  const racing = await Promise.all([cli('consume', live(), {dir, jwksFile}), cli('consume', live(), {dir, jwksFile})]);
  assert.deepEqual(racing.map(item => item.status).sort(), [0, 1], JSON.stringify(racing.map(item => item.report)));
  assert.match(racing.find(item => item.status === 1).report.reasons.join(), /AUTHZ_REPLAY/);
  // Persistent: a later process sees it.
  assert.match((await cli('verify', live(), {dir, jwksFile})).report.reasons.join(), /AUTHZ_REPLAY/);
  const forged = await cli('consume', live({environment: 'x'}), {dir, jwksFile});
  assert.equal(forged.status, 1);
  const noJwks = await cli('verify', live({run_attempt: '9', jti: 'j9'}), {dir, jwksFile: join(dir, 'none.json')});
  assert.equal(noJwks.status, 1);
  assert.match(noJwks.report.reasons.join(), /AUTHZ_ERROR/);
  const badMode = await cli('deploy', live(), {dir, jwksFile});
  assert.equal(badMode.status, 1);
});

test('the approvals of the run must include the owner approving vps-production', () => {
  const approval = (state, login, name) => ({state, user: {login}, environments: [{name}]});
  assert.deepEqual(approvalProblems([approval('approved', 'zarbopiero963-droid', 'vps-production')]), []);
  assert.deepEqual(approvalProblems([approval('rejected', 'zarbopiero963-droid', 'vps-production')]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([approval('approved', 'someone', 'vps-production')]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([approval('approved', 'zarbopiero963-droid', 'staging')]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([null, {state: 'approved'}]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems([]), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.deepEqual(approvalProblems(null), ['AUTHZ_APPROVALS_UNREADABLE']);
});
