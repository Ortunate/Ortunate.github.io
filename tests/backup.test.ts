import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBackup, mergeSections, readSections, snapshot, writeSections, type StoragePort} from '../src/lib/backup.ts';
import {makeSymbol, watchlistKey} from '../src/lib/watchlist.ts';
import {personalKeys} from '../src/lib/personal.ts';
const known = new Set(['hn', 'tools:json']);
function storage(): StoragePort & {data: Map<string,string>} {
  const data = new Map<string,string>();
  return {data, getItem: key => data.get(key) ?? null, setItem: (key,value) => {data.set(key,value);}, removeItem: key => {data.delete(key);}};
}
test('accepts old bookmark exports and rejects unsupported or oversized backups', () => {
  const backup = parseBackup(JSON.stringify({version:1, saved:['hn','unknown'], pinned:['hn']}),known);
  assert.deepEqual(backup.sections.bookmarks?.saved,['hn']);
  for(const raw of ['null','{','{"format":"ortunate","version":2,"sections":{}}','{"format":"ortunate","version":1,"sections":{}}',' '.repeat(262145)]) assert.throws(()=>parseBackup(raw,known));
});
test('selected categories merge idempotently without replacing current notes or pins', () => {
  const current = readSections(storage(),known);
  current.bookmarks = {version:1,saved:['hn'],pinned:['hn']};
  current.watchlist = [makeSymbol('US','AAPL','Apple','Keep this note')];
  const incoming = {bookmarks:{version:1 as const,saved:['tools:json'],pinned:['tools:json']},watchlist:[makeSymbol('US','AAPL','','Imported note'),makeSymbol('HK','700')]};
  const merged = mergeSections(current,incoming,['bookmarks','watchlist'],known);
  assert.deepEqual(merged.bookmarks?.pinned,['hn','tools:json']);
  assert.equal(merged.watchlist?.[0].note,'Keep this note');
  assert.equal(merged.watchlist?.length,2);
  assert.equal(merged.reading,undefined);
  assert.deepEqual(mergeSections({...current,...merged},incoming,['bookmarks','watchlist'],known),merged);
});

test('backup size is bounded in UTF-8 bytes, including multibyte text', () => {
  const raw = JSON.stringify({version: 1, saved: ['中'.repeat(90_000)], pinned: []});
  assert.ok(raw.length < 262_144);
  assert.throws(() => parseBackup(raw, known), /256 KB/);
});
test('export roundtrip preserves all supported data and merge respects collection capacity', () => {
  const current=readSections(storage(),known);
  current.watchlist=Array.from({length:40},(_,i)=>makeSymbol('HK',String(i+1)));
  current.reading={version:1,read:[5],saved:[{id:5,title:'Saved headline',url:'https://example.com/',time:1700000000,score:2,comments:1}]};
  const parsed=parseBackup(JSON.stringify({format:'ortunate',version:1,sections:current}),known);
  assert.deepEqual(parsed.sections,current);
  assert.equal(mergeSections(current,{watchlist:[makeSymbol('US','AAPL')]},['watchlist'],known).watchlist?.length,40);
});
test('snapshots detect concurrent edits and writes leave unselected categories untouched', () => {
  const store=storage(); store.setItem(watchlistKey,'[]');
  const before=snapshot(store,['bookmarks']);
  store.setItem(personalKeys.saved,'["hn"]');
  assert.notEqual(snapshot(store,['bookmarks']),before);
  writeSections(store,{bookmarks:{version:1,saved:['tools:json'],pinned:[]}});
  assert.equal(store.getItem(watchlistKey),'[]');
});
test('write failures restore earlier keys; rollback failure is explicitly reported', () => {
  const store=storage(); store.setItem(personalKeys.saved,'["hn"]');
  const set=store.setItem; let count=0;
  store.setItem=(key,value)=>{if(++count===2)throw new Error('quota');set(key,value);};
  assert.throws(()=>writeSections(store,{bookmarks:{version:1,saved:['tools:json'],pinned:['tools:json']}}),/Previous data was restored/);
  assert.equal(store.getItem(personalKeys.saved),'["hn"]');
  assert.equal(store.getItem(personalKeys.pinned),null);
  store.setItem=()=>{throw new Error('unavailable');};
  assert.throws(()=>writeSections(store,{bookmarks:{version:1,saved:[],pinned:[]}}),/could not be rolled back/);
});

test('groups roundtrip through storage and backups, and participate in conflict detection and rollback', () => {
  const store = storage();
  const bookmarks = {version:1 as const,saved:['hn'],pinned:['hn'],groups:[{name:'Reading',ids:['hn']}]};
  writeSections(store,{bookmarks});
  assert.deepEqual(readSections(store,known).bookmarks,bookmarks);
  assert.deepEqual(parseBackup(JSON.stringify({format:'ortunate',version:1,sections:{bookmarks}}),known).sections.bookmarks,bookmarks);
  const before = snapshot(store,['bookmarks']);
  store.setItem(personalKeys.groups,'[]');
  assert.notEqual(snapshot(store,['bookmarks']),before);
  const set = store.setItem;
  let count = 0;
  store.setItem = (key,value) => {if (++count === 3) throw new Error('quota'); set(key,value);};
  assert.throws(() => writeSections(store,{bookmarks:{...bookmarks,saved:['tools:json'],pinned:[]}}), /Previous data was restored/);
  assert.equal(store.getItem(personalKeys.saved),'["hn"]');
  assert.equal(store.getItem(personalKeys.groups),'[]');
});
