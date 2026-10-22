import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import ts from 'typescript';
import { Element, storage } from './helpers/dom.ts';
function harness(game: string, module: string) {
    const root = new Element();
    root.dataset.tabletop = game;
    for (const id of ['table-mode', 'table-board', 'table-actions', 'table-new', 'table-status', 'table-rules', 'table-save']) {
        const el = new Element(id === 'table-mode' ? 'select' : 'div');
        el.id = id;
        root.append(el);
    }
    const doc = Object.assign(new Element('document'), { hidden: false, activeElement: null as Element | null, createElement: (tag: string) => { const e = new Element(tag); (e.classList as any).add = (name: string) => e.className += ' ' + name; return e; }, getElementById: (id: string) => root.all().find(e => e.id === id), querySelector: () => root });
    const workers: any[] = [];
    class Worker {
        onmessage: any;
        onerror: any;
        request: any;
        terminated = false;
        constructor() { workers.push(this); }
        postMessage(data: any) { this.request = structuredClone(data); }
        terminate() { this.terminated = true; }
    }
    const win = Object.assign(new Element('window'), { confirm: () => true, setTimeout: () => 1, clearTimeout: () => { } }), store = storage(), context = vm.createContext({ document: doc, window: win, localStorage: store, Worker, URL, structuredClone, console, clearTimeout: () => { }, setTimeout: () => 1 });
    const cache = new Map();
    function load(file: string): any { file = resolve(file); if (cache.has(file))
        return cache.get(file); const exports = {}; cache.set(file, exports); const source = ts.transpileModule(readFileSync(file, 'utf8').replaceAll('import.meta.url', JSON.stringify('file:///' + file.replaceAll('\\', '/'))), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText; const fn = vm.runInContext(`(function(require,exports){${source}\n})`, context); fn((path: string) => load(resolve(dirname(file), path.endsWith('.ts') ? path : path + '.ts')), exports); return exports; }
    load(`src/scripts/games/${module}.ts`).mount(root);
    const el = (id: string) => doc.getElementById(id)!;
    const click = (name: string) => el('table-actions').all().find(e => e.textContent === name)!.click();
    return { root, doc, win, store, workers, el, click };
}
test('solitaire controller draws, undoes, saves and tolerates unavailable storage', () => { const h = harness('klondike', 'solitaire'); const stock = () => h.el('table-board').all().find(e => e.textContent.startsWith('Stock'))!; assert.equal(stock().textContent, 'Stock (24)'); stock().click(); assert.equal(stock().textContent, 'Stock (23)'); h.click('Undo'); assert.equal(stock().textContent, 'Stock (24)'); h.store.setItem = () => { throw Error('quota'); }; stock().click(); assert.match(h.el('table-save').textContent, /Storage unavailable/); });
test('board controller rejects stale AI after undo and suspends background work', () => { const h = harness('chess', 'board'); const cell = (n: number) => h.el('table-board').all().find(e => e.dataset.cell === String(n))!; cell(52).click(); cell(36).click(); assert.equal(h.workers.length, 1); const worker = h.workers[0]; h.click('Undo'); assert.ok(worker.terminated); worker.onmessage({ data: { id: worker.request.id, revision: worker.request.revision, move: { from: 12, to: 28 } } }); assert.match(cell(52).getAttribute('aria-label')!, /White pawn/); assert.match(cell(12).getAttribute('aria-label')!, /Black pawn/); cell(52).click(); cell(36).click(); const active = h.workers.at(-1); h.doc.hidden = true; h.doc.dispatchEvent(new Event('visibilitychange')); assert.ok(active.terminated); h.doc.hidden = false; h.doc.dispatchEvent(new Event('visibilitychange')); assert.equal(h.workers.length, 3); });
test('poker controller never renders bot hole-card faces during a hand', () => { const h = harness('poker', 'poker'); const seats = h.el('table-board').querySelectorAll('.poker-seat'); assert.equal(seats.length, 6); for (const seat of seats.slice(1))
    assert.equal(seat.querySelectorAll('.card-back').length, 2); assert.equal(seats[0].querySelectorAll('.card-back').length, 0); });
