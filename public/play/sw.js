/* Explicit downloads only. No automatic whole-site or external caching. */
const META='play-offline-meta-v1',PREFIX='play-offline-v1-',LIMIT=20*1024*1024;
const metaURL=new URL('/play/offline-state',self.location.origin).href;
async function state(){const c=await caches.open(META),r=await c.match(metaURL);return r?await r.json():{};}
async function write(s){const c=await caches.open(META);await c.put(metaURL,new Response(JSON.stringify(s)));}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
let queue=Promise.resolve();
self.addEventListener('message',e=>{const port=e.ports[0];if(!port)return;const send=data=>port.postMessage(data);queue=queue.catch(()=>{}).then(async()=>{const s=await state(),{action,slug}=e.data;
if(action==='status'){send({done:true,state:s});return;}
if(!/^[a-z0-9-]+$/.test(slug||''))throw new Error('Invalid game.');
if(action==='remove'){delete s[slug];await write(s);for(const name of await caches.keys())if(name.startsWith(PREFIX+slug+'-'))await caches.delete(name);send({done:true,state:s});return;}
if(action!=='download')throw new Error('Unknown action.');
const response=await fetch('/play/offline-manifest.json',{cache:'no-store'});if(!response.ok)throw new Error('Connect to the internet to download.');const manifest=await response.json(),bundle=manifest.bundles[slug];if(!bundle||bundle.bytes>LIMIT)throw new Error('This download exceeds the 20 MiB limit.');
const name=PREFIX+slug+'-'+bundle.version;if(s[slug]?.name===name){send({done:true,state:s});return;}
const names=(await caches.keys()).filter(n=>n.startsWith(PREFIX));let used=0;for(const n of names){const c=await caches.open(n);for(const req of await c.keys()){const r=await c.match(req);used+=(await r.arrayBuffer()).byteLength;}}
if(used+bundle.bytes>LIMIT)throw new Error('20 MiB offline limit reached. Remove an old download first.');
const staging=await caches.open(name);try{let bytes=0;for(let i=0;i<bundle.urls.length;i++){const url=bundle.urls[i];if(!/^\/(?:play\/|_astro\/|favicon\.svg$)/.test(url)||url.includes('..'))throw new Error('Invalid download manifest.');const r=await fetch(url,{cache:'no-store'});if(!r.ok||new URL(r.url).origin!==self.location.origin)throw new Error('Download interrupted. Your previous version is still available.');const data=await r.clone().arrayBuffer();bytes+=data.byteLength;if(bytes+used>LIMIT)throw new Error('Offline size limit exceeded.');await staging.put(url,r);send({progress:Math.round((i+1)/bundle.urls.length*100)});}s[slug]={name,bytes,version:bundle.version};await write(s);send({done:true,state:s});}catch(error){await caches.delete(name);throw error;}
}).catch(error=>send({error:error.message||'Download failed. Check storage and connectivity.'}));e.waitUntil(queue);});
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);if(e.request.method!=='GET'||url.origin!==self.location.origin||url.pathname==='/play/sw.js'||url.pathname==='/play/offline-manifest.json')return;
e.respondWith((async()=>{try{const response=await fetch(e.request);if(!response.ok)throw new Error('Network response unavailable');return response;}catch(error){const s=await state(),slug=url.pathname.split('/')[2],preferred=s[slug];const names=[...(preferred?[preferred.name]:[]),...Object.values(s).map(x=>x.name),...(await caches.keys()).filter(n=>n.startsWith(PREFIX))];for(const name of new Set(names)){const r=await(await caches.open(name)).match(url.pathname);if(r)return r;}if(e.request.mode==='navigate')return new Response('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Not downloaded</title><h1>This game is not downloaded.</h1><p>Reconnect to download it, or choose a saved game.</p><a href="/play/">Back to Play</a></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});throw error;}})());});
