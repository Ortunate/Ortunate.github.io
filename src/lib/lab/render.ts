import type { State } from './engine.ts';
const materials = [[9, 15, 25], [229, 188, 116], [54, 144, 205], [125, 137, 158], [143, 100, 69], [255, 119, 58], [166, 215, 225], [91, 99, 118]];
export function pixels(state: State, view = 0, derived?: Float32Array) {
  const n = state.size, rgba = new Uint8ClampedArray(n * n * 4), f = state.model === 'reaction' ? state.fields[1] : derived || state.fields[0];
  for (let y = 0; y < n; y++)for (let x = 0; x < n; x++) {    
const i = y * n + x; let r: number, g: number, b: number;
    if (state.model === 'sand') { [r, g, b] = materials[state.fields[0][i]]; const d = ((x * 17 + y * 29) % 11) - 5; r += d; g += d; b += d; }
    else if (state.model === 'reaction' && state.fields[2][i]) { r = 130; g = 135; b = 152; }
    else {      
let v = Math.max(0, Math.min(1, state.model === 'reaction' ? f[i] * 2 : state.model === 'lenia' && view === 2 ? (f[i] + 1) / 2 : f[i]));
      if (state.model === 'reaction' && view === 1) { const dx = f[y * n + (x + 1) % n] - f[y * n + (x + n - 1) % n], dy = f[((y + 1) % n) * n + x] - f[((y + n - 1) % n) * n + x], light = Math.max(.15, Math.min(1.8, .65 + (dx - dy) * 7)); r = (32 + v * 170) * light; g = (44 + v * 175) * light; b = (61 + v * 160) * light; }
      else if (state.model === 'reaction') { r = 10 + v * 225; g = 18 + Math.pow(v, .65) * 169; b = 30 + v * 100; }
      else { r = 9 + Math.pow(v, 2) * 195; g = 19 + Math.pow(v, .7) * 216; b = 30 + Math.pow(v, .55) * 180; }
    } rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  } return rgba;
}
export function drawState(canvas: HTMLCanvasElement, state: State, view = 0, derived?: Float32Array) { if (canvas.width !== state.size) { canvas.width = canvas.height = state.size; } canvas.getContext('2d')?.putImageData(new ImageData(pixels(state, view, derived), state.size, state.size), 0, 0); }
