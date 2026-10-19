// Runs before paint in both layouts; no dependency on page controllers.
(() => {
  const root = document.documentElement;
  const media = matchMedia('(prefers-color-scheme: dark)');
  let theme = 'green', mode = 'system';
  const validTheme = value => /^(green|blue|purple|rose|amber)$/.test(value) ? value : 'green';
  const validMode = value => /^(system|light|dark)$/.test(value) ? value : 'system';
  const apply = () => {
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    root.dataset.colorMode = mode === 'system' ? (media.matches ? 'dark' : 'light') : mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', root.dataset.colorMode === 'dark' ? '#090b12' : '#f6f7f9');
    window.dispatchEvent(new Event('appearancechange'));
  };
  try { theme = validTheme(localStorage.getItem('ortunate:theme:v1')); mode = validMode(localStorage.getItem('ortunate:color-mode:v1')); } catch {}
  window.addEventListener('storage', event => {
    if (event.key === 'ortunate:theme:v1' || event.key === null) theme = validTheme(event.newValue);
    if (event.key === 'ortunate:color-mode:v1' || event.key === null) mode = validMode(event.newValue);
    if (event.key === null || event.key === 'ortunate:theme:v1' || event.key === 'ortunate:color-mode:v1') apply();
  });
  window.addEventListener('appearanceinput', event => {
    if (event.detail.theme !== undefined) theme = validTheme(event.detail.theme);
    if (event.detail.mode !== undefined) mode = validMode(event.detail.mode);
    apply();
  });
  media.addEventListener('change', () => { if (mode === 'system') apply(); });
  apply();
})();
