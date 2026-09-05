// qnfo-ai-calibration — autonomous AI-endpoint calibration + stress-testing + self-heal
// PURPOSE: Periodic (cron */30) stress/calibration sweeps of the QNFO AI endpoints
//   (qnfo-ai router incl. 18 concrete models + auto/ensemble, qnfo-ops, personal-api,
//   DeepSeek direct). Every probe is SELF-AUDITED against behavioral expectations and
//   the live Workers AI catalog. Failures/drift are SELF-CORRECTED: per-model health +
//   catalog overrides written to qnfo-audit.ai_model_health (consumed live by qnfo-ai
//   for auto-routing deprioritization + /v1/models advertisement) and agent_issues
//   tickets follow the telemetry self-heal lifecycle (file on persistent failure,
//   auto-close on recovery). SELF-IMPROVING: config-driven thresholds
//   (ai_calibration_config), consecutive-failure escalation, per-probe latency tracking.
// CAPABILITIES: endpoint stress sweeps, catalog truth audit, vision/tools/stream/routing/
//   boundary probes, health-table publishing, ticket lifecycle self-heal.
// DEPLOY: wrangler deploy (secrets: QNFO_ROUTER_KEY, OPS_KEY, PT_KEY, DEEPSEEK_KEY, CF_API_TOKEN)
// CANONICAL SOURCE: qnfo-workers/qnfo-ai-calibration (FLEET-SELF-DOC-1)
// ROUTES: GET /health | GET /manifest | POST /run (auth) | GET /results (auth) | GET /
var VERSION = "1.1.1";
// GW-WATCH-1 2026-09-05: autonomous AI Gateway failure sweep (detect -> D1 -> issue -> auto-close) // SVC-BINDING-1: same-account workers.dev fetches 404 at the edge from inside a Worker (verified live 2026-09-04) - internal probes use service bindings (QNFO_AI/QNFO_OPS/PT_API); DeepSeek/catalog stay public
var ROUTER = "https://qnfo-ai.q08.workers.dev";
var OPS = "https://qnfo-ops.q08.workers.dev";
var PT = "https://personal-api.q08.workers.dev";
var DEEPSEEK = "https://api.deepseek.com/v1";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var CATALOG = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT;
var UA = "QNFO-AI-Calibration/" + VERSION;
var RED10X10_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC";
var TIER0_WA = {
  "deepseek-r1-qwen-32b": "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
  "qwen3-30b": "@cf/qwen/qwen3-30b-a3b-fp8",
  "qwen2.5-coder-32b": "@cf/qwen/qwen2.5-coder-32b-instruct",
  "glm-5.2": "@cf/zai-org/glm-5.2",
  "kimi-k2.6": "@cf/moonshotai/kimi-k2.6",
  "qwq-32b": "@cf/qwen/qwq-32b",
  "glm-4.7-flash": "@cf/zai-org/glm-4.7-flash",
  "gemma-4-26b": "@cf/google/gemma-4-26b-a4b-it",
  "glm-5.3-flash": "@cf/zai-org/glm-5.3-flash",
  "gpt-oss-120b": "@cf/openai/gpt-oss-120b",
  "deepseek-v4-flash-wa": "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "deepseek-v4-pro-wa": "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "kimi-k2.7-code": "@cf/moonshotai/kimi-k2.7-code",
  "glm-5.3": "@cf/zai-org/glm-5.3",
  "llama-3.2-11b-vision": "@cf/meta/llama-3.2-11b-vision-instruct"
};
var ALL_MODELS = Object.keys(TIER0_WA).concat(["deepseek-v4-flash", "deepseek-v4-flash-thinking", "deepseek-v4-pro"]);
var DEFAULT_VISION = "kimi-k2.6,kimi-k2.7-code,glm-5.3-flash,gemma-4-26b,llama-3.2-11b-vision";

