import type { Direction } from '../lib/snake';
export function gameInput(surface:HTMLElement,move:(direction:Direction)=>void,wasd=false){
  const keys:Record<string,Direction>={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',...(wasd?{w:'up',s:'down',a:'left',d:'right'}:{})};
  document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.ctrlKey||e.metaKey||e.altKey)return;const direction=keys[e.key]||keys[e.key.toLowerCase()];if(direction){e.preventDefault();move(direction);}});
  document.querySelectorAll<HTMLButtonElement>('[data-direction]').forEach(button=>button.addEventListener('click',()=>move(button.dataset.direction as Direction)));
  let origin:{x:number;y:number;id:number}|null=null;
  surface.addEventListener('pointerdown',e=>{if(e.target instanceof HTMLElement&&e.target.closest('button'))return;if(e.pointerType==='mouse')return;origin={x:e.clientX,y:e.clientY,id:e.pointerId};surface.setPointerCapture(e.pointerId);});
  surface.addEventListener('pointerup',e=>{if(!origin||origin.id!==e.pointerId)return;const dx=e.clientX-origin.x,dy=e.clientY-origin.y;origin=null;if(Math.max(Math.abs(dx),Math.abs(dy))<20)return;move(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');});
  surface.addEventListener('pointercancel',()=>{origin=null;});
}
