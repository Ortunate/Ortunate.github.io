import { deal, draw, move, hint, canMove, validSolitaire, label, red, type Place, type Solitaire } from '../../lib/tabletop/cards';
import { $, button, load, save, confirmNew } from './table-ui';
export function mount(root: HTMLElement) {
    const kind = root.dataset.tabletop!, select = $<HTMLSelectElement>('table-mode'), board = $('table-board');
    let mode = 0, s: Solitaire, original: Solitaire, history: Solitaire[] = [], selected: Place | null = null;
    const key = () => `classic:${kind}:${mode}:v1`;
    function start() { const stored = load(key(), (x): x is {
        state: Solitaire;
        original: Solitaire;
    } => !!x && validSolitaire((x as any).state, kind, mode) && validSolitaire((x as any).original, kind, mode)); s = stored?.state || deal(kind, mode); original = stored?.original || structuredClone(s); history = []; selected = null; render(); }
    function update(n: Solitaire | null) { if (!n) {
        $('table-status').textContent = 'That move is not available.';
        return;
    } history.push(structuredClone(s)); if (history.length > 200)
        history.shift(); s = n; selected = null; render(); }
    function choose(p: Place) { if (selected && canMove(s, selected, p)) {
        update(move(s, selected, p));
        return;
    } selected = p; render(); }
    function pile(area: Place['area'], index: number, cards: typeof s.stock, parent: HTMLElement) {
        const box = document.createElement('div');
        box.className = 'card-pile';
        box.setAttribute('aria-label', `${area} ${index + 1}`);
        const placeholder = button(`${area === 'foundations' ? 'A' : area === 'cells' ? 'Free' : index + 1}`, () => choose({ area, pile: index, index: 0 }), box);
        placeholder.classList.add('card-slot');
        const displayed = area === 'waste' || area === 'foundations' || area === 'cells' ? cards.slice(-1) : cards;
        displayed.forEach((c, j) => { const pos = { area, pile: index, index: cards.length - displayed.length + j }; const b = button(c.up ? label(c) : '◆', () => choose(pos), box); b.className = `playing-card ${!c.up ? 'card-back' : red(c) ? 'card-red' : 'card-black'}`; b.setAttribute('aria-label', c.up ? `${label(c)}, ${area} ${index + 1}` : 'Face down card'); b.draggable = c.up; b.disabled = !c.up; b.classList.toggle('selected', !!selected && selected.area === area && selected.pile === index && pos.index >= selected.index); if (area === 'piles') {
            b.style.marginTop = j ? '-46px' : '0';
            b.style.position = 'relative';
        } b.addEventListener('dragstart', e => { selected = pos; e.dataTransfer?.setData('text/plain', 'card'); }); });
        box.addEventListener('dragover', e => e.preventDefault());
        box.addEventListener('drop', e => { e.preventDefault(); if (selected)
            update(move(s, selected, { area, pile: index, index: 0 })); });
        parent.append(box);
    }
    function render() { board.replaceChildren(); const top = document.createElement('div'); top.className = 'card-row'; if (kind !== 'freecell') {
        const b = button(`Stock (${s.stock.length})`, () => update(draw(s)), top);
        b.className = 'playing-card card-back';
        b.disabled = kind === 'spider' && !s.stock.length;
    } if (kind === 'klondike')
        pile('waste', 0, s.waste, top); if (kind === 'freecell')
        s.cells.forEach((p, i) => pile('cells', i, p, top)); s.foundations.forEach((p, i) => pile('foundations', i, p, top)); board.append(top); const rows = document.createElement('div'); rows.className = 'card-row tableau'; s.piles.forEach((p, i) => pile('piles', i, p, rows)); board.append(rows); const won = s.foundations.flat().length === (kind === 'spider' ? 104 : 52); $('table-status').textContent = won ? 'You won! Every card is home.' : `${s.moves} moves · ${s.foundations.flat().length} cards home${selected ? ' · Choose a destination' : ''}`; save(key(), { state: s, original }); }
    button('Undo', () => { if (history.length) {
        s = history.pop()!;
        selected = null;
        render();
    } });
    button('Restart deal', () => { if (confirmNew()) {
        s = structuredClone(original);
        history = [];
        selected = null;
        render();
    } });
    button('Hint', () => { const h = hint(s); if (h) {
        selected = h[0];
        render();
        $('table-status').textContent = `Try ${h[0].area} ${h[0].pile + 1} → ${h[1].area} ${h[1].pile + 1}.`;
    }
    else
        $('table-status').textContent = kind === 'freecell' ? 'No legal move. Try Undo.' : 'No visible move. Try the stock or Undo.'; });
    $('table-rules').textContent = kind === 'spider' ? 'Build descending runs. Move a run only when it shares one suit. A suited King-to-Ace run goes home automatically. Fill every empty column before dealing a new row.' : kind === 'freecell' ? 'Build descending alternating-color columns and ascending suited foundations from Ace. Free cells hold one card. Run capacity is (empty cells + 1) × 2^(available empty columns).' : 'Build descending alternating-color columns. Empty columns accept Kings. Build suited foundations from Ace to King. Tap the stock to draw; recycle it without a limit.';
    $('table-rules').textContent += ' Tap a card then its destination, or drag a card. Hints use visible cards only. Not every deal is winnable.';
    $('table-new').onclick = () => { if (confirmNew()) {
        s = deal(kind, mode);
        original = structuredClone(s);
        history = [];
        selected = null;
        render();
    } };
    select.onchange = () => { if (confirmNew()) {
        mode = +select.value;
        start();
    }
    else
        select.value = String(mode); };
    start();
}
