import { compareLines, comparisonText, type DiffLine } from '../lib/diff';
import { readTransfer, transferKey } from '../lib/tool-transfer';
import { copy } from './storage';

const root = document.querySelector<HTMLElement>('[data-diff]')!;
const find = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-diff-${name}]`)!;
const before = find<HTMLTextAreaElement>('before'), after = find<HTMLTextAreaElement>('after');
const trim = find<HTMLInputElement>('trim'), changes = find<HTMLInputElement>('changes');
const status = find('status'), result = find('result'), output = find('lines');
const copyButton = find<HTMLButtonElement>('copy');
let lines: DiffLine[] | null = null;
function invalidate() { lines = null; output.replaceChildren(); result.hidden = true; copyButton.disabled = true; status.textContent = 'Text or options changed. Compare again to see the result.'; }
function render() {
  if (!lines) return;
  const additions = lines.filter(line => line.kind === 'add').length, removals = lines.filter(line => line.kind === 'remove').length;
  status.textContent = additions || removals ? `${additions} added · ${removals} removed · ${lines.length - additions - removals} unchanged lines.` : `No differences${trim.checked ? ' with edge whitespace ignored' : ''}.`;
  const visible = changes.checked ? lines.filter(line => line.kind !== 'same') : lines;
  output.replaceChildren(...visible.map(line => {
    const row = document.createElement('div'); row.className = `diff-line diff-${line.kind}`;
    for (const value of [line.before ?? '', line.after ?? '', {same: ' ', add: '+', remove: '−'}[line.kind]]) {
      const cell = document.createElement('span'); cell.textContent = String(value); row.append(cell);
    }
    const text = document.createElement('code'); text.textContent = line.text || ' '; row.append(text); return row;
  }));
  if (!visible.length) { const empty = document.createElement('p'); empty.textContent = 'No lines to display.'; output.append(empty); }
  result.hidden = false; copyButton.disabled = lines.length === 0;
}
function run() {
  try { lines = compareLines(before.value, after.value, trim.checked); render(); }
  catch (error) { invalidate(); status.textContent = error instanceof Error ? error.message : 'Could not compare this text.'; }
}
for (const input of [before, after, trim]) input.addEventListener('input', invalidate);
changes.addEventListener('change', render);
find('run').addEventListener('click', run);
find('swap').addEventListener('click', () => { [before.value, after.value] = [after.value, before.value]; invalidate(); run(); });
find('clear').addEventListener('click', () => { before.value = after.value = ''; invalidate(); status.textContent = 'Both inputs cleared.'; before.focus(); });
find('example').addEventListener('click', () => { before.value = 'A little corner of the internet.\nMake something useful.\nStay curious.'; after.value = 'A little corner of the internet.\nMake something playful.\nStay curious.\nShare what you learn.'; invalidate(); run(); });
copyButton.addEventListener('click', () => { if (lines) void copy(comparisonText(lines)); });
try {
  const raw = sessionStorage.getItem(transferKey);
  sessionStorage.removeItem(transferKey);
  const transfer = readTransfer(raw);
  if (transfer) { before.value = transfer.before; after.value = transfer.after; run(); }
  else if (raw) status.textContent = 'The transfer expired or was too large. Paste your text to compare.';
} catch { status.textContent = 'Automatic transfer is unavailable. Paste your text to compare.'; }
