import { normalizeStoredStory, validStoryId, type Story, type StoryId } from './news-model.ts';

export const readingKey = 'ortunate:reading:v1';
export const READING_LIMIT = 50;
export interface ReadingList { version: 1; saved: Story[]; read: StoryId[] }
export type ReadingSort = 'source' | 'time' | 'score' | 'comments';
export function sortStories(stories: Story[], sort: ReadingSort): Story[] {
  return sort === 'source' ? [...stories] : [...stories].sort((a, b) => b[sort] - a[sort]);
}
export function markStoriesRead(list: ReadingList, ids: StoryId[]): ReadingList {
  const current = new Set(list.read);
  const added = [...new Set(ids)].filter(id => validStoryId(id) && !current.has(id));
  return {...list, read: [...added, ...list.read].slice(0, 200)};
}
export function readReadingList(raw: string | null): ReadingList {
  const empty: ReadingList = {version: 1, saved: [], read: []};
  try {
    const data = JSON.parse(raw || 'null');
    if (data?.version !== 1 || !Array.isArray(data.saved) || !Array.isArray(data.read)) return empty;
    const seen = new Set<StoryId>();
    const saved = data.saved.slice(0, 500).flatMap((item: Story) => {
      const story = item && normalizeStoredStory(item);
      if (!story || seen.has(story.id)) return [];
      seen.add(story.id); return [story];
    }).slice(0, READING_LIMIT);
    const read = [...new Set<StoryId>(data.read.filter(validStoryId))].slice(0, 200);
    return {version: 1, saved, read};
  } catch { return empty; }
}
export function toggleSaved(list: ReadingList, story: Story): ReadingList {
  if (list.saved.some(item => item.id === story.id)) return {...list, saved: list.saved.filter(item => item.id !== story.id)};
  if (list.saved.length >= READING_LIMIT) throw new Error('Your reading list holds 50 stories. Remove one before saving another.');
  return {...list, saved: [story, ...list.saved]};
}
export function toggleRead(list: ReadingList, id: StoryId): ReadingList {
  return {...list, read: list.read.includes(id) ? list.read.filter(value => value !== id) : [id, ...list.read].slice(0, 200)};
}
export function filterStories(stories: Story[], query: string, unread: boolean, read: StoryId[]): Story[] {
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/);
  const readIds = new Set(read);
  return stories.filter(story => (!unread || !readIds.has(story.id)) && words.every(word => `${story.title} ${new URL(story.url).hostname}`.normalize('NFKC').toLowerCase().includes(word)));
}
