import { createHash } from 'node:crypto';

export function first(row, names) {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return null;
}

const MATCH_KEY_ID_FIELDS = ['Id', 'ID', 'id', 'Match_Id', 'match_id'];
export const PROVIDER_MATCH_ID_FIELDS = [...MATCH_KEY_ID_FIELDS, 'Match_ID'];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function matchKey(row, datasetKey) {
  const providerId = first(row, MATCH_KEY_ID_FIELDS);
  if (providerId) return `fpt:id:${providerId}`;
  const parts = [
    datasetKey,
    first(row, ['Date', 'date']) || '',
    first(row, ['Time', 'time']) || '',
    first(row, ['Home', 'home']) || '',
    first(row, ['Away', 'away']) || ''
  ];
  return 'fpt:hash:' + sha256(parts.join('|')).slice(0, 32);
}

export function dateOrNull(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
}
