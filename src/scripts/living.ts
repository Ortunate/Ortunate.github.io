import { decodeArtwork, encodeArtwork, FILE_LIMIT, SIZE, type Artwork, type Brush } from '../lib/living/engine.ts';
import { renderArtwork } from '../lib/living/render.ts';
import { listArtworks, removeArtwork, saveArtwork } from '../lib/living/storage.ts';
import type { LivingMessage } from '../lib/living/runtime.ts';

const root=document.getElementById('living-studio');
if(root)initialize(root);
function initialize(root:HTMLElement){
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(`living-${id}`) as T;
  const input=(id:string)=>el<HTMLInputElement>(id);
  const canvas=el<HTMLCanvasElement>('canvas'),ctx=canvas.getContext('2d')!;
  const worker=new Worker(new URL('./living.worker.ts',import.meta.url),{type:'module'});
  const renderer=new Worker(new URL('./living-render.worker.ts',import.meta.url),{type:'module'});
  const renderRequests=new Map<number,{resolve:(pixels:Uint8ClampedArray<ArrayBuffer>)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  let renderSequence=0,renderBusy=false,renderFallback=false;
  function raster(doc:Artwork,size:number,regions=false):Promise<Uint8ClampedArray<ArrayBuffer>>{
    if(renderFallback)return Promise.resolve(renderArtwork(doc,size,regions));
    return new Promise((resolve,reject)=>{const id=++renderSequence,timer=setTimeout(()=>{renderRequests.delete(id);reject(new Error('Material renderer timed out.'));},20000);renderRequests.set(id,{resolve,reject,timer});renderer.postMessage({id,artwork:doc,size,regions});});
  }
  renderer.onmessage=event=>{const request=renderRequests.get(event.data.id);if(!request)return;clearTimeout(request.timer);renderRequests.delete(event.data.id);event.data.error?request.reject(new Error(event.data.error)):request.resolve(event.data.pixels);};
  renderer.onerror=event=>{event.preventDefault();renderFallback=true;renderer.terminate();for(const request of renderRequests.values()){clearTimeout(request.timer);request.reject(new Error('Material worker unavailable; using the slower fallback renderer.'));}renderRequests.clear();};
  let artwork:Artwork|undefined,running=false,preparing=true,brush:Brush='seed',canUndo=false,busy=false,dirty=true,revision=0,seq=0,dead=false;
  let needsDraw=false,lastDraw=0,raf=0,activePointer:number|undefined,restoring=false;
  const pending=new Map<number,{resolve:(data:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const status=(text:string,error=false)=>{el('status').textContent=text;el('status').dataset.error=String(error);};
  const changed=()=>{dirty=true;revision++;el('dirty').textContent='Unsaved changes';};
  const rpc=(command:string,data?:unknown):Promise<any>=>new Promise((resolve,reject)=>{
    if(dead){reject(new Error('The studio worker is unavailable. Reload the page.'));return;}
    const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error('The studio did not respond. Please reload.'));},20000);
    pending.set(id,{resolve,reject,timer});worker.postMessage({id,command,data});
  });
  const act=(fn:()=>Promise<unknown>)=>{void fn().catch(error=>status(error instanceof Error?error.message:'Operation failed.',true));};
  function controls(){
    for(const control of root.querySelectorAll<HTMLButtonElement|HTMLInputElement|HTMLSelectElement>('button,input,select'))control.disabled=busy||(preparing&&control.id!=='living-run');
    el<HTMLButtonElement>('undo').disabled=busy||preparing||!canUndo;
    el('run').textContent=preparing?'Pause preparation':running?'Pause Ⅱ':'Grow ▶';
    el('state').textContent=preparing?'PREPARING':running?'GROWING':'PAUSED';
    root.setAttribute('aria-busy',String(busy||preparing));
  }
  async function exclusive(fn:()=>Promise<void>){if(busy||activePointer!==undefined)return;busy=true;controls();try{await fn();}finally{busy=false;controls();}}
  async function draw(){if(!artwork||renderBusy)return;renderBusy=true;const source=artwork;try{const pixels=await raster(source,512,input('regions').checked);if(!dead)ctx.putImageData(new ImageData(pixels,512,512),0,0);lastDraw=performance.now();}catch(error){status(error instanceof Error?error.message:'Rendering failed.',true);}finally{renderBusy=false;if(needsDraw&&!dead)invalidate();}}
  function paintFrame(){raf=0;if(!needsDraw||renderBusy)return;if(performance.now()-lastDraw<90){raf=requestAnimationFrame(paintFrame);return;}needsDraw=false;void draw();}
  function invalidate(){needsDraw=true;if(!raf)raf=requestAnimationFrame(paintFrame);}
  worker.onmessage=(event:MessageEvent<LivingMessage>)=>{
    const m=event.data;
    if(m.type==='reply'){const request=pending.get(m.id!);if(request){clearTimeout(request.timer);pending.delete(m.id!);m.error?request.reject(new Error(m.error)):request.resolve(m.data);}return;}
    const wasPreparing=preparing;
    if(artwork&&artwork.tick!==m.data.artwork.tick&&!restoring)changed();
    restoring=false;
    artwork=m.data.artwork;running=m.data.running;preparing=m.data.preparing;canUndo=m.data.canUndo;
    el('tick').textContent=`STEP ${artwork!.tick.toLocaleString()}`;
    for(const key of ['light','relief'] as const){if(document.activeElement!==input(key))input(key).value=String(artwork!.finish[key]);el(`${key}-value`).textContent=`${input(key).value}${key==='light'?'°':''}`;}
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-material]'))button.setAttribute('aria-pressed',String(button.dataset.material===artwork!.finish.material));
    el('material-caption').textContent=artwork!.finish.material==='mineral'?'MINERAL / WARM BRONZE':'GLAZE / DEEP CELADON';
    if(wasPreparing&&!preparing)status('Your material is ready. Grow it, plant a mark, or freeze a detail.');
    controls();invalidate();
  };
  worker.onerror=event=>{event.preventDefault();dead=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Studio worker failed.'));}pending.clear();status('The studio worker stopped. Your saved artworks are safe; reload to restart.',true);};
  const brushHints:Record<Brush,string>={seed:'Plant a living texture. Frozen areas are protected.',freeze:'Hold this texture exactly as it is. Its neighbors can still grow.',thaw:'Release frozen areas so they can evolve again.',barrier:'Draw a boundary that blocks diffusion. Frozen areas stay protected.',erase:'Clear texture, freezing and barriers. Leave room to begin again.'};
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-brush]'))button.addEventListener('click',()=>{
    brush=button.dataset.brush as Brush;for(const other of root.querySelectorAll('[data-brush]'))other.setAttribute('aria-pressed',String(other===button));el('brush-hint').textContent=brushHints[brush];
  });
  input('radius').addEventListener('input',()=>{el('radius-value').textContent=input('radius').value;});
  input('regions').addEventListener('change',invalidate);
  const finish=async(material=artwork!.finish.material)=>{if(!artwork)return;await rpc('finish',{material,light:Number(input('light').value),relief:Number(input('relief').value)});changed();};
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-material]'))button.addEventListener('click',()=>act(()=>finish(button.dataset.material as Artwork['finish']['material'])));
  for(const key of ['light','relief'])input(key).addEventListener('input',()=>act(()=>finish()));
  el('speed').addEventListener('change',()=>act(()=>rpc('speed',Number(input('speed').value))));
  el('run').addEventListener('click',()=>act(async()=>{await rpc(running||preparing?'pause':'run');}));
  el('step').addEventListener('click',()=>act(()=>rpc('step')));
  el('undo').addEventListener('click',()=>act(async()=>{await rpc('undo');changed();}));
  input('name').addEventListener('input',changed);

  const cursor=el('cursor');let last={x:128,y:128};let strokeBrush:Brush='seed',strokeRadius=6;
  function showCursor(x:number,y:number){cursor.hidden=false;cursor.style.left=`${x/SIZE*100}%`;cursor.style.top=`${y/SIZE*100}%`;cursor.style.width=cursor.style.height=`${Number(input('radius').value)*2/SIZE*100}%`;}
  function point(event:PointerEvent){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(SIZE-1,(event.clientX-r.left)/r.width*SIZE)),y:Math.max(0,Math.min(SIZE-1,(event.clientY-r.top)/r.height*SIZE))};}
  function strokeTo(p:{x:number;y:number}){
    const count=Math.max(1,Math.ceil(Math.hypot(p.x-last.x,p.y-last.y)/Math.max(1,strokeRadius/2)));
    const points=Array.from({length:count},(_,i)=>({x:last.x+(p.x-last.x)*(i+1)/count,y:last.y+(p.y-last.y)*(i+1)/count}));
    last=p;act(()=>rpc('paint',{kind:strokeBrush,radius:strokeRadius,points}));changed();
  }
  canvas.addEventListener('pointerdown',event=>{
    if(busy||preparing||activePointer!==undefined||event.button!==0)return;
    event.preventDefault();canvas.focus();activePointer=event.pointerId;canvas.setPointerCapture(event.pointerId);
    last=point(event);strokeBrush=brush;strokeRadius=Number(input('radius').value);showCursor(last.x,last.y);
    act(()=>rpc('stroke'));strokeTo(last);
  });
  canvas.addEventListener('pointermove',event=>{const p=point(event);showCursor(p.x,p.y);if(event.pointerId===activePointer)strokeTo(p);});
  const end=(event:PointerEvent)=>{if(event.pointerId===activePointer)activePointer=undefined;};
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('lostpointercapture',end);
  canvas.addEventListener('pointerleave',()=>{if(activePointer===undefined)cursor.hidden=true;});
  canvas.addEventListener('blur',()=>{cursor.hidden=true;});
  canvas.addEventListener('keydown',event=>{
    if(![' ','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','[',']'].includes(event.key))return;
    event.preventDefault();if(busy||preparing)return;
    if(event.key===' '){act(()=>rpc(running?'pause':'run'));return;}
    if(event.key==='['||event.key===']'){input('radius').value=String(Math.max(1,Math.min(24,Number(input('radius').value)+(event.key===']'?1:-1))));el('radius-value').textContent=input('radius').value;}
    else if(event.key==='Enter'){act(()=>rpc('stroke'));act(()=>rpc('paint',{kind:brush,radius:Number(input('radius').value),points:[last]}));changed();}
    else {last.x=Math.max(0,Math.min(255,last.x+(event.key==='ArrowRight'?3:event.key==='ArrowLeft'?-3:0)));last.y=Math.max(0,Math.min(255,last.y+(event.key==='ArrowDown'?3:event.key==='ArrowUp'?-3:0)));}
    showCursor(last.x,last.y);
  });

  async function snapshot():Promise<Artwork>{await rpc('pause');return rpc('snapshot');}
  async function imageOf(doc:Artwork,size:number){const image=document.createElement('canvas');image.width=image.height=size;image.getContext('2d')!.putImageData(new ImageData(await raster(doc,size,false),size,size),0,0);return image;}
  function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  el('export').addEventListener('click',()=>act(()=>exclusive(async()=>{const doc=await snapshot();download(new Blob([encodeArtwork(doc)],{type:'application/json'}),`living-${doc.seed}-${doc.tick}.living.json`);status('Editable backup exported. Regions, material and growth state are included.');})));
  el('png').addEventListener('click',()=>act(()=>exclusive(async()=>{const doc=await snapshot(),image=await imageOf(doc,1024);const blob=await new Promise<Blob|null>(resolve=>image.toBlob(resolve,'image/png'));if(!blob)throw new Error('Image export failed.');download(blob,`living-${doc.seed}-${doc.tick}.png`);status('1024 × 1024 PNG exported without editing overlays.');})));
  el('save').addEventListener('click',()=>act(()=>exclusive(async()=>{
    const doc=await snapshot(),savedRevision=revision,name=input('name').value;
    await saveArtwork(name,doc,(await imageOf(doc,256)).toDataURL('image/png'));
    if(revision===savedRevision){dirty=false;el('dirty').textContent='Saved on this device';}
    await gallery();status('Saved a new copy. Continue here or reopen it from your studies.');
  })));
  async function restore(doc:Artwork,name:string){
    if(dirty&&!confirm('Replace the current canvas? Save or export first to keep your unsaved changes.'))return;
    restoring=true;try{await rpc('restore',doc);}catch(error){restoring=false;throw error;}input('name').value=name;input('seed').value=String(doc.seed);dirty=false;el('dirty').textContent='Opened artwork';status('Artwork restored and paused. Continue growing or make a new variation.');
  }
  el('import').addEventListener('click',()=>input('file').click());
  input('file').addEventListener('change',()=>act(()=>exclusive(async()=>{const file=input('file').files?.[0];input('file').value='';if(!file)return;if(file.size>FILE_LIMIT)throw new Error('Artwork exceeds the 8 MB limit.');const doc=decodeArtwork(await file.text());await restore(doc,file.name.replace(/\.living\.json$|\.json$/i,''));})));
  async function newStudy(blank:boolean,first=false){
    if(!first&&dirty&&!confirm('Start a new canvas? Save or export first to keep your unsaved changes.'))return;
    const seed=Number(input('seed').value);if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw new Error('Seed must be an integer from 0 to 4,294,967,295.');
    await rpc('new',{seed,blank});input('name').value=blank?'Untitled study':'First emergence';changed();status(blank?'A blank canvas. Plant a few seeds, then press Grow.':'Growing the first texture. You can pause preparation at any time.');
  }
  el('new').addEventListener('click',()=>act(()=>exclusive(()=>newStudy(false))));
  el('blank').addEventListener('click',()=>act(()=>exclusive(()=>newStudy(true))));
  async function gallery(){
    const gallery=el('gallery');
    try{
      const records=await listArtworks();gallery.replaceChildren();
      if(!records.length){const empty=document.createElement('p');empty.className='living-empty';empty.textContent='Your first saved study will appear here.';gallery.append(empty);}
      for(const record of records){
        const card=document.createElement('article');card.className='living-saved';const image=document.createElement('img');image.width=image.height=256;image.loading='lazy';image.alt=record.name;
        if(record.thumbnail.startsWith('data:image/png;base64,'))image.src=record.thumbnail;
        const body=document.createElement('div');body.className='living-saved-body';const title=document.createElement('h3');title.textContent=record.name;const details=document.createElement('p');details.textContent=`${record.artwork.finish.material.toUpperCase()} · STEP ${record.artwork.tick}\n${new Date(record.savedAt).toLocaleDateString()}`;
        const load=document.createElement('button');load.textContent='Open & continue';load.addEventListener('click',()=>act(()=>exclusive(()=>restore(record.artwork,record.name))));
        const remove=document.createElement('button');remove.textContent='Delete';remove.setAttribute('aria-label',`Delete ${record.name}`);remove.addEventListener('click',()=>act(()=>exclusive(async()=>{if(!confirm(`Delete saved copy “${record.name}”? This cannot be undone. The current canvas will not change.`))return;await removeArtwork(record.id);await galleryRefresh();status('Saved copy deleted. An exported backup can be imported again.');})));
        body.append(title,details,load,remove);card.append(image,body);gallery.append(card);
      }
    }catch(error){gallery.textContent=error instanceof Error?error.message:'Local storage unavailable. Use file export instead.';}
  }
  const galleryRefresh=()=>gallery();
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!dead){act(()=>rpc('pause'));status('Paused while this tab is hidden. Resume manually.');}});
  window.addEventListener('beforeunload',event=>{if(dirty)event.preventDefault();});
  window.addEventListener('pagehide',()=>{dead=true;cancelAnimationFrame(raf);worker.terminate();renderer.terminate();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Studio closed.'));}pending.clear();for(const p of renderRequests.values()){clearTimeout(p.timer);p.reject(new Error('Studio closed.'));}renderRequests.clear();});
  window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  controls();act(()=>newStudy(false,true));void gallery();
}
