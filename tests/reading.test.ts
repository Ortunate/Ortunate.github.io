import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readReadingList} from '../src/lib/reading.ts';
import type {Story} from '../src/lib/news-model.ts';
const story = (id = 1): Story => ({id, title: 'A saved headline', url: 'https://example.com/read', time: 1_700_000_000, score: 10, comments: 5});
test('reading storage validates snapshots, deduplicates IDs, and normalizes unsafe URLs', () => {
  const data = {version: 1, saved: [story(), null, story(), {...story(2), url: 'javascript:alert(1)'}], read: [1, 1, '2', -1, 2]};
  const list = readReadingList(JSON.stringify(data));
  assert.equal(list.saved.length, 2);
  assert.equal(list.saved[1].url, 'https://news.ycombinator.com/item?id=2');
  assert.deepEqual(list.read, [1, 2]);
  for (const raw of ['{', 'null', '{"version":2}', '{}']) assert.deepEqual(readReadingList(raw), {version: 1, saved: [], read: []});
});

test('legacy HN and DEV snapshots remain distinct and exportable',()=>{
 const saved=[story(),{...story(),id:'dev:1',url:'https://dev.to/author/post'}];
 const old={version:1,saved,read:[1,'dev:1']};
 assert.deepEqual(readReadingList(JSON.stringify(old)),old);
 assert.deepEqual(readReadingList(JSON.stringify(readReadingList(JSON.stringify(old)))),old);
});
