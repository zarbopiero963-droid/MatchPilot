// Permanent audit evidence (MP-OWNER-PERMANENT-EVIDENCE-01): every package in docs/audits is complete, unmodified, small
// and linked to its durable archive; the checker refuses each way of breaking that.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {MAX_FILE_BYTES, pack, verifyArchive, verifyAudits, verifyPackage} from '../tools/governance/evidence.mjs';

const AUDITS = new URL('../docs/audits/', import.meta.url).pathname;
const ID = 'MP-OWNER-VISUAL-BASELINE-AUDIT-01';

test('every evidence package in docs/audits is valid and listed in the index', () => {
  const result = verifyAudits(AUDITS);
  assert.deepEqual(result.errors, []);
  assert.ok(result.packages.includes(ID));
});

function copy(t) {
  const root = mkdtempSync(join(tmpdir(), 'mp-evidence-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  cpSync(AUDITS, root, {recursive: true});
  return root;
}
const refused = (result, pattern) => {
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => pattern.test(error)), `expected ${pattern} in ${JSON.stringify(result.errors)}`);
};

test('an altered, missing, extra, linked or oversized evidence file is refused', t => {
  let root = copy(t);
  writeFileSync(join(root, ID, 'comparisons/ricerca-mobile.png'), 'edited');
  refused(verifyAudits(root), /ricerca-mobile\.png changed/);
  root = copy(t);
  rmSync(join(root, ID, 'audit-report.md'));
  refused(verifyAudits(root), /audit-report\.md listed in the manifest but missing/);
  root = copy(t);
  writeFileSync(join(root, ID, 'comparisons/new.png'), 'x');
  refused(verifyAudits(root), /new\.png not in the manifest/);
  root = copy(t);
  rmSync(join(root, ID, 'comparisons/ricerca-mobile.png'));
  symlinkSync('/etc/hostname', join(root, ID, 'comparisons/ricerca-mobile.png'));
  refused(verifyAudits(root), /symbolic link/);
  root = copy(t);
  writeFileSync(join(root, ID, 'big.bin'), Buffer.alloc(MAX_FILE_BYTES + 1));
  refused(verifyPackage(join(root, ID)), /over 1048576: keep it in the archive branch/);
});

test('a package without its audit data, archive or index entry is refused', t => {
  const mutate = (t2, change) => {
    const root = copy(t2);
    const dir = join(root, ID);
    const evidence = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8'));
    change(evidence);
    return pack(dir, evidence) && root;
  };
  // pack rewrites the manifest, so these isolate the evidence.json rules.
  refused(verifyAudits(mutate(t, e => { e.commit_sha = 'abc'; })), /commit_sha is not a full SHA/);
  refused(verifyAudits(mutate(t, e => { e.date = '19/10/2026'; })), /date is not a real YYYY-MM-DD day/);
  refused(verifyAudits(mutate(t, e => { e.date = '2026-02-31'; })), /date is not a real YYYY-MM-DD day/);
  refused(verifyAudits(mutate(t, e => { e.archive.branch = 'main'; })), /archive branch must be evidence\/audits/);
  refused(verifyAudits(mutate(t, e => { e.archive.path = '../x'; })), /archive path must be the audit folder/);
  refused(verifyAudits(mutate(t, e => { e.outcome = ' '; })), /outcome missing/);
  refused(verifyAudits(mutate(t, e => { e.environment = ''; })), /environment missing/);
  refused(verifyAudits(mutate(t, e => { e.audit_id = 'OTHER'; })), /does not match the folder/);
  refused(verifyAudits(mutate(t, e => { e.archive = null; })), /archive must name branch, commit, path and zip_sha256/);
  refused(verifyAudits(mutate(t, e => { e.archive.url = 'https://example.com/x'; })), /permalink/);
  let root = copy(t);
  writeFileSync(join(root, 'README.md'), '# empty index\n');
  refused(verifyAudits(root), /not listed in the README\.md index table/);
  // A mention outside the index table, e.g. in an HTML comment, does not list the package (PR #167 NB-5).
  root = copy(t);
  writeFileSync(join(root, 'README.md'), `# index\n<!-- [${ID}](${ID}/README.md) -->\n`);
  refused(verifyAudits(root), /not listed in the README\.md index table/);
});

