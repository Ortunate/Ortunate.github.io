import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as model from '../src/lib/worlds/model.ts';
import * as pelagic from '../src/lib/worlds/pelagic.ts';
import * as ember from '../src/lib/worlds/ember.ts';
import {WorldClient} from '../src/lib/worlds/client.ts';

// Event adapters plus the actual main-thread runtime; no browser is launched.
function harness(world:model.WorldId='pelagic',options:{storageFails?:boolean;viewFails?:boolean;reduced?:boolean;mobile?:boolean}={}){
  let document:any,allowReplace=true,seq=0,now=100;const frames=new Map<number,()=>void>(),blobs:Blob[]=[],views:View[]=[],clients:WorldClient[]=[],saved:model.World[]=[],params:Element[]=[],tools:Element[]=[];
  class Element extends EventTarget {dataset:Record<string,string>={};children:Element[]=[];disabled=false;hidden=false;value='';textContent='';files:any[]=[];attributes:Record<string,string>={};className='';append(...nodes:Element[]){this.children.push(...nodes);}replaceChildren(...nodes:Element[]){this.children=nodes;}setAttribute(k:string,v:string){this.attributes[k]=v;}click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}focus(){document.activeElement=this;}setPointerCapture(){}querySelectorAll(selector:string){return selector==='[data-element-param]'?params:selector==='[data-element-tool]'?tools:[];}}
  const root=new Element();root.dataset.world=world;const ids=new Map<string,Element>([['element-world',root]]),markup=readFileSync(new URL('../src/components/ElementWorld.astro',import.meta.url),'utf8');for(const [,id]of markup.matchAll(/id="(element-[^"]+)"/g))if(!ids.has(id))ids.set(id,new Element());const el=(id:string)=>ids.get(`element-${id}`)!;
  for(const [id,param]of world==='pelagic'?[['direction','direction'],['current','strength'],['brightness','brightness']]:[['cooling','cooling'],['fluidity','fluidity']]){el(id).dataset.elementParam=param;params.push(el(id));}for(const tool of world==='pelagic'?['flow','add','light','remove']:['lava','heat','cool','remove']){const e=new Element();e.dataset.elementTool=tool;tools.push(e);}for(const [id,value]of Object.entries({quality:'auto',radius:'.045',strength:'.7',kind:'jelly'}))el(id).value=value;
  document=Object.assign(new Element(),{hidden:false,documentElement:new Element(),getElementById:(id:string)=>ids.get(id),createElement:()=>new Element()});document.documentElement.dataset.motion=options.reduced===false?'full':'reduced';const window=new Element();
  class View {state?:model.World;disposed=false;constructor(){if(options.viewFails)throw new Error('No canvas');views.push(this);}setFrame(d:model.World){this.state=structuredClone(d);}marker:any;mark(...args:any[]){this.marker=args;}setTool(){}point(x:number,y:number){return{x:x/1000,y:y/625};}resize(){}draw(){}async snapshot(){return new Blob(['png'],{type:'image/png'});}dispose(){this.disposed=true;}}
  class Client extends WorldClient {constructor(...args:ConstructorParameters<typeof WorldClient>){super(...args);clients.push(this);}}
  const dependencies:Record<string,any>={'../lib/worlds/model.ts':model,'../lib/worlds/pelagic.ts':pelagic,'../lib/worlds/ember.ts':ember,'../lib/worlds/client.ts':{WorldClient:Client},'../lib/worlds/render.ts':{WorldView:View},'../lib/worlds/storage.ts':{listWorlds:async()=>[],saveWorld:async(d:model.World)=>{if(options.storageFails)throw new Error('Storage failed. Export instead.');saved.push(d);},removeWorld:async()=>{},restoreWorld:()=>{}},'../lib/image/handoff.ts':{sendMedia:async()=> 'token'}};
  const context={exports:{},Error,require:(id:string)=>{assert.ok(id in dependencies,id);return dependencies[id];},document,window,Event,Blob,File,AbortController,TextEncoder,performance:{now:()=>now},structuredClone,innerWidth:1000,confirm:()=>allowReplace,matchMedia:(q:string)=>({matches:!!options.mobile&&q.includes('max-width')}),localStorage:{setItem(){}},requestAnimationFrame:(fn:()=>void)=>{const id=++seq;frames.set(id,fn);return id;},cancelAnimationFrame:(id:number)=>frames.delete(id),ResizeObserver:class{observe(){}disconnect(){}},URL:{createObjectURL:(blob:Blob)=>{blobs.push(blob);return 'blob:test';},revokeObjectURL(){}},setTimeout:()=>++seq,FileReader:class{result='data:image/png;base64,test';onload?:()=>void;readAsDataURL(){this.onload?.();}},location:{reload(){}}};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/scripts/element-world.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
  return{advanceClock:(ms:number)=>now+=ms,el,tools,document,window,frames,blobs,views,saved,clients,change:(id:string,value:string)=>{el(id).value=value;el(id).dispatchEvent(new Event('change'));},key:(key:string,props={})=>el('stage').dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{key,...props})),pointer:(type:string,x:number,y:number,id=1)=>el('stage').dispatchEvent(Object.assign(new Event(type),{clientX:x,clientY:y,pointerId:id,button:0})),allowReplace:(v:boolean)=>allowReplace=v,close:()=>window.dispatchEvent(new Event('pagehide'))};
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('element UI: reduced motion starts paused; touch stroke is one reversible edit',async()=>{const h=harness('ember');try{await flush();assert.equal(h.el('play').textContent,'Flow');const before=model.encode(h.views[0].state!);h.pointer('pointerdown',250,250);h.pointer('pointermove',350,300);h.pointer('pointerup',350,300);await flush();assert.notEqual(model.encode(h.views[0].state!),before);assert.equal(h.el('play').textContent,'Flow');h.el('undo').click();await flush();assert.equal(model.encode(h.views[0].state!),before);h.el('redo').click();await flush();assert.notEqual(model.encode(h.views[0].state!),before);}finally{h.close();}});
test('element UI: keyboard applies chosen tool but form controls never paint',async()=>{const h=harness();try{await flush();const before=(h.views[0].state as model.Pelagic).creatures.length;h.key('2');h.key('Enter');await flush();assert.equal((h.views[0].state as model.Pelagic).creatures.length,before+1);h.el('name').dispatchEvent(Object.assign(new Event('keydown'),{key:'Enter'}));await flush();assert.equal((h.views[0].state as model.Pelagic).creatures.length,before+1);}finally{h.close();}});
test('element UI: lower quality keeps the exact world; hidden pauses without automatic catch-up',async()=>{const h=harness();try{await flush();h.key('2');h.key('Enter');await flush();const before=model.encode(h.views[0].state!);h.change('quality','low');assert.ok(h.views[0].disposed);assert.equal(model.encode(h.views[1].state!),before);h.el('play').click();await flush();assert.equal(h.el('play').textContent,'Pause');h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(h.el('play').textContent,'Flow');const tick=h.views[1].state!.tick;h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));await flush();assert.equal(h.views[1].state!.tick,tick);}finally{h.close();}});
test('element UI: invalid and cross-world imports retain current content, replacement can be declined',async()=>{const h=harness();try{await flush();h.change('name','Keep this sea');await flush();h.el('file').files=[new File([model.encode(ember.createEmber(3))],'wrong.json')];h.el('file').dispatchEvent(new Event('change'));await flush();assert.match(h.el('status').textContent,/another world/);assert.equal(h.views[0].state!.name,'Keep this sea');h.allowReplace(false);h.change('seed','93');h.el('new').click();await flush();assert.equal(h.views[0].state!.seed,17);}finally{h.close();}});
test('element UI: failed save leaves edits dirty and export remains usable',async()=>{const h=harness('ember',{storageFails:true});try{await flush();h.change('name','Molten memory');await flush();h.el('save').click();await flush();assert.match(h.el('status').textContent,/Storage failed/);const leave=new Event('beforeunload',{cancelable:true});h.window.dispatchEvent(leave);assert.ok(leave.defaultPrevented);h.el('export').click();await flush();assert.equal(model.decode(await h.blobs[0].text(),'ember').name,'Molten memory');assert.equal(h.el('export').disabled,false);}finally{h.close();}});
test('element UI: unavailable Canvas does not prevent editable world export',async()=>{const h=harness('pelagic',{viewFails:true});try{await flush();assert.equal(h.el('png').disabled,true);assert.equal(h.el('export').disabled,false);h.el('export').click();await flush();assert.equal(model.decode(await h.blobs[0].text(),'pelagic').world,'pelagic');}finally{h.close();}});
test('element UI: leaving during initialization cannot create a late view',async()=>{const h=harness();h.close();await flush();assert.equal(h.views.length,0);assert.equal(h.frames.size,0);});

