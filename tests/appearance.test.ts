import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as appearance from '../src/lib/appearance.ts';
import {Element, storage, run, change} from './helpers/dom.ts';

const bootstrap = readFileSync('src/scripts/appearance-bootstrap.js','utf8');
function fixture(initial: Record<string,string> = {}, dark = false, unavailable = false) {
  const root = new Element('html'), window = new Element('window'), meta = new Element('meta');
  const media = Object.assign(new EventTarget(), {matches:dark});
  const store = storage(initial);
  if (unavailable) store.getItem = () => {throw new Error('Unavailable');};
  vm.runInNewContext(bootstrap, {document:{documentElement:root,querySelector:()=>meta},window,localStorage:store,matchMedia:()=>media,Event});
  const select = (detail: object) => window.dispatchEvent(new CustomEvent('appearanceinput',{detail}));
  const external = (key: string | null,newValue: string | null) => window.dispatchEvent(Object.assign(new Event('storage'),{key,newValue}));
  return {root,window,meta,media,store,select,external};
}

for (const theme of appearance.themes) for (const mode of ['light','dark'] as const) {
  test(`${theme}/${mode}: restore before paint and change either preference independently`,()=>{
    const f=fixture({[appearance.themeKey]:theme,[appearance.modeKey]:mode});
    assert.deepEqual({...f.root.dataset},{theme,mode,colorMode:mode});
    assert.equal(f.meta.getAttribute('content'),mode==='dark'?'#090b12':'#f6f7f9');
    f.select({theme:'rose'});
    assert.equal(f.root.dataset.mode,mode);
    f.select({mode:mode==='dark'?'light':'dark'});
    assert.equal(f.root.dataset.theme,'rose');
  });
}
test('system follows changes; explicit mode ignores them; switching back resolves immediately',()=>{
  const f=fixture();
  assert.equal(f.root.dataset.colorMode,'light');
  f.media.matches=true;f.media.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.colorMode,'dark');
  f.select({mode:'light'});f.media.dispatchEvent(new Event('change'));
  assert.equal(f.root.dataset.colorMode,'light');
  f.select({mode:'system'});assert.equal(f.root.dataset.colorMode,'dark');
});
test('invalid and blocked storage use valid defaults without writes',()=>{
  for(const f of [fixture({[appearance.themeKey]:'bad',[appearance.modeKey]:'null'},true),fixture({},true,true)]) {
    assert.deepEqual({...f.root.dataset},{theme:'green',mode:'system',colorMode:'dark'});
    f.select({theme:'blue',mode:'light'});
    assert.equal(f.root.dataset.colorMode,'light');
  }
  for(const value of [null,undefined,'','BAD',{},3]) {
    assert.equal(appearance.validTheme(value),'green');assert.equal(appearance.validMode(value),'system');
  }
});
test('cross-tab updates preserve the other preference and deletion resets defaults',()=>{
  const f=fixture({[appearance.themeKey]:'amber',[appearance.modeKey]:'dark'});
  f.external(appearance.themeKey,'blue');assert.equal(f.root.dataset.mode,'dark');
  f.external(appearance.modeKey,'light');assert.equal(f.root.dataset.theme,'blue');
  f.external('ortunate:motion','reduced');assert.equal(f.root.dataset.mode,'light');
  f.external(appearance.themeKey,null);assert.equal(f.root.dataset.theme,'green');
  f.external(null,null);assert.equal(f.root.dataset.mode,'system');
});
test('settings controller saves only changed field, synchronizes controls, and survives write failures',()=>{
  const f=fixture();
  const dialog=Object.assign(new Element('dialog'),{open:false,showModal(){this.open=true;}});
  const status=new Element('p');status.className='appearance-status';dialog.append(status);
  const button=new Element('button');
  for(const [name,values] of [['appearance-theme',appearance.themes]] as const) {
    for(const value of values){const input=new Element('input');input.name=name;input.value=value;input.setAttribute('type','radio');dialog.append(input);}
  }
  const system=new Element('input');system.name='appearance-system';system.setAttribute('type','checkbox');dialog.append(system);
  const context=run('src/scripts/appearance.js',dialog,{'../lib/appearance':appearance},{window:f.window,document:{documentElement:f.root,querySelector:(s:string)=>s==='#appearance-dialog'?dialog:button},localStorage:f.store});
  (context.exports as {openAppearance:()=>void}).openAppearance();assert.equal(dialog.open,true);
  const blue=dialog.children.find(item=>item.value==='blue')!;
  change(blue,'blue');assert.equal(f.store.data.get(appearance.themeKey),'blue');assert.equal(f.store.data.has(appearance.modeKey),false);
  f.external(appearance.modeKey,'dark');assert.equal(system.checked,false);
  system.checked=true;change(system,'');assert.equal(f.root.dataset.mode,'system');
  system.checked=false;change(system,'');assert.equal(f.root.dataset.mode,'light');
  f.store.setItem=()=>{throw new Error('Full');};
  change(blue,'blue');assert.match(status.textContent,/could not be saved/);assert.equal(f.root.dataset.theme,'blue');
  dialog.dispatchEvent(new Event('close'));assert.equal(button.focused,true);
});

