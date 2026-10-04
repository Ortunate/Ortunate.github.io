import { parseColor,colorFormats } from '../utilities.ts';
export interface PaletteDocument {format:'ortunate-palette';version:1;name:string;colors:string[]}
export const hex=(value:string)=>colorFormats(parseColor(value)).hex;
export function paletteDocument(colors:string[],name='Untitled palette'):PaletteDocument {const p:PaletteDocument={format:'ortunate-palette',version:1,name,colors:colors.map(hex)};validatePalette(p);return p;}
export function validatePalette(value:unknown):asserts value is PaletteDocument {const p=value as PaletteDocument;if(!p||p.format!=='ortunate-palette'||p.version!==1||typeof p.name!=='string'||p.name.length>80||!Array.isArray(p.colors)||p.colors.length<1||p.colors.length>8||p.colors.some(c=>typeof c!=='string'||!/^#[\da-f]{6}$/i.test(c)))throw new Error('Choose a version 1 palette with 1–8 opaque HEX colors.');}
export function decodePalette(text:string){if(new TextEncoder().encode(text).length>16384)throw new Error('Palette file exceeds 16 KB.');const p:unknown=JSON.parse(text);validatePalette(p);return p;}
export function paletteCSS(p:PaletteDocument){validatePalette(p);return`:root {\n${p.colors.map((c,i)=>`  --swatch-${i+1}: ${c.toLowerCase()};`).join('\n')}\n}`;}
export function luminance(rgb:[number,number,number]){const [r,g,b]=rgb.map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;}
export function contrast(a:string,b:string){const x=luminance(parseColor(a)),y=luminance(parseColor(b));return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export interface Swatch {hex:string;share:number}
export function extractPalette(pixels:Uint8ClampedArray,count:number):Swatch[]{
  if(!Number.isInteger(count)||count<3||count>8||pixels.length%4||pixels.length>256*256*4)throw new Error('Use 3–8 colors and a sample of at most 256² pixels.');
  type Bin={rgb:[number,number,number];weight:number};const histogram=new Map<number,{r:number;g:number;b:number;weight:number}>();
  for(let i=0;i<pixels.length;i+=4){const a=pixels[i+3]/255;if(a<.1)continue;const r=pixels[i],g=pixels[i+1],b=pixels[i+2],key=(r>>3)*1024+(g>>3)*32+(b>>3),bin=histogram.get(key)??{r:0,g:0,b:0,weight:0};bin.r+=r*a;bin.g+=g*a;bin.b+=b*a;bin.weight+=a;histogram.set(key,bin);}
  const bins:Bin[]=[...histogram.values()].map(b=>({rgb:[b.r/b.weight,b.g/b.weight,b.b/b.weight],weight:b.weight}));if(!bins.length)return[];
  const boxes=[bins],range=(box:Bin[],axis:number)=>Math.max(...box.map(b=>b.rgb[axis]))-Math.min(...box.map(b=>b.rgb[axis]));
  while(boxes.length<count){let index=-1,score=-1,axis=0;boxes.forEach((box,i)=>{if(box.length<2)return;for(let a=0;a<3;a++){const s=range(box,a)*box.reduce((n,b)=>n+b.weight,0);if(s>score){score=s;index=i;axis=a;}}});if(index<0)break;const box=boxes[index].sort((a,b)=>a.rgb[axis]-b.rgb[axis]),total=box.reduce((n,b)=>n+b.weight,0);let split=0,sum=0;while(split<box.length-1&&sum<total/2)sum+=box[split++].weight;boxes.splice(index,1,box.slice(0,split),box.slice(split));}
  const total=bins.reduce((n,b)=>n+b.weight,0),merged=new Map<string,number>();for(const box of boxes){const weight=box.reduce((n,b)=>n+b.weight,0),rgb=[0,1,2].map(axis=>Math.round(box.reduce((n,b)=>n+b.rgb[axis]*b.weight,0)/weight)) as [number,number,number],color=colorFormats(rgb).hex;merged.set(color,(merged.get(color)??0)+weight/total);}return[...merged].map(([hex,share])=>({hex,share})).sort((a,b)=>b.share-a.share||a.hex.localeCompare(b.hex));
}
