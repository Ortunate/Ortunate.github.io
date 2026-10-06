import {validate,stateBytes,clamp,type World,type Brush} from './model.ts';
import {paintPelagic,stepPelagic} from './pelagic.ts';
import {paintEmber,stepEmber} from './ember.ts';
export class WorldSession {
  state:World;undoStack:World[]=[];redoStack:World[]=[];lastPaintChanged=false;private before?:World;private edited=false;
  constructor(state:World){validate(state);this.state=structuredClone(state);}
  step(){if(this.state.world==='pelagic')stepPelagic(this.state);else stepEmber(this.state);}
  begin(){if(!this.before){this.before=structuredClone(this.state);this.edited=false;}}
  paint(b:Brush){this.lastPaintChanged=false;if(!b||![b.x,b.y,b.radius,b.strength].every(Number.isFinite)||b.radius<.005||b.radius>.2||b.strength<0||b.strength>1)throw new Error('Invalid brush.');if(b.x<0||b.x>1||b.y<0||b.y>1)return '';const allowed=this.state.world==='pelagic'?['flow','add','light','remove']:['lava','heat','cool','remove'];if(!allowed.includes(b.tool)||b.kind&&!['jelly','fish','plankton'].includes(b.kind)||b.dx!==undefined&&!Number.isFinite(b.dx)||b.dy!==undefined&&!Number.isFinite(b.dy))throw new Error('Invalid tool.');this.begin();let message='';if(this.state.world==='pelagic'){const d=this.state,count=d.creatures.length+d.lights.length;message=paintPelagic(d,{...b,dx:clamp(b.dx??.4,-1,1),dy:clamp(b.dy??0,-1,1)});this.lastPaintChanged=b.tool==='flow'||count!==d.creatures.length+d.lights.length;}else this.lastPaintChanged=paintEmber(this.state,b);this.edited ||= this.lastPaintChanged;return message;}
  end(){if(this.before&&this.edited){this.undoStack.push(this.before);this.redoStack=[];}this.before=undefined;this.edited=false;this.bound();}
  params(params:unknown){if(!params||typeof params!=='object')throw new Error('Invalid settings.');this.end();const next=structuredClone(this.state);next.params={...next.params,...params} as World['params'];validate(next);this.begin();this.state=next;this.edited=true;this.end();}
  name(name:unknown){if(typeof name!=='string'||name.length>80)throw new Error('Names are limited to 80 characters.');this.end();this.begin();this.state.name=name;this.edited=true;this.end();}
  undo(){this.end();const d=this.undoStack.pop();if(d){this.redoStack.push(this.state);this.state=d;}this.bound();}
  redo(){this.end();const d=this.redoStack.pop();if(d){this.undoStack.push(this.state);this.state=d;}this.bound();}
  get historyBytes(){return [...this.undoStack,...this.redoStack].reduce((n,d)=>n+stateBytes(d),0);}
  private bound(){while(this.undoStack.length+this.redoStack.length>30||this.historyBytes>32*1024*1024){if(this.undoStack.length)this.undoStack.shift();else this.redoStack.shift();}}
}
