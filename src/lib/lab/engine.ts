import { defaults, validateParams, type ModelId, type Params } from './definitions.ts';
import { Convolver } from './fft.ts';
import { orbium } from './orbium.ts';

export interface State { model: ModelId; version: 1; size: number; seed: number; rng: number; tick: number; time: number; params: Params; fields: Float32Array[]; change: number; reactions: number }
export interface Brush { x: number; y: number; radius: number; kind: string; rotation: number }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function kernelValue(r: number, p: Params) {
  const weights = [p.ring1, p.ring2, p.ring3];
  const rings = p.ring3 > 0 ? 3 : p.ring2 > 0 ? 2 : 1;
  if (r < 0 || r >= 1) return 0;
  const z = r * rings, f = z % 1;
  return weights[Math.floor(z)] * Math.pow(4 * f * (1 - f), 4);
}
export const growthValue = (u: number, p: Params) => 2 * Math.exp(-.5 * ((u - p.mu) / p.sigma) ** 2) - 1;
export function makeKernel(n: number, p: Params) { const k = new Float64Array(n * n); let sum = 0; for (let y = 0; y < n; y++)for (let x = 0; x < n; x++) { const r = Math.hypot(Math.min(x, n - x), Math.min(y, n - y)) / p.radius; sum += k[y * n + x] = kernelValue(r, p); } for (let i = 0; i < k.length; i++)k[i] /= sum; return k; }

