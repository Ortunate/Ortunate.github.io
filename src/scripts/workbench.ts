import { personalKeys, readIds, readGroups, groupName, normalizePersonal, importPersonal, PIN_LIMIT, GROUP_LIMIT } from '../lib/personal';

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
  const groupFilter = root.querySelector<HTMLSelectElement>('[data-group-filter]')!;
  const groupInput = root.querySelector<HTMLInputElement>('[data-group-name]')!;
  const renameGroup = root.querySelector<HTMLButtonElement>('[data-group-rename]')!;
  const deleteGroup = root.querySelector<HTMLButtonElement>('[data-group-delete]')!;
  let activeGroup = '';
  let collection = normalizePersonal([], [], known);
  let recent: string[] = [];
  let memoryOnly = false;
  const list = (name: string) => root.querySelector<HTMLUListElement>(`[data-${name}-list]`)!;
  function read() {
    if (memoryOnly) return;
    try {
      collection = normalizePersonal(readIds(localStorage.getItem(personalKeys.saved)), readIds(localStorage.getItem(personalKeys.pinned)), known);
      collection.groups = readGroups(localStorage.getItem(personalKeys.groups), collection.saved);
      recent = readIds(localStorage.getItem(personalKeys.recent)).filter(id => known.has(id)).slice(0, 8);
    } catch { memoryOnly = true; status.textContent = 'Storage is unavailable. Changes last for this page visit only; export a backup to keep them.'; }
  }
  function save(message: string) {
    try {
      localStorage.setItem(personalKeys.saved, JSON.stringify(collection.saved));
      localStorage.setItem(personalKeys.pinned, JSON.stringify(collection.pinned));
      localStorage.setItem(personalKeys.groups, JSON.stringify(collection.groups || []));
      status.textContent = message;
    } catch {
      memoryOnly = true;
      status.textContent = 'Could not save all changes. Export a backup before leaving this page.';
    }
    window.dispatchEvent(new CustomEvent('ortunate:saved', {detail: {saved: collection.saved, memoryOnly}}));
    render();
  }
  function item(id: string, manageable = false, reorderable = false) {
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
    if (reorderable) {
      const controls = document.createElement('div');
      controls.className = 'pin-order';
      const index = collection.pinned.indexOf(id);
      for (const [direction, offset, label] of [['up', -1, '↑'], ['down', 1, '↓']] as const) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.dataset.moveId = id;
        button.dataset.direction = direction;
        button.setAttribute('aria-label', `Move ${entry.title} ${direction}`);
        button.title = `Move ${direction}`;
        button.disabled = index + offset < 0 || index + offset >= collection.pinned.length;
        button.addEventListener('click', () => {
          read();
          const from = collection.pinned.indexOf(id), to = from + offset;
          if (from < 0 || to < 0 || to >= collection.pinned.length) {
            render();
            status.textContent = 'Pinned places changed. Review their current order.';
          } else {
            [collection.pinned[from], collection.pinned[to]] = [collection.pinned[to], collection.pinned[from]];
            save(`${entry.title} moved to position ${to + 1} of ${collection.pinned.length}.`);
          }
          const buttons = [...list('pinned').querySelectorAll<HTMLButtonElement>('[data-move-id]')].filter(control => control.dataset.moveId === id);
          const target = buttons.find(control => control.dataset.direction === direction && !control.disabled) || buttons.find(control => !control.disabled);
          if (target) target.focus();
          else {
            const links = [...list('pinned').querySelectorAll<HTMLAnchorElement>('a')];
            (links.find(anchor => anchor.dataset.trackEntry === id) || links[0] || root!.querySelector<HTMLElement>('summary'))?.focus();
          }
        });
        controls.append(button);
      }
      li.append(controls);
    }
    if (manageable) {
      const select = document.createElement('select');
      select.dataset.groupEntry = id;
      select.setAttribute('aria-label', `Group for ${entry.title}`);
      select.append(new Option('Ungrouped', ''));
      for (const group of collection.groups || []) select.append(new Option(group.name, group.name));
      select.value = collection.groups?.find(group => group.ids.includes(id))?.name || '';
      select.addEventListener('change', () => {
        const name = select.value;
        read();
        const group = collection.groups?.find(group => group.name === name);
        if (!collection.saved.includes(id) || (name && !group)) {
          render(); status.textContent = 'Your groups or saved places changed. Please choose again.';
        } else {
          for (const item of collection.groups || []) item.ids = item.ids.filter(value => value !== id);
          group?.ids.push(id);
          save(`${entry.title} moved to ${name || 'Ungrouped'}.`);
        }
        const replacement = [...list('saved').querySelectorAll<HTMLSelectElement>('[data-group-entry]')].find(control => control.dataset.groupEntry === id);
        (replacement || groupFilter).focus();
      });
      li.append(select);
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
    const groups = collection.groups || [];
    if (activeGroup.startsWith('group:') && !groups.some(group => `group:${group.name}` === activeGroup)) activeGroup = '';
    const assigned = new Set(groups.flatMap(group => group.ids));
    groupFilter.replaceChildren(new Option(`All groups (${collection.saved.length})`, ''), new Option(`Ungrouped (${collection.saved.filter(id => !assigned.has(id)).length})`, 'ungrouped'), ...groups.map(group => new Option(`${group.name} (${group.ids.length})`, `group:${group.name}`)));
    groupFilter.value = activeGroup;
    renameGroup.disabled = deleteGroup.disabled = !activeGroup.startsWith('group:');
    const visibleSaved = collection.saved.filter(id => !activeGroup || (activeGroup === 'ungrouped' ? !assigned.has(id) : groups.find(group => `group:${group.name}` === activeGroup)?.ids.includes(id)));
    for (const [name, ids] of [['pinned', collection.pinned], ['recent', recent], ['saved', visibleSaved]] as const) {
      list(name).replaceChildren(...ids.map(id => item(id, name === 'saved', name === 'pinned')));
      root!.querySelector<HTMLElement>(`[data-${name}-empty]`)!.hidden = ids.length > 0;
    }
    root!.querySelector('[data-saved-total]')!.textContent = `(${collection.saved.length})`;
    root!.querySelector<HTMLButtonElement>('[data-clear-recent]')!.disabled = recent.length === 0;
    root!.querySelector<HTMLElement>('[data-saved-empty]')!.textContent = collection.saved.length ? 'No saved places in this group. Choose All groups to assign places.' : 'Use the ☆ buttons below to start your collection.';
  }
  groupFilter.addEventListener('change', () => {
    activeGroup = groupFilter.value;
    groupInput.value = activeGroup.startsWith('group:') ? activeGroup.slice(6) : '';
    read(); render();
  });
  function editGroup(rename: boolean) {
    try {
      const name = groupName(groupInput.value);
      read();
      const groups = collection.groups ||= [];
      const current = rename ? groups.find(group => `group:${group.name}` === activeGroup) : undefined;
      if (rename && !current) throw new Error('Select an existing group to rename.');
      if (groups.some(group => group !== current && group.name.toLowerCase() === name.toLowerCase())) throw new Error('A group with that name already exists.');
      if (current) current.name = name;
      else {
        if (groups.length >= GROUP_LIMIT) throw new Error('You can keep up to 12 groups. Remove one before creating another.');
        groups.push({name, ids: []});
      }
      activeGroup = `group:${name}`;
      save(`${name} ${rename ? 'renamed' : 'created'}. Choose All groups to assign saved places.`);
      groupInput.value = '';
      groupFilter.focus();
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not update groups.'; }
  }
  root.querySelector('[data-group-form]')!.addEventListener('submit', event => { event.preventDefault(); editGroup(false); });
  renameGroup.addEventListener('click', () => editGroup(true));
  deleteGroup.addEventListener('click', () => {
    read();
    const name = activeGroup.slice(6);
    collection.groups = (collection.groups || []).filter(group => group.name !== name);
    activeGroup = 'ungrouped'; groupInput.value = '';
    save(`${name} group removed. Its places are still saved in Ungrouped.`);
    groupFilter.focus();
  });
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
      collection = normalizePersonal(event.detail.saved, collection.pinned, known, collection.groups);
      render();
    }
  });
  for (const name of ['storage', 'pageshow', 'ortunate:personal']) window.addEventListener(name, () => { read(); render(); });
  read(); render(); root.hidden = false;
}
