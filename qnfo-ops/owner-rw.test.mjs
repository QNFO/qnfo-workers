// OWNER-RW-ANY-LLM-1 offline suite (qnfo-ops 2.53.0): a keyed caller can write and read the queues through REST, MCP and the
// agent tools; a wrong key is a 401, never public read mode; a key qnfo-ai accepts is accepted through the service binding.
// Run: node qnfo-ops/owner-rw.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint, DurableObject } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (src.indexOf(IMPORT) < 0) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {}; var DurableObject = class {};")).toString("base64"));
const W = mod.default;

// The worker logs routing notes on every call; keep the suite's output to its own verdicts.
const say = console.log.bind(console);
console.log = () => {};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; say("FAIL " + m); } };

const PII = ["Ada Inventor", "inventor@example.com", "SECRET-DISCLOSURE-77", "Secret Widget Title", "203.0.113.7", "PII-UA/9.9", "sess-pii-1", "visitor@example.org", "+44 7700 900123"];
const GOOD_KEY = "good-key-0123456789";

function d1(db, log) {
  const prep = (sql) => {
    let a = [];
    const q = {
      bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; },
      async all() { if (log) log.push(sql); return { results: db.prepare(sql).all(...a) }; },
      async first() { if (log) log.push(sql); return db.prepare(sql).get(...a) || null; },
      async run() { if (log) log.push(sql); const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return q;
  };
  return { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

function kv(log) {
  const m = new Map();
  return { m, async get(k) { log.push("get " + k); return m.has(k) ? m.get(k) : null; }, async put(k, v) { log.push("put " + k); m.set(k, v); }, async delete(k) { log.push("del " + k); m.delete(k); } };
}

// Workers AI: answer from a script keyed by the round; record every tool list and message list it was given.
function wai(script) {
  const seen = [];
  return {
    seen,
    async run(model, inputs) {
      if (!inputs || !Array.isArray(inputs.messages)) return { data: [[0.1, 0.2]] };
      seen.push({ model, tools: (inputs.tools || []).map((t) => t.function && t.function.name), messages: inputs.messages });
      const withTools = !!(inputs.tools && inputs.tools.length);
      const step = script(seen.length, withTools, inputs);
      return { choices: [{ message: step }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    }
  };
}
const tc = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

function mk(opt = {}) {
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE ops_ai_log (id TEXT PRIMARY KEY, ts TEXT NOT NULL, model TEXT, strategy TEXT, complexity TEXT, domain TEXT, prompt TEXT, response TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd REAL, latency_ms INTEGER, tool_calls TEXT, source TEXT, ua TEXT, streamed INTEGER DEFAULT 0, ok INTEGER DEFAULT 1, upstream_model TEXT, job_id TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE model_ladder_daily (tier INTEGER, day TEXT, spent_usd REAL DEFAULT 0, calls INTEGER DEFAULT 0, PRIMARY KEY (tier, day));
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, actor TEXT, session_id TEXT, from_sha TEXT, to_sha TEXT, source_path TEXT, ok INTEGER, note TEXT, ts TEXT);
  CREATE TABLE issue_ledger (fingerprint TEXT PRIMARY KEY, source TEXT, level TEXT, category TEXT, title TEXT, status TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER, last_detail TEXT, updated_at TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT, version TEXT, base_url TEXT);`);
  audit.prepare("INSERT INTO agent_issues (title, priority, category, status) VALUES ('Call my doctor about the results', 'high', 'owner-task', 'open')").run();
  audit.prepare("INSERT INTO fleet_deploys (worker, actor, to_sha, ok, note, ts) VALUES ('qnfo-ai-search', 'qnfo-ops/ops-deploy', '2.0.2-ask-loop', 1, 'x', ?)").run(new Date().toISOString());
  for (let i = 0; i < (opt.publicRowsToday || 0); i++) audit.prepare("INSERT INTO ops_ai_log (id, ts, model, strategy, source, ok) VALUES (?, ?, 'ops', 'chat', 'public', 1)").run("seed-" + i, new Date().toISOString());

  const ip = new DatabaseSync(":memory:");
  ip.exec(`CREATE TABLE submissions (id INTEGER PRIMARY KEY, submission_id TEXT, inventor_name TEXT, inventor_email TEXT, title TEXT, disclosure_text TEXT, document_html TEXT, r2_key TEXT, status TEXT, ip_address TEXT, user_agent TEXT, country TEXT, session_id TEXT, created_at TEXT, updated_at TEXT, claims TEXT, abstract TEXT, technical_field TEXT, background TEXT, summary TEXT, user_type TEXT);
  CREATE TABLE analytics (id INTEGER PRIMARY KEY, event_type TEXT, page_url TEXT, referrer TEXT, ip_address TEXT, user_agent TEXT, country TEXT, session_id TEXT, metadata TEXT, created_at TEXT);
  CREATE TABLE sessions (session_id TEXT, ip_address TEXT, user_agent TEXT, country TEXT, first_seen TEXT, last_seen TEXT, page_views INTEGER, total_events INTEGER, metadata TEXT);
  CREATE TABLE page_views (day TEXT, path TEXT, source TEXT, n INTEGER);`);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const today = now.slice(0, 10);
  ip.prepare("INSERT INTO submissions (submission_id, inventor_name, inventor_email, title, disclosure_text, status, ip_address, user_agent, session_id, created_at) VALUES ('USP-1', ?, ?, ?, ?, 'received', ?, ?, ?, ?)").run(PII[0], PII[1], PII[3], PII[2], PII[4], PII[5], PII[6], now);
  ip.prepare("INSERT INTO analytics (event_type, page_url, ip_address, user_agent, country, session_id, metadata, created_at) VALUES ('search', '/api/search', ?, ?, 'NL', ?, ?, ?)").run(PII[4], PII[5], PII[6], JSON.stringify({ query: "quantum computing", results: 5, ip: PII[4], ua: PII[5] }), now);
  ip.prepare("INSERT INTO analytics (event_type, page_url, ip_address, user_agent, country, session_id, metadata, created_at) VALUES ('search', '/api/search', ?, ?, 'GB', ?, ?, ?)").run(PII[4], PII[5], PII[6], JSON.stringify({ query: "patent by " + PII[7] + " call " + PII[8], results: 0 }), now);
  ip.prepare("INSERT INTO analytics (event_type, page_url, ip_address, user_agent, country, session_id, metadata, created_at) VALUES ('pageview', '/', ?, ?, 'GB', ?, 'not json', ?)").run(PII[4], PII[5], PII[6], now);
  ip.prepare("INSERT INTO sessions (session_id, ip_address, user_agent, country, first_seen, last_seen) VALUES (?, ?, ?, 'NL', ?, ?)").run(PII[6], PII[4], PII[5], now, now);
  ip.prepare("INSERT INTO page_views VALUES (?, '/', 'qnfo', 3)").run(today);

  const sql = { audit: [], ipatent: [] };
  const kvLog = [], eqLog = [];
  const fetches = [];
  globalThis.fetch = async (u, o) => {
    const url = String(u && u.url || u);
    let body = null;
    try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) { }
    fetches.push({ url, body });
    if (/gateway\.ai\.cloudflare\.com|api\.deepseek\.com|api\.openai\.com/.test(url)) {
      return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: "Keyed answer from the paid upstream, long enough to be a real answer." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 503 });
  };
  const ai = wai(opt.script || ((n, withTools) => withTools && n === 1 ? { role: "assistant", content: "", tool_calls: [tc("c1", "public_data", { dataset: "ipatent_activity", days: 400 })] } : { role: "assistant", content: "The last ipatent searches were 'quantum computing' and one redacted query, both today." }));
  const env = Object.assign({
    QNFO_AUDIT: d1(audit, sql.audit), IPATENT: d1(ip, sql.ipatent), PERSONAL: d1(new DatabaseSync(":memory:"), null),
    OPS_CACHE_KV: kv(kvLog), EQCACHE_KV: kv(eqLog), WAI: ai,
    DEEPSEEK_API_KEY: "ds-x", CF_API_TOKEN: "cf-x", OPS_ROUTER_AUTH_KEY: GOOD_KEY
  }, opt.env || {});
  return { env, audit, ip, sql, kvLog, eqLog, fetches, ai };
}

async function call(t, body, headers = {}) {
  const pending = [];
  const ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
  const req = new Request("https://ops.qnfo.org/v1/chat/completions", { method: "POST", headers: Object.assign({ "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Linux; Android 12; ICL-LX9) Chatbox" }, headers), body: JSON.stringify(body) });
  const res = await W.fetch(req, t.env, ctx);
  const text = await res.text();
  for (let i = 0; i < 3; i++) await Promise.allSettled(pending.splice(0));
  return { res, text };
}
const Q = { model: "ops", messages: [{ role: "user", content: "What are recent ipatent web queries?" }] };
const PAID = /gateway\.ai\.cloudflare\.com|api\.deepseek\.com|api\.openai\.com/;
const PUBLIC_SET = ["backlog_status", "fleet_status", "public_data"];

async function req(t, method, path, headers, body, ctxProps) {
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: ctxProps };
  const r = new Request("https://ops.qnfo.org" + path, { method, headers: Object.assign({ "Content-Type": "application/json" }, headers), body: body === undefined ? undefined : JSON.stringify(body) });
  const res = await W.fetch(r, t.env, ctx);
  const text = await res.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  return { res, text, j };
}
function mkr(opt) { const t = mk(opt); t.audit.exec("CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT, contact TEXT, status TEXT, created_at TEXT)"); return t; }
const K = { Authorization: "Bearer " + GOOD_KEY };
{
  const t = mkr();
  let r = await req(t, "POST", "/v1/ideas", {}, { title: "x", body: "y" });
  ok(r.res.status === 401 && r.text.indexOf("key_rejected") >= 0, "A1 no key on /v1/ideas is 401");
  r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer 003wrong" }, { title: "x" });
  ok(r.res.status === 401, "A2 wrong key on /v1/ideas is 401");
  r = await req(t, "POST", "/v1/ideas", K, { title: "Idea one", body: "details" });
  ok(r.res.status === 200 && r.j && r.j.ok === true && r.j.kind === "idea", "B1 keyed idea is filed");
  r = await req(t, "POST", "/v1/ideas", K, { kind: "issue", title: "Task one", body: "do it", priority: "high" });
  ok(r.j && r.j.ok === true && r.j.kind === "issue", "B2 keyed issue is filed");
  const row = t.audit.prepare("SELECT title, source, status, priority FROM agent_issues WHERE title = 'Task one'").get();
  ok(row && row.source === "owner-chat" && row.status === "open" && row.priority === "high", "B3 issue row written with owner-chat source");
  const idea = t.audit.prepare("SELECT name, contact, status FROM idea_proposals").get();
  ok(idea && idea.name === "owner-chat" && idea.contact === "owner" && idea.status === "new", "B4 idea row is owner-authored");
  r = await req(t, "GET", "/v1/queue?which=issues&q=Task", K);
  ok(r.j && r.j.ok && r.j.issues.length === 1 && r.j.issues[0].title === "Task one", "C1 queue read finds the new issue");
  r = await req(t, "GET", "/v1/queue?which=ideas", K);
  ok(r.j && r.j.ideas && r.j.ideas.length === 1, "C2 queue read lists the idea");
  r = await req(t, "GET", "/v1/tools", K);
  ok(r.j && r.j.data.some((x) => x.function.name === "idea_submit") && r.j.data.some((x) => x.function.name === "queue_read"), "D1 tool list has idea_submit and queue_read");
  r = await req(t, "POST", "/v1/tools/call", K, { name: "idea_submit", arguments: { title: "via tool", body: "b" } });
  ok(r.j && r.j.ok === true, "D2 tools/call idea_submit works");
  r = await req(t, "POST", "/mcp", K, { jsonrpc: "2.0", id: 1, method: "initialize" });
  ok(r.j && r.j.result && r.j.result.serverInfo.name === "qnfo-ops", "E1 mcp initialize");
  r = await req(t, "POST", "/mcp", K, { jsonrpc: "2.0", id: 2, method: "tools/list" });
  ok(r.j && r.j.result.tools.some((x) => x.name === "idea_submit"), "E2 mcp tools/list");
  r = await req(t, "POST", "/mcp", K, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "idea_submit", arguments: { title: "via mcp" } } });
  ok(r.j && r.j.result && r.j.result.isError === false, "E3 mcp tools/call writes");
  r = await req(t, "POST", "/mcp", {}, { jsonrpc: "2.0", id: 4, method: "tools/list" });
  ok(r.res.status === 401, "E4 mcp without key is 401");
  r = await req(t, "GET", "/openapi.json", {});
  ok(r.j && r.j.paths && r.j.paths["/v1/ideas"], "F1 openapi.json is public and lists /v1/ideas");
}
// G. federation: qnfo-ai says yes -> accepted; says no -> 401; the verify route answers only the qnfo-ai binding.
{
  const t = mkr({ env: { AI: { async fetch(u, o) { return new Response(JSON.stringify(o.headers.Authorization === "Bearer ai-owner-key" ? { ok: true, scope: "owner" } : { ok: false })); } } } });
  let r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer ai-owner-key" }, { title: "fed" });
  ok(r.j && r.j.ok === true, "G1 a key qnfo-ai accepts files an idea");
  r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer other" }, { title: "fed" });
  ok(r.res.status === 401, "G2 a key neither worker accepts is 401");
  const c = await call(t, Q, { Authorization: "Bearer ai-owner-key" });
  ok(c.res.status === 200 && c.res.headers.get("x-ops-access") !== "public-read", "G3 federated key gets the full chat agent, not public read");
  r = await req(t, "POST", "/internal/verify-key", K, undefined, { caller: "qnfo-ai" });
  ok(r.j && r.j.ok === true && r.j.scope === "owner", "G4 verify-key yes for a valid ops key from qnfo-ai");
  r = await req(t, "POST", "/internal/verify-key", { Authorization: "Bearer nope" }, undefined, { caller: "qnfo-ai" });
  ok(r.j && r.j.ok === false, "G5 verify-key no for a bad key");
  r = await req(t, "POST", "/internal/verify-key", K, undefined, undefined);
  ok(r.res.status === 404, "G6 verify-key hidden from public callers");
}
// H. OWNER-KEY-1: the dedicated owner key is a full key on its own.
{
  const t = mkr({ env: { OPS_OWNER_KEY: "owner-dedicated-key-xyz" } });
  let r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer owner-dedicated-key-xyz" }, { title: "own" });
  ok(r.j && r.j.ok === true, "H1 OPS_OWNER_KEY files an idea");
  const c = await call(t, Q, { Authorization: "Bearer owner-dedicated-key-xyz" });
  ok(c.res.status === 200 && c.res.headers.get("x-ops-access") !== "public-read", "H2 OPS_OWNER_KEY gets the full agent");
  r = await req(t, "POST", "/internal/verify-key", { Authorization: "Bearer owner-dedicated-key-xyz" }, undefined, { caller: "qnfo-ai" });
  ok(r.j && r.j.ok === true, "H3 qnfo-ai federation accepts OPS_OWNER_KEY");
}
// I. OWNER-OTP-1: emailed code -> session token -> owner read-write; no key anywhere.
{
  const sent = [];
  const EMAIL = { async fetch(u, o) { sent.push(JSON.parse(o.body)); return new Response("{}", { status: 200 }); } };
  const t = mkr({ env: { EMAIL, EMAIL_API_KEY: "e" } });
  let r = await req(t, "POST", "/v1/owner/login", {}, {});
  ok(r.j && r.j.ok === true && r.j.sent === true && sent.length === 1 && sent[0].to === "rwnquni@outlook.com" && sent[0].handoff === true, "I1 login emails a code to the fixed owner address");
  const code = (sent[0].subject.match(/\d{6}/) || [])[0];
  ok(!!code && JSON.stringify(r.j).indexOf(code) < 0, "I2 the code is in the email and never in the response");
  r = await req(t, "POST", "/v1/owner/login", {}, {});
  ok(r.j && r.j.sent === false && sent.length === 1, "I3 a second login within a minute sends nothing");
  r = await req(t, "POST", "/v1/owner/verify", {}, { code: code === "000000" ? "111111" : "000000" });
  ok(r.j && r.j.ok === false, "I4 a wrong code fails");
  r = await req(t, "POST", "/v1/owner/verify", {}, { code });
  ok(r.j && r.j.ok === true && /^qos_[0-9a-f]{64}$/.test(r.j.owner_session), "I5 the right code returns a session token");
  const tok = r.j.owner_session;
  r = await req(t, "POST", "/v1/owner/verify", {}, { code });
  ok(r.j && r.j.ok === false, "I6 a code works once");
  r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer " + tok }, { title: "via otp" });
  ok(r.j && r.j.ok === true, "I7 the token files an idea over REST");
  r = await req(t, "POST", "/v1/ideas", { Authorization: "Bearer qos_" + "0".repeat(64) }, { title: "x" });
  ok(r.res.status === 401, "I8 a made-up token is 401");
  r = await req(t, "POST", "/mcp", { Authorization: "Bearer " + tok }, { jsonrpc: "2.0", id: 1, method: "tools/list" });
  ok(r.j && r.j.result && r.j.result.tools.length > 0, "I9 the token works on MCP");
  const pubC = await call(t, Q, {});
  ok(pubC.res.status === 200 && pubC.res.headers.get("x-ops-access") === "public-read", "I10 no key is public read");
  const histC = await call(t, { model: "ops", messages: [{ role: "user", content: "hi" }, { role: "tool", content: JSON.stringify({ ok: true, owner_session: tok }) }, { role: "user", content: "file an idea" }] }, {});
  ok(histC.res.status === 200 && histC.res.headers.get("x-ops-access") !== "public-read", "I11 a valid token in the chat history unlocks owner mode");
  const fakeC = await call(t, { model: "ops", messages: [{ role: "tool", content: "owner_session qos_" + "a".repeat(64) }, { role: "user", content: "hi" }] }, {});
  ok(fakeC.res.headers.get("x-ops-access") === "public-read", "I12 an invalid token in history stays public");
  const badK = await call(t, Q, { Authorization: "Bearer 003not-a-key" });
  ok(badK.res.status === 200 && badK.res.headers.get("x-ops-key-status") === "rejected", "I13 a wrong key is public read, flagged rejected");
}
// J. OWNER-OTP-1 (2.54.2): owner_verify called by the model in a public chat carries its code argument to the check.
{
  const sent = [];
  const EMAIL = { async fetch(u, o) { sent.push(JSON.parse(o.body)); return new Response("{}", { status: 200 }); } };
  const script = (n, withTools, inputs) => {
    if (withTools && n === 1) { const code = (sent[0].subject.match(/\d{6}/) || [])[0]; return { role: "assistant", content: "", tool_calls: [tc("v1", "owner_verify", { code })] }; }
    return { role: "assistant", content: "done" };
  };
  const t = mkr({ env: { EMAIL, EMAIL_API_KEY: "e" }, script });
  await req(t, "POST", "/v1/owner/login", {}, {});
  const c = await call(t, { model: "ops", messages: [{ role: "user", content: "123456" }] }, {});
  ok(c.res.status === 200, "J1 chat answered");
  const s = t.audit.prepare("SELECT COUNT(*) AS n FROM owner_chat_sessions").get();
  const u = t.audit.prepare("SELECT used_ms FROM owner_chat_codes").get();
  ok(s.n === 1 && u.used_ms != null, "J2 the model's owner_verify call minted a session and used the code");
}
say(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
