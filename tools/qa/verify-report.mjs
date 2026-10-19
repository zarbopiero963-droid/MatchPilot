#!/usr/bin/env node
// Browser QA Gate verifier (MP-OWNER-BROWSER-QA-HARD-GATE-01). Accepts a Browser QA evidence directory only when it is
// complete, unmodified, produced by an actual run, and bound to the exact commit under review. It recomputes everything
// it can instead of trusting the report:
// - the report exists, parses and has the expected schema;
// - head_sha equals the expected PR head and tested_commit the checked-out commit (both full SHAs), on a clean tree;
// - every evidence file listed exists with the recorded SHA-256, and every screenshot and trace a journey cites is listed;
// - every required journey runs on every required viewport, once, and PASSes with steps that each have a screenshot,
//   a trace, a positive duration and no unexpected browser error;
// - SKIP and NOT_VERIFIED carry a reason and never stand in for a required journey;
// - counts, missing_required and the verdict equal what the journeys imply;
// - the report is not dated in the future and carries no secret-like value.
// Exit code 0 only when the evidence is valid and the verdict is PASS.
//
// Usage: node tools/qa/verify-report.mjs <dir> --head <sha> [--commit <sha>]
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findSecrets} from '../governance/secrets.mjs';
import {REQUIRED_JOURNEYS, REQUIRED_VIEWPORTS} from './journeys.mjs';

const SHA = /^[0-9a-f]{40}$/;
const STATUSES = ['PASS', 'FAIL', 'SKIP', 'NOT_VERIFIED'];
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

const listFiles = dir => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? listFiles(path) : [path];
});

// The tested commit must contain the PR head (in a pull_request run it is the merge of the head into the base).
export function containsHead(cwd, head, commit) {
  try { execFileSync('git', ['merge-base', '--is-ancestor', head, commit], {cwd, stdio: 'ignore'}); return true; }
  catch { return false; }
}

// The evidence manifest: every listed file exists with its SHA-256, no inherited key counts as a file (PR #164 NB-1),
// no path escapes the directory, and nothing on disk is missing from the manifest except the report itself (NB-2).
// Shared by the gate verifier and the exploration verifier.
export function checkManifest(dir, manifest, reportName) {
  const errors = [];
  const files = Object.assign(Object.create(null), manifest && typeof manifest === 'object' ? manifest : {});
  const listed = path => Object.hasOwn(files, path) && typeof files[path] === 'string';
  if (!Object.keys(files).length) errors.push('no evidence files listed');
  for (const path of listFiles(dir).map(full => relative(dir, full).split('\\').join('/'))) {
    if (path !== reportName && !listed(path)) errors.push(`file not in the manifest: ${path}`);
  }
  for (const [path, digest] of Object.entries(files)) {
    if (path.includes('..') || path.startsWith('/')) { errors.push(`unsafe evidence path ${path}`); continue; }
    const full = join(dir, path);
    if (!existsSync(full)) errors.push(`evidence missing: ${path}`);
    else if (sha256(readFileSync(full)) !== digest) errors.push(`evidence changed after the run: ${path}`);
  }
  return {errors, listed};
}

