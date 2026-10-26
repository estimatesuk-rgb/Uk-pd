import {isOutlookConfigured,OUTLOOK_SCOPES,microsoftTokenRequest,graphCall,encryptOutlookTokens,decryptOutlookTokens,safeOutlookHtmlToText,nextOutlookSubjectRef} from './outlook-graph.mjs';
const scrub=(value,n=250)=>String(value??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,n);
export async function activeOutlookAccount(env,userId){
 const row=await env.DB.prepare('SELECT user_id,account_id,mailbox,secret_cipher,expires_at,last_synced_at FROM outlook_connections WHERE user_id=?').bind(userId).first();
 if(!row)return null;
 let token=await decryptOutlookTokens(env,row.secret_cipher);
 if(Date.now()>Number(row.expires_at)-120000){
   if(!token.refresh_token)throw Object.assign(new Error('Outlook session expired; reconnect the account.'),{status:401});
   const refreshed=await microsoftTokenRequest(env,{grant_type:'refresh_token',refresh_token:token.refresh_token,scope:OUTLOOK_SCOPES});
   token={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||token.refresh_token};
   const expires=Date.now()+Number(refreshed.expires_in||3600)*1000;
   await env.DB.prepare('UPDATE outlook_connections SET secret_cipher=?,expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
     .bind(await encryptOutlookTokens(env,token),expires,userId).run();
   row.expires_at=expires;
 }
 return {row,accessToken:token.access_token};
}
export async function syncOutlookInbox(env,userId,recordEvent){
 if(!isOutlookConfigured(env))return {connected:false,configured:false,imported:0};
 const user=await env.DB.prepare('SELECT id,name,active FROM users WHERE id=?').bind(userId).first();
 if(!user||!user.active)return {connected:false,imported:0};
 const account=await activeOutlookAccount(env,userId);
 if(!account)return {connected:false,imported:0};
 const start=new Date(Date.now()-45*86400000).toISOString();
 const params=new URLSearchParams({'$top':'75','$select':'id,subject,from,toRecipients,receivedDateTime,body,bodyPreview','$filter':'receivedDateTime ge '+start,'$orderby':'receivedDateTime desc'});
 const result=await graphCall(account.accessToken,'/me/mailFolders/inbox/messages?'+params.toString(),{headers:{Prefer:'outlook.body-content-type="text"'}});
 if(!result.ok)throw Object.assign(new Error('Microsoft Outlook Inbox could not be read ('+result.status+'). Verify Mail.Read permission and Exchange mailbox access.'),{status:502});
 const data=await result.json(),messages=Array.isArray(data.value)?data.value:[];
 let imported=0;
 for(const mail of messages){
   const reference=nextOutlookSubjectRef(mail.subject||'');
   if(!reference||!mail.id)continue;
   const proposal=await env.DB.prepare('SELECT id FROM proposals WHERE reference=?').bind(reference).first();
   if(!proposal)continue;
   const key='outlook:'+account.row.account_id+':'+mail.id;
   if(await env.DB.prepare('SELECT id FROM project_inbound_emails WHERE provider_id=?').bind(key).first())continue;
   const sender=scrub(mail.from?.emailAddress?.address,250);
   const to=(mail.toRecipients||[]).map(x=>x.emailAddress?.address||'').join(', ').slice(0,1000);
   const body=mail.body?.content||mail.bodyPreview||'';
   const plain=String(mail.body?.contentType||'').toLowerCase()==='html'?safeOutlookHtmlToText(body):String(body).slice(0,30000);
   const received=String(mail.receivedDateTime||new Date().toISOString());
   const reply=await env.DB.prepare('INSERT OR IGNORE INTO project_inbound_emails(provider_id,proposal_id,subject,from_address,to_addresses,text_body,received_at) VALUES(?,?,?,?,?,?,?)')
      .bind(key,proposal.id,scrub(mail.subject,500),sender,to,plain,received).run();
   if(reply.meta?.changes){
     imported++;
     await recordEvent(env.DB,proposal.id,user,'email','OUTLOOK REPLY from '+sender+' ('+received+') Subject: '+scrub(mail.subject,220)+'\n'+plain.slice(0,2400));
   }
 }
 await env.DB.prepare('UPDATE outlook_connections SET last_synced_at=CURRENT_TIMESTAMP WHERE user_id=?').bind(userId).run();
 return {connected:true,imported,checked:messages.length,mailbox:account.row.mailbox};
}
