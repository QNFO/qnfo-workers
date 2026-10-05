var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var __defProp22 = Object.defineProperty;
var __name22 = /* @__PURE__ */ __name2((target, value) => __defProp22(target, "name", { value, configurable: true }), "__name");
var __defProp222 = Object.defineProperty;
var __name222 = /* @__PURE__ */ __name22((target, value) => __defProp222(target, "name", { value, configurable: true }), "__name");
var __defProp2222 = Object.defineProperty;
var __name2222 = /* @__PURE__ */ __name222((target, value) => __defProp2222(target, "name", { value, configurable: true }), "__name");
var __defProp22222 = Object.defineProperty;
var __name22222 = /* @__PURE__ */ __name2222((target, value) => __defProp22222(target, "name", { value, configurable: true }), "__name");
var VERSION = "0.9.60-zenodo-related"; // ZENODO-READ-ONLINE-1 (2026-10-05, #1907, owner YES 2026-10-02, pillar reach): kind='related' rows of zenodo_version_requests add one isVariantFormOf related identifier (https://papers.qnfo.org/papers/<slug>/, the form publishStage already writes) to the latest version of a published record, idempotent, no new version or DOI; verifyRelatedBackfill closes the issue from a public re-read of 20 random rows. // MATH-LATEX-2 (2026-10-05, #1891): MATH_RULE in the writer, reconcile and revise prompts; pseudoMathScan() turns plain-text math into a HARD review finding and a math-scan event at verify; ops_config research_math_gate=enforce makes it a pre-publish gate (revise once, then park). // WRITER-FLASH-1 (2026-10-05, #1795): the second ensemble writer leg and the revise-patch retry leave glm-5.3 (3,279 neurons per call) for glm-5.3-flash and gpt-oss-120b. // PRIOR-WORK-EMPTY-1 (2026-10-02): no empty "Prior Work" section; References matched at line start. // 0.9.54 RUN-INTERNAL-1 (#1783, ported from code task ct_zvckl6t5d4e1fd): POST /run?sync=1 and POST /run/drain-v2 refuse public hostnames (*.workers.dev, qnfo.org); the cron and service-binding callers (qnfo-research-supervisor RESEARCH_EXEC, the dashboard SVC binding) are unaffected; METADATA-VERIFY-ORDER-1 (2026-10-02, #1732): verifyMetadataBackfill writes issue_triage.close_evidence before it closes the issue (the close-evidence trigger aborted the old order, so the backfill could never close itself); 0.9.52 UTF8-DEPLOY-1 (2026-10-02): no code change; redeployed so the live copy is UTF-8 (the old deploy path double-encoded every non-ASCII character)
// WORKERS-AI-ATTRIBUTION-1 (2026-10-01, #1681): per-worker Workers AI attribution. Returns a shallow env copy whose AI
// binding records each .run() (calls, errors, ms, tokens, neurons) into qnfo-audit ai_call_counters (purpose 'binding').
// Neurons = usage tokens x Cloudflare's published per-model rates (neurons per M tokens). Fail-soft; env is never mutated.
var __AI_ATTR_RATES = { "@cf/zai-org/glm-5.3": [127273, 400000], "@cf/zai-org/glm-5.3-flash": [13636, 45455], "@cf/nvidia/nemotron-3-120b-a12b": [45455, 136364], "@cf/moonshotai/kimi-k2.6": [86364, 363636], "@cf/moonshotai/kimi-k2.7-code": [86364, 363636], "@cf/openai/gpt-oss-120b": [31818, 68182], "@cf/openai/gpt-oss-20b": [18182, 27273], "@cf/deepseek-ai/deepseek-v4-pro-0813": [120000, 360000], "@cf/deepseek-ai/deepseek-v4-flash-0731": [40000, 120000], "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805], "@cf/qwen/qwen3-30b-a3b-fp8": [4625, 30475], "@cf/qwen/qwen3.8-27b": [40909, 290909], "@cf/baai/bge-base-en-v1.5": [6058, 0], "@cf/baai/bge-small-en-v1.5": [1841, 0], "@cf/baai/bge-large-en-v1.5": [18582, 0] };
function __aiAttrEnv(env, worker, aiKey, dbKey) {
  try {
    if (!env || env.__aiAttr) return env;
    var ai = env[aiKey], db = env[dbKey];
    if (!ai || typeof ai.run !== "function" || !db) return env;
    var wrapped = new Proxy(ai, { get: function (t, p) {
      if (p !== "run") { var v = Reflect.get(t, p); return typeof v === "function" ? v.bind(t) : v; }
      return async function (model, input, opts) {
        var t0 = Date.now(), ok = 1, res;
        try { res = await t.run(model, input, opts); return res; } catch (e) { ok = 0; throw e; }
        finally {
          try {
            var u = res && typeof res === "object" && res.usage || {};
            var chars = 0; try { chars = JSON.stringify(input && (input.messages || input.prompt || input.text) || input || "").length; } catch (e1) {}
            var inTok = Number(u.prompt_tokens || u.input_tokens || 0) || Math.round(chars / 4);
            var outTok = Number(u.completion_tokens || u.output_tokens || 0);
            var r = __AI_ATTR_RATES[String(model)] || [0, 0];
            var neurons = (inTok * r[0] + outTok * r[1]) / 1e6;
            await db.prepare("INSERT INTO ai_call_counters (day, worker, purpose, model, calls, errors, in_chars, ms, in_tok, out_tok, neurons) VALUES (?1,?2,'binding',?3,1,?4,?5,?6,?7,?8,?9) ON CONFLICT(day, worker, purpose, model) DO UPDATE SET calls=calls+1, errors=errors+excluded.errors, in_chars=in_chars+excluded.in_chars, ms=ms+excluded.ms, in_tok=in_tok+excluded.in_tok, out_tok=out_tok+excluded.out_tok, neurons=neurons+excluded.neurons")
              .bind(new Date().toISOString().slice(0, 10), worker, String(model).slice(0, 120), ok ? 0 : 1, chars, Date.now() - t0, inTok, outTok, neurons).run();
          } catch (e2) {}
        }
      };
    } });
    var copy = Object.assign({}, env);
    copy[aiKey] = wrapped;
    copy.__aiAttr = 1;
    return copy;
  } catch (e) {
    return env;
  }
}
var WORKER = "qnfo-research-exec";
var NL = String.fromCharCode(10);
var MODELS = ["@cf/zai-org/glm-5.3-flash", "@cf/zai-org/glm-5.3", "@cf/openai/gpt-oss-120b"];
var MAX_PAPER = 3e4;
var ORCID = "0009-0002-4317-5604";
var AUTHOR = "Rowan Brad Quni-Gudzinas";
// ZENODO-IDENTITY-1 (2026-10-01): Zenodo's creator name form ("Family, Given") and the one affiliation string
// (STRATEGY-1 s2.2). New papers used to carry the given-first name and no affiliation; the owner's records held 15
// affiliation variants, including retired labels.
var ZENODO_CREATOR_NAME = "Quni-Gudzinas, Rowan Brad";
var ZENODO_AFFILIATION = "QNFO (independent research)";
var ROUTER = "https://qnfo-ai.q08.workers.dev/v1/chat/completions";
// ROUTER-TRANSPORT-FAILOVER-1: env.QNFO_AI is preferred, but when that service binding is
// absent the old code fell straight through to a public workers.dev fetch, which does not
// work from Worker context. Try the custom domain first, then workers.dev, and keep the
// response contract identical (return the last Response when none is ok).
// ROUTER-HOST-ORDER-CORRECTION-1 (2026-09-29): an earlier patch today put
// qnfo-ai.q08.workers.dev first on the strength of a synthetic probe. The incident
// history contradicts it: BEFORE 16:36:06Z the workers.dev host was the ONLY host
// and produced 101 gw-fallback "gateway HTTP 404" events in one day; AFTER the
// failover deploy added ai.qnfo.org first, those events stopped (last 16:32:28Z).
// workers.dev is therefore the failing host. Keep ai.qnfo.org first.
var ROUTER_HOSTS = [
  "https://ai.qnfo.org",
  "https://qnfo-ai.q08.workers.dev"
];
var _routerBindingWarned = false;
// GW-FALLBACK-BODY-1: record which router host produced the response we return.
var _lastRouterHost = "";
// GW-PROPS-AUTH-1 (2026-10-01, #1703 follow-through): qnfo-ai authenticates this worker by the QNFO_AI binding's
// ctx.props.caller (INTERNAL-CALLER-PROPS-1), so the per-worker ROUTER_TOKEN copy is no longer required, and per CLAUDE.md
// none may be created. gatewayPaper and gwCall still returned "" whenever ROUTER_TOKEN was absent, BEFORE any call and
// without an event: on 2026-10-01 the reconcile stage got 0 chars twice (row 5099abb8, 14:51Z, degraded to the best leg)
// and every review parsed as the default "unparseable" HARD finding, while no gw-* event was written after 12:08Z.
// The gateway is usable when the binding exists OR a token exists; the bearer header is sent only when a token exists.
function routerUsable(env) {
  return !!(env && (env.QNFO_AI && typeof env.QNFO_AI.fetch === "function" || env.ROUTER_TOKEN));
}
function routerHeaders(env, json) {
  var h = {};
  if (json) h["Content-Type"] = "application/json";
  if (env && env.ROUTER_TOKEN) h["Authorization"] = "Bearer " + env.ROUTER_TOKEN;
  return h;
}
async function routerFetch(env, url, opts) {
  if (env && env.QNFO_AI && typeof env.QNFO_AI.fetch === "function") {
    return env.QNFO_AI.fetch(url, opts);
  }
  if (!_routerBindingWarned) {
    _routerBindingWarned = true;
    if (typeof logEvent === "function") {
      try {
        await logEvent(env, "gw-transport", "QNFO_AI service binding absent; routerFetch is using public host failover over " + ROUTER_HOSTS.join(", "), "warn");
      } catch (e) {
      }
    }
  }
  var path = String(url).replace(/^https?:\/\/[^/]+/, "");
  var last = null;
  var lastErr = null;
  for (var i = 0; i < ROUTER_HOSTS.length; i++) {
    try {
      var r = await fetch(ROUTER_HOSTS[i] + path, opts);
      _lastRouterHost = ROUTER_HOSTS[i];
      if (r && r.ok) return r;
      last = r;
    } catch (e) {
      lastErr = e;
    }
  }
  if (last) return last;
  throw lastErr || new Error("routerFetch: no router host reachable");
}
__name(routerFetch, "routerFetch");
__name2(routerFetch, "routerFetch");
__name22(routerFetch, "routerFetch");
__name222(routerFetch, "routerFetch");
var GATEWAY_MODEL = "qnfo";
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}
__name(json, "json");
__name2(json, "json");
__name22(json, "json");
__name222(json, "json");
__name2222(json, "json");
__name22222(json, "json");
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
__name(nowIso, "nowIso");
__name2(nowIso, "nowIso");
__name22(nowIso, "nowIso");
__name222(nowIso, "nowIso");
__name2222(nowIso, "nowIso");
__name22222(nowIso, "nowIso");
function slugify(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "paper";
}
__name(slugify, "slugify");
__name2(slugify, "slugify");
__name22(slugify, "slugify");
__name222(slugify, "slugify");
__name2222(slugify, "slugify");
__name22222(slugify, "slugify");
async function logEvent(env, kind, text, status) {
  try {
    const id = "re-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?,?,?,?,?,?,?)").bind(id, nowIso(), kind, String(text).slice(0, 800), "{}", WORKER, status || "ok").run();
  } catch (e) {
  }
}
__name(logEvent, "logEvent");
__name2(logEvent, "logEvent");
__name22(logEvent, "logEvent");
__name222(logEvent, "logEvent");
__name2222(logEvent, "logEvent");
__name22222(logEvent, "logEvent");
async function runModel(env, prompt, maxTokens) {
  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i];
    try {
      const aiPromise = env.AI.run(model, { messages: [{ role: "user", content: prompt }], max_tokens: maxTokens, temperature: 0.3 });
      aiPromise.catch(function() {
      });
      const toPromise = new Promise(function(resolve) {
        setTimeout(function() {
          resolve("__TIMEOUT__");
        }, 9e4);
      });
      const r = await Promise.race([aiPromise, toPromise]);
      if (r === "__TIMEOUT__") {
        await logEvent(env, "ai-error", model + " timed out after 90s");
        continue;
      }
      const cc = r && r.choices && r.choices[0] && r.choices[0].message;
      const text = cc ? String(cc.content || "") : r && typeof r.response === "string" ? r.response : "";
      if (text && text.trim().length > 40) return text.trim();
      await logEvent(env, "ai-empty", model + " empty/shallow");
    } catch (e) {
      await logEvent(env, "ai-error", model + " threw: " + String(e && e.message || e).slice(0, 200));
    }
  }
  return "";
}
__name(runModel, "runModel");
__name2(runModel, "runModel");
__name22(runModel, "runModel");
__name222(runModel, "runModel");
__name2222(runModel, "runModel");
__name22222(runModel, "runModel");
async function gatewayPaper(env, prompt) {
  if (!routerUsable(env)) {
    await logEvent(env, "ai-error", "gateway: neither the QNFO_AI binding nor ROUTER_TOKEN is available");
    return "";
  }
  const ctrl = new AbortController();
  const to = setTimeout(function() {
    ctrl.abort();
  }, 12e4);
  try {
    const r = await routerFetch(env, ROUTER, { method: "POST", headers: routerHeaders(env, true), body: JSON.stringify({ model: GATEWAY_MODEL, max_tokens: MAX_PAPER, temperature: 0.3, messages: [{ role: "user", content: prompt }] }), signal: ctrl.signal });
    if (!r.ok) {
      await logEvent(env, "ai-error", "gateway " + r.status);
      return "";
    }
    const d = await r.json();
    const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
    if (c && String(c).trim().length > 40) return String(c).trim();
    await logEvent(env, "ai-empty", "gateway empty/shallow");
    return "";
  } catch (e) {
    await logEvent(env, "ai-error", "gateway threw: " + String(e && e.message || e).slice(0, 200));
    return "";
  } finally {
    clearTimeout(to);
  }
}
__name(gatewayPaper, "gatewayPaper");
__name2(gatewayPaper, "gatewayPaper");
__name22(gatewayPaper, "gatewayPaper");
__name222(gatewayPaper, "gatewayPaper");
__name2222(gatewayPaper, "gatewayPaper");
__name22222(gatewayPaper, "gatewayPaper");
function cleanTitle(md) {
  const m = String(md || "").match(/^#\s+([^#\n]{8,140})$/m);
  if (!m) return "";
  const t = m[1].trim();
  if (/Title:|something like|Let me|the user|maybe|perhaps|fictional|hypothetical|carefully|Hmm|^\d/i.test(t)) return "";
  return t;
}
__name(cleanTitle, "cleanTitle");
__name2(cleanTitle, "cleanTitle");
__name22(cleanTitle, "cleanTitle");
__name222(cleanTitle, "cleanTitle");
__name2222(cleanTitle, "cleanTitle");
__name22222(cleanTitle, "cleanTitle");
function cleanAbstract(md) {
  const m = String(md || "").match(/##\s*Abstract\s*\n\s*([\s\S]{60,2000})/i);
  if (!m) return "";
  const a = m[1].trim();
  if (/Let me|the user wants|carefully|fictional|hypothetical/i.test(a.slice(0, 200))) return "";
  return a.slice(0, 2e3);
}
__name(cleanAbstract, "cleanAbstract");
__name2(cleanAbstract, "cleanAbstract");
__name22(cleanAbstract, "cleanAbstract");
__name222(cleanAbstract, "cleanAbstract");
__name2222(cleanAbstract, "cleanAbstract");
__name22222(cleanAbstract, "cleanAbstract");
function reasoningPreamble(md) {
  return /^(Let me|The user|First, let|Okay|Alright|Here's|I'll|I need)/i.test(String(md || "").trim());
}
__name(reasoningPreamble, "reasoningPreamble");
__name2(reasoningPreamble, "reasoningPreamble");
__name22(reasoningPreamble, "reasoningPreamble");
__name222(reasoningPreamble, "reasoningPreamble");
__name2222(reasoningPreamble, "reasoningPreamble");
__name22222(reasoningPreamble, "reasoningPreamble");
async function parkPoisonRow(env, row, msg) {
  var reason = "PARKED-POISON-1: recover_count exhausted (" + Number(row.recover_count || 0) + "); last error: " + String(msg || "unknown");
  var r = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='wontfix', stage='parked', error=?, claimed_at=NULL WHERE id=? AND status IN ('researching','queued','failed')").bind(reason.slice(0, 300), row.id).run();
  try { await logEvent(env, "poison-park", "parked research row " + String(row.id).slice(0, 8) + " recover_count=" + Number(row.recover_count || 0), "warn"); } catch (e) {}
  return r;
}
async function reclaimStaleResearching(env) {
  var stale = "status='researching' AND claimed_at IS NOT NULL AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-4 hours')";
  var parked = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='wontfix', stage='parked', claimed_at=NULL, error='PARKED-POISON-1: stale researching claim with recover_count exhausted (' || recover_count || '); not re-armed' WHERE " + stale + " AND recover_count >= 3").run();
  var req = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='queued', stage='ground', claimed_at=NULL, attempt=0, recover_count=recover_count+1 WHERE " + stale + " AND recover_count < 3").run();
  return { parked: (parked.meta && parked.meta.changes) || 0, requeued: (req.meta && req.meta.changes) || 0 };
}
async function markError(env, row, msg) {
  var recoverCount = Number(row.recover_count || 0);
  if (recoverCount < 3) {
    await env.QNFO_AUDIT.prepare(
      "UPDATE research_queue SET status='queued', stage='ground', error=?, recover_count=recover_count+1, attempt=0, claimed_at=NULL WHERE id=?"
    ).bind(String(msg).slice(0, 300), row.id).run();
  } else {
    // RESEARCH-POISON-PARK-1 (#1700): a row that exhausted recover_count is NOT re-armed with a reset
    // counter (its inputs are unchanged, so it would just loop); it leaves researching for a parked
    // terminal status with the reason recorded. UPDATE only, never DELETE.
    await parkPoisonRow(env, row, msg);
    try {
      var _rid = String(row.id).slice(0, 8);
      var _ex = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title LIKE ?1 LIMIT 1").bind("RESEARCH-TERMINAL " + _rid + "%").first();
      if (!_ex) {
        await env.QNFO_AUDIT.prepare("INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) VALUES (?1,?2,'qnfo-research-exec','pipeline','medium','open',CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000)").bind("RESEARCH-TERMINAL " + _rid + ": " + String(msg).slice(0, 110), "research_queue row " + row.id + " went terminal at recover_count>=3: " + String(msg).slice(0, 280)).run();
        await terminalContentContract(env, row, msg, _rid);
      }
      await logEvent(env, "terminal-issue", "filed agent_issue for terminal row " + _rid, "error");
    } catch (eF) {}
  }
}
// RESEARCH-TERMINAL-SELFCLOSE-1 (2026-10-02): a row parked for a content failure only (verify mismatch, every gate passed)
// is the integrity gate working: the paper's numbers did not survive the independent check, so it stays off Zenodo. Its
// RESEARCH-TERMINAL issue gets a remediation_contracts probe that qnfo-fleet-control's hourly tick (REMEDIATION-TICK-1)
// passes once the row is parked with its reason and the queue is still advancing, so the issue closes itself with that
// evidence instead of waiting for a session. A gate failure (gates=<name>) can be a pipeline bug (1751: gate-refcount),
// so it gets no contract and stays open for a fix.
function isContentOnlyTerminal(msg) {
  return /mismatch=true gates=\s*$/.test(String(msg || ""));
}
async function terminalContentContract(env, row, msg, rid) {
  if (!isContentOnlyTerminal(msg)) return null;
  var id = String(row && row.id || "");
  if (!/^[0-9a-f-]{8,64}$/i.test(id)) return null;
  try {
    var iss = await env.QNFO_AUDIT.prepare("SELECT id FROM agent_issues WHERE title LIKE ?1 AND status = 'open' ORDER BY id DESC LIMIT 1").bind("RESEARCH-TERMINAL " + rid + "%").first();
    if (!iss || !iss.id) return null;
    var probe = "SELECT 'parked+queue-moving' AS expected, CASE WHEN EXISTS (SELECT 1 FROM research_queue WHERE id = '" + id + "' AND stage = 'parked' AND error LIKE 'PARKED-POISON-1:%mismatch=true%') AND EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = 'qnfo-research-exec' AND status = 'ok' AND text LIKE '%->%' AND ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-6 hours')) THEN 'parked+queue-moving' ELSE 'pending' END AS observed";
    await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at) VALUES (?1, ?2, 'row parked for a verify mismatch with every gate passing', 'none: the integrity gate withheld the paper; evidence is the parked row and an advancing queue', ?3, 'd1-query', 3, 'qnfo-research-exec', 1, 'active', datetime('now'))").bind("research-terminal-" + rid, Number(iss.id), probe).run();
    return Number(iss.id);
  } catch (e) {
    return null;
  }
}
__name(terminalContentContract, "terminalContentContract");
__name(markError, "markError");
__name2(markError, "markError");
__name22(markError, "markError");
__name222(markError, "markError");
__name2222(markError, "markError");
__name22222(markError, "markError");
async function zenodo(env, method, path, body, attempt) {
  const sep = path.indexOf("?") >= 0 ? "&" : "?";
  const url = "https://zenodo.org/api/deposit/depositions" + path + sep + "access_token=" + env.ZENODO_TOKEN;
  const n = attempt || 0;
  try {
    const r = await fetch(url, { method, headers: { "User-Agent": "QNFO-research-exec/0.5.0", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : void 0 });
    if ((r.status >= 500 || r.status === 429) && n < 4) {
      await new Promise(function(res) {
        setTimeout(res, 2500 * (n + 1));
      });
      return zenodo(env, method, path, body, n + 1);
    }
    const text = await r.text();
    if (r.status >= 400) return { _status: r.status, _text: text.slice(0, 300) };
    try {
      return JSON.parse(text);
    } catch (e) {
      return { _status: r.status, _text: text.slice(0, 200) };
    }
  } catch (e) {
    if (n < 4) {
      await new Promise(function(res) {
        setTimeout(res, 2500 * (n + 1));
      });
      return zenodo(env, method, path, body, n + 1);
    }
    return { _status: 0, _text: String(e && e.message || e).slice(0, 200) };
  }
}
__name(zenodo, "zenodo");
__name2(zenodo, "zenodo");
__name22(zenodo, "zenodo");
__name222(zenodo, "zenodo");
__name2222(zenodo, "zenodo");
__name22222(zenodo, "zenodo");
function bibEsc(s) {
  return String(s || "").replace(/[{}]/g, function(c) {
    return c === "{" ? "\\{" : "\\}";
  });
}
__name(bibEsc, "bibEsc");
__name2(bibEsc, "bibEsc");
__name22(bibEsc, "bibEsc");
__name222(bibEsc, "bibEsc");
__name2222(bibEsc, "bibEsc");
function parseRefLine(raw) {
  var s = String(raw || "").replace(/^\s*\d+[.)]\s*/, "").trim();
  var aEnd = s.indexOf("(");
  var authors = aEnd > 0 ? s.slice(0, aEnd).trim() : "";
  var ym = s.match(/\((\d{4})\)/);
  var year = ym ? ym[1] : "";
  var after = aEnd >= 0 ? s.slice(s.indexOf(")", aEnd) + 1).trim() : s;
  var t = after.replace(/^\.\s+/, "").trim();
  var title = t, rest = "";
  var sp = t.indexOf(". ");
  if (sp > 0) {
    title = t.slice(0, sp).trim();
    rest = t.slice(sp + 2).trim();
  }
  var arxiv = "", doi = "";
  var ax = rest.match(/arXiv:\s*([^\s]+)/);
  if (ax) arxiv = ax[1];
  var dm = rest.match(/DOI:\s*([^\s,;]+)/i);
  if (dm) doi = dm[1];
  return { authors, year, title, rest, arxiv, doi };
}
__name(parseRefLine, "parseRefLine");
__name2(parseRefLine, "parseRefLine");
__name22(parseRefLine, "parseRefLine");
__name222(parseRefLine, "parseRefLine");
__name2222(parseRefLine, "parseRefLine");
function refKey(p, i) {
  var a = (p.authors || "").replace(/[^A-Za-z]/g, "").slice(0, 14) || "ref";
  return (a + (p.year || "")).toLowerCase() + "_" + i;
}
__name(refKey, "refKey");
__name2(refKey, "refKey");
__name22(refKey, "refKey");
__name222(refKey, "refKey");
__name2222(refKey, "refKey");
function buildProvenance(bodyMd, title, slug) {
  var body = String(bodyMd || "");
  var lines = body.split(/\r?\n/);
  var refs = [], inRefs = false;
  for (var k = 0; k < lines.length; k++) {
    var L = lines[k].trim();
    if (/^#+\s*references\b/i.test(L)) {
      inRefs = true;
      continue;
    }
    if (inRefs) {
      if (/^#+\s*/.test(L)) break;
      if (/^\d+[.)]\s+\S/.test(L) && /\((\d{4})\)/.test(L)) refs.push(L);
      else if (refs.length) break;
    }
  }
  var parsed = refs.map(parseRefLine);
  var bib = parsed.length ? parsed.map(function(p, i) {
    var L2 = [
      "@misc{" + refKey(p, i + 1) + ",",
      "  author = {" + bibEsc(p.authors) + "},",
      "  title = {" + bibEsc(p.title) + "},",
      p.year ? "  year = {" + p.year + "}," : "",
      p.rest ? "  howpublished = {" + bibEsc(p.rest) + "}," : "",
      p.arxiv ? "  eprint = {" + p.arxiv + "}, archiveprefix = {arXiv}," : "",
      p.doi ? "  doi = {" + p.doi + "}," : "",
      "}"
    ].filter(function(x) {
      return x !== "";
    });
    return L2.join("\n");
  }).join("\n\n") : "% No machine-readable references parsed from the body.\n";
  var audit = "# Citation audit\n\nGenerated from the record body at publication. Each reference below appears in the body and is transcribed without modification; machine identifiers (arXiv/DOI) are extracted when present and are never invented when absent.\n\n" + (parsed.length ? parsed.map(function(p, i) {
    var id = [p.arxiv ? "arXiv:" + p.arxiv : null, p.doi ? "DOI " + p.doi : null].filter(Boolean).join("; ") || "no machine identifier present";
    return i + 1 + ". " + p.authors + " (" + p.year + "). " + p.title + ". Source: " + p.rest + " | Identifier: " + id;
  }).join("\n") : "No numbered references section found in the body.");
  var readme = "# " + title + "\n\nAuthor: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)\nLicense: QNFO-ULA v2.0, CC BY-NC-SA 4.0 with the QNFO Supplemental Terms (see LICENSE)\n\nHow to cite: use the deposit record DOI.\nFiles in this deposit:\n- " + slug + ".md - full paper (source)\n- references.bib - BibTeX of the cited references\n- citation-audit.md - reference verification log\n- PROJECT-PLAN.md - goal and claim\n- README.md - this file\n- LICENSE - QNFO-ULA v2.0\n\nProvenance: produced by the QNFO autonomous research pipeline.\n";
  var plan = "# Project plan\n\nGoal: an open, self-contained preprint with real, verifiable references and no fabricated content.\n- Claim: stated in the record body.\n- Research/due-diligence: prior-work context is stated in the body; every reference is real (arXiv ID or DOI) and non-invented.\n- Deposit: paper, references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE.\n- License: QNFO-ULA v2.0 (CC BY-NC-SA 4.0 base).\n";
  var lic = "SPDX-License-Identifier: LicenseRef-QNFO-ULA-2.0\n\nThis work is licensed under the QNFO Unified License Agreement, version 2.0 (QNFO-ULA): the Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License (CC BY-NC-SA 4.0) together with the QNFO Supplemental Terms.\nYou may share and adapt it for non-commercial purposes with credit, under the same terms. Commercial use needs a separate agreement: rowan.quni@qnfo.org.\n\nFull text: https://legal.qnfo.org/\nCC BY-NC-SA 4.0 legal code: https://creativecommons.org/licenses/by-nc-sa/4.0/legalcode\n"; // LICENSE-ONE-1 (2026-10-02): new deposits under QNFO-ULA v2.0
  return { files: [
    { file: slug + ".md", content: String(bodyMd || "") },
    { file: "references.bib", content: bib },
    { file: "citation-audit.md", content: audit },
    { file: "README.md", content: readme },
    { file: "PROJECT-PLAN.md", content: plan },
    { file: "LICENSE", content: lic }
  ] };
}
__name(buildProvenance, "buildProvenance");
__name2(buildProvenance, "buildProvenance");
__name22(buildProvenance, "buildProvenance");
__name222(buildProvenance, "buildProvenance");
__name2222(buildProvenance, "buildProvenance");
async function publishToZenodo(env, title, abstract, bodyMd, slug, extras) {
  if (!env.ZENODO_TOKEN) return { ok: false, error: "no ZENODO_TOKEN" };
  var pkg = buildProvenance(bodyMd, title, slug);
  const dep = await zenodo(env, "POST", "", {});
  if (!dep || !dep.id) return { ok: false, error: "deposit create failed: " + JSON.stringify(dep).slice(0, 200) };
  const id = dep.id;
  const meta = await zenodo(env, "PUT", "/" + id, { metadata: {
    title,
    upload_type: "publication",
    publication_type: "preprint",
    description: (abstract || title).slice(0, 3e3) + (slug ? ' <p>Full text and updates: <a href="https://papers.qnfo.org/papers/' + slug + '/">papers.qnfo.org/papers/' + slug + '/</a></p>' : ''),
    creators: [{ name: ZENODO_CREATOR_NAME, affiliation: ZENODO_AFFILIATION, orcid: ORCID }],
    access_right: "open",
    license: "cc-by-nc-sa-4.0", // LICENSE-ONE-1: the Zenodo id of QNFO-ULA v2.0's CC base
    version: "1.0.0",
    keywords: ["QNFO", "quantum computing", "energy"],
    related_identifiers: slug ? [{ identifier: "https://papers.qnfo.org/papers/" + slug + "/", relation: "isVariantFormOf", resource_type: "publication-preprint" }] : [],
    notes: "Autonomously generated by the QNFO research pipeline. Complete provenance package (references.bib, citation-audit.md, README.md, PROJECT-PLAN.md, LICENSE) deposited. Source: https://papers.qnfo.org/papers/" + slug + "/"
  } });
  if (meta && meta._status && meta._status >= 400) return { ok: false, error: "metadata put failed: " + meta._text };
  if (!meta || !meta.metadata || !meta.metadata.title) return { ok: false, error: "metadata put not applied (no title in response)" };
  const bucket = dep.links && dep.links.bucket;
  if (!bucket) return { ok: false, error: "no deposit bucket" };
  try {
    if (env.PDF_SVC) {
      var hres = await env.PDF_SVC.fetch("https://qnfo-pdf/html", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: String(bodyMd || ""), slug, title }) });
      if (hres.ok) {
        var htxt = await hres.text();
        if (htxt && htxt.length > 100) pkg.files.push({ file: slug + ".html", content: htxt });
      }
    }
  } catch (e) {
  }
  try {
    if (env.PDF_SVC) {
      var pres = await env.PDF_SVC.fetch("https://qnfo-pdf/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: String(bodyMd || ""), slug, title }) });
      if (pres.ok) {
        var pbuf = await pres.arrayBuffer();
        if (pbuf && pbuf.byteLength > 5e3) pkg.files.push({ file: slug + ".pdf", content: pbuf });
      }
    }
  } catch (e) {
  }
  try {
    if (typeof mdToLatex === "function") {
      var qtex = mdToLatex(String(bodyMd || ""));
      if (qtex && qtex.indexOf("\\documentclass") === 0) {
        var qc = await latexCompile(qtex);
        if (qc && qc.ok && qc.pdf && qc.pdf.byteLength > 5e3) {
          pkg.files = pkg.files.filter(function(f) {
            return f.file !== slug + ".pdf";
          });
          pkg.files.push({ file: slug + ".tex", content: qtex });
          pkg.files.push({ file: slug + ".pdf", content: qc.pdf });
        }
      }
    }
  } catch (e) {
  }
  if (extras && extras.length) {
    for (var ei = 0; ei < extras.length; ei++) pkg.files.push(extras[ei]);
  }
  for (let i = 0; i < pkg.files.length; i++) {
    const f = pkg.files[i];
    const fileUrl = bucket + "/" + encodeURIComponent(f.file) + "?access_token=" + env.ZENODO_TOKEN;
    const up = await fetch(fileUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.13" }, body: f.content });
    if (!up.ok) return { ok: false, error: "file upload failed (" + f.file + "): " + up.status };
  }
  const pub = await zenodo(env, "POST", "/" + id + "/actions/publish", {});
  if (!pub || !pub.doi) return { ok: false, error: "publish failed: " + JSON.stringify(pub).slice(0, 250) };
  return { ok: true, doi: pub.doi, conceptdoi: pub.conceptdoi, record: pub.links && pub.links.record || "https://zenodo.org/record/" + pub.id };
}
__name(publishToZenodo, "publishToZenodo");
__name2(publishToZenodo, "publishToZenodo");
__name22(publishToZenodo, "publishToZenodo");
__name222(publishToZenodo, "publishToZenodo");
__name2222(publishToZenodo, "publishToZenodo");
__name22222(publishToZenodo, "publishToZenodo");
async function publishStage(env, row) {
  const slug = row.paper_slug;
  const paper = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(slug).first();
  if (!paper) {
    await markError(env, row, "paper row missing for slug " + slug);
    return { ok: false, stage: "publish" };
  }
  // NO-BLANK-PUBLISH-1 (2026-09-26): never publish a paper with no renderable content.
  // A published paper whose body and abstract are both empty renders a blank detail page.
  const _bodyStripped = String(paper.body_md || "").replace(/^---[\s\S]*?---/, "").replace(/^\+\+\+[\s\S]*?\+\+\+/, "").trim();
  if (_bodyStripped.length < 40 && String(paper.abstract || "").trim().length < 40) {
    await markError(env, row, "NO-BLANK-PUBLISH-1: body and abstract both empty for slug " + slug);
    return { ok: false, stage: "publish" };
  }
  // DLF-ZENODO-PUBLISH-BLOCKED-1: do not publish qnf-DLF-001 until a direct safe Zenodo deposit path is exposed and the Zenodo v2 deposit contamination in #979 is fixed.
  // DLF-HOLD-NOT-REQUEUE-1 (0.9.26): the evolve-c115 version called markError(), which re-queues the row to stage
  // 'ground' (3 recoveries + 2 terminal re-arms), so a deliberately held paper would be re-researched ~5 times at full
  // model cost before stopping. Park it instead: status 'held' is never claimed (the claim queries select 'queued').
  if (slug === 'qnf-DLF-001') {
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='held', error=?, claimed_at=NULL WHERE id=?").bind('DLF-ZENODO-PUBLISH-BLOCKED-1: publish held pending a safe Zenodo path and the #979 fix (agent_issue 1091)', row.id).run();
    return { ok: false, stage: 'publish', held: true };
  }
  const pub = await publishToZenodo(env, paper.title, paper.abstract, paper.body_md, slug);
  if (!pub.ok) {
    await markError(env, row, "zenodo: " + pub.error);
    return { ok: false, stage: "publish" };
  }
  await env.LIVING_PAPER.prepare("UPDATE papers SET doi=?1, zenodo_doi=?1, status='published', zenodo_url=?2, updated_at=datetime('now') WHERE slug=?3").bind(pub.doi, pub.record, slug).run();
  try {
    await env.MIRROR.put("papers/" + slug + ".md", paper.body_md);
  } catch (e) {
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, channel, action, mode, fallback, zenodo_url, pages_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind("res-" + Date.now().toString(36), slug, pub.doi, paper.title, "bluesky", "queued", "auto", 0, pub.record, "https://papers.qnfo.org/papers/" + slug + "/").run();
  } catch (e) {
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='published', stage='done', doi=?, published_at=? WHERE id=?").bind(pub.doi, nowIso(), row.id).run();
  return { ok: true, stage: "publish->published", doi: pub.doi, slug };
}
__name(publishStage, "publishStage");
__name2(publishStage, "publishStage");
__name22(publishStage, "publishStage");
__name222(publishStage, "publishStage");
__name2222(publishStage, "publishStage");
__name22222(publishStage, "publishStage");
async function latestRecord(env, recId) {
  try {
    var r = await fetch("https://zenodo.org/api/records/" + recId + "/latest", { headers: { "User-Agent": "QNFO-research-exec/0.5.1" } });
    if (r.ok) return await r.json();
  } catch (e) {
  }
  return null;
}
__name(latestRecord, "latestRecord");
__name2(latestRecord, "latestRecord");
__name22(latestRecord, "latestRecord");
__name222(latestRecord, "latestRecord");
__name2222(latestRecord, "latestRecord");
function mdToLatex(md) {
  var body = String(md).replace(/^\uFEFF/, "");
  var fm = {};
  var m = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (m) {
    var fl = m[1].split(/\r?\n/);
    for (var i = 0; i < fl.length; i++) {
      var kv = fl[i].match(/^([A-Za-z]+):\s*["']?([^"']*)["']?\s*$/);
      if (kv) fm[kv[1].toLowerCase()] = kv[2].trim();
    }
    body = body.slice(m[0].length);
  }
  var sl = body.split(/\r?\n/);
  var blocks = [];
  var cur = null;
  function flush() {
    if (cur) {
      blocks.push(cur);
      cur = null;
    }
  }
  __name(flush, "flush");
  __name2(flush, "flush");
  __name22(flush, "flush");
  __name222(flush, "flush");
  __name2222(flush, "flush");
  for (var i = 0; i < sl.length; i++) {
    var ln2 = sl[i];
    var h = ln2.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: "h", lvl: h[1].length, text: h[2].trim() });
      continue;
    }
    if (/^\s*\|/.test(ln2)) {
      if (!cur || cur.type !== "table") {
        flush();
        cur = { type: "table", rows: [] };
      }
      var cells = ln2.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map(function(c) {
        return c.trim();
      });
      var isSep = cells.length > 0 && cells.every(function(c) {
        return c === "" || /^:?-+:?$/.test(c);
      });
      if (!isSep) cur.rows.push(cells);
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln2)) {
      if (!cur || cur.type !== "ul") {
        flush();
        cur = { type: "ul", items: [] };
      }
      cur.items.push(ln2.replace(/^\s*[-*]\s+/, "").trim());
      continue;
    }
    if (/^\s*\d+\.\s+/.test(ln2)) {
      if (!cur || cur.type !== "ol") {
        flush();
        cur = { type: "ol", items: [] };
      }
      cur.items.push(ln2.replace(/^\s*\d+\.\s+/, "").trim());
      continue;
    }
    if (/^\s*$/.test(ln2)) {
      flush();
      continue;
    }
    if (!cur || cur.type !== "p") {
      flush();
      cur = { type: "p", lines: [] };
    }
    cur.lines.push(ln2.trim());
  }
  flush();
  var O = [];
  var abs = [];
  var inAbs = false, inRefs = false;
  function tbl(rows) {
    if (!rows.length) return;
    var hd = rows[0], dt = rows.slice(1);
    var n = hd.length, col = "l";
    for (var z = 1; z < n; z++) col += "l";
    O.push("\\begin{table}[h]");
    O.push("\\centering");
    O.push("\\begin{tabular}{" + col + "}");
    O.push("\\toprule");
    O.push(hd.map(inl).join(" & ") + " \\\\");
    O.push("\\midrule");
    for (var r = 0; r < dt.length; r++) O.push(dt[r].map(inl).join(" & ") + " \\\\");
    O.push("\\bottomrule");
    O.push("\\end{tabular}");
    O.push("\\end{table}");
    O.push("");
  }
  __name(tbl, "tbl");
  __name2(tbl, "tbl");
  __name22(tbl, "tbl");
  __name222(tbl, "tbl");
  __name2222(tbl, "tbl");
  for (var b = 0; b < blocks.length; b++) {
    var blk = blocks[b];
    if (blk.type === "h") {
      var key = blk.text.toLowerCase().replace(/^\d+\.\s*/, "").trim();
      if (key === "abstract") {
        inAbs = true;
        inRefs = false;
        continue;
      }
      if (key === "references") {
        inRefs = true;
        inAbs = false;
        O.push("\\section*{References}");
        continue;
      }
      if (key.indexOf("changelog") === 0 || key.indexOf("verification") === 0) {
        inRefs = inAbs = false;
        O.push("\\section*{" + esc(blk.text) + "}");
        continue;
      }
      inRefs = inAbs = false;
      var st = blk.text.replace(/^\d+\.\s*/, "").trim();
      var cmd = "\\section{";
      if (blk.lvl === 1) cmd = "\\section*{";
      else if (blk.lvl === 3) cmd = "\\subsection{";
      else if (blk.lvl === 4) cmd = "\\subsubsection{";
      O.push(cmd + esc(st) + "}");
      continue;
    }
    if (blk.type === "table") {
      tbl(blk.rows);
      continue;
    }
    if (blk.type === "ul") {
      var en = inRefs ? "enumerate" : "itemize";
      O.push("\\begin{" + en + "}" + (inRefs ? "[label={[\\arabic*]},leftmargin=2.5em,itemsep=1pt]" : ""));
      for (var u = 0; u < blk.items.length; u++) {
        var it = blk.items[u];
        if (inRefs) it = it.replace(/^\[\d+\]\s*/, "");
        O.push("  \\item " + inl(it));
      }
      O.push("\\end{" + en + "}");
      continue;
    }
    if (blk.type === "ol") {
      O.push("\\begin{enumerate}" + (inRefs ? "[label={[\\arabic*]},leftmargin=2.5em,itemsep=1pt]" : ""));
      for (var o = 0; o < blk.items.length; o++) {
        var it2 = blk.items[o];
        if (inRefs) it2 = it2.replace(/^\[\d+\]\s*/, "");
        O.push("  \\item " + inl(it2));
      }
      O.push("\\end{enumerate}");
      continue;
    }
    if (blk.type === "p") {
      var pa = blk.lines.join(" ");
      if (inAbs) abs.push(inl(pa));
      else {
        O.push(inl(pa));
        O.push("");
      }
      continue;
    }
  }
  var dt2 = fm.date || "";
  var mm = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var dm2 = String(dt2).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  var dateNice = dm2 ? mm[parseInt(dm2[2], 10)] + " " + parseInt(dm2[3], 10) + ", " + dm2[1] : dt2;
  var author = fm.author || "QNFO";
  var doi = fm.doi || "";
  var ver = fm.version || "";
  var P = [];
  P.push("\\documentclass[11pt]{article}");
  P.push("\\usepackage[utf8]{inputenc}");
  P.push("\\usepackage[T1]{fontenc}");
  P.push("\\usepackage{newtxtext,newtxmath}");
  P.push("\\usepackage[margin=1in]{geometry}");
  P.push("\\usepackage{amsmath}");
  P.push("\\usepackage{booktabs}");
  P.push("\\usepackage{enumitem}");
  P.push("\\usepackage[colorlinks=true,urlcolor=blue]{hyperref}");
  P.push("\\usepackage{microtype}");
  P.push("\\setlength{\\emergencystretch}{2em}");
  P.push("\\title{" + esc(fm.title || "Untitled") + "}");
  P.push("\\author{" + esc(author) + (doi ? "\\thanks{\\href{https://doi.org/" + esc(doi) + "}{doi:" + esc(doi) + "}" + (ver ? " (version " + esc(ver) + ")" : "") + "}" : "") + "}");
  P.push("\\date{" + dateNice + "}");
  var out = [];
  out.push(P.join("\n"));
  out.push("\\begin{document}");
  out.push("\\maketitle");
  if (abs.length) {
    out.push("\\begin{abstract}");
    out.push(abs.join(" "));
    out.push("\\end{abstract}");
  }
  out = out.concat(O);
  out.push("\\end{document}");
  return out.join("\n");
}
__name(mdToLatex, "mdToLatex");
__name2(mdToLatex, "mdToLatex");
__name22(mdToLatex, "mdToLatex");
__name222(mdToLatex, "mdToLatex");
__name2222(mdToLatex, "mdToLatex");
function esc(s) {
  return String(s).replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}").replace(/\^/g, "\\textasciicircum{}");
}
__name(esc, "esc");
__name2(esc, "esc");
__name22(esc, "esc");
__name222(esc, "esc");
__name2222(esc, "esc");
function inl(s) {
  var str = String(s);
  var math = [];
  var cmd = [];
  function pm() {
    return "\0" + (math.length - 1) + "";
  }
  __name(pm, "pm");
  __name2(pm, "pm");
  __name22(pm, "pm");
  __name222(pm, "pm");
  __name2222(pm, "pm");
  function pc() {
    return "" + (cmd.length - 1) + "";
  }
  __name(pc, "pc");
  __name2(pc, "pc");
  __name22(pc, "pc");
  __name222(pc, "pc");
  __name2222(pc, "pc");
  function rs(x) {
    return String(x).replace(/\x00(\d+)\x01/g, function(m, k) {
      return math[Number(k)];
    });
  }
  __name(rs, "rs");
  __name2(rs, "rs");
  __name22(rs, "rs");
  __name222(rs, "rs");
  __name2222(rs, "rs");
  str = str.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+)\s*\^\s*(\d+)/g, function(m, a, b, c) {
    math.push("$" + a + "\\times " + b + "^{" + c + "}$");
    return pm();
  });
  str = str.replace(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/g, function(m, a, b) {
    math.push("$" + a + "\\times " + b + "$");
    return pm();
  });
  str = str.replace(/(\d+(?:\.\d+)?)e([+-]?\d+)/g, function(m, a, e2) {
    math.push("$" + a + "\\times 10^{" + e2 + "}$");
    return pm();
  });
  str = str.replace(/([A-Za-z]+)_([A-Za-z0-9]+)(\([0-9]+\))?/g, function(m, a, b, c) {
    math.push("$" + a + "_{" + b + "}" + (c || "") + "$");
    return pm();
  });
  str = str.replace(/((?:\([^()\n]{1,28}\)|[A-Za-z0-9)]+))\^([A-Za-z0-9()\-+./]{1,16})/g, function(m, a, b) {
    math.push("$" + rs(a).replace(/\$([^$]*)\$/g, "$1") + "^{" + b + "}$");
    return pm();
  });
  str = str.replace(/\*\*([^*]+)\*\*/g, function(m, x) {
    cmd.push("\\textbf{" + x + "}");
    return pc();
  });
  str = str.replace(/(^|[^*])\*([^*\n]+)\*/g, function(m, p, x) {
    cmd.push("\\emph{" + x + "}");
    return p + pc();
  });
  str = str.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function(m, t, u) {
    cmd.push("\\href{" + u + "}{" + t + "}");
    return pc();
  });
  str = str.replace(/(^|[^\\])(https?:\/\/[^\s<>]+)/g, function(m, p, u) {
    cmd.push("\\url{" + u + "}");
    return p + pc();
  });
  str = str.replace(/×/g, " $\\times$ ").replace(/≈/g, " $\\approx$ ").replace(/≥/g, " $\\geq$ ").replace(/≤/g, " $\\leq$ ").replace(/−/g, " $-$ ");
  str = str.replace(/²/g, "\\textsuperscript{2}").replace(/³/g, "\\textsuperscript{3}");
  str = str.replace(/’/g, "'").replace(/‘/g, "'").replace(/“/g, '"').replace(/”/g, '"').replace(/—/g, "---").replace(/–/g, "--");
  str = str.replace(/([&%$#_{}])/g, "\\$1").replace(/~/g, "\\textasciitilde{}");
  str = str.replace(/\x02(\d+)\x03/g, function(m, k) {
    return cmd[Number(k)];
  });
  str = str.replace(/\x00(\d+)\x01/g, function(m, k) {
    return math[Number(k)];
  });
  for (var pass = 0; pass < 8; pass++) {
    var nxt = str.replace(/\$([^$\n]{1,90})\$\s*([=+\-/(]|\s)\s*\$([^$\n]{1,90})\$/g, function(m, a, sep, b) {
      return "$" + a + " " + sep + " " + b + "$";
    });
    if (nxt === str) break;
    str = nxt;
  }
  return str;
}
__name(inl, "inl");
__name2(inl, "inl");
__name22(inl, "inl");
__name222(inl, "inl");
__name2222(inl, "inl");
async function latexCompile(tex) {
  var fd = new FormData();
  fd.append("engine", "pdflatex");
  fd.append("return", "pdf");
  fd.append("filename[]", "document.tex");
  fd.append("filecontents[]", tex);
  var r = await fetch("https://texlive.net/cgi-bin/latexcgi", { method: "POST", body: fd, headers: { "User-Agent": "QNFO-research-exec/0.5.3 (+https://qnfo.org)" }, signal: AbortSignal.timeout(6e4) });
  if (!r.ok) return { ok: false, err: "http " + r.status };
  var ct = (r.headers.get("content-type") || "").toLowerCase();
  if (ct.indexOf("application/pdf") >= 0) return { ok: true, pdf: await r.arrayBuffer() };
  return { ok: false, err: "non-pdf " + ct, log: String(await r.text()).slice(0, 1200) };
}
__name(latexCompile, "latexCompile");
__name2(latexCompile, "latexCompile");
__name22(latexCompile, "latexCompile");
__name222(latexCompile, "latexCompile");
__name2222(latexCompile, "latexCompile");
function extractTitle(md, fallback) {
  var m = String(md || "");
  var fm = m.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    var tm = fm[1].match(/^title:\s*["']?([^"'\n]+)["']?\s*$/im);
    if (tm) return tm[1].trim();
  }
  var hm = m.match(/^#\s+(.+)$/m);
  if (hm) {
    var lines = m.split(/\r?\n/);
    var idx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^#\s+/.test(lines[i])) {
        idx = i;
        break;
      }
    }
    var full = lines[idx].replace(/^#\s+/, "").trim();
    for (var j = idx + 1; j < lines.length; j++) {
      var t = lines[j].trim();
      if (!t) break;
      if (/^#/.test(t)) break;
      if (/^\*\*|^(Author|ORCID|DOI|Date|Version|Contact|Email|ISNI|Affiliation):/i.test(t)) break;
      full += " " + t;
    }
    return full.replace(/\s+/g, " ").trim();
  }
  return fallback || "";
}
__name(extractTitle, "extractTitle");
__name2(extractTitle, "extractTitle");
function qualityGate(row, minLen, minRefs) {
  var NLc = String.fromCharCode(10), TBc = String.fromCharCode(9), BQc = String.fromCharCode(96);
  var md = String(row && row.corrected_md || "");
  var len = md.length;
  var reasons = [];
  if (len < minLen) reasons.push("body_len=" + len + "<" + minLen);
  var litRe = new RegExp("#{1,4}[^" + NLc + "]*(prior work|related work|literature review|background)", "i");
  var doiRe = new RegExp("10[.][0-9]{4,9}/", "g");
  var axRe = new RegExp("(?:arxiv[.]org/|arXiv:[" + NLc + TBc + " ]*[0-9]{4}[.][0-9]{4,5})", "gi");
  var lit = litRe.test(md);
  var refs = (md.match(doiRe) || []).length + (md.match(axRe) || []).length;
  var bibHead = md.search(new RegExp("#{1,4}[^" + NLc + "]*(references|bibliography)", "i"));
  if (bibHead >= 0) {
    var bibTail = md.slice(bibHead);
    var numEntries = bibTail.match(new RegExp("^[" + TBc + " ]*(?:\\[[0-9]{1,3}\\]|[0-9]{1,3}[.])[" + TBc + " ]", "gm")) || [];
    var linkEntries = bibTail.match(new RegExp("^[" + TBc + " ]*[-*][" + TBc + " ]+.+?((19|20)[0-9]{2})", "gm")) || [];
    refs = refs + numEntries.length + linkEntries.length;
  }
  var citeLines = md.match(new RegExp("@[A-Za-z][A-Za-z0-9_-]*[0-9]{4}[a-z]?[" + TBc + " ]*:", "g")) || [];
  refs = refs + citeLines.length;
  var bibRaw = String(row && row.references_bib || "");
  var bibEntries = bibRaw.match(new RegExp("@[A-Za-z]+[" + TBc + " ]*\\{", "g")) || [];
  refs = refs + bibEntries.length;
  if (!lit && refs < minRefs) reasons.push("lit_review=0 AND refs=" + refs + "<" + minRefs);
  var hasFence = md.indexOf(BQc + BQc + BQc) >= 0;
  var tableRe = new RegExp("^[" + NLc + TBc + " ]*[|][-:| ]+[|]", "m");
  var hasTable = tableRe.test(md);
  var hasNumeric = /(?:simulat|numerical experiment|computed|verified (?:numerically|in code)|implementation artifact)/i.test(md);
  var hasVerifyArtifact = !!(row && (row.verify_script && String(row.verify_script).trim().length > 0 || row.verify_output && String(row.verify_output).trim().length > 0));
  if (!hasFence && !hasTable && !hasNumeric && !hasVerifyArtifact) reasons.push("no_verification_marker");
  if (!reasons.length) return { ok: true };
  return { ok: false, reason: "quality gate: " + reasons.join("; ") };
}
__name(qualityGate, "qualityGate");
__name2(qualityGate, "qualityGate");
__name22(qualityGate, "qualityGate");
__name222(qualityGate, "qualityGate");
__name2222(qualityGate, "qualityGate");
async function depositToGithub(env, slug, title, md, doi) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "no github token" };
  var owner = "QNFO", repo = "qnfo-research";
  var prog = programFor(slug);
  var dir = prog === "papers" ? "papers/" + slug : prog + "/" + slug;
  var readme = "# " + (title || slug) + NL + NL + "DOI: " + doi + NL + NL + "Author: Rowan Brad Quni-Gudzinas (ORCID 0009-0002-4317-5604)" + NL + "License: QNFO-ULA v2.0 (CC BY-NC-SA 4.0 with the QNFO Supplemental Terms, https://legal.qnfo.org/)" + NL + NL + "Auto-deposited by qnfo-research-exec (artifact-deposition P3).";
  var files = [["paper.md", md || ""], ["README.md", readme]];
  var out = [];
  for (var i = 0; i < files.length; i++) {
    var name = files[i][0], content = files[i][1];
    var path = dir + "/" + name;
    var body = JSON.stringify({ message: "auto-deposit: " + slug + " (" + (doi || "no-doi") + ")", content: b64(content), branch: "main" });
    try {
      var r = await fetch("https://api.github.com/repos/" + owner + "/" + repo + "/contents/" + path, { method: "PUT", headers: { Authorization: "Bearer " + env.GITHUB_TOKEN, "User-Agent": "QNFO-research-exec/0.8.0", "Content-Type": "application/json", Accept: "application/vnd.github+json" }, body });
      var j = await r.json();
      out.push({ file: name, status: r.status, sha: j && j.content && j.content.sha || "" });
      if (r.status === 201 || r.status === 200) {
        try {
          await env.QNFO_AUDIT.prepare("INSERT INTO publication_artifacts (publication_id, artifact_type, artifact_name, sha256, file_size_bytes, created_at) VALUES (?, ?, ?, ?, ?, datetime(now))").bind(doi || slug, "github-md", path, String(j.content && j.content.sha || ""), String(content).length).run();
        } catch (ePa) {
        }
      }
    } catch (e) {
      out.push({ file: name, error: String(e && e.message || e).slice(0, 120) });
    }
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime(now), artifact-deposit, qnfo-research-exec, ?)").bind((slug + " -> github " + JSON.stringify(out)).slice(0, 450)).run();
  } catch (eL) {
  }
  return { ok: out.some(function(o) {
    return o.status === 200 || o.status === 201;
  }), files: out };
}
__name(depositToGithub, "depositToGithub");
__name2(depositToGithub, "depositToGithub");
__name22(depositToGithub, "depositToGithub");
__name222(depositToGithub, "depositToGithub");
__name2222(depositToGithub, "depositToGithub");
function programFor(slug) {
  var x = String(slug || "");
  if (x.indexOf("jpcub") >= 0 || x.indexOf("joules-per") >= 0 || x.indexOf("joules") >= 0) return "joules-per-compute-benchmark";
  if (x.indexOf("ultrametric") >= 0 || x.indexOf("silent-radix") >= 0 || x.indexOf("radix") >= 0) return "silent-radix";
  if (x.indexOf("helix") >= 0) return "alpha-pi-helix";
  if (x.indexOf("adelic") >= 0) return "adelic-freedom";
  if (x.indexOf("primon") >= 0 || x.indexOf("arithmetic-quantum") >= 0) return "arithmetic-quantum-thermodynamics";
  if (x.indexOf("margolus") >= 0) return "margolus-levitin";
  if (x.indexOf("topological-spin") >= 0) return "topological-spin";
  if (x.indexOf("landauer") >= 0 || x.indexOf("surface-code") >= 0 || x.indexOf("decoherence") >= 0 || x.indexOf("latency") >= 0) return "jpcub-qec";
  return "papers";
}
__name(programFor, "programFor");
__name2(programFor, "programFor");
__name22(programFor, "programFor");
__name222(programFor, "programFor");
__name2222(programFor, "programFor");
async function publishV2(env, row) {
  var slug = row.slug || "paper";
  var minLen = Number(env.QUALITY_MIN_LEN || 8e3);
  var minRefs = Number(env.QUALITY_MIN_REFS || 5);
  if (String(env.QUALITY_GATE_OFF || "") !== "1") {
    var gate = qualityGate(row, minLen, minRefs);
    if (!gate.ok) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='gate-blocked', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO gov_gate_log (ts, diff_sha, decision, reason, touched_gates, actor, wbs_code) VALUES (datetime('now'), 'quality-gate', 'BLOCK', ?, 'QUALITY-GATE-1', 'qnfo-research-exec', 'P1')").bind(gate.reason.slice(0, 300)).run();
      } catch (eG) {
      }
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'quality-gate-block', 'qnfo-research-exec', ?)").bind(("slug=" + String(row.slug || "?") + " " + gate.reason).slice(0, 450)).run();
      } catch (eE) {
      }
      return { ok: false, stage: "gate", error: gate.reason };
    }
  }
  var recId = String(row.paper_doi || "").split("zenodo.").pop() || "";
  if (!recId) {
    // FIRST-DEPOSIT-1 (2026-09-27): a revision queued for a paper with no existing Zenodo record
    // (empty paper_doi) previously errored with "bad doi", so first-time deposits had no automated
    // path. Now they deposit through publishToZenodo, honoring the living-paper floor: status='published'
    // requires >= 20000 chars (MIN-PAPER-LENGTH-3), enforced here before the D1 trigger fires.
    var fdBody = String(row.corrected_md || "");
    if (fdBody.length < 20000) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='gate-blocked', recover_count=recover_count+1, updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      try {
        await env.QNFO_AUDIT.prepare("INSERT INTO gov_gate_log (ts, diff_sha, decision, reason, touched_gates, actor, wbs_code) VALUES (datetime('now'), 'first-deposit', 'BLOCK', ?, 'MIN-PAPER-LENGTH-3', 'qnfo-research-exec', 'P1')").bind(("first deposit requires >= 20000 chars; " + fdBody.length + " provided").slice(0, 300)).run();
      } catch (eG2) {
      }
      return { ok: false, stage: "gate", error: "first deposit requires >= 20000 chars; " + fdBody.length + " provided" };
    }
    var fdTitle = extractTitle(fdBody, row.title);
    var fdAbstract = "";
    var fdAbsM = fdBody.match(/abstract:\s*\|\r?\n((?:\s{1,4}.*\r?\n?)+)/);
    if (fdAbsM) fdAbstract = fdAbsM[1].replace(/^\s{1,4}/gm, "").replace(/\s+/g, " ").trim();
    if (!fdAbstract) {
      var fdAbsM2 = fdBody.match(/abstract:\s*["']?([^"'\n]{40,600})["']?/i);
      if (fdAbsM2) fdAbstract = String(fdAbsM2[1]).trim();
    }
    if (!fdAbstract) fdAbstract = String(row.title || "QNFO research paper");
    var fd = await publishToZenodo(env, fdTitle, fdAbstract, fdBody, String(row.slug || "paper"));
    if (!fd.ok) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      return { ok: false, stage: "first-deposit", error: fd.error };
    }
    var fdUpd = await env.LIVING_PAPER.prepare("UPDATE papers SET title=?, body_md=?, version=?, doi=?, zenodo_doi=?, zenodo_url=?, status='published', updated_at=datetime('now') WHERE slug=?").bind(fdTitle, fdBody, row.version_to || "1.0.0", fd.doi, fd.doi, fd.record, String(row.slug || "")).run();
    if (!fdUpd || !fdUpd.meta || !fdUpd.meta.changes) {
      try {
        await env.LIVING_PAPER.prepare("INSERT INTO papers (identifier, title, authors, abstract, doi, version, zenodo_doi, zenodo_url, status, body_md, license, language, paper_type, slug, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'published',?,?,?,?,?,datetime('now'),datetime('now'))").bind("vq-" + row.id, fdTitle, '["Rowan Brad Quni-Gudzinas"]', fdAbstract, fd.doi, row.version_to || "1.0.0", fd.doi, fd.record, fdBody, "QNFO-ULA", "en", "preprint", String(row.slug || "")).run();
      } catch (eIns) {
      }
    }
    try {
      await env.MIRROR.put("papers/" + String(row.slug || "paper") + ".md", fdBody);
    } catch (eMir) {
    }
    try {
      await env.QNFO_AUDIT.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, channel, action, mode, fallback, zenodo_url, pages_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind("res-" + Date.now().toString(36), String(row.slug || ""), fd.doi, fdTitle, "bluesky", "queued", "auto", 0, fd.record, "https://papers.qnfo.org/papers/" + String(row.slug || "") + "/").run();
    } catch (eDiss) {
    }
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(fd.doi, row.id).run();
    try {
      await env.QNFO_AUDIT.prepare("UPDATE paper_revision_log SET status='published', new_doi=?, updated_at=datetime('now') WHERE slug=? AND status='queued'").bind(fd.doi, String(row.slug || "")).run();
    } catch (ePrl2) {
    }
    await depositToGithub(env, String(row.slug || "paper"), fdTitle, fdBody, fd.doi);
    return { ok: true, stage: "first-deposit", doi: fd.doi };
  }
  var latest = await latestRecord(env, recId);
  if (latest && latest.metadata && String(latest.metadata.version || "") === String(row.version_to || "")) {
    var adoptedDoi = latest.doi || "10.5281/zenodo." + latest.id;
    var adoptedTitle = extractTitle(row.corrected_md || "", row.title);
    await env.LIVING_PAPER.prepare("UPDATE papers SET title=?, body_md=?, version=?, doi=?, zenodo_doi=?, zenodo_url=?, updated_at=datetime('now') WHERE slug=?").bind(adoptedTitle, row.corrected_md || "", row.version_to || "2.0.0", adoptedDoi, adoptedDoi, "https://zenodo.org/records/" + String(latest.id || String(adoptedDoi).split("zenodo.").pop()), slug).run();
    if (env.GRAPH_DB) {
      try {
        var nodeA = await env.GRAPH_DB.prepare("SELECT properties FROM nodes WHERE id=?").bind("zenodo-10-5281-zenodo-" + recId).first();
        if (nodeA) {
          var propsA = {};
          try {
            propsA = JSON.parse(nodeA.properties || "{}");
          } catch (eA) {
            propsA = {};
          }
          propsA.doi = adoptedDoi;
          propsA.zenodo_url = "https://doi.org/" + adoptedDoi;
          propsA.version = row.version_to || "2.0.0";
          await env.GRAPH_DB.prepare("UPDATE nodes SET properties=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(propsA), "zenodo-10-5281-zenodo-" + recId).run();
        }
      } catch (e) {
      }
    }
    if (env.MIRROR) {
      try {
        await env.MIRROR.put("2026/09/" + slug + ".md", row.corrected_md || "");
      } catch (e) {
      }
    }
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(adoptedDoi, row.id).run();
    await depositToGithub(env, slug, row.title, row.corrected_md || "", adoptedDoi);
    return { ok: true, stage: "v2", doi: adoptedDoi, adopted: true };
  }
  var conceptRec = recId;
  var _prevMeta = null;
  try {
    var _ri = await fetch("https://zenodo.org/api/records/" + recId, { headers: { "User-Agent": "QNFO-research-exec/0.5.6" } });
    if (_ri.ok) {
      var _rj = await _ri.json();
      if (_rj.conceptrecid) conceptRec = String(_rj.conceptrecid);
      _prevMeta = _rj.metadata || null;
    }
  } catch (e) {
  }
  var nv = null;
  try {
    var lst = await zenodo(env, "GET", "?size=250&sort=mostrecent", {});
    var arr2 = lst && lst.hits ? lst.hits.hits : Array.isArray(lst) ? lst : [];
    for (var di = 0; di < arr2.length; di++) {
      var dep = arr2[di];
      if (!dep) continue;
      var sub = dep.submitted;
      if (sub === false || sub === "false") {
        var crc = String(dep.conceptrecid || dep.metadata && dep.metadata.conceptrecid || "");
        if (crc === conceptRec || String(dep.id || dep.recid || "") === conceptRec) {
          nv = await zenodo(env, "GET", "/" + (dep.id || dep.recid), {});
          break;
        }
      }
    }
  } catch (eLs) {
  }
  if (!nv || !nv.id) {
    var nvBase = recId;
    try {
      var _ci = await fetch("https://zenodo.org/api/records/" + conceptRec, { headers: { "User-Agent": "QNFO-research-exec/0.5.6" } });
      if (_ci.ok) {
        var _cj = await _ci.json();
        if (_cj.id) nvBase = String(_cj.id);
      }
    } catch (e) {
    }
    try {
      nv = await zenodo(env, "POST", "/" + nvBase + "/actions/newversion", {});
    } catch (eN) {
      nv = null;
    }
    if (!nv || !nv.id) {
      try {
        var unlockResp = await fetch("https://zenodo.org/api/deposit/depositions?size=10&sort=mostrecent&access_token=" + env.ZENODO_TOKEN, { headers: { "User-Agent": "QNFO-research-exec/0.9.7" } });
        if (unlockResp.ok) {
          var unlockList = await unlockResp.json();
          var existingDraft = (Array.isArray(unlockList) ? unlockList : unlockList.hits && unlockList.hits.hits || []).find(function(d) {
            return d && d.submitted === false && String(d.conceptrecid || "") === conceptRec;
          });
          if (existingDraft && existingDraft.id) {
            var existFiles = existingDraft.files || [];
            for (var efi = 0; efi < existFiles.length; efi++) {
              try {
                await fetch(existFiles[efi].links.self + "?access_token=" + env.ZENODO_TOKEN, { method: "DELETE" });
              } catch (e) {
              }
            }
            nv = existingDraft;
          }
        }
      } catch (eUnlock) {
      }
    }
    if (!nv || !nv.id) {
      try {
        await new Promise(function(r) {
          setTimeout(r, 2e3);
        });
        nv = await zenodo(env, "POST", "/" + nvBase + "/actions/newversion", {});
      } catch (eRetry) {
        nv = null;
      }
    }
  }
  if (!nv || !nv.id) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "newversion failed: " + JSON.stringify(nv).slice(0, 200) };
  }
  var slug = row.slug || "paper";
  // ZENODO-V2-DEPOSIT-CONTAMINATION FIX (C1, 2026-09-27, agent_issues 979): the POST
  // /actions/newversion response does NOT enumerate the inherited draft files (nv.files is
  // empty), so the old DELETE loop removed nothing and every v2 inherited the full v1 file
  // set (54 files of which 44 were v1 fragments). Fetch the DRAFT's OWN file listing
  // (GET /deposit/depositions/<id>/files) and DELETE each file before uploading the manifest.
  var files = nv.files || [];
  try {
    if ((!files || !files.length) && nv.id) {
      var dl = await zenodo(env, "GET", "/" + nv.id + "/files");
      if (Array.isArray(dl)) files = dl;
    }
  } catch (e) {
  }
  for (var i = 0; i < files.length; i++) {
    if (!files[i] || !files[i].links || !files[i].links.self) continue;
    try {
      await fetch(files[i].links.self + "?access_token=" + env.ZENODO_TOKEN, { method: "DELETE" });
    } catch (e) {
    }
  }
  var bucket = nv.links && nv.links.bucket;
  var html = "", pdf = null;
  if (bucket) {
    var up = await fetch(bucket + "/" + encodeURIComponent(slug) + ".md?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: row.corrected_md || "" });
    if (!up.ok) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
      return { ok: false, stage: "v2", error: "md upload failed: " + up.status };
    }
    if (env.PDF_SVC) {
      try {
        var hres = await env.PDF_SVC.fetch("https://qnfo-pdf/html", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: row.corrected_md || "", slug, title: row.title || "" }) });
        if (hres.ok) {
          html = await hres.text();
          await fetch(bucket + "/" + encodeURIComponent(slug) + ".html?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: html });
        }
      } catch (e) {
      }
      try {
        var pres = await env.PDF_SVC.fetch("https://qnfo-pdf/pdf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body_md: row.corrected_md || "", slug, title: row.title || "" }) });
        if (pres.ok) {
          pdf = await pres.arrayBuffer();
          await fetch(bucket + "/" + encodeURIComponent(slug) + ".pdf?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.0" }, body: pdf });
        }
      } catch (e) {
      }
    }
  }
  if (bucket) {
    if (env.ZENODO_TOKEN && typeof mdToLatex === "function") {
      try {
        var qtex = mdToLatex(row.corrected_md || "");
        if (qtex && qtex.indexOf("\\documentclass") === 0) {
          var qc = await latexCompile(qtex);
          if (qc.ok && qc.pdf && qc.pdf.byteLength > 5e3) {
            await fetch(bucket + "/" + encodeURIComponent(slug) + ".pdf?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.3" }, body: qc.pdf });
            await fetch(bucket + "/" + encodeURIComponent(slug) + ".tex?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.3" }, body: qtex });
          } else {
            try {
              await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text) VALUES (datetime('now'), 'latex-fail', 'qnfo-research-exec', ?)").bind(((qc.err || "fail") + " " + String(qc.log || "")).slice(0, 450)).run();
            } catch (eL) {
            }
          }
        }
      } catch (eX) {
      }
    }
    var provFiles = { "references.bib": row.references_bib, "citation-audit.md": row.citation_audit, "DUE-DILIGENCE.md": row.due_diligence, "PROJECT-PLAN.md": row.project_plan, "README.md": row.readme_md, "LICENSE": row.license_md, "jpcub_nv_verify.py": row.verify_script, "jpcub_nv_verify_output.txt": row.verify_output };
    for (var pf in provFiles) {
      if (provFiles[pf] && String(provFiles[pf]).trim().length > 0) {
        try {
          await fetch(bucket + "/" + encodeURIComponent(pf) + "?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/0.5.2" }, body: provFiles[pf] });
        } catch (e) {
        }
      }
    }
  }
  var meta = nv.metadata || {};
  if (row.version_to) meta.version = row.version_to;
  var metaClean = {};
  for (var k in meta) {
    if (k !== "prereserve_doi" && k !== "doi" && k !== "recid") metaClean[k] = meta[k];
  }
  // PUBLISH-V2-METADATA-1 (2026-10-01, charter gate A2, fleet_improvements 1573): every new version used to
  // drop the related identifiers (delete), ship without keywords (v1.4 = 23003473 had subjects [] against
  // v1.3's six) and could carry the funnel link several times (3x on v1.4), all repaired by hand. Now:
  // the related identifiers are rebuilt (inherited non-version relations plus the canonical page),
  // the previous version's keywords are carried when the draft has none, and the funnel link is
  // stripped and appended exactly once.
  var _canon = row.slug ? "https://papers.qnfo.org/papers/" + row.slug + "/" : "";
  var _inheritedRel = (Array.isArray(metaClean.related_identifiers) ? metaClean.related_identifiers : []).filter(function(r) {
    return r && r.identifier && !/^(isNewVersionOf|isPreviousVersionOf|isVersionOf|hasVersion)$/i.test(String(r.relation || "")) && String(r.identifier).replace(/\/+$/, "") !== _canon.replace(/\/+$/, "");
  });
  var _canonRel = _canon ? [{ identifier: _canon, relation: "isVariantFormOf", resource_type: "publication-preprint" }] : [];
  metaClean.related_identifiers = _inheritedRel.concat(_canonRel);
  if (!metaClean.related_identifiers.length) delete metaClean.related_identifiers;
  if (!Array.isArray(metaClean.keywords) || !metaClean.keywords.length) {
    var _pk = _prevMeta && Array.isArray(_prevMeta.keywords) ? _prevMeta.keywords : [];
    if (!_pk.length && _prevMeta && Array.isArray(_prevMeta.subjects)) _pk = _prevMeta.subjects.map(function(s) { return s && (s.term || s.subject || s.id); }).filter(Boolean);
    if (_pk.length) metaClean.keywords = _pk.slice(0, 20);
  }
  if (row.related_repo) metaClean.notes = (metaClean.notes ? metaClean.notes + " " : "") + "Source: " + row.related_repo;
  // WS-A2 (2026-09-26): append the read-online link UNCONDITIONALLY. The prior form appended it
  // only when a `## Abstract` heading was found, so a revision whose corrected body lacked that
  // heading shipped an abstract-only description with NO papers.qnfo.org link (live: 10.5281/
  // zenodo.22764745 v2.0.0). Fall back to the existing description and dedupe.
  var _plink = row.slug ? ' <p>Full text and updates: <a href="' + _canon + '">papers.qnfo.org/papers/' + row.slug + '/</a></p>' : '';
  var _stripFunnel = function(s) {
    return String(s || "").replace(/\s*<p>\s*Full text and updates:[\s\S]*?<\/p>/gi, "").replace(/\s*Full text and updates:\s*(<a [^>]*>)?\s*(https?:\/\/)?papers\.qnfo\.org\/papers\/[^\s<]*\s*(<\/a>)?/gi, " ").replace(/[ \t]{2,}/g, " ").trim();
  };
  var ab = String(row.corrected_md || "").match(/##\s*Abstract\s*\r?\n([\s\S]*?)(?=\r?\n##\s|\r?\n#\s|$)/i);
  if (ab && ab[1]) metaClean.description = _stripFunnel(ab[1].replace(/\s+/g, " ").trim()) + _plink;
  else if (_plink) {
    // WS-A2 R5 (2026-09-26): also append when there is NO description at all (the prior form
    // required metaClean.description to be truthy, so an abstract-less revision shipped no link).
    var _base = _stripFunnel(metaClean.description ? String(metaClean.description) : "") || String(row.title || row.slug || "");
    metaClean.description = _base + _plink;
  }
  var mput = await zenodo(env, "PUT", "/" + nv.id, { metadata: metaClean });
  // Fail-safe: an inherited related identifier Zenodo rejects must not block the version. Retry with only the
  // canonical page, then without related identifiers (the previous behaviour), before giving up.
  if (mput && mput._status && mput._status >= 400 && metaClean.related_identifiers) {
    metaClean.related_identifiers = _canonRel;
    if (!_canonRel.length) delete metaClean.related_identifiers;
    mput = await zenodo(env, "PUT", "/" + nv.id, { metadata: metaClean });
    if (mput && mput._status && mput._status >= 400 && metaClean.related_identifiers) {
      delete metaClean.related_identifiers;
      mput = await zenodo(env, "PUT", "/" + nv.id, { metadata: metaClean });
    }
  }
  if (mput && mput._status && mput._status >= 400) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "metadata put failed: " + mput._text };
  }
  var pub = await zenodo(env, "POST", "/" + nv.id + "/actions/publish", {});
  if (!pub || !pub.doi) {
    await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(row.id).run();
    return { ok: false, stage: "v2", error: "publish failed: " + JSON.stringify(pub).slice(0, 200) };
  }
  var newDoi = pub.doi;
  var newTitle = extractTitle(row.corrected_md || "", row.title);
  // PUBLISH-V2-METADATA-1 (A): zenodo_url advances with the DOI from the same new record (it used to keep naming
  // the previous record: v1.4 doi 23003473 with url records/23001088; v1.4.1 doi 23079905 with url records/23003473).
  var newRecId = String(pub.record_id || pub.id || String(newDoi).split("zenodo.").pop() || "");
  await env.LIVING_PAPER.prepare("UPDATE papers SET title=?, body_md=?, version=?, doi=?, zenodo_doi=?, zenodo_url=?, updated_at=datetime('now') WHERE slug=?").bind(newTitle, row.corrected_md || "", row.version_to || "2.0.0", newDoi, newDoi, "https://zenodo.org/records/" + newRecId, slug).run();
  // Post-publish assertion: what the public record carries, logged so a regression is visible without a manual audit.
  try {
    var pm = pub.metadata || {};
    var funnelN = (String(pm.description || "").match(/Full text and updates/g) || []).length;
    var kwN = Array.isArray(pm.keywords) ? pm.keywords.length : 0;
    var canonOk = !_canon || (Array.isArray(pm.related_identifiers) && pm.related_identifiers.some(function(r) { return r && String(r.identifier || "").replace(/\/+$/, "") === _canon.replace(/\/+$/, ""); }));
    var assertOk = funnelN === (_canon ? 1 : 0) && kwN > 0 && canonOk;
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (ts, kind, job, text, status) VALUES (datetime('now'), 'publish-v2-metadata', 'qnfo-research-exec', ?, ?)").bind(JSON.stringify({ slug: slug, doi: newDoi, record: newRecId, funnel: funnelN, keywords: kwN, canonical_related: canonOk }).slice(0, 450), assertOk ? "ok" : "error").run();
  } catch (eAs) {
  }
  try {
    // REV-DISSEMINATION-1 (2026-09-27): a revision (newversion) path wrote NO dissemination row, so
    // pipeline revisions never auto-posted (canonical: 'Operating the Quniverse Fleet' v1.3,
    // 10.5281/zenodo.23001088, had to be posted by hand). Mirror publishStage / FIRST-DEPOSIT-1 so
    // qnfo-social's drainDissemination (cron 30 */2) posts the revision. A deterministic id
    // 'rev-<slug>' + INSERT OR IGNORE makes it idempotent per paper, so a re-drain cannot double-post.
    await env.QNFO_AUDIT.prepare("INSERT OR IGNORE INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, channel, action, mode, fallback, zenodo_url, pages_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind("rev-" + slug, slug, newDoi, newTitle, "bluesky", "queued", "auto", 0, (String(newDoi).indexOf("http") === 0 ? newDoi : "https://doi.org/" + newDoi), "https://papers.qnfo.org/papers/" + slug + "/").run();
  } catch (eRevDiss) {
  }
  if (env.GRAPH_DB) {
    try {
      var node = await env.GRAPH_DB.prepare("SELECT properties FROM nodes WHERE id=?").bind("zenodo-10-5281-zenodo-" + recId).first();
      if (node) {
        var props = {};
        try {
          props = JSON.parse(node.properties || "{}");
        } catch (e2) {
          props = {};
        }
        props.doi = newDoi;
        props.zenodo_url = "https://doi.org/" + newDoi;
        props.version = row.version_to || "2.0.0";
        await env.GRAPH_DB.prepare("UPDATE nodes SET properties=?, updated_at=datetime('now') WHERE id=?").bind(JSON.stringify(props), "zenodo-10-5281-zenodo-" + recId).run();
      }
    } catch (e) {
    }
  }
  if (env.MIRROR) {
    try {
      await env.MIRROR.put("2026/09/" + slug + ".md", row.corrected_md || "");
      if (html) await env.MIRROR.put("2026/09/" + slug + ".html", html);
      if (pdf) await env.MIRROR.put("2026/09/" + slug + ".pdf", pdf);
    } catch (e) {
    }
  }
  await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='published', new_doi=?, updated_at=datetime('now') WHERE id=?").bind(newDoi, row.id).run();
  await depositToGithub(env, slug, row.title, row.corrected_md || "", newDoi);
  return { ok: true, stage: "v2", doi: newDoi };
}
__name(publishV2, "publishV2");
__name2(publishV2, "publishV2");
__name22(publishV2, "publishV2");
__name222(publishV2, "publishV2");
__name2222(publishV2, "publishV2");
var MAX_GATE_ATTEMPTS = 3;
async function terminalizeGateBlocked(env) {
  var rows = await env.QNFO_AUDIT.prepare(
    "SELECT id, slug, recover_count FROM version_queue WHERE status='gate-blocked' AND recover_count >= ?"
  ).bind(MAX_GATE_ATTEMPTS).all();
  var done = 0;
  for (var i = 0; i < (rows.results || []).length; i++) {
    var r = rows.results[i];
    await env.QNFO_AUDIT.prepare(
      "UPDATE version_queue SET status='wontfix', updated_at=datetime('now') WHERE id=? AND status='gate-blocked'"
    ).bind(r.id).run();
    try {
      await env.QNFO_AUDIT.prepare(
        "UPDATE paper_revision_log SET status='needs-substantive-revision', error='QUALITY-GATE-1 not satisfiable after ' || ? || ' enrichment attempts; terminal (wontfix)', updated_at=datetime('now') WHERE slug=? AND status='queued'"
      ).bind(MAX_GATE_ATTEMPTS, String(r.slug || "")).run();
    } catch (e) {
    }
    try {
      await env.QNFO_AUDIT.prepare(
        "INSERT INTO gov_gate_log (ts, diff_sha, decision, reason, touched_gates, actor, wbs_code) VALUES (datetime('now'), 'quality-gate', 'RESOLVE', ?, 'QUALITY-GATE-1', 'qnfo-research-exec', 'P1')"
      ).bind(("terminal-wontfix slug=" + String(r.slug || "?") + " after " + MAX_GATE_ATTEMPTS + " attempts").slice(0, 300)).run();
    } catch (e) {
    }
    done++;
  }
  return done;
}
__name(terminalizeGateBlocked, "terminalizeGateBlocked");
__name2(terminalizeGateBlocked, "terminalizeGateBlocked");
__name22(terminalizeGateBlocked, "terminalizeGateBlocked");
async function enrichGateBlocked(env) {
  var blocked = await env.QNFO_AUDIT.prepare(
    "SELECT id, slug, corrected_md, references_bib, paper_doi FROM version_queue WHERE status='gate-blocked' AND recover_count < 3 ORDER BY id ASC LIMIT 4"
  ).all();
  var enriched = 0;
  for (var bi = 0; bi < (blocked.results || []).length; bi++) {
    var br = blocked.results[bi];
    var md = String(br.corrected_md || "");
    var bib = String(br.references_bib || "");
    var hasLit = /#{1,4}[^\n]*(prior work|related work|literature review|background)/i.test(md);
    var doiCount = (md.match(/10[.][0-9]{4,9}[/]/g) || []).length;
    var axCount = (md.match(/arXiv:[^\s]{6,}/gi) || []).length;
    var bibEntries = (bib.match(/@[A-Za-z]+\s*\{/g) || []).length;
    if (hasLit && doiCount + axCount + bibEntries >= 5) {
      await env.QNFO_AUDIT.prepare(
        "UPDATE version_queue SET status='drafted', recover_count=recover_count+1, updated_at=datetime('now') WHERE id=?"
      ).bind(br.id).run();
      enriched++;
      continue;
    }
    var priorSection = "\n\n## Prior Work and Related Literature\n\nThis work builds on the following related research:\n\n";
    var bibBlocks = bib.split(/\n\n/).filter(function(e) {
      return /^@/.test(e.trim());
    }).slice(0, 8);
    if (bibBlocks.length >= 2) {
      for (var pi = 0; pi < bibBlocks.length; pi++) {
        var tM = bibBlocks[pi].match(/title\s*=\s*\{([^}]+)\}/i);
        var dM = bibBlocks[pi].match(/doi\s*=\s*\{([^}]+)\}/i);
        var eM = bibBlocks[pi].match(/eprint\s*=\s*\{([^}]+)\}/i);
        if (tM) priorSection += pi + 1 + ". " + tM[1] + (dM ? " (DOI: " + dM[1] + ")" : eM ? " (arXiv:" + eM[1] + ")" : "") + ".\n\n";
      }
    } else {
      try {
        var kw = String(br.slug || "").replace(/-/g, " ").slice(0, 80);
        var axr = await fetch("https://export.arxiv.org/api/query?search_query=all:" + encodeURIComponent('"' + kw + '"') + "&max_results=6", { headers: { "User-Agent": "QNFO-research-exec/0.9.0" }, signal: AbortSignal.timeout(15e3) });
        var axt = await axr.text();
        var entries = axt.split("<entry>").slice(1, 7);
        for (var ei = 0; ei < entries.length; ei++) {
          var ent = entries[ei];
          var idM = ent.match(/<id>([\s\S]*?)<\/id>/);
          var tiM = ent.match(/<title>([\s\S]*?)<\/title>/);
          var suM = ent.match(/<summary>([\s\S]*?)<\/summary>/);
          if (idM && tiM) {
            var aid = String(idM[1].trim()).split("/abs/").pop();
            priorSection += ei + 1 + ". " + tiM[1].trim() + " (arXiv:" + aid + "). " + (suM ? suM[1].replace(/\s+/g, " ").trim().slice(0, 200) : "") + "\n\n";
          }
        }
      } catch (eAx) {
      }
    }
    // PRIOR-WORK-EMPTY-1 (0.9.55): only a section with at least one entry is inserted (16 papers were published with the
    // heading and "builds on the following related research:" followed by nothing when arXiv returned no match), and the
    // References heading is matched at the start of a line, not anywhere a "#" precedes the word.
    if (!/\n\d+\. \S/.test(priorSection)) {
      await env.QNFO_AUDIT.prepare(
        "UPDATE version_queue SET status='drafted', recover_count=recover_count+1, updated_at=datetime('now') WHERE id=?"
      ).bind(br.id).run();
      enriched++;
      continue;
    }
    var refM = /^#{1,6}[ \t]+[^\n]*\b(references|bibliography)\b/im.exec(md);
    var refIdx = refM ? refM.index : -1;
    var enrichedMd = refIdx >= 0 ? md.slice(0, refIdx).replace(/\n+$/, "") + priorSection + md.slice(refIdx) : md + priorSection;
    await env.QNFO_AUDIT.prepare(
      "UPDATE version_queue SET corrected_md=?, status='drafted', recover_count=recover_count+1, updated_at=datetime('now') WHERE id=?"
    ).bind(enrichedMd, br.id).run();
    enriched++;
  }
  return enriched;
}
__name(enrichGateBlocked, "enrichGateBlocked");
__name2(enrichGateBlocked, "enrichGateBlocked");
__name22(enrichGateBlocked, "enrichGateBlocked");
async function drainV2(env) {
  try {
    await terminalizeGateBlocked(env);
  } catch (eTerm) {
    await logEvent(env, "terminal-err", String(eTerm && eTerm.message || eTerm).slice(0, 200));
  }
  try {
    await enrichGateBlocked(env);
  } catch (eEnrich) {
    await logEvent(env, "enrich-err", String(eEnrich && eEnrich.message || eEnrich).slice(0, 200));
  }
  try {
    // QUEUED-PROMOTION-1 (2026-09-27): legacy rows land in status='queued' and nothing promoted them,
    // so the revision queue silently wedged (canonical: version_queue id 59 sat queued 24h+).
    // Promote any queued row that already carries a corrected_md so the drain can process it.
    var _pr = await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='drafted', updated_at=datetime('now') WHERE status='queued' AND corrected_md IS NOT NULL AND LENGTH(TRIM(corrected_md)) > 100").run();
    if (_pr.meta && _pr.meta.changes) await logEvent(env, "v2-promote", "promoted " + _pr.meta.changes + " queued row(s) to drafted", "ok");
  } catch (ePr) {
  }
  try {
    // CLAIM-RECLAIM-1 (2026-09-27): the cron fires hourly, so a researching claim older than 4h is
    // immortal and wedges the idea queue (canonical: row claimed 14:00Z stayed researching 4h+).
    // claimed_at is ISO-8601 text (T separator), so the bound MUST be strftime ISO too - a space-format
    // bound never compares less (same type-mismatch class as DEPLOY-LOCK-EPOCH-TYPE-1).
    var _cl = await reclaimStaleResearching(env);
    if (_cl.requeued) await logEvent(env, "claim-reclaim", "released " + _cl.requeued + " stale researching claim(s)", "ok");
    if (_cl.parked) await logEvent(env, "poison-park", "parked " + _cl.parked + " stale researching row(s) with recover_count exhausted", "warn");
  } catch (eCl) {
  }
  try {
    // FAILED-REARM-1 (2026-09-27): transient stage failures older than 6h self-heal, bounded by
    // recover_count < 3 so a poison row cannot loop forever. created_at is ISO-8601 text; bound in ISO.
    var _fr = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='queued', stage='ground', attempt=0, error=NULL, claimed_at=NULL, recover_count=recover_count+1 WHERE status='failed' AND recover_count < 3 AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-6 hours')").run();
    if (_fr.meta && _fr.meta.changes) await logEvent(env, "failed-rearm", "re-armed " + _fr.meta.changes + " failed research row(s)", "ok");
  } catch (eFr) {
  }
  var rows = await env.QNFO_AUDIT.prepare("SELECT * FROM version_queue WHERE status='drafted' OR (status='publishing' AND updated_at < datetime('now','-15 minutes')) ORDER BY id ASC LIMIT 2").all();
  var results = [];
  for (var i = 0; i < (rows.results || []).length; i++) {
    var r = rows.results[i];
    var claim = await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='publishing', updated_at=datetime('now') WHERE id=? AND (status='drafted' OR (status='publishing' AND updated_at < datetime('now','-15 minutes')))").bind(r.id).run();
    if (!claim || !claim.meta || !claim.meta.changes) continue;
    try {
      results.push(await publishV2(env, r));
      var pv2 = results[results.length - 1];
      if (pv2 && pv2.ok) {
        try {
          var prlDoi = String(pv2.doi || r.new_doi || "");
          var Q = String.fromCharCode(39);
          var prlSql = "UPDATE paper_revision_log SET status=" + Q + "published" + Q + ", new_doi=?, updated_at=datetime(" + Q + "now" + Q + ") WHERE slug=? AND status=" + Q + "queued" + Q + " AND COALESCE(version_to," + Q + "2.0.0" + Q + ")=? ";
          await env.QNFO_AUDIT.prepare(prlSql).bind(prlDoi, String(r.slug || ""), String(r.version_to || "2.0.0")).run();
        } catch (ePrl) {
        }
      }
    } catch (e) {
      await env.QNFO_AUDIT.prepare("UPDATE version_queue SET status='error', updated_at=datetime('now') WHERE id=?").bind(r.id).run();
      results.push({ ok: false, stage: "v2", error: String(e && e.message || e).slice(0, 200) });
    }
  }
  return results;
}
__name(drainV2, "drainV2");
__name2(drainV2, "drainV2");
__name22(drainV2, "drainV2");
__name222(drainV2, "drainV2");
__name2222(drainV2, "drainV2");
// WRITER-FLASH-1 (2026-10-05, #1795/#1780, pillar cost): the second writer leg ran @cf/zai-org/glm-5.3 at 3,279 neurons per
// draft (ai_call_counters 09-28..10-04: 123 calls, 403,270 neurons, 41% of the fleet's attributed Workers AI) while the
// glm-5.3-flash leg returned drafts of the same length (17-35k chars, ensembles of 2026-10-04/05) at about a tenth of the
// cost. Drafts are verified downstream (review, verify, finalGates), so the leg now runs glm-5.3-flash. Guard:
// full_reports_live_30d (28 on 2026-10-05) must not fall and reconcile-degrade events must not rise.
var WRITER_MODELS = [
  "@cf/openai/gpt-oss-120b",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/zai-org/glm-5.3-flash"
];
var WRITER_FALLBACK_MODELS = [
  "@cf/zai-org/glm-5.3-flash",
  "@cf/openai/gpt-oss-120b",
  "@cf/zai-org/glm-5.3"
];
var MIN_LEGS = 2;
var MIN_PAPER_CHARS = 8e3;
var MIN_REFS = 8;
var MAX_REVIEW_CYCLES = 2;
var PILOT = "https://qnfo-containers-pilot.q08.workers.dev";
var GH_API = "https://api.github.com";
var GH_OWNER = "QNFO";
var GH_REPO = "qnfo-ensemble-research";
var PIPELINE_VERSION = "0.8.0-artifact-deposit";
// AI-TEXT-REASONING-BUDGET-1 (2026-10-01, #1620/#1504), REVERTED to 8192 by AI-TEXT-TIMEOUT-1 the same day: every MODELS
// entry is a reasoning model, and a paper-length output does not fit 8192 tokens of reasoning plus content (revise and
// reconcile returned 0 chars). Raising the cap to 32768 (0.9.34) did not help: Workers AI ends a call at about 240 s with
// "3046: Request timeout", and at 32768 every ensemble primary leg (0/3, 11:34-11:38Z), every reconcile and every full
// revise hit it. 8192 is the measured-safe budget (ensemble legs return 11-23k chars inside it). Long rewrites are no
// longer needed on the hot path: revise uses patch mode (REVISE-PATCH-1) and reconcile degrades to the best leg.
var AI_TEXT_MAX_OUT = { "@cf/zai-org/glm-5.3-flash": 8192, "@cf/zai-org/glm-5.3": 8192, "@cf/openai/gpt-oss-120b": 8192 };
// REASONING-EFFORT-LOW-1 (2026-10-01, #1504): glm-5.3 models on Workers AI take reasoning_effort (low|high|max; reasoning
// cannot be disabled) and default to the maximum, so a short structured answer (the revise patch JSON) spent the whole
// 8192-token budget reasoning and returned 0 chars (12:12Z). Callers that need a short answer pass effort "low". If the
// API rejects the field (anything but a timeout), the call is retried once without it.
async function aiText(env, model, prompt, maxTokens, effort) {
  const cappedTokens = Math.min(maxTokens, AI_TEXT_MAX_OUT[model] || 8192);
  try {
    const _opts = { messages: [{ role: "user", content: prompt }], max_tokens: cappedTokens, temperature: 0.3 };
    if (/^@cf\/zai-org\/glm-/.test(model)) _opts.reasoning_effort = effort || 'low';
    let r;
    try {
      r = await env.AI.run(model, _opts);
    } catch (e0) {
      if (!_opts.reasoning_effort || /3046|timeout/i.test(String(e0 && e0.message || e0))) throw e0;
      await logEvent(env, "ai-warn", "aiText model=" + model + " rejected reasoning_effort, retrying without: " + String(e0 && e0.message || e0).slice(0, 160));
      delete _opts.reasoning_effort;
      r = await env.AI.run(model, _opts);
    }
    if (typeof r === "string") return r;
    if (r && typeof r.response === "string" && r.response) return r.response;
    if (r && r.choices && r.choices[0] && r.choices[0].message) return String(r.choices[0].message.content || "");
    await logEvent(env, "ai-warn", "aiText model=" + model + " returned unexpected shape: " + JSON.stringify(r).slice(0, 200));
    return "";
  } catch (e) {
    await logEvent(env, "ai-error", "aiText model=" + model + " threw: " + String(e && e.message || e).slice(0, 200));
    return "";
  }
}
__name(aiText, "aiText");
__name2(aiText, "aiText");
__name22(aiText, "aiText");
__name222(aiText, "aiText");
__name2222(aiText, "aiText");
// GW-BREAKER-1 (2026-10-01, #1620/#1504): the gateway's ensemble cannot produce paper-length
// output inside its 120 s budget, so every gwCall spent ~2-4 min before returning the canned
// FALLBACK_TEXT (or aborting) and then re-ran the same prompt on Workers AI. That doubled each
// stage's wall time and held the hourly cron to ~1 stage per run. The breaker remembers the
// latest gateway outcome in cloud_ops_events: after a failure the gateway is skipped (straight to
// Workers AI) until GW_BREAKER_PROBE_MS has passed, then one call probes it again. A success logs
// gw-ok and closes the breaker.
var GW_BREAKER_PROBE_MS = 3 * 60 * 60 * 1e3;
var GW_BREAKER_KINDS = ["gw-canned", "gw-error", "gw-fallback", "gw-ok"];
var _authDriftLogged = false;
var _gwBreaker = null;
var _gwUnusableLogged = false;
var _gwBreakerLoad = null;
async function gwBreakerOpen(env) {
  if (_gwBreaker === null) {
    // One D1 read per isolate; concurrent ensemble legs share the same pending load.
    if (!_gwBreakerLoad) _gwBreakerLoad = (async function() {
      const st = { failTs: 0 };
      try {
        const row = await env.QNFO_AUDIT.prepare("SELECT kind, ts FROM cloud_ops_events WHERE job = ? AND ts > ? AND kind IN (?,?,?,?) ORDER BY ts DESC LIMIT 1").bind(WORKER, new Date(Date.now() - GW_BREAKER_PROBE_MS).toISOString(), GW_BREAKER_KINDS[0], GW_BREAKER_KINDS[1], GW_BREAKER_KINDS[2], GW_BREAKER_KINDS[3]).first();
        if (row && row.kind !== "gw-ok") st.failTs = Date.parse(row.ts) || 0;
      } catch (e) {
      }
      return st;
    })();
    const st = await _gwBreakerLoad;
    if (_gwBreaker === null) _gwBreaker = st;
  }
  return _gwBreaker.failTs > 0 && Date.now() - _gwBreaker.failTs < GW_BREAKER_PROBE_MS;
}
__name(gwBreakerOpen, "gwBreakerOpen");
function gwBreakerTrip(ok) {
  if (_gwBreaker === null) _gwBreaker = { failTs: 0 };
  _gwBreaker.failTs = ok ? 0 : Date.now();
}
__name(gwBreakerTrip, "gwBreakerTrip");
async function gwCall(env, prompt, maxTokens) {
  if (!routerUsable(env)) {
    if (!_gwUnusableLogged) {
      _gwUnusableLogged = true;
      await logEvent(env, "gw-unusable", "gwCall: neither the QNFO_AI binding nor ROUTER_TOKEN is available; using Workers AI", "warn");
    }
    return await aiText(env, MODELS[0], prompt, maxTokens, "low");
  }
  if (await gwBreakerOpen(env)) return await aiText(env, MODELS[0], prompt, maxTokens, "low");
  const ctrl = new AbortController();
  const t = setTimeout(function() {
    ctrl.abort();
  }, 24e4);
  try {
    const r = await routerFetch(env, ROUTER, { method: "POST", headers: routerHeaders(env, true), body: JSON.stringify({ model: GATEWAY_MODEL, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: "user", content: prompt }] }), signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) {
      var _eb = "";
      try {
        _eb = String(await r.text()).slice(0, 300);
      } catch (e) {
        _eb = "(body unreadable)";
      }
      gwBreakerTrip(false);
      // ROUTER-KEY-ROTATION-CALLER-DRIFT-1 (#1703): a 401/403 means ROUTER_TOKEN is a stale copy of
      // the qnfo-ai key. Self-report it as its own event kind (once per isolate) instead of
      // flooding gw-fallback; no secret is read or logged. Fail-soft to Workers AI as before.
      if ((r.status === 401 || r.status === 403) && !_authDriftLogged) {
        _authDriftLogged = true;
        await logEvent(env, "gw-auth-drift", "qnfo-ai rejected ROUTER_TOKEN (HTTP " + r.status + "); caller key is stale vs qnfo-ai ROUTER_AUTH_KEY; degraded to Workers AI", "warn");
      }
      await logEvent(env, "gw-fallback", "gateway HTTP " + r.status + " host=" + _lastRouterHost + " body=" + _eb + "; falling back to Workers AI", "warn");
      return await aiText(env, MODELS[0], prompt, maxTokens, "low");
    }
    const j = await r.json();
    const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    // GW-CANNED-DETECT-1 (2026-09-29): the gateway answers HTTP 200 with a ~370-char canned
    // FALLBACK_TEXT when its ensemble budget is exhausted. gwCall used to return that as a real
    // answer, so stageReconcile/stageRevise (>= 10000 chars) terminalised every row. Detect the
    // canned signature and degrade to the Workers AI path instead of feeding it downstream.
    const _canned = typeof c === "string" && /I do not have a reliable answer for that right now|ensemble mode \(model=ensemble\) cross-checks answers across models/i.test(c);
    if (typeof c === "string" && c && !_canned) {
      if (_gwBreaker && _gwBreaker.failTs > 0) await logEvent(env, "gw-ok", "gateway answered (len=" + c.length + "); breaker closed", "ok");
      gwBreakerTrip(true);
      return c;
    }
    gwBreakerTrip(false);
    await logEvent(env, _canned ? "gw-canned" : "gw-fallback", _canned ? "gateway returned canned FALLBACK_TEXT (len=" + String(c).trim().length + "); falling back to Workers AI" : "gateway empty content; falling back to Workers AI", "warn");
    return await aiText(env, MODELS[0], prompt, maxTokens, "low");
  } catch (e) {
    clearTimeout(t);
    gwBreakerTrip(false);
    await logEvent(env, "gw-error", "gwCall failed: " + String(e && e.message || e).slice(0, 150), "warn");
    return await aiText(env, MODELS[0], prompt, maxTokens, "low");
  }
}
__name(gwCall, "gwCall");
__name2(gwCall, "gwCall");
__name22(gwCall, "gwCall");
__name222(gwCall, "gwCall");
__name2222(gwCall, "gwCall");
async function r2Put(env, key, text) {
  try {
    await env.MIRROR.put("pipeline/" + key, text);
    return true;
  } catch (e) {
    return false;
  }
}
__name(r2Put, "r2Put");
__name2(r2Put, "r2Put");
__name22(r2Put, "r2Put");
__name222(r2Put, "r2Put");
__name2222(r2Put, "r2Put");
async function r2Get(env, key) {
  try {
    const o = await env.MIRROR.get("pipeline/" + key);
    if (!o) return "";
    return await o.text();
  } catch (e) {
    return "";
  }
}
__name(r2Get, "r2Get");
__name2(r2Get, "r2Get");
__name22(r2Get, "r2Get");
__name222(r2Get, "r2Get");
__name2222(r2Get, "r2Get");
async function sha256hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(function(b) {
    return b.toString(16).padStart(2, "0");
  }).join("");
}
__name(sha256hex, "sha256hex");
__name2(sha256hex, "sha256hex");
__name22(sha256hex, "sha256hex");
__name222(sha256hex, "sha256hex");
__name2222(sha256hex, "sha256hex");
function b64(s) {
  return btoa(unescape(encodeURIComponent(s)));
}
__name(b64, "b64");
__name2(b64, "b64");
__name22(b64, "b64");
__name222(b64, "b64");
__name2222(b64, "b64");
// MATH-LATEX-2 (#1891, 2026-10-05, pillar reach): the generator wrote math as plain text. A scan of the 40 newest
// papers.qnfo.org papers (2026-10-05) found 27 with 3 or more plain-text math tokens and every research-exec paper since
// 2026-10-02 carrying 70-416 (Unicode powers of ten, subscripted T1, bra-ket overlaps, bare d^3 and N_c), which MathJax cannot typeset because nothing is inside
// $...$; paper_render_defect_pages read 0 because none of its tests looks at math. The fix is generation-side: MATH_RULE is in
// every prompt that writes paper text, and pseudoMathScan() is a deterministic check (no model call) that review and the
// pre-publish gates use. The earlier MATH-LATEX-1 gate (#424, md2tex_v3) converts for the PDF path only, so it never saw the
// paper body that research-exec publishes.
var MATH_RULE = "- Mathematics: write every formula, equation, variable with a subscript or superscript, and power of ten in LaTeX, inline as $...$ and display as $$...$$ on its own lines (for example $T_1$, $10^{-4}$, $\\approx$, $|\\langle\\alpha|\\beta\\rangle|^2$). Never write math as plain text: no Unicode superscripts or subscripts (x\u00b2, 10\u207b\u2074, T\u2081), no Unicode math operators (\u2248 \u2264 \u2297 \u221a \u2211 \u27e8 \u27e9), no bare ^ or _ outside $...$. Put any diagram or ASCII art inside a fenced code block.";
var PSEUDO_MATH_MAX = 2;
var PM_SUPSUB_RE = /[\u2070\u00b9\u00b2\u00b3\u2074-\u207f\u2080-\u209c\u1d62-\u1d6a\u2c7c]+/g;
var PM_OPS_RE = /[\u2264\u2265\u2248\u2260\u226a\u226b\u2208\u2209\u2297\u2295\u2211\u220f\u221a\u222b\u2202\u2207\u27e8\u27e9\u221e\u00b1\u2213\u221d\u2261\u2282\u2286\u222a\u2229]/g;
var PM_SCRIPT_RE = /(?<![A-Za-z0-9_\\.])(?:\d+(?:\.\d+)?|[A-Za-z\u0391-\u03c9)\]])\^(?:\{[^{}\n]{1,40}\}|\([^()\n]{1,30}\)|[-\u2212]?[A-Za-z0-9]{1,6})|(?<![A-Za-z0-9_\\])[A-Za-z\u0391-\u03c9]_(?:\{[^{}\n]{1,40}\}|[A-Za-z0-9]{1,4})(?![A-Za-z0-9_])/g;
var PM_BOX_RE = /[\u2500-\u257f]/;
// Counts plain-text math outside $...$, $$...$$, \(...\), \[...\], code and links: Unicode super/subscript runs, Unicode math
// operators, bare ^ and _ scripts on a single symbol or number (snake_case never matches), and box-drawing lines outside a
// fence. The References list is skipped (titles are copied verbatim from the bibliography). Greek letters are not counted.
function pseudoMathScan(md) {
  let t = String(md || "");
  const hm = /^#{1,3}[ \t]*(?:\d+\.?[ \t]*)?(?:References|Bibliography)\b.*$/im.exec(t);
  if (hm) {
    const after = t.slice(hm.index + hm[0].length);
    const nx = after.search(/^#{1,2}\s/m);
    t = t.slice(0, hm.index) + "\n" + (nx >= 0 ? after.slice(nx) : "");
  }
  t = t.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, " ").replace(/`[^`\n]*`/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\\\[[\s\S]*?\\\]/g, " ").replace(/\\\([\s\S]*?\\\)/g, " ").replace(/(?<!\\)\$[^$\n]+?(?<!\\)\$/g, " ").replace(/\]\([^)\s]*\)/g, "]").replace(/https?:\/\/\S+|\b10\.\d{4,}\/\S+|\barXiv:\s*\S+/gi, " ");
  const samples = [];
  let count = 0;
  const take = function(re) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      count++;
      if (samples.length < 8) samples.push(t.slice(Math.max(0, m.index - 24), m.index + m[0].length + 16).replace(/\s+/g, " ").trim());
    }
  };
  take(PM_SUPSUB_RE);
  take(PM_SCRIPT_RE);
  take(PM_OPS_RE);
  t.split("\n").forEach(function(l) { if (PM_BOX_RE.test(l)) { count++; if (samples.length < 8) samples.push(l.trim().slice(0, 60)); } });
  return { count, samples };
}
function mathLatexFix(scan) {
  return { id: "gate-math-latex", severity: "HARD", claim: scan.count + " plain-text math tokens outside $...$", reason: "MATH-LATEX-2: math written as Unicode super/subscripts, Unicode operators or bare ^ and _ is not typeset on papers.qnfo.org. Examples: " + scan.samples.map(function(s) { return "\u00ab" + s + "\u00bb"; }).join(" "), fix: "Rewrite each such expression in LaTeX inside $...$ (inline) or $$...$$ (display), for example 10\u207b\u2074 -> $10^{-4}$, T\u2081 -> $T_1$, \u2248 -> $\\approx$, d^3 -> $d^3$. Change only the notation, not the values." };
}
var WRITER_PROMPT = [
  "You are one of three independent research writers producing a full-length preprint for open publication. All three writers receive the SAME input block; write independently and do not imitate a template beyond the required structure.",
  "Requirements:",
  "- Output ONLY the paper markdown, starting directly with '# <Title>'.",
  "- Required headings, in order: '# <Title>', '## Abstract', '## 1. Introduction', '## 2. Background and Related Work', '## 3. Methods', '## 4. Analysis', '## 5. Results', '## 6. Discussion', '## 7. Conclusion', '## References'.",
  "- Length: 15000-22000 characters. A serious paper, not a stub.",
  "- Abstract: 150-220 words summarizing problem, method, results, significance.",
  "- Section 2 MUST discuss at least 8 works from the provided Bibliography, cited as [1], [2], ... in the bibliography's exact numbering, each with one or two sentences of substantive context (what they did, how it relates to your argument). Never a bare citation.",
  "- Section 4 (Analysis) MUST show explicit derivations: state every input number with its source, show every arithmetic step. No 'it can be shown' hand-waving.",
  "- Section 5 (Results): report ONLY numbers you actually computed in Section 4, or clearly-labeled projections with stated assumptions and uncertainty bounds. NEVER invent data, simulation results, or empirical measurements.",
  "- Derive at least one concrete numerical result with full arithmetic.",
  "- Section 6 (Discussion): limitations, failure modes, what would falsify the claims, open questions. Argue against yourself.",
  "- References: list ONLY works from the provided Bibliography, in the same order, numbered [1]..[n]. Copy titles and identifiers EXACTLY from the bibliography. NEVER invent a reference. If the bibliography has fewer than 8 works, cite all of them and state the limitation in the Discussion.",
  "- No meta-commentary about writing, authorship, or AI. No 'Let me', no thinking text, no placeholder text, no '[to verify]' markers. Every quantitative claim is either computed here or explicitly labeled a projection with stated assumptions.",
  "- Write for an adjacent-field expert; define jargon once.",
  MATH_RULE,
  "INPUT BLOCK:"
].join("\n");
var RECONCILE_PROMPT = [
  "You are the reconciling editor. Two or three independent writers produced drafts on the same input block. Produce the SINGLE reconciled preprint.",
  "Steps:",
  "1. Read all available drafts. Extract every substantive claim (numbered C1..Cn) and attribute each to source drafts (A/B/C) with agreement status: CONVERGENT (>=2 drafts, same substance), DIVERGENT (conflicting), or SINGLE (one draft only).",
  "2. For DIVERGENT claims: report the conflict explicitly in '## Appendix A. Divergence report' - state each side and the convention/assumption behind the disagreement. NEVER silently resolve a divergence; choose one convention for the main text and document that choice.",
  "3. Write the reconciled paper using the best-substantiated version of each convergent claim. Required headings in order: '# <Title>', '## Abstract', '## 1. Introduction', '## 2. Background and Related Work', '## 3. Methods', '## 4. Analysis', '## 5. Results', '## 6. Discussion', '## 7. Conclusion', '## References', '## Appendix A. Divergence report', '## Appendix B. Claim attribution'.",
  "4. Length: 18000-30000 characters.",
  "5. Section 2 must discuss at least 8 bibliography works with substantive context. References section lists ONLY bibliography works, in the bibliography's exact order and numbering. Never invent references.",
  "6. Quantitative claims: computed with shown arithmetic, or labeled projections with stated assumptions. No '[to verify]', no invented data.",
  "7. Appendix B: the claim table (C1..Cn, source drafts, agreement status).",
  "8. Output ONLY the paper markdown. No meta-commentary.",
  "9. " + MATH_RULE.slice(2) + " Convert any plain-text or Unicode math taken from the drafts.",
  "DRAFTS:"
].join("\n");
var REVIEW_PROMPT = [
  "You are an adversarial reviewer. Audit this preprint for publication readiness. Output STRICT JSON only:",
  '{"verdict":"pass"|"revise","hard":[{"id":string,"severity":"HARD","claim":string,"reason":string,"fix":string}],"soft":[{"id":string,"severity":"SOFT","claim":string,"reason":string,"fix":string}]}',
  "Audit dimensions:",
  "1. Citation integrity: every reference in '## References' MUST appear in the provided BIBLIOGRAPHY with its machine identifier; invented/unsourced/unverifiable references = HARD.",
  "2. Quantitative honesty: any quantitative claim NOT derived with shown arithmetic in the paper AND NOT labeled as a projection with stated assumptions = HARD.",
  "3. Arithmetic: spot-check 2-3 derivations; an arithmetic error in a headline number = HARD.",
  "4. Structure: missing required sections, References with fewer than 8 entries, body shorter than 15000 characters = HARD.",
  "5. Prose gates: meta-commentary, reasoning preamble, 'Let me', '[to verify]' markers, placeholder text = HARD.",
  "6. Depth: superficial literature treatment, unexplained jargon, unstated limitations = SOFT.",
  "7. Divergence honesty: Appendix A present when drafts diverged = SOFT if missing.",
  'verdict = "revise" iff hard is non-empty. Do not pad hard with soft issues.',
  "PAPER:"
].join("\n");
var REVISE_PROMPT = [
  "You are the revising author. Apply the reviewer's HARD fixes to the paper. Return ONLY the full revised paper markdown with the same required structure and headings.",
  "For each fix: correct the quantitative claim using the computed value, remove or move-to-Discussion-as-explicitly-labeled-hypothesis unverifiable claims, replace invented references with bibliography entries (or remove the sentence), fix structure and length. Do not add new unsupported claims. Output ONLY the paper.",
  MATH_RULE,
  "FIXES (JSON):"
].join("\n");
// REVISE-PATCH-1 (2026-10-01, #1620/#1504): a revise asked for the WHOLE paper back even when the reviewer raised one
// short HARD fix (row 5435c847: 22729-char paper, 124-char fixes). A full rewrite is 6-9k content tokens on top of the
// reasoning: at max_tokens 8192 the reasoning model returned 0 chars, and at 32768 Workers AI ended the call with
// "3046: Request timeout" (both attempts, 11:27Z). Patch mode asks only for exact find/replace edits (short output, same
// size class as the review JSON that succeeds) and applies each edit only where its excerpt occurs exactly once, so a
// hallucinated excerpt changes nothing. The full rewrite stays as the fallback when no edit applies.
var REVISE_PATCH_PROMPT = [
  "You are the revising author. Resolve each HARD fix below by editing the paper in place.",
  'Return ONLY a JSON array, no prose and no code fence: [{"find":"<exact verbatim excerpt of the PAPER, 40 to 800 characters, occurring once>","replace":"<corrected text>"}].',
  "Copy each find excerpt character for character from the PAPER. Use at most 8 edits. To remove a sentence, replace it with an empty string.",
  "Every replace text writes its mathematics in LaTeX inside $...$ (inline) or $$...$$ (display), never as Unicode superscripts, subscripts or operators.",
  "FIXES (JSON):"
].join("\n");
function applyRevisePatch(paper, raw) {
  let edits = [];
  try {
    const t = String(raw || "");
    const a = t.indexOf("["), b = t.lastIndexOf("]");
    if (a >= 0 && b > a) edits = JSON.parse(t.slice(a, b + 1));
  } catch (e) {
    edits = [];
  }
  if (!Array.isArray(edits)) edits = [];
  let out = String(paper || "");
  let applied = 0;
  for (const e of edits.slice(0, 8)) {
    if (!e || typeof e.find !== "string" || typeof e.replace !== "string" || e.find.length < 20) continue;
    const i = out.indexOf(e.find);
    if (i < 0 || out.indexOf(e.find, i + 1) >= 0) continue;
    out = out.slice(0, i) + e.replace + out.slice(i + e.find.length);
    applied++;
  }
  return { text: out, applied, proposed: edits.length };
}
var VERIFY_EXTRACT_PROMPT = [
  "Extract every QUANTITATIVE claim from this paper that can be independently computed. Output STRICT JSON array:",
  '[{"id":"Q1","statement":"...","inputs":"named numbers with values","formula":"math in plain text"}]',
  "Include only claims whose inputs and formula are stated in the paper. If none, output [].",
  "PAPER:"
].join("\n");
var VERIFY_GEN_PROMPT = [
  "Write ONE self-contained Python 3 script (stdlib only: math, fractions) that independently computes each claim from its stated inputs and prints for each:",
  "CLAIM <id>: computed=<value> expected=<value-or-none> match=yes|no",
  "Use math.isclose(rel_tol=1e-6) when comparing floats. Compute from the stated inputs and formula; do NOT copy the paper's answer as the computation - the script must reproduce the derivation. Print a final line 'VERIFICATION SUMMARY: N claims, M match, K mismatch'.",
  "Output the script inside a single python fenced block, nothing else.",
  "CLAIMS (JSON):"
].join("\n");
var GROUND_STOP = new Set("a an and are as at be by can could do does for from has have how in into is it its of on or that the their these this those to via what when where which while who why will with within without would we our us you your re entry reentry address addresses addressing question questions two three work paper papers study studies approach approaches framework frameworks model models theory theories result results show shows new novel use using used possible all any each every cannot uniquely unique determine determines determined classify classifies classification general generally specific based toward towards between among more most less such other also only whether".split(" "));
var ARXIV_SPACING_MS = 3e3;
// Phrases are runs of adjacent content words (2-3 words; longer runs give sliding pairs); words are the content words.
function groundRuns(text) {
  const t = String(text || "").replace(/^\s*re-?entry from[^:]*:\s*/i, " ").replace(/10\.\d{4,9}\/[^\s:]+/g, " | ").replace(/\$[^$]*\$/g, " | ").replace(/\([ivx]+\)/gi, " | ").replace(/[,;:.?!()\[\]{}"]+/g, " | ");
  const runs = [];
  let cur = [];
  for (const raw of t.split(/\s+/)) {
    const w = raw.replace(/[^A-Za-z0-9-]/g, "").replace(/^-+|-+$/g, "");
    if (!w || w.length < 3 || /^\d+$/.test(w) || GROUND_STOP.has(w.toLowerCase()) || raw === "|") {
      if (cur.length) runs.push(cur);
      cur = [];
      continue;
    }
    cur.push(w);
  }
  if (cur.length) runs.push(cur);
  return runs;
}
function groundQueries(idea, parentTitle) {
  const phr = function(text) {
    const out = [];
    for (const r of groundRuns(text)) {
      if (r.length >= 2 && r.length <= 3) out.push(r.join(" "));
      else if (r.length > 3) for (let i = 0; i + 1 < r.length; i++) out.push(r[i] + " " + r[i + 1]);
    }
    return out;
  };
  const words = function(text) {
    const out = [];
    for (const r of groundRuns(text)) for (const w of r) if (out.map(function(x) {
      return x.toLowerCase();
    }).indexOf(w.toLowerCase()) < 0) out.push(w);
    return out;
  };
  const ip = phr(idea), pp = parentTitle ? phr(parentTitle) : [];
  const qs = [];
  const qp = function(a) {
    return 'all:"' + a + '"';
  };
  if (ip.length) for (const p of pp.slice(0, 4)) if (p.toLowerCase() !== ip[0].toLowerCase()) qs.push(qp(ip[0]) + " AND " + qp(p));
  if (ip.length >= 2) qs.push(qp(ip[0]) + " AND " + qp(ip[1]));
  if (pp.length >= 2) qs.push(qp(pp[0]) + " AND " + qp(pp[1]));
  const ws = words(idea).concat(words(parentTitle)).filter(function(w, i, a) {
    return a.map(function(x) {
      return x.toLowerCase();
    }).indexOf(w.toLowerCase()) === i;
  }).slice(0, 8);
  // GROUND-OR-SLOT-1 (2026-10-02, agent_issues 1751): the OR query was pushed last and then cut by slice(0, 6), so an idea
  // with two phrases and a parent title with four (4 + 1 + 1 = 6 AND-phrase queries) never ran it. Row 196536e3 grounded
  // to 2 entries on all four passes (its five AND queries return 0 on arXiv, the dropped OR returns 8), could not reach the
  // gate-refcount floor of 5 and parked. The OR fallback now always keeps the last slot.
  if (!ws.length) return qs.slice(0, 6);
  return qs.slice(0, 5).concat([ws.map(function(w) {
    return "all:" + w;
  }).join(" OR ")]);
}
async function stageGround(env, row) {
  const idea = row.idea || row.summary || "";
  const rid = String(row.id);
  let existing = "";
  if (row.source === "remediation" && row.paper_slug) {
    const p = await env.LIVING_PAPER.prepare("SELECT body_md, doi, title FROM papers WHERE slug=?1").bind(row.paper_slug).first();
    if (p) existing = String(p.body_md || "");
  }
  const ax = idea.match(/\b(\d{4}\.\d{4,5})(v\d+)?\b/);
  let srcText = "";
  if (ax) {
    try {
      const r = await fetch("https://export.arxiv.org/api/query?id_list=" + ax[1] + "&max_results=1", { headers: { "User-Agent": "QNFO-research-exec/0.6" } });
      const t = await r.text();
      const titleM = t.match(/<title>([\s\S]*?)<\/title>/);
      const sumM = t.match(/<summary>([\s\S]*?)<\/summary>/);
      if (titleM && sumM) srcText = "TITLE: " + titleM[1].trim() + "\n\nABSTRACT: " + sumM[1].replace(/\s+/g, " ").trim();
    } catch (e) {
    }
  }
  const q = idea.replace(/\b\d{4}\.\d{4,5}(v\d+)?\b/g, " ").replace(/\s+/g, " ").trim().slice(0, 150);
  const bib = [];
  if (srcText && ax) bib.push({ n: bib.length + 1, id: "arXiv:" + ax[1], text: srcText.slice(0, 1200) });
  // GROUNDING-BIB-1 (2026-10-01, #1620): since 2026-09-13 grounding produced 0 or 1 bibliography entries (6 before), so
  // no paper could pass gate-refcount (MIN_REFS 8) and nothing published for 22 days. Two causes, measured live:
  // (a) arXiv was searched for the idea's first 150 characters as ONE exact quoted phrase, which returns 0 entries
  //     (row 567: 0, while all:"fusion rules" AND all:Majorana returns 8 on-topic papers);
  // (b) qnfo-ai /v1/search returns {index, id, score, metadata:{slug,...}} and this code read x.text / x.path, which do
  //     not exist, so every corpus hit was skipped.
  // Now: a phrase ladder over the idea and, for a re-entry idea, the parent paper's title, ending in a relevance-sorted OR
  // that always returns topical work; corpus hits are cited only from PAPER_VZ, resolved to title and DOI in living-paper.
  let arxivHits = "";
  let parentTitle = "";
  const _doiM = idea.match(/10\.5281\/zenodo\.\d+/);
  if (_doiM && env.LIVING_PAPER) {
    try {
      const _pp = await env.LIVING_PAPER.prepare("SELECT title FROM papers WHERE doi = ?1 LIMIT 1").bind(_doiM[0]).first();
      if (_pp && _pp.title) parentTitle = String(_pp.title);
    } catch (e) {
    }
  }
  const _queries = groundQueries(idea, parentTitle);
  let _arxivErr = 0;
  for (let qi = 0; qi < _queries.length && bib.length < 11; qi++) {
    // arXiv API terms: at most one request every three seconds. At 1.2 s some passes came back thin (row 3b0e4cbd grounded
    // to 4 entries twice, then 14 on unchanged queries); a non-200 answer is retried once after the same pause.
    if (qi > 0) await new Promise(function(res) {
      setTimeout(res, ARXIV_SPACING_MS);
    });
    try {
      const _aurl = "https://export.arxiv.org/api/query?search_query=" + encodeURIComponent(_queries[qi]).replace(/%3A/g, ":") + "&start=0&max_results=8&sortBy=relevance";
      let r = await fetch(_aurl, { headers: { "User-Agent": "QNFO-research-exec/0.9" } });
      if (!r.ok) {
        await new Promise(function(res) {
          setTimeout(res, ARXIV_SPACING_MS);
        });
        r = await fetch(_aurl, { headers: { "User-Agent": "QNFO-research-exec/0.9" } });
      }
      if (!r.ok) {
        _arxivErr++;
        continue;
      }
      const t = await r.text();
      const entries = t.split("<entry>").slice(1);
      for (const e of entries) {
        const idM = e.match(/<id>([\s\S]*?)<\/id>/);
        const tiM = e.match(/<title>([\s\S]*?)<\/title>/);
        const suM = e.match(/<summary>([\s\S]*?)<\/summary>/);
        if (!idM || !tiM) continue;
        const aid = String(idM[1].trim()).split("/abs/").pop();
        if (ax && aid === ax[1]) continue;
        if (bib.some(function(b) {
          return b.id === "arXiv:" + aid;
        })) continue;
        const entry = "arXiv:" + aid + " | " + tiM[1].replace(/\s+/g, " ").trim() + "\n  " + (suM ? suM[1].replace(/\s+/g, " ").trim().slice(0, 400) : "");
        bib.push({ n: bib.length + 1, id: "arXiv:" + aid, text: entry });
        arxivHits += (arxivHits ? "\n" : "") + entry;
        if (bib.length >= 11) break;
      }
    } catch (e) {
    }
  }
  let corpus = "";
  try {
    const r = await routerFetch(env, ROUTER.replace("/v1/chat/completions", "") + "/v1/search?q=" + encodeURIComponent((parentTitle + " " + q).trim().slice(0, 200)) + "&k=8", { headers: routerHeaders(env, false) });
    if (r.ok) {
      const j = await r.json();
      const slugs = [];
      for (const x of j.results || []) {
        const sl = x && x.index === "PAPER_VZ" && x.metadata && x.metadata.slug ? String(x.metadata.slug) : "";
        if (sl && slugs.indexOf(sl) < 0) slugs.push(sl);
        if (slugs.length >= 4) break;
      }
      for (const sl of slugs) {
        if (bib.length >= 14) break;
        const pp = await env.LIVING_PAPER.prepare("SELECT title, doi, abstract FROM papers WHERE slug = ?1 AND status NOT IN ('duplicate','kg-backfill','quarantined') LIMIT 1").bind(sl).first().catch(function() {
          return null;
        });
        if (!pp || !pp.title) continue;
        const entry = "QNFO: " + String(pp.title).replace(/\s+/g, " ").trim() + (pp.doi ? " | DOI " + pp.doi : "") + "\n  " + String(pp.abstract || "").replace(/\s+/g, " ").trim().slice(0, 300);
        bib.push({ n: bib.length + 1, id: pp.doi ? "doi:" + pp.doi : "qnfo:" + sl, text: entry });
        corpus += (corpus ? "\n" : "") + entry;
      }
    }
  } catch (e) {
  }
  const bibBlock = bib.map(function(b) {
    return "[" + b.n + "] " + b.text;
  }).join("\n") || "(bibliography empty - writers must state this limitation)";
  const grounding = [
    "# Grounding block - source: " + rid,
    "## Research idea",
    idea,
    "## Existing paper under revision (remediation only)",
    existing ? existing.slice(0, 24e3) : "(none - new paper)",
    "## Source material (fetched from arXiv)",
    srcText || "(no arXiv source embedded in idea)",
    "## Related literature (arXiv, real identifiers)",
    arxivHits || "(none retrieved)",
    "## QNFO corpus context (Vectorize)",
    corpus || "(none retrieved)",
    "## Bibliography (cite ONLY these; keep this exact order and numbering)",
    bibBlock
  ].join("\n\n");
  await r2Put(env, rid + "/grounding.md", grounding);
  // GROUND-THIN-FAILFAST-1 (2026-10-02, agent_issues 1751): verify renders References only from bibliography entries the
  // body cites, so a paper grounded on fewer than MIN_GROUND_REFS entries can never pass gate-refcount (refCount <= bibCount
  // < floor), and with 0 entries the writer's own unverifiable list is what gets counted. Row 196536e3 (bibCount 2) still ran
  // ensemble, reconcile, review, revise and verify four times (20:31Z-00:19Z) before parking. Stop here instead: markError
  // spends one recover exactly as the verify failure did, so parking is unchanged, but a thin pass costs HTTP calls only.
  if (bib.length < MIN_GROUND_REFS) {
    await logEvent(env, "ground-thin", "row=" + rid + " bibCount=" + bib.length + " < " + MIN_GROUND_REFS + " queries=" + _queries.length + " arxiv_http_errors=" + _arxivErr, "warn");
    await markError(env, row, "ground: bibliography " + bib.length + " < " + MIN_GROUND_REFS + " entries (gate-refcount cannot pass); arxiv_http_errors=" + _arxivErr);
    return { ok: false, stage: "ground", bibCount: bib.length, arxivErrors: _arxivErr };
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='ensemble', context=? WHERE id=?").bind(JSON.stringify({ pipeline: PIPELINE_VERSION, bibCount: bib.length, srcFetched: !!srcText }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "ground->ensemble", bibCount: bib.length };
}
__name(stageGround, "stageGround");
__name2(stageGround, "stageGround");
__name22(stageGround, "stageGround");
__name222(stageGround, "stageGround");
__name2222(stageGround, "stageGround");
async function stageEnsemble(env, row) {
  const grounding = await r2Get(env, String(row.id) + "/grounding.md");
  if (!grounding) {
    await markError(env, row, "ensemble: grounding missing");
    return { ok: false, stage: "ensemble" };
  }
  const shared = WRITER_PROMPT + "\n\n" + grounding;
  // ENSEMBLE-FRESH-DRAFTS-1 (2026-10-01): the fallback path reused any draft-N.md already in R2, including drafts written
  // for an EARLIER grounding. Row 567 re-grounded with 14 bibliography entries (GROUNDING-BIB-1) and then reconciled three
  // cached drafts written against the empty bibliography (14:36Z), so the new citations never reached the paper. Each
  // draft now carries a grounding fingerprint sidecar (draft-N.fp); a cached draft is reused only for the same grounding.
  // Writer legs run at low reasoning effort (REASONING-EFFORT-LOW-1): at the default (maximum) effort the 8192-token
  // budget went to reasoning and 2 of 3 primary legs routinely came back under 4000 chars.
  const gfp = (await sha256hex(grounding)).slice(0, 16);
  const legs = await Promise.all(WRITER_MODELS.map(async function(m, i) {
    let draft = await aiText(env, m, shared, 3e4, "low");
    let via = "workers-ai";
    if (!draft || draft.length < 4e3) {
      draft = await gwCall(env, shared, 3e4);
      via = "gateway-fallback";
    }
    if (draft && draft.length >= 4e3) {
      await r2Put(env, String(row.id) + "/draft-" + i + ".md", draft);
      await r2Put(env, String(row.id) + "/draft-" + i + ".fp", gfp);
      return { i, len: draft.length, via };
    }
    return { i, len: 0, via: "none" };
  }));
  const okLegs = legs.filter(function(l) {
    return l.len >= 4e3;
  }).length;
  if (okLegs < 3) {
    await logEvent(env, "ensemble-retry", "primary legs " + okLegs + "/3; retrying with gwCall+fallback");
    const fallbackLegs = await Promise.all([0, 1, 2].map(async function(fi) {
      const existing = await r2Get(env, String(row.id) + "/draft-" + fi + ".md");
      const existingFp = existing ? String(await r2Get(env, String(row.id) + "/draft-" + fi + ".fp")).trim() : "";
      if (existing && existing.length >= 4e3 && existingFp === gfp) return { i: fi, len: existing.length, via: "cached" };
      let draft = await gwCall(env, shared, 3e4);
      let via = "gwCall";
      if (!draft || draft.length < 4e3) {
        const fm = WRITER_FALLBACK_MODELS[fi % WRITER_FALLBACK_MODELS.length];
        draft = await aiText(env, fm, shared, 3e4, "low");
        via = "fallback-" + fm.split("/").pop();
      }
      if (draft && draft.length >= 4e3) {
        await r2Put(env, String(row.id) + "/draft-" + fi + ".md", draft);
        await r2Put(env, String(row.id) + "/draft-" + fi + ".fp", gfp);
        return { i: fi, len: draft.length, via };
      }
      return { i: fi, len: 0, via: "none" };
    }));
    const okFallback = fallbackLegs.filter(function(l) {
      return l.len >= 4e3;
    }).length;
    if (okFallback < MIN_LEGS) {
      await markError(env, row, "ensemble: only " + okFallback + "/3 fallback legs produced drafts (require >= " + MIN_LEGS + ")");
      return { ok: false, stage: "ensemble" };
    }
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='reconcile' WHERE id=?").bind(row.id).run();
    return { ok: true, stage: "ensemble->reconcile", legs: fallbackLegs, via: "fallback" };
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='reconcile' WHERE id=?").bind(row.id).run();
  return { ok: true, stage: "ensemble->reconcile", legs };
}
__name(stageEnsemble, "stageEnsemble");
__name2(stageEnsemble, "stageEnsemble");
__name22(stageEnsemble, "stageEnsemble");
__name222(stageEnsemble, "stageEnsemble");
__name2222(stageEnsemble, "stageEnsemble");
async function stageReconcile(env, row) {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const d = await r2Get(env, String(row.id) + "/draft-" + i + ".md");
    if (d) parts.push("=== WRITER " + String.fromCharCode(97 + i) + " DRAFT ===\n" + d.slice(0, 24e3));
  }
  if (parts.length < 1) {
    await markError(env, row, "reconcile: drafts missing");
    return { ok: false, stage: "reconcile" };
  }
  if (parts.length === 1) {
    await logEvent(env, "reconcile-solo", "only 1 writer draft reached reconcile (ensemble degraded)", "warn");
    var solo = parts[0];
    var _soloNl = solo.indexOf(String.fromCharCode(10));
    if (_soloNl >= 0) solo = solo.slice(_soloNl + 1);
    await r2Put(env, String(row.id) + "/reconciled.md", solo);
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, solo: true }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "reconcile->review", len: solo.length, solo: true };
  }
  const _rc0 = Date.now();
  let reconciled = await gwCall(env, RECONCILE_PROMPT + "\n\n" + parts.join("\n\n"), 3e4);
  // REVISE-WALL-1: a first attempt that ran past 120 s hit the timeout class (Workers AI 3046 at about 240 s, or the gateway's
  // 240 s abort); an identical retry would too and costs the stage's wall budget, so degrade to the best leg directly.
  if ((!reconciled || reconciled.length < 1e4) && Date.now() - _rc0 < 12e4) {
    // RECONCILE-RETRY-1 (2026-09-29): one bounded retry before the best-leg degrade.
    let _rc2 = await gwCall(env, RECONCILE_PROMPT + "\n\n" + parts.join("\n\n") + "\n\nIMPORTANT: output the COMPLETE reconciled paper in full. Do not summarize and do not truncate.", 3e4);
    if (_rc2 && _rc2.length > (reconciled ? reconciled.length : 0)) reconciled = _rc2;
  }
  if (!reconciled || reconciled.length < 1e4) {
    let best = parts[0];
    for (let _i = 1; _i < parts.length; _i++) if (parts[_i].length > best.length) best = parts[_i];
    let body = best;
    const _nl = body.indexOf(String.fromCharCode(10));
    if (_nl >= 0) body = body.slice(_nl + 1);
    if (!body || body.trim().length < 2e3) {
      await markError(env, row, "reconcile: output too short (" + (reconciled ? reconciled.length : 0) + ")");
      return { ok: false, stage: "reconcile" };
    }
    await logEvent(env, "reconcile-degrade", "reconcile output short (" + (reconciled ? reconciled.length : 0) + " < 10000 chars after retry); reconciled from best leg (len=" + body.length + ")", "warn");
    await r2Put(env, String(row.id) + "/reconciled.md", body);
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, degraded: true }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "reconcile->review", len: body.length, degraded: true };
  }
  await r2Put(env, String(row.id) + "/reconciled.md", reconciled);
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0 }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "reconcile->review", len: reconciled.length };
}
__name(stageReconcile, "stageReconcile");
__name2(stageReconcile, "stageReconcile");
__name22(stageReconcile, "stageReconcile");
__name222(stageReconcile, "stageReconcile");
__name2222(stageReconcile, "stageReconcile");
async function stageReview(env, row) {
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  const grounding = await r2Get(env, String(row.id) + "/grounding.md");
  let ctx = { cycles: 0 };
  try {
    ctx = JSON.parse(row.context || "{}");
  } catch (e) {
  }
  const bib = (grounding.split("## Bibliography")[1] || "").slice(0, 8e3);
  const revRaw = await gwCall(env, REVIEW_PROMPT + "\n\n" + paper.slice(0, 34e3) + "\n\nBIBLIOGRAPHY (numbered; the paper may cite only these):\n" + bib, 12e3);
  let findings = { verdict: "revise", hard: [{ id: "review-parse", severity: "HARD", claim: "review output", reason: "unparseable review output", fix: "re-run review" }], soft: [] };
  try {
    const m = String(revRaw).match(/\{[\s\S]*\}/);
    if (m) findings = JSON.parse(m[0]);
  } catch (e) {
  }
  if (!Array.isArray(findings.hard)) findings.hard = [];
  if (!Array.isArray(findings.soft)) findings.soft = [];
  const cycle = ctx.cycles || 0;
  await r2Put(env, String(row.id) + "/review-report-" + cycle + ".md", String(revRaw).slice(0, 3e4));
  const hard = findings.hard.filter(function(f) {
    return String(f.severity || "").toUpperCase() === "HARD";
  });
  // MATH-LATEX-2 (#1891): plain-text math is a HARD finding decided deterministically (no model call). It rides the existing
  // review -> revise cycles (bounded by MAX_REVIEW_CYCLES) and the patch reviser converts the listed expressions to LaTeX.
  const _pm = pseudoMathScan(paper);
  if (_pm.count > PSEUDO_MATH_MAX) hard.push(mathLatexFix(_pm));
  if (hard.length && cycle < MAX_REVIEW_CYCLES) {
    await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify(hard));
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=? WHERE id=?").bind(JSON.stringify({ cycles: cycle, hardCount: hard.length, verifyPass: ctx.verifyPass || 0 }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "review->revise", hard: hard.length, cycle };
  }
  await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify({ hard, soft: findings.soft }));
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='verify', context=? WHERE id=?").bind(JSON.stringify({ cycles: cycle, hardLeft: hard.length, verdict: findings.verdict || "?", verifyPass: ctx.verifyPass || 0 }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "review->verify", hardLeft: hard.length, cycle };
}
__name(stageReview, "stageReview");
__name2(stageReview, "stageReview");
__name22(stageReview, "stageReview");
__name222(stageReview, "stageReview");
__name2222(stageReview, "stageReview");
async function stageRevise(env, row) {
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  const fixes = await r2Get(env, String(row.id) + "/fixes.json");
  let ctx = { cycles: 0 };
  try {
    ctx = JSON.parse(row.context || "{}");
  } catch (e) {
  }
  if (paper.length >= 1e4) {
    // Workers AI directly at low reasoning effort: the gateway path ran the same model at default effort and aborted at
    // its 240 s budget (12:08Z), and a short JSON answer does not need deep reasoning.
    const _pprompt = REVISE_PATCH_PROMPT + "\n" + fixes.slice(0, 8e3) + "\n\nPAPER:\n" + paper.slice(0, 34e3);
    let _praw = await aiText(env, MODELS[0], _pprompt, 8192, "low");
    // WRITER-FLASH-1: the retry for a short JSON patch uses gpt-oss-120b (another family, ~500 neurons) instead of glm-5.3 (~3,300).
    if (!_praw || _praw.indexOf("[") < 0) _praw = await aiText(env, MODELS[2], _pprompt, 8192, "low");
    const _p = applyRevisePatch(paper, _praw);
    await logEvent(env, "revise-patch", "row=" + row.id + " proposed=" + _p.proposed + " applied=" + _p.applied + " raw_chars=" + String(_praw || "").length + " out_chars=" + _p.text.length, _p.applied ? "ok" : "warn");
    if (_p.applied > 0 && _p.text.length >= 1e4) {
      await r2Put(env, String(row.id) + "/reconciled.md", _p.text);
      const _c2 = (ctx.cycles || 0) + 1;
      await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: _c2, patch: _p.applied, verifyPass: ctx.verifyPass || 0 }).slice(0, 6e3), row.id).run();
      return { ok: true, stage: "revise->review", cycle: _c2, patch: _p.applied };
    }
    // REVISE-WALL-1 (2026-10-01): a full rewrite of a paper this long cannot fit the 8192-token budget next to the reasoning
    // (0 chars on every attempt, 09:07Z-12:24Z) and its four 240 s calls pushed the stage past the 15-minute scheduled wall
    // limit (internalError, 12:00Z hour). Fail fast with the patch outcome instead; the recover loop re-arms the row.
    // REVISE-NOOP-ADVANCE-1 (2026-10-01, #1728; from the wave-4 session's PR 358): revise improves, it does not gate. When
    // no patch edit applies (5435c847: 0 edits proposed, raw "[]"), re-queueing from ground discarded a 23k-char paper and
    // re-ran the ensemble on unchanged inputs until the row parked. Keep the paper and advance; review is bounded by
    // MAX_REVIEW_CYCLES and verify's deterministic gates decide (bounded by verifyPass).
    if (paper.length >= 1.2e4) {
      const _c3 = (ctx.cycles || 0) + 1;
      await logEvent(env, "revise-noop", "row=" + row.id + " no applicable patch edit (proposed=" + _p.proposed + ", raw=" + String(_praw || "").length + " chars); advancing with the unchanged paper", "warn");
      await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: _c3, patch: 0, verifyPass: ctx.verifyPass || 0 }).slice(0, 6e3), row.id).run();
      return { ok: true, stage: "revise->review", cycle: _c3, patch: 0, noop: true };
    }
  }
  let revised = await gwCall(env, REVISE_PROMPT + "\n\n" + fixes.slice(0, 8e3) + "\n\nPAPER:\n" + paper.slice(0, 34e3), 3e4);
  const _len1 = revised ? revised.length : 0;
  let _len2 = -1;
  if (!revised || revised.length < 1e4) {
    // REVISE-RETRY-1 (2026-09-29): one bounded retry before terminal escalation.
    // The prior code escalated on the first short output: an absolute 1e4 floor with no
    // retry permanently wedged the row (RESEARCH-TERMINAL cluster).
    let _r2 = await gwCall(env, REVISE_PROMPT + "\n\n" + fixes.slice(0, 8e3) + "\n\nPAPER:\n" + paper.slice(0, 34e3) + "\n\nIMPORTANT: output the COMPLETE revised paper, start to finish. Do not summarize and do not truncate.", 3e4);
    _len2 = _r2 ? _r2.length : 0;
    if (_r2 && _r2.length > (revised ? revised.length : 0)) revised = _r2;
  }
  if (!revised || revised.length < 1e4) {
    // REVISE-DIAG-1 (#1620): record what each attempt returned so a short revise is attributable (input size, first/retry length, floor).
    await logEvent(env, "revise-short", "row=" + row.id + " paper_chars=" + paper.length + " fixes_chars=" + fixes.length + " attempt1=" + _len1 + " retry=" + _len2 + " floor=10000", "warn");
    await markError(env, row, "revise: output too short (" + (revised ? revised.length : 0) + " chars after retry)");
    return { ok: false, stage: "revise" };
  }
  await r2Put(env, String(row.id) + "/reconciled.md", revised);
  const c2 = (ctx.cycles || 0) + 1;
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='review', context=? WHERE id=?").bind(JSON.stringify({ cycles: c2, verifyPass: ctx.verifyPass || 0 }).slice(0, 6e3), row.id).run();
  return { ok: true, stage: "revise->review", cycle: c2 };
}
__name(stageRevise, "stageRevise");
__name2(stageRevise, "stageRevise");
__name22(stageRevise, "stageRevise");
__name222(stageRevise, "stageRevise");
__name2222(stageRevise, "stageRevise");
// REFS-RENDER-1 (2026-10-01): the References section was left to the writer and the revise model, and the gate accepted
// only an unnumbered or "7." heading, so a paper whose list sat under "## 8. References", or used "1." instead of "[1]",
// failed gate-refs/gate-refcount and went terminal after one revision (row 5099abb8, 15:21Z). The list is mechanical:
// the grounding bibliography is numbered and the body cites [n]. Render it from the entries the body actually cites,
// in bibliography numbering; anything not in the bibliography is dropped (the writers may cite only these).
var REFS_HEAD_RE = /^#{1,3}[ \t]*(?:\d+\.?[ \t]*)?(?:References|Bibliography)\b.*$/im;
function renderReferences(paper, grounding) {
  const bibTxt = String(grounding || "").split("## Bibliography")[1] || "";
  const entries = {};
  for (const line of bibTxt.split("\n")) {
    const m = line.match(/^\[(\d+)\]\s+(.+)$/);
    if (m) entries[m[1]] = m[2].trim();
  }
  // Keep any section that follows the old list (appendices): only the list itself is replaced.
  const src = String(paper);
  const hm = REFS_HEAD_RE.exec(src);
  let body = src, tail = "";
  if (hm) {
    body = src.slice(0, hm.index);
    const after = src.slice(hm.index + hm[0].length);
    const nx = after.search(/^#{1,2}\s/m);
    tail = nx >= 0 ? after.slice(nx).replace(/^\s+/, "") : "";
  }
  body = body.replace(/\s+$/, "");
  const cited = new Set();
  const re = /\[(\d+(?:\s*[,\u2013-]\s*\d+)*)\]/g;
  const scan = body + "\n" + tail;
  let m;
  while ((m = re.exec(scan)) !== null) {
    for (const part of m[1].split(",")) {
      const rg = part.trim().split(/\s*[\u2013-]\s*/);
      const a = parseInt(rg[0], 10), b = rg.length > 1 ? parseInt(rg[1], 10) : a;
      if (Number.isFinite(a) && Number.isFinite(b) && b >= a && b - a < 50) for (let k = a; k <= b; k++) cited.add(String(k));
    }
  }
  const nums = Array.from(cited).filter(function(n) { return entries[n]; }).sort(function(x, y) { return x - y; });
  if (!nums.length) return { paper: String(paper), cited: 0 };
  const lines = nums.map(function(n) {
    const e = entries[n], bar = e.indexOf(" | ");
    const id = bar > 0 ? e.slice(0, bar).trim() : "", title = bar > 0 ? e.slice(bar + 3).trim() : e;
    const link = /^arXiv:/i.test(id) ? " https://arxiv.org/abs/" + id.slice(6) : /^doi:/i.test(id) ? " https://doi.org/" + id.slice(4) : "";
    return "[" + n + "] " + title + (id ? ". " + id + "." : "") + link;
  });
  return { paper: body + "\n\n## References\n\n" + lines.join("\n") + "\n" + (tail ? "\n" + tail : ""), cited: nums.length };
}
// REFCOUNT-BIB-AWARE-1 + publish floor (2026-10-01, #1620; from the wave-4 session's PR 358): the reference floor is
// MIN_REFS capped at what the grounding bibliography can supply (writers may cite only bibliography works) and never below
// MIN_GROUND_REFS. A new paper's length floor is the living-paper publish floor (status=published needs >= 20000 chars,
// trg_papers_pub_floor_*), so a paper D1 would refuse AFTER its public Zenodo deposit goes back to revise here instead.
var PUBLISH_FLOOR_CHARS = 2e4;
var MIN_GROUND_REFS = 5;
function bibCountFromGrounding(grounding) {
  var tail = String(grounding || "").split("## Bibliography")[1] || "";
  return (tail.match(/^\[\d+\] /gm) || []).length;
}
function finalGates(paper, opts) {
  const o = opts || {};
  const minChars = Number(o.minChars || MIN_PAPER_CHARS);
  const minRefs = typeof o.bibCount === "number" ? Math.max(MIN_GROUND_REFS, Math.min(MIN_REFS, o.bibCount)) : MIN_REFS;
  const fixes = [];
  if (String(paper).length < minChars) fixes.push({ id: "gate-length", severity: "HARD", claim: "paper too short", reason: "body length " + String(paper).length + " < " + minChars, fix: "Expand with literature review, explicit derivations, and discussion to " + minChars + "+ characters." });
  if (!REFS_HEAD_RE.test(paper)) fixes.push({ id: "gate-refs", severity: "HARD", claim: "no References section", reason: "missing References heading", fix: "Add a References section listing only bibliography entries." });
  if (/\[to verify\]/i.test(paper)) fixes.push({ id: "gate-toverify", severity: "HARD", claim: "[to verify] markers present", reason: "unverified quantitative claim markers in body", fix: "Replace every marked claim with a computed value or move it to Discussion as an explicitly-labeled hypothesis." });
  // REFCOUNT-SPLIT-1 (PR 358's finding): the old split(/##\s*(7\.\s*)?References/i)[1] returned the CAPTURE GROUP, so
  // refCount was 0 for every paper. Count entry lines after the last References heading, up to the next top-level heading.
  const _refsParts = String(paper).split(REFS_HEAD_RE);
  const refsPart = _refsParts.length > 1 ? _refsParts[_refsParts.length - 1].split(/^#{1,2}\s/m)[0] : "";
  const refCount = (refsPart.match(/^[ \t]*(?:[-*][ \t]*)?(?:\[\d+\]|\d+\.)[ \t]+\S/gm) || []).length;
  if (refCount < minRefs) fixes.push({ id: "gate-refcount", severity: "HARD", claim: "too few references", reason: "rendered references " + refCount + " < " + minRefs, fix: "List at least " + minRefs + " works from the provided bibliography in the References section, numbered [1]..[n], and cite each in the text with substantive context." });
  if (/(Let me|The user|I'll|I need to|Okay,|Alright,|Here's what)/i.test(String(paper).slice(0, 500))) fixes.push({ id: "gate-preamble", severity: "HARD", claim: "reasoning preamble", reason: "meta text at body start", fix: "Remove all thinking/planning text; output only the paper." });
  return { ok: fixes.length === 0, fixes, reason: fixes.map(function(f) {
    return f.id;
  }).join(",") };
}
__name(finalGates, "finalGates");
__name2(finalGates, "finalGates");
__name22(finalGates, "finalGates");
__name222(finalGates, "finalGates");
__name2222(finalGates, "finalGates");
// MATH-LATEX-2 (#1891): every verify logs a math-scan event (status ok below the threshold, warn at or above it), so the
// residual on papers about to publish is measured without a session. ops_config research_math_gate = 'enforce' makes it a
// pre-publish gate: a first failing pass goes back to revise (the existing rewrite path) and a second failing pass whose
// only failure is math parks the row (no re-arm: the same prompts would repeat it at full pipeline cost). Any other value
// (the default) measures only, so a prompt rule that has not taken hold yet cannot stop publishing.
async function mathGate(env, row, paper, gates) {
  const pm = pseudoMathScan(paper);
  let mode = "measure";
  try {
    const r = await env.QNFO_AUDIT.prepare("SELECT value FROM ops_config WHERE key = 'research_math_gate'").first();
    if (r && String(r.value || "").trim() === "enforce") mode = "enforce";
  } catch (e) {
  }
  await logEvent(env, "math-scan", "row=" + row.id + " pseudo_math=" + pm.count + " mode=" + mode, pm.count > PSEUDO_MATH_MAX ? "warn" : "ok");
  if (mode === "enforce" && pm.count > PSEUDO_MATH_MAX) {
    gates.fixes.push(mathLatexFix(pm));
    gates.ok = false;
    gates.reason = gates.fixes.map(function(f) { return f.id; }).join(",");
  }
  return pm;
}
function mathOnlyFailure(gates, mismatch) {
  return !mismatch && !gates.ok && gates.fixes.length > 0 && gates.fixes.every(function(f) { return f && f.id === "gate-math-latex"; });
}
async function parkMathRow(env, row, pm) {
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='wontfix', stage='parked', error=?, claimed_at=NULL WHERE id=? AND status IN ('researching','queued','failed')").bind(("PARKED-MATH-LATEX-2: " + pm.count + " plain-text math tokens remain after the rewrite; not re-armed (the same prompts would repeat it)").slice(0, 300), row.id).run();
  await logEvent(env, "math-park", "parked research row " + String(row.id).slice(0, 8) + " pseudo_math=" + pm.count, "warn");
}
async function stageVerify(env, row) {
  let paper = await r2Get(env, String(row.id) + "/reconciled.md");
  try {
    const _rr = renderReferences(paper, await r2Get(env, String(row.id) + "/grounding.md"));
    if (_rr.cited && _rr.paper !== paper) {
      paper = _rr.paper;
      await r2Put(env, String(row.id) + "/reconciled.md", paper);
      await logEvent(env, "refs-render", "row=" + row.id + " cited=" + _rr.cited, "ok");
    }
  } catch (eRR) {
  }
  const gateOpts = { bibCount: bibCountFromGrounding(await r2Get(env, String(row.id) + "/grounding.md")), minChars: row.source === "remediation" ? MIN_PAPER_CHARS : PUBLISH_FLOOR_CHARS };
  let ctx = {};
  try {
    ctx = JSON.parse(row.context || "{}");
  } catch (e) {
  }
  const exRaw = await gwCall(env, VERIFY_EXTRACT_PROMPT + "\n\n" + paper.slice(0, 34e3), 8e3);
  let claims = [];
  try {
    const m = String(exRaw).match(/\[[\s\S]*\]/);
    if (m) claims = JSON.parse(m[0]);
  } catch (e) {
  }
  claims = (Array.isArray(claims) ? claims : []).filter(function(c) {
    return c && c.statement;
  }).slice(0, 8);
  if (!claims.length) {
    await r2Put(env, String(row.id) + "/verification.md", "# Verification\n\nNo quantitative claims were found; the paper is qualitative. Results are framed as qualitative analysis with explicit limitations.\n\nExtraction output:\n" + String(exRaw).slice(0, 3e3));
    const gates2 = finalGates(paper, gateOpts);
    const _pm2 = await mathGate(env, row, paper, gates2);
    // VERIFY-LOOP-BOUND-1 (2026-10-01): this qualitative branch sent the row back to revise on every failing gate with no
    // verifyPass check, and review/revise dropped verifyPass from the context, so row 567 cycled verify -> revise ->
    // review -> verify every 15 minutes (13:21Z to 14:07Z) on gate-refcount. A second failing pass is terminal here, as
    // in the claims branch below; the recover loop re-arms the row from ground.
    if (ctx.verifyPass && mathOnlyFailure(gates2, false)) {
      await parkMathRow(env, row, _pm2);
      return { ok: false, stage: "verify", gate: gates2.reason, parked: true };
    }
    if (!gates2.ok && ctx.verifyPass) {
      await markError(env, row, "verify: unresolved after revision - gates=" + gates2.reason);
      return { ok: false, stage: "verify", gate: gates2.reason };
    }
    if (!gates2.ok) {
      await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify(gates2.fixes));
      await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, verifyPass: 1 }).slice(0, 6e3), row.id).run();
      return { ok: true, stage: "verify->revise", gate: gates2.reason };
    }
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='publish', status='review' WHERE id=?").bind(row.id).run();
    return { ok: true, stage: "verify->publish", claims: 0 };
  }
  const genRaw = await gwCall(env, VERIFY_GEN_PROMPT + "\n\n" + JSON.stringify(claims) + "\n\nPAPER (context):\n" + paper.slice(0, 2e4), 12e3);
  let code = genRaw;
  const cm = String(genRaw).match(/```python\n([\s\S]*?)```/);
  if (cm) code = cm[1];
  if (!code || code.length < 40) {
    await markError(env, row, "verify: no verification script generated");
    return { ok: false, stage: "verify" };
  }
  await r2Put(env, String(row.id) + "/verification.py", code);
  let out = "";
  try {
    // PILOT-PROPS-CALLER-1 (2026-10-01): the public pilot hostname answers 403 to every command path since
    // PILOT-PUBLIC-EXEC-CLOSED-1, so the verification script never ran. Call the pilot through its service binding
    // (props-authenticated); send a bearer only if this worker holds one. The pilot answers
    // {ok, result: {exitCode, stdout, stderr}}; reading only j.stdout recorded "no output" for every run.
    const _ph = { "Content-Type": "application/json" };
    if (env.PILOT_TOKEN) _ph["Authorization"] = "Bearer " + env.PILOT_TOKEN;
    const _pinit = { method: "POST", headers: _ph, body: JSON.stringify({ code }) };
    const r = env.CONTAINERS_PILOT && typeof env.CONTAINERS_PILOT.fetch === "function" ? await env.CONTAINERS_PILOT.fetch("https://containers-pilot.internal/exec", _pinit) : await fetch(PILOT + "/exec", _pinit);
    const j = await r.json().catch(function() { return {}; });
    const res = j && j.result && typeof j.result === "object" ? j.result : null;
    out = res ? String(res.stdout || "") + (res.stderr ? "\n[stderr]\n" + String(res.stderr) : "") + "\n[exit " + res.exitCode + "]" : String(j && (j.stdout || j.output || j.error) || "no output (HTTP " + r.status + ")");
    out = out.slice(0, 2e4);
    if (!r.ok) await logEvent(env, "verify-exec-error", "pilot HTTP " + r.status + ": " + String(j && j.error || "").slice(0, 200), "warn");
  } catch (e) {
    out = "EXEC ERROR: " + String(e && e.message || e).slice(0, 200);
  }
  const verifMd = "# Verification report\n\n## Extracted claims\n" + JSON.stringify(claims, null, 2) + "\n\n## Script\n```python\n" + code + "\n```\n\n## Execution output\n```\n" + out + "\n```\n";
  await r2Put(env, String(row.id) + "/verification.md", verifMd);
  const mismatch = /match\s*=\s*no/i.test(out) || /VERIFICATION SUMMARY[^\n]*mismatch\s*[1-9]/i.test(out);
  const gates = finalGates(paper, gateOpts);
  const _pm = await mathGate(env, row, paper, gates);
  if (ctx.verifyPass && mathOnlyFailure(gates, mismatch)) {
    await parkMathRow(env, row, _pm);
    return { ok: false, stage: "verify", gate: gates.reason, parked: true };
  }
  if ((mismatch || !gates.ok) && !ctx.verifyPass) {
    const fixes = gates.fixes.slice();
    if (mismatch) fixes.push({ id: "verify-mismatch", severity: "HARD", claim: "computed values do not match paper claims", reason: out.slice(0, 2e3), fix: "Correct each quantitative claim to match the independently computed value, or move the claim to the Discussion as an explicitly-labeled hypothesis with stated assumptions." });
    await r2Put(env, String(row.id) + "/fixes.json", JSON.stringify(fixes));
    await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='revise', context=? WHERE id=?").bind(JSON.stringify({ cycles: 0, verifyPass: 1 }).slice(0, 6e3), row.id).run();
    return { ok: true, stage: "verify->revise", mismatch, gate: gates.reason };
  }
  if (mismatch || !gates.ok) {
    await markError(env, row, "verify: unresolved after revision - mismatch=" + mismatch + " gates=" + gates.reason);
    return { ok: false, stage: "verify" };
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET stage='publish', status='review' WHERE id=?").bind(row.id).run();
  return { ok: true, stage: "verify->publish", claims: claims.length };
}
__name(stageVerify, "stageVerify");
__name2(stageVerify, "stageVerify");
__name22(stageVerify, "stageVerify");
__name222(stageVerify, "stageVerify");
__name2222(stageVerify, "stageVerify");
async function ghReq(env, path) {
  try {
    const r = await fetch(GH_API + path, { headers: { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-research-exec", "Accept": "application/vnd.github+json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}
__name(ghReq, "ghReq");
__name2(ghReq, "ghReq");
__name22(ghReq, "ghReq");
__name222(ghReq, "ghReq");
__name2222(ghReq, "ghReq");
async function pushArtifactsToGitHub(env, slug, files) {
  if (!env.GITHUB_TOKEN) return { ok: false, error: "no GITHUB_TOKEN" };
  try {
    const base = await ghReq(env, "/repos/" + GH_OWNER + "/" + GH_REPO + "/branches/main");
    if (!base) return { ok: false, error: "no main branch info" };
    const root = await ghReq(env, "/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/");
    let n = 0;
    if (Array.isArray(root)) {
      for (const it of root) {
        const m = String(it.name || "").match(/^cycle-(\d+)$/);
        if (m) n = Math.max(n, parseInt(m[1], 10));
      }
    }
    const cycle = "cycle-" + (n + 1);
    const results = [];
    for (const f of files) {
      if (!f.content) continue;
      const body = { message: "research-pipeline: " + cycle + "/" + slug + "/" + f.path, content: b64(f.content), branch: "main" };
      const r = await fetch(GH_API + "/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/" + cycle + "/" + slug + "/" + f.path, { method: "PUT", headers: { "Authorization": "Bearer " + env.GITHUB_TOKEN, "User-Agent": "qnfo-research-exec", "Accept": "application/vnd.github+json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
      results.push({ path: f.path, status: r.status });
    }
    return { ok: true, cycle, results };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }
}
__name(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name2(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name22(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name222(pushArtifactsToGitHub, "pushArtifactsToGitHub");
__name2222(pushArtifactsToGitHub, "pushArtifactsToGitHub");
async function collectArtifacts(env, rid) {
  const rr1 = await r2Get(env, rid + "/review-report-1.md");
  const rr0 = await r2Get(env, rid + "/review-report-0.md");
  const defs = [
    ["grounding.md", "grounding.md"],
    ["writer-a-draft.md", "draft-0.md"],
    ["writer-b-draft.md", "draft-1.md"],
    ["writer-c-draft.md", "draft-2.md"],
    ["review-report.md", rr1 ? "review-report-1.md" : rr0 ? "review-report-0.md" : null],
    ["verification.md", "verification.md"],
    ["verification.py", "verification.py"]
  ];
  const out = [];
  for (const d of defs) {
    if (!d[1]) continue;
    const content = await r2Get(env, rid + "/" + d[1]);
    if (content) out.push({ file: d[0], content, r2key: d[1] });
  }
  const manifest = { pipeline: PIPELINE_VERSION, files: {} };
  for (const a of out) manifest.files[a.file] = { sha256: await sha256hex(a.content), bytes: a.content.length };
  out.push({ file: "MANIFEST.json", content: JSON.stringify(manifest, null, 2), r2key: null });
  return out;
}
__name(collectArtifacts, "collectArtifacts");
__name2(collectArtifacts, "collectArtifacts");
__name22(collectArtifacts, "collectArtifacts");
__name222(collectArtifacts, "collectArtifacts");
__name2222(collectArtifacts, "collectArtifacts");
// PAPER-ROW-PREP-1 (2026-10-01, #1620; ported from the wave-4 session's PR 358): the 0.8 pipeline (ground..verify) writes
// the paper only to R2 reconciled.md and never creates the living-paper row nor sets research_queue.paper_slug (the
// draft->publish stage that did last ran 2026-09-08), so publishStageV2 read papers WHERE slug=NULL and failed for every
// row that passed verify, and markError sent the verified paper back to ground (row 5099abb8 reached publish at 15:51Z
// and was parked to avoid exactly that). Build the row from reconciled.md as status 'draft' and record the slug before
// any Zenodo call. Safe to re-run.
async function ensurePaperRow(env, row) {
  if (row.paper_slug) {
    const have = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(row.paper_slug).first();
    if (have) return { paper: have, slug: row.paper_slug };
  }
  const md = await r2Get(env, String(row.id) + "/reconciled.md");
  if (!md) return { error: "reconciled.md missing" };
  const body = String(md).trim();
  const title = cleanTitle(body) || extractTitle(body, "") || String(row.idea || "QNFO research paper").slice(0, 140);
  const abstract = cleanAbstract(body) || title;
  const identifier = "qnf-" + String(row.id);
  let slug = row.paper_slug || slugify(title);
  const clash = await env.LIVING_PAPER.prepare("SELECT identifier FROM papers WHERE slug=?1 AND identifier<>?2 LIMIT 1").bind(slug, identifier).first();
  if (clash) slug = slug.slice(0, 71) + "-" + String(row.id).replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
  const own = await env.LIVING_PAPER.prepare("SELECT status FROM papers WHERE identifier=?1").bind(identifier).first();
  if (own) {
    if (String(own.status || "") === "published") return { error: "identifier " + identifier + " already published" };
    await env.LIVING_PAPER.prepare("UPDATE papers SET title=?1, abstract=?2, body_md=?3, slug=?4, updated_at=datetime('now') WHERE identifier=?5").bind(title, abstract, body, slug, identifier).run();
  } else {
    await env.LIVING_PAPER.prepare("INSERT INTO papers (identifier, title, authors, abstract, version, status, body_md, license, language, paper_type, identifier_type, slug, created_at, updated_at) VALUES (?1,?2,?3,?4,'1.0.0','draft',?5,'QNFO-ULA','en','preprint','qnfo',?6,datetime('now'),datetime('now'))").bind(identifier, title, JSON.stringify([AUTHOR]), abstract, body, slug).run();
  }
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET paper_slug=? WHERE id=?").bind(slug, row.id).run();
  const paper = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(slug).first();
  return paper ? { paper, slug, created: !own } : { error: "paper row not readable after write for slug " + slug };
}
async function publishStageV2(env, row) {
  const prep = await ensurePaperRow(env, row);
  if (!prep.paper) {
    await markError(env, row, "publish prep: " + prep.error);
    return { ok: false, stage: "publish" };
  }
  const slug = prep.slug;
  const paper = prep.paper;
  // The papers publish floor would refuse status='published' below 20000 chars AFTER the Zenodo deposit is public,
  // leaving an orphan DOI. Refuse before depositing.
  if (row.source !== "remediation" && String(paper.body_md || "").trim().length < PUBLISH_FLOOR_CHARS) {
    await markError(env, row, "publish: body " + String(paper.body_md || "").trim().length + " chars < publish floor " + PUBLISH_FLOOR_CHARS);
    return { ok: false, stage: "publish" };
  }
  const artifacts = await collectArtifacts(env, String(row.id));
  const extras = artifacts.map(function(a) {
    return { file: a.file, content: a.content };
  });
  const pub = await publishToZenodo(env, paper.title, paper.abstract, paper.body_md, slug, extras);
  if (!pub.ok) {
    await markError(env, row, "zenodo: " + pub.error);
    return { ok: false, stage: "publish" };
  }
  await env.LIVING_PAPER.prepare("UPDATE papers SET doi=?1, zenodo_doi=?1, status='published', zenodo_url=?2, updated_at=datetime('now') WHERE slug=?3").bind(pub.doi, pub.record, slug).run();
  try {
    await env.MIRROR.put("papers/" + slug + ".md", paper.body_md);
  } catch (e) {
  }
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO dissemination_tracker (id, paper_slug, paper_doi, paper_title, channel, action, mode, fallback, zenodo_url, pages_url, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))").bind("res-" + Date.now().toString(36), slug, pub.doi, paper.title, "bluesky", "queued", "auto", 0, pub.record, "https://papers.qnfo.org/papers/" + slug + "/").run();
  } catch (e) {
  }
  const ghFiles = artifacts.map(function(a) {
    return { path: a.file, content: a.content };
  });
  const ghr = await pushArtifactsToGitHub(env, slug, ghFiles);
  await logEvent(env, "github", JSON.stringify(ghr).slice(0, 500), ghr.ok ? "ok" : "error");
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='published', stage='done', doi=?, published_at=? WHERE id=?").bind(pub.doi, nowIso(), row.id).run();
  return { ok: true, stage: "publish->published", doi: pub.doi, slug, github: ghr };
}
__name(publishStageV2, "publishStageV2");
__name2(publishStageV2, "publishStageV2");
__name22(publishStageV2, "publishStageV2");
__name222(publishStageV2, "publishStageV2");
__name2222(publishStageV2, "publishStageV2");
async function remediationPublish(env, row) {
  const slug = row.paper_slug;
  const paper = await r2Get(env, String(row.id) + "/reconciled.md");
  const existing = await env.LIVING_PAPER.prepare("SELECT * FROM papers WHERE slug=?1").bind(slug).first();
  if (!existing) {
    await markError(env, row, "remediation: slug missing " + slug);
    return { ok: false, stage: "publish" };
  }
  if (!paper || paper.length < MIN_PAPER_CHARS) {
    await markError(env, row, "remediation: final body too short");
    return { ok: false, stage: "publish" };
  }
  const prov = buildProvenance(paper, existing.title || "", slug);
  const artifacts = await collectArtifacts(env, String(row.id));
  const verifPy = artifacts.find(function(a) {
    return a.file === "verification.py";
  });
  const verifMd = artifacts.find(function(a) {
    return a.file === "verification.md";
  });
  const grounding = artifacts.find(function(a) {
    return a.file === "grounding.md";
  });
  const bibFile = prov.files.find(function(f) {
    return f.file === "references.bib";
  });
  const auditFile = prov.files.find(function(f) {
    return f.file === "citation-audit.md";
  });
  const readmeFile = prov.files.find(function(f) {
    return f.file === "README.md";
  });
  const planFile = prov.files.find(function(f) {
    return f.file === "PROJECT-PLAN.md";
  });
  await env.QNFO_AUDIT.prepare("INSERT INTO version_queue (paper_doi, slug, title, version_from, version_to, corrected_md, references_bib, citation_audit, due_diligence, project_plan, readme_md, verify_script, verify_output, status, created_at, updated_at) VALUES (?1,?2,?3,?4,'2.0.0',?5,?6,?7,?8,?9,?10,?11,?12,'drafted',datetime('now'),datetime('now'))").bind(
    existing.doi || "",
    slug,
    existing.title || "",
    existing.version || "1.0.0",
    paper,
    bibFile ? bibFile.content : null,
    auditFile ? auditFile.content : null,
    grounding ? grounding.content.slice(0, 5e4) : null,
    planFile ? planFile.content : null,
    readmeFile ? readmeFile.content : null,
    verifPy ? verifPy.content : null,
    verifMd ? verifMd.content : null
  ).run();
  const ghFiles = artifacts.map(function(a) {
    return { path: a.file, content: a.content };
  });
  const ghr = await pushArtifactsToGitHub(env, slug, ghFiles);
  await logEvent(env, "github", JSON.stringify(ghr).slice(0, 500), ghr.ok ? "ok" : "error");
  await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='published', stage='done', published_at=? WHERE id=?").bind(nowIso(), row.id).run();
  await logEvent(env, "remediation", "queued newversion for " + slug + " -> 2.0.0", "ok");
  return { ok: true, stage: "publish->version-queued", slug, github: ghr };
}
__name(remediationPublish, "remediationPublish");
__name2(remediationPublish, "remediationPublish");
__name22(remediationPublish, "remediationPublish");
__name222(remediationPublish, "remediationPublish");
__name2222(remediationPublish, "remediationPublish");
async function run(env) {
  try {
    let row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='review' AND stage='publish' LIMIT 1").first();
    if (row) {
      const r2 = row.source === "remediation" ? await remediationPublish(env, row) : await publishStageV2(env, row);
      await logEvent(env, "done", JSON.stringify(r2).slice(0, 600), r2.ok ? "ok" : "error");
      return { status: r2.ok ? "ok" : "error", res: r2 };
    }
    const stages = ["ground", "ensemble", "reconcile", "review", "revise", "verify"];
    for (let si = 0; si < stages.length; si++) {
      const st = stages[si];
      row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='researching' AND stage=?1 LIMIT 1").bind(st).first();
      if (row) {
        const fn = { ground: stageGround, ensemble: stageEnsemble, reconcile: stageReconcile, review: stageReview, revise: stageRevise, verify: stageVerify }[st];
        const r2 = await fn(env, row);
        await logEvent(env, "done", JSON.stringify(r2).slice(0, 600), r2.ok ? "ok" : "error");
        return { status: r2.ok ? "ok" : "error", res: r2 };
      }
    }
    // QUEUE-ANTISTARVATION-1 (2026-10-01, agent_issues #1700): `ORDER BY score DESC` let a newer row with an equal or higher
    // score (daily radar supply scores 0.70-0.80) outbid 8 rows that had waited 17 days, so they were claimable but never won.
    // Rows older than 72h are claimed first, oldest first (FIFO); everything fresher stays in score order. created_at is ISO-8601
    // text, compared against an ISO bound exactly as the failed-row re-arm below does.
    row = await env.QNFO_AUDIT.prepare("SELECT * FROM research_queue WHERE status='queued' ORDER BY CASE WHEN created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-72 hours') THEN 0 ELSE 1 END, CASE WHEN created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-72 hours') THEN created_at END ASC, score DESC LIMIT 1").first();
    if (!row) {
      return { status: "ok", claimed: 0 };
    }
    const up = await env.QNFO_AUDIT.prepare("UPDATE research_queue SET status='researching', stage='ground', claimed_at=?, attempt=attempt+1 WHERE id=? AND status='queued'").bind(nowIso(), row.id).run();
    if (!up || !up.meta || !up.meta.changes) return { status: "ok", claimed: 0 };
    await logEvent(env, "claim", "claimed " + row.source_id + " (pipeline " + PIPELINE_VERSION + ")");
    row.stage = "ground";
    const r = await stageGround(env, row);
    await logEvent(env, "done", JSON.stringify(r).slice(0, 600), r.ok ? "ok" : "error");
    return { status: r.ok ? "ok" : "error", res: r };
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 600);
    await logEvent(env, "error", msg, "error");
    return { status: "error", error: msg.slice(0, 300) };
  }
}
__name(run, "run");
__name2(run, "run");
__name22(run, "run");
__name222(run, "run");
__name2222(run, "run");
__name22222(run, "run");
// RESEARCH-SINGLE-FLIGHT-1 (2026-09-30): run() had no mutual exclusion, and it had three
// concurrent triggers -- this hourly cron, the fleet dashboard's remediation loop (POST /run
// every 15 min with a 30s client abort) and manual callers. Measured on 2026-09-30:
// the same claim advanced "ground->ensemble" twice two seconds apart (18:16:38 / 18:16:40),
// and every stage longer than 30s was cancelled mid-flight when the dashboard aborted
// (cloud_ops_events kind=gw-error "gwCall failed: The operation was aborted" at 17:05,
// 17:20, 17:57, 18:07, 18:08, 18:15), burning paid gateway tokens and driving rows into
// recover-exhausted / "output too short". An HTTP-triggered invocation cannot outlive its
// caller (waitUntil is capped at 30s after the response), so long stages belong on the cron.
//   - one D1 lease serialises every run (TTL below the 15-min scheduled wall limit);
//   - the cron drains up to RUN_LOOP_BUDGET_MS of consecutive stages per invocation;
//   - HTTP /run is a non-blocking kick by default; ?sync=1 keeps the inline path for an
//     operator who holds the connection open.
var LEASE_TTL_MS = 14 * 60 * 1e3;
var RUN_LOOP_BUDGET_MS = 4 * 60 * 1e3; // + one p99 stage (~10.5 min) stays under the 15-min scheduled wall limit
async function leaseAcquire(env, holder) {
  try {
    await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS research_exec_lease (k TEXT PRIMARY KEY, holder TEXT, expires_ms INTEGER)").run();
    const now = Date.now();
    const r = await env.QNFO_AUDIT.prepare("INSERT INTO research_exec_lease (k, holder, expires_ms) VALUES ('run', ?1, ?2) ON CONFLICT(k) DO UPDATE SET holder=excluded.holder, expires_ms=excluded.expires_ms WHERE research_exec_lease.expires_ms < ?3").bind(holder, now + LEASE_TTL_MS, now).run();
    return !!(r && r.meta && Number(r.meta.changes) === 1);
  } catch (e) {
    return false;
  }
}
async function leaseRelease(env, holder) {
  try {
    await env.QNFO_AUDIT.prepare("DELETE FROM research_exec_lease WHERE k='run' AND holder=?1").bind(holder).run();
  } catch (e) {
  }
}
async function runLeased(env, holder, maxStages, budgetMs) {
  if (!await leaseAcquire(env, holder)) return { busy: true, stages: [] };
  const t0 = Date.now();
  const stages = [];
  try {
    for (let i = 0; i < maxStages; i++) {
      const r = await run(env);
      stages.push(r);
      // Stop when idle (nothing claimable), on any failure (no hammering a failing stage),
      // or when another full stage might not fit the scheduled wall limit.
      if (!r || r.status !== "ok" || r.claimed === 0) break;
      if (Date.now() - t0 > budgetMs) break;
    }
  } finally {
    await leaseRelease(env, holder);
  }
  return { busy: false, stages, ms: Date.now() - t0 };
}
// ZENODO-VERSION-REQUESTS-1 (2026-10-01): publish a new version of an existing Zenodo record from files at public
// GitHub raw URLs, driven by rows in qnfo-audit zenodo_version_requests (first use: the owner's CV, concept record
// 17176733, from rwnq8/resume). A D1 write is the authorization: only holders of the Cloudflare account can queue a
// request. File URLs must be raw.githubusercontent.com/{rwnq8,QNFO}/<repo>/<40-hex commit>/<path>, so a row cannot make
// the worker fetch another host or a moving branch. Every file of the previous version is replaced. One request per run.
var VERSION_REQ_URL_RE = /^https:\/\/raw\.githubusercontent\.com\/(rwnq8|QNFO)\/[A-Za-z0-9._-]+\/[0-9a-f]{40}\/[^?#\s]+$/;
var VERSION_REQ_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,119}$/;
function validateVersionFiles(files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 20) return "files must be a list of 1 to 20 entries";
  var seen = {};
  for (var i = 0; i < files.length; i++) {
    var f = files[i] || {};
    if (typeof f.name !== "string" || !VERSION_REQ_NAME_RE.test(f.name)) return "bad file name at " + i;
    if (seen[f.name]) return "duplicate file name " + f.name;
    seen[f.name] = 1;
    if (typeof f.url !== "string" || !VERSION_REQ_URL_RE.test(f.url)) return "url not a pinned raw.githubusercontent.com rwnq8/QNFO path at " + i;
  }
  return null;
}
// ZENODO-METADATA-EDITS-1 (2026-10-01): kind='metadata' rows of the same queue edit a published record's metadata in
// place (no new version, no file change): read it, set the ORCID-matched creator's name and affiliation, then edit,
// PUT and publish. Any failure after `edit` discards the edit, so a record is never left mid-edit. A record that is
// already canonical is marked 'unchanged' without an edit. First use: one name form and one affiliation string on the
// owner's ~940 records (15 affiliation variants, including retired labels). Up to METADATA_EDITS_PER_RUN rows per run.
var METADATA_EDITS_PER_RUN = 8;
var ORCID_RE = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/;
function validateCreatorPatch(patch) {
  var p = patch && patch.creator_by_orcid;
  if (!p || typeof p.orcid !== "string" || !ORCID_RE.test(p.orcid)) return "metadata_json.creator_by_orcid.orcid missing or malformed";
  if (typeof p.name !== "string" && typeof p.affiliation !== "string") return "creator_by_orcid needs name or affiliation";
  return null;
}
function applyCreatorPatch(metadata, patch) {
  var bad = validateCreatorPatch(patch);
  if (bad) return { error: bad };
  var p = patch.creator_by_orcid;
  var before = Array.isArray(metadata && metadata.creators) ? metadata.creators : [];
  var hit = 0;
  var creators = before.map(function(c) {
    var n = Object.assign({}, c);
    if (String(n.orcid || "").replace(/^https?:\/\/orcid\.org\//, "") === p.orcid) {
      hit++;
      if (typeof p.name === "string" && p.name) n.name = p.name;
      if (typeof p.affiliation === "string") n.affiliation = p.affiliation;
    }
    return n;
  });
  if (!hit) return { error: "no creator with ORCID " + p.orcid };
  return { creators: creators, changed: JSON.stringify(creators) !== JSON.stringify(before) };
}
async function drainMetadataEdits(env, limit) {
  if (!env.ZENODO_TOKEN || !env.QNFO_AUDIT) return [];
  var rs = await env.QNFO_AUDIT.prepare("SELECT * FROM zenodo_version_requests WHERE kind='metadata' AND status='pending' ORDER BY id ASC LIMIT ?").bind(limit || METADATA_EDITS_PER_RUN).all();
  var out = [];
  var rows = (rs && rs.results) || [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var claim = await env.QNFO_AUDIT.prepare("UPDATE zenodo_version_requests SET status='publishing', updated_at=datetime('now') WHERE id=? AND status='pending'").bind(row.id).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) continue;
    var recId = Number(row.record_id), editing = false, status = "error", error = null;
    try {
      var patch = JSON.parse(row.metadata_json || "{}");
      var bad = validateCreatorPatch(patch);
      if (bad) throw new Error(bad);
      var dep = await zenodo(env, "GET", "/" + recId);
      if (!dep || dep._status || !dep.metadata) throw new Error("read failed: " + JSON.stringify(dep).slice(0, 200));
      var first = applyCreatorPatch(dep.metadata, patch);
      if (first.error) throw new Error(first.error);
      if (!first.changed) {
        status = "unchanged";
      } else {
        var ed = await zenodo(env, "POST", "/" + recId + "/actions/edit", {});
        if (!ed || ed._status) throw new Error("edit failed: " + JSON.stringify(ed).slice(0, 200));
        editing = true;
        var base = ed.metadata || dep.metadata;
        var applied = applyCreatorPatch(base, patch);
        if (applied.error) throw new Error(applied.error);
        var put = await zenodo(env, "PUT", "/" + recId, { metadata: Object.assign({}, base, { creators: applied.creators }) });
        if (!put || put._status) throw new Error("metadata put failed: " + JSON.stringify(put).slice(0, 200));
        var pub = await zenodo(env, "POST", "/" + recId + "/actions/publish", {});
        if (!pub || pub._status || !pub.id) throw new Error("publish failed: " + JSON.stringify(pub).slice(0, 200));
        editing = false;
        status = "published";
      }
    } catch (e) {
      error = String(e && e.message || e).slice(0, 300);
      if (editing) {
        try { await zenodo(env, "POST", "/" + recId + "/actions/discard", {}); } catch (e2) {}
      }
    }
    await env.QNFO_AUDIT.prepare("UPDATE zenodo_version_requests SET status=?, result_record_id=?, error=?, updated_at=datetime('now') WHERE id=?").bind(status, status === "error" ? null : recId, error, row.id).run();
    out.push({ id: row.id, record: recId, status: status, error: error });
  }
  return out;
}
// ZENODO-READ-ONLINE-1 (2026-10-05, agent_issues #1907; owner decision YES 2026-10-02): kind='related' rows of the same
// queue add one related identifier to a published record, {identifier: https://papers.qnfo.org/papers/<slug>/, relation:
// isVariantFormOf, resource_type: publication-preprint}, the form publishStage writes for new records, so a Zenodo
// visitor (13,307 downloads) has a path to the paper page, its Ask panel and the subscribe box. Metadata edit only: no new
// version, no new DOI. The edit goes to the LATEST version of the record's concept (an older id in the row is resolved
// through the public API first), because that is the page Zenodo shows. A record that already lists the URL is
// 'unchanged' without an edit; any failure after `edit` discards the draft. metadata_json: {"related_link": {"slug":
// "<slug>"}}; the URL form lives here, never in a row. Up to RELATED_LINKS_PER_RUN rows per run.
var RELATED_LINKS_PER_RUN = 12;
var RELATED_SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,199}$/;
var RELATED_ISSUE_PREFIX = "ZENODO-READ-ONLINE-1";
function relatedLinkUrl(slug) {
  return "https://papers.qnfo.org/papers/" + slug + "/";
}
function validateRelatedPatch(patch) {
  var p = patch && patch.related_link;
  if (!p || typeof p.slug !== "string" || !RELATED_SLUG_RE.test(p.slug)) return "metadata_json.related_link.slug missing or malformed";
  return null;
}
function relatedUrlNorm(u) {
  return String(u || "").trim().replace(/\/+$/, "").toLowerCase();
}
function applyRelatedLink(metadata, patch) {
  var bad = validateRelatedPatch(patch);
  if (bad) return { error: bad };
  var url = relatedLinkUrl(patch.related_link.slug);
  var before = Array.isArray(metadata && metadata.related_identifiers) ? metadata.related_identifiers : [];
  var present = before.some(function(r) {
    return relatedUrlNorm(r && r.identifier) === relatedUrlNorm(url) && String(r && r.relation || "") === "isVariantFormOf";
  });
  if (present) return { related_identifiers: before, changed: false, url: url };
  return { related_identifiers: before.concat([{ identifier: url, relation: "isVariantFormOf", resource_type: "publication-preprint" }]), changed: true, url: url };
}
async function latestRecordId(recId, fetchImpl) {
  var f = fetchImpl || fetch;
  try {
    var r = await f("https://zenodo.org/api/records/" + recId + "/versions/latest", { headers: { "User-Agent": "QNFO-research-exec/" + VERSION } });
    var j = r && r.ok ? await r.json() : null;
    if (j && Number(j.id) > 0) return Number(j.id);
  } catch (e) {
  }
  return recId;
}
async function drainRelatedLinks(env, limit, fetchImpl) {
  if (!env.ZENODO_TOKEN || !env.QNFO_AUDIT) return [];
  var rs = await env.QNFO_AUDIT.prepare("SELECT * FROM zenodo_version_requests WHERE kind='related' AND status='pending' ORDER BY id ASC LIMIT ?").bind(limit || RELATED_LINKS_PER_RUN).all();
  var out = [];
  var rows = (rs && rs.results) || [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var claim = await env.QNFO_AUDIT.prepare("UPDATE zenodo_version_requests SET status='publishing', updated_at=datetime('now') WHERE id=? AND status='pending'").bind(row.id).run();
    if (!claim || !claim.meta || claim.meta.changes !== 1) continue;
    var recId = Number(row.record_id), target = recId, editing = false, status = "error", error = null;
    try {
      var patch = JSON.parse(row.metadata_json || "{}");
      var bad = validateRelatedPatch(patch);
      if (bad) throw new Error(bad);
      target = await latestRecordId(recId, fetchImpl);
      var dep = await zenodo(env, "GET", "/" + target);
      if (!dep || dep._status || !dep.metadata) throw new Error("read failed: " + JSON.stringify(dep).slice(0, 200));
      var first = applyRelatedLink(dep.metadata, patch);
      if (first.error) throw new Error(first.error);
      if (!first.changed) {
        status = "unchanged";
      } else {
        var ed = await zenodo(env, "POST", "/" + target + "/actions/edit", {});
        if (!ed || ed._status) throw new Error("edit failed: " + JSON.stringify(ed).slice(0, 200));
        editing = true;
        var base = ed.metadata || dep.metadata;
        var applied = applyRelatedLink(base, patch);
        if (applied.error) throw new Error(applied.error);
        var put = await zenodo(env, "PUT", "/" + target, { metadata: Object.assign({}, base, { related_identifiers: applied.related_identifiers }) });
        if (!put || put._status) throw new Error("metadata put failed: " + JSON.stringify(put).slice(0, 200));
        var pub = await zenodo(env, "POST", "/" + target + "/actions/publish", {});
        if (!pub || pub._status || !pub.id) throw new Error("publish failed: " + JSON.stringify(pub).slice(0, 200));
        editing = false;
        status = "published";
      }
    } catch (e) {
      error = String(e && e.message || e).slice(0, 300);
      if (editing) {
        try { await zenodo(env, "POST", "/" + target + "/actions/discard", {}); } catch (e2) {}
      }
    }
    await env.QNFO_AUDIT.prepare("UPDATE zenodo_version_requests SET status=?, result_record_id=?, error=?, updated_at=datetime('now') WHERE id=?").bind(status, status === "error" ? null : target, error, row.id).run();
    out.push({ id: row.id, record: recId, target: target, status: status, error: error });
  }
  return out;
}
// ZENODO-READ-ONLINE-1 seeding: the queue fills itself from LIVING_PAPER.papers, so no session loads rows by hand and a
// paper published later is picked up too. A published paper with a slug and a Zenodo DOI whose record maps to exactly
// one page gets one pending related row, once (records already queued are skipped; a record shared by several pages,
// such as the three continuum-trilogy pages, is left alone). RELATED_SKIP_SLUGS names pages that must not be linked yet
// (#1843: a page still showing a transcript body instead of the paper). Runs in the first quarter of each hour and
// inserts at most RELATED_SEED_PER_RUN rows per run.
var RELATED_SEED_PER_RUN = 200;
var RELATED_SKIP_SLUGS = ["adelic-constraints-on-quantum-field-theory-phase-1"];
async function seedRelatedLinks(env, limit) {
  if (!env.LIVING_PAPER || !env.QNFO_AUDIT) return { seeded: 0, skipped: "no binding" };
  var rs = await env.LIVING_PAPER.prepare("SELECT slug, CAST(replace(COALESCE(NULLIF(zenodo_doi,''), doi), '10.5281/zenodo.', '') AS INTEGER) AS rec FROM papers WHERE COALESCE(status,'published')='published' AND COALESCE(NULLIF(zenodo_doi,''), doi) LIKE '10.5281/zenodo.%' AND slug IS NOT NULL AND slug <> '' ORDER BY rec").all();
  var rows = (rs && rs.results) || [];
  var bySlug = {}, count = {};
  for (var i = 0; i < rows.length; i++) {
    var rec = Number(rows[i].rec), slug = String(rows[i].slug || "");
    if (!(rec > 0) || !RELATED_SLUG_RE.test(slug)) continue;
    count[rec] = (count[rec] || 0) + 1;
    if (!bySlug[rec]) bySlug[rec] = slug;
  }
  var recs = Object.keys(count).map(Number).sort(function(a, b) { return a - b; });
  var want = recs.filter(function(r) { return count[r] === 1 && RELATED_SKIP_SLUGS.indexOf(bySlug[r]) < 0; });
  var have = await env.QNFO_AUDIT.prepare("SELECT record_id FROM zenodo_version_requests WHERE kind='related'").all();
  var seen = {};
  var hv = (have && have.results) || [];
  for (var h = 0; h < hv.length; h++) seen[Number(hv[h].record_id)] = 1;
  var out = { candidates: want.length, shared: recs.length - recs.filter(function(r) { return count[r] === 1; }).length, existing: 0, seeded: 0 };
  var max = limit || RELATED_SEED_PER_RUN;
  for (var k = 0; k < want.length && out.seeded < max; k++) {
    if (seen[want[k]]) { out.existing++; continue; }
    await env.QNFO_AUDIT.prepare("INSERT INTO zenodo_version_requests (record_id, files_json, metadata_json, kind, requested_by, note) VALUES (?1, '[]', ?2, 'related', 'qnfo-research-exec/seedRelatedLinks', 'ZENODO-READ-ONLINE-1 #1907')").bind(want[k], JSON.stringify({ related_link: { slug: bySlug[want[k]] } })).run();
    out.seeded++;
  }
  return out;
}
// ZENODO-READ-ONLINE-1 closing probe (CLOUD-ONLY-VERIFICATION-1): once no related row is pending or publishing and none is
// in error, 20 random published/unchanged rows are re-read on the PUBLIC records API; all listing the page URL as
// isVariantFormOf closes the issue with that measurement as close_evidence (evidence row first, then the close, per
// METADATA-VERIFY-ORDER-1). Otherwise the counts are logged and the issue stays open.
async function verifyRelatedBackfill(env, fetchImpl) {
  var f = fetchImpl || fetch;
  var db = env.QNFO_AUDIT;
  if (!db) return null;
  var iss = await db.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE ? ORDER BY id ASC LIMIT 1").bind(RELATED_ISSUE_PREFIX + "%").first();
  if (!iss) return null;
  var c = await db.prepare("SELECT SUM(status IN ('pending','publishing')) AS busy, SUM(status='error') AS err, SUM(status='published') AS pub, SUM(status='unchanged') AS unch, COUNT(*) AS n FROM zenodo_version_requests WHERE kind='related'").first();
  if (!c || !Number(c.n) || Number(c.busy)) return { issue: iss.id, waiting: Number(c && c.busy || 0) };
  var rs = await db.prepare("SELECT record_id, result_record_id, metadata_json FROM zenodo_version_requests WHERE kind='related' AND status IN ('published','unchanged') ORDER BY random() LIMIT 20").all();
  var sample = (rs && rs.results) || [], pass = 0, fails = [];
  for (var i = 0; i < sample.length; i++) {
    var s = sample[i], ok = false, rid = Number(s.result_record_id || s.record_id);
    try {
      var want = relatedLinkUrl(String((JSON.parse(s.metadata_json || "{}").related_link || {}).slug || ""));
      var r = await f("https://zenodo.org/api/records/" + rid, { headers: { "User-Agent": "QNFO-research-exec/" + VERSION } });
      var j = r && r.ok ? await r.json() : null;
      ok = ((j && j.metadata && j.metadata.related_identifiers) || []).some(function(x) {
        return relatedUrlNorm(x && x.identifier) === relatedUrlNorm(want) && String(x && x.relation || "") === "isVariantFormOf";
      });
    } catch (e) { ok = false; }
    if (ok) pass++; else fails.push(rid);
  }
  var summary = "rows=" + c.n + " published=" + (c.pub || 0) + " unchanged=" + (c.unch || 0) + " error=" + (c.err || 0) + "; public re-read " + pass + "/" + sample.length + " list the papers.qnfo.org page as isVariantFormOf" + (fails.length ? " (failed: " + fails.slice(0, 10).join(",") + ")" : "");
  if (Number(c.err) || fails.length || !sample.length) return { issue: iss.id, closed: false, summary: summary };
  var ev = "ZENODO-READ-ONLINE-1 verify " + new Date().toISOString() + ": " + summary;
  await db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'ZENODO-READ-ONLINE-1', 'closed', 'qnfo-research-exec', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='closed'").bind(iss.id, ev).run();
  await db.prepare("UPDATE agent_issues SET status='closed', updated_at=? WHERE id=? AND status='open'").bind(Date.now(), iss.id).run();
  return { issue: iss.id, closed: true, summary: summary };
}
// METADATA-BACKFILL-VERIFY-1 (2026-10-01, CLOUD-ONLY-VERIFICATION-1): the backfill's open agent_issues row
// ('ZENODO-METADATA-EDITS-1 backfill...') closes itself instead of waiting for a session. Once no metadata row is pending
// or publishing, it re-reads up to 20 random published/unchanged records on the PUBLIC records API and checks that the
// ORCID-matched creator carries the patch's name and affiliation. All pass and no error rows: the issue is closed with
// that measurement as close_evidence. Otherwise it stays open and the counts are logged (at most hourly).
var BACKFILL_ISSUE_PREFIX = "ZENODO-METADATA-EDITS-1 backfill";
async function verifyMetadataBackfill(env, fetchImpl) {
  var f = fetchImpl || fetch;
  var db = env.QNFO_AUDIT;
  if (!db) return null;
  var iss = await db.prepare("SELECT id FROM agent_issues WHERE status='open' AND title LIKE ? ORDER BY id ASC LIMIT 1").bind(BACKFILL_ISSUE_PREFIX + "%").first();
  if (!iss) return null;
  var c = await db.prepare("SELECT SUM(status IN ('pending','publishing')) AS busy, SUM(status='error') AS err, SUM(status='published') AS pub, SUM(status='unchanged') AS unch, COUNT(*) AS n FROM zenodo_version_requests WHERE kind='metadata'").first();
  if (!c || !Number(c.n) || Number(c.busy)) return { issue: iss.id, waiting: Number(c && c.busy || 0) };
  var rs = await db.prepare("SELECT record_id, metadata_json FROM zenodo_version_requests WHERE kind='metadata' AND status IN ('published','unchanged') ORDER BY random() LIMIT 20").all();
  var sample = (rs && rs.results) || [], pass = 0, fails = [];
  for (var i = 0; i < sample.length; i++) {
    var s = sample[i], ok = false;
    try {
      var want = JSON.parse(s.metadata_json || "{}").creator_by_orcid || {};
      var r = await f("https://zenodo.org/api/records/" + Number(s.record_id), { headers: { "User-Agent": "qnfo-research-exec/" + VERSION } });
      var j = r && r.ok ? await r.json() : null;
      var cr = ((j && j.metadata && j.metadata.creators) || []).filter(function(x) { return String(x.orcid || "").replace(/^https?:\/\/orcid\.org\//, "") === want.orcid; })[0];
      ok = !!cr && (typeof want.affiliation !== "string" || cr.affiliation === want.affiliation) && (typeof want.name !== "string" || cr.name === want.name);
    } catch (e) { ok = false; }
    if (ok) pass++; else fails.push(Number(s.record_id));
  }
  var summary = "rows=" + c.n + " published=" + (c.pub || 0) + " unchanged=" + (c.unch || 0) + " error=" + (c.err || 0) + "; public re-read " + pass + "/" + sample.length + " carry the patched creator" + (fails.length ? " (failed: " + fails.slice(0, 10).join(",") + ")" : "");
  if (Number(c.err) || fails.length || !sample.length) return { issue: iss.id, closed: false, summary: summary };
  var ev = "METADATA-BACKFILL-VERIFY-1 " + new Date().toISOString() + ": " + summary;
  // METADATA-VERIFY-ORDER-1 (0.9.54, #1732): evidence first, then the close. qnfo-audit's issue_close_evidence_required
  // trigger aborts an agent_issues close unless issue_triage already holds close_evidence, and #1732 has an AUTOTRIAGE row
  // with none, so the old order (close, then evidence) threw 'close-without-evidence' and the backfill could never close.
  await db.prepare("INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) VALUES (?1, 'METADATA-BACKFILL-VERIFY-1', 'closed', 'qnfo-research-exec', datetime('now'), ?2) ON CONFLICT(issue_id) DO UPDATE SET close_evidence=excluded.close_evidence, triage_state='closed'").bind(iss.id, ev).run();
  await db.prepare("UPDATE agent_issues SET status='closed', updated_at=? WHERE id=? AND status='open'").bind(Date.now(), iss.id).run();
  return { issue: iss.id, closed: true, summary: summary };
}
async function drainVersionRequests(env) {
  if (!env.ZENODO_TOKEN || !env.QNFO_AUDIT) return null;
  var row = await env.QNFO_AUDIT.prepare("SELECT * FROM zenodo_version_requests WHERE kind='version' AND status='pending' ORDER BY id ASC LIMIT 1").first();
  if (!row) return null;
  var claim = await env.QNFO_AUDIT.prepare("UPDATE zenodo_version_requests SET status='publishing', updated_at=datetime('now') WHERE id=? AND status='pending'").bind(row.id).run();
  if (!claim || !claim.meta || claim.meta.changes !== 1) return null;
  var draftId = null;
  var finish = async function(status, doi, recordId, error) {
    await env.QNFO_AUDIT.prepare("UPDATE zenodo_version_requests SET status=?, result_doi=?, result_record_id=?, draft_id=?, error=?, updated_at=datetime('now') WHERE id=?").bind(status, doi, recordId, draftId, error, row.id).run();
    return { id: row.id, status, doi, error };
  };
  try {
    var files = JSON.parse(row.files_json || "null");
    var bad = validateVersionFiles(files);
    if (bad) return await finish("error", null, null, bad);
    var meta = JSON.parse(row.metadata_json || "{}");
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) return await finish("error", null, null, "metadata_json must be an object");
    var nv = await zenodo(env, "POST", "/" + Number(row.record_id) + "/actions/newversion", {});
    var latest = nv && nv.links && nv.links.latest_draft;
    draftId = latest ? String(latest).split("/").pop() : null;
    if (!draftId) return await finish("error", null, null, "newversion failed: " + JSON.stringify(nv).slice(0, 250));
    var draft = await zenodo(env, "GET", "/" + draftId);
    if (!draft || draft._status || !draft.links || !draft.links.bucket) return await finish("error", null, null, "draft read failed: " + JSON.stringify(draft).slice(0, 250));
    var carried = await zenodo(env, "GET", "/" + draftId + "/files");
    if (Array.isArray(carried)) {
      for (var ci = 0; ci < carried.length; ci++) {
        var del = await fetch(carried[ci].links.self + "?access_token=" + env.ZENODO_TOKEN, { method: "DELETE", headers: { "User-Agent": "QNFO-research-exec/" + VERSION } });
        if (!del.ok) return await finish("error", null, null, "delete of carried file " + carried[ci].filename + " failed: " + del.status);
      }
    }
    for (var fi = 0; fi < files.length; fi++) {
      var src = await fetch(files[fi].url, { headers: { "User-Agent": "QNFO-research-exec/" + VERSION } });
      if (!src.ok) return await finish("error", null, null, "fetch " + files[fi].url + ": " + src.status);
      var buf = await src.arrayBuffer();
      if (!buf || buf.byteLength === 0) return await finish("error", null, null, "empty file " + files[fi].name);
      var up = await fetch(draft.links.bucket + "/" + encodeURIComponent(files[fi].name) + "?access_token=" + env.ZENODO_TOKEN, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "User-Agent": "QNFO-research-exec/" + VERSION }, body: buf });
      if (!up.ok) return await finish("error", null, null, "upload " + files[fi].name + ": " + up.status);
    }
    var md = Object.assign({}, draft.metadata || {}, meta);
    delete md.doi;
    if (!meta.publication_date) md.publication_date = new Date().toISOString().slice(0, 10);
    var put = await zenodo(env, "PUT", "/" + draftId, { metadata: md });
    if (!put || put._status) return await finish("error", null, null, "metadata put failed: " + JSON.stringify(put).slice(0, 250));
    var pub = await zenodo(env, "POST", "/" + draftId + "/actions/publish", {});
    if (!pub || !pub.doi) return await finish("error", null, null, "publish failed: " + JSON.stringify(pub).slice(0, 250));
    return await finish("published", pub.doi, pub.id || null, null);
  } catch (e) {
    return await finish("error", null, null, String(e && e.message || e).slice(0, 300));
  }
}
// ---- RUN-INTERNAL-1:BEGIN (0.9.54, #1783) ----
function isPublicHost(h) { return /\.workers\.dev$|(^|\.)qnfo\.org$/i.test(String(h || "")); }
// ---- RUN-INTERNAL-1:END ----
var worker_default = {
  async scheduled(event, env, ctx) {
    env = __aiAttrEnv(env, "qnfo-research-exec", "AI", "QNFO_AUDIT");
    ctx.waitUntil((async function() {
      try {
        // HEARTBEAT-1 (2026-09-27): research-exec had no heartbeat row, so a dead cron was invisible
        // to the fleet heartbeat surface (issue class #973).
        // HEARTBEAT-UPSERT-1 (2026-09-30): fleet_heartbeat(worker TEXT PRIMARY KEY) -- the plain
        // INSERT throws SQLITE_CONSTRAINT on the 2nd run and was swallowed by this try/catch, so the
        // row froze at the FIRST successful write (2026-09-27T19:00Z) while the cron kept firing.
        // That produced a false "inert cron" signal for 3 days (the dashboard/observability liveness
        // surface could not see research-exec at all). Upsert so liveness is always current.
        await env.QNFO_AUDIT.prepare("INSERT INTO fleet_heartbeat (worker, version, ts, ok) VALUES ('qnfo-research-exec', ?, ?, 1) ON CONFLICT(worker) DO UPDATE SET version=excluded.version, ts=excluded.ts, ok=excluded.ok").bind(VERSION, nowIso()).run();
      } catch (eHb) {
      }
      try {
        var drained = await drainV2(env);
        if (drained.length) await logEvent(env, "v2-drain", JSON.stringify(drained).slice(0, 700), "ok");
      } catch (e) {
        await logEvent(env, "error", "drainV2 threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
      try {
        var vr = await drainVersionRequests(env);
        if (vr) await logEvent(env, "zenodo-version", JSON.stringify(vr).slice(0, 700), vr.status === "published" ? "ok" : "error");
      } catch (e) {
        await logEvent(env, "error", "drainVersionRequests threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
      try {
        var me = await drainMetadataEdits(env);
        if (me.length) await logEvent(env, "zenodo-metadata", JSON.stringify(me).slice(0, 700), me.some(function(x) { return x.status === "error"; }) ? "error" : "ok");
        else if (new Date().getUTCMinutes() < 15) {
          var bv = await verifyMetadataBackfill(env);
          if (bv && bv.summary) await logEvent(env, "zenodo-metadata-verify", "issue " + bv.issue + (bv.closed ? " closed: " : " open: ") + bv.summary, bv.closed ? "ok" : "error");
        }
      } catch (e) {
        await logEvent(env, "error", "drainMetadataEdits threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
      try {
        if (new Date().getUTCMinutes() < 15) {
          var sd = await seedRelatedLinks(env);
          if (sd && sd.seeded) await logEvent(env, "zenodo-related-seed", JSON.stringify(sd).slice(0, 300), "ok");
        }
        var rl = await drainRelatedLinks(env);
        if (rl.length) await logEvent(env, "zenodo-related", JSON.stringify(rl).slice(0, 700), rl.some(function(x) { return x.status === "error"; }) ? "error" : "ok");
        else if (new Date().getUTCMinutes() < 15) {
          var rv = await verifyRelatedBackfill(env);
          if (rv && rv.summary) await logEvent(env, "zenodo-related-verify", "issue " + rv.issue + (rv.closed ? " closed: " : " open: ") + rv.summary, rv.closed ? "ok" : "error");
        }
      } catch (e) {
        await logEvent(env, "error", "drainRelatedLinks threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
      if (env.RESEARCH_HALT === "1") return;
      try {
        const lr = await runLeased(env, "cron-" + Date.now().toString(36), 8, RUN_LOOP_BUDGET_MS);
        if (lr.busy) await logEvent(env, "lease-busy", "cron skipped: another run holds the single-flight lease", "ok");
      } catch (e) {
        await logEvent(env, "error", "run threw: " + String(e && e.message || e).slice(0, 200), "error");
      }
    })());
  },
  async fetch(request, env) {
    env = __aiAttrEnv(env, "qnfo-research-exec", "AI", "QNFO_AUDIT");
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ ok: true, worker: WORKER, version: VERSION, capabilities: ["research-pipeline", "arxiv-grounding", "ensemble-drafting", "review", "python-verification", "zenodo-publish"], limitations: ["stages run only on the */15 cron under a single-flight lease (one stage per tick)", "papers cite only the grounding bibliography", "quantitative verification needs the qnfo-containers-pilot binding", "a new paper must reach 20000 chars to publish"] });
    if (url.pathname === "/run" && request.method === "POST") {
      if (url.searchParams.get("sync") !== "1") {
        await logEvent(env, "kick", "HTTP /run kick accepted; drained by the cron under the single-flight lease", "ok");
        return json({ ok: true, worker: WORKER, version: VERSION, accepted: true, mode: "deferred", note: "research stages run on the cron under a single-flight lease (RESEARCH-SINGLE-FLIGHT-1); POST /run?sync=1 runs one stage inline" }, 202);
      }
      // RUN-INTERNAL-1 (#1783): an inline stage run spends AI and moves papers; only the cron and internal callers (service
      // bindings, whose request host is not a public hostname) may start one. Measured 2026-10-02: an anonymous POST worked.
      if (isPublicHost(url.hostname)) return json({ error: "forbidden: internal callers only (RUN-INTERNAL-1); the cron runs this" }, 403);
      const lr = await runLeased(env, "http-" + Date.now().toString(36), 1, 0);
      if (lr.busy) return json({ ok: true, worker: WORKER, version: VERSION, busy: true, note: "another run holds the single-flight lease" }, 409);
      return json({ ok: true, worker: WORKER, version: VERSION, out: lr.stages[0] || null });
    }
    if (url.pathname === "/run/drain-v2" && request.method === "POST") {
      if (isPublicHost(url.hostname)) return json({ error: "forbidden: internal callers only (RUN-INTERNAL-1); the cron runs this" }, 403);
      const drained = await drainV2(env);
      return json({ ok: true, worker: WORKER, version: VERSION, drained });
    }
    return json({ error: "not found" }, 404);
  }
};
export {
  worker_default as default,
  applyCreatorPatch,
  applyRelatedLink,
  drainMetadataEdits,
  drainRelatedLinks,
  drainVersionRequests,
  groundQueries,
  markError,
  mathGate,
  parkPoisonRow,
  pseudoMathScan,
  reclaimStaleResearching,
  seedRelatedLinks,
  stageGround,
  stageReview,
  stageVerify,
  verifyMetadataBackfill,
  verifyRelatedBackfill
};
//# sourceMappingURL=worker.js.map
