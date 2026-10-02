import { createHash } from 'node:crypto';
export const PARSER_VERSION = 2;
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
    const occurrences = new Map();
    for (const item of raw[key]) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) { issues.push({ code: 'invalid_item', field: key }); continue; }
      const label = normalize(item.label);
      const id = normalize(item.id);
      const tag = normalize(item.tag).toUpperCase();
      const context = normalize(item.context);
      const name = normalize(item.name);
      const identity = JSON.stringify([section, key, tag, id, name, context, label, normalize(item.type)]);
      let occurrence = 0;
      if (!id && !name && !context) {
        occurrence = occurrences.get(identity) ?? 0;
        occurrences.set(identity, occurrence + 1);
        if (occurrence) issues.push({code:'ambiguous_identity',field:key});
      }
      const stableKey = digest(identity + ':' + occurrence);
      if (seen.has(stableKey)) continue;
      seen.add(stableKey);
      // Explicit allowlist: never retain input values, passwords or arbitrary new payload fields.
      output.push({ key: stableKey, id, name, context, tag, label, ...(key === 'inputs' ? {
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
// A missing required row invalidates the financial dataset; extra rows are retained as discoveries.
export function parseRoiStrategies(text) {
  const rows = new Map(), unknown = [], issues = [];
  const numeric = value => {
    const clean=String(value ?? '').trim().replace(/%$/,'').replace(/,/g,'.');
    return /^[+-]?\d+(\.\d+)?$/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : null;
  };
  const names=['Casa Punta','Casa Lay','Pareggio Punta','Pareggio Lay','Trasferta Punta','Trasferta Lay'];
  const header=String(text ?? '').lastIndexOf('SUGGERIMENTO OPERATIVO');
  if(header<0)return {usable:false,rows:[],unknown,issues:[{code:'missing_roi_table'}]};
  for(const line of String(text).slice(header).split('\n').slice(1)) {
    const fields=line.split('\t').map(normalize);
    if(fields.length<6)continue;
    if(!names.includes(fields[0])) {unknown.push({label:fields[0]});continue;}
    const count=numeric(fields[1]), winRate=numeric(fields[2]), roi=numeric(fields[3]);
    const threshold=fields[4].match(/^([<>])\s*(.+)$/);
    const price=threshold ? numeric(threshold[2]) : null;
    const back=fields[0].endsWith('Punta');
    if(!Number.isInteger(count)||count<1||winRate===null||winRate<0||winRate>100||roi===null||price===null||price<=1||threshold[1] !== (back?'>':'<')) {
      issues.push({code:'invalid_roi_row',field:fields[0]});continue;
    }
    if(rows.has(fields[0])) {issues.push({code:'duplicate_roi_row',field:fields[0]});continue;}
    rows.set(fields[0],{strategy:fields[0],side:back?'BACK':'LAY',sample:count,winRatePercent:winRate,roiPercent:roi,threshold:{operator:threshold[1],price},reliability:fields[5]});
  }
  for(const name of names)if(!rows.has(name))issues.push({code:'missing_roi_row',field:name});
  return {usable:rows.size===6&&issues.length===0,rows:[...rows.values()],unknown,issues};
}
