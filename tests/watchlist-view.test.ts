import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeSymbol} from '../src/lib/watchlist.ts';
import {filterWatchlist} from '../src/lib/watchlist-view.ts';
import {watchlistCsv} from '../src/lib/watchlist-export.ts';
import {csvToJson} from '../src/lib/csv.ts';

const entries = [makeSymbol('US','BRK.B','Berkshire','Read annual report'),makeSymbol('HK','700','Tencent','Cloud research'),makeSymbol('US','AAPL','Apple','Cloud services')];
test('watchlist search combines market and Unicode-normalized words across symbols, names and notes', () => {
  assert.deepEqual(filterWatchlist(entries,'US',' ＣＬＯＵＤ services ','saved'),[entries[2]]);
  assert.deepEqual(filterWatchlist(entries,'All','brk.b annual','saved'),[entries[0]]);
  assert.deepEqual(filterWatchlist(entries,'All','0700.hk','saved'),[entries[1]]);
  assert.deepEqual(filterWatchlist(entries,'HK','Apple','saved'),[]);
  assert.deepEqual(filterWatchlist(entries,'All','  ','saved'),entries);
});

test('sorting operates on a copy and leaves persisted order intact', () => {
  assert.deepEqual(filterWatchlist(entries,'US','','symbol').map(entry=>entry.symbol),['AAPL','BRK-B']);
  assert.deepEqual(filterWatchlist(entries,'All','','name').map(entry=>entry.name),['Apple','Berkshire','Tencent']);
  assert.deepEqual(entries.map(entry=>entry.symbol),['BRK-B','0700','AAPL']);
});

test('CSV exports only selected entries in order and preserves codes, Unicode and quoted notes', () => {
  const selected = [makeSymbol('SZ','000001','测试','Read "report", then\nreview'),entries[1]];
  const rows = JSON.parse(csvToJson(watchlistCsv(selected)));
  assert.deepEqual(rows,selected.map(({market,symbol,name,note})=>({market,symbol,name,note})));
  assert.equal(rows[0].symbol,'000001');
  assert.equal(rows.some((row: {symbol:string})=>row.symbol==='AAPL'),false);
  assert.throws(()=>watchlistCsv([]),/No matching/);
});
