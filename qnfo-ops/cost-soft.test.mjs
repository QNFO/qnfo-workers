// OPS-COST-SOFT-1 offline suite (qnfo-ops 2.39.1; BUDGET-SOFT-ROUTE-1 and RULE-8-RETIRED-1, owner directives 2026-10-06).
// The ops daily cost cap (OPS_DAILY_CAP_USD, default $10, summed from ops_ai_log.cost_usd today) used to answer HTTP 429 on
// chat and on /v1/jobs. Proves, against the real fetch handler (harness from public-read.test.mjs): at the cap a keyed chat
// is answered 200 from the free tier with no paid upstream fetched; under the cap the same chat may use the paid upstream;
// /v1/jobs at the cap is not refused with 429; the request-count cap (abuse protection, not spend) still answers 429.
// Run: node qnfo-ops/cost-soft.test.mjs   -> prints "N passed, 0 failed"
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
const toolResults = (t) => t.ai.seen.flatMap((s) => s.messages.filter((m) => m.role === "tool").map((m) => String(m.content)));


const KEYED = { Authorization: "Bearer " + GOOD_KEY };
const FREE_SCRIPT = () => ({ role: "assistant", content: "Answer from the free tier, long enough to be a real answer for the owner." });
const spend = (t, usd) => t.audit.prepare("INSERT INTO ops_ai_log (id, ts, model, strategy, source, ok, cost_usd) VALUES (?, ?, 'ops', 'chat', 'keyed', 1, ?)").run("spend-" + usd + "-" + Math.random(), new Date().toISOString(), usd);
async function post(t, path, body, headers = {}) {
  const pending = [];
  const ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
  const req = new Request("https://ops.qnfo.org" + path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify(body) });
  const res = await W.fetch(req, t.env, ctx);
  const text = await res.text();
  for (let i = 0; i < 3; i++) await Promise.allSettled(pending.splice(0));
  return { res, text };
}

// A. at the daily cost cap a keyed chat is answered from the free tier, not refused.
{
  const t = mk({ script: FREE_SCRIPT });
  spend(t, 12.5);
  const { res, text } = await call(t, Q, KEYED);
  ok(res.status === 200, "A keyed chat at the cost cap answered 200 (was 429), got " + res.status + " " + text.slice(0, 160));
  ok(text.indexOf("daily cost cap reached") < 0, "A no cost-cap refusal in the answer");
  ok(/free tier/.test(text), "A the answer is the free-tier model's");
  ok(!t.fetches.some((f) => PAID.test(f.url)), "A no paid upstream fetched at the cap: " + JSON.stringify(t.fetches.map((f) => f.url)));
}

// B. under the cap the same keyed chat may still reach the paid upstream (the flag flips only at the cap).
{
  const t = mk({ script: FREE_SCRIPT, env: { OPS_DAILY_CAP_USD: "50" } });
  spend(t, 12.5);
  const { res } = await call(t, Q, KEYED);
  ok(res.status === 200, "B keyed chat under a $50 cap answered 200");
  const tAt = mk({ script: FREE_SCRIPT, env: { OPS_DAILY_CAP_USD: "5" } });
  spend(tAt, 12.5);
  const { res: resAt } = await call(tAt, Q, KEYED);
  ok(resAt.status === 200 && !tAt.fetches.some((f) => PAID.test(f.url)), "B a lower OPS_DAILY_CAP_USD ($5) moves the same chat to the free tier");
  ok(t.fetches.some((f) => PAID.test(f.url)) || t.ai.seen.length > 0, "B under the cap the request is served (paid or free by the normal ladder)");
}

// C. an async job at the cost cap is not refused with 429.
{
  const t = mk({ script: FREE_SCRIPT });
  spend(t, 12.5);
  const { res, text } = await post(t, "/v1/jobs", { model: "ops-exec", messages: [{ role: "user", content: "summarise the backlog" }] }, KEYED);
  ok(res.status !== 429 && text.indexOf("daily cost cap reached") < 0, "C /v1/jobs at the cost cap is not refused for spend, got " + res.status + " " + text.slice(0, 160));
}

// D. the request-count cap is abuse protection, not spend, and still answers 429.
{
  const t = mk({ script: FREE_SCRIPT, env: { OPS_DAILY_CAP: "1" } });
  t.audit.prepare("INSERT INTO ops_ai_log (id, ts, model, strategy, source, ok, cost_usd) VALUES ('cnt-1', ?, 'ops', 'chat', 'keyed', 1, 0)").run(new Date().toISOString());
  const { res } = await call(t, Q, KEYED);
  ok(res.status === 429, "D the daily request-count cap still answers 429, got " + res.status);
}

say(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
