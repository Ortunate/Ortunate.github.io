export const instruments = ['kick','snare','hat','perc','bass','pluck'] as const;
export type Instrument = typeof instruments[number];
export const names = ['Soft kick','Brush snare','Silk hat','Wood & wire','Round bass','Warm pluck'];
export const colors = ['#d1a77c','#c48275','#dacb9c','#91b3ac','#8b99bb','#b3a0c9'];
export const lengths = [8,12,16,24,32] as const;
export const scales = {major:[0,2,4,7,9],minor:[0,3,5,7,10],dorian:[0,2,3,5,7,9,10]} as const;
export type Scale = keyof typeof scales;
export interface Note {on:boolean;velocity:number;probability:number;degree:number;locked:boolean}
export interface Track {instrument:Instrument;steps:Note[];volume:number;pan:number;space:number;mute:boolean;solo:boolean}
export interface SoundProject {format:'ortunate-loom';version:1;name:string;seed:number;bpm:number;swing:number;root:number;scale:Scale;tracks:Track[]}
export interface SoundEvent {step:number;track:number;time:number;frequency:number;velocity:number;seed:number}
export const FILE_LIMIT=128*1024;
export const blankNote=():Note=>({on:false,velocity:.7,probability:1,degree:0,locked:false});
export function newProject(name='Untitled weave'):SoundProject {
  return {format:'ortunate-loom',version:1,name,seed:17,bpm:96,swing:.5,root:0,scale:'minor',tracks:instruments.map((instrument,i)=>({instrument,steps:Array.from({length:16},blankNote),volume:i===2?.3:i===4?.55:.65,pan:[0,-.12,.23,-.28,0,.18][i],space:i===5?.3:i===3?.15:.03,mute:false,solo:false}))};
}
export function random(seed:number){let n=seed>>>0;return()=>{n+=0x6D2B79F5;let t=Math.imul(n^(n>>>15),1|n);t^=t+Math.imul(t^(t>>>7),61|t);return((t^(t>>>14))>>>0)/4294967296;};}
export function hash(seed:number,a:number,b:number){let h=(seed^Math.imul(a+1,0x9e3779b1)^Math.imul(b+1,0x85ebca6b))>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return(h^(h>>>16))>>>0;}
const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
export function cycleSteps(project:SoundProject){return project.tracks.reduce((n,t)=>n*t.steps.length/gcd(n,t.steps.length),1);}
export function stepTime(project:SoundProject,step:number){return (step+(step%2?2*(project.swing-.5):0))*60/project.bpm/4;}
export function pitch(project:SoundProject,track:number,degree:number){const scale=scales[project.scale],octave=Math.floor(degree/scale.length),semitone=scale[((degree%scale.length)+scale.length)%scale.length];return 440*2**(((track===4?36:60)+project.root+12*octave+semitone-69)/12);}
export function audible(project:SoundProject,index:number){return !project.tracks[index].mute&&(!project.tracks.some(t=>t.solo)||project.tracks[index].solo);}
export function eventsAt(project:SoundProject,step:number):SoundEvent[]{
  const position=step%cycleSteps(project),time=stepTime(project,step),events:SoundEvent[]=[];
  project.tracks.forEach((track,i)=>{const note=track.steps[position%track.steps.length],seed=hash(project.seed,i,position);if(note.on&&audible(project,i)&&random(seed)()<note.probability)events.push({step,track:i,time,frequency:pitch(project,i,note.degree),velocity:note.velocity,seed});});return events;
}
export function compile(project:SoundProject,cycles=1){validateProject(project);if(!Number.isInteger(cycles)||cycles<1||cycles>4)throw new Error('Choose 1–4 cycles.');return Array.from({length:cycleSteps(project)*cycles},(_,step)=>eventsAt(project,step)).flat();}
export function euclidean(length:number,pulses:number,rotation=0){if(!Number.isInteger(length)||length<1||length>32||!Number.isInteger(pulses)||pulses<0||pulses>length||!Number.isInteger(rotation)||rotation<0||rotation>=length)throw new Error('Choose a whole-number density and rotation within this track.');return Array.from({length},(_,i)=>((((i-rotation)%length+length)%length)*pulses)%length<pulses);}
export function generateTrack(project:SoundProject,index:number,pulses:number,rotation=0){
  const next=structuredClone(project),track=next.tracks[index],pattern=euclidean(track.steps.length,pulses,rotation),rng=random(hash(project.seed,index,rotation));
  track.steps=track.steps.map((note,i)=>{const degree=index>=4?Math.floor(rng()*scales[project.scale].length)+(index===5&&rng()>.75?scales[project.scale].length:0):0;const velocity=.45+rng()*.4;return note.locked?note:{...note,on:pattern[i],degree,velocity};});return next;
}
export function resizeTrack(project:SoundProject,index:number,length:number){const next=structuredClone(project),track=next.tracks[index];track.steps=Array.from({length},(_,i)=>structuredClone(track.steps[i]??blankNote()));validateProject(next);return next;}
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateProject(value:unknown):asserts value is SoundProject {
  const p=value as SoundProject;
  if(!p||p.format!=='ortunate-loom'||p.version!==1||typeof p.name!=='string'||p.name.length>80||!Number.isInteger(p.seed)||!number(p.seed,0,4294967295)||!number(p.bpm,60,160)||!number(p.swing,.5,.65)||!Number.isInteger(p.root)||!number(p.root,0,11)||!Object.hasOwn(scales,p.scale)||!Array.isArray(p.tracks)||p.tracks.length!==6)throw new Error('Invalid or unsupported Sound Loom project.');
  p.tracks.forEach((t,i)=>{if(!t||t.instrument!==instruments[i]||!number(t.volume,0,1)||!number(t.pan,-1,1)||!number(t.space,0,.6)||typeof t.mute!=='boolean'||typeof t.solo!=='boolean'||!Array.isArray(t.steps)||!lengths.includes(t.steps.length as typeof lengths[number]))throw new Error('Invalid track settings.');for(const n of t.steps)if(!n||typeof n.on!=='boolean'||typeof n.locked!=='boolean'||!number(n.velocity,.05,1)||!number(n.probability,0,1)||!Number.isInteger(n.degree)||!number(n.degree,0,13))throw new Error('Invalid note settings.');});
}
export function encodeProject(project:SoundProject){validateProject(project);return JSON.stringify(project,null,2);}
export function decodeProject(text:string){if(new TextEncoder().encode(text).length>FILE_LIMIT)throw new Error('Project exceeds 128 KB.');const project:unknown=JSON.parse(text);validateProject(project);return project;}
export class ProjectEditor {
  project:SoundProject;undoStack:SoundProject[]=[];redoStack:SoundProject[]=[];
  constructor(project:SoundProject){validateProject(project);this.project=structuredClone(project);}
  commit(project:SoundProject){validateProject(project);if(JSON.stringify(project)===JSON.stringify(this.project))return false;this.undoStack.push(this.project);if(this.undoStack.length>50)this.undoStack.shift();this.project=structuredClone(project);this.redoStack=[];return true;}
  undo(){const p=this.undoStack.pop();if(!p)return false;this.redoStack.push(this.project);this.project=p;return true;}
  redo(){const p=this.redoStack.pop();if(!p)return false;this.undoStack.push(this.project);this.project=p;return true;}
}
