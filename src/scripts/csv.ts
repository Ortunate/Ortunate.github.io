import {csvToJson, jsonToCsv, CSV_CHAR_LIMIT, type Delimiter} from '../lib/csv';
import {bindTextFile, downloadText} from './text-files';
import {copy} from './storage';

const root = document.querySelector<HTMLElement>('[data-csv]')!;
const find = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-csv-${name}]`)!;
const input = find<HTMLTextAreaElement>('input'), direction = find<HTMLSelectElement>('direction'), delimiter = find<HTMLSelectElement>('delimiter');
const output = find('output'), status = find('status');
const copyButton = find<HTMLButtonElement>('copy'), download = find<HTMLButtonElement>('download');
let result = '';
function invalidate() {
  result = ''; output.textContent = 'Your result will appear here.';
  copyButton.disabled = download.disabled = true;
  status.textContent = 'Input or options changed. Convert again to see the result.';
}
const cancelImport = bindTextFile(find<HTMLInputElement>('file'), input, {characters:CSV_CHAR_LIMIT}, message => {status.textContent=message;});
input.addEventListener('input', invalidate);
for (const control of [direction, delimiter]) control.addEventListener('change', () => {cancelImport(); invalidate();});
find('run').addEventListener('click', () => {
  invalidate();
  try {
    const separator = (delimiter.value === 'tab' ? '\t' : delimiter.value) as Delimiter;
    result = direction.value === 'json' ? csvToJson(input.value, separator) : jsonToCsv(input.value, separator);
    output.textContent = result; copyButton.disabled = download.disabled = false;
    status.textContent = `Converted to ${direction.value.toUpperCase()}. Review the result before downloading.`;
  } catch (error) {status.textContent = error instanceof Error ? error.message : 'Could not convert this data.';}
});
find('clear').addEventListener('click', () => {cancelImport(); input.value=''; invalidate(); status.textContent='Input cleared.'; input.focus();});
find('example').addEventListener('click', () => {
  cancelImport();
  const records = '[{"name":"Luna","code":"0012","note":"Hello, world"},{"name":"宇宙","code":"0034","note":"Stay curious"}]';
  const separator = (delimiter.value === 'tab' ? '\t' : delimiter.value) as Delimiter;
  input.value = direction.value === 'json' ? jsonToCsv(records, separator) : records;
  invalidate(); status.textContent='Example loaded. Select Convert to try it.'; input.focus();
});
copyButton.addEventListener('click', () => {if (result) void copy(result);});
download.addEventListener('click', () => {
  if (!result) return;
  try {
    const json = direction.value === 'json', tab = delimiter.value === 'tab';
    downloadText(result, `converted.${json ? 'json' : tab ? 'tsv' : 'csv'}`, json ? 'application/json' : tab ? 'text/tab-separated-values' : 'text/csv');
    status.textContent='Download prepared.';
  } catch {status.textContent='Could not download the result. Use Copy result instead.';}
});
