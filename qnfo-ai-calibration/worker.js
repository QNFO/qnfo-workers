var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var PROBER_CRON = "*/20 * * * *";

// worker.js
var VERSION = "1.3.2-kaizen-signal-retired"; /* 1.3.2 FOLD-HYGIENE-1 (2026-10-06, #1756): the prober member's freshness SIGNALS no longer grade kaizen_candidates; qnfo-kaizen was retired in PR 657, so the signal read stale forever and held ooda_observe below its true value (13 of 17 fresh). 1.3.1 PROBER-ON-CAL-TICK-1 (2026-10-06, #1756): the every-20-minutes trigger registered for the member never fired (no prober run at 06:40 or 07:00 while the every-30-minutes calibration ran), so the member now runs on the every-30-minutes tick next to the calibration, the host awaits its waitUntil work, and the every-20-minutes trigger is dropped (one cron fewer). 1.3.0 PROBER-FOLD-1 (2026-10-06, pillar core, #1756): ai-health-prober runs here as a member (proberMod, the every-20-minutes cron, /prober/health and /prober/freshness, /prober/run behind the calibration key); the separate ai-health-prober worker is retired by fold. 1.2.9 GW-402-UNFUNDED-1 (2026-10-05, pillar: cost; agent_issues #1992, root cause shared with #1986): a provider's HTTP 402 ("Insufficient Balance", DeepSeek, owner decision 2026-10-05: do not top up) is an unfunded account, not a degraded model. The sweep classed it "other", set ai_model_health deepseek/deepseek-v4-flash degraded on every window with >= 2 such calls (15 at 16:00Z), and qnfo-fleet-control refiled MODEL-DEGRADED (#1992, #1256, #1099 ...). Now status 402 or an insufficient-balance/payment-required body is error_class "unfunded": recorded in ai_gateway_failures, never a [gw-fail] issue, never a degraded health row, and ignored (like rate-capacity) by the 24h reconcile that clears a degraded row, so the row recovers on the next sweep. The spend-side fix (stop paying for the failed first round trip) is #1986 in qnfo-ops. */
var DEEPSEEK = "https://api.deepseek.com/v1";
var ACCOUNT = "edb167b78c9fb901ea5bca3ce58ccc4b";
var CATALOG = "https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT;
var UA = "QNFO-AI-Calibration/" + VERSION;
var RED10X10_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAIAAAACUFjqAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC";
var TIER0_WA = {
  /* retired: not in qnfo-ai roster (v4.3.7) */
  /* retired: not in qnfo-ai roster (v4.3.7) */
  /* retired: not in qnfo-ai roster (v4.3.7) */
  /* retired: not in qnfo-ai roster (v4.3.7) */
  "kimi-k2.6": "@cf/moonshotai/kimi-k2.6",
  /* retired: not in qnfo-ai roster (v4.3.7) */
  /* retired: not in qnfo-ai roster (v4.3.7) */
  /* retired: not in qnfo-ai roster (v4.3.7) */
  "glm-5.3-flash": "@cf/zai-org/glm-5.3-flash",
  "gpt-oss-120b": "@cf/openai/gpt-oss-120b",
  "deepseek-v4-flash-wa": "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "deepseek-v4-pro-wa": "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "kimi-k2.7-code": "@cf/moonshotai/kimi-k2.7-code",
  "glm-5.3": "@cf/zai-org/glm-5.3",
  /* retired: not in qnfo-ai roster (v4.3.7) */
};
var ALL_MODELS = Object.keys(TIER0_WA).concat(["deepseek-v4-flash", "deepseek-v4-flash-thinking", "deepseek-v4-pro"]);
var CF_TO_INTERNAL = {};
(function() {
  for (var k in TIER0_WA) {
    if (TIER0_WA[k]) CF_TO_INTERNAL[TIER0_WA[k]] = k;
  }
})();
CF_TO_INTERNAL["@cf/baai/bge-base-en-v1.5"] = "bge-base-en-v1.5";
function internalId(m) {
  if (CF_TO_INTERNAL[m]) return CF_TO_INTERNAL[m];
  if (m && m.indexOf("@cf/") === 0) {
    for (var k in TIER0_WA) {
      if (TIER0_WA[k] && TIER0_WA[k].indexOf(m.slice(5)) >= 0) return k;
    }
  }
  return m;
}
__name(internalId, "internalId");
var DEFAULT_VISION = "kimi-k2.6,kimi-k2.7-code,glm-5.3-flash";
function json(resp, status) {
  return new Response(JSON.stringify(resp), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
function withTimeout(promise, ms) {
  return new Promise(function(resolve, reject) {
    var t = setTimeout(function() {
      reject(new Error("timeout after " + ms + "ms"));
    }, ms);
    promise.then(function(v) {
      clearTimeout(t);
      resolve(v);
    }, function(e) {
      clearTimeout(t);
      reject(e);
    });
  });
}
__name(withTimeout, "withTimeout");
async function sha256Hex(s) {
  var enc = new TextEncoder();
  var buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.prototype.map.call(new Uint8Array(buf), function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha256Hex, "sha256Hex");
async function authorized(request, env) {
  var h = request.headers.get("Authorization") || "";
  if (!h.startsWith("Bearer ")) return false;
  // AUTH-FAIL-CLOSED-1 (2026-10-01): compare only against a configured key. Without this, a missing QNFO_ROUTER_KEY
  // made the expected value sha256("") and an empty bearer token would match; header whitespace trimming is what
  // prevented it in practice, and the code must not rely on that.
  if (!env.QNFO_ROUTER_KEY || h.length <= 7) return false;
  return await sha256Hex(h.slice(7)) === await sha256Hex(env.QNFO_ROUTER_KEY);
}
__name(authorized, "authorized");
async function jfetch(env, url, headers, body, timeoutMs, bindName) {
  var init = { method: body ? "POST" : "GET", headers: Object.assign({ "Content-Type": "application/json", "User-Agent": UA }, headers || {}) };
  if (body) init.body = JSON.stringify(body);
  var bind = bindName ? env[bindName] : null;
  var resp = await withTimeout(bind ? bind.fetch(url, init) : fetch(url, init), timeoutMs || 45e3);
  var text = await resp.text();
  var data = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { _raw: text.slice(0, 400) };
  }
  return { status: resp.status, data, text };
}
__name(jfetch, "jfetch");
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
  __name(worker, "worker");
  var ws = [];
  for (var w = 0; w < Math.min(limit, items.length); w++) ws.push(worker());
  await Promise.all(ws);
  return out;
}
__name(runPool, "runPool");
async function probeCompletion(env, model) {
  var t0 = Date.now();
  try {
    var r = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 16, stream: false },
      45e3,
      "QNFO_AI"
    );
    var _m = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message;
    var content = _m && _m.content;
    var _rs = _m && _m.reasoning_content;
    var echo = r.data && r.data.model === model;
    var _has = (!!content && String(content).trim().length > 0) || (!!_rs && String(_rs).trim().length > 0);
    var pass = r.status === 200 && _has && echo;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok" : "http=" + r.status + " echo=" + echo + " " + JSON.stringify(String(content || "").slice(0, 60)) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
__name(probeCompletion, "probeCompletion");
async function probeVision(env, model) {
  var t0 = Date.now();
  var msgs = [{ role: "user", content: [{ type: "text", text: "What color is this image? Reply in one word." }, { type: "image_url", image_url: { url: "data:image/png;base64," + RED10X10_B64 } }] }];
  try {
    var r = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model, messages: msgs, max_tokens: 128, stream: false },
      9e4,
      "QNFO_AI"
    );
    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    var s = String(content || "");
    var noSee = /cannot see|can't view|cannot view|no image|unsupported image|not able to see|can not see/i.test(s);
    var pass = r.status === 200 && s.trim().length > 0 && !noSee;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok " + s.slice(0, 40) : "http=" + r.status + " noSee=" + noSee + " " + s.slice(0, 80) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
__name(probeVision, "probeVision");
async function probeTools(env) {
  var t0 = Date.now();
  var tools = [{ type: "function", function: { name: "get_weather", description: "Get weather", parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } } }];
  try {
    var r = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "deepseek-v4-flash", messages: [{ role: "user", content: "What is the weather in Berlin?" }], tools, max_tokens: 64, stream: false },
      6e4,
      "QNFO_AI"
    );
    var tc = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.tool_calls;
    var pass = r.status === 200 && Array.isArray(tc) && tc.length > 0;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "tool_calls=" + tc.length : "http=" + r.status };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
