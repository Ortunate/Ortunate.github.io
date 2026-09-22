export const feeds = {top: 'Top stories', new: 'Newest', show: 'Show HN'} as const;
export type Feed = keyof typeof feeds;
export interface Story { id: number; title: string; url: string; time: number; score: number; comments: number }
export interface NewsCache { fetchedAt: number; stories: Story[]; partial: boolean }
export const CACHE_TTL = 10 * 60_000;
const API = 'https://hacker-news.firebaseio.com/v0';
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
export const discussionUrl = (id: number) => `https://news.ycombinator.com/item?id=${id}`;

export function normalizeStory(value: unknown): Story | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (!validId(item.id) || item.type !== 'story' || item.deleted || item.dead || typeof item.title !== 'string' || !item.title.trim() ||
      typeof item.time !== 'number' || !Number.isInteger(item.time) || item.time <= 0 || item.time > 8_640_000_000) return null;
  let url = discussionUrl(item.id);
  try {
    const candidate = new URL(String(item.url));
    if (['https:', 'http:'].includes(candidate.protocol) && !candidate.username && !candidate.password) url = candidate.href;
  } catch { /* Text-only posts open their discussion. */ }
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return {id: item.id, title: item.title.trim().slice(0, 500), url, time: item.time, score: count(item.score), comments: count(item.descendants)};
}

export function readNewsCache(raw: string | null, now = Date.now()): NewsCache | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || !Number.isFinite(value.fetchedAt) || value.fetchedAt > now || now - value.fetchedAt > 7 * 86_400_000 || !Array.isArray(value.stories)) return null;
    const seen = new Set<number>();
    const stories = value.stories.slice(0, 12).flatMap((item: Story) => {
      const story = item && normalizeStory({...item, type: 'story', descendants: item.comments});
      if (!story || seen.has(story.id)) return [];
      seen.add(story.id); return [story];
    });
    return stories.length ? {fetchedAt: value.fetchedAt, stories, partial: value.partial === true || stories.length !== value.stories.length} : null;
  } catch { return null; }
}

export async function loadNews(feed: Feed, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<NewsCache> {
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
