export type Direction='up'|'down'|'left'|'right';
export interface Point {x:number;y:number}
export interface SnakeState {body:Point[];direction:Direction;food:Point|null;score:number;over:boolean;won:boolean}
export const vectors:Record<Direction,Point>={up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
export function canTurn(from:Direction,to:Direction){return vectors[from].x+vectors[to].x!==0||vectors[from].y+vectors[to].y!==0;}
export function foodFor(body:Point[],size=20,random=Math.random):Point|null {const empty:Point[]=[];for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!body.some(p=>p.x===x&&p.y===y))empty.push({x,y});return empty.length?empty[Math.min(empty.length-1,Math.floor(random()*empty.length))]:null;}
export function newSnake():SnakeState {const body=[{x:9,y:10},{x:8,y:10},{x:7,y:10}];return {body,direction:'right',food:{x:14,y:10},score:0,over:false,won:false};}
export function stepSnake(state:SnakeState,requested:Direction=state.direction,size=20,random=Math.random):SnakeState {
  if(state.over)return state;
  const direction=canTurn(state.direction,requested)?requested:state.direction;
  const v=vectors[direction],head={x:state.body[0].x+v.x,y:state.body[0].y+v.y};
  const eating=state.food!==null&&head.x===state.food.x&&head.y===state.food.y;
  const occupied=eating?state.body:state.body.slice(0,-1);
  if(head.x<0||head.y<0||head.x>=size||head.y>=size||occupied.some(p=>p.x===head.x&&p.y===head.y))return {...state,direction,over:true};
  const body=[head,...state.body];if(!eating)body.pop();
  const food=eating?foodFor(body,size,random):state.food;return {body,direction,food,score:state.score+(eating?10:0),over:food===null,won:food===null};
}
