import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import assert from 'node:assert/strict';
import { games, utilities, visuals } from '../src/data/catalog.ts';
const root = resolve('dist');
const routes = ['index.html','projects/index.html','tools/index.html','play/index.html','visuals/index.html','about/index.html','404.html',...games.map(e=>`play/${e.slug}/index.html`),...utilities.map(e=>`tools/${e.slug}/index.html`),...visuals.map(e=>`visuals/${e.slug}/index.html`)];
for (const route of routes) assert.ok(existsSync(join(root,route)), `Missing page: ${route}`);
let checked = 0;
function walk(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const file = join(directory,entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (extname(file) !== '.html') continue;
    const html = readFileSync(file,'utf8');
    assert.match(html, /<html[^>]+lang="en"/, `Missing English language: ${file}`);
    assert.match(html, /<title>[^<]+<\/title>/, `Missing title: ${file}`);
    assert.doesNotMatch(html, />Projects<|Explore projects|Things I've built/, `Old project navigation in ${file}`);
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)[^\"]*"/g)) {
      const link = match[1]; if (link.startsWith('//')) continue;
      const target = join(root,decodeURIComponent(link));
      const exists = existsSync(target);
      assert.ok(exists, `Broken link ${link} in ${file}`);
      if (statSync(target).isDirectory()) assert.ok(existsSync(join(target,'index.html')), `Missing index for ${link}`);
      checked++;
    }
  }
}
walk(root);
console.log(`Verified ${routes.length} pages and ${checked} local links/assets.`);
