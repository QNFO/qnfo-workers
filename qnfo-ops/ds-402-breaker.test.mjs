// DEEPSEEK-402-BREAKER-1 offline suite (qnfo-ops 2.38.41, agent_issues 1939).
// Loads the real worker.js (the cloudflare:workers import swapped for stubs) and drives keyed /v1/chat/completions turns
// against in-memory SQLite D1, a scripted Workers AI binding and a fetch stub whose AI Gateway answers HTTP 402
// "Insufficient Balance" (the DeepSeek BYOK state measured 2026-10-05). Proves: the first 402 opens the breaker, writes
// exactly one cloud_ops_events row (kind ds-402-breaker) and is answered from the free tier; no deepseek-v4-pro retry is
// sent after a 402 (flash and pro share the balance); while the breaker is open no paid fetch is made at all, on the
// non-streamed and the streamed path; after the window the paid path is probed once more; a healthy gateway (200) never
// opens the breaker.
// Run: node qnfo-ops/ds-402-breaker.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint, DurableObject } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (src.indexOf(IMPORT) < 0) throw new Error("worker.js import line changed: update the loader in this test");
// Each load is a fresh module, so the per-isolate breaker starts closed.
let loads = 0;
const load = async () => (await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {}; var DurableObject = class {};") + "\n// load " + (++loads)).toString("base64"))).default;

const say = console.log.bind(console);
console.log = () => {};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; say("FAIL " + m); } };

const GOOD_KEY = "good-key-0123456789";
const GW = /gateway\.ai\.cloudflare\.com/;

function d1(db) {
  const prep = (sql) => {
    let a = [];
    const q = {
      bind(...x) { a = x.map((v) => (v === undefined ? null : v)); return q; },
      async all() { return { results: db.prepare(sql).all(...a) }; },
      async first() { return db.prepare(sql).get(...a) || null; },
      async run() { const r = db.prepare(sql).run(...a); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
    };
    return q;
  };
  return { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}
function kv() { const m = new Map(); return { async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; }

function mk(gwStatus) {
  const audit = new DatabaseSync(":memory:");
  audit.exec(`CREATE TABLE ops_ai_log (id TEXT PRIMARY KEY, ts TEXT NOT NULL, model TEXT, strategy TEXT, complexity TEXT, domain TEXT, prompt TEXT, response TEXT, prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd REAL, latency_ms INTEGER, tool_calls TEXT, source TEXT, ua TEXT, streamed INTEGER DEFAULT 0, ok INTEGER DEFAULT 1, upstream_model TEXT, job_id TEXT);
  CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
  CREATE TABLE model_ladder_daily (tier INTEGER, day TEXT, spent_usd REAL DEFAULT 0, calls INTEGER DEFAULT 0, PRIMARY KEY (tier, day));
  CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at TEXT, updated_at TEXT);
  CREATE TABLE fleet_deploys (id INTEGER PRIMARY KEY AUTOINCREMENT, worker TEXT, actor TEXT, session_id TEXT, from_sha TEXT, to_sha TEXT, source_path TEXT, ok INTEGER, note TEXT, ts TEXT);
  CREATE TABLE issue_ledger (fingerprint TEXT PRIMARY KEY, source TEXT, level TEXT, category TEXT, title TEXT, status TEXT, first_seen TEXT, last_seen TEXT, occurrences INTEGER, last_detail TEXT, updated_at TEXT);
  CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT, version TEXT, base_url TEXT);`);
  const fetches = [];
  globalThis.fetch = async (u, o) => {
    const url = String(u && u.url || u);
    let body = null;
    try { body = o && o.body ? JSON.parse(o.body) : null; } catch (e) { }
    fetches.push({ url, body });
    if (GW.test(url)) {
      if (gwStatus === 402) return new Response(JSON.stringify({ error: { message: "Insufficient Balance (request_id: test)", type: "unknown_error" } }), { status: 402, headers: { "Content-Type": "application/json" } });
      if (body && body.stream) {
        const sse = "data: " + JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content: "Paid streamed answer, long enough to be a real answer." } }] }) + "\n\ndata: " + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10 } }) + "\n\ndata: [DONE]\n\n";
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      }
      return new Response(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: "Paid answer from the upstream, long enough to be a real answer." }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 10 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("{}", { status: 503 });
  };
  const seen = [];
  const WAI = { async run(model, inputs) {
    if (!inputs || !Array.isArray(inputs.messages)) return { data: [[0.1, 0.2]] };
    seen.push(model);
    return { choices: [{ message: { role: "assistant", content: "Free-tier answer from " + model + ", long enough to be a real answer." } }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
  } };
  const env = { QNFO_AUDIT: d1(audit), PERSONAL: d1(new DatabaseSync(":memory:")), OPS_CACHE_KV: kv(), EQCACHE_KV: kv(), WAI, DEEPSEEK_API_KEY: "ds-x", CF_API_TOKEN: "cf-x", OPS_ROUTER_AUTH_KEY: GOOD_KEY };
  return { env, audit, fetches, seen };
}

async function call(W, t, body) {
  const pending = [];
  const ctx = { waitUntil(p) { pending.push(Promise.resolve(p).catch(() => {})); }, passThroughOnException() {} };
  const req = new Request("https://ops.qnfo.org/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 Chatbox", Authorization: "Bearer " + GOOD_KEY }, body: JSON.stringify(body) });
  const res = await W.fetch(req, t.env, ctx);
  const text = await res.text();
  for (let i = 0; i < 3; i++) await Promise.allSettled(pending.splice(0));
  return { res, text };
}
const Q = (stream) => ({ model: "ops", stream: !!stream, messages: [{ role: "user", content: "Check the fleet health and summarise the open issues." }] });
const gwCalls = (t) => t.fetches.filter((f) => GW.test(f.url));
const breakerRows = (t) => t.audit.prepare("SELECT kind, status, meta FROM cloud_ops_events WHERE kind = 'ds-402-breaker'").all();

