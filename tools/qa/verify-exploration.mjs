#!/usr/bin/env node
// Verifier for the exploratory level (MP-OWNER-BROWSER-QA-HARD-GATE-01, QA-02). Two separate evidences, never mixed:
//
// A. The deterministic crawler bundle (tools/qa/explore.mjs, exploration.json):
//    - schema; head_sha is the PR head and tested_commit the checked-out commit, which contains the head;
//    - the manifest (shared rules with the gate verifier): every file present and unchanged, nothing unlisted;
//    - no test hook (injected defect) in an evidence run;
//    - every finding has a known kind, a replayable sequence that starts by opening a route, a listed screenshot and a
//      boolean reproduction result; totals equal the findings and the trails;
//    - every declared route ran on every declared viewport, once, with the declared number of actions; each trail (the
//      SHA-256 of its action sequence) has open/end observations; clean working tree;
//    - a malformed file is an error, never a crash.
//
// B. The AI review of that bundle (ai-review.json), made by a Claude agent in an authorized session, never by a paid
//    API in CI:
//    - it names the exact bundle (SHA-256 of exploration.json) and the same head;
//    - its reviewer is a Claude agent in an authorized session (REVIEWER_KINDS, with the session);
//    - it states which observations it reviewed: at most 25% excused with a reason, one reviewed per route and viewport;
//    - every reproduced crawler finding is triaged; every finding has a classification from
//      MP-OWNER-PRODUCT-QUALITY-DATA-01 (BUG, DATA_MISSING, DATA_QUALITY_ISSUE, NOT_VERIFIED, BLOCKED, NOT_A_DEFECT; all but
//      BUG with a reason), for a BUG a severity P0–P3, and a status OPEN, FIXED or DEFERRED;
//    - FIXED names an existing regression test; only a P2/P3 may be DEFERRED, with reason, impact and follow-up, and an
//      open P2/P3 BUG must be one of the two;
//    - its verdict is computed: BLOCKING when an open P0/P1 BUG exists.
//    The review file lives outside the bundle directory (the bundle manifest would refuse an unlisted file).
//
// Usage: node tools/qa/verify-exploration.mjs <dir> --head <sha> [--commit <sha>] [--review <ai-review.json> [--base <ref>]]
import {existsSync, readFileSync, statSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findSecrets} from '../governance/secrets.mjs';
import {checkManifest, containsHead} from './verify-report.mjs';
import {git, sha256} from './browser-qa.mjs';
import {REQUIRED_VIEWPORTS} from './journeys.mjs';

const SHA = /^[0-9a-f]{40}$/;
export const FINDING_KINDS = ['js-error', 'console-error', 'http-5xx', 'request-failed', 'stuck-loading', 'blank-view', 'invariant'];
export const CLASSIFICATIONS = ['BUG', 'DATA_MISSING', 'DATA_QUALITY_ISSUE', 'NOT_VERIFIED', 'BLOCKED', 'NOT_A_DEFECT'];
export const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = value => Array.isArray(value) ? value.filter(isObject) : [];
const text = value => typeof value === 'string' && value.trim() !== '';
// Reviewers allowed to sign an AI review: a Claude agent in an authorized session. Never an API call from CI.
export const REVIEWER_KINDS = ['claude-code-session'];
export const STATUSES = ['OPEN', 'FIXED', 'DEFERRED'];
// At most this share of the observations may be excused, and every route and viewport needs one reviewed observation.
export const MAX_EXCUSED_SHARE = 0.25;

function readJson(path, name) {
  if (!existsSync(path)) return {error: `${name} missing`};
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return isObject(value) ? {value} : {error: `${name} is not a JSON object`};
  } catch {
    return {error: `${name} is not valid JSON`};
  }
}

