import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/lib/loom/model.ts';
import * as presets from '../src/lib/loom/presets.ts';
import { LoomTransport } from '../src/lib/loom/transport.ts';

/** Event adapters only. These tests do not launch or automate a browser. */
function harness(options:{audio?:boolean;deferResume?:boolean}={}){
  let document:any,frame:((now:number)=>void)|undefined;const blobs:Blob[]=[],saved:model.SoundProject[]=[],contexts:AudioContextAdapter[]=[],audioNodes:AudioAdapter[]=[],intervals=new Map<number,()=>void>();let seq=0,allowReplace=true,resolveResume:(()=>void)|undefined;
  class Element extends EventTarget {
    dataset:Record<string,string>={};children:Element[]=[];style={setProperty(){}};hidden=false;disabled=false;checked=false;value='';textContent='';className='';width=600;height=320;tabIndex=0;files:any[]=[];tag:string;attributes:Record<string,string>={};
    constructor(tag='div'){super();this.tag=tag;}
    setAttribute(key:string,value:string){this.attributes[key]=value;}
    append(...nodes:Element[]){this.children.push(...nodes);}
    replaceChildren(...nodes:Element[]){this.children=nodes;}
    focus(){document.activeElement=this;}
    click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
    getBoundingClientRect(){return{left:0,top:0,width:600,height:320};}
    getContext(){return new Proxy({}, {get:()=>()=>{},set:()=>true});}
    toDataURL(){return 'data:image/png;base64,test';}
    querySelectorAll(selector:string):Element[]{const descendants=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);if(selector==='*')return descendants;const match=selector.match(/^\[data-([a-z]+)(?:="([^"]*)")?\]$/);if(!match)return[];return descendants.filter(c=>c.dataset[match[1]]!==undefined&&(match[2]===undefined||c.dataset[match[1]]===match[2]));}
    querySelector(selector:string){return this.querySelectorAll(selector)[0]??null;}
  }
  class AudioContextAdapter extends EventTarget {state='suspended';currentTime=0;constructor(){super();contexts.push(this);}async resume(){if(options.deferResume)await new Promise<void>(r=>{resolveResume=r;});this.state='running';}async close(){this.state='closed';}}
  class AudioAdapter {notes:number=0;silences=0;disposed=false;constructor(){audioNodes.push(this);}version(){}mix(){}note(){this.notes++;}silence(){this.silences++;}collect(){}dispose(){this.disposed=true;}}
  class View {pointer?:{x:number;y:number};resize(){}add(){}clear(){}draw(){}select(){return 2;}}
  class Observer {observe(){}disconnect(){}}
  const root=new Element(),ids=new Map<string,Element>([['loom',root]]),markup=readFileSync(new URL('../src/pages/studio/sound-loom.astro',import.meta.url),'utf8');
  for(const [,id]of markup.matchAll(/id="(loom-[^"]+)"/g)){const element=new Element();ids.set(id,element);root.append(element);}
  for(let i=0;i<6;i++){const button=new Element('button');button.dataset.track=String(i);root.append(button);}
  const el=(id:string)=>ids.get(`loom-${id}`)!;
  for(const [id,value]of Object.entries({preset:'0',cycles:'1',density:'4',rotation:'0'}))el(id).value=value;
  document=Object.assign(new Element(),{hidden:false,activeElement:null,documentElement:new Element(),getElementById:(id:string)=>ids.get(id)??null,createElement:(tag:string)=>new Element(tag)});document.documentElement.dataset.motion='full';const window=new Element();
  const dependencies:Record<string,unknown>={
    '../lib/loom/model.ts':model,'../lib/loom/presets.ts':presets,'../lib/loom/view.ts':{LoomView:View},'../lib/loom/transport.ts':{LoomTransport},'../lib/loom/audio.ts':{LoomAudio:AudioAdapter},
    '../lib/loom/storage.ts':{listSounds:async()=>[],saveSound:async(p:model.SoundProject)=>{saved.push(structuredClone(p));},deleteSound:async()=>{}},
    '../lib/loom/export.ts':{renderWav:async()=>new Blob(['wav'])},
  };
  const context={exports:{},require:(id:string)=>{if(!(id in dependencies))throw new Error(`Unexpected import ${id}`);return dependencies[id];},document,window,AudioContext:options.audio===false?undefined:AudioContextAdapter,OfflineAudioContext:class{},ResizeObserver:Observer,MutationObserver:Observer,Event,Blob,TextEncoder,structuredClone,performance,crypto,confirm:()=>allowReplace,matchMedia:()=>({matches:false}),URL:{createObjectURL:(blob:Blob)=>{blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},requestAnimationFrame:(callback:(now:number)=>void)=>{frame=callback;return 1;},cancelAnimationFrame:()=>{frame=undefined;},setInterval:(callback:()=>void)=>{const id=++seq;intervals.set(id,callback);return id;},clearInterval:(id:number)=>intervals.delete(id),setTimeout:()=>++seq,clearTimeout(){},location:{reload(){}}};
  const source=ts.transpileModule(readFileSync(new URL('../src/scripts/loom.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(source,context);
  return{el,root,document,window,blobs,saved,contexts,audioNodes,intervals,change:(id:string,value:string)=>{el(id).value=value;el(id).dispatchEvent(new Event('change'));},tick:(time:number)=>{for(const c of contexts)c.currentTime=time;for(const callback of intervals.values())callback();frame?.(time*1000);},setAllowReplace:(v:boolean)=>{allowReplace=v;},resume:()=>resolveResume?.(),close:()=>window.dispatchEvent(new Event('pagehide'))};
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));

test('loom UI: initial page has no audio context; first click plays, hidden pauses without automatic resume',async()=>{
  const h=harness();await flush();assert.equal(h.contexts.length,0);assert.equal(h.intervals.size,0);h.el('play').click();await flush();assert.equal(h.contexts.length,1);assert.equal(h.intervals.size,1);assert.ok(h.audioNodes[0].notes>0);h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.intervals.size,0);assert.ok(h.audioNodes[0].silences>0);h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.intervals.size,0);h.close();assert.equal(h.audioNodes[0].disposed,true);
});
test('loom UI: Stop while audio activation is pending prevents a delayed start',async()=>{
  const h=harness({deferResume:true});h.el('play').click();h.el('stop').click();h.resume();await flush();assert.equal(h.intervals.size,0);assert.equal(h.audioNodes[0].notes,0);h.close();
});
test('loom UI: absent audio still allows score editing and project export',async()=>{
  const h=harness({audio:false});h.change('bpm','120');h.el('export').click();const project=JSON.parse(await h.blobs[0].text());assert.equal(project.bpm,120);assert.equal(h.el('play').disabled,true);assert.equal(h.contexts.length,0);h.close();
});
test('loom UI: invalid import leaves the score intact; discarded replacement is cancelled',async()=>{
  const h=harness();h.change('name','Keep me');h.el('file').files=[{size:5,text:async()=>'{bad'}];h.el('file').dispatchEvent(new Event('change'));await flush();h.el('export').click();assert.equal(JSON.parse(await h.blobs[0].text()).name,'Keep me');h.setAllowReplace(false);h.el('preset').value='blank';h.el('new').click();h.el('export').click();assert.equal(JSON.parse(await h.blobs[1].text()).name,'Keep me');h.close();
});
test('loom UI: editing is queued, mix is immediate, save/export preserves the new score',async()=>{
  const h=harness();h.el('play').click();await flush();h.change('bpm','120');assert.equal(h.el('pending').hidden,false);h.el('mute').click();assert.equal(h.el('mute').attributes['aria-pressed'],'true');h.el('save').click();await flush();assert.equal(h.saved[0].bpm,120);assert.equal(h.saved[0].tracks[0].mute,true);h.el('stop').click();assert.equal(h.el('pending').hidden,true);h.el('undo').click();h.el('export').click();assert.equal(JSON.parse(await h.blobs[0].text()).tracks[0].mute,false);h.close();
});
test('loom UI: arrow navigation clamps to track length and selected step survives redraw',async()=>{
  const h=harness();h.change('length','8');const grid=h.el('grid');for(let i=0;i<20;i++)grid.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key:'ArrowRight'}));assert.equal(h.document.activeElement.dataset.note,'0:7');grid.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key:'ArrowDown'}));assert.equal(h.document.activeElement.dataset.note,'1:7');h.document.activeElement.click();h.el('export').click();const project=JSON.parse(await h.blobs[0].text());assert.equal(project.tracks[1].steps[7].on,!presets.presets[0].tracks[1].steps[7].on);h.close();
});
