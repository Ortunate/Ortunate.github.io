import { notify } from './storage';
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
function updateClock() { const clock = document.querySelector('.local-time'); if (clock) clock.textContent = `${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} LOCAL`; }
updateClock(); window.setInterval(updateClock, 60_000);
document.querySelectorAll<HTMLElement>('.tilt-card').forEach(card => {
  card.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || root.dataset.motion === 'reduced') return;
    const r = card.getBoundingClientRect(); const x = (event.clientX-r.left)/r.width; const y = (event.clientY-r.top)/r.height;
    card.style.setProperty('--pointer-x', `${x*100}%`); card.style.setProperty('--pointer-y', `${y*100}%`);
    card.style.transform = `perspective(900px) rotateX(${(0.5-y)*5}deg) rotateY(${(x-0.5)*5}deg) translateY(-3px)`;
  });
  card.addEventListener('pointerleave', () => { card.style.transform=''; });
});
document.querySelectorAll<HTMLElement>('.magnetic').forEach(button => {
  button.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || root.dataset.motion==='reduced') return; const r=button.getBoundingClientRect(); button.style.transform=`translate(${(e.clientX-r.left-r.width/2)*.13}px, ${(e.clientY-r.top-r.height/2)*.15}px)`; });
  button.addEventListener('pointerleave', () => { button.style.transform=''; });
});
