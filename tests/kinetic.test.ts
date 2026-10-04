import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { newDocument, makePart, MachineEditor, validateDocument, validateSolution, questionFrom, encodeDocument, decodeDocument, FILE_LIMIT, DT } from '../src/lib/kinetic/model.ts';
import { initPhysics, KineticPhysics } from '../src/lib/kinetic/physics.ts';
import { createKineticRuntime, type KineticMessage, type ReplayData } from '../src/lib/kinetic/runtime.ts';
import { levels, examples } from '../src/lib/kinetic/levels.ts';
import { hitPart } from '../src/lib/kinetic/view.ts';
import { replayTrails } from '../src/lib/kinetic/replay.ts';
import { listMachines } from '../src/lib/kinetic/storage.ts';
import { solutions } from './fixtures/kinetic-solutions.ts';

await initPhysics();
for(const level of levels)test(`kinetic: independent solution wins ${level.title}`,()=>{
  const doc=structuredClone(level.document);doc.parts.push(...structuredClone(solutions[level.id]));
  validateSolution(level.document,doc);const engine=new KineticPhysics(doc);
  try{engine.step(3600);assert.equal(engine.result,'won');assert.equal(engine.frame().collected,doc.balls);assert.equal(engine.events.filter(e=>e.type==='collected').length,doc.balls);assert.ok(engine.tick<=3600);}finally{engine.dispose();}
});
for(const doc of examples)test(`kinetic: workshop example runs ${doc.name}`,()=>{
  const engine=new KineticPhysics(doc);try{engine.step(3600);assert.equal(engine.result,'won');}finally{engine.dispose();}
});
test('kinetic: editor history is atomic, independent, bounded and branches',()=>{
  const original=newDocument(),editor=new MachineEditor(original);
  for(let i=0;i<60;i++)editor.commit({...structuredClone(editor.doc),name:`Edit ${i}`});
  assert.equal(editor.undoStack.length,50);assert.equal(original.name,'Untitled machine');
  editor.undo();assert.equal(editor.doc.name,'Edit 58');editor.redo();assert.equal(editor.doc.name,'Edit 59');
  editor.undo();editor.commit({...editor.doc,name:'Branch'});assert.equal(editor.redoStack.length,0);
  const snapshot=structuredClone(editor.doc);assert.throws(()=>editor.commit({...editor.doc,balls:6}));assert.deepEqual(editor.doc,snapshot);
});
test('kinetic: player budgets and immutable facilities/fixed parts are enforced',()=>{
  const q=levels[1].document,editor=new MachineEditor(q,q);
  for(const mutate of [
    d=>d.goal.x++,d=>d.emitter.y--,d=>d.balls++,d=>d.parts[0].angle=0,
    d=>d.parts=[],d=>d.parts.push(makePart('rotor','p-extra')),
    d=>{d.budget.rail=80;d.parts.push(...[1,2,3].map(i=>makePart('rail',`p-new-${i}`)));},
    d=>d.parts.push({...makePart('rail','p-extra'),locked:true}),
  ] as ((d:typeof q)=>void)[]){const d=structuredClone(q);mutate(d);assert.throws(()=>editor.commit(d));assert.deepEqual(editor.doc,q);}
});
test('kinetic: imports reject malformed geometry, IDs, versions and UTF-8 oversized payloads',()=>{
  const doc=newDocument();doc.parts=[makePart('rail','p-one')];
  assert.deepEqual(decodeDocument(encodeDocument(doc)),doc);
  for(const mutate of [d=>d.parts[0].x=NaN,d=>d.parts[0].angle=Infinity,d=>d.parts[0].length=0,d=>d.parts[0].kind='unknown',d=>d.parts.push(d.parts[0]),d=>d.emitter.x=30,d=>d.version=2,d=>d.budget.pad=-1,d=>d.balls=1.5,d=>d.parts=Array(81).fill(d.parts[0])] as ((d:any)=>void)[]){const bad=structuredClone(doc);mutate(bad);assert.throws(()=>validateDocument(bad));}
  assert.throws(()=>decodeDocument('{bad'));assert.throws(()=>decodeDocument(' '.repeat(FILE_LIMIT+1)));
  assert.throws(()=>decodeDocument(JSON.stringify({...doc,extra:'界'.repeat(FILE_LIMIT/2)})),/256 KB/);
  assert.throws(()=>decodeDocument(JSON.stringify({...doc,kind:'challenge'})),/fixed parts only/);
});
test('kinetic: exported challenges remove solution without mutating the author draft',()=>{
  const doc=structuredClone(examples[2]),snapshot=structuredClone(doc),q=questionFrom(doc);
  assert.ok(q.parts.every(p=>p.locked));assert.equal(q.parts.length,2);assert.equal(doc.parts.length,3);
  assert.deepEqual(decodeDocument(encodeDocument(q)),q);validateSolution(q,doc);assert.deepEqual(doc,snapshot);
});
test('kinetic: restarting a layout repeats the trajectory and never mutates it',()=>{
  const doc=structuredClone(examples[2]),copy=structuredClone(doc),a=new KineticPhysics(doc),b=new KineticPhysics(doc);
  try{a.step(1200);b.step(1200);assert.deepEqual(a.replay,b.replay);assert.deepEqual(doc,copy);assert.equal(a.world.timestep,Math.fround(DT));}finally{a.dispose();b.dispose();}
});
test('kinetic: balls release two simulated seconds apart and count only after resting',()=>{
  const doc=newDocument();doc.goal.x=doc.emitter.x;doc.balls=3;const engine=new KineticPhysics(doc);
  try{engine.step(1);assert.equal(engine.balls.length,1);assert.equal(engine.frame().collected,0);engine.step(239);assert.equal(engine.balls.length,1);engine.step();assert.equal(engine.balls.length,2);engine.step(239);assert.equal(engine.balls.length,2);engine.step();assert.equal(engine.balls.length,3);engine.step(2000);assert.equal(engine.result,'won');const tick=engine.tick;engine.step(100);assert.equal(engine.tick,tick);assert.equal(engine.events.filter(e=>e.type==='collected').length,3);}finally{engine.dispose();}
});
test('kinetic: empty route loses, blocked route times out and replay remains bounded',()=>{
  const empty=new KineticPhysics(newDocument());try{empty.step(3600);assert.equal(empty.result,'lost');}finally{empty.dispose();}
  const doc=newDocument();doc.parts=[makePart('rail','p-shelf',3,6)];const engine=new KineticPhysics(doc);
  try{engine.step(3600);assert.equal(engine.result,'timeout');assert.equal(engine.tick,3600);assert.equal(engine.replay.length,901);assert.equal(engine.replay[0].tick,0);assert.equal(engine.replay.at(-1)?.tick,3600);assert.ok(engine.events.length<=1500);}finally{engine.dispose();}
});
test('kinetic: CCD catches a fast marble on a thin rail',()=>{
  const doc=newDocument();doc.parts=[makePart('rail','p-thin',3,4)];const engine=new KineticPhysics(doc);
  try{engine.step();engine.balls[0].body.setLinvel({x:0,y:-200},true);engine.step(6);assert.ok(engine.balls[0].body.translation().y>4);assert.ok(engine.events.some(e=>e.a==='p-thin'||e.b==='p-thin'));}finally{engine.dispose();}
});
test('kinetic: pads launch from the front with cooldown and seesaws retain their pivot',()=>{
  const engine=new KineticPhysics(examples[1]);try{engine.step(3600);const launches=engine.events.filter(e=>e.type==='launch');assert.ok(launches.length);for(let i=1;i<launches.length;i++)assert.ok(launches[i].tick-launches[i-1].tick>=18);}finally{engine.dispose();}
  const doc=newDocument();doc.emitter={x:6.3,y:8};doc.parts=[makePart('seesaw','p-pivot',7,4)];const saw=new KineticPhysics(doc);
  try{saw.step(180);const body=saw.bodies.get('p-pivot')!,p=body.translation();assert.ok(Math.hypot(p.x-7,p.y-4)<.03);assert.ok(Math.abs(body.rotation())<=1.1);assert.ok(Math.abs(body.rotation())>.01);}finally{saw.dispose();}
});
test('kinetic: rotor phase follows simulated time',()=>{
  const doc=newDocument();doc.parts=[{...makePart('rotor','p-motor',9,6),power:.7}];const engine=new KineticPhysics(doc);
  try{engine.step(60);assert.ok(Math.abs(engine.bodies.get('p-motor')!.rotation()-.35)<.001);}finally{engine.dispose();}
});
test('kinetic: recorded trails are read-only and stop at the scrub position',()=>{
  const engine=new KineticPhysics(examples[0]);try{engine.step(300);const tick=engine.tick,snapshot=structuredClone(engine.replay);assert.deepEqual(replayTrails(engine.replay,0),[]);const short=replayTrails(engine.replay,10),long=replayTrails(engine.replay,70);assert.ok(short[0].length<long[0].length);short[0][0].x=-100;assert.deepEqual(engine.replay,snapshot);assert.equal(engine.tick,tick);}finally{engine.dispose();}
});
test('kinetic: selection uses rotated shapes, topmost parts and facilities',()=>{
  const doc=newDocument();doc.parts=[{...makePart('rail','p-vertical',8,5),angle:Math.PI/2},makePart('bumper','p-top',8,5)];
  assert.equal(hitPart(doc,{x:8,y:6}),'p-vertical');assert.equal(hitPart(doc,{x:8,y:5}),'p-top');assert.equal(hitPart(doc,doc.emitter),'emitter');assert.equal(hitPart(doc,doc.goal),'goal');assert.equal(hitPart(doc,{x:10,y:8}),undefined);
});
test('kinetic: unavailable local storage fails explicitly without affecting the document',async()=>{
  await assert.rejects(listMachines(),/Local storage unavailable/);
});
test('kinetic: runtime cancels stale initialization and ignores stale generations',async()=>{
  const messages:KineticMessage[]=[],runtime=createKineticRuntime(m=>messages.push(m));
  try{await Promise.all([runtime.handle({id:1,generation:1,command:'init',data:{document:newDocument()}}),runtime.handle({id:2,generation:2,command:'init',data:{document:examples[0]}})]);assert.ok(!messages.some(m=>m.generation===1));messages.length=0;await runtime.handle({id:3,generation:1,command:'step'});assert.equal(messages.length,0);await runtime.handle({id:4,generation:2,command:'step'});assert.equal(messages.at(-1)?.data.tick,1);}finally{runtime.dispose();}
});
test('kinetic: pause, replay, speed and reset do not change fixed-step semantics',async()=>{
  const messages:KineticMessage[]=[],runtime=createKineticRuntime(m=>messages.push(m));let id=0;
  const command=async(command:any,data?:any)=>{await runtime.handle({id:++id,generation:1,command,data});return messages.at(-1)?.data;};
  try{await command('init',{document:examples[0]});await command('speed',.25);assert.equal((await command('step')).tick,1);await command('pause');await command('replay');assert.equal(messages.at(-1)?.data.tick,1);await command('speed',2);assert.match(messages.at(-1)?.error??'',/Invalid playback/);await command('reset');assert.equal(messages.at(-1)?.data.tick,0);await command('run');await new Promise(r=>setTimeout(r,50));await command('pause');const tick=messages.at(-1)?.data.tick;assert.ok(tick>0);await new Promise(r=>setTimeout(r,45));assert.equal(messages.at(-1)?.data.tick,tick);}finally{runtime.dispose();}
});
test('kinetic: runtime loads and advances inside an isolated worker',async()=>{
  const url=new URL('../src/lib/kinetic/runtime.ts',import.meta.url).href;
  const worker=new Worker(`const {parentPort}=await import('node:worker_threads');const {createKineticRuntime}=await import(${JSON.stringify(url)});const runtime=createKineticRuntime(m=>parentPort.postMessage(m));parentPort.on('message',m=>runtime.handle(m));`,{eval:true});
  try{const frame=await new Promise<any>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Worker timed out')),10000);worker.on('error',error=>{clearTimeout(timeout);reject(error);});worker.on('message',m=>{if(m.error){clearTimeout(timeout);reject(new Error(m.error));}if(m.type==='reply'&&m.id===1)worker.postMessage({id:2,generation:1,command:'step'});if(m.type==='frame'&&m.data.tick===1){clearTimeout(timeout);resolve(m.data);}});worker.postMessage({id:1,generation:1,command:'init',data:{document:examples[0]}});});assert.equal(frame.spawned,1);}finally{await worker.terminate();}
});
test('kinetic: replay includes the exact paused step between recording samples',async()=>{
  const messages:KineticMessage[]=[],runtime=createKineticRuntime(m=>messages.push(m));
  try{await runtime.handle({id:1,generation:1,command:'init',data:{document:examples[0]}});await runtime.handle({id:2,generation:1,command:'step'});await runtime.handle({id:3,generation:1,command:'replay'});const replay:ReplayData=messages.find(m=>m.type==='reply'&&m.id===3)!.data;assert.deepEqual(replay.frames.map(f=>f.tick),[0,1]);assert.equal(messages.at(-1)?.data.tick,1);}finally{runtime.dispose();}
});
