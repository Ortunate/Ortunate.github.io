import type { VisualOptions } from './visual-engine';
export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ox: number;
    oy: number;
}
interface Field {
    kind: string;
    options: VisualOptions;
    time: number;
    width: number;
    height: number;
    pointer: {
        x: number;
        y: number;
        active: boolean;
        down: boolean;
    };
    particles: Particle[];
    trail: {
        x: number;
        y: number;
    }[];
    waves: {
        x: number;
        y: number;
        t: number;
    }[];
    wells: {
        x: number;
        y: number;
    }[];
}
export function influence(s: Field) {
    const sign = ['repulsion', 'mesh', 'gravity', 'flock'].includes(s.kind) ? 1 : s.options.force;
    return { x: (s.pointer.active ? .5 + (s.pointer.x - .5) * sign : .5 + Math.sin(s.time * .65) * .3) * s.width, y: (s.pointer.active ? .5 + (s.pointer.y - .5) * sign : .5 + Math.cos(s.time * .47) * .25) * s.height };
}
export function gravityCenters(s: Field) {
    const centers = (s.wells.length ? s.wells : [{ x: .5, y: .5 }]).map(p => ({ x: p.x * s.width, y: p.y * s.height }));
    if (s.options.preset) {
        const radius = Math.min(s.width, s.height) * .25;
        centers.push({ x: s.width * .5 + Math.cos(s.time * .35) * radius, y: s.height * .5 + Math.sin(s.time * .35) * radius });
    }
    return centers;
}
/** All time-dependent state lives here; canvas painting is deliberately read-only. */
export function advanceField(s: Field, dt: number) {
    if (dt <= 0)
        return;
    const o = s.options, w = s.width, h = s.height, min = Math.min(w, h), frame = Math.min(dt * o.speed * 60, 2);
    s.time += dt * o.speed;
    const t = s.time, { x: px, y: py } = influence(s);
    s.waves = s.waves.filter(wave => t - wave.t < 7).slice(-12);
    if (s.kind === 'ribbons') {
        s.trail.unshift({ x: px, y: py });
        s.trail.length = Math.min(s.trail.length, 75);
    }
    if (s.kind === 'kaleidoscope') {
        s.trail.unshift({ x: (px - w / 2) * .85, y: (py - h / 2) * .85 });
        s.trail.length = Math.min(s.trail.length, 2);
    }
    if (s.kind === 'ripple' && !s.pointer.active && t - (s.waves.at(-1)?.t ?? 0) > 2.5) {
        s.waves.push({ x: .3 + Math.random() * .4, y: .3 + Math.random() * .4, t });
        s.waves = s.waves.slice(-12);
    }
    if (s.kind === 'repulsion' || s.kind === 'mesh') {
        const radius = min * .24 * o.strength;
        for (const p of s.particles) {
            const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy) || 1, force = Math.max(0, 1 - d / radius) * o.force * (s.kind === 'mesh' ? (s.pointer.down ? 6 : 1.5) : 3.5), hanging = s.kind === 'mesh' && o.preset ? Math.sin(p.ox / w * Math.PI) * h * .13 : 0;
            p.vx = (p.vx + ((p.ox - p.x) * .025 + dx / d * force) * frame) * Math.pow(.86, frame);
            p.vy = (p.vy + ((p.oy + hanging - p.y) * .025 + dy / d * force) * frame) * Math.pow(.86, frame);
            p.x += p.vx * frame;
            p.y += p.vy * frame;
        }
    }
    if (s.kind === 'gravity' || s.kind === 'flow') {
        const centers = gravityCenters(s);
        for (const p of s.particles) {
            p.ox = p.x;
            p.oy = p.y;
            if (s.kind === 'gravity') {
                for (const center of centers) {
                    const dx = center.x - p.x, dy = center.y - p.y, f = min * 2 * o.strength * o.force / (dx * dx + dy * dy + 300);
                    p.vx += dx * f * .015 * frame;
                    p.vy += dy * f * .015 * frame;
                }
                if (s.pointer.active) {
                    const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy) + 20;
                    p.vx += dx / d * .015 * o.force * frame;
                    p.vy += dy / d * .015 * o.force * frame;
                }
                if (Math.hypot(p.vx, p.vy) > 5) {
                    p.vx *= Math.pow(.98, frame);
                    p.vy *= Math.pow(.98, frame);
                }
            }
            else {
                const nx = p.x / w, ny = p.y / h, dx = px - p.x, dy = py - p.y, a = Math.sin(nx * o.detail * .3 + t * .2) + Math.cos(ny * o.detail * .3 - t * .15) + (o.preset ? -.6 : Math.sin((nx + ny) * 7 + t * .1)), strength = Math.exp(-Math.hypot(dx, dy) / min * 7) * o.strength * o.force, angle = a * 2 + Math.atan2(dy, dx) * strength;
                p.vx = Math.cos(angle) * (o.preset ? 3 : 1.7);
                p.vy = Math.sin(angle) * (o.preset ? 3 : 1.7);
            }
            p.x += p.vx * frame;
            p.y += p.vy * frame;
            if (p.x < 0 || p.x > w || p.y < 0 || p.y > h) {
                p.x = p.ox = Math.random() * w;
                p.y = p.oy = Math.random() * h;
                p.vx = (Math.random() - .5) * 2;
                p.vy = (Math.random() - .5) * 2;
            }
        }
    }
    if (s.kind === 'flock') {
        const next = s.particles.map(p => {
            let ax = 0, ay = 0, coX = 0, coY = 0, vx = 0, vy = 0, count = 0;
            for (const q of s.particles) {
                if (p === q)
                    continue;
                const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
                if (d < min * .18) {
                    coX += q.x;
                    coY += q.y;
                    vx += q.vx;
                    vy += q.vy;
                    count++;
                    if (d < 18 && d > 0) {
                        ax -= dx / d * .22;
                        ay -= dy / d * .22;
                    }
                }
            }
            if (count) {
                ax += (coX / count - p.x) * .0008 + (vx / count - p.vx) * .025;
                ay += (coY / count - p.y) * .0008 + (vy / count - p.vy) * .025;
            }
            const dx = px - p.x, dy = py - p.y, d = Math.hypot(dx, dy) || 1;
            return { ax: ax + dx / d * .03 * o.force * o.strength, ay: ay + dy / d * .03 * o.force * o.strength };
        });
        s.particles.forEach((p, i) => { p.vx += next[i].ax * frame; p.vy += next[i].ay * frame; const speed = Math.hypot(p.vx, p.vy) || 1, target = o.preset ? 2.5 : 1.8; p.vx = p.vx / speed * target; p.vy = p.vy / speed * target; p.x = (p.x + p.vx * frame + w) % w; p.y = (p.y + p.vy * frame + h) % h; });
    }
}
