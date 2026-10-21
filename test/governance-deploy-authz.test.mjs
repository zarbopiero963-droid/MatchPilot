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
import {createServer} from 'node:http';
import {EXPECTED, HTTP_LIMIT, MAX_AGE_S, TIP_SOURCES, approvalProblems, consume, httpText, ledgerHas, mainFromAdvertisement, readMainTip, runApprovalProblems, tipProblems, verifyDeployToken} from '../scripts/deploy-authz.mjs';

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
  // A well-formed, correctly signed token over 16 KiB (review NB-12, mutation R14).
  const huge = token({padding: 'x'.repeat(17000)});
  assert.equal(huge.split('.').length, 3);
  assert.match(check(huge).reasons.join(), /AUTHZ_MALFORMED_TOKEN/);
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
  // Review NB-13: absolute values, not only the constants; nbf in the future with a valid iat.
  assert.equal(MAX_AGE_S, 300);
  assert.equal(check(token({iat: NOW - 299, nbf: NOW - 299, exp: NOW + 200})).ok, true);
  assert.match(check(token({iat: NOW - 301, nbf: NOW - 301, exp: NOW + 200})).reasons.join(), /AUTHZ_TOO_OLD/);
  assert.match(check(token({iat: NOW - 10, nbf: NOW + 120, exp: NOW + 280})).reasons.join(), /AUTHZ_NOT_YET_VALID/);
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
  // Review NB-13: only "not found" means unused; another error (EACCES) is thrown, so the CLI refuses.
  const denied = {openSync: () => { throw Object.assign(new Error('EACCES'), {code: 'EACCES'}); }, closeSync: () => {}};
  assert.throws(() => ledgerHas(dir, 'run:9:9', {fs: denied}), {code: 'EACCES'});
  // Nothing to consume, or an unwritable ledger, is a refusal.
  assert.equal(consume(dir, []).ok, false);
  assert.match(consume(join(dir, 'missing'), ['run:1:1']).reasons.join(), /AUTHZ_LEDGER: ENOENT/);
});

test('consume makes each record durable: the file and then the directory are fsynced, and a failed fsync refuses', async () => {
  const fs = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(), 'authz-fsync-'));
  const calls = [];
  const spy = {
    openSync: (path, flags, mode) => { const fd = fs.openSync(path, flags, mode); calls.push(['open', path === dir ? 'dir' : 'file', flags, fd]); return fd; },
    writeSync: (fd, data) => { calls.push(['write', fd]); return fs.writeSync(fd, data); },
    fsyncSync: fd => { calls.push(['fsync', fd]); return fs.fsyncSync(fd); },
    closeSync: fd => { calls.push(['close', fd]); return fs.closeSync(fd); },
  };
  assert.deepEqual(consume(dir, ['run:1:1', 'jti:a'], {fs: spy}), {ok: true, reasons: []});
  const fds = calls.filter(([op]) => op === 'open').map(([, kind, flags, fd]) => [kind, flags, fd]);
  assert.deepEqual(fds.map(([kind, flags]) => [kind, flags]), [['file', 'wx'], ['file', 'wx'], ['dir', 'r']]);
  for (const [, , fd] of fds) {
    const at = calls.findIndex(([op, x]) => op === 'fsync' && x === fd);
    assert.ok(at > 0, `fd ${fd} fsynced`);
    assert.ok(calls.findIndex(([op, x]) => op === 'close' && x === fd) > at, `fd ${fd} fsynced before close`);
  }
  // A failing fsync, of the record file or of the directory, refuses: the record is not known to be durable.
  const failOn = target => {
    let last = null;
    return {...spy, openSync: (path, flags, mode) => { last = path === dir ? 'dir' : 'file'; return fs.openSync(path, flags, mode); },
      fsyncSync: fd => { if (last === target) throw Object.assign(new Error('EIO'), {code: 'EIO'}); return fs.fsyncSync(fd); }};
  };
  assert.deepEqual(consume(dir, ['run:2:1'], {fs: failOn('file')}), {ok: false, reasons: ['AUTHZ_LEDGER: EIO']});
  assert.deepEqual(consume(dir, ['run:3:1'], {fs: failOn('dir')}), {ok: false, reasons: ['AUTHZ_LEDGER: EIO']});
  // The key whose record could not be made durable stays used.
  assert.equal(ledgerHas(dir, 'run:2:1'), true);
});

