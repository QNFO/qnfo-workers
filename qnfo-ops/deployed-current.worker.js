// qnfo-ops v1.0.0 - OPS/INFRASTRUCTURE AI EXECUTION ENDPOINT
// Separate from qnfo-ai (research) and personal-api (personal). OpenAI-compatible
// gateway for DeepChat + ChatBox that executes code/actions on the cloud-native fleet.
// ISOLATION: logs only to qnfo-audit (ops_ai_log + cloud_ops_events); NEVER writes
// ai_queries / chatbox_conversations / intent_express_log; never calls the intent
// orchestrator -> the research feed and ideas stream stay clean.
var VERSION = "1.0.1";
var WORKER = "qnfo-ops";
var ROUTES = ["/health", "/", "/fleet", "/v1/models", "/v1/models/:id", "/v1/chat/completions", "/chat/completions"];
var DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
var UPSTREAM_MODEL = "deepseek-v4-flash";
var DEFAULT_MAX_OUT = 16384;
var MAX_TOOL_ITERS = 5;
var MODEL_CTX = 1048576; // verified by live probe: max_tokens=384000 accepted on direct API
var CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Requested-With",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: CORS_HEADERS });
}
function clamp(n, cap) {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 4096;
  return Math.min(v, cap || DEFAULT_MAX_OUT);
}
async function authOk(header, env) {
  const expected = env.OPS_ROUTER_AUTH_KEY;
  if (!header || !header.startsWith("Bearer ") || !expected) return false;
  const provided = header.slice("Bearer ".length);
  const enc = new TextEncoder();
  const a = await crypto.subtle.digest("SHA-256", enc.encode(provided));
  const b = await crypto.subtle.digest("SHA-256", enc.encode(expected));
  const b2 = env.OPS_ROUTER_AUTH_KEY_2 ? await crypto.subtle.digest("SHA-256", enc.encode(env.OPS_ROUTER_AUTH_KEY_2)) : null;
  return timingSafeEqual(a, b) || (b2 ? timingSafeEqual(a, b2) : false);
}
function timingSafeEqual(a, b) {
  const aa = new Uint8Array(a); const bb = new Uint8Array(b);
  if (aa.length !== bb.length) return false;
  let d = 0; for (let i = 0; i < aa.length; i++) d |= aa[i] ^ bb[i];
  return d === 0;
}
function estTokens(text) { return Math.ceil(String(text || "").length / 3); }
function iso() { return new Date().toISOString(); }
function randId(prefix) { return (prefix || "id-") + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-6); }
function snippet(v, n) {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s ? s.slice(0, n || 2000) : "";
}
// ---------------------------------------------------------------- system prompt
var OPS_SYSTEM_PROMPT = [
  "You are the QNFO ops/infrastructure execution endpoint (qnfo-ops), a SEPARATE endpoint from the QNFO research endpoint and the personal twin.",
  "Scope: operations on the QNFO cloud-native fleet - workers, D1, R2, Vectorize, crons, email accounts, agent backlog, audits, and running code. Research questions belong on the research endpoint; ops commands belong here.",
  "Rules:",
  "1. EXECUTE, DO NOT NARRATE: when the user asks for an ops action (check email, list open issues, fleet status, run an audit, execute this snippet), call the matching tool and report REAL results with evidence. Never fabricate tool output, counts, versions, or statuses.",
  "2. Tools: fleet_status, ops_issues_list, ops_issue_run, ops_d1_query, email_check, email_stats, ops_fleet_log.",
  "3. Heavy or mutating actions (ops_issue_run triggers the backlog-executor drain) require confirm:true; with confirm false or omitted, return the plan and what would run, without executing.",
  "4. ops_d1_query is READ-ONLY SELECT/WITH on the qnfo-audit database (tables incl. agent_issues, ai_queries, cloud_ops_events, ops_ai_log, handoffs, outreach_log, sent_log). Never attempt writes; never echo credentials; add LIMIT unless the query is an aggregate.",
  "5. Arbitrary JavaScript execution is NOT available on the Cloudflare Workers runtime (dynamic code generation is disallowed). Code-shaped ops requests are executed through the typed tools: SQL via ops_d1_query, drains via ops_issue_run, probes via fleet_status, mailbox reads via email_check/email_stats. State this constraint plainly when asked to run raw JS.",
  "6. Answer concisely with Markdown; lead with the direct result and the evidence the tools returned (versions, counts, ids, statuses). Plain neutral prose, no persona, no filler, no meta-commentary.",
  "7. Never claim an action succeeded unless the tool returned ok. On error report the exact error text.",
  "8. Every executed tool call is logged to qnfo-audit (ops_ai_log + cloud_ops_events). This log is the audit trail for everything you do.",
  "9. Internal fleet context: qnfo-ai = research gateway, qnfo-ops = this ops endpoint, personal-api = personal twin, qnfo-intent-orchestrator = ideas/intents stream (NOT used here), qnfo-backlog-exec = agent-issue drainer, qnfo-cloud-ops = weekly visibility digest, qnfo-audit D1 = ops/audit store, living-paper D1 = research papers store."
].join(String.fromCharCode(10));

