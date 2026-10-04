import { audible, colors, names, type SoundProject, type SoundEvent } from './model.ts';
interface Pulse {event:SoundEvent;time:number}
export class LoomView {
  private context:CanvasRenderingContext2D;private pulses:Pulse[]=[];private width=1;private height=1;
  pointer?:{x:number;y:number};
  readonly canvas:HTMLCanvasElement;
  constructor(canvas:HTMLCanvasElement){this.canvas=canvas;const context=canvas.getContext('2d');if(!context)throw new Error('Canvas is unavailable. Use the note grid to compose.');this.context=context;this.resize();}
  resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(2,globalThis.devicePixelRatio||1);this.width=Math.max(1,rect.width);this.height=Math.max(1,rect.height);this.canvas.width=Math.round(this.width*dpr);this.canvas.height=Math.round(this.height*dpr);this.context.setTransform(dpr,0,0,dpr,0,0);}
  add(event:SoundEvent,time:number){this.pulses.push({event,time});if(this.pulses.length>192)this.pulses.shift();}
  clear(){this.pulses=[];}
  select(clientY:number){const rect=this.canvas.getBoundingClientRect();return Math.max(0,Math.min(5,Math.round(((clientY-rect.top)/this.height-.2)/.12)));}
  draw(project:SoundProject,selected:number,clock:number,playing:boolean,reduced:boolean){
    const c=this.context,w=this.width,h=this.height;
    c.clearRect(0,0,w,h);c.fillStyle='#10171b';c.fillRect(0,0,w,h);
    const wash=c.createRadialGradient(w*.6,h*.4,0,w*.6,h*.4,w*.65);wash.addColorStop(0,'#273330');wash.addColorStop(1,'#10171b');c.fillStyle=wash;c.fillRect(0,0,w,h);
    c.lineWidth=.5;c.strokeStyle='#adbaac0c';for(let x=24;x<w;x+=24){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}
    this.pulses=this.pulses.filter(p=>clock-p.time<1.6);
    const bend=(x:number,y:number)=>{if(reduced||!this.pointer)return 0;const dx=x-this.pointer.x,dy=y-this.pointer.y,d=Math.hypot(dx,dy);return Math.sign(dy||1)*Math.max(0,1-d/95)**2*21;};
    const yAt=(track:number,t:number)=>{const notes=project.tracks[track].steps,index=Math.max(0,t*notes.length-.5),low=Math.floor(index),fraction=index-low;const degree=notes[Math.min(low,notes.length-1)].degree*(1-fraction)+notes[Math.min(low+1,notes.length-1)].degree*fraction;return h*(.2+track*.12)+Math.sin(t*Math.PI*2+track*.66)*(h*.045)*Math.sin(t*Math.PI)+(track>=4?(4-degree)*h*.002:0)+(playing&&!reduced?Math.sin(t*9-clock*1.7+track)*h*.005:0);};
    for(let i=0;i<6;i++){
      const track=project.tracks[i],active=i===selected;c.globalAlpha=audible(project,i)&&track.volume>0?1:.25;
      for(let strand=0;strand<4;strand++){c.beginPath();for(let k=0;k<=90;k++){const t=k/90,x=w*(.075+.85*t),base=yAt(i,t)+(strand-1.5)*1.35,y=base+bend(x,base);if(k===0)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=strand===1?colors[i]:colors[i]+(active?'48':'25');c.lineWidth=strand===1?(active?1.35:.8):.6;c.shadowColor='#000';c.shadowBlur=4;c.shadowOffsetY=4;c.stroke();c.shadowBlur=0;c.shadowOffsetY=0;}
      track.steps.forEach((note,j)=>{const t=(j+.5)/track.steps.length,x=w*(.075+.85*t),base=yAt(i,t),y=base+bend(x,base);c.beginPath();c.arc(x,y,note.on?1.4+note.velocity*1.5:1,0,Math.PI*2);c.fillStyle=note.on?colors[i]:'#71817566';c.fill();});
      c.font='9px monospace';c.fillStyle=colors[i];c.fillText(String(i+1).padStart(2,'0'),w*.025,h*(.2+i*.12)+3);
    }
    c.globalAlpha=1;
    for(const {event,time}of this.pulses){const age=clock-time;if(age<0||age>1.4||!audible(project,event.track)||project.tracks[event.track].volume===0)continue;const track=project.tracks[event.track],t=((event.step%track.steps.length)+.5)/track.steps.length,x=w*(.075+.85*t),base=yAt(event.track,t),y=base+bend(x,base),strength=(1-age/1.4)*event.velocity;
      c.globalAlpha=strength;c.fillStyle=colors[event.track];if(!reduced){const glow=c.createRadialGradient(x,y,0,x,y,22);glow.addColorStop(0,colors[event.track]+'99');glow.addColorStop(1,colors[event.track]+'00');c.fillStyle=glow;c.fillRect(x-22,y-22,44,44);c.strokeStyle=colors[event.track]+'55';c.lineWidth=.7;c.beginPath();c.ellipse(x,y,5+age*23,3+age*9,0,0,Math.PI*2);c.stroke();const progress=Math.min(1,t+age*.1),rx=w*(.075+.85*progress),ry=yAt(event.track,progress);c.fillStyle=colors[event.track];c.beginPath();c.arc(rx,ry+bend(rx,ry),1.5,0,Math.PI*2);c.fill();}c.fillStyle='#f6ead2';c.beginPath();c.arc(x,y,1.5+strength*2,0,Math.PI*2);c.fill();
    }
    c.globalAlpha=1;c.font='9px monospace';c.fillStyle='#89988e';c.fillText('SIX THREADS / ONE SHARED CLOCK',w*.075,h*.09);c.fillText(names[selected].toUpperCase(),w*.075,h*.94);c.textAlign='right';c.fillText(playing?'WEAVING':'READY WHEN YOU ARE',w*.925,h*.94);c.textAlign='left';
  }
}
