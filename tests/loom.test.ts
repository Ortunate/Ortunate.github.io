import test from 'node:test';
import assert from 'node:assert/strict';
import { newProject, validateProject, encodeProject, decodeProject, generateTrack, resizeTrack, euclidean, pitch, cycleSteps, stepTime, eventsAt, compile, ProjectEditor, FILE_LIMIT, type SoundProject, type SoundEvent } from '../src/lib/loom/model.ts';
import { presets } from '../src/lib/loom/presets.ts';
import { LoomTransport, type AudioSink } from '../src/lib/loom/transport.ts';
import { LoomAudio } from '../src/lib/loom/audio.ts';
import { encodeWav } from '../src/lib/loom/wav.ts';
import { exportDuration, renderWav } from '../src/lib/loom/export.ts';
import { listSounds } from '../src/lib/loom/storage.ts';
import { LoomView } from '../src/lib/loom/view.ts';

test('loom: six distinct complete presets validate without changing the blank score',()=>{
  assert.equal(presets.length,6);assert.equal(new Set(presets.map(p=>JSON.stringify(compile(p)))).size,6);
  for(const p of presets){validateProject(p);assert.ok(compile(p).length>0);assert.ok(cycleSteps(p)<=96);}
  assert.equal(compile(newProject()).length,0);
});
test('loom: Euclidean rhythms preserve exact density and rotate without mutating',()=>{
  for(const n of [8,12,16,24,32])for(let pulses=0;pulses<=n;pulses++)assert.equal(euclidean(n,pulses).filter(Boolean).length,pulses);
  assert.deepEqual(euclidean(8,3,1),[false,true,false,false,true,false,false,true]);
  assert.throws(()=>euclidean(16,NaN));assert.throws(()=>euclidean(16,17));assert.throws(()=>euclidean(16,4,.2));
});
test('loom: seeded generation is repeatable and protects locked notes and other tracks',()=>{
  const p=newProject();p.tracks[5].steps[3]={on:true,velocity:.9,probability:.2,degree:12,locked:true};const original=structuredClone(p);
  const a=generateTrack(p,5,7),b=generateTrack(p,5,7);assert.deepEqual(a,b);assert.deepEqual(a.tracks[5].steps[3],original.tracks[5].steps[3]);assert.deepEqual(a.tracks.slice(0,5),original.tracks.slice(0,5));assert.deepEqual(p,original);
  assert.notDeepEqual(generateTrack({...p,seed:123},5,7),a);
});
test('loom: scale degrees, root and bass register have predictable pitches',()=>{
  const p=newProject();p.scale='major';assert.ok(Math.abs(pitch(p,5,0)-261.625565)<.00001);assert.equal(pitch(p,5,5),pitch(p,5,0)*2);assert.equal(pitch(p,5,0),pitch(p,4,0)*4);p.root=9;assert.ok(Math.abs(pitch(p,5,0)-440)<.00001);
});
test('loom: independent lengths meet at their least common multiple',()=>{
  let p=newProject();p=resizeTrack(p,0,12);p=resizeTrack(p,1,32);assert.equal(cycleSteps(p),96);assert.equal(stepTime(p,96),15);
  p.tracks[0].steps[2].on=true;const resized=resizeTrack(p,0,24);assert.equal(resized.tracks[0].steps[2].on,true);assert.equal(resized.tracks[0].steps[20].on,false);assert.equal(p.tracks[0].steps.length,12);
});
test('loom: swing delays odd steps but preserves pair and cycle duration',()=>{
  const p=newProject();p.bpm=120;p.swing=.65;assert.equal(stepTime(p,1),.1625);assert.equal(stepTime(p,2),.25);assert.equal(stepTime(p,16),2);
  for(let step=1;step<100;step++)assert.ok(stepTime(p,step)>stepTime(p,step-1));
});
test('loom: probabilities are reproducible by cycle, and zero never fires',()=>{
  const p=newProject();for(const track of p.tracks)for(const note of track.steps){note.on=true;note.probability=.5;}
  const first=compile(p),second=compile(p);assert.deepEqual(first,second);assert.ok(first.length>10&&first.length<90);
  for(let step=0;step<16;step++)assert.deepEqual(eventsAt(p,step).map(e=>e.track),eventsAt(p,step+16).map(e=>e.track));
  for(const track of p.tracks)for(const note of track.steps)note.probability=0;assert.deepEqual(compile(p),[]);
});
test('loom: mute and solo determine audible compiled events',()=>{
  const p=structuredClone(presets[0]);p.tracks[2].solo=true;assert.ok(compile(p).every(e=>e.track===2));p.tracks[2].mute=true;assert.equal(compile(p).length,0);
});
test('loom: validated round trips reject unbounded and malformed projects atomically',()=>{
  const p=newProject();assert.deepEqual(decodeProject(encodeProject(p)),p);
  for(const change of [(p:any)=>p.version=2,(p:any)=>p.seed=-1,(p:any)=>p.bpm=Infinity,(p:any)=>p.scale='toString',(p:any)=>p.root=12,(p:any)=>p.tracks.pop(),(p:any)=>p.tracks[0].instrument='pluck',(p:any)=>p.tracks[0].steps.length=80,(p:any)=>p.tracks[0].volume=NaN,(p:any)=>p.tracks[0].steps[0].probability=1.2,(p:any)=>p.tracks[0].steps[0].degree=.5]){const bad=structuredClone(p);change(bad);assert.throws(()=>validateProject(bad));}
  assert.throws(()=>decodeProject('invalid'));assert.throws(()=>decodeProject(' '.repeat(FILE_LIMIT+1)),/128 KB/);assert.throws(()=>decodeProject(JSON.stringify({...p,extra:'界'.repeat(FILE_LIMIT/2)})),/128 KB/);
  const editor=new ProjectEditor(p);assert.throws(()=>editor.commit({...p,bpm:200}));assert.deepEqual(editor.project,p);assert.equal(editor.undoStack.length,0);
});
test('loom: editing history holds fifty atomic edits, redo branches correctly',()=>{
  const editor=new ProjectEditor(newProject());for(let i=0;i<60;i++)editor.commit({...editor.project,name:String(i)});assert.equal(editor.undoStack.length,50);editor.undo();assert.equal(editor.project.name,'58');editor.redo();assert.equal(editor.project.name,'59');editor.undo();editor.commit({...editor.project,name:'Branch'});assert.equal(editor.redoStack.length,0);
});
function rig(project=structuredClone(presets[0])){
  let time=0;const notes:{event:SoundEvent;time:number}[]=[],versions:{project:SoundProject;time:number}[]=[];let silences=0,mixes=0;
  const sink:AudioSink={note:(event,time)=>notes.push({event,time}),version:(project,time)=>versions.push({project:structuredClone(project),time}),silence:()=>{silences++;},mix:()=>{mixes++;}};
  const transport=new LoomTransport(project,sink,()=>time);return{transport,notes,versions,setTime:(t:number)=>{time=t;},get silences(){return silences;},get mixes(){return mixes;}};
}
test('loom: transport is silent until play, schedules by audio time, never duplicates',()=>{
  const r=rig();r.transport.pump();assert.equal(r.notes.length,0);r.transport.play();const count=r.notes.length;assert.ok(count>0);r.transport.pump();r.transport.play();assert.equal(r.notes.length,count);assert.ok(r.notes.every(n=>n.time>=.04));
});
test('loom: realtime scheduled events equal offline compiled events across a cycle',()=>{
  const p=presets[2],r=rig(p),duration=stepTime(p,cycleSteps(p));r.transport.play();for(let t=.025;t<duration-.06;t+=.025){r.setTime(t);r.transport.pump();}const actual=r.notes.filter(n=>n.event.step<cycleSteps(p));const expected=compile(p);assert.equal(actual.length,expected.length);actual.forEach((n,i)=>{assert.deepEqual(n.event,expected[i]);assert.ok(Math.abs(n.time-(expected[i].time+.04))<1e-9);});
});
test('loom: pause cancels future work, resumes next step, stop resets',()=>{
  const r=rig();r.transport.play();r.setTime(.33);r.transport.pump();r.transport.pause();assert.equal(r.silences,1);const count=r.notes.length,step=r.transport.resumeStep;assert.ok(step>0);r.setTime(9);r.transport.pump();assert.equal(r.notes.length,count);r.transport.play();assert.equal(r.transport.position(),step);r.transport.stop();assert.equal(r.transport.position(),0);
});
test('loom: playback edits switch together at a bar and pause applies pending edits',()=>{
  const r=rig();r.transport.play();r.setTime(.4);r.transport.pump();const p={...r.transport.project,bpm:120};r.transport.replace(p);const boundary=r.transport.boundary;assert.equal(boundary%16,0);r.transport.replace({...p,name:'Second edit'});assert.equal(r.transport.boundary,boundary);assert.equal(r.transport.project.bpm,96);
  for(let t=.425;t<3;t+=.025){r.setTime(t);r.transport.pump();}assert.equal(r.transport.project.bpm,120);assert.equal(r.transport.project.name,'Second edit');assert.equal(r.versions.length,2);assert.ok(Math.abs(r.versions[1].time-2.54)<1e-9);
  r.transport.replace({...p,bpm:80});r.transport.pause();assert.equal(r.transport.project.bpm,80);assert.equal(r.transport.pending,undefined);assert.equal(r.transport.resumeStep,0);
});
test('loom: stalls skip missed events without flooding, mix does not reset phase',()=>{
  const r=rig();r.transport.play();const count=r.notes.length;r.setTime(25);r.transport.pump();assert.ok(r.notes.length-count<=6);assert.ok(r.notes.slice(count).every(n=>n.time>=25));const position=r.transport.position();const p=structuredClone(r.transport.project);p.tracks[0].mute=true;r.transport.updateMix(p);assert.equal(r.mixes,1);assert.equal(r.transport.position(),position);assert.equal(r.transport.pending,undefined);
});
test('loom: WAV PCM is stereo interleaved, finite and correctly bounded',()=>{
  const b=encodeWav([new Float32Array([-2,0,.5,Infinity]),new Float32Array([2,-.5,0,NaN])],44100),v=new DataView(b);assert.equal(b.byteLength,60);assert.equal(new TextDecoder().decode(b.slice(0,4)),'RIFF');assert.equal(v.getUint32(4,true),52);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint32(24,true),44100);assert.equal(v.getUint32(40,true),16);assert.deepEqual(Array.from({length:8},(_,i)=>v.getInt16(44+i*2,true)),[-32768,32767,0,-16384,16384,0,0,0]);assert.throws(()=>encodeWav([new Float32Array(1)],44100));
});
test('loom: export duration includes tail and never exceeds 98 seconds',()=>{
  let p=newProject();p.bpm=60;p=resizeTrack(p,0,32);p=resizeTrack(p,1,24);assert.equal(exportDuration(p,4),98);assert.equal(exportDuration(p,1),26);assert.throws(()=>exportDuration(p,3));
});
test('loom: unsupported export and storage are recoverable',async()=>{
  await assert.rejects(renderWav(newProject(),1),/Offline audio/);await assert.rejects(listSounds(),/Local storage/);
});

