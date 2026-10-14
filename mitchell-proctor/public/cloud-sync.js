/* Cloudflare sync layer over the existing branded MP Fee Studio. */
let currentProposalId = null;
let pricingDefaults = null;
let mpRemoteDirty = false;
const mpBaseBlank = blank;
blank = function () {
  const s = mpBaseBlank();
  s.reference = 'DRAFT - save to allocate number';
  if (pricingDefaults) {
    s.buildRate = pricingDefaults.buildRate;
    s.buildVatRate = pricingDefaults.buildVatRate;
    s.feeVatRate = pricingDefaults.feeVatRate;
    for (const entry of s.stages) {
      const found = pricingDefaults.stages?.find(a => a.id === entry.id);
      if (found) { entry.rate = found.rate; entry.selected = found.selected; }
    }
    for (const entry of s.extras) {
      const found = pricingDefaults.extras?.find(a => a.id === entry.id);
      if (found) { entry.amount = found.amount; entry.selected = found.selected; }
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
  try {
    const result = await mpAPI('/api/proposals', {
      method: 'POST', headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ id:currentProposalId, data:state })
    });
    currentProposalId = result.id;
    state.reference = result.reference;
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
    if (currentProposalId===p.id) {currentProposalId=null;state=blank();renderAll();}
    await mpRefreshProjects(); toast('Project deleted.');
  } catch(err){ toast('Delete failed: '+err.message); }
}
function mpNew() {
  if(mpRemoteDirty && !confirm('Current changes are not saved to the shared workspace. Start a new job?'))return;
  currentProposalId=null; state=blank();mpRemoteDirty=false;renderAll();
  toast('New draft. An MP job reference is allocated when saved.');
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
  wrap.style.display='inline-flex';wrap.style.gap='8px';wrap.style.alignItems='center';
  wrap.innerHTML='<span style="color:#ddd;font-size:12px" id="mpAccountName">Signed in</span>'+
    '<a id="mpOwnerLink" href="/owner" class="btn ghost small" style="display:none">Owner settings</a>'+
    '<button id="mpSignOut" type="button" class="btn ghost small">Sign out</button>';
  mast.append(wrap);
  document.getElementById('mpSignOut').onclick=async()=>{await mpAPI('/api/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});location.href='/login'};
}
async function mpConnect() {
  mpAddHeader();
  try {
    const me=await mpAPI('/api/session');
    if(!me.authenticated){location.href='/login';return;}
    const el=document.getElementById('mpAccountName');if(el)el.textContent=me.user.name;
    if(me.user.role==='owner')document.getElementById('mpOwnerLink').style.display='inline-flex';
    const result=await mpAPI('/api/pricing');pricingDefaults=result.pricing;
    await mpRefreshProjects();
    const requestedId = new URLSearchParams(location.search).get('proposal');
    if (requestedId && /^\d+$/.test(requestedId)) {
      const requested = projects.find(p => String(p.id) === requestedId);
      if(requested){ currentProposalId = requested.id; state = sanitizeState(requested.data); state.reference = requested.reference; mpRemoteDirty = false; }
    }
    // No locally generated numbers may be used as authoritative references.
    if(!currentProposalId && /^MP-\d{4}-\d+$/.test(state.reference))state.reference='DRAFT - save to allocate number';
    if(pricingDefaults && !requestedId) {
      // Use global pricing defaults on first app load; later drafts retain their chosen rates.
      state.buildRate=pricingDefaults.buildRate;state.buildVatRate=pricingDefaults.buildVatRate;state.feeVatRate=pricingDefaults.feeVatRate;
      state.stages.forEach(s=>{const v=pricingDefaults.stages.find(x=>x.id===s.id);if(v){s.rate=v.rate;s.selected=v.selected;}});
      state.extras.forEach(s=>{const v=pricingDefaults.extras.find(x=>x.id===s.id);if(v){s.amount=v.amount;s.selected=v.selected;}});
    }
    renderAll();
  }catch(err){console.warn('Could not connect to Cloudflare workspace',err);toast('Cloud connection error: '+err.message);}
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
document.querySelector('.controls').addEventListener('input',()=>{mpRemoteDirty=true});
mpConnect();