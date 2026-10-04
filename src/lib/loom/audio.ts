import { audible, random, type SoundProject, type SoundEvent } from './model.ts';
import type { AudioSink } from './transport.ts';
interface Voice {sources:AudioScheduledSourceNode[];nodes:AudioNode[];end:number}
interface Mixer {gate:GainNode;gains:GainNode[];pans:StereoPannerNode[];sends:GainNode[];nodes:AudioNode[];expires:number}
/** Shared synthesis graph for realtime and OfflineAudioContext. No external samples. */
export class LoomAudio implements AudioSink {
  private mixer?:Mixer;private mixers:Mixer[]=[];private voices=new Set<Voice>();private noise:AudioBuffer;
  private output:GainNode;private compressor:DynamicsCompressorNode;
  private project?:SoundProject;
  private cleanup:ReturnType<typeof setTimeout>|undefined;
  private context:BaseAudioContext;private cue:(event:SoundEvent,time:number)=>void;private live:boolean;
  constructor(context:BaseAudioContext,cue:(event:SoundEvent,time:number)=>void=()=>{},live=true){
    this.context=context;this.cue=cue;this.live=live;
    this.output=context.createGain();this.output.gain.value=.65;
    this.compressor=context.createDynamicsCompressor();this.compressor.threshold.value=-15;this.compressor.knee.value=18;this.compressor.ratio.value=5;this.compressor.attack.value=.003;this.compressor.release.value=.18;
    this.compressor.connect(this.output);this.output.connect(context.destination);
    this.noise=context.createBuffer(1,context.sampleRate,context.sampleRate);const data=this.noise.getChannelData(0),rng=random(8319);for(let i=0;i<data.length;i++)data[i]=rng()*2-1;
  }
  version(project:SoundProject,time:number){
    if(this.mixer){this.mixer.gate.gain.cancelScheduledValues(time);this.mixer.gate.gain.setValueAtTime(1,time);this.mixer.gate.gain.linearRampToValueAtTime(0,time+.012);this.mixer.expires=time+.04;}
    this.project=structuredClone(project);const c=this.context,gate=c.createGain(),nodes:AudioNode[]=[gate],gains:GainNode[]=[],pans:StereoPannerNode[]=[],sends:GainNode[]=[];
    gate.connect(this.compressor);gate.gain.setValueAtTime(0,time);gate.gain.linearRampToValueAtTime(1,time+.005);
    const delay=c.createDelay(1),feedback=c.createGain(),filter=c.createBiquadFilter(),wet=c.createGain();delay.delayTime.value=60/project.bpm*.75;feedback.gain.value=.23;filter.type='lowpass';filter.frequency.value=2400;wet.gain.value=.5;delay.connect(filter);filter.connect(feedback);feedback.connect(delay);filter.connect(wet);wet.connect(gate);nodes.push(delay,feedback,filter,wet);
    for(let i=0;i<6;i++){const gain=c.createGain(),pan=c.createStereoPanner(),send=c.createGain();gain.connect(pan);pan.connect(gate);pan.connect(send);send.connect(delay);gains.push(gain);pans.push(pan);sends.push(send);nodes.push(gain,pan,send);}
    this.mixer={gate,gains,pans,sends,nodes,expires:Infinity};this.mixers.push(this.mixer);this.mix(project,time);
  }
  mix(project:SoundProject,time:number){this.project=structuredClone(project);if(!this.mixer)return;project.tracks.forEach((track,i)=>{const gain=this.mixer!.gains[i].gain;gain.cancelScheduledValues(time);gain.setTargetAtTime(audible(project,i)?track.volume:0,time,.008);this.mixer!.pans[i].pan.setTargetAtTime(track.pan,time,.012);this.mixer!.sends[i].gain.setTargetAtTime(track.space,time,.012);});}
  note(event:SoundEvent,time:number){
    if(!this.mixer||!this.project)return;this.collect();
    if(this.live&&this.voices.size>=64){const oldest=this.voices.values().next().value;if(oldest)this.release(oldest);}
    const c=this.context,i=event.track,env=c.createGain(),nodes:AudioNode[]=[env],sources:AudioScheduledSourceNode[]=[];
    const duration=[.48,.22,.09,.28,.48,.9][i],level=event.velocity*[.9,.3,.12,.3,.36,.27][i];
    env.gain.setValueAtTime(0,time);env.gain.linearRampToValueAtTime(level,time+.006);env.gain.exponentialRampToValueAtTime(.0001,time+duration);env.gain.setValueAtTime(0,time+duration+.01);env.connect(this.mixer.gains[i]);
    const osc=(frequency:number,type:OscillatorType='sine',ratio=1)=>{const o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(frequency,time);g.gain.value=ratio;o.connect(g);g.connect(env);sources.push(o);nodes.push(o,g);return o;};
    if(i===0){const o=osc(130);o.frequency.exponentialRampToValueAtTime(46,time+.085);}
    else if(i===1||i===2){const source=c.createBufferSource(),filter=c.createBiquadFilter();source.buffer=this.noise;source.loop=true;filter.type=i===1?'bandpass':'highpass';filter.frequency.value=i===1?1700:6500;filter.Q.value=.65;source.connect(filter);filter.connect(env);sources.push(source);nodes.push(source,filter);if(i===1)osc(175,'triangle',.22);}
    else if(i===3){osc(340);osc(731,'sine',.23);}
    else if(i===4){osc(event.frequency);osc(event.frequency*2,'sine',.13);}
    else {const o=osc(event.frequency,'triangle',.65);o.detune.value=-3;osc(event.frequency*2.001,'sine',.2);osc(event.frequency*3,'sine',.06);}
    const voice:Voice={sources,nodes,end:time+duration+.02};this.voices.add(voice);let ended=0;
    for(const source of sources){source.onended=()=>{if(++ended===sources.length)this.release(voice,false);};if(source instanceof AudioBufferSourceNode)source.start(time,(event.seed%1000)/1000);else source.start(time);source.stop(voice.end);}
    this.cue(event,time);
  }
  private release(voice:Voice,stop=true){if(!this.voices.delete(voice))return;for(const source of voice.sources){source.onended=null;if(stop)try{source.stop();}catch{/* already ended */}}for(const node of voice.nodes)node.disconnect();}
  collect(){if(!this.live)return;for(const mixer of this.mixers)if(mixer.expires<this.context.currentTime)for(const node of mixer.nodes)node.disconnect();this.mixers=this.mixers.filter(m=>m.expires>=this.context.currentTime);}
  silence(){const now=this.context.currentTime,retired=[...this.mixers];for(const mixer of retired){mixer.gate.gain.cancelScheduledValues(now);mixer.gate.gain.setTargetAtTime(0,now,.003);mixer.expires=now+.03;}for(const voice of this.voices)for(const source of voice.sources)try{source.stop(now+.025);}catch{/* already stopped */}this.mixer=undefined;if(this.cleanup)clearTimeout(this.cleanup);this.cleanup=setTimeout(()=>{for(const mixer of retired)for(const node of mixer.nodes)node.disconnect();this.mixers=this.mixers.filter(m=>!retired.includes(m));this.cleanup=undefined;},40);}
  dispose(){if(this.cleanup)clearTimeout(this.cleanup);for(const voice of [...this.voices])this.release(voice);for(const mixer of this.mixers)for(const node of mixer.nodes)node.disconnect();this.mixers=[];this.mixer=undefined;this.compressor.disconnect();this.output.disconnect();}
}
