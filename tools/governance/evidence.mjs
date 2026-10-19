#!/usr/bin/env node
// Permanent audit evidence (MP-OWNER-PERMANENT-EVIDENCE-01). An evidence package is a folder with:
//   evidence.json    schema mp-evidence-v1: audit_id, commit_sha (the commit analysed), date, environment, outcome,
//                    archive (where the complete package lives durably, with the SHA-256 of its ZIP);
//   MANIFEST.sha256  the SHA-256 of every other file of the folder, in `sha256sum` format;
//   the original files, byte-identical to those the audit produced.
// Essential evidence goes in docs/audits/<audit_id>/ on main (small: report, key comparisons); the complete package goes
// in the branch evidence/audits, outside the history of main. A package is archived only once it was read back from
// that durable place and its manifest checked: `verify --archive` reads every package's archive commit from git (the
// branch evidence/audits, fetched by CI) and checks its manifest and ZIP checksum blob by blob.
//
// Usage:
//   node tools/governance/evidence.mjs pack <dir> --audit-id <id> --commit <sha> --date <YYYY-MM-DD> --environment <text>
//        --outcome <text> [--archive-branch <b> --archive-commit <sha> --archive-path <p> --archive-zip-sha256 <h>]
//   node tools/governance/evidence.mjs verify <docs/audits> [--archive]   every package, the index, and the archives
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, lstatSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const EVIDENCE_SCHEMA = 'mp-evidence-v1';
// Essential evidence on main stays small: the complete package belongs to the archive branch.
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_PACKAGE_BYTES = 4 * 1024 * 1024;
export const ARCHIVE_BRANCH = 'evidence/audits';
const REPO_URL = 'https://github.com/zarbopiero963-droid/MatchPilot';
const SHA1 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const text = value => typeof value === 'string' && value.trim() !== '';
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
// A real calendar day: 2026-02-31 is refused.
const isDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Manifest lines as a map; a malformed or repeated line is an error.
function readManifest(content, name, errors) {
  const listed = new Map();
  for (const line of content.split('\n').filter(Boolean)) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (!match) { errors.push(`${name}: malformed manifest line "${line.slice(0, 80)}"`); continue; }
    if (listed.has(match[2])) errors.push(`${name}: ${match[2]} listed twice in the manifest`);
    listed.set(match[2], match[1]);
  }
  return listed;
}

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
  try { evidence = JSON.parse(readFileSync(join(dir, 'evidence.json'), 'utf8')); } catch { /* reported below */ }
  if (!isObject(evidence)) {
    errors.push(`${name}: evidence.json missing, not valid JSON or not an object`);
    evidence = null;
  } else {
    if (evidence.schema !== EVIDENCE_SCHEMA) errors.push(`${name}: unexpected schema ${evidence.schema}`);
    if (evidence.audit_id !== name) errors.push(`${name}: audit_id ${evidence.audit_id} does not match the folder`);
    if (!SHA1.test(evidence.commit_sha || '')) errors.push(`${name}: commit_sha is not a full SHA`);
    if (!isDay(evidence.date)) errors.push(`${name}: date is not a real YYYY-MM-DD day`);
    for (const field of ['environment', 'outcome']) if (!text(evidence[field])) errors.push(`${name}: ${field} missing`);
    const archive = evidence.archive;
    if (requireArchive) {
      if (!isObject(archive) || !SHA1.test(archive.commit || '') || !text(archive.path) || !SHA256.test(archive.zip_sha256 || '')) {
        errors.push(`${name}: archive must name branch, commit, path and zip_sha256`);
      } else if (archive.branch !== ARCHIVE_BRANCH) {
        errors.push(`${name}: archive branch must be ${ARCHIVE_BRANCH}`);
      } else if (archive.path !== name) {
        errors.push(`${name}: archive path must be the audit folder ${name}`);
      } else if (archive.url !== `${REPO_URL}/tree/${archive.commit}/${archive.path}`) {
        errors.push(`${name}: archive.url must be the permalink of the archive commit and path`);
      }
    }
  }
  const manifestPath = join(dir, 'MANIFEST.sha256');
  if (!existsSync(manifestPath)) return {ok: false, errors: [...errors, `${name}: MANIFEST.sha256 missing`]};
  const listed = readManifest(readFileSync(manifestPath, 'utf8'), name, errors);
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