function json(resp, status) { return new Response(JSON.stringify(resp), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }); }
function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error("timeout after " + ms + "ms")); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
  });
}
async function sha256Hex(s) {
  var enc = new TextEncoder();
  var buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.prototype.map.call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, "0"); }).join("");
}
async function authorized(request, env) {
  var h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  return (await sha256Hex(h.slice(7))) === (await sha256Hex(env.QNFO_ROUTER_KEY || ""));
}
async function jfetch(env, url, headers, body, timeoutMs, bindName) {
  var init = { method: body ? "POST" : "GET", headers: Object.assign({ "Content-Type": "application/json", "User-Agent": UA }, headers || {}) };
  if (body) init.body = JSON.stringify(body);
  var bind = bindName ? env[bindName] : null;
  var resp = await withTimeout(bind ? bind.fetch(url, init) : fetch(url, init), timeoutMs || 45000);
  var text = await resp.text();
  var data = null;
  try { data = JSON.parse(text); } catch (e) { data = { _raw: text.slice(0, 400) }; }
  return { status: resp.status, data: data, text: text };
}
async function runPool(items, limit, fn) {
  var out = new Array(items.length);
  var next = 0;
  async function worker() {
    while (true) {
      var i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  var ws = [];
  for (var w = 0; w < Math.min(limit, items.length); w++) ws.push(worker());
  await Promise.all(ws);
  return out;
}
async function probeCompletion(env, model) {
  var t0 = Date.now();
  try {
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 16, stream: false }, 45000, "QNFO_AI");
    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    var echo = r.data && r.data.model === model;
    var pass = r.status === 200 && !!content && String(content).trim().length > 0 && echo;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok" : ("http=" + r.status + " echo=" + echo + " " + JSON.stringify(String(content || "").slice(0, 60))) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
async function probeVision(env, model) {
  var t0 = Date.now();
  var msgs = [{ role: "user", content: [{ type: "text", text: "What color is this image? Reply in one word." }, { type: "image_url", image_url: { url: "data:image/png;base64," + RED10X10_B64 } }] }];
  try {
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: model, messages: msgs, max_tokens: 128, stream: false }, 90000, "QNFO_AI");
    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    var s = String(content || "");
    var noSee = /cannot see|can't view|cannot view|no image|unsupported image|not able to see|can not see/i.test(s);
    var pass = r.status === 200 && s.trim().length > 0 && !noSee;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? ("ok " + s.slice(0, 40)) : ("http=" + r.status + " noSee=" + noSee + " " + s.slice(0, 80)) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
async function probeTools(env) {
  var t0 = Date.now();
  var tools = [{ type: "function", function: { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }];
  try {
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "deepseek-v4-flash", messages: [{ role: "user", content: "What is the weather in Berlin?" }], tools: tools, max_tokens: 64, stream: false }, 60000, "QNFO_AI");
    var tc = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.tool_calls;
    var pass = r.status === 200 && Array.isArray(tc) && tc.length > 0;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? ("tool_calls=" + tc.length) : ("http=" + r.status) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
async function probeStream(env) {
  var t0 = Date.now();
  try {
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "deepseek-v4-flash", messages: [{ role: "user", content: "Say hi" }], max_tokens: 16, stream: true }, 60000, "QNFO_AI");
    var pass = r.status === 200 && r.text.indexOf("[DONE]") >= 0 && r.text.indexOf("data:") >= 0;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "sse ok" : ("http=" + r.status + " done=" + (r.text.indexOf("[DONE]") >= 0)) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}

async function probeRouting(env) {
  var out = [];
  try {
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "auto", messages: [{ role: "user", content: "Hello" }], max_tokens: 32, stream: false }, 60000, "QNFO_AI");
    var rt = r.data && r.data._router;
    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    var pass = r.status === 200 && !!rt && !!rt.routed_model && !!content && String(content).trim().length > 0;
    out.push({ probe: "routing", target: "auto/simple", status: pass ? "pass" : "fail", latency_ms: 0, detail: pass ? ("routed=" + rt.routed_model) : ("http=" + r.status + " " + JSON.stringify(rt || {}).slice(0, 100)) });
  } catch (e) { out.push({ probe: "routing", target: "auto/simple", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) }); }
  try {
    var r2 = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "ensemble", messages: [{ role: "user", content: "What is 17*23?" }], max_tokens: 64, stream: false }, 120000, "QNFO_AI");
    var c2 = r2.data && r2.data.choices && r2.data.choices[0] && r2.data.choices[0].message && r2.data.choices[0].message.content;
    var pass2 = r2.status === 200 && r2.data.model === "ensemble" && !!c2 && String(c2).trim().length > 0;
    out.push({ probe: "routing", target: "ensemble/math", status: pass2 ? "pass" : "fail", latency_ms: 0, detail: pass2 ? ("out=" + String(c2).slice(0, 40)) : ("http=" + r2.status) });
  } catch (e) { out.push({ probe: "routing", target: "ensemble/math", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) }); }
  try {
    var r3 = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "nonexistent-model-xyz", messages: [{ role: "user", content: "hi" }], max_tokens: 32, stream: false }, 60000, "QNFO_AI");
    var pass3 = r3.status === 200 && r3.data && r3.data.model === "deepseek-v4-flash";
    out.push({ probe: "routing", target: "unknown-fallback", status: pass3 ? "pass" : "fail", latency_ms: 0, detail: pass3 ? "fallback=deepseek-v4-flash" : ("http=" + r3.status + " model=" + (r3.data && r3.data.model)) });
  } catch (e) { out.push({ probe: "routing", target: "unknown-fallback", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) }); }
  for (var i = 0; i < 2; i++) {
    var mt = i === 0 ? 0 : 999999;
    try {
      var r4 = await jfetch(env, "https://qnfo-ai.internal/v1/chat/completions", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
        { model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], max_tokens: mt, stream: false }, 60000, "QNFO_AI");
      out.push({ probe: "routing", target: "boundary/max_tokens=" + mt, status: r4.status === 200 ? "pass" : "fail", latency_ms: 0, detail: "http=" + r4.status });
    } catch (e) { out.push({ probe: "routing", target: "boundary/max_tokens=" + mt, status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) }); }
  }
  return out;
}
async function probeEndpoint(env, name, url, key, body, bindName) {
  var t0 = Date.now();
  try {
    var r = await jfetch(env, url, { Authorization: "Bearer " + key }, body, 60000, bindName);
    var pass;
    if (body) {
      var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
      pass = r.status === 200 && !!content && String(content).trim().length > 0;
    } else {
      pass = r.status === 200 && r.text.indexOf("deepseek-v4-flash") >= 0;
    }
    return { probe: "endpoint", target: name, status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok" : ("http=" + r.status) };
  } catch (e) {
    return { probe: "endpoint", target: name, status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
async function auditRoster(env, rosterData) {
  var drifts = [];
  var byId = {};
  for (var i = 0; i < (rosterData || []).length; i++) byId[rosterData[i].id] = rosterData[i];
  for (var id in TIER0_WA) {
    var wa = TIER0_WA[id];
    var adv = byId[id] && byId[id]._router;
    if (!adv) { drifts.push({ model: id, field: "roster-entry", advertised: "missing", catalog: wa }); continue; }
    var short = wa.split("/").pop();
    var r;
    try {
      r = await jfetch(env, CATALOG + "/ai/models/search?search=" + encodeURIComponent(short), { Authorization: "Bearer " + env.CF_API_TOKEN }, null, 30000);
    } catch (e) { drifts.push({ model: id, field: "catalog-fetch", advertised: "ok", catalog: "err" }); continue; }
    var hit = null;
    var arr = r.data && r.data.result;
    for (var j = 0; arr && j < arr.length; j++) if (arr[j].name === wa) { hit = arr[j]; break; }
    if (!hit) { drifts.push({ model: id, field: "catalog-entry", advertised: "present", catalog: "missing " + wa }); continue; }
    var props = {};
    for (var k = 0; k < (hit.properties || []).length; k++) props[hit.properties[k].property_id] = hit.properties[k].value;
    var catCtx = Number(props.context_window);
    var catVision = props.vision === "true" ? 1 : 0;
    var catReason = props.reasoning === "true" ? 1 : 0;
    var catFC = props.function_calling === "true" ? 1 : 0;
    if (adv.ctx !== catCtx) drifts.push({ model: id, field: "ctx", advertised: adv.ctx, catalog: catCtx });
    if ((adv.vision ? 1 : 0) !== catVision) drifts.push({ model: id, field: "vision", advertised: adv.vision ? 1 : 0, catalog: catVision });
    if ((adv.reasoning ? 1 : 0) !== catReason) drifts.push({ model: id, field: "reasoning", advertised: adv.reasoning ? 1 : 0, catalog: catReason });
    if ((adv.tools ? 1 : 0) !== catFC) drifts.push({ model: id, field: "tools", advertised: adv.tools ? 1 : 0, catalog: catFC });
  }
  return drifts;
}
function now() { return Date.now(); }
async function cfgGet(env, key, def) {
  try {
    var r = await env.QNFO_AUDIT.prepare("SELECT value FROM ai_calibration_config WHERE key = ?1").bind(key).first();
    return r && r.value != null ? r.value : def;
  } catch (e) { return def; }
}
async function setOverrides(env, model, o) {
  await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET ctx_override = ?2, vision_override = ?3, reasoning_override = ?4, updated_at = ?5 WHERE model_id = ?1")
    .bind(model, o.ctx != null ? o.ctx : null, o.vision != null ? o.vision : null, o.reasoning != null ? o.reasoning : null, now()).run();
}
async function clearOverrides(env, model) {
  await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET ctx_override = NULL, vision_override = NULL, reasoning_override = NULL, updated_at = ?2 WHERE model_id = ?1")
    .bind(model, now()).run();
}
async function upsertHealth(env, model, status, latency, failures) {
  await env.QNFO_AUDIT.prepare("INSERT INTO ai_model_health (model_id, status, ctx_override, vision_override, reasoning_override, last_probe_ts, last_latency_ms, consecutive_failures, updated_at) VALUES (?1, ?2, NULL, NULL, NULL, ?3, ?4, ?5, ?3) ON CONFLICT(model_id) DO UPDATE SET status = ?2, last_probe_ts = ?3, last_latency_ms = ?4, consecutive_failures = ?5, updated_at = ?3")
    .bind(model, status, now(), latency, failures).run();
}
async function fileIssue(env, title, description, priority) {
  var r = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
  if (r) return false;
  await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1, ?2, 'qnfo-ai-calibration', 'ai-calibration', ?3, 'open', ?4, ?4)")
    .bind(title, description, priority || "medium", now()).run();
  return true;
}
async function closeIssue(env, title, reason) {
  var r = await env.QNFO_AUDIT.prepare("SELECT id, description FROM agent_issues WHERE title = ?1 AND status = 'open' LIMIT 1").bind(title).first();
  if (!r) return false;
  var desc = (r.description || "") + " | auto-closed: " + reason;
  await env.QNFO_AUDIT.prepare("UPDATE agent_issues SET status = 'closed', description = ?2, updated_at = ?3 WHERE id = ?1").bind(r.id, desc, now()).run();
  return true;
}


// GW-WATCH-1 (2026-09-05): autonomous AI Gateway failure sweep. Every calibration run queries the
// account AI Gateway logs for failed requests (success=false) since the last sweep, groups by
// model+status, records counts into qnfo-audit.ai_gateway_failures, auto-files an agent_issue for a
// NEW recurring class (count >= 2 in the window), and auto-closes an issue when its class has had no
// failure in 24h. This makes gateway error detection + triage + recovery user-free: any NEW error
// class surfaces as an open issue for the ops cycle, and recovered classes close themselves.
async function gatewayFailureSweep(env, t0) {
  var out = { ok: true, classes: 0, total: 0, summary: "" };
  try {
    await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS ai_gateway_failures (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, model TEXT, status INTEGER, count INTEGER, error_class TEXT, sample_detail TEXT, source TEXT)").run();
  } catch (e) { out.ok = false; out.summary = "ddl err " + String(e && e.message || e).slice(0, 80); return out; }
  var lastTs = t0 - 45 * 60 * 1000;
  try {
    var cfg = await env.QNFO_AUDIT.prepare("SELECT value FROM ai_calibration_config WHERE key = ?1").bind("gw_sweep_last_ts").first();
    if (cfg && cfg.value != null && Number(cfg.value) > 0) lastTs = Number(cfg.value);
  } catch (e) {}
  var startIso = new Date(lastTs).toISOString();
  var buckets = {};
  var rows = [];
  var limit = 3;
  try {
    for (var page = 1; page <= limit; page++) {
      var r = await jfetch(env, CATALOG + "/ai-gateway/gateways/default/logs?per_page=50&page=" + page + "&success=false&start_time=" + encodeURIComponent(startIso), { Authorization: "Bearer " + env.CF_API_TOKEN }, null, 25e3);
      if (r.status !== 200 || !r.data || !Array.isArray(r.data.result)) break;
      var arr = r.data.result;
      if (!arr.length) break;
      for (var i = 0; i < arr.length; i++) {
        var row = arr[i];
        var st = row.status_code || 0;
        var mdl = row.model || "unknown";
        var key = st + "|" + mdl;
        buckets[key] = buckets[key] || { status: st, model: mdl, count: 0, sample: "" };
        buckets[key].count++;
        if (!buckets[key].sample) buckets[key].sample = (row.id || "") + "@" + (row.created_at || "");
      }
      rows = rows.concat(arr);
      if (arr.length < 50) break;
      await new Promise(function(res) { setTimeout(res, 5); });
    }
  } catch (e) {
    out.ok = false;
    out.summary = "fetch err " + String(e && e.message || e).slice(0, 120);
    return out;
  }
  var cls = Object.keys(buckets);
  out.total = rows.length;
  out.classes = cls.length;
  var parts = [];
  for (var ci = 0; ci < cls.length; ci++) {
    var b = buckets[cls[ci]];
    var clsLabel = "other";
    try {
      if (b.sample) {
        var d = await jfetch(env, CATALOG + "/ai-gateway/gateways/default/logs/" + encodeURIComponent(b.sample.split("@")[0]), { Authorization: "Bearer " + env.CF_API_TOKEN }, null, 20e3);
        var dres = d.data && d.data.result;
      var rh = dres && dres.response_head ? String(dres.response_head) : (d.data && d.data.response_head ? String(d.data.response_head) : "");
        if (/string' not in 'array'|oneOf|Bad input/.test(rh)) clsLabel = "content-shape";
        else if (/capacity temporarily|rate limit/i.test(rh)) clsLabel = "rate-capacity";
        else if (/image|dimensions|at least 10px/i.test(rh)) clsLabel = "image-input";
        else if (/arguments must be valid JSON/i.test(rh)) clsLabel = "tool-args-json";
        else if (/unavailable|5[0-9][0-9]|internal/i.test(rh)) clsLabel = "upstream";
        b.sample = rh.slice(0, 200) || b.sample;
      }
    } catch (e) {}
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO ai_gateway_failures (ts, model, status, count, error_class, sample_detail, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'qnfo-ai-calibration')").bind(t0, b.model, b.status, b.count, clsLabel, String(b.sample || "").slice(0, 300)).run();
    } catch (e) {}
    parts.push(b.status + " " + b.model + " x" + b.count + " [" + clsLabel + "]");
    var title = "[gw-fail] " + b.status + " " + b.model;
    try {
      var prev = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND status = ?2 AND ts < ?3 AND ts > ?4").bind(b.model, b.status, lastTs, lastTs - 45 * 60 * 1000).first();
      var prevCount = prev ? Number(prev.c || 0) : 0;
      if (b.count >= 2 || prevCount > 0) {
        await fileIssue(env, title, "gateway failures in sweep window: " + b.count + "x status=" + b.status + " class=" + clsLabel + " sample=" + String(b.sample || "").slice(0, 200) + ". Router-level self-heal handles content-shape/rate classes; escalate if this class persists.", "high");
      }
    } catch (e) {}
  }
  try {
    var openTitles = await env.QNFO_AUDIT.prepare("SELECT id, title FROM agent_issues WHERE title LIKE '[gw-fail]%' AND status = 'open'").all();
    for (var oi = 0; oi < (openTitles.results || []).length; oi++) {
      var ttl = openTitles.results[oi].title;
      var modelPart = ttl.replace(/^\[gw-fail\] \d+ /, "");
      try {
        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1000).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no failures for 24h");
      } catch (e) {}
    }
  } catch (e) {}
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_config (key, value) VALUES ('gw_sweep_last_ts', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t0)).run();
  } catch (e) {}
  out.summary = cls.length ? parts.join("; ") : "clean (0 failed requests in window)";
  return out;
}

