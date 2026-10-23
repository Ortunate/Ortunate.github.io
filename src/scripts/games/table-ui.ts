export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
export function button(text: string, fn: () => void, parent: HTMLElement = $('table-actions')) { const b = document.createElement('button'); b.type = 'button'; b.className = 'button'; b.textContent = text; b.addEventListener('click', fn); parent.append(b); return b; }
export function load<T>(key: string, valid: (x: unknown) => x is T): T | null { try {
    const x = JSON.parse(localStorage.getItem(key) || 'null');
    if (valid(x))
        return x;
    if (x)
        $('table-save').textContent = 'An invalid save was ignored. A fresh game is ready.';
}
catch { } return null; }
export function save(key: string, value: unknown) { try {
    localStorage.setItem(key, JSON.stringify(value));return true;
}
catch {
    $('table-save').textContent = 'Storage unavailable or full. Keep this page open to keep your game.';return false;
} }
export function confirmNew() { return window.confirm('Replace this round with a new game?'); }
export function keyboardGrid(board: HTMLElement, width: number) { board.addEventListener('keydown', e => { const cells = Array.from(board.querySelectorAll<HTMLButtonElement>('button[data-cell]')); const index = cells.indexOf(document.activeElement as HTMLButtonElement); const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -width, ArrowDown: width }; if (index >= 0 && e.key in delta) {
    e.preventDefault();
    cells[Math.max(0, Math.min(cells.length - 1, index + delta[e.key]))]?.focus();
} }); }
