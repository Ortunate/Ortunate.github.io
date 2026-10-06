import {clamp,type Garden} from './model.ts';
export function orbit(camera:Garden['camera'],dx:number,dy:number){camera.azimuth=((camera.azimuth-dx*.006+Math.PI*3)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;camera.polar=clamp(camera.polar+dy*.005,.3,1.32);}
export function zoom(camera:Garden['camera'],factor:number){camera.distance=clamp(camera.distance*factor,10,32);}
export class SimulationClock {private accumulator=0;private previous:number|undefined;reset(){this.accumulator=0;this.previous=undefined;}steps(now:number,active:boolean){if(!active){this.reset();return 0;}if(this.previous===undefined){this.previous=now;return 0;}this.accumulator+=Math.min(.1,Math.max(0,(now-this.previous)/1000));this.previous=now;const n=Math.floor(this.accumulator*30);this.accumulator-=n/30;return n;}}