function luminance(hex:string) {
  return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
}
const contrast=(a:string,b:string)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
test('all ten palettes meet text, accent-label and control contrast requirements',()=>{
  const css=readFileSync('src/styles/appearance.css','utf8').replace(/\/\*[\s\S]*?\*\//g,'');
  const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for(const theme of appearance.themes) for(const mode of ['light','dark']) {
    const tokens:Record<string,string>={};
    for(const [,selector,body] of rules) {
      const s=selector.trim();
      if(s==='html:root'||s===`html[data-color-mode=${mode}]`||s===`html[data-theme=${theme}]`||s===`html[data-color-mode=${mode}][data-theme=${theme}]`) {
        for(const [,key,value] of body.matchAll(/--([\w-]+):(#[0-9a-f]{6})(?=;|$)/g)) tokens[key]=value;
      }
    }
    for(const surface of ['bg','panel','surface','field']) {
      for(const text of ['text','muted','accent','error','success']) assert.ok(contrast(tokens[text],tokens[surface])>=4.5,`${theme}/${mode}: ${text} on ${surface}`);
      assert.ok(contrast(tokens.line,tokens[surface])>=3,`${theme}/${mode}: border on ${surface}`);
    }
    assert.ok(contrast(tokens.accent,tokens['on-accent'])>=4.5,`${theme}/${mode}: accent label`);
  }
});

for(const theme of appearance.themes) test(`${theme}: independent day/night button works without the settings module`,()=>{
 const f=fixture({[appearance.themeKey]:theme},true);
 const toggle=Object.assign(new Element('button'),{firstElementChild:new Element('span')});
 const open=new Element('button'),status=new Element('span');
 const script=readFileSync('src/components/Appearance.astro','utf8').match(/<script is:inline data-appearance-loader>([\s\S]*?)<\/script>/)![1];
 vm.runInNewContext(script,{document:{documentElement:f.root,querySelector:(selector:string)=>selector==='.mode-toggle'?toggle:selector==='.appearance-open'?open:status},window:f.window,localStorage:f.store,CustomEvent});
 assert.equal(toggle.getAttribute('aria-label'),'Switch to light mode');
 assert.equal(toggle.firstElementChild.textContent,'☀');
 toggle.click();assert.equal(f.root.dataset.colorMode,'light');assert.equal(f.store.getItem(appearance.modeKey),'light');assert.equal(f.root.dataset.theme,theme);
 assert.equal(toggle.firstElementChild.textContent,'☾');
 f.media.matches=false;f.media.dispatchEvent(new Event('change'));toggle.click();assert.equal(f.root.dataset.colorMode,'dark');
 f.external(appearance.modeKey,'light');assert.equal(toggle.getAttribute('aria-label'),'Switch to dark mode');
 f.store.setItem=()=>{throw new Error('Unavailable');};toggle.click();assert.equal(f.root.dataset.colorMode,'dark');assert.match(status.textContent,/could not be saved/);
});
