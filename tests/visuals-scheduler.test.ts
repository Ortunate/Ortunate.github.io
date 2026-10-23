import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Event adapters exercise the real scheduler without a browser or GPU.
function harness(){
  const canvas=Object.assign(new EventTarget(),{dataset:{visual:'flow'}}),window=new EventTarget();
  const document=Object.assign(new EventTarget(),{hidden:false,documentElement:{dataset:{motion:'full'}},querySelectorAll:()=>[canvas]});
  let intersect:(entries:any[])=>void=()=>{},sequence=0;const frames=new Map<number,(t:number)=>void>(),scenes:Scene[]=[];
  class Scene {
    canvas=canvas;preview=true;visible=false;paused=false;lastDraw=0;slowFrames=0;quality=1;draws=0;disposed=false;_dirty=true;
    constructor(){scenes.push(this);}
    get dirty(){return this._dirty;}set dirty(v:boolean){this._dirty=v;if(v)canvas.dispatchEvent(new Event('sceneinvalidate'));}
    draw(){this.draws++;}dispose(){this.disposed=true;}
  }
  const source=ts.transpileModule(readFileSync(new URL('../src/scripts/visuals.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source,{exports:{},require:()=>({VisualScene:Scene}),document,window,performance,IntersectionObserver:class{constructor(fn:typeof intersect){intersect=fn;}observe(){}disconnect(){}},requestAnimationFrame:(fn:(t:number)=>void)=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:(id:number)=>frames.delete(id)});
  return{document,window,scenes,frames,visible:(value:boolean)=>intersect([{target:canvas,isIntersecting:value}]),tick:(time:number)=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(time));}};
}
test('visual scheduler: offscreen and frozen scenes stop; interaction and visibility wake rendering',()=>{
  const h=harness();assert.equal(h.frames.size,0);h.visible(true);h.tick(100);assert.equal(h.scenes[0].draws,1);assert.equal(h.frames.size,1);
  h.scenes[0].paused=true;h.tick(200);assert.equal(h.frames.size,0);h.scenes[0].dirty=true;assert.equal(h.frames.size,1);h.tick(300);assert.equal(h.frames.size,0);
  h.visible(false);assert.equal(h.frames.size,0);h.visible(true);h.tick(400);assert.equal(h.frames.size,0);
  h.scenes[0].paused=false;h.scenes[0].dirty=true;h.document.hidden=true;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.frames.size,0);
  h.document.hidden=false;h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.frames.size,1);h.document.documentElement.dataset.motion='reduced';h.tick(500);assert.equal(h.frames.size,0);
  h.window.dispatchEvent(new Event('pagehide'));assert.ok(h.scenes[0].disposed);assert.equal(h.frames.size,0);
});