// A. first keyed turn against a 402 gateway: one paid attempt, no pro retry, free answer, one breaker row.
{
  const W = await load();
  const t = mk(402);
  const { res, text } = await call(W, t, Q(false));
  ok(res.status === 200, "A answered 200, got " + res.status + " " + text.slice(0, 200));
  ok(/Free-tier answer/.test(text), "A answer came from the free tier: " + text.slice(0, 200));
  ok(gwCalls(t).length === 1, "A exactly one paid attempt for the whole turn, saw " + gwCalls(t).length + " " + JSON.stringify(gwCalls(t).map((f) => f.body && f.body.model)));
  ok(!gwCalls(t).some((f) => f.body && /deepseek-v4-pro/.test(f.body.model)), "A no deepseek-v4-pro retry after a 402");
  const rows = breakerRows(t);
  ok(rows.length === 1 && rows[0].status === "open" && /"version":"2\.38\.41/.test(rows[0].meta), "A one ds-402-breaker row with the version: " + JSON.stringify(rows));

  // B. same isolate, breaker open: no paid fetch on the non-streamed path, still answered, no second row.
  const t2 = mk(402);
  const b = await call(W, t2, Q(false));
  ok(b.res.status === 200 && /Free-tier answer/.test(b.text), "B answered from the free tier while open");
  ok(gwCalls(t2).length === 0, "B no paid fetch while the breaker is open, saw " + gwCalls(t2).length);
  ok(breakerRows(t2).length === 0, "B no new breaker row while already open");

  // C. same isolate, breaker open: the streamed path makes no paid fetch either and streams a real answer.
  const t3 = mk(402);
  const c = await call(W, t3, Q(true));
  ok(c.res.status === 200, "C streamed turn answered 200");
  ok(gwCalls(t3).length === 0, "C no paid fetch on the streamed path while open, saw " + gwCalls(t3).length);
  ok(/Free-tier answer/.test(c.text) && c.text.indexOf("ops stream error") < 0, "C streamed answer from the free tier, no stream error: " + c.text.slice(0, 300));

  // D. after the window the paid path is probed once more (and re-opens on another 402).
  const realNow = Date.now;
  Date.now = () => realNow() + 31 * 60e3;
  try {
    const t4 = mk(402);
    const d = await call(W, t4, Q(false));
    ok(d.res.status === 200, "D answered after the window");
    ok(gwCalls(t4).length === 1, "D one paid probe after the window, saw " + gwCalls(t4).length);
    ok(breakerRows(t4).length === 1, "D breaker re-opened with one row");
  } finally { Date.now = realNow; }
}

// E. a fresh isolate whose first 402 arrives on the streamed path also opens the breaker and answers free.
{
  const W = await load();
  const t = mk(402);
  const { res, text } = await call(W, t, Q(true));
  ok(res.status === 200 && text.indexOf("ops stream error") < 0, "E streamed 402 answered without a stream error: " + text.slice(0, 300));
  ok(gwCalls(t).length === 1, "E exactly one paid attempt on the streamed path, saw " + gwCalls(t).length);
  ok(breakerRows(t).length === 1, "E streamed 402 opened the breaker");
}

// F. a healthy gateway never opens the breaker and keeps the paid path.
{
  const W = await load();
  const t = mk(200);
  const a = await call(W, t, Q(false));
  const b = await call(W, t, Q(false));
  ok(a.res.status === 200 && b.res.status === 200, "F healthy turns answered");
  ok(gwCalls(t).length >= 2, "F paid path used on both turns, saw " + gwCalls(t).length);
  ok(breakerRows(t).length === 0, "F no breaker row on a healthy gateway");
}

say(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
