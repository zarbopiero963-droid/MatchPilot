// Secret-like value detection for governance artefacts (checkpoints, registry). Returns JSON paths, never values.
const PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /\bsk-[A-Za-z0-9_-]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b\d{8,10}:[A-Za-z0-9_-]{35}\b/,
  /postgres(?:ql)?:\/\/[^:/\s]+:[^@\s]+@(?!127\.0\.0\.1|localhost|\[::1\])/i,
];
const SENSITIVE_KEY = /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)s?$/i;

export function findSecrets(value, path = '$') {
  if (typeof value === 'string') return PATTERNS.some(re => re.test(value)) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((item, i) => findSecrets(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      const here = `${path}.${key}`;
      if (SENSITIVE_KEY.test(key) && typeof item === 'string' && item.length) return [here];
      return findSecrets(item, here);
    });
  }
  return [];
}
