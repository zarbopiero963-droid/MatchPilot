// GOV-RUNTIME-STATE-01 (#150, t141u): the runtime state on GitHub is complete and machine-checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRuntimeState} from '../tools/governance/runtime-state.mjs';

const load = () => JSON.parse(readFileSync(new URL('../docs/governance/runtime-state.json', import.meta.url), 'utf8'));

test('committed runtime state is valid', () => assert.deepEqual(validateRuntimeState(load()), []));
test('carries the release SHA, PR #210 and the pending checks required by t141u', () => {
  const s = load();
  assert.match(s.production.release_sha, /^[0-9a-f]{40}$/);
  const ids = s.pending_runtime_checks.map(c => c.id);
  for (const id of ['DR-APP-CODE', 'RECOVERY-415', 'RESTORE-TEST', 'PR-210-RUNTIME']) assert.ok(ids.includes(id), id);
  const refs = s.owner_decisions_relayed.items.map(i => i.ref).join(' ');
  for (const ref of ['t125u', 't130u', 't137u', 't138u', 't139u', 't140u', 't141u']) assert.ok(refs.includes(ref), ref);
  assert.match(JSON.stringify(s), /D13 = A/);
  assert.match(JSON.stringify(s), /no invented economic rules/);
});
test('rejects missing fields, bad SHA, unknown check status, stale schema', () => {
  const s = load();
  assert.ok(validateRuntimeState({...s, production: {...s.production, release_sha: 'abc'}}).length);
  assert.ok(validateRuntimeState({...s, next_action: ''}).length);
  assert.ok(validateRuntimeState({...s, schema_version: 'x'}).length);
  assert.ok(validateRuntimeState({...s, pending_runtime_checks: [{id: 'A', detail: 'd', status: 'MAYBE'}]}).length);
  const {current_task, ...rest} = s; assert.ok(validateRuntimeState(rest).length);
});
test('JSON schema file exists and names the same required keys', () => {
  const schema = JSON.parse(readFileSync(new URL('../docs/governance/schemas/runtime-state.schema.json', import.meta.url), 'utf8'));
  for (const key of ['production', 'current_task', 'blockers', 'pending_runtime_checks', 'next_action', 'owner_decisions_relayed']) assert.ok(schema.required.includes(key), key);
});