// ---- the CLI, as mp-deploy v3 would call it: token on stdin ----
const SCRIPT = new URL('../scripts/deploy-authz.mjs', import.meta.url).pathname;
const cli = (mode, jwt, {dir, sha = SHA, jwksFile}) => new Promise(resolve => {
  const child = spawn(process.execPath, [SCRIPT, mode, '--sha', sha, '--jwks', jwksFile, '--ledger', dir]);
  let out = '';
  child.stdout.on('data', chunk => { out += chunk; });
  child.on('close', status => { let report = null; try { report = JSON.parse(out); } catch {} resolve({status, report}); });
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
  // Review NB-12: a ledger path that does not exist is an error, not "never used".
  const noLedger = await cli('verify', live({run_attempt: '8', jti: 'j8'}), {dir: join(dir, 'missing-ledger'), jwksFile});
  assert.equal(noLedger.status, 1);
  assert.match(noLedger.report.reasons.join(), /AUTHZ_ERROR: ENOENT|not a directory/);
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

// ---- MP-GATE-S1S2-FIX: anti-stale (the tip of main from two sources) and the run's approval, for mp-deploy v3.1 ----
const pkt = line => `${(line.length + 4).toString(16).padStart(4, '0')}${line}`;
const OLD = 'a'.repeat(40);
const advertisement = (main = SHA, {lines} = {}) => pkt('# service=git-upload-pack\n') + '0000'
  + (lines ?? [`${main} HEAD\0multi_ack side-band-64k agent=git/github\n`, `${OLD} refs/heads/feature\n`, `${main} refs/heads/main\n`, `${OLD} refs/heads/main-old\n`]).map(pkt).join('') + '0000';

test('the ref advertisement is read strictly: exactly one refs/heads/main, well-formed pkt-lines, nothing after the flush', () => {
  assert.deepEqual(mainFromAdvertisement(advertisement()), {sha: SHA});
  const bad = {
    'not text': null,
    'no main': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${OLD} refs/heads/feature\n`]}),
    'two mains': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${SHA} refs/heads/main\n`, `${OLD} refs/heads/main\n`]}),
    'main named in the capabilities only': advertisement(SHA, {lines: [`${SHA} HEAD\0symref=HEAD:refs/heads/main\n`]}),
    'non-hex SHA': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${'g'.repeat(40)} refs/heads/main\n`]}),
    'short SHA': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${SHA.slice(1)} refs/heads/main\n`]}),
    'line without LF': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${SHA} refs/heads/main`]}),
    'space in ref': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${SHA} refs/heads/main extra\n`]}),
    'bad length': advertisement().replace(/^001e/, '001z'),
    'truncated': advertisement().slice(0, -10),
    'no final flush': advertisement().slice(0, -4),
    'data after the flush': `${advertisement()}0000`,
    'no service line': advertisement().slice(30),
    'HTML page': '<html>sign in</html>',
    // Review NB-3: another service's advertisement, and a NUL (capabilities) on a ref line other than the first.
    'git-receive-pack': advertisement().replace(pkt('# service=git-upload-pack\n'), pkt('# service=git-receive-pack\n')),
    'NUL after the first line': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, `${SHA} refs/heads/main\0caps\n`]}),
    'empty capability line only': advertisement(SHA, {lines: [`${SHA} HEAD\0caps\n`, '\n']}),
  };
  for (const [what, text] of Object.entries(bad)) assert.match(mainFromAdvertisement(text).problem ?? '', /TIP_REFS_MALFORMED/, what);
});

const tipFrom = (refs, api) => readMainTip({fetchText: async url => {
  const value = url === TIP_SOURCES.refs ? refs : url === TIP_SOURCES.api ? api : new Error(`unexpected ${url}`);
  if (value instanceof Error) throw value;
  return value;
}});
const branch = sha => JSON.stringify({name: 'main', commit: {sha}});

test('anti-stale: only the SHA both sources give as the tip of main passes; never another SHA instead', async () => {
  const both = await tipFrom(advertisement(SHA), branch(SHA));
  assert.deepEqual(both, {tip: SHA, problems: []});
  assert.deepEqual(tipProblems(both, SHA), []);
  const stale = tipProblems(both, OLD);
  assert.equal(stale.length, 1);
  assert.match(stale[0], new RegExp(`^TIP_STALE: main is ${SHA}, not ${OLD}`));
  assert.match(tipProblems(both, 'main').join(), /TIP_SHA_ARGUMENT/);
  // Three merges A, B, C: only C passes.
  for (const sha of ['1'.repeat(40), '2'.repeat(40)]) assert.match(tipProblems(both, sha).join(), /TIP_STALE/);
});

