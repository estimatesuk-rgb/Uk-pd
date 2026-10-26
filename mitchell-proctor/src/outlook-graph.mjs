// Microsoft 365 Outlook delegated OAuth 2.0 integration.
// No Microsoft client credentials or bearer tokens are committed to source control.
// Configuration: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TOKEN_KEY (32 random bytes,
// base64-encoded), optional MS_TENANT_ID (defaults to "common").
const AUTH_ROOT='https://login.microsoftonline.com';
const GRAPH_ROOT='https://graph.microsoft.com/v1.0';
const enc=new TextEncoder();
export const OUTLOOK_SCOPES='offline_access openid profile User.Read Mail.Send Mail.Read';
export const OUTLOOK_DASHBOARD='https://outlook.office.com/mail/sentitems';
export function isOutlookConfigured(env){
 return Boolean(env.MS_CLIENT_ID&&env.MS_CLIENT_SECRET&&env.MS_TOKEN_KEY);
}
export function redirectFor(requestUrl){return new URL('/api/outlook/callback',requestUrl).toString()}
export function microsoftTenant(env){
 const tenant=String(env.MS_TENANT_ID||'common');
 return /^[A-Za-z0-9-]{1,128}$/.test(tenant)?tenant:'common';
}
export function randomUrlToken(size=32){
 const bytes=crypto.getRandomValues(new Uint8Array(size));
 return bytesToUrl64(bytes);
}
export function bytesToUrl64(bytes){
 let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function fromBase64(text){
 const s=String(text||'').replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(s.padEnd(Math.ceil(s.length/4)*4,'='));
 const bytes=new Uint8Array(raw.length);
 for(let i=0;i<bytes.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
async function tokenCryptoKey(env){
 const raw=fromBase64(env.MS_TOKEN_KEY||'');
 if(raw.length!==32)throw new Error('Outlook encryption key is not configured correctly');
 return crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptOutlookTokens(env,object){
 const key=await tokenCryptoKey(env),iv=crypto.getRandomValues(new Uint8Array(12));
 const bytes=enc.encode(JSON.stringify(object));
 return JSON.stringify({iv:bytesToUrl64(iv),data:bytesToUrl64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes)))});
}
export async function decryptOutlookTokens(env,secret){
 const record=JSON.parse(secret),key=await tokenCryptoKey(env);
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(record.iv)},key,fromBase64(record.data));
 return JSON.parse(new TextDecoder().decode(clear));
}
export async function pkceChallenge(verifier){
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(verifier)));
 return bytesToUrl64(digest);
}
export async function outlookAuthorizeUrl(env,requestUrl,state,verifier){
 const uri=new URL(AUTH_ROOT+'/'+microsoftTenant(env)+'/oauth2/v2.0/authorize');
 uri.searchParams.set('client_id',env.MS_CLIENT_ID);
 uri.searchParams.set('response_type','code');
 uri.searchParams.set('redirect_uri',redirectFor(requestUrl));
 uri.searchParams.set('response_mode','query');
 uri.searchParams.set('scope',OUTLOOK_SCOPES);
 uri.searchParams.set('state',state);
 uri.searchParams.set('code_challenge',await pkceChallenge(verifier));
 uri.searchParams.set('code_challenge_method','S256');
 uri.searchParams.set('prompt','select_account');
 return uri.toString();
}
export async function microsoftTokenRequest(env,fields){
 const uri=AUTH_ROOT+'/'+microsoftTenant(env)+'/oauth2/v2.0/token';
 const body=new URLSearchParams({client_id:env.MS_CLIENT_ID,client_secret:env.MS_CLIENT_SECRET,...fields});
 const response=await fetch(uri,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw Error('Microsoft Outlook authorization failed ('+String(data.error||response.status)+'). Reconnect Outlook.');
 return data;
}
export async function graphCall(accessToken,path,options={}){
 const url=GRAPH_ROOT+path;
 const headers={'Authorization':'Bearer '+accessToken,...(options.headers||{})};
 const result=await fetch(url,{...options,headers});
 return result;
}
export function outlookEmailMessage(row,pdf64,officeAddress,fromAddress){
 const subject='Mitchell Proctor Architects | Fee proposal '+row.reference+' | '+String(row.site_address||'').slice(0,75);
 const text=['Dear '+row.client+',','','Thank you for meeting with Mitchell Proctor Architects.','',
  'Please find attached our architectural fee proposal '+row.reference+' for '+row.site_address+'.',
  'The attached PDF includes the professional services breakdown, VAT, staged deposit payments and client acceptance form.','','Please let us know if you would like us to proceed or have any questions.',
  '','Kind regards,','Mitchell Proctor Architects','01246 203196'].join('\n');
 const payload={message:{
  subject,
  body:{contentType:'Text',content:text},
  toRecipients:[{emailAddress:{address:row.client_email}}],
  bccRecipients:officeAddress.toLowerCase()===String(fromAddress||'').toLowerCase()?[]:[{emailAddress:{address:officeAddress}}],
  attachments:[{'@odata.type':'#microsoft.graph.fileAttachment',name:row.reference+'_Fee_Proposal.pdf',contentType:'application/pdf',contentBytes:pdf64}]
 },saveToSentItems:true};
 return {subject,text,payload};
}
export function safeOutlookHtmlToText(html){
 return String(html||'').replace(/<style[\s\S]*?<\/style>/gi,' ')
 .replace(/<script[\s\S]*?<\/script>/gi,' ')
 .replace(/<\/(p|div|br|li|tr|h\d)>/gi,'\n')
 .replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&')
 .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"')
 .replace(/\n{3,}/g,'\n\n').slice(0,30000);
}
export function nextOutlookSubjectRef(text){
 const match=String(text||'').match(/\bMP-20\d{2}-\d{5}\b/i);
 return match?match[0].toUpperCase():null;
}
