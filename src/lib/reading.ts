import { normalizeStory, type Story } from './news.ts';

export const readingKey = 'ortunate:reading:v1';
export const READING_LIMIT = 50;
export interface ReadingList { version: 1; saved: Story[]; read: number[] }
export function readReadingList(raw: string | null): ReadingList {
  const empty: ReadingList = {version: 1, saved: [], read: []};
  try {
    const data = JSON.parse(raw || 'null');
    if (data?.version !== 1 || !Array.isArray(data.saved) || !Array.isArray(data.read)) return empty;
    const seen = new Set<number>();
    const saved = data.saved.slice(0, 500).flatMap((item: Story) => {
      const story = item && normalizeStory({...item, type: 'story', descendants: item.comments});
      if (!story || seen.has(story.id)) return [];
      seen.add(story.id); return [story];
    }).slice(0, READING_LIMIT);
    const read = [...new Set<number>(data.read.filter((id: unknown): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0))].slice(0, 200);
    return {version: 1, saved, read};
  } catch { return empty; }
}
export function toggleSaved(list: ReadingList, story: Story): ReadingList {
  if (list.saved.some(item => item.id === story.id)) return {...list, saved: list.saved.filter(item => item.id !== story.id)};
  if (list.saved.length >= READING_LIMIT) throw new Error('Your reading list holds 50 stories. Remove one before saving another.');
  return {...list, saved: [story, ...list.saved]};
}
export function toggleRead(list: ReadingList, id: number): ReadingList {
  return {...list, read: list.read.includes(id) ? list.read.filter(value => value !== id) : [id, ...list.read].slice(0, 200)};
}
export function filterStories(stories: Story[], query: string, unread: boolean, read: number[]): Story[] {
  const words = query.normalize('NFKC').toLowerCase().trim().split(/\s+/);
  const readIds = new Set(read);
  return stories.filter(story => (!unread || !readIds.has(story.id)) && words.every(word => `${story.title} ${new URL(story.url).hostname}`.normalize('NFKC').toLowerCase().includes(word)));
}
