import { LivingEngine, type Artwork, type Brush } from './engine.ts';
export interface LivingRequest { id:number; command:string; data?:any }
export interface LivingMessage { type:'reply'|'frame'; id?:number; error?:string; data?:any }
export function createLivingRuntime(send:(message:LivingMessage)=>void) {
  let engine=new LivingEngine(), running=false, preparing=false, token=0, timer:ReturnType<typeof setTimeout>|undefined;
  let history:Artwork[]=[], speed=120;
  const stop=()=>{token++;running=false;preparing=false;if(timer)clearTimeout(timer);};
  const frame=()=>send({type:'frame',data:{artwork:engine.snapshot(),running,preparing,canUndo:history.length>0}});
  const loop=(key:number,warmup=0)=>{
    if(key!==token)return;
    const start=performance.now();let steps=0;
    do { engine.step(); steps++; } while(steps<(warmup?12:Math.max(1,Math.round(speed/20)))&&performance.now()-start<12);
    frame();
    if(warmup){if(warmup<=steps){preparing=false;frame();return;}timer=setTimeout(()=>loop(key,warmup-steps),0);}
    else if(running)timer=setTimeout(()=>loop(key),Math.max(0,steps*1000/speed-(performance.now()-start)));
  };
  return {
    dispose:stop,
    handle({id,command,data}:LivingRequest) {
      try {
        switch(command){
          case 'new':stop();engine=new LivingEngine(data.seed,data.blank);history=[];if(!data.blank){preparing=true;const key=token;timer=setTimeout(()=>loop(key,700),0);}break;
          case 'pause':stop();break;
          case 'run':stop();history=[];running=true;timer=setTimeout(()=>loop(token),0);break;
          case 'step':stop();history=[];engine.step();break;
          case 'speed':if(![30,120,240].includes(data))throw new Error('Invalid speed.');speed=data;break;
          case 'stroke':stop();history.push(engine.snapshot());if(history.length>8)history.shift();break;
          case 'paint':stop();if(!Array.isArray(data.points)||data.points.length>512)throw new Error('Invalid stroke.');for(const p of data.points)engine.paint(data.kind as Brush,p.x,p.y,data.radius);break;
          case 'undo':stop();if(history.length)engine.restore(history.pop()!);break;
          case 'finish':{const doc=engine.snapshot();doc.finish=data;engine.restore(doc);break;}
          case 'restore':engine.restore(data);stop();history=[];break;
          case 'snapshot':send({type:'reply',id,data:engine.snapshot()});return;
          default:throw new Error('Unknown studio command.');
        }
        send({type:'reply',id,data:true});frame();
      }catch(error){send({type:'reply',id,error:error instanceof Error?error.message:'Studio operation failed.'});}
    }
  };
}
