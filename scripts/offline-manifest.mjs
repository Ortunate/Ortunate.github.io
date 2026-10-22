import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,posix} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {games} from '../src/data/catalog.ts';
const root=resolve('dist'), bundles={};
function dependencies(url,seen=new Set()){
 if(seen.has(url))return seen;const path=resolve(root,'.'+url+(url.endsWith('/')?'index.html':''));if(!existsSync(path))throw new Error(`Offline dependency missing: ${url}`);seen.add(url);
 if(!/\.(?:html|js|css)$/.test(path))return seen;const source=readFileSync(path,'utf8');
 const refs=url.endsWith('/')?[...source.matchAll(/(?:src|href|data-appearance-src)="([^"?#]+)(?:[^"\s]*)"/g)].map(m=>m[1]):[...source.matchAll(/["'`](\.?\.?\/[^"'`\s]+\.(?:js|css|svg|woff2|png))["'`]/g)].map(m=>m[1]);
 for(const ref of refs){if(ref.startsWith('http')||ref.startsWith('//'))continue;const target=ref.startsWith('/')?ref:posix.resolve(posix.dirname(url),ref);if(!target.startsWith('/_astro/')&&target!=='/favicon.svg')continue;dependencies(target,seen);}return seen;
}
for(const game of games){const urls=[...dependencies(`/play/${game.slug}/`,dependencies('/play/'))].sort();const hash=createHash('sha256');let bytes=0;for(const url of urls){const data=readFileSync(resolve(root,'.'+url+(url.endsWith('/')?'index.html':'')));bytes+=data.length;hash.update(url).update(data);}if(['chess','xiangqi'].includes(game.slug))assert.ok(urls.some(u=>u.includes('/board-ai-')), 'Offline chess must include its Worker');if(['klondike','spider','freecell','chess','xiangqi','poker'].includes(game.slug))assert.ok(urls.filter(u=>u.endsWith('.js')).reduce((n,u)=>n+readFileSync(resolve(root,'.'+u)).length,0)<=120*1024,'Classic game JS exceeds 120 KiB');bundles[game.slug]={version:hash.digest('hex').slice(0,16),bytes,urls};}
writeFileSync(resolve(root,'play/offline-manifest.json'),JSON.stringify({bundles}));
console.log(`Offline dependency manifests generated for ${games.length} games.`);
