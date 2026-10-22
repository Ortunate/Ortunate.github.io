import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import assert from 'node:assert/strict';
import { games, utilities, visuals } from '../src/data/catalog.ts';
const root = resolve('dist');
const routes = ['index.html','projects/index.html','tools/index.html','play/index.html','visuals/index.html','backup/index.html','explore/index.html','news/index.html','markets/index.html','launchpad/index.html','about/index.html','404.html',...games.map(e=>`play/${e.slug}/index.html`),...utilities.map(e=>`tools/${e.slug}/index.html`),...visuals.map(e=>`visuals/${e.slug}/index.html`)];
routes.push(...['kinetic','memory','puzzle','life'].map(s=>`play/${s}/index.html`));
routes.push('lab/index.html',...['reaction','sand','lenia'].map(model=>`lab/${model}/index.html`));
routes.push('studio/index.html','studio/living-canvas/index.html','studio/sound-loom/index.html');
routes.push('worlds/index.html','worlds/windward/index.html','worlds/pelagic/index.html','worlds/ember/index.html');
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
    assert.equal((html.match(/id="appearance-dialog"/g) || []).length, 1, `Expected one appearance dialog: ${file}`);
    assert.equal((html.match(/name="appearance-theme"/g) || []).length, 5, `Missing theme choices: ${file}`);
    assert.equal((html.match(/class="mode-toggle"/g) || []).length, 1, `Missing independent mode button: ${file}`);
    assert.equal((html.match(/name="appearance-system"/g) || []).length, 1, `Missing follow-system option: ${file}`);
    const appearanceScripts = [...html.matchAll(/<script\b[^>]*data-appearance-(?:bootstrap|loader)[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(appearanceScripts.length, 2, `Missing appearance initialization: ${file}`);
    assert.ok(appearanceScripts.reduce((sum, match) => sum + Buffer.byteLength(match[1]), 0) <= 2560, `Appearance inline JS exceeds 2.5 KiB: ${file}`);
    assert.ok(html.indexOf('data-appearance-bootstrap') < html.indexOf('</head>'), `Appearance must initialize before paint: ${file}`);
    assert.match(html, /data-appearance-src="\/_astro\/appearance\.[^"/]+\.js"/, `Appearance controller must be an external on-demand asset: ${file}`);
    if (file.endsWith(join('news','index.html'))) {
      assert.doesNotMatch(html, /data-news-feed|data-news-kind|data-reading-action/, 'Live news interface must be removed');
      assert.match(html, /https:\/\/dev\.to\//, 'DEV source link missing');
    }
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
