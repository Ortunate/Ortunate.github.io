import { canTurn, newSnake, stepSnake } from '../lib/snake';
import type { Direction } from '../lib/snake';
import { read, save } from './storage';
import { gameInput } from './game-input';
const $=(id:string)=>document.getElementById(id)!;
const canvas=$('snake-canvas') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
const surface=$('game-surface'),overlay=$('game-overlay'),start=$('start-game'),pause=$('pause-game') as HTMLButtonElement;
let state=newSnake(),pending:Direction='right',queued=false,running=false,begun=false,timeout=0;
const stored=read<unknown>('snake:best',0);let best=typeof stored==='number'&&Number.isFinite(stored)&&stored>=0?stored:0;
function draw(){const cell=canvas.width/20;ctx.fillStyle='#0d141a';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#ffffff06';ctx.lineWidth=1;for(let i=0;i<=20;i++){ctx.beginPath();ctx.moveTo(i*cell,0);ctx.lineTo(i*cell,canvas.height);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*cell);ctx.lineTo(canvas.width,i*cell);ctx.stroke();}
  if(state.food){ctx.shadowBlur=18;ctx.shadowColor='#b394f0';ctx.fillStyle='#bea2f1';ctx.beginPath();ctx.roundRect(state.food.x*cell+7,state.food.y*cell+7,cell-14,cell-14,5);ctx.fill();ctx.shadowBlur=0;}
  state.body.forEach((p,i)=>{ctx.fillStyle=i===0?'#defcb8':`hsl(88 52% ${Math.max(37,68-i*.7)}%)`;ctx.shadowBlur=i===0?13:0;ctx.shadowColor='#bded90';ctx.beginPath();ctx.roundRect(p.x*cell+2,p.y*cell+2,cell-4,cell-4,5);ctx.fill();});ctx.shadowBlur=0;
  const h=state.body[0],vertical=state.direction==='up'||state.direction==='down';ctx.fillStyle='#26301d';for(const offset of [-1,1]){ctx.beginPath();ctx.arc(h.x*cell+cell/2+(vertical?offset*5:state.direction==='right'?6:-6),h.y*cell+cell/2+(vertical?state.direction==='down'?6:-6:offset*5),2,0,Math.PI*2);ctx.fill();}
  $('score').textContent=String(state.score);$('best').textContent=String(best);
}
function show(title:string,message:string,label:string){$('overlay-title').textContent=title;$('overlay-message').textContent=message;start.textContent=label;overlay.hidden=false;}
function schedule(){clearTimeout(timeout);if(running)timeout=window.setTimeout(tick,Math.max(65,155-state.score*.45));}
function tick(){if(!running)return;state=stepSnake(state,pending);pending=state.direction;queued=false;if(state.score>best){best=state.score;save('snake:best',best);}draw();if(state.over){running=false;pause.disabled=true;show(state.won?'A perfect orbit.':'End of the orbit.',`You scored ${state.score}. ${state.won?'Every spark collected.':'There is always another round.'}`,'Play again');$('game-status').textContent=`Game over. Score: ${state.score}.`;}else schedule();}
function begin(){if(!begun||state.over){state=newSnake();pending=state.direction;queued=false;}begun=true;running=true;overlay.hidden=true;pause.disabled=false;pause.textContent='Pause';$('game-status').textContent='Follow the purple sparks.';surface.focus({preventScroll:true});draw();schedule();}
function togglePause(){if(!begun||state.over)return;if(running){running=false;clearTimeout(timeout);show('A little breather.','Your orbit will be right here.','Resume game');pause.textContent='Resume';$('game-status').textContent='Game paused.';}else begin();}
start.addEventListener('click',begin);pause.addEventListener('click',togglePause);$('restart-game').addEventListener('click',()=>{state=newSnake();begun=false;begin();});
gameInput(surface,direction=>{if(!running||queued||!canTurn(state.direction,direction))return;pending=direction;queued=true;},true);
document.addEventListener('keydown',e=>{if(e.code==='Space'&&!(e.target instanceof HTMLButtonElement)&&!(e.target instanceof HTMLAnchorElement)){e.preventDefault();if(!begun)begin();else togglePause();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)togglePause();});window.addEventListener('pagehide',()=>clearTimeout(timeout));draw();