export function verifyExploration(dir, {expectedHead, expectedCommit = null, gitDir = null, now = new Date()} = {}) {
  const errors = [];
  const fail = message => ({ok: false, errors: [...errors, message], report: null});
  if (!SHA.test(expectedHead || '')) return fail('expected head SHA missing or not a full SHA');
  const {value: report, error} = readJson(join(dir, 'exploration.json'), 'exploration.json');
  if (error) return fail(error);
  if (report.schema !== 'mp-browser-explore-v1') errors.push(`unexpected schema ${report.schema}`);
  if (report.head_sha !== expectedHead) errors.push(`exploration is for ${report.head_sha}, not the PR head ${expectedHead}`);
  if (!SHA.test(report.tested_commit || '')) errors.push('tested_commit is not a full SHA');
  if (expectedCommit && report.tested_commit !== expectedCommit) errors.push(`exploration tested ${report.tested_commit}, not the checked-out commit ${expectedCommit}`);
  if (gitDir && expectedCommit && !containsHead(gitDir, expectedHead, expectedCommit)) errors.push(`the tested commit ${expectedCommit} does not contain the PR head ${expectedHead}`);
  if (report.working_tree_clean !== true) errors.push('the run was made on a modified working tree');
  if (report.injected_defect !== false) errors.push('the run used a test hook (injected defect): not valid evidence');
  if (report.restricted !== false) errors.push('the run was restricted to some routes (test run): not valid evidence');
  if (Number.isNaN(Date.parse(report.generated_at)) || Date.parse(report.generated_at) > now.getTime() + 10 * 60e3) errors.push('generated_at missing or in the future');
  const manifest = checkManifest(dir, report.files, 'exploration.json');
  errors.push(...manifest.errors);
  const {listed} = manifest;

  if (!Array.isArray(report.findings) || !Array.isArray(report.trails) || !Array.isArray(report.observations)) errors.push('findings, trails and observations must be lists');
  const findings = list(report.findings);
  const trails = list(report.trails);
  const observations = list(report.observations);
  if (findings.length !== (report.findings?.length ?? 0) || trails.length !== (report.trails?.length ?? 0) || observations.length !== (report.observations?.length ?? 0)) errors.push('malformed entries in findings, trails or observations');
  const ids = new Set();
  for (const finding of findings) {
    const at = `finding ${finding.id}`;
    if (ids.has(finding.id)) errors.push(`${at} reported twice`);
    ids.add(finding.id);
    if (!FINDING_KINDS.includes(finding.kind)) errors.push(`${at} has unknown kind ${finding.kind}`);
    if (!Array.isArray(finding.steps) || !isObject(finding.steps[0]) || finding.steps[0].type !== 'goto') errors.push(`${at} has no replayable sequence`);
    if (!listed(finding.screenshot)) errors.push(`${at} screenshot not in the evidence`);
    if (typeof finding.reproduced !== 'boolean') errors.push(`${at} reproduction not attempted`);
  }
  // Coverage: every declared route ran on every declared viewport, with the declared number of actions.
  const routes = Array.isArray(report.routes) ? report.routes : [];
  const viewports = Array.isArray(report.viewports) ? report.viewports : [];
  if (!routes.length) errors.push('no declared routes');
  // Desktop and mobile are both required, and nothing else is a viewport.
  for (const viewport of REQUIRED_VIEWPORTS) if (!viewports.includes(viewport)) errors.push(`required viewport ${viewport} not explored`);
  for (const viewport of viewports) if (!REQUIRED_VIEWPORTS.includes(viewport)) errors.push(`unknown viewport ${viewport}`);
  if (!Number.isInteger(report.actions_per_route) || report.actions_per_route < 1) errors.push('actions_per_route is not a positive integer');
  for (const route of routes) for (const viewport of viewports) {
    const matching = trails.filter(trail => trail.route === route && trail.viewport === viewport);
    if (matching.length !== 1) errors.push(`route ${route}/${viewport} has ${matching.length} trails, not 1`);
  }
  for (const trail of trails) {
    if (!routes.includes(trail.route) || !viewports.includes(trail.viewport)) errors.push(`trail ${trail.route}/${trail.viewport} is not a declared route and viewport`);
    if (trail.actions !== report.actions_per_route) errors.push(`trail ${trail.route}/${trail.viewport} ran ${trail.actions} actions, not ${report.actions_per_route}`);
    if (!/^[0-9a-f]{64}$/.test(trail.sha256 || '')) errors.push(`trail ${trail.route}/${trail.viewport} without a SHA-256`);
    for (const label of ['open', 'end']) {
      if (!observations.some(item => item.route === trail.route && item.viewport === trail.viewport && item.label === label && listed(item.file) && listed(item.screenshot))) {
        errors.push(`observation ${label} missing for ${trail.route}/${trail.viewport}`);
      }
    }
  }
  const actions = trails.reduce((sum, trail) => sum + (Number.isInteger(trail.actions) ? trail.actions : 0), 0);
  const totals = {findings: findings.length, reproduced: findings.filter(finding => finding.reproduced === true).length};
  if (report.totals?.actions !== actions) errors.push(`totals.actions ${report.totals?.actions} does not match the trails (${actions})`);
  if (report.totals?.findings !== totals.findings || report.totals?.reproduced !== totals.reproduced) errors.push('totals do not match the findings');
  for (const secret of findSecrets(report)) errors.push(`secret-like value at ${secret}`);
  return {ok: errors.length === 0, errors, report};
}

