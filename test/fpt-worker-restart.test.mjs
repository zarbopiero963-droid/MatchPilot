// MP-FPT-RETIRE-02: the FPT worker restart guard used by mp-deploy v3.4, run against a fake systemctl. Nothing touches
// the real system: the fake records every call and answers from a state file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HELPER = 'infra/vps/sbin/mp-fpt-worker-restart';

// A fake systemctl: is-enabled prints $ENABLED, is-active exits 0 when the unit is listed in $ACTIVE, try-restart fails
// when $FAIL is 1; every call is appended to calls.log.
function sandbox({enabled = 'enabled', active = ['matchpilot-fpt-worker.service'], fail = false, env = {}} = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mp-fpt-'));
  const fake = join(dir, 'systemctl');
  writeFileSync(fake, `#!/bin/bash
echo "$*" >> "${join(dir, 'calls.log')}"
case "$1" in
  is-enabled) echo "${enabled}"; [ "${enabled}" = enabled ] ;;
  is-active) shift; [ "$1" = --quiet ] && shift; grep -qx "$1" "${join(dir, 'active')}" ;;
  try-restart) [ "${fail ? 1 : 0}" = 0 ] ;;
  *) exit 64 ;;
esac
`);
  chmodSync(fake, 0o755);
  writeFileSync(join(dir, 'active'), active.join('\n') + '\n');
  const files = [];
  for (const [name, text] of Object.entries(env)) { writeFileSync(join(dir, name), text); files.push(join(dir, name)); }
  const run = (phase = 'deploy', extra = {}) => spawnSync('bash', [HELPER, phase], {encoding: 'utf8',
    env: {PATH: process.env.PATH, MP_SYSTEMCTL: fake, MP_FPT_ENV_FILES: files.length ? files.join(' ') : join(dir, 'none.env'), ...extra}});
  const calls = () => (existsSync(join(dir, 'calls.log')) ? readFileSync(join(dir, 'calls.log'), 'utf8').trim().split('\n') : []);
  return {run, calls, dir};
}

test('MP-FPT-RETIRE-02 retired: no restart, no start, at every deploy and rollback (idempotent)', () => {
  const s = sandbox({env: {'worker.env': 'FUTPYTHON_CRON_ENABLED=false\n', 'fpt.env': 'FUTPYTHON_API_KEY=redacted-test\nFUTPYTHON_RETIRED=true\n'}});
  for (const phase of ['deploy', 'deploy', 'rollback', 'deploy']) {
    const r = s.run(phase);
    assert.equal(r.status, 0);
    assert.match(r.stdout, new RegExp(`^phase=${phase} worker_restart=skipped_retired$`, 'm'));
  }
  assert.ok(!s.calls().some(c => /try-restart|restart|start/.test(c.split(' ')[0])), 'never restarts or starts the worker');
  assert.ok(!s.run().stdout.includes('redacted-test'), 'no other env value is printed');
});

test('MP-FPT-RETIRE-02 retired with the liveness timer still active: warns, never touches the timer', () => {
  const s = sandbox({active: ['matchpilot-fpt-worker.service', 'matchpilot-fpt-liveness.timer'], env: {'fpt.env': 'FUTPYTHON_RETIRED="true"\r\n'}});
  const r = s.run();
  assert.match(r.stdout, /worker_restart=skipped_retired warn=liveness_timer_active_while_retired/);
  assert.ok(s.calls().every(c => c.startsWith('is-active')), 'only reads the timer state');
});

test('MP-FPT-RETIRE-02 inconsistent configuration between the env files: no restart', () => {
  const s = sandbox({env: {'worker.env': 'FUTPYTHON_RETIRED=false\n', 'fpt.env': 'FUTPYTHON_RETIRED=true\n'}});
  assert.match(s.run().stdout, /worker_restart=skipped_inconsistent/);
  assert.deepEqual(s.calls(), [], 'not even a state query');
});

test('MP-FPT-RETIRE-02 not retired: try-restart only when enabled and running; a stopped or disabled worker stays as it is', () => {
  const running = sandbox({env: {'fpt.env': 'FUTPYTHON_RETIRED=false\n'}});
  assert.match(running.run().stdout, /^phase=deploy worker_restart=ok$/m);
  assert.ok(running.calls().includes('try-restart matchpilot-fpt-worker.service'));
  assert.ok(!running.calls().some(c => c.startsWith('restart') || c.startsWith('start')), 'try-restart, never restart or start');
  const stopped = sandbox({active: []});
  assert.match(stopped.run().stdout, /worker_restart=skipped_not_active/);
  assert.ok(!stopped.calls().some(c => c.startsWith('try-restart')));
  for (const state of ['disabled', 'masked', 'static', '']) {
    const s = sandbox({enabled: state});
    assert.match(s.run('rollback').stdout, new RegExp(`phase=rollback worker_restart=skipped_not_enabled unit_state=${state || 'unknown'}`), state);
    assert.ok(!s.calls().some(c => c.startsWith('try-restart')), state);
  }
  const failing = sandbox({fail: true});
  const r = failing.run();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /worker_restart=FAILED/);
});

test('MP-FPT-RETIRE-02 missing env files behave as not retired; other values are not retired; usage is strict', () => {
  const none = sandbox();
  assert.match(none.run().stdout, /worker_restart=ok/, 'no env file: legacy behaviour but only try-restart');
  for (const v of ['TRUE', '1', 'yes', 'true # comment']) {
    const s = sandbox({env: {'fpt.env': `FUTPYTHON_RETIRED=${v}\n`}});
    assert.match(s.run().stdout, /worker_restart=ok/, v);
  }
  const spaced = sandbox({env: {'fpt.env': '  FUTPYTHON_RETIRED = true  \n'}});
  assert.match(spaced.run().stdout, /skipped_retired/, 'spaces around the value are tolerated');
  assert.equal(spawnSync('bash', [HELPER]).status, 2);
  assert.equal(spawnSync('bash', [HELPER, 'start']).status, 2);
});

test('MP-FPT-RETIRE-02 under sudo the MP_ overrides are ignored', () => {
  const s = sandbox({env: {'fpt.env': 'FUTPYTHON_RETIRED=true\n'}});
  // With SUDO_USER set the helper drops MP_SYSTEMCTL and MP_FPT_ENV_FILES and falls back to the real paths; here the
  // real env files do not exist and the real systemctl may not either, so the result is anything but a fake call.
  s.run('deploy', {SUDO_USER: 'root'});
  assert.deepEqual(s.calls(), [], 'the fake systemctl is not used under sudo');
});

test('MP-FPT-RETIRE-02 mp-deploy v3.4 uses the guard for deploy and rollback and never falls back to a bare restart', () => {
  const s = readFileSync('infra/vps/sbin/mp-deploy', 'utf8');
  assert.doesNotMatch(s, /systemctl restart matchpilot-fpt-worker/);
  assert.match(s, /worker_restart deploy/);
  assert.match(s, /worker_restart rollback/);
  assert.match(s, /\[ -x "\$WORKER_RESTART" \] && \[ ! -L "\$WORKER_RESTART" \]/, 'only a regular executable helper is run');
  assert.match(s, /systemctl restart matchpilot-app\.service/, 'the app restart is unchanged');
});
