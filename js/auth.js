// Auth: PAT (recommended, 100% static-safe) + Device Flow (client_id only) + Demo.
// SECURITY: never store client_secret in frontend. Code-flow with secret is NOT supported here.
const SESS='foses-sess-v1';
export function getSession(){
  try{ return JSON.parse(sessionStorage.getItem(SESS)||localStorage.getItem('foses-remember')||'null'); }catch{ return null; }
}
export function setSession(s, remember=false){
  sessionStorage.setItem(SESS, JSON.stringify(s));
  if(remember) localStorage.setItem('foses-remember', JSON.stringify({...s, token: s.token ? 'remembered' : null}));
  else localStorage.removeItem('foses-remember');
}
export function clearSession(){ sessionStorage.removeItem(SESS); localStorage.removeItem('foses-remember'); localStorage.removeItem('foses-token'); }

export function getToken(){
  return sessionStorage.getItem('foses-token') || localStorage.getItem('foses-token') || null;
}
export function setToken(t, persist=false){
  if(persist) localStorage.setItem('foses-token', t); else sessionStorage.setItem('foses-token', t);
}

export async function fetchMe(token){
  const r=await fetch('https://api.github.com/user',{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json'}});
  if(!r.ok) throw new Error('token-invalid '+r.status);
  return r.json();
}

// --- Device Flow (no secret needed client-side) ---
// 1) POST /login/device/code {client_id, scope} -> user_code, verification_uri, device_code
// 2) poll POST /login/oauth/access_token {client_id, device_code, grant_type}
// Requires an OAuth App with "Enable Device Flow" checked. Client ID is public.
export async function deviceStart(clientId, scope='repo'){
  const r=await fetch('https://github.com/login/device/code',{
    method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'},
    body:JSON.stringify({client_id:clientId, scope})
  });
  if(!r.ok) throw new Error('device-start-failed');
  return r.json();
}
export async function devicePoll(clientId, device_code, intervalSec=5, timeoutSec=600){
  const t0=Date.now();
  while(Date.now()-t0 < timeoutSec*1000){
    await new Promise(r=>setTimeout(r, intervalSec*1000));
    const r=await fetch('https://github.com/login/oauth/access_token',{
      method:'POST', headers:{'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({client_id:clientId, device_code, grant_type:'urn:ietf:params:oauth:grant-type:device_code'})
    });
    const j=await r.json();
    if(j.access_token) return j;
    if(j.error && !['authorization_pending','slow_down'].includes(j.error)) throw new Error(j.error_description||j.error);
    if(j.error==='slow_down') await new Promise(r=>setTimeout(r,5000));
  }
  throw new Error('device-timeout');
}
