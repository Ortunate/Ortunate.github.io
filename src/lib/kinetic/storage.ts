import { validateDocument, type KineticDocument } from './model.ts';
export interface SavedMachine {id:string;name:string;updated:number;thumbnail:string;document:KineticDocument}
async function database():Promise<IDBDatabase>{
  if(typeof indexedDB==='undefined')throw new Error('Local storage unavailable. Export a machine file instead.');
  return new Promise((resolve,reject)=>{const request=indexedDB.open('ortunate-kinetic',1);request.onupgradeneeded=()=>{request.result.createObjectStore('machines',{keyPath:'id'});request.result.createObjectStore('progress');};request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};request.onerror=()=>reject(new Error('Local storage unavailable. File export still works.'));request.onblocked=()=>reject(new Error('Local storage is blocked by another tab.'));});
}
async function transaction<T>(name:string,mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode),request=operation(tx.objectStore(name));let value:T;request.onsuccess=()=>{value=request.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Local save failed. Your design is unchanged; export a file as backup.'));};});}
export async function saveMachine(document:KineticDocument,thumbnail:string){validateDocument(document);await transaction('machines','readwrite',store=>store.add({id:crypto.randomUUID(),name:document.name,updated:Date.now(),thumbnail,document}));}
export async function listMachines(){return (await transaction<SavedMachine[]>('machines','readonly',store=>store.getAll())).sort((a,b)=>b.updated-a.updated);}
export async function deleteMachine(id:string){await transaction('machines','readwrite',store=>store.delete(id));}
export async function markComplete(id:string){await transaction('progress','readwrite',store=>store.put(true,id));}
export async function readProgress(){return await transaction<IDBValidKey[]>('progress','readonly',store=>store.getAllKeys());}
