// Shared by every page; keep collection editing and backup logic out of this module.
export const personalKeys = {
  saved: 'ortunate:bookmarks:v1',
  pinned: 'ortunate:pinned:v1',
  recent: 'ortunate:recent:v1',
  groups: 'ortunate:groups:v1',
};
export const PIN_LIMIT = 6;
export const RECENT_LIMIT = 8;

export function readIds(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string'))] : [];
  } catch { return []; }
}

export function remember(ids: string[], id: string): string[] {
  return [id, ...ids.filter(item => item !== id)].slice(0, RECENT_LIMIT);
}
