import {readTextFile, type TextFileLimits} from '../lib/text-file';

export function bindTextFile(picker: HTMLInputElement, input: HTMLTextAreaElement, limits: TextFileLimits, report: (message: string) => void) {
  let generation = 0;
  const cancel = () => { ++generation; };
  input.addEventListener('input', cancel);
  window.addEventListener('pagehide', cancel);
  picker.addEventListener('change', async () => {
    const token = ++generation, file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    report('Reading file…');
    try {
      const text = await readTextFile(file, limits);
      if (token !== generation) return;
      input.value = text;
      input.dispatchEvent(new Event('input', {bubbles: true}));
      report('File loaded. Review the input before processing it.');
      input.focus();
    } catch (error) {
      if (token === generation) report(error instanceof Error ? error.message : 'Could not read this file. Your input was kept.');
    }
  });
  return cancel;
}

export function downloadText(text: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], {type: `${type};charset=utf-8`}));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link);
  try { link.click(); }
  finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
