// Permanent audit evidence (MP-OWNER-PERMANENT-EVIDENCE-01): every package in docs/audits is complete, unmodified, small
// and linked to its durable archive; the checker refuses each way of breaking that.
import assert from 'node:assert/strict';
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {MAX_FILE_BYTES, pack, verifyAudits, verifyPackage} from '../tools/governance/evidence.mjs';

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
  refused(verifyAudits(mutate(t, e => { e.date = '19/10/2026'; })), /date is not YYYY-MM-DD/);
  refused(verifyAudits(mutate(t, e => { e.outcome = ' '; })), /outcome missing/);
  refused(verifyAudits(mutate(t, e => { e.environment = ''; })), /environment missing/);
  refused(verifyAudits(mutate(t, e => { e.audit_id = 'OTHER'; })), /does not match the folder/);
  refused(verifyAudits(mutate(t, e => { e.archive = null; })), /archive must name branch, commit, path and zip_sha256/);
  refused(verifyAudits(mutate(t, e => { e.archive.url = 'https://example.com/x'; })), /permalink/);
  const root = copy(t);
  writeFileSync(join(root, 'README.md'), '# empty index\n');
  refused(verifyAudits(root), /not listed in README\.md/);
});
