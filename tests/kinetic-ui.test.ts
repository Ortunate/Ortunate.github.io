import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/lib/kinetic/model.ts';
import * as levels from '../src/lib/kinetic/levels.ts';

function harness(){
  const ids=new Map<string,Element>(),frames=new Map<number,(t:number)=>void>(),workers:WorkerAdapter[]=[],views:View[]=[];let sequence=0;
  class Element extends EventTarget {
    dataset:Record<string,string>={};hidden=false;disabled=false;checked=false;value='1';textContent='';children:Element[]=[];
    setAttribute(){}append(...nodes:Element[]){this.children.push(...nodes);}replaceChildren(...nodes:Element[]){this.children=nodes;}querySelectorAll(){return [];}querySelector(){return new Element();}
    cloneNode(){return new Element();}replaceWith(node:Element){for(const [id,e]of ids)if(e===this)ids.set(id,node);}click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}focus(){}getBoundingClientRect(){return{width:600,height:400};}
  }
  const get=(id:string)=>{if(!ids.has(id))ids.set(id,new Element());return ids.get(id)!;},el=(id:string)=>get('kinetic-'+id);
  const document=Object.assign(new Element(),{hidden:false,activeElement:null,documentElement:new Element(),getElementById:get,createElement:()=>new Element()}),window=new Element();
  class WorkerAdapter {
    messages:any[]=[];terminated=false;onmessage?:(e:any)=>void;
    constructor(){workers.push(this);}postMessage(m:any){this.messages.push(m);if(m.command!=='init')queueMicrotask(()=>this.reply(m));}
    reply(m=this.messages[0]){this.onmessage?.({data:{type:'reply',id:m.id,generation:m.generation,data:undefined}});}terminate(){this.terminated=true;}
  }
  class View {canvas:Element;kind='3d';constructor(canvas:Element){this.canvas=canvas;views.push(this);}setTrails(){}update(){}resize(){}render(){}zoom(){}pan(){}reset(){}dispose(){}}
  const deps:Record<string,unknown>={
    '../lib/kinetic/model.ts':model,'../lib/kinetic/levels.ts':levels,'../lib/kinetic/view.ts':{CanvasMachineView:View},'../lib/kinetic/view3d.ts':{ThreeMachineView:View},
    '../lib/kinetic/storage.ts':{listMachines:async()=>[],readProgress:async()=>({})},'../lib/kinetic/replay.ts':{},
  };
  const source=ts.transpileModule(readFileSync(new URL('../src/scripts/kinetic.ts',import.meta.url),'utf8').replaceAll('import.meta.url',JSON.stringify(import.meta.url)),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports:{},require:(id:string)=>{assert.ok(id in deps,id);return deps[id];},document,window,URL,URLSearchParams,Worker:WorkerAdapter,AbortController,structuredClone,performance,crypto,queueMicrotask,location:{search:'?mode=1'},confirm:()=>true,ResizeObserver:class{observe(){}disconnect(){}},setTimeout:()=>++sequence,clearTimeout(){},requestAnimationFrame:(fn:(t:number)=>void)=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:(id:number)=>frames.delete(id)});
  return{el,document,workers,views,frames,tick:()=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(performance.now()+100));},close:()=>window.dispatchEvent(new Event('pagehide'))};
}
const flush=()=>new Promise<void>(r=>setImmediate(r));
test('kinetic UI: editing is physics-free, static frames settle, first Run lazily initializes one worker',async()=>{
  const h=harness();await flush();assert.equal(h.workers.length,0);h.tick();assert.equal(h.frames.size,0);
  h.el('name').value='Edited';h.el('name').dispatchEvent(new Event('change'));assert.equal(h.workers.length,0);assert.equal(h.frames.size,1);h.tick();assert.equal(h.frames.size,0);
  h.el('run').click();assert.equal(h.workers.length,1);assert.deepEqual(h.workers[0].messages.map(m=>m.command),['init']);h.workers[0].reply();await flush();assert.deepEqual(h.workers[0].messages.map(m=>m.command),['init','speed','run']);h.close();assert.ok(h.workers[0].terminated);
});
test('kinetic UI: first Step loads physics, and hiding during loading prevents a delayed step',async()=>{
  const h=harness();await flush();h.el('step').click();h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));h.workers[0].reply();await flush();assert.deepEqual(h.workers[0].messages.map(m=>m.command),['init']);assert.equal(h.frames.size,0);h.close();
  const next=harness();await flush();next.el('step').click();next.workers[0].reply();await flush();assert.deepEqual(next.workers[0].messages.map(m=>m.command),['init','speed','step']);next.close();
});
test('kinetic UI: leaving during initial physics loading cannot start a late simulation',async()=>{
  const h=harness();await flush();h.el('run').click();h.close();h.workers[0].reply();await flush();assert.equal(h.workers[0].messages.length,1);assert.ok(h.workers[0].terminated);assert.equal(h.frames.size,0);
});
test('kinetic UI: failed initialization exposes Retry without losing the editor',async()=>{
  const h=harness();await flush();h.el('run').click();const w=h.workers[0],m=w.messages[0];w.onmessage?.({data:{type:'reply',id:m.id,generation:m.generation,error:'Engine unavailable'}});await flush();assert.equal(h.el('retry').hidden,false);assert.equal(h.el('run').disabled,false);assert.match(h.el('status').textContent,/Engine unavailable/);h.close();
});
