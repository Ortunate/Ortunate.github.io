import {normalizeStory, normalizeStoredStory, validId, type Feed, type NewsCache, type Story, type StoryId} from './news-model.ts';
export * from './news-model.ts';
const API = 'https://hacker-news.firebaseio.com/v0';

export async function loadNews(feed: Feed, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NewsCache> {
  if (feed === 'dev') return loadDevNews(signal, fetcher);
  async function json(path: string): Promise<unknown> {
    signal.throwIfAborted();
    const response = await fetcher(`${API}/${path}.json`, {signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'});
    if (!response.ok) throw new Error('News source unavailable.');
    return response.json();
  }
  const value = await json(`${feed}stories`);
  if (!Array.isArray(value)) throw new Error('Unexpected news response.');
  const ids = [...new Set(value.filter(validId))].slice(0, 12);
  if (!ids.length) throw new Error('No stories available.');
  const stories: (Story | null)[] = Array(ids.length).fill(null);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(4, ids.length)}, async () => {
    while (next < ids.length) {
      const index = next++;
      try {
        const story = normalizeStory(await json(`item/${ids[index]}`));
        if (story?.id === ids[index]) stories[index] = story;
      } catch { signal.throwIfAborted(); }
    }
  }));
  signal.throwIfAborted();
  const available = stories.filter((story): story is Story => story !== null);
  if (!available.length) throw new Error('Stories could not be loaded.');
  return {fetchedAt: Date.now(), stories: available, partial: available.length < ids.length};
}

export async function loadDevNews(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NewsCache> {
  signal.throwIfAborted();
  const response = await fetcher('https://dev.to/api/articles?per_page=12', {
    signal, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: {Accept: 'application/vnd.forem.api-v1+json'},
  });
  if (!response.ok) throw new Error('DEV Community is unavailable.');
  const data: unknown = await response.json();
  signal.throwIfAborted();
  if (!Array.isArray(data)) throw new Error('Unexpected DEV response.');
  const seen = new Set<StoryId>();
  const stories = data.slice(0, 12).flatMap(item => {
    if (!item || !validId(item.id)) return [];
    const story = normalizeStoredStory({id: `dev:${item.id}`, title: item.title, url: item.url,
      time: Math.floor(Date.parse(item.published_at) / 1000), score: item.public_reactions_count, comments: item.comments_count});
    if (!story || seen.has(story.id)) return [];
    seen.add(story.id); return [story];
  });
  if (!stories.length) throw new Error('No DEV articles available.');
  return {fetchedAt: Date.now(), stories, partial: stories.length < Math.min(data.length, 12)};
}
