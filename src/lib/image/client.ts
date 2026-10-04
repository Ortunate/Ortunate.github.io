import type { ImageJobResult,ImageRecipe,ImageFormat } from './model.ts';
import type { Swatch } from './palette.ts';
export class ImageProcessor {
  private worker?:Worker;private serial=0;private generation=0;private pending?:{id:number;resolve:(data:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>};private fallback=false;
  cancel(){this.generation++;this.worker?.terminate();this.worker=undefined;if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(new Error('Operation cancelled.'));this.pending=undefined;}}
  private async request(command:string,data:Record<string,unknown>={}):Promise<any>{
    this.cancel();const generation=this.generation,check=()=>{if(generation!==this.generation)throw new Error('Operation cancelled.');};
    if(!this.fallback&&typeof Worker!=='undefined'&&typeof OffscreenCanvas!=='undefined'&&typeof createImageBitmap!=='undefined'){
      try{return await new Promise((resolve,reject)=>{const id=++this.serial;try{this.worker=new Worker(new URL('../../scripts/image.worker.ts',import.meta.url),{type:'module'});}catch(error){this.fallback=true;throw error;}const timer=setTimeout(()=>{this.worker?.terminate();this.worker=undefined;this.pending=undefined;reject(new Error('Image operation timed out. Try smaller dimensions.'));},90000);this.pending={id,resolve,reject,timer};this.worker.onmessage=event=>{if(event.data.id!==id||generation!==this.generation)return;clearTimeout(timer);this.pending=undefined;this.worker?.terminate();this.worker=undefined;event.data.error?reject(new Error(event.data.error)):resolve(event.data.result);};this.worker.onerror=()=>{clearTimeout(timer);this.pending=undefined;this.worker?.terminate();this.worker=undefined;this.fallback=true;reject(new Error('Worker unavailable; retrying locally.'));};this.worker.postMessage({id,command,...data});});}catch(error){check();if(!this.fallback)throw error;}
    }
    const api=await import('./process.ts');check();return command==='encode'?api.processImage(data.blob as Blob,data.recipe as ImageRecipe,Boolean(data.before),check):command==='palette'?api.imagePalette(data.blob as Blob,data.count as number,check):api.supportedFormats();
  }
  encode(blob:Blob,recipe:ImageRecipe,before=false):Promise<ImageJobResult>{return this.request('encode',{blob,recipe,before});}
  palette(blob:Blob,count:number):Promise<Swatch[]>{return this.request('palette',{blob,count});}
  formats():Promise<ImageFormat[]>{return this.request('formats');}
}
