import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
const root=new URL('../',import.meta.url);
const src=readFileSync(new URL('public/pdf-delivery.js',root),'utf8');
const server=readFileSync(new URL('src/index.mjs',root),'utf8');
const page=readFileSync(new URL('public/app.html',root),'utf8');
assert.match(page,/src="\/cloud-sync\.js"[\s\S]*src="\/pdf-delivery\.js"/);
assert.match(server,/if\(path==='\/pdf-delivery\.js'\)/);
assert.match(server,/delivery-log/);
assert.match(server,/sent_proposal/);
assert.match(server,/base64FromBytes\(pdf\)/);
assert.match(src,/navigator\.share\(\{files:\[prepared\.file\]/);
assert.match(src,/mpDeliveryConfirmSent/);
assert.match(src,/mpDeliverySendOutlook/);
assert.match(src,/mpDeliverySendPracticeEmail/);
assert.match(src,/mpPrepareDelivery/);
new Script(src,{filename:'pdf-delivery.js'});
let called=0;
const fakeStatus={textContent:'',style:{}};
const state={reference:'MP-2026-01234',client:'Test Client',clientEmail:'client@example.com'};
const ctx=createContext({
 navigator:{share:(payload)=>{called++;assert.equal(payload.files.length,1);assert.equal(payload.files[0].name,'MP-2026-01234.pdf');return Promise.resolve()},canShare:(obj)=>obj.files.length===1},
 document:{getElementById:(id)=>id==='mpDeliveryStatus'?fakeStatus:null,querySelector:()=>null},
 state,currentProposalId:19,console,Error,JSON,Promise,window:{confirm:()=>true}
});
new Script(src).runInContext(ctx);
new Script("mpPreparedFile={jobId:19,snapshot:JSON.stringify(state),file:{name:'MP-2026-01234.pdf'},subject:'Fee proposal',message:'Attached PDF'};mpNativeShareNow();").runInContext(ctx);
assert.equal(called,1,'Native Web Share is called synchronously from the final user action');
new Script("state.client='Changed Client';mpNativeShareNow();").runInContext(ctx);
assert.equal(called,1,'A stale PDF cannot be shared after the quotation is edited');
console.log('PDF delivery test passed: synchronous share, latest-file guard, direct Outlook/Resend and manual job archive.');
