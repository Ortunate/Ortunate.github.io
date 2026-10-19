import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStory, normalizeStoredStory, readNewsCache, loadNews, discussionUrl, storyDiscussion } from '../src/lib/news.ts';
import {readReadingList, toggleRead, toggleSaved} from '../src/lib/reading.ts';

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

test('DEV uses one bounded public request and validates source URLs independently',async()=>{
  const article={id:1,title:'A DEV article',url:'https://dev.to/example/article',published_at:'2026-01-01T00:00:00Z',public_reactions_count:12,comments_count:3};
  let requests=0;
  const result=await loadNews('dev',new AbortController().signal,(async (url,options)=>{
    requests++;assert.equal(url,'https://dev.to/api/articles?per_page=12');
    assert.equal(options?.credentials,'omit');
    return response([article,article,{...article,id:2,url:'https://evil.example/article'},...Array.from({length:20},(_,i)=>({...article,id:i+3}))]);
  }) as typeof fetch);
  assert.equal(requests,1);assert.ok(result.stories.length<=12);assert.equal(result.partial,true);
  assert.equal(result.stories[0].id,'dev:1');
  assert.equal(storyDiscussion(result.stories[0]),article.url+'#comments');
  assert.equal(readNewsCache(JSON.stringify(result))?.stories[0].id,'dev:1');
  for(const value of [{...result.stories[0],id:'dev:01'},{...result.stories[0],url:'http://dev.to/test'},{...result.stories[0],url:'https://user@dev.to/test'}])assert.equal(normalizeStoredStory(value),null);
});

test('DEV and HN IDs cannot collide in legacy-compatible saved stories and read marks',()=>{
  const hn=normalizeStory(story(1))!;
  const dev=normalizeStoredStory({...hn,id:'dev:1',url:'https://dev.to/user/article'})!;
  let list=toggleSaved(toggleSaved(readReadingList(null),hn),dev);
  list=toggleRead(toggleRead(list,hn.id),dev.id);
  assert.deepEqual(readReadingList(JSON.stringify(list)),list);
  assert.deepEqual(toggleRead(list,'dev:1').read,[1]);
  assert.equal(toggleSaved(list,hn).saved[0].id,'dev:1');
});

test('DEV rejects unavailable, empty and aborted results',async()=>{
  for(const data of [[],{},[{id:1}]])await assert.rejects(loadNews('dev',new AbortController().signal,(async()=>response(data)) as typeof fetch));
  await assert.rejects(loadNews('dev',new AbortController().signal,(async()=>response({},429)) as typeof fetch),/unavailable/);
  const controller=new AbortController();controller.abort();let fetched=false;
  await assert.rejects(loadNews('dev',controller.signal,(async()=>{fetched=true;return response([]);}) as typeof fetch),{name:'AbortError'});
  assert.equal(fetched,false);
});
