import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStory, readNewsCache, loadNews, discussionUrl } from '../src/lib/news.ts';

const story = (id = 1) => ({id, type: 'story', title: 'A useful idea', url: 'https://example.com/article', time: 1_700_000_000, score: 10, descendants: 3});
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status});

test('news validates items and falls back to discussion for unsafe or missing URLs', () => {
  for (const value of [null, {...story(), deleted: true}, {...story(), dead: true}, {...story(), type: 'comment'}, {...story(), id: '1'}, {...story(), title: ''}, {...story(), time: Infinity}]) assert.equal(normalizeStory(value), null);
  for (const url of [undefined, 'javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com']) {
    assert.equal(normalizeStory({...story(), url})?.url, discussionUrl(1));
  }
  assert.equal(normalizeStory({...story(), score: -4, descendants: '3'})?.comments, 0);
  assert.equal(normalizeStory({...story(), title: '<img src=x onerror=alert(1)>'})?.title, '<img src=x onerror=alert(1)>');
});

test('cache ignores malformed, future, expired and duplicate entries', () => {
  const now = 1_800_000_000_000;
  const valid = normalizeStory(story());
  const cache = {fetchedAt: now - 60_000, stories: [valid], partial: false};
  assert.equal(readNewsCache(JSON.stringify(cache), now)?.stories.length, 1);
  assert.equal(readNewsCache(JSON.stringify({...cache, stories: [valid, valid]}), now)?.stories.length, 1);
  for (const raw of ['{', 'null', JSON.stringify({...cache, fetchedAt: now + 1}), JSON.stringify({...cache, fetchedAt: now - 8 * 86_400_000}), JSON.stringify({...cache, stories: []})]) assert.equal(readNewsCache(raw, now), null);
});

test('feed loader limits concurrency, retains source order and tolerates individual failures', async () => {
  let active = 0; let maximum = 0;
  const fetcher = (async (url: string) => {
    if (url.endsWith('topstories.json')) return response([1, 2, 3, 4, 5, 6, 1, 'bad']);
    const id = Number(url.match(/item\/(\d+)/)?.[1]);
    active++; maximum = Math.max(maximum, active);
    await new Promise(resolve => setTimeout(resolve, id % 2 ? 5 : 1));
    active--;
    if (id === 2) return response(null, 503);
    return response(story(id));
  }) as typeof fetch;
  const result = await loadNews('top', new AbortController().signal, fetcher);
  assert.ok(maximum <= 4); assert.ok(maximum > 1);
  assert.deepEqual(result.stories.map(item => item.id), [1, 3, 4, 5, 6]);
  assert.equal(result.partial, true);
});

test('feed loader caps request count, rejects mismatched items and empty results', async () => {
  let requests = 0;
  const fetcher = (async (url: string) => {
    requests++;
    return url.endsWith('newstories.json') ? response(Array.from({length: 100}, (_, i) => i + 1)) : response(story(999));
  }) as typeof fetch;
  await assert.rejects(loadNews('new', new AbortController().signal, fetcher), /could not be loaded/);
  assert.equal(requests, 13);
  await assert.rejects(loadNews('top', new AbortController().signal, (async () => response([])) as typeof fetch), /No stories/);
});

test('aborted feed cannot return partial results as a successful refresh', async () => {
  const controller = new AbortController();
  const fetcher = (async (url: string) => {
    if (url.endsWith('showstories.json')) return response([1]);
    controller.abort(); return response(story());
  }) as typeof fetch;
  await assert.rejects(loadNews('show', controller.signal, fetcher), {name: 'AbortError'});
});
