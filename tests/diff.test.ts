import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareLines, comparisonText} from '../src/lib/diff.ts';
import {readTransfer} from '../src/lib/tool-transfer.ts';

test('line comparisons reconstruct both inputs and preserve line numbers', () => {
  for (const [before, after] of [['', ''], ['', 'new'], ['old', ''], ['a\nb\na', 'a\na\nc'], ['a\n', 'a'], ['你好\n🌌', '你好\nworld\n🌌']]) {
    const rows = compareLines(before, after);
    assert.equal(rows.filter(row => row.kind !== 'add').map(row => row.text).join('\n'), before);
    assert.equal(rows.filter(row => row.kind !== 'remove').map(row => row.text).join('\n'), after);
    const left = rows.filter(row => row.before !== null).map(row => row.before);
    const right = rows.filter(row => row.after !== null).map(row => row.after);
    assert.deepEqual(left, Array.from({length:left.length}, (_, i) => i+1));
    assert.deepEqual(right, Array.from({length:right.length}, (_, i) => i+1));
  }
});
test('comparison aligns insertions without flagging unchanged later lines', () => {
  const rows = compareLines('a\nb\nc', 'a\nnew\nb\nc');
  assert.deepEqual(rows.map(row => row.kind), ['same', 'add', 'same', 'same']);
  assert.equal(comparisonText(rows), '  a\n+ new\n  b\n  c');
  assert.deepEqual(compareLines('a\r\nb', 'a\nb').map(row => row.kind), ['same','same']);
  assert.deepEqual(compareLines(' a \n b', 'a\nb', true).map(row => row.kind), ['same','same']);
  assert.ok(compareLines('a b', 'ab', true).some(row => row.kind !== 'same'));
});
test('diff bounds character and line workloads before allocating the matrix', () => {
  assert.throws(() => compareLines('x'.repeat(100001), ''), /characters/);
  assert.throws(() => compareLines('', '\n'.repeat(1000)), /lines/);
  assert.equal(compareLines(Array(1000).fill('a').join('\n'), Array(1000).fill('b').join('\n')).length, 2000);
});
test('one-use transfer parser rejects expired, future and malformed payloads', () => {
  const now = 1_800_000_000_000;
  const data = {before: '<script>test</script>', after: 'safe text', createdAt: now};
  assert.deepEqual(readTransfer(JSON.stringify(data), now), data);
  for (const raw of [null, '{', '{}', JSON.stringify({...data, createdAt: now+1}), JSON.stringify({...data, createdAt: now-300001}), JSON.stringify({...data, after: 'x'.repeat(100001)})]) assert.equal(readTransfer(raw, now), null);
});