class Param {value=0;calls:{kind:string;value:number;time:number}[]=[];setValueAtTime(value:number,time:number){this.calls.push({kind:'set',value,time});return this;}linearRampToValueAtTime(value:number,time:number){this.calls.push({kind:'linear',value,time});return this;}exponentialRampToValueAtTime(value:number,time:number){this.calls.push({kind:'exp',value,time});return this;}setTargetAtTime(value:number,time:number){this.calls.push({kind:'target',value,time});return this;}cancelScheduledValues(){return this;}}
class Node {gain=new Param();frequency=new Param();detune=new Param();Q=new Param();pan=new Param();delayTime=new Param();threshold=new Param();knee=new Param();ratio=new Param();attack=new Param();release=new Param();disconnected=false;connect(){return this;}disconnect(){this.disconnected=true;}}
class Source extends Node {starts:number[]=[];stops:number[]=[];onended:(()=>void)|null=null;start(time:number){this.starts.push(time);}stop(time=0){this.stops.push(time);}}
class NoiseSource extends Source {}
class Context {currentTime=0;sampleRate=8000;destination=new Node();nodes:Node[]=[];sources:Source[]=[];node(){const n=new Node();this.nodes.push(n);return n;}createGain(){return this.node();}createDynamicsCompressor(){return this.node();}createDelay(){return this.node();}createBiquadFilter(){return this.node();}createStereoPanner(){return this.node();}createBuffer(_channels:number,length:number){const data=new Float32Array(length);return{getChannelData:()=>data};}createOscillator(){const n=new Source();this.sources.push(n);this.nodes.push(n);return n;}createBufferSource(){const n=new NoiseSource();this.sources.push(n);this.nodes.push(n);return n;}}
test('loom: synthesis schedules all six voices, envelopes, silence and resource disposal',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'AudioBufferSourceNode');Object.defineProperty(globalThis,'AudioBufferSourceNode',{value:NoiseSource,configurable:true});
  try{const c=new Context(),cues:SoundEvent[]=[],audio=new LoomAudio(c as unknown as BaseAudioContext,e=>cues.push(e)),p=newProject();audio.version(p,0);for(let i=0;i<6;i++)audio.note({step:0,track:i,time:0,frequency:220,velocity:.7,seed:17},.1);assert.equal(cues.length,6);assert.ok(c.sources.length>=6);assert.ok(c.sources.every(s=>s.starts[0]===.1&&s.stops[0]>.1));assert.ok(c.nodes.some(n=>n.gain.calls.some(v=>v.kind==='exp'&&v.value===.0001)));c.currentTime=.2;audio.silence();assert.ok(c.sources.every(s=>s.stops.at(-1)===.225));audio.dispose();assert.ok(c.nodes.every(n=>n.disconnected));}finally{if(old)Object.defineProperty(globalThis,'AudioBufferSourceNode',old);else Reflect.deleteProperty(globalThis,'AudioBufferSourceNode');}
});
test('loom: synthesis keeps realtime voice count bounded and does not steal offline voices',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'AudioBufferSourceNode');Object.defineProperty(globalThis,'AudioBufferSourceNode',{value:NoiseSource,configurable:true});
  try{for(const live of [true,false]){const c=new Context(),audio=new LoomAudio(c as unknown as BaseAudioContext,undefined,live);audio.version(newProject(),0);for(let i=0;i<100;i++)audio.note({step:i,track:0,time:i,frequency:60,velocity:.5,seed:0},i);assert.equal(c.sources.filter(s=>s.disconnected).length,live?36:0);audio.dispose();}}finally{if(old)Object.defineProperty(globalThis,'AudioBufferSourceNode',old);else Reflect.deleteProperty(globalThis,'AudioBufferSourceNode');}
});
test('loom: drawing, hovering and resizing never mutate the score',()=>{
  const context=new Proxy({}, {get:(_t,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});const canvas={getContext:()=>context,getBoundingClientRect:()=>({left:0,top:0,width:600,height:320}),width:0,height:0};const view=new LoomView(canvas as unknown as HTMLCanvasElement),p=structuredClone(presets[0]),before=structuredClone(p);view.add(compile(p)[0],0);view.draw(p,0,.2,true,false);view.pointer={x:30,y:30};view.draw(p,1,.3,true,true);view.resize();view.draw(p,0,0,false,false);assert.deepEqual(p,before);assert.equal(view.select(64),0);assert.equal(view.select(260),5);
});
