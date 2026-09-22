import { personalKeys, readIds, normalizePersonal, importPersonal, PIN_LIMIT } from '../lib/personal';

const root = document.querySelector<HTMLElement>('[data-workbench]');
if (root) {
  // Reuse the rendered catalog instead of shipping it a second time in JavaScript.
  const cards = [...root.closest('[data-directory]')!.querySelectorAll<HTMLElement>('[data-entry][data-bookmark]')];
  const entries = new Map(cards.map(card => {
    const link = card.querySelector<HTMLAnchorElement>('.directory-main-link')!;
    const id = card.dataset.bookmark!;
    return [id, {id, title: card.querySelector<HTMLElement>('[data-save]')!.dataset.title!, url: link.getAttribute('href')!, category: card.dataset.category!}];
  }));
  const known = new Set(entries.keys());
  const status = root.querySelector<HTMLElement>('[data-workbench-status]')!;
  let collection = normalizePersonal([], [], known);
  let recent: string[] = [];
  let memoryOnly = false;
  const list = (name: string) => root.querySelector<HTMLUListElement>(`[data-${name}-list]`)!;
  function read() {
    if (memoryOnly) return;
    try {
      collection = normalizePersonal(readIds(localStorage.getItem(personalKeys.saved)), readIds(localStorage.getItem(personalKeys.pinned)), known);
      recent = readIds(localStorage.getItem(personalKeys.recent)).filter(id => known.has(id)).slice(0, 8);
    } catch { memoryOnly = true; status.textContent = 'Storage is unavailable. Changes last for this page visit only; export a backup to keep them.'; }
  }
  function save(message: string) {
    try {
      localStorage.setItem(personalKeys.saved, JSON.stringify(collection.saved));
      localStorage.setItem(personalKeys.pinned, JSON.stringify(collection.pinned));
      status.textContent = message;
    } catch {
      memoryOnly = true;
      status.textContent = 'Could not save all changes. Export a backup before leaving this page.';
    }
    window.dispatchEvent(new CustomEvent('ortunate:saved', {detail: {saved: collection.saved, memoryOnly}}));
    render();
  }
  function item(id: string, manageable = false) {
    const entry = entries.get(id)!;
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = entry.url;
    link.dataset.trackEntry = id;
    link.textContent = entry.title;
    if (!entry.url.startsWith('/')) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
    const category = document.createElement('span');
    category.textContent = entry.category;
    link.append(category);
    li.append(link);
    if (manageable) {
      const pinned = collection.pinned.includes(id);
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = pinned ? 'Unpin' : 'Pin';
      button.setAttribute('aria-label', `${pinned ? 'Unpin' : 'Pin'} ${entry.title}`);
      button.setAttribute('aria-pressed', String(pinned));
      button.addEventListener('click', () => {
        read();
        if (collection.pinned.includes(id)) collection.pinned = collection.pinned.filter(value => value !== id);
        else {
          if (collection.pinned.length >= PIN_LIMIT) { status.textContent = 'Six places are pinned. Unpin one to make room.'; return; }
          if (!collection.saved.includes(id)) { render(); status.textContent = 'This place is no longer saved.'; return; }
          collection.pinned.push(id);
        }
        save(`${entry.title} ${collection.pinned.includes(id) ? 'pinned' : 'unpinned'}.`);
        list('saved').querySelector<HTMLButtonElement>(`[data-pin-id="${id}"]`)?.focus();
      });
      button.dataset.pinId = id;
      li.append(button);
    }
    return li;
  }
  function render() {
    for (const [name, ids] of [['pinned', collection.pinned], ['recent', recent], ['saved', collection.saved]] as const) {
      list(name).replaceChildren(...ids.map(id => item(id, name === 'saved')));
      root!.querySelector<HTMLElement>(`[data-${name}-empty]`)!.hidden = ids.length > 0;
    }
    root!.querySelector('[data-saved-total]')!.textContent = `(${collection.saved.length})`;
    root!.querySelector<HTMLButtonElement>('[data-clear-recent]')!.disabled = recent.length === 0;
  }
  root.querySelector('[data-clear-recent]')!.addEventListener('click', () => {
    recent = [];
    try { localStorage.removeItem(personalKeys.recent); status.textContent = 'Recent activity cleared.'; }
    catch { memoryOnly = true; status.textContent = 'Could not clear stored activity. It is hidden for this visit.'; }
    render();
  });
  root.querySelector('[data-export]')!.addEventListener('click', () => {
    read();
    const url = URL.createObjectURL(new Blob([JSON.stringify(collection, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'ortunate-bookmarks.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Bookmark backup prepared. Recent activity is not included.';
  });
  const input = root.querySelector<HTMLInputElement>('[data-import]')!;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65_536) throw new Error('Choose a backup smaller than 64 KB.');
      const raw = await file.text();
      read();
      const before = collection.saved.length;
      collection = importPersonal(raw, collection, known);
      save(`Merged ${collection.saved.length - before} new saved places. Unknown entries are skipped; existing pins take priority.`);
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not read this backup.'; }
    finally { input.value = ''; }
  });
  window.addEventListener('ortunate:saved', event => {
    if (event instanceof CustomEvent && Array.isArray(event.detail?.saved)) {
      memoryOnly ||= event.detail.memoryOnly === true;
      collection = normalizePersonal(event.detail.saved, collection.pinned, known);
      render();
    }
  });
  for (const name of ['storage', 'pageshow', 'ortunate:personal']) window.addEventListener(name, () => { read(); render(); });
  read(); render(); root.hidden = false;
}
