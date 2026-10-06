import { games, utilities, visuals } from './catalog';
import { worlds } from './worlds';
import { bookmarks, hubs, type Bookmark } from './discover';

export const exploreHub = {
  title: 'Explore', verb: 'FIND YOUR NEXT ORBIT', heading: 'One place. Every possibility.',
  description: 'Find a tool, start a game, follow an idea. Your whole constellation, together.', glyph: '✳',
};

// Reuse the source catalogs so new entries appear here automatically.
export const exploreEntries: Bookmark[] = [
  ...worlds.filter(w=>w.available&&w.path).map(w=>({id:`world:${w.id}`,title:w.name,url:w.path!,category:'Worlds',description:w.description,badge:w.id==='windward'?'Living garden':w.id==='pelagic'?'Luminous sea':'Thermal sandbox',keywords:w.id==='windward'?'wind grass flowers nature sandbox dimension planting':w.id==='pelagic'?'sea jellyfish fish plankton current light ocean sandbox dimension':'lava heat cooling obsidian cracks material sandbox dimension'})),
  {id:'studio:sound-loom',title:'Sound Loom',url:'/studio/sound-loom/',category:'Create',description:'Weave six voices, explore repeating rhythms, and export a work of your own.',badge:'Sound studio',keywords:'music rhythm sequencer synthesis audio wav generative'},
  {id:'studio:living-canvas',title:'Living Canvas',url:'/studio/living-canvas/',category:'Create',description:'Grow a texture, freeze a detail, and sculpt a work of your own.',badge:'Material studio',keywords:'generative art mineral glaze painting freeze'},
  ...[
    ['reaction','Growth textures','Gray–Scott reaction–diffusion experiments'],
    ['sand','Sand ecology','A cellular material sandbox'],
    ['lenia','Lenia culture','Continuous cellular life and Orbium'],
  ].map(([slug,title,description])=>({id:`lab:${slug}`,title,url:`/lab/${slug}/`,category:'Lab',description,badge:'Experiment',keywords:'simulation compare parameters scan'})),
  ...[{entries: utilities, path: 'tools', category: 'Tools'}, {entries: games, path: 'play', category: 'Games'}, {entries: visuals, path: 'visuals', category: 'Visuals'}].flatMap(({entries, path, category}) =>
    entries.map(entry => ({id: `${path}:${entry.slug}`, title: entry.title, url: `/${path}/${entry.slug}/`, category, description: entry.description, badge: entry.category, keywords: entry.modes.join(' ')}))),
  ...Object.entries(bookmarks).flatMap(([key, entries]) => entries.map(entry => ({...entry, category: hubs[key as keyof typeof hubs].title, keywords: `${entry.category} ${entry.badge}`}))),
];