// ---------------------------------------------------------------- tools
var OPS_TOOLS = [
  { name: "fleet_status", description: "Probe /health of the internal fleet services via service bindings (qnfo-lifecycle, qnfo-email, qnfo-email-orchestrator, qnfo-paper-indexer, qnfo-kaizen, qnfo-gateway, qnfo-archive, qnfo-ai, qnfo-ai-search, qnfo-memory-mcp, qnfo-skill-sync, qnfo-backlog-exec). Returns ok/http/version per service.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ops_issues_list", description: "List agent issues from qnfo-audit agent_issues (the ops backlog). Default: open issues, newest first.", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "closed", "all"], description: "issue status filter (default open)" }, priority: { type: "string", enum: ["high", "medium", "low"], description: "optional priority filter" }, limit: { type: "number", description: "max rows 1-50 (default 20)" } }, additionalProperties: false } },
  { name: "ops_issue_run", description: "Trigger the qnfo-backlog-exec drain on open agent_issues (safe by design: it only auto-closes health-availability rows whose re-probe PASSes; failures are escalated to alerts). confirm must be true to execute; otherwise returns the plan.", parameters: { type: "object", properties: { confirm: { type: "boolean", description: "must be true to trigger the drain" } }, additionalProperties: false } },
  { name: "ops_d1_query", description: "READ-ONLY query on the qnfo-audit D1 database. Accepts a single SELECT or WITH...SELECT statement; aggregates exempt from LIMIT; plain selects need LIMIT. Returns up to 100 rows.", parameters: { type: "object", properties: { sql: { type: "string", description: "read-only SQL (SELECT/WITH)" } }, required: ["sql"], additionalProperties: false } },
  { name: "email_check", description: "List recent inbound/outbound qnfo.org-domain emails with status (read-only; does not send anything).", parameters: { type: "object", properties: { limit: { type: "number", description: "1-20 (default 8)" }, status: { type: "string", description: "optional status filter (received/processed/sent/replied/archived/spam/read/rejected)" } }, additionalProperties: false } },
  { name: "email_stats", description: "Email account stats: total messages, last 24h, by classification, by status.", parameters: { type: "object", properties: {}, additionalProperties: false } },
  { name: "ops_fleet_log", description: "Read the last ops_ai_log entries (this endpoint execution log, qnfo-audit). Use when the user asks what the ops endpoint has done recently.", parameters: { type: "object", properties: { limit: { type: "number", description: "1-20 (default 5)" } }, additionalProperties: false } }
];
function toolsPayload() {
  return OPS_TOOLS.map(function (t) { return { type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }; });
}

