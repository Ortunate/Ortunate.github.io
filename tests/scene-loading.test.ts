import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('home scene waits for visibility and full motion, rechecks idle callbacks, and starts only once', async () => {
  const idle: (() => void)[] = [];
  let intersect: (entries: {isIntersecting: boolean}[]) => void = () => {};
  let imports = 0, disconnected = false;
  const host = {classList: {remove() {}}, querySelector: () => null};
  const document = Object.assign(new EventTarget(), {hidden: false, documentElement: {dataset: {motion: 'reduced'}}, getElementById: () => host});
  const window = Object.assign(new EventTarget(), {requestIdleCallback: (callback: () => void) => idle.push(callback)});
  const source = ts.transpileModule(readFileSync('src/scripts/scene.ts', 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText.replace(/import\(/g, 'loadModule(');
  vm.runInNewContext(source, {
    document, window, setTimeout: (callback: () => void) => idle.push(callback),
    IntersectionObserver: class {
      constructor(callback: typeof intersect) { intersect = callback; }
      observe() {} disconnect() { disconnected = true; }
    },
    loadModule: async () => { imports++; throw new Error('Simulated unavailable graphics engine'); },
  });
  intersect([{isIntersecting: true}]);
  assert.equal(idle.length, 0);
  document.documentElement.dataset.motion = 'full';
  window.dispatchEvent(new Event('motionchange'));
  assert.equal(idle.length, 1);
  document.hidden = true; idle.shift()!();
  assert.equal(imports, 0);
  document.hidden = false; document.dispatchEvent(new Event('visibilitychange'));
  intersect([{isIntersecting: false}]); idle.shift()!();
  assert.equal(imports, 0);
  intersect([{isIntersecting: true}]); idle.shift()!();
  await Promise.resolve();
  assert.equal(imports, 1); assert.equal(disconnected, true);
  window.dispatchEvent(new Event('motionchange'));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(idle.length, 0);
});
