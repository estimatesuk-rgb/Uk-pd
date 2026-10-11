import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const PROJECT='aa1a0e3f-9a94-4393-8e72-5457884f5a22';
const DOC='4be47c14-f25a-4d2e-9c0d-56e3ee96e5b1';
const image='data:image/jpeg;base64,'+Buffer.from('mock image').toString('base64');
const originalFetch=globalThis.fetch;
function setup({ project=true, document=true, output='{}' }={}) {
  const calls=[];
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.includes('/auth/v1/user'))return Response.json({id:'user'});
    if(u.includes('/rest/v1/projects'))return Response.json(project?[{id:PROJECT}]:[]);
    if(u.includes('/rest/v1/documents'))return Response.json(document?[{id:DOC,document_no:'Proposed.pdf',revision:'P01',status:'Current'}]:[]);
    throw Error('Unexpected URL');
  };
  const env={AI:{run:async(model,args)=>{calls.push({model,args});return {response:output}}},ASSETS:{fetch:async()=>new Response('asset')}};
  return {env,calls};
}
const post=(route,data,token=true)=>new Request('https://uk-pd.example.workers.dev'+route,{
  method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer jwt.token.parts'}:{})},body:JSON.stringify(data)});
const page={project_id:PROJECT,document_id:DOC,page_number:1,image};
test.afterEach(()=>{globalThis.fetch=originalFetch});
test('unauthenticated requests never invoke AI',async()=>{
  const {env,calls}=setup();
  const res=await worker.fetch(post('/api/estimate-plan-review',page,false),env);
  assert.equal(res.status,401);assert.equal(calls.length,0);
});
test('inaccessible projects and documents never invoke AI',async()=>{
  for(const options of [{project:false},{document:false}]){
    const {env,calls}=setup(options);
    const res=await worker.fetch(post('/api/estimate-plan-review',page),env);
    assert.equal(res.status,403);assert.equal(calls.length,0);
  }
});
test('the Worker calls Cloudflare vision with the actual image',async()=>{
  const {env,calls}=setup({output:JSON.stringify({classification:'Proposed',confidence:'high',reason:'Proposed title block',
    takeoff_draft:[{description:'New wall',unit:'m2',quantity:null,quantity_status:'Needs measurement'}],unresolved:[]})});
  const res=await worker.fetch(post('/api/estimate-plan-review',page),env);
  assert.equal(res.status,200);const data=await res.json();
  assert.equal(data.page.takeoff_draft[0].quantity,null);
  assert.equal(calls.length,1);assert.match(calls[0].model,/llama-4-scout/);
  assert.equal(calls[0].args.messages[1].content[1].image_url.url,image);
});
test('comparison endpoint builds a reviewed result',async()=>{
  const {env,calls}=setup({output:JSON.stringify({changes:[],takeoff_draft:[],unresolved:[]})});
  const res=await worker.fetch(post('/api/estimate-plan-summary',{project_id:PROJECT,pages:[
    {filename:'Proposed.pdf',page_number:1,classification:'Proposed',reason:'Title',takeoff_draft:[],unresolved:[]}
  ]}),env);
  assert.equal(res.status,200);const data=await res.json();
  assert.equal(data.drawing_review.pages.length,1);assert.equal(calls.length,1);
});
test('URL data cannot be substituted for an uploaded drawing image',async()=>{
  const {env,calls}=setup();
  const res=await worker.fetch(post('/api/estimate-plan-review',{...page,image:'https://example.com/other.jpg'}),env);
  assert.equal(res.status,413);assert.equal(calls.length,0);
});
test('health endpoint does not run the AI model',async()=>{
  const {env,calls}=setup();
  const res=await worker.fetch(new Request('https://uk-pd.example.workers.dev/api/ai-health'),env);
  assert.equal(res.status,200);assert.equal((await res.json()).ready,true);assert.equal(calls.length,0);
});
