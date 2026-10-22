const dialog = document.querySelector('#appearance-dialog');
const status = dialog.querySelector('.appearance-status');
function sync() {
  const { theme, mode } = document.documentElement.dataset;
  dialog.querySelectorAll('input').forEach(input => {
    input.checked = input.name === 'appearance-theme' ? input.value === theme : mode === 'system';
  });
}
dialog.addEventListener('change', event => {
  const input = event.target;
  if (!input.matches('input')) return;
  const theme = input.name === 'appearance-theme';
  const field = theme ? 'theme' : 'mode';
  window.dispatchEvent(new CustomEvent('appearanceinput', { detail: { [field]: theme ? input.value : input.checked ? 'system' : document.documentElement.dataset.colorMode } }));
  try {
    localStorage.setItem(theme ? 'ortunate:theme:v1' : 'ortunate:color-mode:v1', document.documentElement.dataset[field]);
    status.textContent = 'Appearance saved on this device.';
  } catch { status.textContent = 'Applied for this page. Your appearance preference could not be saved.'; }
});
dialog.addEventListener('close', () => document.querySelector('.appearance-open')?.focus());
// Keep page/game shortcuts from consuming radio keys or Escape inside the modal.
for (const name of ['keydown', 'keyup']) dialog.addEventListener(name, event => event.stopPropagation());
window.addEventListener('appearancechange', sync);
export function openAppearance() {
  status.textContent = '';
  dialog.querySelectorAll('fieldset').forEach(field => { field.disabled = false; });
  sync();
  if (!dialog.open) dialog.showModal();
}
