import test from 'node:test';
import assert from 'node:assert/strict';
import {N,clamp,encode,type Ember,type World} from '../src/lib/worlds/model.ts';
import {createEmber,paintEmber,stepEmber} from '../src/lib/worlds/ember.ts';
import {createPelagic,paintPelagic} from '../src/lib/worlds/pelagic.ts';
import {WorldSession} from '../src/lib/worlds/session.ts';
import {createWorldRuntime,type Reply,type Command} from '../src/lib/worlds/runtime.ts';
import {WorldClient} from '../src/lib/worlds/client.ts';
import {WorldView,angleBetween,contours,emberPixels,materialNoise} from '../src/lib/worlds/render.ts';
import {Garden2DView} from '../src/lib/windward/view-2d.ts';
import {garden,advance,sow} from '../src/lib/windward/model.ts';

// Original allocating solver, retained as a numerical reference for buffer reuse.
function referenceStep(d:Ember){
  const next=d.mass.slice(),energy=new Float64Array(N*N);
  for(let i=0;i<N*N;i++)energy[i]=d.mass[i]*d.heat[i];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x;if(d.solid[i]||d.mass[i]<1e-9)continue;
    let remaining=d.mass[i]*.18*d.params.fluidity;const surface=d.base[i]+d.mass[i]*.22;
    for(const j of [x?i-1:-1,x<N-1?i+1:-1,y?i-N:-1,y<N-1?i+N:-1]){
      if(j<0)continue;const difference=surface-(d.base[j]+d.mass[j]*.22),amount=Math.min(remaining,Math.max(0,difference)*.12*d.params.fluidity,Math.max(0,4-next[j]));
      if(amount<=0)continue;next[i]-=amount;next[j]+=amount;energy[i]-=amount*d.heat[i];energy[j]+=amount*d.heat[i];remaining-=amount;
    }
  }
  const transported=new Float64Array(N*N),heat=new Float64Array(N*N);
  for(let i=0;i<N*N;i++)transported[i]=next[i]>1e-12?clamp(energy[i]/next[i]):d.heat[i];
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x;let sum=0,count=0,gradient=0;
    for(const j of [x?i-1:-1,x<N-1?i+1:-1,y?i-N:-1,y<N-1?i+N:-1])if(j>=0){sum+=transported[j];count++;gradient=Math.max(gradient,Math.abs(transported[i]-transported[j]));}
    heat[i]=clamp(transported[i]+.035*(sum/count-transported[i])-d.params.cooling*.003);
    if(next[i]<1e-10){next[i]=Math.max(0,next[i]);d.solid[i]=0;d.crack[i]=0;continue;}
    if(heat[i]<.32)d.solid[i]=1;else if(heat[i]>.56)d.solid[i]=0;
    if(d.solid[i])d.crack[i]=clamp(d.crack[i]+Math.max(0,d.heat[i]-heat[i])*(.5+gradient*10));else d.crack[i]=Math.max(0,d.crack[i]-.012);
  }
  d.mass=next;d.heat=heat;d.tick++;
}

