export type Card = {
    id: number;
    rank: number;
    suit: number;
    up: boolean;
};
export function deck(copies = 1, suits = 4): Card[] { return Array.from({ length: 52 * copies }, (_, id) => ({ id, rank: id % 13 + 1, suit: Math.floor(id / 13) % suits, up: true })); }
export function shuffle<T>(cards: T[], random = Math.random): T[] { const a = [...cards]; for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
} return a; }
export const red = (c: Card) => c.suit % 2 === 1;
export const label = (c: Card) => `${['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][c.rank]}${['♠', '♥', '♣', '♦'][c.suit]}`;
export type Solitaire = {
    kind: string;
    mode: number;
    piles: Card[][];
    stock: Card[];
    waste: Card[];
    foundations: Card[][];
    cells: Card[][];
    moves: number;
};
export type Place = {
    area: 'piles' | 'waste' | 'foundations' | 'cells';
    pile: number;
    index: number;
};
export function deal(kind: string, mode = 0): Solitaire { const d = shuffle(deck(kind === 'spider' ? 2 : 1, kind === 'spider' ? [1, 2, 4][mode] : 4)); const s: Solitaire = { kind, mode, piles: [], stock: [], waste: [], foundations: Array.from({ length: kind === 'spider' ? 8 : 4 }, () => []), cells: Array.from({ length: 4 }, () => []), moves: 0 }; const n = kind === 'spider' ? 10 : kind === 'freecell' ? 8 : 7; for (let i = 0; i < n; i++) {
    const count = kind === 'spider' ? (i < 4 ? 6 : 5) : kind === 'freecell' ? (i < 4 ? 7 : 6) : i + 1;
    s.piles.push(d.splice(0, count).map((c, j) => ({ ...c, up: kind === 'freecell' || j === count - 1 })));
} s.stock = d; return s; }
const stack = (s: Solitaire, p: Place): Card[] => p.area === 'waste' ? s.waste : s[p.area][p.pile];
export function movable(s: Solitaire, p: Place) { const pile = stack(s, p); if (p.area === 'waste' && p.index !== s.waste.length - 1)
    return false; if (!pile || p.index < 0 || p.index >= pile.length || p.area === 'foundations' && s.kind === 'spider')
    return false; const run = pile.slice(p.index); return run.every((c, i) => c.up && (!i || run[i - 1].rank === c.rank + 1 && (s.kind === 'spider' ? run[i - 1].suit === c.suit : red(run[i - 1]) !== red(c)))) && (p.area === 'piles' || run.length === 1); }
export function canMove(s: Solitaire, from: Place, to: Place) {
    if (!movable(s, from) || from.area === to.area && from.pile === to.pile || to.area === 'waste')
        return false;
    const run = stack(s, from).slice(from.index), target = stack(s, to);
    if (!target)
        return false;
    const top = target.at(-1), card = run[0];
    if (to.area === 'cells')
        return s.kind === 'freecell' && run.length === 1 && !top;
    if (to.area === 'foundations')
        return s.kind !== 'spider' && run.length === 1 && (top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1);
    if (s.kind === 'freecell') {
        const empty = s.piles.filter((p, i) => !p.length && i !== to.pile).length, capacity = (1 + s.cells.filter(p => !p.length).length) * 2 ** empty;
        if (run.length > capacity)
            return false;
    }
    return top ? top.rank === card.rank + 1 && (s.kind === 'spider' || red(top) !== red(card)) : s.kind !== 'klondike' || card.rank === 13;
}
function settle(s: Solitaire) { for (const p of s.piles) {
    if (p.length)
        p[p.length - 1].up = true;
    if (s.kind === 'spider' && p.length >= 13) {
        const run = p.slice(-13);
        if (run.every((c, i) => c.up && c.rank === 13 - i && c.suit === run[0].suit)) {
            s.foundations.find(f => !f.length)!.push(...p.splice(-13));
            if (p.length)
                p[p.length - 1].up = true;
        }
    }
} }
export function move(s: Solitaire, from: Place, to: Place) { if (!canMove(s, from, to))
    return null; const n = structuredClone(s); stack(n, to).push(...stack(n, from).splice(from.index)); n.moves++; settle(n); return n; }
export function draw(s: Solitaire) { if (s.kind === 'freecell' || s.kind === 'spider' && (!s.stock.length || s.piles.some(p => !p.length)))
    return null; const n = structuredClone(s); if (s.kind === 'spider')
    for (const p of n.piles)
        p.push({ ...n.stock.pop()!, up: true });
else if (n.stock.length)
    for (let i = 0; i < (n.mode ? 3 : 1) && n.stock.length; i++)
        n.waste.push({ ...n.stock.pop()!, up: true });
else if (n.waste.length)
    n.stock = n.waste.splice(0).reverse();
else
    return null; n.moves++; settle(n); return n; }
export function hint(s: Solitaire): [
    Place,
    Place
] | null { for (const area of ['piles', 'cells', 'waste'] as const) {
    const lists = area === 'waste' ? [s.waste] : s[area];
    for (let p = 0; p < lists.length; p++)
        for (let i = 0; i < lists[p].length; i++) {
            if (area === 'waste' && i !== lists[p].length - 1)
                continue;
            const from = { area, pile: p, index: i };
            for (const a of ['foundations', 'piles', 'cells'] as const)
                for (let j = 0; j < s[a].length; j++) {
                    const to = { area: a, pile: j, index: 0 };
                    if (canMove(s, from, to))
                        return [from, to];
                }
        }
} return null; }
// Waste is one stack, exposed through a small adapter for the common move API.
export function validSolitaire(x: unknown, kind: string, mode: number): x is Solitaire { try {
    const s = x as Solitaire;
    if (s.kind !== kind || s.mode !== mode || !Number.isInteger(s.moves) || s.moves < 0 || s.piles.length !== (kind === 'spider' ? 10 : kind === 'freecell' ? 8 : 7) || s.cells.length !== 4 || s.foundations.length !== (kind === 'spider' ? 8 : 4))
        return false;
    if (s.cells.some(p => !Array.isArray(p) || p.length > (kind === 'freecell' ? 1 : 0)) || s.foundations.some(p => !Array.isArray(p) || p.some((c, i) => !c.up || c.suit !== p[0].suit || c.rank !== (kind === 'spider' ? 13 - i : i + 1))) || kind === 'freecell' && (s.stock.length || s.waste.length) || kind === 'spider' && (s.stock.length % 10 !== 0 || s.waste.length))
        return false;
    const cards = [...s.piles.flat(), ...s.stock, ...s.waste, ...s.cells.flat(), ...s.foundations.flat()];
    return cards.length === (kind === 'spider' ? 104 : 52) && new Set(cards.map(c => c.id)).size === cards.length && cards.every(c => Number.isInteger(c.id) && c.id >= 0 && c.id < cards.length && c.rank === c.id % 13 + 1 && c.suit === Math.floor(c.id / 13) % (kind === 'spider' ? [1, 2, 4][mode] : 4) && typeof c.up === 'boolean');
}
catch {
    return false;
} }
