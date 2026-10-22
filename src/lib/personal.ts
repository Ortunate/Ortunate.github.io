import {PIN_LIMIT} from './personal-storage.ts';
export {personalKeys, PIN_LIMIT, RECENT_LIMIT, readIds, remember} from './personal-storage.ts';
import {normalizeGroups, type SavedGroup} from './personal-groups.ts';
export {GROUP_LIMIT, groupName, normalizeGroups, readGroups, type SavedGroup} from './personal-groups.ts';
export interface PersonalBackup { version: 1; saved: string[]; pinned: string[]; groups?: SavedGroup[] }
export function mergePersonal(current: PersonalBackup, incoming: PersonalBackup, known: ReadonlySet<string>): PersonalBackup {
  const existing = new Set(current.saved);
  const groups = [...(current.groups || []), ...(incoming.groups || []).map(group => ({...group, ids: group.ids.filter(id => !existing.has(id))}))];
  return normalizePersonal([...current.saved, ...incoming.saved], [...current.pinned, ...incoming.pinned], known, groups);
}

export function normalizePersonal(saved: string[], pinned: string[], known: ReadonlySet<string>, groups?: unknown): PersonalBackup {
  const valid = [...new Set(saved)].filter(id => known.has(id));
  const normalized = normalizeGroups(groups, valid);
  return {version: 1, saved: valid, pinned: [...new Set(pinned)].filter(id => valid.includes(id)).slice(0, PIN_LIMIT), ...(normalized.length ? {groups: normalized} : {})};
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
  const imported = normalizePersonal(data.saved, data.pinned, known, 'groups' in data ? data.groups : undefined);
  return mergePersonal(current, imported, known);
}
