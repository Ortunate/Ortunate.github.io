import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initial, legal, raw, play, inCheck, outcome, validPosition, type Position } from '../src/lib/tabletop/board.ts';
import { deal, draw, move, canMove, validSolitaire, type Card } from '../src/lib/tabletop/cards.ts';
import { newHand, act, rank, payouts, options, bot, botView, validPoker, type Seat } from '../src/lib/tabletop/poker.ts';
const at = (square: string) => (8 - Number(square[1])) * 8 + square.charCodeAt(0) - 97;
function chess(fen: string, turn = 0) { const s = initial('chess'); s.board = fen.split('/').flatMap(row => [...row].flatMap(c => /\d/.test(c) ? Array(+c).fill('') : [c])); s.turn = turn; s.rights = ''; s.history = []; return s; }
function perft(s: Position, n: number): number { return n ? legal(s).reduce((total, m) => total + perft(raw(s, m), n - 1), 0) : 1; }
test('chess initial move tree matches established perft counts', () => { const s = initial('chess'); assert.equal(perft(s, 1), 20); assert.equal(perft(s, 2), 400); assert.equal(perft(s, 3), 8902); assert.ok(validPosition(s, 'chess')); });
test('chess castling needs an unattacked transit square and moves the rook', () => { const s = chess('4k3/8/8/8/8/8/8/R3K2R'); s.rights = 'KQ'; assert.ok(legal(s).some(m => m.to === at('g1'))); const n = play(s, { from: at('e1'), to: at('g1') })!; assert.equal(n.board[at('f1')], 'R'); assert.equal(n.rights, ''); s.board[at('f8')] = 'r'; assert.ok(!legal(s).some(m => m.from === at('e1') && m.to === at('g1'))); });
test('en passant may not expose its king; all promotion choices are available', () => { const s = chess('k3r3/8/8/3pP3/8/8/8/4K3'); s.ep = at('d6'); assert.ok(!legal(s).some(m => m.from === at('e5') && m.to === at('d6'))); s.board[at('e8')] = ''; assert.equal(play(s, { from: at('e5'), to: at('d6') })!.board[at('d5')], ''); const p = chess('7k/P7/8/8/8/8/8/7K'); assert.equal(legal(p).filter(m => m.from === at('a7')).length, 4); });
test('mate precedes 75 move draw, stalemate and claim thresholds', () => { const mate = chess('7k/6Q1/5K2/8/8/8/8/8', 1); mate.half = 150; assert.equal(outcome(mate), 'White wins'); assert.equal(outcome(chess('7k/5Q2/5K2/8/8/8/8/8', 1)), 'Draw by stalemate'); const s = initial('chess'); s.half = 100; assert.equal(outcome(s), ''); assert.match(outcome(s, true), /move count/); s.history = Array(5).fill(s.history[0]); assert.match(outcome(s), /repetition/); });
test('xiangqi initial count, blocked horse, river and flying generals', () => { const s = initial('xiangqi'); assert.equal(legal(s).length, 44); assert.ok(validPosition(s, 'xiangqi')); const blocked = structuredClone(s); blocked.board[73] = 'P'; assert.ok(!legal(blocked).some(m => m.from === 82 && (m.to === 63 || m.to === 65))); const empty = initial('xiangqi'); empty.board = Array(90).fill(''); empty.board[4] = 'k'; empty.board[85] = 'K'; assert.ok(inCheck(empty)); empty.board[49] = 'P'; assert.ok(!inCheck(empty)); assert.ok(!legal(empty).some(m => m.from === 49 && m.to === 48)); });
test('xiangqi cannon needs exactly one screen to capture', () => { const s = initial('xiangqi'); s.board = Array(90).fill(''); s.board[3] = 'k'; s.board[85] = 'K'; s.board[70] = 'C'; s.board[25] = 'r'; assert.ok(!legal(s).some(m => m.from === 70 && m.to === 25)); s.board[52] = 'P'; assert.ok(legal(s).some(m => m.from === 70 && m.to === 25)); s.board[43] = 'P'; assert.ok(!legal(s).some(m => m.from === 70 && m.to === 25)); });
test('solitaire deals conserve cards and reject duplicate saves', () => { for (const kind of ['klondike', 'spider', 'freecell'])
    for (const mode of kind === 'spider' ? [0, 1, 2] : [0]) {
        const s = deal(kind, mode);
        assert.ok(validSolitaire(s, kind, mode));
        const corrupt = structuredClone(s);
        corrupt.piles[0][0] = corrupt.piles[1][0];
        assert.ok(!validSolitaire(corrupt, kind, mode));
        if (kind !== 'freecell') {
            const n = draw(s)!;
            assert.ok(validSolitaire(n, kind, mode));
            assert.equal(s.moves, 0);
        }
    } });
