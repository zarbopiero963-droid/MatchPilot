// MP-PR183-HARDENING-01: the PR state used by handoff-in is read from the GitHub API by the tool, never typed by the
// agent. The network call is replaced by a stub here; failures and inconsistent answers become errors (fail closed).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readPullRequest} from '../tools/governance/github.mjs';

const now = new Date('2026-10-21T21:00:00.123Z');
const answer = body => () => JSON.stringify(body);
const read = (body, extra = {}) => readPullRequest({repository: 'zarbopiero963-droid/MatchPilot', number: 183, now, run: typeof body === 'function' ? body : answer(body), ...extra});

test('open, closed and merged PRs map to evidence with source, number, head and time', () => {
  const head = {sha: 'f'.repeat(40)};
  assert.deepEqual(read({number: 183, state: 'open', merged: false, head}).evidence, {source: 'github-api', url: 'https://api.github.com/repos/zarbopiero963-droid/MatchPilot/pulls/183', number: 183, state: 'open', head_sha: head.sha, fetched_at: '2026-10-21T21:00:00Z'});
  assert.equal(read({number: 183, state: 'closed', merged: false, head}).evidence.state, 'closed');
  assert.equal(read({number: 183, state: 'closed', merged: true, head}).evidence.state, 'merged');
  assert.equal(read({number: 183, state: 'closed', merged_at: '2026-10-21T20:00:00Z', head}).evidence.state, 'merged');
});

test('a failed, malformed or foreign answer is an error, never a state', () => {
  assert.match(read(() => { throw new Error('curl: (22) The requested URL returned error: 404'); }).error, /GitHub read failed/);
  assert.match(read(() => 'not json').error, /GitHub read failed/);
  assert.match(read({number: 178, state: 'open'}).error, /answered PR 178/);
  assert.match(readPullRequest({repository: 'bad repo; rm -rf /', number: 183, run: () => { throw new Error('must not run'); }}).error, /invalid PR reference/);
  assert.match(readPullRequest({repository: 'a/b', number: 0, run: () => { throw new Error('must not run'); }}).error, /invalid PR reference/);
});

test('the request carries no credential', () => {
  let seen;
  read(url => { seen = url; return JSON.stringify({number: 183, state: 'open', head: {sha: 'f'.repeat(40)}}); });
  assert.equal(seen, 'https://api.github.com/repos/zarbopiero963-droid/MatchPilot/pulls/183');
  const source = (async () => (await import('node:fs')).readFileSync(new URL('../tools/governance/github.mjs', import.meta.url), 'utf8'))();
  return source.then(text => assert.doesNotMatch(text, /authorization|GH_TOKEN|GITHUB_TOKEN/i));
});
