import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesBrowse, parseSaved, readBrowseState, writeBrowseState } from '../src/lib/browse.ts';

test('shared search combines words, category and saved state with Unicode normalization', () => {
  const entry = {text: 'JSON Studio — Developer Tools 中文', category: 'Tools', saved: true};
  assert.equal(matchesBrowse(entry, {query: ' studio  ＪＳＯＮ ', category: 'Tools', savedOnly: true}), true);
  assert.equal(matchesBrowse(entry, {query: '中文', category: 'All', savedOnly: false}), true);
  assert.equal(matchesBrowse(entry, {query: 'json missing', category: 'All', savedOnly: false}), false);
  assert.equal(matchesBrowse(entry, {query: '', category: 'Games', savedOnly: false}), false);
  assert.equal(matchesBrowse({...entry, saved: false}, {query: '', category: 'All', savedOnly: true}), false);
});

test('browse URLs restore filters, preserve unrelated state and clean reset parameters', () => {
  const original = new URL('https://example.com/explore/?utm_source=friend#main');
  const state = {query: '中文 & tools', category: 'Tools', savedOnly: true};
  const next = writeBrowseState(original, state);
  assert.deepEqual(readBrowseState(next.searchParams, ['All', 'Tools']), state);
  assert.equal(next.searchParams.get('utm_source'), 'friend');
  assert.equal(next.hash, '#main');
  assert.equal(original.searchParams.has('q'), false);
  assert.equal(writeBrowseState(next, {query: '', category: 'All', savedOnly: false}).href, original.href);
  assert.deepEqual(readBrowseState(new URLSearchParams('category=Unknown&saved=no'), ['All']), {query: '', category: 'All', savedOnly: false});
});

test('corrupt or unexpected saved data degrades safely while retaining valid legacy IDs', () => {
  for (const raw of [null, '{', 'null', '{}', '123']) assert.equal(parseSaved(raw).size, 0);
  assert.deepEqual([...parseSaved('["hn",null,42,"tools:json","hn"]')], ['hn', 'tools:json']);
});
