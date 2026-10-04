import { PARTS, labels, MachineEditor, makePart, newDocument, questionFrom, validateSolution, decodeDocument, encodeDocument, FILE_LIMIT, type KineticDocument, type PartKind, type Point } from '../lib/kinetic/model.ts';
import { levels, examples, type Level } from '../lib/kinetic/levels.ts';
import { CanvasMachineView, hitPart, type MachineView } from '../lib/kinetic/view.ts';
import { listMachines, saveMachine, deleteMachine, readProgress, markComplete } from '../lib/kinetic/storage.ts';
import type { KineticMessage, KineticRequest, ReplayData } from '../lib/kinetic/runtime.ts';
import { replayTrails } from '../lib/kinetic/replay.ts';
import type { PhysicsFrame } from '../lib/kinetic/physics.ts';

const root=document.getElementById('kinetic');
if(root)setup(root);
function setup(root:HTMLElement){
  const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(`kinetic-${id}`) as T;
  const field=(id:string)=>el<HTMLInputElement>(id);
  const workshopRequested=new URLSearchParams(location.search).get('mode')==='1';
  let editor=workshopRequested?new MachineEditor(examples[0]):new MachineEditor(levels[0].document,levels[0].document),activeLevel:Level|undefined=workshopRequested?undefined:levels[0];
  let mode:'builtin'|'author'|'custom'|'test'=workshopRequested?'author':'builtin',phase:'edit'|'run'|'replay'='edit';
  let busy=true,physicsReady=false,running=false,dirty=false,proof='',selected:string|undefined,tool:PartKind|'select'|'pan'='select';
  let view:MachineView|undefined,viewAbort=new AbortController(),displayFrame:PhysicsFrame|undefined,lastRunDoc:KineticDocument|undefined,replay:ReplayData|undefined,replayPlaying=false,replayIndex=0,replayStart=0,replayBase=0;
  let preview:KineticDocument|undefined,needsDraw=true,raf=0,settleUntil=0,resolvedRun=false,disposed=false;
  let worker:Worker|undefined,generation=0,sequence=0;
  const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  const status=(message:string,error=false)=>{el('status').textContent=message;el('status').dataset.error=String(error);};
  const act=(action:()=>Promise<unknown>)=>{void action().catch(error=>status(error instanceof Error?error.message:'Operation failed.',true));};
  const authoring=()=>mode==='author';
  const editable=()=>phase==='edit'&&!busy;
  const mutable=(id=selected)=>authoring()||!!id&&id!=='emitter'&&id!=='goal'&&!editor.doc.parts.find(p=>p.id===id)?.locked;
  function rpc(command:KineticRequest['command'],data?:unknown):Promise<any>{
    return new Promise((resolve,reject)=>{if(!worker){reject(new Error('Physics is unavailable. Use Retry to reload the engine.'));return;}const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error('Physics did not respond. Retry loading the engine.'));},25000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,generation,command,data});});
  }
  function newGeneration(){generation++;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Scene replaced.'));}pending.clear();}
  function createWorker(){
    worker?.terminate();worker=new Worker(new URL('./kinetic.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(event:MessageEvent<KineticMessage>)=>{const m=event.data;if(m.generation!==generation)return;
      if(m.type==='reply'){const p=pending.get(m.id!);if(p){clearTimeout(p.timer);pending.delete(m.id!);m.error?p.reject(new Error(m.error)):p.resolve(m.data);}return;}
      if(phase!=='run')return;
      displayFrame=m.data;running=m.data.running;invalidate();
      if(displayFrame!.result!=='running'&&!resolvedRun){resolvedRun=true;
        if(displayFrame!.result==='won'){
          status(`Collected ${editor.doc.balls}/${editor.doc.balls} in ${(displayFrame!.tick/120).toFixed(2)} seconds. Review the journey or return to edit.`);
          if(mode==='test'){proof=JSON.stringify(editor.doc);status('Puzzle verified. Return to authoring or export the challenge without your solution.');}
          if(mode==='builtin'&&activeLevel){const id=activeLevel.id;act(async()=>{await markComplete(id);await refreshProgress();});}
        }else status(displayFrame!.result==='lost'?'A ball left the board. Review the trajectory, then return to edit.':'Time is up. Return to edit and refine the route.');
      }
      sync();
    };
    worker.onerror=event=>{event.preventDefault();worker?.terminate();worker=undefined;physicsReady=false;running=false;busy=false;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Physics worker failed.'));}pending.clear();status('Physics could not load. Your design is intact; retry or export a draft.',true);sync();};
  }
  async function exclusive(action:()=>Promise<void>){if(busy)return;busy=true;sync();try{await action();}finally{busy=false;sync();}}
  function commit(next:KineticDocument){try{editor.commit(next);proof='';dirty=true;preview=undefined;sync();invalidate();}catch(error){preview=undefined;status(error instanceof Error?error.message:'Invalid edit.',true);sync();invalidate();}}
  function updateView(){if(phase!=='replay')view?.setTrails([]);const doc=phase==='replay'&&lastRunDoc?lastRunDoc:preview??editor.doc;view?.update(doc,phase==='edit'?undefined:displayFrame,phase==='edit'?selected:undefined);}
  function invalidate(){needsDraw=true;settleUntil=performance.now()+75;updateView();}
  function animation(now:number){
    if(disposed)return;
    if(!document.hidden&&replayPlaying&&replay){const tick=replayBase+(now-replayStart)*.12*Number(field('speed').value);while(replayIndex+1<replay.frames.length&&replay.frames[replayIndex+1].tick<=tick)replayIndex++;if(displayFrame!==replay.frames[replayIndex])showReplay(replayIndex,false);if(replayIndex===replay.frames.length-1){replayPlaying=false;el('replay-play').textContent='Play replay';}}
    if(!document.hidden&&(needsDraw||now<settleUntil)){view?.render(now);needsDraw=false;}
    raf=requestAnimationFrame(animation);
  }
  function sync(){
    const isEdit=editable(),p=editor.doc.parts.find(p=>p.id===selected),facility=selected==='emitter'||selected==='goal'?editor.doc[selected]:undefined,canChange=isEdit&&mutable();
    el('levels').hidden=mode!=='builtin';el('examples').hidden=mode==='builtin'||mode==='custom';el('author-settings').hidden=!authoring();
    el('test').hidden=!authoring();el('author').hidden=mode!=='test';el('new').hidden=mode==='test';el('example').hidden=mode==='test';
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===(mode==='author'||mode==='test'?'workshop':'challenges')));
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-level]')){button.setAttribute('aria-pressed',String(button.dataset.level===activeLevel?.id));button.disabled=busy;}
    el('context').textContent=mode==='author'?'Design a machine. Turn it into a puzzle.':mode==='test'?'AUTHOR PLAYTEST · Player rules apply.':mode==='custom'?'IMPORTED CHALLENGE · Find your own solution.':'Six small problems. Many possible solutions.';
    el('title').textContent=editor.doc.name;el('badge').textContent=mode==='author'?'WORKSHOP':mode==='test'?'PLAYTEST':'CHALLENGE';
    el('description').textContent=activeLevel?.description??(mode==='author'?'Select parts, place them, and follow what happens.':'The source, cup and fixed parts are locked. Work within the inventory.');
    el('hint-panel').hidden=!activeLevel;el('hint').textContent=activeLevel?.hint??'';
    el('phase').textContent=phase==='edit'?'EDIT / LAYOUT':phase==='replay'?'REPLAY / READ ONLY':running?'SIMULATION / RUNNING':'SIMULATION / PAUSED';
    el('clock').textContent=`${((displayFrame?.tick??0)/120).toFixed(2)} s / 30 s`;el('score').textContent=`${displayFrame?.collected??0} / ${editor.doc.balls} collected`;
    el<HTMLButtonElement>('run').disabled=busy||!physicsReady||phase==='replay'||(phase==='run'&&displayFrame?.result!=='running');el('run').textContent=running?'Pause Ⅱ':phase==='edit'?'Release ▶':'Resume ▶';
    for(const id of ['step','restart'])el<HTMLButtonElement>(id).disabled=busy||!physicsReady||phase==='replay';
    el<HTMLButtonElement>('edit').disabled=busy||phase==='edit';
    el<HTMLButtonElement>('retry').hidden=physicsReady;el<HTMLButtonElement>('retry').disabled=busy;
    for(const id of ['undo','redo'])el<HTMLButtonElement>(id).disabled=!isEdit||!(id==='undo'?editor.undoStack.length:editor.redoStack.length);
    el<HTMLButtonElement>('copy').disabled=!canChange||!p;el<HTMLButtonElement>('delete').disabled=!canChange||!p;
    for(const button of root.querySelectorAll<HTMLButtonElement>('[data-tool]')){button.disabled=!isEdit;button.setAttribute('aria-pressed',String(button.dataset.tool===tool));}
    for(const kind of PARTS){const used=editor.doc.parts.filter(p=>p.kind===kind&&!p.locked).length;root.querySelector(`[data-remaining="${kind}"]`)!.textContent=authoring()?'':`${Math.max(0,editor.doc.budget[kind]-used)}`;}
    el('properties').hidden=!p&&!facility;el('selected').textContent=p?labels[p.kind].toUpperCase():selected?.toUpperCase()??'NONE';el('selection-help').textContent=p||facility?(canChange?'Drag or enter precise values.':'This object is locked during challenge play or simulation.'):'Choose a palette tool, then click the board. Enter places the chosen part at the center.';
    for(const key of ['x','y','angle','length','power'] as const){const node=field(key);node.disabled=!canChange;if(document.activeElement!==node){const v=key==='x'||key==='y'?(p??facility)?.[key]:p?.[key];if(v!==undefined)node.value=String(Number((key==='angle'?v*180/Math.PI:v).toFixed(3)));}}
    for(const key of ['angle','length','power'])el(`${key}-field`).hidden=!p||(key==='length'&&(p.kind==='bumper'||p.kind==='pad'))||(key==='power'&&p.kind!=='pad'&&p.kind!=='rotor');
    field('power').min=p?.kind==='rotor'?'-3':'1';field('power').max=p?.kind==='rotor'?'3':'12';
    el('locked-field').hidden=!p||!authoring();field('locked').checked=p?.locked??false;field('locked').disabled=!canChange;
    for(const id of ['rotate-left','rotate-right'])el<HTMLButtonElement>(id).disabled=!canChange||!p;
    if(document.activeElement!==field('name'))field('name').value=editor.doc.name;if(document.activeElement!==field('balls'))field('balls').value=String(editor.doc.balls);
    for(const node of root.querySelectorAll<HTMLInputElement>('[data-budget]')){node.disabled=!isEdit||!authoring();if(document.activeElement!==node)node.value=String(editor.doc.budget[node.dataset.budget as PartKind]);}
    field('name').disabled=field('balls').disabled=!isEdit||!authoring();
    el('proof').textContent=proof===JSON.stringify(editor.doc)?'Verified. Challenge export contains the fixed layout and inventory, never your solution.':'Not verified. Test and complete your puzzle before exporting a challenge.';
    el<HTMLButtonElement>('export-challenge').disabled=busy||!proof||proof!==JSON.stringify(editor.doc);
    for(const id of ['test','author','new','save','export','import','workshop-copy'])el<HTMLButtonElement>(id).disabled=busy;
    el<HTMLButtonElement>('replay').disabled=busy||!lastRunDoc;el<HTMLButtonElement>('replay-play').disabled=phase!=='replay';field('timeline').disabled=phase!=='replay';
  }
  async function load(doc:KineticDocument,nextMode:typeof mode,question?:KineticDocument,level?:Level){
    if(dirty&&!confirm('Replace this layout? Save or export first to keep unsaved edits.'))return;
    const replacement=new MachineEditor(doc,question);newGeneration();editor=replacement;mode=nextMode;activeLevel=level;phase='edit';selected=undefined;proof='';dirty=false;running=false;replayPlaying=false;replay=undefined;lastRunDoc=undefined;displayFrame=undefined;preview=undefined;tool='select';invalidate();sync();
    try{await rpc('init',{document:editor.doc,question:editor.question});physicsReady=true;status(nextMode==='author'?'Choose a part, then click the board to place it.':'Build a route to the cup. All levels are available; a hint is on the right.');}catch(error){physicsReady=false;throw error;}
  }
  async function begin(step=false){
    if(phase==='edit'){preview=undefined;newGeneration();lastRunDoc=structuredClone(editor.doc);replay=undefined;resolvedRun=false;displayFrame=undefined;phase='run';replayPlaying=false;
      try{await rpc('init',{document:editor.doc,question:editor.question});physicsReady=true;}catch(error){phase='edit';physicsReady=false;throw error;}
    }
    await rpc('speed',Number(field('speed').value));if(step)await rpc('step');else if(!document.hidden)await rpc('run');status(step?'Advanced one fixed physics step.':'Follow the marble. Pause or return to edit at any time.');
  }
  async function returnToEdit(){if(worker&&physicsReady)await rpc('pause');phase='edit';running=false;replayPlaying=false;el('replay-play').textContent='Play replay';displayFrame=undefined;invalidate();status('Back at the launch layout. Your placed parts are unchanged.');}
  el('run').addEventListener('click',()=>act(()=>exclusive(async()=>{if(running)await rpc('pause');else await begin();})));
  el('step').addEventListener('click',()=>act(()=>exclusive(()=>begin(true))));
  el('edit').addEventListener('click',()=>act(()=>exclusive(returnToEdit)));
  el('restart').addEventListener('click',()=>act(()=>exclusive(async()=>{await rpc('pause');phase='edit';await begin();})));
  field('speed').addEventListener('change',()=>act(async()=>{if(phase!=='replay')await rpc('speed',Number(field('speed').value));else if(replayPlaying){replayBase=displayFrame?.tick??0;replayStart=performance.now();}}));
  el('retry').addEventListener('click',()=>act(()=>exclusive(async()=>{newGeneration();createWorker();await rpc('init',{document:editor.doc,question:editor.question});physicsReady=true;phase='edit';running=false;replayPlaying=false;replay=undefined;lastRunDoc=undefined;displayFrame=undefined;invalidate();status('Physics loaded. Ready to build.');})));
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-level]'))button.addEventListener('click',()=>act(()=>exclusive(async()=>{const level=levels.find(l=>l.id===button.dataset.level)!;await load(level.document,'builtin',level.document,level);})));
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-mode]'))button.addEventListener('click',()=>act(()=>exclusive(async()=>{if(button.dataset.mode==='challenges')await load(levels[0].document,'builtin',levels[0].document,levels[0]);else await load(examples[0],'author');})));
  el('new').addEventListener('click',()=>act(()=>exclusive(()=>load(field('example').value==='blank'?newDocument():examples[Number(field('example').value)],'author'))));
  el('workshop-copy').addEventListener('click',()=>act(()=>exclusive(async()=>{const doc={...structuredClone(editor.doc),kind:'draft' as const,name:`${editor.doc.name.slice(0,70)} — copy`};await load(doc,'author');dirty=true;})));
  el('test').addEventListener('click',()=>act(()=>exclusive(async()=>{if(phase!=='edit')await returnToEdit();const question=questionFrom(editor.doc);validateSolution(question,editor.doc);editor=new MachineEditor(editor.doc,question);mode='test';proof='';status('Player rules are active. Fixed parts and facilities cannot change. Release the balls to verify your solution.');sync();})));
  el('author').addEventListener('click',()=>act(()=>exclusive(async()=>{if(phase!=='edit')await returnToEdit();editor=new MachineEditor(editor.doc);mode='author';status('Authoring restored. Any edit will invalidate the successful playtest.');})));
  for(const button of root.querySelectorAll<HTMLButtonElement>('[data-tool]'))button.addEventListener('click',()=>{tool=button.dataset.tool as typeof tool;status(tool==='select'?'Select and drag a part.':tool==='pan'?'Drag to move the view.':`Click the board to place ${labels[tool].toLowerCase()}, or focus the board and press Enter.`);sync();});
  function addPart(kind:PartKind,p:Point){if(!editable())return;const doc=structuredClone(editor.doc),snap=field('snap').checked;const x=Math.max(.2,Math.min(15.8,snap?Math.round(p.x*4)/4:p.x)),y=Math.max(.2,Math.min(9.8,snap?Math.round(p.y*4)/4:p.y));const part=makePart(kind,`p-${crypto.randomUUID()}`,x,y);doc.parts.push(part);commit(doc);if(editor.doc.parts.some(p=>p.id===part.id))selected=part.id;tool='select';sync();invalidate();}
  function changeSelected(change:Record<string,number|boolean>){if(!editable()||!mutable())return;const doc=structuredClone(editor.doc);if(selected==='emitter'||selected==='goal')Object.assign(doc[selected],change);else{const p=doc.parts.find(p=>p.id===selected);if(p)Object.assign(p,change);}commit(doc);}
  const wrapAngle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
  const rotate=(direction:number)=>{const p=editor.doc.parts.find(p=>p.id===selected);if(p)changeSelected({angle:wrapAngle(p.angle+direction*Math.PI/12)});};
  for(const key of ['x','y','angle','length','power'])field(key).addEventListener('change',()=>changeSelected({[key]:key==='angle'?Number(field(key).value)*Math.PI/180:Number(field(key).value)}));
  field('locked').addEventListener('change',()=>changeSelected({locked:field('locked').checked}));
  el('rotate-left').addEventListener('click',()=>rotate(-1));el('rotate-right').addEventListener('click',()=>rotate(1));
  const remove=()=>{if(!editable()||!mutable())return;const doc=structuredClone(editor.doc);doc.parts=doc.parts.filter(p=>p.id!==selected);commit(doc);selected=undefined;sync();invalidate();};el('delete').addEventListener('click',remove);
  el('copy').addEventListener('click',()=>{if(!editable()||!mutable())return;const part=editor.doc.parts.find(p=>p.id===selected);if(!part)return;const doc=structuredClone(editor.doc),copy={...part,id:`p-${crypto.randomUUID()}`,x:Math.min(15.8,part.x+.5),y:Math.max(.2,part.y-.5),locked:authoring()?part.locked:false};doc.parts.push(copy);commit(doc);if(editor.doc.parts.some(p=>p.id===copy.id))selected=copy.id;sync();invalidate();});
  function undo(redo=false){if(!editable())return;if(redo)editor.redo();else editor.undo();proof='';dirty=true;selected=undefined;sync();invalidate();}
  el('undo').addEventListener('click',()=>undo());el('redo').addEventListener('click',()=>undo(true));
  field('name').addEventListener('change',()=>commit({...structuredClone(editor.doc),name:field('name').value}));field('balls').addEventListener('change',()=>commit({...structuredClone(editor.doc),balls:Number(field('balls').value)}));
  for(const node of root.querySelectorAll<HTMLInputElement>('[data-budget]'))node.addEventListener('change',()=>{const doc=structuredClone(editor.doc);doc.budget[node.dataset.budget as PartKind]=Number(node.value);commit(doc);});

  function bindCanvas(){
    viewAbort.abort();viewAbort=new AbortController();const {signal}=viewAbort,canvas=view!.canvas,pointers=new Map<number,Point>();let dragging:KineticDocument|undefined,dragOffset:Point={x:0,y:0},panning=false,last:Point={x:0,y:0};
    canvas.addEventListener('contextmenu',event=>event.preventDefault(),{signal});
    canvas.addEventListener('wheel',event=>{event.preventDefault();view?.zoom(-event.deltaY*.001);invalidate();},{signal,passive:false});
    canvas.addEventListener('pointerdown',event=>{if(busy)return;canvas.focus();canvas.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});last={x:event.clientX,y:event.clientY};
      if(pointers.size>1){dragging=undefined;preview=undefined;invalidate();return;}
      const p=view!.point(event.clientX,event.clientY);panning=event.button===2||tool==='pan'||phase!=='edit';if(panning)return;
      if(PARTS.includes(tool as PartKind)){addPart(tool as PartKind,p);return;}
      selected=hitPart(editor.doc,p);sync();invalidate();if(!selected||!mutable())return;dragging=structuredClone(editor.doc);const target=selected==='emitter'||selected==='goal'?dragging[selected]:dragging.parts.find(p=>p.id===selected)!;dragOffset={x:target.x-p.x,y:target.y-p.y};
    },{signal});
    canvas.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;
      const before=pointers.get(event.pointerId)!;const next={x:event.clientX,y:event.clientY};
      if(pointers.size===2){const other=[...pointers].find(([id])=>id!==event.pointerId)![1],oldDistance=Math.hypot(before.x-other.x,before.y-other.y),distance=Math.hypot(next.x-other.x,next.y-other.y);if(oldDistance>1)view?.zoom(Math.log(distance/oldDistance));view?.pan((next.x-before.x)/2,(next.y-before.y)/2);}
      else if(panning)view?.pan(next.x-last.x,next.y-last.y);
      else if(dragging&&selected&&editable()){const p=view!.point(next.x,next.y),facility=selected==='emitter'||selected==='goal',target=facility?dragging[selected as 'emitter'|'goal']:dragging.parts.find(p=>p.id===selected)!;const snap=field('snap').checked;target.x=Math.max(facility ? .7 : .2,Math.min(facility?15.3:15.8,snap?Math.round((p.x+dragOffset.x)*4)/4:p.x+dragOffset.x));target.y=Math.max(facility ? .7 : .2,Math.min(facility?9.3:9.8,snap?Math.round((p.y+dragOffset.y)*4)/4:p.y+dragOffset.y));preview=dragging;}
      pointers.set(event.pointerId,next);last=next;invalidate();
    },{signal});
    const end=(event:PointerEvent)=>{pointers.delete(event.pointerId);if(dragging){const next=dragging;dragging=undefined;preview=undefined;if(event.type==='pointerup'&&editable())commit(next);else invalidate();}if(!pointers.size)panning=false;};canvas.addEventListener('pointerup',end,{signal});canvas.addEventListener('pointercancel',end,{signal});canvas.addEventListener('lostpointercapture',end,{signal});
    canvas.addEventListener('keydown',event=>{
      if(![' ','Enter','Delete','Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','r','R','z','Z'].includes(event.key))return;event.preventDefault();if(busy)return;
      if(event.key===' '){el('run').click();return;}if(!editable())return;
      if(event.key.toLowerCase()==='z'&&(event.ctrlKey||event.metaKey)){undo(event.shiftKey);return;}
      if(event.key==='Enter'&&PARTS.includes(tool as PartKind)){addPart(tool as PartKind,{x:8,y:5});return;}
      if(event.key==='Delete'||event.key==='Backspace'){remove();return;}if(event.key.toLowerCase()==='r'){rotate(event.shiftKey?-1:1);return;}
      const target=selected==='emitter'||selected==='goal'?editor.doc[selected]:editor.doc.parts.find(p=>p.id===selected);if(!target||!event.key.startsWith('Arrow'))return;const step=event.shiftKey ? .05 : .25;changeSelected({x:target.x+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0),y:target.y+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0)});
    },{signal});
    canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();act(async()=>{await rpc('pause');status('WebGL context lost. Switch to 2D view to keep working.',true);});},{signal});
  }
  async function setView(use2D=false){view?.dispose();const old=el<HTMLCanvasElement>('canvas'),canvas=old.cloneNode(false) as HTMLCanvasElement;old.replaceWith(canvas);
    if(!use2D){try{const {ThreeMachineView}=await import('../lib/kinetic/view3d.ts');view=new ThreeMachineView(canvas);}catch{const replacement=canvas.cloneNode(false) as HTMLCanvasElement;canvas.replaceWith(replacement);view=new CanvasMachineView(replacement);status('Using the 2D fallback. All editing and physics features remain available.');}}
    else view=new CanvasMachineView(canvas);
    el('view-toggle').textContent=view.kind==='3d'?'Use 2D view':'Try 3D view';bindCanvas();if(phase==='replay'&&replay)view.setTrails(replayTrails(replay.frames,replayIndex));invalidate();
  }
  el('zoom-in').addEventListener('click',()=>{view?.zoom(.15);invalidate();});el('zoom-out').addEventListener('click',()=>{view?.zoom(-.15);invalidate();});el('view-reset').addEventListener('click',()=>{view?.reset();invalidate();});el('view-toggle').addEventListener('click',()=>act(()=>exclusive(()=>setView(view?.kind==='3d'))));
  const observer=new ResizeObserver(()=>{view?.resize();invalidate();});observer.observe(el('board'));

  function showReplay(index:number,updateTime=true){if(!replay)return;replayIndex=Math.max(0,Math.min(replay.frames.length-1,index));displayFrame=replay.frames[replayIndex];view?.setTrails(replayTrails(replay.frames,replayIndex));field('timeline').value=String(replayIndex);el('replay-time').textContent=`${(displayFrame.tick/120).toFixed(2)} s`;if(updateTime){replayBase=displayFrame.tick;replayStart=performance.now();}sync();invalidate();}
  el('replay').addEventListener('click',()=>act(()=>exclusive(async()=>{if(!replay)replay=await rpc('replay');else await rpc('pause');phase='replay';running=false;replayPlaying=false;el('replay-play').textContent='Play replay';field('timeline').max=String(replay!.frames.length-1);showReplay(0);const events=el('events');events.replaceChildren();for(const event of replay!.events.slice(0,200)){const button=document.createElement('button');button.textContent=`${(event.tick/120).toFixed(2)}s · ${event.type}`;button.title=`${event.a} → ${event.b}`;button.addEventListener('click',()=>{const index=replay!.frames.findIndex(frame=>frame.tick>=event.tick);showReplay(index<0?replay!.frames.length-1:index);});events.append(button);}status('Reviewing recorded motion. Scrubbing does not advance the simulation.');})));
  field('timeline').addEventListener('input',()=>{replayPlaying=false;el('replay-play').textContent='Play replay';showReplay(Number(field('timeline').value));});
  el('replay-play').addEventListener('click',()=>{if(!replay)return;replayPlaying=!replayPlaying;if(replayIndex===replay.frames.length-1)showReplay(0);replayStart=performance.now();replayBase=displayFrame?.tick??0;el('replay-play').textContent=replayPlaying?'Pause replay':'Play replay';});

  function download(doc:KineticDocument){const url=URL.createObjectURL(new Blob([encodeDocument(doc)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`${doc.kind}-${doc.name.replace(/[^a-z0-9-]/gi,'-').slice(0,60)}.kinetic.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  el('export').addEventListener('click',()=>{try{download({...structuredClone(editor.doc),kind:'draft'});status('Draft exported with your complete design.');}catch(error){status(String(error),true);}});
  el('export-challenge').addEventListener('click',()=>{if(!proof||proof!==JSON.stringify(editor.doc)){status('Complete a valid playtest first.',true);return;}download(questionFrom(editor.doc));status('Challenge exported. Your movable solution parts were excluded.');});
  el('save').addEventListener('click',()=>act(()=>exclusive(async()=>{if(phase!=='edit')await returnToEdit();view?.update(editor.doc,undefined,undefined);view?.render(performance.now()+100);const thumb=document.createElement('canvas');thumb.width=320;thumb.height=200;if(view)thumb.getContext('2d')!.drawImage(view.canvas,0,0,320,200);const thumbnail=thumb.toDataURL('image/png');await saveMachine({...structuredClone(editor.doc),kind:'draft'},thumbnail);dirty=false;await refreshSaves();status('Saved a new local copy. Existing machines were not overwritten.');invalidate();})));
  el('import').addEventListener('click',()=>field('file').click());field('file').addEventListener('change',()=>act(()=>exclusive(async()=>{const file=field('file').files?.[0];field('file').value='';if(!file)return;if(file.size>FILE_LIMIT)throw new Error('Machine file exceeds 256 KB.');const doc=decodeDocument(await file.text());await load(doc,doc.kind==='challenge'?'custom':'author',doc.kind==='challenge'?doc:undefined);})));
  async function refreshSaves(){const host=el('saves');try{const records=await listMachines();host.replaceChildren();if(!records.length){host.textContent='Your first saved machine will appear here.';return;}for(const record of records){const card=document.createElement('article');card.className='kinetic-saved';const image=document.createElement('img');image.alt=record.name;image.loading='lazy';if(record.thumbnail.startsWith('data:image/png;base64,'))image.src=record.thumbnail;const body=document.createElement('div'),title=document.createElement('h3'),date=document.createElement('p'),open=document.createElement('button'),remove=document.createElement('button');title.textContent=record.name;date.textContent=new Date(record.updated).toLocaleDateString();open.textContent='Open / duplicate';open.addEventListener('click',()=>act(()=>exclusive(()=>load(record.document,'author'))));remove.textContent='Delete';remove.addEventListener('click',()=>act(()=>exclusive(async()=>{if(confirm(`Delete saved machine “${record.name}”? This cannot be undone.`)){await deleteMachine(record.id);await refreshSaves();status('Local copy deleted. An exported file can still be imported.');}})));body.append(title,date,open,remove);card.append(image,body);host.append(card);}}catch(error){host.textContent=error instanceof Error?error.message:'Local storage unavailable. Export files to keep your work.';}}
  async function refreshProgress(){try{const completed=await readProgress();for(const node of root.querySelectorAll<HTMLElement>('[data-complete]')){const done=completed.includes(node.dataset.complete!);node.textContent=done?'✓':'○';node.setAttribute('aria-label',done?'Completed':'Not completed');}}catch{/* Completion remains playable without local storage. */}}
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!disposed){replayPlaying=false;el('replay-play').textContent='Play replay';if(worker&&physicsReady)act(()=>rpc('pause'));status('Paused while hidden. Resume manually when you return.');}});
  window.addEventListener('beforeunload',event=>{if(dirty)event.preventDefault();});
  window.addEventListener('pagehide',()=>{disposed=true;cancelAnimationFrame(raf);observer.disconnect();viewAbort.abort();view?.dispose();worker?.terminate();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Workshop closed.'));}pending.clear();});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  act(async()=>{try{createWorker();await setView();newGeneration();await rpc('init',{document:editor.doc,question:editor.question});physicsReady=true;status(workshopRequested?'Workshop ready. Edit this example or start a blank machine.':'Choose a rail, then click the board to place it. Release when you are ready.');}finally{busy=false;sync();invalidate();}});
  sync();raf=requestAnimationFrame(animation);void refreshSaves();void refreshProgress();
}
