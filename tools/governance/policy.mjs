// Owner policies as executable checks: MP-OWNER-AUTOMERGE-01 merge gate and
// MP-OWNER-CERT-ISSUE-CLOSURE-01 auto-closing keyword guard.

// GitHub closing keywords followed by an issue reference (#N, owner/repo#N or an issue URL).
// Fail closed: tolerate emphasis markers, a colon, missing spaces and parentheses around the reference.
// Letter boundaries (not \b) so that underscores used for emphasis do not hide the keyword; a markdown link
// bracket or a code-span backtick before the reference is tolerated too (#151 review R-3).
const CLOSING = /(?<![A-Za-z0-9])(close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?![A-Za-z0-9])[*_]*\s*:?\s*[*_]*\s*[(\[`]?\s*(?:[\w.-]+\/[\w.-]+#\d+|#\d+|https?:\/\/(?:www\.)?github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)/gi;

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
  const review = input.review || {};
  if (review.verdict !== 'APPROVED') reasons.push(`independent review is ${review.verdict ?? 'missing'}`);
  if (review.verdict === 'APPROVED') {
    if (review.independent !== true) reasons.push('reviewer is not independent from the implementer');
    if (!review.reference) reasons.push('review is not recorded on GitHub');
    if (!input.head_sha || review.reviewed_sha !== input.head_sha) reasons.push('review does not cover the current head');
  }
  if (!Number.isInteger(input.blocking_findings) || input.blocking_findings > 0) reasons.push('blocking findings are open or unknown');
  if (!Number.isInteger(input.owner_conflicts) || input.owner_conflicts > 0) reasons.push('owner conflicts are open or unknown');
  if (!Array.isArray(input.external_operations) || input.external_operations.length) reasons.push('merge would involve deploy, cost, production or LIVE operations');
  const closing = findClosingReferences([input.title, input.body, ...(input.commit_messages || [])].join('\n'));
  if (closing.length) reasons.push(`auto-closing references present: ${closing.join(', ')}`);
  return {allowed: reasons.length === 0, action: reasons.length ? 'block' : 'merge', reasons};
}
