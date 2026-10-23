import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createShutdown, main } from '../src/worker.mjs';

const harness = (busySteps, graceMs = 1000) => {
  const seen = []; let t = 0; let n = 0;
  const shutdown = createShutdown({stop: () => seen.push('stop'), busy: () => n++ < busySteps, close: async () => seen.push('close'),
    exit: code => seen.push('exit' + code), log: () => {}, graceMs, pollMs: 100, sleep: async ms => { t += ms; }, now: () => t});
  return {seen, shutdown, elapsed: () => t};
};

test('SIGTERM with no sync in flight: stop, close pool, exit 0', async () => {
  const h = harness(0); await h.shutdown('SIGTERM');
  assert.deepEqual(h.seen, ['stop', 'close', 'exit0']); assert.equal(h.elapsed(), 0);
});
test('SIGTERM during a sync: waits for it to finish, then exits 0', async () => {
  const h = harness(3); await h.shutdown('SIGTERM');
  assert.deepEqual(h.seen, ['stop', 'close', 'exit0']); assert.equal(h.elapsed(), 300);
});
test('a sync longer than the grace is abandoned at the grace, still exit 0 (before systemd SIGKILL)', async () => {
  const h = harness(1e9, 1000); await h.shutdown('SIGTERM');
  assert.deepEqual(h.seen, ['stop', 'close', 'exit0']); assert.equal(h.elapsed(), 1000);
});
test('a second signal does not run the shutdown twice', async () => {
  const h = harness(0); await Promise.all([h.shutdown('SIGTERM'), h.shutdown('SIGINT')]);
  assert.deepEqual(h.seen, ['stop', 'close', 'exit0']);
});
test('main wires SIGTERM and SIGINT to the shutdown', async () => {
  const proc = new EventEmitter(); const got = [];
  const timer = await main({proc, start: async () => {}, shutdown: s => got.push(s)});
  clearInterval(timer); proc.emit('SIGTERM'); proc.emit('SIGINT');
  assert.deepEqual(got, ['SIGTERM', 'SIGINT']);
});
