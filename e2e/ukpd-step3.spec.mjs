import {test,expect} from '@playwright/test';

// These are authenticated BROWSER WORKFLOW tests with an isolated in-memory
// Supabase session/project and deterministic AI fixtures. There is no real
// account, storage access, live estimate update or billed inference.
const ORIGIN='https://pesiuyxktimlycvefmrb.supabase.co';
const USER_ID='5e0e23e1-b637-4098-9177-4692d2f1a9bf';
const PROJECT_ID='5b8add28-951d-4a9b-a527-a3f889164a9b';
const DOC_ID='6e75c529-2583-43b1-9a54-c16638b3d2a1';
const STORAGE_PATH=PROJECT_ID+'/documents/test-proposed.png';
const NAME='Playwright isolated Step 3 fixture';
const BASE_ITEM={items:[],highlights:[],ai_pending_takeoff:[],
  project_type:'new-house',drawing_mode:'new-build',
  drawing_stages:{[DOC_ID]:'Proposed'},
  calibrations:{[DOC_ID+'#1']:{
    status:'calibrated',source_path:STORAGE_PATH,source_revision:'P01',
    metresPerPixel:0.01,metres:5,pixelLength:500,
    crosscheck_verified:true,reference_points:[{x:.1,y:.1},{x:.6,y:.1}],
    sheet_dimensions_px:[1,1]
  }}
};
// Verified Pillow-encoded 32x32 PNG with one synthetic outline; not a real drawing.
// Quantity accuracy is tested elsewhere against benchmark drawings.
const TEST_PNG=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAATElEQVR4nGP8//8/Ay0BE01NH7WAGMCCxmdkZKTEOMwkg24BVkVEAqyOG/pxMGrBqAWjFoxaMGrBqAUMDFirTAqrZXTTRlt2oxZQDADXAAxC81oizAAAAABJRU5ErkJggg==','base64');
const user={id:USER_ID,aud:'authenticated',role:'authenticated',email:'ukpd-test@example.invalid',
  app_metadata:{provider:'email',providers:['email']},user_metadata:{},
  created_at:'2026-10-13T00:00:00Z'};
const jwt=()=>{
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  return encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:USER_ID,role:'authenticated',
    exp:Math.floor(Date.now()/1000)+7200,iat:Math.floor(Date.now()/1000)})+'.test-signature';
};
function fixture({estimateData=BASE_ITEM,failAI=false}={}){
 return {
  project:{id:PROJECT_ID,project_no:'E2E-0001',name:NAME,client_name:'Browser Test',
    created_at:'2026-10-13T00:00:00Z',risk:'green',status:'draft',offer_code:'PD01',
    estimate_data:structuredClone(estimateData)},
  document:{id:DOC_ID,project_id:PROJECT_ID,document_no:'test-proposed.png',
    title:'test-proposed.png',file_path:STORAGE_PATH,revision:'P01',status:'Current'},
  writes:[],requests:[],aiCalls:[],failAI
 };
}
const json=(route,obj,status=200,headers={})=>route.fulfill({status,
 headers:{'access-control-allow-origin':'*','content-type':'application/json',...headers},
 body:JSON.stringify(obj)});
