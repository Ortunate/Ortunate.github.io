import { notify } from './storage';
import './recent';
const motionButton = document.querySelector<HTMLButtonElement>('#motion-toggle');
const root = document.documentElement;
function updateMotion() {
  const reduced = root.dataset.motion === 'reduced';
  if (motionButton) { motionButton.innerHTML = `Motion: ${reduced ? 'Reduced' : 'Full'} <span aria-hidden="true">${reduced ? '○' : '◉'}</span>`; motionButton.setAttribute('aria-label', reduced ? 'Enable full visual motion' : 'Reduce visual motion'); }
  window.dispatchEvent(new Event('motionchange'));
}
motionButton?.addEventListener('click', () => {
  root.dataset.motion = root.dataset.motion === 'reduced' ? 'full' : 'reduced';
  try { localStorage.setItem('ortunate:motion', root.dataset.motion); } catch { notify('Your motion preference could not be saved.'); }
  updateMotion();
});
updateMotion();
