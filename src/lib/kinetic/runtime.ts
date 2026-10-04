import { initPhysics, KineticPhysics, type PhysicsFrame } from './physics.ts';
import { validateDocument, validateSolution, type KineticDocument } from './model.ts';
export interface KineticRequest { id:number; generation:number; command:'init'|'run'|'pause'|'step'|'reset'|'speed'|'replay'; data?:any }
export interface KineticMessage { type:'reply'|'frame'; id?:number; generation:number; error?:string; data?:any }
export function createKineticRuntime(send:(message:KineticMessage)=>void){
  let engine:KineticPhysics|undefined,doc:KineticDocument|undefined,generation=0,epoch=0,running=false,speed=1,timer:ReturnType<typeof setTimeout>|undefined;
  const stop=()=>{epoch++;running=false;if(timer)clearTimeout(timer);timer=undefined;};
  const frame=()=>{if(engine)send({type:'frame',generation,data:{...engine.frame(),running}});};
  const loop=(key:number)=>{if(key!==epoch||!running||!engine)return;const started=performance.now();let n=0;do{engine.step();n++;}while(n<(speed===1?4:1)&&engine.result==='running'&&performance.now()-started<10);frame();if(engine.result!=='running'){running=false;frame();return;}timer=setTimeout(()=>loop(key),Math.max(0,n*1000/120/speed-(performance.now()-started)));};
  const handle=async(message:KineticRequest)=>{
    const {id,command,data}=message;
    try{
      if(command==='init'){
        validateDocument(data.document);if(data.question)validateSolution(data.question,data.document);
        stop();const key=epoch;generation=message.generation;
        await initPhysics();if(key!==epoch||generation!==message.generation)return;
        const replacement=new KineticPhysics(data.document);engine?.dispose();engine=replacement;doc=structuredClone(data.document);
      }else{
        if(message.generation!==generation)return;
        if(!engine||!doc)throw new Error('Physics is still loading.');
        switch(command){
          case 'run':if(engine.result!=='running')throw new Error('Return to edit or restart before running again.');stop();running=true;{const key=epoch;timer=setTimeout(()=>loop(key),0);}break;
          case 'pause':stop();break;
          case 'step':stop();engine.step();break;
          case 'reset':stop();engine.dispose();engine=new KineticPhysics(doc);break;
          case 'speed':if(data!==1&&data!==.25)throw new Error('Invalid playback speed.');speed=data;break;
          case 'replay':{stop();const frames=structuredClone(engine.replay);if(frames.at(-1)?.tick!==engine.tick)frames.push(engine.frame());send({type:'reply',id,generation,data:{frames,events:structuredClone(engine.events)}});frame();return;}
        }
      }
      send({type:'reply',id,generation,data:true});frame();
    }catch(error){send({type:'reply',id,generation:message.generation,error:error instanceof Error?error.message:'Physics operation failed.'});}
  };
  return {handle,dispose:()=>{stop();engine?.dispose();}};
}
export type ReplayData={frames:PhysicsFrame[];events:KineticPhysics['events']};