test('anti-stale fails closed: a source down, malformed, or the two sources disagreeing (just after a merge)', async () => {
  const cases = [
    [new Error('timeout'), branch(SHA), /TIP_UNVERIFIABLE: refs timeout/],
    [advertisement(SHA), new Error('HTTP 503'), /TIP_UNVERIFIABLE: api HTTP 503/],
    [advertisement(SHA), branch(OLD), /TIP_UNVERIFIABLE: sources disagree/],
    [advertisement(OLD), branch(SHA), /TIP_UNVERIFIABLE: sources disagree/],
    [advertisement(SHA), 'not json', /TIP_UNVERIFIABLE: api/],
    [advertisement(SHA), JSON.stringify({name: 'feature', commit: {sha: SHA}}), /TIP_API_MALFORMED/],
    [advertisement(SHA), JSON.stringify({name: 'main', commit: {sha: SHA.toUpperCase()}}), /TIP_API_MALFORMED/],
    ['garbage', branch(SHA), /TIP_REFS_MALFORMED/],
  ];
  for (const [refs, api, pattern] of cases) {
    const tip = await tipFrom(refs, api);
    assert.equal(tip.tip, null);
    const problems = tipProblems(tip, SHA);
    assert.ok(problems.length > 0);
    assert.match(problems.join(), pattern);
  }
  assert.deepEqual(tipProblems({tip: SHA}, SHA), ['TIP_UNVERIFIABLE']);
  assert.deepEqual(tipProblems({tip: null, problems: []}, SHA), ['TIP_UNVERIFIABLE']);
});

test('the HTTP reads: 200 only, no redirect, bounded size; anything else throws (the callers refuse)', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end('fine'); }
    else if (req.url === '/redirect') { res.writeHead(302, {location: '/ok'}); res.end(); }
    else if (req.url === '/big') { res.writeHead(200); res.end(Buffer.alloc(HTTP_LIMIT + 1, 'x')); }
    else if (req.url === '/no-content') { res.writeHead(204); res.end(); }
    else { res.writeHead(500); res.end('no'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(await httpText(`${base}/ok`), 'fine');
    await assert.rejects(httpText(`${base}/redirect`));
    await assert.rejects(httpText(`${base}/big`), /too large/);
    await assert.rejects(httpText(`${base}/error`), /HTTP 500/);
    // Review NB-3: 200 only, not any 2xx.
    await assert.rejects(httpText(`${base}/no-content`), /HTTP 204/);
  } finally { server.close(); }
  // A declared length over the limit is refused before the body is read (the body here would fail if read).
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(new ReadableStream({pull() { throw new Error('the body was read'); }}),
    {status: 200, headers: {'content-length': String(HTTP_LIMIT + 1)}});
  try { await assert.rejects(httpText('https://example.invalid/'), /answer too large/); }
  finally { globalThis.fetch = realFetch; }
});

test('the run\'s approval is read from GitHub: the owner approving vps-production, or a refusal', async () => {
  const owner = [{state: 'approved', user: {login: 'zarbopiero963-droid'}, environments: [{name: 'vps-production'}]}];
  const first = {runAttempt: '1'};
  assert.deepEqual(await runApprovalProblems('42', {...first, fetchJson: async url => { assert.match(url, /\/actions\/runs\/42\/approvals$/); return owner; }}), []);
  assert.deepEqual(await runApprovalProblems('42', {...first, fetchJson: async () => []}), ['AUTHZ_NO_OWNER_APPROVAL']);
  assert.match((await runApprovalProblems('42', {...first, fetchJson: async () => { throw new Error('HTTP 403'); }})).join(), /AUTHZ_APPROVALS_UNREADABLE: HTTP 403/);
  for (const id of ['', '0', '42; rm', null]) assert.match((await runApprovalProblems(id, {...first, fetchJson: async () => owner})).join(), /AUTHZ_RUN_ID/);
});

