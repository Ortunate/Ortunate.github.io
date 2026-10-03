import { renderArtwork } from '../lib/living/render.ts';
self.onmessage=event=>{
  const {id,artwork,size,regions}=event.data;
  try{
    const pixels=renderArtwork(artwork,size,regions);
    self.postMessage({id,pixels}, {transfer:[pixels.buffer]});
  }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Material rendering failed.'});}
};
