// t129u: VPS-only infra files ported to the repo (mp-deploy v3.3, runner guard, FPT worker unit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const D = 'infra/vps';
const read = (p) => readFileSync(join(D, p), 'utf8');
const sums = read('SHA256SUMS').trim().split('\n').map((l) => l.split(/\s+/));

test('SHA256SUMS matches every ported file (byte copy of the VPS)', () => {
  assert.ok(sums.length >= 4);
  for (const [h, f] of sums) {
    assert.equal(createHash('sha256').update(readFileSync(join(D, f))).digest('hex'), h, f);
  }
});

test('mp-deploy is the pinned v3.3 (c45eab86…) and keeps its invariants', () => {
  const s = read('sbin/mp-deploy');
  assert.equal(sums.find(([, f]) => f === 'sbin/mp-deploy')[0].slice(0, 8), 'c45eab86');
  assert.match(s, /^umask 077$/m);
  assert.match(s, /go\+rX/);                                  // release readable by the matchpilot user
  assert.match(s, /tip_recheck=OK/);                           // tip of main re-checked under the lock
  assert.equal((s.match(/systemctl restart matchpilot-fpt-worker\.service/g) || []).length, 2); // deploy + rollback
  assert.match(s, /token\.actions\.githubusercontent\.com/);   // OIDC authz kept
});

test('shell scripts are syntactically valid', () => {
  for (const f of ['sbin/mp-deploy', 'sbin/mp-runner-guard.sh', 'sbin/mp-runner-guard-v1.sh']) {
    const r = spawnSync('bash', ['-n', join(D, f)]);
    assert.equal(r.status, 0, f + ' ' + r.stderr);
  }
});

test('no secrets, no old VPS, no Render/Neon/TotalCorner enablement in infra files', () => {
  for (const [, f] of sums) {
    const s = read(f);
    assert.doesNotMatch(s, /45\.14\.187\.69/, f);
    assert.doesNotMatch(s, /gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY|AGE-SECRET-KEY-|\d{8,}:[A-Za-z0-9_-]{30,}/, f);
    assert.doesNotMatch(s, /(TOKEN|PASSWORD|SECRET)=[^"$\s/][^\s]*/, f);
    assert.doesNotMatch(s, /neon\.tech|onrender\.com/i, f);
    assert.doesNotMatch(s, /TOTALCORNER_ENABLED=(1|true)/i, f);
  }
});

test('FPT worker unit: runs src/worker.mjs, unprivileged, sandboxed, secrets only via EnvironmentFile', () => {
  const u = read('systemd/matchpilot-fpt-worker.service');
  assert.match(u, /^ExecStart=\/usr\/bin\/node src\/worker\.mjs$/m);
  assert.ok(existsSync('src/worker.mjs') && statSync('src/worker.mjs').isFile());
  assert.match(u, /^User=matchpilot$/m);
  assert.match(u, /^WorkingDirectory=\/srv\/mp-deploy\/current$/m);
  for (const k of ['NoNewPrivileges=true', 'ProtectSystem=strict', 'ProtectHome=true', 'PrivateTmp=true', 'CapabilityBoundingSet=']) {
    assert.match(u, new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'm'), k);
  }
  assert.doesNotMatch(u, /^Environment=/m);
  assert.match(u, /postgresql@18-staging\.service/);
});
