import { createGameState } from '../../lib/game-state';
import type { GameContext, GameController } from '../../lib/game-runtime';
import { extraButton } from '../../lib/game-runtime';
import { snakeStep, snakeObstacles, tetrominoes, rotatePiece, pieceFits, lockPiece, clearLines, shuffle, circleRect } from '../../lib/arcade-rules';
import type { SnakeV2 } from '../../lib/arcade-rules';
export function createGame(c: GameContext): GameController { if (c.slug === 'snake')
    return snake(c); if (c.slug === 'tetris')
    return tetris(c); return breakout(c); }
function loop(c: GameContext, update: (dt: number) => void, draw: () => void) {
    let frame = 0, last = 0, dirty = true, disposed = false;
    const state = createGameState(value => { dirty = true; c.setState(value); });
    c.setState('ready');
    function tick(now: number) {
        if (disposed)
            return;
        frame = requestAnimationFrame(tick);
        const dt = Math.min(.05, (now - last) / 1000 || .016);
        last = now;
        if (document.hidden)
            return;
        if (state.value === 'running') {
            update(dt);
            dirty = true;
        }
        if (dirty) {
            draw();
            dirty = false;
        }
    }
    frame = requestAnimationFrame(tick);
    c.root.addEventListener('game-background', () => { state.suspend(); last = 0; if (state.value === 'paused')
        c.setStatus('Paused while you were away. Press Resume to continue.'); }, { signal: c.signal });
    return { pause() { last = 0; return state.pause(); }, get paused() { return state.value !== 'running'; }, stop() { state.end(); }, start() { last = 0; state.start(); }, invalidate() { dirty = true; }, dispose() { disposed = true; cancelAnimationFrame(frame); } };
}
const ink = ['#ad99e5', '#a9dce5', '#c6eaa5', '#e6bc88', '#df9aa8', '#94b4e9', '#d4d0a0'];
function background(ctx: CanvasRenderingContext2D) { ctx.fillStyle = '#0b1019'; ctx.fillRect(0, 0, 600, 600); ctx.strokeStyle = '#ffffff04'; ctx.lineWidth = 1; for (let i = 0; i < 600; i += 30) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 600);
    ctx.moveTo(0, i);
    ctx.lineTo(600, i);
    ctx.stroke();
} }
function instruction(ctx: CanvasRenderingContext2D, text: string) { ctx.fillStyle = '#0b1019cc'; ctx.fillRect(50, 245, 500, 95); ctx.textAlign = 'center'; ctx.fillStyle = '#d6e5c8'; ctx.font = '20px sans-serif'; ctx.fillText(text, 300, 299); ctx.textAlign = 'left'; }
function snake(c: GameContext): GameController {
    const ctx = c.canvas.getContext('2d')!;
    let state: SnakeV2 = { body: [209, 208, 207], direction: 1, food: 214, score: 0, over: false }, requested = 1, acc = 0, speed = 1;
    const speedLabel = document.createElement('label');
    speedLabel.textContent = 'Speed';
    const speedSelect = document.createElement('select');
    ['Easy', 'Normal', 'Fast'].forEach((v, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = v; speedSelect.appendChild(o); });
    speedSelect.value = '1';
    speedLabel.appendChild(speedSelect);
    c.extra.appendChild(speedLabel);
    speedSelect.addEventListener('change', () => { speed = Number(speedSelect.value); }, { signal: c.signal });
    c.setRules('Arrow keys or WASD steer. Opposite turns are ignored. Eat the glowing food and avoid your body.' + (c.mode === 0 ? ' Walls end the round.' : c.mode === 1 ? ' Cross an edge to return on the other side.' : ' Avoid the two fixed walls.') + ' Enter or Space starts / pauses. Swipe or use the direction buttons on touch screens.');
    const runtime = loop(c, dt => { if (state.over)
        return; acc += dt; if (acc < [.19, .12, .075][speed])
        return; acc -= [.19, .12, .075][speed]; state = snakeStep(state, requested, c.mode); requested = state.direction; c.setScore(state.score); if (state.over) {
        runtime.stop();
        c.finish(state.food === -1 ? 'The whole universe is yours.' : 'An unexpected turn.', `Your score: ${state.score}.`);
    } }, () => { background(ctx); if (c.mode === 2) {
        ctx.fillStyle = '#544e69';
        snakeObstacles.forEach(i => ctx.fillRect(i % 20 * 30 + 2, Math.floor(i / 20) * 30 + 2, 26, 26));
    } state.body.forEach((i, n) => { ctx.fillStyle = n === 0 ? '#d0f4a7' : `hsl(${95 + n * 1.3} 35% ${Math.max(30, 65 - n)}%)`; ctx.shadowColor = '#bfea99'; ctx.shadowBlur = n === 0 ? 12 : 0; ctx.beginPath(); ctx.roundRect(i % 20 * 30 + 3, Math.floor(i / 20) * 30 + 3, 24, 24, 5); ctx.fill(); }); ctx.shadowBlur = 0; if (state.food >= 0) {
        ctx.fillStyle = '#c3a4f0';
        ctx.shadowColor = '#bb94ee';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(state.food % 20 * 30 + 15, Math.floor(state.food / 20) * 30 + 15, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    } if (runtime.paused && !state.over)
        instruction(ctx, 'Press Enter to follow the glow'); });
    function key(k: string) { if (state.over)
        return; const dirs: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }; if (k in dirs) {
        if ((dirs[k] + 2) % 4 !== state.direction)
            requested = dirs[k];
        if (runtime.paused)
            runtime.start();
    }
    else if (k === 'Enter' || k === ' ') {
        runtime.pause();
    } c.setStatus(runtime.paused ? 'Paused. Press Enter to continue.' : 'Follow the glow.'); }
    let origin: {
        x: number;
        y: number;
    } | null = null;
    c.canvas.addEventListener('pointerdown', e => { origin = { x: e.clientX, y: e.clientY }; c.canvas.setPointerCapture(e.pointerId); }, { signal: c.signal });
    c.canvas.addEventListener('pointerup', e => { if (!origin)
        return; const dx = e.clientX - origin.x, dy = e.clientY - origin.y; origin = null; if (Math.max(Math.abs(dx), Math.abs(dy)) > 15)
        key(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'ArrowRight' : 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp'); }, { signal: c.signal });
    c.setStatus('Press Enter or a direction to begin.');
    return { key, pause: () => runtime.pause(), dispose: () => runtime.dispose() };
}
function tetris(c: GameContext): GameController {
    const ctx = c.canvas.getContext('2d')!;
    let board = Array(200).fill(0), bag: number[] = [], queue: number[] = [], type = 0, piece: number[][] = [], x = 3, y = 0, hold = -1, held = false, lines = 0, score = 0, elapsed = 0, fall = 0, over = false;
    function nextType() { if (!bag.length)
        bag = shuffle([0, 1, 2, 3, 4, 5, 6]); return bag.pop()!; }
    for (let i = 0; i < 3; i++)
        queue.push(nextType());
    function spawn(newType?: number) { type = newType ?? queue.shift()!; if (newType === undefined)
        queue.push(nextType()); piece = tetrominoes[type].map(row => [...row]); x = Math.floor((10 - piece[0].length) / 2); y = 0; fall = 0; if (!pieceFits(board, piece, x, y)) {
        over = true;
        runtime.stop();
        c.finish('No more space.', `${lines} lines cleared. Score: ${score}.`);
    } }
    function lock() { board = lockPiece(board, piece, x, y, type + 1); const cleared = clearLines(board); board = cleared.board; lines += cleared.lines; score += [0, 100, 300, 500, 800][cleared.lines] * (1 + Math.floor(lines / 10)); c.setScore(score); held = false; if (c.mode === 1 && lines >= 40) {
        over = true;
        runtime.stop();
        c.setRecord(Math.round(elapsed * 1000));
        c.finish('Forty lines. One clear mind.', `Finished in ${elapsed.toFixed(1)} seconds.`);
        return;
    } spawn(); }
    function drop() { if (pieceFits(board, piece, x, y + 1)) {
        y++;
        return true;
    } lock(); return false; }
    function rotate() { const next = rotatePiece(piece); for (const offset of [0, -1, 1, -2, 2])
        if (pieceFits(board, next, x + offset, y)) {
            piece = next;
            x += offset;
            return;
        } }
    function holdPiece() { if (held)
        return; const old = hold; hold = type; spawn(old === -1 ? undefined : old); held = true; }
    const runtime = loop(c, dt => { if (over)
        return; elapsed += dt; fall += dt; if (fall > Math.max(.09, .75 - lines * .018)) {
        fall = 0;
        drop();
    } c.setStatus(`${lines}${c.mode === 1 ? ' / 40' : ''} lines · ${elapsed.toFixed(1)}s · Level ${1 + Math.floor(lines / 10)}`); }, draw);
    function tile(dx: number, dy: number, color: number, size = 26, alpha = 1) { ctx.globalAlpha = alpha; ctx.fillStyle = ink[(color - 1) % ink.length]; ctx.beginPath(); ctx.roundRect(dx + 1, dy + 1, size - 2, size - 2, 3); ctx.fill(); ctx.globalAlpha = 1; }
    function mini(t: number, xx: number, yy: number) { if (t < 0)
        return; tetrominoes[t].forEach((row, j) => row.forEach((v, i) => { if (v)
        tile(xx + i * 21, yy + j * 21, t + 1, 21); })); }
    function draw() { background(ctx); ctx.fillStyle = '#151b29'; ctx.fillRect(30, 35, 260, 520); board.forEach((v, i) => { if (v)
        tile(30 + i % 10 * 26, 35 + Math.floor(i / 10) * 26, v); }); let ghost = y; while (pieceFits(board, piece, x, ghost + 1))
        ghost++; piece.forEach((row, j) => row.forEach((v, i) => { if (v) {
        tile(30 + (x + i) * 26, 35 + (ghost + j) * 26, type + 1, 26, .17);
        tile(30 + (x + i) * 26, 35 + (y + j) * 26, type + 1);
    } })); ctx.fillStyle = '#8d96ab'; ctx.font = '13px sans-serif'; ctx.fillText('NEXT', 340, 58); queue.forEach((v, i) => mini(v, 340, 80 + i * 70)); ctx.fillText('HOLD · C', 340, 340); mini(hold, 340, 365); ctx.fillStyle = '#c4d7b1'; ctx.font = '19px sans-serif'; ctx.fillText(`${lines} LINES`, 340, 470); ctx.font = '13px sans-serif'; ctx.fillStyle = '#8d96ab'; ctx.fillText('↑ Rotate   ↓ Soft drop', 340, 510); ctx.fillText('Space: hard drop', 340, 535); if (runtime.paused && !over)
        instruction(ctx, 'Press Enter to begin'); }
    c.setRules('Left / right moves, Up rotates, Down soft-drops, Space hard-drops. C holds one piece per drop. Enter pauses or starts. Complete rows to clear them. Marathon speeds up; Sprint ends after 40 lines.');
    extraButton(c, 'Hold · C', () => key('c'));
    extraButton(c, 'Rotate ↑', () => key('ArrowUp'));
    extraButton(c, 'Drop ␣', () => key(' '));
    function key(k: string) { if (over)
        return; if (k === 'Enter') {
        runtime.pause();
        return;
    } if (runtime.paused)
        return; if (k === 'ArrowLeft' && pieceFits(board, piece, x - 1, y))
        x--; if (k === 'ArrowRight' && pieceFits(board, piece, x + 1, y))
        x++; if (k === 'ArrowUp')
        rotate(); if (k === 'ArrowDown') {
        if (drop())
            score++;
        c.setScore(score);
    } if (k === ' ') {
        while (pieceFits(board, piece, x, y + 1)) {
            y++;
            score += 2;
        }
        lock();
    } if (k.toLowerCase() === 'c')
        holdPiece(); }
    spawn();
    c.setStatus('Press Enter to begin.');
    return { key, pause: () => runtime.pause(), dispose: () => runtime.dispose() };
}
function breakout(c: GameContext): GameController {
    const heldKeys = new Set<string>();
    const ctx = c.canvas.getContext('2d')!;
    let paddle = 300, ball = { x: 300, y: 510, vx: 155, vy: -235 }, lives = 3, level = 1, score = 0, launched = false, over = false, bricks: {
        x: number;
        y: number;
        hp: number;
    }[] = [], sparks: {
        x: number;
        y: number;
        vx: number;
        vy: number;
        life: number;
    }[] = [];
    function build() { bricks = []; const rows = Math.min(7, 3 + level); for (let y = 0; y < rows; y++)
        for (let x = 0; x < 9; x++) {
            if (c.mode === 0 && level % 2 === 0 && (x + y) % 4 === 0)
                continue;
            bricks.push({ x: 24 + x * 62, y: 65 + y * 27, hp: level >= 3 && y === 0 ? 2 : 1 });
        } }
    function resetBall() { launched = false; ball = { x: paddle, y: 510, vx: 155, vy: -235 - Math.min(level, 10) * 15 }; }
    const runtime = loop(c, dt => {
        if (over)
            return;
        paddle = Math.max(50, Math.min(550, paddle + (Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft'))) * 380 * dt));
        if (!launched) {
            ball.x = paddle;
            return;
        }
        const steps = 3;
        for (let step = 0; step < steps; step++) {
            const delta = dt / steps, oldX = ball.x, oldY = ball.y;
            ball.x += ball.vx * delta;
            ball.y += ball.vy * delta;
            if (ball.x < 9) {
                ball.x = 9;
                ball.vx = Math.abs(ball.vx);
            }
            if (ball.x > 591) {
                ball.x = 591;
                ball.vx = -Math.abs(ball.vx);
            }
            if (ball.y < 9) {
                ball.y = 9;
                ball.vy = Math.abs(ball.vy);
            }
            if (ball.vy > 0 && circleRect(ball.x, ball.y, 7, paddle - 48, 530, 96, 12)) {
                const angle = (ball.x - paddle) / 48;
                const speed = Math.min(460, Math.hypot(ball.vx, ball.vy) + 5);
                ball.vx = angle * speed * .8;
                ball.vy = -Math.sqrt(speed * speed - ball.vx * ball.vx);
                ball.y = 521;
            }
            for (let i = 0; i < bricks.length; i++) {
                const brick = bricks[i];
                if (!circleRect(ball.x, ball.y, 7, brick.x, brick.y, 54, 18))
                    continue;
                if (oldY + 7 <= brick.y || oldY - 7 >= brick.y + 18)
                    ball.vy *= -1;
                else if (oldX + 7 <= brick.x || oldX - 7 >= brick.x + 54)
                    ball.vx *= -1;
                else
                    ball.vy *= -1;
                brick.hp--;
                if (brick.hp <= 0) {
                    bricks.splice(i, 1);
                    score += 10;
                    for (let j = 0; j < 7; j++)
                        sparks.push({ x: ball.x, y: ball.y, vx: (Math.random() - .5) * 180, vy: (Math.random() - .5) * 180, life: .5 });
                }
                break;
            }
            if (ball.y > 620) {
                lives--;
                if (lives === 0) {
                    over = true;
                    runtime.stop();
                    c.finish('The light rests.', `Score ${score} · Wave ${level}`);
                }
                else
                    resetBall();
                break;
            }
        }
        if (!bricks.length && !over) {
            if (c.mode === 0 && level === 5) {
                over = true;
                runtime.stop();
                c.finish('Every prism, broken.', `All five levels cleared. Score ${score}.`);
            }
            else {
                level++;
                build();
                resetBall();
            }
        }
        sparks = sparks.filter(s => s.life > 0);
        sparks.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; });
        c.setScore(score);
        c.setStatus(`Wave ${level}${c.mode === 0 ? ' / 5' : ''} · ${lives} lives${!launched ? ' · Tap or Enter to launch' : ''}`);
    }, () => { background(ctx); bricks.forEach(b => { ctx.fillStyle = b.hp === 2 ? '#f1d5a1' : ink[Math.floor((b.y - 65) / 27) % ink.length]; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 5; ctx.beginPath(); ctx.roundRect(b.x, b.y, 54, 18, 4); ctx.fill(); }); ctx.shadowBlur = 0; ctx.fillStyle = '#c7eaa8'; ctx.beginPath(); ctx.roundRect(paddle - 48, 530, 96, 12, 6); ctx.fill(); ctx.shadowColor = '#d8c5ff'; ctx.shadowBlur = 18; ctx.fillStyle = '#e1d6f7'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; sparks.forEach(s => { ctx.globalAlpha = s.life * 2; ctx.fillStyle = '#c7b1ea'; ctx.fillRect(s.x, s.y, 3, 3); }); ctx.globalAlpha = 1; if (runtime.paused && !over)
        instruction(ctx, 'Tap or press Enter to launch'); });
    function launch() { if (over)
        return; runtime.start(); launched = true; }
    function key(k: string) { if (over)
        return; if (k === 'ArrowLeft' || k === 'ArrowRight') {
        heldKeys.add(k);
        if (runtime.paused) {
            paddle = Math.max(50, Math.min(550, paddle + (k === 'ArrowLeft' ? -18 : 18)));
            if (!launched)
                ball.x = paddle;
            runtime.invalidate();
        }
    } if (k === 'Enter' || k === ' ') {
        if (runtime.paused || !launched)
            launch();
        else
            runtime.pause();
    } }
    c.canvas.addEventListener('pointermove', e => { const r = c.canvas.getBoundingClientRect(); if (runtime.paused && launched)
        return; paddle = Math.max(50, Math.min(550, (e.clientX - r.left) / r.width * 600)); if (!launched)
        ball.x = paddle; runtime.invalidate(); }, { signal: c.signal });
    c.canvas.addEventListener('pointerdown', e => { c.canvas.setPointerCapture(e.pointerId); c.surface.focus({ preventScroll: true }); const r = c.canvas.getBoundingClientRect(); if (!launched)
        paddle = Math.max(50, Math.min(550, (e.clientX - r.left) / r.width * 600)); launch(); }, { signal: c.signal });
    c.setRules('Move the paddle with your pointer, touch, or left / right keys. Tap or press Enter to launch. Space / Enter pauses once the ball is moving. Keep the ball above the paddle. You have three lives. Levels ends after five fields; Endless keeps adding waves.');
    build();
    c.setStatus('Tap the field or press Enter to launch.');
    c.root.addEventListener('game-background', () => heldKeys.clear(), { signal: c.signal });
    return { key, keyUp: k => heldKeys.delete(k), release: () => heldKeys.clear(), pause: () => { heldKeys.clear(); return runtime.pause(); }, dispose: () => runtime.dispose() };
}
