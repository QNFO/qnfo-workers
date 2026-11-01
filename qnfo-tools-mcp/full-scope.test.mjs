// FULLSCOPE-1 offline suite for qnfo-tools-mcp 1.4.0: every tool against mocked bindings, both transports,
// token scopes, JSON-RPC batch/notifications/negotiation, and the 1.4.0 repairs (intents_list without a
// desire, body_id validation, inline /mcp/messages results, collision-proof audit ids with session ids).
// Run: node qnfo-tools-mcp/full-scope.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { versionAtLeast } from "../scripts/version-at-least.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const worker = (await import(pathToFileURL(join(here, "worker.js")).href)).default;

let passed = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); passed++; console.log("ok   " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + (e && e.message || e)); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || "eq") + ": got " + JSON.stringify(a) + " want " + JSON.stringify(b)); };
const ok = (c, m) => { if (!c) throw new Error(m || "assertion"); };

// ---- mock upstreams -------------------------------------------------------
const auditDb = new DatabaseSync(":memory:");
const auditPrep = (sql0) => { const order = []; const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(Number(n) - 1); return "?"; }); let a = []; const st = { bind: (...x) => { a = order.length ? order.map((i) => (x[i] === undefined ? null : x[i])) : x; return st; }, run: async () => { const r = auditDb.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; }, first: async () => auditDb.prepare(sql).get(...a) || null, all: async () => ({ results: auditDb.prepare(sql).all(...a).map((r) => Object.assign({}, r)) }) }; return st; };

const svcCalls = [];
const svc = (name, handler) => ({ fetch: async (url, init = {}) => { const u = new URL(String(url)); svcCalls.push({ svc: name, path: u.pathname, qs: u.searchParams, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null, headers: init.headers || {} }); return handler(u, init); } });
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

const intentState = { intents: [] };
const emailState = { sent: [], marked: [] };
const fleetState = { codeSent: 0 };
const COOKIE = "cd".repeat(32);

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  if (u.host !== "fleet.qnfo.org") throw new Error("unexpected host " + u.host);
  const body = init.body ? JSON.parse(init.body) : null;
  if (u.pathname === "/api/human") return J({ verdict: "1 open", count: 1, snoozed: 0, items: [{ key: "ha:x1", title: "T", why: "W", action: "A", url: "", sev: "warn", due: "", age: 2, fallback: "" }], upcoming: [] });
  if (u.pathname === "/api/cmd/code") { fleetState.codeSent++; return J({ sent: true, note: "emailed" }); }
  if (u.pathname === "/api/cmd/verify") {
    if (body && body.code === "123456") return J({ ok: true }, 200, );
    return J({ error: "bad code" }, 403);
  }
  return J({ error: "unknown" }, 404);
};
// verify must set the session cookie; wrap fetch to add it
const baseFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  const r = await baseFetch(url, init);
  const u = new URL(String(url));
  if (u.pathname === "/api/cmd/verify" && r.status === 200) {
    const j = await r.json();
    return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": "fleet_cmd=" + COOKIE + "; HttpOnly; Path=/" } });
  }
  return r;
};

