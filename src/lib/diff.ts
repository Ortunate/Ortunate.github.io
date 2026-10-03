export const DIFF_CHAR_LIMIT = 100_000;
export const DIFF_LINE_LIMIT = 1000;
export interface DiffLine { kind: 'same' | 'add' | 'remove'; text: string; before: number | null; after: number | null }

export function compareLines(before: string, after: string, trim = false): DiffLine[] {
  if (before.length > DIFF_CHAR_LIMIT || after.length > DIFF_CHAR_LIMIT) throw new Error('Use at most 100,000 characters per side.');
  const lines = (text: string) => text ? text.replace(/\r\n?/g, '\n').split('\n') : [];
  const a = lines(before), b = lines(after);
  if (a.length > DIFF_LINE_LIMIT || b.length > DIFF_LINE_LIMIT) throw new Error('Use at most 1,000 lines per side.');
  const keys = (values: string[]) => trim ? values.map(line => line.trim()) : values;
  const ak = keys(a), bk = keys(b);
  const widths = b.length + 1;
  const lengths = new Uint16Array((a.length + 1) * widths);
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    lengths[i * widths + j] = ak[i] === bk[j] ? 1 + lengths[(i + 1) * widths + j + 1] : Math.max(lengths[(i + 1) * widths + j], lengths[i * widths + j + 1]);
  }
  const result: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ak[i] === bk[j]) {
      result.push({kind: 'same', text: b[j], before: ++i, after: ++j});
    } else if (i < a.length && (j === b.length || lengths[(i + 1) * widths + j] >= lengths[i * widths + j + 1])) {
      result.push({kind: 'remove', text: a[i], before: ++i, after: null});
    } else result.push({kind: 'add', text: b[j], before: null, after: ++j});
  }
  return result;
}

export function comparisonText(lines: DiffLine[]): string {
  return lines.map(line => `${{same: ' ', add: '+', remove: '-'}[line.kind]} ${line.text}`).join('\n');
}
