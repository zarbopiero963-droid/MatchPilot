import { createHash } from 'node:crypto';
export const PARSER_VERSION = 1;
const normalize = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
const digest = value => createHash('sha256').update(value).digest('hex');
// Discovery never invokes a control. New controls remain available for later integration.
export function parseSnapshot(raw, { section = 'unknown', required = [] } = {}) {
  const issues = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const controls = [];
  const inputs = [];
  for (const [key, output] of [['controls', controls], ['inputs', inputs]]) {
    if (!Array.isArray(raw[key])) { issues.push({ code: 'invalid_collection', field: key }); continue; }
    const seen = new Set();
    for (const item of raw[key]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { issues.push({ code: 'invalid_item', field: key }); continue; }
      const label = normalize(item.label);
      const id = normalize(item.id);
      const tag = normalize(item.tag).toUpperCase();
      const stableKey = digest(JSON.stringify([section, key, tag, id, label, normalize(item.type)]));
      if (seen.has(stableKey)) continue;
      seen.add(stableKey);
      // Explicit allowlist: never retain input values, passwords or arbitrary new payload fields.
      output.push({ key: stableKey, id, tag, label, ...(key === 'inputs' ? {
        type: normalize(item.type), min: normalize(item.min), max: normalize(item.max),
        step: normalize(item.step), placeholder: normalize(item.placeholder),
        options: Array.isArray(item.options) ? item.options.map(normalize) : [],
      } : {}), status: 'discovered' });
    }
  }
  const text = typeof raw.text === 'string' ? raw.text : '';
  if (!text.trim()) issues.push({ code: 'empty_page' });
  const missing = required.filter(id => ![...controls, ...inputs].some(item => item.id === id));
  for (const id of missing) issues.push({ code: 'missing_required', field: id });
  const signature = digest(JSON.stringify([...controls, ...inputs].map(item => item.key).sort()));
  return { parserVersion: PARSER_VERSION, section, text, controls, inputs, signature, issues,
    usable: Boolean(text.trim()) && missing.length === 0 };
}
export function compareCatalog(previous, current) {
  const before = new Map([...(previous?.controls ?? []), ...(previous?.inputs ?? [])].map(item => [item.key, item]));
  const after = new Map([...current.controls, ...current.inputs].map(item => [item.key, item]));
  return { added: [...after.values()].filter(item => !before.has(item.key)),
    removed: [...before.values()].filter(item => !after.has(item.key)) };
}