test('polish: reusable Ember buffers preserve every numerical field exactly',()=>{
  for(const seed of [0,17,4294967295]){
    const a=createEmber(seed);a.params.fluidity=1;paintEmber(a,{tool:'lava',x:0,y:0,radius:.12,strength:1});
    const b=structuredClone(a);
    for(let i=0;i<80;i++){if(i===25){paintEmber(a,{tool:'cool',x:.48,y:.48,radius:.12,strength:1});paintEmber(b,{tool:'cool',x:.48,y:.48,radius:.12,strength:1});}stepEmber(a);referenceStep(b);}
    assert.deepEqual(a,b);
  }
});
test('polish: saturated and empty brushes preserve undo and redo branches',()=>{
  const d=createPelagic(17);for(let i=0;i<30;i++)paintPelagic(d,{tool:'add',kind:'jelly',x:.5,y:.5,radius:.04,strength:1});
  const session=new WorldSession(d);session.name('Next');session.undo();const before=encode(session.state);
  assert.match(session.paint({tool:'add',kind:'jelly',x:.5,y:.5,radius:.04,strength:1}),/limit/);session.end();
  assert.equal(session.lastPaintChanged,false);assert.equal(session.undoStack.length,0);assert.equal(session.redoStack.length,1);assert.equal(encode(session.state),before);
  const empty=new WorldSession(createEmber(17));empty.paint({tool:'remove',x:0,y:0,radius:.03,strength:1});empty.end();assert.equal(empty.undoStack.length,0);
});
test('polish: control-only replies omit state and snapshot shares one cloned graph',()=>{
  const replies:Reply[]=[],runtime=createWorldRuntime(r=>replies.push(structuredClone(r)),true);
  let id=0;const send=(command:Command,data?:unknown)=>{runtime.handle({id:++id,generation:1,command,data});return replies.at(-1)!;};
  try{
    const first=send('init',createEmber(17)).frame!.state!,before=encode(first);
    for(const command of ['run','pause','begin','end'] as const)assert.equal(send(command).frame!.state,undefined);
    send('step');send('step');assert.equal(encode(first),before);
    const snapshot=send('snapshot');assert.equal(snapshot.result,snapshot.frame!.state);
  }finally{runtime.dispose();}
});
test('polish: local runtime isolates caller-owned frames from its scratch buffers',()=>{
  const replies:Reply[]=[],runtime=createWorldRuntime(r=>replies.push(r));
  try{
    runtime.handle({id:1,generation:1,command:'init',data:createEmber(17)});
    const first=replies[0].frame!.state!,before=encode(first);
    for(let i=0;i<5;i++)runtime.handle({id:2+i,generation:1,command:'step'});
    assert.equal(encode(first),before);
    const latest=replies.at(-1)!.frame!.state as Ember;latest.mass.fill(0);
    runtime.handle({id:10,generation:1,command:'snapshot'});
    assert.ok((replies.at(-1)!.result as Ember).mass.some(m=>m>0));
  }finally{runtime.dispose();}
});
test('polish: Worker failure after a metadata acknowledgement retains the last full frame',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'Worker');let instance:FakeWorker,last:World|undefined,fallbacks=0;
  class FakeWorker{
    onmessage?:(event:{data:Reply})=>void;onerror?:()=>void;
    runtime=createWorldRuntime(r=>this.onmessage?.({data:structuredClone(r)}),true);
    constructor(){instance=this;}postMessage(request:any){this.runtime.handle(structuredClone(request));}terminate(){this.runtime.dispose();}
  }
  Object.assign(globalThis,{Worker:FakeWorker});const client=new WorldClient(f=>last=f.state,()=>fallbacks++);
  try{
    await client.load(createEmber(17));await client.request('step');await client.request('pause');const before=encode(last!);
    instance!.onerror!();assert.equal(fallbacks,1);assert.equal(encode(last!),before);
    await client.request('step');assert.equal(last!.tick,2);
  }finally{client.dispose();if(descriptor)Object.defineProperty(globalThis,'Worker',descriptor);else Reflect.deleteProperty(globalThis,'Worker');}
});
test('polish: heading interpolation crosses the angle seam by the shortest route',()=>{
  const from=179*Math.PI/180,to=-179*Math.PI/180;
  assert.ok(Math.abs(angleBetween(from,to,.5)-Math.PI)<1e-10);
  assert.equal(angleBetween(from,to,0),from);
});
test('polish: shared-edge contours connect and reusable pixels are deterministic',()=>{
  const lines=contours([0,0,0,1,1,1,2,2,2],.5,3);
  assert.deepEqual(lines,[1,.5,0,.5,2,.5,1,.5]);assert.deepEqual(contours([1,1,1,1],.5,2),[]);
  const d=createEmber(17),before=encode(d),buffer=new Uint8ClampedArray(N*N*4),noise=materialNoise(17);
  assert.equal(emberPixels(d,buffer,noise),buffer);assert.deepEqual(buffer,emberPixels(d));assert.equal(encode(d),before);
});

