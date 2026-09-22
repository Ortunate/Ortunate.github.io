import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSymbol, quoteSymbol, researchUrl, readWatchlist, upsertSymbol, WATCH_LIMIT } from '../src/lib/watchlist.ts';

test('symbol normalization handles market suffixes, full-width text and share classes', () => {
  assert.equal(makeSymbol('US', ' ａａｐｌ ').id, 'US:AAPL');
  assert.equal(quoteSymbol(makeSymbol('US', 'BRK.B')), 'BRK-B');
  for (const raw of ['700', '0700.hk', '00700']) assert.equal(quoteSymbol(makeSymbol('HK', raw)), '0700.HK');
  assert.equal(quoteSymbol(makeSymbol('HK', '09988')), '9988.HK');
  assert.equal(quoteSymbol(makeSymbol('HK', '80700')), '80700.HK');
  assert.equal(quoteSymbol(makeSymbol('SH', '600519.ss')), '600519.SS');
  assert.equal(quoteSymbol(makeSymbol('SZ', '000001')), '000001.SZ');
  assert.notEqual(makeSymbol('SH', '000001').id, makeSymbol('SZ', '000001').id);
});

test('reject malformed or wrong-market codes and bound user text', () => {
  for (const [market, symbol] of [['HK', '700.SZ'], ['SH', '600519.SZ'], ['SZ', '1'], ['HK', '0'], ['US', 'https://example.com'], ['US', 'A/B'], ['Unknown', 'AAPL'], ['toString', 'AAPL']]) {
    assert.throws(() => makeSymbol(market, symbol));
  }
  assert.throws(() => makeSymbol('US', 'AAPL', 'x'.repeat(61)));
  assert.throws(() => makeSymbol('US', 'AAPL', '', 'x'.repeat(201)));
});

test('research links use a fixed host and never include notes or names', () => {
  const entry = makeSymbol('HK', '700', 'Private name', 'Private note');
  assert.equal(researchUrl(entry), 'https://finance.yahoo.com/quote/0700.HK/');
  assert.equal(researchUrl(entry, true), 'https://finance.yahoo.com/quote/0700.HK/news/');
});

test('updates deduplicate by market and code, preserve order, and respect capacity', () => {
  const initial = [makeSymbol('HK', '700')];
  const updated = upsertSymbol(initial, makeSymbol('HK', '0700.HK', 'Tencent'));
  assert.equal(updated.length, 1); assert.equal(updated[0].name, 'Tencent'); assert.equal(initial[0].name, '');
  const full = Array.from({length: WATCH_LIMIT}, (_, i) => makeSymbol('HK', String(i + 1)));
  assert.throws(() => upsertSymbol(full, makeSymbol('US', 'AAPL')));
  assert.equal(upsertSymbol(full, makeSymbol('HK', '1', 'Updated')).length, WATCH_LIMIT);
});

test('stored data is validated independently and supplied IDs are recomputed', () => {
  for (const raw of [null, '{', '{}', 'null']) assert.deepEqual(readWatchlist(raw), []);
  const valid = {...makeSymbol('US', 'AAPL'), id: 'tampered'};
  const stored = JSON.stringify([null, {market: 'US', symbol: 'AAPL'}, valid, {...valid, name: 'Updated'}, {...valid, market: 'bad'}]);
  assert.deepEqual(readWatchlist(stored), [makeSymbol('US', 'AAPL', 'Updated')]);
});
