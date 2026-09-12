import { validPuzzle } from '../../lib/game-state';
import { gridCells, extraButton, focusGrid } from '../../lib/game-runtime';
import type { GameContext, GameController } from '../../lib/game-runtime';
import { shuffle, createMines, revealMines, newPuzzle, slidePuzzle, solvedPuzzle, stepLife } from '../../lib/arcade-rules';
import { read, save } from '../storage';
export function createGame(c: GameContext): GameController { if (c.slug === 'mines')
    return mines(c); if (c.slug === 'memory')
    return memory(c); if (c.slug === 'puzzle')
    return puzzle(c); return life(c); }
function mines(c: GameContext): GameController {
    const [width, height, count] = [[9, 9, 10], [16, 16, 40], [30, 16, 99]][c.mode];
    c.surface.style.aspectRatio = `${width}/${height}`;
    if (width === 30) {
        c.surface.style.minHeight = '300px';
        c.surface.classList.add('expert-mines');
    }
    const cells = gridCells(c, width, height);
    let board: number[] | null = null, revealed = Array(width * height).fill(false), flags = Array(width * height).fill(false), over = false, flagMode = false, elapsed = 0, paused = false, started = false;
    c.setRules('Reveal all safe squares. Numbers count neighboring mines. Your first reveal and its neighbors are safe. Right-click or use Flag mode to mark a mine. Arrows move, Enter reveals, F toggles flag mode.');
    const flagButton = extraButton(c, 'Flag mode: Off', () => { flagMode = !flagMode; flagButton.textContent = `Flag mode: ${flagMode ? 'On' : 'Off'}`; flagButton.setAttribute('aria-pressed', String(flagMode)); });
    const timer = window.setInterval(() => { if (started && !over && !paused && !document.hidden) {
        elapsed++;
        status();
    } }, 1000);
    function status() { c.setStatus(`${elapsed}s · ${count - flags.filter(Boolean).length} mines unmarked${paused ? ' · Paused' : ''}`); }
    function render() { cells.forEach((cell, i) => { cell.textContent = flags[i] ? '⚑' : revealed[i] ? (board![i] === -1 ? '✳' : board![i] === 0 ? '' : String(board![i])) : ''; cell.classList.toggle('revealed', revealed[i]); cell.classList.toggle('flagged', flags[i]); cell.classList.toggle('mine', revealed[i] && board?.[i] === -1); cell.style.fontSize = width > 16 ? '12px' : width > 9 ? '16px' : '22px'; cell.setAttribute('aria-label', `Row ${Math.floor(i / width) + 1}, column ${i % width + 1}: ${flags[i] ? 'flagged' : revealed[i] ? board![i] === -1 ? 'mine' : `${board![i]} adjacent mines` : 'covered'}`); }); status(); }
    function act(i: number, flag = flagMode) { if (over || paused)
        return; if (flag) {
        if (!revealed[i] && (flags[i] || flags.filter(Boolean).length < count))
            flags[i] = !flags[i];
        render();
        return;
    } if (flags[i] || revealed[i])
        return; if (!board) {
        board = createMines(width, height, count, i);
        started = true;
        c.setState('running');
    } revealed = revealMines(board, revealed, flags, i, width, height); if (board[i] === -1) {
        over = true;
        board.forEach((v, j) => { if (v === -1)
            revealed[j] = true; });
        c.finish('A hidden star.', 'A mine ended this round. A fresh field awaits.');
    }
    else if (revealed.filter(Boolean).length === width * height - count) {
        over = true;
        c.setRecord(elapsed * 1000);
        c.setScore(revealed.filter(Boolean).length);
        c.finish('Every square accounted for.', `Cleared in ${elapsed} seconds.`);
    }
    else
        c.setScore(revealed.filter(Boolean).length); render(); }
    cells.forEach((cell, i) => { cell.addEventListener('click', () => act(i), { signal: c.signal }); cell.addEventListener('contextmenu', e => { e.preventDefault(); act(i, true); }, { signal: c.signal }); });
    const keys = focusGrid(c, cells, width, i => act(i));
    c.root.addEventListener('game-background', () => { if (over)
        return; paused = true; c.setState('paused'); status(); }, { signal: c.signal });
    render();
    return { key(k) { if (k.toLowerCase() === 'f')
            flagButton.click();
        else
            keys(k); }, pause() { paused = !paused; c.setState(paused ? 'paused' : started ? 'running' : 'ready'); status(); return paused; }, dispose() { clearInterval(timer); c.surface.style.aspectRatio = ''; c.surface.style.minHeight = ''; c.surface.classList.remove('expert-mines'); } };
}
function memory(c: GameContext): GameController {
    const width = c.mode % 2 ? 6 : 4, height = 4, timed = c.mode >= 2;
    const symbols = ['✦', '◈', '☾', '⌘', '✿', '☀', '♜', '♧', '♫', '∞', '⚡', '◎'];
    const deck = shuffle([...symbols.slice(0, width * height / 2), ...symbols.slice(0, width * height / 2)]), cells = gridCells(c, width, height);
    let open: number[] = [], matched = new Set<number>(), moves = 0, remaining = width === 6 ? 120 : 90, started = false, paused = false, over = false, locked = false, timeout = 0;
    c.setRules('Reveal two cards at a time. Find all matching pairs. Arrows move focus; Enter or Space flips a card.' + (timed ? ` Finish before ${remaining} seconds run out.` : ' Take your time. Fewer turns make a better score.'));
    function render() { cells.forEach((cell, i) => { const shown = open.includes(i) || matched.has(i); cell.textContent = shown ? deck[i] : '·'; cell.classList.toggle('matched', matched.has(i)); cell.classList.toggle('filled', open.includes(i)); cell.setAttribute('aria-label', `Card ${i + 1}: ${shown ? deck[i] : 'face down'}${matched.has(i) ? ', matched' : ''}`); }); c.setStatus(`${matched.size / 2} / ${deck.length / 2} pairs · ${moves} turns${timed ? ` · ${remaining}s` : ''}${paused ? ' · Paused' : ''}`); }
    function flip(i: number) { if (over || paused || locked || matched.has(i) || open.includes(i))
        return; started = true; c.setState('running'); open.push(i); if (open.length === 2) {
        moves++;
        if (deck[open[0]] === deck[open[1]]) {
            open.forEach(i => matched.add(i));
            open = [];
            c.setScore(matched.size * 50);
            if (matched.size === deck.length) {
                over = true;
                c.setScore(Math.max(1, deck.length * 100 - moves * 10 + (timed ? remaining : 0)));
                c.finish('A perfect recollection.', `${moves} turns. Every pair found.`);
            }
        }
        else {
            locked = true;
            let left = 850, last = performance.now();
            const close = () => { const now = performance.now(); if (!paused && !document.hidden)
                left -= now - last; last = now; if (left > 0) {
                timeout = window.setTimeout(close, 50);
                return;
            } open = []; locked = false; render(); };
            timeout = window.setTimeout(close, 50);
        }
    } render(); }
    cells.forEach((cell, i) => cell.addEventListener('click', () => flip(i), { signal: c.signal }));
    const key = focusGrid(c, cells, width, flip);
    const timer = window.setInterval(() => { if (timed && started && !over && !paused && !document.hidden) {
        remaining--;
        if (remaining <= 0) {
            over = true;
            c.finish('Time slipped away.', `${matched.size / 2} pairs found. Try another round.`);
        }
        render();
    } }, 1000);
    c.root.addEventListener('game-background', () => { if (over)
        return; paused = true; c.setState('paused'); render(); }, { signal: c.signal });
    render();
    return { key, pause() { paused = !paused; c.setState(paused ? 'paused' : started ? 'running' : 'ready'); render(); return paused; }, dispose() { clearTimeout(timeout); clearInterval(timer); } };
}
function puzzle(c: GameContext): GameController {
    const size = c.mode % 2 ? 4 : 3, key = `arcade:puzzle:${c.mode}:game`;
    const stored = read<{
        board: number[];
        moves: number;
    } | null>(key, null);
    const valid = stored && validPuzzle(stored.board, size) && Number.isSafeInteger(stored.moves) && stored.moves >= 0;
    let board = valid ? stored.board : newPuzzle(size), moves = valid ? stored.moves : 0, over = false;
    const cells = gridCells(c, size, size);
    const persist = () => save(key, { board, moves });
    c.setRules('Move a tile next to the empty space into it. Put the tiles in order, with the empty space at bottom right. Every shuffle is solvable. Arrow keys move the empty space; click or tap a neighboring tile. Gradient tiles keep small numbers as a guide.');
    function render() { cells.forEach((cell, i) => { const v = board[i]; cell.textContent = v ? String(v) : ''; cell.className = `game-cell ${v ? 'filled' : 'empty'}`; cell.style.setProperty('--tile-hue', String(c.mode >= 2 ? 180 + v / (size * size) * 140 : 260)); cell.style.setProperty('--tile-light', `${c.mode >= 2 ? 25 + v / (size * size) * 35 : 30}%`); cell.tabIndex = v ? 0 : -1; cell.setAttribute('aria-label', v ? `Tile ${v}` : 'Empty space'); }); c.setScore(moves); c.setStatus(`${moves} moves · Slide a tile into the empty space.`); persist(); }
    function move(index: number) { if (over)
        return; const next = slidePuzzle(board, index, size); if (next === board)
        return; board = next; moves++; c.setState('running'); render(); if (solvedPuzzle(board)) {
        over = true;
        c.setRecord(moves);
        c.finish('Everything in its place.', `Solved in ${moves} moves.`);
    } }
    cells.forEach((cell, i) => cell.addEventListener('click', () => move(i), { signal: c.signal }));
    render();
    if (solvedPuzzle(board)) {
        over = true;
        c.setRecord(moves);
        c.finish('Everything in its place.', `Restored your completed puzzle: ${moves} moves.`);
    }
    return { key(k) { const zero = board.indexOf(0), offset: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -size, ArrowDown: size }; if (offset[k])
            move(zero + offset[k]);
        else if ((k === 'Enter' || k === ' ') && document.activeElement instanceof HTMLElement && document.activeElement.dataset.index)
            move(Number(document.activeElement.dataset.index)); }, save: persist, dispose() { } };
}
function life(c: GameContext): GameController {
    const width = 30, height = 30;
    let board = Array(width * height).fill(0), generation = 0, running = false, drawing = false, paintValue = 1;
    const cells = gridCells(c, width, height), painted = Array(width * height).fill(-1);
    c.grid.style.gap = '1px';
    c.grid.style.padding = '8px';
    cells.forEach(cell => cell.style.borderRadius = '1px');
    c.setRules('Draw cells by dragging, then Run or Step. A cell survives with 2 or 3 neighbors; an empty cell is born with exactly 3. Arrows choose a cell; Space or Enter toggles it. Fixed edges end the world; Wraparound joins opposite edges.');
    function render() { cells.forEach((cell, i) => { if (painted[i] === board[i])
        return; painted[i] = board[i]; cell.classList.toggle('matched', board[i] === 1); cell.setAttribute('aria-label', `Cell ${i + 1}: ${board[i] ? 'alive' : 'empty'}`); }); c.setState(running ? 'running' : 'paused'); c.setScore(generation); c.setStatus(`Generation ${generation} · ${board.filter(Boolean).length} living cells · ${running ? 'Running' : 'Paused'}`); }
    function seed(kind: string) { running = false; board.fill(0); generation = 0; if (kind === 'Random')
        board = board.map(() => Math.random() < .25 ? 1 : 0);
    else if (kind === 'Glider')
        [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]].forEach(([x, y]) => board[(y + 12) * width + x + 12] = 1);
    else if (kind === 'Pulsar') {
        for (const n of [2, 3, 4, 8, 9, 10])
            for (const fixed of [0, 5, 7, 12]) {
                board[(n + 8) * width + fixed + 8] = 1;
                board[(fixed + 8) * width + n + 8] = 1;
            }
    } render(); }
    function step() { board = stepLife(board, width, height, c.mode === 1); generation++; render(); }
    const run = extraButton(c, 'Run', () => { running = !running; run.textContent = running ? 'Pause' : 'Run'; render(); });
    extraButton(c, 'Step', step);
    ['Glider', 'Pulsar', 'Random', 'Clear'].forEach(kind => extraButton(c, kind, () => { seed(kind); run.textContent = 'Run'; }));
    const timer = window.setInterval(() => { if (running && !document.hidden)
        step(); }, 130);
    function toggle(i: number) { board[i] = 1 - board[i]; render(); }
    c.grid.addEventListener('pointerdown', e => { const target = (e.target as HTMLElement).closest<HTMLElement>('[data-index]'); if (!target)
        return; e.preventDefault(); target.focus({ preventScroll: true }); drawing = true; paintValue = 1 - board[Number(target.dataset.index)]; board[Number(target.dataset.index)] = paintValue; c.grid.setPointerCapture(e.pointerId); render(); }, { signal: c.signal });
    c.grid.addEventListener('pointermove', e => { if (!drawing)
        return; const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-index]'); if (target && target.parentElement === c.grid) {
        board[Number(target.dataset.index)] = paintValue;
        render();
    } }, { signal: c.signal });
    for (const event of ['pointerup', 'pointercancel'])
        c.grid.addEventListener(event, () => drawing = false, { signal: c.signal });
    const key = focusGrid(c, cells, width, toggle);
    c.root.addEventListener('game-background', () => { running = false; drawing = false; run.textContent = 'Run'; render(); }, { signal: c.signal });
    seed('Glider');
    return { key, dispose() { clearInterval(timer); c.grid.style.gap = ''; c.grid.style.padding = ''; } };
}
