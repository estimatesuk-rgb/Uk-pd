import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
Deno.serve(async(req:Request)=>{try{const auth=req.headers.get("Authorization")||"";const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:auth}}});const{data:{user}}=await sb.auth.getUser();if(!user)return new Response(JSON.stringify({error:"Authentication required"}),{status:401});const{project_id}=await req.json();const{data:p}=await sb.from("projects").select("*").eq("id",project_id).single();if(!p)return new Response(JSON.stringify({error:"Project not accessible"}),{status:403});const{data:docs}=await sb.from("documents").select("*").eq("project_id",project_id).limit(20);if(!docs?.length)return new Response(JSON.stringify({error:"Upload project documents first"}),{status:400});const key=Deno.env.get("OPENAI_API_KEY");if(!key)return new Response(JSON.stringify({error:"AI key not configured"}),{status:500});const files:any[]=[];const unsupported:string[]=[];for(const d of docs){const ext=(d.document_no||"").split(".").pop()?.toLowerCase();if(["pdf","png","jpg","jpeg","webp"].includes(ext||"")){const{data:s}=await sb.storage.from("project-files").createSignedUrl(d.file_path,600);if(s?.signedUrl)files.push({...d,url:s.signedUrl,ext})}else unsupported.push(d.document_no)}
const prompt=`Act as an expert assistant to a competent UK Principal Designer. Analyse ALL supplied information before asking questions. Answer everything that can reasonably be evidenced from drawings, notes, specifications and project data. Do not invent facts and do not declare statutory compliance. Distinguish EVIDENCED facts from REASONED PROVISIONAL conclusions. Produce JSON only with:
project_fields: keys project_description,construction_method,foundations,ground_floor,external_walls,upper_floors,roof,insulation_energy,fire_safety,drainage,ventilation,access_part_m,electrical_part_p,glazing_part_k,structure_part_a,site_constraints,residual_risks,design_coordination,building_regulations_summary;
compliance: array of {category,requirement,design_provision,source_reference,responsible_party,status,verification_status,notes};
questions: ONLY genuinely unanswered matters, array {section,question,answer,answer_source,status,priority,source_reference}. RAMS: array of project-specific items {item_type,title,activity,hazards,persons_at_risk,initial_risk,controls,method_sequence,plant_equipment,ppe_rpe,training_competence,emergency_arrangements,coshh_substance,sds_required,residual_risk,responsible_person,status,source_reference}. Generate RAMS from the actual uploaded project scope. Include relevant Risk Assessments, Method Statements, COSHH assessments and CPP-support items. Do not create irrelevant generic activities. For substances/products evident or reasonably required by the work, create COSHH draft entries and mark SDS confirmation where manufacturer data is required.
Systematically assess Parts A,B,C,E,F,G,H,J,K,L,M,O,P and any other relevant requirements. Break broad topics into specific checks including foundations/ground conditions, beams/lintels/floors/roof structure, escape, alarms, linings, compartmentation, fire stopping, cavity barriers, DPC/DPM/weather protection, sound, ventilation rates/extract, sanitation/hot water, foul/surface drainage, combustion, stairs/guards/glazing, insulation build-ups/U-values/thermal bridging, access, overheating and electrical safety.
Also assess CDM information: client/dutyholders, PCI, asbestos, utilities, ground conditions, neighbours, access/logistics, demolition, temporary works, work at height, excavations, lifting, occupied premises, hazardous materials and significant residual design risks.
For each question first try to answer from evidence. If evidenced set status="AI answered - PD review", answer_source="Document evidence". If a reasonable professional provisional conclusion can be drawn, answer it and set answer_source="AI provisional - verify". Only set status="Needs answer" when the information genuinely cannot be established. Make questions precise and answerable, not vague headings. Cite filename and revision wherever possible.`;
const content:any[]=[{type:"input_text",text:prompt}];for(const f of files){content.push(f.ext==="pdf"?{type:"input_file",file_url:f.url}:{type:"input_image",image_url:f.url})}
const ai=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.4-mini",input:[{role:"user",content}],text:{format:{type:"json_object"}}})});const out=await ai.json();if(!ai.ok)return new Response(JSON.stringify({error:"AI analysis failed",detail:out?.error?.message}),{status:502});const txt=out.output_text||out.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;const a=JSON.parse(txt);const patch:any={};
if(!p.extracted_information)patch.extracted_information=JSON.stringify(a,null,2);
if(!p.extraction_status)patch.extraction_status="AI first pass complete - PD review required";
for(const [k,v] of Object.entries(a.project_fields||{})){
  if(v && !String(p[k]??"").trim())patch[k]=typeof v==="string"?v:JSON.stringify(v);
}
if(Object.keys(patch).length){
  const {error:projectError}=await sb.from("projects").update(patch).eq("id",project_id);
  if(projectError)throw projectError;
}
const keyOf=(v:any)=>String(v??"").trim().toLowerCase();
const {data:previousQuestions,error:questionsError}=await sb.from("ai_project_questions").select("section,question").eq("project_id",project_id);
if(questionsError)throw questionsError;
const questionKeys=new Set((previousQuestions||[]).map((x:any)=>keyOf(x.section)+"|"+keyOf(x.question)));
const additions=(Array.isArray(a.questions)?a.questions:[]).filter((x:any)=>x.question && !questionKeys.has(keyOf(x.section)+"|"+keyOf(x.question)));
for(const q of additions)questionKeys.add(keyOf(q.section)+"|"+keyOf(q.question));
if(additions.length){
  const {error}=await sb.from("ai_project_questions").insert(additions.map((q:any)=>({...q,project_id})));
  if(error)throw error;
}
const {data:previousRams,error:ramsError}=await sb.from("rams_items").select("item_type,title").eq("project_id",project_id);
if(ramsError)throw ramsError;
const ramsKeys=new Set((previousRams||[]).map((x:any)=>keyOf(x.item_type)+"|"+keyOf(x.title)));
const newRams=(Array.isArray(a.RAMS)?a.RAMS:[]).filter((x:any)=>x.title && !ramsKeys.has(keyOf(x.item_type)+"|"+keyOf(x.title)));
for(const x of newRams)ramsKeys.add(keyOf(x.item_type)+"|"+keyOf(x.title));
if(newRams.length){
  const {error}=await sb.from("rams_items").insert(newRams.map((x:any)=>({...x,project_id,status:"AI Draft - Review Required"})));
  if(error)throw error;
}
const {data:previousCompliance,error:complianceError}=await sb.from("pd_compliance_items").select("category,requirement").eq("project_id",project_id);
if(complianceError)throw complianceError;
const complianceKeys=new Set((previousCompliance||[]).map((x:any)=>keyOf(x.category)+"|"+keyOf(x.requirement)));
const newCompliance=(Array.isArray(a.compliance)?a.compliance:[]).filter((x:any)=>x.requirement && !complianceKeys.has(keyOf(x.category)+"|"+keyOf(x.requirement)));
for(const x of newCompliance)complianceKeys.add(keyOf(x.category)+"|"+keyOf(x.requirement));
if(newCompliance.length){
  const {error}=await sb.from("pd_compliance_items").insert(newCompliance.map((x:any)=>({...x,project_id,verification_status:"Awaiting PD Review"})));
  if(error)throw error;
}
return new Response(JSON.stringify({ok:true,answered:(a.questions||[]).filter((x:any)=>x.status!=="Needs answer").length,needs_answer:(a.questions||[]).filter((x:any)=>x.status==="Needs answer").length,unsupported}),{headers:{"Content-Type":"application/json"}})}catch(e){return new Response(JSON.stringify({error:String(e?.message||e)}),{status:500,headers:{"Content-Type":"application/json"}})}});