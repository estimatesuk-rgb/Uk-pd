/* Mitchell Proctor PDF delivery. A file share MUST be called synchronously
 * from the final button tap; do not await save/network operations in that handler.
 * The first tap prepares the quotation. The second tap shares the ready File.
 */
'use strict';
let mpPreparedFile=null;
let mpDeliveryPending=false;
function mpDeliveryNode(tag,txt,className){
  const el=document.createElement(tag);
  if(txt!==undefined&&txt!==null)el.textContent=String(txt);
  if(className)el.className=className;
  return el;
}
function mpCloseDelivery(){
  const modal=document.getElementById('mpDeliveryOverlay');
  if(modal)modal.remove();
  mpPreparedFile=null;
}
function mpDeliveryStatus(text,bad=false){
  const node=document.getElementById('mpDeliveryStatus');
  if(node){node.textContent=text;node.style.color=bad?'#9c312b':'#316042';}
}
function mpDeliveryDom(){
  document.getElementById('mpDeliveryOverlay')?.remove();
  const shade=mpDeliveryNode('div'),box=mpDeliveryNode('section');
  shade.id='mpDeliveryOverlay';
  shade.style.cssText='position:fixed;inset:0;z-index:200000;background:rgba(20,20,20,.78);overflow:auto;padding:22px 12px;display:flex;justify-content:center;align-items:flex-start';
  box.style.cssText='background:#fff;color:#24211d;max-width:650px;width:100%;margin:10px auto 30px;padding:24px;border-radius:13px;box-shadow:0 15px 70px #0006;font-family:Arial,sans-serif';
  box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Send architectural quotation PDF');
  const header=mpDeliveryNode('div');header.style.cssText='display:flex;justify-content:space-between;gap:12px;align-items:center';
  const head=mpDeliveryNode('h2','Prepare quotation PDF');head.style.cssText='font-size:22px;margin:0;font-family:Georgia,serif';
  const close=mpDeliveryNode('button','Close');close.type='button';close.style.cssText='padding:8px 12px;background:#eee;border:1px solid #ccc;border-radius:7px;color:#222;cursor:pointer';
  close.onclick=mpCloseDelivery;header.append(head,close);
  const details=mpDeliveryNode('p','Saving the quotation and preparing your PDF attachment…');
  details.id='mpDeliveryDetails';details.style.cssText='line-height:1.55;font-size:13px;color:#665d55';
  const status=mpDeliveryNode('p','Preparing…');status.id='mpDeliveryStatus';
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const buttons=mpDeliveryNode('div');buttons.id='mpDeliveryActions';buttons.style.cssText='display:grid;gap:10px';
  const foot=mpDeliveryNode('p','The PDF includes your professional fees, VAT, staged deposit schedule and client acceptance. Sending is not confirmed until Outlook or WhatsApp shows it sent.');
  foot.style.cssText='font-size:12px;line-height:1.5;color:#6c645d;margin:18px 0 0';
  box.append(header,details,status,buttons,foot);shade.append(box);document.body.append(shade);
  close.focus();return {buttons,details,box};
}
function mpDeliveryButton(label,fn,secondary=false){
  const button=mpDeliveryNode('button',label);
  button.type='button';button.style.cssText='border-radius:7px;padding:12px 14px;text-align:left;cursor:pointer;font-weight:700;font-size:14px;border:1px solid #cbbca9;'+
    (secondary?'background:#f6f3ef;color:#26221f':'background:#2b2724;color:#fff');
  button.onclick=fn;return button;
}
function mpDeliveryLink(label,url){
  const a=mpDeliveryNode('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  a.style.cssText='display:block;box-sizing:border-box;border:1px solid #cbbca9;border-radius:7px;padding:12px 14px;background:#f6f3ef;color:#26221f;font-size:14px;font-weight:700;text-decoration:none';
  return a;
}
function mpDeliveryMessage(p){
  const address=p.address||'your project',client=p.client||'';
  return 'Dear '+client+',\n\nThank you for meeting Mitchell Proctor Architects. Your architectural fee proposal '+p.reference+' for '+address+' is ready.\n\nPlease see the attached PDF for the fee breakdown, staged payment schedule and acceptance form.\n\nKind regards,\nMitchell Proctor Architects\n01246 203196';
}
function mpReadyFile(){
  if(!mpPreparedFile)throw Error('Prepare the quotation PDF first');
  if(mpPreparedFile.jobId!==currentProposalId||mpPreparedFile.snapshot!==JSON.stringify(state))
    throw Error('This quotation has changed since the PDF was prepared. Close this window and prepare the latest version.');
  return mpPreparedFile;
}
function mpNativeShareNow(){
  // IMPORTANT: no awaited work before navigator.share: required for iOS Safari.
  let prepared;
  try{prepared=mpReadyFile()}catch(err){mpDeliveryStatus(err.message,true);return}
  if(!navigator.share||!navigator.canShare||!navigator.canShare({files:[prepared.file]})){
    mpDeliveryStatus('Your browser cannot share files directly. Download the PDF and attach it in the app instead.',true);return;
  }
  let request;
  try{
    request=navigator.share({files:[prepared.file],title:prepared.subject,text:prepared.message});
  }catch(err){mpDeliveryStatus('Phone sharing could not open: '+err.message,true);return}
  Promise.resolve(request).then(()=>{
    mpDeliveryStatus('PDF handed to your chosen app. Check the recipient, press Send there, then use Confirm sent below.');
  }).catch(err=>{
    if(err.name!=='AbortError')mpDeliveryStatus('Sharing did not complete: '+err.message+'. Download and attach the PDF manually.',true);
  });
}
async function mpDeliveryConfirmSent(){
  let p;try{p=mpReadyFile()}catch(err){mpDeliveryStatus(err.message,true);return}
  const select=document.getElementById('mpDeliveryMedium');
  const channel=select?.value||p.kind;
  if(!['whatsapp','outlook','email','other'].includes(channel)){mpDeliveryStatus('Select how you sent the quotation.',true);return}
  if(!window.confirm('Confirm you have ACTUALLY sent the PDF quotation to the client via '+channel.toUpperCase()+'? This records the issue date and permanently archives the PDF on the job.'))return;
  try{
    const done=await mpAPI('/api/proposals/'+p.jobId+'/delivery-log',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({medium:channel,confirm:true,revision:p.revision})});
    mpDeliveryStatus(done.message+' The weekly office reminders are activated for Pending jobs.');
    await mpRefreshProjects();
    const confirmButton=document.getElementById('mpDeliveryConfirm');if(confirmButton)confirmButton.disabled=true;
  }catch(err){mpDeliveryStatus('Cannot record send: '+err.message,true)}
}
async function mpDeliverySendOutlook(){
  let p;try{p=mpReadyFile()}catch(err){mpDeliveryStatus(err.message,true);return}
  if(!p.outlookConnected){mpDeliveryStatus('Connect Outlook first under Outlook Settings.',true);return}
  if(!window.confirm('Send '+p.file.name+' directly from '+p.outlookMailbox+' to '+p.email+' with the practice office copied?'))return;
  const button=document.getElementById('mpDeliveryOutlookSend');if(button)button.disabled=true;
  mpDeliveryStatus('Sending the attached PDF through Microsoft Outlook…');
  try{
    const sent=await mpAPI('/api/proposals/'+p.jobId+'/outlook-send',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})
    });
    mpDeliveryStatus('Outlook accepted the email with '+sent.attached+' attached for '+sent.to+'. Review Sent Items to verify delivery.');
    await mpRefreshProjects();
    const confirmButton=document.getElementById('mpDeliveryConfirm');if(confirmButton)confirmButton.disabled=true;
  }catch(err){mpDeliveryStatus('Outlook send failed: '+err.message,true)}
  finally{if(button)button.disabled=false}
}
async function mpDeliverySendPracticeEmail(){
  let p;try{p=mpReadyFile()}catch(err){mpDeliveryStatus(err.message,true);return}
  if(!p.practiceEmailConfigured){mpDeliveryStatus('Practice email is not configured. Connect Outlook or share the PDF file.',true);return}
  if(!window.confirm('Send '+p.file.name+' to '+p.email+' using the practice email sender and BCC enquiries@ukestimates.com?'))return;
  const button=document.getElementById('mpDeliveryPracticeSend');if(button)button.disabled=true;
  mpDeliveryStatus('Sending PDF with office copy…');
  try{
    const sent=await mpAPI('/api/proposals/'+p.jobId+'/send',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})
    });
    mpDeliveryStatus('Email provider accepted the quotation PDF for '+sent.recipient+'. Office copy included. Check delivery.');
    await mpRefreshProjects();
    const confirmButton=document.getElementById('mpDeliveryConfirm');if(confirmButton)confirmButton.disabled=true;
  }catch(err){mpDeliveryStatus('Email send failed: '+err.message,true)}
  finally{if(button)button.disabled=false}
}
async function mpPrepareDelivery(kind='share'){
  if(mpDeliveryPending)return;
  if(!validateClient())return;
  mpDeliveryPending=true;
  const view=mpDeliveryDom();
  try{
    let stored;
    if(currentProposalId&&!mpRemoteDirty&&!mpAutoBusy)stored={id:currentProposalId,reference:state.reference};
    else stored=await mpSave();
    if(!stored)throw Error('Save the quotation first. The PDF was not prepared.');
    const blob=await mpPdfBlob();
    const signature=await blob.slice(0,5).text();
    if(signature!=='%PDF-')throw Error('The generated file is not a valid PDF.');
    const file=new File([blob],String(state.reference||'MP-Quote').replace(/[^a-zA-Z0-9_-]/g,'_')+'_Fee_Proposal.pdf',{type:'application/pdf'});
    const [status,outlook]=await Promise.all([
      mpAPI('/api/status').catch(()=>({emailConfigured:false})),
      mpAPI('/api/outlook/status').catch(()=>({connected:false,configured:false}))
    ]);
    const p={file,kind,jobId:currentProposalId,revision:currentProposalRevision,snapshot:JSON.stringify(state),
      reference:state.reference,email:state.clientEmail,phone:state.clientPhone,
      client:state.client,address:state.address,
      subject:'Mitchell Proctor Architects | Fee proposal '+state.reference,
      message:mpDeliveryMessage(state),outlookConnected:!!outlook.connected,
      outlookMailbox:outlook.mailbox,practiceEmailConfigured:!!status.emailConfigured};
    mpPreparedFile=p;
    view.details.textContent=p.reference+' • '+p.client+' • '+p.email+' • '+Math.ceil(blob.size/1024)+' KB PDF ready. This is the exact file generated by the quotation app.';
    view.box.querySelector('h2').textContent='Quotation ready to send';
    mpDeliveryStatus('PDF prepared and verified. Choose how you want to send it.');
    const actions=view.buttons;
    if(navigator.share&&navigator.canShare?.({files:[file]})){
      actions.append(mpDeliveryButton('Share attached PDF to WhatsApp / Outlook (phone share sheet)',mpNativeShareNow));
    }
    if(p.outlookConnected){
      const send=mpDeliveryButton('Send attached PDF directly with Outlook ('+p.outlookMailbox+')',mpDeliverySendOutlook);
      send.id='mpDeliveryOutlookSend';actions.append(send);
    }else{
      actions.append(mpDeliveryLink('Connect Microsoft Outlook for direct PDF email','/outlook'));
    }
    if(p.practiceEmailConfigured){
      const send=mpDeliveryButton('Send PDF by practice email + office copy',mpDeliverySendPracticeEmail,true);
      send.id='mpDeliveryPracticeSend';actions.append(send);
    }
    actions.append(mpDeliveryButton('Download actual PDF quotation',()=>{deliverBlob(p.file.name,new Blob([p.file],{type:'application/pdf'}));mpDeliveryStatus('PDF downloaded. If using desktop Outlook or WhatsApp, attach this file to the message.');},true));
    const note=mpDeliveryNode('p','Desktop/manual option: download the PDF above, then open a message below and attach it yourself. The links alone do not attach documents.');
    note.style.cssText='font-size:12px;margin:10px 0 0;color:#725e48';actions.append(note);
    const compose='https://outlook.office.com/mail/deeplink/compose?to='+encodeURIComponent(p.email)+'&subject='+encodeURIComponent(p.subject)+'&body='+encodeURIComponent(p.message);
    actions.append(mpDeliveryLink('Open Outlook draft (ATTACH downloaded PDF manually)',compose));
    const number=String(p.phone||'').replace(/\D/g,'').replace(/^0(?=\d{9,10}$)/,'44');
    if(number.length>=9&&number.length<=15){
      const chat='https://wa.me/'+number+'?text='+encodeURIComponent(p.message);
      actions.append(mpDeliveryLink('Open WhatsApp chat (ATTACH downloaded PDF manually)',chat));
    }
    const field=mpDeliveryNode('label','After you actually send it, record the issue in the job:');
    field.style.cssText='font-weight:700;font-size:13px;margin-top:15px';actions.append(field);
    const select=mpDeliveryNode('select');select.id='mpDeliveryMedium';
    select.style.cssText='padding:10px;border:1px solid #ccc;border-radius:7px;width:100%;background:#fff;color:#24211d';
    const options=[['whatsapp','WhatsApp'],['outlook','Outlook (manual / share sheet)'],['email','Email (manual / share sheet)'],['other','Other method']];
    for(const [key,label] of options){const option=mpDeliveryNode('option',label);option.value=key;select.append(option)}
    select.value=kind==='whatsapp'?'whatsapp':kind==='outlook'?'outlook':kind==='email'?'email':'other';
    actions.append(select);
    const confirm=mpDeliveryButton('Confirm sent + archive PDF in Saved Job',mpDeliveryConfirmSent,true);
    confirm.id='mpDeliveryConfirm';actions.append(confirm);
  }catch(err){mpDeliveryStatus('Could not prepare the PDF: '+err.message,true);
    view.details.textContent='The quotation was not sent. Check the job details and try again.';}
  finally{mpDeliveryPending=false}
}
function mpHookDeliveryButtons(){
 const controls=[
  ['shareBtn','share'],['emailBtn','email'],['whatsappBtn','whatsapp'],
  ['outlookBtn','outlook'],['mpQuickEmail','email'],['mpQuickWhatsapp','whatsapp'],['mpQuickOutlook','outlook']
 ];
 for(const [id,kind] of controls){const btn=document.getElementById(id);if(btn)btn.onclick=()=>mpPrepareDelivery(kind)}
 const download=document.getElementById('wordBtn');
 if(download)download.onclick=async()=>{
   if(!validateClient())return;
   try{
     if(!currentProposalId||mpRemoteDirty){if(!await mpSave())return}
     const blob=await mpPdfBlob();
     if(await blob.slice(0,5).text()!=='%PDF-')throw Error('Invalid PDF returned');
     deliverBlob(String(state.reference).replace(/[^a-zA-Z0-9_-]/g,'_')+'_Fee_Proposal.pdf',blob);
     toast('Actual client quotation PDF downloaded.');
   }catch(err){toast('PDF download failed: '+err.message)}
 };
 document.querySelector('.controls')?.addEventListener('input',()=>{if(mpPreparedFile)mpDeliveryStatus('Quotation changed. Close this window and prepare a fresh PDF.',true)});
}
mpHookDeliveryButtons();
