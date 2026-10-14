import { DurableObject } from "cloudflare:workers";
export class MpSqlStore extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.sql=ctx.storage.sql;
  this.sql.exec("CREATE TABLE IF NOT EXISTS users (\n id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,\n name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','staff')),\n password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,\n created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE TABLE IF NOT EXISTS sessions (\n token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);\nCREATE TABLE IF NOT EXISTS login_attempts (\n id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip TEXT NOT NULL,\n created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email,ip,created_at);\nCREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, config TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS proposals (\n id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE,\n created_by INTEGER NOT NULL REFERENCES users(id),\n payload TEXT NOT NULL, client TEXT NOT NULL,client_email TEXT NOT NULL,\n site_address TEXT NOT NULL, fee_ex_vat REAL NOT NULL DEFAULT 0,\n status TEXT NOT NULL DEFAULT 'draft', last_email_id TEXT,\n created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE INDEX IF NOT EXISTS idx_proposals_creator ON proposals(created_by);");
 }
 async fetch(request){
  try{
   const {query,params=[],operation}=await request.json();
   if(typeof query!=="string" || !["first","all","run"].includes(operation) || !Array.isArray(params))return new Response("Invalid query request",{status:400});
   const cursor=this.sql.exec(query,...params);
   const rows=cursor.toArray();
   const changeInfo=this.sql.exec("SELECT changes() AS changes, last_insert_rowid() AS id").one();
   const meta={changes:Number(changeInfo.changes),last_row_id:Number(changeInfo.id)};
   return Response.json(operation==="first"?(rows[0]||null):operation==="all"?{results:rows}:{success:true,meta});
  }catch(e){
   console.error("MP internal database error",e?.message);
   return Response.json({error:"Database operation failed"},{status:500});
  }
 }
}
function bindDurableSql(env){
 const stub=env.MP_DATA.get(env.MP_DATA.idFromName("practice"));
 const run=async(query,params,operation)=>{
  const res=await stub.fetch("https://mp-store.internal/query",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,params,operation})});
  if(!res.ok)throw Object.assign(new Error("Database request failed"),{status:500});
  return res.json();
 };
 return {prepare(query){
  let params=[];
  const statement={
   bind(...values){params=values;return statement},
   first(){return run(query,params,"first")},
   all(){return run(query,params,"all")},
   run(){return run(query,params,"run")}
  };
  return statement;
 }};
}

