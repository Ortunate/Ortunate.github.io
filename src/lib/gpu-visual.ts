import { StudyRenderer } from './visual-webgl';
import { advanceWarp, newWarpMotion, smooth } from './motion';
import { defaults } from './visual-engine';
import type { VisualOptions } from './visual-engine';
/** Input targets, simulation, and painting are separate so still frames stay still. */
export class GPUVisual {
    kind: string;
    preview: boolean;
    options: VisualOptions;
    visible = false;
    paused = false;
    dirty = true;
    fallback = false;
    quality = 1;
    lastDraw = 0;
    slowFrames = 0;
    width = 1;
    height = 1;
    time = 0;
    orbitTime = 0;
    rotation = 0;
    tilt = 0;
    zoom = 1;
    pointer = { x: .5, y: .5, down: false, active: false };
    tour = true;
    warp = newWarpMotion();
    impulseUntil = 0;
    view = { rotation: 0, tilt: 0, zoom: 1, detail: 8, light: .7, preset: 0 };
    transition = 0;
    pendingPreset = 0;
    renderer?: StudyRenderer;
    fallbackCanvas?: HTMLCanvasElement;
    abort = new AbortController();
    observer: ResizeObserver;
    pointers = new Map<number, {
        x: number;
        y: number;
    }>();
    keys = new Set<string>();
    constructor(public canvas: HTMLCanvasElement) {
        this.kind = canvas.dataset.visual!;
        this.preview = canvas.hasAttribute('data-preview');
        this.options = { preset: 0, palette: 0, speed: 1, strength: 1, detail: defaults[this.kind], force: 1, light: .7 };
        this.view.detail = this.options.detail;
        try {
            this.renderer = new StudyRenderer(canvas, this.kind, this.preview);
        }
        catch {
            this.showFallback();
        }
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
        this.resize();
        const signal = this.abort.signal, host = this.preview ? canvas.parentElement! : canvas;
        const point = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
        host.addEventListener('pointerdown', e => {
            const p = point(e);
            this.pointer = { ...p, down: true, active: true };
            this.pointers.set(e.pointerId, p);
            if (!this.preview) {
                canvas.focus({ preventScroll: true });
                canvas.setPointerCapture(e.pointerId);
            }
            if (this.kind === 'tunnel')
                this.impulseUntil = this.time + .35;
            else if (this.kind === 'fractal')
                this.tour = false;
            this.dirty = true;
        }, { signal });
        host.addEventListener('pointermove', e => {
            const p = point(e), previous = this.pointers.get(e.pointerId);
            if (previous && !this.preview) {
                if (this.pointers.size === 2) {
                    const other = [...this.pointers.entries()].find(([id]) => id !== e.pointerId)![1];
                    const before = Math.hypot(previous.x - other.x, previous.y - other.y), after = Math.hypot(p.x - other.x, p.y - other.y);
                    if (before > .01)
                        this.changeZoom(after / before);
                }
                else if (this.kind !== 'tunnel') {
                    this.rotation += (p.x - previous.x) * 4 * this.options.strength;
                    this.tilt += (p.y - previous.y) * 2 * this.options.strength;
                    this.tilt = Math.max(-1.3, Math.min(.9, this.tilt));
                }
                this.pointers.set(e.pointerId, p);
            }
            Object.assign(this.pointer, p, { active: true });
            this.syncStaticCamera();
            this.dirty = true;
        }, { signal });
        const release = (e: PointerEvent) => { this.pointers.delete(e.pointerId); this.pointer.down = this.pointers.size > 0; };
        host.addEventListener('pointerup', release, { signal });
        host.addEventListener('pointercancel', release, { signal });
        host.addEventListener('lostpointercapture', release, { signal });
        host.addEventListener('pointerleave', () => {
            if (!this.pointer.down)
                this.pointer.active = false;
        }, { signal });
        if (!this.preview) {
            canvas.addEventListener('wheel', e => {
                if (this.kind === 'tunnel')
                    return;
                e.preventDefault();
                this.changeZoom(Math.exp(-e.deltaY * .001));
            }, { passive: false, signal });
            canvas.addEventListener('keydown', e => {
                if (e.ctrlKey || e.altKey || e.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'r', 'R', '+', '=', '-'].includes(e.key))
                    return;
                e.preventDefault();
                this.keys.add(e.key);
                if (e.key === ' ' && !e.repeat)
                    this.paused = !this.paused;
                if (e.key === 'Enter' && !e.repeat) {
                    if (this.kind === 'fractal')
                        this.tour = !this.tour;
                    else if (this.kind === 'tunnel')
                        this.impulseUntil = this.time + .35;
                    else
                        this.tour = !this.tour;
                }
                if (e.key.toLowerCase() === 'r')
                    this.reset();
                if (e.key === '+' || e.key === '=')
                    this.changeZoom(1.1);
                if (e.key === '-')
                    this.changeZoom(1 / 1.1);
                // Keyboard exploration also works in reduced motion.
                if (this.paused || document.documentElement.dataset.motion === 'reduced')
                    this.steer(.08);
                if (e.key !== ' ')
                    this.syncStaticCamera();
                this.dirty = true;
                canvas.dispatchEvent(new Event('scenechange'));
            }, { signal });
            canvas.addEventListener('keyup', e => this.keys.delete(e.key), { signal });
            canvas.addEventListener('blur', () => this.releaseInput(), { signal });
        }
        document.addEventListener('visibilitychange', () => { this.releaseInput(); this.lastDraw = 0; }, { signal });
        canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.showFallback(); }, { signal });
        canvas.addEventListener('webglcontextrestored', () => {
            this.renderer?.dispose();
            try {
                this.renderer = new StudyRenderer(canvas, this.kind, this.preview);
                this.fallback = false;
                this.fallbackCanvas?.remove();
                this.fallbackCanvas = undefined;
                this.dirty = true;
            }
            catch {
                this.showFallback();
            }
        }, { signal });
    }
    releaseInput() { this.keys.clear(); this.pointer.down = false; this.pointers.clear(); }
    syncStaticCamera() {
        if (!this.paused && document.documentElement.dataset.motion !== 'reduced')
            return;
        Object.assign(this.view, { rotation: this.rotation, tilt: this.tilt, zoom: this.zoom, detail: this.options.detail, light: this.options.light, preset: this.options.preset });
        if (this.pointer.active) {
            this.warp.x = this.pointer.x;
            this.warp.y = this.pointer.y;
        }
        this.transition = 0;
    }
    steer(dt: number) {
        const x = Number(this.keys.has('ArrowRight')) - Number(this.keys.has('ArrowLeft')), y = Number(this.keys.has('ArrowDown')) - Number(this.keys.has('ArrowUp'));
        if (this.kind === 'tunnel') {
            if (x || y) {
                this.pointer.active = true;
                this.pointer.x = Math.max(0, Math.min(1, this.pointer.x + x * dt * .5));
                this.pointer.y = Math.max(0, Math.min(1, this.pointer.y + y * dt * .5));
            }
        }
        else {
            this.rotation += x * dt;
            this.tilt = Math.max(-1.3, Math.min(.9, this.tilt + y * dt));
            if (x || y)
                this.tour = false;
        }
    }
    changeZoom(factor: number) {
        if (this.kind === 'tunnel')
            return;
        this.zoom = Math.max(.6, Math.min(this.kind === 'fractal' ? 1.45 : 2.6, this.zoom * factor));
        this.syncStaticCamera();
        this.dirty = true;
    }
    resize() {
        const r = this.canvas.getBoundingClientRect(), ratio = this.preview ? 1 : Math.min(devicePixelRatio, 1.7) * this.quality;
        this.width = Math.max(1, Math.round(r.width * ratio));
        this.height = Math.max(1, Math.round(r.height * ratio));
        if (this.preview) {
            this.canvas.width = this.width;
            this.canvas.height = this.height;
        }
        this.dirty = true;
    }
    update(values: Partial<VisualOptions>) {
        if (values.preset !== undefined && values.preset !== this.options.preset) {
            this.pendingPreset = values.preset;
            this.transition = 1;
        }
        Object.assign(this.options, values);
        this.syncStaticCamera();
        this.dirty = true;
    }
    reset() { this.time = this.orbitTime = this.impulseUntil = 0; this.rotation = this.tilt = 0; this.zoom = 1; this.warp = newWarpMotion(); this.view = { rotation: 0, tilt: 0, zoom: 1, detail: this.options.detail, light: this.options.light, preset: this.options.preset }; this.transition = 0; this.tour = true; this.releaseInput(); this.dirty = true; }
    advance(dt: number) {
        if (dt <= 0)
            return;
        this.steer(dt);
        this.time += dt * this.options.speed;
        if (this.tour && this.kind === 'orbit')
            this.orbitTime += dt * this.options.speed;
        if (this.tour && this.kind === 'fractal')
            this.rotation += dt * this.options.speed * .065;
        this.warp = advanceWarp(this.warp, dt * this.options.speed, this.pointer.down || this.keys.has('Enter') || this.time < this.impulseUntil, this.pointer.active ? this.pointer.x : .5, this.pointer.active ? this.pointer.y : .5);
        for (const key of ['rotation', 'tilt', 'zoom'] as const)
            this.view[key] = smooth(this.view[key], this[key], dt, 8);
        this.view.detail = smooth(this.view.detail, this.options.detail, dt, 5);
        this.view.light = smooth(this.view.light, this.options.light, dt, 5);
        if (this.transition > 0) {
            this.transition = Math.max(0, this.transition - dt * 2);
            if (this.transition <= .5)
                this.view.preset = this.pendingPreset;
        }
    }
    draw(dt: number) { this.advance(dt); this.render(); }
    render() {
        if (this.fallback)
            return;
        const v = this.view;
        try {
            this.renderer?.render(this.width, this.height, { ...this.options, ...v, time: this.kind === 'orbit' ? this.orbitTime : this.time, dt: 0, x: (this.warp.x - .5) * this.options.strength, y: (this.warp.y - .5) * this.options.strength, phase: this.warp.phase, velocity: this.warp.speed, preview: this.preview, quality: this.quality });
            this.canvas.style.opacity = this.transition > 0 ? String(Math.abs(this.transition - .5) * 2) : '1';
        }
        catch {
            this.showFallback();
        }
    }
    showFallback() {
        this.fallback = true;
        this.canvas.style.opacity = '1';
        const fallback = this.fallbackCanvas ?? document.createElement('canvas');
        this.fallbackCanvas = fallback;
        fallback.width = 600;
        fallback.height = 400;
        fallback.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
        fallback.setAttribute('aria-hidden', 'true');
        this.canvas.parentElement?.appendChild(fallback);
        const ctx = fallback.getContext('2d')!;
        ctx.fillStyle = '#090c15';
        ctx.fillRect(0, 0, 600, 400);
        ctx.strokeStyle = '#8b94a9';
        if (this.kind === 'fractal') {
            const triangle = (x: number, y: number, size: number, depth: number) => {
                if (depth === 0) {
                    ctx.beginPath();
                    ctx.moveTo(x, y - size);
                    ctx.lineTo(x - size * .86, y + size * .5);
                    ctx.lineTo(x + size * .86, y + size * .5);
                    ctx.closePath();
                    ctx.stroke();
                    return;
                }
                triangle(x, y - size * .5, size * .5, depth - 1);
                triangle(x - size * .43, y + size * .25, size * .5, depth - 1);
                triangle(x + size * .43, y + size * .25, size * .5, depth - 1);
            };
            triangle(300, 190, 130, 4);
        }
        else if (this.kind === 'tunnel') {
            for (let i = 0; i < 200; i++) {
                const a = i * 2.39996, r = 15 + (i * 73 % 250);
                ctx.fillStyle = 'rgba(195,210,230,' + (.2 + i % 8 * .08) + ')';
                ctx.fillRect(300 + Math.cos(a) * r, 190 + Math.sin(a) * r, .8 + i % 2, .8 + i % 2);
            }
        }
        else {
            ctx.beginPath();
            ctx.ellipse(300, 190, 130, 42, -.35, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(300, 190, 65, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.fillStyle = '#aeb7c9';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WebGL unavailable · static ' + (this.kind === 'fractal' ? 'Sierpiński study' : this.kind === 'tunnel' ? 'star field' : 'orbital study'), 300, 360);
        this.canvas.dispatchEvent(new Event('scenechange'));
    }
    exportCanvas() { return this.fallbackCanvas ?? this.canvas; }
    dispose() { this.abort.abort(); this.observer.disconnect(); this.renderer?.dispose(); this.fallbackCanvas?.remove(); this.releaseInput(); }
}
