import { createResultState } from '../lib/result-state';
import { copy, read, save } from './storage';
import { textStats } from '../lib/text';
import { defaultTimer, validTimer, secondsLeft, startTimer, pauseTimer } from '../lib/timer';
import { encodeBase64, decodeBase64, parseTimestamp, parseColor, colorFormats, makePassword, passwordSets, drawItems, units, convertUnit } from '../lib/utilities';
const root = document.querySelector<HTMLElement>('[data-utility]')!, slug = root.dataset.utility!;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const input = () => ($<HTMLTextAreaElement>('utility-input')?.value ?? '');
const value = (id: string) => $<HTMLInputElement>(id).value;
const status = $('utility-status');
const resultState = createResultState();
let worker: Worker | undefined, timeout = 0;
const formats: Record<string, string> = {};
function output(text: string) {
    resultState.accept(text);
    const button = root.querySelector<HTMLButtonElement>('[data-action=copy]');
    if (button)
        button.disabled = slug === 'text' ? !input() : !text;
    if ($('utility-output'))
        $('utility-output').textContent = text || 'Your result will appear here.';
}
function error(e: unknown) { output(''); root.querySelectorAll<HTMLButtonElement>('[data-copy-format]').forEach(b => b.disabled = true); status.textContent = e instanceof Error ? e.message : String(e); status.style.color = '#f4b2bd'; }
function ok(message = 'Ready. Everything stays on this device.') { status.textContent = message; status.style.color = ''; }
function limited() {
    if (input().length > 2000000)
        throw Error('Input is limited to 2 million characters.');
}
function stats() { const s = textStats(input()); output(`${s.characters} characters\n${s.compact} without spaces\n${s.words} English words\n${s.chinese} Chinese characters\n${s.lines} lines`); ok('Characters include spaces and punctuation.'); }
function color() { const a = colorFormats(parseColor(value('color-a'))), b = colorFormats(parseColor(value('color-b'))), css = `linear-gradient(${value('color-angle')}deg, ${a.hex}, ${b.hex})`; Object.assign(formats, { hex: a.hex, rgb: a.rgb, hsl: a.hsl, css: `background: ${css};` }); root.querySelectorAll<HTMLButtonElement>('[data-copy-format]').forEach(b => b.disabled = false); $('color-preview').style.background = css; $<HTMLInputElement>('color-picker').value = a.hex; output(`First color\n${a.hex}\n${a.rgb}\n${a.hsl}\n\nSecond color\n${b.hex}\n${b.rgb}\n${b.hsl}\n\nbackground: ${css};`); ok(); }
function dateOutput(date: Date) { output(`UTC: ${date.toISOString()}\nLocal: ${date.toLocaleString()}\nZone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}\nSeconds: ${Math.floor(date.getTime() / 1000)}\nMilliseconds: ${date.getTime()}`); ok(); }
function setNow() { const date = new Date(); $<HTMLInputElement>('timestamp-input').value = String(value('timestamp-unit') === 'seconds' ? Math.floor(date.getTime() / 1000) : date.getTime()); $<HTMLInputElement>('date-input').value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19); dateOutput(date); }
function unitOptions() {
    const names = Object.keys(units[value('unit-category')]);
    for (const id of ['unit-from', 'unit-to']) {
        $(id).replaceChildren(...names.map(name => { const option = document.createElement('option'); option.value = option.textContent = name; return option; }));
    }
    $<HTMLSelectElement>('unit-to').selectedIndex = Math.min(1, names.length - 1);
}
function convert() {
    if (!value('unit-value').trim())
        throw Error('Enter a value to convert.');
    const n = convertUnit(Number(value('unit-value')), value('unit-category'), value('unit-from'), value('unit-to'));
    if (!Number.isFinite(n))
        throw Error('The converted value is too large.');
    output(`${value('unit-value')} ${value('unit-from')} = ${Number(n.toPrecision(12))} ${value('unit-to')}`);
    ok();
}
function cancelRegex() { resultState.invalidate(); worker?.terminate(); worker = undefined; clearTimeout(timeout); }
function runRegex() {
    cancelRegex();
    $('regex-highlight').hidden = true;
    output('');
    ok('Searching…');
    const token = resultState.revision, text = input();
    worker = new Worker(new URL('./regex.worker.ts', import.meta.url), { type: 'module' });
    timeout = window.setTimeout(() => { if (!resultState.current(token))
        return; cancelRegex(); error(Error('This expression took too long (1 second). Simplify it and try again.')); }, 1000);
    worker.onerror = () => { if (!resultState.current(token))
        return; cancelRegex(); error(Error('The expression worker could not start.')); };
    worker.onmessage = event => {
        if (!resultState.current(token))
            return;
        cancelRegex();
        if (event.data.error) {
            error(Error(event.data.error));
            return;
        }
        const matches = event.data.matches as {
            index: number;
            text: string;
            groups: (string | undefined)[];
            named: Record<string, string> | undefined;
        }[];
        const highlight = $('regex-highlight');
        highlight.replaceChildren();
        let cursor = 0;
        for (const m of matches) {
            highlight.append(document.createTextNode(text.slice(cursor, m.index)));
            const mark = document.createElement('mark');
            mark.textContent = m.text || '▏';
            highlight.appendChild(mark);
            cursor = m.index + m.text.length;
        }
        highlight.append(document.createTextNode(text.slice(cursor)));
        highlight.hidden = false;
        output(matches.length ? matches.map((m, i) => `${i + 1}. At ${m.index}: ${JSON.stringify(m.text)}${m.groups.length ? `\n   Captures: ${JSON.stringify(m.groups)}` : ''}${m.named ? `\n   Named: ${JSON.stringify(m.named)}` : ''}`).join('\n') : 'No matches.');
        ok(`${matches.length} matches${event.data.truncated ? ' (limited to 2,000)' : ''}.`);
    };
    worker.postMessage({ pattern: value('regex-pattern'), flags: value('regex-flags'), text });
}
function example() {
    if (slug === 'json') {
        $<HTMLTextAreaElement>('utility-input').value = '{"hello":"world","orbit":[2,4,8],"curious":true}';
        output(JSON.stringify(JSON.parse(input()), null, 2));
    }
    if (slug === 'text') {
        $<HTMLTextAreaElement>('utility-input').value = 'A little corner of the internet.\n你好，宇宙。 🌌';
        stats();
    }
    if (slug === 'encoding') {
        $<HTMLTextAreaElement>('utility-input').value = 'Hello, 宇宙 🌌';
        output(value('encoding-kind') === 'base64' ? encodeBase64(input()) : encodeURIComponent(input()));
    }
    if (slug === 'regex') {
        $<HTMLTextAreaElement>('utility-input').value = 'Write to hello@example.com or orbit@space.dev.';
        runRegex();
    }
    if (slug === 'draw') {
        $<HTMLTextAreaElement>('utility-input').value = 'Take a walk\nRead a chapter\nMake something\nPlay a game\nCall a friend';
        output('');
    }
    if (slug === 'color') {
        $<HTMLInputElement>('color-a').value = '#ad99e5';
        $<HTMLInputElement>('color-b').value = '#c6eaa5';
        color();
    }
    if (slug === 'units') {
        $<HTMLSelectElement>('unit-category').value = 'Length';
        $<HTMLInputElement>('unit-value').value = '1';
        unitOptions();
        convert();
    }
}
root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button => button.addEventListener('click', () => {
    if (slug === 'timer')
        return;
    try {
        limited();
        const action = button.dataset.action;
        ok();
        if (action === 'copy') {
            if (slug === 'text')
                void copy(input());
            else if (resultState.text)
                void copy(resultState.text);
            else
                throw Error('There is no result to copy yet.');
            return;
        }
        if (action === 'clear') {
            cancelRegex();
            const text = $<HTMLTextAreaElement>('utility-input');
            if (text)
                text.value = '';
            if (slug === 'timestamp') {
                for (const id of ['timestamp-input', 'date-input'])
                    $<HTMLInputElement>(id).value = '';
            }
            if ($('regex-highlight'))
                $('regex-highlight').hidden = true;
            output('');
            if (slug === 'text')
                stats();
            ok('Cleared.');
            return;
        }
        if (action === 'example') {
            example();
            return;
        }
        if (action === 'format' || action === 'compact')
            output(JSON.stringify(JSON.parse(input()), null, action === 'format' ? 2 : undefined));
        if (action === 'encode')
            output(value('encoding-kind') === 'base64' ? encodeBase64(input()) : encodeURIComponent(input()));
        if (action === 'decode')
            output(value('encoding-kind') === 'base64' ? decodeBase64(input()) : decodeURIComponent(input()));
        if (action === 'to-date')
            dateOutput(parseTimestamp(value('timestamp-input'), value('timestamp-unit') as 'seconds' | 'milliseconds'));
        if (action === 'to-timestamp') {
            if (!value('date-input'))
                throw Error('Choose a local date and time.');
            const date = new Date(value('date-input'));
            if (!Number.isFinite(date.getTime()))
                throw Error('Enter a valid date.');
            dateOutput(date);
        }
        if (action === 'now')
            setNow();
        if (action === 'color')
            color();
        if (action === 'regex')
            runRegex();
        if (action === 'generate') {
            const groups = Array.from(root.querySelectorAll<HTMLInputElement>('input[name=password-set]:checked')).map(i => passwordSets[i.value as keyof typeof passwordSets]);
            output(makePassword(Number(value('password-length')), groups));
        }
        if (action === 'convert')
            convert();
        if (action === 'swap') {
            const a = value('unit-from');
            $<HTMLSelectElement>('unit-from').value = value('unit-to');
            $<HTMLSelectElement>('unit-to').value = a;
            convert();
        }
        if (action === 'draw')
            output(drawItems(input().split(/\r?\n/), Number(value('draw-count')), $<HTMLInputElement>('draw-unique').checked).map((v, i) => `${i + 1}. ${v}`).join('\n'));
    }
    catch (e) {
        error(e);
    }
}));
if (slug === 'text') {
    $('utility-input').addEventListener('input', stats);
    stats();
}
if (slug === 'color') {
    color();
    for (const id of ['color-a', 'color-b', 'color-angle'])
        $(id).addEventListener('input', () => {
            try {
                color();
            }
            catch (e) {
                error(e);
            }
        });
    $('color-picker').addEventListener('input', () => { $<HTMLInputElement>('color-a').value = value('color-picker'); color(); });
}
if (slug === 'timestamp') {
    $('timezone-label').textContent = `Local time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. Date input uses this time zone.`;
    setNow();
}
if (slug === 'units') {
    unitOptions();
    convert();
    $('unit-category').addEventListener('change', () => {
        try {
            unitOptions();
            convert();
        }
        catch (e) {
            error(e);
        }
    });
}
root.addEventListener('input', e => {
    if (['text', 'color', 'timer'].includes(slug))
        return;
    cancelRegex();
    if ($('regex-highlight'))
        $('regex-highlight').hidden = true;
    output('');
    if (slug === 'units') {
        try {
            if ((e.target as HTMLElement).id === 'unit-category')
                unitOptions();
            convert();
        }
        catch (errorValue) {
            error(errorValue);
        }
        return;
    }
    ok(slug === 'regex' ? 'Expression or text changed. Run the expression again.' : 'Input changed. Generate a new result.');
});
root.querySelectorAll<HTMLButtonElement>('[data-copy-format]').forEach(button => button.addEventListener('click', () => {
    const text = formats[button.dataset.copyFormat!];
    if (text)
        void copy(text);
}));
if (!['text', 'color', 'timestamp', 'units', 'timer'].includes(slug))
    output('');
