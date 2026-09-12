import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as motion from '../src/lib/motion.ts';
import * as simulation from '../src/lib/visual-simulation.ts';
import * as THREE from 'three';
import { disposeScene } from '../src/lib/visuals/types.ts';
import * as states from '../src/lib/game-state.ts';
import * as rules from '../src/lib/arcade-rules.ts';
import { createResultState } from '../src/lib/result-state.ts';
// Small event/canvas adapters exercise our runtime code, not a browser or its UI.
class Element extends EventTarget {
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    parentElement: Element | null = null;
    children: Element[] = [];
    width = 600;
    height = 400;
    hidden = false;
    textContent = '';
    value = '';
    focused = false;
    disconnected = false;
    calls: {
        name: string;
        args: unknown[];
    }[] = [];
    ctx = new Proxy({}, { get: (_target, name) => {
            if (name === 'createRadialGradient' || name === 'createLinearGradient')
                return () => ({ addColorStop() { } });
            return (...args: unknown[]) => { this.calls.push({ name: String(name), args }); };
        }, set: () => true });
    constructor(kind?: string, preview = false) {
        super();
        if (kind)
            this.dataset.visual = kind;
        if (preview)
            this.dataset.preview = '';
    }
    getContext() { return this.ctx; }
    getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 400 }; }
    hasAttribute(key: string) { return key === 'data-preview' && 'preview' in this.dataset; }
    setAttribute() { }
    setPointerCapture() { }
    focus() { this.focused = true; }
    closest() { return null; }
    appendChild(child: Element) { this.children.push(child); child.parentElement = this; return child; }
    remove() {
        if (this.parentElement)
            this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    }
}
class Observer {
    disconnected = false;
    observe() { }
    disconnect() { this.disconnected = true; }
}
function load(file: string, dependencies: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const exports: Record<string, any> = {};
    const document = Object.assign(new Element(), { hidden: false, documentElement: { dataset: { motion: 'full' } }, createElement: () => new Element(), getElementById: () => new Element() });
    const context = { exports, require: (key: string) => {
            if (!(key in dependencies))
                throw Error('Unexpected import: ' + key);
            return dependencies[key];
        }, document, window: new Element(), ResizeObserver: Observer, AbortController, Event, devicePixelRatio: 1, performance, ...extra };
    const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    vm.runInNewContext(source, context, { filename: file });
    return { ...context, exports };
}
function event(type: string, properties: Record<string, unknown>) { return Object.assign(new Event(type, { cancelable: true }), properties); }
const snapshot = (scene: any) => JSON.stringify({ time: scene.time, particles: scene.particles, trail: scene.trail, waves: scene.waves, warp: scene.warp, view: scene.view, rotation: scene.rotation, tilt: scene.tilt });
test('paused 2D draws and exports never advance particle, trail or ripple state', () => {
    const { exports: { VisualScene } } = load('../src/lib/visual-engine.ts', { './visual-simulation': simulation });
    for (const kind of ['ribbons', 'repulsion', 'gravity', 'flow', 'ripple', 'aurora', 'kaleidoscope', 'mesh', 'flock']) {
        const scene = new VisualScene(new Element(kind));
        scene.visible = true;
        scene.draw(.016);
        const before = snapshot(scene);
        scene.draw(0);
        scene.draw(0);
        assert.equal(snapshot(scene), before, kind);
        assert.equal(scene.exportCanvas(), scene.canvas);
        scene.dispose();
        assert.equal(scene.observer.disconnected, true);
    }
});
test('ripple waves expire and remain bounded through a long-running session', () => {
    const { exports: { VisualScene } } = load('../src/lib/visual-engine.ts', { './visual-simulation': simulation });
    const canvas = new Element('ripple');
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 60, height: 40 });
    const scene = new VisualScene(canvas);
    for (let i = 0; i < 500; i++) {
        scene.impulse();
        scene.draw(.1);
        assert.ok(scene.waves.length <= 12);
    }
    assert.ok(scene.waves.every((wave: any) => scene.time - wave.t <= 7));
    scene.dispose();
});
test('2D resize preserves normalized particle positions and nonstructural controls preserve state', () => {
    const { exports: { VisualScene } } = load('../src/lib/visual-engine.ts', { './visual-simulation': simulation });
    const canvas = new Element('gravity'), scene = new VisualScene(canvas);
    scene.draw(.016);
    const before = scene.particles.map((p: any) => [p.x / scene.width, p.y / scene.height]);
    const time = scene.time;
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 600 });
    scene.resize();
    scene.update({ palette: 2, strength: 2, preset: 1 });
    assert.equal(scene.time, time);
    scene.particles.forEach((p: any, i: number) => { assert.ok(Math.abs(p.x / scene.width - before[i][0]) < 1e-12); assert.ok(Math.abs(p.y / scene.height - before[i][1]) < 1e-12); });
    scene.dispose();
});
class Renderer {
    disposed = false;
    failed = false;
    frame: any;
    canvas: Element;
    constructor(canvas: Element) { this.canvas = canvas; }
    render(_w: number, _h: number, frame: any) {
        if (this.failed)
            throw Error('isolated shader error');
        this.frame = frame;
    }
    dispose() { this.disposed = true; }
}
function gpu() { return load('../src/lib/gpu-visual.ts', { './motion': motion, './visual-webgl': { StudyRenderer: Renderer }, './visual-engine': { defaults: { orbit: 1.8, tunnel: 80, fractal: 8 } } }); }
test('GPU render, export, resize and quality changes preserve simulation', () => {
    const { exports: { GPUVisual } } = gpu();
    for (const kind of ['orbit', 'tunnel', 'fractal']) {
        const canvas = new Element(kind);
        canvas.parentElement = new Element();
        const scene = new GPUVisual(canvas);
        scene.advance(.04);
        const before = snapshot(scene);
        scene.render();
        scene.exportCanvas();
        scene.quality = .6;
        scene.resize();
        scene.render();
        assert.equal(snapshot(scene), before, kind);
        const renderer = scene.renderer;
        scene.dispose();
        assert.equal(renderer.disposed, true);
        assert.equal(scene.observer.disconnected, true);
        assert.equal(scene.abort.signal.aborted, true);
    }
});
test('warp keyup releases only its own key and boost transitions are continuous', () => {
    const { exports: { GPUVisual } } = gpu(), canvas = new Element('tunnel'), scene = new GPUVisual(canvas);
    canvas.dispatchEvent(event('keydown', { key: 'Enter' }));
    scene.advance(.016);
    const first = scene.warp;
    canvas.dispatchEvent(event('keyup', { key: 'ArrowRight' }));
    assert.equal(scene.keys.has('Enter'), true);
    scene.advance(.016);
    assert.ok(scene.warp.speed > first.speed);
    canvas.dispatchEvent(event('keyup', { key: 'Enter' }));
    scene.impulseUntil = 0;
    const before = scene.warp;
    scene.advance(.016);
    assert.ok(scene.warp.speed < before.speed);
    assert.ok(scene.warp.phase > before.phase);
    scene.dispose();
});
test('a failed GPU study does not disable another study', () => {
    const { exports: { GPUVisual } } = gpu(), badCanvas = new Element('fractal'), goodCanvas = new Element('tunnel');
    badCanvas.parentElement = new Element();
    goodCanvas.parentElement = new Element();
    const bad = new GPUVisual(badCanvas), good = new GPUVisual(goodCanvas);
    bad.renderer.failed = true;
    bad.draw(.016);
    good.draw(.016);
    assert.equal(bad.fallback, true);
    assert.equal(good.fallback, false);
    assert.ok(good.renderer.frame);
    assert.notEqual(bad.exportCanvas(), badCanvas);
    bad.dispose();
    good.dispose();
});
test('pausing an eased camera and toggling orbital rotation do not jump to their targets', () => {
    const { exports: { GPUVisual } } = gpu();
    for (const kind of ['orbit', 'fractal']) {
        const canvas = new Element(kind), scene = new GPUVisual(canvas);
        scene.rotation = 1;
        scene.zoom = 1.4;
        scene.draw(.016);
        const before = JSON.stringify(scene.renderer.frame);
        scene.paused = true;
        scene.draw(0);
        assert.equal(JSON.stringify(scene.renderer.frame), before);
        scene.paused = false;
        const time = scene.orbitTime;
        canvas.dispatchEvent(event('keydown', { key: 'Enter' }));
        scene.advance(.016);
        if (kind === 'orbit')
            assert.equal(scene.orbitTime, time);
        scene.dispose();
    }
});
test('actual Three scene factories produce finite geometry and release every geometry', () => {
    for (const [file, factory] of [['orbit', 'createOrbit'], ['tunnel', 'createTunnel']]) {
        const { exports } = load('../src/lib/visuals/' + file + '.ts', { 'three': THREE, './types': { disposeScene } }), study = exports[factory]();
        const geometries: THREE.BufferGeometry[] = [];
        study.scene.traverse((object: THREE.Object3D) => { const geometry = (object as THREE.Mesh).geometry; if (geometry)
            geometries.push(geometry); });
        assert.ok(geometries.length > 0);
        let released = 0;
        for (const geometry of geometries) {
            geometry.addEventListener('dispose', () => released++);
            for (const attribute of Object.values(geometry.attributes))
                assert.ok(Array.from(attribute.array).every(Number.isFinite));
        }
        study.resize(800, 600);
        study.update({ time: 100, dt: .016, preset: 1, palette: 2, detail: file === 'orbit' ? 1.8 : 80, strength: 1, light: .7, x: .3, y: -.2, rotation: 1, tilt: .1, zoom: 1, phase: 100, velocity: .64, preview: false, quality: 1 });
        assert.ok(study.camera.projectionMatrix.elements.every(Number.isFinite));
        study.dispose();
        assert.equal(released, geometries.length);
    }
});
test('warp star quads remain front-facing for every trail direction and length', () => {
    const { exports } = load('../src/lib/visuals/tunnel.ts', { 'three': THREE, './types': { disposeScene } });
    const study = exports.createTunnel();
    const mesh = study.scene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
    assert.equal(mesh.material.side, THREE.FrontSide);
    // Read the actual shader basis instead of testing a duplicated implementation.
    const basis = mesh.material.vertexShader.match(/vec2 (?:across|normal)=vec2\((-?direction\.[xy]),(-?direction\.[xy])\)/);
    assert.ok(basis, 'Expected a screen-space perpendicular basis in the vertex shader');
    const component = (expression: string, x: number, y: number) => (expression.startsWith('-') ? -1 : 1) * (expression.endsWith('x') ? x : y);
    const positions = mesh.geometry.getAttribute('position'), indices = mesh.geometry.getIndex()!;
    for (let angle = 0; angle < Math.PI * 2; angle += .1) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const ax = component(basis[1], dx, dy), ay = component(basis[2], dx, dy);
        for (const length of [1, 5, 45]) {
            const vertices = Array.from({ length: positions.count }, (_, i) => [ax * positions.getX(i) + dx * positions.getY(i) * length, ay * positions.getX(i) + dy * positions.getY(i) * length]);
            for (let i = 0; i < indices.count; i += 3) {
                const [a, b, c] = [0, 1, 2].map(offset => vertices[indices.getX(i + offset)]);
                const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
                assert.ok(area > 0, 'Clockwise triangles would be culled and make the tunnel blank');
            }
        }
    }
    study.dispose();
});
test('round state cannot restart after ending and suspend does not start ready games', () => {
    const seen: string[] = [], state = states.createGameState(s => seen.push(s));
    state.suspend();
    assert.equal(state.value, 'ready');
    state.start();
    state.suspend();
    assert.equal(state.value, 'paused');
    state.pause();
    assert.equal(state.value, 'running');
    state.end();
    state.start();
    state.pause();
    assert.equal(state.value, 'ended');
    assert.deepEqual(seen, ['running', 'paused', 'running', 'ended']);
});
test('saved puzzles validate odd/even parity as well as permutation integrity', () => {
    for (const size of [3, 4]) {
        const solved = Array.from({ length: size * size }, (_, i) => (i + 1) % (size * size));
        assert.equal(states.validPuzzle(solved, size), true);
        [solved[0], solved[1]] = [solved[1], solved[0]];
        assert.equal(states.validPuzzle(solved, size), false);
        for (let i = 0; i < 20; i++)
            assert.equal(states.validPuzzle(rules.newPuzzle(size), size), true);
    }
    assert.equal(states.validPuzzle(Array(9).fill(0), 3), false);
    assert.equal(states.validPuzzle(null, 3), false);
});
test('best time and move records minimize values and reject corrupt candidates', () => {
    assert.equal(states.betterRecord(null, 100), 100);
    assert.equal(states.betterRecord(100, 90), 90);
    assert.equal(states.betterRecord(100, 120), 100);
    assert.equal(states.betterRecord(NaN, 80), 80);
    assert.equal(states.betterRecord(100, Infinity), null);
});
test('result edits invalidate copying and reject superseded async responses', () => {
    const state = createResultState(), first = state.revision;
    state.accept('old result');
    assert.equal(state.text, 'old result');
    state.invalidate();
    assert.equal(state.text, '');
    assert.equal(state.accept('stale worker response', first), false);
    const second = state.revision;
    assert.equal(state.accept('current result', second), true);
    assert.equal(state.text, 'current result');
});
test('breakout supports held keys, key release, and stops painting while paused', () => {
    let callback: ((time: number) => void) | undefined;
    const frames = { requestAnimationFrame: (cb: (time: number) => void) => { callback = cb; return 1; }, cancelAnimationFrame: () => { callback = undefined; } };
    const { exports: { createGame } } = load('../src/scripts/games/realtime.ts', { '../../lib/game-state': states, '../../lib/arcade-rules': rules, '../../lib/game-runtime': { extraButton() { } } }, frames);
    const canvas = new Element(), root = new Element(), seen: string[] = [];
    const controller = createGame({ canvas, root, surface: new Element(), mode: 0, slug: 'breakout', signal: new AbortController().signal, setState: (s: string) => seen.push(s), setScore() { }, setStatus() { }, finish() { }, setRules() { } });
    const paddle = () => canvas.calls.filter(call => call.name === 'roundRect' && call.args[2] === 96).at(-1)!.args[0] as number;
    callback!(100);
    const initial = paddle();
    controller.key('Enter');
    controller.key('ArrowRight');
    for (let t = 116; t < 400; t += 16)
        callback!(t);
    assert.ok(paddle() > initial);
    controller.keyUp('ArrowRight');
    const released = paddle();
    for (let t = 400; t < 500; t += 16)
        callback!(t);
    assert.equal(paddle(), released);
    controller.pause();
    callback!(516);
    const count = canvas.calls.length;
    callback!(532);
    callback!(548);
    assert.equal(canvas.calls.length, count);
    assert.equal(seen.at(-1), 'paused');
    controller.dispose();
    assert.equal(callback, undefined);
});
