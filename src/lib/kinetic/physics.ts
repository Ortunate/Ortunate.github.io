import RAPIER from '@dimforge/rapier2d-compat';
import { DT, validateDocument, type KineticDocument, type Part } from './model.ts';
let initialization:Promise<void>|undefined;
export function initPhysics(){return initialization??=RAPIER.init();}
export interface Pose { id:string; x:number; y:number; angle:number; collected?:boolean }
export interface CollisionEvent { tick:number; a:string; b:string; type:'contact'|'launch'|'collected'|'lost' }
export interface PhysicsFrame { tick:number; poses:Pose[]; collected:number; spawned:number; result:'running'|'won'|'lost'|'timeout'; events:CollisionEvent[] }
interface Ball { id:string; body:RAPIER.RigidBody; hold:number; collected:boolean }
export class KineticPhysics {
  world:RAPIER.World; queue:RAPIER.EventQueue; doc:KineticDocument;
  tick=0; result:PhysicsFrame['result']='running'; balls:Ball[]=[]; events:CollisionEvent[]=[]; replay:PhysicsFrame[]=[];
  bodies=new Map<string,RAPIER.RigidBody>(); colliderIds=new Map<number,string>();
  private launches=new Map<string,number>();
  constructor(doc:KineticDocument){
    validateDocument(doc);this.doc=structuredClone(doc);this.world=new RAPIER.World({x:0,y:-9.81});this.world.timestep=DT;this.queue=new RAPIER.EventQueue(true);
    for(const p of doc.parts)this.addPart(p);
    const {x,y}=doc.goal;
    this.fixedBox('cup',x,y-.38,.72,.08);this.fixedBox('cup',x-.64,y,.08,.45);this.fixedBox('cup',x+.64,y,.08,.45);
    this.capture();
  }
  private collider(desc:RAPIER.ColliderDesc,body:RAPIER.RigidBody,id:string){desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);const c=this.world.createCollider(desc,body);this.colliderIds.set(c.handle,id);return c;}
  private fixedBox(id:string,x:number,y:number,hx:number,hy:number){const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x,y));this.collider(RAPIER.ColliderDesc.cuboid(hx,hy).setFriction(.45),body,id);}
  private addPart(p:Part){
    let desc=p.kind==='seesaw'?RAPIER.RigidBodyDesc.dynamic().setAngularDamping(.5):p.kind==='rotor'?RAPIER.RigidBodyDesc.kinematicVelocityBased().setAngvel(p.power):RAPIER.RigidBodyDesc.fixed();
    desc=desc.setTranslation(p.x,p.y).setRotation(p.angle);
    const body=this.world.createRigidBody(desc);this.bodies.set(p.id,body);
    const collider=p.kind==='bumper'?RAPIER.ColliderDesc.ball(.35).setRestitution(.9):RAPIER.ColliderDesc.cuboid(p.kind==='pad'?.5:p.length/2,p.kind==='rail'?.07:.11).setRestitution(.08);
    collider.setFriction(p.kind==='pad'?.1:.35);this.collider(collider,body,p.id);
    if(p.kind==='seesaw'){
      const anchor=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x,p.y).setRotation(p.angle));
      const joint=this.world.createImpulseJoint(RAPIER.JointData.revolute({x:0,y:0},{x:0,y:0}),anchor,body,true) as RAPIER.RevoluteImpulseJoint;
      joint.setLimits(-1.05,1.05);
    }
  }
  private spawn(){
    const id=`ball-${this.balls.length}`,p=this.doc.emitter;
    const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x,p.y).setCcdEnabled(true).setLinearDamping(.015));
    this.collider(RAPIER.ColliderDesc.ball(.16).setDensity(1).setFriction(.3).setRestitution(.12),body,id);
    this.balls.push({id,body,hold:0,collected:false});
  }
  private event(a:string,b:string,type:CollisionEvent['type']){if(this.events.length<1500)this.events.push({tick:this.tick,a,b,type});}
  step(count=1){
    for(let k=0;k<count&&this.result==='running';k++){
      if(this.balls.length<this.doc.balls&&this.tick>=this.balls.length*240)this.spawn();
      this.world.step(this.queue);this.tick++;
      this.queue.drainCollisionEvents((a,b,started)=>{
        if(!started)return;const one=this.colliderIds.get(a),two=this.colliderIds.get(b);if(!one||!two)return;
        if(one.startsWith('ball-')||two.startsWith('ball-'))this.event(one,two,'contact');
        const ball=this.balls.find(ball=>ball.id===one||ball.id===two),pad=this.doc.parts.find(p=>p.kind==='pad'&&(p.id===one||p.id===two));
        if(!ball||ball.collected||!pad)return;
        const key=`${ball.id}:${pad.id}`,last=this.launches.get(key)??-1000;
        if(this.tick-last<18)return;
        const normal={x:-Math.sin(pad.angle),y:Math.cos(pad.angle)},pos=ball.body.translation(),v=ball.body.linvel();
        if((pos.x-pad.x)*normal.x+(pos.y-pad.y)*normal.y<.02)return;
        const delta=Math.max(0,pad.power-(v.x*normal.x+v.y*normal.y));
        ball.body.applyImpulse({x:normal.x*delta*ball.body.mass(),y:normal.y*delta*ball.body.mass()},true);
        this.launches.set(key,this.tick);this.event(ball.id,pad.id,'launch');
      });
      for(const ball of this.balls){
        if(ball.collected)continue;const p=ball.body.translation(),v=ball.body.linvel(),goal=this.doc.goal;
        if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<-.5||p.x>16.5||p.y<-.5||p.y>15){this.result='lost';this.event(ball.id,'board','lost');break;}
        if(Math.abs(p.x-goal.x)<.48&&p.y>goal.y-.3&&p.y<goal.y+.3&&Math.hypot(v.x,v.y)<1.5)ball.hold++;else ball.hold=0;
        if(ball.hold>=60){ball.collected=true;ball.body.setLinvel({x:0,y:0},true);ball.body.setEnabled(false);this.event(ball.id,'cup','collected');}
      }
      if(this.balls.filter(b=>b.collected).length===this.doc.balls)this.result='won';
      if(this.tick>=3600&&this.result==='running')this.result='timeout';
      if(this.tick%4===0||this.result!=='running')this.capture();
    }
  }
  frame():PhysicsFrame {
    const poses:Pose[]=[...this.bodies].map(([id,b])=>({id,...b.translation(),angle:b.rotation()}));
    for(const b of this.balls)poses.push({id:b.id,...b.body.translation(),angle:b.body.rotation(),collected:b.collected});
    return {tick:this.tick,poses,collected:this.balls.filter(b=>b.collected).length,spawned:this.balls.length,result:this.result,events:this.events.slice(-8)};
  }
  private capture(){this.replay.push(this.frame());}
  dispose(){this.queue.free();this.world.free();}
}
