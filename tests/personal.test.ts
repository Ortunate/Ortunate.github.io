import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importPersonal, normalizePersonal, readIds, remember } from '../src/lib/personal.ts';

test('recent entries are deduplicated, promoted, and bounded without mutating input', () => {
  const old = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  assert.deepEqual(remember(old, 'c'), ['c', 'a', 'b', 'd', 'e', 'f', 'g', 'h']);
  assert.deepEqual(remember(old, 'new'), ['new', 'a', 'b', 'c', 'd', 'e', 'f', 'g']);
  assert.equal(old[0], 'a');
});

test('pins only reference known saved entries and obey the six-place limit', () => {
  const known = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  const result = normalizePersonal([...known, 'unknown', 'a'], ['unknown', ...known, 'b'], known);
  assert.equal(result.saved.length, 7);
  assert.deepEqual(result.pinned, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(normalizePersonal(['a'], ['b'], known).pinned, []);
});

test('backups merge idempotently, retain current pins, and ignore unknown content', () => {
  const known = new Set(['hn', 'tools:json', 'radio']);
  const current = normalizePersonal(['hn'], ['hn'], known);
  const backup = JSON.stringify({version: 1, saved: ['tools:json', 'hn', 'https://malicious.example'], pinned: ['tools:json', 'radio'], recent: ['private']});
  const result = importPersonal(backup, current, known);
  assert.deepEqual(result, {version: 1, saved: ['hn', 'tools:json'], pinned: ['hn', 'tools:json']});
  assert.deepEqual(importPersonal(backup, result, known), result);
  assert.deepEqual(current.saved, ['hn']);
});

test('invalid imports fail without changing the collection; corrupt storage is recoverable', () => {
  const current = normalizePersonal(['a'], [], new Set(['a']));
  for (const raw of ['{', 'null', '[]', '{"version":2,"saved":[],"pinned":[]}', '{"version":1,"saved":[42],"pinned":[]}', ' '.repeat(65_537)]) {
    assert.throws(() => importPersonal(raw, current, new Set(['a'])));
  }
  assert.deepEqual(current.saved, ['a']);
  assert.deepEqual(readIds('{'), []);
  assert.deepEqual(readIds('["a",null,"a",42,"b"]'), ['a', 'b']);
});
