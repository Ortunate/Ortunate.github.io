import {BACKUP_LIMIT, mergeSections, parseBackup, readSections, sectionNames, sectionSummary, snapshot, writeSections, type Backup, type Section, type Sections} from '../lib/backup';

const root = document.querySelector<HTMLElement>('[data-backup]')!;
const known = new Set<string>(JSON.parse(root.dataset.known!));
const find = <T extends HTMLElement>(key: string) => root.querySelector<T>(`[data-backup-${key}]`)!;
const status = find('status'), preview = find('preview'), apply = find<HTMLButtonElement>('apply');
const choices = [...root.querySelectorAll<HTMLInputElement>('[data-backup-section]')];
const selected = () => choices.filter(input => input.checked).map(input => input.value as Section);
let incoming: Backup | null = null, planned: Sections = {}, signature = '', fileGeneration = 0;
function update() {
  const current = readSections(localStorage, known);
  for (const section of Object.keys(sectionNames) as Section[]) root.querySelector(`[data-backup-summary="${section}"]`)!.textContent = sectionSummary(section, current);
  preview.hidden = !incoming;
  find<HTMLButtonElement>('export').disabled = selected().length === 0;
  if (!incoming) return;
  planned = mergeSections(current, incoming.sections, selected(), known);
  signature = snapshot(localStorage, selected());
  apply.disabled = Object.keys(planned).length === 0;
  find('rows').replaceChildren(...(Object.keys(planned) as Section[]).map(section => {
    const row = document.createElement('tr');
    for (const text of [sectionNames[section], sectionSummary(section, current), sectionSummary(section, incoming!.sections), sectionSummary(section, planned)]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    return row;
  }));
}
function error(value: unknown) { apply.disabled = true; status.textContent = value instanceof Error ? value.message : 'Browser storage is unavailable.'; }
function refresh() { try { update(); } catch (value) { error(value); } }
choices.forEach(choice => choice.addEventListener('change', refresh));
find('export').addEventListener('click', () => {
  try {
    const current = readSections(localStorage, known);
    const sections = Object.fromEntries(selected().map(section => [section, current[section]]));
    if (!Object.keys(sections).length) return;
    const blob = new Blob([JSON.stringify({format: 'ortunate', version: 1, sections}, null, 2)], {type: 'application/json'});
    if (blob.size > BACKUP_LIMIT) throw new Error('These categories exceed 256 KB. Export fewer categories at a time.');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'ortunate-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Backup prepared for the selected categories. Keep the file somewhere you can find it.';
  } catch (value) { error(value); }
});
const file = find<HTMLInputElement>('file');
file.addEventListener('change', async () => {
  const token = ++fileGeneration, chosen = file.files?.[0];
  incoming = null; preview.hidden = true; apply.disabled = true;
  if (!chosen) return;
  try {
    if (chosen.size > BACKUP_LIMIT) throw new Error('Choose a backup no larger than 256 KB.');
    const text = await chosen.text();
    if (token !== fileGeneration) return;
    incoming = parseBackup(text, known); update();
    status.textContent = 'Backup loaded for preview. No data has changed yet.';
  } catch (value) { if (token === fileGeneration) error(value); }
  finally { if (token === fileGeneration) file.value = ''; }
});
find('cancel').addEventListener('click', () => { ++fileGeneration; incoming = null; preview.hidden = true; status.textContent = 'Import cancelled. Your collections are unchanged.'; file.focus(); });
apply.addEventListener('click', () => {
  if (!incoming || !Object.keys(planned).length) return;
  try {
    if (snapshot(localStorage, selected()) !== signature) { update(); status.textContent = 'Your collections changed in another tab. Review the updated counts and merge again.'; return; }
    writeSections(localStorage, planned);
    incoming = null; update(); status.textContent = 'Selected data merged. Existing notes and collection order were preserved.'; find('export').focus();
  } catch (value) { error(value); }
});
window.addEventListener('pageshow', refresh);
find('controls').hidden = false;
refresh();
