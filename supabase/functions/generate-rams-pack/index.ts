import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "https://esm.sh/@supabase/supabase-js@2.57.4";
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type"}});
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return json({ok:true});try{
const token=req.headers.get("Authorization")||"";
const sb=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:token}}});
const {data:{user}}=await sb.auth.getUser();if(!user)return json({error:"Sign in required"},401);
const {project_id}=await req.json();if(!project_id)return json({error:"Project ID required"},400);
const {data:p,error:pe}=await sb.from("projects").select("*").eq("id",project_id).single();if(pe||!p)return json({error:"Project inaccessible"},403);
const tables=["documents","drawings","design_changes","pd_compliance_items","ai_project_questions","rams_items","evidence"];
const results=await Promise.all(tables.map(t=>sb.from(t).select("*").eq("project_id",project_id).limit(60)));
const context=Object.fromEntries(tables.map((t,i)=>[t,results[i].data||[]]));
const key=Deno.env.get("OPENAI_API_KEY");if(!key)return json({error:"AI service not configured"},503);
const attachments:any[]=[];const missing:string[]=[];
for(const d of context.documents){const path=d.file_path;if(!path)continue;const ext=String(path).split(".").pop()?.toLowerCase();if(!["pdf","png","jpg","jpeg","webp"].includes(ext||"")){missing.push("Unsupported drawing format: "+(d.title||path));continue;}const {data,error}=await sb.storage.from("project-files").createSignedUrl(path,600);if(error||!data?.signedUrl){missing.push("Unable to read: "+(d.title||path));continue;}attachments.push(ext==="pdf"?{type:"input_file",file_url:data.signedUrl}:{type:"input_image",image_url:data.signedUrl});}
const prompt=`Prepare a UK CDM 2015 construction health and safety DRAFT for competent review. Output JSON object with items array and missing_information array. Each item has ONLY fields item_type,title,activity,hazards,persons_at_risk,initial_risk,controls,method_sequence,plant_equipment,ppe_rpe,training_competence,emergency_arrangements,coshh_substance,sds_required,residual_risk,responsible_person,status,source_reference. Include project-relevant risk assessments, method statements, construction phase plan, emergency plan, and COSHH entries ONLY for products supported by project evidence. Use specific numbered sequences and detailed practicable control measures. Separate design-stage Principal Designer responsibilities from site-stage Principal Contractor responsibilities. Do not invent ground conditions, manufacturer SDS, emergency contacts, site arrangements or completed inspections. Use 'To be confirmed by Principal Contractor' only for genuinely unknown site-specific details. Identify actual source filenames and revisions when supported. Mark every item 'AI Draft - Review Required'. A COSHH assessment is provisional until the exact product and current SDS are verified. No claim of legal approval. Preserve specificity, avoid generic templates. If context is insufficient return missing_information explaining exactly what is needed; still draft what is safely supported. PROJECT AND DATABASE RECORDS: ${JSON.stringify({project:p,records:context}).slice(0,85000)}`;
const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.4-mini",input:[{role:"user",content:[{type:"input_text",text:prompt},...attachments]}],text:{format:{type:"json_object"}},max_output_tokens:14000})});
const raw=await response.json();if(!response.ok)return json({error:"AI service failed",detail:raw.error?.message},502);
const txt=raw.output_text||raw.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==="output_text")?.text;if(!txt)return json({error:"AI returned no complete document"},502);
const parsed=JSON.parse(txt);if(!Array.isArray(parsed.items)||!parsed.items.length)return json({error:"AI returned no usable records"},502);
const allowed=["item_type","title","activity","hazards","persons_at_risk","initial_risk","controls","method_sequence","plant_equipment","ppe_rpe","training_competence","emergency_arrangements","coshh_substance","sds_required","residual_risk","responsible_person","status","source_reference"];
const recordKey=(x:any)=>String(x.item_type||"").trim().toLowerCase()+"|"+String(x.title||"").trim().toLowerCase();
const existing=new Set(context.rams_items.map((x:any)=>recordKey(x)));
const records=parsed.items.filter((x:any)=>{
 if(!x?.title||!x.controls)return false;
 const key=recordKey(x);
 if(existing.has(key))return false;
 existing.add(key);
 return true;
}).slice(0,75).map((x:any)=>{const r:any={project_id};for(const k of allowed)if(x[k]!==undefined)r[k]=x[k];r.status="AI Draft - Review Required";return r});
if(!records.length)return json({ok:true,created:0,message:"No new drafts. All existing AI and reviewed records preserved.",missing_information:[...missing,...(parsed.missing_information||[])]});
const {error:insertError}=await sb.from("rams_items").insert(records);if(insertError)return json({error:"Unable to save draft records",detail:insertError.message},500);
return json({ok:true,created:records.length,missing_information:[...missing,...(parsed.missing_information||[])]});
}catch(e){return json({error:String(e instanceof Error?e.message:e)},500)}});
