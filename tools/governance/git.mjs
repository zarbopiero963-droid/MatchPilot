// Real repository state for reconciliation. Uses the local git, never the checkpoint's own claims.
import {execFileSync} from 'node:child_process';

const git = (cwd, args) => {
  try { return execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim(); }
  catch { return null; }
};

export function resolveBranchHead(cwd, branch) {
  for (const ref of [`refs/remotes/origin/${branch}`, `refs/heads/${branch}`]) {
    const sha = git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    if (sha) return sha;
  }
  return null;
}

export const treeOf = (cwd, sha) => git(cwd, ['rev-parse', '--verify', '--quiet', `${sha}^{tree}`]);
export const commitExists = (cwd, sha) => git(cwd, ['cat-file', '-e', `${sha}^{commit}`]) !== null;

export function isAncestor(cwd, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {cwd, stdio: 'ignore'});
    return true;
  } catch { return false; }
}

export function commitMessages(cwd, base, head) {
  const out = git(cwd, ['log', '--format=%B%x00', `${base}..${head}`]);
  return out === null ? null : out.split('\0').map(text => text.trim()).filter(Boolean);
}

const parseNameStatus = out => out.split('\n').filter(Boolean).map(line => {
  const [status, file] = line.split('\t');
  return {status: status[0], file};
});

// Changed paths with their git status letter (A added, M modified, D deleted), commit by commit
// (a cumulative diff reports "added then rewritten" as a plain addition), including what merge
// commits change against their first parent, plus the cumulative diff from base (#151 review R-1).
export function changedFiles(cwd, base, head) {
  const perCommit = git(cwd, ['log', '--diff-merges=first-parent', '--name-status', '--no-renames', '--format=', `${base}..${head}`]);
  const cumulative = git(cwd, ['diff', '--name-status', '--no-renames', base, head]);
  if (perCommit === null || cumulative === null) return null;
  return [...parseNameStatus(perCommit), ...parseNameStatus(cumulative)];
}

// Checkpoints are append-only: any change other than an addition to docs/governance/checkpoints/ is a rewrite,
// and so is a path that is "added" with two different contents within the range (e.g. added on a side branch,
// then rewritten in the merge commit: #152 review N-2).
export function rewrittenCheckpoints(cwd, base, head) {
  const changes = changedFiles(cwd, base, head);
  const raw = git(cwd, ['log', '--diff-merges=first-parent', '--raw', '--no-abbrev', '--no-renames', '--format=', `${base}..${head}`]);
  if (changes === null || raw === null) return null;
  const isCheckpoint = file => file.startsWith('docs/governance/checkpoints/');
  const rewritten = changes.filter(({status, file}) => isCheckpoint(file) && status !== 'A');
  const blobs = new Map();
  for (const line of raw.split('\n').filter(Boolean)) {
    const [meta, file] = line.split('\t');
    if (!isCheckpoint(file)) continue;
    const newBlob = meta.split(' ')[3];
    blobs.set(file, new Set([...(blobs.get(file) || []), newBlob]));
  }
  for (const [file, set] of blobs) if (set.size > 1) rewritten.push({status: 'M', file});
  return rewritten;
}

// Reality for one checkpoint: branch head, ancestry, tree and files changed after the checkpoint.
export function realityFor(cwd, cp) {
  const branchHead = resolveBranchHead(cwd, cp.branch);
  const checkpointIsAncestor = branchHead !== null && commitExists(cwd, cp.commit_sha) && isAncestor(cwd, cp.commit_sha, branchHead);
  return {
    branchHead,
    checkpointIsAncestor,
    changedSinceCheckpoint: checkpointIsAncestor && branchHead !== cp.commit_sha ? changedFiles(cwd, cp.commit_sha, branchHead) : [],
    treeSha: branchHead === cp.commit_sha ? treeOf(cwd, branchHead) : null,
  };
}
