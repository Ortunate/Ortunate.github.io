(() => {
const tk='ortunate:theme:v1',mk='ortunate:color-mode:v1',root=document.documentElement,media=matchMedia('(prefers-color-scheme: dark)');
let theme='green',mode='system';
const vt=v=>/^(green|blue|purple|rose|amber)$/.test(v)?v:'green',vm=v=>/^(system|light|dark)$/.test(v)?v:'system';
const apply=()=>{
root.dataset.theme=theme;root.dataset.mode=mode;
root.dataset.colorMode=mode==='system'?(media.matches?'dark':'light'):mode;
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',root.dataset.colorMode==='dark'?'#090b12':'#f6f7f9');
window.dispatchEvent(new Event('appearancechange'));
};
try{theme=vt(localStorage.getItem(tk));mode=vm(localStorage.getItem(mk));}catch{}
window.addEventListener('storage',e=>{if(![tk,mk,null].includes(e.key))return;if(e.key!==mk)theme=vt(e.newValue);if(e.key!==tk)mode=vm(e.newValue);apply();});
window.addEventListener('appearanceinput',e=>{if(e.detail.theme!==undefined)theme=vt(e.detail.theme);if(e.detail.mode!==undefined)mode=vm(e.detail.mode);apply();});
media.addEventListener('change',()=>{if(mode==='system')apply();});apply();
})();