// PR #181 hardening (owner point 2, review NB-2): the review history of a run has no attempt and no time, so an
// approval given to attempt 1 must not count for a re-run. RED on 5e79bfc: attempt 2 with attempt 1's approval passed.
test('an approval is not carried over to a re-run: any attempt but the first is refused before reading GitHub', async () => {
  const owner = [{state: 'approved', user: {login: 'zarbopiero963-droid'}, environments: [{name: 'vps-production'}]}];
  let reads = 0;
  const fetchJson = async () => { reads += 1; return owner; };
  for (const runAttempt of ['2', '10', undefined, '', '01', 1]) {
    assert.match((await runApprovalProblems('42', {runAttempt, fetchJson})).join(), /AUTHZ_RERUN_APPROVAL_UNBOUND/, String(runAttempt));
  }
  assert.equal(reads, 0);
});

test('CLI: main-tip and approved refuse a bad argument with exit 1; an unknown mode refuses', async () => {
  const run = args => new Promise(resolve => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {env: {PATH: process.env.PATH}});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('close', status => { let report = null; try { report = JSON.parse(out); } catch {} resolve({status, report}); });
  });
  const badRun = await run(['approved', '--run-id', 'x']);
  assert.equal(badRun.status, 1);
  assert.match(badRun.report.reasons.join(), /AUTHZ_RUN_ID/);
  const unknown = await run(['deploy-anyway']);
  assert.equal(unknown.status, 1);
  assert.match(unknown.report.reasons.join(), /mode must be verify, consume, main-tip or approved/);
});

// Review NB-A (#181 6323455656): the CLI path mp-deploy v3.1 uses must pass --run-attempt through. A CLI that ignored it
// would read GitHub and answer with another reason; here only the attempt check may answer, and without any read.
test('CLI approved: --run-attempt is honoured; an attempt but the first, or none, is refused before any GitHub read', async () => {
  const run = args => new Promise(resolve => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {env: {PATH: process.env.PATH}});
    let out = '';
    child.stdout.on('data', chunk => { out += chunk; });
    child.on('close', status => { let report = null; try { report = JSON.parse(out); } catch {} resolve({status, report}); });
  });
  for (const args of [['--run-attempt', '2'], ['--run-attempt', '17'], ['--run-attempt', ''], []]) {
    const result = await run(['approved', '--run-id', '42', ...args]);
    assert.equal(result.status, 1, args.join(' '));
    assert.deepEqual(result.report.reasons, [`AUTHZ_RERUN_APPROVAL_UNBOUND: attempt ${JSON.stringify(args[1] ?? null)}`], args.join(' '));
  }
});

// Review NB-B: pkt-line lengths count bytes. A capability with a non-ASCII byte must not shift the parse; the ref
// advertisement is read as bytes (latin1: one character per byte) end to end, from the HTTP read to the parser.
test('the ref advertisement is parsed by bytes: a non-ASCII capability does not break the pkt-line lengths', async () => {
  const bpkt = text => { const bytes = Buffer.from(text, 'utf8'); return Buffer.concat([Buffer.from((bytes.length + 4).toString(16).padStart(4, '0')), bytes]); };
  const body = Buffer.concat([bpkt('# service=git-upload-pack\n'), Buffer.from('0000'), bpkt(`${SHA} HEAD\0multi_ack agent=gït/2.4\n`),
    bpkt(`${OLD} refs/heads/feature\n`), bpkt(`${SHA} refs/heads/main\n`), Buffer.from('0000')]);
  const server = createServer((req, res) => {
    if (req.url === '/refs') { res.writeHead(200); res.end(body); }
    else if (req.url === '/utf') { res.writeHead(200); res.end(Buffer.from('{"name":"città"}', 'utf8')); }
    else { res.writeHead(200); res.end(branch(SHA)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const tip = await readMainTip({fetchText: (url, options) => httpText(`${base}/${url === TIP_SOURCES.refs ? 'refs' : 'api'}`, options)});
    assert.deepEqual(tip, {tip: SHA, problems: []});
    // The JSON source stays UTF-8 (one character per code point).
    assert.equal(await httpText(`${base}/api`), branch(SHA));
    assert.equal((await httpText(`${base}/utf`)), '{"name":"città"}');
  } finally { server.close(); }
  // A non-ASCII ref name is still refused (fail closed): only printable ASCII is a ref here.
  assert.match(mainFromAdvertisement(Buffer.concat([bpkt('# service=git-upload-pack\n'), Buffer.from('0000'), bpkt(`${SHA} HEAD\0caps\n`),
    bpkt(`${SHA} refs/heads/mäin\n`), bpkt(`${SHA} refs/heads/main\n`), Buffer.from('0000')]).toString('latin1')).problem ?? '', /TIP_REFS_MALFORMED: bad ref line/);
});
