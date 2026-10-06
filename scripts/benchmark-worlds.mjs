// Node-only CPU microbenchmarks, not browser frame-rate measurements.
// Run with the same Node release/machine before and after an optimization.
import {performance} from 'node:perf_hooks';
import {createEmber,stepEmber} from '../src/lib/worlds/ember.ts';
import {createPelagic,stepPelagic,paintPelagic} from '../src/lib/worlds/pelagic.ts';
import {emberPixels,materialNoise,contours} from '../src/lib/worlds/render.ts';
import {N,clamp} from '../src/lib/worlds/model.ts';
function measure(label,action){
  for(let i=0;i<60;i++)action();
  const samples=[];for(let batch=0;batch<5;batch++){const start=performance.now();for(let i=0;i<300;i++)action();samples.push((performance.now()-start)/300);}
  samples.sort((a,b)=>a-b);console.log(label+': '+samples[2].toFixed(3)+' ms/op (median of 5 × 300)');
}
console.log('Seed 17; 128² Ember; maximum Pelagic populations. Node CPU only.');
for(const kind of ['ember','pelagic']){
  const d=kind==='ember'?createEmber(17):createPelagic(17),step=kind==='ember'?stepEmber:stepPelagic;
  if(kind==='pelagic')for(const species of ['jelly','fish','plankton'])for(let n=0;n<240;n++)paintPelagic(d,{tool:'add',kind:species,x:.5,y:.5,radius:.04,strength:1});
  measure(kind+' simulation step',()=>step(d));
  measure(kind+' former double clone',()=>structuredClone(structuredClone(d)));
  measure(kind+' single transport clone',()=>structuredClone(d));
  if(kind==='ember'){
    const visible=createEmber(17),pixels=new Uint8ClampedArray(N*N*4),noise=materialNoise(17),thermal=new Float64Array(N*N);
    for(let i=0;i<N*N;i++)thermal[i]=visible.heat[i]*clamp(visible.mass[i]*8);
    measure('Ember reusable pixel buffer',()=>emberPixels(visible,pixels,noise));
    measure('Ember four thermal contours',()=>[.22,.38,.58,.78].map(level=>contours(thermal,level)));
  }
}
