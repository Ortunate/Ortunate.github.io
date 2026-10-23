import { deck, shuffle, type Card } from './cards.ts';
export type Seat = {
    chips: number;
    hole: Card[];
    bet: number;
    total: number;
    folded: boolean;
    actedAt: number;
};
export type Poker = {
    seats: Seat[];
    deck: Card[];
    community: Card[];
    dealer: number;
    actor: number;
    street: number;
    bet: number;
    raise: number;
    pending: number[];
    log: string;
    over: boolean;
};
// Lexicographically ordered category and kickers, encoded in base 15.
export function rank(cards: Card[]): number { let best = 0; for (let a = 0; a < cards.length - 4; a++)
    for (let b = a + 1; b < cards.length - 3; b++)
        for (let c = b + 1; c < cards.length - 2; c++)
            for (let d = c + 1; d < cards.length - 1; d++)
                for (let e = d + 1; e < cards.length; e++) {
                    const hand = [cards[a], cards[b], cards[c], cards[d], cards[e]], rs = hand.map(c => c.rank === 1 ? 14 : c.rank).sort((a, b) => b - a), groups = [...new Set(rs)].map(r => ({ r, n: rs.filter(x => x === r).length })).sort((a, b) => b.n - a.n || b.r - a.r), flush = hand.every(c => c.suit === hand[0].suit), straight = new Set(rs).size === 5 ? (rs[0] - rs[4] === 4 ? rs[0] : rs.join(',') === '14,5,4,3,2' ? 5 : 0) : 0;
                    let v: number[];
                    if (flush && straight)
                        v = [8, straight];
                    else if (groups[0].n === 4)
                        v = [7, groups[0].r, groups[1].r];
                    else if (groups[0].n === 3 && groups[1].n === 2)
                        v = [6, groups[0].r, groups[1].r];
                    else if (flush)
                        v = [5, ...rs];
                    else if (straight)
                        v = [4, straight];
                    else if (groups[0].n === 3)
                        v = [3, ...groups.map(g => g.r)];
                    else if (groups[0].n === 2 && groups[1].n === 2)
                        v = [2, ...groups.map(g => g.r)];
                    else if (groups[0].n === 2)
                        v = [1, ...groups.map(g => g.r)];
                    else
                        v = [0, ...rs];
                    while (v.length < 6)
                        v.push(0);
                    best = Math.max(best, v.reduce((n, x) => n * 15 + x, 0));
                } return best; }
export function payouts(seats: Seat[], community: Card[], dealer: number) { const ranks=seats.map(p=>p.folded?0:rank([...p.hole,...community]));
    const out = seats.map(() => 0), levels = [...new Set(seats.map(s => s.total).filter(Boolean))].sort((a, b) => a - b); let previous = 0; for (const level of levels) {
    const contributors = seats.flatMap((s, i) => s.total >= level ? [i] : []), amount = (level - previous) * contributors.length;
    previous = level;
    const eligible = contributors.filter(i => !seats[i].folded);
    if (!eligible.length)
        continue;
    const scores = eligible.map(i => ranks[i]), best = Math.max(...scores), winners = eligible.filter((_, i) => scores[i] === best).sort((a, b) => (a - dealer + 5) % 6 - (b - dealer + 5) % 6);
    for (const i of winners)
        out[i] += Math.floor(amount / winners.length);
    for (let r = 0; r < amount % winners.length; r++)
        out[winners[r]]++;
} return out; }
function next(s: Poker, i: number) { for (let n = 1; n <= 6; n++) {
    const j = (i + n) % 6;
    if (s.seats[j].chips > 0)
        return j;
} return i; }
function order(s: Poker, start: number) { return Array.from({ length: 6 }, (_, n) => (start + n) % 6).filter(i => !s.seats[i].folded && s.seats[i].chips > 0); }
function pay(s: Poker, i: number, amount: number) { const p = s.seats[i], v = Math.min(p.chips, amount); p.chips -= v; p.bet += v; p.total += v; }
export function newHand(previous?: Poker): Poker { const chips = previous?.seats.map(s => s.chips) || Array(6).fill(200); if (chips.filter(c => c > 0).length < 2 || chips[0] === 0)
    chips.fill(200); const s: Poker = { seats: chips.map(chips => ({ chips, hole: [], bet: 0, total: 0, folded: chips === 0, actedAt: -1 })), deck: shuffle(deck()), community: [], dealer: 0, actor: 0, street: 0, bet: 2, raise: 2, pending: [], log: 'Blinds 1 / 2. Virtual chips only.', over: false }; s.dealer = previous ? next(s, previous.dealer) : 0; for (let n = 0; n < 2; n++)
    for (let j = 1; j <= 6; j++) {
        const i = (s.dealer + j) % 6;
        if (!s.seats[i].folded)
            s.seats[i].hole.push(s.deck.pop()!);
    } const heads = chips.filter(c => c > 0).length === 2, sb = heads ? s.dealer : next(s, s.dealer), bb = next(s, sb); pay(s, sb, 1); pay(s, bb, 2); s.pending = order(s, next(s, bb)); s.actor = s.pending[0]; advance(s); return s; }
export function options(s: Poker) { const p = s.seats[s.actor]; if (!p || s.over)
    return { call: 0, min: 0, max: 0, canRaise: false }; return { call: Math.min(p.chips, s.bet - p.bet), min: s.bet + s.raise, max: p.bet + p.chips, canRaise: p.chips > s.bet - p.bet && (p.actedAt < 0 || s.bet - p.actedAt >= s.raise) }; }
