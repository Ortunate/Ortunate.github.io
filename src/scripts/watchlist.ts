import { makeSymbol, marketOptions, quoteSymbol, readWatchlist, researchUrl, upsertSymbol, watchlistKey, WATCH_LIMIT, type WatchedSymbol } from '../lib/watchlist';

const root = document.querySelector<HTMLElement>('[data-watchlist]');
if (root) {
  const form = root.querySelector<HTMLFormElement>('[data-watch-form]')!;
  const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const filter = root.querySelector<HTMLSelectElement>('[data-watch-filter]')!;
  const list = root.querySelector<HTMLUListElement>('[data-watch-items]')!;
  const status = root.querySelector<HTMLElement>('[data-watch-status]')!;
  const cancel = root.querySelector<HTMLButtonElement>('[data-watch-cancel]')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-watch-submit]')!;
  const undo = root.querySelector<HTMLButtonElement>('[data-watch-undo]')!;
  let entries: WatchedSymbol[] = [];
  let editing: string | null = null;
  let removed: WatchedSymbol | null = null;
  let memoryOnly = false;

  function read() {
    if (memoryOnly) return;
    try { entries = readWatchlist(localStorage.getItem(watchlistKey)); }
    catch { memoryOnly = true; status.textContent = 'Storage is unavailable. This list lasts for this page visit only.'; }
  }
  function persist(message: string) {
    try { localStorage.setItem(watchlistKey, JSON.stringify(entries)); }
    catch { memoryOnly = true; }
    status.textContent = memoryOnly ? `${message} Browser storage is unavailable; changes last for this page visit only.` : message;
    render();
  }
  function reset() {
    editing = null; form.reset();
    field('market').disabled = field('symbol').disabled = false;
    cancel.hidden = true; submit.textContent = 'Add symbol +';
    updateHelp();
  }
  function updateHelp() {
    const examples: Record<string, string> = {US: 'AAPL or BRK-B', HK: '700 or 0700.HK', SH: '600519 or 600519.SS', SZ: '000001 or 000001.SZ'};
    const example = examples[field('market').value];
    field('symbol').setAttribute('placeholder', example);
    root!.querySelector('[data-watch-form] .watch-help')!.textContent = `Use ${example}. Adding an existing symbol updates its name and note.`;
  }
  function action(text: string, label: string, run: () => void) {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label);
    button.addEventListener('click', run);
    return button;
  }
  function render() {
    const visible = entries.filter(entry => filter.value === 'All' || entry.market === filter.value);
    list.replaceChildren(...visible.map(entry => {
      const li = document.createElement('li');
      const copy = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = entry.name || quoteSymbol(entry);
      const meta = document.createElement('p');
      meta.className = 'watch-meta'; meta.textContent = `${quoteSymbol(entry)} · ${marketOptions[entry.market]}`;
      const note = document.createElement('p'); note.textContent = entry.note; note.className = 'watch-user-note';
      copy.append(heading, meta); if (entry.note) copy.append(note);
      const links = document.createElement('div'); links.className = 'watch-item-actions';
      for (const [label, news] of [['Quote ↗', false], ['News ↗', true]] as const) {
        const link = document.createElement('a'); link.href = researchUrl(entry, news); link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = label; link.setAttribute('aria-label', `${label} for ${quoteSymbol(entry)}`); links.append(link);
      }
      links.append(action('Edit', `Edit ${quoteSymbol(entry)}`, () => {
        editing = entry.id;
        for (const name of ['market', 'symbol', 'name', 'note'] as const) field(name).value = entry[name];
        field('market').disabled = field('symbol').disabled = true;
        cancel.hidden = false; submit.textContent = 'Save changes'; updateHelp(); field('name').focus();
      }), action('Remove', `Remove ${quoteSymbol(entry)}`, () => {
        read();
        removed = entries.find(item => item.id === entry.id) || null;
        entries = entries.filter(item => item.id !== entry.id);
        if (editing === entry.id) reset();
        undo.hidden = !removed;
        persist(`${quoteSymbol(entry)} removed.`);
        if (removed) undo.focus(); else field('symbol').focus();
      }));
      li.append(copy, links); return li;
    }));
    root!.querySelector('[data-watch-count]')!.textContent = `${visible.length} shown · ${entries.length} / ${WATCH_LIMIT} saved`;
    const empty = root!.querySelector<HTMLElement>('[data-watch-empty]')!;
    empty.hidden = visible.length > 0;
    empty.textContent = entries.length ? 'No symbols in this market. Choose another market or add one above.' : 'Your list is a blank canvas. Add your first symbol above.';
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const entry = makeSymbol(field('market').value, field('symbol').value, field('name').value, field('note').value);
      read();
      if (editing && !entries.some(item => item.id === editing)) { reset(); render(); throw new Error('This symbol was removed in another tab. Add it again to restore it.'); }
      entries = upsertSymbol(entries, entry);
      filter.value = 'All'; reset(); persist(`${quoteSymbol(entry)} saved.`); field('symbol').focus();
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not save this symbol.'; }
  });
  undo.addEventListener('click', () => {
    if (!removed) return;
    read();
    try {
      // Do not overwrite a newer version restored in another tab.
      if (!entries.some(entry => entry.id === removed!.id)) entries = upsertSymbol(entries, removed);
      removed = null; undo.hidden = true; filter.value = 'All'; persist('Symbol restored.'); field('symbol').focus();
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not restore this symbol.'; }
  });
  cancel.addEventListener('click', () => { reset(); field('symbol').focus(); });
  field('market').addEventListener('change', updateHelp);
  filter.addEventListener('change', render);
  window.addEventListener('storage', event => { if (event.key === watchlistKey || event.key === null) { read(); render(); } });
  window.addEventListener('pageshow', () => { read(); render(); });
  read(); render(); updateHelp(); root.hidden = false;
}
