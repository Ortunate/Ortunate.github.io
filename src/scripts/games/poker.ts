import { newHand, act, options, botView, bot, validPoker, type Poker } from '../../lib/tabletop/poker';
import { label, red, type Card } from '../../lib/tabletop/cards';
import { $, button, load, save, confirmNew } from './table-ui';
export function mount(_root?: HTMLElement) {
    const select = $<HTMLSelectElement>('table-mode'), board = $('table-board');
    let mode = 0, s: Poker, timer = 0;
    let persisted: Poker | undefined, rendered: Poker | undefined;
    const seats = document.createElement('div');
    seats.className = 'poker-seats';
    const seatNodes = Array.from({ length: 6 }, () => { const seat = document.createElement('div'), title = document.createElement('p'), row = document.createElement('div'); row.className = 'poker-cards'; seat.append(title, row); seats.append(seat); return { seat, title, row }; });
    const pot = document.createElement('p'), community = document.createElement('div');
    community.className = 'poker-cards';
    board.append(seats, pot, community);
    const key = () => `classic:poker:${mode}:v1`;
    function start() { clearTimeout(timer); s = load(key(), validPoker) || newHand(); render(); }
    function update(action: 'fold' | 'call' | 'raise', target = 0) {
        const n = act(s, action, target);
        if (n) {
            s = n;
            render();
        }
        else
            $('table-status').textContent = 'Invalid raise. Use the displayed minimum, or your exact all-in amount.';
    }
    function cards(row: HTMLElement, list: Card[], hidden = false) { const signature = list.map(c => c.id).join(',') + ':' + hidden; if (row.dataset.signature === signature)
        return; row.dataset.signature = signature; row.replaceChildren(); for (const c of list) {
        const span = document.createElement('span');
        span.className = `playing-card ${hidden ? 'card-back' : red(c) ? 'card-red' : 'card-black'}`;
        span.textContent = hidden ? '\u25C6' : label(c);
        span.setAttribute('aria-label', hidden ? 'Hidden card' : label(c));
        row.append(span);
    } }
    function render() {
        clearTimeout(timer);
        s.seats.forEach((p, i) => { const { seat, title, row } = seatNodes[i]; const cls = `poker-seat ${s.actor === i && !s.over ? 'active' : ''} ${p.folded ? 'folded' : ''}`; if (seat.className !== cls)
            seat.className = cls; const text = `${i === 0 ? 'You' : `Bot ${i}`} \u00B7 ${p.chips} chips${s.dealer === i ? ' \u00B7 Dealer' : ''}${p.folded ? ' \u00B7 Folded' : !p.chips ? ' \u00B7 All-in' : ''} \u00B7 Bet ${p.bet}`; if (title.textContent !== text)
            title.textContent = text; cards(row, p.hole, i !== 0 && (!s.over || p.folded)); });
        pot.textContent = `${['Pre-flop', 'Flop', 'Turn', 'River'][s.street]} \u00B7 Pot ${s.seats.reduce((n, p) => n + p.total, 0)}`;
        cards(community, s.community);
        $('table-status').textContent = s.log;
        if (rendered !== s) {
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
            rendered = s;
        }
        if (!s.over && s.actor !== 0 && !document.hidden)
            timer = window.setTimeout(() => { const choice = bot(botView(s, mode)); update(choice.action, choice.target); }, 450);
        if (persisted !== s && save(key(), s))
            persisted = s;
    }
    $('table-new').onclick = () => {
        if (confirmNew()) {
            s = newHand();
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
    document.addEventListener('visibilitychange', () => {
        clearTimeout(timer);
        if (!document.hidden)
            render();
    });
    window.addEventListener('pagehide', () => clearTimeout(timer));
    window.addEventListener('pageshow', () => render());
    $('table-rules').textContent = 'No-limit Texas Hold\u2019em, six seats, blinds 1 / 2. You and five local bots start with 200 free chips each. Make the best five-card hand from your two cards and five community cards. Fold, check/call, or raise to a total bet. Short all-ins do not reopen raising unless cumulative raises reach the full raise size. Side pots and split pots are handled automatically; odd chips go clockwise after the dealer. Bots receive only their own cards and public information. No accounts, payments or real money. Restart for free when out of chips.';
    start();
}