function mkEnv(over = {}) {
  return {
    MCP_TOKEN: "w-token", MCP_READ_TOKEN: "r-token", RT: "rt", INTENT_TOKEN: "it", INFRA_TOKEN: "inf", EMAIL_API_KEY: "ek", REGISTRY_TOKEN: "reg",
    QNFO_AI: svc("qnfo-ai", (u) => {
      if (u.pathname === "/v1/web/search") return J({ engine: "duckduckgo", results: [{ title: "T", url: "https://x", snippet: "S" }] });
      if (u.pathname === "/v1/web/fetch") return J({ url: u.searchParams.get("url"), text: "hello", truncated: false });
      if (u.pathname === "/v1/search") return J({ count: 1, results: [{ score: 0.9, metadata: { path: "p.md", text: "chunk" } }] });
      if (u.pathname === "/v1/history") return J({ count: 1, results: [{ score: 0.8, metadata: { model: "k2", text: "past" } }] });
      return J({ error: "nope" }, 404);
    }),
    QNFO_INTENT: svc("qnfo-intent", (u) => {
      if (u.pathname === "/intent") return J({ id: "i1", routed: "note" });
      if (u.pathname === "/intents") return J({ count: intentState.intents.length, intents: intentState.intents });
      if (u.pathname === "/personal/search") return J({ count: 1, files: [{ path: "n.md", bestScore: 0.7, snippet: "snip" }] });
      return J({ error: "nope" }, 404);
    }),
    QNFO_INFRA: svc("qnfo-infra", (u) => J({ route: u.pathname, ok: true })),
    EMAIL: svc("qnfo-email", (u, init) => {
      if (u.pathname === "/emails/recent") return J({ count: 1, emails: [{ id: 7, subject: "hi" }] });
      if (u.pathname === "/emails/body") return J({ id: Number(u.searchParams.get("id")), body: "full text" });
      if (u.pathname === "/stats") return J({ total: 42 });
      if (u.pathname === "/emails/search") return J({ count: 1, emails: [{ id: 7 }] });
      if (u.pathname === "/send") { emailState.sent.push({ headers: init.headers, body: JSON.parse(init.body) }); return J({ success: true, message_id: "m1", to: "a@b.c", subject: "s", sent_at: "now" }); }
      if (u.pathname === "/emails/status") { emailState.marked.push(JSON.parse(init.body)); return J({ ok: true }); }
      return J({ error: "nope" }, 404);
    }),
    QNFO_OPS: svc("qnfo-ops", () => J({ ok: true })),
    AUDIT: { prepare: auditPrep },
    ...over
  };
}
const ctx = { waitUntil(p) { this.last = p; }, last: null };

// ---- helpers --------------------------------------------------------------
const rpc = async (env, body, token, path = "/mcp") => {
  const headers = { "Content-Type": "application/json" };
  let p = path;
  if (token) headers.Authorization = "Bearer " + token;
  const r = await worker.fetch(new Request("https://t" + p, { method: "POST", headers, body: JSON.stringify(body) }), env, ctx);
  const text = await r.text();
  return { status: r.status, body: text ? JSON.parse(text) : null };
};
const call = async (env, token, name, args) => {
  const r = await rpc(env, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args || {} } }, token);
  if (r.body && r.body.error) return { rpcError: r.body.error };
  const c = r.body.result.content[0];
  if (r.body.result.isError) return { error: c.text };
  const out = JSON.parse(c.text);
  return out;
};

// ---- transport & protocol -------------------------------------------------
await t("health: version, tools, token + binding report, self-register fired", async () => {
  const env = mkEnv();
  const r = await worker.fetch(new Request("https://t/health"), env, ctx);
  const j = await r.json();
  ok(j.ok && j.worker === "qnfo-tools-mcp", "health shape");
  ok(versionAtLeast(j.version, "1.4.0"), "version " + j.version);
  eq(j.tokens.read_token_configured, true); eq(j.bindings.audit, true);
  ok(j.protocol.includes("2025-03-26"), "protocols listed");
  for (const n of ["web_search", "web_fetch", "papers_search", "history_recall", "personal_search", "express_desire", "intents_list", "infra_status", "infra_analytics", "infra_records", "email_check", "email_stats", "email_search", "email_respond", "email_mark", "owner_queue", "owner_code", "owner_act"]) ok(j.tools.includes(n), "tool " + n);
  await ctx.last; ok(svcCalls.some((c) => c.svc === "qnfo-ops" && c.path === "/registry/register"), "self-register");
});

