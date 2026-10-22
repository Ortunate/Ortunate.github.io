import { legal, raw, inCheck, type Position, type Move, side } from '../../lib/tabletop/board';
const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000, h: 320, e: 150, a: 150, c: 350 };
self.onmessage = (e: MessageEvent<{
    id: number;
    revision: number;
    state: Position;
    budget: number;
}>) => { const { id, revision, state, budget } = e.data, deadline = performance.now() + budget; let nodes = 0; const evaluate = (s: Position) => s.board.reduce((sum, p) => sum + (p ? (side(p) === s.turn ? 1 : -1) * (values[p.toLowerCase()] || 0) : 0), 0); const search = (s: Position, depth: number, alpha: number, beta: number): number => { if (++nodes % 128 === 0 && performance.now() > deadline)
    throw new Error('time'); const moves = legal(s); if (!moves.length)
    return inCheck(s) || s.kind === 'xiangqi' ? -100000 - depth : 0; if (!depth)
    return evaluate(s); moves.sort((a, b) => (values[s.board[b.to]?.toLowerCase()] || 0) - (values[s.board[a.to]?.toLowerCase()] || 0)); let best = -Infinity; for (const m of moves) {
    const value = -search(raw(s, m), depth - 1, -beta, -alpha);
    best = Math.max(best, value);
    alpha = Math.max(alpha, value);
    if (alpha >= beta)
        break;
} return best; }; const moves = legal(state); let best: Move | undefined = moves[0]; for (let depth = 1; depth <= 5 && performance.now() < deadline; depth++) {
    let candidate: Move | undefined = best;
    let value = -Infinity;
    try {
        for (const m of moves) {
            const score = -search(raw(state, m), depth - 1, -Infinity, Infinity);
            if (score > value) {
                candidate = m;
                value = score;
            }
            if (performance.now() > deadline)
                throw new Error('time');
        }
        best = candidate;
    }
    catch {
        break;
    }
} self.postMessage({ id, revision, move: best }); };
