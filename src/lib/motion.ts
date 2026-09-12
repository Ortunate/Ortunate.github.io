export interface WarpMotion {phase:number;speed:number;x:number;y:number}
export const newWarpMotion=():WarpMotion=>({phase:0,speed:.12,x:.5,y:.5});
/** Integrate velocity continuously, including the acceleration/deceleration curve. */
export function advanceWarp(state:WarpMotion,dt:number,accelerating:boolean,x:number,y:number):WarpMotion{
 const elapsed=Math.max(0,Math.min(dt,.1));
 const target=accelerating?.64:.12,rate=accelerating?4.2:2.5,decay=Math.exp(-rate*elapsed);
 const distance=target*elapsed+(state.speed-target)*(1-decay)/rate;
 const steering=1-Math.exp(-5*elapsed);
 return {phase:state.phase+distance,speed:target+(state.speed-target)*decay,x:state.x+(x-state.x)*steering,y:state.y+(y-state.y)*steering};
}
export const smooth=(current:number,target:number,dt:number,rate=7)=>current+(target-current)*(1-Math.exp(-rate*Math.max(0,dt)));
