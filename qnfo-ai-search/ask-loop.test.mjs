// ASK-LOOP-1 offline suite (qnfo-ai-search 2.x). No network: AI Search, the gateway (papers + graph), idea-hub and
// Workers AI are stubbed; D1 is an in-memory node:sqlite database with the production schemas the worker touches.
// Run: node qnfo-ai-search/ask-loop.test.mjs   (Node 22; node:sqlite)
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0, passed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log("FAIL " + m); } }

// ---- D1 over node:sqlite (numbered ?N params, reused)
const sq = new DatabaseSync(":memory:");
sq.exec(`
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT);
CREATE TABLE experiments (id TEXT PRIMARY KEY, name TEXT, hypothesis TEXT, kind TEXT, treatment TEXT, control TEXT, outcome_metric TEXT, baseline_date TEXT, status TEXT, owner TEXT, created_at TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT, remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT NOT NULL, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT, due TEXT, status TEXT DEFAULT 'open', source TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT, resolution TEXT);
CREATE TABLE ai_spend_ledger (day TEXT NOT NULL, provider TEXT NOT NULL, caller TEXT NOT NULL, model TEXT NOT NULL, calls INTEGER DEFAULT 0, in_tok INTEGER DEFAULT 0, out_tok INTEGER DEFAULT 0, usd REAL DEFAULT 0, downgraded INTEGER DEFAULT 0, refused INTEGER DEFAULT 0, PRIMARY KEY (day, provider, caller, model));`);
function stmt(sql0) {
  const order = [];
  const sql = sql0.replace(/\?(\d+)/g, (m, n) => { order.push(Number(n) - 1); return "?"; });
  let args = [];
  const s = {
    bind(...a) { a = a.map((v) => (v === undefined ? null : typeof v === "boolean" ? Number(v) : v)); args = order.length ? order.map((i) => a[i]) : a; return s; },
    async first() { const p = sq.prepare(sql); if (/^\s*(SELECT|WITH)|RETURNING/i.test(sql)) return p.get(...args) ?? null; p.run(...args); return null; },
    async all() { const p = sq.prepare(sql); return { results: /^\s*(SELECT|WITH)/i.test(sql) ? p.all(...args) : (p.run(...args), []) }; },
    async run() { const p = sq.prepare(sql); if (/RETURNING/i.test(sql)) return { results: p.all(...args), meta: { changes: 1 } }; const r = p.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
  };
  return s;
}
const D1 = { prepare: stmt, async batch(list) { for (const s of list) await s.run(); return []; } };

// ---- stubs
const PAPERS = [
  { slug: "jpcub-llm-energy", title: "JPCUB for LLM Energy", doi: "10.5281/zenodo.1", abstract: "Joules per correct answer as an energy benchmark for language models, normalized by accuracy. ".repeat(4), created_at: "2026-10-01 10:00:00" },
  { slug: "adelic-quantum-statistics", title: "Quantum Statistics from the Adelic Product Formula", doi: "10.5281/zenodo.2", abstract: "Squarefree origin of quantum statistics from the adelic product formula across all places. ".repeat(4), created_at: "2026-09-30 10:00:00" },
];
const graph = { "paper:jpcub-llm-energy": { node: { id: "paper:jpcub-llm-energy", name: "JPCUB for LLM Energy", label: "Paper" }, neighbors: [{ id: "concept-energy-metric", name: "Energy metric", label: "Concept", relationshipType: "INTRODUCES", direction: "outgoing" }, { id: "infra-worker-x", name: "worker x", label: "CloudflareAsset", relationshipType: "SERVES", direction: "outgoing" }] } };
async function gatewayFetch(u) {
  const url = new URL(typeof u === "string" ? u : u.url);
  const J = (o, st) => new Response(JSON.stringify(o), { status: st || 200, headers: { "content-type": "application/json" } });
  if (url.host === "papers.qnfo.org" && url.pathname === "/papers") {
    const q = (url.searchParams.get("search") || "").toLowerCase();
    const list = q ? PAPERS.filter((p) => (p.title + p.abstract).toLowerCase().includes(q)) : PAPERS;
    return J({ papers: list.slice(0, Number(url.searchParams.get("limit") || 50)), total: 449 });
  }
  if (url.host === "papers.qnfo.org" && url.pathname.startsWith("/papers/")) { const p = PAPERS.find((x) => x.slug === url.pathname.slice(8)); return p ? J(p) : J({ error: "nf" }, 404); }
  if (url.host === "graph-api.qnfo.org" && url.pathname === "/stats") return J({ totalNodes: 8349, totalEdges: 8525, relationshipTypes: ["A"] });
  if (url.host === "graph-api.qnfo.org" && url.pathname.startsWith("/neighbors/")) { const g = graph[url.pathname.slice(11)]; return g ? J(g) : J({ error: "nf" }, 404); }
  if (url.host === "graph-api.qnfo.org" && url.pathname === "/nodes") return J({ nodes: url.searchParams.get("label") === "ResearchQuestion" ? [{ id: "rq-1", name: "RQ-001: Does the adelic framework constrain new physics?", label: "ResearchQuestion", properties: { status: "open" } }, { id: "rq-ops", name: "How can the Vectorize pipeline be unblocked?", label: "ResearchQuestion", properties: {} }] : [] });
  return J({ error: "unexpected " + url }, 404);
}
const ideasFetch = async () => new Response(JSON.stringify({ sessions: [{ id: "t-1", title: "Energy per correct answer: what does JPCUB measure in LLM benchmarks?", message_count: 2, updated_at: "2026-10-01T00:00:00Z" }] }), { headers: { "content-type": "application/json" } });
const AI_SEARCH = { get() { return { async search() { return { chunks: [{ score: 0.7, text: "# JPCUB for LLM Energy\n\nJPCUB is joules per correct answer.", item: { key: "jpcub-llm-energy.md" } }, { score: 0.65, text: "audit row", item: { key: "audit-test-002.md" } }] }; } }; }, async list() { return ["qnfo-corpus"]; } };
const models = [];
const AI = {
  async run(model, input) {
    models.push(model);
    const sys = input.messages[0].content;
    if (/You check whether an answer is supported/.test(sys)) return { response: '{"supported": 3, "total": 4}' };
    if (/Write ONE question/.test(sys)) return { response: "Which energy benchmark divides joules by correct answers?" };
    const enc = new TextEncoder();
    const text = "JPCUB measures the energy a system spends per correct answer, in joules, so accuracy and energy are reported together [1]. Bad cite [7].\n\nFOLLOWUPS:\n- How is accuracy measured?\n- What hardware was used?\n- How does it compare to FLOPs?";
    return new ReadableStream({ start(c) { for (const p of text.match(/[\s\S]{1,16}/g)) c.enqueue(enc.encode("data: " + JSON.stringify({ response: p }) + "\n\n")); c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); } });
  },
};
const store = new Map();
globalThis.caches = { default: { async match(r) { const x = store.get(r.url); return x ? x.clone() : undefined; }, async put(r, res) { store.set(r.url, res.clone()); } } };
const env = { AI, AI_SEARCH, QNFO_AUDIT: D1, GATEWAY: { fetch: gatewayFetch }, IDEAS: { fetch: ideasFetch }, SPEND_CAP_TOTAL_USD: "60" };

