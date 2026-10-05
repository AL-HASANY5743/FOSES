import { NAV, BOTTOM } from './i18n.js';
import { dueCount } from './models.js';
import { icon } from './icons.js';
export function paintNav(route){
  const link=n=>`<a class="nav-link ${route.startsWith(n.r)?'active':''}" href="${n.r}"><span class="ic">${icon(n.icon,20)}</span> ${n.t}</a>`;
  const main=NAV.slice(0,9), sys=NAV.slice(9);
  document.getElementById('sideNav').innerHTML=
    `<div class="side-brand"><img src="./assets/icons/icon-192.png" alt="FOSES">FOSES<small>مدرسة إلكترونية مفتوحة</small></div>`+
    main.map(link).join('')+
    `<div class="side-sep"></div>`+sys.map(link).join('');
  document.getElementById('bottomNav').innerHTML=BOTTOM.map(n=>`<a class="${route.startsWith(n.r)?'active':''}" href="${n.r}"><span class="ic">${icon(n.icon,23)}</span>${n.t}</a>`).join('');
}
export function paintBell(db){
  const dot=document.getElementById('bellDot'); if(!dot) return;
  const n=db?dueCount(db):0;
  if(n>0){ dot.textContent=n>9?'9+':n; dot.classList.remove('hidden'); }
  else dot.classList.add('hidden');
}
export function paintXp(db){
  const el=document.getElementById('xpMini'); if(!el||!db) return;
  const xp=db.progress?.xp||0;
  el.innerHTML=`⭐ <b>${xp} XP</b> · 🔥 ${db.progress?.streak||0} يوم · ⏱️ ${db.progress?.studyMinutes||0} د`;
}
