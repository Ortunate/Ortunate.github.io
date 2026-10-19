export const CSV_CHAR_LIMIT = 100_000;
export const CSV_ROW_LIMIT = 1000;
export const CSV_COLUMN_LIMIT = 100;
export const CSV_OUTPUT_LIMIT = 2_000_000;
export type Delimiter = ',' | ';' | '\t';

function checkInput(text: string, delimiter: string) {
  if (text.length > CSV_CHAR_LIMIT) throw new Error('Use at most 100,000 input characters.');
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('Choose comma, semicolon, or tab.');
}
function append(parts: string[], part: string, size: number): number {
  if (size + part.length > CSV_OUTPUT_LIMIT) throw new Error('The result exceeds 2 million characters. Convert fewer rows or shorter column names.');
  parts.push(part); return size + part.length;
}
export function parseCsv(text: string, delimiter: Delimiter = ','): string[][] {
  checkInput(text, delimiter);
  text = text.replace(/^\uFEFF/, '');
  if (!text) throw new Error('Enter CSV with a header row.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  function field() {
    row.push(cell); cell = ''; closed = false;
    if (row.length > CSV_COLUMN_LIMIT) throw new Error('Use at most 100 columns.');
  }
  function record() {
    field(); rows.push(row); row = [];
    if (rows.length > CSV_ROW_LIMIT + 1) throw new Error('Use at most 1,000 data rows.');
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else { quoted = false; closed = true; }
      } else cell += char;
    } else if (char === delimiter) field();
    else if (char === '\r' || char === '\n') {
      record();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (closed) throw new Error(`Unexpected text after a closing quote in row ${rows.length + 1}.`);
    else if (char === '"') {
      if (cell) throw new Error(`Quote inside an unquoted field in row ${rows.length + 1}.`);
      quoted = true;
    } else cell += char;
  }
  if (quoted) throw new Error('A quoted field is missing its closing quote.');
  if (cell || row.length || closed || !/[\r\n]$/.test(text)) record();
  return rows;
}
export function csvToJson(text: string, delimiter: Delimiter = ','): string {
  const [headers, ...rows] = parseCsv(text, delimiter);
  if (headers.some(header => !header.trim())) throw new Error('Every column needs a non-empty header.');
  if (new Set(headers).size !== headers.length) throw new Error('Column headers must be unique.');
  const parts = ['[']; let size = 1;
  rows.forEach((row, index) => {
    if (row.length !== headers.length) throw new Error(`Data row ${index + 1} has ${row.length} fields; expected ${headers.length}.`);
    const record = Object.fromEntries(headers.map((header, i) => [header, row[i]]));
    size = append(parts, `${index ? ',' : ''}\n${JSON.stringify(record, null, 2).split('\n').map(line => `  ${line}`).join('\n')}`, size);
  });
  append(parts, rows.length ? '\n]' : ']', size);
  return parts.join('');
}
export function jsonToCsv(text: string, delimiter: Delimiter = ','): string {
  checkInput(text, delimiter);
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('Enter valid JSON.'); }
  if (!Array.isArray(data) || !data.length) throw new Error('Use a non-empty JSON array of flat objects.');
  if (data.length > CSV_ROW_LIMIT) throw new Error('Use at most 1,000 data rows.');
  const headers = new Set<string>();
  for (const row of data) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Every JSON row must be a flat object.');
    for (const [key, value] of Object.entries(row)) {
      if (!key.trim()) throw new Error('Every column needs a non-empty name.');
      headers.add(key);
      if (headers.size > CSV_COLUMN_LIMIT) throw new Error('Use at most 100 columns.');
      if (value !== null && !['string','number','boolean'].includes(typeof value)) throw new Error('Nested objects and arrays are not supported. Flatten them first.');
      if (typeof value === 'number' && (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))) throw new Error('Store large numbers as strings to preserve their digits.');
    }
  }
  if (!headers.size) throw new Error('At least one named column is required.');
  const names = [...headers];
  const escape = (value: unknown) => {
    const cell = value == null ? '' : String(value);
    return !cell || cell.includes(delimiter) || /["\r\n]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell;
  };
  const parts: string[] = []; let size = append(parts, names.map(escape).join(delimiter), 0);
  for (const row of data) size = append(parts, '\r\n' + names.map(key => escape(Object.hasOwn(row, key) ? row[key] : '')).join(delimiter), size);
  return parts.join('');
}
