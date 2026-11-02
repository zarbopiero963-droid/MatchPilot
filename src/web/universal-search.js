// MP-SEARCH-GUI-01 (#263): the pure model of the universal search page (#/usearch). No DOM, no fetch: the page in
// app.js renders what this module computes, and test/universal-search-gui.test.mjs tests it without a browser.
// The page reads only GET /api/v1/capabilities (the catalog) and GET /api/v1/search (the answer). Nothing is hard-coded
// about markets, odds or filters: every field offered comes from the catalog, in catalog order, and no field, market or
// selection is pre-selected or promoted (owner rule: no arbitrary privilege for a market, an odd or a filter).

export const USABLE_STATUS = 'AVAILABLE AND IMPLEMENTED';
// Decisions the search API accepts today. LIVE is shown as a phase but disabled: the API refuses it until a LIVE
// search exists (MP-PIT-LIVE-01 only classifies data; no LIVE search route is implemented).
export const DECISIONS = Object.freeze([
  {id: 'PREMATCH', label: 'Prematch', enabled: true, note: 'solo campi noti prima del calcio d\'inizio'},
  {id: 'LIVE', label: 'Live', enabled: false, note: 'non ancora implementata nella ricerca'},
  {id: 'POSTMATCH', label: 'Partite concluse', enabled: true, note: 'ricerca storica su partite finite'}]);
export const PREMATCH_TIMINGS = Object.freeze(['PREMATCH_IDENTITY', 'PREMATCH_MARKET_UNTIMED']);
export const STATUS_LABELS = Object.freeze({
  'AVAILABLE AND IMPLEMENTED': 'Disponibile',
  'AVAILABLE BUT NOT IMPLEMENTED': 'Disponibile alla fonte, non ancora implementato',
  'PARTIALLY IMPLEMENTED': 'Implementato in parte',
  'PLAN RESTRICTED': 'Escluso dal piano della fonte',
  'PROVIDER NOT SUPPORTED': 'Non fornito',
  'NOT VERIFIED': 'Non verificato'});
export const OP_LABELS = Object.freeze({eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'uno tra', between: 'tra', is_null: 'mancante', not_null: 'presente', contains: 'contiene'});
export const MAX_CONDITIONS = 50;

// The catalog as the page uses it: grouped by kind, each field marked usable or not, with the reason in words.
export function catalogModel(capabilities, decision = 'PREMATCH') {
  const list = Array.isArray(capabilities) ? capabilities.filter(c => c && typeof c.id === 'string') : [];
  const groups = new Map();
  for (const c of list) {
    const reason = unusableReason(c, decision);
    const entry = {id: c.id, provider: c.provider ?? null, kind: c.kind, label: fieldLabel(c), value_type: c.value_type,
      operators: Array.isArray(c.operators) ? [...c.operators] : [], status: c.status,
      status_label: STATUS_LABELS[c.status] ?? 'Stato sconosciuto', timing: c.timing, usable: reason === null, reason,
      market: c.market ?? null, selections: Array.isArray(c.selections) ? [...c.selections] : []};
    if (!groups.has(c.kind)) groups.set(c.kind, []);
    groups.get(c.kind).push(entry);
  }
  const all = [...groups.values()].flat();
  return {groups: [...groups].map(([kind, fields]) => ({kind, fields})), usable: all.filter(f => f.usable).length,
    not_implemented: all.filter(f => f.status !== USABLE_STATUS).length, total: all.length};
}

