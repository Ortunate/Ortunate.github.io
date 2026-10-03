import type { Frame, Reply } from '../lib/lab/runtime.ts';
import { drawState } from '../lib/lab/render.ts';
const workers: Worker[] = [];
for (const canvas of document.querySelectorAll<HTMLCanvasElement>('[data-lab-preview]')) {
  const worker = new Worker(new URL('./lab.worker.ts', import.meta.url), { type: 'module' }); workers.push(worker); let visible = false, busy = false, sequence = 0;
  worker.onmessage = (event: MessageEvent<Reply>) => { if (event.data.type === 'frame') { const frame = event.data.data as Frame; drawState(canvas, frame.a, frame.a.model === 'reaction' ? 1 : 0); } if (event.data.type === 'reply') busy = false; };
  worker.postMessage({ id: ++sequence, generation: 1, command: 'init', data: { model: canvas.dataset.labPreview, size: 128, seed: 7, preset: 0 } });
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }); observer.observe(canvas);
  const timer = setInterval(() => { if (!visible || busy || document.hidden || document.documentElement.dataset.motion === 'reduced') return; busy = true; worker.postMessage({ id: ++sequence, generation: 1, command: 'step' }); }, 100);
  window.addEventListener('pagehide', () => { clearInterval(timer); observer.disconnect(); worker.terminate(); }, { once: true });
}
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
