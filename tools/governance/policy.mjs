// Owner policies as executable checks: MP-OWNER-AUTOMERGE-01/-02/-03 merge gate and
// MP-OWNER-CERT-ISSUE-CLOSURE-01 auto-closing keyword guard.
import {ELIGIBLE, OWNER_GO} from './merge-class.mjs';

// GitHub closing keywords followed by an issue reference (#N, owner/repo#N or an issue URL).
// Fail closed: tolerate emphasis markers, a colon, missing spaces and parentheses around the reference.
// Letter boundaries (not \b) so that underscores used for emphasis do not hide the keyword; a markdown link
// bracket or a code-span backtick before the reference is tolerated too (#151 review R-3).
const CLOSING = /(?<![A-Za-z0-9])(close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?![A-Za-z0-9])[*_]*\s*:?\s*[*_]*\s*(?:[(\[`<]\s*)*(?:[\w.-]+\/[\w.-]+#\d+|#\d+|https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)/gi;

export function findClosingReferences(text) {
  return [...String(text || '').matchAll(CLOSING)].map(match => match[0]);
}

const required = {
  scope_authorized: 'scope not authorized',
  gate_a: 'Gate A is not PASS',
  gate_b: 'Gate B is not PASS',
  mandatory_tests: 'mandatory tests are not PASS',
  ci: 'GitHub Actions are not green',
  branch_protection: 'branch protection not satisfied',
};

// Returns whether an agent may merge now. Every condition must be explicitly satisfied; unknown means no.
export function evaluateMergeGate(input) {
  const reasons = [];
  if (input.pr_state === 'merged') return {allowed: false, action: 'noop', reasons: ['PR already merged']};
  if (input.pr_state !== 'open') reasons.push(`PR is ${input.pr_state ?? 'unknown'}`);
  for (const [key, message] of Object.entries(required)) {
    const value = input[key];
    if (!(value === true || value === 'PASS' || value === 'SUCCESS')) reasons.push(message);
  }
  // MP-OWNER-AUTOMERGE-02: a technical review by an agent in a session separate from the developer session is enough for
  // an ordinary PR; it is recorded as such and never presented as an independent GitHub approval.
  const review = input.review || {};
  if (review.verdict !== 'APPROVED') reasons.push(`technical review is ${review.verdict ?? 'missing'}`);
  if (review.verdict === 'APPROVED') {
    if (review.independent !== true && review.separate_session !== true) reasons.push('reviewer is not independent from the implementer nor a separate session');
    if (!review.reference) reasons.push('review is not recorded on GitHub');
    if (!input.head_sha || review.reviewed_sha !== input.head_sha) reasons.push('review does not cover the current head');
  }
  if (!Number.isInteger(input.blocking_findings) || input.blocking_findings > 0) reasons.push('blocking findings are open or unknown');
  if (!Number.isInteger(input.owner_conflicts) || input.owner_conflicts > 0) reasons.push('owner conflicts are open or unknown');
  // MP-OWNER-AUTOMERGE-03: the classifier of the BASE commit decides; an owner-only PR needs the owner's GO on this head.
  if (input.merge_class === OWNER_GO) {
    const go = input.owner_go || {};
    if (!go.reference || !input.head_sha || go.sha !== input.head_sha) reasons.push('owner GO required for this PR and not recorded for the current head');
  } else if (input.merge_class !== ELIGIBLE) reasons.push('merge class unknown (run the classifier of the base commit)');
  // The only external operation a merge may carry is the automatic VPS deploy of main (MP-OWNER-VPS-DEPLOY-01), and only
  // once the GitHub -> VPS path is certified and the last deploy of main succeeded: a failed or unverified deploy stops
  // every further merge. Anything else (Render, Neon, collectors, LIVE, costs) always blocks.
  const operations = Array.isArray(input.external_operations) ? input.external_operations : null;
  if (!operations) reasons.push('external operations are unknown');
  else {
    if (operations.some(operation => operation !== 'vps_deploy_main')) reasons.push('merge would involve deploy, cost, production or LIVE operations');
    if (operations.includes('vps_deploy_main')) {
      if (input.deploy_path_certified !== true) reasons.push('the GitHub -> VPS deploy path is not certified');
      const last = input.last_main_deploy || {};
      if (last.conclusion !== 'success' || !last.sha || last.sha !== input.base_sha) reasons.push('the last deploy of main did not succeed on the current base (merges are stopped)');
    }
  }
  // Browser QA Gate (MP-OWNER-BROWSER-QA-HARD-GATE-01): WEB CHANGE + NO VERIFIED BROWSER QA = MERGE BLOCKED. The web
  // impact comes from the CI classifier (never from the agent), and the evidence must be the verified CI run on this head.
  if (typeof input.web_impact !== 'boolean') reasons.push('web impact is unknown (take it from the CI classifier)');
  if (input.web_impact === true) {
    const qa = input.browser_qa || {};
    if (qa.verdict !== 'PASS') reasons.push(`browser QA is ${qa.verdict ?? 'missing'}`);
    if (qa.verified !== true) reasons.push('browser QA evidence was not verified by tools/qa/verify-report.mjs');
    if (!input.head_sha || qa.head_sha !== input.head_sha) reasons.push('browser QA does not cover the current head');
    if (!Number.isInteger(qa.ci_run_id)) reasons.push('browser QA has no CI run with its artifact');
  }
  const closing = findClosingReferences([input.title, input.body, ...(input.commit_messages || [])].join('\n'));
  if (closing.length) reasons.push(`auto-closing references present: ${closing.join(', ')}`);
  return {allowed: reasons.length === 0, action: reasons.length ? 'block' : 'merge', reasons};
}
