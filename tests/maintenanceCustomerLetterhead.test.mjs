import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const html=readFileSync(new URL('../public/maintenance/index.html',import.meta.url),'utf8');
function extract(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing source section '+start+' -> '+end);
  return html.slice(a,b);
}
const clean=value=>String(value??'').trim();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('same named customer keeps letterhead, other customers cannot inherit it',()=>{
  const state={client:'Wates Property Services'};
  const script='let customerLetterhead=null;const $=id=>({value:state.client});'+
    extract('function customerBrandKey(){','function updateCustomerLetterheadPreview(')+
    'return {key:customerBrandKey,active:activeCustomerLetterhead,set:b=>{customerLetterhead=b}};';
  const fn=new Function('state','clean',script)(state,clean);
  const key=fn.key();
  fn.set({key,dataUrl:'data:image/png;base64,ZmFrZQ=='});
  assert.ok(fn.active());
  state.client='Other Council';
  assert.equal(fn.active(),null,'client-owned branding must not leak');
  assert.notEqual(fn.key(),key);
  state.client=' WATES   PROPERTY SERVICES ';
  assert.equal(fn.key(),key);
  assert.ok(fn.active());
});

test('letterhead uploads are private, client-scoped and limited to supported images/PDF',()=>{
  assert.match(html,/id="client-letterhead-file"/);
  assert.match(html,/id="client-letterhead-remove"/);
  assert.match(html,/const allowed=\['png','jpg','jpeg','webp','pdf'\]/);
  assert.match(html,/await put\(key,brand\)/);
  assert.match(html,/key!==customerBrandKey\(\)/);
  assert.match(html,/function letterheadSourceCanvas\(/);
});

test('printed reports use client header and always include fixed UK Estimates credit',()=>{
  const code=extract('function reportHeaderHtml(','function setPercent(');
  const ctx={customer:{key:'wates',dataUrl:'data:image/png;base64,ZmFrZQ=='},client:'Wates',reference:'W-001'};
  const model=new Function('ctx','esc','clean','const $=id=>({value:ctx[id]||""});'+
    'const activeCustomerLetterhead=()=>ctx.customer;'+
    'const UK_EST_LOGO="/maintenance/uk-estimates-logo.png";'+
    'const activeJobId="UKM-000007";'+
    'const reportCurrentId=()=>({jobId:"UKM-000007",id:"UKE-UKM-000007-BOQ-TEST",hash:"abcdef0123456789"});'+
    code+'return {header:reportHeaderHtml,footer:reportUKFooterHtml};')(ctx,esc,clean);
  const top=model.header('BILL OF QUANTITIES','Works','Draft');
  assert.match(top,/report-client-letterhead/);
  assert.match(top,/data:image\/png;base64,ZmFrZQ==/);
  assert.match(top,/BILL OF QUANTITIES/);
  const foot=model.footer('boq');
  for(const term of ['UK Estimates Ltd','uk-estimates-logo.png','www.ukestimates.com','Enquiries@ukestimates.com','01246 203196','UKE-UKM-000007-BOQ-TEST']){
    assert.ok(foot.includes(term),term+' is mandatory on each report');
  }
  ctx.customer=null;
  const defaultTop=model.header('BILL OF QUANTITIES','Works','Draft');
  assert.match(defaultTop,/uk-estimates-logo.png/);
  assert.ok(!defaultTop.includes('report-client-letterhead'));
});

function fakeSheet(name,last=25,filter=20){
  const cells=new Map(),rows=new Map(),merged=[],images=[];
  return {name,lastRow:{number:last},autoFilter:{to:{row:filter}},headerFooter:{},pageSetup:{},
    cells,rows,merged,images,
    getCell(ref){if(!cells.has(ref))cells.set(ref,{protection:{locked:true}});return cells.get(ref);},
    getRow(n){if(!rows.has(n))rows.set(n,{height:15});return rows.get(n);},
    mergeCells(r){merged.push(r);},
    addImage(index,pos){images.push({index,pos});},
    async protect(pass,opts){this.isProtected=true;this.pwd=pass;this.opts=opts;}
  };
}
const cellText=(ws,address,value)=>{const c=ws.getCell(address);c.value=value;return c;};

test('every Excel tab contains fixed UK branding and is protected, with intended inputs editable',async()=>{
  const source=extract('async function stampProtectedUKAttribution(wb,images,type){','function appendJobProgrammeWorksheet(wb,logo){');
  const stamp=new Function('reportCurrentId','crypto','UK_EST_PALETTE','cellReportText',
    source+'return stampProtectedUKAttribution;')(
      ()=>({id:'UKE-TEST',hash:'abcdef0123456789'}),webcrypto,
      {navy:'172C49',muted:'68788F'},cellText);
  const sheets=[fakeSheet('Bill of Quantities',40,37),fakeSheet('Project Summary',25,20),
    fakeSheet('Job Programme',30,26),fakeSheet('Source Row Audit',130,125),
    fakeSheet('Signed Labour Timesheet',28,25)];
  await stamp({worksheets:sheets},{uk:19,customer:30},'boq');
  for(const ws of sheets){
    assert.ok(ws.isProtected,ws.name+' protected');
    assert.ok(ws.pwd.length>=24,ws.name+' has password');
    assert.ok(ws.images.some(i=>i.index===19),ws.name+' footer UK logo');
    assert.match(ws.headerFooter.oddFooter,/www.ukestimates.com/);
    assert.match(ws.headerFooter.oddFooter,/Enquiries@ukestimates.com/);
    assert.match(ws.headerFooter.oddFooter,/01246 203196/);
    assert.match(ws.printArea,/^A1:L\d+$/);
    const text=[...ws.cells.values()].map(c=>String(c.value??'')).join(' ');
    assert.match(text,/Produced using UK Estimates Ltd/);
    assert.match(text,/Report ID: UKE-TEST/);
  }
  assert.equal(sheets[0].getCell('F8').protection.locked,false);
  assert.equal(sheets[0].getCell('E13').protection.locked,false);
  for(const c of ['F','G','H','I','J','L'])assert.equal(sheets.at(-1).getCell(c+'12').protection.locked,false);
  assert.equal(sheets[0].getCell('D43').protection.locked,true);
});

test('Excel header chooses correct customer banner and does not stretch it',()=>{
  const code=extract('function writeBoqBrandHeader(ws,logo,title,subtitle){','function writeBoqInfo(');
  const make=new Function('cellReportText','UK_EST_PALETTE','boqFill',
    code+'return writeBoqBrandHeader;');
  const write=make(cellText,{navy:'172C49',red:'ED1017',muted:'68788F'},v=>v);
  const ours=fakeSheet('A');
  write(ours,{uk:10,customer:20,customerDetails:{width:1400,height:240}},'BILL OF QUANTITIES','SOR');
  assert.equal(ours.images[0].index,20);
  assert.match(ours.getCell('A3').value,/BILL OF QUANTITIES/);
  assert.ok(ours.images[0].pos.ext.height>0);
  const standard=fakeSheet('B');
  write(standard,{uk:10,customer:null},'BILL OF QUANTITIES','SOR');
  assert.equal(standard.images[0].index,10);
});

test('SHA-256 identifies any changed bytes, even if a filename stays the same',async()=>{
  const source=extract('async function reportDigest(bytes){','function reportIssueData(kind){');
  const hash=new Function('crypto','TextEncoder',source+'return reportDigest;')(webcrypto,TextEncoder);
  const a=await hash(new TextEncoder().encode('Original UK Estimates workbook'));
  const b=await hash(new TextEncoder().encode('Original UK Estimates workbook!'));
  assert.notEqual(a,b);
  assert.equal(a.length,64);
});

test('BoQ, SMV and subcontract exports register issuance and fixed footer stamping',()=>{
  for(const kind of ['boq','programme','timesheet']){
    assert.ok(html.includes("await prepareReportIssue('"+kind+"')"),kind+' issue ref');
    assert.ok(html.includes("await stampProtectedUKAttribution(wb,logo,'"+kind+"')"),kind+' stamp');
    assert.ok(html.includes("await retainIssuedReport('"+kind+"'"),kind+' recorded');
  }
  assert.match(html,/id="verify-excel-button"/);
  assert.match(html,/entry\.fileHash===hash/);
  assert.match(html,/\.report-powered-footer\{[\s\S]*?position:fixed!important/);
});
