import { copy, notify, read, save } from './storage';
import { defaultTimer, pauseTimer, secondsLeft, startTimer, validTimer } from '../lib/timer';
import { textStats } from '../lib/text';
const $ = <T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const tabs=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tool]'));
function selectTool(name:string,changeUrl=false){if(!['timer','json','text'].includes(name))name='timer';tabs.forEach(tab=>{const active=tab.dataset.tool===name;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$(tab.dataset.tool!).hidden=!active;});if(changeUrl)history.replaceState(null,'',`#${name}`);}
tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>selectTool(tab.dataset.tool!,true));tab.addEventListener('keydown',e=>{let next=index;if(e.key==='ArrowRight')next=(index+1)%tabs.length;else if(e.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;else return;e.preventDefault();tabs[next].focus();selectTool(tabs[next].dataset.tool!,true);});});
selectTool(location.hash.slice(1));window.addEventListener('hashchange',()=>selectTool(location.hash.slice(1)));
const stored=read<unknown>('timer',null);let timer=validTimer(stored)?stored:defaultTimer();
const start=$<HTMLButtonElement>('timer-start'),focusInput=$<HTMLInputElement>('focus-minutes'),breakInput=$<HTMLInputElement>('break-minutes');
focusInput.value=String(timer.focus);breakInput.value=String(timer.break);
function renderTimer(){const seconds=secondsLeft(timer);if(timer.end!==null&&seconds===0){timer={...timer,remaining:0,end:null};save('timer',timer);notify(timer.stage==='focus'?'Focus complete. Time for a little break.':'Break complete. Ready when you are.');}
  $('timer-digits').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  $('timer-stage').textContent=timer.stage==='focus'?'FOCUS SESSION':'SHORT BREAK';
  const timerStatus=seconds===0?'Session complete.':timer.end!==null?(timer.stage==='focus'?'One thing at a time.':'Give your mind some space.'):'Ready when you are.';
  if($('timer-status').textContent!==timerStatus)$('timer-status').textContent=timerStatus;
  start.textContent=timer.end!==null?'Pause session':seconds===0?'Start again':seconds<timer[timer.stage]*60?'Resume session':'Start session';
  focusInput.disabled=breakInput.disabled=timer.end!==null;
  document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.stage===timer.stage)));
  const ring=document.querySelector<SVGCircleElement>('.timer-progress');if(ring)ring.style.strokeDashoffset=String(879.65*(1-seconds/(timer[timer.stage]*60)));
}
start.addEventListener('click',()=>{timer=timer.end!==null?pauseTimer(timer):startTimer(timer);save('timer',timer);renderTimer();});
$('timer-reset').addEventListener('click',()=>{timer={...timer,end:null,remaining:timer[timer.stage]*60};save('timer',timer);renderTimer();});
document.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach(button=>button.addEventListener('click',()=>{timer.stage=button.dataset.stage as 'focus'|'break';timer.end=null;timer.remaining=timer[timer.stage]*60;save('timer',timer);renderTimer();}));
function settings(){if(!focusInput.checkValidity()||!breakInput.checkValidity()){focusInput.reportValidity();breakInput.reportValidity();return;}timer.focus=Number(focusInput.value);timer.break=Number(breakInput.value);timer.remaining=timer[timer.stage]*60;timer.end=null;save('timer',timer);renderTimer();}
focusInput.addEventListener('change',settings);breakInput.addEventListener('change',settings);renderTimer();setInterval(renderTimer,250);document.addEventListener('visibilitychange',renderTimer);
const input=$<HTMLTextAreaElement>('json-input'),output=$<HTMLTextAreaElement>('json-output'),status=$('json-status');
function format(compact=false){try {if(!input.value.trim())throw new Error('Add some JSON first.');if(input.value.length>2_000_000)throw new Error('Please use JSON smaller than 2 MB.');output.value=JSON.stringify(JSON.parse(input.value),null,compact?undefined:2);status.textContent=compact?'JSON compacted.':'Looking tidy. Valid JSON.';status.classList.remove('error');}catch(error){output.value='';status.textContent=error instanceof Error?error.message:'This JSON could not be parsed.';status.classList.add('error');}}
$('json-format').addEventListener('click',()=>format());$('json-compact').addEventListener('click',()=>format(true));$('json-copy').addEventListener('click',()=>output.value?void copy(output.value):notify('Format some JSON before copying.'));$('json-clear').addEventListener('click',()=>{input.value=output.value='';status.textContent='';input.focus();});
const text=$<HTMLTextAreaElement>('text-input');function count(){const stats=textStats(text.value);Object.entries(stats).forEach(([key,value])=>{$(`stat-${key}`).textContent=value.toLocaleString('en-US');});}text.addEventListener('input',count);$('text-copy').addEventListener('click',()=>void copy(text.value));$('text-clear').addEventListener('click',()=>{text.value='';count();text.focus();});
