import { initial, legal, play, outcome, inCheck, validPosition, side, type Position, type Move } from '../../lib/tabletop/board';
import { $, button, load, save, confirmNew, keyboardGrid } from './table-ui';
export function mount(root: HTMLElement) {
    const kind = root.dataset.tabletop as Position['kind'], select = $<HTMLSelectElement>('table-mode'), host = $('table-board');
    let mode = 0, human = 0, flipped = false, s: Position, history: {
        position: Omit<Position, 'history' | 'checks'>;
        length: number;
        checks: number;
    }[] = [], selected = -1, worker: Worker | undefined, id = 0, revision = 0, result = '', failed = false;
    let computed: Position | undefined, moves: Move[] = [], checked = false, persisted: Position | undefined, persistedHuman = -1, persistedResult = '', working = false;
    let grid: HTMLDivElement | undefined;
    const cells: HTMLButtonElement[] = [];
    function analysis() { if (computed !== s) {
        computed = s;
        moves = legal(s);
        checked = inCheck(s);
    } return moves; }
    const key = () => `classic:${kind}:${mode}:v1`;
    function cancel() { worker?.terminate(); worker = undefined; working = false; id++; revision++; }
    function persist() { if (persisted === s && persistedHuman === human && persistedResult === result)
        return; if (save(key(), { state: s, human, result })) {
        persisted = s;
        persistedHuman = human;
        persistedResult = result;
    } }
    function restore() { const old = history.pop()!; s = { ...old.position, history: s.history.slice(0, old.length), checks: s.checks.slice(0, old.checks) }; }
    function start() {
        cancel();
        const stored = load(key(), (x): x is {
            state: Position;
            human: number;
            result: string;
        } => !!x && validPosition((x as any).state, kind) && [0, 1].includes((x as any).human) && typeof (x as any).result === 'string');
        s = stored?.state || initial(kind);
        human = stored?.human ?? human;
        result = stored?.result || '';
        history = [];
        selected = -1;
        failed = false;
        render();
        think();
    }
    function update(m: Move) { const n = play(s, m, analysis()); if (!n)
        return; id++; revision++; const { history: log, checks, ...position } = s; history.push({ position, length: log.length, checks: checks.length }); s = n; selected = -1; result = outcome(s, false, analysis()); failed = false; render(); think(); }
    function think() {
        if (working || failed || document.hidden || result || mode === 3 || s.turn === human)
            return;
        if (!worker) {
            worker = new Worker(new URL('./board-ai.ts', import.meta.url), { type: 'module' });
            worker.onmessage = e => { if (e.data.id !== id || e.data.revision !== revision)
                return; working = false; if (e.data.move)
                update(e.data.move); };
            worker.onerror = () => { cancel(); failed = true; $('table-status').textContent = 'AI could not run. Retry AI or switch to two players.'; };
        }
        working = true;
        const request = ++id;
        const { history: _history, checks: _checks, ...position } = s;
        worker.postMessage({ id: request, revision, state: { ...position, history: [], checks: [] }, budget: [150, 500, 1200][mode] });
    }
    function choose(i: number) {
        if (result || mode !== 3 && s.turn !== human)
            return;
        const options = analysis().filter(m => m.from === selected && m.to === i);
        if (options.length) {
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
        }
        selected = side(s.board[i]) === s.turn ? i : -1;
        render();
    }
    const glyphs: Record<string, string> = { K: '\u2654', Q: '\u2655', R: '\u2656', B: '\u2657', N: '\u2658', P: '\u2659', k: '\u265A', q: '\u265B', r: '\u265C', b: '\u265D', n: '\u265E', p: '\u265F' };
    const chinese: Record<string, string> = { K: '\u5E05', A: '\u4ED5', E: '\u76F8', H: '\u9A6C', R: '\u8F66', C: '\u70AE', P: '\u5175', k: '\u5C06', a: '\u58EB', e: '\u8C61', h: '\u9A6C', r: '\u8F66', c: '\u70AE', p: '\u5352' };
    function render() {
        const width = kind === 'chess' ? 8 : 9;
        if (!grid) {
            grid = document.createElement('div');
            grid.className = `chess-board ${kind === 'xiangqi' ? 'xiangqi-board' : ''}`;
            grid.style.gridTemplateColumns = `repeat(${width},1fr)`;
            for (let i = 0; i < s.board.length; i++) {
                const b = document.createElement('button');
                b.type = 'button';
                b.dataset.cell = String(i);
                cells.push(b);
                grid.append(b);
            }
            grid.addEventListener('click', e => { const cell = (e.target as Element).closest<HTMLElement>('[data-cell]'); if (cell)
                choose(Number(cell.dataset.cell)); });
            keyboardGrid(grid, width);
            host.append(grid);
        }
        const dest = new Set(analysis().filter(m => m.from === selected).map(m => m.to));
        for (let i = 0; i < s.board.length; i++) {
            const b = cells[i], p = s.board[i];
            const text = p ? (kind === 'chess' ? glyphs[p] : chinese[p]) : '';
            if (b.textContent !== text)
                b.textContent = text;
            const classes = `board-square ${(i % width + Math.floor(i / width)) % 2 ? 'dark' : ''} ${side(p) === 0 ? 'white-piece' : ''} ${selected === i ? 'selected' : ''} ${dest.has(i) ? 'legal' : ''}`;
            if (b.className !== classes)
                b.className = classes;
            const label = `${String.fromCharCode(97 + i % width)}${(kind === 'chess' ? 8 : 10) - Math.floor(i / width)} ${p ? (side(p) === 0 ? kind === 'chess' ? 'White' : 'Red' : 'Black') + ' ' + ({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', h: 'horse', e: 'elephant', a: 'advisor', c: 'cannon' } as Record<string, string>)[p.toLowerCase()] : 'empty'}`;
            if (b.getAttribute('aria-label') !== label)
                b.setAttribute('aria-label', label);
            b.setAttribute('aria-pressed', String(selected === i));
        }
        if (grid.dataset.flipped !== String(flipped)) {
            const focused = document.activeElement as HTMLElement | null;
            for (const b of flipped ? [...cells].reverse() : cells)
                grid.append(b);
            grid.dataset.flipped = String(flipped);
            if (focused?.dataset.cell !== undefined)
                focused.focus();
        }
        $('table-status').textContent = result || `${s.turn === 0 ? kind === 'chess' ? 'White' : 'Red' : 'Black'} to move${checked ? ' \u00B7 Check' : ''}${mode !== 3 && s.turn !== human ? ' \u00B7 AI thinking\u2026' : ''}`;
        persist();
    }
    button('Undo', () => {
        cancel();
        if (history.length) {
            restore();
            if (mode !== 3 && s.turn !== human && history.length)
                restore();
            result = '';
            selected = -1;
        }
        render();
        think();
    });
    button('Flip board', () => { flipped = !flipped; render(); });
    button('Play other color', () => {
        if (confirmNew()) {
            cancel();
            human = 1 - human;
            flipped = human === 1;
            s = initial(kind);
            history = [];
            result = '';
            render();
            think();
        }
    });
    button('Resign', () => {
        if (!result && window.confirm('Resign this game?')) {
            cancel();
            result = `${s.turn === 0 ? 'Black' : kind === 'chess' ? 'White' : 'Red'} wins by resignation`;
            render();
        }
    });
    if (kind === 'chess')
        button('Claim draw', () => {
            const claim = outcome(s, true, analysis());
            if (claim) {
                cancel();
                result = claim;
                render();
            }
            else
                $('table-status').textContent = 'No repetition or 50-move draw can be claimed in this position.';
        });
    button('Retry AI', () => { cancel(); failed = false; think(); });
    button('Two players', () => { cancel(); mode = 3; persisted = undefined; select.value = '3'; render(); });
    $('table-new').onclick = () => {
        if (confirmNew()) {
            cancel();
            s = initial(kind);
            history = [];
            result = '';
            selected = -1;
            failed = false;
            render();
            think();
        }
    };
    select.onchange = () => {
        if (confirmNew()) {
            mode = +select.value;
            start();
        }
        else
            select.value = String(mode);
    };
    $('table-rules').textContent = kind === 'chess' ? 'Select a piece, then a highlighted destination. Castling, en passant and all four promotions are supported. Claim threefold repetition or the 50-move rule with Claim draw; fivefold repetition and 75 moves draw automatically. Common insufficient-material positions are detected; this is not a complete tournament dead-position arbiter.' : 'Select a piece, then a highlighted destination. Horse legs, elephant eyes, cannon screens, river and palace rules apply. Having no legal move loses. Casual repetition: unilateral perpetual check loses; other threefold repetitions draw. Tournament perpetual-chase adjudication is not included.';
    $('table-rules').textContent += ' Easy, Normal and Advanced are lightweight casual opponents. Undo in AI mode returns to your previous decision. Arrow keys move board focus; Enter selects.';
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            cancel();
            persist();
        }
        else
            think();
    });
    window.addEventListener('pagehide', () => { cancel(); persist(); });
    window.addEventListener('pageshow', () => think());
    start();
}
