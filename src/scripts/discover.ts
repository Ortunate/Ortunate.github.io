import { matchesBrowse, parseSaved, readBrowseState, writeBrowseState } from '../lib/browse';

import { personalKeys, readIds } from '../lib/personal';
const storageKey = personalKeys.saved;
document.querySelectorAll<HTMLElement>('[data-directory]').forEach(root => {
  const cards = [...root.querySelectorAll<HTMLElement>('[data-entry]')];
  const search = root.querySelector<HTMLInputElement>('[data-search]')!;
  const savedButton = root.querySelector<HTMLButtonElement>('[data-saved-only]');
  const surprise = root.querySelector<HTMLButtonElement>('[data-surprise]');
  const note = root.querySelector<HTMLElement>('[data-storage-note]');
  const filters = [...root.querySelectorAll<HTMLButtonElement>('[data-category-filter]')];
  const categories = filters.map(button => button.dataset.categoryFilter!);
  let state = readBrowseState(new URLSearchParams(location.search), categories);
  let saved = new Set<string>();
  let memoryOnly = false;
  let urlTimer: ReturnType<typeof setTimeout>;

  function readSaved() {
    try { saved = parseSaved(localStorage.getItem(storageKey)); }
    catch { memoryOnly = true; }
  }
  function update() {
    let count = 0;
    if (!savedButton) state.savedOnly = false;
    cards.forEach(card => {
      const isSaved = saved.has(card.dataset.bookmark || '');
      card.hidden = !matchesBrowse({text: card.dataset.searchText!, category: card.dataset.category!, saved: isSaved}, state);
      if (!card.hidden) count++;
      const button = card.querySelector<HTMLButtonElement>('[data-save]');
      if (button) {
        button.setAttribute('aria-pressed', String(isSaved));
        button.setAttribute('aria-label', `${isSaved ? 'Unsave' : 'Save'} ${button.dataset.title}`);
        button.textContent = isSaved ? '★' : '☆';
      }
    });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.categoryFilter === state.category)));
    savedButton?.setAttribute('aria-pressed', String(state.savedOnly));
    root.querySelector('[data-count]')!.textContent = `${count} of ${cards.length} ${state.savedOnly ? 'saved entries' : 'entries'}`;
    const empty = root.querySelector<HTMLElement>('[data-directory-empty]');
    if (empty) empty.hidden = count !== 0;
    if (surprise) surprise.disabled = count === 0;
    if (memoryOnly && note) note.textContent = 'Browser storage is unavailable. Favorites will last for this page visit only.';
  }
  function syncUrl() {
    clearTimeout(urlTimer);
    const url = writeBrowseState(new URL(location.href), state);
    if (url.href !== location.href) history.replaceState(history.state, '', url);
  }
  function change() { update(); syncUrl(); }
  readSaved();
  search.value = state.query;
  root.querySelectorAll<HTMLElement>('[data-enhanced], [data-save], [data-storage-note]').forEach(element => element.hidden = false);
  search.addEventListener('input', () => {
    state.query = search.value;
    update();
    clearTimeout(urlTimer);
    urlTimer = setTimeout(syncUrl, 200);
  });
  savedButton?.addEventListener('click', () => { state.savedOnly = !state.savedOnly; change(); });
  filters.forEach(button => button.addEventListener('click', () => { state.category = button.dataset.categoryFilter!; change(); }));
  cards.forEach(card => {
    card.querySelector('[data-save]')?.addEventListener('click', () => {
      // Preserve saves made in another tab before changing one entry.
      if (!memoryOnly) readSaved();
      const id = card.dataset.bookmark!;
      if (saved.has(id)) saved.delete(id); else saved.add(id);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...saved]));
        if (!saved.has(id)) localStorage.setItem(personalKeys.pinned, JSON.stringify(readIds(localStorage.getItem(personalKeys.pinned)).filter(pin => pin !== id)));
      }
      catch { memoryOnly = true; }
      window.dispatchEvent(new CustomEvent('ortunate:saved', {detail: {saved: [...saved], memoryOnly}}));
      update();
    });
    card.addEventListener('click', syncUrl);
  });
  surprise?.addEventListener('click', () => {
    const visible = cards.filter(card => !card.hidden);
    const card = visible[Math.floor(Math.random() * visible.length)];
    const link = card?.matches('a') ? card as HTMLAnchorElement : card?.querySelector<HTMLAnchorElement>('.directory-main-link');
    link?.click();
  });
  root.querySelector('[data-reset]')?.addEventListener('click', () => {
    state = {query: '', category: 'All', savedOnly: false};
    search.value = '';
    change();
    search.focus();
  });
  window.addEventListener('popstate', () => {
    clearTimeout(urlTimer);
    state = readBrowseState(new URLSearchParams(location.search), categories);
    search.value = state.query;
    update();
  });
  window.addEventListener('pageshow', () => { if (!memoryOnly) readSaved(); update(); });
  window.addEventListener('storage', event => {
    if (!memoryOnly && (event.key === storageKey || event.key === null)) { readSaved(); update(); }
  });
  window.addEventListener('ortunate:saved', event => {
    if (event instanceof CustomEvent && Array.isArray(event.detail?.saved)) {
      memoryOnly ||= event.detail.memoryOnly === true;
      saved = new Set(event.detail.saved.filter((id: unknown): id is string => typeof id === 'string'));
      update();
    }
  });
  update();
});
