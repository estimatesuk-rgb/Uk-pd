/* Cloudflare sync layer over the existing branded MP Fee Studio. */
let currentProposalId = null;
let currentProposalRevision = null;
let mpAutoTimer = null;
let mpAutoBusy = false;
let mpAutoNeedsAnotherPass = false;
let pricingDefaults = null;
let mpRemoteDirty = false;
const mpBaseBlank = blank;
blank = function () {
  const s = mpBaseBlank();
  s.reference = 'DRAFT - save to allocate number';
  s.feeMode=pricingDefaults?.feeMode||'band';
  s.pricingBand=''; // Staff must deliberately choose size and complexity for each new quote.
  if (pricingDefaults) {
    s.buildRate = pricingDefaults.buildRate;
    s.buildVatRate = pricingDefaults.buildVatRate;
    s.feeVatRate = pricingDefaults.feeVatRate;
    s.contingency = pricingDefaults.contingency ?? 0;
    s.validDays = pricingDefaults.validDays ?? 30;
    for (const entry of s.stages) {
      const found = pricingDefaults.stages?.find(a => a.id === entry.id);
      if (found) { entry.rate = found.rate; entry.selected = found.selected;entry.bandFees={...found.bandFees};entry.quotedFee=null; }
    }
    for (const entry of s.extras) {
      const found = pricingDefaults.extras?.find(a => a.id === entry.id);
      if (found) { entry.amount = found.amount; entry.selected = found.selected;entry.bandFees={...found.bandFees};entry.quotedFee=null; }
    }
  }
  return s;
};
async function mpAPI(path, options = {}) {
  const r = await fetch(path, { credentials: 'same-origin', ...options });
  let data; try { data = await r.json(); } catch { data = { error: 'Unexpected server response' }; }
  if (r.status === 401) { location.href = '/login'; throw new Error('Please sign in'); }
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
async function mpRefreshProjects() {
  const d = await mpAPI('/api/proposals');
  projects = Array.isArray(d.projects) ? d.projects : [];
  renderSaved();
}
async function mpSave() {
  if (!validateClient()) return null;
  if(mpAutoTimer){clearTimeout(mpAutoTimer);mpAutoTimer=null}
  // Keep manual Save and pending autosave from generating duplicate project numbers.
  for(let i=0;mpAutoBusy&&i<50;i++)await new Promise(resolve=>setTimeout(resolve,80));
  if(mpAutoBusy){toast('Cloud save is still completing. Please retry.');return null}
  try {
    const result = await mpAPI('/api/proposals', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ id:currentProposalId, revision:currentProposalRevision, data:state })
    });
    currentProposalId = result.id;
    currentProposalRevision = result.revision;
    state.reference = result.reference;
    try{await mpAPI('/api/my-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clear:true})})}catch{}
    mpRemoteDirty = false;
    await mpRefreshProjects();
    refresh();
    toast('Saved to Cloudflare as ' + result.reference + '. Available on all authorised devices.');
    return result;
  } catch(err) { toast('Save failed: '+err.message); return null; }
}
async function mpLoad() {
  const ix = $('#savedProjects').value;
  if (ix === '' || !projects[Number(ix)]) { toast('Select a saved proposal'); return; }
  const p = projects[Number(ix)];
  currentProposalId = p.id;
  currentProposalRevision = p.revision;
  state = sanitizeState(p.data);
  state.reference = p.reference;
  mpRemoteDirty = false;
  renderAll();
  toast('Loaded ' + p.reference + ' from Cloudflare.');
}
async function mpDelete() {
  const ix = $('#savedProjects').value;
  if (ix === '' || !projects[Number(ix)]) { toast('Select a proposal first.'); return; }
  const p = projects[Number(ix)];
  if(!confirm('Permanently delete '+p.reference+'? This will remove it for all users.')) return;
  const password = prompt('Confirm with your account password to delete this job:');
  if (!password) return;
  try {
    await mpAPI('/api/proposals/'+p.id+'/delete', { method:'POST', headers:{'Content-Type':'application/json'},body:JSON.stringify({password}) });
    if (currentProposalId===p.id) {currentProposalId=null;currentProposalRevision=null;state=blank();renderAll();}
    await mpRefreshProjects(); toast('Project deleted.');
  } catch(err){ toast('Delete failed: '+err.message); }
}
async function mpNew() {
  if(mpRemoteDirty && !confirm('Current changes are not saved to the shared workspace. Start a new job?'))return;
  try{
    const result=await mpAPI('/api/pricing');
    if(result.pricing)pricingDefaults=result.pricing;
  }catch(err){toast('Could not refresh practice fees: '+err.message);return;}
  if(mpAutoTimer)clearTimeout(mpAutoTimer);
  currentProposalId=null;currentProposalRevision=null;state=blank();mpRemoteDirty=false;renderAll();
  try{await mpAPI('/api/my-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clear:true})})}catch{}
  toast('New blank proposal uses the latest practice-wide pricing. Save to allocate a job reference.');
}
async function mpPdfBlob() {
  if(!validateClient())throw new Error('Enter the client and project details first');
  if(!currentProposalId){const saved=await mpSave();if(!saved)throw new Error('Please save the proposal first');}
  const response=await fetch('/api/proposals/'+currentProposalId+'/pdf',{credentials:'same-origin',cache:'no-store'});
  if(response.status===401){location.href='/login';throw new Error('Please sign in again');}
  if(!response.ok){const info=await response.json().catch(()=>({}));throw new Error(info.error||'PDF generation failed ('+response.status+')');}
  const blob=await response.blob();
  if(blob.size<500||!blob.type.includes('pdf'))throw new Error('PDF could not be generated');
  return blob;
}
function mpPdfName(){return 'MP_Fee_Proposal_'+filePart(state.reference)+'.pdf';}
async function mpDownloadPdf(){
  try{
    const saved=await mpSave();if(!saved)return;
    const blob=await mpPdfBlob();
    deliverBlob(mpPdfName(),blob);
    toast('Client quotation PDF downloaded, including the acceptance page.');
  }catch(err){toast('PDF download failed: '+err.message);}
}
async function mpSharePdf(){
  try{
    const saved=await mpSave();if(!saved)return;
    const blob=await mpPdfBlob();
    const file=new File([blob],mpPdfName(),{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      await navigator.share({files:[file],title:'Mitchell Proctor Fee Proposal '+state.reference,
        text:'Please see the attached PDF fee proposal and acceptance form.'});
    }else{
      deliverBlob(file.name,blob);
      toast('Quotation PDF downloaded. Share it using Mail or WhatsApp.');
    }
  }catch(err){if(err.name!=='AbortError')toast('PDF sharing failed: '+err.message);}
}
async function mpEmail(){
  if(!validateClient())return;
  const saved=await mpSave();if(!saved)return;
  const subj='architect fee proposal - '+state.client+' - '+state.address.replace(/\n/g,', ');
  try{
    const status=await mpAPI('/api/status');
    if(!status.emailConfigured){
      const pdf=await mpPdfBlob();
      deliverBlob(mpPdfName(),pdf);
      const fees=totals(),schedule=paymentSchedule(fees);
      const body='Dear '+state.client+',\n\nPlease find attached our architectural fee proposal in PDF format for '+state.address+'.\n\nProfessional fee incl. VAT: '+money2(fees.feeGross)+'\nDeposit (50%): '+money2(schedule.depositGross)+'\nBalance before submission: '+money2(schedule.balanceGross)+'\n\nKind regards,\nMitchell Proctor Architects';
      const mailto='mailto:'+encodeURIComponent(state.clientEmail)+'?bcc='+encodeURIComponent('enquiries@ukestimates.com')+'&subject='+encodeURIComponent(subj)+'&body='+encodeURIComponent(body);
      toast('PDF downloaded. Attach the PDF to the prepared email before sending.');
      window.location.href=mailto;
      return;
    }
    if(!confirm('Send the PDF quotation to '+state.clientEmail+' with a practice office BCC?\nSubject: '+subj))return;
    toast('Sending PDF proposal…');
    const sent=await mpAPI('/api/proposals/'+currentProposalId+'/send',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})
    });
    toast('PDF email sent to '+sent.recipient+' with office copy.');
    await mpRefreshProjects();
  }catch(err){toast('PDF email failed: '+err.message);}
}
function mpAddHeader() {
  const mast=document.querySelector('.mast-actions')||document.querySelector('.masthead');
  if(!mast)return;
  const wrap=document.createElement('span');
  wrap.style.display='inline-flex';wrap.style.gap='8px';wrap.style.alignItems='center';wrap.style.flexWrap='wrap';
  wrap.innerHTML='<span style="color:#ddd;font-size:12px" id="mpAccountName">Signed in</span>'+
    '<a href="/projects" class="btn ghost small">Saved jobs</a>'+
    '<button id="mpQuickEmail" type="button" class="btn ghost small">Email PDF</button>'+
    '<button id="mpQuickWhatsapp" type="button" class="btn ghost small">WhatsApp PDF</button>'+
    '<a id="mpOwnerLink" href="/owner" class="btn ghost small" style="display:none">Owner settings</a>'+
    '<button id="mpResumeDraft" type="button" class="btn ghost small" style="display:none">Resume draft</button>'+
    '<span id="mpSyncInfo" style="color:#d8d0c7;font-size:11px" aria-live="polite">Connected</span>'+
    '<button id="mpSignOut" type="button" class="btn ghost small">Sign out</button>';
  mast.append(wrap);
  document.getElementById('mpQuickEmail').onclick=mpEmail;
  document.getElementById('mpQuickWhatsapp').onclick=mpWhatsapp;
  document.getElementById('mpSignOut').onclick=async()=>{await mpAPI('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.href='/login'};
}
async function mpConnect() {
  mpAddHeader();
  try {
    const me=await mpAPI('/api/session');
    if(!me.authenticated){location.href='/login';return;}
    const el=document.getElementById('mpAccountName');if(el)el.textContent=me.user.name;
    if(me.user.role==='owner')document.getElementById('mpOwnerLink').style.display='inline-flex';
    else {const del=document.getElementById('deleteBtn');if(del)del.style.display='none';}
    const result=await mpAPI('/api/pricing');pricingDefaults=result.pricing;
    await mpRefreshProjects();
    const requestedId = new URLSearchParams(location.search).get('proposal');
    if (requestedId && /^\d+$/.test(requestedId)) {
      const requested = projects.find(p => String(p.id) === requestedId);
      if(requested){ currentProposalId = requested.id;currentProposalRevision=requested.revision; state = sanitizeState(requested.data); state.reference = requested.reference; mpRemoteDirty = false; }
    }
    // No locally generated numbers may be used as authoritative references.
    if(!currentProposalId && /^MP-\d{4}-\d+$/.test(state.reference))state.reference='DRAFT - save to allocate number';
    if(pricingDefaults && !currentProposalId) {
      // Unissued quotations get current master rates; saved quotations retain their own snapshot.
      state.buildRate=pricingDefaults.buildRate;state.buildVatRate=pricingDefaults.buildVatRate;state.feeVatRate=pricingDefaults.feeVatRate;
      state.contingency=pricingDefaults.contingency??0;state.validDays=pricingDefaults.validDays??30;
      state.feeMode=pricingDefaults.feeMode||'band';state.pricingBand='';
      state.stages.forEach(item=>{const v=pricingDefaults.stages.find(x=>x.id===item.id);if(v){item.rate=v.rate;item.selected=v.selected;item.bandFees={...v.bandFees};item.quotedFee=null;}});
      state.extras.forEach(item=>{const v=pricingDefaults.extras.find(x=>x.id===item.id);if(v){item.amount=v.amount;item.selected=v.selected;item.bandFees={...v.bandFees};item.quotedFee=null;}});
    }
    renderAll();
    if(!currentProposalId) {
      try {
        const savedDraft=await mpAPI('/api/my-draft');
        if(savedDraft.draft){
          const resume=document.getElementById('mpResumeDraft');
          if(resume){resume.style.display='inline-flex';resume.onclick=()=>{
            if(!confirm('Recover your unfinished cloud draft? This replaces the currently blank form.'))return;
            state=sanitizeState(savedDraft.draft);
            currentProposalId=null;currentProposalRevision=null;
            mpRemoteDirty=true;renderAll();resume.style.display='none';
            mpSyncNote('Cloud draft recovered. Continue where you left off.');
          }}
        }
      }catch(err){console.warn('Draft restoration unavailable',err)}
    }
  }catch(err){console.warn('Could not connect to Cloudflare workspace',err);toast('Cloud connection error: '+err.message);}
}

function mpSyncNote(message){
 const el=document.getElementById('mpSyncInfo');if(el)el.textContent=message;
}
function mpValidForJobSave(){
  if(!String(state.client||'').trim()||!String(state.address||'').trim()||!(Number(state.area)>0))return false;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(state.clientEmail||'').trim()))return false;
  if(state.feeMode==='band'&&!state.pricingBand)return false;
  if(state.feeMode==='bespoke'&&[...state.stages,...state.extras].some(x=>x.selected&&x.quotedFee==null))return false;
  return true;
}
function mpScheduleAutoSave(){
  mpRemoteDirty=true;mpSyncNote('Unsaved changes…');
  if(mpAutoTimer)clearTimeout(mpAutoTimer);
  mpAutoTimer=setTimeout(mpAutoSave,1800);
}
async function mpAutoSave(){
  if(mpAutoBusy){mpAutoNeedsAnotherPass=true;return}
  mpAutoBusy=true;
  const fromId=currentProposalId;
  try{
    if(mpValidForJobSave()){
      const result=await mpAPI('/api/proposals',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:fromId,revision:currentProposalRevision,data:state,silent:true})
      });
      if(fromId===currentProposalId){
        currentProposalId=result.id;currentProposalRevision=result.revision;
        state.reference=result.reference;mpRemoteDirty=false;
        if(!fromId)try{await mpAPI('/api/my-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clear:true})})}catch{}
        mpSyncNote('Cloud saved: '+result.reference);
        // No renderAll() while the staff member is typing; it resets keyboard focus.
        const field=document.querySelector('[data-field="reference"]');
        if(field)field.value=result.reference;
      }
    }else{
      await mpAPI('/api/my-draft',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({data:state})
      });
      mpSyncNote('Unfinished draft backed up to Cloudflare');
    }
  }catch(err){
    mpSyncNote('Not saved — '+err.message);
    console.warn('Cloud autosave failed',err);
  }finally{
    mpAutoBusy=false;
    if(mpAutoNeedsAnotherPass){mpAutoNeedsAnotherPass=false;mpScheduleAutoSave();}
  }
}
async function mpWhatsapp(){
  if(!state.clientPhone?.trim()){toast('Add the client’s WhatsApp number first');return}
  if(!validateClient())return;
  const saved=await mpSave();if(!saved)return;
  try{
    const fee=totals(),pay=paymentSchedule(fee);
    const message='Dear '+state.client+',\n\nThank you for meeting Mitchell Proctor Architects. Your architectural fee proposal '+state.reference+' for '+state.address+' is ready.\n\nProfessional fees including VAT: '+money2(fee.feeGross)+'.\n50% deposit on instruction: '+money2(pay.depositGross)+'.\n50% before submission: '+money2(pay.balanceGross)+'.\n\nPlease find the PDF fee proposal and acceptance page attached.\n\nMitchell Proctor Architects';
    const pdf=await mpPdfBlob();
    const file=new File([pdf],mpPdfName(),{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      // iOS / Android share sheet: user chooses WhatsApp and the recipient, then presses Send.
      await navigator.share({files:[file],title:state.reference+' Fee Proposal',text:message});
      mpSyncNote('PDF shared to chosen app — verify client received it');
    }else{
      deliverBlob(file.name,pdf);
      const phone=whatsappNumber(state.clientPhone);
      if(!/^\d{9,15}$/.test(phone))throw Error('Enter a valid mobile number');
      window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');
      toast('WhatsApp message prepared. Attach the downloaded PDF and press Send.');
    }
  }catch(err){if(err.name!=='AbortError')toast('WhatsApp preparation failed: '+err.message)}
}

// Override cloud-critical handlers; PDF is the only client quotation attachment.
// Local measurement, print and WhatsApp facilities remain unchanged.
$('#saveBtn').onclick=mpSave;
$('#newBtn').onclick=mpNew;
$('#loadBtn').onclick=mpLoad;
$('#deleteBtn').onclick=mpDelete;
$('#emailBtn').onclick=mpEmail;
$('#wordBtn').onclick=mpDownloadPdf;
$('#shareBtn').onclick=mpSharePdf;
$('#savedProjects').addEventListener('change',()=>{});
$('#whatsappBtn').onclick=mpWhatsapp;
document.querySelector('.controls').addEventListener('input',mpScheduleAutoSave);
document.querySelector('.controls').addEventListener('change',mpScheduleAutoSave);
mpConnect();