// Reads a package's archive from git, the durable copy: the commit is on the archive branch, and every file its
// manifest lists, and the ZIP, has the recorded SHA-256. gitDir: a clone that fetched the archive branch.
export function verifyArchive(gitDir, evidence) {
  const errors = [];
  const {archive, audit_id: id} = evidence;
  const git = args => execFileSync('git', args, {cwd: gitDir, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']});
  const blob = path => git(['cat-file', 'blob', `${archive.commit}:${path}`]);
  try { git(['cat-file', '-e', `${archive.commit}^{commit}`]); } catch { return [`${id}: archive commit ${archive.commit} not found (fetch ${ARCHIVE_BRANCH})`]; }
  const onBranch = [`refs/remotes/origin/${ARCHIVE_BRANCH}`, `refs/heads/${ARCHIVE_BRANCH}`].some(ref => {
    try { git(['merge-base', '--is-ancestor', archive.commit, ref]); return true; } catch { return false; }
  });
  if (!onBranch) errors.push(`${id}: archive commit ${archive.commit} is not on ${ARCHIVE_BRANCH}`);
  let manifest;
  try { manifest = blob(`${archive.path}/MANIFEST.sha256`).toString('utf8'); } catch { return [...errors, `${id}: archive has no ${archive.path}/MANIFEST.sha256`]; }
  const listed = readManifest(manifest, `${id} (archive)`, errors);
  if (!listed.size) errors.push(`${id}: archive manifest is empty`);
  for (const [path, digest] of listed) {
    try {
      if (sha256(blob(`${archive.path}/${path}`)) !== digest) errors.push(`${id}: archive ${path} differs from its manifest`);
    } catch { errors.push(`${id}: archive ${path} listed but missing`); }
  }
  try {
    if (sha256(blob(`archives/${id}-evidence.zip`)) !== archive.zip_sha256) errors.push(`${id}: archive ZIP differs from zip_sha256`);
  } catch { errors.push(`${id}: archive ZIP archives/${id}-evidence.zip missing`); }
  return errors;
}

// Checks every package under root (docs/audits), that the index README.md lists each one in its table, that nothing
// else sits in the folder, and with archiveGitDir the durable archive of each package.
export function verifyAudits(root, {archiveGitDir = null} = {}) {
  if (!existsSync(root) || !lstatSync(root).isDirectory()) return {ok: false, errors: [`${root} is not a folder`], packages: []};
  const errors = [];
  const index = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : null;
  if (index === null) errors.push('README.md (evidence index) missing');
  const rows = new Set((index ?? '').split('\n').map(line => /^\| \[([^\]]+)\]\(\1\/README\.md\) \|/.exec(line)?.[1]).filter(Boolean));
  const packages = [];
  for (const name of readdirSync(root).sort()) {
    const stat = lstatSync(join(root, name));
    if (name === 'README.md' && stat.isFile()) continue;
    if (!stat.isDirectory()) { errors.push(`${name}: only README.md and package folders belong in ${root}`); continue; }
    packages.push(name);
    const result = verifyPackage(join(root, name));
    errors.push(...result.errors);
    if (!rows.has(name)) errors.push(`${name}: not listed in the README.md index table`);
    if (archiveGitDir && result.evidence?.archive && result.errors.length === 0) errors.push(...verifyArchive(archiveGitDir, result.evidence));
  }
  for (const name of rows) if (!packages.includes(name)) errors.push(`${name}: listed in README.md but no package folder`);
  return {ok: errors.length === 0, errors, packages};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, dir, ...args] = process.argv.slice(2);
  const opt = key => { const i = args.indexOf(`--${key}`); return i >= 0 ? args[i + 1] : undefined; };
  if (command === 'verify' && dir) {
    const result = verifyAudits(dir, {archiveGitDir: args.includes('--archive') ? process.cwd() : null});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else if (command === 'pack' && dir) {
    const archive = opt('archive-branch') ? {branch: opt('archive-branch'), commit: opt('archive-commit'), path: opt('archive-path'),
      zip_sha256: opt('archive-zip-sha256'), url: `${REPO_URL}/tree/${opt('archive-commit')}/${opt('archive-path')}`} : null;
    const result = pack(dir, {audit_id: opt('audit-id'), commit_sha: opt('commit'), date: opt('date'), environment: opt('environment'), outcome: opt('outcome'), archive});
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 1);
  } else {
    console.error('usage: evidence.mjs pack <dir> --audit-id … | verify <docs/audits>');
    process.exit(2);
  }
}
