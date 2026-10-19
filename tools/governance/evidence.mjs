#!/usr/bin/env node
// Permanent audit evidence (MP-OWNER-PERMANENT-EVIDENCE-01). An evidence package is a folder with:
//   evidence.json    schema mp-evidence-v1: audit_id, commit_sha (the commit analysed), date, environment, outcome,
//                    archive (where the complete package lives durably, with the SHA-256 of its ZIP);
//   MANIFEST.sha256  the SHA-256 of every other file of the folder, in `sha256sum` format;
//   the original files, byte-identical to those the audit produced.
// Essential evidence goes in docs/audits/<audit_id>/ on main (small: report, key comparisons); the complete package goes
// in the branch evidence/audits, outside the history of main. A package is archived only once it was read back from
// that durable place and its manifest checked (`verify --remote`).
//
// Usage:
//   node tools/governance/evidence.mjs pack <dir> --audit-id <id> --commit <sha> --date <YYYY-MM-DD> --environment <text>
//        --outcome <text> [--archive-branch <b> --archive-commit <sha> --archive-path <p> --archive-zip-sha256 <h>]
//   node tools/governance/evidence.mjs verify <docs/audits>   every package of the folder, and the index README.md
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const EVIDENCE_SCHEMA = 'mp-evidence-v1';
// Essential evidence on main stays small: the complete package belongs to the archive branch.
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_PACKAGE_BYTES = 4 * 1024 * 1024;
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const text = value => typeof value === 'string' && value.trim() !== '';
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) out.push(...files(path));
    else out.push(path);
  }
  return out;
}

export function writeManifest(dir) {
  const lines = files(dir).map(path => relative(dir, path).split('\\').join('/')).filter(path => path !== 'MANIFEST.sha256')
    .map(path => `${sha256(readFileSync(join(dir, path)))}  ${path}`);
  writeFileSync(join(dir, 'MANIFEST.sha256'), lines.join('\n') + '\n');
  return lines.length;
}

export function pack(dir, fields) {
  const evidence = {schema: EVIDENCE_SCHEMA, audit_id: fields.audit_id, commit_sha: fields.commit_sha, date: fields.date,
    environment: fields.environment, outcome: fields.outcome, archive: fields.archive ?? null};
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  const count = writeManifest(dir);
  const result = verifyPackage(dir, {requireArchive: false});
  return {...result, files: count};
}

// Checks one package. requireArchive: the package must name its durable archive (always, on main).
export function verifyPackage(dir, {requireArchive = true, sizeLimits = true} = {}) {
  const errors = [];
  const name = dir.split(/[\\/]/).filter(Boolean).pop();
  let evidence = null;
  try { evidence = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8')); } catch { errors.push(`${name}: evidence.json missing or not valid JSON`); }
  if (evidence) {
    if (evidence.schema !== EVIDENCE_SCHEMA) errors.push(`${name}: unexpected schema ${evidence.schema}`);
    if (evidence.audit_id !== name) errors.push(`${name}: audit_id ${evidence.audit_id} does not match the folder`);
    if (!SHA1.test(evidence.commit_sha || '')) errors.push(`${name}: commit_sha is not a full SHA`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evidence.date || '') || Number.isNaN(Date.parse(evidence.date))) errors.push(`${name}: date is not YYYY-MM-DD`);
    for (const field of ['environment', 'outcome']) if (!text(evidence[field])) errors.push(`${name}: ${field} missing`);
    const archive = evidence.archive;
    if (requireArchive) {
      if (!archive || !text(archive.branch) || !SHA1.test(archive.commit || '') || !text(archive.path) || !SHA256.test(archive.zip_sha256 || '')) {
        errors.push(`${name}: archive must name branch, commit, path and zip_sha256`);
      } else if (archive.url !== `https://github.com/zarbopiero963-droid/MatchPilot/tree/${archive.commit}/${archive.path}`) {
        errors.push(`${name}: archive.url must be the permalink of the archive commit and path`);
      }
    }
  }
  const manifestPath = join(dir, 'MANIFEST.sha256');
  if (!existsSync(manifestPath)) return {ok: false, errors: [...errors, `${name}: MANIFEST.sha256 missing`]};
  const listed = new Map();
  for (const line of readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean)) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) { errors.push(`${name}: malformed manifest line "${line.slice(0, 80)}"`); continue; }
    listed.set(match[2], match[1]);
  }
  let total = 0;
  for (const path of files(dir)) {
    const rel = relative(dir, path).split('\\').join('/');
    if (rel === 'MANIFEST.sha256') continue;
    if (lstatSync(path).isSymbolicLink()) { errors.push(`${name}: ${rel} is a symbolic link`); continue; }
    const content = readFileSync(path);
    total += content.length;
    if (sizeLimits && content.length > MAX_FILE_BYTES) errors.push(`${name}: ${rel} is ${content.length} bytes, over ${MAX_FILE_BYTES}: keep it in the archive branch`);
    if (!listed.has(rel)) errors.push(`${name}: ${rel} not in the manifest`);
    else if (listed.get(rel) !== sha256(content)) errors.push(`${name}: ${rel} changed (SHA-256 differs from the manifest)`);
    listed.delete(rel);
  }
  for (const rel of listed.keys()) errors.push(`${name}: ${rel} listed in the manifest but missing`);
  if (sizeLimits && total > MAX_PACKAGE_BYTES) errors.push(`${name}: package is ${total} bytes, over ${MAX_PACKAGE_BYTES}`);
  return {ok: errors.length === 0, errors, evidence};
}

// Checks every package under root (docs/audits) and that the index README.md lists each one.
export function verifyAudits(root) {
  const errors = [];
  const index = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : null;
  if (index === null) errors.push('README.md (evidence index) missing');
  const packages = readdirSync(root).filter(name => lstatSync(join(root, name)).isDirectory()).sort();
  for (const name of packages) {
    errors.push(...verifyPackage(join(root, name)).errors);
    if (index !== null && !index.includes(`](${name}/`)) errors.push(`${name}: not listed in README.md`);
  }
  return {ok: errors.length === 0, errors, packages};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir, ...args] = process.argv.slice(2);
  const opt = key => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : undefined; };
  if (command === 'verify' && dir) {
    const result = verifyAudits(dir);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else if (command === 'pack' && dir) {
    const archive = opt('archive-branch') ? {branch: opt('archive-branch'), commit: opt('archive-commit'), path: opt('archive-path'),
      zip_sha256: opt('archive-zip-sha256'), url: `https://github.com/zarbopiero963-droid/MatchPilot/tree/${opt('archive-commit')}/${opt('archive-path')}`} : null;
    const result = pack(dir, {audit_id: opt('audit-id'), commit_sha: opt('commit'), date: opt('date'), environment: opt('environment'), outcome: opt('outcome'), archive});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else {
    console.error('usage: evidence.mjs pack <dir> --audit-id … | verify <docs/audits>');
    process.exit(2);
  }
}
