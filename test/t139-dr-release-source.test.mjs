// t139: backup + DR coverage check read the real release source (/srv/mp-deploy/current), not the legacy
// /srv/matchpilot/current (a git checkout frozen at 3dd833f). The backup must never fail on this step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const backup = readFileSync('infra/vps/sbin/matchpilot-backup', 'utf8');
const block = (/# >>> release-sha[\s\S]*?# <<< release-sha/.exec(backup) || [''])[0];
const SHA = '62311afc22901215efac0739b7b9e7015b20ada2';

function runBlock(link) {
  const B = mkdtempSync(join(tmpdir(), 't139b-'));
  const script = `set -euo pipefail\nB=${B}\nMP_ROOT=${B}/none\nMP_USER=$(id -un)\nsudo() { shift 2; "$@"; }\n${block}\ncat $B/git_sha.txt`;
  return spawnSync('bash', ['-c', script], {env: {...process.env, MP_RELEASE_LINK: link}, encoding: 'utf8'});
}

test('backup records the SHA of the release mp-deploy actually runs', () => {
  assert.ok(block, 'release-sha block present');
  const t = mkdtempSync(join(tmpdir(), 't139-'));
  mkdirSync(join(t, 'releases', SHA), {recursive: true});
  symlinkSync(join(t, 'releases', SHA), join(t, 'current'));
  const r = runBlock(join(t, 'current'));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), SHA);
});

test('backup never aborts on the release step: no release, no git checkout -> "unknown"', () => {
  const r = runBlock('/nonexistent/current');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'unknown');
  assert.doesNotMatch(backup.replace(block, ''), /rev-parse/); // the only git call is the guarded legacy fallback
});

test('DR coverage check compares the backup SHA with /srv/mp-deploy/current', () => {
  const s = readFileSync('infra/vps/box-helpers/dr_coverage_check.py', 'utf8');
  assert.match(s, /readlink -f \/srv\/mp-deploy\/current/);
  assert.doesNotMatch(s, /\/srv\/matchpilot\/current/);
  assert.equal(spawnSync('python3', ['-m', 'py_compile', 'infra/vps/box-helpers/dr_coverage_check.py']).status, 0);
});