const dir = mkdtempSync(join(tmpdir(), "askloop-"));
writeFileSync(join(dir, "w.mjs"), readFileSync(join(here, "worker.js"), "utf8"));
const { default: worker } = await import(pathToFileURL(join(dir, "w.mjs")).href);
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
async function call(path, body, ip) {
  const r = await worker.fetch(new Request("https://ask.qwav.tech" + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "CF-Connecting-IP": ip || "9.9.9.9" }, body: body ? JSON.stringify(body) : undefined }), env, ctx);
  const t = await r.text();
  await Promise.allSettled(waits.splice(0));
  return { status: r.status, text: t, json: () => JSON.parse(t) };
}
const sse = (t, ev) => t.split("\n\n").filter((b) => b.startsWith("event: " + ev)).map((b) => JSON.parse(b.split("data: ")[1]));

// 1. existing contract
const h = (await call("/health")).json();
ok(/^2\./.test(h.version) && h.capabilities.includes("ai-search-query") && h.limitations.length >= 4, "health keeps the 1.x capabilities and states limitations");
ok((await call("/")).text.includes("Ask the QNFO research corpus"), "GET / serves the ask page");
ok((await call("/?q=%3Cscript%3E")).text.includes("&lt;script&gt; | Ask QWAV"), "deep-link title is escaped");
// 2. one answer end to end
const a1 = await call("/api/ask", { query: "What does JPCUB measure?" });
const meta = sse(a1.text, "meta")[0], done = sse(a1.text, "done")[0];
ok(meta && meta.sources.length >= 1 && meta.sources.every((s) => !/audit-test/.test(s.slug)), "sources exclude corpus test files");
ok(meta.sources[0].url === "https://papers.qnfo.org/papers/jpcub-llm-energy" && !("excerpt" in meta.sources[0]), "sources link papers and do not ship raw excerpts");
ok(meta.graph.nodes.every((n) => n.label !== "CloudflareAsset") && meta.graph.nodes.some((n) => n.cite === 1), "graph drops ops labels and tags cited papers");
ok(meta.threads.length === 1, "related idea thread linked");
ok(done && /^a_/.test(done.id) && done.followups.length === 3, "done carries the answer id and three follow-ups");
const ev = sq.prepare("SELECT * FROM ask_events").get();
ok(ev.cites === 2 && ev.cites_invalid === 1 && ev.sources >= 1 && ev.usd > 0, "event records citations (1 of 2 invalid), sources and priced cost");
ok(sq.prepare("SELECT SUM(usd) u FROM ai_spend_ledger WHERE caller='qnfo-ai-search'").get().u > 0, "spend lands in ai_spend_ledger under caller qnfo-ai-search");
ok(/"cached":true/.test((await call("/api/ask", { query: "What does JPCUB measure?" })).text), "repeat question served from cache");
// 3. feedback
ok((await call("/api/feedback", { id: done.id, helpful: 1 })).status === 200, "feedback accepted");
await call("/api/feedback", { id: done.id, helpful: 0 });
ok(sq.prepare("SELECT helpful FROM ask_feedback").get().helpful === 1, "one rating per answer");
ok((await call("/api/feedback", { id: "a_nope", helpful: 1 })).status === 404 && (await call("/api/feedback", { id: done.id, helpful: 5 })).status === 400, "unknown id and bad value refused");
// 4. caps: 12 per hashed address per hour, then sources-only
let limited = null;
for (let i = 0; i < 13; i++) { const r = await call("/api/ask", { query: "question number " + i + " about adelic statistics" }, "7.7.7.7"); const e = sse(r.text, "error")[0]; if (e) limited = e.error; }
ok(limited && /12 questions this hour/.test(limited) && sse((await call("/api/ask", { query: "one more adelic question" }, "7.7.7.7")).text, "meta").length === 1, "over the per-address cap: sources-only with a clear note");
// 5. the 03:41 tick: measure, golden, judge, tune, fix, housekeeping
sq.exec("UPDATE ask_events SET judge=1, answer='x [1]', context='[1] y'");
await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 3, 3, 41) }, env, ctx);
await Promise.allSettled(waits.splice(0));
const runs = sq.prepare("SELECT kind, ok, note FROM ask_loop_runs").all();
ok(runs.length === 8 && runs.every((r) => r.ok === 1), "all eight steps of the daily tick ran: " + runs.map((r) => r.kind + ":" + r.ok).join(","));
ok(sq.prepare("SELECT COUNT(*) n FROM metric_registry WHERE owner='qnfo-ai-search'").get().n === 8, "eight ask_* metrics registered with bands");
ok(sq.prepare("SELECT last_value v FROM metric_registry WHERE metric='ask_grounded_share_7d'").get().v === "0.75", "grounding judge feeds ask_grounded_share_7d");
ok(sq.prepare("SELECT COUNT(*) n FROM ask_golden").get().n >= 1, "golden set grows from new papers");
ok(sq.prepare("SELECT status FROM experiments WHERE id LIKE 'ASK-TUNE-G-%'").get().status === "running", "a generation A/B is registered in experiments");
const cfg = JSON.parse(sq.prepare("SELECT value FROM pipeline_flags WHERE key='ask_config'").get().value);
ok(cfg.challenger && cfg.challenger.change && cfg.champion.model, "challenger armed beside the champion (" + (cfg.challenger && cfg.challenger.change) + ")");
// 6. ASK-FIX-1: kill band on two consecutive days -> one code-task issue; recovery closes it with evidence
sq.exec("UPDATE ask_events SET cites=10, cites_invalid=6");
sq.prepare("INSERT INTO ask_loop_runs (ts, version, kind, ok, note) VALUES (?, 't', 'measure', 1, ?)").run(new Date(Date.UTC(2026, 9, 4, 3, 41) - 24 * 36e5 + 6e4).toISOString(), JSON.stringify({ written: ["ask_citation_validity_7d=0.4"] }));
const realNow = Date.now;
Date.now = () => Date.UTC(2026, 9, 4, 3, 45);
await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 4, 3, 41) }, env, ctx);
await Promise.allSettled(waits.splice(0));
const iss = sq.prepare("SELECT * FROM agent_issues").all();
ok(iss.length === 1 && /code-task: repo=qnfo-workers path=qnfo-ai-search\/worker\.js/.test(iss[0].description), "kill band twice: one issue with a code-task line");
const anchor = (iss[0] && iss[0].description.match(/code-anchor: (.+)$/m) || [])[1] || "";
ok(anchor && readFileSync(join(here, "worker.js"), "utf8").split(anchor).length === 2, "its code-anchor occurs exactly once in worker.js (patch mode)");
await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 4, 3, 41) }, env, ctx);
await Promise.allSettled(waits.splice(0));
ok(sq.prepare("SELECT COUNT(*) n FROM agent_issues").get().n === 1, "no duplicate issue while one is open");
sq.exec("UPDATE ask_events SET cites=10, cites_invalid=0");
await worker.scheduled({ scheduledTime: Date.UTC(2026, 9, 5, 3, 41) }, env, ctx);
await Promise.allSettled(waits.splice(0));
const closed = sq.prepare("SELECT a.status, t.close_evidence e FROM agent_issues a JOIN issue_triage t ON t.issue_id = a.id").get();
ok(closed && closed.status === "closed" && /back inside its warning band/.test(closed.e), "recovery closes the issue with live evidence");
Date.now = realNow;
// 7. public loop report
const lp = (await call("/api/loop")).json();
ok(lp.metrics.length === 8 && lp.runs.length > 0 && lp.config.champion, "GET /api/loop reports metrics, runs and config");
ok(models.includes("@cf/deepseek-ai/deepseek-v4-flash-0731"), "the judge is a different model from the writer");

console.log(passed + " passed, " + failed + " failed");
process.exit(failed ? 1 : 0);