// ---------------------------------------------------------------- fleet probe
var FLEET = [
  { name: "qnfo-lifecycle", binding: "LIFECYCLE" },
  { name: "qnfo-email", binding: "EMAIL", auth: true },
  { name: "qnfo-email-orchestrator", binding: "ORCH" },
  { name: "qnfo-paper-indexer", binding: "INDEXER", countPath: "/count" },
  { name: "qnfo-kaizen", binding: "KAIZEN" },
  { name: "qnfo-gateway", binding: "GATEWAY" },
  { name: "qnfo-archive", binding: "ARCHIVE" },
  { name: "qnfo-ai", binding: "AI" },
  { name: "qnfo-ai-search", binding: "AISEARCH" },
  { name: "qnfo-memory-mcp", binding: "MEMORY" },
  { name: "qnfo-skill-sync", binding: "SKILLSYNC" },
  { name: "qnfo-backlog-exec", binding: "BACKLOG" }
];
async function probeService(env, f, path) {
  const svc = env[f.binding];
  if (!svc || !svc.fetch) return { ok: false, http: 0, body: {}, error: "binding missing" };
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, 5000);
  try {
    const headers = {};
    if (f.auth && env.EMAIL_API_KEY) headers["Authorization"] = "Bearer " + env.EMAIL_API_KEY;
    const resp = await svc.fetch("https://" + f.binding.toLowerCase() + ".internal" + (path || "/health"), { signal: ctrl.signal, headers: headers });
    clearTimeout(t);
    let body = {};
    try { body = await resp.json(); } catch (e) { body = {}; }
    return { ok: resp.ok, http: resp.status, body: body };
  } catch (e) {
    clearTimeout(t);
    return { ok: false, http: 0, body: {}, error: e && e.name === "AbortError" ? "timeout" : (e && e.message ? e.message : String(e)) };
  }
}
async function fleetStatus(env) {
  const out = [];
  for (const f of FLEET) {
    const h = await probeService(env, f, "/health");
    let count = null;
    if (f.countPath && h.ok) { const c = await probeService(env, f, f.countPath); count = c.ok ? c.body : null; }
    out.push({ name: f.name, healthy: h.ok, http: h.http, version: (h.body && (h.body.version || "")) || "", error: h.error || null, count: count });
  }
  return { fleet: out, healthyCount: out.filter(function (x) { return x.healthy; }).length, total: out.length, ts: iso() };
}