await t("initialize negotiates protocolVersion; unknown version falls back", async () => {
  const env = mkEnv();
  const a = await rpc(env, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x", version: "0" } } }, "w-token");
  eq(a.body.result.protocolVersion, "2025-03-26");
  eq(a.body.result.serverInfo.name, "qnfo-tools-mcp");
  const b = await rpc(env, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, "w-token");
  eq(b.body.result.protocolVersion, "2024-11-05");
});

await t("ping, resources/list, resources/templates/list, prompts/list answered", async () => {
  const env = mkEnv();
  for (const [m, key] of [["ping", null], ["resources/list", "resources"], ["resources/templates/list", "resourceTemplates"], ["prompts/list", "prompts"]]) {
    const r = await rpc(env, { jsonrpc: "2.0", id: 9, method: m }, "w-token");
    ok(r.body.result, m + " -> " + JSON.stringify(r.body));
    if (key) eq(r.body.result[key], [], m);
  }
});

await t("notifications get no response (202 empty), unknown notification too", async () => {
  const env = mkEnv();
  const r = await rpc(env, { jsonrpc: "2.0", method: "notifications/initialized" }, "w-token");
  eq(r.status, 202); eq(r.body, null);
  const r2 = await rpc(env, { jsonrpc: "2.0", method: "notifications/bogus" }, "w-token");
  eq(r2.status, 202); eq(r2.body, null);
});

await t("JSON-RPC batch: mixed requests and notifications", async () => {
  const env = mkEnv();
  const r = await rpc(env, [
    { jsonrpc: "2.0", id: 1, method: "ping" },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 3, method: "tools/list" }
  ], "w-token");
  ok(Array.isArray(r.body) && r.body.length === 2, "2 of 3 answered: " + JSON.stringify(r.body).slice(0, 120));
  eq(r.body[0].id, 1); eq(r.body[1].id, 3);
  const empty = await rpc(env, [], "w-token");
  ok(empty.body[0].error && empty.body[0].error.code === -32600, "empty batch -> -32600");
});

