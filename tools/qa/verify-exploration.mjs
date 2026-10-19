#!/usr/bin/env node
// Verifier for the exploratory level (MP-OWNER-BROWSER-QA-HARD-GATE-01, QA-02). Two separate evidences, never mixed:
//
// A. The deterministic crawler bundle (tools/qa/explore.mjs, exploration.json):
//    - schema; head_sha is the PR head and tested_commit the checked-out commit, which contains the head;
//    - the manifest (shared rules with the gate verifier): every file present and unchanged, nothing unlisted;
//    - no test hook (injected defect) in an evidence run;
//    - every finding has a known kind, a replayable sequence that starts by opening a route, a listed screenshot and a
//      boolean reproduction result; totals equal the findings and the trails;
//    - every explored route and viewport has a trail (the SHA-256 of its action sequence) and open/end observations.
//
// B. The AI review of that bundle (ai-review.json), made by a Claude agent in an authorized session, never by a paid
//    API in CI:
//    - it names the exact bundle (SHA-256 of exploration.json) and the same head;
//    - it states which observations it reviewed (all of them, or the missing ones with a reason);
//    - every reproduced crawler finding is triaged; every finding has a classification from
//      MP-OWNER-PRODUCT-QUALITY-DATA-01 (BUG, DATA_MISSING, DATA_QUALITY_ISSUE, NOT_VERIFIED, BLOCKED, NOT_A_DEFECT with a
//      reason) and, for a BUG, a severity P0–P3;
//    - a finding marked FIXED names its regression test;
//    - its verdict is computed: BLOCKING when an open P0/P1 BUG exists.
//    The review file lives outside the bundle directory (the bundle manifest would refuse an unlisted file).
//
// Usage: node tools/qa/verify-exploration.mjs <dir> --head <sha> [--commit <sha>] [--review <ai-review.json>]
import {existsSync, readFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findSecrets} from '../governance/secrets.mjs';
import {checkManifest, containsHead} from './verify-report.mjs';
import {sha256} from './browser-qa.mjs';

const SHA = /^[0-9a-f]{40}$/;
export const FINDING_KINDS = ['js-error', 'console-error', 'http-5xx', 'request-failed', 'stuck-loading', 'blank-view', 'invariant'];
export const CLASSIFICATIONS = ['BUG', 'DATA_MISSING', 'DATA_QUALITY_ISSUE', 'NOT_VERIFIED', 'BLOCKED', 'NOT_A_DEFECT'];
export const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

export function verifyExploration(dir, {expectedHead, expectedCommit = null, gitDir = null, now = new Date()} = {}) {
  const errors = [];
  const fail = message => ({ok: false, errors: [...errors, message], report: null});
  if (!SHA.test(expectedHead || '')) return fail('expected head SHA missing or not a full SHA');
  const path = join(dir, 'exploration.json');
  if (!existsSync(path)) return fail('exploration.json missing');
  let report;
  try { report = JSON.parse(readFileSync(path, 'utf8')); } catch { return fail('exploration.json is not valid JSON'); }
  if (report.schema !== 'mp-browser-explore-v1') errors.push(`unexpected schema ${report.schema}`);
  if (report.head_sha !== expectedHead) errors.push(`exploration is for ${report.head_sha}, not the PR head ${expectedHead}`);
  if (!SHA.test(report.tested_commit || '')) errors.push('tested_commit is not a full SHA');
  if (expectedCommit && report.tested_commit !== expectedCommit) errors.push(`exploration tested ${report.tested_commit}, not the checked-out commit ${expectedCommit}`);
  if (gitDir && expectedCommit && !containsHead(gitDir, expectedHead, expectedCommit)) errors.push(`the tested commit ${expectedCommit} does not contain the PR head ${expectedHead}`);
  if (report.injected_defect !== false) errors.push('the run used a test hook (injected defect): not valid evidence');
  if (Number.isNaN(Date.parse(report.generated_at)) || Date.parse(report.generated_at) > now.getTime() + 10 * 60e3) errors.push('generated_at missing or in the future');
  const manifest = checkManifest(dir, report.files, 'exploration.json');
  errors.push(...manifest.errors);
  const {listed} = manifest;

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const ids = new Set();
  for (const finding of findings) {
    const at = `finding ${finding.id}`;
    if (ids.has(finding.id)) errors.push(`${at} reported twice`);
    ids.add(finding.id);
    if (!FINDING_KINDS.includes(finding.kind)) errors.push(`${at} has unknown kind ${finding.kind}`);
    if (!Array.isArray(finding.steps) || finding.steps[0]?.type !== 'goto') errors.push(`${at} has no replayable sequence`);
    if (!listed(finding.screenshot)) errors.push(`${at} screenshot not in the evidence`);
    if (typeof finding.reproduced !== 'boolean') errors.push(`${at} reproduction not attempted`);
  }
  const trails = Array.isArray(report.trails) ? report.trails : [];
  if (!trails.length) errors.push('no exploration trails');
  for (const trail of trails) {
    if (!/^[0-9a-f]{64}$/.test(trail.sha256 || '')) errors.push(`trail ${trail.route}/${trail.viewport} without a SHA-256`);
    for (const label of ['open', 'end']) {
      if (!(report.observations ?? []).some(item => item.route === trail.route && item.viewport === trail.viewport && item.label === label && listed(item.file) && listed(item.screenshot))) {
        errors.push(`observation ${label} missing for ${trail.route}/${trail.viewport}`);
      }
    }
  }
  const actions = trails.reduce((sum, trail) => sum + trail.actions, 0);
  const totals = {findings: findings.length, reproduced: findings.filter(finding => finding.reproduced === true).length};
  if (report.totals?.actions !== actions) errors.push(`totals.actions ${report.totals?.actions} does not match the trails (${actions})`);
  if (report.totals?.findings !== totals.findings || report.totals?.reproduced !== totals.reproduced) errors.push('totals do not match the findings');
  for (const secret of findSecrets(report)) errors.push(`secret-like value at ${secret}`);
  return {ok: errors.length === 0, errors, report};
}

