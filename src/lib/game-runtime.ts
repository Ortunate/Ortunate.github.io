import type { GameState } from './game-state';
export interface GameContext {
    root: HTMLElement;
    surface: HTMLElement;
    grid: HTMLElement;
    canvas: HTMLCanvasElement;
    mode: number;
    slug: string;
    signal: AbortSignal;
    setScore: (value: number) => void;
    setState: (state: GameState) => void;
    setRecord: (value: number) => void;
    setStatus: (message: string) => void;
    finish: (title: string, message: string) => void;
    setRules: (rules: string) => void;
    extra: HTMLElement;
}
export interface GameController {
    key?: (key: string) => void;
    keyUp?: (key: string) => void;
    release?: () => void;
    pause?: () => boolean;
    dispose: () => void;
    save?: () => void;
}
export function gridCells(context: GameContext, width: number, height: number) { context.canvas.hidden = true; context.grid.hidden = false; context.grid.style.gridTemplateColumns = `repeat(${width},minmax(0,1fr))`; context.grid.style.gridTemplateRows = `repeat(${height},minmax(0,1fr))`; context.grid.replaceChildren(); return Array.from({ length: width * height }, (_, i) => { const cell = document.createElement('button'); cell.className = 'game-cell'; cell.type = 'button'; cell.dataset.index = String(i); cell.tabIndex = -1; cell.setAttribute('aria-label', `Row ${Math.floor(i / width) + 1}, column ${i % width + 1}`); context.grid.appendChild(cell); return cell; }); }
export function extraButton(c: GameContext, label: string, action: () => void) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', action, { signal: c.signal }); c.extra.appendChild(b); return b; }
export function focusGrid(c: GameContext, cells: HTMLButtonElement[], width: number, activate: (index: number) => void) { let cursor = 0; const paint = () => cells.forEach((cell, i) => { cell.classList.toggle('cursor', i === cursor); cell.tabIndex = i === cursor ? 0 : -1; }); paint(); cells.forEach((cell, i) => cell.addEventListener('focus', () => { cursor = i; paint(); }, { signal: c.signal })); return (key: string) => { if (key === 'ArrowLeft')
    cursor = cursor % width ? cursor - 1 : cursor;
else if (key === 'ArrowRight')
    cursor = cursor % width < width - 1 ? Math.min(cells.length - 1, cursor + 1) : cursor;
else if (key === 'ArrowUp')
    cursor = Math.max(0, cursor - width);
else if (key === 'ArrowDown')
    cursor = Math.min(cells.length - 1, cursor + width);
else if (key === 'Enter' || key === ' ')
    activate(cursor); paint(); if (key.startsWith('Arrow'))
    cells[cursor].focus({ preventScroll: true }); }; }