// A FIXED finding names its regression test: a test file of the repository, or the journeys of the gate.
function regressionTestExists(repoDir, path) {
  if (!text(path) || path.includes('..') || path.startsWith('/')) return false;
  if (!/^test\/.+\.test\.mjs$/.test(path) && path !== 'tools/qa/journeys.mjs') return false;
  const full = join(repoDir, path);
  return existsSync(full) && statSync(full).isFile();
}

// changedFiles: the files the fixing change touched (from --base); when given, a FIXED finding's regression test must be
// one of them, so it was written or changed with the fix and is not an unrelated existing test.
export function verifyAiReview(dir, reviewPath, {expectedHead, repoDir = process.cwd(), changedFiles = null} = {}) {
  const errors = [];
  const {value: review, error: reviewError} = readJson(reviewPath, 'ai review');
  if (reviewError) return {ok: false, errors: [reviewError], verdict: null};
  const explorationPath = join(dir, 'exploration.json');
  const {value: exploration, error} = readJson(explorationPath, 'exploration.json');
  if (error) return {ok: false, errors: [error], verdict: null};
  if (review.schema !== 'mp-browser-ai-review-v1') errors.push(`unexpected schema ${review.schema}`);
  if (review.exploration_sha256 !== sha256(readFileSync(explorationPath))) errors.push('the review is not about this exploration bundle');
  if (review.head_sha !== expectedHead || review.head_sha !== exploration.head_sha) errors.push('the review is not about this head');
  if (!REVIEWER_KINDS.includes(review.reviewer?.kind) || !text(review.reviewer?.session)) errors.push('reviewer not identified as a Claude agent in an authorized session');

  // Observations: reviewed, or excused with a reason; excuses are bounded and every route/viewport has a reviewed one.
  const observations = list(exploration.observations);
  const observed = new Set(observations.map(item => item.file));
  const reviewed = new Set(Array.isArray(review.observations_reviewed) ? review.observations_reviewed : []);
  const notReviewed = Object.assign(Object.create(null), isObject(review.observations_not_reviewed) ? review.observations_not_reviewed : {});
  let excused = 0;
  for (const file of observed) {
    if (reviewed.has(file)) continue;
    if (text(notReviewed[file])) excused++;
    else errors.push(`observation ${file} neither reviewed nor excused`);
  }
  for (const file of reviewed) if (!observed.has(file)) errors.push(`reviewed observation ${file} is not in the bundle`);
  if (!observed.size) errors.push('the bundle has no observations to review');
  if (excused > observed.size * MAX_EXCUSED_SHARE) errors.push(`${excused} of ${observed.size} observations excused: more than ${MAX_EXCUSED_SHARE * 100}%`);
  for (const pair of new Set(observations.map(item => `${item.route}|${item.viewport}`))) {
    if (!observations.some(item => `${item.route}|${item.viewport}` === pair && reviewed.has(item.file))) errors.push(`no observation reviewed for ${pair.replace('|', '/')}`);
  }

  // Findings: every reproduced crawler finding triaged; every finding classified, justified and tracked.
  if (!Array.isArray(review.findings)) errors.push('findings must be a list');
  const findings = list(review.findings);
  if (Array.isArray(review.findings) && findings.length !== review.findings.length) errors.push('malformed review findings');
  const crawlerIds = new Set(list(exploration.findings).map(item => item.id));
  for (const crawler of list(exploration.findings).filter(finding => finding.reproduced === true)) {
    if (!findings.some(item => item.source === 'crawler' && item.ref === crawler.id)) errors.push(`reproduced crawler finding ${crawler.id} not triaged`);
  }
  const ids = new Set();
  for (const finding of findings) {
    const at = `review finding ${finding.id}`;
    if (!text(finding.id) || ids.has(finding.id)) errors.push(`${at} id missing or repeated`);
    ids.add(finding.id);
    if (!['crawler', 'ai'].includes(finding.source)) errors.push(`${at} has unknown source`);
    if (finding.source === 'crawler' && !crawlerIds.has(finding.ref)) errors.push(`${at} refers to ${finding.ref}, not a crawler finding of the bundle`);
    if (!CLASSIFICATIONS.includes(finding.classification)) errors.push(`${at} has invalid classification ${finding.classification}`);
    if (finding.classification !== 'BUG' && !text(finding.reason)) errors.push(`${at} ${finding.classification} without a reason`);
    if (finding.classification === 'BUG' && !SEVERITIES.includes(finding.severity)) errors.push(`${at} BUG without severity P0–P3`);
    if (!STATUSES.includes(finding.status)) errors.push(`${at} has invalid status ${finding.status}`);
    // A confirmed defect becomes a regression test (MP-OWNER-QA-VISUAL-EXECUTION-01): FIXED names one that exists.
    if (finding.status === 'FIXED' && !regressionTestExists(repoDir, finding.regression_test)) errors.push(`${at} FIXED without an existing regression test`);
    else if (finding.status === 'FIXED' && changedFiles && !changedFiles.includes(finding.regression_test)) errors.push(`${at} FIXED with ${finding.regression_test}, not changed by the fix`);
    // P2/P3 may be deferred only with reason, impact and follow-up (MP-OWNER-PRODUCT-QUALITY-DATA-01); P0/P1 never.
    if (finding.status === 'DEFERRED') {
      if (finding.classification === 'BUG' && !['P2', 'P3'].includes(finding.severity)) errors.push(`${at} a ${finding.severity} BUG cannot be deferred`);
      if (!text(finding.reason) || !text(finding.impact) || !text(finding.follow_up)) errors.push(`${at} DEFERRED without reason, impact and follow_up`);
    }
    if (finding.classification === 'BUG' && finding.status === 'OPEN' && ['P2', 'P3'].includes(finding.severity)) errors.push(`${at} open ${finding.severity} BUG: fix it or defer it with reason, impact and follow_up`);
    if (!text(finding.summary)) errors.push(`${at} without a summary`);
    for (const file of Array.isArray(finding.evidence) ? finding.evidence : []) {
      if (!observed.has(file) && !Object.hasOwn(isObject(exploration.files) ? exploration.files : {}, file)) errors.push(`${at} cites ${file}, not in the bundle`);
    }
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
  if (!dir || dir.startsWith('--')) { console.error('usage: verify-exploration.mjs <dir> --head <sha> [--commit <sha>] [--review <file> [--base <ref>]]'); process.exit(2); }
  const result = verifyExploration(dir, {expectedHead: opt('head'), expectedCommit: opt('commit') ?? null, gitDir: process.cwd()});
  const changedFiles = opt('base') ? git(['diff', '--name-only', '--no-renames', `${opt('base')}...HEAD`]).split('\n').filter(Boolean) : null;
  const review = opt('review') ? verifyAiReview(dir, opt('review'), {expectedHead: opt('head'), changedFiles}) : null;
  console.log(JSON.stringify({ok: result.ok, errors: result.errors, totals: result.report?.totals ?? null,
    ai_review: review ? {ok: review.ok, verdict: review.verdict, errors: review.errors} : {status: 'NOT_VERIFIED'}}, null, 2));
  process.exit(result.ok && (!review || review.ok) ? 0 : 1);
}
