import { VisualScene, guides } from '../lib/visual-engine';
import type { GPUVisual } from '../lib/gpu-visual';
type Scene = VisualScene | GPUVisual;
const scenes: Scene[] = [];
const canvases = Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas[data-visual]'));
const gpuKinds = ['orbit', 'fractal', 'tunnel'];
let gpuModule: Promise<typeof import('../lib/gpu-visual')> | undefined;
const pending = new Set<HTMLCanvasElement>(), visibility = new Map<HTMLCanvasElement, boolean>();
let disposed = false;
async function initialize(canvas: HTMLCanvasElement) {
    if (pending.has(canvas))
        return;
    pending.add(canvas);
    const scene = gpuKinds.includes(canvas.dataset.visual!) ? new (await (gpuModule ??= import('../lib/gpu-visual'))).GPUVisual(canvas) : new VisualScene(canvas);
    if (disposed) {
        scene.dispose();
        return;
    }
    scene.visible = visibility.get(canvas) ?? false;
    scenes.push(scene);
    if (!scene.preview)
        controls(scene);
}
const observer = new IntersectionObserver(entries => entries.forEach(e => {
    const canvas = e.target as HTMLCanvasElement;
    visibility.set(canvas, e.isIntersecting);
    const scene = scenes.find(s => s.canvas === canvas);
    if (scene) {
        scene.visible = e.isIntersecting;
        scene.lastDraw = 0;
        scene.dirty = true;
    }
    else if (e.isIntersecting)
        void initialize(canvas);
}), { rootMargin: '0px' });
canvases.forEach(canvas => observer.observe(canvas));
let frame = 0, last = 0;
const reduced = () => document.documentElement.dataset.motion === 'reduced';
function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (document.hidden) {
        last = now;
        return;
    }
    const dt = Math.min(.04, (now - last) / 1000 || .016);
    last = now;
    for (const scene of scenes) {
        if (!scene.visible)
            continue;
        const frozen = scene.paused || reduced();
        if (frozen && !scene.dirty)
            continue;
        if (scene.preview && now - scene.lastDraw < 1000 / 24)
            continue;
        const frameGap = scene.lastDraw ? now - scene.lastDraw : dt * 1000;
        const elapsed = Math.min(.06, frameGap / 1000);
        scene.lastDraw = now;
        const start = performance.now();
        scene.draw(frozen ? 0 : elapsed);
        scene.dirty = false;
        // Windowed pressure estimate: isolated expensive frames do not accumulate forever.
        scene.slowFrames = Math.max(0, scene.slowFrames + (performance.now() - start > 24 || (!frozen && frameGap > 40) ? 1 : -.25));
        if (scene.slowFrames > 35 && !scene.preview && scene.quality > .55) {
            scene.quality = Math.max(.55, scene.quality * .8);
            scene.resize();
            scene.slowFrames = 0;
        }
    }
}
frame = requestAnimationFrame(tick);
window.addEventListener('motionchange', () => scenes.forEach(s => s.dirty = true));
document.addEventListener('visibilitychange', () => { last = 0; scenes.forEach(s => s.lastDraw = 0); });
window.addEventListener('pagehide', e => {
    cancelAnimationFrame(frame);
    if (!e.persisted) {
        disposed = true;
        observer.disconnect();
        scenes.forEach(s => s.dispose());
        if (gpuModule)
            void import('../lib/visual-webgl').then(m => m.disposeWebGL());
    }
});
window.addEventListener('pageshow', e => {
    if (e.persisted) {
        last = 0;
        frame = requestAnimationFrame(tick);
    }
});
function controls(scene: Scene) {
    const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
    const status = $('visual-status');
    $('visual-guide').textContent = guides[scene.kind];
    $<HTMLSelectElement>('visual-force').value = String(scene.options.force);
    for (const key of ['preset', 'palette', 'speed', 'strength', 'detail', 'force', 'light'] as const) {
        $('visual-' + key)?.addEventListener('input', e => { scene.update({ [key]: Number((e.target as HTMLInputElement).value) }); status.textContent = reduced() ? 'Reduced motion · change controls to explore still compositions.' : 'Your field, your rules.'; });
    }
    const sync = () => { $('visual-pause').textContent = scene.paused ? 'Resume' : 'Pause'; status.textContent = scene.fallback ? 'WebGL is unavailable. A static fallback is shown.' : scene.paused ? 'Paused. Take in the details.' : reduced() ? 'Reduced motion · static composition.' : 'Move. Touch. Explore.'; };
    scene.canvas.addEventListener('scenechange', sync);
    sync();
    $('visual-pause').addEventListener('click', () => { scene.paused = !scene.paused; scene.dirty = true; sync(); });
    $('visual-reset').addEventListener('click', () => { scene.reset(); sync(); });
    $('visual-random').addEventListener('click', () => { const palette = Math.floor(Math.random() * 4), preset = Math.floor(Math.random() * 2); scene.update({ palette, preset }); $<HTMLSelectElement>('visual-palette').value = String(palette); $<HTMLSelectElement>('visual-preset').value = String(preset); });
    const stage = $('visual-stage');
    async function leave() {
        if (!document.fullscreenElement && !stage.classList.contains('stage-fullscreen'))
            return;
        if (document.fullscreenElement)
            await document.exitFullscreen();
        stage.classList.remove('stage-fullscreen');
        document.body.style.overflow = '';
        scene.canvas.focus();
    }
    $('visual-fullscreen').addEventListener('click', async () => {
        try {
            if (!stage.requestFullscreen)
                throw Error();
            await stage.requestFullscreen();
        }
        catch {
            stage.classList.add('stage-fullscreen');
            document.body.style.overflow = 'hidden';
        }
        scene.canvas.focus();
    });
    $('exit-fullscreen').addEventListener('click', () => void leave());
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape')
            void leave();
    });
    $('visual-export').addEventListener('click', () => {
        // Export the existing framebuffer, without taking a simulation step.
        scene.exportCanvas().toBlob(blob => {
            if (!blob) {
                status.textContent = 'Could not export this frame. Please try again.';
                return;
            }
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url;
            a.download = 'ortunate-' + scene.kind + '.png';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            status.textContent = 'A little piece of the field, saved.';
        }, 'image/png');
    });
}
