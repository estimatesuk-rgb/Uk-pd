import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {PDFDocument} from 'pdf-lib';
import {SIGN_LINK_DAYS,SIGNING_STATEMENT,signingExpiry,validSigningToken,signLink,validateSigningSubmission,signedAcceptancePdf,sha256Hex} from '../src/signing.mjs';
import {makePricingDefaults} from '../src/pricing-defaults.mjs';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
assert.equal(SIGN_LINK_DAYS,14);
assert.equal(signingExpiry(new Date('2026-10-01T00:00:00Z')),'2026-10-15T00:00:00.000Z');
const token='c'.repeat(64);
assert.equal(validSigningToken(token),true);
assert.equal(validSigningToken('short'),false);
assert.equal(signLink('https://mitchell-proctor-fees.estimates-uk.workers.dev/job',token),'https://mitchell-proctor-fees.estimates-uk.workers.dev/sign/'+token);
const input={signerName:'A Client',signerEmail:'test@example.com',method:'typed',typedSignature:'A Client',agreed:true};
assert.equal(validateSigningSubmission(input,'test@example.com'),null);
assert.match(validateSigningSubmission({...input,agreed:false},'test@example.com'),/Confirm/);
assert.match(validateSigningSubmission({...input,signerEmail:'wrong@example.com'},'test@example.com'),/email/);
assert.match(validateSigningSubmission({...input,typedSignature:'Different Person'},'test@example.com'),/match/);
assert.match(validateSigningSubmission({...input,method:'drawn',signaturePng:''},'test@example.com'),/Draw/);
assert.match(SIGNING_STATEMENT,/consumer cancellation rights/);
const catalog=makePricingDefaults();
const payload={
 feeMode:'band',pricingBand:'medium',client:'A Client',clientEmail:'test@example.com',
 area:44,buildRate:2500,feeVatRate:20,buildVatRate:20,contingency:0,projectName:'Example extension',
 stages:catalog.stages,extras:catalog.extras,adjustments:[]
};
const row={reference:'MP-2026-12345',client:'A Client',client_email:'test@example.com',
 site_address:'14 Example Road, Chesterfield',payload:JSON.stringify(payload),fee_ex_vat:5400};
const signed=await signedAcceptancePdf(row,input,new Date('2026-10-31T10:00:00Z'));
assert.equal(Buffer.from(signed.bytes).subarray(0,5).toString(),'%PDF-');
assert.match(signed.originalHash,/^[a-f0-9]{64}$/);
assert.match(signed.pdfHash,/^[a-f0-9]{64}$/);
assert.notEqual(signed.originalHash,signed.pdfHash);
assert.equal(await sha256Hex(signed.bytes),signed.pdfHash);
const pdf=await PDFDocument.load(signed.bytes),normal=await PDFDocument.load(await (await import('../src/pdf.mjs')).proposalPdf(row));
assert.equal(pdf.getPageCount(),normal.getPageCount()+1,'Signed PDF adds an evidence and signature page');
assert.ok(pdf.getTitle()?.includes('MP-2026-12345'));
const server=read('src/index.mjs'),ui=read('public/sign.html'),job=read('public/job.html');
assert.match(server,/CREATE TABLE IF NOT EXISTS signature_requests/);
assert.match(server,/token_hash TEXT NOT NULL UNIQUE/);
assert.match(server,/status='processing'/);
assert.match(server,/signedAcceptancePdf/);
assert.match(server,/status='revoked'/);
assert.match(server,/if\(publicSign\)/);
assert.match(server,/signed_file_id/);
assert.match(server,/sign-invite\|sign-revoke/);
assert.match(server,/\/sign\\\/\[a-f0-9\]\{64\}/);
assert.match(ui,/signatureCanvas/);
assert.match(ui,/typeTab/);
assert.match(ui,/acceptTerms/);
assert.match(job,/createSignatureInvite/);
assert.match(job,/signatureHistory/);
const scripts=[...ui.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length,1);
new Script(scripts[0][1],{filename:'sign.html'});
console.log('Digital signing checks passed: expiring token, intent, email check, evidence PDF, immutable snapshot, public UI and job history.');
