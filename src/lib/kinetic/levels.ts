import { newDocument, makePart, type KineticDocument, type PartKind } from './model.ts';
export interface Level { id:string; title:string; description:string; hint:string; document:KineticDocument }
function level(id:string,title:string,description:string,hint:string,emitter:[number,number],goal:[number,number],budget:Partial<Record<PartKind,number>>):Level {
  return {id,title,description,hint,document:{...newDocument(title),kind:'challenge',emitter:{x:emitter[0],y:emitter[1]},goal:{x:goal[0],y:goal[1]},budget:{rail:0,bumper:0,pad:0,seesaw:0,rotor:0,...budget}}};
}
export const levels:Level[]=[
  level('descent','First Descent','One rail. One small journey.','Place a rail below the source and slope it down to the right. Leave room for a final free fall.',[3,8.5],[8.5,1],{rail:1}),
  level('switchback','Switchback','Turn momentum into a different direction.','Use two slopes in opposite directions. The fixed wall helps turn the ball back to the left.',[2.8,9],[3.2,1],{rail:2}),
  level('bounce','A Better Bounce','A small offset makes a big difference.','Drop just to the right of a bumper’s center. Give the ball room to bounce toward the cup.',[6.2,8.5],[10.2,1],{bumper:2}),
  level('launch','Against Gravity','A little energy, pointed the right way.','Angle a launch pad toward the raised cup. Power controls the outgoing normal speed.',[5,5],[12.8,4.7],{pad:1}),
  level('balance','Balance Point','Let the weight of the ball move the machine.','Place the ball’s landing point left of the seesaw pivot. The board is free to tip.',[6.3,8],[5.7,1],{seesaw:1}),
  level('clockwork','Clockwork','Three drops, one moving machine.','Use the fixed funnel to catch the result of different rotor phases. Balls arrive two seconds apart.',[7.2,8.5],[7.75,1],{rotor:1}),
];
levels[1].document.parts=[{...makePart('rail','p-wall',8.2,5),angle:Math.PI/2,length:2,locked:true}];
levels[5].document.balls=3;
levels[5].document.parts=[{...makePart('rail','p-funnel-left',5,2.6),angle:-.35,length:5,locked:true},{...makePart('rail','p-funnel-right',10.5,2.6),angle:.35,length:5,locked:true}];
export const examples:KineticDocument[]=[
  {...newDocument('A quiet descent'),emitter:{x:3,y:8.5},goal:{x:8.5,y:1},parts:[{...makePart('rail','p-ramp',4,5),angle:-.35,length:3.5}]},
  {...newDocument('Over the gap'),emitter:{x:5,y:5},goal:{x:12.8,y:4.7},parts:[{...makePart('pad','p-launch',5,2.5),angle:-.5,power:10}]},
  {...structuredClone(levels[5].document),kind:'draft',name:'A clockwork funnel',parts:[...structuredClone(levels[5].document.parts),{...makePart('rotor','p-spinner',7,5),angle:.5,power:-.7}]},
];
