import { eventsAt, stepTime, type SoundEvent, type SoundProject } from './model.ts';
export interface AudioSink {version(project:SoundProject,time:number):void;note(event:SoundEvent,time:number):void;silence():void;mix(project:SoundProject,time:number):void}
/** Clock-injected transport: neither drawing nor wall-clock timers define beat timing. */
export class LoomTransport {
  project:SoundProject;pending?:SoundProject;running=false;nextStep=0;anchor=0;resumeStep=0;boundary=0;revision=0;
  private sink:AudioSink;private clock:()=>number;
  constructor(project:SoundProject,sink:AudioSink,clock:()=>number){this.project=structuredClone(project);this.sink=sink;this.clock=clock;}
  play(){if(this.running)return;this.anchor=this.clock()+.04-stepTime(this.project,this.resumeStep);this.nextStep=this.resumeStep;this.running=true;this.sink.version(this.project,this.clock());this.pump();}
  position(){if(!this.running)return this.resumeStep;const elapsed=Math.max(0,this.clock()-this.anchor),base=Math.floor(elapsed/(60/this.project.bpm/4));return Math.max(this.resumeStep,base%2&&elapsed<stepTime(this.project,base)?base-1:base);}
  pause(){if(this.running){const now=this.clock();this.resumeStep=this.position();if(this.anchor+stepTime(this.project,this.resumeStep)<now-.002)this.resumeStep++;}this.running=false;this.sink.silence();if(this.pending){this.project=this.pending;this.pending=undefined;this.resumeStep=0;this.revision++;}}
  stop(){this.pause();this.resumeStep=0;this.nextStep=0;}
  replace(project:SoundProject){if(this.running){if(!this.pending)this.boundary=Math.ceil(Math.max(this.nextStep,this.position()+1)/16)*16;this.pending=structuredClone(project);}else{this.project=structuredClone(project);this.pending=undefined;this.resumeStep=0;this.revision++;}}
  updateMix(project:SoundProject){for(let i=0;i<6;i++){const {volume,pan,space,mute,solo}=project.tracks[i],mix={volume,pan,space,mute,solo};Object.assign(this.project.tracks[i],mix);if(this.pending)Object.assign(this.pending.tracks[i],mix);}this.sink.mix(this.project,this.clock());}
  pump(){if(!this.running)return;const now=this.clock();
    // Skip missed beats, never dump a backlog of notes after a stall.
    if(this.anchor+stepTime(this.project,this.nextStep)<now-.015)this.nextStep=Math.max(this.nextStep,this.position()+1);
    if(this.pending&&this.nextStep>this.boundary)this.boundary=Math.ceil(this.nextStep/16)*16;
    let guard=0;
    while(guard++<8&&this.anchor+stepTime(this.project,this.nextStep)<now+.1){
      if(this.pending&&this.nextStep===this.boundary){const time=this.anchor+stepTime(this.project,this.nextStep);this.project=this.pending;this.pending=undefined;this.anchor=time;this.nextStep=0;this.resumeStep=0;this.revision++;this.sink.version(this.project,time);}
      const time=this.anchor+stepTime(this.project,this.nextStep);for(const event of eventsAt(this.project,this.nextStep))this.sink.note(event,time);this.nextStep++;
    }
  }
}