// The name of a field as the page shows it, from the catalog itself (Browser QA #286: raw references such as
// «odds/bet:45» or «Odd_1_FT» are not shown): the catalog label when it has one, else the market type and period in
// words («Corners over under (FT)»), else the stored name with spaces («Odd 1 FT»). No market is named by the page.
export function fieldLabel(c) {
  if (typeof c.label === 'string' && c.label.trim()) return c.label.trim();
  if (typeof c.market_type === 'string' && c.market_type.trim()) {
    const text = c.market_type.trim().toLowerCase().split(/[_\s]+/).join(' ');
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}${c.period ? ` (${c.period})` : ''}`;
  }
  return String(c.provider_ref ?? c.id).replace(/_+/g, ' ').trim();
}

export const SEARCHABLE_PROVIDERS = Object.freeze(['fpt']);
export function unusableReason(c, decision) {
  if (c.provider && !SEARCHABLE_PROVIDERS.includes(c.provider)) return 'Fonte non ancora collegata alla ricerca';
  if (c.status !== USABLE_STATUS) return STATUS_LABELS[c.status] ?? 'Stato sconosciuto';
  if (decision === 'PREMATCH' && !PREMATCH_TIMINGS.includes(c.timing)) return 'Non noto prima del calcio d\'inizio (PIT)';
  return null;
}

// The editable tree: {type:'group', join:'all'|'any', negate, children:[...]} | {type:'cond', field, op, value, negate}.
export const newGroup = (join = 'all') => ({type: 'group', join, negate: false, children: []});
export const newCondition = () => ({type: 'cond', field: '', op: '', value: '', negate: false});

const wrapNot = (node, negate) => (negate ? {not: node} : node);
// The tree as the API expression ({all|any|not|field,op,value}); empty groups and blank conditions are dropped.
export function toExpression(node) {
  if (!node) return null;
  if (node.type === 'cond') {
    if (!node.field || !node.op) return null;
    const leaf = {field: node.field, op: node.op};
    if (!['is_null', 'not_null'].includes(node.op)) leaf.value = parseValue(node.value, node.op);
    return wrapNot(leaf, node.negate);
  }
  const kids = (node.children ?? []).map(toExpression).filter(Boolean);
  if (!kids.length) return null;
  return wrapNot(kids.length === 1 && !node.negate ? kids[0] : {[node.join === 'any' ? 'any' : 'all']: kids}, node.negate);
}

// The page shows decimals with a comma (1,45), so a decimal is typed the same way: «1,45» is the decimal 1.45. A list
// (in, between) is separated by «;», or by «,» when it has no «;» (Browser QA #286).
export function parseValue(text, op) {
  const raw = String(text ?? '').trim();
  const items = () => raw.split(raw.includes(';') ? ';' : ',').map(s => s.trim());
  if (op === 'in') return items().filter(Boolean).map(scalarOf);
  if (op === 'between') return items().slice(0, 2).map(scalarOf);
  return scalarOf(raw);
}
const scalarOf = s => (/^[+-]?\d+$/.test(s) && Number.isSafeInteger(Number(s)) ? Number(s) : /^(true|false)$/.test(s) ? s === 'true'
  : /^[+-]?\d+,\d+$/.test(s) ? s.replace(',', '.') : s);
// What the value field asks for, by operator.
export const valueHint = op => (op === 'between' ? 'da; a' : op === 'in' ? 'valori separati da ;' : 'valore');

// Client-side checks, in words, before calling the API. The API remains the authority and re-checks everything.
export function validate(tree, model, decision) {
  const byId = new Map(model.groups.flatMap(g => g.fields).map(f => [f.id, f]));
  const errors = [];
  let count = 0;
  const walk = (node, path) => {
    if (node.type === 'group') { node.children.forEach((c, i) => walk(c, `${path}.${i + 1}`)); return; }
    count += 1;
    if (!node.field) { errors.push({path, message: 'scegli un campo'}); return; }
    const f = byId.get(node.field);
    if (!f) { errors.push({path, message: 'campo non presente nel catalogo'}); return; }
    if (!f.usable) errors.push({path, message: `campo non utilizzabile: ${unusableReason(f, decision)}`});
    if (!node.op) errors.push({path, message: 'scegli un operatore'});
    else if (!f.operators.includes(node.op)) errors.push({path, message: 'operatore non offerto da questo campo'});
    else if (!['is_null', 'not_null'].includes(node.op) && String(node.value ?? '').trim() === '') errors.push({path, message: 'inserisci un valore'});
  };
  walk(tree, 'C');
  if (count === 0) errors.push({path: 'C', message: 'aggiungi almeno una condizione'});
  if (count > MAX_CONDITIONS) errors.push({path: 'C', message: `al massimo ${MAX_CONDITIONS} condizioni`});
  const d = DECISIONS.find(x => x.id === decision);
  if (!d) errors.push({path: 'decision', message: 'fase non valida'});
  else if (!d.enabled) errors.push({path: 'decision', message: `fase ${d.label}: ${d.note}`});
  return errors;
}

// The GET /api/v1/search URL; parameters in a fixed order, no default market or filter added.
export function searchUrl({expr, decision, from, to, competition, season, limit}) {
  const q = new URLSearchParams();
  q.set('expr', JSON.stringify(expr));
  q.set('decision', decision);
  q.set('from', from);
  q.set('to', to);
  if (competition) q.set('competition', competition);
  if (season) q.set('season', season);
  if (limit) q.set('limit', String(limit));
  return `/api/v1/search?${q}`;
}

// The answer in words: matches (TRUE), not matching (FALSE) and undecidable for missing data (UNKNOWN) are always
// shown apart, so missing data never reads as a "no".
export function outcomeSummary(data) {
  const c = data?.counts ?? {};
  const n = k => (Number.isFinite(c[k]) ? c[k] : Number.isFinite(c[k.toLowerCase()]) ? c[k.toLowerCase()] : null);
  return {matches: n('TRUE'), not_matching: n('FALSE'), unknown: n('UNKNOWN'), scanned: data?.scanned ?? null,
    truncated: data?.truncated === true, pit: data?.pit?.label ?? null};
}

// Display of one stored value: a missing value is marked, never shown as 0 or blank.
export const displayValue = value => (value === null || value === undefined || value === '' ? {missing: true, text: 'N/D'} : {missing: false, text: String(value)});

// Tree state in the URL (shareable, reload-safe); a malformed state falls back to an empty group, never to a default filter.
export function encodeTree(tree) { return JSON.stringify(tree); }
export function decodeTree(text) {
  try {
    const t = JSON.parse(text);
    return isTree(t, 0) ? t : newGroup();
  } catch { return newGroup(); }
}
function isTree(n, depth) {
  if (!n || typeof n !== 'object' || depth > 8) return false;
  if (n.type === 'cond') return typeof n.field === 'string' && typeof n.op === 'string';
  return n.type === 'group' && ['all', 'any'].includes(n.join) && Array.isArray(n.children) && n.children.length <= MAX_CONDITIONS && n.children.every(c => isTree(c, depth + 1));
}
