import {mergePersonal, normalizePersonal, personalKeys, readGroups, readIds, type PersonalBackup} from './personal.ts';
import {readReadingList, readingKey, READING_LIMIT, type ReadingList} from './reading.ts';
import {readWatchlist, watchlistKey, WATCH_LIMIT, type WatchedSymbol} from './watchlist.ts';

export const sectionNames = {bookmarks: 'Saved places, pins & groups', reading: 'Saved news & read marks', watchlist: 'Watchlist & research notes'};
export const BACKUP_LIMIT = 262_144;
export type Section = keyof typeof sectionNames;
export interface Sections { bookmarks?: PersonalBackup; reading?: ReadingList; watchlist?: WatchedSymbol[] }
export interface Backup { format: 'ortunate'; version: 1; sections: Sections }
export interface StoragePort {getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void}
export const sectionKeys: Record<Section, string[]> = {bookmarks: [personalKeys.saved, personalKeys.pinned, personalKeys.groups], reading: [readingKey], watchlist: [watchlistKey]};

export function snapshot(storage: StoragePort, selected: Section[]): string {
  return JSON.stringify(selected.flatMap(section => sectionKeys[section]).map(key => [key, storage.getItem(key)]));
}
export function readSections(storage: StoragePort, known: Set<string>): Sections {
  const saved = readIds(storage.getItem(personalKeys.saved));
  return {
    bookmarks: normalizePersonal(saved, readIds(storage.getItem(personalKeys.pinned)), known, readGroups(storage.getItem(personalKeys.groups), saved)),
    reading: readReadingList(storage.getItem(readingKey)),
    watchlist: readWatchlist(storage.getItem(watchlistKey)),
  };
}
export function parseBackup(raw: string, known: Set<string>): Backup {
  if (raw.length > BACKUP_LIMIT || new TextEncoder().encode(raw).byteLength > BACKUP_LIMIT) throw new Error('Choose a backup no larger than 256 KB.');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('This file is not valid JSON.'); }
  // Accept the original bookmark-only export without changing its format.
  if (value?.version === 1 && !value.format && Array.isArray(value.saved) && Array.isArray(value.pinned)) value = {format: 'ortunate', version: 1, sections: {bookmarks: value}};
  if (value?.format !== 'ortunate' || value.version !== 1 || !value.sections || typeof value.sections !== 'object' || Array.isArray(value.sections)) throw new Error('Choose a supported ortunate backup (version 1).');
  const sections: Sections = {};
  const data = value.sections;
  if (Object.hasOwn(data, 'bookmarks')) {
    const item = data.bookmarks;
    if (item?.version !== 1 || !Array.isArray(item.saved) || !Array.isArray(item.pinned) || ![...item.saved, ...item.pinned].every(id => typeof id === 'string')) throw new Error('Saved-place data is invalid.');
    sections.bookmarks = normalizePersonal(item.saved, item.pinned, known, item.groups);
  }
  if (Object.hasOwn(data, 'reading')) {
    const item = data.reading;
    if (item?.version !== 1 || !Array.isArray(item.saved) || !Array.isArray(item.read)) throw new Error('Reading-list data is invalid.');
    sections.reading = readReadingList(JSON.stringify(item));
  }
  if (Object.hasOwn(data, 'watchlist')) {
    if (!Array.isArray(data.watchlist)) throw new Error('Watchlist data is invalid.');
    sections.watchlist = readWatchlist(JSON.stringify(data.watchlist));
  }
  if (!Object.keys(sections).length) throw new Error('No supported categories found in this backup.');
  return {format: 'ortunate', version: 1, sections};
}
function mergeItems<T>(current: T[], incoming: T[], id: (item: T) => string | number, limit: number): T[] {
  const seen = new Set(current.map(id));
  return [...current, ...incoming.filter(item => { if (seen.has(id(item))) return false; seen.add(id(item)); return true; })].slice(0, limit);
}
export function mergeSections(current: Sections, incoming: Sections, selected: Section[], known: Set<string>): Sections {
  const result: Sections = {};
  if (selected.includes('bookmarks') && incoming.bookmarks) {
    const a = current.bookmarks!, b = incoming.bookmarks;
    result.bookmarks = mergePersonal(a, b, known);
  }
  if (selected.includes('reading') && incoming.reading) {
    const a = current.reading!, b = incoming.reading;
    result.reading = {version: 1, saved: mergeItems(a.saved, b.saved, item => item.id, READING_LIMIT), read: mergeItems(a.read, b.read, id => id, 200)};
  }
  if (selected.includes('watchlist') && incoming.watchlist) result.watchlist = mergeItems(current.watchlist!, incoming.watchlist, item => item.id, WATCH_LIMIT);
  return result;
}
export function sectionSummary(section: Section, data: Sections): string {
  if (section === 'bookmarks') return `${data.bookmarks?.saved.length || 0} places / ${data.bookmarks?.pinned.length || 0} pins / ${data.bookmarks?.groups?.length || 0} groups`;
  if (section === 'reading') return `${data.reading?.saved.length || 0} stories / ${data.reading?.read.length || 0} read marks`;
  return `${data.watchlist?.length || 0} symbols`;
}
export function writeSections(storage: StoragePort, data: Sections): void {
  const updates: [string, string][] = [];
  if (data.bookmarks) updates.push([personalKeys.saved, JSON.stringify(data.bookmarks.saved)], [personalKeys.pinned, JSON.stringify(data.bookmarks.pinned)], [personalKeys.groups, JSON.stringify(data.bookmarks.groups || [])]);
  if (data.reading) updates.push([readingKey, JSON.stringify(data.reading)]);
  if (data.watchlist) updates.push([watchlistKey, JSON.stringify(data.watchlist)]);
  const previous = updates.map(([key]) => [key, storage.getItem(key)] as const);
  try { for (const [key, value] of updates) storage.setItem(key, value); }
  catch {
    let rollbackFailed = false;
    for (const [key, value] of previous) {
      try { if (value === null) storage.removeItem(key); else storage.setItem(key, value); } catch { rollbackFailed = true; }
    }
    throw new Error(rollbackFailed ? 'Storage failed and some changes could not be rolled back. Keep your backup and check each collection.' : 'Storage failed. Previous data was restored; nothing was imported.');
  }
}
