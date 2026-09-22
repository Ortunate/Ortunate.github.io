import { personalKeys, readIds, remember } from '../lib/personal';

function record(id: string) {
  try {
    localStorage.setItem(personalKeys.recent, JSON.stringify(remember(readIds(localStorage.getItem(personalKeys.recent)), id)));
    window.dispatchEvent(new Event('ortunate:personal'));
  } catch { /* Browsing still works when storage is unavailable. */ }
}
// Local detail pages also count when reached through bookmarks or a direct URL.
const detail = location.pathname.match(/^\/(tools|play|visuals)\/([^/]+)\/?$/);
if (detail) record(`${detail[1]}:${detail[2]}`);
function track(event: MouseEvent) {
  if (event.type === 'auxclick' && event.button !== 1) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-track-entry]') : null;
  if (link?.dataset.trackEntry) record(link.dataset.trackEntry);
}
document.addEventListener('click', track);
document.addEventListener('auxclick', track);
