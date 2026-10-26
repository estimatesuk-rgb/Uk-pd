import { DurableObject } from "cloudflare:workers";
import { proposalPdf } from "./pdf.mjs";
import { makePricingDefaults, resolvePricingDefaults, validBand, BAND_IDS } from "./pricing-defaults.mjs";
import { calculateProfessionalFee } from "./fee-math.mjs";
import {isOutlookConfigured,OUTLOOK_SCOPES,OUTLOOK_DASHBOARD,redirectFor,randomUrlToken,outlookAuthorizeUrl,microsoftTokenRequest,graphCall,encryptOutlookTokens,decryptOutlookTokens,outlookEmailMessage,safeOutlookHtmlToText,nextOutlookSubjectRef} from "./outlook-graph.mjs";
import {activeOutlookAccount,syncOutlookInbox} from "./outlook-service.mjs";
import { chaseIsDue,nextChaseDate,officeChaseSubject,officeChaseBody,clientChaseBody,CHASE_ROUNDS } from "./chase-policy.mjs";
export class MpSqlStore extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.sql=ctx.storage.sql;
  this.sql.exec("CREATE TABLE IF NOT EXISTS users (\n id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,\n name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','staff')),\n password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,\n created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE TABLE IF NOT EXISTS sessions (\n token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);\nCREATE TABLE IF NOT EXISTS login_attempts (\n id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, ip TEXT NOT NULL,\n created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts(email,ip,created_at);\nCREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, config TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS proposals (\n id INTEGER PRIMARY KEY AUTOINCREMENT, reference TEXT UNIQUE,\n created_by INTEGER NOT NULL REFERENCES users(id),\n payload TEXT NOT NULL, client TEXT NOT NULL,client_email TEXT NOT NULL,\n site_address TEXT NOT NULL, fee_ex_vat REAL NOT NULL DEFAULT 0,\n status TEXT NOT NULL DEFAULT 'draft', last_email_id TEXT,\n created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,\n updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP\n);\nCREATE INDEX IF NOT EXISTS idx_proposals_creator ON proposals(created_by);");
  // Non-destructive migration for existing live practices and saved proposals.
  const columns=this.sql.exec("PRAGMA table_info(proposals)").toArray();
  if(!columns.some(c=>c.name==="job_status"))this.sql.exec("ALTER TABLE proposals ADD COLUMN job_status TEXT NOT NULL DEFAULT 'pending'");
  if(!columns.some(c=>c.name==="job_stage"))this.sql.exec("ALTER TABLE proposals ADD COLUMN job_stage TEXT NOT NULL DEFAULT 'enquiry'");
  if(!columns.some(c=>c.name==="agreed_fee_ex_vat"))this.sql.exec("ALTER TABLE proposals ADD COLUMN agreed_fee_ex_vat REAL");
  if(!columns.some(c=>c.name==="agreed_at"))this.sql.exec("ALTER TABLE proposals ADD COLUMN agreed_at TEXT");
  if(!columns.some(c=>c.name==="revision"))this.sql.exec("ALTER TABLE proposals ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
  if(!columns.some(c=>c.name==="lost_reason"))this.sql.exec("ALTER TABLE proposals ADD COLUMN lost_reason TEXT NOT NULL DEFAULT ''");
  if(!columns.some(c=>c.name==="next_action"))this.sql.exec("ALTER TABLE proposals ADD COLUMN next_action TEXT NOT NULL DEFAULT ''");
  if(!columns.some(c=>c.name==="next_action_due"))this.sql.exec("ALTER TABLE proposals ADD COLUMN next_action_due TEXT NOT NULL DEFAULT ''");
  if(!columns.some(c=>c.name==="chase_enabled"))this.sql.exec("ALTER TABLE proposals ADD COLUMN chase_enabled INTEGER NOT NULL DEFAULT 0");
  if(!columns.some(c=>c.name==="chase_started_at"))this.sql.exec("ALTER TABLE proposals ADD COLUMN chase_started_at TEXT");
  if(!columns.some(c=>c.name==="chase_sent_count"))this.sql.exec("ALTER TABLE proposals ADD COLUMN chase_sent_count INTEGER NOT NULL DEFAULT 0");
  this.sql.exec("CREATE TABLE IF NOT EXISTS chase_reminders (id INTEGER PRIMARY KEY AUTOINCREMENT,proposal_id INTEGER NOT NULL,round INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',email_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,sent_at TEXT,completed_at TEXT,completed_by INTEGER,completion_note TEXT,client_email_id TEXT,UNIQUE(proposal_id,round));");
  this.sql.exec("CREATE INDEX IF NOT EXISTS idx_mp_chases_project ON chase_reminders(proposal_id,round);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS project_events (id INTEGER PRIMARY KEY AUTOINCREMENT,proposal_id INTEGER NOT NULL,event_type TEXT NOT NULL,body TEXT NOT NULL,created_by INTEGER NOT NULL,occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  this.sql.exec("CREATE INDEX IF NOT EXISTS idx_mp_events_project ON project_events(proposal_id,id);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS project_files (id INTEGER PRIMARY KEY AUTOINCREMENT,proposal_id INTEGER NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'document',size_bytes INTEGER NOT NULL,content_base64 TEXT NOT NULL,uploaded_by INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  this.sql.exec("CREATE INDEX IF NOT EXISTS idx_mp_files_project ON project_files(proposal_id,id);");
  const fileColumns=this.sql.exec("PRAGMA table_info(project_files)").toArray();
  if(!fileColumns.some(c=>c.name==='storage_kind'))this.sql.exec("ALTER TABLE project_files ADD COLUMN storage_kind TEXT NOT NULL DEFAULT 'inline'");
  if(!fileColumns.some(c=>c.name==='ready'))this.sql.exec("ALTER TABLE project_files ADD COLUMN ready INTEGER NOT NULL DEFAULT 1");
  this.sql.exec("CREATE TABLE IF NOT EXISTS project_file_chunks (file_id INTEGER NOT NULL,part INTEGER NOT NULL,content_base64 TEXT NOT NULL,raw_bytes INTEGER NOT NULL,PRIMARY KEY(file_id,part));");
  this.sql.exec("CREATE TABLE IF NOT EXISTS outlook_oauth_states (state TEXT PRIMARY KEY,user_id INTEGER NOT NULL,verifier TEXT NOT NULL,expires_at TEXT NOT NULL);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS outlook_connections (user_id INTEGER PRIMARY KEY,account_id TEXT NOT NULL,mailbox TEXT NOT NULL,secret_cipher TEXT NOT NULL,expires_at INTEGER NOT NULL,last_synced_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS outlook_sent (id INTEGER PRIMARY KEY AUTOINCREMENT,proposal_id INTEGER NOT NULL,user_id INTEGER NOT NULL,subject TEXT NOT NULL,to_address TEXT NOT NULL,from_address TEXT NOT NULL,client_body TEXT NOT NULL,attached_name TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  this.sql.exec("CREATE INDEX IF NOT EXISTS idx_outlook_sent_job ON outlook_sent(proposal_id,created_at);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS project_inbound_emails (id INTEGER PRIMARY KEY AUTOINCREMENT,provider_id TEXT UNIQUE NOT NULL,proposal_id INTEGER NOT NULL,subject TEXT NOT NULL,from_address TEXT NOT NULL,to_addresses TEXT NOT NULL,text_body TEXT NOT NULL,received_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  this.sql.exec("CREATE INDEX IF NOT EXISTS idx_incoming_job ON project_inbound_emails(proposal_id,created_at);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS staff_drafts (user_id INTEGER PRIMARY KEY NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
  this.sql.exec("CREATE TABLE IF NOT EXISTS project_note_drafts (proposal_id INTEGER NOT NULL,user_id INTEGER NOT NULL,event_type TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(proposal_id,user_id));");
 }
 async fetch(request){
  try{
   const url=new URL(request.url);
   if(request.method==='GET'&&url.pathname==='/backup'){
     // Private DO-to-Worker streaming endpoint. Outer Worker permits owner only.
     // Exclude user passwords, login sessions, setup codes and authentication attempts.
     const exports=[
       ['users','SELECT id,email,name,role,active,created_at FROM users'],
       ['settings','SELECT name,config FROM settings'],
       ['proposals','SELECT * FROM proposals'],
       ['project_events','SELECT * FROM project_events'],
       ['project_files','SELECT * FROM project_files'],
       ['project_file_chunks','SELECT * FROM project_file_chunks'],
       ['project_note_drafts','SELECT * FROM project_note_drafts'],
       ['chase_reminders','SELECT * FROM chase_reminders'],
       ['staff_drafts','SELECT * FROM staff_drafts'],
       ['outlook_sent','SELECT * FROM outlook_sent'],
       ['project_inbound_emails','SELECT * FROM project_inbound_emails']
     ];
     const encoder=new TextEncoder(),store=this.sql;
     let tableIdx=-1,cursor=null,started=false;
     const stream=new ReadableStream({pull(controller){
       try{
         if(!started){started=true;controller.enqueue(encoder.encode(JSON.stringify({format:'mp-practice-archive-v1',createdAt:new Date().toISOString(),includesFiles:true,excludesCredentials:true})+'\\n'));return}
         while(true){
           if(!cursor){
             tableIdx++;
             if(tableIdx>=exports.length){controller.close();return}
             const [table,sql]=exports[tableIdx];
             cursor={table,iter:store.exec(sql)[Symbol.iterator]()};
           }
           const next=cursor.iter.next();
           if(next.done){cursor=null;continue}
           controller.enqueue(encoder.encode(JSON.stringify({table:cursor.table,row:next.value})+'\\n'));
           return;
         }
       }catch(err){controller.error(err)}
     }});
     return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'no-store'}});
   }
   if(request.method==='GET'&&url.pathname.startsWith('/file/')){
     const fileId=Number(url.pathname.slice(6));
     if(!Number.isInteger(fileId)||fileId<1)return new Response('Bad file ID',{status:400});
     // Called through the private DO binding, only AFTER the outer Worker checks
     // authenticated staff access to the parent project.
     const file=this.sql.exec("SELECT id,ready,storage_kind FROM project_files WHERE id=?",fileId).one();
     if(!file||!file.ready||file.storage_kind!=='chunked')return new Response('File not found',{status:404});
     const chunks=this.sql.exec('SELECT content_base64 FROM project_file_chunks WHERE file_id=? ORDER BY part',fileId).toArray();
     let i=0;return new Response(new ReadableStream({pull(controller){
       if(i>=chunks.length){controller.close();return}
       const raw=atob(chunks[i++].content_base64),bytes=new Uint8Array(raw.length);
       for(let j=0;j<raw.length;j++)bytes[j]=raw.charCodeAt(j);
       controller.enqueue(bytes);
     }}),{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
   }
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
// Cloudflare Workers production caps WebCrypto PBKDF2 at 100,000 iterations.
async function hashPassword(password, salt = randomHex(16)) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: encoder.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return `pbkdf2_sha256$100000$${salt}$${bytesToHex(derived)}`;
}
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [type, iterations, salt, target] = stored.split('$');
  if (type !== 'pbkdf2_sha256' || iterations !== '100000' || !salt || !target) return false;
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
  p.feeMode=['band','bespoke'].includes(p.feeMode)?p.feeMode:'sqm'; // Legacy saved quotations remain £/m².
  p.pricingBand=validBand(p.pricingBand)?p.pricingBand:'';
  if(p.feeMode==='band'&&!p.pricingBand)throw Object.assign(new Error('Select a pricing band before saving'),{status:400});
  if (!Array.isArray(p.stages) || p.stages.length > 20 || !Array.isArray(p.extras) || p.extras.length > 50) throw Object.assign(new Error('Invalid fee lines'), {status:400});
  if (!Array.isArray(p.adjustments) || p.adjustments.length > 50) throw Object.assign(new Error('Too many adjustments'), {status:400});
  const normalBandFees=s=>Object.fromEntries(BAND_IDS.map(band=>[band,limited(s.bandFees?.[band]??0,0,1000000)]));
  const quoted=s=>s.quotedFee===null||s.quotedFee===undefined||s.quotedFee===''?null:limited(s.quotedFee,0,1000000);
  p.stages = p.stages.map(s => ({...s,rate:limited(s.rate,0,5000),selected:!!s.selected,title:clean(s.title,180),scope:clean(s.scope,1500),bandFees:normalBandFees(s),quotedFee:quoted(s)}));
  p.extras = p.extras.map(s => ({...s,amount:limited(s.amount,0,1000000),selected:!!s.selected,title:clean(s.title,180),desc:clean(s.desc,1500),bandFees:normalBandFees(s),quotedFee:quoted(s)}));
  if(p.feeMode==='bespoke'&&[...p.stages,...p.extras].some(x=>x.selected&&x.quotedFee===null))throw Object.assign(new Error('Enter a bespoke fee for every selected service'),{status:400});
  p.adjustments = p.adjustments.map(s => ({kind:s.kind === 'omission'?'omission':'addition',description:clean(s.description,200),amount:limited(s.amount,0,1000000)}));
  // Large embedded logo data is kept client-side. Standard logo is served by this app.
  delete p.logo;
  return p;
}
export function calculateFee(payload,minArea=25){return calculateProfessionalFee(payload,minArea);}

const JOB_PHASES=['enquiry','proposal','appointed','survey','design','planning','building_regulations','construction','on_hold','completed'];
const EVENT_TYPES=['note','email','call','meeting','milestone','document','appointment','quotation','outcome'];
async function recordProjectEvent(db,id,user,type,body){
  await db.prepare('INSERT INTO project_events(proposal_id,event_type,body,created_by) VALUES(?,?,?,?)').bind(id,type,body,user.id).run();
}
function bytesFromBase64(data){
  const text=atob(data),result=new Uint8Array(text.length);
  for(let i=0;i<text.length;i++)result[i]=text.charCodeAt(i);
  return result;
}
function base64FromBytes(bytes){
  let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(value);
}
async function archiveIssuedQuotation(db,id,user,reference,bytes,method){
  if(!bytes||bytes.length<5||bytes.length>1024*1024)return false;
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const filename=reference+'_Issued_'+method+'_'+stamp+'.pdf';
  try{
    await db.prepare("INSERT INTO project_files(proposal_id,file_name,mime_type,kind,size_bytes,content_base64,uploaded_by) VALUES(?,?,?,?,?,?,?)")
      .bind(id,filename,'application/pdf','sent_proposal',bytes.length,base64FromBytes(bytes),user.id).run();
    return true;
  }catch(error){console.error('Fee proposal sent but PDF archive failed for '+reference,error);return false}
}
async function quoteRow(db, id, user) {
  const row = await db.prepare('SELECT id,reference,created_by,payload,fee_ex_vat,client_email,client,site_address,status,job_status,job_stage,agreed_fee_ex_vat,agreed_at,revision,lost_reason,next_action,next_action_due,chase_enabled,chase_started_at,chase_sent_count,created_at FROM proposals WHERE id=?').bind(id).first();
  if (!row) throw Object.assign(new Error('Quotation not found'), {status:404});
  return row;
}
function securityHeaders(r) {
  const headers=new Headers(r.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('X-Frame-Options','DENY');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  const mime=headers.get('Content-Type')||'';
  if(/text\/html|javascript|application\/json/.test(mime))headers.set('Cache-Control','private, no-store');
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
  if(path==='/api/outlook/status'&&method==='GET'){
    const connected=isOutlookConfigured(env)?await env.DB.prepare('SELECT mailbox,last_synced_at FROM outlook_connections WHERE user_id=?').bind(user.id).first():null;
    return appJSON({configured:isOutlookConfigured(env),connected:!!connected,mailbox:connected?.mailbox||null,lastSyncedAt:connected?.last_synced_at||null,
      outlookUrl:OUTLOOK_DASHBOARD,needsSetup:!isOutlookConfigured(env)});
  }
  if(path==='/api/outlook/start'&&method==='GET'){
    if(!isOutlookConfigured(env))return Response.redirect(new URL('/outlook?setup=required',req.url),302);
    const state=randomUrlToken(),verifier=randomUrlToken(48);
    await env.DB.prepare('DELETE FROM outlook_oauth_states WHERE expires_at<?').bind(new Date().toISOString()).run();
    await env.DB.prepare('INSERT INTO outlook_oauth_states(state,user_id,verifier,expires_at) VALUES(?,?,?,?)')
      .bind(state,user.id,verifier,new Date(Date.now()+10*60000).toISOString()).run();
    return Response.redirect(await outlookAuthorizeUrl(env,req.url,state,verifier),302);
  }
  if(path==='/api/outlook/callback'&&method==='GET'){
    const source=new URL(req.url),code=source.searchParams.get('code'),state=source.searchParams.get('state');
    const error=source.searchParams.get('error');
    if(error||!code||!state)return Response.redirect(new URL('/outlook?result=cancelled',req.url),302);
    const record=await env.DB.prepare('SELECT user_id,verifier,expires_at FROM outlook_oauth_states WHERE state=?').bind(state).first();
    if(!record||Number(record.user_id)!==Number(user.id)||record.expires_at<new Date().toISOString())
      return Response.redirect(new URL('/outlook?result=invalid-state',req.url),302);
    await env.DB.prepare('DELETE FROM outlook_oauth_states WHERE state=?').bind(state).run();
    const grant=await microsoftTokenRequest(env,{
      grant_type:'authorization_code',code,redirect_uri:redirectFor(req.url),code_verifier:record.verifier,scope:OUTLOOK_SCOPES
    });
    const me=await graphCall(grant.access_token,'/me?$select=id,mail,userPrincipalName,displayName');
    if(!me.ok)return appJSON({error:'Microsoft account profile could not be retrieved; check User.Read permission'},502);
    const profile=await me.json(),mailbox=String(profile.mail||profile.userPrincipalName||'').toLowerCase().trim();
    if(!validEmail(mailbox)||!profile.id)return appJSON({error:'Microsoft did not return a usable Outlook mailbox'},502);
    const expires=Date.now()+Number(grant.expires_in||3600)*1000;
    const secured=await encryptOutlookTokens(env,{access_token:grant.access_token,refresh_token:grant.refresh_token});
    await env.DB.prepare('INSERT INTO outlook_connections(user_id,account_id,mailbox,secret_cipher,expires_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET account_id=excluded.account_id,mailbox=excluded.mailbox,secret_cipher=excluded.secret_cipher,expires_at=excluded.expires_at,updated_at=CURRENT_TIMESTAMP')
      .bind(user.id,String(profile.id),mailbox,secured,expires).run();
    return Response.redirect(new URL('/outlook?result=connected',req.url),302);
  }
  if(path==='/api/outlook/disconnect'&&method==='POST'){
    const p=await req.json();if(p.confirm!==true)return appJSON({error:'Confirm Outlook disconnect'},400);
    await env.DB.prepare('DELETE FROM outlook_connections WHERE user_id=?').bind(user.id).run();
    return appJSON({ok:true,disconnected:true});
  }
  if(path==='/api/outlook/sync'&&method==='POST'){
    if(!isOutlookConfigured(env))return appJSON({error:'Microsoft 365 Outlook is not configured for this app'},503);
    const result=await syncOutlookInbox(env,user.id,recordProjectEvent);
    return appJSON({ok:true,...result});
  }
  if(path==='/api/my-draft'&&method==='GET'){
    const saved=await env.DB.prepare('SELECT payload,updated_at FROM staff_drafts WHERE user_id=?').bind(user.id).first();
    return appJSON({draft:saved?JSON.parse(saved.payload):null,updatedAt:saved?.updated_at||null});
  }
  if(path==='/api/my-draft'&&method==='POST'){
    const p=await req.json();
    if(p.clear===true){await env.DB.prepare('DELETE FROM staff_drafts WHERE user_id=?').bind(user.id).run();return appJSON({ok:true,cleared:true})}
    if(!p.data||typeof p.data!=='object')return appJSON({error:'Invalid draft'},400);
    const copy={...p.data};delete copy.logo;delete copy.officeEmail;
    const content=JSON.stringify(copy);
    if(content.length>150000)return appJSON({error:'Draft is too large'},413);
    await env.DB.prepare('INSERT INTO staff_drafts(user_id,payload) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload,updated_at=CURRENT_TIMESTAMP').bind(user.id,content).run();
    return appJSON({ok:true});
  }
  if (path==='/api/pricing' && method==='GET') {
    const r=await env.DB.prepare('SELECT config FROM settings WHERE name=?').bind('pricing').first();
    // Older owner records have empty fee arrays; recover all current services,
    // without overwriting any rates the owner already saved.
    const pricing=resolvePricingDefaults(r?JSON.parse(r.config):null);
    return appJSON({pricing,defaults:makePricingDefaults()});
  }
  if (path==='/api/pricing' && method==='POST') {
    mustUser(user,'owner');
    const p=await req.json();
    if(!p||typeof p!=='object'||!Array.isArray(p.stages)||!Array.isArray(p.extras))
      return appJSON({error:'All architectural fee sections must be loaded before saving'},400);
    const resolved=resolvePricingDefaults(p);
    const pricing={
      ...resolved,
      buildRate:limited(p.buildRate,0,30000),
      buildVatRate:limited(p.buildVatRate,0,30),
      feeVatRate:limited(p.feeVatRate,0,30),
      contingency:limited(p.contingency??resolved.contingency,0,100),
      validDays:limited(p.validDays??resolved.validDays,1,365),
      minimumArea:25
    };
    await env.DB.prepare('INSERT INTO settings(name,config) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET config=excluded.config').bind('pricing',JSON.stringify(pricing)).run();
    return appJSON({ok:true,pricing});
  }
  if(path==='/api/proposals' && method==='GET'){
    const rows=await env.DB.prepare('SELECT id,reference,client,site_address,fee_ex_vat,updated_at,payload,status,job_status,job_stage,agreed_fee_ex_vat,agreed_at,revision,lost_reason,next_action,next_action_due,chase_enabled,chase_started_at,chase_sent_count FROM proposals ORDER BY id DESC LIMIT 500').all();
    return appJSON({projects:rows.results.map(r=>({id:r.id,key:r.reference+'::'+r.client,reference:r.reference,name:JSON.parse(r.payload).projectName||r.client,fee:Number(r.fee_ex_vat),updatedAt:r.updated_at,data:{...JSON.parse(r.payload),reference:r.reference},status:r.status,jobStatus:r.job_status||"pending",jobStage:r.job_stage||"enquiry",agreedFee:r.agreed_fee_ex_vat,agreedAt:r.agreed_at,revision:r.revision,lostReason:r.lost_reason||'',nextAction:r.next_action||'',nextActionDue:r.next_action_due||'',chaseEnabled:!!r.chase_enabled,chaseCount:Number(r.chase_sent_count||0),chaseStartedAt:r.chase_started_at||null,nextChaseAt:r.chase_enabled?nextChaseDate(r.chase_started_at,Number(r.chase_sent_count||0))?.toISOString()||null:null}))});
  }
  if(path==='/api/proposals' && method==='POST'){
    const p=await req.json(); const data=safePayload(p.data);
    const fee=calculateFee(data,25);
    let id=Number(p.id)||null;
    if(id){const row=await quoteRow(env.DB,id,user);if(row.status==='sent' && user.role!=='owner')return appJSON({error:'Issued proposals can be amended by the owner only'},403);
      if(Number(p.revision)!==Number(row.revision))return appJSON({error:'This job was updated in another login. Reopen it from Saved Projects before editing to avoid overwriting your colleague.'},409);
      const update=await env.DB.prepare('UPDATE proposals SET payload=?,fee_ex_vat=?,client=?,client_email=?,site_address=?,status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(JSON.stringify(data),fee,data.client,data.clientEmail,data.address,'draft',id,row.revision).run();
      if(!update.meta?.changes)return appJSON({error:'Another staff member saved this project. Reload it before editing.'},409);
      if(p.silent!==true)await recordProjectEvent(env.DB,id,user,'quotation','Quotation revised and saved');
      return appJSON({ok:true,id,reference:row.reference,fee,revision:Number(row.revision)+1});
    }
    const added=await env.DB.prepare('INSERT INTO proposals(created_by,payload,fee_ex_vat,client,client_email,site_address,status) VALUES(?,?,?,?,?,?,?)').bind(user.id,JSON.stringify(data),fee,data.client,data.clientEmail,data.address,'draft').run();
    id=added.meta.last_row_id; const reference=refFor(id,new Date().toISOString());
    await env.DB.prepare('UPDATE proposals SET reference=? WHERE id=?').bind(reference,id).run();
    await recordProjectEvent(env.DB,id,user,'quotation',p.silent===true?'Initial quotation autosaved':'Initial quotation saved');
    return appJSON({ok:true,id,reference,fee,revision:1});
  }
  const workspacePath=path.match(/^\/api\/proposals\/(\d+)\/(workspace|events|files|file-start|file-chunk|file-finish|stage|accept|note-draft|follow-up|chase-control|chase-complete|chase-send)(?:\/(\d+))?$/);
  if(workspacePath){
    const id=Number(workspacePath[1]),action=workspacePath[2],fileId=Number(workspacePath[3]);
    const row=await quoteRow(env.DB,id,user);
    if(method==='GET'&&action==='workspace'){
      const events=await env.DB.prepare('SELECT e.id,e.event_type,e.body,e.occurred_at,e.created_at,u.name AS author FROM project_events e LEFT JOIN users u ON u.id=e.created_by WHERE e.proposal_id=? ORDER BY e.id DESC LIMIT 500').bind(id).all();
      const docs=await env.DB.prepare('SELECT id,file_name,mime_type,kind,size_bytes,created_at FROM project_files WHERE proposal_id=? AND ready=1 ORDER BY id DESC LIMIT 300').bind(id).all();
      const noteDraft=await env.DB.prepare('SELECT event_type,body,updated_at FROM project_note_drafts WHERE proposal_id=? AND user_id=?').bind(id,user.id).first();
      const chases=await env.DB.prepare('SELECT round,status,sent_at,completed_at,completion_note,email_id,client_email_id FROM chase_reminders WHERE proposal_id=? ORDER BY round').bind(id).all();
      return appJSON({project:{id,reference:row.reference,client:row.client,clientEmail:row.client_email,clientPhone:String(JSON.parse(row.payload).clientPhone||''),revision:row.revision,address:row.site_address,status:row.status,jobStatus:row.job_status||'pending',jobStage:row.job_stage||'enquiry',fee:Number(row.fee_ex_vat),agreedFee:row.agreed_fee_ex_vat,agreedAt:row.agreed_at,lostReason:row.lost_reason||'',nextAction:row.next_action||'',nextActionDue:row.next_action_due||'',chaseEnabled:!!row.chase_enabled,chaseCount:Number(row.chase_sent_count||0),chaseStartedAt:row.chase_started_at||null,nextChaseAt:row.chase_enabled?nextChaseDate(row.chase_started_at,Number(row.chase_sent_count||0))?.toISOString()||null:null,createdAt:row.created_at},events:events.results,files:docs.results,chases:chases.results,phases:JOB_PHASES,noteDraft,emailConfigured:!!(env.RESEND_API_KEY&&env.MAIL_FROM)});
    }
    if(method==='POST'&&action==='note-draft'){
      const p=await req.json();
      if(p.clear===true){await env.DB.prepare('DELETE FROM project_note_drafts WHERE proposal_id=? AND user_id=?').bind(id,user.id).run();return appJSON({ok:true})}
      const type=['note','email','call','meeting','milestone','appointment'].includes(p.type)?p.type:'note';
      const body=String(p.body||'');
      if(body.length>4000)return appJSON({error:'Note draft too long'},413);
      await env.DB.prepare('INSERT INTO project_note_drafts(proposal_id,user_id,event_type,body) VALUES(?,?,?,?) ON CONFLICT(proposal_id,user_id) DO UPDATE SET event_type=excluded.event_type,body=excluded.body,updated_at=CURRENT_TIMESTAMP')
        .bind(id,user.id,type,body).run();return appJSON({ok:true});
    }
    if(method==='POST'&&action==='events'){
      const p=await req.json(),type=String(p.type||'note');
      if(!EVENT_TYPES.includes(type)||['quotation','outcome'].includes(type))return appJSON({error:'Invalid activity type'},400);
      const body=String(p.body||'').trim();
      if(!body||body.length>4000)return appJSON({error:'Enter an activity note up to 4,000 characters'},400);
      await recordProjectEvent(env.DB,id,user,type,body);
      await env.DB.prepare('DELETE FROM project_note_drafts WHERE proposal_id=? AND user_id=?').bind(id,user.id).run();
      return appJSON({ok:true});
    }
    if(method==='POST'&&action==='chase-control'){
      const p=await req.json();
      if(p.markSent===true){
        if(row.job_status!=='pending')return appJSON({error:'Only Pending quotations may be enrolled for chasing'},409);
        await env.DB.prepare("UPDATE proposals SET status='sent',chase_enabled=1,chase_started_at=COALESCE(chase_started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
        await recordProjectEvent(env.DB,id,user,'email','Team confirmed that this proposal has been issued to the client. Three weekly OFFICE reminders started.');
        return appJSON({ok:true,chaseEnabled:true});
      }
      if(typeof p.enabled!=='boolean')return appJSON({error:'Specify enabled true or false'},400);
      if(p.enabled&&(!row.chase_started_at||row.status!=='sent'))return appJSON({error:'Mark quotation as sent to start office chase reminders'},409);
      if(row.job_status!=='pending'&&p.enabled)return appJSON({error:'Won/Lost jobs do not receive chase reminders'},409);
      await env.DB.prepare('UPDATE proposals SET chase_enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.enabled?1:0,id).run();
      await recordProjectEvent(env.DB,id,user,'milestone','Office quotation reminder sequence '+(p.enabled?'resumed':'paused'));
      return appJSON({ok:true,chaseEnabled:p.enabled});
    }
    if(method==='POST'&&action==='chase-complete'){
      const p=await req.json(),round=Number(p.round);
      if(!Number.isInteger(round)||round<1||round>3)return appJSON({error:'Choose chase reminder 1, 2 or 3'},400);
      const record=await env.DB.prepare('SELECT round,status,completed_at FROM chase_reminders WHERE proposal_id=? AND round=?').bind(id,round).first();
      if(!record||record.status!=='sent')return appJSON({error:'That office reminder has not been sent yet'},409);
      if(record.completed_at)return appJSON({error:'This chase has already been recorded as completed'},409);
      const note=String(p.note||'').trim();
      if(note.length<8||note.length>2000)return appJSON({error:'Describe how the client was contacted (8–2000 characters)'},400);
      await env.DB.prepare('UPDATE chase_reminders SET completed_at=CURRENT_TIMESTAMP,completed_by=?,completion_note=? WHERE proposal_id=? AND round=? AND completed_at IS NULL').bind(user.id,note,id,round).run();
      await recordProjectEvent(env.DB,id,user,'email','Weekly chase '+round+'/3 COMPLETED by staff: '+note);
      return appJSON({ok:true,round,recorded:true,note:'If this email was sent outside the platform, upload the actual .eml/.msg copy to the Job File to retain evidence.'});
    }
    if(method==='POST'&&action==='chase-send'){
      const p=await req.json(),round=Number(p.round);
      if(!Number.isInteger(round)||round<1||round>3)return appJSON({error:'Invalid reminder round'},400);
      if(row.job_status!=='pending')return appJSON({error:'This quotation is no longer pending'},409);
      if(!env.RESEND_API_KEY||!env.MAIL_FROM)return appJSON({error:'Automatic email not configured. Prepare the email in your mail app, then record the chase and upload the sent message.'},503);
      const record=await env.DB.prepare('SELECT status,completed_at,client_email_id FROM chase_reminders WHERE proposal_id=? AND round=?').bind(id,round).first();
      if(!record||record.status!=='sent')return appJSON({error:'The office reminder for this round has not been sent yet'},409);
      if(record.completed_at||record.client_email_id)return appJSON({error:'This chase has already been completed or emailed to the client'},409);
      if(p.confirm!==true)return appJSON({error:'Confirm before sending an email to the client'},400);
      if(!validEmail(row.client_email))return appJSON({error:'Client email address is invalid'},400);
      const mail={from:env.MAIL_FROM,to:[row.client_email],bcc:[OWNER_EMAIL],
        subject:'Follow-up: architectural fee proposal '+row.reference,
        text:clientChaseBody(row)};
      const res=await fetch('https://api.resend.com/emails',{method:'POST',
        headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'mp-client-chase-'+id+'-'+round},
        body:JSON.stringify(mail)});
      const sent=await res.json().catch(()=>({}));
      if(!res.ok||!sent.id)return appJSON({error:'Client chase email could not be sent: '+clean(sent.message||res.status,180)},502);
      await env.DB.prepare("UPDATE chase_reminders SET client_email_id=?,completed_at=CURRENT_TIMESTAMP,completed_by=?,completion_note=? WHERE proposal_id=? AND round=? AND completed_at IS NULL").bind(sent.id,user.id,'Chase email sent via the platform, BCC to '+OWNER_EMAIL,id,round).run();
      await recordProjectEvent(env.DB,id,user,'email','Client chase '+round+'/3 SENT via platform to '+row.client_email+' (BCC '+OWNER_EMAIL+'). Message ID: '+sent.id+'. Subject: '+mail.subject+'\\n'+mail.text);
      return appJSON({ok:true,round,emailId:sent.id,to:row.client_email,officeCopy:OWNER_EMAIL});
    }
    if(method==='POST'&&action==='follow-up'){
      const p=await req.json();
      const note=String(p.nextAction||'').trim();
      const due=String(p.nextActionDue||'').trim();
      if(note.length>500)return appJSON({error:'Next action must be under 500 characters'},400);
      if(due&&!/^\d{4}-\d{2}-\d{2}$/.test(due))return appJSON({error:'Enter the due date as YYYY-MM-DD'},400);
      if(due&&!note)return appJSON({error:'Enter an action before assigning a due date'},400);
      const changed=note!==(row.next_action||'')||due!==(row.next_action_due||'');
      await env.DB.prepare('UPDATE proposals SET next_action=?,next_action_due=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(note,due,id).run();
      if(changed)await recordProjectEvent(env.DB,id,user,'milestone',note?'Next action: '+note+(due?' (due '+due+')':''):'Next action cleared');
      return appJSON({ok:true,nextAction:note,nextActionDue:due});
    }
    if(method==='POST'&&action==='stage'){
      const p=await req.json();
      if(!JOB_PHASES.includes(p.stage))return appJSON({error:'Select a valid project stage'},400);
      if(row.job_status!=='won'&& !['enquiry','proposal','on_hold'].includes(p.stage))return appJSON({error:'Mark the job as Won before advancing to project delivery'},409);
      await env.DB.prepare('UPDATE proposals SET job_stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(p.stage,id).run();
      await recordProjectEvent(env.DB,id,user,'milestone','Project stage changed to '+p.stage.replaceAll('_',' '));
      return appJSON({ok:true,stage:p.stage});
    }
    if(method==='POST'&&action==='accept'){
      if(row.job_status!=='won')return appJSON({error:'Mark this job Won before recording the agreed proposal'},409);
      if(row.agreed_at)return appJSON({error:'An agreed proposal is already archived. Retain it as the historical agreement.'},409);
      const pdf=await proposalPdf(row);
      const encoded=base64FromBytes(pdf);
      await env.DB.prepare("INSERT INTO project_files(proposal_id,file_name,mime_type,kind,size_bytes,content_base64,uploaded_by) VALUES(?,?,?,?,?,?,?)")
        .bind(id,row.reference+'_Agreed_Fee_Proposal.pdf','application/pdf','agreed_proposal',pdf.byteLength,encoded,user.id).run();
      await env.DB.prepare('UPDATE proposals SET agreed_fee_ex_vat=?,agreed_at=CURRENT_TIMESTAMP,job_stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(row.fee_ex_vat,'appointed',id).run();
      await recordProjectEvent(env.DB,id,user,'appointment','Agreed fee proposal archived at '+Number(row.fee_ex_vat).toFixed(2)+' GBP excluding VAT; this PDF is an immutable record.');
      return appJSON({ok:true,agreedFee:row.fee_ex_vat});
    }
    if(method==='POST'&&action==='file-start'){
      const p=await req.json();
      const fileName=String(p.fileName||'').trim().replace(/[\/\\\x00-\x1f\x7f]/g,'_').slice(0,150);
      const ext=fileName.toLowerCase().split('.').pop();
      const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',eml:'message/rfc822',
        msg:'application/vnd.ms-outlook',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
        dwg:'application/acad',dxf:'application/dxf',ifc:'application/octet-stream',zip:'application/zip'};
      const kind=['document','email','signed_agreement','site_photo','drawing','report'].includes(p.kind)?p.kind:'document';
      const size=Number(p.sizeBytes);
      if(!fileName||!types[ext])return appJSON({error:'Select a supported PDF, Office, email, image, drawing or ZIP file'},400);
      if(!Number.isInteger(size)||size<1||size>25*1024*1024)return appJSON({error:'Maximum individual file size is currently 25 MB'},413);
      const capacity=await env.DB.prepare('SELECT COALESCE(SUM(size_bytes),0) AS bytes FROM project_files WHERE proposal_id=?').bind(id).first();
      if(Number(capacity?.bytes||0)+size>200*1024*1024)return appJSON({error:'This project has reached the 200 MB document storage safeguard'},413);
      const inserted=await env.DB.prepare("INSERT INTO project_files(proposal_id,file_name,mime_type,kind,size_bytes,content_base64,uploaded_by,storage_kind,ready) VALUES(?,?,?,?,?,'',?,'chunked',0)")
        .bind(id,fileName,types[ext],kind,size,user.id).run();
      return appJSON({ok:true,fileId:inserted.meta.last_row_id,partBytes:262144,totalParts:Math.ceil(size/262144)});
    }
    if(method==='POST'&&action==='file-chunk'){
      const p=await req.json(),fileId=Number(p.fileId),part=Number(p.part),encoded=String(p.contentBase64||'');
      const doc=await env.DB.prepare('SELECT size_bytes,storage_kind,ready,uploaded_by FROM project_files WHERE id=? AND proposal_id=?').bind(fileId,id).first();
      if(!doc||doc.storage_kind!=='chunked'||doc.ready||Number(doc.uploaded_by)!==Number(user.id))return appJSON({error:'Upload session not found or completed'},404);
      const expectedCount=Math.ceil(doc.size_bytes/262144);
      if(!Number.isInteger(part)||part<0||part>=expectedCount)return appJSON({error:'Invalid file part index'},400);
      if(!/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)||encoded.length>360000)return appJSON({error:'Invalid upload chunk'},400);
      let decoded;try{decoded=bytesFromBase64(encoded)}catch{return appJSON({error:'Invalid base64 chunk'},400)}
      const expected=part===expectedCount-1?doc.size_bytes-part*262144:262144;
      if(decoded.length!==expected)return appJSON({error:'Upload chunk has an unexpected size'},400);
      await env.DB.prepare('INSERT INTO project_file_chunks(file_id,part,content_base64,raw_bytes) VALUES(?,?,?,?) ON CONFLICT(file_id,part) DO UPDATE SET content_base64=excluded.content_base64,raw_bytes=excluded.raw_bytes')
        .bind(fileId,part,encoded,decoded.length).run();
      return appJSON({ok:true,part});
    }
    if(method==='POST'&&action==='file-finish'){
      const p=await req.json(),fileId=Number(p.fileId);
      const doc=await env.DB.prepare('SELECT size_bytes,ready,storage_kind,uploaded_by,file_name,kind FROM project_files WHERE id=? AND proposal_id=?').bind(fileId,id).first();
      if(!doc||doc.ready||doc.storage_kind!=='chunked'||Number(doc.uploaded_by)!==Number(user.id))return appJSON({error:'Upload session not available'},409);
      const stats=await env.DB.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(raw_bytes),0) AS bytes FROM project_file_chunks WHERE file_id=?').bind(fileId).first();
      if(Number(stats.n)!==Math.ceil(doc.size_bytes/262144)||Number(stats.bytes)!==doc.size_bytes)return appJSON({error:'Some file parts are missing; please retry'},409);
      await env.DB.prepare('UPDATE project_files SET ready=1 WHERE id=? AND proposal_id=? AND ready=0').bind(fileId,id).run();
      await recordProjectEvent(env.DB,id,user,'document','Uploaded '+doc.kind.replaceAll('_',' ')+': '+doc.file_name+' ('+Math.ceil(doc.size_bytes/1024)+' KB)');
      return appJSON({ok:true,fileId,name:doc.file_name,size:doc.size_bytes});
    }
    if(method==='POST'&&action==='files'){
      const p=await req.json();
      const fileName=String(p.fileName||'').trim().replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,150);
      const kind=['document','email','signed_agreement','site_photo','drawing','report'].includes(p.kind)?p.kind:'document';
      const data=String(p.contentBase64||'');
      if(!fileName||!/^[a-zA-Z0-9+/_=]+$/.test(data)||data.length>1500000)return appJSON({error:'Choose a supported file under 1 MB'},413);
      const ext=fileName.toLowerCase().split('.').pop();
      if(!['pdf','docx','xlsx','eml','msg','txt','png','jpg','jpeg'].includes(ext))return appJSON({error:'Upload PDF, Word, Excel, EML, MSG, TXT or image files'},400);
      const bytes=bytesFromBase64(data);
      if(bytes.length===0||bytes.length>1048576)return appJSON({error:'Files must be under 1 MB each'},413);
      const mimeByExt={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',eml:'message/rfc822',msg:'application/vnd.ms-outlook',txt:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
      await env.DB.prepare('INSERT INTO project_files(proposal_id,file_name,mime_type,kind,size_bytes,content_base64,uploaded_by) VALUES(?,?,?,?,?,?,?)')
        .bind(id,fileName,mimeByExt[ext],kind,bytes.length,data,user.id).run();
      await recordProjectEvent(env.DB,id,user,'document','Uploaded '+kind.replaceAll('_',' ')+': '+fileName);
      return appJSON({ok:true,name:fileName,size:bytes.length});
    }
    if(method==='GET'&&action==='files'&&fileId){
      const doc=await env.DB.prepare('SELECT file_name,mime_type,content_base64,storage_kind,ready FROM project_files WHERE id=? AND proposal_id=? AND ready=1').bind(fileId,id).first();
      if(!doc)return appJSON({error:'Document not found'},404);
      if(doc.storage_kind==='chunked'){
        const privateStore=env.MP_DATA.get(env.MP_DATA.idFromName('practice'));
        const stream=await privateStore.fetch('https://mp-store.internal/file/'+fileId);
        if(!stream.ok)return appJSON({error:'Unable to read stored file'},502);
        return new Response(stream.body,{headers:{
          'Content-Type':'application/octet-stream',
          'Content-Disposition':'attachment; filename="'+doc.file_name.replace(/["\r\n]/g,'_')+'"',
          'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox'
        }});
      }
      return new Response(bytesFromBase64(doc.content_base64),{headers:{
        'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+doc.file_name.replace(/["\r\n]/g,'_')+'"',
        'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff',
        'Content-Security-Policy':"sandbox"
      }});
    }
    return appJSON({error:'Unsupported job action'},405);
  }
  const proposal=path.match(/^\/api\/proposals\/(\d+)(?:\/(send|outlook-send|delivery-log|delete|status|pdf))?$/);
  if (proposal) {
    const id=Number(proposal[1]);const action=proposal[2];const row=await quoteRow(env.DB,id,user);
    if(method==='GET'&&!action)return appJSON({proposal:{id:row.id,reference:row.reference,data:{...JSON.parse(row.payload),reference:row.reference},status:row.status,jobStatus:row.job_status||"pending",jobStage:row.job_stage||"enquiry",agreedFee:row.agreed_fee_ex_vat,agreedAt:row.agreed_at,revision:row.revision,lostReason:row.lost_reason||'',nextAction:row.next_action||'',nextActionDue:row.next_action_due||''}});
    if(method==='POST'&&action==='status'){
      const input=await req.json();
      if(!['pending','won','lost'].includes(input.jobStatus))return appJSON({error:'Select Pending, Won or Lost'},400);
      const stage=input.jobStatus==='won'&&row.job_status!=='won'?'appointed':row.job_stage||'enquiry';
      const reason=input.jobStatus==='lost'?String(input.lostReason||'').trim().slice(0,500):'';
      await env.DB.prepare('UPDATE proposals SET job_status=?,job_stage=?,lost_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(input.jobStatus,stage,reason,id).run();
      if(row.job_status!==input.jobStatus|| (input.jobStatus==='lost'&&reason!==row.lost_reason))
        await recordProjectEvent(env.DB,id,user,'outcome','Job marked '+input.jobStatus.toUpperCase()+(reason?'. Reason: '+reason:''));
      return appJSON({ok:true,id,jobStatus:input.jobStatus,jobStage:stage});
    }
    if(method==='POST'&&action==='delete'){
      mustUser(user,'owner');
      const p=await req.json();const account=await env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first();
      if(!await verifyPassword(String(p.password||''),account.password_hash))return appJSON({error:'Password confirmation failed'},403);
      await env.DB.prepare('DELETE FROM project_events WHERE proposal_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM project_file_chunks WHERE file_id IN (SELECT id FROM project_files WHERE proposal_id=?)').bind(id).run();
      await env.DB.prepare('DELETE FROM project_files WHERE proposal_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM project_note_drafts WHERE proposal_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM chase_reminders WHERE proposal_id=?').bind(id).run();
      await env.DB.prepare('DELETE FROM proposals WHERE id=?').bind(id).run();return appJSON({ok:true});
    }
    if(method==='GET'&&action==='pdf'){
      const bytes=await proposalPdf(row);
      return new Response(bytes,{status:200,headers:{
        'Content-Type':'application/pdf',
        'Content-Disposition':'attachment; filename="'+row.reference+'_Fee_Proposal.pdf"',
        'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff'
      }});
    }
    if(method==='POST'&&action==='delivery-log'){
      const input=await req.json();
      if(input.confirm!==true)return appJSON({error:'Confirm that the client has actually been sent the quotation'},400);
      if(!Number.isInteger(Number(input.revision))||Number(input.revision)!==Number(row.revision))
        return appJSON({error:'This quotation was revised since the PDF was prepared. Reopen the job and prepare the latest PDF before confirming it sent.'},409);
      const medium=String(input.medium||'');
      if(!['whatsapp','outlook','email','other'].includes(medium))return appJSON({error:'Select the actual sending method'},400);
      if(row.job_status==='lost')return appJSON({error:'The job is Lost. Reopen it before recording a fresh client quotation.'},409);
      const target=medium==='whatsapp'?String(JSON.parse(row.payload).clientPhone||''):row.client_email;
      const pdf=await proposalPdf(row);
      if(pdf.length>1024*1024)return appJSON({error:'Quotation is larger than the project snapshot limit. Download and archive the PDF separately.'},413);
      const name=row.reference+'_Issued_'+medium+'_'+new Date().toISOString().slice(0,10)+'.pdf';
      await env.DB.prepare("INSERT INTO project_files(proposal_id,file_name,mime_type,kind,size_bytes,content_base64,uploaded_by) VALUES(?,?,?,?,?,?,?)")
        .bind(id,name,'application/pdf','sent_proposal',pdf.length,base64FromBytes(pdf),user.id).run();
      await env.DB.prepare("UPDATE proposals SET status='sent',chase_enabled=CASE WHEN job_status='pending' THEN 1 ELSE 0 END,chase_started_at=COALESCE(chase_started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();
      const note='MANUALLY CONFIRMED by '+user.name+': quotation '+row.reference+' shared by '+medium.toUpperCase()+
        ' with '+target+'. Branded PDF snapshot '+name+' archived on the job. Client delivery is based on staff confirmation, NOT verified by the provider.';
      await recordProjectEvent(env.DB,id,user,'email',note);
      return appJSON({ok:true,id,reference:row.reference,medium,snapshot:name,message:'Manual confirmation recorded. PDF archived on the project, with the date and staff member.'});
    }
    if(method==='POST'&&action==='outlook-send'){
      if(!isOutlookConfigured(env))return appJSON({error:'Microsoft 365 Outlook is not connected to this app. Open Outlook Settings to connect, or use Share PDF to Outlook.'},503);
      const input=await req.json();
      if(input.confirm!==true)return appJSON({error:'Confirm before emailing a client'},400);
      if(!validEmail(row.client_email))return appJSON({error:'Client email address is invalid'},400);
      const recently=await env.DB.prepare("SELECT id FROM outlook_sent WHERE proposal_id=? AND user_id=? AND created_at>datetime('now','-60 seconds') ORDER BY id DESC LIMIT 1").bind(id,user.id).first();
      if(recently)return appJSON({error:'This quotation was sent with Outlook in the last minute. Please check Sent Items before sending again.'},409);
      const outlook=await activeOutlookAccount(env,user.id);
      if(!outlook)return appJSON({error:'Connect your Outlook account first, then retry.'},409);
      const pdf=await proposalPdf(row);
      if(pdf.byteLength>2.75*1024*1024)return appJSON({error:'The quotation PDF exceeds the direct Microsoft Graph attachment size. Use Share PDF to Outlook instead.'},413);
      const outgoing=outlookEmailMessage(row,base64FromBytes(pdf),OWNER_EMAIL,outlook.row.mailbox);
      const request=await graphCall(outlook.accessToken,'/me/sendMail',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(outgoing.payload)
      });
      if(request.status!==202){
        const detail=await request.json().catch(()=>({}));
        return appJSON({error:'Microsoft Outlook could not accept the email ('+request.status+'). '+clean(detail.error?.message||'',180)},502);
      }
      const archived=await archiveIssuedQuotation(env.DB,id,user,row.reference,pdf,'Outlook');
      await env.DB.prepare('INSERT INTO outlook_sent(proposal_id,user_id,subject,to_address,from_address,client_body,attached_name) VALUES(?,?,?,?,?,?,?)')
        .bind(id,user.id,outgoing.subject,row.client_email,outlook.row.mailbox,outgoing.text,row.reference+'_Fee_Proposal.pdf').run();
      await env.DB.prepare("UPDATE proposals SET status='sent',chase_enabled=1,chase_started_at=COALESCE(chase_started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(id).run();
      const copy=outlook.row.mailbox.toLowerCase()===OWNER_EMAIL.toLowerCase()?'saved in office Outlook Sent Items':'office BCC '+OWNER_EMAIL;
      await recordProjectEvent(env.DB,id,user,'email','OUTLOOK ACCEPTED client quotation PDF attachment: '+row.reference+'_Fee_Proposal.pdf; from '+outlook.row.mailbox+'; to '+row.client_email+'; '+copy+'; subject '+outgoing.subject+'\n'+outgoing.text);
      return appJSON({ok:true,accepted:true,provider:'Microsoft Outlook',sender:outlook.row.mailbox,to:row.client_email,
        attached:row.reference+'_Fee_Proposal.pdf',subject:outgoing.subject,officeCopy:copy,outlookUrl:OUTLOOK_DASHBOARD,
        archived, note:'Microsoft Graph accepted the email. Delivery is not guaranteed until confirmed by Outlook.'});
    }
    if(method==='POST'&&action==='send'){
      if(!env.RESEND_API_KEY || !env.MAIL_FROM)return appJSON({error:'Automatic email not configured. Download and attach the PDF to the prepared email draft instead.'},503);
      const p=await req.json();if(p.confirm!==true)return appJSON({error:'Please confirm sending'},400);
      if(!validEmail(row.client_email))return appJSON({error:'Client email invalid'},400);
      const subject='Mitchell Proctor Architects | Fee proposal '+row.reference+' | '+String(row.site_address).slice(0,75);
      const bytes=await proposalPdf(row);
      // Resend requires base64 attachment content. Convert safe-sized chunks, no client-supplied attachments.
      const chunks=[];for(let off=0;off<bytes.length;off+=8192)chunks.push(String.fromCharCode(...bytes.subarray(off,off+8192)));
      const pdfBase64=btoa(chunks.join(''));
      const body='Dear '+row.client+',\n\nPlease find attached our architectural fee proposal for '+row.site_address+', including the fee breakdown, staged payment schedule and client acceptance form.\n\nKind regards,\nMitchell Proctor Architects\n01246 203196';
      const mail={from:env.MAIL_FROM,to:[row.client_email],bcc:[OWNER_EMAIL],subject,text:body,attachments:[{filename:row.reference+'_Fee_Proposal.pdf',content:pdfBase64,content_type:'application/pdf'}]};
      const remote=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(mail)});
      const sent=await remote.json().catch(()=>({}));
      if(!remote.ok||!sent.id)return appJSON({error:'Mail service rejected send: '+clean(sent.message||remote.status,220)},502);
      const archived=await archiveIssuedQuotation(env.DB,id,user,row.reference,bytes,'PracticeEmail');
      await env.DB.prepare("UPDATE proposals SET status='sent',last_email_id=?,chase_enabled=1,chase_started_at=COALESCE(chase_started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sent.id,id).run();
      await recordProjectEvent(env.DB,id,user,'email','Practice email service ACCEPTED PDF proposal '+row.reference+' to '+row.client_email+'; BCC '+OWNER_EMAIL+'. Message ID '+clean(sent.id,80)+'. Subject: '+subject+'\\n'+body);
      return appJSON({ok:true,messageId:sent.id,subject,recipient:row.client_email,office:OWNER_EMAIL,archived});
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
  if(path==='/api/owner/backup'&&method==='GET'){
    mustUser(user,'owner');
    const stub=env.MP_DATA.get(env.MP_DATA.idFromName('practice'));
    const snapshot=await stub.fetch('https://mp-store.internal/backup');
    if(!snapshot.ok)return appJSON({error:'Could not export practice backup'},502);
    return new Response(snapshot.body,{headers:{
      'Content-Type':'application/x-ndjson',
      'Cache-Control':'private,no-store',
      'Content-Disposition':'attachment; filename="mitchell-proctor-archive.jsonl"',
      'X-Content-Type-Options':'nosniff'
    }});
  }
  if(path==='/api/owner/email-test'&&method==='POST'){
    mustUser(user,'owner');
    const p=await req.json();
    if(p.confirm!==true)return appJSON({error:'Confirm the test email to the practice inbox'},400);
    if(!env.RESEND_API_KEY||!env.MAIL_FROM)return appJSON({error:'Email sender is not configured in Cloudflare. Connect the verified sender domain and Resend API key first.'},503);
    const message={from:env.MAIL_FROM,to:[OWNER_EMAIL],
      subject:'Mitchell Proctor - secure email delivery test',
      text:'Mitchell Proctor Architects email connectivity test.\\n\\nIf this message arrives in enquiries@ukestimates.com, the application can send office notifications.\\nThis email was initiated by the practice owner; no client has been contacted.\\n\\nOpen your Owner Dashboard to confirm connection.'};
    const remote=await fetch('https://api.resend.com/emails',{method:'POST',
      headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'mp-owner-test-'+randomHex(12)},
      body:JSON.stringify(message)});
    const data=await remote.json().catch(()=>({}));
    if(!remote.ok||!data.id)return appJSON({error:'Email provider did not accept the test: '+clean(data.message||remote.status,170)},502);
    await env.DB.prepare('INSERT INTO settings(name,config) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET config=excluded.config')
      .bind('last_email_test',JSON.stringify({to:OWNER_EMAIL,messageId:data.id,submittedAt:new Date().toISOString()})).run();
    return appJSON({ok:true,recipient:OWNER_EMAIL,messageId:data.id,details:'Accepted by Resend; check the inbox to confirm delivery.'});
  }
  if(path==='/api/status'&&method==='GET') return appJSON({emailConfigured:!!(env.RESEND_API_KEY&&env.MAIL_FROM),officeCopy:OWNER_EMAIL,owner:user.role==='owner'});
  return appJSON({error:'Endpoint not found'},404);
}
// Daily office check: one reminder at day 7, 14 and 21 from issuing a quotation.
async function runOfficeChaseSchedule(env,now=new Date()){
  const db=env.DB;
  if(!env.RESEND_API_KEY||!env.MAIL_FROM){
    console.warn('MP office chase schedule paused: RESEND_API_KEY or MAIL_FROM missing');
    return {configured:false,sent:0};
  }
  const owner=await db.prepare("SELECT id FROM users WHERE role='owner' AND active=1 LIMIT 1").first();
  if(!owner)return {configured:true,sent:0};
  const rows=await db.prepare("SELECT id,reference,client,client_email,site_address,chase_started_at,chase_sent_count,job_status,status,chase_enabled FROM proposals WHERE chase_enabled=1 AND chase_started_at IS NOT NULL AND chase_sent_count<3 AND job_status='pending' AND status='sent' ORDER BY chase_started_at,id LIMIT 120").all();
  let sent=0,failed=0;
  for(const job of rows.results){
    const count=Number(job.chase_sent_count||0),round=count+1;
    if(!chaseIsDue(job.chase_started_at,count,now))continue;
    const existing=await db.prepare('SELECT status,email_id FROM chase_reminders WHERE proposal_id=? AND round=?').bind(job.id,round).first();
    if(existing?.status==='sent'){
      await db.prepare('UPDATE proposals SET chase_sent_count=? WHERE id=? AND chase_sent_count<?').bind(round,job.id,round).run();
      continue;
    }
    await db.prepare("INSERT OR IGNORE INTO chase_reminders(proposal_id,round,status) VALUES(?,?,'pending')").bind(job.id,round).run();
    const origin='https://mitchell-proctor-fees.estimates-uk.workers.dev';
    const mail={from:env.MAIL_FROM,to:[OWNER_EMAIL],subject:officeChaseSubject(job.reference,round),
      text:officeChaseBody(job,round,origin)};
    try{
      const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
        'Authorization':'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',
        'Idempotency-Key':'mp-office-chase-'+job.id+'-'+round
      },body:JSON.stringify(mail)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok||!data.id)throw new Error('Resend rejected office reminder '+String(res.status)+': '+clean(data.message||'',150));
      await db.prepare("UPDATE chase_reminders SET status='sent',email_id=?,sent_at=CURRENT_TIMESTAMP WHERE proposal_id=? AND round=? AND status!='sent'").bind(data.id,job.id,round).run();
      await db.prepare('UPDATE proposals SET chase_sent_count=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND chase_sent_count<? AND job_status=?').bind(round,job.id,round,'pending').run();
      await recordProjectEvent(db,job.id,owner,'email','AUTOMATED OFFICE reminder '+round+'/3 emailed to '+OWNER_EMAIL+' (client was NOT emailed). Message ID: '+data.id);
      sent++;
    }catch(err){
      failed++;
      console.error('MP office reminder failed, proposal '+job.id+' round '+round,err);
      // Leave this round retryable. The stable Resend idempotency key avoids duplicate sends.
      await db.prepare("UPDATE chase_reminders SET status='failed' WHERE proposal_id=? AND round=? AND status!='sent'").bind(job.id,round).run();
    }
  }
  console.log('MP chase run',JSON.stringify({seen:rows.results.length,sent,failed,at:now.toISOString()}));
  return {configured:true,sent,failed};
}
export default {
  async scheduled(controller,env){
    const data={...env,DB:bindDurableSql(env)};
    try{await runOfficeChaseSchedule(data,new Date(controller.scheduledTime||Date.now()))}
    catch(err){console.error('Scheduled quotation reminders failed',err)}
    // Automatically file Outlook replies bearing a known MP job reference
    // using each staff member's explicitly authorised mailbox.
    if(isOutlookConfigured(data)){
      try{
        const accounts=await data.DB.prepare('SELECT user_id FROM outlook_connections ORDER BY user_id LIMIT 25').all();
        for(const item of accounts.results){
          try{await syncOutlookInbox(data,item.user_id,recordProjectEvent)}
          catch(err){console.warn('Outlook mailbox sync skipped for user '+item.user_id+': '+err.message)}
        }
      }catch(err){console.error('Outlook daily sync failed',err)}
    }
  },
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
      if(path==='/outlook'||path==='/outlook.html')return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/outlook.html',request.url),request)));
      if(path==='/cloud-sync.js')return securityHeaders(await env.ASSETS.fetch(request));
      if(path==='/pdf-delivery.js')return securityHeaders(await env.ASSETS.fetch(request));
      if(path==='/job'||path==='/job.html'){
        return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/job.html',request.url),request)));
      }
      if(path==='/projects'||path==='/projects.html'){
        return securityHeaders(await env.ASSETS.fetch(new Request(new URL('/projects.html',request.url),request)));
      }
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