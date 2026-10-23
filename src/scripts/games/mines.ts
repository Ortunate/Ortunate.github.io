import { gridCells, extraButton, focusGrid } from '../../lib/game-runtime';
import type { GameContext, GameController } from '../../lib/game-runtime';
import { createMines, revealMines, neighbors } from '../../lib/arcade-rules';
import { read, save } from '../storage';
export const createGame = mines;
function mines(c: GameContext): GameController {
    const [width, height, count] = [[9, 9, 10], [16, 16, 40], [30, 16, 99]][c.mode];
    c.surface.style.minWidth = `${width * 48 + 24}px`;
    c.grid.style.gap = '4px';
    c.grid.style.minHeight = `${height * 48 + 24}px`;
    c.surface.style.aspectRatio = `${width}/${height}`;
    if (width === 30) {
        c.surface.style.minHeight = '300px';
        c.surface.classList.add('expert-mines');
    }
    const cells = gridCells(c, width, height);
    let board: number[] | null = null, revealed = Array(width * height).fill(false), flags = Array(width * height).fill(false), over = false, flagMode = false, elapsed = 0, paused = false, started = false;
    const saveKey = `arcade:mines:${c.mode}:game`;
    const stored = read<any>(saveKey, null);
    if (stored && Array.isArray(stored.board) && stored.board.length === width * height && stored.board.every((v: unknown) => Number.isInteger(v) && Number(v) >= -1 && Number(v) <= 8) && stored.board.filter((v: number) => v === -1).length === count && stored.board.every((v: number, i: number) => v === -1 || v === neighbors(i, width, height).filter(j => stored.board[j] === -1).length) && [stored.revealed, stored.flags].every(a => Array.isArray(a) && a.length === width * height && a.every(v => typeof v === 'boolean')) && Number.isFinite(stored.elapsed) && stored.elapsed >= 0 && !stored.over) {
        board = stored.board;
        revealed = stored.revealed;
        flags = stored.flags;
        elapsed = stored.elapsed;
        started = true;
        paused = true;
        c.setState('paused');
    }
    function persist() { save(saveKey, { board, revealed, flags, elapsed, over }); }
    c.setRules('Click a revealed number to clear its neighbors when the flag count matches. ' + 'Reveal all safe squares. Numbers count neighboring mines. Your first reveal and its neighbors are safe. Right-click or use Flag mode to mark a mine. Arrows move, Enter reveals, F toggles flag mode.');
    const flagButton = extraButton(c, 'Reveal mode (switch to Flag)', () => { flagMode = !flagMode; flagButton.textContent = flagMode ? 'Flag mode (switch to Reveal)' : 'Reveal mode (switch to Flag)'; flagButton.setAttribute('aria-pressed', String(flagMode)); });
    let timer=0;
    function syncTimer(){const ticking=started&&!over&&!paused&&!document.hidden;if(ticking&&!timer)timer=window.setInterval(()=>{elapsed++;status();},1000);else if(!ticking&&timer){clearInterval(timer);timer=0;}}
    function status() { syncTimer();c.setStatus(`${elapsed}s · ${count - flags.filter(Boolean).length} mines unmarked${paused ? ' · Paused' : ''}`); }
    function render() { persist(); cells.forEach((cell, i) => { cell.textContent = flags[i] ? '⚑' : revealed[i] ? (board![i] === -1 ? '✳' : board![i] === 0 ? '' : String(board![i])) : ''; cell.classList.toggle('revealed', revealed[i]); cell.classList.toggle('flagged', flags[i]); cell.classList.toggle('mine', revealed[i] && board?.[i] === -1); cell.style.fontSize = '22px'; cell.setAttribute('aria-label', `Row ${Math.floor(i / width) + 1}, column ${i % width + 1}: ${flags[i] ? 'flagged' : revealed[i] ? board![i] === -1 ? 'mine' : `${board![i]} adjacent mines` : 'covered'}`); }); status(); }
    function act(i: number, flag = flagMode) {
        if (over || paused)
            return;
        if (flag) {
            if (!revealed[i] && (flags[i] || flags.filter(Boolean).length < count))
                flags[i] = !flags[i];
            render();
            return;
        }
        if (revealed[i] && board && board[i] > 0) {
            const around = neighbors(i, width, height);
            if (around.filter(j => flags[j]).length === board[i])
                for (const j of around)
                    if (!revealed[j] && !flags[j])
                        act(j, false);
            return;
        }
        if (flags[i] || revealed[i])
            return;
        if (!board) {
            board = createMines(width, height, count, i);
            started = true;
            c.setState('running');
        }
        revealed = revealMines(board, revealed, flags, i, width, height);
        if (board[i] === -1) {
            over = true;
            board.forEach((v, j) => {
                if (v === -1)
                    revealed[j] = true;
            });
            c.finish('A hidden star.', 'A mine ended this round. A fresh field awaits.');
        }
        else if (revealed.filter(Boolean).length === width * height - count) {
            over = true;
            c.setRecord(elapsed * 1000);
            c.setScore(revealed.filter(Boolean).length);
            c.finish('Every square accounted for.', `Cleared in ${elapsed} seconds.`);
        }
        else
            c.setScore(revealed.filter(Boolean).length);
        render();
    }
    cells.forEach((cell, i) => { cell.addEventListener('click', () => act(i), { signal: c.signal }); cell.addEventListener('contextmenu', e => { e.preventDefault(); act(i, true); }, { signal: c.signal }); });
    const keys = focusGrid(c, cells, width, i => act(i));
    c.root.addEventListener('game-background', () => {
        if (over)
            return;
        paused = true;
        c.setState('paused');
        status();
    }, { signal: c.signal });
    render();
    return { save: persist, key(k) {
            if (k.toLowerCase() === 'f')
                flagButton.click();
            else
                keys(k);
        }, pause() { paused = !paused; c.setState(paused ? 'paused' : started ? 'running' : 'ready'); status(); return paused; }, dispose() {
            clearInterval(timer);
            c.surface.style.minWidth = `${width * 48 + 24}px`;
            c.grid.style.gap = '4px';
            c.grid.style.minHeight = `${height * 48 + 24}px`;
            c.surface.style.aspectRatio = '';
            c.surface.style.minHeight = '';
            c.surface.style.minWidth = '';
            c.grid.style.gap = '';
            c.grid.style.minHeight = '';
            c.surface.classList.remove('expert-mines');
        } };
}
