import { compile, cycleSteps, stepTime, validateProject, type SoundProject } from './model.ts';
import { LoomAudio } from './audio.ts';
import { encodeWav } from './wav.ts';
export function exportDuration(project:SoundProject,cycles:number){if(![1,2,4].includes(cycles))throw new Error('Choose 1, 2 or 4 cycles.');validateProject(project);return stepTime(project,cycleSteps(project)*cycles)+2;}
export async function renderWav(project:SoundProject,cycles:number){
  const snapshot=structuredClone(project),duration=exportDuration(snapshot,cycles),sampleRate=44100;
  if(typeof OfflineAudioContext==='undefined')throw new Error('Offline audio is unavailable. Export the editable project instead.');
  const context=new OfflineAudioContext(2,Math.ceil(duration*sampleRate),sampleRate),audio=new LoomAudio(context,undefined,false);
  try{audio.version(snapshot,0);for(const event of compile(snapshot,cycles))audio.note(event,event.time);const buffer=await context.startRendering();const left=buffer.getChannelData(0),right=buffer.getChannelData(1);const fade=Math.min(1024,left.length);for(let i=0;i<fade;i++){const gain=i/fade;left[left.length-1-i]*=gain;right[right.length-1-i]*=gain;}return new Blob([encodeWav([left,right],sampleRate)],{type:'audio/wav'});}finally{audio.dispose();}
}
