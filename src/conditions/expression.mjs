// MP-CAP-03 (#263, MP-OWNER-IMPL-20261101 item 5): universal filter conditions with AND, OR and NOT, built on the
// capability catalog (src/capabilities/catalog.mjs) instead of a fixed list of markets or filters. A pure module: no
// route, no database, no consumer yet.
//
// An expression is a tree:
//   {all: [node, ...]}  every child holds (AND)
//   {any: [node, ...]}  at least one child holds (OR)
//   {not: node}         negation
//   {field: '<capability id>', op: '<operator>', value?: ...}
// A condition names a capability by its stable id; the operator must be one the capability offers, and the value must
// fit its value type. Numbers are compared as exact decimals (src/math/decimal.mjs), never as binary floats.
//
// Missing data is not false: a condition on a value that is absent or unreadable is UNKNOWN, and AND, OR and NOT
// follow three-valued logic (Kleene). A record is selected only when the whole expression is TRUE, so NOT never turns
// missing data into a match.
//
// PIT: pitViolations() lists the conditions a decision before kickoff may not use (MP-PIT-TIMING-01: only identity and
// market capabilities are known before kickoff). No new timing class is introduced.
import { Decimal } from '../math/decimal.mjs';

export const EXPRESSION_VERSION = 'mp-expr-1';
export const LIMITS = Object.freeze({depth: 8, nodes: 200, children: 50, inValues: 100, text: 200});
export const RESULTS = Object.freeze(['TRUE', 'FALSE', 'UNKNOWN']);
const PREMATCH_TIMINGS = new Set(['PREMATCH_IDENTITY', 'PREMATCH_MARKET_UNTIMED']);

export class ExpressionError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = 'ExpressionError';
    this.code = 'BAD_EXPRESSION';
    this.path = path;
  }
}

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const DECIMAL = /^[+-]?\d{1,15}(\.\d{1,12})?$/;
const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
// A calendar check on the instant as written: 2026-02-30 or 24:00 are refused, never rolled over to another date.
function validCalendar(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!m) return false;
  const [y, mo, d, h, mi, se = '0'] = m.slice(1).map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days && h <= 23 && mi <= 59 && se <= 59;
}
const isInstant = text => typeof text === 'string' && ISO_WITH_OFFSET.test(text) && validCalendar(text) && Number.isFinite(Date.parse(text));
const printable = text => typeof text === 'string' && text.length <= LIMITS.text && !/[\p{Cc}\p{Cf}]/u.test(text);

// The catalog as a lookup by id: a buildCatalog() result, a list of capabilities or a Map.
function lookup(catalog) {
  if (catalog instanceof Map) return catalog;
  const list = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.capabilities) ? catalog.capabilities : null;
  if (!list) throw new TypeError('a capability catalog is required');
  return new Map(list.filter(c => c && typeof c.id === 'string').map(c => [c.id, c]));
}

// A condition value in its canonical form for the capability's value type, or an error.
function scalar(valueType, value, path) {
  if (valueType === 'integer') {
    if (Number.isSafeInteger(value)) return String(value);
    if (typeof value === 'string' && /^[+-]?\d{1,15}$/.test(value)) return Decimal.from(value).toString();
    throw new ExpressionError(path, 'must be an integer (number or integer text)');
  }
  if (valueType === 'number') {
    if (Number.isSafeInteger(value)) return String(value);
    if (typeof value === 'string' && DECIMAL.test(value)) return Decimal.from(value).toString();
    throw new ExpressionError(path, 'must be a decimal as text (e.g. "1.85") or an integer');
  }
  if (valueType === 'datetime') {
    if (isInstant(value)) return new Date(value).toISOString();
    throw new ExpressionError(path, 'must be an ISO-8601 instant with time zone');
  }
  if (valueType === 'boolean') {
    if (typeof value === 'boolean') return value;
    throw new ExpressionError(path, 'must be true or false');
  }
  if (valueType === 'text') {
    if (printable(value) && value.trim()) return value;
    throw new ExpressionError(path, `must be a printable text of at most ${LIMITS.text} characters`);
  }
  throw new ExpressionError(path, `value type ${valueType} has no comparable values`);
}

