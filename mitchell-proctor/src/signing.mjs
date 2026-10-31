import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {proposalPdf} from './pdf.mjs';
const clean=s=>String(s??'').replace(/[\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim();
const latin=s=>clean(s).replace(/[^\x20-\x7e\xa0-\xff]/g,ch=>({
 '\u2013':'-','\u2014':'-','\u2018':"'",'\u2019':"'",'\u201c':'"','\u201d':'"','\u2022':'-'
}[ch]||'-'));
const money=v=>'£'+Number(v||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});
export const SIGN_LINK_DAYS=14;
export const SIGNING_STATEMENT='I have read the architectural fee proposal, including its scope, exclusions, total fee including VAT and payment schedule. I intend my electronic signature to confirm acceptance of the quoted professional fees and proposed services. I understand that any separate professional appointment terms and applicable consumer cancellation rights still apply.';
export const SIGNING_METHODS=['drawn','typed'];
export function signLink(baseUrl,token){return new URL('/sign/'+token,baseUrl).toString()}
export function signingExpiry(now=new Date()){return new Date(now.getTime()+SIGN_LINK_DAYS*86400000).toISOString()}
export function validSigningToken(token){return /^[a-f0-9]{64}$/.test(String(token||''))}
export function clipName(input,max=120){return latin(input).slice(0,max)}
export async function sha256Hex(data){
 const bytes=typeof data==='string'?new TextEncoder().encode(data):data;
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(digest).map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function validateSigningSubmission(p,recipient){
 if(!p||p.agreed!==true)return 'Confirm you accept the fee proposal and wish to sign electronically.';
 const name=clean(p.signerName),email=clean(p.signerEmail).toLowerCase();
 if(name.length<3||name.length>120)return 'Enter your full name (3 to 120 characters).';
 if(email!==String(recipient||'').trim().toLowerCase())return 'The signer email must match the address the proposal was issued to.';
 if(!SIGNING_METHODS.includes(p.method))return 'Choose a drawn signature or type your signature.';
 if(p.method==='typed'){
  if(clean(p.typedSignature).length<3||clean(p.typedSignature).length>120)return 'Type your signature to sign.';
  if(clean(p.typedSignature).toLowerCase()!==name.toLowerCase())return 'Your typed signature must match your full name.';
 }
 if(p.method==='drawn'){
  if(typeof p.signaturePng!=='string'||p.signaturePng.length>180000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(p.signaturePng))
   return 'Draw your signature on the pad before submitting.';
  try{
   const binary=atob(p.signaturePng.slice(22));
   if(binary.length<180||binary.slice(0,8)!=='\x89PNG\r\n\x1a\n')return 'The drawing does not look like a valid PNG signature.';
  }catch{return 'The drawn signature could not be read.'}
 }
 return null;
}
function drawingBytes(uri){
 const raw=atob(uri.slice('data:image/png;base64,'.length)),bytes=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
 return bytes;
}
export async function signedAcceptancePdf(snapshot,signature,now=new Date()){
 const original=await proposalPdf(snapshot);
 const originalHash=await sha256Hex(original);
 const pdf=await PDFDocument.load(original);
 const normal=await pdf.embedFont(StandardFonts.Helvetica);
 const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const italic=await pdf.embedFont(StandardFonts.HelveticaOblique);
 const page=pdf.addPage([595.28,841.89]);
 const navy=rgb(0.14,0.14,0.135),taupe=rgb(0.48,0.39,0.31),grey=rgb(0.37,0.37,0.37),white=rgb(1,1,1);
 page.drawRectangle({x:0,y:766,width:595.28,height:75,color:navy});
 page.drawText('MITCHELL PROCTOR',{x:48,y:800,size:17,font:bold,color:white,characterSpacing:1.7});
 page.drawText('ARCHITECTS  |  ELECTRONIC ACCEPTANCE',{x:48,y:782,size:8,font:normal,color:rgb(.86,.80,.74)});
 let y=733;
 const line=(label,value,offset=12)=>{
  page.drawText(latin(label),{x:48,y,size:10,font:bold,color:taupe});
  page.drawText(latin(value).slice(0,76),{x:195,y,size:10,font:normal,color:navy});
  y-=offset+13;
 };
 page.drawText('CLIENT SIGNATURE & ACCEPTANCE RECORD',{x:48,y,size:15,font:bold,color:navy});y-=43;
 line('Proposal reference',snapshot.reference,17);
 line('Project address',String(snapshot.site_address||'').slice(0,57),17);
 line('Accepted fee ex VAT',money(snapshot.fee_ex_vat),17);
 const v=JSON.parse(snapshot.payload),vat=(Number(v.feeVatRate)||0);
 line('Fee including VAT',money(Number(snapshot.fee_ex_vat)*(1+vat/100)),17);
 line('Signed by',signature.signerName,17);
 line('Signatory email',signature.signerEmail,17);
 line('Date and time (UTC)',now.toISOString().replace('T',' ').replace('Z',' UTC'),17);
 line('Signature type',signature.method==='typed'?'Typed electronic signature':'Hand-drawn electronic signature',17);
 y-=9;
 page.drawText('Electronic signature:',{x:48,y,size:10,font:bold,color:taupe});y-=14;
 if(signature.method==='drawn'){
  const png=await pdf.embedPng(drawingBytes(signature.signaturePng));
  const scaled=png.scaleToFit(325,115);
  page.drawImage(png,{x:62,y:y-119+(119-scaled.height)/2,width:scaled.width,height:scaled.height});
 }else{
  page.drawText(latin(signature.typedSignature).slice(0,65),{x:67,y:y-80,size:28,font:italic,color:navy});
 }
 y-=133;
 page.drawLine({start:{x:48,y},end:{x:547,y},color:rgb(.78,.76,.73),thickness:.8});
 y-=26;
 const text=SIGNING_STATEMENT;
 function wrapped(txt,maxwidth,size=9.4){
  let l='',out=[];
  for(const word of latin(txt).split(' ')){
   const candidate=l?l+' '+word:word;
   if(normal.widthOfTextAtSize(candidate,size)>maxwidth&&l){out.push(l);l=word}
   else l=candidate;
  }
  if(l)out.push(l);return out;
 }
 page.drawText('Statement accepted by the client:',{x:48,y,size:10,font:bold,color:taupe});y-=21;
 for(const row of wrapped(text,499)){page.drawText(row,{x:48,y,size:9.4,font:normal,color:grey});y-=14}
 y-=19;
 page.drawText('Original fee proposal SHA-256:',{x:48,y,size:8.7,font:bold,color:taupe});y-=15;
 page.drawText(originalHash,{x:48,y,size:8,font:normal,color:grey});y-=20;
 const certificate=await sha256Hex(snapshot.reference+'|'+signature.signerEmail+'|'+now.toISOString()+'|'+originalHash);
 page.drawText('Signing record ID: '+certificate.slice(0,28).toUpperCase(),{x:48,y,size:8,font:bold,color:grey});y-=15;
 page.drawText('This record is an electronic acceptance, not an independently certified or qualified digital signature.',{x:48,y,size:8.1,font:normal,color:grey});
 page.drawLine({start:{x:48,y:58},end:{x:547,y:58},thickness:.6,color:rgb(.75,.72,.68)});
 page.drawText('Mitchell Proctor Architects | Electronic signing record retained with the project file',{x:48,y:42,size:8,font:normal,color:grey});
 const result=await pdf.save({useObjectStreams:false});
 return {bytes:result,originalHash,pdfHash:await sha256Hex(result),certificateId:certificate};
}
