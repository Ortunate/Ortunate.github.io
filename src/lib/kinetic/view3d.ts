import * as THREE from 'three';
import type { MachineView } from './view.ts';
import type { KineticDocument, Part, Point } from './model.ts';
import type { PhysicsFrame, Pose } from './physics.ts';
/** Rendering is a projection of fixed-step physics, not another simulation. */
export class ThreeMachineView implements MachineView {
  kind='3d' as const;canvas:HTMLCanvasElement;renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();private camera=new THREE.OrthographicCamera(-9,9,5.7,-5.7,.1,80);
  private board=new THREE.Group();private pieces=new THREE.Group();private balls=new THREE.Group();
  private groups=new Map<string,THREE.Group>();private ballMeshes=new Map<string,THREE.Mesh>();
  private ray=new THREE.Raycaster();private plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  private scale=1;private offset={x:0,y:0};private signature='';private frame?:PhysicsFrame;private previous=new Map<string,Pose>();private arrived=0;
  private trails=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x81bca8,transparent:true,opacity:.4}));
  setTrails(trails:Point[][]){if(!trails.length&&!this.trails.geometry.getAttribute('position')?.count)return;const points:number[]=[];for(const trail of trails)for(let i=1;i<trail.length;i++)points.push(trail[i-1].x,trail[i-1].y,.02,trail[i].x,trail[i].y,.02);this.trails.geometry.dispose();this.trails.geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3));}
  private cream=new THREE.MeshStandardMaterial({color:0xd9d6c9,roughness:.34,metalness:.22});
  private brass=new THREE.MeshStandardMaterial({color:0xb18b5f,roughness:.32,metalness:.68});
  private green=new THREE.MeshStandardMaterial({color:0x81bca8,roughness:.35,metalness:.35});
  private selectedMaterial=new THREE.MeshStandardMaterial({color:0xc5e7d9,emissive:0x17382d,roughness:.35,metalness:.2});
  private steel=new THREE.MeshStandardMaterial({color:0xbbd2e2,roughness:.16,metalness:.78});
  constructor(canvas:HTMLCanvasElement){
    this.canvas=canvas;this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});this.renderer.setPixelRatio(Math.min(2,devicePixelRatio));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.scene.background=new THREE.Color('#10161d');this.scene.add(new THREE.HemisphereLight(0xdbe8f0,0x303027,2));
    const light=new THREE.DirectionalLight(0xffe8c4,3.3);light.position.set(2,12,13);light.target.position.set(8,5,0);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-13,right:13,top:10,bottom:-10,near:.1,far:45});light.shadow.bias=-.0005;this.scene.add(light,light.target);
    const fill=new THREE.DirectionalLight(0x86b0d0,1.2);fill.position.set(15,1,7);this.scene.add(fill);
    const plate=new THREE.Mesh(new THREE.BoxGeometry(16.4,10.4,.24),new THREE.MeshStandardMaterial({color:0x26323b,roughness:.92}));plate.position.set(8,5,-.4);plate.receiveShadow=true;this.board.add(plate);
    const vertices:number[]=[];for(let x=0;x<=16;x+=.5)vertices.push(x,0,-.265,x,10,-.265);for(let y=0;y<=10;y+=.5)vertices.push(0,y,-.265,16,y,-.265);const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)),new THREE.LineBasicMaterial({color:0x5c7180,transparent:true,opacity:.12}));this.board.add(grid);
    for(const [x,y]of [[.2,.2],[15.8,.2],[.2,9.8],[15.8,9.8]]){const screw=this.disc(.07,.04,this.brass);screw.position.set(x,y,-.22);this.board.add(screw);}
    this.scene.add(this.board,this.pieces,this.balls,this.trails);this.resize();
  }
  private disc(radius:number,depth:number,material:THREE.Material){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,depth,28),material);mesh.rotation.x=Math.PI/2;mesh.castShadow=true;return mesh;}
  private bar(length:number,thickness:number,material:THREE.Material){const shape=new THREE.Shape(),r=thickness/2,h=length/2-r;shape.moveTo(-h,-r);shape.lineTo(h,-r);shape.absarc(h,0,r,-Math.PI/2,Math.PI/2,false);shape.lineTo(-h,r);shape.absarc(-h,0,r,Math.PI/2,Math.PI*1.5,false);const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:true,bevelThickness:.035,bevelSize:.025,bevelSegments:2,steps:1,curveSegments:10}),material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
  private part(p:Part){const group=new THREE.Group();let body:THREE.Mesh;
    if(p.kind==='bumper'){body=this.disc(.35,.24,this.cream);body.position.z=.12;}else body=this.bar(p.kind==='pad'?1:p.length,p.kind==='rail'?.14:.22,this.cream);
    body.userData.body=true;group.add(body);
    if(p.kind==='seesaw'||p.kind==='rotor'){const pivot=this.disc(.15,.12,this.brass);pivot.position.z=.3;group.add(pivot);const center=this.disc(.055,.03,this.steel);center.position.z=.38;group.add(center);}
    if(p.kind==='pad'){const arrow=new THREE.Mesh(new THREE.ConeGeometry(.12,.32,3),this.brass);arrow.position.set(0,.3,.13);group.add(arrow);}
    this.pieces.add(group);this.groups.set(p.id,group);
  }
  private clear(group:THREE.Group){group.traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.LineSegments)node.geometry.dispose();});group.clear();}
  update(doc:KineticDocument,frame:PhysicsFrame|undefined,selected:string|undefined){
    const signature=JSON.stringify(doc.parts.map(p=>[p.id,p.kind,p.length]));if(signature!==this.signature){this.clear(this.pieces);this.groups.clear();for(const part of doc.parts)this.part(part);this.signature=signature;}
    if(frame!==this.frame){this.previous=new Map(this.frame?.poses.map(p=>[p.id,p])??[]);this.frame=frame;this.arrived=performance.now();}
    for(const p of doc.parts){const group=this.groups.get(p.id)!;group.position.set(p.x,p.y,0);group.rotation.z=p.angle;group.traverse(node=>{if(node instanceof THREE.Mesh&&node.userData.body)node.material=p.id===selected?this.selectedMaterial:p.locked?this.brass:this.cream;});}
    // Facilities are small and rebuilt only when the layout changes.
    const facilityKey=JSON.stringify([doc.emitter,doc.goal,selected==='emitter',selected==='goal']);
    if(this.board.userData.facilityKey!==facilityKey){const old=this.board.getObjectByName('facilities') as THREE.Group|undefined;if(old){this.clear(old);this.board.remove(old);}const g=new THREE.Group();g.name='facilities';this.board.userData.facilityKey=facilityKey;
      for(const [x,y,length,angle]of [[doc.goal.x,doc.goal.y-.38,1.44,0],[doc.goal.x-.64,doc.goal.y,.9,Math.PI/2],[doc.goal.x+.64,doc.goal.y,.9,Math.PI/2]]){const m=this.bar(length,.16,selected==='goal'?this.selectedMaterial:this.green);m.position.set(x,y,0);m.rotation.z=angle;g.add(m);}
      const source=this.bar(.65,.36,selected==='emitter'?this.selectedMaterial:this.brass);source.position.set(doc.emitter.x,doc.emitter.y+.35,.1);g.add(source);const preview=new THREE.Mesh(new THREE.SphereGeometry(.16,20,16),this.steel);preview.position.set(doc.emitter.x,doc.emitter.y,.18);g.add(preview);this.board.add(g);
    }
    const ids=new Set(frame?.poses.filter(p=>p.id.startsWith('ball-')).map(p=>p.id));for(const [id,mesh]of this.ballMeshes)if(!ids.has(id)){mesh.geometry.dispose();this.balls.remove(mesh);this.ballMeshes.delete(id);}
    for(const p of frame?.poses??[])if(p.id.startsWith('ball-')&&!this.ballMeshes.has(p.id)){const mesh=new THREE.Mesh(new THREE.SphereGeometry(.16,24,20),this.steel);mesh.castShadow=true;this.ballMeshes.set(p.id,mesh);this.balls.add(mesh);}
  }
  render(time:number){const alpha=Math.min(1,Math.max(0,(time-this.arrived)/33));for(const p of this.frame?.poses??[]){const object=this.groups.get(p.id)??this.ballMeshes.get(p.id);if(!object)continue;const before=this.previous.get(p.id)??p,delta=Math.atan2(Math.sin(p.angle-before.angle),Math.cos(p.angle-before.angle));object.position.set(before.x+(p.x-before.x)*alpha,before.y+(p.y-before.y)*alpha,p.id.startsWith('ball-')?.18:0);object.rotation.z=before.angle+delta*alpha;if(object instanceof THREE.Mesh)object.material=p.collected?this.green:this.steel;}this.renderer.render(this.scene,this.camera);}
  point(clientX:number,clientY:number){const r=this.canvas.getBoundingClientRect();this.ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);const target=new THREE.Vector3();this.ray.ray.intersectPlane(this.plane,target);return {x:target.x,y:target.y};}
  private cameraPosition(){this.camera.zoom=this.scale;this.camera.position.set(8+this.offset.x,2+this.offset.y,28);this.camera.lookAt(8+this.offset.x,5+this.offset.y,0);this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();}
  zoom(delta:number){this.scale=Math.max(.65,Math.min(2.8,this.scale*Math.exp(delta)));this.cameraPosition();}
  pan(dx:number,dy:number){this.offset.x-=dx/this.canvas.clientWidth*18/this.scale;this.offset.y+=dy/this.canvas.clientWidth*18/this.scale;this.cameraPosition();}
  reset(){this.scale=1;this.offset={x:0,y:0};this.cameraPosition();}
  resize(){const rect=this.canvas.getBoundingClientRect();this.renderer.setSize(Math.max(1,rect.width),Math.max(1,rect.height),false);const ratio=rect.width/Math.max(1,rect.height);this.camera.left=-9;this.camera.right=9;this.camera.top=9/ratio;this.camera.bottom=-9/ratio;this.cameraPosition();}
  dispose(){const materials=new Set<THREE.Material>();this.scene.traverse(node=>{if(node instanceof THREE.Mesh||node instanceof THREE.LineSegments){node.geometry.dispose();for(const m of Array.isArray(node.material)?node.material:[node.material])materials.add(m);}});for(const m of [this.cream,this.brass,this.green,this.selectedMaterial,this.steel,...materials])m.dispose();this.renderer.dispose();}
}
