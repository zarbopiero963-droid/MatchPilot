// DEC-008 (owner t121u): the simulated signals of #184 (FUNC-RECOVERY-01) are removed, with no replacement simulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createEndpoints} from '../src/api/v1.mjs';

test('DEC-008: no simulated-signal module, job or npm script remains', () => {
  for (const file of ['src/signals/simulated.mjs', 'src/jobs/sim-signals.mjs']) assert.equal(existsSync(file), false, file);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['sim:signals'], undefined);
  assert.doesNotMatch(pkg.scripts.check, /sim-signals|signals\/simulated/);
});

test('DEC-008: the API exposes no /api/v1/sim route', () => {
  const tc = new Proxy({}, {get: () => async () => ({})});
  const paths = createEndpoints(tc).map(e => e.path);
  assert.ok(paths.length > 0);
  assert.equal(paths.some(p => p.startsWith('/api/v1/sim')), false);
});

test('DEC-008: the web app has no simulated-signals view', () => {
  const app = readFileSync('src/web/app.js', 'utf8');
  assert.doesNotMatch(app, /signalsView|sim\/signals|segnali:/);
});
