import { ProjectEditor, newProject, names, colors, scales, cycleSteps, stepTime, generateTrack, resizeTrack, decodeProject, encodeProject, FILE_LIMIT, type SoundProject } from '../lib/loom/model.ts';
import { presets } from '../lib/loom/presets.ts';
import { LoomView } from '../lib/loom/view.ts';
import { listSounds, saveSound, deleteSound } from '../lib/loom/storage.ts';
import type { LoomAudio } from '../lib/loom/audio.ts';
import type { LoomTransport } from '../lib/loom/transport.ts';

const root=document.getElementById('loom');if(root)setup(root);
function setup(root:HTMLElement){
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(`loom-${id}`) as T;
  const field=(id:string)=>el<HTMLInputElement>(id);
  let editor=new ProjectEditor(presets[0]),selectedTrack=0,selectedStep=0,dirty=false,disposed=false,loading=false,exporting=false;
  let context:AudioContext|undefined,audio:LoomAudio|undefined,transport:LoomTransport|undefined,timer:ReturnType<typeof setInterval>|undefined;
  let audioAttempt=0;
  let view:LoomView|undefined,raf=0,needsDraw=true,lastPaint=0,lastPosition=-1,lastRevision=-1;
  const canvas=el<HTMLCanvasElement>('canvas'),status=(message:string,error=false)=>{el('status').textContent=message;el('status').dataset.error=String(error);};
  const act=(action:()=>Promise<unknown>)=>{void action().catch(error=>status(error instanceof Error?error.message:'Operation failed.',true));};
  const reduced=()=>document.documentElement.dataset.motion==='reduced'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{view=new LoomView(canvas);}catch(error){status(String(error),true);}
  function download(blob:Blob,extension:string,name=editor.project.name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${name.replace(/[^a-z0-9-]/gi,'-').slice(0,60)||'sound-loom'}${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function invalidate(){needsDraw=true;}
  function renderGrid(){
    lastPosition=-1;const host=el('grid'),focused=document.activeElement as HTMLElement|null,restore=focused?.dataset.note!==undefined;
    const rows=editor.project.tracks.map((track,i)=>{const row=document.createElement('div');row.className='loom-row';row.dataset.selected=String(i===selectedTrack);row.dataset.muted=String(track.mute);row.style.setProperty('--track',colors[i]);const label=document.createElement('button');label.textContent=names[i];label.addEventListener('click',()=>select(i,Math.min(selectedStep,track.steps.length-1)));const steps=document.createElement('div');steps.className='loom-steps';steps.style.setProperty('--steps',String(track.steps.length));steps.setAttribute('role','group');steps.setAttribute('aria-label',names[i]);track.steps.forEach((note,j)=>{const button=document.createElement('button');button.className='loom-note';button.dataset.note=`${i}:${j}`;button.dataset.on=String(note.on);button.dataset.selected=String(i===selectedTrack&&j===selectedStep);button.dataset.locked=String(note.locked);button.style.setProperty('--velocity',String(note.velocity));button.tabIndex=i===selectedTrack&&j===selectedStep?0:-1;button.textContent=String(j+1);button.setAttribute('aria-pressed',String(note.on));button.setAttribute('aria-label',`${names[i]}, step ${j+1}, ${note.on?'on':'off'}, velocity ${Math.round(note.velocity*100)}%, probability ${Math.round(note.probability*100)}%${note.locked?', locked':''}`);button.addEventListener('click',()=>{selectedTrack=i;selectedStep=j;edit(p=>{p.tracks[i].steps[j].on=!p.tracks[i].steps[j].on;});focusNote();});steps.append(button);});row.append(label,steps);return row;});host.replaceChildren(...rows);if(restore)focusNote();
  }
  function focusNote(){el('grid').querySelector<HTMLButtonElement>(`[data-note="${selectedTrack}:${selectedStep}"]`)?.focus({preventScroll:true});}
  function select(track:number,step:number){selectedTrack=track;selectedStep=step;sync();renderGrid();invalidate();}
  function sync(){const p=editor.project,t=p.tracks[selectedTrack],note=t.steps[selectedStep];
    const values:Record<string,string|number>={name:p.name,bpm:p.bpm,swing:Math.round(p.swing*100),seed:p.seed,root:p.root,scale:p.scale,length:t.steps.length,volume:t.volume,pan:t.pan,space:t.space,velocity:note.velocity,probability:note.probability,degree:note.degree};
    for(const id of ['volume','pan','space','velocity','probability'])el(`${id}-value`).textContent=id==='pan'?(Number(values[id])===0?'Center':`${Math.round(Math.abs(Number(values[id]))*100)}% ${Number(values[id])<0?'L':'R'}`):`${Math.round(Number(values[id])*100)}%`;
    for(const [id,value]of Object.entries(values))if(document.activeElement!==field(id))field(id).value=String(value);
    field('locked').checked=note.locked;el('pitch-label').hidden=selectedTrack<4;el('track-name').textContent=names[selectedTrack];el('note-name').textContent=`STEP ${String(selectedStep+1).padStart(2,'0')}`;el('cycle').textContent=`${cycleSteps(p)} STEPS / CYCLE`;
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-track]'))button.setAttribute('aria-pressed',String(Number(button.dataset.track)===selectedTrack));
    el('mute').setAttribute('aria-pressed',String(t.mute));el('solo').setAttribute('aria-pressed',String(t.solo));
    el<HTMLButtonElement>('undo').disabled=!editor.undoStack.length;el<HTMLButtonElement>('redo').disabled=!editor.redoStack.length;
    el<HTMLButtonElement>('play').disabled=loading||typeof AudioContext==='undefined';el('play').textContent=loading?'Starting…':transport?.running?'Pause Ⅱ':'Play ▶';el<HTMLButtonElement>('restart').disabled=loading||typeof AudioContext==='undefined';
    el('pending').hidden=!transport?.pending;el('dirty').textContent=dirty?'Unsaved changes':'Not changed since opening / saving';el<HTMLButtonElement>('wav').disabled=exporting||typeof OfflineAudioContext==='undefined';el('wav').textContent=exporting?'Rendering…':'Export WAV ↗';
    const duration=stepTime(p,cycleSteps(p)*Number(field('cycles').value))+2;el('duration').textContent=`${duration.toFixed(1)} s including tail`;field('density').max=String(t.steps.length);field('rotation').max=String(t.steps.length-1);field('density').value=String(Math.min(t.steps.length,Number(field('density').value)));field('rotation').value=String(Math.min(t.steps.length-1,Number(field('rotation').value)));
  }
  function changed(mix=false){dirty=true;if(mix)transport?.updateMix(editor.project);else transport?.replace(editor.project);sync();renderGrid();invalidate();}
  function edit(change:(p:SoundProject)=>void,mix=false){try{const p=structuredClone(editor.project);change(p);if(editor.commit(p))changed(mix);}catch(error){status(error instanceof Error?error.message:'Invalid edit.',true);sync();}}
  function apply(project:SoundProject){if(dirty&&!confirm('Replace this score? Save or export first to keep unsaved edits.'))return;const next=new ProjectEditor(project);stop();editor=next;transport?.replace(next.project);dirty=false;selectedTrack=selectedStep=0;sync();renderGrid();invalidate();status('Score loaded. Press Play when you are ready.');}
  function pause(){audioAttempt++;lastPosition=-1;transport?.pause();if(timer)clearInterval(timer);timer=undefined;view?.clear();sync();invalidate();}
  function stop(){pause();transport?.stop();lastPosition=-1;sync();invalidate();}
  async function play(){
    if(loading)return;if(transport?.running){pause();return;}loading=true;const attempt=++audioAttempt;sync();
    try{
      if(!context||context.state==='closed'){
        if(typeof AudioContext==='undefined')throw new Error('Audio playback is unavailable. You can still edit and export the project.');
        context=new AudioContext();const resume=context.resume();const [{LoomAudio},{LoomTransport}]=await Promise.all([import('../lib/loom/audio.ts'),import('../lib/loom/transport.ts')]);await resume;
        if(disposed){await context.close();return;}
        audio=new LoomAudio(context,(event,time)=>view?.add(event,time));transport=new LoomTransport(editor.project,audio,()=>context!.currentTime);
        context.addEventListener('statechange',()=>{if(!disposed&&context?.state!=='running'&&transport?.running){pause();status('Audio was interrupted. Press Play to resume.',true);}});
      }else await context.resume();
      if(disposed||document.hidden||attempt!==audioAttempt)return;
      if(context.state!=='running')throw new Error('Audio is suspended. Press Play again to enable it.');
      transport!.play();timer=setInterval(()=>{transport?.pump();audio?.collect();},25);status('Weaving. Score edits arrive together at the next bar; mix controls respond immediately.');
    }catch(error){audio?.dispose();audio=undefined;transport=undefined;await context?.close().catch(()=>{});context=undefined;throw error;}finally{loading=false;sync();invalidate();}
  }
  el('play').addEventListener('click',()=>act(play));el('stop').addEventListener('click',stop);el('restart').addEventListener('click',()=>act(async()=>{stop();await play();}));
  el('new').addEventListener('click',()=>apply(field('preset').value==='blank'?newProject():presets[Number(field('preset').value)]));
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-track]'))button.addEventListener('click',()=>select(Number(button.dataset.track),Math.min(selectedStep,editor.project.tracks[Number(button.dataset.track)].steps.length-1)));
  for(const key of ['bpm','seed','root'] as const)field(key).addEventListener('change',()=>edit(p=>{p[key]=Number(field(key).value);}));
  field('swing').addEventListener('change',()=>edit(p=>{p.swing=Number(field('swing').value)/100;}));field('scale').addEventListener('change',()=>edit(p=>{p.scale=field('scale').value as keyof typeof scales;}));
  field('name').addEventListener('change',()=>{const p={...editor.project,name:field('name').value};if(editor.commit(p)){dirty=true;sync();}});
  field('length').addEventListener('change',()=>{try{const p=resizeTrack(editor.project,selectedTrack,Number(field('length').value));selectedStep=Math.min(selectedStep,p.tracks[selectedTrack].steps.length-1);if(editor.commit(p))changed();}catch(error){status(String(error),true);}});
  for(const key of ['volume','pan','space'] as const)field(key).addEventListener('change',()=>edit(p=>{p.tracks[selectedTrack][key]=Number(field(key).value);},true));
  for(const key of ['mute','solo'] as const)el(key).addEventListener('click',()=>edit(p=>{p.tracks[selectedTrack][key]=!p.tracks[selectedTrack][key];},true));
  for(const key of ['velocity','probability','degree'] as const)field(key).addEventListener('change',()=>edit(p=>{p.tracks[selectedTrack].steps[selectedStep][key]=Number(field(key).value);}));
  field('locked').addEventListener('change',()=>edit(p=>{p.tracks[selectedTrack].steps[selectedStep].locked=field('locked').checked;}));
  function generate(variation=false){try{let p=structuredClone(editor.project);if(variation){const seed=new Uint32Array(1);crypto.getRandomValues(seed);p.seed=seed[0];}p=generateTrack(p,selectedTrack,Number(field('density').value),Number(field('rotation').value));if(editor.commit(p))changed();}catch(error){status(String(error),true);}}
  el('generate').addEventListener('click',()=>generate());el('variation').addEventListener('click',()=>generate(true));el('clear').addEventListener('click',()=>edit(p=>{for(const note of p.tracks[selectedTrack].steps)if(!note.locked)note.on=false;}));
  function undo(redo=false){if(redo?editor.redo():editor.undo()){selectedStep=Math.min(selectedStep,editor.project.tracks[selectedTrack].steps.length-1);changed();}}
  el('undo').addEventListener('click',()=>undo());el('redo').addEventListener('click',()=>undo(true));
  el('grid').addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();act(play);return;}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}const moves:Record<string,[number,number]>={ArrowLeft:[0,-1],ArrowRight:[0,1],ArrowUp:[-1,0],ArrowDown:[1,0]};const move=moves[event.key];if(!move)return;event.preventDefault();const track=Math.max(0,Math.min(5,selectedTrack+move[0])),step=Math.max(0,Math.min(editor.project.tracks[track].steps.length-1,selectedStep+move[1]));select(track,step);focusNote();});
  canvas.addEventListener('pointermove',event=>{if(view){const rect=canvas.getBoundingClientRect();view.pointer={x:event.clientX-rect.left,y:event.clientY-rect.top};invalidate();}});canvas.addEventListener('pointerleave',()=>{if(view)view.pointer=undefined;invalidate();});canvas.addEventListener('click',event=>{if(view){const track=view.select(event.clientY);select(track,Math.min(selectedStep,editor.project.tracks[track].steps.length-1));}});
  const observer=new ResizeObserver(()=>{view?.resize();invalidate();});observer.observe(canvas);
  const motion=new MutationObserver(invalidate);motion.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  function frame(now:number){if(disposed)return;const playing=transport?.running??false,clock=context?.currentTime??0,position=transport?.position()??0;
    if(!document.hidden){if(needsDraw||(playing&&now-lastPaint>(reduced()?60:30))){view?.draw(playing&&transport?transport.project:editor.project,selectedTrack,clock,playing,reduced());lastPaint=now;needsDraw=false;}
      if(position!==lastPosition){lastPosition=position;el('position').textContent=`STEP ${String(position%cycleSteps(transport?.project??editor.project)+1).padStart(2,'0')}`;for(const button of el('grid').querySelectorAll<HTMLButtonElement>('[data-note]')){const [track,step]=button.dataset.note!.split(':').map(Number);button.dataset.playing=String(playing&&step===position%editor.project.tracks[track].steps.length);}}
      if(transport&&lastRevision!==transport.revision){lastRevision=transport.revision;sync();}}
    raf=requestAnimationFrame(frame);
  }
  el('export').addEventListener('click',()=>download(new Blob([encodeProject(editor.project)],{type:'application/json'}),'.loom.json'));
  el('import').addEventListener('click',()=>field('file').click());field('file').addEventListener('change',()=>act(async()=>{const file=field('file').files?.[0];field('file').value='';if(!file)return;if(file.size>FILE_LIMIT)throw new Error('Project exceeds 128 KB.');apply(decodeProject(await file.text()));}));
  field('cycles').addEventListener('change',sync);
  el('wav').addEventListener('click',()=>act(async()=>{if(exporting)return;exporting=true;const snapshot=structuredClone(editor.project),cycles=Number(field('cycles').value);sync();status('Rendering the current score offline. Playback and later edits do not change this export.');try{const {renderWav}=await import('../lib/loom/export.ts');const blob=await renderWav(snapshot,cycles);if(!disposed){download(blob,'.wav',snapshot.name);status('WAV exported with a two-second echo tail.');}}finally{exporting=false;if(!disposed)sync();}}));
  function thumbnail(){const thumb=document.createElement('canvas');thumb.width=320;thumb.height=200;const c=thumb.getContext('2d')!;c.fillStyle='#141e18';c.fillRect(0,0,320,200);editor.project.tracks.forEach((track,i)=>{const y=30+i*28;c.strokeStyle=colors[i]+'66';c.beginPath();c.moveTo(15,y);c.lineTo(305,y);c.stroke();track.steps.forEach((note,j)=>{if(!note.on)return;c.fillStyle=colors[i];c.beginPath();c.arc(18+(j+.5)/track.steps.length*284,y,1+note.velocity*2,0,7);c.fill();});});return thumb.toDataURL('image/png');}
  el('save').addEventListener('click',()=>act(async()=>{const snapshot=structuredClone(editor.project);await saveSound(snapshot,thumbnail());if(JSON.stringify(editor.project)===JSON.stringify(snapshot))dirty=false;await refresh();sync();status('Saved a new local copy. Existing studies were not overwritten.');}));
  async function refresh(){const host=el('library');try{const records=await listSounds();host.replaceChildren();if(!records.length){host.textContent='Your saved sound studies will appear here.';return;}for(const record of records){const card=document.createElement('article');card.className='loom-saved';const image=document.createElement('img');image.alt=record.name;image.loading='lazy';if(record.thumbnail.startsWith('data:image/png;base64,'))image.src=record.thumbnail;const body=document.createElement('div'),title=document.createElement('h3'),detail=document.createElement('p'),open=document.createElement('button'),remove=document.createElement('button');title.textContent=record.name;detail.textContent=new Date(record.updated).toLocaleDateString();open.textContent='Open / duplicate';open.addEventListener('click',()=>{try{apply(record.project);}catch(error){status(String(error),true);}});remove.textContent='Delete';remove.addEventListener('click',()=>act(async()=>{if(confirm(`Delete “${record.name}”? This local copy cannot be recovered without an exported backup.`)){await deleteSound(record.id);await refresh();status('Local copy deleted. Exported backups can still be imported.');}}));body.append(title,detail,open,remove);card.append(image,body);host.append(card);}}catch(error){host.textContent=String(error);}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){pause();status('Paused while hidden. Press Play to resume.');}});window.addEventListener('beforeunload',event=>{if(dirty)event.preventDefault();});
  window.addEventListener('pagehide',()=>{disposed=true;if(timer)clearInterval(timer);cancelAnimationFrame(raf);observer.disconnect();motion.disconnect();transport?.stop();audio?.dispose();void context?.close().catch(()=>{});});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  if(typeof AudioContext==='undefined')status('Audio is unavailable in this browser. You can still edit and export the project.',true);
  sync();renderGrid();void refresh();raf=requestAnimationFrame(frame);
}
