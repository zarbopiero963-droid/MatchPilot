// PR state evidence for handoff-in (MP-PR183-HARDENING-01): the tool reads the pull request from the GitHub REST API
// itself, so the state is never a value typed by the agent. curl is used because it honours the HTTPS proxy settings
// of every environment; it runs with fixed arguments and no shell. The repository is public: no token is sent, so none
// can leak. Any failure is returned as an error and handoff-in stops (fail closed).
import {execFileSync} from 'node:child_process';

const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function curlJson(url) {
  return execFileSync('curl', ['-sS', '--fail', '--max-time', '20', '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: matchpilot-governance', url],
    {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
}

// Returns {evidence} or {error}; `run` is injectable for tests.
export function readPullRequest({repository, number, now = new Date(), base = 'https://api.github.com', run = curlJson}) {
  if (!REPOSITORY.test(repository || '') || !Number.isInteger(number) || number <= 0) return {error: `invalid PR reference ${repository}#${number}`};
  const url = `${base}/repos/${repository}/pulls/${number}`;
  let body;
  try { body = JSON.parse(run(url)); } catch (error) { return {error: `GitHub read failed: ${String(error?.message ?? error).split('\n')[0]}`}; }
  if (body?.number !== number) return {error: `GitHub answered PR ${body?.number}, not ${number}`};
  const state = body.merged === true || body.merged_at ? 'merged' : body.state;
  return {evidence: {source: 'github-api', url, number, state, head_sha: body.head?.sha ?? null, fetched_at: now.toISOString().replace(/\.\d{3}Z$/, 'Z')}};
}
