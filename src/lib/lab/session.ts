import { LabEngine, type State, type Brush } from './engine.ts';
import { models, validateParams, type ModelId, type Params } from './definitions.ts';
export interface Sample { tick: number; a: Record<string, number>; b?: Record<string, number> }
export interface Axis { key: string; min: number; max: number; count: number }
export interface ScanSettings { axes: Axis[]; steps: number }
export interface ScanCell { params: Params; state: State; metrics: Record<string, number> }
export interface Scan { source: State; settings: ScanSettings; results: ScanCell[]; total: number }
export interface Experiment { format: 'ortunate-lab'; version: 1; a: State; b?: State; initialA: State; initialB?: State; branchA?: State; branchB?: State; view: number; samples: Sample[]; scan?: Scan }
export function combinations(model: ModelId, settings: ScanSettings) {
  if (!Number.isInteger(settings.steps) || settings.steps < 100 || settings.steps > 10000 || !Array.isArray(settings.axes) || settings.axes.length < 1 || settings.axes.length > 2) throw new Error('Scan: 1–2 axes and 100–10,000 steps required.');
  let result: Params[] = [{}]; const keys = new Set<string>();
  for (const axis of settings.axes) {    
const spec = models[model].params.find(p => p.key === axis.key); if (!spec || keys.has(axis.key) || !Number.isInteger(axis.count) || axis.count < 2 || axis.count > 5 || !Number.isFinite(axis.min) || !Number.isFinite(axis.max) || axis.min < spec.min || axis.max > spec.max || axis.min >= axis.max) throw new Error('Invalid scan axis.'); keys.add(axis.key);
    const values = Array.from({ length: axis.count }, (_, i) => axis.min + (axis.max - axis.min) * i / (axis.count - 1)); if (spec.step === 1 && values.some(v => !Number.isInteger(v))) throw new Error('Integer parameters require integer samples.'); result = result.flatMap(p => values.map(v => ({ ...p, [axis.key]: v })));
  } return result;
}
export class LabSession {
  a: LabEngine; b?: LabEngine; initialA: State; initialB?: State; branchA?: State; branchB?: State; view = 0; samples: Sample[] = []; scan?: Scan;
  private undo?: { a: State; b?: State }; checkpoint?: Experiment;
  constructor(model: ModelId, size: number, seed: number, preset = 0) { this.a = new LabEngine(model, size, seed, preset); this.initialA = this.a.snapshot(); this.sample(); }
  step(n = 1) { for (let i = 0; i < n; i++) { this.a.step(); this.b?.step(); if (this.a.state.tick % 10 === 0) this.sample(); } this.undo = undefined; }
  sample() { this.samples.push({ tick: this.a.state.tick, a: this.a.metrics(), ...(this.b ? { b: this.b.metrics() } : {}) }); if (this.samples.length > 2000) this.samples.shift(); }
  compare() { this.b = LabEngine.from(this.a.snapshot()); this.initialB = structuredClone(this.initialA); this.branchA = this.a.snapshot(); this.branchB = this.b.snapshot(); this.samples = []; this.sample(); }
  single() { this.b?.dispose(); this.b = undefined; this.initialB = undefined; this.branchA = undefined; this.branchB = undefined; this.samples = []; this.sample(); }
  reset(branch = false) { this.a.restore(branch && this.branchA ? this.branchA : this.initialA); if (this.b) this.b.restore(branch && this.branchB ? this.branchB : this.initialB || this.initialA); this.samples = []; this.undo = undefined; this.sample(); }
  paintStart() { this.undo = { a: this.a.snapshot(), b: this.b?.snapshot() }; }
  paint(brush: Brush, target: 'a' | 'b' | 'both') { if (target !== 'b') this.a.paint(brush); if (target !== 'a') this.b?.paint(brush); }
  undoPaint() { if (this.undo) { this.a.restore(this.undo.a); if (this.undo.b) this.b?.restore(this.undo.b); this.undo = undefined; } }
  params(target: 'a' | 'b', params: Params) { (target === 'a' ? this.a : this.b)?.setParams(params); }
  export(): Experiment { return { format: 'ortunate-lab', version: 1, a: this.a.snapshot(), b: this.b?.snapshot(), initialA: structuredClone(this.initialA), initialB: structuredClone(this.initialB), branchA: structuredClone(this.branchA), branchB: structuredClone(this.branchB), view: this.view, samples: structuredClone(this.samples), scan: structuredClone(this.scan) }; }
  restore(doc: Experiment) { validateExperiment(doc); this.a.dispose(); this.b?.dispose(); this.a = LabEngine.from(doc.a); this.b = doc.b ? LabEngine.from(doc.b) : undefined; this.initialA = structuredClone(doc.initialA); this.initialB = structuredClone(doc.initialB); this.branchA = structuredClone(doc.branchA); this.branchB = structuredClone(doc.branchB); this.view = doc.view; this.samples = structuredClone(doc.samples); this.scan = structuredClone(doc.scan); this.undo = undefined; }
  beginScan(settings: ScanSettings) { const jobs = combinations(this.a.state.model, settings); for (const params of jobs) validateParams(this.a.state.model, { ...this.a.state.params, ...params }); this.scan = { source: this.a.snapshot(), settings: structuredClone(settings), results: [], total: jobs.length }; return jobs; }
  loadCell(index: number, target: 'a' | 'b') {
    const state = this.scan?.results[index]?.state; if (!state) throw new Error('Scan cell unavailable.');
    if (target === 'a') { this.a = LabEngine.from(state); this.initialA = structuredClone(state); this.single(); }
    else { if (state.tick !== this.a.state.tick) throw new Error('To compare synchronously, A must have the same tick as this result. Load a result into A first.'); if (!this.b) this.compare(); this.b = LabEngine.from(state); this.initialA = this.a.snapshot(); this.initialB = structuredClone(state); this.branchA = this.a.snapshot(); this.branchB = this.b.snapshot(); this.samples = []; this.sample(); }
  }
}
function validState(s: State) {
  if (!s || !Object.hasOwn(models, s.model) || s.version !== 1 || ![128, 256].includes(s.size) || !Number.isSafeInteger(s.tick) || s.tick < 0 || s.tick > 1e9 || !Number.isFinite(s.time) || s.time < 0 || s.time > 1e10 || ![s.seed, s.rng].every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff) || !Number.isFinite(s.change) || s.change < 0 || !Number.isFinite(s.reactions) || s.reactions < 0) throw new Error('Invalid model snapshot.');
  validateParams(s.model, s.params); const count = s.model === 'reaction' ? 3 : s.model === 'sand' ? 2 : 1;
  if (!Array.isArray(s.fields) || s.fields.length !== count) throw new Error('Invalid fields.');
  s.fields.forEach((f, k) => { if (!(f instanceof Float32Array) || f.length !== s.size * s.size) throw new Error('Invalid field dimensions.'); for (const v of f) { const max = s.model === 'sand' ? (k === 0 ? 7 : 1000) : 1; if (!Number.isFinite(v) || v < 0 || v > max || (s.model === 'sand' && !Number.isInteger(v)) || (s.model === 'reaction' && k === 2 && v !== 0 && v !== 1)) throw new Error('Invalid field value.'); } });
}
function validMetrics(m: Record<string, number>) { if (!m || typeof m !== 'object' || Object.keys(m).length > 12 || !Object.values(m).every(v => typeof v === 'number' && Number.isFinite(v))) throw new Error('Invalid metrics.'); }
export function validateExperiment(doc: Experiment) {
  if (!doc || doc.format !== 'ortunate-lab' || doc.version !== 1) throw new Error('Unsupported experiment format/version.');
  validState(doc.a); validState(doc.initialA);
  for (const s of [doc.initialA, doc.b, doc.initialB, doc.branchA, doc.branchB]) if (s) { validState(s); if (s.model !== doc.a.model || s.size !== doc.a.size) throw new Error('Mixed models or grid sizes.'); }
  if (doc.b && (!doc.initialB || !doc.branchA || !doc.branchB || doc.b.tick !== doc.a.tick || doc.initialA.tick !== doc.initialB.tick || doc.branchA.tick !== doc.branchB.tick)) throw new Error('Invalid comparison snapshots.');
  if (!Number.isInteger(doc.view) || doc.view < 0 || doc.view >= models[doc.a.model].views.length || !Array.isArray(doc.samples) || doc.samples.length > 2000) throw new Error('Invalid view/history.');
  let tick = -1; for (const sample of doc.samples) { if (!Number.isSafeInteger(sample.tick) || sample.tick < tick || sample.tick > doc.a.tick) throw new Error('Invalid sample tick.'); tick = sample.tick; validMetrics(sample.a); if (sample.b) validMetrics(sample.b); }
  if (doc.scan) { const scan = doc.scan; validState(scan.source); if (scan.source.model !== doc.a.model || scan.source.size !== doc.a.size) throw new Error('Incompatible scan.'); const jobs = combinations(scan.source.model, scan.settings); if (scan.total !== jobs.length || !Array.isArray(scan.results) || scan.results.length > jobs.length) throw new Error('Invalid scan results.'); for (const [i, cell] of scan.results.entries()) { validState(cell.state); validateParams(scan.source.model, cell.params); validMetrics(cell.metrics); if (cell.state.model !== scan.source.model || cell.state.size !== scan.source.size || cell.state.tick !== scan.source.tick + scan.settings.steps) throw new Error('Invalid scan result state.'); for (const key of Object.keys(cell.params)) { if (cell.params[key] !== cell.state.params[key] || cell.params[key] !== ({ ...scan.source.params, ...jobs[i] })[key]) throw new Error('Scan parameter mismatch.'); } } }
}
export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export function encodeExperiment(doc: Experiment) { return JSON.stringify(doc, (_key, value) => { if (value instanceof Float32Array) { const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength); let str = ''; for (let i = 0; i < bytes.length; i += 8192)str += String.fromCharCode(...bytes.subarray(i, i + 8192)); return { $f32: btoa(str) }; } return value; }); }
export function decodeExperiment(text: string): Experiment {
  if (text.length > MAX_FILE_BYTES) throw new Error('File exceeds 64 MB.');
  const doc = JSON.parse(text, (_key, value) => { if (value && typeof value === 'object' && '$f32' in value) { if (typeof value.$f32 !== 'string' || value.$f32.length > 350000) throw new Error('Invalid encoded field.'); const bytes = Uint8Array.from(atob(value.$f32), c => c.charCodeAt(0)); if (bytes.length % 4) throw new Error('Invalid field bytes.'); return new Float32Array(bytes.buffer); } return value; }); validateExperiment(doc); return doc;
}