function canvasHarness(){
  const keys=['document','devicePixelRatio','ImageData','performance'],descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));
  let now=100;const calls:unknown[][]=[];
  const context=new Proxy({}, {get:(_,k)=>k==='createLinearGradient'||k==='createRadialGradient'?()=>({addColorStop(){}}):(...args:unknown[])=>{calls.push([k,...args.filter(a=>typeof a==='number')]);},set:()=>true});
  const canvas=()=>({width:0,height:0,getContext:()=>context,remove(){},toBlob(fn:(b:Blob)=>void){fn(new Blob(['png']));}});
  Object.assign(globalThis,{document:{createElement:canvas},devicePixelRatio:1,ImageData:class{constructor(..._args:unknown[]){}},performance:{now:()=>now}});
  const host={prepend(){},getBoundingClientRect:()=>({left:0,top:0,width:1000,height:625})};
  return{host:host as any,calls,time:(t:number)=>now=t,restore(){keys.forEach((k,i)=>descriptors[i]?Object.defineProperty(globalThis,k,descriptors[i]!):Reflect.deleteProperty(globalThis,k));}};
}
test('polish: sea subframes animate continuously, metadata does not reset interpolation, pause is stable',()=>{
  const h=canvasHarness();const view=new WorldView(h.host,'pelagic');
  try{
    const d=createPelagic(17);view.setFrame(d);const next=structuredClone(d);next.tick++;view.setFrame(next);
    h.time(108);view.draw(next,true);const first=h.calls.splice(0);view.setFrame(next);h.time(121);view.draw(next,true);const second=h.calls.splice(0);assert.notDeepEqual(first,second);
    view.draw(next,false);const paused=h.calls.splice(0);h.time(800);view.draw(next,false);assert.deepEqual(h.calls.splice(0),paused);
    assert.equal((view as any).previous.size,d.creatures.length);
    const discontinuous=structuredClone(next);discontinuous.tick=90;view.setFrame(discontinuous);assert.equal((view as any).previous.size,0);
  }finally{view.dispose();h.restore();}
});
test('polish: Ember cache survives cursor redraws but invalidates for edits at the same tick',async()=>{
  const h=canvasHarness(),view=new WorldView(h.host,'ember');
  try{
    const d=createEmber(17);view.setFrame(d);view.draw(d);h.calls.length=0;view.mark(.2,.3,.04);view.draw(d);assert.ok(!h.calls.some(c=>c[0]==='putImageData'));
    const next=structuredClone(d);paintEmber(next,{tool:'lava',x:.2,y:.3,radius:.04,strength:1});view.setFrame(next);view.draw(next);assert.ok(h.calls.some(c=>c[0]==='putImageData'));
    const before=encode(next);await view.snapshot(next);assert.equal(encode(next),before);assert.equal(view.canvas.width,1000);
  }finally{view.dispose();h.restore();}
});
test('polish: Windward projection caches survive growth and invalidate for planting and camera changes',()=>{
  const h=canvasHarness(),d=garden(),view=new Garden2DView(h.host,d,'low');
  try{
    view.draw(d,[]);const cached=(view as any).projected;advance(d,[]);view.draw(d,[],1/60);assert.equal((view as any).projected,cached);
    sow(d,2,2,.7,'flower');view.draw(d,[]);assert.notEqual((view as any).projected,cached);
    const planted=(view as any).projected;d.camera.azimuth+=.1;view.draw(d,[]);assert.notEqual((view as any).projected,planted);
    view.draw(d,[]);h.calls.length=0;view.draw(d,[]);assert.equal(h.calls.length,0);
  }finally{view.dispose();h.restore();}
});