await t("unknown tool / missing params -> -32602; unknown method -> -32601", async () => {
  const env = mkEnv();
  const a = await rpc(env, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nope_tool" } }, "w-token");
  eq(a.body.error.code, -32602);
  const b = await rpc(env, { jsonrpc: "2.0", id: 2, method: "tools/call" }, "w-token");
  eq(b.body.error.code, -32602);
  const c = await rpc(env, { jsonrpc: "2.0", id: 3, method: "bogus/method" }, "w-token");
  eq(c.body.error.code, -32601);
});

await t("tools/list carries readOnlyHint/destructiveHint annotations", async () => {
  const env = mkEnv();
  const r = await rpc(env, { jsonrpc: "2.0", id: 1, method: "tools/list" }, "w-token");
  const byName = Object.fromEntries(r.body.result.tools.map((x) => [x.name, x]));
  eq(byName.web_search.annotations.readOnlyHint, true);
  eq(byName.email_respond.annotations.destructiveHint, true);
  eq(byName.owner_queue.annotations.readOnlyHint, true);
});

await t("auth: no token -> 401 on /mcp and /mcp/sse; bad json -> 400; GET /mcp -> 405; OPTIONS -> 204", async () => {
  const env = mkEnv();
  eq((await worker.fetch(new Request("https://t/mcp", { method: "POST", body: "{}" }), env, ctx)).status, 401);
  eq((await worker.fetch(new Request("https://t/mcp/sse"), env, ctx)).status, 401);
  eq((await worker.fetch(new Request("https://t/mcp?token=w-token", { method: "POST", body: "not json" }), env, ctx)).status, 400);
  const g = await worker.fetch(new Request("https://t/mcp?token=w-token", { method: "GET" }), env, ctx);
  eq(g.status, 405); eq(g.headers.get("Allow"), "POST");
  eq((await worker.fetch(new Request("https://t/mcp", { method: "OPTIONS" }), env, ctx)).status, 204);
  eq((await worker.fetch(new Request("https://t/elsewhere"), env, ctx)).status, 404);
});

// ---- every tool, happy path + edge ----------------------------------------
await t("web_search / web_fetch / papers_search / history_recall via the router", async () => {
  const env = mkEnv();
  const ws = await call(env, "w-token", "web_search", { q: "ultrametric", k: 5 });
  eq(ws.engine, "duckduckgo"); eq(ws.count, 1);
  ok(svcCalls.at(-1).qs.get("k") === "5", "k passed");
  const wf = await call(env, "w-token", "web_fetch", { url: "https://example.com", max: 1000 });
  eq(wf.text, "hello");
  const ps = await call(env, "w-token", "papers_search", { q: "q", k: 3 });
  eq(ps.results[0].path, "p.md");
  const hr = await call(env, "w-token", "history_recall", { q: "q" });
  eq(hr.results[0].model, "k2");
});

await t("express_desire / intents_list / personal_search via the intent orchestrator", async () => {
  const env = mkEnv();
  intentState.intents = [
    { id: "i1", type: "task", domain: "fleet", summary: "has summary", desire: "d", due: null, status: "pending", created_at: "x" },
    { id: "i2", type: "note", domain: "personal", due: null, status: "pending", created_at: "y" } // no summary AND no desire: the 1.3.0 crash
  ];
  const ed = await call(env, "w-token", "express_desire", { desire: "remember the milk" });
  eq(ed.id, "i1");
  const il = await call(env, "w-token", "intents_list", {});
  eq(il.count, 2); eq(il.intents[1].summary, "", "no crash, empty summary");
  const ps = await call(env, "w-token", "personal_search", { q: "milk", topK: 4 });
  eq(ps.files[0].path, "n.md");
});

await t("infra_status / infra_analytics / infra_records", async () => {
  const env = mkEnv();
  for (const [tool, p] of [["infra_status", "/state"], ["infra_analytics", "/analytics"], ["infra_records", "/records"]]) {
    const r = await call(env, "w-token", tool, {});
    eq(r.route, p, tool);
  }
});

await t("email tools: check (+body_id), stats, search, respond (reply + cold gates), mark", async () => {
  const env = mkEnv();
  const ec = await call(env, "w-token", "email_check", { limit: 5, body_id: 7 });
  eq(ec.body.body, "full text");
  const bad = await call(env, "w-token", "email_check", { body_id: "NaN-ish" });
  ok(bad.error && /positive integer/.test(bad.error), "NaN body_id refused: " + JSON.stringify(bad));
  eq((await call(env, "w-token", "email_stats", {})).total, 42);
  eq((await call(env, "w-token", "email_search", { q: "hi" })).count, 1);
  const reply = await call(env, "w-token", "email_respond", { to: "a@b.c", subject: "Re: hi", body: "answer", reply_to_id: 7 });
  eq(reply.success, true);
  eq(emailState.sent.at(-1).headers["x-qnfo-agent-surface"], "mcp", "surface header");
  const cold = await call(env, "w-token", "email_respond", { to: "a@b.c", subject: "hello", body: "x" });
  ok(cold.error && /cold send rejected/.test(cold.error), "cold send needs affirm");
  const canary = await call(env, "w-token", "email_respond", { to: "a@b.c", subject: "test send", body: "x", affirm: true });
  ok(canary.error && /test\/canary/.test(canary.error), "spam token refused");
  const affirmed = await call(env, "w-token", "email_respond", { to: "a@b.c", subject: "real subject", body: "x", affirm: true });
  eq(affirmed.success, true);
  eq((await call(env, "w-token", "email_mark", { id: 7, status: "read" })).ok, true);
});

await t("owner_queue / owner_code happy path", async () => {
  const env = mkEnv();
  const q = await call(env, "r-token", "owner_queue", {});
  eq(q.open, 1); eq(q.items[0].key, "ha:x1");
  const c = await call(env, "w-token", "owner_code", {});
  eq(c.sent, true); eq(fleetState.codeSent > 0, true);
});

// ---- scopes ---------------------------------------------------------------
await t("read token: list hides write tools, write call -> -32003, reads fine", async () => {
  const env = mkEnv();
  const list = await rpc(env, { jsonrpc: "2.0", id: 1, method: "tools/list" }, "r-token");
  const names = list.body.result.tools.map((x) => x.name);
  ok(names.includes("web_search") && !names.includes("email_respond") && !names.includes("owner_act"), "filtered");
  const r = await rpc(env, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "express_desire", arguments: { desire: "x" } } }, "r-token");
  eq(r.body.error.code, -32003);
});

