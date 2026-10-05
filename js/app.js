import { loadStore } from './store.js';
import { router } from './router.js';
import { getSession } from './auth.js';
import { initialSync } from './sync.js';

// theme init (الواجهة عربية RTL دائمًا)
const ui=JSON.parse(localStorage.getItem('foses-ui')||'{}');
document.documentElement.dataset.theme=ui.theme||'dark';
document.documentElement.lang='ar';
document.documentElement.dir='rtl';

document.getElementById('themeBtn').onclick=()=>{
  const o=JSON.parse(localStorage.getItem('foses-ui')||'{}');
  o.theme=(document.documentElement.dataset.theme==='dark')?'light':'dark';
  document.documentElement.dataset.theme=o.theme; localStorage.setItem('foses-ui',JSON.stringify(o));
};
document.getElementById('menuBtn').onclick=()=>{
  const s=document.getElementById('sidebar'); s.style.display=s.style.display==='flex'?'none':'flex';
};

// PWA install
let deferred=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;document.getElementById('installBtn').classList.remove('hidden');});
document.getElementById('installBtn').onclick=()=>deferred?.prompt();

window.addEventListener('hashchange',router);
await loadStore();
const sess=getSession();
if(sess?.avatar){ const av=document.getElementById('avatar'); av.src=sess.avatar; av.classList.remove('hidden'); }
if(!location.hash) location.hash='#/dashboard';
await router();
setTimeout(()=>document.getElementById('splash')?.classList.add('done'),900);
// silent sync if logged in
if(sess?.login) initialSync().catch(()=>{});
