import { validateProject, type SoundProject } from './model.ts';
export interface SavedSound {id:string;name:string;updated:number;thumbnail:string;project:SoundProject}
async function open():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')throw new Error('Local storage unavailable. Export your project to keep it.');
  return new Promise((resolve,reject)=>{const request=indexedDB.open('ortunate-loom',1);request.onupgradeneeded=()=>request.result.createObjectStore('projects',{keyPath:'id'});request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};request.onerror=()=>reject(new Error('Local storage unavailable. File export still works.'));request.onblocked=()=>reject(new Error('Storage is blocked by another tab.'));});
}
async function transaction<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode),request=action(tx.objectStore('projects'));let value:T;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error('Local save failed. Your project is unchanged; export a backup.'));};});}
export async function saveSound(project:SoundProject,thumbnail:string){validateProject(project);await transaction('readwrite',s=>s.add({id:crypto.randomUUID(),name:project.name,updated:Date.now(),thumbnail,project}));}
export async function listSounds(){return(await transaction<SavedSound[]>('readonly',s=>s.getAll())).sort((a,b)=>b.updated-a.updated);}
export async function deleteSound(id:string){await transaction('readwrite',s=>s.delete(id));}
