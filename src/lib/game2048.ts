export type Direction='up'|'down'|'left'|'right';
export interface MoveResult {board:number[];score:number;changed:boolean;merged:number[];transitions:{from:number;to:number}[]}
export function moveBoard(board:number[],direction:Direction,size=4):MoveResult {
  const next=Array<number>(size*size).fill(0),merged:number[]=[],transitions:{from:number;to:number}[]=[];let score=0;
  for(let line=0;line<size;line++){
    const indices=Array.from({length:size},(_,i)=>direction==='left'?line*size+i:direction==='right'?line*size+size-1-i:direction==='up'?i*size+line:(size-1-i)*size+line);
    const entries=indices.filter(i=>board[i]!==0).map(i=>({value:board[i],from:i}));let target=0;
    for(let i=0;i<entries.length;i++) {const entry=entries[i],to=indices[target++];let value=entry.value;transitions.push({from:entry.from,to});if(i+1<entries.length&&entries[i+1].value===value){value*=2;score+=value;merged.push(to);transitions.push({from:entries[++i].from,to});}next[to]=value;}
  }
  return {board:next,score,changed:next.some((v,i)=>v!==board[i]),merged,transitions};
}
export function spawnTile(board:number[],random=Math.random):{board:number[];index:number} {const empty=board.flatMap((v,i)=>v===0?[i]:[]);if(!empty.length)return {board:[...board],index:-1};const index=empty[Math.min(empty.length-1,Math.floor(random()*empty.length))];const next=[...board];next[index]=random()<.9?2:4;return {board:next,index};}
export function newBoard(random=Math.random,size=4){return spawnTile(spawnTile(Array<number>(size*size).fill(0),random).board,random).board;}
export function canMove(board:number[],size=4){return board.includes(0)||board.some((v,i)=>(i%size<size-1&&v===board[i+1])||(i<size*(size-1)&&v===board[i+size]));}
export function validBoard(value:unknown,size=4):value is number[]{return Array.isArray(value)&&value.length===size*size&&value.every(v=>Number.isSafeInteger(v)&&v>=0&&(v===0||(v>=2&&Number.isInteger(Math.log2(v)))));}
export function adjacent(a:number,b:number,size:number,diagonal=false){const dx=Math.abs(a%size-b%size),dy=Math.abs(Math.floor(a/size)-Math.floor(b/size));return a!==b&&(diagonal?Math.max(dx,dy)===1:dx+dy===1);}
export function validChain(board:number[],path:number[],kind:'same'|'doubling',size=5){if(!path.length||new Set(path).size!==path.length||path.some(i=>i<0||i>=board.length||board[i]===0))return false;let sum=board[path[0]];for(let i=1;i<path.length;i++){if(!adjacent(path[i-1],path[i],size,true))return false;if(board[path[i]]!==(kind==='same'?board[path[0]]:sum))return false;sum+=board[path[i]];}return Number.isSafeInteger(2**Math.ceil(Math.log2(sum)));}
export function mergeChain(board:number[],path:number[],kind:'same'|'doubling',size=5,random=Math.random){if(path.length<2||!validChain(board,path,kind,size))return null;const value=2**Math.ceil(Math.log2(path.reduce((s,i)=>s+board[i],0))),next=[...board];path.forEach(i=>next[i]=0);next[path.at(-1)!]=value;for(let x=0;x<size;x++){const column=Array.from({length:size},(_,y)=>next[y*size+x]).filter(Boolean);while(column.length<size)column.unshift(random()<.9?2:4);column.forEach((v,y)=>next[y*size+x]=v);}return {board:next,score:value};}
export function canLink(board:number[],size=5){return board.some((v,i)=>board.some((n,j)=>v===n&&adjacent(i,j,size,true)));}