// Mitchell Proctor Fee Proposal - Cloudflare Workers + D1.
// Secrets (SETUP_TOKEN / RESEND_API_KEY) are supplied through Wrangler, never committed.
const OWNER_EMAIL = 'enquiries@ukestimates.com';
// SHA-256 of a one-time 288-bit owner activation token. The token is delivered privately to the owner and never stored in source control.
const OWNER_CLAIM_SHA256 = '9246593d264c4e69c245d65e71eea86b057df5b0b27adfb27e189f302b8b41ed';
const MAIL_SUBJECT = 'architect fee proposal';
const encoder = new TextEncoder();
const appJSON = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const clean = (value, max = 300) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '')); }
function limited(n, lo, hi) { const v = Number(n); if (!Number.isFinite(v)) throw new Error('Invalid number'); return Math.min(hi, Math.max(lo, v)); }
function subjectFor(d) { return `${MAIL_SUBJECT} - ${clean(d.client, 120)} - ${clean(d.address, 240)}`; }
function refFor(id, date) { return `MP-${String(date || new Date().toISOString()).slice(0, 4)}-${String(id).padStart(5, '0')}`; }
function bytesToHex(bytes) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join(''); }
async function sha256(value) { return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
function randomHex(n = 32) { const bytes = new Uint8Array(n); crypto.getRandomValues(bytes); return bytesToHex(bytes); }
// Production Cloudflare Workers rejects WebCrypto PBKDF2 iteration counts above 100,000.
// The previous 250,000-round setting made owner activation fail at the HASH step.
// This is the platform-supported ceiling. Each password also has a unique random salt.
const PASSWORD_PBKDF2_ITERATIONS = 100000;
async function hashPassword(password, salt = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: PASSWORD_PBKDF2_ITERATIONS, hash: 'SHA-256' }, key, 256);
  return `pbkdf2_sha256${PASSWORD_PBKDF2_ITERATIONS}${salt}${bytesToHex(derived)}`;
}
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [type, iterations, salt, target] = stored.split('
  // Constant-time-ish fixed-length comparison of the derived secret.
  const a = encoder.encode(candidate); const b = encoder.encode(stored);
  if (a.length !== b.length) return false;
  let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
function headersForCookie(name, value, maxAge = 604800) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  return c.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
async function loginSession(db, user) {
  const token = randomHex();
  const hash = await sha256(token);
  await db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)').bind(hash, user.id, new Date(Date.now() + 7*86400000).toISOString()).run();
  return token;
}
async function getUser(request, env) {
  const token = getCookie(request, 'mp_session');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > ? AND u.active=1`).bind(await sha256(token), new Date().toISOString()).first();
  return row || null;
}
function mustUser(user, role) {
  if (!user) throw Object.assign(new Error('Please sign in'), {status:401});
  if (role && user.role !== role) throw Object.assign(new Error('Owner access required'), {status:403});
}
function safePayload(input) {
  const p = input && typeof input === 'object' ? structuredClone(input) : {};
  if (!validEmail(p.clientEmail)) throw Object.assign(new Error('Enter a valid client email address'), {status:400});
  if (!clean(p.client, 180) || !clean(p.address, 600)) throw Object.assign(new Error('Client name and site address are required'), {status:400});
  p.client = clean(p.client, 180); p.address = clean(p.address, 600);
  p.clientEmail = clean(p.clientEmail, 254).toLowerCase();
  p.clientPhone = clean(p.clientPhone, 40); p.clientAddress = clean(p.clientAddress, 600);
  p.projectName = clean(p.projectName, 200);
  p.area = limited(p.area, 0.01, 100000);
  p.buildRate = limited(p.buildRate ?? 2500, 0, 30000);
  p.feeVatRate = limited(p.feeVatRate ?? 20, 0, 30);
  p.buildVatRate = limited(p.buildVatRate ?? 20, 0, 30);
  if (!Array.isArray(p.stages) || p.stages.length > 20 || !Array.isArray(p.extras) || p.extras.length > 50) throw Object.assign(new Error('Invalid fee lines'), {status:400});
  if (!Array.isArray(p.adjustments) || p.adjustments.length > 50) throw Object.assign(new Error('Too many adjustments'), {status:400});
  p.stages = p.stages.map(s => ({ ...s, rate:limited(s.rate,0,5000), selected:!!s.selected, title:clean(s.title,180), scope:clean(s.scope,1500) }));
  p.extras = p.extras.map(s => ({ ...s, amount:limited(s.amount,0,1000000), selected:!!s.selected, title:clean(s.title,180), desc:clean(s.desc,1500) }));
  p.adjustments = p.adjustments.map(s => ({kind:s.kind === 'omission'?'omission':'addition',description:clean(s.description,200),amount:limited(s.amount,0,1000000)}));
  // Large embedded logo data is kept client-side. Standard logo is served by this app.
  delete p.logo;
  return p;
}
export function calculateFee(payload, minArea = 25) {
  const area = Math.max(Number(payload.area), Number(minArea));
  const stage = payload.stages.filter(s=>s.selected).reduce((v,s)=>v+Number(s.rate)*area,0);
  const extras = payload.extras.filter(s=>s.selected).reduce((v,s)=>v+Number(s.amount),0);
  const adjustments = payload.adjustments.reduce((v,a)=>v+(a.kind==='omission'?-1:1)*Number(a.amount),0);
  return Math.max(0,Math.round((stage+extras+adjustments)*100)/100);
}
async function quoteRow(db, id, user) {
  const row = await db.prepare('SELECT id,reference,created_by,payload,fee_ex_vat,client_email,client,site_address,status,created_at FROM proposals WHERE id=?').bind(id).first();
  if (!row || (user.role !== 'owner' && row.created_by !== user.id)) throw Object.assign(new Error('Quotation not found'), {status:404});
  return row;
}
function securityHeaders(r) {
  const headers=new Headers(r.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  return new Response(r.body,{status:r.status,headers});
}
async function api(req, env, path) {
  const method=req.method;
  if (method!=='GET' && method!=='HEAD') {
    const origin=req.headers.get('Origin');
    if (origin && origin!==new URL(req.url).origin) return appJSON({error:'Invalid request origin'},403);
    if (!['application/json','text/plain'].some(s=>(req.headers.get('Content-Type')||'').includes(s))) return appJSON({error:'JSON requests required'},415);
  }
  const user = await getUser(req,env);
  if (method==='GET' && path==='/api/session') return appJSON({authenticated:!!user,user:user?{id:user.id,email:user.email,name:user.name,role:user.role}:null,needsSetup:!await env.DB.prepare('SELECT id FROM users LIMIT 1').first()});
  if (method==='POST' && path==='/api/setup') {
    if (!env.SETUP_TOKEN && !OWNER_CLAIM_SHA256) return appJSON({error:'Owner setup unavailable'},503);
    const p=await req.json();
    if (typeof p.token!=='string' || p.token.length<24 || (env.SETUP_TOKEN ? p.token!==env.SETUP_TOKEN : await sha256(p.token)!==OWNER_CLAIM_SHA256)) return appJSON({error:'Invalid owner setup code'},403);
    if (!p.password || String(p.password).length<8 || String(p.password).length>120) return appJSON({error:'Choose a password of 8 to 120 characters'},400);
    const existing=await env.DB.prepare('SELECT id FROM users LIMIT 1').first();
    if (existing) return appJSON({error:'Owner already exists. Sign in or use the owner password reset procedure.'},409);
    // The database cursor rowsWritten includes index writes, not just inserted records.
    // Never decide whether an owner exists from rowsWritten; verify the actual row.
    let pass;
    try {pass=await hashPassword(String(p.password));}
    catch(e) {console.error('MP owner setup: password derivation',e);return appJSON({error:'Unable to secure owner password (setup step: HASH). Please contact support.',step:'HASH'},503);}
    try {
      await env.DB.prepare("INSERT INTO users(email,name,role,password_hash,active) SELECT ?,?,'owner',?,1 WHERE NOT EXISTS (SELECT 1 FROM users)").bind(OWNER_EMAIL,'Practice Owner',pass).run();
    } catch(e) {console.error('MP owner setup: database insert',e);return appJSON({error:'Unable to save owner account (setup step: INSERT). Please contact support.',step:'INSERT'},503);}
    let created;
    try {created=await env.DB.prepare('SELECT id,email FROM users WHERE email=? LIMIT 1').bind(OWNER_EMAIL).first();}
    catch(e) {console.error('MP owner setup: database verify',e);return appJSON({error:'Owner account could not be verified (setup step: VERIFY). Please contact support.',step:'VERIFY'},503);}
    if(!created) return appJSON({error:'Owner account was not saved (setup step: VERIFY)',step:'VERIFY'},503);
    return appJSON({ok:true,login:OWNER_EMAIL});
  }
  if (method==='POST' && path==='/api/login') {
    const p=await req.json(); const email=clean(p.email,254).toLowerCase();
    const ip=clean(req.headers.get('CF-Connecting-IP') || 'local',64); const since=new Date(Date.now()-15*60000).toISOString();
    const recent=await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE email=? AND ip=? AND datetime(created_at)>datetime(?)').bind(email,ip,since).first();
    if (Number(recent?.count||0)>=10) return appJSON({error:'Too many attempts. Wait 15 minutes.'},429);
    const account=await env.DB.prepare('SELECT * FROM users WHERE email=? AND active=1').bind(email).first();
    if (!account || !await verifyPassword(String(p.password||''),account.password_hash)) {
      await env.DB.prepare('INSERT INTO login_attempts(email,ip) VALUES(?,?)').bind(email,ip).run();
      return appJSON({error:'Email or password incorrect'},401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE email=? AND ip=?').bind(email,ip).run();
    const token=await loginSession(env.DB,account);
    const out=appJSON({ok:true,user:{email:account.email,name:account.name,role:account.role}});
    out.headers.append('Set-Cookie',headersForCookie('mp_session',token)); return out;
  }
  if (method==='POST' && path==='/api/logout') {
    const token=getCookie(req,'mp_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
    const out=appJSON({ok:true});out.headers.append('Set-Cookie',headersForCookie('mp_session','',0));return out;
  }
  mustUser(user);
  if (path==='/api/pricing' && method==='GET') {
    const r=await env.DB.prepare('SELECT config FROM settings WHERE name=?').bind('pricing').first();
    return appJSON({pricing:r?JSON.parse(r.config):null});
  }
  if (path==='/api/pricing' && method==='POST') {
    mustUser(user,'owner');
    const p=await req.json();
    const pricing={buildRate:limited(p.buildRate,0,30000),buildVatRate:limited(p.buildVatRate,0,30),feeVatRate:limited(p.feeVatRate,0,30),minimumArea:25,
      stages:(p.stages||[]).slice(0,20).map(x=>({id:clean(x.id,40),rate:limited(x.rate,0,5000),selected:!!x.selected})),
      extras:(p.extras||[]).slice(0,40).map(x=>({id:clean(x.id,40),amount:limited(x.amount,0,1000000),selected:!!x.selected}))};
    await env.DB.prepare('INSERT INTO settings(name,config) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET config=excluded.config').bind('pricing',JSON.stringify(pricing)).run();
    return appJSON({ok:true,pricing});
  }
  if(path==='/api/proposals' && method==='GET'){
    const rows=user.role==='owner'?await env.DB.prepare('SELECT id,reference,client,site_address,fee_ex_vat,updated_at,payload,status FROM proposals ORDER BY id DESC LIMIT 300').all():await env.DB.prepare('SELECT id,reference,client,site_address,fee_ex_vat,updated_at,payload,status FROM proposals WHERE created_by=? ORDER BY id DESC LIMIT 300').bind(user.id).all();
    return appJSON({projects:rows.results.map(r=>({id:r.id,key:r.reference+'::'+r.client,reference:r.reference,name:JSON.parse(r.payload).projectName||r.client,fee:Number(r.fee_ex_vat),updatedAt:r.updated_at,data:{...JSON.parse(r.payload),reference:r.reference},status:r.status}))});
  }
  if(path==='/api/proposals' && method==='POST'){
    const p=await req.json(); const data=safePayload(p.data);
    const fee=calculateFee(data,25);
    let id=Number(p.id)||null;
    if(id){const row=await quoteRow(env.DB,id,user);if(row.status==='sent' && user.role!=='owner')return appJSON({error:'Issued proposals can be amended by the owner only'},403);
      await env.DB.prepare('UPDATE proposals SET payload=?,fee_ex_vat=?,client=?,client_email=?,site_address=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(data),fee,data.client,data.clientEmail,data.address,'draft',id).run();
      return appJSON({ok:true,id,reference:row.reference,fee});
    }
    const added=await env.DB.prepare('INSERT INTO proposals(created_by,payload,fee_ex_vat,client,client_email,site_address,status) VALUES(?,?,?,?,?,?,?)').bind(user.id,JSON.stringify(data),fee,data.client,data.clientEmail,data.address,'draft').run();
    id=added.meta.last_row_id; const reference=refFor(id,new Date().toISOString());
    await env.DB.prepare('UPDATE proposals SET reference=? WHERE id=?').bind(reference,id).run();
    return appJSON({ok:true,id,reference,fee});
  }
  const proposal=path.match(/^\/api\/proposals\/(\d+)(?:\/(send|delete))?$/);
  if (proposal) {
    const id=Number(proposal[1]);const action=proposal[2];const row=await quoteRow(env.DB,id,user);
    if(method==='GET'&&!action)return appJSON({proposal:{id:row.id,reference:row.reference,data:{...JSON.parse(row.payload),reference:row.reference},status:row.status}});
    if(method==='POST'&&action==='delete'){
      const p=await req.json();const account=await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
      if(!await verifyPassword(String(p.password||''),account.password_hash))return appJSON({error:'Password confirmation failed'},403);
      await env.DB.prepare('DELETE FROM proposals WHERE id=?').bind(id).run();return appJSON({ok:true});
    }
    if(method==='POST'&&action==='send'){
      if(!env.RESEND_API_KEY || !env.MAIL_FROM)return appJSON({error:'Automatic email is not configured. Download and attach the Word document using the email draft instead.'},503);
      const p=await req.json();if(p.confirm!==true)return appJSON({error:'Please confirm sending'},400);
      if(!validEmail(row.client_email))return appJSON({error:'Client email invalid'},400);
      if(!/^[a-zA-Z0-9+/_=-]+$/.test(String(p.docxBase64||''))||String(p.docxBase64).length>4500000)return appJSON({error:'Word attachment missing or too large'},400);
      const subject=subjectFor({client:row.client,address:row.site_address});
      const quote = JSON.parse(row.payload);
      const body=`Dear ${row.client},\n\nPlease find attached our architectural fee proposal for ${row.site_address}, including the fee breakdown, exclusions, payment schedule and client acceptance form.\n\nKind regards,\nMitchell Proctor Architects\n01246 203196`;
      const mail={from:env.MAIL_FROM,to:[row.client_email],bcc:[OWNER_EMAIL],subject,text:body,attachments:[{filename:row.reference+'_Fee_Proposal.docx',content:p.docxBase64,content_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]};
      const remote=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(mail)});
      const sent=await remote.json().catch(()=>({}));
      if(!remote.ok||!sent.id)return appJSON({error:'Mail service rejected send: '+clean(sent.message||remote.status,220)},502);
      await env.DB.prepare("UPDATE proposals SET status='sent',last_email_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sent.id,id).run();
      return appJSON({ok:true,messageId:sent.id,subject,recipient:row.client_email,office:OWNER_EMAIL});
    }
  }
  if(path==='/api/staff' && method==='GET'){
    mustUser(user,'owner'); const r=await env.DB.prepare('SELECT id,email,name,role,active,created_at FROM users ORDER BY id').all();
    return appJSON({staff:r.results});
  }
  if(path==='/api/staff' && method==='POST'){
    mustUser(user,'owner'); const p=await req.json();
    if(p.action==='create'){
      const email=clean(p.email,254).toLowerCase();if(!validEmail(email))return appJSON({error:'Valid staff email required'},400);
      if(typeof p.password!=='string'||p.password.length<10)return appJSON({error:'Staff password must be 10 characters or longer'},400);
      const pass=await hashPassword(p.password);
      try {const result=await env.DB.prepare("INSERT INTO users(email,name,role,password_hash,active) VALUES(?,?,'staff',?,1)").bind(email,clean(p.name,150),pass).run();return appJSON({ok:true,id:result.meta.last_row_id});}
      catch{return appJSON({error:'Account exists or could not be created'},409);}
    }
    const id=Number(p.id); const target=await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(id).first();
    if(!target||target.role==='owner')return appJSON({error:'Staff account not found'},404);
    if(p.action==='active'){
      await env.DB.prepare('UPDATE users SET active=? WHERE id=?').bind(p.active?1:0,id).run();
      if(!p.active)await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      return appJSON({ok:true});
    }
    if(p.action==='reset'){
      if(typeof p.password!=='string'||p.password.length<10)return appJSON({error:'New staff password must be at least 10 characters'},400);
      await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(p.password),id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();return appJSON({ok:true});
    }
    return appJSON({error:'Unrecognised staff action'},400);
  }
  if(path==='/api/owner/password'&&method==='POST'){
    mustUser(user,'owner');const p=await req.json();const account=await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
    if(!await verifyPassword(String(p.current||''),account.password_hash))return appJSON({error:'Current password is incorrect'},403);
    if(typeof p.next!=='string'||p.next.length<10)return appJSON({error:'New password must be at least 10 characters'},400);
    await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(p.next),user.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').bind(user.id,await sha256(getCookie(req,'mp_session'))).run();
    return appJSON({ok:true});
  }
  if(path==='/api/status'&&method==='GET') return appJSON({emailConfigured:!!(env.RESEND_API_KEY&&env.MAIL_FROM),officeCopy:OWNER_EMAIL,owner:user.role==='owner'});
  return appJSON({error:'Endpoint not found'},404);
}
export default {
  async fetch(request, env) {
    env={...env,DB:bindDurableSql(env)};
    try {
      const url=new URL(request.url);const path=url.pathname;
      if(path.startsWith('/api/'))return securityHeaders(await api(request,env,path));
      if(request.method!=='GET'&&request.method!=='HEAD')return appJSON({error:'Method not allowed'},405);
      const user=await getUser(request,env);
      if(path==='/login'||path==='/login.html'||path==='/setup'||path==='/setup.html'){
        const asset=path.startsWith('/setup')?'/setup.html':'/login.html';
        return securityHeaders(await env.ASSETS.fetch(new Request(new URL(asset,request.url),request)));
      }
      if(['/manifest.webmanifest','/mp-icon.svg','/favicon.ico','/portal.css'].includes(path))return securityHeaders(await env.ASSETS.fetch(request));
      if(!user)return Response.redirect(new URL('/login',url).toString(),302);
      if(path==='/cloud-sync.js')return securityHeaders(await env.ASSETS.fetch(request));
      if(path==='/owner'||path==='/owner.html'){
        if(user.role!=='owner')return new Response('Owner only',{status:403});
        return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/owner.html',request.url),request)));
      }
      if(path==='/'||path==='/app'||path==='/index.html')return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/app.html',request.url),request)));
      return new Response('Not found',{status:404});
    } catch(e) {
      console.error('Worker error',e);
      return appJSON({error:e.status?e.message:'Request could not be completed'},e.status||500);
    }
  }
};);
  if (type !== 'pbkdf2_sha256' || iterations !== String(PASSWORD_PBKDF2_ITERATIONS) || !salt || !target) return false;
  const candidate = await hashPassword(password, salt);
  // Constant-time-ish fixed-length comparison of the derived secret.
  const a = encoder.encode(candidate); const b = encoder.encode(stored);
  if (a.length !== b.length) return false;
  let mismatch = 0; for (let i = 0; i < a.length; i++) mismatch |= a[i] ^ b[i];
  return mismatch === 0;
}
function headersForCookie(name, value, maxAge = 604800) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  return c.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}
async function loginSession(db, user) {
  const token = randomHex();
  const hash = await sha256(token);
  await db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)').bind(hash, user.id, new Date(Date.now() + 7*86400000).toISOString()).run();
  return token;
}
async function getUser(request, env) {
  const token = getCookie(request, 'mp_session');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(`SELECT u.id, u.email, u.name, u.role, u.active
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > ? AND u.active=1`).bind(await sha256(token), new Date().toISOString()).first();
  return row || null;
}
function mustUser(user, role) {
  if (!user) throw Object.assign(new Error('Please sign in'), {status:401});
  if (role && user.role !== role) throw Object.assign(new Error('Owner access required'), {status:403});
}
function safePayload(input) {
  const p = input && typeof input === 'object' ? structuredClone(input) : {};
  if (!validEmail(p.clientEmail)) throw Object.assign(new Error('Enter a valid client email address'), {status:400});
  if (!clean(p.client, 180) || !clean(p.address, 600)) throw Object.assign(new Error('Client name and site address are required'), {status:400});
  p.client = clean(p.client, 180); p.address = clean(p.address, 600);
  p.clientEmail = clean(p.clientEmail, 254).toLowerCase();
  p.clientPhone = clean(p.clientPhone, 40); p.clientAddress = clean(p.clientAddress, 600);
  p.projectName = clean(p.projectName, 200);
  p.area = limited(p.area, 0.01, 100000);
  p.buildRate = limited(p.buildRate ?? 2500, 0, 30000);
  p.feeVatRate = limited(p.feeVatRate ?? 20, 0, 30);
  p.buildVatRate = limited(p.buildVatRate ?? 20, 0, 30);
  if (!Array.isArray(p.stages) || p.stages.length > 20 || !Array.isArray(p.extras) || p.extras.length > 50) throw Object.assign(new Error('Invalid fee lines'), {status:400});
  if (!Array.isArray(p.adjustments) || p.adjustments.length > 50) throw Object.assign(new Error('Too many adjustments'), {status:400});
  p.stages = p.stages.map(s => ({ ...s, rate:limited(s.rate,0,5000), selected:!!s.selected, title:clean(s.title,180), scope:clean(s.scope,1500) }));
  p.extras = p.extras.map(s => ({ ...s, amount:limited(s.amount,0,1000000), selected:!!s.selected, title:clean(s.title,180), desc:clean(s.desc,1500) }));
  p.adjustments = p.adjustments.map(s => ({kind:s.kind === 'omission'?'omission':'addition',description:clean(s.description,200),amount:limited(s.amount,0,1000000)}));
  // Large embedded logo data is kept client-side. Standard logo is served by this app.
  delete p.logo;
  return p;
}
export function calculateFee(payload, minArea = 25) {
  const area = Math.max(Number(payload.area), Number(minArea));
  const stage = payload.stages.filter(s=>s.selected).reduce((v,s)=>v+Number(s.rate)*area,0);
  const extras = payload.extras.filter(s=>s.selected).reduce((v,s)=>v+Number(s.amount),0);
  const adjustments = payload.adjustments.reduce((v,a)=>v+(a.kind==='omission'?-1:1)*Number(a.amount),0);
  return Math.max(0,Math.round((stage+extras+adjustments)*100)/100);
}
async function quoteRow(db, id, user) {
  const row = await db.prepare('SELECT id,reference,created_by,payload,fee_ex_vat,client_email,client,site_address,status,created_at FROM proposals WHERE id=?').bind(id).first();
  if (!row || (user.role !== 'owner' && row.created_by !== user.id)) throw Object.assign(new Error('Quotation not found'), {status:404});
  return row;
}
function securityHeaders(r) {
  const headers=new Headers(r.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  return new Response(r.body,{status:r.status,headers});
}
async function api(req, env, path) {
  const method=req.method;
  if (method!=='GET' && method!=='HEAD') {
    const origin=req.headers.get('Origin');
    if (origin && origin!==new URL(req.url).origin) return appJSON({error:'Invalid request origin'},403);
    if (!['application/json','text/plain'].some(s=>(req.headers.get('Content-Type')||'').includes(s))) return appJSON({error:'JSON requests required'},415);
  }
  const user = await getUser(req,env);
  if (method==='GET' && path==='/api/session') return appJSON({authenticated:!!user,user:user?{id:user.id,email:user.email,name:user.name,role:user.role}:null,needsSetup:!await env.DB.prepare('SELECT id FROM users LIMIT 1').first()});
  if (method==='POST' && path==='/api/setup') {
    if (!env.SETUP_TOKEN && !OWNER_CLAIM_SHA256) return appJSON({error:'Owner setup unavailable'},503);
    const p=await req.json();
    if (typeof p.token!=='string' || p.token.length<24 || (env.SETUP_TOKEN ? p.token!==env.SETUP_TOKEN : await sha256(p.token)!==OWNER_CLAIM_SHA256)) return appJSON({error:'Invalid owner setup code'},403);
    if (!p.password || String(p.password).length<8 || String(p.password).length>120) return appJSON({error:'Choose a password of 8 to 120 characters'},400);
    const existing=await env.DB.prepare('SELECT id FROM users LIMIT 1').first();
    if (existing) return appJSON({error:'Owner already exists. Sign in or use the owner password reset procedure.'},409);
    // The database cursor rowsWritten includes index writes, not just inserted records.
    // Never decide whether an owner exists from rowsWritten; verify the actual row.
    let pass;
    try {pass=await hashPassword(String(p.password));}
    catch(e) {console.error('MP owner setup: password derivation',e);return appJSON({error:'Unable to secure owner password (setup step: HASH). Please contact support.',step:'HASH'},503);}
    try {
      await env.DB.prepare("INSERT INTO users(email,name,role,password_hash,active) SELECT ?,?,'owner',?,1 WHERE NOT EXISTS (SELECT 1 FROM users)").bind(OWNER_EMAIL,'Practice Owner',pass).run();
    } catch(e) {console.error('MP owner setup: database insert',e);return appJSON({error:'Unable to save owner account (setup step: INSERT). Please contact support.',step:'INSERT'},503);}
    let created;
    try {created=await env.DB.prepare('SELECT id,email FROM users WHERE email=? LIMIT 1').bind(OWNER_EMAIL).first();}
    catch(e) {console.error('MP owner setup: database verify',e);return appJSON({error:'Owner account could not be verified (setup step: VERIFY). Please contact support.',step:'VERIFY'},503);}
    if(!created) return appJSON({error:'Owner account was not saved (setup step: VERIFY)',step:'VERIFY'},503);
    return appJSON({ok:true,login:OWNER_EMAIL});
  }
  if (method==='POST' && path==='/api/login') {
    const p=await req.json(); const email=clean(p.email,254).toLowerCase();
    const ip=clean(req.headers.get('CF-Connecting-IP') || 'local',64); const since=new Date(Date.now()-15*60000).toISOString();
    const recent=await env.DB.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE email=? AND ip=? AND datetime(created_at)>datetime(?)').bind(email,ip,since).first();
    if (Number(recent?.count||0)>=10) return appJSON({error:'Too many attempts. Wait 15 minutes.'},429);
    const account=await env.DB.prepare('SELECT * FROM users WHERE email=? AND active=1').bind(email).first();
    if (!account || !await verifyPassword(String(p.password||''),account.password_hash)) {
      await env.DB.prepare('INSERT INTO login_attempts(email,ip) VALUES(?,?)').bind(email,ip).run();
      return appJSON({error:'Email or password incorrect'},401);
    }
    await env.DB.prepare('DELETE FROM login_attempts WHERE email=? AND ip=?').bind(email,ip).run();
    const token=await loginSession(env.DB,account);
    const out=appJSON({ok:true,user:{email:account.email,name:account.name,role:account.role}});
    out.headers.append('Set-Cookie',headersForCookie('mp_session',token)); return out;
  }
  if (method==='POST' && path==='/api/logout') {
    const token=getCookie(req,'mp_session');if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(token)).run();
    const out=appJSON({ok:true});out.headers.append('Set-Cookie',headersForCookie('mp_session','',0));return out;
  }
  mustUser(user);
  if (path==='/api/pricing' && method==='GET') {
    const r=await env.DB.prepare('SELECT config FROM settings WHERE name=?').bind('pricing').first();
    return appJSON({pricing:r?JSON.parse(r.config):null});
  }
  if (path==='/api/pricing' && method==='POST') {
    mustUser(user,'owner');
    const p=await req.json();
    const pricing={buildRate:limited(p.buildRate,0,30000),buildVatRate:limited(p.buildVatRate,0,30),feeVatRate:limited(p.feeVatRate,0,30),minimumArea:25,
      stages:(p.stages||[]).slice(0,20).map(x=>({id:clean(x.id,40),rate:limited(x.rate,0,5000),selected:!!x.selected})),
      extras:(p.extras||[]).slice(0,40).map(x=>({id:clean(x.id,40),amount:limited(x.amount,0,1000000),selected:!!x.selected}))};
    await env.DB.prepare('INSERT INTO settings(name,config) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET config=excluded.config').bind('pricing',JSON.stringify(pricing)).run();
    return appJSON({ok:true,pricing});
  }
  if(path==='/api/proposals' && method==='GET'){
    const rows=user.role==='owner'?await env.DB.prepare('SELECT id,reference,client,site_address,fee_ex_vat,updated_at,payload,status FROM proposals ORDER BY id DESC LIMIT 300').all():await env.DB.prepare('SELECT id,reference,client,site_address,fee_ex_vat,updated_at,payload,status FROM proposals WHERE created_by=? ORDER BY id DESC LIMIT 300').bind(user.id).all();
    return appJSON({projects:rows.results.map(r=>({id:r.id,key:r.reference+'::'+r.client,reference:r.reference,name:JSON.parse(r.payload).projectName||r.client,fee:Number(r.fee_ex_vat),updatedAt:r.updated_at,data:{...JSON.parse(r.payload),reference:r.reference},status:r.status}))});
  }
  if(path==='/api/proposals' && method==='POST'){
    const p=await req.json(); const data=safePayload(p.data);
    const fee=calculateFee(data,25);
    let id=Number(p.id)||null;
    if(id){const row=await quoteRow(env.DB,id,user);if(row.status==='sent' && user.role!=='owner')return appJSON({error:'Issued proposals can be amended by the owner only'},403);
      await env.DB.prepare('UPDATE proposals SET payload=?,fee_ex_vat=?,client=?,client_email=?,site_address=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(JSON.stringify(data),fee,data.client,data.clientEmail,data.address,'draft',id).run();
      return appJSON({ok:true,id,reference:row.reference,fee});
    }
    const added=await env.DB.prepare('INSERT INTO proposals(created_by,payload,fee_ex_vat,client,client_email,site_address,status) VALUES(?,?,?,?,?,?,?)').bind(user.id,JSON.stringify(data),fee,data.client,data.clientEmail,data.address,'draft').run();
    id=added.meta.last_row_id; const reference=refFor(id,new Date().toISOString());
    await env.DB.prepare('UPDATE proposals SET reference=? WHERE id=?').bind(reference,id).run();
    return appJSON({ok:true,id,reference,fee});
  }
  const proposal=path.match(/^\/api\/proposals\/(\d+)(?:\/(send|delete))?$/);
  if (proposal) {
    const id=Number(proposal[1]);const action=proposal[2];const row=await quoteRow(env.DB,id,user);
    if(method==='GET'&&!action)return appJSON({proposal:{id:row.id,reference:row.reference,data:{...JSON.parse(row.payload),reference:row.reference},status:row.status}});
    if(method==='POST'&&action==='delete'){
      const p=await req.json();const account=await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
      if(!await verifyPassword(String(p.password||''),account.password_hash))return appJSON({error:'Password confirmation failed'},403);
      await env.DB.prepare('DELETE FROM proposals WHERE id=?').bind(id).run();return appJSON({ok:true});
    }
    if(method==='POST'&&action==='send'){
      if(!env.RESEND_API_KEY || !env.MAIL_FROM)return appJSON({error:'Automatic email is not configured. Download and attach the Word document using the email draft instead.'},503);
      const p=await req.json();if(p.confirm!==true)return appJSON({error:'Please confirm sending'},400);
      if(!validEmail(row.client_email))return appJSON({error:'Client email invalid'},400);
      if(!/^[a-zA-Z0-9+/_=-]+$/.test(String(p.docxBase64||''))||String(p.docxBase64).length>4500000)return appJSON({error:'Word attachment missing or too large'},400);
      const subject=subjectFor({client:row.client,address:row.site_address});
      const quote = JSON.parse(row.payload);
      const body=`Dear ${row.client},\n\nPlease find attached our architectural fee proposal for ${row.site_address}, including the fee breakdown, exclusions, payment schedule and client acceptance form.\n\nKind regards,\nMitchell Proctor Architects\n01246 203196`;
      const mail={from:env.MAIL_FROM,to:[row.client_email],bcc:[OWNER_EMAIL],subject,text:body,attachments:[{filename:row.reference+'_Fee_Proposal.docx',content:p.docxBase64,content_type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}]};
      const remote=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(mail)});
      const sent=await remote.json().catch(()=>({}));
      if(!remote.ok||!sent.id)return appJSON({error:'Mail service rejected send: '+clean(sent.message||remote.status,220)},502);
      await env.DB.prepare("UPDATE proposals SET status='sent',last_email_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sent.id,id).run();
      return appJSON({ok:true,messageId:sent.id,subject,recipient:row.client_email,office:OWNER_EMAIL});
    }
  }
  if(path==='/api/staff' && method==='GET'){
    mustUser(user,'owner'); const r=await env.DB.prepare('SELECT id,email,name,role,active,created_at FROM users ORDER BY id').all();
    return appJSON({staff:r.results});
  }
  if(path==='/api/staff' && method==='POST'){
    mustUser(user,'owner'); const p=await req.json();
    if(p.action==='create'){
      const email=clean(p.email,254).toLowerCase();if(!validEmail(email))return appJSON({error:'Valid staff email required'},400);
      if(typeof p.password!=='string'||p.password.length<10)return appJSON({error:'Staff password must be 10 characters or longer'},400);
      const pass=await hashPassword(p.password);
      try {const result=await env.DB.prepare("INSERT INTO users(email,name,role,password_hash,active) VALUES(?,?,'staff',?,1)").bind(email,clean(p.name,150),pass).run();return appJSON({ok:true,id:result.meta.last_row_id});}
      catch{return appJSON({error:'Account exists or could not be created'},409);}
    }
    const id=Number(p.id); const target=await env.DB.prepare('SELECT id,role FROM users WHERE id=?').bind(id).first();
    if(!target||target.role==='owner')return appJSON({error:'Staff account not found'},404);
    if(p.action==='active'){
      await env.DB.prepare('UPDATE users SET active=? WHERE id=?').bind(p.active?1:0,id).run();
      if(!p.active)await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      return appJSON({ok:true});
    }
    if(p.action==='reset'){
      if(typeof p.password!=='string'||p.password.length<10)return appJSON({error:'New staff password must be at least 10 characters'},400);
      await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(p.password),id).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();return appJSON({ok:true});
    }
    return appJSON({error:'Unrecognised staff action'},400);
  }
  if(path==='/api/owner/password'&&method==='POST'){
    mustUser(user,'owner');const p=await req.json();const account=await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
    if(!await verifyPassword(String(p.current||''),account.password_hash))return appJSON({error:'Current password is incorrect'},403);
    if(typeof p.next!=='string'||p.next.length<10)return appJSON({error:'New password must be at least 10 characters'},400);
    await env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?').bind(await hashPassword(p.next),user.id).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash!=?').bind(user.id,await sha256(getCookie(req,'mp_session'))).run();
    return appJSON({ok:true});
  }
  if(path==='/api/status'&&method==='GET') return appJSON({emailConfigured:!!(env.RESEND_API_KEY&&env.MAIL_FROM),officeCopy:OWNER_EMAIL,owner:user.role==='owner'});
  return appJSON({error:'Endpoint not found'},404);
}
export default {
  async fetch(request, env) {
    env={...env,DB:bindDurableSql(env)};
    try {
      const url=new URL(request.url);const path=url.pathname;
      if(path.startsWith('/api/'))return securityHeaders(await api(request,env,path));
      if(request.method!=='GET'&&request.method!=='HEAD')return appJSON({error:'Method not allowed'},405);
      const user=await getUser(request,env);
      if(path==='/login'||path==='/login.html'||path==='/setup'||path==='/setup.html'){
        const asset=path.startsWith('/setup')?'/setup.html':'/login.html';
        return securityHeaders(await env.ASSETS.fetch(new Request(new URL(asset,request.url),request)));
      }
      if(['/manifest.webmanifest','/mp-icon.svg','/favicon.ico','/portal.css'].includes(path))return securityHeaders(await env.ASSETS.fetch(request));
      if(!user)return Response.redirect(new URL('/login',url).toString(),302);
      if(path==='/cloud-sync.js')return securityHeaders(await env.ASSETS.fetch(request));
      if(path==='/owner'||path==='/owner.html'){
        if(user.role!=='owner')return new Response('Owner only',{status:403});
        return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/owner.html',request.url),request)));
      }
      if(path==='/'||path==='/app'||path==='/index.html')return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/app.html',request.url),request)));
      return new Response('Not found',{status:404});
    } catch(e) {
      console.error('Worker error',e);
      return appJSON({error:e.status?e.message:'Request could not be completed'},e.status||500);
    }
  }
};