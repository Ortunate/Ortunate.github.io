export type Position = {
    kind: 'chess' | 'xiangqi';
    board: string[];
    turn: number;
    rights: string;
    ep: number;
    half: number;
    history: string[];
    checks: number[];
};
export type Move = {
    from: number;
    to: number;
    promotion?: string;
};
export const side = (p: string) => !p ? -1 : p === p.toUpperCase() ? 0 : 1;
export function initial(kind: Position['kind']): Position { const rows = kind === 'chess' ? ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'] : ['rheakaehr', '.........', '.c.....c.', 'p.p.p.p.p', '.........', '.........', 'P.P.P.P.P', '.C.....C.', '.........', 'RHEAKAEHR']; const s: Position = { kind, board: rows.join('').split('').map(p => p === '.' ? '' : p), turn: 0, rights: kind === 'chess' ? 'KQkq' : '', ep: -1, half: 0, history: [], checks: [] }; s.history = [key(s)]; return s; }
export function key(s: Position) { let ep = s.ep; if (ep >= 0) {
    const w = 8, dir = s.turn === 0 ? -1 : 1;
    const row = Math.floor(ep / w) - dir;
    const possible = [ep % w - 1, ep % w + 1].filter(x => x >= 0 && x < w).some(x => { const from = row * w + x; if (s.board[from] !== (s.turn === 0 ? 'P' : 'p'))
        return false; return !inCheck(raw(s, { from, to: ep }), s.turn); });
    if (!possible)
        ep = -1;
} return s.board.map(p => p || '.').join('') + '/' + s.turn + '/' + s.rights + '/' + ep; }
function pseudo(s: Position, i: number, attack = false): Move[] {
    const b = s.board, p = b[i], who = side(p), type = p.toLowerCase(), w = s.kind === 'chess' ? 8 : 9, h = s.kind === 'chess' ? 8 : 10, x = i % w, y = Math.floor(i / w), out: Move[] = [];
    const inside = (a: number, c: number) => a >= 0 && a < w && c >= 0 && c < h;
    const add = (a: number, c: number) => { if (!inside(a, c))
        return; const j = c * w + a; if (side(b[j]) !== who) {
        if (s.kind === 'chess' && type === 'p' && (c === 0 || c === 7) && !attack)
            for (const promotion of ['q', 'r', 'b', 'n'])
                out.push({ from: i, to: j, promotion });
        else
            out.push({ from: i, to: j });
    } };
    const ray = (dx: number, dy: number, cannon = false) => { let screen = false; for (let a = x + dx, c = y + dy; inside(a, c); a += dx, c += dy) {
        const j = c * w + a;
        if (cannon) {
            if (!screen) {
                if (b[j])
                    screen = true;
                else if (!attack)
                    add(a, c);
            }
            else if (b[j]) {
                add(a, c);
                break;
            }
        }
        else {
            add(a, c);
            if (b[j])
                break;
        }
    } };
    const orth = [[1, 0], [-1, 0], [0, 1], [0, -1]], diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    if (s.kind === 'chess') {
        if (type === 'p') {
            const d = who === 0 ? -1 : 1;
            if (attack) {
                for (const dx of [-1, 1])
                    add(x + dx, y + d);
            }
            else {
                if (inside(x, y + d) && !b[(y + d) * w + x]) {
                    add(x, y + d);
                    if (y === (who === 0 ? 6 : 1) && !b[(y + 2 * d) * w + x])
                        add(x, y + 2 * d);
                }
                for (const dx of [-1, 1])
                    if (inside(x + dx, y + d) && (b[(y + d) * w + x + dx] || s.ep === (y + d) * w + x + dx))
                        add(x + dx, y + d);
            }
        }
        if (type === 'n')
            for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]])
                add(x + dx, y + dy);
        if ('rbq'.includes(type))
            for (const [dx, dy] of type === 'r' ? orth : type === 'b' ? diag : [...orth, ...diag])
                ray(dx, dy);
        if (type === 'k') {
            for (const [dx, dy] of [...orth, ...diag])
                add(x + dx, y + dy);
            if (!attack && i === (who === 0 ? 60 : 4) && !inCheck(s, who))
                for (const [right, rook, dest, between] of (who === 0 ? [['K', 63, 62, [61, 62]], ['Q', 56, 58, [57, 58, 59]]] : [['k', 7, 6, [5, 6]], ['q', 0, 2, [1, 2, 3]]]) as [
                    string,
                    number,
                    number,
                    number[]
                ][]) {
                    if (s.rights.includes(right) && b[rook] === (who === 0 ? 'R' : 'r') && between.every(j => !b[j]) && !inCheck(raw(s, { from: i, to: i + (dest > i ? 1 : -1) }), who) && !inCheck(raw(s, { from: i, to: dest }), who))
                        out.push({ from: i, to: dest });
                }
        }
    }
    else {
        const palace = (a: number, c: number) => a >= 3 && a <= 5 && (who === 0 ? c >= 7 : c <= 2);
        if (type === 'r' || type === 'c')
            for (const [dx, dy] of orth)
                ray(dx, dy, type === 'c');
        if (type === 'h')
            for (const [dx, dy] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
                const leg = (y + (Math.abs(dy) === 2 ? Math.sign(dy) : 0)) * w + x + (Math.abs(dx) === 2 ? Math.sign(dx) : 0);
                if (!b[leg])
                    add(x + dx, y + dy);
            }
        if (type === 'e')
            for (const [dx, dy] of diag) {
                const a = x + 2 * dx, c = y + 2 * dy;
                if ((who === 0 ? c >= 5 : c <= 4) && !b[(y + dy) * w + x + dx])
                    add(a, c);
            }
        if (type === 'a')
            for (const [dx, dy] of diag)
                if (palace(x + dx, y + dy))
                    add(x + dx, y + dy);
        if (type === 'k') {
            for (const [dx, dy] of orth)
                if (palace(x + dx, y + dy))
                    add(x + dx, y + dy);
            for (const d of [-1, 1])
                for (let c = y + d; c >= 0 && c < h; c += d) {
                    const q = b[c * w + x];
                    if (q) {
                        if (q.toLowerCase() === 'k' && side(q) !== who)
                            add(x, c);
                        break;
                    }
                }
        }
        if (type === 'p') {
            add(x, y + (who === 0 ? -1 : 1));
            if (who === 0 ? y <= 4 : y >= 5) {
                add(x - 1, y);
                add(x + 1, y);
            }
        }
    }
    return out;
}
export function inCheck(s: Position, who = s.turn) { const king = s.board.indexOf(who === 0 ? 'K' : 'k'); if (king < 0)
    return true; return s.board.some((p, i) => side(p) === 1 - who && pseudo(s, i, true).some(m => m.to === king)); }
