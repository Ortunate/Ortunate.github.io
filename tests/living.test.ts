import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { LivingEngine, decodeArtwork, encodeArtwork, validateArtwork, SIZE } from '../src/lib/living/engine.ts';
import { renderArtwork } from '../src/lib/living/render.ts';
import { createLivingRuntime, type LivingMessage } from '../src/lib/living/runtime.ts';
import { listArtworks } from '../src/lib/living/storage.ts';

test('living material is deterministic, bounded and starts blank when requested',()=>{
  const a=new LivingEngine(14),b=new LivingEngine(14);a.step(20);b.step(20);assert.deepEqual(a.snapshot(),b.snapshot());validateArtwork(a.snapshot());
  const blank=new LivingEngine(14,true);blank.step(10);assert.ok(blank.state.b.every(v=>v===0));assert.ok(blank.state.a.every(v=>v===1));
  assert.notDeepEqual(new LivingEngine(15).state.b,new LivingEngine(14).state.b);
});
test('freeze preserves both fields and thaw resumes evolution',()=>{
  const e=new LivingEngine(1,true);e.paint('seed',128,128,5);e.step(3);e.paint('freeze',128,128,8);const before=e.snapshot();e.step(20);
  for(let i=0;i<SIZE*SIZE;i++)if(before.frozen[i]){assert.equal(e.state.a[i],before.a[i]);assert.equal(e.state.b[i],before.b[i]);}
  e.paint('thaw',128,128,8);e.step(10);assert.notDeepEqual(e.state.b,before.b);assert.ok(e.state.frozen.every(v=>v===0));
});
test('freeze participates in diffusion while barriers block it',()=>{
  const e=new LivingEngine(1,true);e.paint('seed',128,128,4);e.paint('freeze',128,128,4);const doc=e.snapshot();
  const barrier=new LivingEngine(1,true),blocked=structuredClone(doc);blocked.barriers.set(blocked.frozen);blocked.frozen.fill(0);barrier.restore(blocked);
  e.step();barrier.step();const neighbor=128*SIZE+133;assert.ok(e.state.b[neighbor]>0);assert.equal(barrier.state.b[neighbor],0);
});
test('seed and barrier protect frozen details; erase clears all masks',()=>{
  const e=new LivingEngine(1,true);e.paint('seed',100,100,3);e.paint('freeze',100,100,3);const before=e.snapshot();e.paint('barrier',100,100,3);e.paint('seed',100,100,3);assert.deepEqual(e.snapshot(),before);
  e.paint('erase',100,100,3);assert.equal(e.state.b[100*SIZE+100],0);assert.equal(e.state.frozen[100*SIZE+100],0);assert.equal(e.state.barriers[100*SIZE+100],0);
});
test('complete artwork round trip continues exactly with masks and finish',()=>{
  const e=new LivingEngine(23);e.step(15);e.paint('freeze',100,100,7);e.paint('barrier',60,60,4);e.state.finish={material:'glaze',light:80,relief:2};
  const restored=new LivingEngine();restored.restore(decodeArtwork(encodeArtwork(e.snapshot())));e.step(20);restored.step(20);assert.deepEqual(e.snapshot(),restored.snapshot());
});
test('invalid files and snapshots cannot replace current artwork',()=>{
  const e=new LivingEngine(17),before=e.snapshot();const bad=e.snapshot();bad.b[0]=NaN;assert.throws(()=>e.restore(bad));assert.deepEqual(e.snapshot(),before);
  const raw=JSON.parse(encodeArtwork(before));raw.frozen[0]=.5;assert.throws(()=>decodeArtwork(JSON.stringify(raw)));raw.frozen[0]=0;raw.version=2;assert.throws(()=>decodeArtwork(JSON.stringify(raw)));assert.throws(()=>decodeArtwork('null'));assert.throws(()=>decodeArtwork('{'));
});
test('material rendering and edit overlays never advance or mutate growth',()=>{
  const e=new LivingEngine(1);e.step(10);e.paint('freeze',128,128,10);const before=e.snapshot(),mineral=renderArtwork(before,64),glaze=renderArtwork({...before,finish:{...before.finish,material:'glaze'}},64);
  assert.notDeepEqual(mineral,glaze);assert.notDeepEqual(renderArtwork(before,64,true),mineral);assert.deepEqual(e.snapshot(),before);assert.equal(mineral.length,64*64*4);for(let i=3;i<mineral.length;i+=4)assert.equal(mineral[i],255);
});
test('runtime paint undo is bounded to paused strokes and resets on stepping',()=>{
  const messages:LivingMessage[]=[],runtime=createLivingRuntime(m=>messages.push(structuredClone(m)));let id=0;
  const send=(command:string,data?:unknown)=>runtime.handle({id:++id,command,data});
  send('new',{seed:1,blank:true});send('stroke');send('paint',{kind:'seed',radius:5,points:[{x:20,y:20}]});send('undo');send('snapshot');assert.ok(messages.at(-1)!.data.b.every((v:number)=>v===0));
  send('stroke');send('paint',{kind:'seed',radius:5,points:[{x:20,y:20}]});send('step');send('snapshot');const stepped=messages.at(-1)!.data;send('undo');send('snapshot');assert.deepEqual(messages.at(-1)!.data,stepped);runtime.dispose();
});
test('new canvas cancels starter preparation and paused runs do not advance',async()=>{
  const messages:LivingMessage[]=[],runtime=createLivingRuntime(m=>messages.push(structuredClone(m)));
  runtime.handle({id:1,command:'new',data:{seed:1,blank:false}});runtime.handle({id:2,command:'new',data:{seed:2,blank:true}});runtime.handle({id:3,command:'run'});runtime.handle({id:4,command:'pause'});
  await new Promise(r=>setTimeout(r,50));runtime.handle({id:5,command:'snapshot'});assert.equal(messages.at(-1)!.data.tick,0);assert.equal(messages.at(-1)!.data.seed,2);runtime.dispose();
});
test('storage failure leaves portable artwork export available',async()=>{
  await assert.rejects(listArtworks(),/storage unavailable/);assert.equal(decodeArtwork(encodeArtwork(new LivingEngine().snapshot())).format,'ortunate-living');
});
test('living worker adapter restores and continues deterministic state',async()=>{
  const url=new URL('../src/lib/living/runtime.ts',import.meta.url).href;
  const source=`import {parentPort} from 'node:worker_threads';import {createLivingRuntime} from ${JSON.stringify(url)};const runtime=createLivingRuntime(m=>parentPort.postMessage(m));parentPort.on('message',m=>runtime.handle(m));`;
  const worker=new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`));let seq=0;
  const request=(command:string,data?:unknown)=>new Promise<any>((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{worker.off('message',receive);reject(new Error('Worker timeout'));},5000);function receive(m:LivingMessage){if(m.type==='reply'&&m.id===id){clearTimeout(timer);worker.off('message',receive);m.error?reject(new Error(m.error)):resolve(m.data);}}worker.on('message',receive);worker.postMessage({id,command,data});});
  try{const e=new LivingEngine(7);e.step(2);await request('restore',e.snapshot());await request('step');e.step();assert.deepEqual(await request('snapshot'),e.snapshot());}finally{await worker.terminate();}
});
test('material worker transfers the same pixels without changing the artwork',async()=>{
  const url=new URL('../src/scripts/living-render.worker.ts',import.meta.url).href;
  const source=`import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:(data,options)=>parentPort.postMessage(data,options?.transfer)};await import(${JSON.stringify(url)});parentPort.on('message',data=>self.onmessage({data}));`;
  const worker=new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`)),doc=new LivingEngine(12).snapshot(),before=structuredClone(doc);
  try{
    const result=await new Promise<{id:number;pixels:Uint8ClampedArray}>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Render worker timeout')),5000);worker.once('error',error=>{clearTimeout(timer);reject(error);});worker.once('message',message=>{clearTimeout(timer);resolve(message);});worker.postMessage({id:1,artwork:doc,size:64,regions:false});});
    assert.equal(result.id,1);assert.deepEqual(result.pixels,renderArtwork(doc,64,false));assert.deepEqual(doc,before);
  }finally{await worker.terminate();}
});
