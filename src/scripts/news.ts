import { CACHE_TTL, storyDiscussion, feeds, readNewsCache, type Feed, type NewsCache, type StoryId } from '../lib/news-model';
import { filterStories, markStoriesRead, sortStories, readingKey, readReadingList, toggleRead, toggleSaved, type ReadingList, type ReadingSort } from '../lib/reading';

const root = document.querySelector<HTMLElement>('[data-news-feed]');
if (root) {
  const list = root.querySelector<HTMLOListElement>('[data-news-stories]')!;
  const status = root.querySelector<HTMLElement>('[data-news-status]')!;
  const readingStatus = root.querySelector<HTMLElement>('[data-reading-status]')!;
  const search = root.querySelector<HTMLInputElement>('[data-reading-search]')!;
  const unread = root.querySelector<HTMLInputElement>('[data-reading-unread]')!;
  const sort = root.querySelector<HTMLSelectElement>('[data-reading-sort]')!;
  const markVisible = root.querySelector<HTMLButtonElement>('[data-reading-mark-visible]')!;
  const undoButton = root.querySelector<HTMLButtonElement>('[data-reading-undo]')!;
  const refresh = root.querySelector<HTMLButtonElement>('[data-news-refresh]')!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-news-kind]')];
  const memory = new Map<Feed, NewsCache>();
  let feed: Feed | 'saved' = 'top';
  let displayed: NewsCache | undefined;
  let reading: ReadingList = readReadingList(null);
  let memoryOnly = false;
  let undo: {before: StoryId[]; after: string} | null = null;
  let controller: AbortController | undefined;
  let generation = 0;
  const format = (date: number) => new Date(date).toLocaleString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'});
  function readPersonal() {
    if (memoryOnly) return;
    try {
      reading = readReadingList(localStorage.getItem(readingKey));
      if (undo && JSON.stringify(reading.read) !== undo.after) {
        undo = null;
        readingStatus.textContent = 'Read marks changed in another tab. The previous batch can no longer be undone.';
      }
    }
    catch { memoryOnly = true; readingStatus.textContent = 'Browser storage is unavailable. Reading marks and saves last for this visit only.'; }
  }
  function link(label: string, url: string) {
    const anchor = document.createElement('a'); anchor.textContent = label; anchor.href = url;
    anchor.target = '_blank'; anchor.rel = 'noopener noreferrer'; return anchor;
  }
  const stories = () => feed === 'saved' ? reading.saved : displayed?.stories || [];
  const visibleStories = () => sortStories(filterStories(stories(), search.value, unread.checked, reading.read), sort.value as ReadingSort);
  function persistReading(message: string) {
    try { localStorage.setItem(readingKey, JSON.stringify(reading)); } catch { memoryOnly = true; }
    readingStatus.textContent = message + (memoryOnly ? ' Updated for this visit only; browser storage is unavailable.' : '');
    render();
  }
  function render() {
    const visible = visibleStories();
    const unreadCount = visible.filter(story => !reading.read.includes(story.id)).length;
    markVisible.disabled = unreadCount === 0;
    markVisible.textContent = `Mark visible read (${unreadCount})`;
    undoButton.disabled = !undo;
    root!.querySelector('[data-reading-count]')!.textContent = `${visible.length} of ${stories().length} stories`;
    tabs.find(tab => tab.dataset.newsKind === 'saved')!.textContent = `Read later (${reading.saved.length})`;
    list.replaceChildren(...visible.map(story => {
      const item = document.createElement('li');
      const isRead = reading.read.includes(story.id), isSaved = reading.saved.some(saved => saved.id === story.id);
      item.classList.toggle('story-read', isRead);
      const title = document.createElement('h3'); title.append(link(story.title, story.url));
      const meta = document.createElement('div'); meta.className = 'news-story-meta';
      const source = document.createElement('span'); source.textContent = new URL(story.url).hostname.replace(/^www\./, '');
      const time = document.createElement('time'); time.dateTime = new Date(story.time * 1000).toISOString(); time.textContent = format(story.time * 1000); time.title = new Date(story.time * 1000).toString();
      const score = document.createElement('span'); score.textContent = `${story.score} ${typeof story.id === 'number' ? 'points' : 'reactions'}`;
      meta.append(source, time, score, link(`${story.comments} comments`, storyDiscussion(story)));
      const actions = document.createElement('div'); actions.className = 'reading-actions';
      for (const [kind, selected, label] of [['save', isSaved, isSaved ? 'Saved' : 'Read later'], ['read', isRead, isRead ? 'Mark unread' : 'Mark read']] as const) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.dataset.readingAction = `${kind}-${story.id}`;
        button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-label', `${kind === 'save' && isSaved ? 'Remove from read later' : label}: ${story.title}`);
        button.addEventListener('click', () => {
          readPersonal();
          try {
            reading = kind === 'save' ? toggleSaved(reading, story) : toggleRead(reading, story.id);
            if (kind === 'read') undo = null;
            persistReading('Reading list updated. Saved headlines remain available after the feed changes.');
            (list.querySelector<HTMLButtonElement>(`[data-reading-action="${kind}-${story.id}"]`) || list.querySelector<HTMLButtonElement>('[data-reading-action]') || search).focus();
          } catch (error) { readingStatus.textContent = error instanceof Error ? error.message : 'Could not update your list.'; }
        });
        actions.append(button);
      }
      item.append(title, meta, actions); return item;
    }));
    if (!visible.length) {
      const empty = document.createElement('li'); empty.className = 'reading-empty';
      empty.textContent = stories().length ? 'No matching stories. Clear your search or turn off Unread only.' : feed === 'saved' ? 'Save a story from any feed to start your reading list.' : 'Headlines will appear here when available.';
      list.append(empty);
    }
  }
  async function load(force = false) {
    controller?.abort();
    const token = ++generation;
    tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.newsKind === feed)));
    refresh.hidden = feed === 'saved';
    list.setAttribute('aria-busy', 'false');
    if (feed === 'saved') {
      readPersonal(); render();
      status.textContent = 'Your saved headlines. Scores and comment counts are snapshots from when saved. Open a link to read the article online.';
      return;
    }
    const selected = feed;
    const key = `ortunate:news:${selected}:v1`;
    let cached = memory.get(selected);
    if (!cached) {
      try { cached = readNewsCache(localStorage.getItem(key)) || undefined; } catch { /* Memory cache remains available. */ }
    }
    displayed = cached; render();
    if (!force && cached && !cached.partial && Date.now() - cached.fetchedAt < CACHE_TTL) {
      status.textContent = `${feeds[selected]} · Cached update from ${format(cached.fetchedAt)}. Refresh for a new snapshot.`;
      refresh.disabled = false; return;
    }
    const request = new AbortController(); controller = request;
    const timer = setTimeout(() => request.abort(), 12_000);
    refresh.disabled = true; list.setAttribute('aria-busy', 'true');
    status.textContent = cached ? `Updating ${feeds[selected].toLowerCase()}… Showing cached stories from ${format(cached.fetchedAt)}.` : `Loading ${feeds[selected].toLowerCase()}…`;
    try {
      const {loadNews} = await import('../lib/news');
      const result = await loadNews(selected, request.signal);
      if (token !== generation) return;
      memory.set(selected, result); displayed = result; render();
      let persisted = true;
      try { localStorage.setItem(key, JSON.stringify(result)); } catch { persisted = false; }
      status.textContent = `${result.stories.length} stories · Updated ${format(result.fetchedAt)}.${result.partial ? ' Some stories are unavailable; refresh to retry.' : ''}${persisted ? '' : ' Cache lasts for this visit only.'}`;
    } catch {
      if (token !== generation) return;
      status.textContent = cached ? `Could not update. Showing cached stories from ${format(cached.fetchedAt)}. Try Refresh or read at the source.` : 'Could not load stories. Try Refresh or visit the source links above.';
    } finally {
      clearTimeout(timer);
      if (token === generation) { refresh.disabled = false; list.setAttribute('aria-busy', 'false'); }
    }
  }
  tabs.forEach(tab => tab.addEventListener('click', () => { feed = tab.dataset.newsKind as Feed | 'saved'; void load(); }));
  refresh.addEventListener('click', () => void load(true));
  search.addEventListener('input', render);
  unread.addEventListener('change', render);
  sort.addEventListener('change', render);
  markVisible.addEventListener('click', () => {
    const ids = visibleStories().map(story => story.id);
    readPersonal();
    const count = ids.filter(id => !reading.read.includes(id)).length;
    if (!count) { render(); readingStatus.textContent = 'These stories are already marked read.'; return; }
    const before = [...reading.read];
    reading = markStoriesRead(reading, ids);
    undo = {before, after: JSON.stringify(reading.read)};
    persistReading(`${count} visible stories marked read. Undo is available until the read marks change again.`);
    undoButton.focus();
  });
  undoButton.addEventListener('click', () => {
    readPersonal();
    if (!undo) { render(); search.focus(); return; }
    reading = {...reading, read: undo.before}; undo = null;
    persistReading('Batch undone. Previous read marks restored.');
    (markVisible.disabled ? search : markVisible).focus();
  });
  window.addEventListener('storage', event => { if (event.key === readingKey || event.key === null) { readPersonal(); render(); } });
  window.addEventListener('pageshow', () => { readPersonal(); render(); });
  root.querySelectorAll<HTMLElement>('[data-news-controls], [data-reading-controls], [data-reading-status]').forEach(element => element.hidden = false);
  readPersonal(); void load();
}
