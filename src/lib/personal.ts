import {PIN_LIMIT} from './personal-storage.ts';
export {personalKeys, PIN_LIMIT, RECENT_LIMIT, readIds, remember} from './personal-storage.ts';
export const GROUP_LIMIT = 12;
export interface SavedGroup { name: string; ids: string[] }
export interface PersonalBackup { version: 1; saved: string[]; pinned: string[]; groups?: SavedGroup[] }

export function groupName(raw: string): string {
  const name = raw.normalize('NFKC').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 40) throw new Error('Use a group name of 1–40 characters.');
  return name;
}
export function normalizeGroups(value: unknown, saved: string[]): SavedGroup[] {
  if (!Array.isArray(value)) return [];
  const groups: SavedGroup[] = [], assigned = new Set<string>(), allowed = new Set(saved);
  for (const item of value.slice(0, 1000)) {
    if (!item || typeof item.name !== 'string' || !Array.isArray(item.ids)) continue;
    let name: string;
    try { name = groupName(item.name); } catch { continue; }
    let group = groups.find(group => group.name.toLowerCase() === name.toLowerCase());
    if (!group) {
      if (groups.length >= GROUP_LIMIT) continue;
      groups.push(group = {name, ids: []});
    }
    for (const id of item.ids) if (typeof id === 'string' && allowed.has(id) && !assigned.has(id)) {
      group.ids.push(id); assigned.add(id);
    }
  }
  return groups;
}
export function readGroups(raw: string | null, saved: string[]): SavedGroup[] {
  try { return normalizeGroups(JSON.parse(raw || '[]'), saved); } catch { return []; }
}
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
