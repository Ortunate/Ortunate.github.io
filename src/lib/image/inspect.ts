import { FILE_LIMIT,PIXEL_LIMIT,type ImageSourceInfo,type ImageFormat } from './model.ts';
function exif(bytes:Uint8Array,start:number,end:number){
  const prefix=String.fromCharCode(...bytes.subarray(start,start+6))==='Exif\0\0',base=start+(prefix?6:0);if(end-base<8)return 1;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),little=bytes[base]===0x49&&bytes[base+1]===0x49;
  if(!little&&!(bytes[base]===0x4d&&bytes[base+1]===0x4d))return 1;
  const u16=(p:number)=>view.getUint16(p,little),u32=(p:number)=>view.getUint32(p,little);if(u16(base+2)!==42)return 1;const at=base+u32(base+4);if(at<base||at+2>end)return 1;
  const count=Math.min(u16(at),1024);for(let i=0;i<count;i++){const p=at+2+i*12;if(p+12>end)break;if(u16(p)===0x112&&u16(p+2)===3&&u32(p+4)===1){const value=u16(p+8);return value>=1&&value<=8?value:1;}}return 1;
}
export function inspectBytes(bytes:Uint8Array):ImageSourceInfo {
  if(bytes.length>FILE_LIMIT)throw new Error('Each image must be at most 20 MiB.');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ascii=(p:number,n:number)=>String.fromCharCode(...bytes.subarray(p,p+n));let width=0,height=0,orientation=1,format:ImageFormat;
  const bound=(p:number,n:number)=>{if(p<0||p+n>bytes.length)throw new Error('Truncated or corrupt image file.');};
  if(bytes.length>=8&&ascii(1,3)==='PNG'&&bytes[0]===137&&ascii(4,4)==='\r\n\x1a\n'){
    format='image/png';let p=8,ended=false;while(p+12<=bytes.length){const size=v.getUint32(p),kind=ascii(p+4,4);bound(p+8,size+4);if(p===8&&kind!=='IHDR')throw new Error('Invalid PNG header.');if(kind==='IHDR'){if(size!==13||width)throw new Error('Invalid PNG dimensions.');width=v.getUint32(p+8);height=v.getUint32(p+12);}if(kind==='eXIf')orientation=exif(bytes,p+8,p+8+size);if(kind==='acTL')throw new Error('Animated PNG is not supported. Choose a static image.');p+=size+12;if(kind==='IEND'){ended=true;break;}}if(!ended)throw new Error('Incomplete PNG file.');
  }else if(bytes.length>=12&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    format='image/webp';const end=v.getUint32(4,true)+8;bound(0,end);let p=12;while(p+8<=end){const kind=ascii(p,4),size=v.getUint32(p+4,true),data=p+8;bound(data,size);if(data+size>end)throw new Error('Invalid WebP chunk.');if(kind==='ANIM'||kind==='ANMF'||(kind==='VP8X'&&size>=10&&(bytes[data]&2)))throw new Error('Animated WebP is not supported. Choose a static image.');
      if(kind==='VP8X'&&size>=10){width=1+bytes[data+4]+bytes[data+5]*256+bytes[data+6]*65536;height=1+bytes[data+7]+bytes[data+8]*256+bytes[data+9]*65536;}
      else if(kind==='VP8 '&&size>=10&&!width){if(ascii(data+3,3)!=='\x9d\x01\x2a')throw new Error('Invalid WebP frame.');width=v.getUint16(data+6,true)&0x3fff;height=v.getUint16(data+8,true)&0x3fff;}
      else if(kind==='VP8L'&&size>=5&&!width){if(bytes[data]!==0x2f)throw new Error('Invalid WebP frame.');const bits=v.getUint32(data+1,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1;}
      if(kind==='EXIF')orientation=exif(bytes,data,data+size);p=data+size+(size%2);if(p>end)throw new Error('Invalid WebP padding.');
    }
  }else if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
    format='image/jpeg';let p=2;while(p<bytes.length){if(bytes[p++]!==255)throw new Error('Invalid JPEG marker.');while(bytes[p]===255)p++;bound(p,1);const marker=bytes[p++];if(marker===0xda||marker===0xd9)break;if(marker===1||(marker>=0xd0&&marker<=0xd7))continue;bound(p,2);const size=v.getUint16(p);if(size<2)throw new Error('Invalid JPEG segment.');bound(p,size);if(marker===0xe1&&ascii(p+2,6)==='Exif\0\0')orientation=exif(bytes,p+2,p+size);if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(size<8)throw new Error('Invalid JPEG frame.');height=v.getUint16(p+3);width=v.getUint16(p+5);}p+=size;}
  }else throw new Error('Choose a static PNG, JPEG or WebP. HEIC, SVG and animated images are not supported.');
  if(!width||!height||width*height>PIXEL_LIMIT)throw new Error('Image dimensions must be valid and at most 24 million pixels.');return{format,width,height,orientation,bytes:bytes.length};
}
export async function inspectImage(blob:Blob){if(blob.size>FILE_LIMIT)throw new Error('Each image must be at most 20 MiB.');return inspectBytes(new Uint8Array(await blob.arrayBuffer()));}
