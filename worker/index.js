// UK Estimates - Cloudflare Workers AI drawing reader.
// Access to every project/document is verified with the caller's Supabase session.
// No AI key, service-role credential or document URL is exposed by this route.
const SUPABASE_URL = "https://pesiuyxktimlycvefmrb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_rTHnWN6DadaTbeytOAeu3Q_akGv_xba";
const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const MAX_IMAGE_LENGTH = 3_000_000; // Base64 data URI length (~2.2 MB binary).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
});
const fail = (error, status = 400) => json({ error }, status);
const pagesPrompt = `You are a UK construction estimating take-off assistant. Examine THIS rendered drawing page carefully. Return one VALID JSON object only:
{"classification":"Existing|Proposed|Demolition|Structural|Construction Detail|Supporting|Uncertain","confidence":"high|medium|low","reason":"brief evidence","takeoff_draft":[{"description":"construction work actually evidenced","work_section":"trade","unit":"m2|m3|m|nr|item","quantity":null,"quantity_status":"Needs measurement","measurement_basis":"why, or explicit dimension calculation","confidence":"high|medium|low"}],"unresolved":[{"question":"specific missing detail","options":["option one","option two"]}]}.
Read labels, title blocks, dimensions and revision annotations. Existing retained features must NEVER be priced as new work. Distinguish demolished, changed and new components. A drawing can be inconclusive: say so. Do not infer geometric dimensions from image pixels. A numeric quantity is allowed ONLY when dimensions are legible AND you show an explicit arithmetic calculation from those dimensions; even then quantity_status must be 'Provisional - QS verify'. Otherwise use JSON null. Include evidenced new construction work from groundworks through finishes, drainage and services, without inventing specifications. Add missing dimensions, scale, foundation and specification questions where relevant. If the page is existing only, do not generate new-build items. A QS must review all outputs before any quotation is issued.`;
const synthesisPrompt = `You are reviewing multiple independently analysed construction drawings for a UK QS. Return VALID JSON only:
{"changes":[{"element":"name","existing_source":"filename page or none","proposed_source":"filename page or none","classification":"New|Altered|Demolished|Retained unchanged|Uncertain","reason":"evidence","confidence":"high|medium|low"}],"takeoff_draft":[{"description":"distinct work activity","work_section":"trade","unit":"m2|m3|m|nr|item","quantity":null,"quantity_status":"Needs measurement","drawing_reference":"filename page","measurement_basis":"evidence or arithmetic","confidence":"high|medium|low"}],"unresolved":[{"question":"specific issue","source_reference":"filename page","options":["option one","option two"]}]}.
Compare existing versus proposed only when the plans can be aligned with evidence. DO NOT count retained work as newly built. Demolition and rebuilding are separate. Consolidate duplicated work across sheets. Preserve the exact evidenced quantities/calculations only, never generate a new dimension or infer scale. Where dimensions are insufficient use quantity null, status 'Needs measurement'. If only proposed new-build drawings are present, report new work without requiring existing drawings. If comparisons are not possible flag Uncertain. Cite source filename and page for every BOQ item. These outputs are preliminary and require QS checking.`;
const asText = (response) => {
  if (typeof response?.response === "string") return response.response;
  if (typeof response?.choices?.[0]?.message?.content === "string") return response.choices[0].message.content;
  if (typeof response?.result?.response === "string") return response.result.response;
  return "";
};
function parseModelJSON(result) {
  const text = asText(result).trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
  if (!text) throw Error("Cloudflare AI returned no readable analysis.");
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const first = text.indexOf("{"), last = text.lastIndexOf("}");
    if (first < 0 || last < first) throw Error("Cloudflare AI response was not valid JSON.");
    try { parsed = JSON.parse(text.slice(first, last + 1)); } catch { throw Error("Cloudflare AI response was not valid JSON."); }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw Error("Cloudflare AI response had an unexpected shape.");
  return parsed;
}
async function accessCheck(req, projectId, documentId = null) {
  const token = req.headers.get("authorization") || "";
  if (!/^Bearer\s+[\w.-]+$/i.test(token)) return { error: "Please sign in again before running take-off.", status: 401 };
  if (!UUID.test(projectId || "")) return { error: "Invalid project reference.", status: 400 };
  if (documentId !== null && !UUID.test(documentId)) return { error: "Invalid document reference.", status: 400 };
  const headers = { authorization: token, apikey: SUPABASE_PUBLISHABLE_KEY, accept: "application/json" };
  const userResp = await fetch(SUPABASE_URL + "/auth/v1/user", { headers });
  if (!userResp.ok) return { error: "Your sign-in has expired. Please sign in again.", status: 401 };
  // Supabase RLS must also authorize the selected project and document.
  const projectResp = await fetch(SUPABASE_URL + "/rest/v1/projects?select=id&id=eq." + projectId + "&limit=1", { headers });
  if (!projectResp.ok || !(await projectResp.json()).length) return { error: "Project not accessible.", status: 403 };
  if (documentId !== null) {
    const docResp = await fetch(SUPABASE_URL + "/rest/v1/documents?select=id,document_no,revision,status&project_id=eq." + projectId + "&id=eq." + documentId + "&limit=1", { headers });
    if (!docResp.ok) return { error: "Could not verify this project's drawing.", status: 403 };
    const docs = await docResp.json();
    if (!docs.length || docs[0].status === "Superseded") return { error: "Drawing does not belong to the active project.", status: 403 };
    return { doc: docs[0] };
  }
  return {};
}
async function callAI(env, messages, maxTokens = 2000) {
  if (!env.AI?.run) throw Error("Cloudflare Workers AI binding is unavailable.");
  const answer = await env.AI.run(MODEL, {
    messages, max_tokens: maxTokens, temperature: 0.1, stream: false,
    response_format: { type: "json_object" },
  });
  return parseModelJSON(answer);
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/api/ai-health" && request.method === "GET") {
      return json({ provider: "Cloudflare Workers AI", model: MODEL, ready: !!env.AI?.run, note: "Health check does not perform inference." });
    }
    if (path !== "/api/estimate-plan-review" && path !== "/api/estimate-plan-summary") {
      return env.ASSETS.fetch(request);
    }
    if (request.method !== "POST") return fail("POST required.", 405);
    const length = Number(request.headers.get("content-length") || "0");
    if (length > MAX_IMAGE_LENGTH + 200_000) return fail("Drawing image exceeds the safe size limit.", 413);
    try {
      const body = await request.json();
      const projectId = String(body?.project_id || "");
      if (path === "/api/estimate-plan-review") {
        const documentId = String(body?.document_id || "");
        const check = await accessCheck(request, projectId, documentId);
        if (check.error) return fail(check.error, check.status);
        const image = body?.image;
        const page = Number(body?.page_number);
        if (!Number.isSafeInteger(page) || page < 1 || page > 250) return fail("Invalid drawing page number.");
        if (typeof image !== "string" || image.length > MAX_IMAGE_LENGTH ||
          !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) {
          return fail("The rendered plan image was invalid or too large. Try a lower resolution.", 413);
        }
        const filename = String(check.doc.document_no || "drawing").slice(0,160);
        const prompt = pagesPrompt + "\nDocument: " + filename + ", revision: " +
          String(check.doc.revision || "unspecified") + ", page: " + page + ".";
        const result = await callAI(env, [
          { role: "system", content: "Return only well-formed JSON. Do not invent measurements or compliance." },
          { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: image } }] },
        ], 1900);
        if (!Array.isArray(result.takeoff_draft) || !Array.isArray(result.unresolved) || typeof result.classification !== "string") {
          return fail("AI image interpretation was incomplete. No result was saved.", 502);
        }
        return json({ ok: true, provider: "Cloudflare Workers AI", page: {
          filename, document_id: documentId, page_number: page, classification: result.classification,
          confidence: result.confidence || "low", reason: result.reason || "AI provisional",
          takeoff_draft: result.takeoff_draft.slice(0,40), unresolved: result.unresolved.slice(0,20),
        } });
      }
      const check = await accessCheck(request, projectId);
      if (check.error) return fail(check.error, check.status);
      const pages = body?.pages;
      if (!Array.isArray(pages) || pages.length < 1 || pages.length > 20) return fail("Include between one and twenty reviewed drawing pages.");
      const summaries = pages.map(p => ({
        filename: String(p.filename || "").slice(0,160), page_number: Number(p.page_number),
        classification: String(p.classification || "").slice(0,50), reason: String(p.reason || "").slice(0,700),
        takeoff_draft: Array.isArray(p.takeoff_draft) ? p.takeoff_draft.slice(0,25) : [],
        unresolved: Array.isArray(p.unresolved) ? p.unresolved.slice(0,10) : [],
      }));
      const input = JSON.stringify(summaries);
      if (input.length > 85_000) return fail("Drawing summaries are too large; review smaller batches.", 413);
      const result = await callAI(env, [
        { role: "system", content: synthesisPrompt },
        { role: "user", content: "Compare and consolidate these reviewed sheets:\n" + input },
      ], 3300);
      if (!Array.isArray(result.changes) || !Array.isArray(result.takeoff_draft) || !Array.isArray(result.unresolved)) {
        return fail("AI drawing comparison was incomplete. No BOQ was saved.", 502);
      }
      return json({ ok: true, provider: "Cloudflare Workers AI",
        drawing_review: { pages: summaries.map(p => ({
          filename: p.filename, page_number: p.page_number, classification: p.classification,
          reason: p.reason, confidence: pages.find(x => x.filename === p.filename && x.page_number === p.page_number)?.confidence || "low",
        })), changes: result.changes.slice(0,120), unresolved: result.unresolved.slice(0,100) },
        takeoff_draft: result.takeoff_draft.slice(0,200),
      });
    } catch (error) {
      // No tokens, image content or signed drawing links are ever logged.
      const msg = String(error?.message || "Unknown AI error").slice(0,250);
      console.error("Cloudflare plan reader:", msg);
      const limit = /quota|rate limit|neurons|exceeded|7505|429/i.test(msg);
      return fail(limit ? "Cloudflare's AI free allowance or rate limit has been reached." :
        "Cloudflare AI could not complete the drawing review: " + msg, limit ? 429 : 502);
    }
  },
};
