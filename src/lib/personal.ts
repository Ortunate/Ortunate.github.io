export const personalKeys = {
  saved: 'ortunate:bookmarks:v1',
  pinned: 'ortunate:pinned:v1',
  recent: 'ortunate:recent:v1',
};
export const PIN_LIMIT = 6;
export const RECENT_LIMIT = 8;
export interface PersonalBackup { version: 1; saved: string[]; pinned: string[] }

export function readIds(raw: string | null): string[] {
  try { return uniqueIds(JSON.parse(raw || '[]')); } catch { return []; }
}
function uniqueIds(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
}
export function remember(ids: string[], id: string): string[] {
  return [id, ...ids.filter(item => item !== id)].slice(0, RECENT_LIMIT);
}
export function normalizePersonal(saved: string[], pinned: string[], known: ReadonlySet<string>): PersonalBackup {
  const valid = [...new Set(saved)].filter(id => known.has(id));
  return {version: 1, saved: valid, pinned: [...new Set(pinned)].filter(id => valid.includes(id)).slice(0, PIN_LIMIT)};
}
export function importPersonal(raw: string, current: PersonalBackup, known: ReadonlySet<string>): PersonalBackup {
  if (raw.length > 65_536) throw new Error('Choose a backup smaller than 64 KB.');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 ||
      !('saved' in data) || !Array.isArray(data.saved) || !data.saved.every(id => typeof id === 'string') ||
      !('pinned' in data) || !Array.isArray(data.pinned) || !data.pinned.every(id => typeof id === 'string')) {
    throw new Error('Choose an ortunate version 1 bookmark backup.');
  }
  const imported = normalizePersonal(data.saved, data.pinned, known);
  return normalizePersonal([...current.saved, ...imported.saved], [...current.pinned, ...imported.pinned], known);
}
