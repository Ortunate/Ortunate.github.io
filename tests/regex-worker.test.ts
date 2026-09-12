import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../src/scripts/regex.worker.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
async function search(pattern:string,flags:string,text:string,timeoutMs=1000):Promise<{error?:string;matches?:{index:number;text:string;groups:string[]}[]}>{
 const worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:data=>parentPort.postMessage(data)};${source};parentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
 try{return await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('timed out')),timeoutMs);worker.once('message',data=>{clearTimeout(timeout);resolve(data);});worker.once('error',error=>{clearTimeout(timeout);reject(error);});worker.postMessage({pattern,flags,text});});}finally{await worker.terminate();}
}
test('regex worker returns matches, captures and syntax errors',async()=>{
 const result=await search('(hello)@(world)','g','hello@world hello@world');
 assert.equal(result.matches?.length,2);assert.deepEqual(result.matches?.[0].groups,['hello','world']);
 const invalid=await search('[','g','hello');assert.ok(invalid.error);
});
test('regex worker advances Unicode zero-width matches without looping',async()=>{
 const result=await search('(?=)','gu','🌌');assert.deepEqual(result.matches?.map(m=>m.index),[0,2]);
});
test('a catastrophic regex remains terminable off the main thread',async()=>{
 await assert.rejects(search('(a+)+$','g','a'.repeat(32)+'!',100),/timed out/);
});
