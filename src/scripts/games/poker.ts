import { newHand, act, options, botView, bot, validPoker, type Poker } from '../../lib/tabletop/poker';
import { label, red, type Card } from '../../lib/tabletop/cards';
import { $, button, load, save, confirmNew } from './table-ui';
export function mount(_root?: HTMLElement) {
    const select = $<HTMLSelectElement>('table-mode'), board = $('table-board');
    let mode = 0, s: Poker, timer = 0;
    const key = () => `classic:poker:${mode}:v1`;
    function start() { clearTimeout(timer); s = load(key(), validPoker) || newHand(); render(); }
    function update(action: 'fold' | 'call' | 'raise', target = 0) { const n = act(s, action, target); if (n) {
        s = n;
        render();
    }
    else
        $('table-status').textContent = 'Invalid raise. Use the displayed minimum, or your exact all-in amount.'; }
    function cards(list: Card[], hidden = false) { const row = document.createElement('div'); row.className = 'poker-cards'; for (const c of list) {
        const span = document.createElement('span');
        span.className = `playing-card ${hidden ? 'card-back' : red(c) ? 'card-red' : 'card-black'}`;
        span.textContent = hidden ? '◆' : label(c);
        span.setAttribute('aria-label', hidden ? 'Hidden card' : label(c));
        row.append(span);
    } return row; }
    function render() {
        clearTimeout(timer);
        board.replaceChildren();
        const seats = document.createElement('div');
        seats.className = 'poker-seats';
        s.seats.forEach((p, i) => { const seat = document.createElement('div'); seat.className = `poker-seat ${s.actor === i && !s.over ? 'active' : ''} ${p.folded ? 'folded' : ''}`; const title = document.createElement('p'); title.textContent = `${i === 0 ? 'You' : `Bot ${i}`} · ${p.chips} chips${s.dealer === i ? ' · Dealer' : ''}${p.folded ? ' · Folded' : !p.chips ? ' · All-in' : ''} · Bet ${p.bet}`; seat.append(title, cards(p.hole, i !== 0 && (!s.over || p.folded))); seats.append(seat); });
        board.append(seats);
        const pot = document.createElement('p');
        pot.textContent = `${['Pre-flop', 'Flop', 'Turn', 'River'][s.street]} · Pot ${s.seats.reduce((n, p) => n + p.total, 0)}`;
        board.append(pot, cards(s.community));
        $('table-status').textContent = s.log;
        const actions = $('table-actions');
        actions.replaceChildren();
        if (s.over)
            button(s.seats[0].chips === 0 ? 'Restart with free chips' : 'Next hand', () => { s = newHand(s); render(); });
        else if (s.actor === 0) {
            const o = options(s);
            button('Fold', () => update('fold'));
            button(o.call ? `Call ${o.call}` : 'Check', () => update('call'));
            if (o.canRaise) {
                const lab = document.createElement('label');
                lab.textContent = `Raise to (min ${o.min}): `;
                const input = document.createElement('input');
                input.type = 'number';
                input.min = String(Math.min(o.min, o.max));
                input.max = String(o.max);
                input.step = '1';
                input.value = String(Math.min(o.min, o.max));
                lab.append(input);
                actions.append(lab);
                button('Raise', () => update('raise', +input.value));
                button(`All-in ${o.max}`, () => update('raise', o.max));
            }
        }
        else if (!document.hidden)
            timer = window.setTimeout(() => { const choice = bot(botView(s, mode)); update(choice.action, choice.target); }, 450);
        save(key(), s);
    }
    $('table-new').onclick = () => { if (confirmNew()) {
        s = newHand();
        render();
    } };
    select.onchange = () => { if (confirmNew()) {
        mode = +select.value;
        start();
    }
    else
        select.value = String(mode); };
    document.addEventListener('visibilitychange', () => { clearTimeout(timer); if (!document.hidden)
        render(); });
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', () => render());
    $('table-rules').textContent = 'No-limit Texas Hold’em, six seats, blinds 1 / 2. You and five local bots start with 200 free chips each. Make the best five-card hand from your two cards and five community cards. Fold, check/call, or raise to a total bet. Short all-ins do not reopen raising unless cumulative raises reach the full raise size. Side pots and split pots are handled automatically; odd chips go clockwise after the dealer. Bots receive only their own cards and public information. No accounts, payments or real money. Restart for free when out of chips.';
    start();
}
