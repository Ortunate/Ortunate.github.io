export type Brush = 'seed' | 'erase' | 'barrier' | 'freeze' | 'thaw';
export type Material = 'mineral' | 'glaze';
export interface Finish { material: Material; light: number; relief: number }
export interface Artwork {
  format: 'ortunate-living'; version: 1; modelVersion: 1; size: 256;
  seed: number; tick: number; a: Float32Array; b: Float32Array;
  frozen: Uint8Array; barriers: Uint8Array; finish: Finish;
}
export const SIZE = 256;
const N = SIZE * SIZE;
const clamp = (x: number) => Math.max(0, Math.min(1, x));
/** Single Gray–Scott material; sealed edges. Freeze holds concentrations,
 * but still participates in neighboring diffusion. Barriers block flux. */
export class LivingEngine {
  state: Artwork;
  private nextA: Float32Array = new Float32Array(N);
  private nextB: Float32Array = new Float32Array(N);
  constructor(seed = 17, blank = false) {
    this.state = { format: 'ortunate-living', version: 1, modelVersion: 1, size: SIZE,
      seed: seed >>> 0, tick: 0, a: new Float32Array(N).fill(1), b: new Float32Array(N),
      frozen: new Uint8Array(N), barriers: new Uint8Array(N),
      finish: { material: 'mineral', light: 315, relief: 1.3 } };
    if (!blank) {
      let rng = seed >>> 0;
      const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
      for (let i = 0; i < 85; i++) {
        const theta = random() * Math.PI * 2;
        const radius = 31 + random() * 48;
        this.paint('seed', 128 + Math.cos(theta) * radius, 128 + Math.sin(theta) * radius * .86, 2 + random() * 3);
      }
    }
  }
  snapshot(): Artwork { return structuredClone(this.state); }
  restore(doc: Artwork) { validateArtwork(doc); this.state = structuredClone(doc); }
  paint(kind: Brush, x: number, y: number, radius: number) {
    if (!['seed', 'erase', 'barrier', 'freeze', 'thaw'].includes(kind) || ![x,y,radius].every(Number.isFinite) || radius < 1 || radius > 32) throw new Error('Invalid brush.');
    const s = this.state;
    for (let yy = Math.max(0, Math.floor(y-radius)); yy <= Math.min(SIZE-1,y+radius); yy++) {
      for (let xx = Math.max(0, Math.floor(x-radius)); xx <= Math.min(SIZE-1,x+radius); xx++) {
        if ((xx-x)**2 + (yy-y)**2 > radius**2) continue;
        const i = yy*SIZE+xx;
        if (kind === 'freeze') { if (!s.barriers[i]) s.frozen[i] = 1; }
        else if (kind === 'thaw') s.frozen[i] = 0;
        else if (kind === 'erase') { s.frozen[i]=0; s.barriers[i]=0; s.a[i]=1; s.b[i]=0; }
        else if (!s.frozen[i]) {
          s.barriers[i] = kind === 'barrier' ? 1 : 0;
          s.a[i] = kind === 'seed' ? .5 : 1;
          s.b[i] = kind === 'seed' ? .9 : 0;
        }
      }
    }
  }
  step(count=1) {
    const s = this.state;
    for (let k=0;k<count;k++) {
      const {a,b,barriers,frozen}=s, aa=this.nextA, bb=this.nextB;
      for (let y=0;y<SIZE;y++) for (let x=0;x<SIZE;x++) {
        const i=y*SIZE+x;
        if (barriers[i] || frozen[i]) { aa[i]=a[i]; bb[i]=b[i]; continue; }
        let la=0,lb=0;
        for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
          if ((!dx&&!dy)||x+dx<0||x+dx>=SIZE||y+dy<0||y+dy>=SIZE) continue;
          const j=(y+dy)*SIZE+x+dx;
          if (barriers[j]) continue;
          const weight=dx&&dy?.05:.2;
          la+=(a[j]-a[i])*weight; lb+=(b[j]-b[i])*weight;
        }
        const ab=a[i]*b[i]*b[i];
        aa[i]=clamp(a[i]+la-ab+.0545*(1-a[i]));
        bb[i]=clamp(b[i]+.5*lb+ab-(.062+.0545)*b[i]);
      }
      s.a=aa; s.b=bb; this.nextA=a; this.nextB=b; s.tick++;
    }
  }
}
export function validateArtwork(doc: Artwork) {
  if (!doc || doc.format!=='ortunate-living'||doc.version!==1||doc.modelVersion!==1||doc.size!==SIZE || !Number.isSafeInteger(doc.tick)||doc.tick<0||doc.tick>1e9||!Number.isInteger(doc.seed)||doc.seed<0||doc.seed>0xffffffff) throw new Error('Unsupported or invalid artwork.');
  for (const field of [doc.a,doc.b]) { if (!(field instanceof Float32Array)||field.length!==N) throw new Error('Invalid concentration field.'); for (const v of field) if (!Number.isFinite(v)||v<0||v>1) throw new Error('Invalid concentration value.'); }
  for (const field of [doc.frozen,doc.barriers]) { if (!(field instanceof Uint8Array)||field.length!==N) throw new Error('Invalid region mask.'); for (const v of field) if (v!==0&&v!==1) throw new Error('Invalid region value.'); }
  const f=doc.finish;
  if (!f||!['mineral','glaze'].includes(f.material)||!Number.isFinite(f.light)||f.light<0||f.light>360||!Number.isFinite(f.relief)||f.relief<.2||f.relief>3) throw new Error('Invalid material settings.');
}
export const FILE_LIMIT = 8 * 1024 * 1024;
export function encodeArtwork(doc:Artwork) {
  validateArtwork(doc);
  return JSON.stringify(doc,(_key,value)=>ArrayBuffer.isView(value)?Array.from(value as Float32Array):value);
}
export function decodeArtwork(text:string):Artwork {
  if (text.length>FILE_LIMIT) throw new Error('Artwork exceeds 8 MB.');
  const raw=JSON.parse(text);
  if (!raw||typeof raw!=='object') throw new Error('Invalid artwork file.');
  for (const key of ['a','b','frozen','barriers']) {
    const field=raw[key];
    if (!Array.isArray(field)||field.length!==N||field.some((v:unknown)=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>1||((key==='frozen'||key==='barriers')&&v!==0&&v!==1))) throw new Error('Invalid artwork fields.');
    raw[key]=key==='a'||key==='b'?new Float32Array(field):new Uint8Array(field);
  }
  validateArtwork(raw); return raw;
}
