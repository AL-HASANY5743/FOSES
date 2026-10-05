// FOSES push sender — dependency-free Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID).
// Runs in GitHub Actions (Node 20+) inside the USER's data repo at .github/foses/send-push.mjs
// Reads: settings.json {vapidPublic, pushSub}, exams.json, subjects.json, curriculum.json
// Env: VAPID_PRIVATE_JWK (secret), VAPID_SUBJECT (var, optional mailto), TEST_MODE (workflow_dispatch test)
import { readFile } from 'node:fs/promises';
import { randomBytes, createCipheriv, createHmac } from 'node:crypto';
import { subtle } from 'node:crypto';
// RFC 5869: extract = HMAC(salt, ikm) · expand = HMAC(prk, info||0x01)[:len]
const hkdfExtract = (salt, ikm) => createHmac('sha256', salt).update(ikm).digest();
const hkdfExpand = (prk, info, len) => createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().slice(0, len);

const b64u = {
  enc(buf) { const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf); return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(s) { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }
};
async function readJson(p, fb) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fb; } }
const today = () => new Date().toISOString().slice(0, 10);

// WebCrypto ECDSA sign already returns raw r||s (64 bytes, IEEE P1363) — no DER parsing needed.
async function vapidJwt(audience, pubB64, privJwk, subject) {
  const head = b64u.enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u.enc(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: subject || 'mailto:foses@localhost' }));
  const key = await subtle.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(head + '.' + body)));
  return head + '.' + body + '.' + b64u.enc(sig);
}

async function encryptAes128Gcm(data, clientPub, authSecret) {
  const eph = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephRaw = Buffer.from(await subtle.exportKey('raw', eph.publicKey));
  const cli = await subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = Buffer.from(await subtle.deriveBits({ name: 'ECDH', public: cli }, eph.privateKey, 256));
  const prk = hkdfExtract(authSecret, secret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), clientPub, ephRaw]);
  const nonceInfo = Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), clientPub, ephRaw]);
  const cek = hkdfExpand(prk, keyInfo, 16);
  const nonce = hkdfExpand(prk, nonceInfo, 12);
  const pt = Buffer.concat([Buffer.from(data, 'utf8'), Buffer.from([0x02])]);
  const c = createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
  return { ct, salt: randomBytes(16), serverPub: ephRaw };
}

async function sendPush(sub, vapidPubB64, privJwk, subject, payload) {
  const endpoint = new URL(sub.endpoint);
  const clientPub = b64u.dec(sub.keys.p256dh), auth = b64u.dec(sub.keys.auth);
  const { ct, salt, serverPub } = await encryptAes128Gcm(JSON.stringify(payload), clientPub, auth);
  const jwt = await vapidJwt(endpoint.origin, vapidPubB64, privJwk, subject);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Encryption': 'salt=' + b64u.enc(salt),
      'Crypto-Key': 'dh=' + b64u.enc(serverPub) + ';p256ecdsa=' + vapidPubB64,
      'Authorization': 'vapid t=' + jwt + ', k=' + vapidPubB64,
      'TTL': '86400', 'Content-Type': 'application/octet-stream'
    },
    body: ct
  });
  if (!r.ok && r.status !== 201) { const t = await r.text().catch(() => ''); throw new Error('push failed ' + r.status + ' ' + t.slice(0, 120)); }
  return r.status;
}

function collectDue(exams, subjects, curriculum) {
  const t = today(), out = [];
  const subName = id => (subjects || []).find(s => s.id === id)?.name || '';
  const scopeOf = e => {
    if (e.scopeText) return e.scopeText;
    const chs = (curriculum || {})[e.subjectId]?.chapters || [];
    const a = chs.find(c => c.id === (e.fromChapterId || e.toChapterId));
    return a ? a.title : '';
  };
  (exams || []).forEach(e => { if (e.date && e.date <= t && !e.done) out.push({ kind: 'exam', title: e.title, sub: (subName(e.subjectId) + ' · ' + scopeOf(e)).trim(), date: e.date }); });
  Object.entries(curriculum || {}).forEach(([sid, cur]) => {
    (cur.chapters || []).forEach(c => (c.topics || []).forEach(tp => (tp.lessons || []).forEach(l => {
      if (l.remindAt && l.remindAt <= t && !l.completed) out.push({ kind: 'lesson', title: l.title, sub: (subName(sid) + ' · ' + c.title).trim(), date: l.remindAt });
    })));
  });
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

const settings = await readJson('settings.json', {});
const exams = await readJson('exams.json', []);
const subjects = await readJson('subjects.json', []);
const curriculum = await readJson('curriculum.json', {});
const sub = settings.pushSub;
if (!sub?.endpoint) { console.log('no push subscription — skip'); process.exit(0); }
const privRaw = process.env.VAPID_PRIVATE_JWK || '';
if (!privRaw) { console.log('missing secret FOSES_VAPID_PRIVATE — skip'); process.exit(0); }
let privJwk; try { privJwk = JSON.parse(privRaw); } catch { console.log('bad VAPID secret format'); process.exit(1); }
if (!settings.vapidPublic) { console.log('missing vapidPublic in settings.json'); process.exit(1); }

const due = collectDue(exams, subjects, curriculum);
const isTest = String(process.env.TEST_MODE || '').toLowerCase() === 'true';
let payload;
if (isTest) payload = { title: '🔔 FOSES — تنبيه اختبار', body: 'الإشعارات تعمل بنجاح ✅', url: '#/reminders', tag: 'foses-test' };
else if (!due.length) { console.log('nothing due — quiet'); process.exit(0); }
else {
  const first = due[0];
  payload = due.length === 1
    ? { title: (first.kind === 'exam' ? '◉ تذكير امتحان: ' : '📖 تذكير درس: ') + first.title, body: first.sub + ' · ' + first.date, url: '#/reminders', tag: 'foses-due-' + first.date }
    : { title: `🔔 لديك ${due.length} تذكيرات مستحقة`, body: due.slice(0, 3).map(d => d.title).join('، '), url: '#/reminders', tag: 'foses-due-' + today() };
}
const code = await sendPush(sub, settings.vapidPublic, privJwk, process.env.VAPID_SUBJECT, payload);
console.log('push sent:', code);