async function calibration(env, trigger) {
  var t0 = Date.now();
  var runId = "cal-" + t0 + "-" + Math.random().toString(16).slice(2, 8);
  var results = [];
  var gwSweepRes = null;
  try { gwSweepRes = await gatewayFailureSweep(env, t0); if (gwSweepRes) results.push({ probe: "gateway-sweep", target: "ai-gateway-default", status: gwSweepRes.ok ? "pass" : "fail", latency_ms: 0, detail: String(gwSweepRes.summary || "").slice(0, 300) }); } catch (e) {}
  var failing = {};
  var driftByModel = {};
  var failThreshold = parseInt(await cfgGet(env, "fail_threshold", "2"), 10) || 2;
  var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) || 8000;
  var visionModels = (await cfgGet(env, "vision_models", DEFAULT_VISION)).split(",").map(function (s) { return s.trim(); }).filter(Boolean);

  // 1. router health + roster
  var roster = null;
  try {
    var h = await jfetch(env, "https://qnfo-ai.internal/health", null, null, 20000, "QNFO_AI");
    results.push({ probe: "health", target: "qnfo-ai", status: (h.status === 200 && h.data && h.data.status === "ok") ? "pass" : "fail", latency_ms: 0, detail: "version=" + (h.data && h.data.version) });
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/models", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY }, null, 30000, "QNFO_AI");
    if (r.status === 200 && r.data && Array.isArray(r.data.data)) {
      roster = r.data.data;
      results.push({ probe: "roster", target: "qnfo-ai", status: "pass", latency_ms: 0, detail: r.data.data.length + " models" });
    } else {
      results.push({ probe: "roster", target: "qnfo-ai", status: "fail", latency_ms: 0, detail: "http=" + r.status });
    }
  } catch (e) {
    results.push({ probe: "health", target: "qnfo-ai", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) });
  }

  // 2. catalog truth audit + override self-correct
  if (roster) {
    var drifts = await auditRoster(env, roster);
    for (var di = 0; di < drifts.length; di++) {
      var d = drifts[di];
      (driftByModel[d.model] = driftByModel[d.model] || []).push(d);
      results.push({ probe: "roster-drift", target: d.model, status: "drift", latency_ms: 0, detail: d.field + ": advertised=" + d.advertised + " catalog=" + d.catalog });
    }
    for (var mid in driftByModel) {
      var cat = {};
      var detail = [];
      for (var j = 0; j < driftByModel[mid].length; j++) {
        var dd = driftByModel[mid][j];
        detail.push(dd.field + "=" + dd.advertised + "->" + dd.catalog);
        if (dd.field === "ctx") cat.ctx = dd.catalog;
        if (dd.field === "vision") cat.vision = dd.catalog;
        if (dd.field === "reasoning") cat.reasoning = dd.catalog;
      }
      await setOverrides(env, mid, cat);
      await fileIssue(env, "[ai-cal] roster drift: " + mid, "advertised vs catalog: " + detail.join("; ") + ". Live override applied in ai_model_health; fix the MODELS roster in qnfo-ai source and redeploy to clear.", "medium");
    }
    try {
      var ovr = await env.QNFO_AUDIT.prepare("SELECT model_id FROM ai_model_health WHERE ctx_override IS NOT NULL OR vision_override IS NOT NULL OR reasoning_override IS NOT NULL").all();
      for (var k = 0; k < (ovr.results || []).length; k++) {
        var m0 = ovr.results[k].model_id;
        if (!driftByModel[m0]) {
          await clearOverrides(env, m0);
          await closeIssue(env, "[ai-cal] roster drift: " + m0, "drift resolved in live roster");
        }
      }
    } catch (e) { }
  }

  // 3. model probes (pool 4) + health + ticket lifecycle
  await runPool(ALL_MODELS, 4, async function (m) {
    var res = await probeCompletion(env, m);
    results.push(Object.assign({ probe: "model", target: m }, res));
    try {
      var prev = await env.QNFO_AUDIT.prepare("SELECT consecutive_failures FROM ai_model_health WHERE model_id = ?1").bind(m).first();
      var cf = prev ? (prev.consecutive_failures || 0) : 0;
      if (res.status === "pass") {
        await upsertHealth(env, m, "ok", res.latency_ms, 0);
        await closeIssue(env, "[ai-cal] model probe failing: " + m, "self-recovered");
        if (res.latency_ms > latencyMax) results.push({ probe: "latency", target: m, status: "fail", latency_ms: res.latency_ms, detail: "slow minimal probe (> " + latencyMax + "ms)" });
      } else {
        cf += 1;
        var st = cf >= failThreshold ? "failing" : "degraded";
        await upsertHealth(env, m, st, res.latency_ms, cf);
        if (cf >= failThreshold) {
          failing[m] = res.detail;
          await fileIssue(env, "[ai-cal] model probe failing: " + m, "consecutive_failures=" + cf + " detail=" + res.detail, "high");
        }
      }
    } catch (e) { }
    return res;
  });

  // 4. vision probes (pool 2)
  await runPool(visionModels, 2, async function (m) {
    var res = await probeVision(env, m);
    results.push(Object.assign({ probe: "vision", target: m }, res));
    return res;
  });

  // 5. tools + stream + routing
  results.push(Object.assign({ probe: "tools", target: "deepseek-v4-flash" }, await probeTools(env)));
  results.push(Object.assign({ probe: "stream", target: "deepseek-v4-flash" }, await probeStream(env)));
  results = results.concat(await probeRouting(env));

  // 6. other endpoints
  results.push(await probeEndpoint(env, "qnfo-ops/ops-exec", "https://qnfo-ops.internal/v1/chat/completions", env.OPS_KEY, { model: "ops-exec", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 64, stream: false }, "QNFO_OPS"));
  results.push(await probeEndpoint(env, "personal-api/personal-twin-chat", "https://personal-api.internal/v1/chat/completions", env.PT_KEY, { model: "personal-twin-chat", messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 16, stream: false }, "PT_API"));
  results.push(await probeEndpoint(env, "deepseek-direct/models", DEEPSEEK + "/models", env.DEEPSEEK_KEY, null, null));

  // 7. persist
  var pass = 0, fail = 0, driftCount = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i].status === "pass") pass++;
    else if (results[i].status === "drift") driftCount++;
    else fail++;
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_runs (id, ts, trigger, total, pass, fail, drifts, duration_ms, digest) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)")
      .bind(runId, t0, trigger, results.length, pass, fail, driftCount, Date.now() - t0, JSON.stringify({ failing: Object.keys(failing), drift_models: Object.keys(driftByModel) })).run();
    var stmt = env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_results (run_id, ts, probe, target, status, latency_ms, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)");
    var batch = [];
    for (var j = 0; j < results.length; j++) {
      batch.push(stmt.bind(runId, t0, results[j].probe, results[j].target, results[j].status, results[j].latency_ms || 0, String(results[j].detail || "").slice(0, 300)));
      if (batch.length >= 20) { await env.QNFO_AUDIT.batch(batch); batch = []; }
    }
    if (batch.length) await env.QNFO_AUDIT.batch(batch);
    await env.QNFO_AUDIT.prepare("DELETE FROM ai_calibration_results WHERE ts < ?1").bind(t0 - 7 * 86400 * 1000).run();
    await env.QNFO_AUDIT.prepare("DELETE FROM ai_calibration_runs WHERE ts < ?1").bind(t0 - 30 * 86400 * 1000).run();
  } catch (e) { results.push({ probe: "persist", target: "d1", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 150) }); }
  return { run_id: runId, trigger: trigger, duration_ms: Date.now() - t0, total: results.length, pass: pass, fail: fail, drifts: driftCount, failing_models: Object.keys(failing), drift_models: Object.keys(driftByModel), results: results };
}
export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    var path = url.pathname;
    if (path === "/health") return json({ ok: true, worker: "qnfo-ai-calibration", version: VERSION, bindings: { qnfo_audit: !!env.QNFO_AUDIT }, crons: ["*/30 * * * *"] });
    if (path === "/manifest") return json({ service: "qnfo-ai-calibration", kind: "worker", version: VERSION, purpose: "autonomous periodic stress-testing/calibration of QNFO AI endpoints (self-auditing, self-correcting, self-improving)", capabilities: ["endpoint-stress-sweeps", "catalog-truth-audit", "vision-tools-stream-routing-boundary-probes", "health-table-publishing", "ticket-lifecycle-self-heal", "config-driven-thresholds"], routes: ["/health", "/manifest", "/run", "/results", "/"], crons: ["*/30 * * * *"] });
    if (path === "/run" && request.method === "POST") {
      if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
      var digest = await calibration(env, "manual");
      return json({ ok: true, digest: digest });
    }
    if (path === "/results" && request.method === "GET") {
      if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
      var lim = parseInt(url.searchParams.get("limit") || "30", 10);
      var res = await env.QNFO_AUDIT.prepare("SELECT * FROM ai_calibration_results ORDER BY id DESC LIMIT ?1").bind(Math.min(Math.max(lim, 1), 100)).all();
      var runs = await env.QNFO_AUDIT.prepare("SELECT * FROM ai_calibration_runs ORDER BY ts DESC LIMIT 3").all();
      var health = await env.QNFO_AUDIT.prepare("SELECT * FROM ai_model_health ORDER BY model_id").all();
      return json({ ok: true, latest_runs: runs.results, health: health.results, results: res.results });
    }
    if (path === "/") return json({ service: "qnfo-ai-calibration", version: VERSION, routes: ["/health", "/manifest", "/run", "/results"] });
    return json({ error: "not found" }, 404);
  },
  async scheduled(controller, env, ctx) {
    await calibration(env, "cron");
  }
};