// ---- audit ----------------------------------------------------------------
await t("audit: unique ids, code redacted, session recorded", async () => {
  auditDb.exec("DROP TABLE IF EXISTS mcp_log");
  const env = mkEnv();
  await Promise.all([
    call(env, "w-token", "web_search", { q: "a" }),
    call(env, "w-token", "web_search", { q: "b" }),
    call(env, "w-token", "web_search", { q: "c" })
  ]);
  const rows = auditDb.prepare("SELECT id, tool, args, session FROM mcp_log").all();
  eq(rows.length, 3, "three rows, no PK collision");
  eq(new Set(rows.map((r) => r.id)).size, 3, "unique ids");
  const env2 = mkEnv();
  await call(env2, "w-token", "owner_act", { code: "000000", actions: [{ key: "ha:x1", kind: "done" }] });
  const row = auditDb.prepare("SELECT args FROM mcp_log WHERE tool = 'owner_act'").get();
  ok(row.args.includes("[redacted]") && !row.args.includes("000000"), "code redacted");
});

// ---- SSE transport --------------------------------------------------------
await t("SSE: endpoint event, session-scoped /mcp/messages, inline fallback without session", async () => {
  const env = mkEnv();
  const res = await worker.fetch(new Request("https://t/mcp/sse?token=w-token"), env, ctx);
  eq(res.status, 200); ok((res.headers.get("Content-Type") || "").includes("text/event-stream"), "sse type");
  const reader = res.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  ok(first.includes("event: endpoint"), "endpoint frame: " + JSON.stringify(first.slice(0, 80)));
  const sessionId = /sessionId=([0-9a-f-]{36})/.exec(first)[1];
  // POST through the session with NO token: the session carries the scope
  const pr = await worker.fetch(new Request("https://t/mcp/messages?sessionId=" + sessionId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 42, method: "ping" }) }), env, ctx);
  eq(pr.status, 202);
  const frame = new TextDecoder().decode((await reader.read()).value);
  ok(frame.includes("event: message") && frame.includes('"id":42'), "answer on the stream: " + frame.slice(0, 100));
  // token POST with no session: inline result (1.3.0 dropped it with a bare 202)
  const inline = await worker.fetch(new Request("https://t/mcp/messages", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer w-token" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }) }), env, ctx);
  eq(inline.status, 200);
  eq((await inline.json()).id, 7);
  // the audit row from the SSE ping carries the session id
  const srow = auditDb.prepare("SELECT session FROM mcp_log WHERE tool = 'web_search' LIMIT 1").get();
  ok(srow !== undefined, "audit still written");
  await reader.cancel();
});

await t("SSE session from a READ token cannot run write tools", async () => {
  const env = mkEnv();
  const res = await worker.fetch(new Request("https://t/mcp/sse?token=r-token"), env, ctx);
  const reader = res.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  const sessionId = /sessionId=([0-9a-f-]{36})/.exec(first)[1];
  const pr = await worker.fetch(new Request("https://t/mcp/messages?sessionId=" + sessionId, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "owner_code", arguments: {} } }) }), env, ctx);
  eq(pr.status, 202);
  const frame = new TextDecoder().decode((await reader.read()).value);
  ok(frame.includes("-32003"), "write refused on read-scope session: " + frame.slice(0, 120));
  await reader.cancel();
});

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
