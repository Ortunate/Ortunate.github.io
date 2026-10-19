import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Minimal event/DOM adapter: runs our controllers, without launching a browser.
export class Element {
  tag: string; dataset: Record<string,string> = {}; attributes: Record<string,string> = {};
  children: Element[] = []; parentElement: Element | null = null;
  value = ''; textContent = ''; hidden = false; disabled = false; checked = false;
  id = ''; type = ''; name = ''; href = ''; download = ''; title = ''; className = '';
  style: Record<string,string> = {}; files: unknown[] = []; focused = false;
  listeners = new Map<string, ((event: any) => unknown)[]>();
  classList = {toggle: (name: string, enabled: boolean) => {const names=new Set(this.className.split(' ')); if(enabled) names.add(name); else names.delete(name); this.className=[...names].join(' ');}};
  elements = {namedItem: (name: string) => this.all().find(item=>item.name===name)};
  constructor(tag = 'div') {this.tag=tag;}
  all(): Element[] {return this.children.flatMap(child=>[child,...child.all()]);}
  matches(selector: string): boolean {
    return selector.split(',').some(part=>{
      const token=part.trim();
      if(token.includes(' ')) return false;
      const tag=token.match(/^[a-z]+/i)?.[0]; if(tag && this.tag!==tag) return false;
      const cls=token.match(/\.([\w-]+)/)?.[1]; if(cls && !this.className.split(' ').includes(cls)) return false;
      for(const match of token.matchAll(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/g)) {
        const val=this.getAttribute(match[1]); if(val===null || (match[2]!==undefined && val!==match[2])) return false;
      }
      return !token.includes(':checked') || this.checked;
    });
  }
  querySelectorAll(selector: string): Element[] {
    const pieces=selector.trim().split(/\s+(?![^\[]*\])/);
    if(pieces.length>1) return this.querySelectorAll(pieces[0]).flatMap(item=>item.querySelectorAll(pieces.slice(1).join(' ')));
    return this.all().filter(item=>item.matches(selector));
  }
  querySelector(selector: string) {return this.querySelectorAll(selector)[0] || null;}
  closest(selector: string): Element | null {return this.matches(selector) ? this : this.parentElement?.closest(selector) || null;}
  getAttribute(name: string): string | null {
    if(name.startsWith('data-')) return this.dataset[dataKey(name)] ?? null;
    if(name==='href') return this.href;
    return this.attributes[name] ?? null;
  }
  setAttribute(name: string, value: string) {if(name.startsWith('data-')) this.dataset[dataKey(name)]=value; else this.attributes[name]=value;}
  append(...children: Element[]) {children.forEach(child=>{child.parentElement=this;this.children.push(child);});}
  replaceChildren(...children: Element[]) {this.children.forEach(child=>child.parentElement=null);this.children=[];this.append(...children);}
  remove() {if(this.parentElement) this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
  addEventListener(name: string, callback: (event: any)=>unknown) {this.listeners.set(name,[...(this.listeners.get(name)||[]),callback]);}
  dispatchEvent(event: Event): boolean {
    if(!event.target) Object.defineProperty(event,'target',{value:this,configurable:true});
    this.listeners.get(event.type)?.forEach(callback=>callback(event));
    if(event.bubbles) this.parentElement?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  click() {if(!this.disabled)this.dispatchEvent(new Event('click',{bubbles:true,cancelable:true}));}
  focus() {this.focused=true;}
  reset() {this.all().forEach(item=>{if(item.tag==='input')item.value='';});}
}
const dataKey=(name:string)=>name.slice(5).replace(/-([a-z])/g,(_,char:string)=>char.toUpperCase());
export function node(parent: Element, key: string, tag='div', value='') {
  const element=new Element(tag);element.setAttribute(key,'');element.value=value;parent.append(element);return element;
}
export function storage(initial: Record<string,string> = {}) {
  const data=new Map(Object.entries(initial));
  return {data,getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}};
}
export function run(file: string, root: Element, modules: Record<string,unknown>, extra: Record<string,unknown> = {}) {
  const body=new Element('body');body.append(root);
  const document=Object.assign(new Element('document'),{body,createElement:(tag:string)=>new Element(tag),getElementById:(id:string)=>body.all().find(item=>item.id===id)});document.append(body);
  const window=new Element('window');
  const source=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const context={document,window,Element,Event,CustomEvent,Error,URL,Blob,TextEncoder,AbortController,Date,console,
    localStorage:storage(),sessionStorage:storage(),setTimeout,clearTimeout,
    Option:class extends Element {constructor(text:string,value:string){super('option');this.textContent=text;this.value=value;}},
    exports:{},require:(key:string)=>{if(!(key in modules))throw new Error('Unexpected import '+key);return modules[key];},...extra};
  vm.runInNewContext(source,context,{filename:file});return context;
}
export const flush=()=>new Promise(resolve=>setImmediate(resolve));
export const change=(element:Element,value:string,event='change')=>{element.value=value;element.dispatchEvent(new Event(event,{bubbles:true}));};
