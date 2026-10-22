export type StoryId = number | `dev:${number}`;
export interface Story { id: StoryId; title: string; url: string; time: number; score: number; comments: number }
export const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
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

export function validStoryId(value: unknown): value is StoryId {
  return validId(value) || (typeof value === 'string' && /^dev:[1-9]\d*$/.test(value) && validId(Number(value.slice(4))));
}
export function normalizeStoredStory(value: unknown): Story | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string') return normalizeStory({...item, type: 'story', descendants: item.comments});
  if (!validStoryId(item.id)) return null;
  try {
    const url = new URL(String(item.url));
    if (url.protocol !== 'https:' || url.hostname !== 'dev.to' || url.username || url.password) return null;
  } catch { return null; }
  const story = normalizeStory({...item, id: Number(item.id.slice(4)), type: 'story', descendants: item.comments});
  return story ? {...story, id: item.id} : null;
}
