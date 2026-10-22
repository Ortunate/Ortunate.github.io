import { normalizeStoredStory, validStoryId, type Story, type StoryId } from './news-model.ts';

export const readingKey = 'ortunate:reading:v1';
export const READING_LIMIT = 50;
export interface ReadingList { version: 1; saved: Story[]; read: StoryId[] }
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