if (slug === 'timer') {
    let validationError = false;
    const stored = read('timer', null);
    let state = validTimer(stored) ? stored : defaultTimer();
    $<HTMLInputElement>('focus-length').value = String(state.focus);
    $<HTMLInputElement>('break-length').value = String(state.break);
    const persist = () => save('timer', state);
    const start = root.querySelector<HTMLButtonElement>('[data-action=start]')!;
    function render() {
        const left = secondsLeft(state);
        $('timer-readout').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
        $<HTMLProgressElement>('timer-progress').value = left / (state[state.stage] * 60);
        start.textContent = state.end === null ? 'Start session' : 'Pause';
        if (left === 0) {
            if (state.end !== null) {
                state = { ...state, remaining: 0, end: null };
                persist();
            }
            if (!validationError)
                ok('Session complete. Take a breath, then choose your next session.');
            start.textContent = 'Start session';
        }
        else if (left > 0 && !validationError)
            ok(`${state.stage === 'focus' ? 'Focus session' : 'Short break'} · ${state.end ? 'In progress' : 'Ready when you are'}`);
    }
    root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.addEventListener('click', () => {
        const action = b.dataset.action;
        validationError = false;
        if (action === 'start')
            state = state.end === null ? startTimer(state) : pauseTimer(state);
        if (action === 'reset')
            state = { ...state, end: null, remaining: state[state.stage] * 60 };
        if (action === 'focus' || action === 'break')
            state = { ...state, stage: action, end: null, remaining: state[action] * 60 };
        persist();
        render();
    }));
    for (const stage of ['focus', 'break'] as const)
        $(`${stage}-length`).addEventListener('change', () => {
            const n = Number(value(`${stage}-length`));
            if (!Number.isInteger(n) || n < 1 || n > (stage === 'focus' ? 180 : 60)) {
                validationError = true;
                error(Error(`Use 1–${stage === 'focus' ? 180 : 60} minutes.`));
                $<HTMLInputElement>(`${stage}-length`).value = String(state[stage]);
                return;
            }
            validationError = false;
            state = { ...state, [stage]: n };
            if (state.stage === stage)
                state = { ...state, end: null, remaining: n * 60 };
            persist();
            render();
        });
    const timer = window.setInterval(render, 500);
    window.addEventListener('pagehide', e => {
        persist();
        if (!e.persisted)
            clearInterval(timer);
    });
    render();
}
window.addEventListener('pagehide', () => { if (worker) {
    cancelRegex();
    output('');
    $('regex-highlight').hidden = true;
    ok('Search interrupted. Run the expression again.');
} });
