import { getSession } from '../auth.js';
import { esc } from '../config.js';
import { icon } from '../icons.js';

const LINKS = [
  { r: '#/login', t: 'دخول GitHub', i: 'key' },
  { r: '#/lessons', t: 'الدروس', i: 'book' },
  { r: '#/reminders', t: 'التنبيهات', i: 'bell' },
  { r: '#/progress', t: 'التقدم', i: 'chart' },
  { r: '#/dna', t: 'الحمض الدراسي', i: 'activity' },
  { r: '#/map', t: 'خريطة الدراسة', i: 'map' },
  { r: '#/calendar', t: 'الجدول', i: 'calendar' },
  { r: '#/timetable', t: 'جدولي المدرسي', i: 'file' },
  { r: '#/timer', t: 'المؤقت', i: 'clock' },
  { r: '#/import', t: 'استيراد / تصدير', i: 'download' },
  { r: '#/repo', t: 'مستودع GitHub', i: 'database' },
  { r: '#/settings', t: 'الإعدادات', i: 'sliders' },
];
export async function pMore(el) {
  const sess = getSession();
  el.innerHTML = `<span class="eyebrow">النظام</span><h2 style="margin-top:0">المزيد</h2>
  ${sess ? `<div class="list-item"><span class="list-ic">${icon('file', 20)}</span><div><b>${esc(sess.name || sess.login || 'ضيف')}</b><div class="muted small">${esc(sess.login ? '@' + sess.login : 'وضع تجريبي')}</div></div></div>` : `<a class="btn" href="#/login" style="width:100%;text-align:center"><span class="ic">${icon('key', 18)}</span> تسجيل الدخول</a>`}
  <div class="more-grid" style="margin-top:10px">${LINKS.map(l => `<a class="more-cell" href="${l.r}"><span class="ic">${icon(l.i, 22)}</span>${l.t}</a>`).join('')}</div>
  <p class="muted small" style="text-align:center;margin-top:14px">FOSES · Free Open Source E-School<br>مدرسة إلكترونية مجانية مفتوحة المصدر<br>مدرستك. بياناتك. مفتوح المصدر.</p>`;
}
