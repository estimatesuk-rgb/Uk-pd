// Cloudflare WebCrypto verification of Resend's Svix-signed webhook events.
// Resend signs raw bytes of "svix-id.svix-timestamp.raw-body" using HMAC-SHA256.
const te=new TextEncoder();
const BASE64=/^[A-Za-z0-9+/_=-]+$/;
function decode64(s){
 const v=String(s||'').replace(/-/g,'+').replace(/_/g,'/');
 if(!BASE64.test(v))throw Error('Invalid signature encoding');
 const padded=v.padEnd(Math.ceil(v.length/4)*4,'=');
 const raw=atob(padded),out=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
 return out;
}
function constantEqual(a,b){
 if(a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0;
}
export async function verifyInboundWebhook(raw,headers,secret,now=Date.now()){
 if(!secret?.startsWith('whsec_')||typeof raw!=='string'||raw.length>100000)return false;
 const id=headers.get('svix-id'),stamp=headers.get('svix-timestamp'),signature=headers.get('svix-signature');
 if(!id||!stamp||!signature||!/^\d{9,12}$/.test(stamp))return false;
 const time=Number(stamp)*1000;
 if(!Number.isFinite(time)||Math.abs(now-time)>5*60*1000)return false;
 let key;
 try{key=await crypto.subtle.importKey('raw',decode64(secret.slice(6)),{name:'HMAC',hash:'SHA-256'},false,['sign']);}
 catch{return false}
 const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,te.encode(id+'.'+stamp+'.'+raw)));
 for(const entry of signature.trim().split(/\s+/)){
  if(!entry.startsWith('v1,'))continue;
  try{if(constantEqual(digest,decode64(entry.slice(3))))return true}catch{}
 }
 return false;
}
export function extractMpReference(subject){
 const match=String(subject||'').match(/\bMP-20\d{2}-\d{5}\b/i);
 return match?match[0].toUpperCase():null;
}
export function plainMailboxText(message){
 const str=String(message.text||'').replace(/\0/g,'');
 return str.length>250000?str.slice(0,250000)+'\n[Email truncated — original retained by email provider]':str;
}
