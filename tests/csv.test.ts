import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csvToJson, jsonToCsv, parseCsv, type Delimiter} from '../src/lib/csv.ts';

test('CSV quotes preserve separators, escaped quotes, newlines and leading zeros', () => {
  const data = '\uFEFFname,code,note\r\n宇宙,0012,"Hello, ""world""\r\nnext line"\r\n';
  assert.deepEqual(JSON.parse(csvToJson(data)), [{name:'宇宙',code:'0012',note:'Hello, "world"\r\nnext line'}]);
  assert.deepEqual(parseCsv('a,b\r1,2\n3,4\r\n'), [['a','b'],['1','2'],['3','4']]);
  assert.deepEqual(parseCsv('a,b\n1,'), [['a','b'],['1','']]);
});

test('flat JSON roundtrips through each separator without mutating string content', () => {
  const rows = [{name:'宇宙',code:'0012',note:'a,b;\t"c"\nnext'},{name:'',code:'0034',note:''}];
  for (const delimiter of [',',';','\t'] as Delimiter[]) {
    const csv = jsonToCsv(JSON.stringify(rows), delimiter);
    assert.deepEqual(JSON.parse(csvToJson(csv,delimiter)), rows);
  }
  assert.deepEqual(JSON.parse(csvToJson(jsonToCsv('[{"empty":null}]'))), [{empty:''}]);
});

test('JSON columns use the union of own keys and convert missing, null and primitive values explicitly', () => {
  const rows = JSON.parse(csvToJson(jsonToCsv('[{"a":true,"b":12},{"a":false,"c":null}]')));
  assert.deepEqual(rows,[{a:'true',b:'12',c:''},{a:'false',b:'',c:''}]);
  const special = JSON.parse(csvToJson('__proto__,constructor\nvalue,safe'));
  assert.equal(Object.hasOwn(special[0],'__proto__'),true);
  assert.equal(special[0].__proto__,'value');
  assert.deepEqual(JSON.parse(csvToJson(jsonToCsv(JSON.stringify(special)))),special);
});

test('ambiguous CSV and unsupported JSON structures fail rather than discard data', () => {
  for (const value of ['', 'a,a\n1,2', 'a,\n1,2', 'a,b\n1', 'a\n1,2', 'a\n"unclosed', 'a\n"closed"extra', 'a\nstray"quote']) assert.throws(()=>csvToJson(value));
  for (const value of ['{','{}','[]','[{}]','[null]','[[1]]','[{"nested":{}}]','[{"a":[]}]','[{"a":1e999}]','[{"a":9007199254740993}]']) assert.throws(()=>jsonToCsv(value));
  assert.deepEqual(JSON.parse(csvToJson('a,b')),[]);
});

test('conversion bounds input, row, column and expanded output sizes', () => {
  assert.throws(()=>csvToJson('x'.repeat(100001)),/characters/);
  assert.throws(()=>csvToJson('a\n'+'x\n'.repeat(1001)),/rows/);
  assert.throws(()=>jsonToCsv(JSON.stringify(Array.from({length:1001},()=>({a:1})))),/rows/);
  assert.throws(()=>csvToJson(Array.from({length:101},(_,i)=>`c${i}`).join(',')),/columns/);
  assert.throws(()=>jsonToCsv(JSON.stringify([Object.fromEntries(Array.from({length:101},(_,i)=>[`c${i}`,1]))])),/columns/);
  assert.throws(()=>csvToJson('h'.repeat(3000)+'\n'+'v\n'.repeat(1000)),/result exceeds/);
  assert.equal(JSON.parse(csvToJson('a\n'+'x\n'.repeat(1000))).length,1000);
});
