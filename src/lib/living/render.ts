import { SIZE, type Artwork } from './engine.ts';
/** Height-field shading is visual only: changing material never changes chemistry. */
export function renderArtwork(doc:Artwork, outputSize=512, regions=false):Uint8ClampedArray<ArrayBuffer> {
  const out=new Uint8ClampedArray(outputSize*outputSize*4), b=doc.b;
  const sample=(x:number,y:number)=>{
    x=Math.max(0,Math.min(SIZE-1,x)); y=Math.max(0,Math.min(SIZE-1,y));
    const ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(SIZE-1,ix+1),jy=Math.min(SIZE-1,iy+1),fx=x-ix,fy=y-iy;
    return (b[iy*SIZE+ix]*(1-fx)+b[iy*SIZE+jx]*fx)*(1-fy)+(b[jy*SIZE+ix]*(1-fx)+b[jy*SIZE+jx]*fx)*fy;
  };
  const angle=doc.finish.light*Math.PI/180,lx=Math.cos(angle)*.65,ly=Math.sin(angle)*.65,lz=.76;
  const glazed=doc.finish.material==='glaze';
  for(let y=0;y<outputSize;y++)for(let x=0;x<outputSize;x++){
    const sx=x/outputSize*(SIZE-1),sy=y/outputSize*(SIZE-1),v=sample(sx,sy),h=Math.min(1,v*2.6);
    const dx=(sample(sx+1,sy)-sample(sx-1,sy))*doc.finish.relief*9,dy=(sample(sx,sy+1)-sample(sx,sy-1))*doc.finish.relief*9;
    const len=Math.hypot(dx,dy,1),diffuse=Math.max(0,(-dx*lx-dy*ly+lz)/len);
    const spec=Math.pow(Math.max(0,(-dx*lx-dy*ly+1.76)/(len*Math.hypot(lx,ly,1.76))),glazed?65:24);
    const rim=Math.pow(1-1/len,2),grain=((Math.imul(Math.floor(sx)*17+Math.floor(sy)*131,15731)>>>0)%101)/100-.5;
    const body=glazed?[13+20*h,42+78*h,48+75*h]:[55+130*h,43+99*h,34+68*h];
    const ground=glazed?[15,28,31]:[24,24,25];
    const coverage=Math.min(1,h*8),shade=.32+.95*diffuse;
    let rgb=body.map((c,k)=>ground[k]*(1-coverage)+(c*shade+spec*(glazed?160:110)+rim*22+grain*(glazed?1:5))*coverage);
    const i=Math.round(sy)*SIZE+Math.round(sx);
    if(regions&&doc.frozen[i])rgb=rgb.map((c,k)=>c*.65+[120,208,244][k]*.35);
    if(regions&&doc.barriers[i])rgb=[195,132,99];
    const j=(y*outputSize+x)*4;
    out[j]=rgb[0];out[j+1]=rgb[1];out[j+2]=rgb[2];out[j+3]=255;
  }
  return out;
}