function finish(s: Poker) { const live = s.seats.flatMap((p, i) => !p.folded ? [i] : []); const awards = live.length === 1 ? s.seats.map((_, i) => i === live[0] ? s.seats.reduce((n, p) => n + p.total, 0) : 0) : payouts(s.seats, s.community, s.dealer); awards.forEach((n, i) => s.seats[i].chips += n); s.log = awards.flatMap((n, i) => n ? [`${i === 0 ? 'You' : `Bot ${i}`} +${n}`] : []).join(' · '); s.over = true; s.pending = []; }
function advance(s: Poker) { if (s.seats.filter(p => !p.folded).length === 1) {
    finish(s);
    return;
} s.pending = s.pending.filter(i => !s.seats[i].folded && s.seats[i].chips > 0); const able = s.seats.flatMap((p, i) => !p.folded && p.chips > 0 ? [i] : []); if (able.length === 1 && s.seats[able[0]].bet >= s.bet)
    s.pending = []; while (!s.pending.length && !s.over) {
    if (s.street === 3) {
        finish(s);
        break;
    }
    s.street++;
    s.deck.pop();
    for (let j = 0; j < (s.street === 1 ? 3 : 1); j++)
        s.community.push(s.deck.pop()!);
    s.bet = 0;
    s.raise = 2;
    s.seats.forEach(p => { p.bet = 0; p.actedAt = -1; });
    s.pending = order(s, (s.dealer + 1) % 6);
    if (s.pending.length < 2)
        s.pending = [];
} if (!s.over)
    s.actor = s.pending[0]; }
export function act(state: Poker, action: 'fold' | 'call' | 'raise', target = 0): Poker | null { if (state.over)
    return null; const o = options(state); if (action === 'raise' && (!o.canRaise || !Number.isInteger(target) || target <= state.bet || target > o.max || target < o.min && target !== o.max))
    return null; const s = structuredClone(state), i = s.actor, p = s.seats[i]; s.pending = s.pending.filter(j => j !== i); if (action === 'fold')
    p.folded = true;
else if (action === 'call')
    pay(s, i, o.call);
else {
    const old = s.bet;
    pay(s, i, target - p.bet);
    s.bet = target;
    if (target - old >= s.raise) {
        s.raise = target - old;
        s.pending = order(s, (i + 1) % 6).filter(j => j !== i);
    }
    else
        s.pending = order(s, (i + 1) % 6).filter(j => j !== i && (s.pending.includes(j) || s.seats[j].bet < s.bet));
} p.actedAt = s.bet; s.log = `${i === 0 ? 'You' : `Bot ${i}`} ${action === 'call' ? (o.call ? `calls ${o.call}` : 'checks') : action === 'raise' ? `raises to ${target}` : 'folds'}.`; advance(s); return s; }
export type BotView = {
    hole: Card[];
    community: Card[];
    call: number;
    min: number;
    max: number;
    canRaise: boolean;
    pot: number;
    difficulty: number;
};
export function botView(s: Poker, difficulty: number): BotView { return { hole: s.seats[s.actor].hole, community: s.community, ...options(s), pot: s.seats.reduce((n, p) => n + p.total, 0), difficulty }; }
export function bot(v: BotView, random = Math.random): {
    action: 'fold' | 'call' | 'raise';
    target?: number;
} { const rs = v.hole.map(c => c.rank === 1 ? 14 : c.rank), strength = v.community.length >= 3 ? Math.floor(rank([...v.hole, ...v.community]) / 15 ** 5) / 8 : rs[0] === rs[1] ? .65 : (Math.max(...rs) / 14) * .35 + (v.hole[0].suit === v.hole[1].suit ? .1 : 0); if (v.canRaise && v.max >= v.min && random() < strength * (.2 + v.difficulty * .1))
    return { action: 'raise', target: Math.min(v.max, Math.max(v.min, Math.floor(v.pot * .5))) }; return { action: v.call > 0 && v.call / (v.pot + v.call) > strength + .15 + random() * .3 ? 'fold' : 'call' }; }
export function validPoker(x: unknown): x is Poker { try {
    const s = x as Poker;
    const cards = [...s.deck, ...s.community, ...s.seats.flatMap(p => p.hole)];
    return s.seats.length === 6 && Number.isInteger(s.dealer) && s.dealer >= 0 && s.dealer < 6 && typeof s.log === 'string' && s.community.length === [0, 3, 4, 5][s.street] && cards.length === 52 - s.street && (s.over || s.pending.includes(s.actor)) && s.seats.every(p => Array.isArray(p.hole) && (p.hole.length === 2 || p.hole.length === 0 && p.folded && p.total === 0) && Number.isInteger(p.actedAt) && p.actedAt >= -1) && s.seats.every(p => [p.chips, p.bet, p.total].every(n => Number.isInteger(n) && n >= 0) && p.bet <= p.total && typeof p.folded === 'boolean') && s.seats.reduce((n, p) => n + p.chips + (s.over ? 0 : p.total), 0) === 1200 && cards.every(c => Number.isInteger(c.id) && c.id >= 0 && c.id < 52 && c.rank === c.id % 13 + 1 && c.suit === Math.floor(c.id / 13)) && new Set(cards.map(c => c.id)).size === cards.length && Array.isArray(s.pending) && s.pending.every(i => Number.isInteger(i) && i >= 0 && i < 6) && Number.isInteger(s.actor) && s.actor >= 0 && s.actor < 6 && Number.isInteger(s.street) && s.street >= 0 && s.street <= 3 && Number.isInteger(s.bet) && s.bet >= 0 && Number.isInteger(s.raise) && s.raise >= 2 && typeof s.over === 'boolean';
}
catch {
    return false;
} }
