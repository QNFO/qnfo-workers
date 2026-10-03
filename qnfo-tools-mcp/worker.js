var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var ROUTER = "https://qnfo-ai.q08.workers.dev";
var PL_SEARCH = "https://personal-life-search.q08.workers.dev";
var EMAIL_BASE = "https://qnfo-email.internal";
var NL = String.fromCharCode(10);
var FLEET = "https://fleet.qnfo.org";
var VERSION = "1.2.0-owner-queue"; // OWNER-QUEUE-MCP-1: owner_queue / owner_code / owner_act reach the fleet.qnfo.org queue from any MCP client; 1.1.6-capability-contract: MCP-TOKEN-NO-SCOPE-SEPARATION (954): MCP_TOKEN=read+write, MCP_READ_TOKEN=read-only
var TOOLS = [
  { name: "web_search", description: "Search the web via DuckDuckGo (QNFO router). Returns title/url/snippet.", inputSchema: { type: "object", properties: { q: { type: "string", description: "search query" }, k: { type: "number", description: "result count (1-10)" } }, required: ["q"] } },
  { name: "web_fetch", description: "Fetch a URL and extract readable text (SSRF-guarded).", inputSchema: { type: "object", properties: { url: { type: "string" }, max: { type: "number", description: "max chars (500-20000)" } }, required: ["url"] } },
  { name: "papers_search", description: "Semantic search over the QNFO research corpus (Vectorize qwav-research-v2).", inputSchema: { type: "object", properties: { q: { type: "string" }, k: { type: "number" } }, required: ["q"] } },
  { name: "history_recall", description: "Semantic recall of past QNFO research notes and queries (qnfo-ai-log).", inputSchema: { type: "object", properties: { q: { type: "string" }, k: { type: "number" } }, required: ["q"] } },
  { name: "personal_search", description: "Search the personal-life index: notes, files, chat threads.", inputSchema: { type: "object", properties: { q: { type: "string" }, topK: { type: "number" } }, required: ["q"] } },
  { name: "express_desire", description: "Express a desire to the QNFO intent orchestrator. It classifies and routes automatically: notes are stored in Vectorize, tasks/events/emails/reminders are queued with due dates, and they appear in the daily digest.", inputSchema: { type: "object", properties: { desire: { type: "string", description: "what you want done" }, source: { type: "string", description: "where it comes from (optional)" } }, required: ["desire"] } },
  { name: "intents_list", description: "List intents in the orchestrator queue (tasks/events/emails/reminders).", inputSchema: { type: "object", properties: { status: { type: "string", description: "filter: pending/done" }, limit: { type: "number" } } } },
  { name: "infra_status", description: "Cloudflare infrastructure state snapshot (workers, D1, Vectorize, R2, KV, Web Analytics sites, AI Gateway config, gateway logs + cost).", inputSchema: { type: "object", properties: {} } },
  { name: "infra_analytics", description: "Cloudflare analytics over the last 30 days: Workers AI neurons + estimated cost by model, worker invocations by worker.", inputSchema: { type: "object", properties: {} } },
  { name: "infra_records", description: "QNFO records fleet: papers count, knowledge graph nodes/edges, logged queries, intents, personal store counts.", inputSchema: { type: "object", properties: {} } },
  { name: "email_check", description: "Check the qnfo.org (and other QNFO domain) email accounts: list recent inbound/outbound emails with status. Optionally fetch the full body of one email by id (body_id).", inputSchema: { type: "object", properties: { limit: { type: "number", description: "max rows (1-100, default 20)" }, status: { type: "string", description: "filter: received/processed/sent/replied/archived/spam/read/rejected" }, body_id: { type: "number", description: "email id whose full body/headers to fetch" } } } },
  { name: "email_stats", description: "Email account stats: total messages, last 24h, by classification, by status.", inputSchema: { type: "object", properties: {} } },
  { name: "email_search", description: "Search email subject/sender/body text across the QNFO domain email accounts.", inputSchema: { type: "object", properties: { q: { type: "string", description: "search query" }, limit: { type: "number", description: "max rows (1-100, default 20)" } }, required: ["q"] } },
  { name: "email_respond", description: "Send an email reply (or new email) FROM a QNFO domain account via the qnfo-email Worker. Pass reply_to_id to reply to an existing inbound email (worker marks it replied). `from` defaults to qnfo@qnfo.org; pass rowan.quni@qnfo.org for academic outreach. Body field is `body` (plain text) with optional `html`.", inputSchema: { type: "object", properties: { to: { type: "string", description: "recipient email" }, subject: { type: "string", description: 'subject (use "Re: <original>" for replies)' }, body: { type: "string", description: "plain-text body" }, html: { type: "string", description: "optional HTML body" }, reply_to_id: { type: "number", description: "id of the inbound email being replied to (marks it replied)" }, affirm: { type: "boolean", description: "must be TRUE to send a NEW outbound email when reply_to_id is absent (MCP-COLD-SEND-UNGATED-1); replies do not need it" }, from: { type: "string", description: "QNFO domain sender (default qnfo@qnfo.org; rowan.quni@qnfo.org for outreach)" } }, required: ["to", "subject", "body"] } },
  { name: "email_mark", description: "Update the status of an email row (received/processed/sent/replied/archived/spam/read/rejected).", inputSchema: { type: "object", properties: { id: { type: "number", description: "email id" }, status: { type: "string", description: "new status" } }, required: ["id", "status"] } },
  { name: "owner_queue", description: "List what the fleet is waiting on the OWNER (a human) to do: the open cards on fleet.qnfo.org (key, title, why, the exact action, link, urgency, due). Read-only; the same public data as https://fleet.qnfo.org/api/human. Use the returned key with owner_act.", inputSchema: { type: "object", properties: { limit: { type: "number", description: "max cards (1-100, default 50)" } } } },
  { name: "owner_code", description: "Email a 6-digit code to the owner's fixed address (the dashboard decides where it goes; nobody can choose). The owner reads it in their inbox and passes it to owner_act. Valid 10 minutes; at most 6 an hour.", inputSchema: { type: "object", properties: {} } },
  { name: "owner_act", description: "Act on owner cards through the dashboard's own gate. Needs `code`, the 6-digit code the owner received from owner_code (single use; ask the owner for it, never guess). One code covers every action in the batch. kind: done (mark finished), dismiss (not doing), snooze (days 1-90), note (text kept with the card and filed as fleet work). key is a key from owner_queue; done and dismiss only work on keys starting ha:.", inputSchema: { type: "object", properties: { code: { type: "string", description: "6-digit code from the owner's email" }, actions: { type: "array", maxItems: 10, items: { type: "object", properties: { key: { type: "string" }, kind: { type: "string", description: "done | dismiss | snooze | note" }, days: { type: "number", description: "snooze days 1-90" }, note: { type: "string", description: "note text (max 500)" } }, required: ["key", "kind"] } } }, required: ["code", "actions"] } }
];
function tokenEq(token, expected) {
  if (!expected || !token) return false;
  const a = new TextEncoder().encode(String(token));
  const b = new TextEncoder().encode(String(expected));
  if (a.byteLength !== b.byteLength) return false;
  let d = 0;
  for (let i = 0; i < a.byteLength; i++) d |= a[i] ^ b[i];
  return d === 0;
}
__name(tokenEq, "tokenEq");
function authToken(token, env) {
  return tokenEq(token, env.MCP_TOKEN);
}
__name(authToken, "authToken");
// MCP-TOKEN-NO-SCOPE-SEPARATION (954): MCP_TOKEN is the FULL read+write credential.
// MCP_READ_TOKEN (optional) grants READ tools only and cannot invoke the write tools
// email_respond / email_mark / express_desire. With no MCP_READ_TOKEN set, behaviour is unchanged.
var WRITE_TOOLS = ["email_respond", "email_mark", "express_desire", "owner_code", "owner_act"];
function scopeFor(token, env) {
  if (tokenEq(token, env.MCP_TOKEN)) return { ok: true, write: true };
  if (env.MCP_READ_TOKEN && tokenEq(token, env.MCP_READ_TOKEN)) return { ok: true, write: false };
  return { ok: false, write: false };
}
__name(scopeFor, "scopeFor");
function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
__name(ok, "ok");
function rpcErr(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
__name(rpcErr, "rpcErr");
async function callEmail(env, path, opts = {}) {
  if (!env.EMAIL) throw new Error("EMAIL service binding not configured");
  const url = new URL(EMAIL_BASE + path);
  const headers = { "Authorization": "Bearer " + (env.EMAIL_API_KEY || "") };
  if (opts.body) headers["Content-Type"] = "application/json";
  const resp = await env.EMAIL.fetch(url.toString(), {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : void 0
  });
  let j = null;
  try {
    j = await resp.json();
  } catch (e) {
    j = null;
  }
  if (!resp.ok) return { error: j && j.error || "email svc " + path + " HTTP " + resp.status };
  return j;
}
__name(callEmail, "callEmail");
// OWNER-QUEUE-MCP-1: the dashboard stays the only writer. These helpers call its public routes (the same ones the
// browser uses); no dashboard secret is held here, so the owner's emailed code is the whole gate, exactly as in the browser.
async function fleetJson(path, o) {
  const headers = { "x-fleet-ui": "1" };
  if (o.body !== void 0) headers["Content-Type"] = "application/json";
  if (o.cookie) headers["Cookie"] = "fleet_cmd=" + o.cookie;
  let resp;
  try {
    resp = await fetch(FLEET + path, { method: o.method, headers, body: o.body !== void 0 ? JSON.stringify(o.body) : void 0 });
  } catch (e) {
    return { error: "fleet.qnfo.org unreachable: " + String(e && e.message || e).slice(0, 120) };
  }
  let j = null;
  try {
    j = await resp.json();
  } catch (e) {
    j = null;
  }
  if (!j) return { error: "fleet.qnfo.org " + path + " HTTP " + resp.status + " (no JSON)" };
  if (!resp.ok && !j.error) j.error = "HTTP " + resp.status;
  if (o.wantCookie && resp.ok) {
    const sc = typeof resp.headers.getSetCookie === "function" ? resp.headers.getSetCookie().join(", ") : resp.headers.get("set-cookie") || "";
    const m = /fleet_cmd=([0-9a-f]{64})/.exec(sc);
    if (!m) return { error: "the dashboard accepted the code but set no session" };
    j.cookie = m[1];
  }
  return j;
}
__name(fleetJson, "fleetJson");
// A code or session value must never reach the audit log (mcp_log keeps tool arguments).
function redactArgs(a) {
  const o = Object.assign({}, a || {});
  if (o.code !== void 0) o.code = "[redacted]";
  return o;
}
__name(redactArgs, "redactArgs");
async function callTool(env, name, args) {
  const H = { Authorization: "Bearer " + env.RT };
  const k = Math.min(parseInt(args.k || 5, 10) || 5, 20);
  if (name === "web_search") {
    const r = await env.QNFO_AI.fetch(ROUTER + "/v1/web/search?q=" + encodeURIComponent(String(args.q || "").slice(0, 300)) + "&k=" + Math.min(k, 10), { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return { engine: j.engine || "duckduckgo", count: (j.results || []).length, results: (j.results || []).map((x) => ({ title: x.title, url: x.url, snippet: x.snippet })) };
  }
  if (name === "web_fetch") {
    const r = await env.QNFO_AI.fetch(ROUTER + "/v1/web/fetch?url=" + encodeURIComponent(String(args.url || "")) + "&max=" + Math.min(parseInt(args.max || 6e3, 10) || 6e3, 2e4), { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return { url: j.url, text: j.text, truncated: j.truncated };
  }
  if (name === "papers_search") {
    const r = await env.QNFO_AI.fetch(ROUTER + "/v1/search?q=" + encodeURIComponent(String(args.q || "").slice(0, 300)) + "&k=" + k, { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return { count: j.count || 0, results: (j.results || []).map((x) => ({ score: x.score, path: x.metadata && x.metadata.path, text: x.metadata && x.metadata.text })) };
  }
  if (name === "history_recall") {
    const r = await env.QNFO_AI.fetch(ROUTER + "/v1/history?q=" + encodeURIComponent(String(args.q || "").slice(0, 300)) + "&k=" + k, { headers: H });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return { count: j.count || 0, results: (j.results || []).map((x) => ({ score: x.score, model: x.metadata && x.metadata.model, text: x.metadata && x.metadata.text })) };
  }
  if (name === "express_desire") {
    const r = await env.QNFO_INTENT.fetch("https://qnfo-intent-orchestrator.q08.workers.dev/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + env.INTENT_TOKEN },
      body: JSON.stringify({ desire: String(args.desire || "").slice(0, 4e3), source: String(args.source || "mcp") })
    });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return j;
  }
  if (name === "infra_status" || name === "infra_analytics" || name === "infra_records") {
    const p = name === "infra_status" ? "/state" : name === "infra_analytics" ? "/analytics" : "/records";
    const r = await env.QNFO_INFRA.fetch("https://qnfo-infra.q08.workers.dev" + p, { headers: { Authorization: "Bearer " + env.INFRA_TOKEN } });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return j;
  }
  if (name === "intents_list") {
    const q = "?limit=" + Math.min(parseInt(args.limit || 20, 10) || 20, 100) + (args.status ? "&status=" + encodeURIComponent(String(args.status)) : "");
    const r = await env.QNFO_INTENT.fetch("https://qnfo-intent-orchestrator.q08.workers.dev/intents" + q, {
      headers: { "Authorization": "Bearer " + env.INTENT_TOKEN }
    });
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return { count: j.count || 0, intents: (j.intents || []).map((x) => ({ id: x.id, type: x.type, domain: x.domain, summary: x.summary || x.desire.slice(0, 100), due: x.due, status: x.status, created_at: x.created_at })) };
  }
  if (name === "personal_search") {
    const r = await env.PL_SEARCH.fetch(PL_SEARCH + "/search?q=" + encodeURIComponent(String(args.q || "").slice(0, 300)) + "&topK=" + k);
    const j = await r.json();
    if (!r.ok) return { error: j.error || "HTTP " + r.status };
    return { count: j.count || 0, files: (j.files || []).map((f) => ({ path: f.path, score: f.bestScore, snippet: f.snippet })) };
  }
  if (name === "email_check") {
    const lim = Math.min(parseInt(args.limit || 20, 10) || 20, 100);
    const st = args.status ? "&status=" + encodeURIComponent(String(args.status)) : "";
    const j = await callEmail(env, "/emails/recent?limit=" + lim + st);
    if (j.error) return { error: j.error };
    if (args.body_id) {
      const b = await callEmail(env, "/emails/body?id=" + parseInt(args.body_id, 10));
      if (b.error) return { error: b.error };
      return { count: j.count || 0, emails: j.emails || [], body: b };
    }
    return { count: j.count || 0, emails: j.emails || [] };
  }
  if (name === "email_stats") {
    const j = await callEmail(env, "/stats");
    if (j.error) return { error: j.error };
    return j;
  }
  if (name === "email_search") {
    const lim = Math.min(parseInt(args.limit || 20, 10) || 20, 100);
    const j = await callEmail(env, "/emails/search?q=" + encodeURIComponent(String(args.q || "").slice(0, 200)) + "&limit=" + lim);
    if (j.error) return { error: j.error };
    return j;
  }
  if (name === "email_respond") {
    if (!String(args.to || "").includes("@")) return { error: "to is required" };
    if (!String(args.subject || "").trim()) return { error: "subject is required" };
    if (!String(args.body || "").trim() && !String(args.html || "").trim()) return { error: "body or html is required" };
    // MCP-COLD-SEND-UNGATED-1 (2026-09-24): a COLD send (no reply_to_id) must be explicitly
    // affirmed. The prior schema accepted to+subject+body alone, so an unattended caller could
    // cold-send with no gate. Replies (reply_to_id present) are completely unaffected.
    const _cold = !args.reply_to_id;
    if (_cold && args.affirm !== true) return { error: "cold send rejected: pass reply_to_id to reply, or affirm:true to confirm a NEW outbound email (MCP-COLD-SEND-UNGATED-1)" };
    if (_cold && /(^|[^a-z])(test|verify|canary|matrix)([^a-z]|$)/i.test(String(args.subject || ""))) return { error: "cold send rejected: subject carries a test/canary token (EMAIL-SUBJECT-SPAM-TOKENS-1)" };
    const payload = { to: String(args.to), subject: String(args.subject), body: String(args.body || "") };
    if (args.html) payload.html = String(args.html);
    if (args.reply_to_id) payload.reply_to_id = parseInt(args.reply_to_id, 10);
    if (args.from) payload.from = String(args.from);
    const j = await callEmail(env, "/send", { method: "POST", body: payload });
    if (j.error) return { error: j.error };
    return { success: !!j.success, message_id: j.message_id || null, to: j.to, subject: j.subject, sent_at: j.sent_at || null };
  }
  if (name === "email_mark") {
    const id = parseInt(args.id, 10);
    const status = String(args.status || "");
    if (!id || !status) return { error: "id and status required" };
    const j = await callEmail(env, "/emails/status", { method: "PATCH", body: { id, status } });
    if (j.error) return { error: j.error };
    return j;
  }
  if (name === "owner_queue") {
    const lim = Math.min(parseInt(args.limit || 50, 10) || 50, 100);
    const j = await fleetJson("/api/human", { method: "GET" });
    if (j.error) return { error: j.error };
    const slim = (i) => ({ key: i.key, title: i.title, why: i.why, action: i.action, url: i.url || "", sev: i.sev, due: i.due || "", age_days: i.age == null ? null : i.age, fallback: i.fallback || "" });
    const items = (j.items || []).slice(0, lim).map(slim);
    return { verdict: j.verdict, open: j.count, snoozed: j.snoozed, shown: items.length, items, upcoming: (j.upcoming || []).slice(0, lim).map(slim), next: "owner_code emails the owner a code; owner_act uses it." };
  }
  if (name === "owner_code") {
    const j = await fleetJson("/api/cmd/code", { method: "POST", body: {} });
    if (j.error) return { error: j.error };
    return { sent: !!j.sent, note: j.note || "" };
  }
  if (name === "owner_act") {
    const code = String(args.code || "").replace(/\D/g, "");
    if (code.length !== 6) return { error: "code must be the 6 digits the owner received from owner_code" };
    const acts = Array.isArray(args.actions) ? args.actions.slice(0, 10) : [];
    if (!acts.length) return { error: "actions is empty" };
    for (const a of acts) {
      const kind = String(a && a.kind || "");
      if (["done", "dismiss", "snooze", "note"].indexOf(kind) < 0) return { error: "kind must be done|dismiss|snooze|note" };
      if (!/^[A-Za-z0-9:._-]{3,160}$/.test(String(a && a.key || ""))) return { error: "bad key: " + String(a && a.key || "").slice(0, 60) };
      if (kind === "snooze" && !(Number(a.days) >= 1)) return { error: "snooze needs days 1-90" };
      if (kind === "note" && !String(a.note || "").trim()) return { error: "note needs text" };
    }
    const v = await fleetJson("/api/cmd/verify", { method: "POST", body: { code }, wantCookie: true });
    if (v.error) return { error: "code not accepted: " + v.error, results: [] };
    const results = [];
    for (const a of acts) {
      const kind = String(a.kind);
      const r = await fleetJson("/api/cmd/run", { method: "POST", cookie: v.cookie, body: { op: kind, args: { key: String(a.key), days: kind === "snooze" ? Math.min(90, Math.max(1, Math.round(Number(a.days)))) : void 0, note: kind === "note" ? String(a.note).slice(0, 500) : void 0 } } });
      results.push({ key: a.key, kind, ok: !r.error && r.ok !== false, text: r.text || void 0, error: r.error || void 0 });
    }
    return { ok: results.every((x) => x.ok), done: results.filter((x) => x.ok).length, failed: results.filter((x) => !x.ok).length, results };
  }
  throw new Error("unknown tool: " + name);
}
__name(callTool, "callTool");
async function handleJsonRpc(msg, env, allowWrite) {
  const m = msg.method;
  if (allowWrite === void 0) allowWrite = true;
  if (m === "initialize") {
    return ok(msg.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "qnfo-tools-mcp", version: VERSION } });
  }
  if (m === "notifications/initialized" || m === "initialized") return null;
  if (m === "ping") return ok(msg.id, {});
  if (m === "tools/list") return ok(msg.id, { tools: allowWrite ? TOOLS : TOOLS.filter((t) => WRITE_TOOLS.indexOf(t.name) < 0) });
  if (m === "tools/call") {
    const tname = String(msg.params && msg.params.name || "");
    if (!allowWrite && WRITE_TOOLS.indexOf(tname) >= 0) {
      return rpcErr(msg.id, -32003, "forbidden: token lacks write scope for '" + tname + "'");
    }
    try {
      const out = await callTool(env, tname, msg.params && msg.params.arguments || {});
      try {
        if (env.AUDIT) {
          await env.AUDIT.prepare("CREATE TABLE IF NOT EXISTS mcp_log (id TEXT PRIMARY KEY, ts TEXT, tool TEXT, args TEXT, result TEXT, session TEXT)").run();
          await env.AUDIT.prepare("INSERT INTO mcp_log (id, ts, tool, args, result, session) VALUES (?1,?2,?3,?4,?5,?6)").bind("mcp-" + Date.now().toString(36), (/* @__PURE__ */ new Date()).toISOString(), String(msg.params && msg.params.name || ""), JSON.stringify(redactArgs(msg.params && msg.params.arguments || {})).slice(0, 2e3), JSON.stringify(out).slice(0, 4e3), "").run();
        }
      } catch (e2) {
      }
      return ok(msg.id, { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
    } catch (e) {
      return ok(msg.id, { content: [{ type: "text", text: "ERROR: " + (e && e.message || String(e)) }], isError: true });
    }
  }
  if (m === "tools/list_changed") return ok(msg.id, {});
  return rpcErr(msg.id, -32601, "method not found: " + m);
}
__name(handleJsonRpc, "handleJsonRpc");
var sessions = /* @__PURE__ */ new Map();
async function selfRegister(env) {
  const manifest = {
    service: "qnfo-tools-mcp",
    kind: "worker",
    version: VERSION,
    base_url: "https://qnfo-tools-mcp.q08.workers.dev",
    purpose: "MCP server (SSE + streamable HTTP) exposing the QNFO machine tool surface (web, research corpus, personal KB, intent queue, infra/analytics, email) to any MCP-capable LLM client",
    capabilities: ["mcp-server", "sse", "streamable-http", "tools", "web-search", "web-fetch", "research-search", "personal-search", "intent-express", "intent-query", "infra-state", "infra-analytics", "email"],
    routes: ["/health", "/mcp/sse", "/mcp/messages", "/mcp"],
    tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
    models: [],
    deps: ["qnfo-ai (router RT)", "qnfo-infra", "qnfo-intent-orchestrator", "qnfo-email", "personal-life-search"]
  };
  const resp = await env.QNFO_OPS.fetch("https://qnfo-ops.internal/registry/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (env.REGISTRY_TOKEN || "") },
    body: JSON.stringify(manifest)
  });
  return resp.ok;
}
__name(selfRegister, "selfRegister");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };
    if (method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (path === "/health" && method === "GET") {
      if (ctx && ctx.waitUntil && env.QNFO_OPS && env.REGISTRY_TOKEN) {
        ctx.waitUntil(selfRegister(env).catch((e) => console.log("self-register err", e && e.message || e)));
      }
      return new Response(JSON.stringify({ ok: true, worker: "qnfo-tools-mcp", version: VERSION, capabilities: TOOLS.map((t) => t.name), limitations: ["MCP routes need a token (bearer or ?token=)", "write tools need a token with write scope", "email tools work only through the qnfo-email binding"], tools: TOOLS.map((t) => t.name), sessions: sessions.size, bindings: { email: !!env.EMAIL, email_key: !!env.EMAIL_API_KEY } }), { headers: { "Content-Type": "application/json", ...cors } });
    }
    const tokenFrom = /* @__PURE__ */ __name((u, req) => u.searchParams.get("token") || (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, ""), "tokenFrom");
    if (path === "/mcp/sse" && method === "GET") {
      const scSse = scopeFor(tokenFrom(url, request), env);
      if (!scSse.ok) return new Response("unauthorized", { status: 401 });
      const sessionId = crypto.randomUUID();
      const encoder = new TextEncoder();
      let keep;
      const stream = new ReadableStream({
        start(controller) {
          sessions.set(sessionId, { c: controller, write: scSse.write });
          controller.enqueue(encoder.encode("event: endpoint" + NL + "data: /mcp/messages?sessionId=" + sessionId + NL + NL));
          keep = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": keepalive" + NL + NL));
            } catch (e) {
            }
          }, 15e3);
        },
        cancel() {
          clearInterval(keep);
          sessions.delete(sessionId);
        }
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", ...cors } });
    }
    if (path === "/mcp/messages" && method === "POST") {
      const sessionId = url.searchParams.get("sessionId") || "";
      const sess = sessions.get(sessionId);
      const controller = sess ? sess.c : null;
      const scMsg = scopeFor(tokenFrom(url, request), env);
      // MCP-MESSAGES-UNAUTHENTICATED (953): this endpoint previously executed JSON-RPC
      // tools with NO auth check at all. Require either a live auth-established SSE
      // session or a valid MCP_TOKEN, matching /mcp and /mcp/sse.
      if (!controller && !scMsg.ok) return new Response("unauthorized", { status: 401 });
      let msg;
      try {
        msg = await request.json();
      } catch (e) {
        return new Response("bad json", { status: 400 });
      }
      const out = await handleJsonRpc(msg, env, sess ? !!sess.write : scMsg.write);
      if (out && controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode("event: message" + NL + "data: " + JSON.stringify(out) + NL + NL));
      }
      return new Response("Accepted", { status: 202, headers: cors });
    }
    if (path === "/mcp" && method === "POST") {
      const scMcp = scopeFor(tokenFrom(url, request), env);
      if (!scMcp.ok) return new Response("unauthorized", { status: 401 });
      let msg;
      try {
        msg = await request.json();
      } catch (e) {
        return new Response("bad json", { status: 400 });
      }
      const out = await handleJsonRpc(msg, env, scMcp.write);
      if (!out) return new Response("", { status: 202, headers: cors });
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...cors } });
    }
    return new Response("not found", { status: 404, headers: cors });
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
