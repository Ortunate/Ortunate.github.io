import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,posix} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {games} from '../src/data/catalog.ts';
import {minifySync} from 'rolldown/utils';
const root=resolve('dist'), bundles={};
// Public files bypass Vite; ship the same optimized worker tested below.
const worker=minifySync('sw.js',readFileSync('public/play/sw.js','utf8'),{mangle:{toplevel:true}});
assert.ok(!worker.errors?.length, 'Service worker minification failed');
writeFileSync(resolve(root,'play/sw.js'),worker.code);
function dependencies(url,seen=new Set()){
 if(seen.has(url))return seen;const path=resolve(root,'.'+url+(url.endsWith('/')?'index.html':''));if(!existsSync(path))throw new Error(`Offline dependency missing: ${url}`);seen.add(url);
 if(!/\.(?:html|js|css)$/.test(path))return seen;const source=readFileSync(path,'utf8');
 const refs=url.endsWith('/')?[...source.matchAll(/(?:src|href|data-appearance-src)="([^"?#]+)(?:[^"\s]*)"/g)].map(m=>m[1]):[...source.matchAll(/["'`](\.?\.?\/[^"'`\s]+\.(?:js|css|svg|woff2|png))["'`]/g)].map(m=>m[1]);
 for(const ref of refs){if(ref.startsWith('http')||ref.startsWith('//'))continue;const target=ref.startsWith('/')?ref:posix.resolve(posix.dirname(url),ref);if(!target.startsWith('/_astro/')&&target!=='/favicon.svg')continue;dependencies(target,seen);}return seen;
}
const paths=[...new Set(games.flatMap(game=>[...dependencies(`/play/${game.slug}/`,dependencies('/play/'))]))].sort();
const file=url=>resolve(root,'.'+url+(url.endsWith('/')?'index.html':''));
const digest=data=>createHash('sha256').update(data).digest('hex');
// Strip the generated marker so re-running this post-build step is deterministic.
for(const url of paths.filter(u=>u.endsWith('/'))){const p=file(url);writeFileSync(p,readFileSync(p,'utf8').replace(/<meta name="play-build" content="[a-f0-9]+">/g,''));}
const build=digest(Buffer.concat(paths.flatMap(url=>[Buffer.from(url),readFileSync(file(url))]))).slice(0,20);
for(const url of paths.filter(u=>u.endsWith('/'))){const p=file(url);writeFileSync(p,readFileSync(p,'utf8').replace('</head>',`<meta name="play-build" content="${build}"></head>`));}
const resources={};for(const url of paths){const data=readFileSync(file(url));resources[url]={hash:digest(data),bytes:data.length};}
for(const game of games){const urls=[...dependencies(`/play/${game.slug}/`,dependencies('/play/'))].sort();const bytes=urls.reduce((n,u)=>n+resources[u].bytes,0);if(['chess','xiangqi'].includes(game.slug))assert.ok(urls.some(u=>u.includes('/board-ai-')),'Offline chess must include its Worker');if(['klondike','spider','freecell','chess','xiangqi','poker'].includes(game.slug))assert.ok(urls.filter(u=>u.endsWith('.js')).reduce((n,u)=>n+resources[u].bytes,0)<=120*1024,'Classic game JS exceeds 120 KiB');bundles[game.slug]={version:build,bytes,urls};}
const manifest={schema:2,build,resources,bundles};writeFileSync(resolve(root,'play/offline-manifest.json'),JSON.stringify(manifest));
const unique=new Map(Object.values(resources).map(r=>[r.hash,r.bytes]));const footprint=[...unique.values()].reduce((a,b)=>a+b,0)+Buffer.byteLength(JSON.stringify(manifest));assert.ok(footprint<=400*1024,`Offline resources + manifest exceed 400 KiB: ${footprint}`);
console.log(`Offline v2: ${games.length} games, ${(footprint/1024).toFixed(1)} KiB unique content + manifest.`);
