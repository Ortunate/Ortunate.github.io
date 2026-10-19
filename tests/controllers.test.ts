import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Element,node,storage,run,flush,change} from './helpers/dom.ts';
import * as personal from '../src/lib/personal.ts';
import * as backup from '../src/lib/backup.ts';
import * as reading from '../src/lib/reading.ts';
import * as model from '../src/lib/news-model.ts';
import * as csv from '../src/lib/csv.ts';
import * as watch from '../src/lib/watchlist.ts';
import * as view from '../src/lib/watchlist-view.ts';
import * as exporting from '../src/lib/watchlist-export.ts';

test('backup controller previews without writes, rechecks concurrent changes and applies only selected sections',async()=>{
  const root=new Element();root.dataset.backup='';root.dataset.known=JSON.stringify(['a','b']);
  for(const name of ['status','preview','rows','controls']) node(root,`data-backup-${name}`);
  for(const name of ['apply','cancel','export']) node(root,`data-backup-${name}`,'button');
  const file=node(root,'data-backup-file','input');
  for(const name of Object.keys(backup.sectionNames)) {
    const choice=node(root,'data-backup-section','input',name);choice.checked=name==='bookmarks';
    const summary=node(root,'data-backup-summary');summary.dataset.backupSummary=name;
  }
  const store=storage({[personal.personalKeys.saved]:'["a"]'});
  run('src/scripts/backup.ts',root,{'../lib/backup':backup},{localStorage:store});
  file.files=[{size:100,text:async()=>JSON.stringify({version:1,saved:['b'],pinned:['b']})}];
  file.dispatchEvent(new Event('change'));await flush();
  assert.equal(store.getItem(personal.personalKeys.saved),'["a"]');
  const apply=root.querySelector('[data-backup-apply]')!;
  store.setItem(personal.personalKeys.pinned,'["a"]');apply.click();
  assert.match(root.querySelector('[data-backup-status]')!.textContent,/changed in another tab/);
  assert.equal(store.getItem(personal.personalKeys.saved),'["a"]');
  apply.click();
  assert.equal(store.getItem(personal.personalKeys.saved),'["a","b"]');
  assert.equal(store.getItem(personal.personalKeys.pinned),'["a","b"]');
  assert.equal(store.getItem(reading.readingKey),null);
});

test('workbench controller moves pins, manages groups, filters and retains keyboard focus',()=>{
  const directory=new Element();directory.dataset.directory='';
  const root=node(directory,'data-workbench');
  for(const name of ['a','b']) {
    const card=node(directory,'data-entry');card.dataset.bookmark=name;card.dataset.category='Tools';
    const link=node(card,'data-link','a');link.className='directory-main-link';link.href=`/tools/${name}/`;
    const save=node(card,'data-save','button');save.dataset.title=name.toUpperCase();
  }
  for(const name of ['pinned','recent','saved']) {node(root,`data-${name}-list`,'ul');node(root,`data-${name}-empty`);}
  for(const name of ['workbench-status','saved-total'])node(root,`data-${name}`);
  for(const name of ['clear-recent','export','group-rename','group-delete'])node(root,`data-${name}`,'button');
  node(root,'data-import','input');node(root,'data-group-form','form');node(root,'data-group-name','input');node(root,'data-group-filter','select');node(root,'data-summary','summary');
  const store=storage({[personal.personalKeys.saved]:'["a","b"]',[personal.personalKeys.pinned]:'["a","b"]'});
  run('src/scripts/workbench.ts',directory,{'../lib/personal':personal},{localStorage:store});
  root.querySelector('[data-move-id="b"][data-direction="up"]')!.click();
  assert.equal(store.getItem(personal.personalKeys.pinned),'["b","a"]');
  assert.equal(root.querySelector('[data-move-id="b"][data-direction="down"]')!.focused,true);
  root.querySelector('[data-group-name]')!.value='Research';root.querySelector('[data-group-form]')!.dispatchEvent(new Event('submit',{cancelable:true}));
  change(root.querySelector('[data-group-filter]')!,'');
  change(root.querySelector('[data-group-entry="a"]')!,'Research');
  change(root.querySelector('[data-group-filter]')!,'group:Research');
  assert.equal(root.querySelector('[data-saved-list]')!.children.length,1);
  root.querySelector('[data-group-delete]')!.click();
  assert.equal(store.getItem(personal.personalKeys.saved),'["a","b"]');
  assert.equal(store.getItem(personal.personalKeys.groups),'[]');
});

