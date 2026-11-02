// Fixtures of the F3 double authorization (MP-MIG-GATE-01) for the PostgreSQL tests: an owner approval manifest with
// its decision register, and a technical token directory outside the repository. Passed to the runner through its
// programmatic `authz` option (never the environment). In the tests the token owner is the test process (the runtime
// requires uid 0 outside test mode); the same permission rules are checked.
import {randomBytes} from 'node:crypto';
import {chmod, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

export const TEST_DECISION = 'MP-TEST-MIGRATION-GO-01';
export const RELEASE = 'a'.repeat(40);
const iso = ms => new Date(ms).toISOString();

export async function authzFixture({approvals = [], token = null, decisionStatus = 'IN_FORCE', releaseSha = RELEASE} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mp-authz-'));
  const repo = join(root, 'repo');
  const dir = join(root, 'authz');
  await mkdir(repo);
  await mkdir(dir, {mode: 0o700});
  await chmod(dir, 0o700);
  const approvalsPath = join(repo, 'migration-approvals.json');
  const decisionsPath = join(repo, 'owner-decisions.json');
  await writeFile(decisionsPath, JSON.stringify({decisions: [{id: TEST_DECISION, status: decisionStatus}]}));
  await writeFile(approvalsPath, JSON.stringify({schema: 'mp-migration-approvals-v1', approvals}));
  const options = {approvalsPath, decisionsPath, dir, repoRoot: repo, releaseSha, ownerUid: process.getuid()};
  const fixture = {
    root, dir, options, approvalsPath,
    tokenPath: join(dir, `allow-migrations-${releaseSha}.json`),
    async setApprovals(list) { await writeFile(approvalsPath, JSON.stringify({schema: 'mp-migration-approvals-v1', approvals: list})); },
    async setToken(body, mode = 0o600) {
      const path = join(dir, `allow-migrations-${body.release_sha ?? releaseSha}.json`);
      await writeFile(path, typeof body === 'string' ? body : JSON.stringify(body));
      await chmod(path, mode);
      return path;
    },
    cleanup: () => rm(root, {recursive: true, force: true}),
  };
  if (token) await fixture.setToken(token);
  return fixture;
}

export const approval = (id, operation, filename, sha256, extra = {}) => ({id, operation, filename, sha256, decision: TEST_DECISION,
  expires_at: iso(Date.now() + 3600e3), ...extra});

export const technicalToken = (operations, extra = {}) => ({schema: 'mp-migration-technical-authz-v1', release_sha: RELEASE,
  nonce: randomBytes(16).toString('hex'), issued_at: iso(Date.now() - 60e3), expires_at: iso(Date.now() + 3600e3), operations, ...extra});
