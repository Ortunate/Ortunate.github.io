export type Direction='up'|'down'|'left'|'right';
export interface MoveResult {board:number[];score:number;changed:boolean;merged:number[];transitions:{from:number;to:number}[]}
export function moveBoard(board:number[],direction:Direction):MoveResult {
  const next=Array<number>(16).fill(0),merged:number[]=[],transitions:{from:number;to:number}[]=[];let score=0;
  for(let line=0;line<4;line++){
    const indices=Array.from({length:4},(_,i)=>direction==='left'?line*4+i:direction==='right'?line*4+3-i:direction==='up'?i*4+line:(3-i)*4+line);
    const entries=indices.filter(i=>board[i]!==0).map(i=>({value:board[i],from:i}));let target=0;
    for(let i=0;i<entries.length;i++) {const entry=entries[i],to=indices[target++];let value=entry.value;transitions.push({from:entry.from,to});if(i+1<entries.length&&entries[i+1].value===value){value*=2;score+=value;merged.push(to);transitions.push({from:entries[++i].from,to});}next[to]=value;}
  }
  return {board:next,score,changed:next.some((v,i)=>v!==board[i]),merged,transitions};
}
export function spawnTile(board:number[],random=Math.random):{board:number[];index:number} {const empty=board.flatMap((v,i)=>v===0?[i]:[]);if(!empty.length)return {board:[...board],index:-1};const index=empty[Math.min(empty.length-1,Math.floor(random()*empty.length))];const next=[...board];next[index]=random()<.9?2:4;return {board:next,index};}
export function newBoard(random=Math.random){return spawnTile(spawnTile(Array<number>(16).fill(0),random).board,random).board;}
export function canMove(board:number[]){return board.includes(0)||board.some((v,i)=>(i%4<3&&v===board[i+1])||(i<12&&v===board[i+4]));}
export function validBoard(value:unknown):value is number[]{return Array.isArray(value)&&value.length===16&&value.every(v=>Number.isSafeInteger(v)&&v>=0&&(v===0||(v>=2&&Number.isInteger(Math.log2(v)))));}
