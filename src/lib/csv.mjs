export function parseCsv(text, options = {}) {
  const audit = options.audit === true;
  const rawRows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  const pushCell = () => { row.push(cell); cell = ''; };
  const pushRow = () => {
    if (row.length || cell.length) pushCell();
    if (row.some(v => v !== '')) rawRows.push(row);
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

  const issues = [];
  if (quoted) issues.push({code: 'malformed_csv', reason: 'unclosed_quote'});
  if (!rawRows.length) {
    return audit ? {headers: [], rows: [], issues} : {headers: [], rows: []};
  }

  const headerCells = rawRows[0];
  const headers = headerCells.map((h, i) => String(h || '').trim() || `__unnamed_${i}`);
  const objects = [];
  for (const cells of rawRows.slice(1)) {
    if (cells.length !== headers.length) {
      issues.push({code: 'header_row_mismatch', expected: headers.length, actual: cells.length});
    }
    objects.push(Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ''])));
  }
  return audit ? {headers, rows: objects, issues} : {headers, rows: objects};
}
