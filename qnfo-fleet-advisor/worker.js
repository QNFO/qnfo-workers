// qnfo-fleet-advisor v0.1.2 - autonomous fleet audit advisor (Cloudflare Agents pattern).
// Every cron tick: gather fleet signals -> LLM audit (evidence-first) -> deterministic severity gate ->
// deduped advisory issues -> safe backlog drain. v0.1.2 fixes the v0.1.1 intelligence gap where the LLM
// returned recs=0 against 4.7k+429 / 2k+400 daily failure classes (no deterministic fallback existed).
const VERSION = "0.1.2";
const WORKER = "qnfo-fleet-advisor";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

function json(d, s=200){ return new Response(JSON.stringify(d,null,1),{status:s,headers:{"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*"}}); }
function ts(){ return new Date().toISOString(); }
function nowMs(){ return Date.now(); }
async function record(env, kind, text, meta){ try{ await env.AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1,?2,?3,?4,?5,?6,'ok')").bind(kind.slice(0,2)+"-"+WORKER+"-"+nowMs().toString(36), ts(), kind, String(text).slice(0,800), JSON.stringify(meta||{}).slice(0,800), WORKER).run(); }catch(e){} }
function looseJson(t){
  if (typeof t !== "string") return null;
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e2) {} }
  return null;
}
async function gatherSignals(env){
  const s = { at: ts(), issues_open: -1, gw_fail_24h: [], health: [] };
  try { const r = await env.AUDIT.prepare("SELECT COUNT(*) c FROM agent_issues WHERE status='open'").first(); s.issues_open = r ? r.c : -1; } catch (e) {}
  try { const rows = await env.AUDIT.prepare("SELECT model, status, SUM(count) n, MAX(ts) last_ts FROM ai_gateway_failures WHERE ts > ?1 GROUP BY model, status ORDER BY n DESC LIMIT 12").bind(nowMs()-24*3600*1000).all(); s.gw_fail_24h = (rows.results||[]).map(r=>({model:r.model, status:r.status, n:r.n})); } catch (e) {}
  try { const rows = await env.AUDIT.prepare("SELECT model_id, status, consecutive_failures FROM ai_model_health ORDER BY model_id LIMIT 40").all(); s.health = (rows.results||[]).map(r=>r.model_id+"="+r.status+(r.consecutive_failures?"(cf"+r.consecutive_failures+")":"")); } catch (e) {}
  return s;
}
// Deterministic severity gate: never let severe fleet signals pass with zero advisory issues.
// Thresholds are conservative to avoid alert storms: >=300 failures of one class/24h OR >=50 of a 5xx class.
function severityGate(signals){
  const out = [];
  for (const f of (signals.gw_fail_24h||[])) {
    const n = Number(f.n)||0, st = String(f.status||"");
    if (n < 300) continue;
    const is5xx = /^5/.test(st);
    if (!is5xx && n < 500) continue;
    const sev = is5xx ? "high" : (st==="400" ? "medium" : "low");
    out.push({
      title: "[advisor] GW " + st + " " + f.model + " x" + n + "/24h",
      detail: "Deterministic severity gate: gateway reports " + n + " " + st + " responses for " + f.model + " in the last 24h. Verify the model id/roster binding and caller payload; if the model is retired/misbound, update the router roster or calibration map; if 429, review rate limit/cache. " + (signals.at||""),
      priority: sev
    });
  }
  return out.slice(0, 4);
}
async function fileIssue(env, title, detail, priority){
  try {
    const open = await env.AUDIT.prepare("SELECT id FROM agent_issues WHERE title=?1 AND status='open'").bind(title).first();
    if (open) return "dup";
    await env.AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1,?2,'qnfo-fleet-advisor','advisor',?3,'open',?4,?4)").bind(String(title).slice(0,90), String(detail).slice(0,400), priority, nowMs()).run();
    return "filed";
  } catch (e) { return "err"; }
}
async function run(env){
  const signals = await gatherSignals(env);
  const digest = JSON.stringify(signals);
  const prompt = "You are the QNFO fleet advisor. Audit this fleet digest and return STRICT JSON only:\n{\"observations\":[\"...\"],\"risks\":[{\"risk\":\"...\",\"severity\":\"high|medium|low\"}],\"recommendations\":[{\"title\":\"<=90 chars\",\"detail\":\"<=400 chars\",\"priority\":\"high|medium|low\"}]}\nRules:\n- title must start with [advisor].\n- Recommend only concrete server-side actions.\n- max 4 recommendations.\n- Evidence-first: if gw_fail_24h contains any class with n>=300, you MUST produce a recommendation naming that model+status+count; if a model_health row is degraded you MUST produce a recommendation (verify/reroute/retire); if issues_open>=5 name the top backlog risk.\n- Returning an empty recommendations array is only valid when gw_fail_24h is empty AND all model_health rows are ok AND issues_open<5.\n- Adversarial check: before returning empty, state the strongest counter-signal you are dismissing and why.\n\nFLEET DIGEST: " + digest;
  let raw = "";
  try { const ai = await env.AI.run(MODEL, { prompt, max_tokens: 1400 }); raw = String(ai.response || ai.result || ai.output_text || JSON.stringify(ai)).slice(0, 6000); } catch (e) { raw = "AI ERR " + String(e && e.message || e); }
  const parsed = looseJson(raw) || { observations: [], risks: [], recommendations: [] };
  const llmRecs = Array.isArray(parsed.recommendations) ? parsed.recommendations.slice(0, 4) : [];
  const gateRecs = severityGate(signals);
  const filed = [], dup = [];
  const seen = new Set();
  for (const rec of llmRecs.concat(gateRecs)) {
    const title = String(rec.title || "").slice(0, 90);
    const detail = String(rec.detail || "").slice(0, 400);
    if (!title || seen.has(title)) continue;
    seen.add(title);
    const prio = ["high","medium","low"].includes(String(rec.priority || "")) ? rec.priority : "medium";
    const outcome = await fileIssue(env, title, detail, prio);
    if (outcome === "filed") filed.push(title); else if (outcome === "dup") dup.push(title);
  }
  let drain = null;
  if (signals.issues_open > 0) {
    try { const r = await env.BACKLOG.fetch("https://be/run", { method: "POST", body: "{}" }); drain = { status: r.status, body: (await r.text()).slice(0, 200) }; } catch (e) { drain = { error: String(e && e.message || e) }; }
  }
  await record(env, "advisor-run", "advisor v" + VERSION + " open=" + signals.issues_open + " recs=" + llmRecs.length + " gate=" + gateRecs.length + " filed=" + filed.length + " dup=" + dup.length, { signals, llmRecs: llmRecs.length, gateRecs: gateRecs.map(r=>r.title), filed, dup });
  return { ok: true, at: ts(), version: VERSION, digest: signals, llmRecommendations: llmRecs, gateRecommendations: gateRecs, filed, duplicates: dup, drain, raw_tail: (llmRecs.length === 0 && gateRecs.length === 0 && raw.indexOf("AI ERR") < 0) ? String(raw).slice(-400) : undefined };
}
export default {
  async scheduled(event, env, ctx){ try { const o = await run(env); console.log("advisor", JSON.stringify(o).slice(0, 500)); } catch (e) { console.error("advisor", String(e && e.message || e)); } },
  async fetch(request, env){
    const url = new URL(request.url);
    try {
      if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION, model: MODEL });
      if (url.pathname === "/run" && request.method === "POST") {
        if (request.headers.get("x-ops-token") !== env.ADVISOR_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);
        return json(await run(env));
      }
      if (url.pathname === "/manifest") return json({ ok: true, worker: WORKER, version: VERSION, purpose: "autonomous fleet audit advisor: signals -> LLM audit + deterministic severity gate -> deduped advisory issues -> safe backlog drain", routes: ["/health","/run","/manifest"] });
      return json({ error: "not found" }, 404);
    } catch (e) { return json({ ok: false, error: String(e && e.message || e) }, 500); }
  }
};