export function verifyReport(dir, {expectedHead, expectedCommit = null, required = REQUIRED_JOURNEYS, viewports = REQUIRED_VIEWPORTS, now = new Date(), gitDir = null} = {}) {
  const errors = [];
  const fail = message => { errors.push(message); return {ok: false, errors, report: null}; };
  if (!SHA.test(expectedHead || '')) return fail('expected head SHA missing or not a full SHA');
  const reportPath = join(dir, 'report.json');
  if (!existsSync(reportPath)) return fail('report.json missing');
  let report;
  try { report = JSON.parse(readFileSync(reportPath, 'utf8')); } catch { return fail('report.json is not valid JSON'); }

  if (report.schema !== 'mp-browser-qa-v1') errors.push(`unexpected schema ${report.schema}`);
  if (report.head_sha !== expectedHead) errors.push(`report is for ${report.head_sha}, not the PR head ${expectedHead}`);
  if (!SHA.test(report.tested_commit || '')) errors.push('tested_commit is not a full SHA');
  if (expectedCommit && report.tested_commit !== expectedCommit) errors.push(`report tested ${report.tested_commit}, not the checked-out commit ${expectedCommit}`);
  if (gitDir && expectedCommit && !containsHead(gitDir, expectedHead, expectedCommit)) errors.push(`the tested commit ${expectedCommit} does not contain the PR head ${expectedHead}`);
  if (report.working_tree_clean !== true) errors.push('the run was made on a modified working tree');
  if (Number.isNaN(Date.parse(report.generated_at)) || Date.parse(report.generated_at) > now.getTime() + 10 * 60e3) errors.push('generated_at missing or in the future');
  if (report.dataset?.production_data !== false) errors.push('dataset must declare production_data: false');
  if (report.injected_defect !== false) errors.push('the run used a test hook (injected defect): not valid evidence');

  // Evidence files: present and unchanged.
  const manifest = checkManifest(dir, report.files, 'report.json');
  errors.push(...manifest.errors);
  const {listed} = manifest;

  // Journeys.
  const journeys = Array.isArray(report.journeys) ? report.journeys : [];
  if (!journeys.length) errors.push('no journeys');
  const seen = new Set();
  for (const journey of journeys) {
    const at = `${journey.id}/${journey.viewport}`;
    if (seen.has(at)) errors.push(`${at} reported twice`);
    seen.add(at);
    if (!STATUSES.includes(journey.status)) { errors.push(`${at} has invalid status ${journey.status}`); continue; }
    if (['SKIP', 'NOT_VERIFIED'].includes(journey.status) && !String(journey.reason || '').trim()) errors.push(`${at} ${journey.status} without a reason`);
    if (!listed(journey.trace)) errors.push(`${at} trace not in the evidence`);
    for (const step of journey.steps ?? []) if (step.screenshot && !listed(step.screenshot)) errors.push(`${at} screenshot ${step.screenshot} not in the evidence`);
    if (journey.status === 'PASS') {
      const steps = Array.isArray(journey.steps) ? journey.steps : [];
      if (!steps.length) errors.push(`${at} PASS without executed steps`);
      if (steps.some(step => step.status !== 'PASS' || !step.screenshot)) errors.push(`${at} PASS with a failed or unrecorded step`);
      if (!(journey.duration_ms > 0)) errors.push(`${at} PASS without a duration`);
      for (const key of ['console_errors', 'page_errors', 'http_errors', 'request_failures']) {
        if (!Array.isArray(journey[key])) errors.push(`${at} ${key} missing`);
        else if (journey[key].length) errors.push(`${at} PASS with ${key}`);
      }
    }
  }

  // Required coverage and the computed outcome.
  const missing = [];
  for (const id of required) for (const viewport of viewports) {
    const journey = journeys.find(item => item.id === id && item.viewport === viewport);
    if (!journey) missing.push(`${id}/${viewport}`);
    else if (journey.status !== 'PASS') missing.push(`${id}/${viewport}`);
  }
  if (missing.length) errors.push(`required journeys not passed: ${missing.join(', ')}`);
  if (JSON.stringify(report.missing_required) !== JSON.stringify(missing)) errors.push(`missing_required ${JSON.stringify(report.missing_required)} does not match the journeys`);
  const counts = {pass: 0, fail: 0, skip: 0, not_verified: 0};
  for (const journey of journeys) if (STATUSES.includes(journey.status)) counts[journey.status.toLowerCase()]++;
  if (JSON.stringify(counts) !== JSON.stringify(report.counts)) errors.push(`counts ${JSON.stringify(report.counts)} do not match the journeys ${JSON.stringify(counts)}`);
  const verdict = counts.fail === 0 && missing.length === 0 ? 'PASS' : 'FAIL';
  if (report.verdict !== verdict) errors.push(`declared verdict ${report.verdict} but the journeys give ${verdict}`);
  if (verdict !== 'PASS') errors.push('verdict is not PASS');
  for (const secret of findSecrets(report)) errors.push(`secret-like value at ${secret}`);
  return {ok: errors.length === 0, errors, report};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args.find(arg => !arg.startsWith('--') && args[args.indexOf(arg) - 1]?.startsWith('--') !== true);
  if (!dir) { console.error('usage: verify-report.mjs <dir> --head <sha> [--commit <sha>]'); process.exit(2); }
  const result = verifyReport(dir, {expectedHead: opt('head'), expectedCommit: opt('commit') ?? null, gitDir: process.cwd()});
  console.log(JSON.stringify({ok: result.ok, verdict: result.report?.verdict ?? null, head_sha: result.report?.head_sha ?? null, counts: result.report?.counts ?? null, errors: result.errors}, null, 2));
  process.exit(result.ok ? 0 : 1);
}
