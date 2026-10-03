/** In-place radix-2 FFT. Rows then columns; inverse is normalized. */
export function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length;
  if (n < 2 || (n & (n - 1)) || im.length !== n) throw new Error('FFT requires a power-of-two length.');
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]];[im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len *= 2) { const a = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let r = 1, m = 0; for (let j = 0; j < len / 2; j++) { const u = i + j, v = u + len / 2, vr = re[v] * r - im[v] * m, vi = re[v] * m + im[v] * r; re[v] = re[u] - vr; im[v] = im[u] - vi; re[u] += vr; im[u] += vi; const t = r * wr - m * wi; m = r * wi + m * wr; r = t; } } }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
export function fft2(re: Float64Array, im: Float64Array, n: number, inverse = false) {
  const r = new Float64Array(n), m = new Float64Array(n);
  for (let y = 0; y < n; y++) fft(re.subarray(y * n, (y + 1) * n), im.subarray(y * n, (y + 1) * n), inverse);
  for (let x = 0; x < n; x++) { for (let y = 0; y < n; y++) { r[y] = re[y * n + x]; m[y] = im[y * n + x]; } fft(r, m, inverse); for (let y = 0; y < n; y++) { re[y * n + x] = r[y]; im[y * n + x] = m[y]; } }
}
export class Convolver {
  n: number; kr: Float64Array; ki: Float64Array; re: Float64Array; im: Float64Array;
  constructor(kernel: Float64Array, n: number) { this.n = n; this.kr = kernel.slice(); this.ki = new Float64Array(n * n); this.re = new Float64Array(n * n); this.im = new Float64Array(n * n); fft2(this.kr, this.ki, n); }
  apply(field: Float32Array) { this.re.set(field); this.im.fill(0); fft2(this.re, this.im, this.n); for (let i = 0; i < this.re.length; i++) { const r = this.re[i] * this.kr[i] - this.im[i] * this.ki[i]; this.im[i] = this.re[i] * this.ki[i] + this.im[i] * this.kr[i]; this.re[i] = r; } fft2(this.re, this.im, this.n, true); return this.re; }
}
