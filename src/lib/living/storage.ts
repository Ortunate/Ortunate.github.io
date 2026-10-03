import { validateArtwork, type Artwork } from './engine.ts';
export interface SavedArtwork { id:string; name:string; savedAt:number; thumbnail:string; artwork:Artwork }
async function open():Promise<IDBDatabase> {
  if(typeof indexedDB==='undefined')throw new Error('Local storage unavailable. Export an artwork file to keep your work.');
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('ortunate-living',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('artworks',{keyPath:'id'});
    request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>reject(new Error('Local storage unavailable. Export your artwork instead.'));
    request.onblocked=()=>reject(new Error('Local storage blocked by another tab. Export your artwork instead.'));
  });
}
async function transact<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('artworks',mode);const request=action(tx.objectStore('artworks'));let result:T;
    request.onsuccess=()=>{result=request.result;};
    tx.oncomplete=()=>{db.close();resolve(result);};
    tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Storage operation failed. Your canvas is unchanged; export a file as backup.'));};
  });
}
export async function listArtworks(){return (await transact<SavedArtwork[]>('readonly',store=>store.getAll())).sort((a,b)=>b.savedAt-a.savedAt);}
export async function saveArtwork(name:string,artwork:Artwork,thumbnail:string){
  validateArtwork(artwork);
  const record:SavedArtwork={id:crypto.randomUUID(),name:name.trim().slice(0,80)||'Untitled study',savedAt:Date.now(),thumbnail,artwork};
  await transact('readwrite',store=>store.add(record));return record;
}
export async function removeArtwork(id:string){await transact('readwrite',store=>store.delete(id));}
