export type GameState = 'ready' | 'running' | 'paused' | 'ended';
/** A finished round cannot accidentally resume from a held key. */
export function createGameState(notify: (state: GameState) => void) {
    let state: GameState = 'ready';
    const set = (next: GameState) => { if (state === 'ended')
        return; state = next; notify(state); };
    return { get value() { return state; }, start() { set('running'); }, pause() { set(state === 'running' ? 'paused' : 'running'); return state !== 'running'; }, suspend() { if (state === 'running')
            set('paused'); }, end() { set('ended'); } };
}
export function validPuzzle(board: unknown, size: number): board is number[] {
    if (!Array.isArray(board) || board.length !== size * size || new Set(board).size !== board.length || !board.every(v => Number.isInteger(v) && v >= 0 && v < board.length))
        return false;
    let inversions = 0;
    for (let i = 0; i < board.length; i++)
        for (let j = i + 1; j < board.length; j++)
            if (board[i] && board[j] && board[i] > board[j])
                inversions++;
    return size % 2 === 1 ? inversions % 2 === 0 : (inversions + size - Math.floor(board.indexOf(0) / size)) % 2 === 1;
}
export function betterRecord(current: unknown, candidate: number) {
    if (!Number.isFinite(candidate) || candidate < 0)
        return null;
    return typeof current === 'number' && Number.isFinite(current) && current >= 0 ? Math.min(current, candidate) : candidate;
}
