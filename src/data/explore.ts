import { games, utilities, visuals } from './catalog';
import { bookmarks, hubs, type Bookmark } from './discover';

export const exploreHub = {
  title: 'Explore', verb: 'FIND YOUR NEXT ORBIT', heading: 'One place. Every possibility.',
  description: 'Find a tool, start a game, follow an idea. Your whole constellation, together.', glyph: '✳',
};

// Reuse the source catalogs so new entries appear here automatically.
export const exploreEntries: Bookmark[] = [
  ...[{entries: utilities, path: 'tools', category: 'Tools'}, {entries: games, path: 'play', category: 'Games'}, {entries: visuals, path: 'visuals', category: 'Visuals'}].flatMap(({entries, path, category}) =>
    entries.map(entry => ({id: `${path}:${entry.slug}`, title: entry.title, url: `/${path}/${entry.slug}/`, category, description: entry.description, badge: entry.category, keywords: entry.modes.join(' ')}))),
  ...Object.entries(bookmarks).flatMap(([key, entries]) => entries.map(entry => ({...entry, category: hubs[key as keyof typeof hubs].title, keywords: `${entry.category} ${entry.badge}`}))),
];