test('an evidence.json that is not an object never skips the checks (PR #167 B-1)', t => {
  for (const body of ['null', 'false', '0', '""', '[]', '"text"']) {
    const root = copy(t);
    const dir = join(root, ID);
    writeFileSync(join(dir, 'evidence.json'), body);
    // Even with a manifest rewritten to match, the package is refused.
    pack(dir, {});
    writeFileSync(join(dir, 'evidence.json'), body);
    refused(verifyAudits(root), /evidence\.json missing, not valid JSON or not an object/);
  }
});

test('stray files, linked package folders, repeated manifest lines and a missing folder are refused (PR #167 NB-3, NB-4)', t => {
  let root = copy(t);
  writeFileSync(join(root, 'notes.txt'), 'x');
  refused(verifyAudits(root), /notes\.txt: only README\.md and package folders/);
  root = copy(t);
  symlinkSync(join(root, ID), join(root, 'LINKED'));
  refused(verifyAudits(root), /LINKED: only README\.md and package folders/);
  root = copy(t);
  const manifest = join(root, ID, 'MANIFEST.sha256');
  writeFileSync(manifest, readFileSync(manifest, 'utf8') + readFileSync(manifest, 'utf8').split('\n')[0] + '\n');
  refused(verifyAudits(root), /listed twice in the manifest/);
  refused(verifyAudits(join(root, 'missing')), /is not a folder/);
});

// The durable archive is read back from git: the branch evidence/audits. The Fast checks job fetches the full history
// and sets MATCHPILOT_EVIDENCE_ARCHIVE=1, so there the archive must be readable; jobs with a shallow checkout skip.
const REPO = new URL('..', import.meta.url).pathname;
const evidence = JSON.parse(readFileSync(join(AUDITS, ID, 'evidence.json'), 'utf8'));
const essential = verifyPackage(join(AUDITS, ID)).manifest;
function archiveAvailable(t) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', evidence.archive.commit, 'refs/remotes/origin/evidence/audits'], {cwd: REPO, stdio: 'ignore'});
    return true;
  } catch {
    if (process.env.MATCHPILOT_EVIDENCE_ARCHIVE === '1') throw new Error(`archive commit ${evidence.archive.commit} not on origin/evidence/audits in this checkout`);
    t.skip('archive branch not fetched here (git fetch origin evidence/audits); required where MATCHPILOT_EVIDENCE_ARCHIVE=1');
    return false;
  }
}

test('every package is read back from its durable archive: commit on evidence/audits, files and ZIP match (PR #167 NB-2)', t => {
  if (!archiveAvailable(t)) return;
  assert.deepEqual(verifyAudits(AUDITS, {archiveGitDir: REPO}).errors, []);
});

test('a fake, foreign or altered archive is refused', t => {
  if (!archiveAvailable(t)) return;
  const fake = {...evidence, archive: {...evidence.archive, commit: 'f'.repeat(40)}};
  assert.match(verifyArchive(REPO, fake).join(), /archive commit f+ not found/);
  // A commit that exists but is not on the archive branch (main's history) and has no package.
  const mainCommit = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).trim().split('\n')[0];
  const foreign = verifyArchive(REPO, {...evidence, archive: {...evidence.archive, commit: mainCommit}}).join();
  assert.match(foreign, /is not on origin\/evidence\/audits/);
  assert.match(foreign, /has no MP-OWNER-VISUAL-BASELINE-AUDIT-01\/MANIFEST\.sha256/);
  assert.match(verifyArchive(REPO, {...evidence, archive: {...evidence.archive, zip_sha256: '0'.repeat(64)}}).join(), /ZIP differs/);
  // The essential files must be the archived ones (PR #167 round 2 NB-2): a replaced report is refused.
  const replaced = new Map(essential);
  replaced.set('audit-report.md', '0'.repeat(64));
  replaced.set('comparisons/invented.png', '1'.repeat(64));
  const result = verifyArchive(REPO, evidence, replaced).join();
  assert.match(result, /essential audit-report\.md differs from the archive/);
  assert.match(result, /essential comparisons\/invented\.png is not in the archive/);
  assert.deepEqual(verifyArchive(REPO, evidence, essential), []);
});

test('a commit only on a local evidence/audits branch is not a read-back (PR #167 round 2 NB-1)', t => {
  if (!archiveAvailable(t)) return;
  // HEAD of this checkout exists locally but is not on origin/evidence/audits.
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: REPO, encoding: 'utf8'}).trim();
  assert.match(verifyArchive(REPO, {...evidence, archive: {...evidence.archive, commit: head}}).join(), /is not on origin\/evidence\/audits/);
});