function normalizeCondition(node, caps, path) {
  const keys = Object.keys(node);
  for (const key of keys) if (!['field', 'op', 'value'].includes(key)) throw new ExpressionError(path, `unknown key ${String(key).slice(0, 40)}`);
  if (typeof node.field !== 'string' || !caps.has(node.field)) throw new ExpressionError(`${path}.field`, 'must be the id of a capability in the catalog');
  const cap = caps.get(node.field);
  if (typeof node.op !== 'string' || !Array.isArray(cap.operators) || !cap.operators.includes(node.op)) {
    throw new ExpressionError(`${path}.op`, `must be one of the operators of ${node.field}: ${(cap.operators ?? []).join(', ')}`);
  }
  const at = `${path}.value`;
  const out = {field: node.field, op: node.op};
  if (node.op === 'is_null' || node.op === 'not_null') {
    if (Object.hasOwn(node, 'value')) throw new ExpressionError(at, `${node.op} takes no value`);
    return out;
  }
  if (!Object.hasOwn(node, 'value')) throw new ExpressionError(at, 'is required');
  if (node.op === 'between') {
    if (!Array.isArray(node.value) || node.value.length !== 2) throw new ExpressionError(at, 'between takes [low, high]');
    const [lo, hi] = node.value.map((v, i) => scalar(cap.value_type, v, `${at}[${i}]`));
    if (compare(cap.value_type, lo, hi) > 0) throw new ExpressionError(at, 'low must not exceed high');
    out.value = [lo, hi];
  } else if (node.op === 'in') {
    if (!Array.isArray(node.value) || !node.value.length || node.value.length > LIMITS.inValues) throw new ExpressionError(at, `in takes a list of 1 to ${LIMITS.inValues} values`);
    out.value = [...new Set(node.value.map((v, i) => scalar(cap.value_type, v, `${at}[${i}]`)))];
  } else {
    out.value = scalar(cap.value_type, node.value, at);
  }
  return out;
}

// Validates an expression against the catalog and returns its canonical form ({version, expression}). Throws
// ExpressionError with the path of the first problem. Child order is kept: it is how the author wrote it.
export function normalizeExpression(expr, catalog) {
  const caps = lookup(catalog);
  let count = 0;
  const walk = (node, path, depth) => {
    if (++count > LIMITS.nodes) throw new ExpressionError(path, `more than ${LIMITS.nodes} nodes`);
    if (depth > LIMITS.depth) throw new ExpressionError(path, `deeper than ${LIMITS.depth} levels`);
    if (!plain(node)) throw new ExpressionError(path, 'must be an object');
    const keys = Object.keys(node);
    for (const group of ['all', 'any']) {
      if (!Object.hasOwn(node, group)) continue;
      if (keys.length !== 1) throw new ExpressionError(path, `${group} must be the only key of its node`);
      const children = node[group];
      if (!Array.isArray(children) || !children.length || children.length > LIMITS.children) throw new ExpressionError(`${path}.${group}`, `must be a list of 1 to ${LIMITS.children} conditions`);
      return {[group]: children.map((child, i) => walk(child, `${path}.${group}[${i}]`, depth + 1))};
    }
    if (Object.hasOwn(node, 'not')) {
      if (keys.length !== 1) throw new ExpressionError(path, 'not must be the only key of its node');
      return {not: walk(node.not, `${path}.not`, depth + 1)};
    }
    if (Object.hasOwn(node, 'field')) return normalizeCondition(node, caps, path);
    throw new ExpressionError(path, 'must be {all}, {any}, {not} or a condition {field, op, value}');
  };
  return {version: EXPRESSION_VERSION, expression: walk(expr, '$', 1)};
}

// Every capability id the expression uses, once, in first-use order.
export function expressionFields(normalized) {
  const out = [];
  const walk = node => {
    if (node.all || node.any) for (const child of node.all ?? node.any) walk(child);
    else if (node.not) walk(node.not);
    else if (!out.includes(node.field)) out.push(node.field);
  };
  walk(normalized.expression);
  return out;
}

// The conditions a decision taken before kickoff may not use: capabilities whose timing is not known before kickoff.
// decision 'PREMATCH' allows identity and market capabilities only; 'POSTMATCH' (research on finished matches) allows
// every timing. Unknown capabilities are reported too.
export function pitViolations(normalized, catalog, {decision}) {
  if (!['PREMATCH', 'POSTMATCH'].includes(decision)) throw new TypeError('decision must be PREMATCH or POSTMATCH');
  if (decision === 'POSTMATCH') return [];
  const caps = lookup(catalog);
  return expressionFields(normalized)
    .filter(id => !caps.has(id) || !PREMATCH_TIMINGS.has(caps.get(id).timing))
    .map(id => ({field: id, timing: caps.get(id)?.timing ?? null, reason: 'not known before kickoff (MP-PIT-TIMING-01)'}));
}

// The PIT reading of an expression for a decision. violations: conditions that decision may not use. untimed:
// conditions on market prices whose capture time the provider does not publish (PREMATCH_MARKET_UNTIMED): allowed
// before kickoff, but they cannot prove that the price was known at the decision time, so a decision that uses them is
// never PIT_VERIFIED. An empty violations list means "no post-match field", not "PIT verified".
export function pitReport(normalized, catalog, {decision}) {
  const violations = pitViolations(normalized, catalog, {decision});
  const caps = lookup(catalog);
  const untimed = expressionFields(normalized).filter(id => caps.get(id)?.timing === 'PREMATCH_MARKET_UNTIMED');
  return {decision, violations, untimed, pit_verifiable: violations.length === 0 && untimed.length === 0};
}

