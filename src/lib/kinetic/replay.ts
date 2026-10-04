import type { Point } from './model.ts';
import type { PhysicsFrame } from './physics.ts';

/** Recorded positions only: seeking never invokes the physics engine. */
export function replayTrails(frames:PhysicsFrame[],index:number):Point[][] {
  const trails=new Map<string,Point[]>();
  for(const frame of frames.slice(0,index+1))for(const pose of frame.poses){
    if(!pose.id.startsWith('ball-')||pose.collected)continue;
    const points=trails.get(pose.id)??[];
    points.push({x:pose.x,y:pose.y});trails.set(pose.id,points);
  }
  return [...trails.values()];
}