test('Klondike waste is top-only and foundations require suit order', () => { const s = deal('klondike'); s.waste = [{ id: 0, rank: 1, suit: 0, up: true }, { id: 13, rank: 1, suit: 1, up: true }]; assert.ok(!canMove(s, { area: 'waste', pile: 0, index: 0 }, { area: 'foundations', pile: 0, index: 0 })); assert.ok(move(s, { area: 'waste', pile: 0, index: 1 }, { area: 'foundations', pile: 0, index: 0 })); });
test('FreeCell capacity and Spider empty-column deal restriction', () => { const s = deal('freecell'); s.cells = s.cells.map((_, i) => [s.piles[7][i]]); s.piles[0] = [{ id: 5, rank: 6, suit: 0, up: true }, { id: 17, rank: 5, suit: 1, up: true }]; s.piles[1] = [{ id: 19, rank: 7, suit: 1, up: true }]; assert.ok(!canMove(s, { area: 'piles', pile: 0, index: 0 }, { area: 'piles', pile: 1, index: 0 })); s.cells[0] = []; assert.ok(canMove(s, { area: 'piles', pile: 0, index: 0 }, { area: 'piles', pile: 1, index: 0 })); const spider = deal('spider'); spider.piles[0] = []; assert.equal(draw(spider), null); });
const cards = (rs: number[], suits: number[] = rs.map((_, i) => i % 4)): Card[] => rs.map((r, i) => ({ id: i, rank: r, suit: suits[i], up: true }));
test('poker ranking: wheel, broadway, flush, full house, quads, straight flush', () => { const hands = [cards([1, 2, 3, 4, 5]), cards([10, 11, 12, 13, 1]), cards([2, 4, 6, 8, 10], [0, 0, 0, 0, 0]), cards([3, 3, 3, 2, 2]), cards([4, 4, 4, 4, 2]), cards([9, 10, 11, 12, 13], [1, 1, 1, 1, 1])]; for (let i = 1; i < hands.length; i++)
    assert.ok(rank(hands[i]) > rank(hands[i - 1])); assert.equal(rank([...hands[5], ...cards([1, 2])]), rank(hands[5])); });
test('poker side pots exclude folded seats and preserve odd chips', () => { const community = cards([2, 5, 8, 11, 13]); const seats: Seat[] = Array.from({ length: 6 }, (_, i) => ({ chips: 0, hole: cards(i === 0 ? [1, 1] : i === 1 ? [12, 12] : [3, 4]), bet: 0, total: i === 0 ? 20 : i === 1 ? 50 : i === 2 ? 100 : 0, folded: i >= 3, actedAt: 0 })); const out = payouts(seats, community, 5); assert.deepEqual(out.slice(0, 3), [60, 60, 50]); assert.equal(out.reduce((a, b) => a + b), 170); });
test('poker complete hands conserve chips and bots cannot see private deck', () => { let s = newHand(); for (let game = 0; game < 25; game++) {
    for (let turn = 0; !s.over && turn < 200; turn++) {
        assert.ok(validPoker(s));
        const view = botView(s, 1);
        assert.equal('deck' in view, false);
        assert.equal('seats' in view, false);
        const decision = bot(view);
        s = act(s, decision.action, decision.target)!;
        assert.ok(s);
    }
    assert.ok(s.over);
    assert.equal(s.seats.reduce((n, p) => n + p.chips, 0), 1200);
    s = newHand(s);
} });
test('short all-in does not reopen a previous bettor; full raise does', () => { let s = newHand(); s.actor = 0; s.pending = [0, 1, 2]; s.bet = 20; s.raise = 10; s.seats[0].bet = 20; s.seats[0].actedAt = 20; s.seats[1].bet = 20; s.seats[1].chips = 5; s.actor = 1; s = act(s, 'raise', 25)!; s.actor = 0; assert.equal(options(s).canRaise, false); s.bet = 30; assert.equal(options(s).canRaise, true); assert.equal(act(s, 'raise', 31), null); });
