import type { KineticDocument, Point } from './model.ts';
import type { PhysicsFrame } from './physics.ts';
export interface MachineView {
  canvas:HTMLCanvasElement; kind:'3d'|'2d';
  update(doc:KineticDocument,frame:PhysicsFrame|undefined,selected:string|undefined):void;
  setTrails(trails:Point[][]):void;
  render(time:number):void;point(clientX:number,clientY:number):Point;
  zoom(delta:number):void;pan(dx:number,dy:number):void;reset():void;resize():void;dispose():void;
}
export function hitPart(doc:KineticDocument,p:Point):string|undefined {
  if(Math.hypot(p.x-doc.emitter.x,p.y-doc.emitter.y)<.5)return 'emitter';
  if(Math.abs(p.x-doc.goal.x)<.8&&Math.abs(p.y-doc.goal.y)<.6)return 'goal';
  for(const part of [...doc.parts].reverse()){
    const dx=p.x-part.x,dy=p.y-part.y,c=Math.cos(part.angle),s=Math.sin(part.angle),x=dx*c+dy*s,y=-dx*s+dy*c;
    if(part.kind==='bumper'?Math.hypot(x,y)<.52:Math.abs(x)<(part.kind==='pad'?.5:part.length/2)+.15&&Math.abs(y)<.35)return part.id;
  }
}
export class CanvasMachineView implements MachineView {
  private trails:Point[][]=[];
  setTrails(trails:Point[][]){this.trails=trails;}
  kind='2d' as const;canvas:HTMLCanvasElement;private ctx:CanvasRenderingContext2D;private doc?:KineticDocument;private frame?:PhysicsFrame;private selected?:string;private scale=1;private offset={x:0,y:0};
  constructor(canvas:HTMLCanvasElement){this.canvas=canvas;this.ctx=canvas.getContext('2d')!;this.resize();}
  update(doc:KineticDocument,frame:PhysicsFrame|undefined,selected:string|undefined){this.doc=doc;this.frame=frame;this.selected=selected;}
  private unit(){return this.canvas.width/18*this.scale;}
  point(clientX:number,clientY:number){const r=this.canvas.getBoundingClientRect(),u=this.unit();return {x:((clientX-r.left)/r.width*this.canvas.width-this.canvas.width/2)/u+8-this.offset.x,y:-((clientY-r.top)/r.height*this.canvas.height-this.canvas.height/2)/u+5-this.offset.y};}
  zoom(delta:number){this.scale=Math.max(.65,Math.min(2.8,this.scale*Math.exp(delta)));}
  pan(dx:number,dy:number){this.offset.x+=dx/this.canvas.clientWidth*18/this.scale;this.offset.y-=dy/this.canvas.clientWidth*18/this.scale;}
  reset(){this.scale=1;this.offset={x:0,y:0};}
  resize(){const r=this.canvas.getBoundingClientRect();this.canvas.width=Math.max(1,Math.round(r.width*Math.min(2,devicePixelRatio)));this.canvas.height=Math.max(1,Math.round(r.height*Math.min(2,devicePixelRatio)));}
  render(){const c=this.ctx,doc=this.doc;if(!doc)return;c.fillStyle='#10161d';c.fillRect(0,0,this.canvas.width,this.canvas.height);c.save();c.translate(this.canvas.width/2,this.canvas.height/2);const u=this.unit();c.scale(u,-u);c.translate(-8+this.offset.x,-5+this.offset.y);c.fillStyle='#1d2630';c.fillRect(0,0,16,10);c.strokeStyle='#2d3942';c.lineWidth=.012;for(let x=0;x<=16;x+=.5){c.beginPath();c.moveTo(x,0);c.lineTo(x,10);c.stroke();}for(let y=0;y<=10;y+=.5){c.beginPath();c.moveTo(0,y);c.lineTo(16,y);c.stroke();}
    for(const p of doc.parts){const pose=this.frame?.poses.find(v=>v.id===p.id);c.save();c.translate(pose?.x??p.x,pose?.y??p.y);c.rotate(pose?.angle??p.angle);c.fillStyle=p.id===this.selected?'#c6e7d6':p.locked?'#a08160':'#d6d7cc';c.strokeStyle='#475764';c.lineWidth=.04;if(p.kind==='bumper'){c.beginPath();c.arc(0,0,.35,0,Math.PI*2);c.fill();}else{c.fillRect(-(p.kind==='pad'?1:p.length)/2,-.1,p.kind==='pad'?1:p.length,.2);if(p.kind==='pad'){c.fillStyle='#dca96b';c.beginPath();c.moveTo(-.15,.2);c.lineTo(.15,.2);c.lineTo(0,.45);c.fill();}}if(p.kind==='seesaw'||p.kind==='rotor'){c.fillStyle='#c59662';c.beginPath();c.arc(0,0,.14,0,7);c.fill();}c.restore();}
    c.strokeStyle=this.selected==='goal'?'#e7d392':'#7fcbb1';c.lineWidth=.14;c.beginPath();c.moveTo(doc.goal.x-.64,doc.goal.y+.4);c.lineTo(doc.goal.x-.64,doc.goal.y-.38);c.lineTo(doc.goal.x+.64,doc.goal.y-.38);c.lineTo(doc.goal.x+.64,doc.goal.y+.4);c.stroke();c.fillStyle=this.selected==='emitter'?'#eed292':'#849aab';c.fillRect(doc.emitter.x-.28,doc.emitter.y+.15,.56,.45);c.fillStyle='#adc6d5';c.beginPath();c.arc(doc.emitter.x,doc.emitter.y,.16,0,7);c.fill();
    c.strokeStyle='#81bca866';c.lineWidth=.025;for(const trail of this.trails){c.beginPath();trail.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.stroke();}
    for(const p of this.frame?.poses??[])if(p.id.startsWith('ball-')){c.fillStyle=p.collected?'#76d4af':'#d6e9f4';c.beginPath();c.arc(p.x,p.y,.16,0,7);c.fill();}c.restore();
  }
  dispose(){}
}