async function interceptAll(page,state){
 await page.route(ORIGIN+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
  state.requests.push({path,method});
  if(path==='/auth/v1/token'&&method==='POST'){
   return json(route,{access_token:jwt(),token_type:'bearer',expires_in:7200,
     expires_at:Math.floor(Date.now()/1000)+7200,refresh_token:'isolated-refresh',
     user});
  }
  if(path==='/auth/v1/user')return json(route,user);
  if(path.startsWith('/rest/v1/profiles'))return json(route,
   {id:USER_ID,full_name:'Playwright Test',Admin:'admin'});
  if(path.startsWith('/rest/v1/projects')){
   if(method==='GET')return json(route,[state.project]);
   if(method==='PATCH'){
    const patch=request.postDataJSON();
    state.writes.push(patch);
    if(patch.estimate_data)state.project.estimate_data=structuredClone(patch.estimate_data);
    return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'},body:''});
   }
  }
  if(path.startsWith('/rest/v1/documents')&&method==='GET')return json(route,[state.document]);
  if(path.startsWith('/rest/v1/estimate_rate_library'))return json(route,[]);
  if(path.startsWith('/rest/v1/estimate_builders'))return json(route,[]);
  if(path.startsWith('/storage/v1/object/sign/')){
   if(method==='POST'){
    return json(route,{signedURL:'/object/sign/project-files/'+STORAGE_PATH+'?token=isolated-e2e'});
   }
   if(method==='GET')return route.fulfill({status:200,
      headers:{'content-type':'image/png','access-control-allow-origin':'*'},body:TEST_PNG});
  }
  // Unexpected Supabase endpoint must NEVER reach the real account.
  return json(route,{message:'Unmocked isolated E2E request: '+method+' '+path},501);
 });
 await page.route('**/api/ai-health',route=>json(route,{ready:true,provider:'Cloudflare Workers AI',model:'E2E fixture'}));
 await page.route('**/api/estimate-plan-review',route=>{
  state.aiCalls.push({endpoint:'page',payload:route.request().postDataJSON()});
  if(state.failAI)return json(route,{error:'Injected plan-reader error for Playwright test'},502);
  return json(route,{ok:true,page:{
    filename:'test-proposed.png',document_id:DOC_ID,page_number:1,
    classification:'Proposed',confidence:'high',reason:'Fixture title block',
    calibration_status:'calibrated',
    // Deliberately bad AI boundary: may not become a priced line.
    auto_marks:[{description:'ground floor plan',evidence:'clearly visible outline',
      kind:'polygon',stage:'Proposed',confidence:'high',
      points:[{x:.15,y:.55},{x:.5,y:.55},{x:.5,y:.9},{x:.15,y:.9}]}],
    takeoff_draft:[{description:'New external wall',unit:'m²',quantity:null,
      drawing_reference:'test-proposed.png p1',measurement_basis:'Fixture only'}],
    unresolved:[]
  }});
 });
 await page.route('**/api/estimate-plan-summary',route=>{
  state.aiCalls.push({endpoint:'summary',payload:route.request().postDataJSON()});
  return json(route,{ok:true,drawing_review:{
    pages:[{filename:'test-proposed.png',page_number:1,classification:'Proposed',
       reason:'Fixture',takeoff_draft:[],unresolved:[]}],
    changes:[],unresolved:[]},
    takeoff_draft:[{description:'New external wall',unit:'m²',quantity:null,
      drawing_reference:'test-proposed.png p1',measurement_basis:'Unverified fixture'}]});
 });
}
async function openAuthenticatedEstimate(page,state){
 await interceptAll(page,state);
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Project Management Portal'})).toBeVisible();
 await page.getByRole('textbox',{name:'Email'}).fill('ukpd-test@example.invalid');
 await page.getByLabel('Password').fill('mock-password-not-used');
 await page.getByRole('button',{name:'Sign in'}).click();
 const skip=page.getByRole('button',{name:/Skip Intro/});
 if(await skip.isVisible({timeout:4000}).catch(()=>false))await skip.click();
 await page.locator('aside').getByRole('button',{name:'Estimates & AI Plan Reader'}).click();
 await page.getByText(NAME,{exact:true}).first().click();
 await expect(page.getByRole('heading',{name:'Estimates & Bill of Quantities'})).toBeVisible();
 await expect(page.locator('#estimate-ai-takeoff')).toContainText('1 supported plan file(s) currently recognised.');
 await expect(page.getByRole('button',{name:'Step 3 — Start AI Take-Off'})).toBeVisible();
}
async function expectStep3Feedback(page,pattern,state){
 try{await expect(page.locator('#estimate-ai-takeoff').getByRole('alert').filter({hasText:pattern})).toBeVisible({timeout:15000})}
 catch(e){
  console.log('Step 3 browser diagnostic:',JSON.stringify({
   notice:await page.locator('#estimate-ai-takeoff').innerText().catch(()=>''),
   supabaseRoutes:state.requests,aiCalls:state.aiCalls.map(x=>x.endpoint),writes:state.writes.length
  }));throw e;
 }
}
test('Verified BIM model exports IFC roof, wall, slab and hosted door/window relationships',async({page})=>{
 const evidence='C3 Section A-A verified width, height, level and roof rise reference';
 const view={id:'g',document_id:DOC_ID,page:1,kind:'ground-floor-plan',name:'Ground plan',
  source_path:STORAGE_PATH,source_revision:'P01',common_origin_verified:true,
  bounds:{x:.05,y:.05,w:.45,h:.75}};
 const roofView={...view,id:'r',name:'Roof plan',kind:'roof-plan'};
 const cal={status:'calibrated',crosscheck_verified:true,metresPerPixel:.01,
  source_path:STORAGE_PATH,source_revision:'P01',dimensions_px:[1000,800],view_id:'g'};
 const origin={base_m:0,origin_x_m:0,origin_y_m:0};
 const wall={id:'w',view_id:'g',name:'External wall',type:'wall',checked:true,
  dimension_reference:evidence,thickness_m:.3,height_m:3,
  points:[{x:.1,y:.2},{x:.8,y:.2}],...origin};
 const slab={id:'s',view_id:'g',name:'Ground slab',type:'slab',checked:true,
  dimension_reference:evidence,thickness_m:.15,...origin,
  points:[{x:.1,y:.2},{x:.8,y:.2},{x:.8,y:.6},{x:.1,y:.6}]};
 const roof={id:'roof',view_id:'r',name:'Roof face',type:'roof',checked:true,
  dimension_reference:evidence,thickness_m:.2,origin_x_m:0,origin_y_m:0,
  slope_axis:'x',eave_m:3.2,ridge_m:4.4,
  points:[{x:.1,y:.2},{x:.8,y:.2},{x:.8,y:.6},{x:.1,y:.6}]};
 const door={id:'door',type:'door',name:'Entrance',checked:true,dimension_reference:evidence,
  host_id:'w-0',offset_m:1.1,width_m:.9,height_m:2.1,sill_m:0};
 const window={id:'window',type:'window',name:'Window',checked:true,dimension_reference:evidence,
  host_id:'w-0',offset_m:3.1,width_m:1.2,height_m:1.1,sill_m:.9};
 const state=fixture({estimateData:{...structuredClone(BASE_ITEM),
  drawing_views:[view,roofView],view_calibrations:{g:cal,r:{...cal,view_id:'r'}},
  view_bim_elements:[slab,wall],view_bim_features:[roof,door,window]}});
 await openAuthenticatedEstimate(page,state);
 const exportButton=page.getByRole('button',{name:'Generate IFC4 3D BIM file'});
 await expect(exportButton).toBeEnabled();
 await expect(page.getByText('4. IFC4 BIM model · 5 model element(s)')).toBeVisible();
 const [download]=await Promise.all([page.waitForEvent('download'),exportButton.click()]);
 expect(download.suggestedFilename()).toBe('UKPD-checked-elements.ifc');
 const {readFile}=await import('node:fs/promises');
 const ifc=await readFile(await download.path(),'utf8');
 for(const entity of ['IFCROOF','IFCSLAB','IFCWALL','IFCDOOR','IFCWINDOW',
  'IFCRELVOIDSELEMENT','IFCRELFILLSELEMENT','IFCFACETEDBREP']){
  expect(ifc).toContain(entity+'(');
 }
 expect(state.writes).toHaveLength(0);
});
test('Step 3 signed-in: mocked new-build AI produces QS review, not priced quantities',async({page})=>{
 const state=fixture();await openAuthenticatedEstimate(page,state);
 await page.getByRole('button',{name:'Step 3 — Start AI Take-Off'}).click();
 await expectStep3Feedback(page,/All 1 suggested measurements\/scope lines are HELD outside the priced BOQ/,state);
 await expect(page.getByRole('region',{name:'Review new AI takeoff suggestions'})).toBeVisible();
 await expect(page.getByText(/Review new AI suggestions — 1 pending/)).toBeVisible();
 expect(state.aiCalls.map(x=>x.endpoint)).toEqual(['page','summary']);
 expect(state.aiCalls[0].payload.job_type).toBe('new-house');
 expect(state.project.estimate_data.items).toEqual([]);
 expect(state.project.estimate_data.ai_pending_takeoff).toHaveLength(1);
 expect(state.project.estimate_data.ai_pending_takeoff[0].item.quantity).toBe(0);
 expect(state.project.estimate_data.ai_auto_measurement_review.rejected.length).toBeGreaterThanOrEqual(1);
});
test('Step 3 signed-in: AI service failure leaves saved estimate untouched',async({page})=>{
 const state=fixture({failAI:true});await openAuthenticatedEstimate(page,state);
 await page.getByRole('button',{name:'Step 3 — Start AI Take-Off'}).click();
 await expectStep3Feedback(page,/AI plan reader stopped: Injected plan-reader error/,state);
 expect(state.aiCalls.map(x=>x.endpoint)).toEqual(['page']);
 expect(state.writes).toHaveLength(0);
 expect(state.project.estimate_data.items).toEqual([]);
});
test('Step 3 signed-in: absent job type blocks AI without a request',async({page})=>{
 const state=fixture({estimateData:{...structuredClone(BASE_ITEM),project_type:'',drawing_mode:''}});
 await openAuthenticatedEstimate(page,state);
 await page.getByRole('button',{name:'Step 3 — Start AI Take-Off'}).click();
 await expect(page.locator('#estimate-ai-takeoff').getByRole('alert').filter({hasText:/Before reading plans, choose the type of construction job/})).toBeVisible();
 expect(state.aiCalls).toHaveLength(0);
 expect(state.writes).toHaveLength(0);
});
test('Step 3 signed-in: missing calibration prompts for scale instead of calling inference',async({page})=>{
 const state=fixture({estimateData:{...structuredClone(BASE_ITEM),calibrations:{}}});
 await openAuthenticatedEstimate(page,state);
 await page.getByRole('button',{name:'Step 3 — Start AI Take-Off'}).click();
 await expectStep3Feedback(page,/need calibration or a construction-notes\/no-scale decision/,state);
 expect(state.aiCalls).toHaveLength(0);
 expect(state.writes).toHaveLength(0);
});