// A record value read for comparison, or null when absent or unreadable (never guessed).
function read(valueType, value) {
  if (value === null || value === undefined) return null;
  try {
    if (valueType === 'integer') return Number.isSafeInteger(value) ? String(value) : typeof value === 'string' && /^[+-]?\d{1,15}$/.test(value.trim()) ? Decimal.from(value.trim()).toString() : null;
    if (valueType === 'number') return Number.isSafeInteger(value) ? String(value) : typeof value === 'string' && DECIMAL.test(value.trim()) ? Decimal.from(value.trim()).toString() : null;
    if (valueType === 'datetime') {
      const ms = value instanceof Date ? value.getTime() : isInstant(value) ? Date.parse(value) : Number.NaN;
      return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    }
    if (valueType === 'boolean') return typeof value === 'boolean' ? value : null;
    if (valueType === 'text') return typeof value === 'string' ? value : null;
  } catch { return null; }
  return null;
}

function compare(valueType, a, b) {
  if (valueType === 'integer' || valueType === 'number') return Decimal.from(a).cmp(Decimal.from(b));
  if (valueType === 'datetime') return Math.sign(Date.parse(a) - Date.parse(b));
  return a === b ? 0 : a < b ? -1 : 1;
}

function condition(node, cap, record) {
  const present = Object.hasOwn(record, node.field) && record[node.field] !== null && record[node.field] !== undefined;
  const v = read(cap.value_type, present ? record[node.field] : null);
  // A value that is present but unreadable is neither null nor a usable value: UNKNOWN for every operator.
  if (node.op === 'is_null') return !present ? 'TRUE' : v === null ? 'UNKNOWN' : 'FALSE';
  if (node.op === 'not_null') return !present ? 'FALSE' : v === null ? 'UNKNOWN' : 'TRUE';
  if (v === null) return 'UNKNOWN';
  const t = test => (test ? 'TRUE' : 'FALSE');
  switch (node.op) {
    case 'eq': return t(compare(cap.value_type, v, node.value) === 0);
    case 'ne': return t(compare(cap.value_type, v, node.value) !== 0);
    case 'gt': return t(compare(cap.value_type, v, node.value) > 0);
    case 'gte': return t(compare(cap.value_type, v, node.value) >= 0);
    case 'lt': return t(compare(cap.value_type, v, node.value) < 0);
    case 'lte': return t(compare(cap.value_type, v, node.value) <= 0);
    case 'between': return t(compare(cap.value_type, v, node.value[0]) >= 0 && compare(cap.value_type, v, node.value[1]) <= 0);
    case 'in': return t(node.value.some(x => compare(cap.value_type, v, x) === 0));
    case 'contains': return t(v.includes(node.value));
    default: return 'UNKNOWN';
  }
}

// Evaluates a normalized expression on one record ({capability id: value}). Returns TRUE, FALSE or UNKNOWN.
export function evaluate(normalized, record, catalog) {
  if (normalized?.version !== EXPRESSION_VERSION) throw new TypeError('a normalized expression is required');
  if (!plain(record)) throw new TypeError('record must be a plain object');
  const caps = lookup(catalog);
  const walk = node => {
    if (node.all) {
      const r = node.all.map(walk);
      return r.includes('FALSE') ? 'FALSE' : r.includes('UNKNOWN') ? 'UNKNOWN' : 'TRUE';
    }
    if (node.any) {
      const r = node.any.map(walk);
      return r.includes('TRUE') ? 'TRUE' : r.includes('UNKNOWN') ? 'UNKNOWN' : 'FALSE';
    }
    if (node.not) {
      const r = walk(node.not);
      return r === 'TRUE' ? 'FALSE' : r === 'FALSE' ? 'TRUE' : 'UNKNOWN';
    }
    const cap = caps.get(node.field);
    if (!cap) return 'UNKNOWN';
    return condition(node, cap, record);
  };
  return walk(normalized.expression);
}

// The records the expression selects (TRUE only), with the count of FALSE and UNKNOWN, so a caller can show how many
// records were left out for missing data instead of hiding them.
export function filterRecords(normalized, records, catalog) {
  const caps = lookup(catalog);
  const selected = [];
  const counts = {TRUE: 0, FALSE: 0, UNKNOWN: 0};
  for (const record of records) {
    const r = evaluate(normalized, record, caps);
    counts[r] += 1;
    if (r === 'TRUE') selected.push(record);
  }
  return {selected, counts};
}
