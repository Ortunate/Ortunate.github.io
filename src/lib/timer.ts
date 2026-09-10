export interface TimerState { stage:'focus'|'break'; focus:number; break:number; remaining:number; end:number|null }
export const defaultTimer = ():TimerState => ({stage:'focus',focus:25,break:5,remaining:1500,end:null});
export function secondsLeft(state:TimerState, now=Date.now()) { return state.end===null ? Math.max(0,state.remaining) : Math.max(0,Math.ceil((state.end-now)/1000)); }
export function pauseTimer(state:TimerState,now=Date.now()):TimerState {return {...state,remaining:secondsLeft(state,now),end:null};}
export function startTimer(state:TimerState,now=Date.now()):TimerState {const remaining=state.remaining>0?state.remaining:state[state.stage]*60;return {...state,remaining,end:now+remaining*1000};}
export function validTimer(value:unknown):value is TimerState {if(!value||typeof value!=='object')return false;const s=value as TimerState;return (s.stage==='focus'||s.stage==='break')&&Number.isInteger(s.focus)&&s.focus>=1&&s.focus<=180&&Number.isInteger(s.break)&&s.break>=1&&s.break<=60&&Number.isFinite(s.remaining)&&s.remaining>=0&&s.remaining<=10800&&(s.end===null||(Number.isFinite(s.end)&&s.end>0));}
