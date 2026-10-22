// MP-AUTODEPLOY-01 (t124u): transient GitHub answers are re-read a bounded number of times; nothing else is.
import test from 'node:test';
import assert from 'node:assert/strict';
import {httpText, withRetry} from '../scripts/deploy-authz.mjs';
import {readFacts} from '../scripts/deploy-gate.mjs';

const noSleep = {sleep: async () => {}};
const answers = list => { const seen = []; return {seen, fetchImpl: async url => { seen.push(url); const next = list.shift();
  if (next instanceof Error) throw next; return new Response(next.body ?? '{}', {status: next.status}); }}; };

test('a 500 then 200 is read again and succeeds; a 429 too', async () => {
  for (const status of [500, 502, 503, 429]) {
    const api = answers([{status}, {status: 200, body: '"ok"'}]);
    assert.equal(await httpText('https://api.github.com/x', {fetchImpl: api.fetchImpl, retry: noSleep}), '"ok"');
    assert.equal(api.seen.length, 2);
  }
});

test('the retries are bounded: four 500s fail closed', async () => {
  const api = answers([{status: 500}, {status: 500}, {status: 500}, {status: 500}, {status: 200}]);
  await assert.rejects(httpText('https://api.github.com/x', {fetchImpl: api.fetchImpl, retry: noSleep}), /HTTP 500/);
  assert.equal(api.seen.length, 4);
});

test('a 404, 403, 401 or a redirect is final at once (no retry)', async () => {
  for (const status of [404, 403, 401, 301]) {
    const api = answers([{status}, {status: 200}]);
    await assert.rejects(httpText('https://api.github.com/x', {fetchImpl: api.fetchImpl, retry: noSleep}), new RegExp(`HTTP ${status}`));
    assert.equal(api.seen.length, 1, String(status));
  }
  const redirect = answers([Object.assign(new TypeError('fetch failed'), {cause: new Error('unexpected redirect')}), {status: 200}]);
  await assert.rejects(httpText('https://api.github.com/x', {fetchImpl: redirect.fetchImpl, retry: noSleep}));
  assert.equal(redirect.seen.length, 1);
});

test('a dropped connection is retried; withRetry waits longer each time', async () => {
  const api = answers([new TypeError('fetch failed'), {status: 200, body: '1'}]);
  assert.equal(await httpText('https://api.github.com/x', {fetchImpl: api.fetchImpl, retry: noSleep}), '1');
  const waits = [];
  await assert.rejects(withRetry(async () => { throw Object.assign(new Error('x'), {transient: true}); }, {sleep: async ms => waits.push(ms), delayMs: 10}));
  assert.deepEqual(waits, [10, 20, 30]);
});

test('the gate re-reads a transient answer and still reports a persistent one', async () => {
  let n = 0;
  const flaky = async () => (++n < 3 ? {status: 500, body: null} : {status: 200, body: {name: 'vps-production'}});
  const facts = await readFacts({repository: 'zarbopiero963-droid/MatchPilot', ref: 'refs/heads/main', event: 'push', sha: 'a'.repeat(40),
    api: async path => (path.endsWith('/environments/vps-production') ? flaky() : {status: 404, body: null}), retry: noSleep});
  assert.ok(n >= 3);
  assert.ok(!facts.errors.some(e => /environment HTTP 500/.test(e)), facts.errors.join());
  const down = await readFacts({repository: 'zarbopiero963-droid/MatchPilot', ref: 'refs/heads/main', event: 'push', sha: 'a'.repeat(40),
    api: async () => ({status: 503, body: null}), retry: noSleep});
  assert.ok(down.errors.some(e => /HTTP 503/.test(e)), down.errors.join());
});