__name(probeTools, "probeTools");
async function probeStream(env) {
  var t0 = Date.now();
  try {
    var r = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "deepseek-v4-flash", messages: [{ role: "user", content: "Say hi" }], max_tokens: 16, stream: true },
      6e4,
      "QNFO_AI"
    );
    var pass = r.status === 200 && r.text.indexOf("[DONE]") >= 0 && r.text.indexOf("data:") >= 0;
    return { status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "sse ok" : "http=" + r.status + " done=" + (r.text.indexOf("[DONE]") >= 0) };
  } catch (e) {
    return { status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
__name(probeStream, "probeStream");
async function probeRouting(env) {
  var out = [];
  try {
    var r = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "auto", messages: [{ role: "user", content: "Hello" }], max_tokens: 32, stream: false },
      6e4,
      "QNFO_AI"
    );
    var rt = r.data && r.data._router;
    var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
    var pass = r.status === 200 && !!rt && !!rt.routed_model && !!content && String(content).trim().length > 0;
    out.push({ probe: "routing", target: "auto/simple", status: pass ? "pass" : "fail", latency_ms: 0, detail: pass ? "routed=" + rt.routed_model : "http=" + r.status + " " + JSON.stringify(rt || {}).slice(0, 100) });
  } catch (e) {
    out.push({ probe: "routing", target: "auto/simple", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) });
  }
  try {
    var r2 = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "ensemble", messages: [{ role: "user", content: "What is 17*23?" }], max_tokens: 64, stream: false },
      12e4,
      "QNFO_AI"
    );
    var c2 = r2.data && r2.data.choices && r2.data.choices[0] && r2.data.choices[0].message && r2.data.choices[0].message.content;
    var pass2 = r2.status === 200 && r2.data.model === "ensemble" && !!c2 && String(c2).trim().length > 0;
    out.push({ probe: "routing", target: "ensemble/math", status: pass2 ? "pass" : "fail", latency_ms: 0, detail: pass2 ? "out=" + String(c2).slice(0, 40) : "http=" + r2.status });
  } catch (e) {
    out.push({ probe: "routing", target: "ensemble/math", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) });
  }
  try {
    var r3 = await jfetch(
      env,
      "https://qnfo-ai.internal/v1/chat/completions",
      { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
      { model: "nonexistent-model-xyz", messages: [{ role: "user", content: "hi" }], max_tokens: 32, stream: false },
      6e4,
      "QNFO_AI"
    );
    var pass3 = r3.status === 200 && r3.data && r3.data.model === "deepseek-v4-flash";
    out.push({ probe: "routing", target: "unknown-fallback", status: pass3 ? "pass" : "fail", latency_ms: 0, detail: pass3 ? "fallback=deepseek-v4-flash" : "http=" + r3.status + " model=" + (r3.data && r3.data.model) });
  } catch (e) {
    out.push({ probe: "routing", target: "unknown-fallback", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) });
  }
  for (var i = 0; i < 2; i++) {
    var mt = i === 0 ? 0 : 999999;
    try {
      var r4 = await jfetch(
        env,
        "https://qnfo-ai.internal/v1/chat/completions",
        { Authorization: "Bearer " + env.QNFO_ROUTER_KEY },
        { model: "deepseek-v4-flash", messages: [{ role: "user", content: "hi" }], max_tokens: mt, stream: false },
        6e4,
        "QNFO_AI"
      );
      out.push({ probe: "routing", target: "boundary/max_tokens=" + mt, status: r4.status === 200 ? "pass" : "fail", latency_ms: 0, detail: "http=" + r4.status });
    } catch (e) {
      out.push({ probe: "routing", target: "boundary/max_tokens=" + mt, status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) });
    }
  }
  return out;
}
__name(probeRouting, "probeRouting");
async function probeEndpoint(env, name, url, key, body, bindName) {
  var t0 = Date.now();
  try {
    var r = await jfetch(env, url, { Authorization: "Bearer " + key }, body, 6e4, bindName);
    var pass;
    if (body) {
      var content = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message && r.data.choices[0].message.content;
      pass = r.status === 200 && !!content && String(content).trim().length > 0;
    } else {
      pass = r.status === 200 && r.text.indexOf("deepseek-v4-flash") >= 0;
    }
    return { probe: "endpoint", target: name, status: pass ? "pass" : "fail", latency_ms: Date.now() - t0, detail: pass ? "ok" : "http=" + r.status };
  } catch (e) {
    return { probe: "endpoint", target: name, status: "fail", latency_ms: Date.now() - t0, detail: "err " + String(e && e.message || e).slice(0, 120) };
  }
}
__name(probeEndpoint, "probeEndpoint");
async function auditRoster(env, rosterData) {
  var drifts = [];
  var byId = {};
  for (var i = 0; i < (rosterData || []).length; i++) byId[rosterData[i].id] = rosterData[i];
  for (var id in TIER0_WA) {
    var wa = TIER0_WA[id];
    var adv = byId[id] && byId[id]._router;
    if (!adv) {
      drifts.push({ model: id, field: "roster-entry", advertised: "missing", catalog: wa });
      continue;
    }
    var short = wa.split("/").pop();
    var r;
    try {
      r = await jfetch(env, CATALOG + "/ai/models/search?search=" + encodeURIComponent(short), { Authorization: "Bearer " + env.CF_API_TOKEN }, null, 3e4);
    } catch (e) {
      drifts.push({ model: id, field: "catalog-fetch", advertised: "ok", catalog: "err" });
      continue;
    }
    var hit = null;
    var arr = r.data && r.data.result;
    for (var j = 0; arr && j < arr.length; j++) if (arr[j].name === wa) {
      hit = arr[j];
      break;
    }
    if (!hit) {
      drifts.push({ model: id, field: "catalog-entry", advertised: "present", catalog: "missing " + wa });
      continue;
    }
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
__name(auditRoster, "auditRoster");
function now() {
  return Date.now();
}
__name(now, "now");
async function cfgGet(env, key, def) {
  try {
    var r = await env.QNFO_AUDIT.prepare("SELECT value FROM ai_calibration_config WHERE key = ?1").bind(key).first();
    return r && r.value != null ? r.value : def;
  } catch (e) {
    return def;
  }
}
__name(cfgGet, "cfgGet");
async function setOverrides(env, model, o) {
  await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET ctx_override = ?2, vision_override = ?3, reasoning_override = ?4, updated_at = ?5 WHERE model_id = ?1").bind(model, o.ctx != null ? o.ctx : null, o.vision != null ? o.vision : null, o.reasoning != null ? o.reasoning : null, now()).run();
}
__name(setOverrides, "setOverrides");
async function clearOverrides(env, model) {
  await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET ctx_override = NULL, vision_override = NULL, reasoning_override = NULL, updated_at = ?2 WHERE model_id = ?1").bind(model, now()).run();
}
__name(clearOverrides, "clearOverrides");
async function upsertHealth(env, model, status, latency, failures) {
  await env.QNFO_AUDIT.prepare("INSERT INTO ai_model_health (model_id, status, ctx_override, vision_override, reasoning_override, last_probe_ts, last_latency_ms, consecutive_failures, updated_at) VALUES (?1, ?2, NULL, NULL, NULL, ?3, ?4, ?5, ?3) ON CONFLICT(model_id) DO UPDATE SET status = ?2, last_probe_ts = ?3, last_latency_ms = ?4, consecutive_failures = ?5, updated_at = ?3").bind(model, status, now(), latency, failures).run();
}
__name(upsertHealth, "upsertHealth");
function fnv32(s) {
  var h = 2166136261 >>> 0;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ("00000000" + h.toString(16)).slice(-8);
}
__name(fnv32, "fnv32");
async function fileIssue(env, title, description, priority) {
  var tag = title.indexOf("[gw-fail]") === 0 ? "gwfail" : "cal";
  var fp = tag + ":" + fnv32(title);
  var ex = await env.QNFO_AUDIT.prepare("SELECT fingerprint FROM issue_ledger WHERE fingerprint = ?1").bind(fp).first();
  if (ex) {
    await env.QNFO_AUDIT.prepare("UPDATE issue_ledger SET occurrences = occurrences + 1, last_seen = ?2, last_detail = ?3, updated_at = ?2, status = 'open', resolved_at = NULL, resolution_note = NULL WHERE fingerprint = ?1").bind(fp, now(), String(description || "").slice(0, 500)).run();
    return false;
  }
  await env.QNFO_AUDIT.prepare("INSERT INTO issue_ledger (fingerprint, source, level, category, title, status, first_seen, last_seen, occurrences, last_detail, updated_at) VALUES (?1, 'qnfo-ai-calibration', ?2, 'ai-calibration', ?3, 'open', ?4, ?4, 1, ?5, ?4)").bind(fp, priority === "high" ? "error" : "warn", title, now(), String(description || "").slice(0, 500)).run();
  return true;
}
__name(fileIssue, "fileIssue");
async function closeIssue(env, title, reason) {
  var tag = title.indexOf("[gw-fail]") === 0 ? "gwfail" : "cal";
  var fp = tag + ":" + fnv32(title);
  var ex = await env.QNFO_AUDIT.prepare("SELECT fingerprint FROM issue_ledger WHERE fingerprint = ?1 AND status = 'open' LIMIT 1").bind(fp).first();
  if (!ex) return false;
  await env.QNFO_AUDIT.prepare("UPDATE issue_ledger SET status = 'resolved', resolved_at = ?2, resolution_note = ?3, updated_at = ?2 WHERE fingerprint = ?1").bind(fp, now(), String(reason || "").slice(0, 300)).run();
  return true;
}
__name(closeIssue, "closeIssue");
// GW-402-UNFUNDED-1 (1.2.9): one place decides the failure class of a gateway log bucket from its HTTP status and the
// upstream response head. "unfunded" (402, or an insufficient-balance / payment-required body) and "rate-capacity" are
// not evidence against the model: no [gw-fail] issue, no degraded health row, and the 24h reconcile ignores them.
var GW_NO_DEGRADE_CLASSES = { "rate-capacity": 1, "unfunded": 1 };
function gwErrorClass(status, rh) {
  var s = Number(status) || 0, h = String(rh || "");
  if (s === 402 || /insufficient[ _-]?balance|payment required|insufficient[ _-]?quota|billing (?:hard )?limit|exceeded your current quota/i.test(h)) return "unfunded";
  if (/string' not in 'array'|oneOf|Bad input/.test(h)) return "content-shape";
  if (/capacity temporarily|rate limit/i.test(h)) return "rate-capacity";
  if (/image|dimensions|at least 10px/i.test(h)) return "image-input";
  if (/arguments must be valid JSON/i.test(h)) return "tool-args-json";
  if (/unavailable|5[0-9][0-9]|internal/i.test(h)) return "upstream";
  return "other";
}
__name(gwErrorClass, "gwErrorClass");
async function gatewayFailureSweep(env, t0) {
  var out = { ok: true, classes: 0, total: 0, summary: "" };
  try {
    await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS ai_gateway_failures (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, model TEXT, status INTEGER, count INTEGER, error_class TEXT, sample_detail TEXT, source TEXT)").run();
  } catch (e) {
    out.ok = false;
    out.summary = "ddl err " + String(e && e.message || e).slice(0, 80);
    return out;
  }
  var lastTs = t0 - 45 * 60 * 1e3;
  try {
    var cfg = await env.QNFO_AUDIT.prepare("SELECT value FROM ai_calibration_config WHERE key = ?1").bind("gw_sweep_last_ts").first();
    if (cfg && cfg.value != null && Number(cfg.value) > 0) lastTs = Number(cfg.value);
  } catch (e) {
  }
  var startIso = new Date(lastTs).toISOString();
  var buckets = {};
  var rows = [];
  var fetchFail = false;
  var limit = 3;
  try {
    for (var page = 1; page <= limit; page++) {
      var r = await jfetch(env, CATALOG + "/ai-gateway/gateways/default/logs?per_page=50&page=" + page + "&success=false&start_date=" + encodeURIComponent(startIso), { Authorization: "Bearer " + env.CF_API_TOKEN }, null, 25e3);
      if (r.status !== 200 || !r.data || !Array.isArray(r.data.result)) { fetchFail = true; out.ok = false; out.summary = "gw-log fetch HTTP " + r.status + " - sweep window NOT advanced"; break; }
      var arr = r.data.result;
      if (!arr.length) break;
      for (var i = 0; i < arr.length; i++) {
        var row = arr[i];
        if (Number(new Date(row.created_at).getTime()) < lastTs) continue;
        var st = row.status_code || 0;
        var mdl = row.model || "unknown";
        var key = st + "|" + mdl;
        buckets[key] = buckets[key] || { status: st, model: mdl, count: 0, sample: "" };
        buckets[key].count++;
        if (!buckets[key].sample) buckets[key].sample = (row.id || "") + "@" + (row.created_at || "");
      }
      rows = rows.concat(arr);
      if (arr.length < 50) break;
      await new Promise(function(res) {
        setTimeout(res, 5);
      });
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
    var clsLabel = gwErrorClass(b.status, "");
    try {
      if (b.sample) {
        var d = await jfetch(env, CATALOG + "/ai-gateway/gateways/default/logs/" + encodeURIComponent(b.sample.split("@")[0]), { Authorization: "Bearer " + env.CF_API_TOKEN }, null, 2e4);
        var dres = d.data && d.data.result;
        var rh = dres && dres.response_head ? String(dres.response_head) : d.data && d.data.response_head ? String(d.data.response_head) : "";
        clsLabel = gwErrorClass(b.status, rh);
        b.sample = rh.slice(0, 200) || b.sample;
      }
    } catch (e) {
    }
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO ai_gateway_failures (ts, model, status, count, error_class, sample_detail, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'qnfo-ai-calibration')").bind(t0, b.model, b.status, b.count, clsLabel, String(b.sample || "").slice(0, 300)).run();
    } catch (e) {
    }
    parts.push(b.status + " " + b.model + " x" + b.count + " [" + clsLabel + "]");
    var title = "[gw-fail] " + b.status + " " + b.model;
    try {
      var dispo = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title LIKE ?1 AND status IN ('wontfix','closed','resolved') LIMIT 1").bind("%" + b.model + "%").first();
      var prev = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND status = ?2 AND ts < ?3 AND ts > ?4").bind(b.model, b.status, lastTs, lastTs - 45 * 60 * 1e3).first();
      var prevCount = prev ? Number(prev.c || 0) : 0;
      if (!dispo && !GW_NO_DEGRADE_CLASSES[clsLabel] && (b.count >= 2 || prevCount > 0)) {
        await fileIssue(env, title, "gateway failures in sweep window: " + b.count + "x status=" + b.status + " class=" + clsLabel + " sample=" + String(b.sample || "").slice(0, 200) + ". Router-level self-heal handles content-shape/rate classes; escalate if this class persists.", "high");
      }
    } catch (e) {
    }
    try {
      var recurring = !GW_NO_DEGRADE_CLASSES[clsLabel] && (b.count >= 2 || prevCount > 0);
      var targetId = internalId(b.model);
      try {
        var hrow = await env.QNFO_AUDIT.prepare("SELECT model_id FROM ai_model_health WHERE model_id = ?1").bind(targetId).first();
        if (recurring) {
          if (hrow) await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status='degraded', updated_at=?1 WHERE model_id=?2").bind((/* @__PURE__ */ new Date()).toISOString(), targetId).run();
          else if (String(targetId).indexOf("@cf/") !== 0) await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO ai_model_health (model_id, status, updated_at) VALUES (?1,'degraded',?2)").bind(targetId, (/* @__PURE__ */ new Date()).toISOString()).run();
        } else if (hrow && hrow.model_id) {
          var cur = await env.QNFO_AUDIT.prepare("SELECT status FROM ai_model_health WHERE model_id = ?1").bind(targetId).first();
          if (cur && cur.status === "degraded") await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status='ok', updated_at=?1 WHERE model_id=?2").bind((/* @__PURE__ */ new Date()).toISOString(), targetId).run();
        }
      } catch (e) {
      }
    } catch (e) {
    }
  }
  try {
    var openTitles = await env.QNFO_AUDIT.prepare("SELECT id, title FROM agent_issues WHERE title LIKE '[gw-fail]%' AND status = 'open'").all();
    for (var oi = 0; oi < (openTitles.results || []).length; oi++) {
      var ttl = openTitles.results[oi].title;
      var modelPart = ttl.replace(/^\[gw-fail\] \d+ /, "");
      try {
        var recent = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND error_class NOT IN ('rate-capacity','unfunded') AND ts > ?2").bind(modelPart, t0 - 24 * 3600 * 1e3).first();
        if (!recent || Number(recent.c || 0) === 0) await closeIssue(env, ttl, "no non-transient failures for 24h");
      } catch (e) {
      }
    }
  } catch (e) {
  }
  // v1.2.5 AMH-STALE-DEGRADE-RECONCILE (fixes MODEL-DEGRADED recurrence #1256):
  // a row set degraded by a gateway-failure sweep cannot clear via the per-bucket path,
  // because a CLEAN sweep produces no bucket for that model. Clear any degraded row that
  // carries zero consecutive_failures AND has no non-transient gateway failure in 24h.
  try {
    var degRows = await env.QNFO_AUDIT.prepare("SELECT model_id, consecutive_failures FROM ai_model_health WHERE status = 'degraded'").all();
    var degList = (degRows && degRows.results) || [];
    for (var di = 0; di < degList.length; di++) {
      var dmid = degList[di].model_id;
      if (Number(degList[di].consecutive_failures || 0) !== 0) continue;
      var drec = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS c FROM ai_gateway_failures WHERE model = ?1 AND error_class NOT IN ('rate-capacity','unfunded') AND ts > ?2").bind(internalId(dmid), t0 - 24 * 60 * 60 * 1000).first();
      if (drec && Number(drec.c || 0) > 0) continue;
      await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status = 'ok', updated_at = ?1 WHERE model_id = ?2").bind((/* @__PURE__ */ new Date()).toISOString(), dmid).run();
    }
  } catch (e) {
  }
  if (!fetchFail) {
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_config (key, value) VALUES ('gw_sweep_last_ts', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1").bind(String(t0)).run();
    } catch (e) {
    }
  }
  out.summary = cls.length ? parts.join("; ") : "clean (0 failed requests in window)";
  return out;
}
__name(gatewayFailureSweep, "gatewayFailureSweep");
async function calibration(env, trigger) {
  var t0 = Date.now();
  var runId = "cal-" + t0 + "-" + Math.random().toString(16).slice(2, 8);
  var results = [];
  var gwSweepRes = null;
  try {
    gwSweepRes = await gatewayFailureSweep(env, t0);
    if (gwSweepRes) results.push({ probe: "gateway-sweep", target: "ai-gateway-default", status: gwSweepRes.ok ? "pass" : "fail", latency_ms: 0, detail: String(gwSweepRes.summary || "").slice(0, 300) });
  } catch (e) {
  }
  var failing = {};
  var driftByModel = {};
  var failThreshold = parseInt(await cfgGet(env, "fail_threshold", "2"), 10) || 2;
  var latencyMax = parseInt(await cfgGet(env, "latency_max_ms", "8000"), 10) || 8e3;
  var visionModels = (await cfgGet(env, "vision_models", DEFAULT_VISION)).split(",").map(function(s) {
    return s.trim();
  }).filter(Boolean);
  var roster = null;
  var authBlind = false;
  try {
    var h = await jfetch(env, "https://qnfo-ai.internal/health", null, null, 2e4, "QNFO_AI");
    results.push({ probe: "health", target: "qnfo-ai", status: h.status === 200 && h.data && h.data.status === "ok" ? "pass" : "fail", latency_ms: 0, detail: "version=" + (h.data && h.data.version) });
    var r = await jfetch(env, "https://qnfo-ai.internal/v1/models", { Authorization: "Bearer " + env.QNFO_ROUTER_KEY }, null, 3e4, "QNFO_AI");
    var authorized = r.status === 200 && r.data && Array.isArray(r.data.data) && r.data.data.some(function(x) { return x && x._router; });
    if (r.status === 200 && r.data && Array.isArray(r.data.data) && !authorized) {
      authBlind = true;
      results.push({ probe: "roster", target: "qnfo-ai", status: "fail", latency_ms: 0, detail: "public listing only (no _router): QNFO_ROUTER_KEY rejected" });
    } else if (r.status === 401 || r.status === 403) {
      authBlind = true;
      results.push({ probe: "roster", target: "qnfo-ai", status: "fail", latency_ms: 0, detail: "http=" + r.status + " QNFO_ROUTER_KEY rejected" });
    } else if (authorized) {
      roster = r.data.data;
      results.push({ probe: "roster", target: "qnfo-ai", status: "pass", latency_ms: 0, detail: r.data.data.length + " models" });
    } else {
      results.push({ probe: "roster", target: "qnfo-ai", status: "fail", latency_ms: 0, detail: "http=" + r.status });
    }
  } catch (e) {
    results.push({ probe: "health", target: "qnfo-ai", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 100) });
  }
  if (authBlind) {
    await fileIssue(env, "[ai-cal] router key rejected by qnfo-ai (calibration blind)", "qnfo-ai refused QNFO_ROUTER_KEY (401/403 or public single-model listing). Roster audit and model probes are inconclusive and will not mark models failing. Fix: set QNFO_ROUTER_KEY on qnfo-ai-calibration to the current qnfo-ai router key.", "high");
  } else if (roster) {
    await closeIssue(env, "[ai-cal] router key rejected by qnfo-ai (calibration blind)", "authorized roster fetch succeeded");
  }
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
      var odr = await env.QNFO_AUDIT.prepare("SELECT title FROM issue_ledger WHERE status='open' AND source='qnfo-ai-calibration' AND title LIKE '[ai-cal] roster drift: %'").all();
      for (var k2 = 0; k2 < (odr.results || []).length; k2++) {
        var t2 = String(odr.results[k2].title || "");
        var mid2 = t2.slice(t2.indexOf(": ") + 2);
        if (mid2 && !driftByModel[mid2]) await closeIssue(env, t2, "roster audit clean: model no longer drifting");
      }
    } catch (e) {
    }
  }
  await runPool(ALL_MODELS, 4, async function(m) {
    var res = await probeCompletion(env, m);
    results.push(Object.assign({ probe: "model", target: m }, res));
    if (res.status !== "pass" && /http=40[13]\b/.test(String(res.detail || ""))) return res;
    try {
      var prev = await env.QNFO_AUDIT.prepare("SELECT consecutive_failures FROM ai_model_health WHERE model_id = ?1").bind(m).first();
      var cf = prev ? prev.consecutive_failures || 0 : 0;
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
    } catch (e) {
    }
    return res;
  });
  await runPool(visionModels, 2, async function(m) {
    var res = await probeVision(env, m);
    results.push(Object.assign({ probe: "vision", target: m }, res));
    return res;
  });
  results.push(Object.assign({ probe: "tools", target: "deepseek-v4-flash" }, await probeTools(env)));
  results.push(Object.assign({ probe: "stream", target: "deepseek-v4-flash" }, await probeStream(env)));
  results = results.concat(await probeRouting(env));
  results.push(await (async function(){ var t0=Date.now(); try { var r=await jfetch(env,"https://qnfo-ops.internal/health",null,null,2e4,"QNFO_OPS"); return {probe:"endpoint",target:"qnfo-ops/health",status:r.status===200?"pass":"fail",latency_ms:Date.now()-t0,detail:r.status===200?"ok":"http="+r.status}; } catch(e){ return {probe:"endpoint",target:"qnfo-ops/health",status:"fail",latency_ms:Date.now()-t0,detail:"err "+String(e&&e.message||e).slice(0,120)}; } })());
  results.push(await (async function(){ var t0=Date.now(); try { var r=await jfetch(env,"https://personal-api.internal/health",null,null,2e4,"PT_API"); return {probe:"endpoint",target:"personal-api/health",status:r.status===200?"pass":"fail",latency_ms:Date.now()-t0,detail:r.status===200?"ok":"http="+r.status}; } catch(e){ return {probe:"endpoint",target:"personal-api/health",status:"fail",latency_ms:Date.now()-t0,detail:"err "+String(e&&e.message||e).slice(0,120)}; } })());
  // RETIRED-DIRECT-PATH-REMOVAL-1 (#1267): api.deepseek.com direct path is retired; DEEPSEEK_KEY is expired (HTTP 401 every run) and the fleet routes deepseek via AI Gateway / Workers-AI (@cf/deepseek-ai/*). Probing it only manufactured a permanent fail that the digest then masked.
  var pass = 0, fail = 0, driftCount = 0;
  for (var i = 0; i < results.length; i++) {
    if (results[i].status === "pass") pass++;
    else if (results[i].status === "drift") driftCount++;
    else fail++;
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_runs (id, ts, trigger, total, pass, fail, drifts, duration_ms, digest) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").bind(runId, t0, trigger, results.length, pass, fail, driftCount, Date.now() - t0, JSON.stringify({ failing: Object.keys(failing), drift_models: Object.keys(driftByModel), failed_probes: results.filter(function(x){return x.status === "fail";}).map(function(x){return x.probe + "/" + x.target + "=" + (x.detail || "").slice(0, 80);}).slice(0, 50) })).run();
    var stmt = env.QNFO_AUDIT.prepare("INSERT INTO ai_calibration_results (run_id, ts, probe, target, status, latency_ms, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)");
    var batch = [];
    for (var j = 0; j < results.length; j++) {
      batch.push(stmt.bind(runId, t0, results[j].probe, results[j].target, results[j].status, results[j].latency_ms || 0, String(results[j].detail || "").slice(0, 300)));
      if (batch.length >= 20) {
        await env.QNFO_AUDIT.batch(batch);
        batch = [];
      }
    }
    if (batch.length) await env.QNFO_AUDIT.batch(batch);
    await env.QNFO_AUDIT.prepare("DELETE FROM ai_calibration_results WHERE ts < ?1").bind(t0 - 7 * 86400 * 1e3).run();
    await env.QNFO_AUDIT.prepare("DELETE FROM ai_calibration_runs WHERE ts < ?1").bind(t0 - 30 * 86400 * 1e3).run();
  } catch (e) {
    results.push({ probe: "persist", target: "d1", status: "fail", latency_ms: 0, detail: "err " + String(e && e.message || e).slice(0, 150) });
  }
  return { run_id: runId, trigger, duration_ms: Date.now() - t0, total: results.length, pass, fail, drifts: driftCount, failing_models: Object.keys(failing), drift_models: Object.keys(driftByModel), results };
}
__name(calibration, "calibration");
// ---- PROBER-FOLD-1 (2026-10-06, agent_issues 1756, owner standing grant / charter rule 9) ----
// ai-health-prober runs here as a member instead of as its own worker (fleet_budget workers was 42 against a cap of 30).
// The member code is the prober's worker.js 2.3.14 unchanged except for its version constant and its limitation text; it keeps
// WORKER = "ai-health-prober", so ai_model_health, freshness_guard, fleet_heartbeat and capability_audit_snapshot rows keep
// their writer name. The host dispatches the */20 cron to it and exposes its read routes under /prober/.
var PROBER_VERSION = "2.3.15-folded";
var proberMod = (function() {
  var WORKER = "ai-health-prober";
  var VERSION = PROBER_VERSION; // member version (PROBER-FOLD-1); was 2.3.14-text-writers-probed as its own worker; // 2.3.14 PROBER-MODELS-1 (pillar: reach): probes the 4 text models the writing loops depend on and nobody watched (nemotron-3-120b = q08 primary writer; gemma-4-26b-a4b, qwen3-30b-a3b, llama-3.3-70b = q08 panel judges / ask writers); healthy models are probed every 9h instead of 6h so the unique-id calls per day do not rise (9 ids x 4 = 36 before, 13 ids x 2.67 = 34.7 after; fleet_budget ai_spend caps are breached, so no net model calls). Shared ids were already probed once per tick (byId), so the repeated deepseek-v4-pro-0813 row costs no extra call;
  var CAPS = ["model-health-probe", "freshness-check", "health-coverage"];
  var LIMS = ["runs every 30 minutes inside qnfo-ai-calibration, on its calibration tick (PROBER-FOLD-1, PROBER-ON-CAL-TICK-1); read routes /prober/health and /prober/freshness, /prober/run needs the calibration key", "a healthy model is re-probed every 6 hours; degraded or failing models every 2 hours", "liveness is published to fleet_heartbeat and this capability row from the cron"];
  // v2.3.3 AMH-NAMESPACE-2 (2026-09-13): the ID-NAMESPACE-1 fix was INCOMPLETE.
  // MODELS[0] still carried a QUALIFIED internal key ("@cf/qwen/qwen3.8-27b"), i.e. this
  // prober itself kept writing one row in the `@cf/` namespace it was supposed to abandon.
  // Live evidence 2026-09-13T06:30Z (qnfo-audit D1, 24 rows in ai_model_health): 5 rows carry
  // a `@cf/` prefix, ALL status=degraded / consecutive_failures=0, four with last_probe_ts
  // NULL; the fifth (@cf/qwen/qwen3.8-27b) carries a FRESH last_probe_ts (1789280141458,
  // 2026-09-13T06:15:41Z) because v2.3.1 probes it under that key. Two writers therefore race
  // on that row: this prober writes ok, then qnfo-ai-calibration GW-DEGRADE-1/2 rewrites
  // degraded -> the row can never clear and MODEL-DEGRADED is refiled every */20 cron.
  // The v2.3.2 reconcile guard required `last_probe_ts IS NULL`, which exempted exactly the
  // raced row. Fixes here: (a) canonicalise every written model_id to the short internal form;
  // (b) reconcile `@cf/` rows that carry zero failure evidence regardless of last_probe_ts.
  // v2.3.2 ID-NAMESPACE-1 (2026-09-13): the health table carries TWO id namespaces.
  // This prober writes only the `internal` key. qnfo-ai-calibration GW-DEGRADE-1/2 writes
  // gateway-failure health under the full CF id when its internalId() reverse map cannot
  // resolve it, so 4 models got phantom `@cf/...` rows (status degraded, last_probe_ts NULL,
  // consecutive_failures 0) that no prober can ever clear -> MODEL-DEGRADED refiled every
  // */20 cron. MODELS was also 15 entries for 10 distinct models, with one entry recording
  // GLM-5.3's probe result against kimi-k2.6.
  var MODELS = [{ "internal": "qwen3.8-27b", "id": "@cf/qwen/qwen3.8-27b", "kind": "text" }, { "internal": "bge-base-en-v1.5", "id": "@cf/baai/bge-base-en-v1.5", "kind": "embed" }, { "internal": "deepseek-v4-pro", "id": "@cf/deepseek-ai/deepseek-v4-pro-0813", "kind": "text" }, { "internal": "deepseek-v4-flash-wa", "id": "@cf/deepseek-ai/deepseek-v4-flash-0731", "kind": "text" }, { "internal": "deepseek-v4-pro-wa", "id": "@cf/deepseek-ai/deepseek-v4-pro-0813", "kind": "text" }, { "internal": "glm-5.3-flash", "id": "@cf/zai-org/glm-5.3-flash", "kind": "text" }, { "internal": "kimi-k2.6", "id": "@cf/moonshotai/kimi-k2.6", "kind": "text" }, { "internal": "glm-5.3", "id": "@cf/zai-org/glm-5.3", "kind": "text" }, { "internal": "gpt-oss-120b", "id": "@cf/openai/gpt-oss-120b", "kind": "text" }, { "internal": "kimi-k2.7-code", "id": "@cf/moonshotai/kimi-k2.7-code", "kind": "text" }, { "internal": "nemotron-3-120b-a12b", "id": "@cf/nvidia/nemotron-3-120b-a12b", "kind": "text" }, { "internal": "gemma-4-26b-a4b-it", "id": "@cf/google/gemma-4-26b-a4b-it", "kind": "text" }, { "internal": "qwen3-30b-a3b-fp8", "id": "@cf/qwen/qwen3-30b-a3b-fp8", "kind": "text" }, { "internal": "llama-3.3-70b-instruct-fp8-fast", "id": "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "kind": "text" }];
  var SIGNALS = [["cal_loop", "fleet_cal_state", "updated_at", 24, "heartbeat"], ["evolve", "evolve_candidates", "ts", 168, "event"], ["pipeline_status", "pipeline_status", "last_updated", 24, "event"], ["amh_models", "ai_model_health", "updated_at", 26, "heartbeat"], ["heartbeat", "fleet_heartbeat", "ts", 6, "heartbeat"], ["cloud_ops", "cloud_ops_events", "ts", 24, "heartbeat"], ["fleet_runs", "fleet_runs", "started_at", 24, "heartbeat"], ["research_queue", "research_queue", "created_at", 72, "heartbeat"], ["version_queue", "version_queue", "created_at", 72, "heartbeat"], ["paper_revision", "paper_revision_log", "created_at", 96, "heartbeat"], ["agent_issues", "agent_issues", "updated_at", 96, "heartbeat"], ["self_heal", "self_heal_actions", "ts", 48, "event"], ["outreach", "outreach_log", "sent_at", 72, "event"]];
  function json(o, s) {
    return new Response(JSON.stringify(o), { status: s || 200, headers: { "content-type": "application/json" } });
  }
  __name(json, "json");
  // v2.3.3 AMH-NAMESPACE-2: single choke point for the write key. No caller may persist a
  // qualified `@cf/...` id into ai_model_health.
  function canonicalId(m) {
    if (m == null) return null;
    var s = String(m);
    if (s.indexOf("@cf/") === 0) return s.split("/").pop();
    return s;
  }
  __name(canonicalId, "canonicalId");
  async function probeOne(env, m) {
    const bodies = m.kind === "embed" ? [{ text: ["ping"] }] : [{ prompt: "ping", max_tokens: 1 }, { messages: [{ role: "user", content: "ping" }], max_tokens: 1 }];
    let lastErr = null;
    for (let i = 0; i < bodies.length; i++) {
      try {
        const t0 = Date.now();
        await env.AI.run(m.id, bodies[i]);
        return { ok: true, ms: Date.now() - t0 };
      } catch (e) {
        lastErr = String(e && e.message || e).slice(0, 120);
      }
    }
    return { ok: false, err: lastErr };
  }
  __name(probeOne, "probeOne");
  function toMs(m) {
    if (m == null) return null;
    if (typeof m === "number") return m > 1e12 ? m : m * 1e3;
    var s = String(m).trim();
    if (/^[0-9]+$/.test(s)) {
      var n = Number(s);
      return n > 1e12 ? n : n * 1e3;
    }
    var iso = s.replace(" ", "T");
    if (!/[Zz]|[+-][0-9][0-9]/.test(iso)) iso = iso + "Z";
    var t = Date.parse(iso);
    return isNaN(t) ? null : t;
  }
  __name(toMs, "toMs");
  // v2.3.2 AMH-RECONCILE-1: clear `degraded` rows that carry no probe evidence at all, and
  // report how many rows this prober's write-key set cannot reach (coverage gap).
  // v2.3.3 AMH-NAMESPACE-2: also clear `@cf/`-prefixed rows with zero failure evidence even
  // when a stale writer stamped a last_probe_ts (a qualified key is non-evidence by design).
  async function reconcileHealth(env, probedIds, now) {
    const out = { reconciled: 0, namespaceCleared: 0, uncovered: 0 };
    if (!env.QNFO_AUDIT) return out;
    try {
      const r = await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status='ok', updated_at=?1 WHERE status='degraded' AND last_probe_ts IS NULL AND COALESCE(consecutive_failures,0)=0").bind(new Date(now).toISOString()).run();
      out.reconciled = r && r.meta && typeof r.meta.changes === "number" ? r.meta.changes : 0;
    } catch (e) {
    }
    try {
      const r2 = await env.QNFO_AUDIT.prepare("UPDATE ai_model_health SET status='ok', updated_at=?1 WHERE model_id LIKE '@cf/%' AND status='degraded' AND COALESCE(consecutive_failures,0)=0").bind(new Date(now).toISOString()).run();
      out.namespaceCleared = r2 && r2.meta && typeof r2.meta.changes === "number" ? r2.meta.changes : 0;
      out.reconciled += out.namespaceCleared;
    } catch (e) {
    }
    try {
      const rows = await env.QNFO_AUDIT.prepare("SELECT model_id FROM ai_model_health").all();
      const set = {};
      for (let i = 0; i < probedIds.length; i++) set[probedIds[i]] = 1;
      const all = rows && rows.results || [];
      for (let i = 0; i < all.length; i++) {
        if (!set[all[i].model_id]) out.uncovered++;
      }
    } catch (e) {
    }
    return out;
  }
  __name(reconcileHealth, "reconcileHealth");
  // PROBE-COST-TIER-1 (2026-10-01, issue 1682): every */20 run pinged all 10 entries (720 runs/day,
  // reasoning models included; probe traffic measured at ~16% of Workers AI neurons). The coverage
  // gate only needs a probe within 26 h, so a model whose last probe was OK is now re-probed at most
  // every PROBE_OK_INTERVAL_MS; a degraded/failing/unknown model is still probed every run so recovery
  // is detected at the same 20-min resolution. Entries sharing an @cf id (deepseek-v4-pro and
  // deepseek-v4-pro-wa) are probed once per run and the result written to both keys. ?force=1 on /run
  // probes everything.
  // PROBE-COST-TIER-2 (2026-10-01, issue 1682): OK interval 2h -> 6h (coverage gate is 26h; degraded/failing/unknown still probed every 20-min run).
  var PROBE_OK_INTERVAL_MS = 9 * 36e5;
  async function runProbe(env, force) {
    const now = Date.now();
    const results = [];
    const probedIds = [];
    const prior = {};
    if (env.QNFO_AUDIT && !force) {
      try {
        const rows = await env.QNFO_AUDIT.prepare("SELECT model_id, status, last_probe_ts FROM ai_model_health").all();
        for (const row of rows && rows.results || []) prior[row.model_id] = row;
      } catch (e) {
      }
    }
    const byId = {};
    let skipped = 0;
    for (let i = 0; i < MODELS.length; i++) {
      const m = MODELS[i];
      const mid = canonicalId(m.internal || m.id);
      probedIds.push(mid);
      const pr = prior[mid];
      const lastMs = pr ? toMs(pr.last_probe_ts) : null;
      if (!force && pr && pr.status === "ok" && lastMs != null && now - lastMs < PROBE_OK_INTERVAL_MS) {
        skipped++;
        continue;
      }
      const r = byId[m.id] || (byId[m.id] = await probeOne(env, m));
      results.push({ model: mid, ok: r.ok, ms: r.ms || null });
      if (env.QNFO_AUDIT) {
        try {
          if (r.ok) {
            await env.QNFO_AUDIT.prepare("INSERT INTO ai_model_health (model_id, status, last_probe_ts, last_latency_ms, consecutive_failures, updated_at) VALUES (?1, ?5, ?2, ?3, 0, ?4) ON CONFLICT(model_id) DO UPDATE SET status=?5, last_probe_ts=?2, last_latency_ms=?3, consecutive_failures=0, updated_at=?4").bind(mid, now, r.ms || null, new Date(now).toISOString(), "ok").run();
          } else {
            await env.QNFO_AUDIT.prepare("INSERT INTO ai_model_health (model_id, status, last_probe_ts, last_latency_ms, consecutive_failures, updated_at) VALUES (?1, ?5, ?2, ?3, 1, ?4) ON CONFLICT(model_id) DO UPDATE SET status=CASE WHEN consecutive_failures >= 2 THEN ?6 ELSE ?5 END, last_probe_ts=?2, last_latency_ms=?3, consecutive_failures=COALESCE(consecutive_failures,0)+1, updated_at=?4").bind(mid, now, null, new Date(now).toISOString(), "degraded", "failing").run();
          }
        } catch (e) {
        }
      }
    }
    let up = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i].ok) up++;
    }
    const extra = await reconcileHealth(env, probedIds, now);
    return { probed: results.length, skipped_recent_ok: skipped, calls: Object.keys(byId).length, up, down: results.length - up, reconciled: extra.reconciled, namespaceCleared: extra.namespaceCleared, uncovered: extra.uncovered };
  }
  __name(runProbe, "runProbe");
  async function checkFreshness(env) {
    const now = Date.now();
    try {
      var _roster = [];
      for (var _i = 0; _i < MODELS.length; _i++) { var _m = MODELS[_i].internal || MODELS[_i].id; if (_roster.indexOf(_m) < 0) _roster.push(_m); }
      if (_roster.length) {
        var _ph = _roster.map(function () { return "?"; }).join(",");
        var _del = env.QNFO_AUDIT.prepare("DELETE FROM ai_model_health WHERE model_id NOT IN (" + _ph + ")");
        await _del.bind.apply(_del.bind, [null].concat(_roster)).run();
      }
    } catch (e) {}
    const out = [];
    for (let i = 0; i < SIGNALS.length; i++) {
      const s = SIGNALS[i];
      const mode = s[4] || "heartbeat";
      let maxTs = null, ageH = null, status = "unknown";
      try {
        const row = await env.QNFO_AUDIT.prepare("SELECT MAX(" + s[2] + ") AS m FROM " + s[1]).first();
        maxTs = row ? row.m : null;
        const ms = toMs(maxTs);
        if (ms != null) {
          ageH = Math.round((now - ms) / 36e4) / 10;
          if (ageH > s[3]) status = mode === "event" ? "idle" : "stale";
          else status = "fresh";
        } else {
          status = "no-data";
        }
      } catch (e) {
        status = "error";
      }
      out.push({ name: s[0], table: s[1], ts: s[2], mode, max_ts: maxTs == null ? null : String(maxTs), age_hours: ageH, threshold_hours: s[3], status });
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO freshness_guard (signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, mode, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?9,?8) ON CONFLICT(signal) DO UPDATE SET table_name=?2, ts_column=?3, max_ts=?4, age_hours=?5, threshold_hours=?6, status=?7, mode=?9, checked_at=?8").bind(s[0], s[1], s[2], maxTs == null ? null : String(maxTs), ageH, s[3], status, new Date(now).toISOString(), mode).run();
      } catch (e) {
      }
    }
    return out;
  }
  __name(checkFreshness, "checkFreshness");
  // v2.3.2 AMH-COVERAGE-1: the SIGNALS loop above uses MAX(ts_column), so a single freshly
  // written row masks every stale row in the table. Measured 2026-09-13: 'amh_models'
  // reported fresh/age 0h while 12 of 24 rows were stale (8 at 37.6-37.9h) or never probed.
  // This check counts rows instead of taking a maximum.
  async function checkHealthCoverage(env, now) {
    const THRESHOLD_H = 26;
    let total = 0, stale = 0, neverProbed = 0;
    try {
      const r = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_model_health").first();
      total = r ? Number(r.n || 0) : 0;
      const s = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_model_health WHERE last_probe_ts IS NULL OR last_probe_ts < ?1").bind(now - THRESHOLD_H * 36e5).first();
      stale = s ? Number(s.n || 0) : 0;
      const np = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM ai_model_health WHERE last_probe_ts IS NULL").first();
      neverProbed = np ? Number(np.n || 0) : 0;
    } catch (e) {
      return { signal: "amh_coverage", status: "error" };
    }
    const status = stale > 0 ? "stale" : "fresh";
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO freshness_guard (signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, mode, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?9,?8) ON CONFLICT(signal) DO UPDATE SET table_name=?2, ts_column=?3, max_ts=?4, age_hours=?5, threshold_hours=?6, status=?7, mode=?9, checked_at=?8").bind("amh_coverage", "ai_model_health", "last_probe_ts", stale + "/" + total + " stale (" + neverProbed + " never probed)", null, THRESHOLD_H, status, new Date(now).toISOString(), "heartbeat").run();
    } catch (e) {
    }
    return { signal: "amh_coverage", total, stale, neverProbed, threshold_hours: THRESHOLD_H, status };
  }
  __name(checkHealthCoverage, "checkHealthCoverage");
  // OWNER-CLIENT-PROBE-1 (#1886, 2026-10-04). WHY: the owner's ChatBox/DeepChat endpoints lost
  // access when the 2026-10-01 credential rotation (#1676/#1701) skipped client consumers, and nothing
  // monitored the client path. The credential-holding 1-token probe is scripts/issue_owner_client_keys.py
  // (the owner-client-keys workflow): it keeps the owner client key private and writes one row per host
  // into owner_client_probes (HTTP status + public-read flag, never the key). This cron reads that ledger
  // and fails CLOSED: a STALE ledger (the producer stopped) or any host with ok=0 (401 / unexpected
  // public-read) raises a self_heal_actions breach within one cron. No new worker, cron or binding: it
  // reuses the existing QNFO_AUDIT binding and the freshness_guard pattern.
  async function checkOwnerClientKeys(env, now) {
    const THRESHOLD_H = 26;
    const out = { signal: "owner_client_keys", status: "error" };
    try {
      const r = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(ok),0) AS ok, MAX(checked_at) AS mx FROM owner_client_probes").first();
      const n = r ? Number(r.n || 0) : 0;
      const ok = r ? Number(r.ok || 0) : 0;
      const mx = r && r.mx ? String(r.mx) : null;
      const ageH = mx ? Math.round(((now - Date.parse(mx)) / 36e5) * 10) / 10 : 999;
      const fresh = n >= 3 && ageH <= THRESHOLD_H;
      const allOk = n >= 3 && ok === n;
      out.hosts = n; out.ok = ok; out.age_hours = ageH; out.threshold_hours = THRESHOLD_H;
      out.status = fresh && allOk ? "fresh" : "stale";
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO freshness_guard (signal, table_name, ts_column, max_ts, age_hours, threshold_hours, status, mode, checked_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?9,?8) ON CONFLICT(signal) DO UPDATE SET table_name=?2, ts_column=?3, max_ts=?4, age_hours=?5, threshold_hours=?6, status=?7, mode=?9, checked_at=?8").bind("owner_client_keys", "owner_client_probes", "checked_at", n + " rows, " + ok + " ok", ageH, THRESHOLD_H, out.status, new Date(now).toISOString(), "heartbeat").run();
      } catch (e) {
      }
      if (out.status !== "fresh") {
        try {
          const open = await env.QNFO_AUDIT.prepare("SELECT COUNT(*) AS n FROM self_heal_actions WHERE kind='owner-client-key' AND status='open'").first();
          if (!open || Number(open.n || 0) === 0) {
            await env.QNFO_AUDIT.prepare("INSERT INTO self_heal_actions (kind, ref, action, ts, status, claim, confidence) VALUES (?1,?2,?3,?4,?5,?6,?7)").bind("owner-client-key", "issue-1886", "owner-client key probe stale or failing", new Date(now).toISOString(), "open", JSON.stringify(out), 0.9).run();
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
    return out;
  }
  __name(checkOwnerClientKeys, "checkOwnerClientKeys");
  // CAPABILITY-SELF-REPORT-1 (2026-10-01, #1735): this worker has no public route (CRON_ONLY, #1402), so the deploy-guard
  // capability snapshot cannot probe its /health. Each cron run upserts its own capability_audit_snapshot row instead.
  async function capSelfReport(db, name) {
    if (!db) return;
    try {
      await db.prepare("INSERT INTO capability_audit_snapshot (service, version, capabilities, limitations, ts) VALUES (?1,?2,?3,?4,?5) ON CONFLICT(service) DO UPDATE SET version=excluded.version, capabilities=excluded.capabilities, limitations=excluded.limitations, ts=excluded.ts").bind(name, VERSION, JSON.stringify(CAPS), JSON.stringify(LIMS), new Date().toISOString()).run();
    } catch (e) {
    }
  }
  var worker_default = {
    async fetch(request, env, ctx) {
      const u = new URL(request.url);
      if (u.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION, capabilities: CAPS, limitations: LIMS, models: MODELS.length, signals: SIGNALS.length });
      if (u.pathname === "/run") {
        const p = await runProbe(env, u.searchParams.get("force") === "1");
        const f = await checkFreshness(env);
        const coverage = await checkHealthCoverage(env, Date.now());
        const ownerClients = await checkOwnerClientKeys(env, Date.now());
        let st = 0, idle = 0;
        for (let i = 0; i < f.length; i++) {
          if (f[i].status === "stale") st++;
          if (f[i].status === "idle") idle++;
        }
        return json({ ok: true, version: VERSION, probe: p, coverage, owner_clients: ownerClients, freshness: f, stale_count: st, idle_count: idle });
      }
      if (u.pathname === "/freshness") return json(await checkFreshness(env));
      return json({ ok: false, error: "not found" }, 404);
    },
    async scheduled(event, env, ctx) {
      ctx.waitUntil((async function() {
        var ok = 1;
        try {
          await runProbe(env);
          await checkFreshness(env);
          await checkHealthCoverage(env, Date.now());
          await checkOwnerClientKeys(env, Date.now());
        } catch (e) {
          ok = 0;
        }
        await capSelfReport(env.QNFO_AUDIT, WORKER);
        /* CRON-ONLY-HEARTBEAT-1 (2026-09-30): this worker has no workers.dev route (CRON_ONLY class, #1402), so no
           HTTP census can ever see it; the fleet read it as permanently down/unknown. Each cron run now upserts
           fleet_heartbeat, which qnfo-fleet-control /state reads as this worker's liveness. */
        try {
          await env.QNFO_AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(WORKER, VERSION, new Date().toISOString(), ok).run();
        } catch (e) {
        }
      })());
    }
  };
  return worker_default;
})();
var worker_default = {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    var path = url.pathname;
    if (path === "/prober" || path.indexOf("/prober/") === 0) {
      var sub = path.slice(7) || "/health";
      if (sub === "/run" && !await authorized(request, env)) return json({ error: "unauthorized" }, 401);
      if (sub !== "/health" && sub !== "/freshness" && sub !== "/run") return json({ error: "not found" }, 404);
      var pu = new URL(request.url);
      pu.pathname = sub;
      return proberMod.fetch(new Request(pu.toString(), request), env, ctx);
    }
    if (path === "/health") return json({ ok: true, worker: "qnfo-ai-calibration", version: VERSION, bindings: { qnfo_audit: !!env.QNFO_AUDIT, ai: !!env.AI }, crons: ["*/30 * * * *"], members: { "ai-health-prober": PROBER_VERSION }, capabilities: ["model-calibration", "drift-detection", "model-health"], limitations: ["calibrates on the */30 cron; POST /run and GET /results require the router key", "fails closed when the key is not configured"] });
    if (path === "/manifest") return json({ service: "qnfo-ai-calibration", kind: "worker", version: VERSION, purpose: "autonomous periodic stress-testing/calibration of QNFO AI endpoints (self-auditing, self-correcting, self-improving)", capabilities: ["endpoint-stress-sweeps", "catalog-truth-audit", "vision-tools-stream-routing-boundary-probes", "health-table-publishing", "ticket-lifecycle-self-heal", "config-driven-thresholds"], routes: ["/health", "/manifest", "/run", "/results", "/"], crons: ["*/30 * * * *"] });
    if (path === "/run" && request.method === "POST") {
      if (!await authorized(request, env)) return json({ error: "unauthorized" }, 401);
      var digest = await calibration(env, "manual");
      return json({ ok: true, digest });
    }
    if (path === "/results" && request.method === "GET") {
      if (!await authorized(request, env)) return json({ error: "unauthorized" }, 401);
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
    // PROBER-ON-CAL-TICK-1 (1.3.1): the prober member runs on the calibration tick, concurrently with the calibration. Its
    // own scheduled() hands its work to waitUntil, which would leave it the 30-second window after this handler returns;
    // the host collects those promises and awaits them, so the invocation lives until the probe is done (15-minute limit).
    // A legacy PROBER_CRON event (the trigger is no longer declared) runs the member only.
    var pending = [];
    var member = (async function () {
      await proberMod.scheduled(controller, env, { waitUntil: function (p) { pending.push(Promise.resolve(p)); }, passThroughOnException: function () {} });
      await Promise.allSettled(pending);
    })();
    if (controller && controller.cron === PROBER_CRON) { await member; return; }
    await Promise.allSettled([member, calibration(env, "cron")]);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map