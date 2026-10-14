import {proposalPdf} from '../src/pdf.mjs';
const payload={
 area:36,buildRate:2250,buildVatRate:20,feeVatRate:20,contingency:3,projectName:'Extension test',client:'Sample Owner',
 clientEmail:'owner@example.com',clientPhone:'01234 000000',address:'10 Test Road, Chesterfield',projectType:'Home extension',
 stages:[{title:'Planning Application',rate:45,selected:true,scope:'Preparation and submission of plans and architectural notes'},
         {title:'Building Regulations',rate:55,selected:true,scope:'Construction detail and coordination'}],
 extras:[{title:'Consultation',amount:350,selected:true}],adjustments:[],
 exclusions:[{title:'Structural engineer',on:true}],scopeNotes:'Site to be surveyed. Appointment subject to written terms.',
};
const row={reference:'MP-2026-TEST',payload:JSON.stringify(payload),client:'Sample Owner',site_address:payload.address,
 client_email:payload.clientEmail,fee_ex_vat:3950,job_status:'pending'};
const pdf=await proposalPdf(row);
if(!(pdf instanceof Uint8Array)||pdf.length<3000)throw Error('PDF generation failed');
if(new TextDecoder().decode(pdf.subarray(0,8)).indexOf('%PDF-')!==0)throw Error('Invalid PDF header');
const {PDFDocument}=await import('pdf-lib');const reopened=await PDFDocument.load(pdf);
if(reopened.getPageCount()<2)throw Error('Acceptance and full fee breakdown pages missing');
console.log('PDF test passed: '+pdf.length+' bytes, '+reopened.getPageCount()+' pages');