export function verifyAiReview(dir, reviewPath, {expectedHead} = {}) {
  const errors = [];
  if (!existsSync(reviewPath)) return {ok: false, errors: ['ai review missing'], verdict: null};
  let review;
  try { review = JSON.parse(readFileSync(reviewPath, 'utf8')); } catch { return {ok: false, errors: ['ai review is not valid JSON'], verdict: null}; }
  const explorationPath = join(dir, 'exploration.json');
  let exploration = null;
  try { exploration = JSON.parse(readFileSync(explorationPath, 'utf8')); } catch { /* reported below */ }
  if (!exploration) return {ok: false, errors: ['exploration.json missing or not valid JSON'], verdict: null};
  if (review.schema !== 'mp-browser-ai-review-v1') errors.push(`unexpected schema ${review.schema}`);
  if (review.exploration_sha256 !== sha256(readFileSync(explorationPath))) errors.push('the review is not about this exploration bundle');
  if (review.head_sha !== expectedHead || review.head_sha !== exploration.head_sha) errors.push('the review is not about this head');
  if (!String(review.reviewer?.kind || '').trim()) errors.push('reviewer not identified');
  const observed = new Set((exploration.observations ?? []).map(item => item.file));
  const reviewed = new Set(review.observations_reviewed ?? []);
  const notReviewed = Object.assign(Object.create(null), review.observations_not_reviewed ?? {});
  for (const file of observed) {
    if (!reviewed.has(file) && !String(notReviewed[file] ?? '').trim()) errors.push(`observation ${file} neither reviewed nor excused`);
  }
  for (const file of reviewed) if (!observed.has(file)) errors.push(`reviewed observation ${file} is not in the bundle`);
  const findings = Array.isArray(review.findings) ? review.findings : [];
  for (const crawler of (exploration.findings ?? []).filter(finding => finding.reproduced)) {
    if (!findings.some(item => item.source === 'crawler' && item.ref === crawler.id)) errors.push(`reproduced crawler finding ${crawler.id} not triaged`);
  }
  for (const finding of findings) {
    const at = `review finding ${finding.id}`;
    if (!['crawler', 'ai'].includes(finding.source)) errors.push(`${at} has unknown source`);
    if (!CLASSIFICATIONS.includes(finding.classification)) errors.push(`${at} has invalid classification ${finding.classification}`);
    if (finding.classification === 'BUG' && !SEVERITIES.includes(finding.severity)) errors.push(`${at} BUG without severity P0–P3`);
    if (finding.classification === 'NOT_A_DEFECT' && !String(finding.reason || '').trim()) errors.push(`${at} NOT_A_DEFECT without a reason`);
    // A confirmed defect becomes a regression test (MP-OWNER-QA-VISUAL-EXECUTION-01): FIXED names it.
    if (finding.status === 'FIXED' && !String(finding.regression_test || '').trim()) errors.push(`${at} FIXED without a regression test`);
    if (!String(finding.summary || '').trim()) errors.push(`${at} without a summary`);
    for (const file of finding.evidence ?? []) if (!observed.has(file) && !Object.hasOwn(exploration.files ?? {}, file)) errors.push(`${at} cites ${file}, not in the bundle`);
  }
  const blocking = findings.some(finding => finding.classification === 'BUG' && ['P0', 'P1'].includes(finding.severity) && finding.status !== 'FIXED');
  const verdict = blocking ? 'BLOCKING' : 'NO_BLOCKING';
  if (review.verdict !== verdict) errors.push(`declared verdict ${review.verdict} but the findings give ${verdict}`);
  for (const secret of findSecrets(review)) errors.push(`secret-like value at ${secret}`);
  return {ok: errors.length === 0, errors, verdict};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
  const dir = args[0];
  if (!dir || dir.startsWith('--')) { console.error('usage: verify-exploration.mjs <dir> --head <sha> [--commit <sha>] [--review <file>]'); process.exit(2); }
  const result = verifyExploration(dir, {expectedHead: opt('head'), expectedCommit: opt('commit') ?? null, gitDir: process.cwd()});
  const review = opt('review') ? verifyAiReview(dir, opt('review'), {expectedHead: opt('head')}) : null;
  console.log(JSON.stringify({ok: result.ok, errors: result.errors, totals: result.report?.totals ?? null,
    ai_review: review ? {ok: review.ok, verdict: review.verdict, errors: review.errors} : {status: 'NOT_VERIFIED'}}, null, 2));
  process.exit(result.ok && (!review || review.ok) ? 0 : 1);
}
