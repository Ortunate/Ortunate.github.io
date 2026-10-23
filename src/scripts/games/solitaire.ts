import { deal, draw, move, hint, canMove, validSolitaire, label, red, type Place, type Solitaire } from '../../lib/tabletop/cards';
import { $, button, load, save, confirmNew } from './table-ui';
export function mount(root: HTMLElement) {
    const kind = root.dataset.tabletop!, select = $<HTMLSelectElement>('table-mode'), board = $('table-board');
    let mode = 0, s: Solitaire, original: Solitaire, history: Solitaire[] = [], selected: Place | null = null;
    let persisted: Solitaire | undefined;
    const cardNodes = new Map<number, HTMLButtonElement>(), pileNodes = new Map<string, HTMLDivElement>();
    let top: HTMLDivElement, rows: HTMLDivElement, stock: HTMLButtonElement | undefined;
    const key = () => `classic:${kind}:${mode}:v1`;
    function start() {
        const stored = load(key(), (x): x is {
            state: Solitaire;
            original: Solitaire;
        } => !!x && validSolitaire((x as any).state, kind, mode) && validSolitaire((x as any).original, kind, mode));
        s = stored?.state || deal(kind, mode);
        original = stored?.original || structuredClone(s);
        history = [];
        selected = null;
        render();
    }
    function update(n: Solitaire | null) {
        if (!n) {
            $('table-status').textContent = 'That move is not available.';
            return;
        }
        history.push(s);
        if (history.length > 200)
            history.shift();
        s = n;
        selected = null;
        render();
    }
    function choose(p: Place) {
        if (selected && canMove(s, selected, p)) {
            update(move(s, selected, p));
            return;
        }
        selected = p;
        render();
    }
    function position(node: HTMLElement): Place { return { area: node.dataset.area as Place['area'], pile: Number(node.dataset.pile), index: Number(node.dataset.index) }; }
    board.addEventListener('click', e => { const node = (e.target as Element).closest<HTMLElement>('[data-place]'); if (node)
        choose(position(node)); });
    board.addEventListener('dragstart', e => { const node = (e.target as Element).closest<HTMLButtonElement>('[data-card]'); if (node && !node.disabled) {
        selected = position(node);
        e.dataTransfer?.setData('text/plain', 'card');
    } });
    board.addEventListener('dragover', e => e.preventDefault());
    board.addEventListener('drop', e => { e.preventDefault(); const box = (e.target as Element).closest<HTMLElement>('[data-pile-area]'); if (box && selected)
        update(move(s, selected, { area: box.dataset.pileArea as Place['area'], pile: Number(box.dataset.pile), index: 0 })); });
    function pile(area: Place['area'], index: number, cards: typeof s.stock, parent: HTMLElement, visible: Set<number>) {
        const key = `${area}:${index}`;
        let box = pileNodes.get(key);
        if (!box) {
            box = document.createElement('div');
            box.className = 'card-pile';
            box.dataset.pileArea = area;
            box.dataset.pile = String(index);
            box.setAttribute('aria-label', `${area} ${index + 1}`);
            const slot = document.createElement('button');
            slot.type = 'button';
            slot.className = 'button card-slot';
            slot.textContent = area === 'foundations' ? 'A' : area === 'cells' ? 'Free' : String(index + 1);
            Object.assign(slot.dataset, { place: '', area, pile: String(index), index: '0' });
            box.append(slot);
            parent.append(box);
            pileNodes.set(key, box);
        }
        const displayed = area === 'piles' ? cards : cards.slice(-1);
        displayed.forEach((c, j) => { visible.add(c.id); let b = cardNodes.get(c.id); if (!b) {
            b = document.createElement('button');
            b.type = 'button';
            b.dataset.card = String(c.id);
            b.dataset.place = '';
            cardNodes.set(c.id, b);
        } const pos = { area, pile: String(index), index: String(cards.length - displayed.length + j) }; Object.assign(b.dataset, pos); const text = c.up ? label(c) : '\u25C6'; if (b.textContent !== text)
            b.textContent = text; const classes = `playing-card ${!c.up ? 'card-back' : red(c) ? 'card-red' : 'card-black'}`; if (b.className !== classes)
            b.className = classes; b.classList.toggle('selected', !!selected && selected.area === area && selected.pile === index && Number(pos.index) >= selected.index); b.setAttribute('aria-label', c.up ? `${label(c)}, ${area} ${index + 1}` : 'Face down card'); b.draggable = c.up; b.disabled = !c.up; b.style.marginTop = area === 'piles' && j ? '-46px' : '0'; b.style.position = 'relative'; if (box!.children[j + 1] !== b)
            box!.append(b); });
    }
    function render() {
        if (!top) {
            top = document.createElement('div');
            top.className = 'card-row';
            rows = document.createElement('div');
            rows.className = 'card-row tableau';
            board.append(top, rows);
            if (kind !== 'freecell') {
                stock = button('', () => update(draw(s)), top);
                stock.className = 'playing-card card-back';
            }
        }
        if (stock) {
            stock.textContent = `Stock (${s.stock.length})`;
            stock.disabled = kind === 'spider' && !s.stock.length;
        }
        const visible = new Set<number>();
        if (kind === 'klondike')
            pile('waste', 0, s.waste, top, visible);
        if (kind === 'freecell')
            s.cells.forEach((p, i) => pile('cells', i, p, top, visible));
        s.foundations.forEach((p, i) => pile('foundations', i, p, top, visible));
        s.piles.forEach((p, i) => pile('piles', i, p, rows, visible));
        for (const [id, node] of cardNodes)
            if (!visible.has(id))
                node.remove();
        const won = s.foundations.flat().length === (kind === 'spider' ? 104 : 52);
        $('table-status').textContent = won ? 'You won! Every card is home.' : `${s.moves} moves \u00B7 ${s.foundations.flat().length} cards home${selected ? ' \u00B7 Choose a destination' : ''}`;
        if (persisted !== s && save(key(), { state: s, original }))
            persisted = s;
    }
    button('Undo', () => {
        if (history.length) {
            s = history.pop()!;
            selected = null;
            render();
        }
    });
    button('Restart deal', () => {
        if (confirmNew()) {
            s = structuredClone(original);
            history = [];
            selected = null;
            render();
        }
    });
    button('Hint', () => {
        const h = hint(s);
        if (h) {
            selected = h[0];
            render();
            $('table-status').textContent = `Try ${h[0].area} ${h[0].pile + 1} \u2192 ${h[1].area} ${h[1].pile + 1}.`;
        }
        else
            $('table-status').textContent = kind === 'freecell' ? 'No legal move. Try Undo.' : 'No visible move. Try the stock or Undo.';
    });
    $('table-rules').textContent = kind === 'spider' ? 'Build descending runs. Move a run only when it shares one suit. A suited King-to-Ace run goes home automatically. Fill every empty column before dealing a new row.' : kind === 'freecell' ? 'Build descending alternating-color columns and ascending suited foundations from Ace. Free cells hold one card. Run capacity is (empty cells + 1) \u00D7 2^(available empty columns).' : 'Build descending alternating-color columns. Empty columns accept Kings. Build suited foundations from Ace to King. Tap the stock to draw; recycle it without a limit.';
    $('table-rules').textContent += ' Tap a card then its destination, or drag a card. Hints use visible cards only. Not every deal is winnable.';
    $('table-new').onclick = () => {
        if (confirmNew()) {
            s = deal(kind, mode);
            original = structuredClone(s);
            history = [];
            selected = null;
            render();
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
    start();
}
