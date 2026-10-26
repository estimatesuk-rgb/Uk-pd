import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// Server-side PDF generation. The same PDF is downloaded by the practice and
// attached to client emails; no editable Word document is issued.
const PAGE_W=595.28, PAGE_H=841.89, LEFT=48, RIGHT=547;
const INK=rgb(0.16,0.16,0.16), FADED=rgb(0.39,0.37,0.34);
const TAUPE=rgb(0.48,0.39,0.31), BORDER=rgb(0.83,0.80,0.75);
const SOFT=rgb(0.965,0.953,0.936), WHITE=rgb(1,1,1);
const money=v=>'£'+(Number(v)||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
const val=x=>String(x??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim();
const safe=x=>val(x).replace(/[^\u0020-\u007e\u00a0-\u00ff]/g,c=>({
  '\u2013':'-','\u2014':'-','\u2019':"'",'\u2018':"'",'\u201c':'"','\u201d':'"',
  '\u2022':'-','\u2026':'...','\u20ac':'EUR','\u00a3':'£'
}[c]||'-'));
const cents=x=>Math.round(Number(x||0)*100);
const pounds=x=>money((Number(x)||0)/100);
function feeLines(p){
  const area=Number(p.area)||0,chargeArea=area>0&&area<25?25:area;
  const mode=p.feeMode||'sqm',band=p.pricingBand;
  const quote=(x,fallback)=>{
    if(mode==='sqm')return fallback;
    if(x.quotedFee!==null&&x.quotedFee!==undefined&&x.quotedFee!=='')return Number(x.quotedFee);
    return mode==='bespoke'?0:Number(x.bandFees?.[band]??0);
  };
  const lines=[];
  for(const item of Array.isArray(p.stages)?p.stages:[]){
    if(item.selected)lines.push({name:val(item.title||'Architectural service'),description:val(item.scope),fee:cents(quote(item,Number(item.rate||0)*chargeArea))});
  }
  for(const item of Array.isArray(p.extras)?p.extras:[]){
    if(item.selected)lines.push({name:val(item.title||'Additional service'),description:val(item.desc),fee:cents(quote(item,Number(item.amount)||0))});
  }
  for(const item of Array.isArray(p.adjustments)?p.adjustments:[]){
    if(Number(item.amount)>0)lines.push({name:val(item.description||'Fee adjustment'),fee:(item.kind==='omission'?-1:1)*cents(item.amount)});
  }
  return lines;
}
export async function proposalPdf(row){
  const p=JSON.parse(row.payload);
  const doc=await PDFDocument.create();
  doc.setTitle('Mitchell Proctor Architects - Architectural Fee Proposal '+safe(row.reference));
  doc.setAuthor('Mitchell Proctor Architects');
  doc.setSubject('Professional architectural services fee proposal');
  const normal=await doc.embedFont(StandardFonts.Helvetica);
  const bold=await doc.embedFont(StandardFonts.HelveticaBold);
  let page,y;let n=0;
  const lineHeight=13.2;
  function newPage(){
    page=doc.addPage([PAGE_W,PAGE_H]);n++;y=PAGE_H-106;
    page.drawRectangle({x:0,y:PAGE_H-75,width:PAGE_W,height:75,color:rgb(0.14,0.14,0.135)});
    page.drawText('MITCHELL PROCTOR',{x:LEFT,y:PAGE_H-41,size:17,font:bold,color:WHITE,characterSpacing:1.8});
    page.drawText('ARCHITECTS | FEE PROPOSAL',{x:LEFT,y:PAGE_H-59,size:8,font:normal,color:rgb(0.83,0.77,0.70),characterSpacing:1.0});
    page.drawText(safe(row.reference),{x:RIGHT-110,y:PAGE_H-46,size:9,font:bold,color:WHITE});
    page.drawLine({start:{x:LEFT,y:52},end:{x:RIGHT,y:52},thickness:0.7,color:BORDER});
    page.drawText('Mitchell Proctor Architects   |   enquiries@ukestimates.com   |   01246 203196',{x:LEFT,y:37,size:8,font:normal,color:FADED});
  }
  function ensure(h){if(!page||y-h<70)newPage()}
  function wrap(text,maxWidth,font=normal,size=10){
    const words=safe(text).split(/\s+/).filter(Boolean), lines=[];let line='';
    for(const word of words){
      const attempt=line?line+' '+word:word;
      if(font.widthOfTextAtSize(attempt,size)>maxWidth&&line){lines.push(line);line=word}
      else line=attempt;
      while(font.widthOfTextAtSize(line,size)>maxWidth&&line.length>1){
        let k=line.length-1;while(k>1&&font.widthOfTextAtSize(line.slice(0,k),size)>maxWidth)k--;
        lines.push(line.slice(0,k));line=line.slice(k);
      }
    }
    if(line)lines.push(line);
    return lines.length?lines:[' '];
  }
  function text(t,options={}){
    const size=options.size||9.8,font=options.bold?bold:normal,width=options.width||499;
    const lines=wrap(t,width,font,size),step=options.leading||lineHeight;
    ensure(lines.length*step+3);
    for(const line of lines){page.drawText(line,{x:options.x||LEFT,y,size,font,color:options.color||INK});y-=step}
    y-=options.gap===undefined?7:options.gap;
  }
  function section(title){
    ensure(43);y-=7;
    page.drawRectangle({x:LEFT,y:y-6,width:PAGE_W-LEFT*2,height:25,color:SOFT});
    page.drawText(safe(title),{x:LEFT+11,y:y+2,size:11,font:bold,color:TAUPE});y-=41;
  }
  function detail(label,value){
    const w=310, lines=wrap(value||'-',w,normal,9.6),h=Math.max(22,lines.length*13+8);ensure(h+4);
    page.drawText(safe(label),{x:LEFT,y,size:9,font:bold,color:FADED});
    let py=y;for(const l of lines){page.drawText(l,{x:LEFT+158,y:py,size:9.6,font:normal,color:INK});py-=13}
    y-=h;
  }
  function tableRow(label,amount,opts={}){
    const height=Math.max(23,wrap(label,355,opts.bold?bold:normal,9.4).length*12+8);
    ensure(height+3);
    if(opts.shade)page.drawRectangle({x:LEFT,y:y-height+7,width:499,height:height+2,color:SOFT});
    const lines=wrap(label,340,opts.bold?bold:normal,9.4);
    for(const [i,l] of lines.entries())page.drawText(l,{x:LEFT+9,y:y-7-i*12,size:9.4,font:opts.bold?bold:normal,color:INK});
    const m=safe(amount);
    page.drawText(m,{x:RIGHT-9-(opts.bold?bold:normal).widthOfTextAtSize(m,9.4),y:y-7,size:9.4,font:opts.bold?bold:normal,color:INK});
    y-=height;
    page.drawLine({start:{x:LEFT,y:y+5},end:{x:RIGHT,y:y+5},color:BORDER,thickness:0.35});
  }
  function fourCol(header=false,values=[],opts={}){
    const sizes=[238,87,87,87],xs=[LEFT,LEFT+238,LEFT+325,LEFT+412];
    const fonts=opts.bold?bold:normal;
    const cols=values.map((v,i)=>wrap(v,sizes[i]-12,fonts,8.6));
    const h=Math.max(26,...cols.map(x=>x.length*12+8));ensure(h+7);
    if(header||opts.shade)page.drawRectangle({x:LEFT,y:y-h+8,width:499,height:h,color:header?rgb(0.91,0.88,0.84):SOFT});
    for(let i=0;i<4;i++)cols[i].forEach((line,k)=>{
      let x=xs[i]+8;if(i>0)x=xs[i]+sizes[i]-8-fonts.widthOfTextAtSize(line,8.6);
      page.drawText(line,{x,y:y-8-k*12,size:8.6,font:fonts,color:INK});
    });
    y-=h;page.drawLine({start:{x:LEFT,y:y+7},end:{x:RIGHT,y:y+7},color:BORDER,thickness:0.45});
  }
  function paragraph(t){text(t,{size:9.6,leading:14,gap:11})}
  function pageGap(){y-=11}
  newPage();
  text('ARCHITECTURAL FEE PROPOSAL',{size:20,bold:true,gap:5,color:TAUPE});
  text('Reference '+safe(row.reference)+'   |   Issued '+new Date().toLocaleDateString('en-GB')+'   |   Status: '+safe(row.job_status||'pending').toUpperCase(),{size:9,color:FADED,gap:17});
  paragraph('Thank you for inviting Mitchell Proctor Architects to provide our professional fee proposal. Please review the selected services, exclusions and payment schedule, together with the acceptance section.');
  section('01  Client and project');
  detail('Client',p.client||row.client);
  detail('Client contact',p.clientEmail||row.client_email);
  if(p.clientPhone)detail('Telephone',p.clientPhone);
  if(p.clientAddress)detail('Correspondence address',p.clientAddress);
  detail('Project',p.projectName||'Architectural project');
  detail('Site',p.address||row.site_address);
  detail('Project type',p.projectType||'To be agreed');
  detail('Gross internal area',(Number(p.area)||0).toLocaleString('en-GB')+' m2');
  section('02  Indicative construction budget');
  const area=Number(p.area)||0,rate=Number(p.buildRate)||0,build=area*rate,cont=build*(Number(p.contingency)||0)/100;
  const buildVat=(build+cont)*(Number(p.buildVatRate)||0)/100;
  tableRow('Construction allowance, '+area.toLocaleString('en-GB')+' m2 @ '+money(rate)+'/m2',money(build));
  if(cont) tableRow('Provisional construction contingency',money(cont));
  tableRow('Construction VAT allowance ('+(Number(p.buildVatRate)||0)+'%)',money(buildVat));
  tableRow('Indicative budget including VAT',money(build+cont+buildVat),{bold:true,shade:true});
  paragraph('This budget is indicative only and is not a tendered construction price. Actual VAT liability and construction costs require project-specific confirmation.');
  section('03  Architectural services and proposed fees');
  const lines=feeLines(p);const fee=cents(row.fee_ex_vat),vatRate=Number(p.feeVatRate)||0;
  const vat=Math.round(fee*vatRate/100),gross=fee+vat;
  if(!lines.length)paragraph('No fee services are selected. Please confirm scope before issue.');
  for(const item of lines) tableRow(item.name,pounds(item.fee));
  pageGap();
  tableRow('Professional fees excluding VAT',pounds(fee),{bold:true,shade:true});
  tableRow('VAT ('+vatRate+'%)',pounds(vat));
  tableRow('Professional fees including VAT',pounds(gross),{bold:true,shade:true});
  const feeBasis=p.feeMode==='band'?'Fixed project-category prices ('+safe(p.pricingBand||'unselected')+'), adjusted for agreed individual services.':p.feeMode==='bespoke'?'Project-specific bespoke fees agreed for each commissioned service.':'Fees use individual £/m2 rates and a minimum 25 m2 floor for selected per-m2 stages.';
  paragraph(feeBasis+' The final scope and pricing remain subject to formal appointment.');
  section('04  Exclusions and other appointments');
  const omitted=(p.stages||[]).filter(x=>!x.selected).map(x=>val(x.title));
  const excluded=[...(p.exclusions||[]).filter(x=>x.on).map(x=>val(x.title)),...val(p.extraExclusions).split(';').filter(Boolean)];
  if(omitted.length){text('Omitted architectural services:',{bold:true});for(const v of omitted)text(' - '+v,{size:9.3,gap:2})}
  if(excluded.length){text('Exclusions and third-party services:',{bold:true});for(const v of excluded)text(' - '+v,{size:9.3,gap:2})}
  paragraph('Statutory application fees, third-party consultants, specialist surveys and biodiversity unit purchases are excluded unless specifically stated as included. Discharge of planning conditions requires a separately agreed instruction unless itemised.');
  section('05  Scope and appointment');
  paragraph(p.scopeNotes||'The service is subject to an agreed written brief, access and programme.');
  paragraph('Changes to the brief, substantial redesign, abortive work and extra submissions require a separate written quotation and instruction. Planning consent and Building Regulations approval cannot be guaranteed.');
  section('06  Deposit and pre-submission payment schedule');
  paragraph('Professional fees only. Each selected service is payable 50% on written instruction and 50% before issue of the corresponding submission or deliverable. For services without formal submission, the balance is due before delivery or completion.');
  fourCol(true,['Commissioned service','Fee ex VAT','Deposit 50%','Balance 50%']);
  // Balance of the last item absorbs any one-penny rounding difference.
  const depositNet=Math.round(fee/2);let allocations=0;
  for(let i=0;i<lines.length;i++){
    const a=lines[i],remaining=i===lines.length-1?depositNet-allocations:Math.round(a.fee/2);
    allocations+=remaining;
    fourCol(false,[a.name,pounds(a.fee),pounds(remaining),pounds(a.fee-remaining)]);
  }
  if(!lines.length)fourCol(false,['No services selected','','','']);
  const depositGross=Math.round(gross/2);
  fourCol(false,['Professional fees ex VAT',pounds(fee),pounds(depositNet),pounds(fee-depositNet)],{bold:true,shade:true});
  fourCol(false,['VAT',pounds(vat),pounds(depositGross-depositNet),pounds(gross-depositGross-fee+depositNet)],{bold:true});
  fourCol(false,['TOTAL INCLUDING VAT',pounds(gross),pounds(depositGross),pounds(gross-depositGross)],{bold:true,shade:true});
  paragraph('Deposit amounts include applicable VAT. Fee credits reduce both instalments. Payment is subject to the written appointment, invoices and applicable consumer rights.');
  section('07  Budget summary');
  tableRow('Construction budget including VAT',money(build+cont+buildVat));
  tableRow('Professional fees including VAT',pounds(gross));
  tableRow('Indicative combined budget including VAT',money(build+cont+buildVat+gross/100),{bold:true,shade:true});
  paragraph('The combined budget is not an all-inclusive development appraisal. Land, finance, statutory costs and separately appointed specialists remain outside the allowance.');
  // Give the acceptance form a clear, standalone final page with signing space.
  newPage();y-=7;
  section('08  Client acceptance');
  paragraph('I/We have reviewed the proposed services, exclusions, fee breakdown, VAT and staged payment schedule. I/We request formal appointment documentation for the selected services and acknowledge that no work commences until written scope, appointment terms and any applicable consumer cancellation information are agreed.');
  pageGap();
  tableRow('Proposal reference',safe(row.reference));
  tableRow('Client / organisation',safe(p.client||row.client));
  tableRow('Fee excluding VAT',pounds(fee));
  tableRow('VAT',pounds(vat));
  tableRow('Total fee including VAT',pounds(gross),{bold:true,shade:true});
  tableRow('50% deposit including VAT',pounds(depositGross),{bold:true});
  tableRow('50% balance including VAT',pounds(gross-depositGross),{bold:true});
  pageGap();pageGap();
  text('Client full name:   _________________________________________________',{size:10,gap:19});
  text('Client signature:   _________________________________________________',{size:10,gap:19});
  text('Date of signature:  _________________________________________________',{size:10,gap:19});
  text('Client email:       _________________________________________________',{size:10,gap:19});
  paragraph('Return the signed acceptance to enquiries@ukestimates.com. Statutory permissions cannot be guaranteed. The professional services appointment will govern the final terms of instruction.');
  const pages=doc.getPages();
  for(let i=0;i<pages.length;i++)pages[i].drawText('Page '+(i+1)+' of '+pages.length,{x:RIGHT-70,y:37,size:8,font:normal,color:FADED});
  return await doc.save({useObjectStreams:false});
}
