import { LabEngine, type State } from './engine.ts';
import { LabSession, type Experiment, type ScanSettings } from './session.ts';
import type { ModelId } from './definitions.ts';

export interface Frame { a: State; b?: State; derivedA?: Float32Array; derivedB?: Float32Array; metricsA: Record<string, number>; metricsB?: Record<string, number>; samples: LabSession['samples']; view: number; running: boolean; scanning: boolean; stepsPerSecond: number; computeMs: number }
export interface Request { id: number; generation: number; command: string; data?: any }
export interface Reply { type: 'reply' | 'frame' | 'scan'; generation: number; id?: number; data?: any; error?: string }
/** Browser-independent scheduler, also exercised through Node's worker_threads adapter. */
export function createRuntime(send: (message: Reply) => void) {
  let session: LabSession | undefined, generation = 0, running = false, scanning = false, timer: ReturnType<typeof setTimeout> | undefined, token = 0, lastFrame = 0, rateStart = performance.now(), steps = 0, rate = 0, computeMs = 0;
  const cancel = () => { token++; running = false; scanning = false; if (timer) clearTimeout(timer); timer = undefined; };
  const frame = () => { if (!session) return; const derived = (e: LabEngine) => { if (e.state.model !== 'lenia' || session!.view === 0) return undefined; e.updatePotential(); return session!.view === 1 ? e.potential : e.growth; }; const data: Frame = { a: session.a.snapshot(), b: session.b?.snapshot(), derivedA: derived(session.a)?.slice(), derivedB: session.b ? derived(session.b)?.slice() : undefined, metricsA: session.a.metrics(), metricsB: session.b?.metrics(), samples: session.samples, view: session.view, running, scanning, stepsPerSecond: running ? rate : 0, computeMs }; send({ type: 'frame', generation, data }); lastFrame = performance.now(); };
  const loop = (key: number) => { if (key !== token || !running || !session) return; const start = performance.now(); do { session.step(); steps++; } while (performance.now() - start < 10); computeMs = performance.now() - start; if (performance.now() - rateStart >= 500) { rate = steps * 1000 / (performance.now() - rateStart); steps = 0; rateStart = performance.now(); } if (performance.now() - lastFrame > 66) frame(); timer = setTimeout(() => loop(key), 0); };
  const scan = (settings: ScanSettings) => {
    if (!session) throw new Error('Initialize a model first.'); cancel(); const jobs = session.beginScan(settings); scanning = true; const key = token, owner = session, source = owner.scan!.source; let index = 0, engine: LabEngine | undefined, done = 0, lastProgress = 0;
    const next = () => { if (key !== token) return; const start = performance.now(); try { do { if (!engine) { engine = LabEngine.from(source); engine.setParams({ ...source.params, ...jobs[index] }); done = 0; } engine.step(); done++; if (done >= settings.steps) { owner.scan!.results.push({ params: { ...engine.state.params }, state: engine.snapshot(), metrics: engine.metrics() }); engine.dispose(); engine = undefined; index++; send({ type: 'scan', generation, data: { scan: owner.scan, index, total: jobs.length, done: 0, complete: index === jobs.length } }); if (index === jobs.length) { scanning = false; frame(); return; } } } while (performance.now() - start < 12); if (performance.now() - lastProgress > 150) { send({ type: 'scan', generation, data: { index, total: jobs.length, done, steps: settings.steps } }); lastProgress = performance.now(); } timer = setTimeout(next, 0); } catch (error) { cancel(); send({ type: 'scan', generation, error: error instanceof Error ? error.message : 'Scan failed.' }); frame(); } };
    frame(); timer = setTimeout(next, 0);
  };
  return {
    dispose: cancel,
    handle(message: Request) {      
const { id, command, data } = message; try {
        if (command === 'init') { cancel(); generation = message.generation; session = new LabSession(data.model as ModelId, data.size, data.seed, data.preset); }
        else {
          if (message.generation !== generation) return;
          if (!session) throw new Error('Model not initialized.');
          if (scanning && !['cancelScan', 'pause', 'export', 'view'].includes(command)) throw new Error('Cancel the parameter scan before editing.');
          switch (command) {
            case 'run': cancel(); running = true; steps = 0; rateStart = performance.now(); timer = setTimeout(() => loop(token), 0); break;
            case 'pause': case 'cancelScan': cancel(); break;
            case 'step': cancel(); session.step(); break;
            case 'params': session.params(data.target, data.params); break;
            case 'view': if (!Number.isInteger(data) || data < 0 || data > 2) throw new Error('Invalid view.'); session.view = data; break;
            case 'compare': cancel(); session.compare(); break;
            case 'single': cancel(); session.single(); break;
            case 'reset': cancel(); session.reset(Boolean(data)); break;
            case 'paintStart': cancel(); session.paintStart(); break;
            case 'paint': cancel(); session.paint(data.brush, data.target); break;
            case 'undo': cancel(); session.undoPaint(); break;
            case 'checkpoint': session.checkpoint = session.export(); break;
            case 'restoreCheckpoint': cancel(); if (!session.checkpoint) throw new Error('No checkpoint yet.'); session.restore(session.checkpoint); break;
            case 'export': send({ type: 'reply', generation, id, data: session.export() }); return;
            case 'import': { const doc = data as Experiment; if (doc.a.model !== session.a.state.model) throw new Error('Open this model’s Lab page to import its experiment.'); session.restore(doc); session.checkpoint = undefined; cancel(); break; }
            case 'scan': scan(data); break;
            case 'loadCell': cancel(); session.loadCell(data.index, data.target); break;
            default: throw new Error('Unknown Lab command.');
          }
        }
        send({ type: 'reply', generation, id, data: true }); if (command !== 'paint') frame();
        else if (performance.now() - lastFrame > 33) frame();
      } catch (error) { send({ type: 'reply', generation: message.generation, id, error: error instanceof Error ? error.message : 'Experiment failed.' }); }    
}
  };
}
