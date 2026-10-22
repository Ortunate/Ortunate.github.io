import { initial, legal, play, outcome, inCheck, validPosition, side, type Position, type Move } from '../../lib/tabletop/board';
import { $, button, load, save, confirmNew, keyboardGrid } from './table-ui';
export function mount(root: HTMLElement) {
    const kind = root.dataset.tabletop as Position['kind'], select = $<HTMLSelectElement>('table-mode'), host = $('table-board');
    let mode = 0, human = 0, flipped = false, s: Position, history: Position[] = [], selected = -1, worker: Worker | undefined, id = 0, revision = 0, result = '', failed = false;
    const key = () => `classic:${kind}:${mode}:v1`;
    function cancel() { worker?.terminate(); worker = undefined; id++; revision++; }
    function persist() { save(key(), { state: s, human, result }); }
    function start() { cancel(); const stored = load(key(), (x): x is {
        state: Position;
        human: number;
        result: string;
    } => !!x && validPosition((x as any).state, kind) && [0, 1].includes((x as any).human) && typeof (x as any).result === 'string'); s = stored?.state || initial(kind); human = stored?.human ?? human; result = stored?.result || ''; history = []; selected = -1; failed = false; render(); think(); }
    function update(m: Move) { const n = play(s, m); if (!n)
        return; cancel(); history.push(structuredClone(s)); s = n; selected = -1; result = outcome(s); failed = false; render(); think(); }
    function think() { if (worker || failed || document.hidden || result || mode === 3 || s.turn === human)
        return; const request = ++id, rev = revision; worker = new Worker(new URL('./board-ai.ts', import.meta.url), { type: 'module' }); worker.onmessage = e => { if (e.data.id !== request || e.data.revision !== rev || rev !== revision)
        return; worker?.terminate(); worker = undefined; if (e.data.move)
        update(e.data.move); }; worker.onerror = () => { cancel(); failed = true; $('table-status').textContent = 'AI could not run. Retry AI or switch to two players.'; }; worker.postMessage({ id: request, revision: rev, state: s, budget: [150, 500, 1200][mode] }); }
    function choose(i: number) { if (result || mode !== 3 && s.turn !== human)
        return; const options = legal(s).filter(m => m.from === selected && m.to === i); if (options.length) {
        if (options.length > 1) {
            const area = $('table-actions');
            const chooser = document.createElement('div');
            chooser.setAttribute('role', 'group');
            chooser.setAttribute('aria-label', 'Choose promotion');
            for (const m of options)
                button(`Promote to ${m.promotion?.toUpperCase()}`, () => { chooser.remove(); update(m); }, chooser);
            area.querySelector('[aria-label="Choose promotion"]')?.remove();
            area.append(chooser);
            chooser.querySelector('button')?.focus();
        }
        else
            update(options[0]);
        return;
    } selected = side(s.board[i]) === s.turn ? i : -1; render(); }
    const glyphs: Record<string, string> = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
    const chinese: Record<string, string> = { K: '帅', A: '仕', E: '相', H: '马', R: '车', C: '炮', P: '兵', k: '将', a: '士', e: '象', h: '马', r: '车', c: '炮', p: '卒' };
    function render() { const focused = (document.activeElement as HTMLElement | null)?.dataset.cell; host.replaceChildren(); const grid = document.createElement('div'); grid.className = `chess-board ${kind === 'xiangqi' ? 'xiangqi-board' : ''}`; const width = kind === 'chess' ? 8 : 9; grid.style.gridTemplateColumns = `repeat(${width},1fr)`; const dest = legal(s).filter(m => m.from === selected).map(m => m.to); for (let j = 0; j < s.board.length; j++) {
        const i = flipped ? s.board.length - 1 - j : j, p = s.board[i];
        const b = button(p ? (kind === 'chess' ? glyphs[p] : chinese[p]) : '', () => choose(i), grid);
        b.className = `board-square ${(i % width + Math.floor(i / width)) % 2 ? 'dark' : ''} ${side(p) === 0 ? 'white-piece' : ''} ${selected === i ? 'selected' : ''} ${dest.includes(i) ? 'legal' : ''}`;
        b.dataset.cell = String(i);
        b.setAttribute('aria-label', `${String.fromCharCode(97 + i % width)}${(kind === 'chess' ? 8 : 10) - Math.floor(i / width)} ${p ? (side(p) === 0 ? kind === 'chess' ? 'White' : 'Red' : 'Black') + ' ' + ({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', h: 'horse', e: 'elephant', a: 'advisor', c: 'cannon' } as Record<string, string>)[p.toLowerCase()] : 'empty'}`);
        b.setAttribute('aria-pressed', String(selected === i));
    } keyboardGrid(grid, width); host.append(grid); if (focused !== undefined)
        grid.querySelector<HTMLButtonElement>(`[data-cell="${focused}"]`)?.focus(); $('table-status').textContent = result || `${s.turn === 0 ? kind === 'chess' ? 'White' : 'Red' : 'Black'} to move${inCheck(s) ? ' · Check' : ''}${mode !== 3 && s.turn !== human ? ' · AI thinking…' : ''}`; persist(); }
    button('Undo', () => { cancel(); if (history.length) {
        s = history.pop()!;
        if (mode !== 3 && s.turn !== human && history.length)
            s = history.pop()!;
        result = '';
        selected = -1;
    } render(); think(); });
    button('Flip board', () => { flipped = !flipped; render(); });
    button('Play other color', () => { if (confirmNew()) {
        cancel();
        human = 1 - human;
        flipped = human === 1;
        s = initial(kind);
        history = [];
        result = '';
        render();
        think();
    } });
    button('Resign', () => { if (!result && window.confirm('Resign this game?')) {
        cancel();
        result = `${s.turn === 0 ? 'Black' : kind === 'chess' ? 'White' : 'Red'} wins by resignation`;
        render();
    } });
    if (kind === 'chess')
        button('Claim draw', () => { const claim = outcome(s, true); if (claim) {
            cancel();
            result = claim;
            render();
        }
        else
            $('table-status').textContent = 'No repetition or 50-move draw can be claimed in this position.'; });
    button('Retry AI', () => { cancel(); failed = false; think(); });
    button('Two players', () => { cancel(); mode = 3; select.value = '3'; render(); });
    $('table-new').onclick = () => { if (confirmNew()) {
        cancel();
        s = initial(kind);
        history = [];
        result = '';
        selected = -1;
        failed = false;
        render();
        think();
    } };
    select.onchange = () => { if (confirmNew()) {
        mode = +select.value;
        start();
    }
    else
        select.value = String(mode); };
    $('table-rules').textContent = kind === 'chess' ? 'Select a piece, then a highlighted destination. Castling, en passant and all four promotions are supported. Claim threefold repetition or the 50-move rule with Claim draw; fivefold repetition and 75 moves draw automatically. Common insufficient-material positions are detected; this is not a complete tournament dead-position arbiter.' : 'Select a piece, then a highlighted destination. Horse legs, elephant eyes, cannon screens, river and palace rules apply. Having no legal move loses. Casual repetition: unilateral perpetual check loses; other threefold repetitions draw. Tournament perpetual-chase adjudication is not included.';
    $('table-rules').textContent += ' Easy, Normal and Advanced are lightweight casual opponents. Undo in AI mode returns to your previous decision. Arrow keys move board focus; Enter selects.';
    document.addEventListener('visibilitychange', () => { if (document.hidden) {
        cancel();
        persist();
    }
    else
        think(); });
    window.addEventListener('pagehide', () => { cancel(); persist(); });
    window.addEventListener('pageshow', () => think());
    start();
}
