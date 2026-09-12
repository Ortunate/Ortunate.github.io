import { moveBoard, newBoard, spawnTile, canMove, validBoard, validChain, mergeChain, canLink } from '../../lib/game2048';
import type { Direction } from '../../lib/game2048';
import { gridCells, extraButton } from '../../lib/game-runtime';
import type { GameContext, GameController } from '../../lib/game-runtime';
import { read, save } from '../storage';
export function createGame(c: GameContext): GameController {
    const size = c.mode === 0 ? 4 : 5, linked = c.mode >= 2, kind = c.mode === 2 ? 'same' : 'doubling', key = `arcade:2048:${c.mode}:game`;
    interface Stored {
        board: number[];
        score: number;
        continued: boolean;
    }
    const old = read<Partial<Stored> | null>(key, c.mode === 0 ? read('2048:game', null) : null);
    const valid = old && validBoard(old.board, size) && old.board.some(Boolean) && (!linked || old.board.every(Boolean)) && Number.isSafeInteger(old.score) && old.score! >= 0;
    let board = valid ? old.board! : (linked ? Array.from({ length: 25 }, () => Math.random() < .9 ? 2 : 4) : newBoard(Math.random, size)), score = valid ? old.score! : 0, continued = valid && old.continued === true, path: number[] = [], cursor = 0, busy = false, over = false, dragging = false, moved = false, origin: {
        x: number;
        y: number;
    } | null = null;
    const cells = gridCells(c, size, size);
    const persist = () => save(key, { board, score, continued });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    svg.classList.add('chain-overlay');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(line);
    if (linked)
        c.surface.appendChild(svg);
    function drawPath() { const area = c.surface.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${area.width} ${area.height}`); line.setAttribute('points', path.map(i => { const cell = cells[i].getBoundingClientRect(); return `${cell.x - area.x + cell.width / 2},${cell.y - area.y + cell.height / 2}`; }).join(' ')); }
    const resize = new ResizeObserver(drawPath);
    if (linked)
        resize.observe(c.surface);
    c.setRules(linked ? (kind === 'same' ? 'Connect two or more equal numbers, including diagonals. The sum rounds up to the next power of two: 2 + 2 + 2 → 8.' : 'Begin with two equal numbers, then connect the current total: 2 → 2 → 4 → 8 → 16.') + '\nDrag and release to merge, or click cells then press Connect. No repeated cells. Backtrack to undo. Arrows move focus, Space selects, Enter connects, Backspace undoes, Esc cancels. Tiles fall and refill after each merge.' : 'Use the arrow keys or swipe to slide all tiles. Equal neighbors merge once per move. Reach 2048, then keep exploring.');
    function render(spawn = -1, merged: number[] = []) { cells.forEach((cell, i) => { const value = board[i]; cell.textContent = value ? String(value) : ''; cell.className = `game-cell ${value ? 'filled' : ''} ${path.includes(i) ? 'selected' : ''} ${cursor === i ? 'cursor' : ''}`; cell.tabIndex = i === cursor ? 0 : -1; cell.style.setProperty('--tile-hue', String(280 - Math.log2(value || 2) * 12)); cell.style.setProperty('--tile-light', `${22 + Math.log2(value || 2) * 4}%`); cell.setAttribute('aria-label', `Row ${Math.floor(i / size) + 1}, column ${i % size + 1}: ${value || 'empty'}${path.includes(i) ? ', selected' : ''}`); if ((spawn === i || merged.includes(i)) && document.documentElement.dataset.motion !== 'reduced')
        cell.animate([{ transform: 'scale(.85)' }, { transform: 'scale(1)' }], { duration: 170 }); }); drawPath(); c.setScore(score); }
    function check() { persist(); over = linked ? !canLink(board, size) : !canMove(board, size); if (!continued && board.some(v => v >= 2048)) {
        c.finish('A new constellation.', 'You reached 2048. Keep exploring?');
        const button = document.getElementById('game-continue')!;
        button.hidden = false;
        button.onclick = () => { continued = true; button.hidden = true; document.getElementById('game-end')!.hidden = true; c.root.dispatchEvent(new Event('game-continue')); check(); c.surface.focus(); };
    }
    else if (over)
        c.finish('An orbit well travelled.', `No more moves. Your score: ${score}.`); }
    async function move(direction: Direction) { if (busy || over || !document.getElementById('game-end')!.hidden)
        return; const result = moveBoard(board, direction, size); if (!result.changed)
        return; busy = true; if (document.documentElement.dataset.motion !== 'reduced') {
        const animations = result.transitions.filter(t => t.from !== t.to).map(t => { const from = cells[t.from].getBoundingClientRect(), to = cells[t.to].getBoundingClientRect(); return cells[t.from].animate([{ transform: 'translate(0,0)' }, { transform: `translate(${to.x - from.x}px,${to.y - from.y}px)` }], { duration: 110 }); });
        await Promise.all(animations.map(a => a.finished.catch(() => { })));
    } if (c.signal.aborted)
        return; const spawned = spawnTile(result.board); board = spawned.board; score += result.score; render(spawned.index, result.merged); c.setStatus(result.score ? `+${result.score} · A little more possibility.` : 'Make room for the next move.'); check(); busy = false; }
    function add(i: number) { if (over || !document.getElementById('game-end')!.hidden)
        return; if (path.length > 1 && path[path.length - 2] === i)
        path.pop();
    else if (!path.length || validChain(board, [...path, i], kind, size))
        path.push(i); cursor = i; render(); c.setStatus(path.length ? `${path.length} connected · ${path.reduce((n, i) => n + board[i], 0)} total` : 'Choose a number to begin.'); }
    function commit() { if (over || !document.getElementById('game-end')!.hidden)
        return; const result = mergeChain(board, path, kind, size); if (!result) {
        c.setStatus('Connect at least two matching neighbors.');
        return;
    } board = result.board; score += result.score; path = []; render(); c.setStatus(`+${result.score} · A new connection.`); check(); }
    if (linked) {
        extraButton(c, 'Connect ↵', commit);
        extraButton(c, 'Undo', () => { path.pop(); render(); });
        extraButton(c, 'Cancel', () => { path = []; render(); });
        c.grid.addEventListener('pointerdown', e => { const target = (e.target as HTMLElement).closest<HTMLElement>('[data-index]'); if (!target || over)
            return; dragging = true; moved = false; origin = { x: e.clientX, y: e.clientY }; add(Number(target.dataset.index)); c.grid.setPointerCapture(e.pointerId); e.preventDefault(); c.surface.focus({ preventScroll: true }); }, { signal: c.signal });
        c.grid.addEventListener('pointermove', e => { if (!dragging)
            return; if (origin && Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8)
            moved = true; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-index]'); if (target && target.parentElement === c.grid && Number(target.dataset.index) !== path.at(-1))
            add(Number(target.dataset.index)); }, { signal: c.signal });
        c.grid.addEventListener('pointerup', () => { if (dragging && moved)
            commit(); dragging = false; }, { signal: c.signal });
        c.grid.addEventListener('pointercancel', () => { dragging = false; path = []; render(); }, { signal: c.signal });
    }
    else {
        c.surface.addEventListener('pointerdown', e => { origin = { x: e.clientX, y: e.clientY }; c.surface.setPointerCapture(e.pointerId); }, { signal: c.signal });
        c.surface.addEventListener('pointerup', e => { if (!origin)
            return; const dx = e.clientX - origin.x, dy = e.clientY - origin.y; origin = null; if (Math.max(Math.abs(dx), Math.abs(dy)) > 25)
            void move(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up'); }, { signal: c.signal });
        c.surface.addEventListener('pointercancel', () => origin = null, { signal: c.signal });
    }
    const controller: GameController = { key(k) { if (!linked) {
            const dirs: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
            if (dirs[k])
                void move(dirs[k]);
            return;
        } if (k === 'ArrowLeft')
            cursor = Math.max(0, cursor - 1); if (k === 'ArrowRight')
            cursor = Math.min(board.length - 1, cursor + 1); if (k === 'ArrowUp')
            cursor = Math.max(0, cursor - size); if (k === 'ArrowDown')
            cursor = Math.min(board.length - 1, cursor + size); if (k === ' ')
            add(cursor); if (k === 'Enter')
            commit(); if (k === 'Backspace')
            path.pop(); if (k === 'Escape')
            path = []; render(); }, save: persist, dispose() { busy = true; resize.disconnect(); svg.remove(); } };
    render();
    check();
    c.setStatus(linked ? 'Choose a number. Find a connection.' : 'Make your first move.');
    return controller;
}
