// FOSES notifications — 100% free, no paid backend.
// Layer 1: instant Notification while app is open (exact timing).
// Layer 2: Periodic Background Sync for installed PWA (best-effort, Android/Chrome).
// Layer 3: Web Push via GitHub Actions cron (reliable, see push/ templates).
import { collectReminders } from './models.js';

const b64u = {
  enc(buf) { const b = new Uint8Array(buf); let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
};

export const pushSupport = () => ('serviceWorker' in navigator) && ('PushManager' in window);
export const periodicSupport = () => pushSupport() && ('periodicSync' in ServiceWorkerRegistration.prototype);

// --- IndexedDB mirror (Service Worker cannot read localStorage) ---
function idb() {
  return new Promise((res, rej) => {
    const q = indexedDB.open('foses', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('meta');
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
export async function mirrorReminders(db) {
  try {
    const list = collectReminders(db).map(r => ({ key: r.key, kind: r.kind, title: r.title, sub: r.sub, date: r.date, overdue: r.overdue, link: r.link }));
    const d = await idb();
    await new Promise((res, rej) => { const tx = d.transaction('meta', 'readwrite'); tx.objectStore('meta').put({ at: new Date().toISOString(), list }, 'reminders'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  } catch { /* best effort */ }
}

// --- Permission + instant notify ---
export async function ensurePermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return await Notification.requestPermission();
}
export function notifyNow(title, body, url = './index.html#/reminders') {
  try {
    if (Notification.permission !== 'granted') return false;
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, icon: './assets/icons/icon-192.png', badge: './assets/icons/icon-192.png', data: { url }, tag: 'foses-' + title }));
    } else new Notification(title, { body });
    return true;
  } catch { return false; }
}

// --- VAPID (P-256) keypair generation in-browser, no libraries ---
export async function genVapid() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  return { public: b64u.enc(raw), privateJwk: JSON.stringify({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }) };
}

// --- Push subscription (stored in settings.json → synced to the data repo) ---
export async function subscribePush(vapidPublic) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u.dec(vapidPublic) });
  return JSON.parse(JSON.stringify(sub));
}
export async function pushState() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.getSubscription();
    return s ? JSON.parse(JSON.stringify(s)) : null;
  } catch { return null; }
}
export async function unsubscribePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const s = await reg.pushManager.getSubscription();
    if (s) await s.unsubscribe();
    return true;
  } catch { return false; }
}

// --- Periodic sync registration (best effort) ---
export async function registerPeriodic() {
  try {
    if (!periodicSupport()) return 'unsupported';
    const reg = await navigator.serviceWorker.ready;
    await reg.periodicSync.register('foses-reminders', { minInterval: 12 * 60 * 60 * 1000 });
    return 'ok';
  } catch { return 'denied'; }
}
