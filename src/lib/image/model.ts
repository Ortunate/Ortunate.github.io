export const FILE_LIMIT=20*1024*1024,BATCH_LIMIT=100*1024*1024,PIXEL_LIMIT=24_000_000,OUTPUT_LIMIT=16_000_000;
export type ImageFormat='image/png'|'image/jpeg'|'image/webp';
export interface ImageSourceInfo {format:ImageFormat;width:number;height:number;orientation:number;bytes:number}
export interface Rect {x:number;y:number;width:number;height:number}
export interface ImageRecipe {rotation:0|1|2|3;flipX:boolean;flipY:boolean;crop:Rect;maxWidth:number;maxHeight:number;allowUpscale:boolean;format:ImageFormat;quality:number;mode:'quality'|'target';targetBytes:number;background:string}
export interface ImageJobResult {blob:Blob;width:number;height:number;quality:number|null;attempts:number;metTarget:boolean;before?:Blob}
export function orientedSize(info:ImageSourceInfo){return info.orientation>=5?{width:info.height,height:info.width}:{width:info.width,height:info.height};}
export function transformedSize(info:ImageSourceInfo,rotation:number){const s=orientedSize(info);return rotation%2?{width:s.height,height:s.width}:s;}
export function defaultRecipe(info:ImageSourceInfo):ImageRecipe {const s=orientedSize(info),scale=Math.min(1,8192/s.width,8192/s.height,Math.sqrt(OUTPUT_LIMIT/(s.width*s.height)));return{rotation:0,flipX:false,flipY:false,crop:{x:0,y:0,...s},maxWidth:Math.max(1,Math.floor(s.width*scale)),maxHeight:Math.max(1,Math.floor(s.height*scale)),allowUpscale:false,format:info.format,quality:.85,mode:'quality',targetBytes:250*1024,background:'#ffffff'};}
const finite=(v:number,min:number,max:number)=>Number.isFinite(v)&&v>=min&&v<=max;
export function outputSize(recipe:ImageRecipe){const c=recipe.crop,scale=Math.min(recipe.maxWidth/c.width,recipe.maxHeight/c.height,recipe.allowUpscale?Infinity:1);return{width:Math.max(1,Math.floor(c.width*scale)),height:Math.max(1,Math.floor(c.height*scale))};}
export function validateRecipe(recipe:ImageRecipe,info:ImageSourceInfo){
  const r=recipe,s=transformedSize(info,r.rotation),c=r.crop;
  if(!Number.isInteger(r.rotation)||!finite(r.rotation,0,3)||typeof r.flipX!=='boolean'||typeof r.flipY!=='boolean'||typeof r.allowUpscale!=='boolean'||!c||![c.x,c.y,c.width,c.height].every(Number.isFinite)||c.x<0||c.y<0||c.width<1||c.height<1||c.x+c.width>s.width+.001||c.y+c.height>s.height+.001)throw new Error('Crop must stay inside the oriented image.');
  if(!Number.isInteger(r.maxWidth)||!finite(r.maxWidth,1,8192)||!Number.isInteger(r.maxHeight)||!finite(r.maxHeight,1,8192)||!['image/png','image/jpeg','image/webp'].includes(r.format)||!finite(r.quality,.1,.95)||!['quality','target'].includes(r.mode)||!finite(r.targetBytes,1024,BATCH_LIMIT)||!/^#[0-9a-f]{6}$/i.test(r.background))throw new Error('Invalid output settings. Use dimensions of 1–8192 and a valid background color.');
  const out=outputSize(r);if(out.width*out.height>OUTPUT_LIMIT)throw new Error('Output is limited to 16 million pixels. Reduce the dimensions.');
}
export function resetTransform(recipe:ImageRecipe,info:ImageSourceInfo,change:Partial<Pick<ImageRecipe,'rotation'|'flipX'|'flipY'>>){const r={...structuredClone(recipe),...change};r.crop={x:0,y:0,...transformedSize(info,r.rotation)};return r;}
export function fitCrop(bounds:{width:number;height:number},ratio:number|null):Rect{let {width,height}=bounds;if(ratio&&width/height>ratio)width=height*ratio;else if(ratio)height=width/ratio;return{x:(bounds.width-width)/2,y:(bounds.height-height)/2,width,height};}
export function moveCrop(c:Rect,dx:number,dy:number,bounds:{width:number;height:number}):Rect{return{...c,x:Math.max(0,Math.min(bounds.width-c.width,c.x+dx)),y:Math.max(0,Math.min(bounds.height-c.height,c.y+dy))};}
export class ImageEditor {
  recipe:ImageRecipe;undoStack:ImageRecipe[]=[];redoStack:ImageRecipe[]=[];info:ImageSourceInfo;
  constructor(info:ImageSourceInfo){this.info=info;this.recipe=defaultRecipe(info);}
  commit(r:ImageRecipe){validateRecipe(r,this.info);if(JSON.stringify(r)===JSON.stringify(this.recipe))return false;this.undoStack.push(this.recipe);if(this.undoStack.length>50)this.undoStack.shift();this.recipe=structuredClone(r);this.redoStack=[];return true;}
  undo(){const r=this.undoStack.pop();if(r){this.redoStack.push(this.recipe);this.recipe=r;return true;}return false;}
  redo(){const r=this.redoStack.pop();if(r){this.undoStack.push(this.recipe);this.recipe=r;return true;}return false;}
}
export function outputName(name:string,format:ImageFormat,used=new Set<string>()){const stem=name.replace(/\.[^.]*$/,'').replace(/[\\/\x00-\x1f<>:"|?*]/g,'-').replace(/^\.+/,'').trim().slice(0,100)||'image',ext=format==='image/jpeg'?'jpg':format.split('/')[1];let candidate=`${stem}-edited.${ext}`,n=2;while(used.has(candidate.toLowerCase()))candidate=`${stem}-edited-${n++}.${ext}`;used.add(candidate.toLowerCase());return candidate;}
export function isCurrent(revision:number,token:number){return revision===token;}
