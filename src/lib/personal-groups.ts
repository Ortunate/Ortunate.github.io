export const GROUP_LIMIT = 12;
export interface SavedGroup { name: string; ids: string[] }

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