test('news controller bulk undo restores evicted marks and rejects a concurrent read change',async()=>{
  const root=new Element();root.dataset.newsFeed='';
  for(const name of ['news-stories','news-status','reading-status','reading-count','news-controls','reading-controls'])node(root,`data-${name}`);
  for(const name of ['reading-search','reading-unread'])node(root,`data-${name}`,'input');
  node(root,'data-reading-sort','select','source');
  for(const name of ['news-refresh','reading-mark-visible','reading-undo'])node(root,`data-${name}`,'button');
  for(const feed of ['top','new','show','dev','saved'])node(root,'data-news-kind','button').dataset.newsKind=feed;
  const initial={version:1,saved:[],read:Array.from({length:200},(_,i)=>i+1)};
  const store=storage({[reading.readingKey]:JSON.stringify(initial)});
  const stories=[201,202].map(id=>({id,title:`Article ${id}`,url:'https://example.com',time:1700000000,score:1,comments:0}));
  run('src/scripts/news.ts',root,{'../lib/news-model':model,'../lib/reading':reading,'../lib/news':{loadNews:async()=>({stories,fetchedAt:Date.now(),partial:false})}},{localStorage:store});await flush();
  root.querySelector('[data-reading-mark-visible]')!.click();
  assert.equal(JSON.parse(store.getItem(reading.readingKey)!).read[0],201);
  root.querySelector('[data-reading-undo]')!.click();
  assert.deepEqual(JSON.parse(store.getItem(reading.readingKey)!).read,initial.read);
  root.querySelector('[data-reading-mark-visible]')!.click();
  const newer=JSON.parse(store.getItem(reading.readingKey)!);newer.read.unshift(300);store.setItem(reading.readingKey,JSON.stringify(newer));
  root.querySelector('[data-reading-undo]')!.click();
  assert.equal(JSON.parse(store.getItem(reading.readingKey)!).read[0],300);
  assert.match(root.querySelector('[data-reading-status]')!.textContent,/can no longer be undone/);
});

test('CSV controller invalidates old downloads on edits, errors and option changes',()=>{
  const root=new Element();root.dataset.csv='';
  for(const name of ['output','status'])node(root,`data-csv-${name}`);
  const input=node(root,'data-csv-input','textarea');node(root,'data-csv-direction','select','json');node(root,'data-csv-delimiter','select',',');node(root,'data-csv-file','input');
  for(const name of ['run','example','clear','copy','download'])node(root,`data-csv-${name}`,'button');
  const downloads: string[]=[];
  run('src/scripts/csv.ts',root,{'../lib/csv':csv,'./storage':{copy:()=>{}},'./text-files':{bindTextFile:()=>()=>{},downloadText:(text:string)=>downloads.push(text)}});
  change(input,'code\n0012','input');root.querySelector('[data-csv-run]')!.click();root.querySelector('[data-csv-download]')!.click();
  assert.equal(JSON.parse(downloads[0])[0].code,'0012');
  change(input,'a,a\n1,2','input');root.querySelector('[data-csv-run]')!.click();
  assert.equal(root.querySelector('[data-csv-download]')!.disabled,true);
  assert.match(root.querySelector('[data-csv-status]')!.textContent,/unique/);
  change(root.querySelector('[data-csv-direction]')!,'csv');assert.equal(root.querySelector('[data-csv-copy]')!.disabled,true);
});

test('watchlist export captures the visible order and does not include subsequently selected entries',async()=>{
  const root=new Element();root.dataset.watchlist='';const form=node(root,'data-watch-form','form');
  for(const name of ['market','symbol','name','note']) {const field=node(form,`data-field-${name}`,'input',name==='market'?'US':'');field.name=name;}
  node(form,'data-help').className='watch-help';
  for(const name of ['filter','sort'])node(root,`data-watch-${name}`,'select',name==='filter'?'All':'saved');
  node(root,'data-watch-search','input');
  for(const name of ['items','status','count','empty'])node(root,`data-watch-${name}`);
  for(const name of ['cancel','submit','undo','export','reset'])node(root,`data-watch-${name}`,'button');
  const entries=[watch.makeSymbol('US','AAPL'),watch.makeSymbol('HK','700','Tencent','Research')];
  const downloads: string[]=[];
  run('src/scripts/watchlist.ts',root,{'../lib/watchlist':watch,'../lib/watchlist-view':view,'../lib/watchlist-export':exporting,'./text-files':{downloadText:(text:string)=>downloads.push(text)}},{localStorage:storage({[watch.watchlistKey]:JSON.stringify(entries)})});
  change(root.querySelector('[data-watch-filter]')!,'HK');root.querySelector('[data-watch-export]')!.click();
  change(root.querySelector('[data-watch-filter]')!,'US');await flush();
  assert.deepEqual(JSON.parse(csv.csvToJson(downloads[0])),[{market:'HK',symbol:'0700',name:'Tencent',note:'Research'}]);
});