// ---------------------------------------------------------------- tool executors
async function listIssues(env, args) {
  const status = args && args.status ? String(args.status) : "open";
  const priority = args && args.priority ? String(args.priority) : null;
  const limit = Math.min(parseInt((args && args.limit) || 20, 10) || 20, 50);
  if (!env.QNFO_AUDIT) return { ok: false, error: "audit db not bound" };
  let sql = "SELECT id, title, category, priority, status, created_at, updated_at FROM agent_issues";
  const conds = []; const params = [];
  if (status !== "all") { conds.push("status = ?" + (conds.length + 1)); params.push(status); }
  if (priority) { conds.push("priority = ?" + (conds.length + 1)); params.push(priority); }
  if (conds.length) sql += " WHERE " + conds.join(" AND ");
  sql += " ORDER BY updated_at DESC LIMIT " + limit;
  try {
    const stmt = env.QNFO_AUDIT.prepare(sql);
    const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
    return { ok: true, status: status, count: (res.results || []).length, issues: (res.results || []).slice(0, 50) };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
async function triggerBacklog(env, args) {
  const confirm = !!(args && args.confirm);
  let open = -1;
  try {
    const h = await probeService(env, { binding: "BACKLOG", name: "qnfo-backlog-exec" }, "/health");
    open = h.ok && h.body && typeof h.body.openBacklog === "number" ? h.body.openBacklog : -1;
  } catch (e) { open = -1; }
  if (!confirm) return { ok: true, dryRun: true, note: "backlog executor drain NOT triggered (confirm:true required)", openBacklog: open };
  if (!env.BACKLOG) return { ok: false, error: "backlog binding missing" };
  const ctrl = new AbortController();
  const t = setTimeout(function () { ctrl.abort(); }, 25000);
  try {
    const resp = await env.BACKLOG.fetch("https://backlog.internal/run", { method: "POST", signal: ctrl.signal });
    clearTimeout(t);
    let body = {};
    try { body = await resp.json(); } catch (e) { body = {}; }
    return { ok: resp.ok, triggered: true, http: resp.status, openBacklogBefore: open, result: snippet(body, 1200) };
  } catch (e) {
    clearTimeout(t);
    return { ok: true, triggered: true, note: "drain request dispatched (waiting for completion timed out): " + (e && e.name === "AbortError" ? "timeout" : e && e.message ? e.message : String(e)), openBacklogBefore: open };
  }
}
async function d1Query(env, args) {
  const raw = String((args && args.sql) || "").trim();
  const sql = raw.replace(/;\s*$/, "");
  if (!/^(select|with)\b/i.test(sql)) return { ok: false, error: "read-only SELECT/WITH only" };
  if (/;(\s)*(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex)/i.test(sql)) return { ok: false, error: "single read statement only" };
  if (!/\blimit\s+\d+/i.test(sql) && !/^\s*select\s+(count|sum|avg|min|max)\s*\(/i.test(sql) && !/select\s+sqlite_version/i.test(sql)) return { ok: false, error: "add LIMIT n (aggregate exempt)" };
  if (!env.QNFO_AUDIT) return { ok: false, error: "audit db not bound" };
  try {
    const res = await env.QNFO_AUDIT.prepare(sql).all();
    const rows = (res.results || []).slice(0, 100);
    return { ok: true, rowCount: rows.length, rows: rows };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
async function emailRecent(env, args) {
  if (!env.EMAIL) return { ok: false, error: "email binding missing" };
  const limit = Math.min(parseInt((args && args.limit) || 8, 10) || 8, 20);
  let path = "/emails/recent?limit=" + limit;
  if (args && args.status) path += "&status=" + encodeURIComponent(String(args.status).slice(0, 30));
  try {
    const resp = await env.EMAIL.fetch("https://email.internal" + path, { headers: { "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") } });
    let j = null;
    try { j = await resp.json(); } catch (e) { j = null; }
    if (!resp.ok) return { ok: false, error: (j && j.error) || ("email svc HTTP " + resp.status) };
    return { ok: true, emails: j };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
async function emailStats(env) {
  if (!env.EMAIL) return { ok: false, error: "email binding missing" };
  try {
    const resp = await env.EMAIL.fetch("https://email.internal/stats", { headers: { "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") } });
    let j = null;
    try { j = await resp.json(); } catch (e) { j = null; }
    if (!resp.ok) return { ok: false, error: (j && j.error) || ("email svc HTTP " + resp.status) };
    return { ok: true, stats: j };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
async function recentOpsLog(env, args) {
  if (!env.QNFO_AUDIT) return { ok: false, error: "audit db not bound" };
  const limit = Math.min(parseInt((args && args.limit) || 5, 10) || 5, 20);
  try {
    const res = await env.QNFO_AUDIT.prepare("SELECT id, ts, model, strategy, source, ok, substr(prompt,1,120) prompt, latency_ms FROM ops_ai_log ORDER BY ts DESC LIMIT " + limit).all();
    const rows = (res.results || []);
    return { ok: true, count: rows.length, entries: rows };
  } catch (e) { return { ok: false, error: e && e.message ? e.message : String(e) }; }
}
async function execTool(env, name, rawArgs) {
  let args = {};
  try { args = JSON.parse(rawArgs || "{}"); } catch (e) { args = { _parseError: String((e && e.message) || e) }; }
  const t0 = Date.now();
  let res;
  try {
    if (name === "fleet_status") res = await fleetStatus(env);
    else if (name === "ops_issues_list") res = await listIssues(env, args);
    else if (name === "ops_issue_run") res = await triggerBacklog(env, args);
    else if (name === "ops_d1_query") res = await d1Query(env, args);
    else if (name === "email_check") res = await emailRecent(env, args);
    else if (name === "email_stats") res = await emailStats(env);
    else if (name === "ops_fleet_log") res = await recentOpsLog(env, args);
    else res = { ok: false, error: "unknown tool: " + name };
  } catch (e) { res = { ok: false, error: "tool crashed: " + (e && e.message ? e.message : String(e)) }; }
  const ms = Date.now() - t0;
  await logToolEvent(env, name, args, res, ms);
  const text = JSON.stringify(res);
  return { tool_call_id: null, name: name, ok: !!(res && res.ok), text: text.length > 8000 ? text.slice(0, 8000) + "...(truncated)" : text };
}
async function logToolEvent(env, name, args, res, ms) {
  if (!env.QNFO_AUDIT) return;
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO cloud_ops_events (id, ts, kind, text, meta, job, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(randId("evt-"), iso(), "ops_ai_tool", name, snippet({ args: args, resultOk: !!(res && res.ok), ms: ms }, 600), "qnfo-ops", (res && res.ok) ? "ok" : "error").run();
  } catch (e) { /* event log best-effort */ }
}

// ---------------------------------------------------------------- ops log (isolated store)
let schemaEnsured = false;
async function ensureSchema(env) {
  if (schemaEnsured || !env.QNFO_AUDIT) return;
  schemaEnsured = true;
  try {
    await env.QNFO_AUDIT.prepare("CREATE TABLE IF NOT EXISTS ops_ai_log (id TEXT PRIMARY KEY, ts TEXT NOT NULL, model TEXT, strategy TEXT, complexity TEXT, domain TEXT, prompt TEXT, response TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd REAL, latency_ms INTEGER, tool_calls TEXT, source TEXT, ua TEXT, streamed INTEGER DEFAULT 0, ok INTEGER DEFAULT 1)").run();
  } catch (e) { /* next request retries */ }
}
async function logOps(env, rec) {
  await ensureSchema(env);
  try {
    await env.QNFO_AUDIT.prepare("INSERT INTO ops_ai_log (id, ts, model, strategy, complexity, domain, prompt, response, prompt_tokens, completion_tokens, cost_usd, latency_ms, tool_calls, source, ua, streamed, ok) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)")
      .bind(rec.id, rec.ts, rec.model, rec.strategy, rec.complexity || "medium", "ops", rec.prompt || "", rec.response || "", rec.prompt_tokens || 0, rec.completion_tokens || 0, rec.cost_usd || 0, rec.latency_ms || 0, rec.tool_calls || null, rec.source || "other", rec.ua || "", rec.streamed ? 1 : 0, rec.ok ? 1 : 0).run();
  } catch (e) { console.log("ops_ai_log insert failed:", e && e.message || e); }
}

// ---------------------------------------------------------------- upstream call
async function callDeepSeek(env, messages, maxTokens, withTools) {
  const body = { model: UPSTREAM_MODEL, messages: messages, max_tokens: maxTokens, temperature: 0.5, top_p: 0.9, stream: false };
  if (withTools) { body.tools = toolsPayload(); body.tool_choice = "auto"; }
  const resp = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.DEEPSEEK_API_KEY || "") },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("deepseek " + resp.status + ": " + String(txt || "").slice(0, 300));
  }
  return resp.json();
}
function lastUserText(messages) {
  const arr = messages || [];
  for (let i = arr.length - 1; i >= 0; i--) { if (arr[i] && arr[i].role === "user") return String(arr[i].content || ""); }
  return "";
}
function detectSource(ua) {
  const u = String(ua || "").toLowerCase();
  if (/(chatbox|dart|flutter)/.test(u)) return "chatbox";
  if (u.indexOf("deepchat") >= 0) return "deepchat";
  return "other";
}

// ---------------------------------------------------------------- chat handler
async function handleChat(env, body, authHeader, ua, ctx) {
  const okAuth = await authOk(authHeader, env);
  if (!okAuth) return json({ error: "Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY" }, 401);
  const model = body && body.model; const messages = body && body.messages; const max_tokens = body && body.max_tokens; const stream = body && body.stream;
  const wanted = model || "ops-exec";
  if (wanted !== "ops-exec" && wanted !== "deepseek-v4-flash") return json({ error: "unknown model " + wanted + " (available: ops-exec, deepseek-v4-flash)" }, 400);
  if (!env.DEEPSEEK_API_KEY) return json({ error: "ops endpoint misconfigured: DEEPSEEK_API_KEY missing" }, 503);
  if (!Array.isArray(messages) || !messages.length) return json({ error: "messages array required" }, 400);
  const t0 = Date.now();
  const isStream = !!stream;
  const maxOut = clamp(max_tokens, DEFAULT_MAX_OUT);
  const sysDate = "\n\nToday is " + new Date().toISOString().slice(0, 10) + " (UTC). Ground time-relative statements in this date.";
  const sys = OPS_SYSTEM_PROMPT + sysDate;
  let msgs = [{ role: "system", content: sys }];
  for (const m of messages) {
    if (!m || !m.role) continue;
    let content = m.content;
    if (content && typeof content === "object" && !Array.isArray(content)) content = String(content.content || JSON.stringify(content));
    if (Array.isArray(content)) content = content.map(function (p) { return p && p.text ? p.text : (typeof p === "string" ? p : ""); }).filter(Boolean).join("\n");
    msgs.push({ role: m.role, content: String(content || "") });
  }
  const prompt = lastUserText(msgs).slice(0, 4000);
  const toolLog = [];
  let content = "";
  let finishReason = "stop";
  let upstreamUsage = null;
  try {
    for (let iter = 0; iter <= MAX_TOOL_ITERS; iter++) {
      const withTools = iter < MAX_TOOL_ITERS;
      const resp = await callDeepSeek(env, msgs, maxOut, withTools);
      const choice = resp && resp.choices && resp.choices[0];
      upstreamUsage = (resp && resp.usage) || upstreamUsage;
      const msg0 = choice && choice.message;
      const toolCalls = msg0 && Array.isArray(msg0.tool_calls) ? msg0.tool_calls : null;
      if (toolCalls && toolCalls.length && iter < MAX_TOOL_ITERS) {
        msgs.push({ role: "assistant", content: msg0.content || "", tool_calls: toolCalls });
        for (const tc of toolCalls) {
          const fn = tc && tc.function;
          const name = fn && fn.name ? String(fn.name) : "";
          const rawArgs = (fn && fn.arguments) || "{}";
          const execRes = await execTool(env, name, rawArgs);
          toolLog.push({ name: name, ok: execRes.ok, summary: snippet(execRes.text, 160) });
          msgs.push({ role: "tool", tool_call_id: tc.id || "", content: execRes.text });
        }
        continue;
      }
      content = String((msg0 && msg0.content) || "");
      finishReason = (choice && choice.finish_reason) || "stop";
      break;
    }
  } catch (e) {
    const errText = "ops agent error: " + (e && e.message ? e.message : String(e));
    ctx.waitUntil(logOps(env, { id: randId("ops-"), ts: iso(), model: wanted, strategy: "agent", prompt: prompt, response: errText.slice(0, 2000), latency_ms: Date.now() - t0, tool_calls: JSON.stringify(toolLog).slice(0, 3000), source: detectSource(ua), ua: String(ua || "").slice(0, 200), streamed: isStream ? 1 : 0, ok: 0 }));
    return json({ error: errText }, 502);
  }
  const promptTokens = upstreamUsage && upstreamUsage.prompt_tokens ? upstreamUsage.prompt_tokens : estTokens(JSON.stringify(msgs));
  const completionTokens = upstreamUsage && upstreamUsage.completion_tokens ? upstreamUsage.completion_tokens : estTokens(content);
  const costUsd = Math.round((promptTokens / 1e6 * 0.14 + completionTokens / 1e6 * 0.28) * 1e6) / 1e6;
  const latencyMs = Date.now() - t0;
  const respId = randId("chatcmpl-");
  const created = Math.floor(Date.now() / 1000);
  const logRec = { id: randId("ops-"), ts: iso(), model: wanted, strategy: toolLog.length ? "agent-tools" : "chat", prompt: prompt, response: content.slice(0, 20000), prompt_tokens: promptTokens, completion_tokens: completionTokens, cost_usd: costUsd, latency_ms: latencyMs, tool_calls: JSON.stringify(toolLog).slice(0, 3000), source: detectSource(ua), ua: String(ua || "").slice(0, 200), streamed: isStream ? 1 : 0, ok: 1 };
  ctx.waitUntil(logOps(env, logRec));
  if (isStream) {
    const enc = new TextEncoder();
    const nlnl = String.fromCharCode(10, 10);
    const chunk = function (delta, finish) {
      return enc.encode("data: " + JSON.stringify({ id: respId, object: "chat.completion.chunk", created: created, model: wanted, choices: [{ index: 0, delta: delta, finish_reason: finish }] }) + nlnl);
    };
    const stream2 = new ReadableStream({
      start: function (controller) {
        controller.enqueue(chunk({ role: "assistant", content: content }, null));
        controller.enqueue(chunk({}, finishReason || "stop"));
        controller.enqueue(enc.encode("data: [DONE]" + nlnl));
        controller.close();
      }
    });
    return new Response(stream2, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Access-Control-Allow-Origin": "*" } });
  }
  return json({
    id: respId,
    object: "chat.completion",
    created: created,
    model: wanted,
    choices: [{ index: 0, message: { role: "assistant", content: content }, finish_reason: finishReason || "stop" }],
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens }
  });
}

// ---------------------------------------------------------------- router
var BINDING_KEYS = ["LIFECYCLE", "EMAIL", "ORCH", "INDEXER", "KAIZEN", "GATEWAY", "ARCHIVE", "AI", "AISEARCH", "MEMORY", "SKILLSYNC", "BACKLOG"];
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ua = request.headers.get("User-Agent") || "";
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (path === "/health" && method === "GET") {
      const bindings = {};
      for (const k of BINDING_KEYS) bindings[k.toLowerCase()] = !!(env[k] && env[k].fetch);
      bindings.audit = !!env.QNFO_AUDIT;
      bindings.deepseek_key = !!env.DEEPSEEK_API_KEY;
      bindings.auth = !!env.OPS_ROUTER_AUTH_KEY;
      bindings.email_key = !!env.EMAIL_API_KEY;
      return json({ status: "ok", worker: WORKER, version: VERSION, capabilities: ["ops-ai-gateway", "openai-compatible", "tool-execution", "fleet-probes", "isolated-ops-logging"], routes: ROUTES, models: ["ops-exec", "deepseek-v4-flash"], bindings: bindings, generatedAt: iso() });
    }
    if (path === "/" && method === "GET") {
      return json({ worker: WORKER, version: VERSION, purpose: "QNFO ops/infrastructure AI execution endpoint (separate from research + personal twin). OpenAI-compatible: POST /v1/chat/completions (Bearer OPS_ROUTER_AUTH_KEY). Models: ops-exec, deepseek-v4-flash. Isolation: logs only to qnfo-audit.ops_ai_log; never writes research stores.", docs: "qnfo-workers/qnfo-ops/README-deploy.md" });
    }
    if (path === "/fleet" && method === "GET") return json(await fleetStatus(env));
    if (path === "/v1/models" && method === "GET") {
      const mk = function (id) { return { id: id, object: "model", created: 171e7, owned_by: "qnfo", _router: { tier: 1, family: "deepseek", reasoning: false, ctx: MODEL_CTX, temperature: 0.5, top_p: 0.9, vision: false, tools: true, costPer1MInput: 0.14, costPer1MOutput: 0.28, availability: "key-required" } }; };
      return json({ object: "list", data: [mk("ops-exec"), mk("deepseek-v4-flash")] });
    }
    if (path.startsWith("/v1/models/") && method === "GET") {
      const id = path.split("/").pop();
      if (id !== "ops-exec" && id !== "deepseek-v4-flash") return json({ error: "model not found" }, 404);
      return json({ id: id, object: "model", created: 171e7, owned_by: "qnfo" });
    }
    if ((path === "/v1/chat/completions" || path === "/chat/completions") && method === "POST") {
      let body = null;
      try { body = await request.json(); } catch (e) { return json({ error: "invalid JSON body" }, 400); }
      return handleChat(env, body, request.headers.get("Authorization") || "", ua, ctx);
    }
    return json({ error: "not found", routes: ROUTES }, 404);
  }
};
