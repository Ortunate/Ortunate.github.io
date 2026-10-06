import {N,DT,clamp,type World,type Pelagic,type Ember,type Creature} from './model.ts';

export function viewport(width:number,height:number){const scale=Math.min(width/1000,height/625);return{x:(width-1000*scale)/2,y:(height-625*scale)/2,scale,width:1000*scale,height:625*scale};}
export function pick(width:number,height:number,x:number,y:number){const v=viewport(width,height),px=(x-v.x)/v.width,py=(y-v.y)/v.height;return px>=0&&px<=1&&py>=0&&py<=1?{x:px,y:py}:undefined;}
export function angleBetween(from:number,to:number,alpha:number){return from+Math.atan2(Math.sin(to-from),Math.cos(to-from))*clamp(alpha);}
const hash=(x:number,y:number,seed:number)=>{let n=Math.imul(x+seed,374761393)^Math.imul(y+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;};
export function materialNoise(seed:number){const noise=new Float64Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++)noise[y*N+x]=hash(x,y,seed);return noise;}
// Caller-owned buffers keep the hot path allocation-free. No field is written.
export function emberPixels(d:Ember,out=new Uint8ClampedArray(N*N*4),noise?:Float64Array){
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){
    const i=y*N+x,p=i*4,n=noise?.[i]??hash(x,y,d.seed),left=y*N+Math.max(0,x-1),right=y*N+Math.min(N-1,x+1),up=Math.max(0,y-1)*N+x,down=Math.min(N-1,y+1)*N+x;
    const dx=d.base[right]-d.base[left]+(d.mass[right]-d.mass[left])*.22,dy=d.base[down]-d.base[up]+(d.mass[down]-d.mass[up])*.22;
    const shade=clamp(.5-dx*4-dy*3,.08,.92),m=clamp(d.mass[i]*8),hot=clamp((d.heat[i]-.18)/.82),glow=hot*hot*m;
    const rock=10+shade*25+n*3+d.solid[i]*m*5,crust=d.solid[i]?clamp(d.crack[i]*2):0;
    out[p]=clamp((rock*(1-crust*.3)+glow*245)/255)*255;
    out[p+1]=clamp((rock*.83+glow*glow*185)/255)*255;
    out[p+2]=clamp((rock*.88+glow**5*100)/255)*255;out[p+3]=255;
  }return out;
}
// Shared edge interpolation gives neighboring cells continuous, deterministic contours.
export function contours(field:ArrayLike<number>,level:number,size=N):number[]{
  const lines:number[]=[];
  for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){
    const i=y*size+x,a=field[i],b=field[i+1],c=field[i+size+1],d=field[i+size],points:number[]=[];
    const edge=(v:number,w:number,x1:number,y1:number,x2:number,y2:number)=>{if((v>=level)===(w>=level))return;const t=(level-v)/(w-v);points.push(x1+(x2-x1)*t,y1+(y2-y1)*t);};
    edge(a,b,x,y,x+1,y);edge(b,c,x+1,y,x+1,y+1);edge(c,d,x+1,y+1,x,y+1);edge(d,a,x,y+1,x,y);
    if(points.length===4)lines.push(...points);
    else if(points.length===8){if((a+b+c+d)/4>=level)lines.push(points[0],points[1],points[6],points[7],points[2],points[3],points[4],points[5]);else lines.push(...points);}
  }return lines;
}
export class WorldView {
  canvas:HTMLCanvasElement;
  private context:CanvasRenderingContext2D;private host:HTMLElement;private low:boolean;
  private width=1;private height=1;private ratio=1;private glow:HTMLCanvasElement;private grid:HTMLCanvasElement;private background:HTMLCanvasElement;private backgroundKey='';
  private lastState?:World;private previous=new Map<number,Creature>();private received=0;
  private sorted:Creature[]=[];private order:number[]=[];private depths:number[]=[];
  private ambient:{x:number;y:number;alpha:number}[]=[];private ambientSeed=-1;
  private marker={x:.5,y:.5,radius:.04,visible:false};private tool='';private disposed=false;
  private pixelsState?:Ember;private pixels=new Uint8ClampedArray(N*N*4);private image?:ImageData;private noise?:Float64Array;private noiseSeed=-1;
  private thermal=new Float64Array(N*N);private edges:number[][]=[];private faults:number[]=[];private cracks:number[]=[];
  constructor(host:HTMLElement,world:World['world'],low=false){
    this.host=host;this.low=low;this.canvas=document.createElement('canvas');
    const c=this.canvas.getContext('2d');if(!c)throw new Error('Canvas is unavailable. Your world file can still be exported.');this.context=c;
    this.glow=document.createElement('canvas');this.glow.width=this.glow.height=96;
    const gc=this.glow.getContext('2d')!,g=gc.createRadialGradient(48,48,0,48,48,48);
    g.addColorStop(0,world==='pelagic'?'#9afee599':'#ffac6355');g.addColorStop(.2,world==='pelagic'?'#50cce833':'#f4521022');g.addColorStop(1,'#00000000');gc.fillStyle=g;gc.fillRect(0,0,96,96);
    this.grid=document.createElement('canvas');this.grid.width=this.grid.height=N;this.background=document.createElement('canvas');host.prepend(this.canvas);this.resize();
  }
  resize(){const r=this.host.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);this.ratio=Math.min(devicePixelRatio||1,this.low?1:1.75);this.canvas.width=Math.round(this.width*this.ratio);this.canvas.height=Math.round(this.height*this.ratio);this.background.width=this.canvas.width;this.background.height=this.canvas.height;this.backgroundKey='';}
  setFrame(d:World){
    if(d===this.lastState)return;
    const last=this.lastState;this.previous.clear();
    if(d.world==='pelagic'&&last?.world==='pelagic'&&d.seed===last.seed&&d.tick===last.tick+1)for(const e of last.creatures)this.previous.set(e.id,e);
    this.lastState=d;this.received=performance.now();
    if(d.world==='pelagic'){
      if(this.order.length!==d.creatures.length||d.creatures.some((e,i)=>this.order[i]!==e.id||this.depths[i]!==e.depth)){
        this.order=d.creatures.map(e=>e.id);this.depths=d.creatures.map(e=>e.depth);this.sorted=[...d.creatures].sort((a,b)=>a.depth-b.depth);
      }else{const index=new Map(d.creatures.map(e=>[e.id,e]));this.sorted=this.sorted.map(e=>index.get(e.id)!);}
      if(this.ambientSeed!==d.seed){this.ambientSeed=d.seed;this.ambient=Array.from({length:this.low?25:65},(_,i)=>({x:hash(i,0,d.seed)*1000,y:hash(i,1,d.seed)*625,alpha:.04+hash(i,2,d.seed)*.15}));}
    }
  }
  point(x:number,y:number){const r=this.host.getBoundingClientRect();return pick(this.width,this.height,x-r.left,y-r.top);}
  mark(x:number,y:number,radius:number,visible=true){this.marker={x,y,radius,visible};}
  setTool(tool:string){this.tool=tool;}
  private backdrop(d:World){
    const key=`${d.seed}:${this.width}:${this.height}:${d.world==='pelagic'?d.params.brightness:0}`;if(key===this.backgroundKey)return;this.backgroundKey=key;
    const c=this.background.getContext('2d')!,w=this.width,h=this.height;c.setTransform(this.ratio,0,0,this.ratio,0,0);
    const g=c.createLinearGradient(0,0,w*.3,h);
    if(d.world==='pelagic'){g.addColorStop(0,`hsl(194 52% ${10+d.params.brightness*10}%)`);g.addColorStop(.52,'#071d30');g.addColorStop(1,'#050e1c');}else{g.addColorStop(0,'#191318');g.addColorStop(1,'#08090e');}
    c.fillStyle=g;c.fillRect(0,0,w,h);
    if(d.world==='pelagic'){
      for(let i=0;i<4;i++){const x=w*(.15+i*.19),beam=c.createLinearGradient(x,0,x+w*.08,h);beam.addColorStop(0,'#8bd8dd0c');beam.addColorStop(1,'#8bd8dd00');c.fillStyle=beam;c.beginPath();c.moveTo(x,0);c.lineTo(x-w*.12,h);c.lineTo(x+w*.22,h);c.closePath();c.fill();}
      for(let layer=0;layer<3;layer++){c.globalAlpha=.18+layer*.12;c.fillStyle='#030b18';c.beginPath();c.moveTo(0,h);for(let i=0;i<=18;i++)c.lineTo(w*i/18,h*(.88+layer*.035)-hash(i,layer,d.seed)*h*.12);c.lineTo(w,h);c.fill();}c.globalAlpha=1;
    }
  }
  draw(d:World,interpolate=false){
    if(this.disposed)return;this.backdrop(d);const c=this.context;c.setTransform(1,0,0,1,0,0);c.drawImage(this.background,0,0);c.setTransform(this.ratio,0,0,this.ratio,0,0);
    const v=viewport(this.width,this.height);c.save();c.translate(v.x,v.y);c.scale(v.scale,v.scale);
    c.beginPath();c.rect(0,0,1000,625);c.clip();
    if(d.world==='pelagic')this.sea(c,d,interpolate);else this.material(c,d);
    if(this.marker.visible){
      const colors:Record<string,string>={cool:'#acdbea',heat:'#ffc078',lava:'#ff9864',remove:'#dbadbc',flow:'#a1dcd5',add:'#c1ead0'};
      c.strokeStyle=colors[this.tool]??'#c0f9e8';c.globalAlpha=.55;c.lineWidth=1;c.setLineDash(this.tool==='remove'?[3,5]:[]);
      c.beginPath();c.ellipse(this.marker.x*1000,this.marker.y*625,this.marker.radius*1000,this.marker.radius*625,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
      c.globalAlpha=.8;c.beginPath();c.moveTo(this.marker.x*1000-3,this.marker.y*625);c.lineTo(this.marker.x*1000+3,this.marker.y*625);c.moveTo(this.marker.x*1000,this.marker.y*625-3);c.lineTo(this.marker.x*1000,this.marker.y*625+3);c.stroke();
    }c.restore();
  }
  private sea(c:CanvasRenderingContext2D,d:Pelagic,interpolate:boolean){
    const alpha=interpolate?clamp((performance.now()-this.received)/(DT*1000)):1,time=(d.tick-(interpolate&&this.previous.size?1-alpha:0))*DT;
    for(const light of d.lights){const x=light.x*1000,y=light.y*625;c.drawImage(this.glow,x-150,y-150,300,300);c.fillStyle='#ddfff0';c.beginPath();c.arc(x,y,2.5,0,Math.PI*2);c.fill();c.strokeStyle='#98dfd344';c.beginPath();c.arc(x,y,9+Math.sin(time*.7)*1.5,0,Math.PI*2);c.stroke();}
    c.fillStyle='#c4eae5';for(let i=0;i<this.ambient.length;i++){const a=this.ambient[i];c.globalAlpha=a.alpha;c.fillRect(a.x+Math.sin(time*.08+i)*8,a.y+Math.sin(time*.1+i)*5,1,1);}c.globalAlpha=1;
    // Currents are faint directional filaments, not a bright trail over the creatures.
    for(const f of d.flows){c.strokeStyle='#93e2de';c.globalAlpha=Math.exp(-f.age*1.3)*.18;c.lineWidth=.7;c.beginPath();c.moveTo(f.x*1000,f.y*625);c.quadraticCurveTo(f.x*1000+f.dx*25,f.y*625+f.dy*18-4,f.x*1000+f.dx*65,f.y*625+f.dy*40);c.stroke();}c.globalAlpha=1;
    const entities=d===this.lastState?this.sorted:[...d.creatures].sort((a,b)=>a.depth-b.depth);
    for(const e of entities){
      const old=interpolate?this.previous.get(e.id):undefined,x=(old?old.x+(e.x-old.x)*alpha:e.x)*1000,y=(old?old.y+(e.y-old.y)*alpha:e.y)*625,s=.45+e.depth*.8,phase=time*1.5+e.phase;
      c.save();c.translate(x,y);c.scale(s,s);c.globalAlpha=.25+e.depth*.7;
      if(e.kind==='jelly'){
        const pulse=1+Math.sin(phase)*.09;c.drawImage(this.glow,-60,-55,120,120);c.strokeStyle='#89d8de66';c.lineWidth=.8;
        for(let i=0;i<(this.low?5:8);i++){const tx=(i-(this.low?2:3.5))*4,tail=38+(i%3)*10;c.beginPath();c.moveTo(tx,5);c.bezierCurveTo(tx+Math.sin(phase+i*.7)*9,tail*.35,tx-Math.sin(phase*.8+i*.7)*10,tail*.7,tx+Math.sin(phase*.6+i*.7)*12,tail);c.stroke();}
        const g=c.createLinearGradient(0,-24,0,14);g.addColorStop(0,'#c7fff37a');g.addColorStop(.45,'#87d8dc25');g.addColorStop(1,'#76aef966');c.fillStyle=g;c.strokeStyle='#bef9ef88';c.lineWidth=.8;c.beginPath();c.moveTo(-22*pulse,7);c.bezierCurveTo(-23*pulse,-23,21*pulse,-27,22*pulse,7);c.quadraticCurveTo(0,17,-22*pulse,7);c.fill();c.stroke();
        c.strokeStyle='#d0fff345';for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(i*3,-16);c.quadraticCurveTo(i*15,-3,i*10,9);c.stroke();}
        c.strokeStyle='#e1fff077';c.beginPath();c.ellipse(0,7,21*pulse,4,0,0,Math.PI);c.stroke();
      }else if(e.kind==='fish'){
        const angle=Math.atan2(e.vy*625,e.vx*1000);c.rotate(old?angleBetween(Math.atan2(old.vy*625,old.vx*1000),angle,alpha):angle);
        const tail=Math.sin(time*9+e.phase)*2;c.fillStyle=e.depth>.5?'#afd6d3':'#6ea9be';c.beginPath();c.moveTo(8,0);c.quadraticCurveTo(1,-4,-5,-1);c.lineTo(-10,-4+tail);c.lineTo(-9,4+tail);c.lineTo(-5,1);c.quadraticCurveTo(1,4,8,0);c.fill();c.strokeStyle='#daf8dc77';c.lineWidth=.6;c.beginPath();c.moveTo(-3,-1);c.lineTo(5,-1);c.stroke();
      }else{if(!this.low)c.drawImage(this.glow,-8,-8,16,16);c.fillStyle='#aef2d0';c.globalAlpha*=.6+.4*Math.sin(phase)**2;c.beginPath();c.arc(0,0,1.2,0,Math.PI*2);c.fill();}
      c.restore();
    }
  }
  private material(c:CanvasRenderingContext2D,d:Ember){
    if(d!==this.pixelsState){
      if(this.noiseSeed!==d.seed){this.noiseSeed=d.seed;this.noise=materialNoise(d.seed);const fault=new Float64Array(N*N),phase=(d.seed%1000)*.01;for(let y=0;y<N;y++)for(let x=0;x<N;x++)fault[y*N+x]=.5+Math.sin(x*.16+phase)*.14+Math.cos(y*.21-phase)*.1+Math.sin((x+y)*.09)*.12+(this.noise[y*N+x]-.5)*.018;this.faults=[.25,.4,.55,.7].flatMap(level=>contours(fault,level));}
      emberPixels(d,this.pixels,this.noise);this.image??=new ImageData(this.pixels,N,N);this.grid.getContext('2d')!.putImageData(this.image,0,0);
      for(let i=0;i<N*N;i++)this.thermal[i]=d.heat[i]*clamp(d.mass[i]*8)+(this.noise![i]-.5)*.025*clamp(d.mass[i]*8);
      this.edges=(this.low?[.32,.72]:[.22,.38,.58,.78]).map(level=>contours(this.thermal,level));this.cracks=[];for(let k=0;k<this.faults.length;k+=4){const x=Math.round((this.faults[k]+this.faults[k+2])*.5),y=Math.round((this.faults[k+1]+this.faults[k+3])*.5),i=y*N+x;if(d.solid[i]&&d.mass[i]>.015&&d.crack[i]>.015)this.cracks.push(this.faults[k],this.faults[k+1],this.faults[k+2],this.faults[k+3]);}this.pixelsState=d;
    }
    c.imageSmoothingEnabled=true;c.drawImage(this.grid,0,0,1000,625);const sx=1000/(N-1),sy=625/(N-1);
    for(let layer=0;layer<this.edges.length;layer++){
      const segments=this.edges[layer];c.strokeStyle=layer===0?'#08090e99':layer===this.edges.length-1?'#ffdc9b66':'#d867343d';c.lineWidth=layer===0?1.5:.7;c.beginPath();
      for(let i=0;i<segments.length;i+=4){c.moveTo(segments[i]*sx,segments[i+1]*sy);c.lineTo(segments[i+2]*sx,segments[i+3]*sy);}c.stroke();
    }
    c.strokeStyle='#08090dbb';c.lineWidth=1.1;c.beginPath();for(let i=0;i<this.cracks.length;i+=4){c.moveTo(this.cracks[i]*sx,this.cracks[i+1]*sy);c.lineTo(this.cracks[i+2]*sx,this.cracks[i+3]*sy);}c.stroke();
    // Emission follows actual heat, with coarse samples only for soft light.
    if(!this.low){c.globalCompositeOperation='screen';for(let y=2;y<N;y+=6)for(let x=2;x<N;x+=6){const i=y*N+x;if(d.heat[i]<.6||d.mass[i]<.015)continue;c.globalAlpha=(d.heat[i]-.6)*clamp(d.mass[i]*4)*.35;c.drawImage(this.glow,x*sx-32,y*sy-24,64,48);}c.globalCompositeOperation='source-over';c.globalAlpha=1;}
  }
  async snapshot(d:World,size=1600){
    const canvas=this.canvas,context=this.context,background=this.background,w=this.width,h=this.height,ratio=this.ratio,key=this.backgroundKey,visible=this.marker.visible;
    const image=document.createElement('canvas');image.width=size;image.height=Math.round(size/1.6);
    try{this.canvas=image;this.context=image.getContext('2d')!;this.background=document.createElement('canvas');this.background.width=image.width;this.background.height=image.height;this.width=image.width;this.height=image.height;this.ratio=1;this.backgroundKey='';this.marker.visible=false;this.draw(d,false);}
    finally{this.canvas=canvas;this.context=context;this.background=background;this.width=w;this.height=h;this.ratio=ratio;this.backgroundKey=key;this.marker.visible=visible;}
    return new Promise<Blob>((resolve,reject)=>image.toBlob(b=>b?resolve(b):reject(new Error('Image export failed.')),'image/png'));
  }
  dispose(){this.disposed=true;this.canvas.remove();for(const c of [this.canvas,this.background,this.grid,this.glow])c.width=c.height=1;this.lastState=undefined;this.pixelsState=undefined;this.previous.clear();this.sorted=[];}
}
