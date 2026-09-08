// jnl-reviser v0.2.0 — referee-driven revision loop for self-owned QNFO papers.
// Reads referee weaknesses -> model proposes targeted edits -> applies to staged new-version draft -> publishes.
const REF = "jnl-referee"; // service binding
const ZENODO = "https://zenodo.org/api";
const OWNER_QNFO = 1328013;
const MODEL = "@cf/deepseek-ai/deepseek-v4-flash-0731"; // 2026-09-08 model audit swap
const UA = "jnl-reviser/0.2 (QNFO AI-Reviewed Journal revision loop)";
const MAX_EDITS = 6;
const MIN_FIND = 30;

function json(d, s=200){ return new Response(JSON.stringify(d,null,1),{status:s,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*"}}); }
async function zf(url,opts={},tok){ const r=await fetch(url,{...opts,headers:{"user-agent":UA,accept:"application/json","content-type":"application/json",...(tok?{authorization:`Bearer ${tok}`}:{}),...(opts.headers||{})},signal:AbortSignal.timeout(120000)}); const t=await r.text(); let b=null; try{b=t?JSON.parse(t):null}catch(e){b={raw:t.slice(0,200)}} return {status:r.status,body:b}; }
function stripHtml(s){ return String(s||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim(); }
function looseJson(t){ try{return JSON.parse(t)}catch(e){} const a=t.indexOf("{"),b=t.lastIndexOf("}"); if(a>=0&&b>a){try{return JSON.parse(t.slice(a,b+1))}catch(e2){}} return null; }

async function ensureToken(env){ if(!env.ZENODO_TOKEN) throw new Error("missing ZENODO_TOKEN"); return env.ZENODO_TOKEN; }

function extractText(o){
  if(typeof o === "string") return o;
  if(!o || typeof o !== "object") return "";
  if(o.response) return extractText(o.response);
  if(o.output_text) return String(o.output_text);
  if(o.output) return extractText(o.output);
  if(o.result) return extractText(o.result);
  if(Array.isArray(o)) return o.map(extractText).filter(Boolean).join(" ");
  for(const k of Object.keys(o)){ const v=o[k]; if(typeof v==="string" && v.length>40) return v; }
  return JSON.stringify(o);
}
export default {
  async fetch(request, env){
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if(path==="/health") return json({ok:true,service:"jnl-reviser",version:"0.1.0",model:MODEL,zenodo_token_set:!!env.ZENODO_TOKEN});
      if(request.method!=="POST") return json({ok:false,error:"POST only"},405);
      if(request.headers.get("x-ops-token")!==env.JNL_OPS_TOKEN) return json({ok:false,error:"unauthorized"},401);
      const tok = await ensureToken(env);
      const body = await request.json().catch(()=>({}));
      const recid = Number(body.recid);
      const publish = body.publish === true;
      if(!recid) return json({ok:false,error:"recid required"},400);

      // 1. referee report weaknesses
      const rr = await env.REF.fetch(`https://${REF}/reviews?recid=${recid}`,{headers:{"user-agent":UA,accept:"application/json"}});
      const rt = await rr.text(); let rj=null; try{rj=JSON.parse(rt)}catch(e){}
      if(!rj?.rows?.length) return json({ok:false,error:"no referee report",detail:rt.slice(0,150)},404);
      const review = rj.rows[0];

      // 2. record + owner check
      const pr = await zf(`${ZENODO}/records/${recid}`);
      if(pr.status!==200) return json({ok:false,error:"record fetch failed"},404);
      const paper = pr.body;
      const owners = (paper.owners||[]).map(o=>Number(typeof o==="object"?o.id:o));
      if(!owners.includes(OWNER_QNFO)) return json({ok:false,error:"not self-published (owner not QNFO)"},403);
      const concept = paper.conceptrecid;

      // 3. find existing staged draft for this concept (from KV) or create one
      const kvKey = `zenodo:draft:${recid}`;
      let draftId = null;
      const kvRaw = await env.STATE.get(kvKey);
      if(kvRaw){ try{ const kv=JSON.parse(kvRaw); draftId = kv.draft_id; }catch(e){} }
      if(!draftId){
        const vr = await zf(`${ZENODO}/deposit/depositions/${recid}/actions/newversion`,{method:"POST",body:"{}"},tok);
        if(vr.status!==201) return json({ok:false,error:"newversion failed",detail:vr.body},502);
        draftId = vr.body.id;
        // copy files
        const bucket = vr.body.links?.bucket;
        const dr2 = await zf(`${ZENODO}/deposit/depositions/${draftId}`,{},tok);
        for(const f of (paper.files||[])){
          const fr = await fetch(f.links.self,{headers:{"user-agent":UA},signal:AbortSignal.timeout(90000)});
          if(fr.ok){ const c=await fr.text(); await fetch(`${bucket}/${encodeURIComponent(f.key)}`,{method:"PUT",headers:{authorization:`Bearer ${tok}`,"content-type":"application/octet-stream","user-agent":UA},body:c,signal:AbortSignal.timeout(120000)}); }
        }
        await env.STATE.put(kvKey, JSON.stringify({draft_id:draftId,conceptrecid:concept,source_recid:recid}));
      }

      // 4. draft + primary md
      const dr = await zf(`${ZENODO}/deposit/depositions/${draftId}`,{},tok);
      if(dr.status!==200) return json({ok:false,error:"draft fetch failed"},502);
      const draft = dr.body;
      const bucket = draft.links.bucket;
      const mdKey = (paper.files||[]).find(f=>/\.(md|txt|markdown)$/i.test(f.key))?.key || (draft.files||[]).find(f=>/\.(md|txt|markdown)$/i.test(f.filename))?.filename;
      if(!mdKey) return json({ok:false,error:"no markdown file"},422);
      // fetch current draft md (may differ from published if edited before)
      const mres = await fetch(`${bucket}/${encodeURIComponent(mdKey)}`,{headers:{authorization:`Bearer ${tok}`,"user-agent":UA},signal:AbortSignal.timeout(90000)});
      if(!mres.ok) return json({ok:false,error:"md fetch from draft failed"},502);
      const mdText = await mres.text();
      const mdLimited = mdText.length>30000 ? mdText.slice(0,30000) : mdText;

      // 5. weaknesses extraction from report
      const weak = [];
      for(const sec of ["Weaknesses:","Weaknesses","weaknesses"]){}
      const lines = (review.report_md||"").split("\n");
      let inW=false;
      for(const ln of lines){
        const t=ln.trim();
        if(/^- Weaknesses:/i.test(t)){inW=true;continue;}
        if(/^- (Strengths|Rationale|Limitations|Verdict|Soundness)/i.test(t)){inW=false;continue;}
        if(inW && /^  - /.test(ln)) weak.push(t.replace(/^  - /,""));
      }
      const weakText = weak.slice(0,6).map((w,i)=>`${i+1}. ${w}`).join("\n") || "No explicit weaknesses listed; address clarity and evidence gaps.";

      // 6. model proposes targeted edits
      const sysP = `You are an expert copyeditor improving a scholarly preprint in response to referee feedback. Return STRICT JSON only: {"edits":[{"find":"exact unique substring from the paper (>= ${MIN_FIND} chars, verbatim, incl. surrounding words)","replace":"improved replacement preserving meaning and author voice","reason":"which referee point this addresses"}]}. Rules: max ${MAX_EDITS} edits; NEVER alter title/frontmatter/first 300 chars; NEVER invent citations, data, or results; make conservative clarity/evidence-flagging/hedging improvements only; if no safe edit exists return {"edits":[]}.`;
      const userP = `REFEREE WEAKNESSES:\n${weakText}\n\nDECISION: ${review.decision} (avg ${review.avg_score}/10)\n\nPAPER (${mdLimited.length} chars shown of ${mdText.length}):\n${mdLimited}`;
      const ar = await env.AI.run(MODEL,{prompt:`${sysP}\n\n${userP}`,max_tokens:1500});
      const raw = extractText(ar).slice(0,6000);
      const edits = (looseJson(raw)?.edits)||[];

      // 7. apply edits
      const applied=[]; const skipped=[];
      let out = mdText;
      for(const e of edits.slice(0,MAX_EDITS)){
        const f=String(e.find||""); const r=String(e.replace??"");
        if(f.length<MIN_FIND){ skipped.push({reason:"find too short",find:f.slice(0,60)}); continue; }
        const idx=out.indexOf(f);
        const idx2 = idx>=0 ? out.indexOf(f, idx+1) : -1;
        if(idx<0){ skipped.push({reason:"not found",find:f.slice(0,60)}); continue; }
        if(idx2>=0){ skipped.push({reason:"not unique",find:f.slice(0,60)}); continue; }
        if(idx<300){ skipped.push({reason:"frontmatter protected",find:f.slice(0,60)}); continue; }
        out = out.slice(0,idx)+r+out.slice(idx+f.length);
        applied.push({find:f.slice(0,80),replace:r.slice(0,120),reason:e.reason});
      }
      if(applied.length===0){
  // mode B: additive epistemic-status insertions (no invented data/results)
  const sysB = `You are an expert copyeditor. Referee feedback asks for clarity on empirical status and accessibility. Add a small number of INSERTIONS ONLY (never alter existing wording, never invent citations/data/results/experiments). Return STRICT JSON: {"edits":[{"find":"exact unique substring >= 30 chars to anchor after (verbatim from paper)","insert":"1-3 sentences to append right after the anchor","reason":"which referee point this addresses"}]}. Each insert must truthfully clarify scope, empirical status, or define a dense term for non-experts (e.g. "In this work, X is presented as a theoretical proposal; experimental validation is left to future work."). Max 3 edits. If none are safe return {"edits":[]}.`;
  const arB = await env.AI.run(MODEL,{prompt:`${sysB}\n\nREFEREE WEAKNESSES:\n${weakText}\n\nPAPER:\n${mdLimited}`,max_tokens:1200});
  const rawB = extractText(arB).slice(0,6000);
  const editsB = (looseJson(rawB)?.edits)||[];
  for(const e of editsB.slice(0,3)){
    const f=String(e.find||""); const ins=String(e.insert||"").trim();
    if(f.length<30||!ins) continue;
    const idx=mdText.indexOf(f);
    if(idx<0||mdText.indexOf(f,idx+1)>=0||idx<300) continue;
    const sp=/\s$/;
    const joiner = sp.test(mdText.slice(0,idx+f.length)) ? " " : " ";
    out = mdText.slice(0,idx+f.length)+"\n\n"+ins+mdText.slice(idx+f.length);
    applied.push({find:f.slice(0,80),insert:ins.slice(0,150),reason:e.reason,type:"insertion"});
    break; // single clean insertion per pass to keep diffs reviewable
  }
  if(applied.length===0) return json({ok:false,error:"no safe edits applied",applied,skipped,weaknesses:weak.slice(0,6),model_raw:raw.slice(0,800),model_raw_b:rawB.slice(0,800),text_chars:mdText.length,text_preview_chars:mdLimited.length},422);
}

      // 8. upload revised md
      await fetch(`${bucket}/${encodeURIComponent(mdKey)}`,{method:"PUT",headers:{authorization:`Bearer ${tok}`,"content-type":"application/octet-stream","user-agent":UA},body:out,signal:AbortSignal.timeout(120000)});

      // 9. metadata: full-merge (deposit PUT is full-replace; preserve all existing fields)
      const curVer = paper.metadata?.version || "1.0";
      const bump = (v)=>{ const m=String(v).match(/^v?(\d+)\.(\d+)(.*)$/i); if(!m) return `v1.1`; const nv = `${m[1]}.${Number(m[2])+1}`; return m[3]? `v${nv}` : v.startsWith("v")||/^v/i.test(v)? `v${nv}` : nv; };
      const newVer = curVer==="1.0" ? "1.1" : bump(curVer);
      const notes = `AI-assisted revision (${newVer}) addressing AI referee report: ${applied.length} targeted edits (${applied.map(a=>(a.reason||"").slice(0,60)).filter(Boolean).join("; ").slice(0,300)||"clarity/evidence hardening"}). Full referee report: see aiscience community review record.`;
      const existingMeta = (draft.metadata && Object.keys(draft.metadata).length>2) ? draft.metadata : (paper.metadata||{});
      const merged = JSON.parse(JSON.stringify(existingMeta));
      delete merged.prereserve_doi;
      merged.version = newVer;
      merged.notes = merged.notes ? `${merged.notes} | ${notes}` : notes;
      merged.publication_date = new Date().toISOString().slice(0,10);
      // deposit schema wants communities as [{identifier}] and resource via upload_type/publication_type
      if(Array.isArray(merged.communities)) merged.communities = merged.communities.map(c=>({identifier: typeof c==="string"?c:(c.identifier||c.id)}));
      const meta = { metadata: merged };
      const mur = await zf(`${ZENODO}/deposit/depositions/${draftId}`,{method:"PUT",body:JSON.stringify(meta)},tok);
      if(mur.status!==200) return json({ok:false,error:"metadata update failed",detail:mur.body},502);

      const outObj = { ok:true, recid, draft_id:draftId, conceptrecid:concept, file:mdKey, version:newVer, applied, skipped, weaknesses:weak.slice(0,6), published:false };
      if(publish){
        const pub = await zf(`${ZENODO}/deposit/depositions/${draftId}/actions/publish`,{method:"POST",body:"{}"},tok);
        if(pub.status<200||pub.status>=300) return json({ok:false,error:"publish failed",detail:pub.body},502);
        const rec=pub.body;
        outObj.published=true; outObj.new_recid=rec.id; outObj.new_doi=rec.doi||rec.metadata?.doi;
        await env.STATE.put(`zenodo:published:${recid}`, JSON.stringify({new_recid:rec.id,new_doi:rec.doi,draft_id:draftId}));
      }
      return json(outObj);
    } catch(err){
      return json({ok:false,error:String(err&&err.stack||err.message||err)},500);
    }
  }
};
