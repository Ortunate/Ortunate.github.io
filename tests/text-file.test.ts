import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readTextFile} from '../src/lib/text-file.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('text files decode UTF-8 and BOM while preserving line endings and Unicode', async () => {
  const text = '你好 🌌\r\nnext\n';
  assert.equal(await readTextFile(new Blob(['\uFEFF',text]), {characters:100,lines:3}), text);
  assert.equal(await readTextFile(new Blob([]), {characters:100,lines:1}), '');
});

test('file limits reject bytes before reading and enforce decoded characters and line counts', async () => {
  let read = false;
  await assert.rejects(readTextFile({size:404, arrayBuffer:async () => {read=true; return new ArrayBuffer(0);}}, {characters:100}), /too large/);
  assert.equal(read,false);
  await assert.rejects(readTextFile(new Blob(['中'.repeat(11)]), {characters:10}), /characters/);
  await assert.rejects(readTextFile(new Blob(['a\rb\r\n']), {characters:100,lines:2}), /lines/);
});

test('invalid UTF-8, binary data and read failures are surfaced', async () => {
  await assert.rejects(readTextFile(new Blob([new Uint8Array([0xff,0xfe,0x61,0])]), {characters:100}), /UTF-8/);
  await assert.rejects(readTextFile(new Blob(['a\0b']), {characters:100}), /binary/);
  await assert.rejects(readTextFile({size:1,arrayBuffer:async () => {throw new Error('unreadable');}}, {characters:100}), /unreadable/);
});

test('file loading preserves newer edits and choices and does not replace input on failure', async () => {
  const exports: Record<string, any> = {};
  const source = ts.transpileModule(readFileSync(new URL('../src/scripts/text-files.ts', import.meta.url), 'utf8'), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(source, {exports,require:()=>({readTextFile}),window:new EventTarget(),Event,Error});
  const picker = Object.assign(new EventTarget(), {value:'',files:[] as unknown[]});
  const input = Object.assign(new EventTarget(), {value:'original',focus:()=>{}});
  const messages: string[] = [];
  const cancel = exports.bindTextFile(picker,input,{characters:100},(message: string)=>messages.push(message));
  let finish!: (buffer: ArrayBuffer) => void;
  function pending() {
    picker.files = [{size:3,arrayBuffer:()=>new Promise<ArrayBuffer>(resolve=>{finish=resolve;})}];
    picker.dispatchEvent(new Event('change'));
  }
  const flush = () => new Promise(resolve=>setImmediate(resolve));
  pending();
  input.value='new edit'; input.dispatchEvent(new Event('input'));
  finish(new TextEncoder().encode('old').buffer); await flush();
  assert.equal(input.value,'new edit');
  pending(); cancel();
  finish(new TextEncoder().encode('old').buffer); await flush();
  assert.equal(input.value,'new edit');
  pending(); const oldFinish = finish;
  picker.files=[new Blob(['latest'])]; picker.dispatchEvent(new Event('change')); await flush();
  oldFinish(new TextEncoder().encode('old').buffer); await flush();
  assert.equal(input.value,'latest');
  picker.files=[new Blob([new Uint8Array([255])])]; picker.dispatchEvent(new Event('change')); await flush();
  assert.equal(input.value,'latest');
  assert.match(messages.at(-1)!, /UTF-8/);
});
