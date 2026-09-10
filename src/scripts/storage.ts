let warned = false;
export function notify(message: string) {
  const el = document.getElementById('notice');
  if (!el) return;
  el.textContent = message; el.classList.add('visible');
  window.clearTimeout(noticeTimer); noticeTimer = window.setTimeout(() => el.classList.remove('visible'), 4500);
}
let noticeTimer = 0;
function warn() { if (!warned) { warned = true; notify('Browser storage is unavailable. Your progress will not be saved.'); } }
export function read<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(`ortunate:${key}`); return value === null ? fallback : JSON.parse(value) as T; }
  catch { warn(); return fallback; }
}
export function save(key: string, value: unknown) {
  try { localStorage.setItem(`ortunate:${key}`, JSON.stringify(value)); } catch { warn(); }
}
export async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); notify('Copied to clipboard.'); }
  catch { notify('Copy is unavailable. Select the text and copy it manually.'); }
}