test('element UI: release flushes the throttled endpoint and quick undo restores the whole stroke',async()=>{
  const h=harness('ember');try{await flush();const before=model.encode(h.views[0].state!);
    h.pointer('pointerdown',200,300);h.pointer('pointermove',220,300);h.pointer('pointerup',280,300);await flush();
    const d=h.views[0].state as model.Ember;assert.ok(d.mass[Math.round(300/625*127)*128+Math.round(.28*127)]>0);
    assert.equal(h.el('quick-undo').disabled,false);h.el('quick-undo').click();await flush();assert.equal(model.encode(h.views[0].state!),before);
    h.el('quick-redo').click();await flush();assert.notEqual(model.encode(h.views[0].state!),before);
  }finally{h.close();}
});
test('element UI: cancel and blur flush only the last captured point',async()=>{
  for(const ending of ['pointercancel','blur']){const h=harness('ember');try{await flush();h.pointer('pointerdown',200,300);h.pointer('pointermove',220,300);
    if(ending==='blur')h.window.dispatchEvent(new Event('blur'));else h.pointer(ending,800,300);
    await flush();const d=h.views[0].state as model.Ember,row=Math.round(300/625*127)*128;
    assert.ok(d.mass[row+Math.round(.22*127)]>0);assert.equal(d.mass[row+Math.round(.8*127)],0);
    h.el('undo').click();await flush();assert.equal(h.el('undo').disabled,true);
  }finally{h.close();}}
});
test('element UI: full populations report limits without new dirty state or undo',async()=>{
  const h=harness();try{await flush();h.tools[2].click();for(let i=0;i<5;i++){h.key('Enter');await flush();}
    h.el('export').click();await flush();assert.match(h.el('dirty').textContent,/No unexported/);
    const count=h.views[0].state as model.Pelagic,before=model.encode(count);h.key('Enter');await flush();
    assert.equal(model.encode(h.views[0].state!),before);assert.match(h.el('status').textContent,/Six lights/);assert.match(h.el('dirty').textContent,/No unexported/);
  }finally{h.close();}
});
test('element UI: brush input updates immediately and mobile panel closes without painting',async()=>{
  const h=harness('pelagic',{mobile:true});try{await flush();const before=model.encode(h.views[0].state!);
    h.el('radius').value='.09';h.el('radius').dispatchEvent(new Event('input'));assert.equal(h.views[0].marker[2],.09);
    // Our DOM adapter does not parse the initial hidden attribute.
    h.el('panel').hidden=true;h.el('panel-toggle').click();assert.equal(h.el('panel').attributes['aria-modal'],'true');assert.equal(h.document.activeElement,h.el('panel-close'));
    h.el('backdrop').click();assert.equal(h.el('panel').hidden,true);assert.equal(h.document.activeElement,h.el('panel-toggle'));assert.equal(model.encode(h.views[0].state!),before);
  }finally{h.close();}
});
