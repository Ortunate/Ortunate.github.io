import { advanceField, influence, gravityCenters } from './visual-simulation';
export interface VisualOptions {
    preset: number;
    palette: number;
    speed: number;
    strength: number;
    detail: number;
    force: number;
    light: number;
}
export const defaults: Record<string, number> = { orbit: 1.8, ribbons: 8, repulsion: 24, gravity: 550, flow: 26, ripple: 30, aurora: 7, fractal: 8, kaleidoscope: 8, mesh: 20, flock: 85, tunnel: 80 };
export const guides: Record<string, string> = { orbit: 'Drag or use arrows to orbit. Scroll or + / − to zoom. Enter toggles the slow rotation.', ribbons: 'Move to weave luminous ribbons. Click to release a burst. Neon sharpens the trails; Silk lets them breathe.', repulsion: 'The field makes room for your pointer, then springs home. Switch behavior to pull the points toward you.', gravity: 'Click to place a well. Binary adds a second orbiting source. Switch behavior to reverse gravity.', flow: 'Move across the currents to bend them. Click to scatter new streams. Wind creates faster, straighter motion.', ripple: 'Click to drop a wave. Drag to trace overlapping ripples. Liquid metal turns the water into a reflective field.', aurora: 'Move to change the wind and the height of the curtains. Click to release a brighter gust.', fractal: 'Drag or use arrows to orbit the sculpture. Scroll, pinch or + / − to zoom. Enter toggles the slow camera tour. Adjust complexity and the light to explore its surface.', kaleidoscope: 'Draw with your pointer to create symmetrical trails. Change symmetry to fold the image into more reflections.', mesh: 'Drag to stretch the mesh, then release and watch it settle. Change pointer behavior to push the surface away.', flock: 'Move to lead the flock or make it scatter. Click to turn the flock around. Each creature steers around its neighbors.', tunnel: 'Move or use arrows to steer through deep space. Hold the canvas or Enter to accelerate; release to ease back into cruise. Tap for a short boost. Dust Passage flies through a denser band of stars.' };
type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ox: number;
    oy: number;
};
type Wave = {
    x: number;
    y: number;
    t: number;
};
const TAU = Math.PI * 2;
export class VisualScene {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    kind: string;
    preview: boolean;
    options: VisualOptions;
    time = 0;
    visible = false;
    paused = false;
    dirty = true;
    width = 0;
    height = 0;
    quality = 1;
    pointer = { x: .5, y: .5, active: false, down: false };
    particles: Particle[] = [];
    trail: {
        x: number;
        y: number;
    }[] = [];
    waves: Wave[] = [];
    wells: {
        x: number;
        y: number;
    }[] = [];
    lastDraw = 0;
    slowFrames = 0;
    abort = new AbortController();
    observer: ResizeObserver;
    fallback = false;
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.kind = canvas.dataset.visual!;
        this.preview = canvas.hasAttribute('data-preview');
        this.options = { preset: 0, palette: 0, speed: 1, strength: 1, detail: defaults[this.kind], force: this.kind === 'repulsion' ? -1 : 1, light: .7 };
        this.observer = new ResizeObserver(() => this.resize());
        this.observer.observe(canvas);
        this.resize();
        const signal = this.abort.signal;
        const host = this.preview ? canvas.parentElement! : canvas;
        host.addEventListener('pointermove', e => {
            const r = canvas.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
            this.pointer.x = x;
            this.pointer.y = y;
            this.pointer.active = true;
            this.dirty = true;
            if (this.pointer.down && this.kind === 'ripple' && this.time - (this.waves.at(-1)?.t ?? -1) > .08)
                this.impulse();
        }, { signal });
        host.addEventListener('pointerdown', e => {
            this.pointer.down = true;
            const r = canvas.getBoundingClientRect();
            this.pointer.x = (e.clientX - r.left) / r.width;
            this.pointer.y = (e.clientY - r.top) / r.height;
            this.pointer.active = true;
            if (!this.preview) {
                canvas.focus({ preventScroll: true });
                canvas.setPointerCapture(e.pointerId);
            }
            this.impulse();
        }, { signal });
        host.addEventListener('pointerup', () => { this.pointer.down = false; }, { signal });
        host.addEventListener('pointercancel', () => { this.pointer.down = false; }, { signal });
        host.addEventListener('lostpointercapture', () => { this.pointer.down = false; }, { signal });
        document.addEventListener('visibilitychange', () => { this.pointer.down = false; this.lastDraw = 0; }, { signal });
        host.addEventListener('pointerleave', () => {
            if (!this.pointer.down)
                this.pointer.active = false;
        }, { signal });
        if (!this.preview) {
            canvas.addEventListener('keydown', e => {
                if (e.ctrlKey || e.metaKey || e.altKey)
                    return;
                const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'r', 'R'];
                if (!keys.includes(e.key))
                    return;
                e.preventDefault();
                this.pointer.active = true;
                if (e.key === 'ArrowLeft')
                    this.pointer.x = Math.max(0, this.pointer.x - .04);
                if (e.key === 'ArrowRight')
                    this.pointer.x = Math.min(1, this.pointer.x + .04);
                if (e.key === 'ArrowUp')
                    this.pointer.y = Math.max(0, this.pointer.y - .04);
                if (e.key === 'ArrowDown')
                    this.pointer.y = Math.min(1, this.pointer.y + .04);
                if (e.key === 'Enter') {
                    this.pointer.down = true;
                    if (!e.repeat)
                        this.impulse();
                }
                if (e.key === ' ' && !e.repeat)
                    this.paused = !this.paused;
                if (e.key.toLowerCase() === 'r')
                    this.reset();
                this.dirty = true;
                canvas.dispatchEvent(new Event('scenechange'));
            }, { signal });
            canvas.addEventListener('keyup', e => {
                if (e.key === 'Enter')
                    this.pointer.down = false;
            }, { signal });
            canvas.addEventListener('blur', () => { this.pointer.down = false; }, { signal });
        }
        else {
            const link = canvas.closest('a');
            link?.addEventListener('focus', () => { this.pointer.active = true; this.pointer.x = .65; this.dirty = true; }, { signal });
            link?.addEventListener('blur', () => { this.pointer.active = false; }, { signal });
        }
    }
    resize() {
        const r = this.canvas.getBoundingClientRect();
        const ratio = this.preview ? 1 : Math.min(devicePixelRatio, 1.7) * this.quality;
        const previousWidth = this.width, previousHeight = this.height;
        this.width = Math.max(1, Math.round(r.width * ratio));
        this.height = Math.max(1, Math.round(r.height * ratio));
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        if (previousWidth <= 1 || previousHeight <= 1) {
            this.reset();
            return;
        }
        const sx = this.width / previousWidth, sy = this.height / previousHeight;
        this.particles.forEach(p => { p.x *= sx; p.ox *= sx; p.y *= sy; p.oy *= sy; });
        this.trail.forEach(p => { p.x *= sx; p.y *= sy; });
        this.dirty = true;
    }
    reset() {
        this.time = 0;
        this.trail = [];
        this.waves = [];
        this.wells = [];
        this.particles = [];
        this.rebuildParticles();
        if (this.kind === 'ribbons')
            this.trail = Array.from({ length: 50 }, (_, i) => ({ x: this.width * (.3 + i * .007), y: this.height * (.5 + Math.sin(i * .07) * .15) }));
        this.ctx.fillStyle = '#090c15';
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.impulse();
        this.dirty = true;
    }
    rebuildParticles() {
        const previous = this.particles;
        this.particles = [];
        const w = this.width, h = this.height, n = this.preview ? Math.min(180, this.options.detail) : this.options.detail;
        if (this.kind === 'repulsion' || this.kind === 'mesh') {
            const cols = Math.round(this.options.detail), rows = Math.max(8, Math.round(cols * h / w));
            for (let y = 0; y <= rows; y++)
                for (let x = 0; x <= cols; x++) {
                    const ox = w * (.06 + x / cols * .88), oy = h * (.12 + y / rows * .76);
                    if (this.kind === 'repulsion' && this.options.preset && !(Math.abs(Math.hypot((x / cols - .5) * 1.5, (y / rows - .5)) - .3) < .055 || x / cols > .8 && y / rows > .7))
                        continue;
                    this.particles.push({ x: ox, y: oy, ox, oy, vx: 0, vy: 0 });
                }
        }
        else {
            const count = this.kind === 'gravity' ? n : this.kind === 'flock' ? n : this.kind === 'flow' ? (this.preview ? 160 : 520) : 100;
            for (let i = 0; i < count; i++) {
                const x = Math.random() * w, y = Math.random() * h;
                this.particles.push({ x, y, ox: x, oy: y, vx: (Math.random() - .5) * 2, vy: (Math.random() - .5) * 2 });
            }
        }
        if (this.kind === 'gravity' || this.kind === 'flock')
            this.particles = this.particles.map((p, i) => previous[i] ?? p);
    }
    update(values: Partial<VisualOptions>) {
        const structural = (values.detail !== undefined && ['repulsion', 'mesh', 'gravity', 'flock'].includes(this.kind)) || (values.preset !== undefined && this.kind === 'repulsion');
        Object.assign(this.options, values);
        if (structural)
            this.rebuildParticles();
        this.dirty = true;
    }
    impulse() {
        this.waves.push({ x: this.pointer.x, y: this.pointer.y, t: this.time });
        if (this.kind === 'flow')
            this.particles.forEach(p => { p.x = Math.random() * this.width; p.y = Math.random() * this.height; });
        if (this.waves.length > 12)
            this.waves.shift();
        if (this.kind === 'gravity') {
            this.wells = [{ x: this.pointer.x, y: this.pointer.y }];
        }
        if (this.kind === 'flock')
            this.particles.forEach(p => { p.vx *= -1; p.vy *= -1; });
        this.dirty = true;
    }
    color(offset = 0, alpha = 1, light = 70) { const hue = [258, 25, 160, 330][this.options.palette] + offset; return `hsla(${hue},72%,${light}%,${alpha})`; }
    advance(dt: number) { advanceField(this, dt); }
    draw(dt: number) { this.advance(dt); this.render(); }
    render() {
        const c = this.ctx, w = this.width, h = this.height, o = this.options, t = this.time;
        const { x: px, y: py } = influence(this);
        const min = Math.min(w, h);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
        c.shadowBlur = 0;
        const trailKinds = ['flow', 'gravity', 'kaleidoscope', 'ribbons'];
        c.fillStyle = trailKinds.includes(this.kind) ? 'rgba(9,12,21,.16)' : '#090c15';
        c.fillRect(0, 0, w, h);
        if (this.kind === 'ribbons') {
            c.globalCompositeOperation = 'lighter';
            for (let j = 0; j < o.detail; j++) {
                c.beginPath();
                this.trail.forEach((p, i) => {
                    const offset = Math.sin(i * .12 + t * 2 + j * .6) * (j + 1) * 2 * o.strength;
                    const x = p.x + offset, y = p.y + Math.cos(i * .1 + j * .4 + t) * offset;
                    if (i === 0)
                        c.moveTo(x, y);
                    else
                        c.lineTo(x, y);
                });
                c.strokeStyle = this.color(j * 5, .38);
                c.lineWidth = o.preset ? 1.2 : Math.max(1, (o.detail - j) * .65);
                c.shadowColor = this.color(j * 5);
                c.shadowBlur = this.preview ? 0 : 12;
                c.stroke();
            }
            this.energyRings(c, w, h, t);
        }
        if (this.kind === 'repulsion' || this.kind === 'mesh') {
            const cols = Math.round(o.detail) + 1;
            const radius = min * .24 * o.strength;
            c.lineWidth = .7;
            this.particles.forEach((p, i) => {
                const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy) || 1;
                const proximity = Math.max(0, 1 - d / radius);
                c.fillStyle = this.color(proximity * 60, .4 + proximity * .6);
                if (this.kind === 'mesh') {
                    c.strokeStyle = this.color((p.x / w) * 50, .25 + proximity * .6);
                    for (const next of [i % cols < cols - 1 ? this.particles[i + 1] : undefined, this.particles[i + cols]])
                        if (next) {
                            c.beginPath();
                            c.moveTo(p.x, p.y);
                            c.lineTo(next.x, next.y);
                            c.stroke();
                        }
                }
                c.beginPath();
                c.arc(p.x, p.y, this.kind === 'mesh' ? 1 : 1.3 + proximity * 2, 0, TAU);
                c.fill();
            });
        }
        if (this.kind === 'gravity') {
            const centers = gravityCenters(this);
            c.globalCompositeOperation = 'lighter';
            for (const p of this.particles) {
                const speed = Math.hypot(p.vx, p.vy);
                c.strokeStyle = this.color(speed * 12, .5);
                c.lineWidth = 1;
                c.beginPath();
                c.moveTo(p.ox, p.oy);
                c.lineTo(p.x, p.y);
                c.stroke();
            }
            centers.forEach(center => { const g = c.createRadialGradient(center.x, center.y, 0, center.x, center.y, min * .12); g.addColorStop(0, this.color(40, .5)); g.addColorStop(.13, this.color(0, .15)); g.addColorStop(1, this.color(0, 0)); c.fillStyle = g; c.fillRect(center.x - min * .12, center.y - min * .12, min * .24, min * .24); });
        }
        if (this.kind === 'flow') {
            c.globalCompositeOperation = 'lighter';
            for (const p of this.particles) {
                c.strokeStyle = this.color(p.x / w * 70, .27);
                c.lineWidth = o.preset ? .65 : 1.2;
                c.beginPath();
                c.moveTo(p.ox, p.oy);
                c.lineTo(p.x, p.y);
                c.stroke();
            }
        }
        if (this.kind === 'ripple') {
            const gap = this.preview ? 7 : 5;
            for (let y = 0; y < h; y += gap) {
                c.beginPath();
                for (let x = 0; x <= w; x += gap) {
                    let z = 0;
                    for (const wave of this.waves) {
                        const age = t - wave.t;
                        if (age > 7)
                            continue;
                        const d = Math.hypot(x - wave.x * w, y - wave.y * h) / min;
                        z += Math.sin(d * o.detail - age * 5) * Math.exp(-Math.pow(d - age * .15, 2) * 35) * Math.exp(-age * .5) * 9 * o.strength;
                    }
                    const yy = y + z;
                    if (x === 0)
                        c.moveTo(x, yy);
                    else
                        c.lineTo(x, yy);
                }
                c.strokeStyle = o.preset ? `rgba(${150 + Math.round(y / h * 80)},${170 + Math.round(y / h * 60)},230,.5)` : this.color(y / h * 60, .35);
                c.lineWidth = o.preset ? 1.3 : .8;
                c.stroke();
            }
        }
        if (this.kind === 'aurora') {
            c.globalCompositeOperation = 'lighter';
            for (let layer = 0; layer < o.detail; layer++) {
                const base = h * (.25 + layer / o.detail * .42);
                c.beginPath();
                for (let x = 0; x <= w; x += 5) {
                    const y = base + Math.sin(x / w * 5 + t * .35 + layer * .5) * h * .13 + Math.sin(x / w * 12 - t * .23 + layer) * h * .04 + (py / h - .5) * o.strength * h * .2 * Math.sin(x / w * Math.PI);
                    if (x === 0)
                        c.moveTo(x, y);
                    else
                        c.lineTo(x, y);
                }
                for (let x = w; x >= 0; x -= 5) {
                    const y = base + Math.sin(x / w * 5 + t * .35 + layer * .5) * h * .13 + Math.sin(x / w * 12 - t * .23 + layer) * h * .04 + (py / h - .5) * o.strength * h * .2 * Math.sin(x / w * Math.PI) + (o.preset ? 8 : h * .25);
                    c.lineTo(x, y);
                }
                c.closePath();
                const g = c.createLinearGradient(0, base - h * .2, 0, base + h * .4);
                g.addColorStop(0, this.color(layer * 12, 0));
                g.addColorStop(.4, this.color(layer * 12, .15));
                g.addColorStop(1, this.color(layer * 12, 0));
                c.fillStyle = g;
                c.fill();
                c.strokeStyle = this.color(layer * 12, .13);
                c.lineWidth = 1;
                c.stroke();
            }
            this.stars(c, w, h, t);
        }
        if (this.kind === 'kaleidoscope') {
            c.save();
            c.translate(w / 2, h / 2);
            c.globalCompositeOperation = 'lighter';
            const x = (px - w / 2) * .85, y = (py - h / 2) * .85;
            const last = this.trail[1] ?? { x, y };
            for (let j = 0; j < o.detail; j++) {
                c.save();
                c.rotate(j * TAU / o.detail + t * .025);
                for (const sign of [-1, 1]) {
                    c.save();
                    c.scale(1, sign);
                    c.beginPath();
                    c.moveTo(last.x, last.y);
                    if (o.preset)
                        c.quadraticCurveTo(-y, x, x, y);
                    else
                        c.lineTo(x, y);
                    c.strokeStyle = this.color(j * 10, .55);
                    c.lineWidth = o.preset ? 2 : 1.2;
                    c.shadowColor = this.color(j * 10);
                    c.shadowBlur = this.preview ? 0 : 8;
                    c.stroke();
                    c.restore();
                }
                c.restore();
            }
            c.restore();
        }
        if (this.kind === 'flock') {
            this.particles.forEach((p, i) => {
                c.save();
                c.translate(p.x, p.y);
                c.rotate(Math.atan2(p.vy, p.vx));
                c.strokeStyle = this.color(i / this.particles.length * 55, .8);
                c.fillStyle = this.color(i / this.particles.length * 55, .65);
                c.beginPath();
                if (o.preset) {
                    const flap = Math.sin(t * 8 + i) * 3;
                    c.moveTo(-4, -4 - flap);
                    c.lineTo(2, 0);
                    c.lineTo(-4, 4 + flap);
                    c.stroke();
                }
                else {
                    c.moveTo(5, 0);
                    c.lineTo(-4, -2);
                    c.lineTo(-2, 0);
                    c.lineTo(-4, 2);
                    c.closePath();
                    c.fill();
                }
                c.restore();
            });
        }
        if (this.kind === 'aurora' || this.kind === 'kaleidoscope' || this.kind === 'mesh' || this.kind === 'repulsion')
            this.energyRings(c, w, h, t);
        c.globalCompositeOperation = 'source-over';
        c.shadowBlur = 0;
        this.dirty = false;
    }
    stars(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
        for (let i = 0; i < 65; i++) {
            c.fillStyle = this.color(i, .15 + .25 * (1 + Math.sin(t + i)) * .5);
            c.fillRect((Math.sin(i * 127.1) * .5 + .5) * w, (Math.sin(i * 311.7) * .5 + .5) * h, 1, 1);
        }
    }
    energyRings(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
        for (const wave of this.waves) {
            const age = t - wave.t;
            if (age > 2)
                continue;
            c.beginPath();
            c.ellipse(w * wave.x, h * wave.y, Math.max(1, age * Math.min(w, h) * .4), Math.max(1, age * Math.min(w, h) * .15), -.35, 0, TAU);
            c.strokeStyle = this.color(30, Math.max(0, (1 - age / 2) * .4));
            c.lineWidth = 1;
            c.stroke();
        }
    }
    exportCanvas() { return this.canvas; }
    dispose() { this.abort.abort(); this.observer.disconnect(); this.particles = []; this.trail = []; }
}
