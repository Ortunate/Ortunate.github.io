import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterStories, readReadingList, toggleRead, toggleSaved, READING_LIMIT} from '../src/lib/reading.ts';
import type {Story} from '../src/lib/news.ts';
const story = (id = 1): Story => ({id, title: 'A new browser tool', url: 'https://example.com/read', time: 1_700_000_000, score: 10, comments: 5});

test('saving snapshots survives feed changes and toggles without mutating prior state', () => {
  const initial = readReadingList(null);
  const saved = toggleSaved(initial, story());
  assert.equal(initial.saved.length, 0);
  assert.deepEqual(readReadingList(JSON.stringify(saved)).saved, [story()]);
  assert.equal(toggleSaved(saved, {...story(), score: 99}).saved.length, 0);
  assert.equal(saved.saved[0].score, 10);
});
test('reading list bounds saves without silently evicting existing stories', () => {
  const full = {version: 1 as const, saved: Array.from({length: READING_LIMIT}, (_, i) => story(i+1)), read: []};
  assert.throws(() => toggleSaved(full, story(99)), /50/);
  assert.equal(toggleSaved(full, story(1)).saved.length, 49);
  assert.equal(full.saved.length, 50);
});
test('read marks toggle and retain at most the latest 200 IDs independently of saves', () => {
  const initial = {version: 1 as const, saved: [story()], read: Array.from({length: 200}, (_, i) => i+1)};
  const next = toggleRead(initial, 201);
  assert.equal(next.read.length, 200); assert.equal(next.read[0], 201); assert.ok(!next.read.includes(200));
  assert.equal(toggleRead(next, 201).read.includes(201), false);
  assert.deepEqual(next.saved, initial.saved);
});
test('reading storage validates snapshots, deduplicates IDs, and normalizes unsafe URLs', () => {
  const data = {version: 1, saved: [story(), null, story(), {...story(2), url: 'javascript:alert(1)'}], read: [1, 1, '2', -1, 2]};
  const list = readReadingList(JSON.stringify(data));
  assert.equal(list.saved.length, 2);
  assert.equal(list.saved[1].url, 'https://news.ycombinator.com/item?id=2');
  assert.deepEqual(list.read, [1, 2]);
  for (const raw of ['{', 'null', '{"version":2}', '{}']) assert.deepEqual(readReadingList(raw), {version: 1, saved: [], read: []});
});
test('local filters combine title, domain, Unicode normalization and unread status', () => {
  const stories = [story(), {...story(2), title: 'Other topic'}];
  assert.deepEqual(filterStories(stories, ' ＢＲＯＷＳＥＲ example ', false, [1]).map(item => item.id), [1]);
  assert.equal(filterStories(stories, 'browser', true, [1]).length, 0);
  assert.deepEqual(filterStories(stories, '', true, [1]).map(item => item.id), [2]);
});
