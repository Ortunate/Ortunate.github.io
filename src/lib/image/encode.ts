import type { ImageFormat } from './model.ts';
export interface EncodingResult {blob:Blob;quality:number|null;attempts:number;metTarget:boolean}
/** Bounded search; never assumes browser encoders are perfectly monotonic. */
export async function chooseEncoding(encode:(quality:number)=>Promise<Blob>,format:ImageFormat,mode:'quality'|'target',quality:number,target:number,check=()=>{}):Promise<EncodingResult>{
  let attempts=0;const tryQuality=async(q:number)=>{check();const blob=await encode(q);check();attempts++;if(blob.type!==format)throw new Error(`This browser cannot encode ${format.split('/')[1].toUpperCase()}. Choose another format.`);if(!blob.size)throw new Error('The browser returned an empty image.');return{blob,quality:format==='image/png'?null:q,attempts,metTarget:blob.size<=target};};
  if(mode==='quality'||format==='image/png'){const result=await tryQuality(quality);return{...result,metTarget:true};}
  let high=.95,low=.1,best=await tryQuality(high),smallest=best;if(best.metTarget)return best;const bottom=await tryQuality(low);if(bottom.blob.size<smallest.blob.size)smallest=bottom;if(bottom.metTarget)best=bottom;
  for(let i=0;i<6;i++){const q=(low+high)/2,result=await tryQuality(q);if(result.blob.size<smallest.blob.size)smallest=result;if(result.metTarget){if(!best.metTarget||(result.quality??0)>(best.quality??0))best=result;low=q;}else high=q;}
  return{...(best.metTarget?best:smallest),attempts};
}