/** Model version 1. All evolution, including random choices, is snapshot-owned. */
export class LabEngine {
  state: State; potential: Float32Array; growth: Float32Array;
  private convolver?: Convolver; private kernelKey = ''; private scratch: Float32Array[]; private moved: Uint8Array;
  constructor(model: ModelId, size = 128, seed = 1, preset = 0) {
    if (size < 8 || size > 256 || (size & (size - 1))) throw new Error('Invalid grid size.');
    this.state = { model, version: 1, size, seed: seed >>> 0, rng: seed >>> 0, tick: 0, time: 0, params: defaults(model), fields: Array.from({ length: model === 'reaction' ? 3 : model === 'sand' ? 2 : 1 }, () => new Float32Array(size * size)), change: 0, reactions: 0 };
    this.scratch = [new Float32Array(size * size), new Float32Array(size * size)]; this.moved = new Uint8Array(size * size); this.potential = new Float32Array(size * size); this.growth = new Float32Array(size * size);
    this.initialize(preset);
  }
  random() { let t = this.state.rng = (this.state.rng + 0x6d2b79f5) >>> 0; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  private initialize(preset: number) {
    const s = this.state, n = s.size, f = s.fields;
    if (s.model === 'reaction') {
      f[0].fill(1); if (preset === 1) Object.assign(s.params, { feed: .0367, kill: .0649 }); if (preset === 2) Object.assign(s.params, { feed: .03, kill: .057 });
      for (let k = 0; k < 18; k++)this.paint({ x: n * (.2 + .6 * this.random()), y: n * (.2 + .6 * this.random()), radius: Math.max(2, n / 40), kind: 'Seed', rotation: 0 });
    } else if (s.model === 'lenia') {
      if (preset === 2) { for (let y = n / 3 | 0; y < 2 * n / 3; y++)for (let x = n / 3 | 0; x < 2 * n / 3; x++)f[0][y * n + x] = this.random() * .6; }
      else { this.paint({ x: n / 2 - (preset === 1 ? 16 : 0), y: n / 2, radius: 10, kind: 'Orbium', rotation: 0 }); if (preset === 1) this.paint({ x: n / 2 + 16, y: n / 2, radius: 10, kind: 'Orbium', rotation: 180 }); }
    } else {
      for (let y = 0; y < n; y++)for (let x = 0; x < n; x++) {
        const u = x / n, v = y / n, i = y * n + x;
        if (preset === 0) { if (v > .18 && v < .75 && Math.abs(Math.abs(u - .5) - Math.abs(v - .47) * .85) < .012) f[0][i] = 3; else if (v > .2 && v < .43 && Math.abs(u - .5) < (.47 - v) * .85 - .025) f[0][i] = 1; }
        if (preset === 1) { if (v > .87 || (u > .55 && u < .58 && v > .35)) f[0][i] = 3; else if (u > .1 && u < .55 && v > .4 && v < .87) f[0][i] = 2; else if (u > .65 && u < .8 && v > .65 && v < .87) f[0][i] = 1; }
        if (preset === 2) { if (v > .88) f[0][i] = 3; else if (v > .5 && v < .88 && Math.floor(x / (n / 16)) % 2 === 0) f[0][i] = 4; else if (v > .83 && v < .87 && u > .45 && u < .55) { f[0][i] = 5; f[1][i] = 50; } }
      }
    }
  }
  setParams(params: Params) { validateParams(this.state.model, params); this.state.params = { ...params }; }
  snapshot(): State { return structuredClone(this.state); }
  restore(state: State) { if (state.model !== this.state.model || state.size !== this.state.size) throw new Error('Incompatible model/grid.'); this.state = structuredClone(state); this.kernelKey = ''; }
  static from(state: State) { const e = new LabEngine(state.model, state.size, state.seed); e.restore(state); return e; }
  paint(b: Brush) {
    const { size: n, fields: f, model } = this.state;
    if (model === 'lenia' && b.kind === 'Orbium') {
      const a = b.rotation * Math.PI / 180, scale = b.radius / 10;
      for (const c of orbium()) { const px = (c.x - 9.5) * scale, py = (c.y - 9.5) * scale, x = Math.round(b.x + px * Math.cos(a) - py * Math.sin(a)), y = Math.round(b.y + px * Math.sin(a) + py * Math.cos(a)); f[0][((y % n + n) % n) * n + (x % n + n) % n] = c.v; } return;
    }
    const material = ['Erase', 'Sand', 'Water', 'Stone', 'Wood', 'Fire', 'Steam', 'Smoke'].indexOf(b.kind);
    for (let y = Math.floor(b.y - b.radius); y <= b.y + b.radius; y++)for (let x = Math.floor(b.x - b.radius); x <= b.x + b.radius; x++) {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 > b.radius * b.radius) continue;
      if (model === 'sand' && (x < 0 || y < 0 || x >= n || y >= n)) continue;
      const i = ((y % n + n) % n) * n + (x % n + n) % n;
      if (model === 'reaction') { f[2][i] = b.kind === 'Barrier' ? 1 : 0; f[0][i] = b.kind === 'Seed' ? .5 : 1; f[1][i] = b.kind === 'Seed' ? 1 : 0; }
      else if (model === 'sand') { f[0][i] = Math.max(0, material); f[1][i] = material >= 5 ? 60 : 0; }
      else f[0][i] = b.kind === 'Erase' ? 0 : .8;
    }
  }
  step(count = 1) { for (let k = 0; k < count; k++) { if (this.state.model === 'reaction') this.reaction(); else if (this.state.model === 'sand') this.sand(); else this.lenia(); this.state.tick++; this.state.time += this.state.model === 'lenia' ? this.state.params.dt : 1; } }
  private reaction() {
    const s = this.state, n = s.size, [a, b, mask] = s.fields, [aa, bb] = this.scratch, p = s.params; let change = 0;
    for (let y = 0; y < n; y++)for (let x = 0; x < n; x++) {
      const i = y * n + x; if (mask[i]) { aa[i] = a[i]; bb[i] = b[i]; continue; }
      let la = 0, lb = 0;
      for (let dy = -1; dy <= 1; dy++)for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const j = ((y + dy + n) % n) * n + (x + dx + n) % n, w = dx && dy ? .05 : .2; if (!mask[j]) { la += (a[j] - a[i]) * w; lb += (b[j] - b[i]) * w; } }
      const reaction = a[i] * b[i] * b[i]; aa[i] = clamp(a[i] + p.da * la - reaction + p.feed * (1 - a[i])); bb[i] = clamp(b[i] + p.db * lb + reaction - (p.kill + p.feed) * b[i]); change += Math.abs(aa[i] - a[i]) + Math.abs(bb[i] - b[i]);
    }
    s.fields[0] = aa; s.fields[1] = bb; this.scratch = [a, b]; s.change = change / (2 * n * n);
  }
  private lenia() {
    const s = this.state, f = s.fields[0], u = this.potential, g = this.growth; this.updatePotential(); let change = 0;
    for (let i = 0; i < f.length; i++) { g[i] = growthValue(u[i], s.params); const v = clamp(f[i] + s.params.dt * g[i]); change += Math.abs(v - f[i]); f[i] = v; } s.change = change / f.length;
  }
  updatePotential() {
    if (this.state.model !== 'lenia') return;
    const s = this.state, key = [s.params.radius, s.params.ring1, s.params.ring2, s.params.ring3].join(':');
    if (key !== this.kernelKey) { this.convolver = new Convolver(makeKernel(s.size, s.params), s.size); this.kernelKey = key; }
    this.potential.set(this.convolver!.apply(s.fields[0])); for (let i = 0; i < this.growth.length; i++)this.growth[i] = growthValue(this.potential[i], s.params);
  }
  private sand() {
    const s = this.state, n = s.size, [f, life] = s.fields, p = s.params; let moves = 0, events = 0;
    const swap = (i: number, j: number) => { [f[i], f[j]] = [f[j], f[i]];[life[i], life[j]] = [life[j], life[i]]; this.moved[i] = this.moved[j] = 1; moves++; };
    for (let pass = 0; pass < p.gravity; pass++) {
      this.moved.fill(0);
      for (let yy = 0; yy < n; yy++) {
        const y = pass % 2 ? yy : n - 1 - yy, reverse = this.random() < .5;
        for (let xx = 0; xx < n; xx++) {
          const x = reverse ? n - 1 - xx : xx, i = y * n + x, m = f[i]; if (!m || m === 3 || m === 4 || this.moved[i]) continue;
          const dir = this.random() < .5 ? -1 : 1, up = m >= 5, dy = up ? -1 : 1;
          if (pass === 0 && m >= 5) { life[i]--; if (life[i] <= 0) { f[i] = m === 6 ? 2 : 0; life[i] = 0; events++; continue; } }
          if (pass === 0 && m === 5) { for (const [dx, d] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + d; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue; const j = ny * n + nx; if (f[j] === 4 && this.random() < p.burn) { f[j] = 5; life[j] = 40 + Math.floor(this.random() * 40); events++; } else if (f[j] === 2) { f[j] = 6; life[j] = 80; f[i] = 7; life[i] = 40; events++; break; } } }
          const candidates = [[0, dy], [dir, dy], [-dir, dy]]; if (m === 2 || up) if (this.random() < p.spread) candidates.push([dir, 0], [-dir, 0]);
          for (const [dx, d] of candidates) { const nx = x + dx, ny = y + d; if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue; const j = ny * n + nx; if (!this.moved[j] && (f[j] === 0 || (m === 1 && f[j] === 2))) { swap(i, j); break; } }
        }
      }
    }
    s.change = moves / (n * n * p.gravity); s.reactions = events;
  }
  metrics(): Record<string, number> {
    const s = this.state, [a, b] = s.fields, N = a.length;
    if (s.model === 'sand') { const counts = new Array<number>(8).fill(0); for (const v of a) counts[v]++; return Object.fromEntries(['empty', 'sand', 'water', 'stone', 'wood', 'fire', 'steam', 'smoke'].map((name, i) => [name, counts[i]]).concat([['moving', s.change], ['reactions', s.reactions]])); }
    let mass = 0, other = 0, area = 0; for (let i = 0; i < N; i++) { mass += a[i]; other += b?.[i] || 0; if (a[i] > .1) area++; }
    return s.model === 'reaction' ? { meanA: mass / N, meanB: other / N, change: s.change } : { mass, area: area / N, change: s.change };
  }
  dispose() { this.convolver = undefined; }
}
