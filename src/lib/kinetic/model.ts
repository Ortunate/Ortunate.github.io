export const PARTS = ['rail', 'bumper', 'pad', 'seesaw', 'rotor'] as const;
export type PartKind = typeof PARTS[number];
export interface Point { x: number; y: number }
export interface Part extends Point { id: string; kind: PartKind; angle: number; length: number; power: number; locked: boolean }
export type Budget = Record<PartKind, number>;
export interface KineticDocument {
  format: 'ortunate-kinetic'; version: 1; physics: 'rapier-0.21-v1';
  kind: 'draft' | 'challenge'; name: string; emitter: Point; goal: Point; balls: number;
  parts: Part[]; budget: Budget;
}
export const labels: Record<PartKind, string> = {rail:'Straight rail',bumper:'Round bumper',pad:'Launch pad',seesaw:'Seesaw',rotor:'Rotating arm'};
export const FILE_LIMIT = 256 * 1024;
export const DT = 1 / 120;
export function newDocument(name='Untitled machine'): KineticDocument {
  return {format:'ortunate-kinetic',version:1,physics:'rapier-0.21-v1',kind:'draft',name,
    emitter:{x:3,y:8.5},goal:{x:12,y:1},balls:1,parts:[],budget:{rail:6,bumper:3,pad:2,seesaw:2,rotor:2}};
}
export function makePart(kind:PartKind,id:string,x=8,y=5):Part {
  return {id,kind,x,y,angle:0,length:kind==='rail'?3:2.4,power:kind==='pad'?7:1,locked:false};
}
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateDocument(doc:KineticDocument) {
  if(!doc||doc.format!=='ortunate-kinetic'||doc.version!==1||doc.physics!=='rapier-0.21-v1'||!['draft','challenge'].includes(doc.kind)||typeof doc.name!=='string'||doc.name.length>80)throw new Error('Unsupported or invalid machine file.');
  for(const p of [doc.emitter,doc.goal])if(!p||!finite(p.x,.7,15.3)||!finite(p.y,.7,9.3))throw new Error('Facilities must be inside the 16 × 10 board.');
  if(!Number.isInteger(doc.balls)||doc.balls<1||doc.balls>5||!Array.isArray(doc.parts)||doc.parts.length>80)throw new Error('Limit: 80 parts and 1–5 balls.');
  if(!doc.budget||PARTS.some(k=>!Number.isInteger(doc.budget[k])||!finite(doc.budget[k],0,80)))throw new Error('Invalid part budget.');
  const ids=new Set<string>();
  for(const p of doc.parts){
    if(!p||typeof p.id!=='string'||!/^p-[a-zA-Z0-9-]{1,50}$/.test(p.id)||ids.has(p.id)||!PARTS.includes(p.kind)||typeof p.locked!=='boolean'||!finite(p.x,.2,15.8)||!finite(p.y,.2,9.8)||!finite(p.angle,-Math.PI,Math.PI)||!finite(p.length,1,5)||!finite(p.power,p.kind==='rotor'?-3:1,p.kind==='rotor'?3:12))throw new Error('Invalid part geometry or identifier.');
    ids.add(p.id);
  }
}
export function validateSolution(question:KineticDocument, layout:KineticDocument) {
  validateDocument(question);validateDocument(layout);
  if(JSON.stringify(question.emitter)!==JSON.stringify(layout.emitter)||JSON.stringify(question.goal)!==JSON.stringify(layout.goal)||question.balls!==layout.balls)throw new Error('Challenge facilities cannot be moved.');
  const fixed=question.parts.filter(p=>p.locked),fixedIds=new Set(fixed.map(p=>p.id));
  for(const part of fixed)if(JSON.stringify(layout.parts.find(p=>p.id===part.id))!==JSON.stringify(part))throw new Error('Fixed parts cannot be changed.');
  for(const kind of PARTS)if(layout.parts.filter(p=>!fixedIds.has(p.id)&&p.kind===kind).length>question.budget[kind])throw new Error(`No ${labels[kind].toLowerCase()} remaining in this challenge.`);
  for(const p of layout.parts)if(p.locked&&!fixedIds.has(p.id))throw new Error('Player parts cannot be fixed.');
}
export function questionFrom(doc:KineticDocument):KineticDocument {
  validateDocument(doc);return {...structuredClone(doc),kind:'challenge',parts:structuredClone(doc.parts.filter(p=>p.locked))};
}
export function encodeDocument(doc:KineticDocument){validateDocument(doc);return JSON.stringify(doc,null,2);}
export function decodeDocument(text:string):KineticDocument {
  if(new TextEncoder().encode(text).byteLength>FILE_LIMIT)throw new Error('Machine file exceeds 256 KB.');
  const doc=JSON.parse(text);validateDocument(doc);
  if(doc.kind==='challenge'&&doc.parts.some((p:Part)=>!p.locked))throw new Error('Challenge files contain fixed parts only.');
  return doc;
}
/** Editing-only history. Runs never mutate the authoring document. */
export class MachineEditor {
  doc:KineticDocument; question?:KineticDocument;
  undoStack:KineticDocument[]=[];redoStack:KineticDocument[]=[];
  constructor(doc:KineticDocument,question?:KineticDocument){validateDocument(doc);if(question)validateSolution(question,doc);this.doc=structuredClone(doc);this.question=question?structuredClone(question):undefined;}
  commit(next:KineticDocument){validateDocument(next);if(this.question)validateSolution(this.question,next);if(JSON.stringify(next)===JSON.stringify(this.doc))return;this.undoStack.push(structuredClone(this.doc));if(this.undoStack.length>50)this.undoStack.shift();this.redoStack=[];this.doc=structuredClone(next);}
  undo(){const previous=this.undoStack.pop();if(previous){this.redoStack.push(this.doc);this.doc=previous;}}
  redo(){const next=this.redoStack.pop();if(next){this.undoStack.push(this.doc);this.doc=next;}}
}