export function raw(s: Position, m: Move): Position {
    const n = { ...s, board: [...s.board] }, p = n.board[m.from], captured = n.board[m.to], who = side(p);
    n.board[m.to] = m.promotion ? (who === 0 ? m.promotion.toUpperCase() : m.promotion) : p;
    n.board[m.from] = '';
    n.ep = -1;
    n.turn = 1 - s.turn;
    n.half = p.toLowerCase() === 'p' || captured ? 0 : s.half + 1;
    if (s.kind === 'chess') {
        if (p.toLowerCase() === 'p') {
            if (m.to === s.ep && !captured)
                n.board[m.to + (who === 0 ? 8 : -8)] = '';
            if (Math.abs(m.to - m.from) === 16)
                n.ep = (m.from + m.to) / 2;
        }
        if (p.toLowerCase() === 'k') {
            n.rights = n.rights.replace(who === 0 ? /[KQ]/g : /[kq]/g, '');
            if (Math.abs(m.to - m.from) === 2) {
                const r = m.to > m.from ? m.from + 3 : m.from - 4;
                n.board[(m.from + m.to) / 2] = n.board[r];
                n.board[r] = '';
            }
        }
        for (const [square, right] of [[0, 'q'], [7, 'k'], [56, 'Q'], [63, 'K']] as const)
            if (m.from === square || m.to === square)
                n.rights = n.rights.replace(right, '');
    }
    return n;
}
export function legal(s: Position) { return s.board.flatMap((p, i) => side(p) === s.turn ? pseudo(s, i).filter(m => s.board[m.to].toLowerCase() !== 'k' && !inCheck(raw(s, m), s.turn)) : []); }
export function play(s: Position, m: Move, moves=legal(s)) { if (!moves.some(x => x.from === m.from && x.to === m.to && x.promotion === m.promotion))
    return null; const n = raw(s, m); n.history = [...s.history, key(n)]; n.checks = [...s.checks, inCheck(n) ? s.turn : -1]; return n; }
export function outcome(s: Position, claim = false, moves=legal(s)): string {
    if (!moves.length)
        return inCheck(s) || s.kind === 'xiangqi' ? `${s.turn === 0 ? 'Black' : s.kind === 'chess' ? 'White' : 'Red'} wins` : 'Draw by stalemate';
    const count = s.history.filter(k => k === key(s)).length;
    if (s.kind === 'xiangqi' && count >= 3) {
        const occurrences = s.history.flatMap((k, i) => k === key(s) ? [i] : []), start = occurrences.at(-3)!;
        const checks = s.checks.slice(start);
        const offenders = [0, 1].filter(who => checks.filter((_, i) => (s.turn + i) % 2 === who).length > 0 && checks.filter((_, i) => (s.turn + i) % 2 === who).every(c => c === who));
        return offenders.length === 1 ? `${offenders[0] === 0 ? 'Black' : 'Red'} wins (perpetual check)` : 'Draw by repetition';
    }
    if (s.kind === 'chess') {
        if (count >= 5 || claim && count >= 3)
            return 'Draw by repetition';
        if (s.half >= 150 || claim && s.half >= 100)
            return 'Draw by move count';
        const pieces = s.board.flatMap((p, i) => p && p.toLowerCase() !== 'k' ? [{ p: p.toLowerCase(), i }] : []);
        if (!pieces.length || pieces.length === 1 && 'bn'.includes(pieces[0].p) || pieces.every(p => p.p === 'b') && new Set(pieces.map(p => (p.i % 8 + Math.floor(p.i / 8)) % 2)).size === 1)
            return 'Draw by insufficient material';
    }
    return '';
}
export function validPosition(x: unknown, kind: Position['kind']): x is Position { try {
    const s = x as Position;
    return s.kind === kind && s.board.length === (kind === 'chess' ? 64 : 90) && s.board.every(p => typeof p === 'string' && (!p || (kind === 'chess' ? /^[kqrbnp]$/i : /^[kraehcp]$/i).test(p))) && s.board.filter(p => p === 'K').length === 1 && s.board.filter(p => p === 'k').length === 1 && [0, 1].includes(s.turn) && typeof s.rights === 'string' && /^[KQkq]*$/.test(s.rights) && Number.isInteger(s.ep) && s.ep >= -1 && s.ep < s.board.length && Number.isInteger(s.half) && s.half >= 0 && Array.isArray(s.history) && s.history.length > 0 && s.history.length <= 20000 && s.history.every(k => typeof k === 'string') && Array.isArray(s.checks) && s.checks.every(c => [-1, 0, 1].includes(c)) && !inCheck(s, 1 - s.turn);
}
catch {
    return false;
} }
