export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => {
    if (row.length || cell.length) pushCell();
    if (row.some(v => v !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') pushCell();
    else if (ch === '\n') pushRow();
    else if (ch === '\r') {
      if (text[i + 1] === '\n') continue;
      pushRow();
    } else cell += ch;
  }
  if (cell.length || row.length) pushRow();
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows.shift().map((h, i) => String(h || '').trim() || `__unnamed_${i}`);
  const objects = rows.map(cells => Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
  return { headers, rows: objects };
}
