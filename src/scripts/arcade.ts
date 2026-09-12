import { betterRecord } from '../lib/game-state';
import { read, save } from './storage';
import type { GameContext, GameController } from '../lib/game-runtime';
const root = document.querySelector<HTMLElement>('[data-game]')!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const slug = root.dataset.game!, select = $<HTMLSelectElement>('game-mode'), surface = $('game-surface-v2'), overlay = $('game-end');
let controller: GameController | undefined, abort = new AbortController(), generation = 0, ended = false;
function getMode() { const raw = new URLSearchParams(location.search).get('mode'); const n = Number(raw); return Number.isInteger(n) && n >= 0 && n < select.options.length ? n : 0; }
let mode = getMode();
select.value = String(mode);
async function mount() {
    const token = ++generation;
    controller?.save?.();
    controller?.dispose();
    controller = undefined;
    abort.abort();
    abort = new AbortController();
    ended = false;
    root.dataset.state = 'ready';
    overlay.hidden = true;
    $('game-extra').replaceChildren();
    $('game-pause').textContent = 'Pause';
    $('game-pause').hidden = false;
    $<HTMLButtonElement>('game-pause').disabled = false;
    $<HTMLCanvasElement>('arcade-canvas').hidden = false;
    $('game-grid').hidden = true;
    const key = `arcade:${slug}:${mode}:best`, legacy = mode === 0 && (slug === '2048' || slug === 'snake') ? read<unknown>(`${slug}:best`, 0) : 0;
    const stored = read<unknown>(key, legacy);
    let best = typeof stored === 'number' && Number.isFinite(stored) && stored >= 0 ? stored : 0;
    $('game-best').textContent = String(best);
    $('game-score').textContent = '0';
    const recordKey = `arcade:${slug}:${mode}:record`, timed = slug === 'mines' || slug === 'tetris' && mode === 1, minimal = timed || slug === 'puzzle';
    let record = read<unknown>(recordKey, null);
    const showRecord = () => { $('game-best').textContent = typeof record === 'number' && Number.isFinite(record) && record >= 0 ? timed ? (record / 1000).toFixed(1) + 's' : record + ' moves' : '—'; };
    if (minimal)
        showRecord();
    if (slug === 'life')
        $('game-best').textContent = '—';
    $('metric-label').textContent = slug === 'life' ? 'GENERATION' : slug === 'puzzle' ? 'MOVES' : 'SCORE';
    $('best-label').textContent = timed ? 'BEST TIME' : slug === 'puzzle' ? 'BEST MOVES' : 'BEST';
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-game-key]')) {
        const k = button.dataset.gameKey!;
        button.hidden = slug === 'breakout' ? ['ArrowUp', 'ArrowDown'].includes(k) : slug === '2048' ? mode < 2 && !k.startsWith('Arrow') : false;
    }
    $('game-continue').hidden = true;
    const context: GameContext = { root, surface, grid: $('game-grid'), canvas: $<HTMLCanvasElement>('arcade-canvas'), mode, slug, signal: abort.signal, extra: $('game-extra'), setScore(value) {
            $('game-score').textContent = String(value);
            if (!minimal && slug !== 'life' && value > best) {
                best = value;
                save(key, best);
                $('game-best').textContent = String(best);
            }
        }, setState(state) {
            if (ended && state !== 'ended')
                return;
            root.dataset.state = state;
            $('game-pause').textContent = state === 'running' ? 'Pause' : state === 'ready' ? 'Start' : 'Resume';
            $('game-pause').setAttribute('aria-pressed', String(state === 'paused'));
        }, setRecord(value) {
            const next = betterRecord(record, value);
            if (next !== null && next !== record) {
                record = next;
                save(recordKey, record);
                showRecord();
            }
        }, setStatus(message) { $('game-status-v2').textContent = message; }, finish(title, message) { ended = true; root.dataset.state = 'ended'; overlay.hidden = false; $('game-end-title').textContent = title; $('game-end-message').textContent = message; }, setRules(rules) { $('game-rules').textContent = rules; } };
    try {
        const module = slug === '2048' ? await import('./games/merge') : ['mines', 'memory', 'puzzle', 'life'].includes(slug) ? await import('./games/puzzles') : await import('./games/realtime');
        if (token !== generation)
            return;
        controller = module.createGame(context);
        $('game-pause').hidden = !controller.pause;
    }
    catch (error) {
        if (token !== generation)
            return;
        context.setStatus(`The game could not start. ${error instanceof Error ? error.message : 'Please reload.'}`);
    }
}
select.addEventListener('change', () => { mode = Number(select.value); const url = new URL(location.href); url.searchParams.set('mode', String(mode)); history.pushState({}, '', url); void mount(); });
window.addEventListener('popstate', () => { mode = getMode(); select.value = String(mode); void mount(); });
function newGame() {
    controller?.save?.();
    save(`arcade:${slug}:${mode}:game`, null);
    if (slug === '2048' && mode === 0)
        save('2048:game', null);
    controller?.dispose();
    controller = undefined;
    void mount();
}
$('game-restart').addEventListener('click', newGame);
$('game-again').addEventListener('click', newGame);
$('game-pause').addEventListener('click', () => {
    if (!ended && controller?.pause)
        $('game-pause').textContent = controller.pause() ? 'Resume' : 'Pause';
});
function key(key: string) {
    if (ended)
        return;
    controller?.key?.(key);
}
root.addEventListener('game-continue', () => { ended = false; root.dataset.state = 'running'; });
const mapKey = (k: string) => ({ w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight' }[k.toLowerCase()] ?? k);
surface.addEventListener('keyup', e => controller?.keyUp?.(mapKey(e.key)));
window.addEventListener('blur', () => { controller?.release?.(); root.dispatchEvent(new Event('game-background')); });
surface.addEventListener('focusout', () => controller?.release?.());
surface.addEventListener('keydown', e => {
    if ((e.target instanceof HTMLElement && e.target.closest('#game-end')) || e.ctrlKey || e.metaKey || e.altKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)
        return;
    const map: Record<string, string> = { w: 'ArrowUp', a: 'ArrowLeft', s: 'ArrowDown', d: 'ArrowRight' };
    const k = map[e.key.toLowerCase()] ?? e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Backspace', 'Escape', 'c', 'C', 'f', 'F'].includes(k)) {
        e.preventDefault();
        key(k);
    }
});
document.querySelectorAll<HTMLButtonElement>('[data-game-key]').forEach(b => {
    const held = slug === 'breakout' && b.dataset.gameKey?.startsWith('Arrow');
    b.addEventListener('pointerdown', e => {
        if (!held)
            return;
        e.preventDefault();
        surface.focus({ preventScroll: true });
        b.setPointerCapture(e.pointerId);
        key(b.dataset.gameKey!);
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
        b.addEventListener(event, () => controller?.keyUp?.(b.dataset.gameKey!));
    b.addEventListener('click', e => {
        if (held && e.detail !== 0)
            return;
        surface.focus({ preventScroll: true });
        key(b.dataset.gameKey!);
        if (held)
            controller?.keyUp?.(b.dataset.gameKey!);
    });
});
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        controller?.save?.();
        root.dispatchEvent(new Event('game-background'));
    }
});
window.addEventListener('pagehide', e => {
    controller?.save?.();
    root.dispatchEvent(new Event('game-background'));
    if (!e.persisted) {
        generation++;
        controller?.dispose();
        abort.abort();
    }
});
void mount();
